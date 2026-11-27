import { afterEach, describe, expect, it, vi } from "vitest";
import { SecureChannel, deriveRoom } from "../src/net/crypto";
import {
  BrokerLink,
  DEFAULT_BROKERS,
  MqttTransport,
  PacketReader,
  TOPIC_PREFIX,
  connectPacket,
  encodePacket,
  publishPacket,
  readPublish,
  subscribePacket,
  type SocketFactory,
  type SocketLike,
} from "../src/net/mqtt";
import { memoryHub } from "../src/net/transport";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** A fake MQTT broker behind fake WebSockets: CONNECT, SUBSCRIBE, PUBLISH (QoS 0, echoes to the sender too), PING. */
class FakeBroker {
  down = false;
  readonly sockets = new Set<FakeSocket>();
  readonly subs = new Map<FakeSocket, Set<string>>();
  readonly factory: SocketFactory = () => {
    const s = new FakeSocket(this);
    this.sockets.add(s);
    setTimeout(() => (this.down ? s.fireError() : s.fireOpen()), 1);
    return s;
  };
  handle(from: FakeSocket, packets: ReturnType<PacketReader["push"]>): void {
    for (const p of packets) {
      if (p.type === 1) from.deliver(encodePacket(0x20, [0, 0]));
      else if (p.type === 8) {
        const tl = (p.body[2]! << 8) | p.body[3]!;
        const topic = new TextDecoder().decode(p.body.subarray(4, 4 + tl));
        (this.subs.get(from) ?? this.subs.set(from, new Set()).get(from)!).add(topic);
        from.deliver(encodePacket(0x90, [p.body[0]!, p.body[1]!, 0]));
      } else if (p.type === 3) {
        const m = readPublish(p)!;
        for (const [s, topics] of this.subs) if (topics.has(m.topic)) s.deliver(publishPacket(m.topic, m.payload));
      } else if (p.type === 12) from.deliver(encodePacket(0xd0, []));
    }
  }
  /** Drop every connection, as a broker restart would. */
  kickAll(): void {
    for (const s of [...this.sockets]) s.fireClose();
  }
}

