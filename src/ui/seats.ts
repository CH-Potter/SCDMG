// Who is "you" on this screen. A local game puts you in seat 0 against the AI in seat 1; an online
// game puts you in whichever seat the session gave you (the host is seat 0, the guest seat 1), with
// a person in the other. Colours follow the seat, not the player: seat 0 is always cyan ("p0") and
// seat 1 red ("p1"), so the guest plays red (a board flip is for later). The words follow the player:
// "You", and "AI" or "Opponent" for the other side.

import type { GameState, PlayerId } from "../engine/types";

export interface Seats {
  /** The local player's seat. */
  me: PlayerId;
  /** The other seat. */
  them: PlayerId;
  /** An online game: the other seat is a person, not the AI. */
  online: boolean;
}

export const seats = (me: PlayerId = 0, online = false): Seats => ({ me, them: (me === 0 ? 1 : 0) as PlayerId, online });

/** A local game against the AI, as it has always been: you in seat 0. */
export const LOCAL_VS_AI: Seats = seats(0, false);

/** A seat's short name: "You", "AI" or "Opponent". */
export const who = (v: Seats, p: number): string => (p === v.me ? "You" : v.online ? "Opponent" : "AI");
/** A seat at the start of a sentence: "You", "The AI" or "Opponent". */
export const whoThe = (v: Seats, p: number): string => (p === v.me ? "You" : v.online ? "Opponent" : "The AI");
/** A seat mid-sentence: "you", "the AI" or "your opponent". */
export const whoMid = (v: Seats, p: number): string => (p === v.me ? "you" : v.online ? "your opponent" : "the AI");

/** A seat's colour class (dice rows, chips, log lines, attack labels): seat 0 is "p0", seat 1 "p1". */
export const sideOf = (p: number): "p0" | "p1" => (p === 0 ? "p0" : "p1");
/** A seat's colour in words. */
export const colourOf = (p: number): string => (p === 0 ? "cyan" : "red");
/** A call-out in a seat's colour ("you" is the cyan style, "ai" the red one). */
export const toneOf = (p: number): "you" | "ai" => (p === 0 ? "you" : "ai");

/** Whose command comes next: the seat choosing turn order if there is a choice to make, else the active player. */
export const seatToAct = (s: GameState): PlayerId => s.orderChoice?.player ?? s.activePlayer;

/** What the screen knows about the moment, beyond the game state. */
export interface TurnFlags {
  /** The opening initiative roll-off has been shown. */
  started: boolean;
  /** An action is being presented (dice, outcome, banners). */
  busy: boolean;
  /** The re-roll or payment prompt is up. */
  rerollOpen?: boolean;
  /** The AI is playing, or the opponent's moves are being shown. */
  opponentActing: boolean;
  /** Online: your move is on its way, or waiting to be settled. */
  sending?: boolean;
  /** Online: the session would take your move now (nothing in flight, your opponent has caught up). */
  myMove?: boolean;
  /** Online: your opponent's attack is waiting for their re-roll choice. */
  opponentRerolling?: boolean;
  /** Online: your opponent has gone quiet. */
  opponentSilent?: boolean;
  /** Online: the game has stopped (a resignation): what to say. */
  stopped?: string | null;
}

/** Whether you can give an order now. */
export function canAct(s: GameState, v: Seats, f: TurnFlags): boolean {
  if (!f.started || s.over || f.opponentActing || f.busy || s.activePlayer !== v.me) return false;
  if (!v.online) return true;
  return !f.sending && !f.stopped && !!f.myMove;
}

/** The status line in the top bar. */
export function statusLine(s: GameState, v: Seats, f: TurnFlags): string {
  if (s.over) return "Game over";
  if (v.online && f.stopped) return f.stopped;
  if (!f.started) return "Rolling for initiative…";
  if (f.busy) return "Resolving…";
  if (v.online && f.opponentRerolling) return "Opponent is deciding on a re-roll…";
  if (s.orderChoice) {
    if (s.orderChoice.player === v.me) return "Choose who goes first";
    return `${whoThe(v, v.them)} is choosing who goes first…`;
  }
  if (f.rerollOpen) return "Re-roll your misses?";
  if (v.online) {
    if (f.opponentSilent) return "Opponent disconnected — waiting…";
    if (f.opponentActing || s.activePlayer === v.them) return "Opponent's turn…";
    if (f.sending || !f.myMove) return "Waiting for opponent…";
  } else if (f.opponentActing || s.activePlayer === v.them) return "AI is thinking…";
  return s.phase === "movement"
    ? "Your move: deploy, move or hunker"
    : s.phase === "assault"
      ? "Your assault: shoot, charge or advance"
      : "Combat: pick an engaged unit to fight";
}
