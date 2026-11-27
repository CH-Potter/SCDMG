// One online game between two players, in lockstep: both run the engine, and only the setup and
// the commands travel, each checked by a hash of the state it leads to. See docs/pvp-feasibility.md.
//
// 1. Handshake (sealed with the invite code's key). Each side sends HELLO with its protocol and
//    build, a fresh nonce and an ephemeral ECDH public key, until the other answers. Both then
//    derive a session key from the ECDH secret and both nonces, and confirm it with READY. Messages
//    recorded in any other session can't be opened in this one, the room is locked to the first
//    pair that confirms, and leaking the code afterwards reveals nothing (forward secrecy).
// 2. Lobby: free-form LOBBY messages (the UI's picks), then the host's SETUP, the guest's ACCEPT
//    and a commit-reveal seed: SETUP carries SHA-256(a₀), ACCEPT carries b₀, SEED reveals a₀, and
//    the seed is SHA-256(a₀ ‖ b₀). Neither side could choose or predict it.
// 3. Commands, per command n, by the seat whose turn it is (A; the other is B):
//      A → B  CMD    { n, cmd, c = SHA-256(aₙ) }   the command and a hidden secret, fixed together
//      B → A  SALT   { n, b }                       B checked it's legal; B's randomness
//      A → B  REVEAL { n, a, hash }                 A applied it with salt H(aₙ ‖ bₙ ‖ n)
//      B → A  ACK    { n, hash }                    B applied it; hashes are compared both ways
//    A shoot or fight that could be re-rolled (house rule) stays open until A settles it: FINAL to
//    keep it, or a second commit-reveal for the re-roll (REROLL with a new commitment, B's RSALT,
//    A's RREVEAL), whose salt the engine stirs in just before the misses are re-rolled. So A can't
//    know the re-rolled dice when deciding to pay for them. Nobody moves on until it is settled.
// Every step is re-sent until it is answered (public brokers may drop a message), and answering is
// idempotent.

import { aiCommand } from "../engine/ai";
import { setupFingerprint, syncHash, withSalt } from "../engine/fingerprint";
import { applyCommand, createGame, type GameSetup } from "../engine/game";
import { commandProblem } from "../engine/legality";
import { rerollMisses, rerollProblem } from "../engine/reroll";
import type { Command, GameEvent, GameState, PlayerId } from "../engine/types";
import { SecureChannel, deriveRoom, type Room } from "./crypto";
import { Listeners, type LinkStatus, type Transport } from "./transport";

export { rerollMisses, rerollProblem };

/** Bump when the wire messages change: both players must speak the same version. */
export const PROTOCOL = 1;

export type Role = "host" | "guest";
export const seatOf = (role: Role): PlayerId => (role === "host" ? 0 : 1);

/** Whose command comes next: the seat choosing turn order if there is a choice to make, else the active player. */
export const seatToAct = (s: GameState): PlayerId => s.orderChoice?.player ?? s.activePlayer;

// ---------------------------------------------------------------- wire messages

type Hello = { k: "hello"; v: number; build: string; role: Role; nonce: string; epk: string };
type Msg =
  /** The handshake's confirmation. `paired`: the sender has already paired (so don't answer it). */
  | { k: "ready"; paired?: boolean }
  | { k: "ping" }
  | { k: "lobby"; data: unknown }
  | { k: "setup"; setup: GameSetup; c: string }
  | { k: "accept"; fp: string; b: string }
  | { k: "seed"; a: string }
  | { k: "cmd"; n: number; cmd: Command; c: string }
  | { k: "salt"; n: number; b: string }
  | { k: "reveal"; n: number; a: string; hash: string; open: boolean }
  | { k: "final"; n: number; hash: string }
  | { k: "reroll"; n: number; cmd: Command; c: string }
  | { k: "rsalt"; n: number; b: string }
  | { k: "rreveal"; n: number; a: string; hash: string }
  | { k: "ack"; n: number; hash: string; final: boolean }
  | { k: "resign" };

// ---------------------------------------------------------------- small crypto helpers

const enc = new TextEncoder();
const toHex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(h.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
};
const isHex = (v: unknown, bytes: number): v is string => typeof v === "string" && v.length === bytes * 2 && /^[0-9a-f]+$/.test(v);
export const randomHex = (bytes = 16): string => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
export async function sha256Hex(...parts: string[]): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(parts.join("|")))));
}
/** The 32-bit value both players stir into the dice for a command (or the game seed). */
export async function saltOf(a: string, b: string, n: number): Promise<number> {
  return parseInt((await sha256Hex(a, b, String(n))).slice(0, 8), 16) >>> 0;
}

