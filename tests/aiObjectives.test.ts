// The AI's objective sense: shooting a unit off an objective is worth the objective it frees up,
// and heavy units don't plan for decks they can only reach by ladder.

import { describe, expect, it } from "vitest";
import { canReach, holderValue } from "../src/engine/ai";
import { createGame } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { unitById } from "../src/engine/rules";
import type { GameState, ListEntry, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

const L = (...ids: string[]): ListEntry[] => ids.map((profileId) => ({ profileId, upgrades: [] }));

function game(lists: [ListEntry[], ListEntry[]], missionId = "hold"): GameState {
  const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 7, lists, supports: [[], []], missionId });
  s.orderChoice = null;
  return s;
}

function place(s: GameState, uid: string, at: Vec): Unit {
  const u = unitById(s, uid)!;
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.1), y: at.y + Math.floor(i / 3) * (2 * r + 0.1) };
    m.elevation = 0;
  });
  return u;
}

/** The neutral ground-level objective at (5, 21) on the classic board. */
const objAt = (s: GameState) => s.objectives.find((o) => o.pos.x === 5 && o.pos.y === 21)!;

describe("AI objective sense", () => {
  it("killing the only holder of an objective is worth the objective; chip damage isn't", () => {
    const s = game([L("mil-grunts"), L("munch-spitter")]);
    const o = objAt(s);
    place(s, "p0-0", { x: 20, y: 30 });
    const holder = place(s, "p1-0", o.pos);
    expect(holderValue(s, holder, 100)).toBeGreaterThan(0);
    expect(holderValue(s, holder, 0.1)).toBe(0);
  });

  it("on a sticky objective, removing the holder only counts if we have supply on it too", () => {
    const s = game([L("mil-grunts"), L("munch-spitter")], "frontline");
    const o = objAt(s);
    o.controller = 1;
    const grunts = place(s, "p0-0", { x: 20, y: 30 });
    const holder = place(s, "p1-0", o.pos);
    expect(holderValue(s, holder, 100)).toBe(0); // nobody of ours there: it stays theirs
    place(s, "p0-0", { x: o.pos.x + 1.5, y: o.pos.y });
    expect(grunts.onBoard).toBe(true);
    expect(holderValue(s, holder, 100)).toBeGreaterThan(0); // our grunts would take it
  });

  it("a heavy unit can't plan for a deck that only has ladders", () => {
    const s = game([L("mil-bertha", "mil-grunts"), L("munch-nibblers")]);
    const deck = s.objectives.find((o) => o.elevation === 1)!;
    const bertha = place(s, "p0-0", { x: 17.5, y: 28 });
    const grunts = place(s, "p0-1", { x: 10, y: 28 });
    expect(canReach(s, bertha, deck)).toBe(true); // the ramp is there
    s.access = s.access.filter((ap) => ap.kind !== "ramp");
    expect(canReach(s, bertha, deck)).toBe(false);
    expect(canReach(s, grunts, deck)).toBe(true); // infantry climb ladders
  });
});
