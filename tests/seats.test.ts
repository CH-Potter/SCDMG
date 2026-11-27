// The battle screen's seat logic (ui/seats.ts): who "you" are, what the other side is called, whose
// colour is whose, when you can give an order and what the status line says. A local game against
// the AI must read exactly as it always has; an online guest plays seat 1 (red) against "Opponent".

import { describe, expect, it } from "vitest";
import { createGame, type GameSetup } from "../src/engine/game";
import type { GameEvent, GameState } from "../src/engine/types";
import { seatToAct as sessionSeatToAct } from "../src/net/session";
import { describeEvent } from "../src/ui/describe";
import { LOCAL_VS_AI, canAct, colourOf, seatToAct, seats, sideOf, statusLine, toneOf, who, whoMid, whoThe, type TurnFlags } from "../src/ui/seats";

const SETUP: GameSetup = { factions: ["militia", "swarm"], mapId: "dustbowl", seed: 7, orderChoice: false };
const game = (patch: Partial<GameState> = {}): GameState => ({ ...createGame(SETUP), ...patch });
const idle: TurnFlags = { started: true, busy: false, opponentActing: false };

const host = seats(0, true);
const guest = seats(1, true);

describe("seats", () => {
  it("default to you in seat 0 against the AI", () => {
    expect(seats()).toEqual({ me: 0, them: 1, online: false });
    expect(LOCAL_VS_AI).toEqual(seats());
    expect(guest).toEqual({ me: 1, them: 0, online: true });
  });

  it("name the sides for the player looking", () => {
    expect([who(LOCAL_VS_AI, 0), who(LOCAL_VS_AI, 1)]).toEqual(["You", "AI"]);
    expect([whoThe(LOCAL_VS_AI, 1), whoMid(LOCAL_VS_AI, 1)]).toEqual(["The AI", "the AI"]);
    expect([who(guest, 0), who(guest, 1)]).toEqual(["Opponent", "You"]);
    expect([whoThe(guest, 0), whoMid(guest, 0), whoMid(guest, 1)]).toEqual(["Opponent", "your opponent", "you"]);
    expect(who(host, 1)).toBe("Opponent");
  });

  it("keep colours with the seat, whoever is local", () => {
    expect([sideOf(0), sideOf(1)]).toEqual(["p0", "p1"]);
    expect([colourOf(0), colourOf(1)]).toEqual(["cyan", "red"]);
    expect([toneOf(0), toneOf(1)]).toEqual(["you", "ai"]);
  });

  it("agree with the session on whose command comes next", () => {
    const s = game();
    expect(seatToAct(s)).toBe(sessionSeatToAct(s));
    const choosing = game({ activePlayer: 0, orderChoice: { player: 1, reason: "rolloff" } });
    expect(seatToAct(choosing)).toBe(1);
    expect(sessionSeatToAct(choosing)).toBe(1);
  });
});

describe("canAct", () => {
  it("against the AI: your seat's turn, started, nothing playing", () => {
    expect(canAct(game({ activePlayer: 0 }), LOCAL_VS_AI, idle)).toBe(true);
    expect(canAct(game({ activePlayer: 1 }), LOCAL_VS_AI, idle)).toBe(false);
    expect(canAct(game({ activePlayer: 0 }), LOCAL_VS_AI, { ...idle, started: false })).toBe(false);
    expect(canAct(game({ activePlayer: 0 }), LOCAL_VS_AI, { ...idle, busy: true })).toBe(false);
    expect(canAct(game({ activePlayer: 0 }), LOCAL_VS_AI, { ...idle, opponentActing: true })).toBe(false);
    expect(canAct(game({ activePlayer: 0, over: true }), LOCAL_VS_AI, idle)).toBe(false);
    // The online-only flags don't touch a local game.
    expect(canAct(game({ activePlayer: 0 }), LOCAL_VS_AI, { ...idle, myMove: false, sending: true, stopped: "x" })).toBe(true);
  });

  it("online: also needs the session to take your move, and nothing of yours in flight", () => {
    const mine = game({ activePlayer: 1 });
    expect(canAct(mine, guest, { ...idle, myMove: true })).toBe(true);
    expect(canAct(mine, guest, { ...idle, myMove: false })).toBe(false);
    expect(canAct(mine, guest, { ...idle, myMove: true, sending: true })).toBe(false);
    expect(canAct(mine, guest, { ...idle, myMove: true, stopped: "Opponent resigned" })).toBe(false);
    expect(canAct(game({ activePlayer: 0 }), guest, { ...idle, myMove: true })).toBe(false);
    expect(canAct(game({ activePlayer: 0 }), host, { ...idle, myMove: true })).toBe(true);
  });
});