// ---------------------------------------------------------------- the session

export type PeerStatus = "waiting" | "connected" | "silent";

export interface SessionOptions {
  transport: Transport;
  code: string;
  role: Role;
  /** This build (version + commit): both players must match. */
  build: string;
  /** Re-send an unanswered step after this long (ms). */
  resendMs?: number;
  /** Ping the opponent this often (ms). */
  pingMs?: number;
  /** Call the opponent silent after this long without a message (ms). */
  silentMs?: number;
  /** A handshake that isn't confirmed within this long is dropped and the room reopens (ms). */
  pairTimeoutMs?: number;
}

/** A command that went through, from either side. */
export interface Applied {
  n: number;
  seat: PlayerId;
  cmd: Command;
  before: GameState;
  state: GameState;
  events: GameEvent[];
  /** A re-roll replaced command n (the same n, applied to the same `before`). */
  revised: boolean;
  /** Still waiting for its player's FINAL (re-roll or not). */
  open: boolean;
}

export type EndReason = { why: "resigned"; seat: PlayerId } | { why: "closed" };

interface LogEntry {
  n: number;
  seat: PlayerId;
  cmd: Command;
  a: string;
  b: string;
  before: GameState;
  state: GameState;
  hash: string;
  open: boolean;
  /** Our re-roll secret, if we re-rolled this attack (to answer a repeated RSALT). */
  ra?: string;
}

/** A command step in flight. */
type Pending =
  | { role: "A"; n: number; cmd: Command; a: string; c: string; resolve: (r: Applied) => void; reject: (e: Error) => void }
  | { role: "B"; n: number; cmd: Command; c: string; b: string }
  | { role: "A2"; n: number; cmd: Command; a: string; c: string; resolve: (r: Applied) => void; reject: (e: Error) => void }
  | { role: "B2"; n: number; cmd: Command; c: string; b: string };

/** A hello we answered, waiting for the other side to prove it holds the session key. */
interface Candidate {
  channel: SecureChannel;
  build: string;
  timer: ReturnType<typeof setTimeout>;
}

/** Messages only sent once the game has started. */
const GAME_MESSAGES = new Set<Msg["k"]>(["cmd", "salt", "reveal", "ack", "final", "reroll", "rsalt", "rreveal"]);

/** At most this many unconfirmed hellos at once; more are ignored until one expires. */
const MAX_CANDIDATES = 8;
/** Hellos stamped further than this from our clock are ignored (old recordings replayed). */
const HELLO_WINDOW_MS = 30 * 60 * 1000;

export class PvpSession {
  readonly role: Role;
  readonly seat: PlayerId;
  // events
  readonly paired = new Listeners<{ peerBuild: string }>();
  readonly peer = new Listeners<PeerStatus>();
  readonly link = new Listeners<LinkStatus>();
  readonly lobby = new Listeners<unknown>();
  readonly setupOffered = new Listeners<GameSetup>();
  readonly started = new Listeners<{ setup: GameSetup; state: GameState }>();
  readonly applied = new Listeners<Applied>();
  readonly desync = new Listeners<{ n: number; mine: string; theirs: string }>();
  readonly problem = new Listeners<string>();
  readonly ended = new Listeners<EndReason>();

  state: GameState | null = null;
  peerStatus: PeerStatus = "waiting";
  isPaired = false;

  private readonly opts: Required<Omit<SessionOptions, "transport" | "code" | "role" | "build">>;
  private readonly transport: Transport;
  private readonly code: string;
  private readonly build: string;
  private room: Room | null = null;
  private codeChannel: SecureChannel | null = null;
  private sessionChannel: SecureChannel | null = null;
  // handshake
  private nonce = randomHex(16);
  private keys: CryptoKeyPair | null = null;
  private epk = "";
  private readonly candidates = new Map<string, Candidate>();
  /** The opponent's hello nonce, once paired (to answer their repeats if our confirmation got lost). */
  private pairedNonce: string | null = null;
  // lobby and seed
  private setup: GameSetup | null = null;
  private seedA: string | null = null;
  private seedB: string | null = null;
  // play
  private readonly log: LogEntry[] = [];
  private pending: Pending | null = null;
  private peerAck = new Map<number, string>();
  private resendTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;
  private outbox: Msg | Hello | null = null;
  private closed = false;
  private inbox: Promise<void> = Promise.resolve();
  private unsubs: (() => void)[] = [];

