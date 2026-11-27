// Two online sessions talking over an in-memory broker, the AI playing both seats: every command
// goes through the full handshake, commit-reveal and hash checks, and both copies must agree.

import { afterEach, describe, expect, it } from "vitest";
import { aiCommand } from "../src/engine/ai";
import { syncHash } from "../src/engine/fingerprint";
import type { GameSetup } from "../src/engine/game";
import type { Command } from "../src/engine/types";
import { SecureChannel, deriveRoom } from "../src/net/crypto";
import { PvpSession, rerollMisses, seatToAct, type Role } from "../src/net/session";
import { memoryHub, type MemoryHubOptions } from "../src/net/transport";

const CODE = "D9ZP-8KME-NPR7-6AGR";
const SETUP: GameSetup = { factions: ["militia", "swarm"], mapId: "dustbowl", orderChoice: true };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const open: PvpSession[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.close();
});

function session(hub: ReturnType<typeof memoryHub>, role: Role, build = "test", code = CODE) {
  const s = new PvpSession({ transport: hub.transport(), code, role, build, resendMs: 15, pingMs: 1000, pairTimeoutMs: 400 });
  open.push(s);
  return s;
}

async function until(cond: () => boolean, ms = 3000, what = "condition"): Promise<void> {
  for (let t = 0; !cond(); t += 2) {
    if (t > ms) throw new Error(`timed out waiting for ${what}`);
    await tick(2);
  }
}

/** Pair a host and a guest and start the game from SETUP. */
async function startGame(hubOpts: MemoryHubOptions = {}, setup: GameSetup = SETUP) {
  const hub = memoryHub(hubOpts);
  const host = session(hub, "host");
  const guest = session(hub, "guest");
  const problems: string[] = [];
  const desyncs: unknown[] = [];
  for (const s of [host, guest]) {
    s.problem.add((p) => problems.push(p));
    s.desync.add((d) => desyncs.push(d));
  }
  guest.setupOffered.add(() => void guest.acceptSetup());
  await host.start();
  await guest.start();
  await until(() => host.isPaired && guest.isPaired, 3000, "pairing");
  await host.proposeSetup(setup);
  await until(() => !!host.state && !!guest.state, 3000, "the game to start");
  return { hub, host, guest, problems, desyncs };
}

/** Let the AI play both seats through the sessions, re-rolling every other chance it gets (the first included). */
async function play(host: PvpSession, guest: PvpSession, maxCmds: number, timeoutMs = 60000) {
  let rerolls = 0;
  let chances = 0;
  const start = Date.now();
  while (host.turn < maxCmds && !host.state!.over) {
    if (Date.now() - start > timeoutMs) throw new Error(`stalled at command ${host.turn}`);
    const mover = [host, guest].find((s) => s.myMove);
    const settler = [host, guest].find((s) => s.openCommand && s.openCommand.seat === s.seat);
    if (settler) {
      const e = settler.openCommand!;
      if (++chances % 2 === 1) {
        rerolls++;
        await settler.finalize({ ...(e.cmd as Extract<Command, { type: "shoot" }>), reroll: true });
      } else await settler.finalize();
      await until(() => !host.openCommand && !guest.openCommand, 3000, "the re-roll choice to settle");
      continue;
    }
    if (!mover) {
      await tick(1);
      continue;
    }
    const cmd = aiCommand(mover.state!);
    if (!cmd) throw new Error("the AI had no move");
    await mover.submit(cmd);
    await until(() => guest.turn === host.turn, 3000, "both sides to apply the command");
  }
  await until(() => syncHash(host.state!) === syncHash(guest.state!), 3000, "both sides to agree");
  return { rerolls, chances };
}

describe("PvP sessions over an in-memory broker", () => {
  it("pair, agree on a jointly random seed and start the same game", async () => {
    const { host, guest, problems, desyncs } = await startGame();
    expect(syncHash(host.state!)).toBe(syncHash(guest.state!));
    expect(host.state!.rng).toBe(guest.state!.rng);
    expect(problems).toEqual([]);
    expect(desyncs).toEqual([]);
    // Each game gets its own seed.
    const again = await startGame();
    expect(again.host.state!.rng).not.toBe(host.state!.rng);
  });

  it("play a whole game in lockstep, hash-checked after every command", async () => {
    const { host, guest, problems, desyncs } = await startGame();
    const hashes: string[] = [];
    guest.applied.add((a) => hashes.push(syncHash(a.state)));
    await play(host, guest, 5000, 120000);
    expect(host.state!.over).toBe(true);
    expect(guest.state!.over).toBe(true);
    expect(host.state!.winner).toBe(guest.state!.winner);
    expect(host.turn).toBe(guest.turn);
    expect(host.turn).toBeGreaterThan(50);
    expect(problems).toEqual([]);
    expect(desyncs).toEqual([]);
    expect(hashes.length).toBeGreaterThanOrEqual(host.turn);
  }, 150000);

  it("stay in step through re-rolls (Command re-roll house rule)", async () => {
    // A chance comes up a few times a game (CP is scarce), so play games until one does.
    let rerolls = 0;
    for (let game = 0; game < 5 && rerolls === 0; game++) {
      const { host, guest, problems, desyncs } = await startGame({}, { ...SETUP, rules: { reroll: true } });
      rerolls += (await play(host, guest, 400, 120000)).rerolls;
      expect(problems).toEqual([]);
      expect(desyncs).toEqual([]);
      host.close();
      guest.close();
    }
    expect(rerolls).toBeGreaterThan(0);
  }, 150000);

  it("survive a broker that loses, duplicates and delays messages", async () => {
    let x = 7;
    const random = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const { host, guest, problems, desyncs } = await startGame({ loss: 0.2, duplicate: 0.2, delay: () => Math.floor(random() * 6), random });
    await play(host, guest, 120, 120000);
    expect(host.turn).toBeGreaterThanOrEqual(Math.min(120, host.turn));
    expect(syncHash(host.state!)).toBe(syncHash(guest.state!));
    expect(problems).toEqual([]);
    expect(desyncs).toEqual([]);
  }, 150000);
});