describe("statusLine", () => {
  it("reads as it always has against the AI", () => {
    expect(statusLine(game({ activePlayer: 0, phase: "movement" }), LOCAL_VS_AI, idle)).toBe("Your move: deploy, move or hunker");
    expect(statusLine(game({ activePlayer: 0, phase: "assault" }), LOCAL_VS_AI, idle)).toBe("Your assault: shoot, charge or advance");
    expect(statusLine(game({ activePlayer: 0, phase: "combat" }), LOCAL_VS_AI, idle)).toBe("Combat: pick an engaged unit to fight");
    expect(statusLine(game({ activePlayer: 1 }), LOCAL_VS_AI, idle)).toBe("AI is thinking…");
    expect(statusLine(game({ activePlayer: 0 }), LOCAL_VS_AI, { ...idle, opponentActing: true })).toBe("AI is thinking…");
    expect(statusLine(game(), LOCAL_VS_AI, { ...idle, started: false })).toBe("Rolling for initiative…");
    expect(statusLine(game(), LOCAL_VS_AI, { ...idle, busy: true })).toBe("Resolving…");
    expect(statusLine(game({ activePlayer: 0 }), LOCAL_VS_AI, { ...idle, rerollOpen: true })).toBe("Re-roll your misses?");
    expect(statusLine(game({ orderChoice: { player: 0, reason: "rolloff" } }), LOCAL_VS_AI, idle)).toBe("Choose who goes first");
    expect(statusLine(game({ orderChoice: { player: 1, reason: "rolloff" } }), LOCAL_VS_AI, idle)).toBe("The AI is choosing who goes first…");
    expect(statusLine(game({ over: true }), LOCAL_VS_AI, idle)).toBe("Game over");
  });

  it("online: the opponent's turn, waiting, re-roll decisions and a quiet opponent", () => {
    const flags = { ...idle, myMove: true };
    expect(statusLine(game({ activePlayer: 0 }), guest, flags)).toBe("Opponent's turn…");
    expect(statusLine(game({ activePlayer: 1, phase: "movement" }), guest, flags)).toBe("Your move: deploy, move or hunker");
    expect(statusLine(game({ activePlayer: 1 }), guest, { ...flags, myMove: false })).toBe("Waiting for opponent…");
    expect(statusLine(game({ activePlayer: 1 }), guest, { ...flags, sending: true })).toBe("Waiting for opponent…");
    expect(statusLine(game({ activePlayer: 1 }), guest, { ...flags, opponentRerolling: true })).toBe("Opponent is deciding on a re-roll…");
    expect(statusLine(game({ activePlayer: 0 }), guest, { ...flags, opponentSilent: true })).toBe("Opponent disconnected — waiting…");
    expect(statusLine(game({ orderChoice: { player: 0, reason: "rolloff" } }), guest, flags)).toBe("Opponent is choosing who goes first…");
    expect(statusLine(game({ orderChoice: { player: 1, reason: "rolloff" } }), guest, flags)).toBe("Choose who goes first");
    expect(statusLine(game(), guest, { ...flags, stopped: "Opponent resigned" })).toBe("Opponent resigned");
    expect(statusLine(game({ activePlayer: 0, phase: "assault" }), host, flags)).toBe("Your assault: shoot, charge or advance");
  });
});

describe("describeEvent wording", () => {
  const s = game();
  const events: GameEvent[] = [
    { type: "passed", player: 1 },
    { type: "scored", player: 0, vp: 2, reason: "holding objective 1" },
    { type: "gameOver", winner: 1, reason: "Mercy rule" },
  ];
  it("is unchanged against the AI (the default)", () => {
    expect(events.map((e) => describeEvent(s, e))).toEqual([
      "AI passed.",
      "<b>You +2 VP</b> for holding objective 1.",
      "<b>Game over: the AI wins.</b> Mercy rule.",
    ]);
    expect(events.map((e) => describeEvent(s, e, LOCAL_VS_AI))).toEqual(events.map((e) => describeEvent(s, e)));
  });

  it("follows the local seat online", () => {
    expect(events.map((e) => describeEvent(s, e, guest))).toEqual([
      "You passed.",
      "<b>Opponent +2 VP</b> for holding objective 1.",
      "<b>Game over: you win.</b> Mercy rule.",
    ]);
    expect(describeEvent(s, { type: "orderDraw", player: 0, left: [3, 2] }, guest)).toMatch(/^🎲 Order draw: your opponent goes next/);
  });
});