  constructor(o: SessionOptions) {
    this.role = o.role;
    this.seat = seatOf(o.role);
    this.transport = o.transport;
    this.code = o.code;
    this.build = o.build;
    this.opts = {
      resendMs: o.resendMs ?? 1500,
      pingMs: o.pingMs ?? 5000,
      silentMs: o.silentMs ?? 30000,
      pairTimeoutMs: o.pairTimeoutMs ?? 10000,
    };
  }

  /** The number of commands applied so far (the next command's n). */
  get turn(): number {
    return this.log.length;
  }

  /** The latest command, if it is still waiting for its player's re-roll decision. */
  get openCommand(): LogEntry | null {
    const last = this.log[this.log.length - 1];
    return last?.open ? last : null;
  }

  /**
   * Whether this player can settle their open attack now (re-roll or keep): the opponent has
   * acknowledged the attack itself, so settling can't overwrite a message they never got.
   */
  get canSettle(): boolean {
    const e = this.openCommand;
    return !!e && e.seat === this.seat && !this.pending && this.peerAck.has(e.n) && !this.closed;
  }

  /** Whether it is this player's move now (game started, not over, nothing in flight). */
  get myMove(): boolean {
    const s = this.state;
    if (!s || s.over || this.pending || this.closed) return false;
    if (this.openCommand) return false;
    const last = this.log[this.log.length - 1];
    if (last && last.seat === this.seat && !this.peerAck.get(last.n)?.endsWith(":true")) return false; // not confirmed yet
    if (this.role === "host" && !this.peerAck.has(-1)) return false; // the guest hasn't confirmed the start
    return seatToAct(s) === this.seat;
  }

  /** Join the room and say hello. Resolves once joined (pairing follows; see `paired`). */
  async start(): Promise<void> {
    this.room = await deriveRoom(this.code);
    this.codeChannel = new SecureChannel(this.room);
    this.keys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"])) as CryptoKeyPair;
    this.epk = toHex(new Uint8Array(await crypto.subtle.exportKey("raw", this.keys.publicKey)));
    this.unsubs.push(
      this.transport.onMessage((bytes) => {
        this.inbox = this.inbox.then(() => this.receive(bytes)).catch((err) => console.warn("PvP message failed:", err));
      }),
      this.transport.onStatus((s) => this.link.emit(s)),
    );
    await this.transport.join(this.room.id);
    this.outbox = this.hello();
    this.resendTimer = setInterval(() => void this.resend(), this.opts.resendMs);
    this.pingTimer = setInterval(() => this.heartbeat(), this.opts.pingMs);
    await this.sendRaw(this.outbox);
  }

  // ---------------------------------------------------------------- lobby

  /** Send the UI's lobby data (faction picks, list, ready flags...). */
  sendLobby(data: unknown): void {
    void this.send({ k: "lobby", data });
  }

  /** Host: propose the game (without a seed). The game starts once the guest accepts. */
  async proposeSetup(setup: GameSetup): Promise<void> {
    if (this.role !== "host") throw new Error("Only the host proposes the setup");
    if (this.state) throw new Error("The game has already started");
    const { seed: _drop, ...rest } = setup;
    this.setup = rest;
    this.seedA = randomHex(16);
    const msg: Msg = { k: "setup", setup: rest, c: await sha256Hex(this.seedA) };
    this.outbox = msg;
    await this.send(msg);
  }

  /** Guest: accept the host's proposed setup (as offered through `setupOffered`). */
  async acceptSetup(): Promise<void> {
    if (this.role !== "guest" || !this.setup) throw new Error("No setup to accept");
    this.seedB = randomHex(16);
    const msg: Msg = { k: "accept", fp: setupFingerprint(this.setup), b: this.seedB };
    this.outbox = msg;
    await this.send(msg);
  }

  // ---------------------------------------------------------------- play

  /** Play a command for this player's seat. Resolves once both sides have applied it. */
  submit(cmd: Command): Promise<Applied> {
    return new Promise((resolve, reject) => {
      const s = this.state;
      if (!s) return reject(new Error("The game hasn't started"));
      if (!this.myMove) return reject(new Error(this.openCommand ? "Finish the re-roll choice first" : "Not your move"));
      const problem = commandProblem(s, cmd);
      if (problem) return reject(new Error(problem));
      const a = randomHex(16);
      void sha256Hex(a).then((c) => {
        const n = this.turn;
        this.pending = { role: "A", n, cmd, a, c, resolve, reject };
        const msg: Msg = { k: "cmd", n, cmd, c };
        this.outbox = msg;
        void this.send(msg);
      });
    });
  }

