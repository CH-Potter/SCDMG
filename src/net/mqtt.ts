// Public MQTT brokers over WebSocket Secure, as a Transport. A bare MQTT 3.1.1 client (CONNECT,
// SUBSCRIBE, PUBLISH at QoS 0, PING) with no dependencies, grown from spikes/pvp.
//
// The transport connects to every broker in its list at once and publishes on each one that is up,
// so the two players always meet even if one broker is down for one of them, and a broker that
// drops mid-game doesn't end the match. The sealed channel (net/crypto.ts) throws away the
// duplicate copies. Each broker link reconnects by itself with backoff.
//
// The brokers are public test services with no guarantees: fine for the MVP and play-testing;
// a public release should add our own relay (docs/pvp-feasibility.md §2.4).

import { MAX_WIRE_BYTES } from "./crypto";
import { Listeners, type LinkStatus, type Transport } from "./transport";

export interface Broker {
  /** Short name shown to the player. */
  name: string;
  url: string;
}

/** Tried together; the first is the primary. Re-tested 2026-11-27: both carry WSS traffic. */
export const DEFAULT_BROKERS: readonly Broker[] = [
  { name: "test.mosquitto.org", url: "wss://test.mosquitto.org:8081/mqtt" },
  { name: "broker.emqx.io", url: "wss://broker.emqx.io:8084/mqtt" },
];

/** Room ids live under this topic prefix (anyone on the broker can see the topics, never the contents). */
export const TOPIC_PREFIX = "scdmg/pvp1";

/** The subset of WebSocket this client uses (so tests can pass a fake). */
export interface SocketLike {
  binaryType: string;
  readonly readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: Uint8Array): void;
  close(): void;
}
export type SocketFactory = (url: string, protocols: string[]) => SocketLike;

const defaultSocket: SocketFactory = (url, protocols) => new WebSocket(url, protocols) as unknown as SocketLike;

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------------------------------------------------------------- packets

const T_CONNECT = 0x10;
const T_PUBLISH = 0x30;
const T_SUBSCRIBE = 0x82;
const T_PINGREQ = 0xc0;
const T_DISCONNECT = 0xe0;
const CONNACK = 2;
const PUBLISH = 3;
const SUBACK = 9;
const PINGRESP = 13;

function mqttString(s: string): number[] {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 255, ...b];
}

/** One MQTT packet: fixed header byte, remaining length (varint), body. */
export function encodePacket(type: number, body: ArrayLike<number>): Uint8Array {
  const len: number[] = [];
  let n = body.length;
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 128;
    len.push(byte);
  } while (n > 0);
  const out = new Uint8Array(1 + len.length + body.length);
  out[0] = type;
  out.set(len, 1);
  out.set(body, 1 + len.length);
  return out;
}

export const connectPacket = (clientId: string, keepAlive: number): Uint8Array =>
  encodePacket(T_CONNECT, [...mqttString("MQTT"), 4, 0x02 /* clean session */, keepAlive >> 8, keepAlive & 255, ...mqttString(clientId)]);

export const subscribePacket = (id: number, topic: string): Uint8Array =>
  encodePacket(T_SUBSCRIBE, [id >> 8, id & 255, ...mqttString(topic), 0]);

export function publishPacket(topic: string, payload: Uint8Array): Uint8Array {
  const t = mqttString(topic);
  const body = new Uint8Array(t.length + payload.length);
  body.set(t);
  body.set(payload, t.length);
  return encodePacket(T_PUBLISH, body);
}

export type Packet = { type: number; flags: number; body: Uint8Array };

/** Splits a byte stream into MQTT packets, keeping any partial packet for the next chunk. */
export class PacketReader {
  private buf = new Uint8Array(0);

  /** The complete packets so far. Throws on a malformed or oversized stream. */
  push(chunk: Uint8Array): Packet[] {
    const b = new Uint8Array(this.buf.length + chunk.length);
    b.set(this.buf);
    b.set(chunk, this.buf.length);
    this.buf = b;
    const out: Packet[] = [];
    for (;;) {
      if (this.buf.length < 2) break;
      let len = 0;
      let mul = 1;
      let i = 1;
      let done = false;
      for (; i < this.buf.length; i++) {
        const byte = this.buf[i]!;
        len += (byte & 127) * mul;
        mul *= 128;
        if (!(byte & 128)) {
          done = true;
          break;
        }
        if (i >= 4) throw new Error("Malformed MQTT length");
      }
      if (!done) break; // the length itself is incomplete
      if (len > MAX_WIRE_BYTES + 1024) throw new Error("MQTT packet too big");
      const start = i + 1;
      if (this.buf.length < start + len) break; // body incomplete
      const first = this.buf[0]!;
      out.push({ type: first >> 4, flags: first & 15, body: this.buf.slice(start, start + len) });
      this.buf = this.buf.slice(start + len);
    }
    return out;
  }
}

