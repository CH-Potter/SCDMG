// The room an invite code opens, and the sealed channel inside it. Both players derive the same
// room id (the broker topic, or the relay room) and AES-256-GCM key from the code with HKDF; the
// code never leaves the device, and the broker or relay only ever sees opaque bytes.
// See docs/pvp-feasibility.md §3.2–3.3.
//
//   wire      = [version 1][iv: 12 random bytes][AES-GCM ciphertext + 16-byte tag]
//   AAD       = the room id (a message can't be moved into another room)
//   plaintext = JSON { sid, seq, t, body }
//
// Each connection has a random sid and a strictly rising seq: the receiver drops its own echoes
// (the broker sends our messages back to us), anything tampered with or sealed with another key,
// and anything replayed.

import { codeBytes } from "./code";

export const WIRE_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER = 1 + IV_BYTES;
/** Messages bigger than this are dropped unread (a lobby with custom factions is well under it). */
export const MAX_WIRE_BYTES = 1 << 20;
/** How many senders' sequence numbers a channel remembers (two players, plus their reconnects). */
const MAX_SENDERS = 32;

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface Room {
  /** The room id: a hex HKDF output, safe to show to the broker. */
  id: string;
  /** The message key (non-extractable). */
  key: CryptoKey;
}

const hex = (bytes: Uint8Array): string => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The room an invite code opens. Throws on a malformed code. */
export async function deriveRoom(code: string): Promise<Room> {
  const ikm = codeBytes(code);
  if (!ikm) throw new Error("That invite code isn't valid");
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits", "deriveKey"]);
  const salt = enc.encode("scdmg-pvp-v1");
  const idBits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: enc.encode("room") }, base, 128);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: enc.encode("aes-gcm key") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { id: hex(new Uint8Array(idBits)), key };
}

/** A message that got through: who sent it, its sequence number, when (sender's clock) and what. */
export interface Opened<T> {
  sid: string;
  seq: number;
  t: number;
  body: T;
}

export type DropReason = "malformed" | "too big" | "failed authentication" | "own echo" | "replay";

export type OpenResult<T> = { ok: true; msg: Opened<T> } | { ok: false; drop: DropReason };

/** One side's sealed conversation in a room. The transport just carries the bytes. */
export class SecureChannel {
  /** This connection's random id. */
  readonly sid: string;
  private seq = 0;
  private readonly lastSeen = new Map<string, number>();
  private readonly aad: Uint8Array<ArrayBuffer>;

  constructor(
    private readonly room: Room,
    private readonly now: () => number = Date.now,
  ) {
    this.sid = hex(crypto.getRandomValues(new Uint8Array(8)));
    this.aad = enc.encode(room.id);
  }

  async seal(body: unknown): Promise<Uint8Array> {
    const plain = enc.encode(JSON.stringify({ sid: this.sid, seq: ++this.seq, t: this.now(), body }));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: this.aad }, this.room.key, plain));
    const out = new Uint8Array(HEADER + ct.length);
    out[0] = WIRE_VERSION;
    out.set(iv, 1);
    out.set(ct, HEADER);
    return out;
  }

  /** The message, or why it was dropped. Never throws. */
  async open<T = unknown>(bytes: Uint8Array): Promise<OpenResult<T>> {
    if (bytes.length > MAX_WIRE_BYTES) return { ok: false, drop: "too big" };
    if (bytes.length < HEADER + TAG_BYTES || bytes[0] !== WIRE_VERSION) return { ok: false, drop: "malformed" };
    let raw: unknown;
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(bytes.subarray(1, HEADER)), additionalData: this.aad },
        this.room.key,
        new Uint8Array(bytes.subarray(HEADER)),
      );
      raw = JSON.parse(dec.decode(plain));
    } catch {
      return { ok: false, drop: "failed authentication" };
    }
    if (!isEnvelope(raw)) return { ok: false, drop: "malformed" };
    if (raw.sid === this.sid) return { ok: false, drop: "own echo" };
    const last = this.lastSeen.get(raw.sid) ?? 0;
    if (raw.seq <= last) return { ok: false, drop: "replay" };
    this.remember(raw.sid, raw.seq);
    return { ok: true, msg: raw as Opened<T> };
  }

  private remember(sid: string, seq: number): void {
    this.lastSeen.delete(sid); // re-insert so the map stays in least-recently-heard order
    this.lastSeen.set(sid, seq);
    if (this.lastSeen.size > MAX_SENDERS) {
      const oldest = this.lastSeen.keys().next().value;
      if (oldest !== undefined) this.lastSeen.delete(oldest);
    }
  }
}

function isEnvelope(v: unknown): v is Opened<unknown> {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.sid === "string" &&
    o.sid.length > 0 &&
    o.sid.length <= 64 &&
    typeof o.seq === "number" &&
    Number.isSafeInteger(o.seq) &&
    o.seq > 0 &&
    typeof o.t === "number" &&
    "body" in o
  );
}