  /**
   * Settle this player's open attack: keep it, or re-roll its misses (`reroll` is the re-roll
   * command, with `reroll: true` and any card payment). A re-roll takes a fresh commit-reveal, so
   * its dice aren't known until it is paid for. Resolves once applied here.
   */
  async finalize(reroll?: Command): Promise<Applied> {
    const e = this.openCommand;
    if (!e || e.seat !== this.seat || this.pending) throw new Error("Nothing to settle");
    if (!this.canSettle) throw new Error("Waiting for your opponent to see the attack");
    if (!reroll) {
      this.log[e.n] = { ...e, open: false };
      const msg: Msg = { k: "final", n: e.n, hash: e.hash };
      this.outbox = msg;
      void this.send(msg);
      const out: Applied = { n: e.n, seat: e.seat, cmd: e.cmd, before: e.before, state: e.state, events: [], revised: false, open: false };
      this.applied.emit(out);
      return out;
    }
    if (!sameAttack(e.cmd, reroll) || "rerollSalt" in reroll) throw new Error("A re-roll must repeat the same attack");
    const problem = rerollProblem(e.before, reroll);
    if (problem) throw new Error(problem);
    const a = randomHex(16);
    const c = await sha256Hex(a);
    return new Promise((resolve, reject) => {
      this.pending = { role: "A2", n: e.n, cmd: reroll, a, c, resolve, reject };
      const msg: Msg = { k: "reroll", n: e.n, cmd: reroll, c };
      this.outbox = msg;
      void this.send(msg);
    });
  }

  /** Concede the game. */
  resign(): void {
    void this.send({ k: "resign" });
    this.ended.emit({ why: "resigned", seat: this.seat });
  }

  /** Leave: stop all timers and close the transport. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.resendTimer) clearInterval(this.resendTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.dropCandidates();
    for (const u of this.unsubs) u();
    this.transport.close();
    if (this.pending?.role === "A" || this.pending?.role === "A2") this.pending.reject(new Error("The session closed"));
    this.pending = null;
    this.ended.emit({ why: "closed" });
  }

  // ---------------------------------------------------------------- internals: sending

  private hello(): Hello {
    return { k: "hello", v: PROTOCOL, build: this.build, role: this.role, nonce: this.nonce, epk: this.epk };
  }

  private async sendRaw(msg: Msg | Hello): Promise<void> {
    if (this.closed) return;
    const ch = msg.k === "hello" ? this.codeChannel : this.sessionChannel;
    if (!ch) return;
    this.transport.send(await ch.seal(msg));
  }

  private send(msg: Msg): Promise<void> {
    return this.sendRaw(msg);
  }

  /** Re-send whatever is waiting for an answer (and keep saying hello until paired). */
  private async resend(): Promise<void> {
    if (this.closed) return;
    if (!this.isPaired) {
      await this.sendRaw(this.hello());
      for (const c of this.candidates.values()) this.transport.send(await c.channel.seal({ k: "ready" }));
      return;
    }
    if (this.outbox) await this.sendRaw(this.outbox);
  }

  private heartbeat(): void {
    if (!this.isPaired || this.closed) return;
    void this.send({ k: "ping" });
    if (this.peerStatus === "connected" && Date.now() - this.lastHeard > this.opts.silentMs) this.setPeer("silent");
  }

  private setPeer(s: PeerStatus): void {
    if (s === this.peerStatus) return;
    this.peerStatus = s;
    this.peer.emit(s);
  }

  // ---------------------------------------------------------------- internals: receiving

  private async receive(bytes: Uint8Array): Promise<void> {
    if (this.closed) return;
    if (this.sessionChannel) {
      const r = await this.sessionChannel.open<Msg>(bytes);
      if (r.ok) return this.onSession(r.msg.body);
      if (r.drop !== "failed authentication") return;
    } else {
      // Not paired yet: the first candidate to prove the session key wins.
      for (const [nonce, c] of this.candidates) {
        const r = await c.channel.open<Msg>(bytes);
        if (!r.ok) continue;
        if (r.msg.body?.k === "ready") this.confirm(nonce, c);
        return;
      }
    }
    const h = await this.codeChannel?.open<Hello>(bytes);
    if (h?.ok) await this.onHello(h.msg.body, h.msg.t);
  }