/** A PUBLISH body's topic and payload. */
export function readPublish(p: Packet): { topic: string; payload: Uint8Array } | null {
  if (p.body.length < 2) return null;
  const tl = (p.body[0]! << 8) | p.body[1]!;
  const qos = (p.flags >> 1) & 3;
  const start = 2 + tl + (qos ? 2 : 0);
  if (start > p.body.length) return null;
  return { topic: dec.decode(p.body.subarray(2, 2 + tl)), payload: p.body.slice(start) };
}

// ---------------------------------------------------------------- one broker

export interface LinkOptions {
  socket?: SocketFactory;
  keepAlive?: number; // seconds
  connectTimeoutMs?: number;
  /** Reconnect delays in ms, the last repeating. */
  backoffMs?: number[];
  random?: () => number;
}

/** One broker connection, subscribed to one topic, that reconnects until closed. */
export class BrokerLink {
  status: LinkStatus = "closed";
  readonly messages = new Listeners<Uint8Array>();
  readonly statuses = new Listeners<LinkStatus>();
  private ws: SocketLike | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private pinger: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;
  private attempt = 0;
  private wasOpen = false;
  private closed = false;
  private topic = "";
  private readonly socket: SocketFactory;
  private readonly keepAlive: number;
  private readonly connectTimeoutMs: number;
  private readonly backoffMs: number[];
  private readonly random: () => number;

  constructor(
    readonly broker: Broker,
    opts: LinkOptions = {},
  ) {
    this.socket = opts.socket ?? defaultSocket;
    this.keepAlive = opts.keepAlive ?? 20;
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 10000;
    this.backoffMs = opts.backoffMs ?? [1000, 2000, 4000, 8000, 15000];
    this.random = opts.random ?? Math.random;
  }

  /** Connect and subscribe. Resolves when subscribed the first time; rejects if that first try fails (it keeps retrying). */
  start(topic: string): Promise<void> {
    this.topic = topic;
    return new Promise((resolve, reject) => this.dial(resolve, reject));
  }

  send(bytes: Uint8Array): void {
    if (this.status !== "open" || !this.ws) return;
    try {
      this.ws.send(publishPacket(this.topic, bytes));
    } catch {
      this.drop();
    }
  }