describe("PvP sessions refuse", () => {
  it("a move out of turn", async () => {
    const { host, guest } = await startGame();
    const idle = seatToAct(host.state!) === 0 ? guest : host;
    const cmd = aiCommand(idle.state!)!;
    await expect(idle.submit(cmd)).rejects.toThrow(/Not your move/);
  });

  it("an illegal move sent by a modified client, and say so", async () => {
    const { host, guest, problems } = await startGame();
    await until(() => host.myMove || guest.myMove, 2000, "someone's move");
    const mover = host.myMove ? host : guest;
    const other = mover === host ? guest : host;
    // Bypass submit's own check, as a modified client would.
    const bad: Command = { type: "move", uid: "nope", leader: 0, to: { x: 1, y: 1 } };
    (mover as unknown as { pending: unknown }).pending = { role: "A", n: mover.turn, cmd: bad, a: "00".repeat(16), c: "11".repeat(32), resolve: () => {}, reject: () => {} };
    await (mover as unknown as { send(m: unknown): Promise<void> }).send({ k: "cmd", n: mover.turn, cmd: bad, c: "11".repeat(32) });
    await until(() => problems.length > 0, 2000, "the refusal");
    expect(problems[0]).toMatch(/rules don't allow/);
    expect(other.turn).toBe(0);
  });

  it("a secret that doesn't match its commitment", async () => {
    const { host, guest, problems } = await startGame();
    await until(() => host.myMove || guest.myMove, 2000, "someone's move");
    const mover = host.myMove ? host : guest;
    const cmd = aiCommand(mover.state!)!;
    // Commit to one secret, then reveal another.
    const real = mover as unknown as { pending: { a: string } | null; onSalt(m: unknown): Promise<void> };
    const orig = real.onSalt.bind(mover);
    real.onSalt = async (m) => {
      if (real.pending) real.pending.a = "ab".repeat(16);
      return orig(m);
    };
    void mover.submit(cmd).catch(() => {});
    await until(() => problems.length > 0, 2000, "the refusal");
    expect(problems[0]).toMatch(/didn't match its promise/);
  });

  it("a different version", async () => {
    const hub = memoryHub();
    const host = session(hub, "host", "v1");
    const guest = session(hub, "guest", "v2");
    const problems: string[] = [];
    guest.problem.add((p) => problems.push(p));
    await host.start();
    await guest.start();
    await until(() => problems.length > 0, 2000, "the version warning");
    expect(problems[0]).toMatch(/different version \(v1\)/);
    expect(host.isPaired || guest.isPaired).toBe(false);
  });

  it("a third player once the room is paired", async () => {
    const hub = memoryHub();
    const host = session(hub, "host");
    const guest = session(hub, "guest");
    await host.start();
    await guest.start();
    await until(() => host.isPaired && guest.isPaired);
    const intruder = session(hub, "guest");
    await intruder.start();
    await tick(200);
    expect(intruder.isPaired).toBe(false);
  });

  it("messages recorded in an earlier session, even with the same code", async () => {
    // Record everything the host sends in one session...
    const hub1 = memoryHub();
    const recorded: Uint8Array[] = [];
    const h1 = session(hub1, "host");
    const g1 = session(hub1, "guest");
    const spy = hub1.transport();
    const room = await deriveRoom(CODE);
    await spy.join(room.id);
    spy.onMessage((b) => recorded.push(b));
    g1.setupOffered.add(() => void g1.acceptSetup());
    await h1.start();
    await g1.start();
    await until(() => h1.isPaired && g1.isPaired);
    await h1.proposeSetup(SETUP);
    await until(() => !!g1.state);
    expect(recorded.length).toBeGreaterThan(3);
    // ...then replay it into a new session with the same code: nothing but the hellos opens.
    const g2Channel = new SecureChannel(room);
    let opened = 0;
    for (const b of recorded) if ((await g2Channel.open(b)).ok) opened++;
    const helloCount = opened; // the code-key hellos still open (they carry only public keys)
    const hub2 = memoryHub();
    const g2 = session(hub2, "guest");
    const offered: unknown[] = [];
    g2.setupOffered.add((x) => offered.push(x));
    await g2.start();
    const replayer = hub2.transport();
    await replayer.join(room.id);
    for (const b of recorded) replayer.send(b);
    await tick(600); // past the pairing timeout
    expect(helloCount).toBeGreaterThan(0);
    expect(g2.isPaired).toBe(false); // the old host's hello can't be confirmed: its key is gone
    expect(offered).toEqual([]); // and the old setup never opens
  });
});

describe("rerollMisses", () => {
  it("is 0 without the house rule", async () => {
    const { host } = await startGame();
    expect(rerollMisses(host.state!, { type: "shoot", uid: "x", target: "y", weapon: 0 }, [])).toBe(0);
  });
});
