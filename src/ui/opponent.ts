// Who plays the other seat on the battle screen: the AI (a local game), or a person far away whose
// moves arrive through an online session (net/session.ts). The controller presents both the same
// way: the attack marker, the dice, then the outcome.
//
// This file only uses the session's types, so the PvP code itself (net/*) stays out of the main
// bundle until an online game loads it.

import type { GameState } from "../engine/types";
import type { Applied, EndReason, PeerStatus, PvpSession } from "../net/session";

export interface OpponentDriver {
  /** An online game: the other seat is a person. */
  readonly online: boolean;
  /** The other seat may be up (after the opening, and after each of your actions): let it act. */
  wake(): void;
  /** The screen is closing: stop listening. */
  dispose(): void;
}

/** A local game: the AI plays the other seat (the controller's AI loop, unchanged). */
export class AiOpponent implements OpponentDriver {
  readonly online = false;
  constructor(private readonly play: () => Promise<void>) {}
  wake(): void {
    void this.play();
  }
  dispose(): void {}
}

/** One of the opponent's moves to show: a command, a re-rolled attack, or an attack they kept as it was. */
export interface RemoteMove {
  kind: "command" | "rerolled" | "kept";
  applied: Applied;
}

/** What an online game tells the screen, besides the opponent's moves. */
export interface NetListener {
  /** One or more of the opponent's moves are waiting to be shown (see `take`). */
  moves(): void;
  /** Something changed that may enable or disable your orders (an acknowledgement arrived). */
  changed(): void;
  peer(status: PeerStatus): void;
  desync(d: { n: number; mine: string; theirs: string }): void;
  problem(text: string): void;
  ended(r: EndReason): void;
}

/** An online game: your opponent's moves come from the session; yours go through it. */
export class NetOpponent implements OpponentDriver {
  readonly online = true;
  private readonly queue: RemoteMove[] = [];
  /** Opponent commands already queued (a later event for the same n settles or re-rolls it). */
  private readonly seen = new Set<number>();
  private readonly unsubs: (() => void)[] = [];
  private listener: NetListener | null = null;
  /**
   * The game as it stood when this opponent was made: the screen starts from here and shows the
   * moves that came in since. Make it when the game starts (the `started` event), even if the
   * screen comes later (art still loading), so no move is missed.
   */
  readonly startState: GameState;

  constructor(readonly session: PvpSession) {
    const s = session;
    if (!s.state) throw new Error("The online game hasn't started yet");
    this.startState = s.state;
    const open = s.openCommand;
    if (open) this.seen.add(open.n); // already in the start state: only its settling is to come
    this.unsubs.push(
      s.applied.add((a) => this.onApplied(a)),
      s.acked.add(() => this.listener?.changed()),
      s.peer.add((p) => this.listener?.peer(p)),
      s.desync.add((d) => this.listener?.desync(d)),
      s.problem.add((p) => this.listener?.problem(p)),
      s.ended.add((r) => this.listener?.ended(r)),
    );
  }

  /** Start passing events to the screen (moves that came in before are kept for `take`). */
  listen(l: NetListener): void {
    this.listener = l;
    if (this.queue.length) l.moves();
  }

  /** The next of the opponent's moves to show, oldest first. */
  take(): RemoteMove | undefined {
    return this.queue.shift();
  }

  /** The opponent's attack is waiting for their re-roll choice. */
  get opponentRerolling(): boolean {
    const open = this.session.openCommand;
    return !!open && open.seat !== this.session.seat;
  }

  wake(): void {
    if (this.queue.length) this.listener?.moves();
  }

  dispose(): void {
    for (const u of this.unsubs.splice(0)) u();
    this.listener = null;
  }

  private onApplied(a: Applied): void {
    // Our own commands are presented by whoever submitted them.
    if (a.seat === this.session.seat) return;
    const kind = a.revised ? "rerolled" : this.seen.has(a.n) ? "kept" : "command";
    this.seen.add(a.n);
    this.queue.push({ kind, applied: a });
    this.listener?.moves();
  }
}