  close(): void {
    this.closed = true;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.send(encodePacket(T_DISCONNECT, []));
      } catch {
        /* already gone */
      }
      try {
        ws.close();
      } catch {
        /* already gone */
      }
    }
    this.setStatus("closed");
  }

  private dial(onFirstOpen?: () => void, onFirstFail?: (e: Error) => void): void {
    if (this.closed) return;
    this.setStatus(this.wasOpen ? "reconnecting" : "connecting");
    const clientId = `scdmg-${Math.floor(this.random() * 2 ** 32).toString(36)}${Math.floor(this.random() * 2 ** 32).toString(36)}`;
    const reader = new PacketReader();
    let subscribed = false;
    let ws: SocketLike;
    const fail = (why: string) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      try {
        ws.close();
      } catch {
        /* already gone */
      }
      if (!subscribed && !this.wasOpen && onFirstFail) {
        onFirstFail(new Error(`${this.broker.name}: ${why}`));
        onFirstFail = undefined;
        onFirstOpen = undefined;
      }
      this.retry();
    };
    try {
      ws = this.socket(this.broker.url, ["mqtt"]);
    } catch (err) {
      onFirstFail?.(new Error(`${this.broker.name}: ${String(err)}`));
      this.retry();
      return;
    }
    this.ws = ws;
    ws.binaryType = "arraybuffer";
    this.timers.push(setTimeout(() => fail("timed out"), this.connectTimeoutMs));
    ws.onerror = () => fail("connection error");
    ws.onclose = () => fail("connection closed");
    ws.onopen = () => ws.send(connectPacket(clientId, this.keepAlive));
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let packets: Packet[];
      try {
        packets = reader.push(toBytes(ev.data));
      } catch {
        return fail("garbled stream");
      }
      this.lastHeard = Date.now();
      for (const p of packets) {
        if (p.type === CONNACK) {
          if (p.body[1] !== 0) return fail(`refused (code ${p.body[1]})`);
          ws.send(subscribePacket(1, this.topic));
        } else if (p.type === SUBACK) {
          if (p.body[2] === 0x80) return fail("subscription refused");
          subscribed = true;
          this.attempt = 0;
          this.wasOpen = true;
          this.clearTimers();
          this.startPinging(ws);
          this.setStatus("open");
          onFirstOpen?.();
          onFirstOpen = undefined;
          onFirstFail = undefined;
        } else if (p.type === PUBLISH) {
          const m = readPublish(p);
          if (m && m.topic === this.topic && subscribed) this.messages.emit(m.payload);
        } else if (p.type === PINGRESP) {
          // lastHeard already updated
        }
      }
    };
  }

  private startPinging(ws: SocketLike): void {
    this.lastHeard = Date.now();
    this.pinger = setInterval(
      () => {
        if (this.ws !== ws) return;
        if (Date.now() - this.lastHeard > this.keepAlive * 1500) return this.drop();
        try {
          ws.send(encodePacket(T_PINGREQ, []));
        } catch {
          this.drop();
        }
      },
      (this.keepAlive * 1000) / 2,
    );
  }

  /** Treat the current connection as dead and reconnect. */
  private drop(): void {
    const ws = this.ws;
    this.ws = null;
    this.clearTimers();
    try {
      ws?.close();
    } catch {
      /* already gone */
    }
    this.retry();
  }

  private retry(): void {
    if (this.closed) return;
    this.setStatus(this.wasOpen ? "reconnecting" : "connecting");
    const d = this.backoffMs[Math.min(this.attempt, this.backoffMs.length - 1)] ?? 15000;
    this.attempt++;
    this.timers.push(setTimeout(() => this.dial(), d * (0.75 + 0.5 * this.random())));
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.pinger) clearInterval(this.pinger);
    this.pinger = null;
  }

  private setStatus(s: LinkStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.statuses.emit(s);
  }
}

function toBytes(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw new Error("Unexpected WebSocket data");
}

// ---------------------------------------------------------------- the transport

/** Every broker at once: publishes on each open link, hears from all of them. */
export class MqttTransport implements Transport {
  readonly label: string;
  status: LinkStatus = "closed";
  private readonly links: BrokerLink[];
  private readonly messages = new Listeners<Uint8Array>();
  private readonly statuses = new Listeners<LinkStatus>();
  private everOpen = false;

  constructor(brokers: readonly Broker[] = DEFAULT_BROKERS, opts: LinkOptions = {}) {
    if (!brokers.length) throw new Error("No brokers");
    this.links = brokers.map((b) => new BrokerLink(b, opts));
    this.label = brokers.map((b) => b.name).join(" + ");
    for (const l of this.links) {
      l.messages.add((m) => this.messages.emit(m));
      l.statuses.add(() => this.refresh());
    }
  }

  /** Which brokers are open right now. */
  get openBrokers(): string[] {
    return this.links.filter((l) => l.status === "open").map((l) => l.broker.name);
  }

  join(room: string): Promise<void> {
    const topic = `${TOPIC_PREFIX}/${room}`;
    return new Promise((resolve, reject) => {
      let failures = 0;
      const errors: string[] = [];
      let settled = false;
      for (const l of this.links) {
        l.start(topic).then(
          () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          },
          (err: Error) => {
            failures++;
            errors.push(err.message);
            if (!settled && failures === this.links.length) {
              settled = true;
              reject(new Error(`Couldn't reach any game server (${errors.join("; ")})`));
            }
          },
        );
      }
    });
  }

  send(bytes: Uint8Array): void {
    for (const l of this.links) l.send(bytes);
  }

  onMessage(fn: (bytes: Uint8Array) => void) {
    return this.messages.add(fn);
  }

  onStatus(fn: (s: LinkStatus) => void) {
    return this.statuses.add(fn);
  }

  close(): void {
    for (const l of this.links) l.close();
    this.refresh();
  }

  private refresh(): void {
    const all = this.links.map((l) => l.status);
    let s: LinkStatus;
    if (all.includes("open")) s = "open";
    else if (all.every((x) => x === "closed")) s = "closed";
    else s = this.everOpen ? "reconnecting" : "connecting";
    if (s === "open") this.everOpen = true;
    if (s === this.status) return;
    this.status = s;
    this.statuses.emit(s);
  }
}
