// How sealed messages travel between the two players. A Transport joins a room (an opaque id from
// net/crypto.ts) and carries bytes to everyone else in it; it knows nothing about the game, and it
// may echo our own messages back, duplicate them or lose them (the sealed channel drops echoes and
// repeats; the session protocol resends what went missing).
//
// - memoryHub(): an in-process "broker" for tests (optional delay, loss and duplication).
// - net/mqtt.ts: public MQTT brokers over WebSocket Secure.

export type LinkStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface Transport {
  /** Which network this is (shown to the player, e.g. "test.mosquitto.org + broker.emqx.io"). */
  readonly label: string;
  /** Join the room. Resolves once at least one route is open; rejects if none could be reached. */
  join(room: string): Promise<void>;
  /** Send to the room (fire and forget). Ignored while nothing is open. */
  send(bytes: Uint8Array): void;
  /** Bytes from the room, possibly including our own echoes. Returns an unsubscribe function. */
  onMessage(fn: (bytes: Uint8Array) => void): () => void;
  /** Overall link status changes. Returns an unsubscribe function. */
  onStatus(fn: (status: LinkStatus) => void): () => void;
  readonly status: LinkStatus;
  /** Leave the room and close every connection. */
  close(): void;
}

/** A tiny listener list. */
export class Listeners<T> {
  private readonly fns = new Set<(v: T) => void>();
  add(fn: (v: T) => void): () => void {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }
  emit(v: T): void {
    for (const fn of [...this.fns]) {
      try {
        fn(v);
      } catch (err) {
        console.warn("PvP listener failed:", err);
      }
    }
  }
}

export interface MemoryHubOptions {
  /** Delivery delay in ms (0: next microtask). A function gives each delivery its own delay. */
  delay?: number | (() => number);
  /** Chance each delivery is lost, 0..1. */
  loss?: number;
  /** Chance each delivery arrives twice, 0..1. */
  duplicate?: number;
  /** Random source for loss and duplication (seed it in tests). */
  random?: () => number;
}

/** An in-process broker: every transport made from it that joins a room hears every message sent to that room, its own included. */
export function memoryHub(opts: MemoryHubOptions = {}) {
  const rooms = new Map<string, Set<MemoryTransport>>();
  const rnd = opts.random ?? Math.random;
  const delayOf = () => (typeof opts.delay === "function" ? opts.delay() : (opts.delay ?? 0));

  function deliver(to: MemoryTransport, bytes: Uint8Array): void {
    if (opts.loss && rnd() < opts.loss) return;
    const copies = opts.duplicate && rnd() < opts.duplicate ? 2 : 1;
    for (let i = 0; i < copies; i++) {
      const d = delayOf();
      const go = () => to.receive(bytes.slice());
      if (d > 0) setTimeout(go, d);
      else queueMicrotask(go);
    }
  }

  class MemoryTransport implements Transport {
    readonly label = "in-memory";
    status: LinkStatus = "closed";
    private room: string | null = null;
    private readonly messages = new Listeners<Uint8Array>();
    private readonly statuses = new Listeners<LinkStatus>();

    async join(room: string): Promise<void> {
      this.room = room;
      let members = rooms.get(room);
      if (!members) rooms.set(room, (members = new Set()));
      members.add(this);
      this.setStatus("open");
    }
    send(bytes: Uint8Array): void {
      if (this.status !== "open" || !this.room) return;
      for (const m of rooms.get(this.room) ?? []) deliver(m, bytes);
    }
    receive(bytes: Uint8Array): void {
      if (this.status === "open") this.messages.emit(bytes);
    }
    onMessage(fn: (bytes: Uint8Array) => void) {
      return this.messages.add(fn);
    }
    onStatus(fn: (s: LinkStatus) => void) {
      return this.statuses.add(fn);
    }
    /** Simulate a dropped connection (tests): stop hearing the room until resume(). */
    drop(): void {
      this.setStatus("reconnecting");
    }
    resume(): void {
      if (this.room) this.setStatus("open");
    }
    close(): void {
      if (this.room) rooms.get(this.room)?.delete(this);
      this.room = null;
      this.setStatus("closed");
    }
    private setStatus(s: LinkStatus): void {
      if (s === this.status) return;
      this.status = s;
      this.statuses.emit(s);
    }
  }

  return { transport: () => new MemoryTransport(), rooms };
}