  private async onHello(m: Hello, sentAt: number): Promise<void> {
    if (m?.k !== "hello") return;
    if (this.isPaired) {
      // Our opponent is still saying hello: our confirmation was lost. Say it again.
      if (m.nonce === this.pairedNonce) {
        await this.sendRaw(this.hello());
        await this.send({ k: "ready", paired: true });
      }
      return;
    }
    if (!isHex(m.nonce, 16) || !isHex(m.epk, 65) || (m.role !== "host" && m.role !== "guest")) return;
    if (m.role === this.role) return; // another tab with the same role, or our own echo
    if (!(Math.abs(Date.now() - sentAt) <= HELLO_WINDOW_MS)) return; // a stale recording
    if (m.v !== PROTOCOL || m.build !== this.build) {
      this.problem.emit(`Your opponent is on a different version (${String(m.build)}). Both of you need the same release to play.`);
      return;
    }
    const known = this.candidates.get(m.nonce);
    if (known) {
      this.transport.send(await known.channel.seal({ k: "ready" })); // a repeat: answer again
      return;
    }
    if (this.candidates.size >= MAX_CANDIDATES) return;
    let channel: SecureChannel;
    try {
      const peerKey = await crypto.subtle.importKey("raw", fromHex(m.epk), { name: "ECDH", namedCurve: "P-256" }, false, []);
      const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: peerKey }, this.keys!.privateKey, 256);
      const [hostNonce, guestNonce] = this.role === "host" ? [this.nonce, m.nonce] : [m.nonce, this.nonce];
      const base = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: fromHex(await sha256Hex(this.room!.id, hostNonce, guestNonce)), info: enc.encode("scdmg session v1") },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
      channel = new SecureChannel({ id: `${this.room!.id}/${hostNonce}/${guestNonce}`, key });
    } catch {
      return; // not a usable public key
    }
    if (this.isPaired || this.candidates.has(m.nonce) || this.candidates.size >= MAX_CANDIDATES) return;
    // Confirm within the time limit, or forget this hello.
    const timer = setTimeout(() => this.candidates.delete(m.nonce), this.opts.pairTimeoutMs);
    this.candidates.set(m.nonce, { channel, build: m.build, timer });
    await this.sendRaw(this.hello()); // make sure they have ours
    this.transport.send(await channel.seal({ k: "ready" }));
  }

  /** The other side proved it holds this candidate's session key: it's our opponent. */
  private confirm(nonce: string, c: Candidate): void {
    if (this.isPaired || !this.candidates.has(nonce)) return;
    this.sessionChannel = c.channel;
    this.pairedNonce = nonce;
    this.dropCandidates();
    this.isPaired = true;
    this.lastHeard = Date.now();
    this.outbox = null;
    void this.send({ k: "ready", paired: true });
    this.setPeer("connected");
    this.paired.emit({ peerBuild: c.build });
  }

  private dropCandidates(): void {
    for (const c of this.candidates.values()) clearTimeout(c.timer);
    this.candidates.clear();
  }

  private async onSession(m: Msg): Promise<void> {
    if (!m || typeof m !== "object") return;
    this.lastHeard = Date.now();
    this.setPeer("connected");
    if (this.role === "host" && this.state && !this.peerAck.has(-1) && GAME_MESSAGES.has(m.k) && !(m.k === "ack" && m.n === -1)) {
      // The guest is playing, so it has the game: its start confirmation must have been lost.
      this.peerAck.set(-1, "implied:true");
      if (this.outbox?.k === "seed") this.outbox = null;
    }
    switch (m.k) {
      case "ready":
        // They haven't seen our confirmation yet: send it again (a confirmed ready isn't answered).
        if (!m.paired) void this.send({ k: "ready", paired: true });
        return;
      case "ping":
        return;
      case "lobby":
        return this.lobby.emit(m.data);
      case "resign":
        return this.ended.emit({ why: "resigned", seat: (1 - this.seat) as PlayerId });
      case "setup":
        return this.onSetup(m);
      case "accept":
        return this.onAccept(m);
      case "seed":
        return this.onSeed(m);
      case "cmd":
        return this.onCmd(m);
      case "salt":
        return this.onSalt(m);
      case "reveal":
        return this.onReveal(m);
      case "final":
        return this.onFinal(m);
      case "reroll":
        return this.onReroll(m);
      case "rsalt":
        return this.onRsalt(m);
      case "rreveal":
        return this.onRreveal(m);
      case "ack":
        return this.onAck(m);
    }
  }

  private onSetup(m: Extract<Msg, { k: "setup" }>): void {
    if (this.role !== "guest" || this.state || !isHex(m.c, 32)) return;
    if (this.setup && this.seedCommit === m.c) {
      if (this.seedB) void this.send({ k: "accept", fp: setupFingerprint(this.setup), b: this.seedB }); // a repeat
      return;
    }
    if (this.seedB) {
      // We already accepted (and sent our half of the seed): a new setup now could be fishing for a better seed.
      this.problem.emit("Your opponent changed the game after you accepted it.");
      return;
    }
    this.setup = m.setup;
    this.seedCommit = m.c;
    this.seedB = null;
    this.setupOffered.emit(m.setup);
  }

  private seedCommit = "";
  private startHash = "";

  private async onAccept(m: Extract<Msg, { k: "accept" }>): Promise<void> {
    if (this.role !== "host" || !this.setup || !this.seedA || !isHex(m.b, 16)) return;
    if (this.state) {
      void this.send({ k: "seed", a: this.seedA }); // a repeat
      return;
    }
    if (m.fp !== setupFingerprint(this.setup)) return this.problem.emit("Your opponent accepted a different setup.");
    this.seedB = m.b;
    const msg: Msg = { k: "seed", a: this.seedA };
    this.outbox = msg;
    await this.begin();
    await this.send(msg);
  }

  private async onSeed(m: Extract<Msg, { k: "seed" }>): Promise<void> {
    if (this.role === "guest" && this.state && this.startHash) {
      void this.send({ k: "ack", n: -1, hash: this.startHash, final: true }); // a repeat: they missed our confirmation
      return;
    }
    if (this.role !== "guest" || this.state || !this.setup || !this.seedB || !isHex(m.a, 16)) return;
    if ((await sha256Hex(m.a)) !== this.seedCommit) return this.problem.emit("The opponent's seed didn't match its promise.");
    this.seedA = m.a;
    this.outbox = null;
    await this.begin();
    void this.send({ k: "ack", n: -1, hash: this.startHash, final: true });
  }

  private async begin(): Promise<void> {
    const seed = await saltOf(this.seedA!, this.seedB!, -1);
    const setup = { ...this.setup!, seed };
    this.state = createGame(setup);
    this.startHash = syncHash(this.state);
    this.started.emit({ setup, state: this.state });
  }

  /** B: the opponent's command. Check it, then send our salt. */
  private onCmd(m: Extract<Msg, { k: "cmd" }>): void {
    const s = this.state;
    if (!s || !isHex(m.c, 32)) return;
    const theirs = (1 - this.seat) as PlayerId;
    if (this.pending?.role === "B" && this.pending.n === m.n) {
      void this.send({ k: "salt", n: m.n, b: this.pending.b }); // a repeat
      return;
    }
    if (m.n < this.turn) {
      // Already applied: they missed our ACK.
      const e = this.log[m.n];
      if (e) void this.send({ k: "ack", n: m.n, hash: e.hash, final: !e.open });
      return;
    }
    if (m.n !== this.turn || this.pending || this.openCommand || seatToAct(s) !== theirs) return;
    const problem = commandProblem(s, m.cmd);
    if (problem) return this.problem.emit(`Your opponent sent a move the rules don't allow (${problem}).`);
    const b = randomHex(16);
    this.pending = { role: "B", n: m.n, cmd: m.cmd, c: m.c, b };
    const msg: Msg = { k: "salt", n: m.n, b };
    this.outbox = msg;
    void this.send(msg);
  }

  /** A: their salt arrived; apply our command and reveal. */
  private async onSalt(m: Extract<Msg, { k: "salt" }>): Promise<void> {
    const p = this.pending;
    if (!isHex(m.b, 16)) return;
    if (!p || p.role !== "A" || p.n !== m.n) {
      // Already revealed: resend the reveal.
      const e = this.log[m.n];
      if (e && e.seat === this.seat) void this.send({ k: "reveal", n: e.n, a: e.a, hash: e.hash, open: e.open });
      return;
    }
    const before = this.state!;
    const r = await this.applyWith(before, p.cmd, p.a, m.b, p.n);
    if (!r.ok) {
      this.pending = null;
      p.reject(new Error(r.error));
      return;
    }
    const open = rerollMisses(before, p.cmd, r.events) > 0;
    const hash = syncHash(r.state);
    this.log.push({ n: p.n, seat: this.seat, cmd: p.cmd, a: p.a, b: m.b, before, state: r.state, hash, open });
    this.state = r.state;
    this.pending = null;
    const msg: Msg = { k: "reveal", n: p.n, a: p.a, hash, open };
    this.outbox = msg;
    void this.send(msg);
    const out: Applied = { n: p.n, seat: this.seat, cmd: p.cmd, before, state: r.state, events: r.events, revised: false, open };
    this.applied.emit(out);
    p.resolve(out);
  }

  /** B: their secret; check it against the commitment, apply, compare hashes and acknowledge. */
  private async onReveal(m: Extract<Msg, { k: "reveal" }>): Promise<void> {
    const p = this.pending;
    if (!isHex(m.a, 16)) return;
    if (!p || p.role !== "B" || p.n !== m.n) {
      const e = this.log[m.n];
      if (e) void this.send({ k: "ack", n: e.n, hash: e.hash, final: !e.open });
      return;
    }
    if ((await sha256Hex(m.a)) !== p.c) return this.problem.emit("The opponent's dice secret didn't match its promise.");
    const before = this.state!;
    const r = await this.applyWith(before, p.cmd, m.a, p.b, p.n);
    if (!r.ok) return this.problem.emit(`Your opponent's move failed here (${r.error}).`);
    const open = rerollMisses(before, p.cmd, r.events) > 0;
    const hash = syncHash(r.state);
    this.log.push({ n: p.n, seat: (1 - this.seat) as PlayerId, cmd: p.cmd, a: m.a, b: p.b, before, state: r.state, hash, open });
    this.state = r.state;
    this.pending = null;
    this.outbox = null;
    if (hash !== m.hash) this.desync.emit({ n: p.n, mine: hash, theirs: m.hash });
    void this.send({ k: "ack", n: p.n, hash, final: !open });
    this.applied.emit({ n: p.n, seat: (1 - this.seat) as PlayerId, cmd: p.cmd, before, state: r.state, events: r.events, revised: false, open });
  }

  /** B: the opponent kept their open attack as it was. */
  private onFinal(m: Extract<Msg, { k: "final" }>): void {
    const e = this.log[m.n];
    if (!e || e.seat === this.seat) return;
    if (!e.open) {
      void this.send({ k: "ack", n: e.n, hash: e.hash, final: true }); // a repeat
      return;
    }
    if (m.n !== this.log.length - 1 || this.pending) return;
    this.log[e.n] = { ...e, open: false };
    if (e.hash !== m.hash) this.desync.emit({ n: e.n, mine: e.hash, theirs: m.hash });
    void this.send({ k: "ack", n: e.n, hash: e.hash, final: true });
    this.applied.emit({ n: e.n, seat: e.seat, cmd: e.cmd, before: e.before, state: e.state, events: [], revised: false, open: false });
  }

  /** B: the opponent wants to re-roll their open attack. Check it, then send a fresh salt. */
  private onReroll(m: Extract<Msg, { k: "reroll" }>): void {
    const e = this.log[m.n];
    if (!e || e.seat === this.seat || !isHex(m.c, 32)) return;
    if (this.pending?.role === "B2" && this.pending.n === m.n) {
      void this.send({ k: "rsalt", n: m.n, b: this.pending.b }); // a repeat
      return;
    }
    if (!e.open) {
      void this.send({ k: "ack", n: e.n, hash: e.hash, final: true }); // already settled
      return;
    }
    if (m.n !== this.log.length - 1 || this.pending) return;
    if (!sameAttack(e.cmd, m.cmd) || "rerollSalt" in m.cmd) return this.problem.emit("Your opponent's re-roll didn't match their attack.");
    const problem = rerollProblem(e.before, m.cmd);
    if (problem) return this.problem.emit(`Your opponent's re-roll isn't allowed (${problem}).`);
    const b = randomHex(16);
    this.pending = { role: "B2", n: m.n, cmd: m.cmd, c: m.c, b };
    const msg: Msg = { k: "rsalt", n: m.n, b };
    this.outbox = msg;
    void this.send(msg);
  }

  /** A: the opponent's re-roll salt; apply the re-roll and reveal. */
  private async onRsalt(m: Extract<Msg, { k: "rsalt" }>): Promise<void> {
    const p = this.pending;
    if (!isHex(m.b, 16)) return;
    if (!p || p.role !== "A2" || p.n !== m.n) {
      const e = this.log[m.n];
      if (e && e.seat === this.seat && !e.open && e.ra) void this.send({ k: "rreveal", n: e.n, a: e.ra, hash: e.hash });
      return;
    }
    const e = this.log[p.n]!;
    const cmd = { ...p.cmd, rerollSalt: await saltOf(p.a, m.b, p.n) } as Command;
    const r = await this.applyWith(e.before, cmd, e.a, e.b, e.n);
    if (!r.ok) {
      this.pending = null;
      p.reject(new Error(r.error));
      return;
    }
    const hash = syncHash(r.state);
    this.log[e.n] = { ...e, cmd, state: r.state, hash, open: false, ra: p.a };
    this.state = r.state;
    this.pending = null;
    const msg: Msg = { k: "rreveal", n: e.n, a: p.a, hash };
    this.outbox = msg;
    void this.send(msg);
    const out: Applied = { n: e.n, seat: e.seat, cmd, before: e.before, state: r.state, events: r.events, revised: true, open: false };
    this.applied.emit(out);
    p.resolve(out);
  }

  /** B: the re-roll's secret; check it, apply the re-roll, compare hashes and acknowledge. */
  private async onRreveal(m: Extract<Msg, { k: "rreveal" }>): Promise<void> {
    const p = this.pending;
    if (!isHex(m.a, 16)) return;
    if (!p || p.role !== "B2" || p.n !== m.n) {
      const e = this.log[m.n];
      if (e && !e.open) void this.send({ k: "ack", n: e.n, hash: e.hash, final: true });
      return;
    }
    if ((await sha256Hex(m.a)) !== p.c) return this.problem.emit("The opponent's re-roll secret didn't match its promise.");
    const e = this.log[p.n]!;
    const cmd = { ...p.cmd, rerollSalt: await saltOf(m.a, p.b, p.n) } as Command;
    const r = await this.applyWith(e.before, cmd, e.a, e.b, e.n);
    if (!r.ok) return this.problem.emit(`Your opponent's re-roll failed here (${r.error}).`);
    const hash = syncHash(r.state);
    this.log[e.n] = { ...e, cmd, state: r.state, hash, open: false };
    this.state = r.state;
    this.pending = null;
    this.outbox = null;
    if (hash !== m.hash) this.desync.emit({ n: e.n, mine: hash, theirs: m.hash });
    void this.send({ k: "ack", n: e.n, hash, final: true });
    this.applied.emit({ n: e.n, seat: e.seat, cmd, before: e.before, state: r.state, events: r.events, revised: true, open: false });
  }

  /** A: the opponent applied our command (or our FINAL); compare hashes and stop re-sending. */
  private onAck(m: Extract<Msg, { k: "ack" }>): void {
    if (m.n === -1) {
      // The guest started the game: its starting state must match ours.
      if (this.role !== "host" || !this.state || this.peerAck.has(-1) || typeof m.hash !== "string") return;
      this.peerAck.set(-1, `${m.hash}:true`);
      if (m.hash !== this.startHash) this.desync.emit({ n: -1, mine: this.startHash, theirs: m.hash });
      if (this.outbox?.k === "seed") this.outbox = null;
      return;
    }
    const e = this.log[m.n];
    if (!e || typeof m.hash !== "string") return;
    const settled = m.final === !e.open;
    if (!settled) return; // an ACK for an earlier stage of this command
    if (this.peerAck.get(m.n) === `${m.hash}:${m.final}`) return;
    this.peerAck.set(m.n, `${m.hash}:${m.final}`);
    if (m.hash !== e.hash) this.desync.emit({ n: m.n, mine: e.hash, theirs: m.hash });
    if (this.outbox && "n" in this.outbox && this.outbox.n === m.n) this.outbox = null;
  }

  private async applyWith(before: GameState, cmd: Command, a: string, b: string, n: number) {
    const salted = withSalt({ ...before }, await saltOf(a, b, n));
    return applyCommand(salted, structuredClone(cmd));
  }
}

/** A re-roll repeats the same attack, with `reroll: true` (and maybe a payment). */
function sameAttack(orig: Command, again: Command): boolean {
  if ((orig.type !== "shoot" && orig.type !== "fight") || again.type !== orig.type || !again.reroll) return false;
  return again.uid === orig.uid && again.target === orig.target && again.weapon === orig.weapon;
}

/** The AI's move for whichever seat is to act (for an AI standing in for a missing player). */
export const standInMove = (s: GameState): Command | null => aiCommand(s);