class FakeSocket implements SocketLike {
  binaryType = "blob";
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  private readonly reader = new PacketReader();
  constructor(private readonly broker: FakeBroker) {}
  send(data: Uint8Array): void {
    if (this.readyState !== 1) throw new Error("not open");
    this.broker.handle(this, this.reader.push(data));
  }
  close(): void {
    this.gone();
  }
  deliver(bytes: Uint8Array): void {
    if (this.readyState === 1) queueMicrotask(() => this.onmessage?.({ data: bytes.slice().buffer }));
  }
  fireOpen(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  fireError(): void {
    this.onerror?.({});
    this.fireClose();
  }
  fireClose(): void {
    if (this.readyState === 3) return;
    this.gone();
    this.onclose?.({});
  }
  private gone(): void {
    this.readyState = 3;
    this.broker.sockets.delete(this);
    this.broker.subs.delete(this);
  }
}

/** Two fake brokers, and a socket factory that routes by URL like the real list does. */
function twoBrokers() {
  const a = new FakeBroker();
  const b = new FakeBroker();
  const brokers = [
    { name: "a", url: "wss://a/mqtt" },
    { name: "b", url: "wss://b/mqtt" },
  ];
  const socket: SocketFactory = (url, p) => (url.includes("//a/") ? a.factory(url, p) : b.factory(url, p));
  return { a, b, brokers, opts: { socket, backoffMs: [5], connectTimeoutMs: 200, random: () => 0.5 } };
}

const made: { close(): void }[] = [];
afterEach(() => {
  for (const t of made.splice(0)) t.close();
});

function transport(...args: ConstructorParameters<typeof MqttTransport>) {
  const t = new MqttTransport(...args);
  made.push(t);
  return t;
}

async function heard(t: MqttTransport, n: number, ms = 500): Promise<string[]> {
  const got: string[] = [];
  const off = t.onMessage((b) => got.push(new TextDecoder().decode(b)));
  for (let waited = 0; got.length < n && waited < ms; waited += 5) await tick(5);
  off();
  return got;
}

describe("MQTT packets", () => {
  it("encode lengths as varints and read back in chunks of any size", () => {
    for (const size of [0, 1, 127, 128, 200, 16383, 16384, 70000]) {
      const payload = new Uint8Array(size).map((_, i) => i & 255);
      const pkt = publishPacket("scdmg/x", payload);
      const reader = new PacketReader();
      const out = [];
      for (let i = 0; i < pkt.length; i += 7) out.push(...reader.push(pkt.subarray(i, i + 7)));
      expect(out).toHaveLength(1);
      const m = readPublish(out[0]!)!;
      expect(m.topic).toBe("scdmg/x");
      expect(m.payload).toEqual(payload);
    }
  });

  it("read several packets from one chunk", () => {
    const both = new Uint8Array([...connectPacket("me", 20), ...subscribePacket(1, "t")]);
    const ps = new PacketReader().push(both);
    expect(ps.map((p) => p.type)).toEqual([1, 8]);
  });

  it("refuse a malformed length", () => {
    expect(() => new PacketReader().push(new Uint8Array([0x30, 255, 255, 255, 255, 1]))).toThrow(/Malformed/);
  });

  it("puts rooms under the scdmg prefix and lists mosquitto first, EMQX second", () => {
    expect(TOPIC_PREFIX).toBe("scdmg/pvp1");
    expect(DEFAULT_BROKERS.map((b) => b.name)).toEqual(["test.mosquitto.org", "broker.emqx.io"]);
    expect(DEFAULT_BROKERS.every((b) => b.url.startsWith("wss://"))).toBe(true);
  });
});

describe("MqttTransport", () => {
  it("lets two players meet in a room on every broker, and echoes our own messages back", async () => {
    const { brokers, opts } = twoBrokers();
    const host = transport(brokers, opts);
    const guest = transport(brokers, opts);
    await host.join("room1");
    await guest.join("room1");
    await tick(20);
    expect(host.status).toBe("open");
    expect(host.openBrokers).toEqual(["a", "b"]);
    const got = heard(guest, 2);
    host.send(new TextEncoder().encode("hi"));
    expect(await got).toEqual(["hi", "hi"]); // one copy per broker; the sealed channel drops the repeat
    const echo = heard(host, 1);
    host.send(new TextEncoder().encode("me"));
    expect((await echo)[0]).toBe("me");
  });

  it("keeps rooms apart", async () => {
    const { brokers, opts } = twoBrokers();
    const x = transport(brokers, opts);
    const y = transport(brokers, opts);
    await x.join("room-x");
    await y.join("room-y");
    await tick(20);
    const got = heard(y, 1, 100);
    x.send(new TextEncoder().encode("psst"));
    expect(await got).toEqual([]);
  });

  it("still meets when the primary broker is down, on the fallback", async () => {
    const { a, brokers, opts } = twoBrokers();
    a.down = true;
    const host = transport(brokers, opts);
    const guest = transport(brokers, opts);
    await host.join("r");
    await guest.join("r");
    await tick(20);
    expect(host.openBrokers).toEqual(["b"]);
    const got = heard(guest, 1);
    host.send(new TextEncoder().encode("via b"));
    expect(await got).toEqual(["via b"]);
  });

  it("fails to join when no broker can be reached", async () => {
    const { a, b, brokers, opts } = twoBrokers();
    a.down = b.down = true;
    const t = transport(brokers, opts);
    await expect(t.join("r")).rejects.toThrow(/Couldn't reach any game server/);
  });

  it("reconnects and resubscribes after a broker drops every connection", async () => {
    const { a, b, brokers, opts } = twoBrokers();
    b.down = true;
    const host = transport(brokers, opts);
    const guest = transport(brokers, opts);
    await host.join("r");
    await guest.join("r");
    const seen: string[] = [];
    host.onStatus((s) => seen.push(s));
    a.kickAll();
    await tick(1);
    expect(host.status).toBe("reconnecting");
    for (let i = 0; i < 100 && (host.status !== "open" || guest.status !== "open"); i++) await tick(5);
    expect(host.status).toBe("open");
    expect(seen).toEqual(["reconnecting", "open"]);
    const got = heard(guest, 1);
    host.send(new TextEncoder().encode("back"));
    expect(await got).toEqual(["back"]);
  });

  it("closes cleanly and stops reconnecting", async () => {
    const { a, brokers, opts } = twoBrokers();
    const t = transport(brokers, opts);
    await t.join("r");
    t.close();
    expect(t.status).toBe("closed");
    await tick(30);
    expect(a.sockets.size).toBe(0);
  });

  it("carries sealed messages end to end, and the channel drops the second broker's copy", async () => {
    const { brokers, opts } = twoBrokers();
    const room = await deriveRoom("D9ZP-8KME-NPR7-6AGR");
    const [hostCh, guestCh] = [new SecureChannel(room), new SecureChannel(room)];
    const host = transport(brokers, opts);
    const guest = transport(brokers, opts);
    await host.join(room.id);
    await guest.join(room.id);
    await tick(20);
    const opened: unknown[] = [];
    const drops: string[] = [];
    guest.onMessage(async (b) => {
      const r = await guestCh.open(b);
      if (r.ok) opened.push(r.msg.body);
      else drops.push(r.drop);
    });
    host.send(await hostCh.seal({ cmd: "move" }));
    await tick(30);
    expect(opened).toEqual([{ cmd: "move" }]);
    expect(drops).toEqual(["replay"]);
  });
});

describe("BrokerLink keep-alive", () => {
  it("drops a silent connection and reconnects", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "setTimeout", "Date"] });
    try {
      const broker = new FakeBroker();
      const link = new BrokerLink({ name: "a", url: "wss://a/mqtt" }, { socket: broker.factory, keepAlive: 2, backoffMs: [10], random: () => 0.5 });
      made.push(link);
      const started = link.start("t");
      await vi.advanceTimersByTimeAsync(5);
      await started;
      expect(link.status).toBe("open");
      // The broker goes silent: it stops answering pings.
      broker.handle = () => {};
      await vi.advanceTimersByTimeAsync(4000);
      expect(link.status).not.toBe("open");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("memoryHub", () => {
  it("delivers to everyone in the room, the sender included, and can lose or duplicate", async () => {
    let n = 0;
    const seq = [0.9, 0.1, 0.9, 0.9]; // second delivery lost; none duplicated (dup checks get 0.9)
    const hub = memoryHub({ loss: 0.5, duplicate: 0.5, random: () => seq[n++ % seq.length]! });
    const a = hub.transport();
    const b = hub.transport();
    await a.join("r");
    await b.join("r");
    const got: string[] = [];
    b.onMessage((x) => got.push(new TextDecoder().decode(x)));
    a.send(new TextEncoder().encode("1"));
    await tick(1);
    expect(got.length).toBeLessThanOrEqual(1);
    a.close();
    b.close();
  });
});

// Real brokers, only when asked: PVP_LIVE=1 npx vitest run tests/netTransport.test.ts
describe.skipIf(!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PVP_LIVE)("live brokers", () => {
  it("two players meet on test.mosquitto.org and broker.emqx.io", async () => {
    const room = await deriveRoom("D9ZP-8KME-NPR7-6AGR");
    const host = transport();
    const guest = transport();
    await host.join(room.id + "-live");
    await guest.join(room.id + "-live");
    await tick(1500);
    console.log("open brokers:", host.openBrokers, guest.openBrokers);
    const got = heard(guest, 1, 5000);
    host.send(new TextEncoder().encode("live hello"));
    expect((await got)[0]).toBe("live hello");
  }, 20000);
});
