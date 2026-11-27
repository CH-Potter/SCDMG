// A Transport between tabs and windows of the same browser (BroadcastChannel), for trying online
// play on one machine: the dev server's `#pvp-dev=host` and `#pvp-dev=guest` pages (main.ts).
// Every page in the room hears every message but its own; the sealed channel and the session work
// exactly as they do over a real broker.

import { Listeners, type LinkStatus, type Transport } from "./transport";

export class BroadcastTransport implements Transport {
  readonly label = "this browser (BroadcastChannel)";
  status: LinkStatus = "closed";
  private channel: BroadcastChannel | null = null;
  private readonly messages = new Listeners<Uint8Array>();
  private readonly statuses = new Listeners<LinkStatus>();

  /** `prefix` keeps different uses of BroadcastChannel apart. */
  constructor(private readonly prefix = "scdmg-pvp/") {}

  async join(room: string): Promise<void> {
    if (typeof BroadcastChannel !== "function") throw new Error("This browser can't talk between tabs (no BroadcastChannel)");
    this.channel?.close();
    const ch = new BroadcastChannel(this.prefix + room);
    ch.onmessage = (e: MessageEvent) => {
      if (this.status !== "open") return;
      const d: unknown = e.data;
      if (d instanceof Uint8Array) this.messages.emit(new Uint8Array(d));
      else if (d instanceof ArrayBuffer) this.messages.emit(new Uint8Array(d));
    };
    this.channel = ch;
    this.setStatus("open");
  }

  send(bytes: Uint8Array): void {
    if (this.status !== "open" || !this.channel) return;
    this.channel.postMessage(bytes);
  }

  onMessage(fn: (bytes: Uint8Array) => void): () => void {
    return this.messages.add(fn);
  }

  onStatus(fn: (s: LinkStatus) => void): () => void {
    return this.statuses.add(fn);
  }

  close(): void {
    this.channel?.close();
    this.channel = null;
    this.setStatus("closed");
  }

  private setStatus(s: LinkStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.statuses.emit(s);
  }
}
