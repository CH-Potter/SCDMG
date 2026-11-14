// Regression tests for engine bugs found in the quality pass.

import { describe, expect, it } from "vitest";
import { evaluate } from "../src/engine/ai";
import { planUnitMove, reviveSpot } from "../src/engine/formation";
import { applyCommand, createGame, wouldEngage, type GameSetup } from "../src/engine/game";
import { dist } from "../src/engine/geometry";
import { profileOf } from "../src/engine/profile";
import { aliveModels, isEngaged, modelGap, onBoard, playerHasOptions, unitById, unitsEngage } from "../src/engine/rules";
import { cleanupRound, updateFlags } from "../src/engine/scoring";
import type { Elevation, GameEvent, GameState, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

const ok = (r: ReturnType<typeof applyCommand>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

function game(setup: Partial<GameSetup> = {}): GameState {
  const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 7, ...setup });
  s.initiative = 0;
  s.activePlayer = 0;
  return s;
}

const uidOf = (s: GameState, owner: 0 | 1, profileId: string, nth = 0): string =>
  s.units.filter((u) => u.owner === owner && u.profileId === profileId)[nth]!.uid;

/** Put a unit on the board with each model at the given spot (test helper, bypasses rules). */
function placeAt(s: GameState, uid: string, spots: Vec[], elevation: Elevation = 0): Unit {
  const u = unitById(s, uid)!;
  const flying = profileOf(u).keywords.includes("flying");
  u.onBoard = true;
  u.models.forEach((m, i) => {
    const p = spots[i];
    if (!p) {
      m.alive = false;
      return;
    }
    m.pos = { ...p };
    m.elevation = flying ? 2 : elevation;
  });
  return u;
}

describe("phase flow", () => {
  it("never parks the game in a phase where nobody can act", () => {
    let s = game();
    // Nobody can afford supply for many rounds: every phase is empty.
    for (const p of s.players) p.supplyCap = -40;
    s = ok(applyCommand(s, { type: "pass", player: 0 }));
    expect(s.over || playerHasOptions(s, 0) || playerHasOptions(s, 1)).toBe(true);
    expect(s.over).toBe(true);
  });
});

describe("the snack", () => {
  it("can't be grabbed from a different level", () => {
    const s = game({ missionId: "flag" });
    const f = s.flags.find((x) => x.team === 1)!;
    // Dropped on the silo deck (x 12.5-22.5, y 14.5-20.5), right at the cliff edge.
    f.pos = { x: 13.1, y: 17.5 };
    placeAt(s, uidOf(s, 0, "mil-grunts", 2), [{ x: 11.9, y: 17.5 }]);
    const events: GameEvent[] = [];
    updateFlags(s, events);
    expect(f.carrier).toBeNull();
    // A model up on the deck does reach it.
    placeAt(s, uidOf(s, 0, "mil-grunts", 0), [{ x: 14.2, y: 17.5 }], 1);
    updateFlags(s, events);
    expect(f.carrier).toBe(uidOf(s, 0, "mil-grunts", 0));
  });

  it("scores on the same move the carrier reaches home", () => {
    let s = game({ missionId: "flag" });
    const f = s.flags.find((x) => x.team === 1)!;
    const home = s.objectives.find((o) => o.team === 0)!;
    f.pos = { x: home.pos.x - 1.8, y: home.pos.y }; // dropped right next to our home
    const g = placeAt(s, uidOf(s, 0, "mil-grunts", 2), [{ x: home.pos.x - 6, y: home.pos.y - 3 }]);
    s = ok(applyCommand(s, { type: "move", uid: g.uid, leader: 0, to: { x: home.pos.x - 1.6, y: home.pos.y - 0.6 } }));
    expect(s.players[0].vp).toBe(4);
    const after = s.flags.find((x) => x.team === 1)!;
    expect(after.carrier).toBeNull();
    expect(dist(after.pos, after.home)).toBeLessThan(0.01);
  });

  it("defenders touching their dropped snack send it home even if a thief is touching too", () => {
    const s = game({ missionId: "flag" });
    const f = s.flags.find((x) => x.team === 0)!;
    f.pos = { x: 20, y: 26 };
    placeAt(s, uidOf(s, 0, "mil-grunts", 2), [{ x: 21.2, y: 26 }]);
    placeAt(s, uidOf(s, 1, "munch-nibblers"), [{ x: 18.9, y: 26 }]);
    updateFlags(s, []);
    expect(f.carrier).toBeNull();
    expect(dist(f.pos, f.home)).toBeLessThan(0.01);
  });

  it("a carrier that teleports leaves the snack behind", () => {
    let s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["concord", "munch"], seed: 3, missionId: "flag" });
    s.activePlayer = 0;
    const guard = placeAt(s, uidOf(s, 0, "con-guard"), [
      { x: 17, y: 12 },
      { x: 18.4, y: 12 },
    ]);
    const f = s.flags.find((x) => x.team === 1)!;
    f.carrier = guard.uid;
    f.pos = { x: 17, y: 12 };
    s = ok(applyCommand(s, { type: "ability", uid: guard.uid, ability: "blink", point: { x: 17, y: 21.5 } }));
    const after = s.flags.find((x) => x.team === 1)!;
    expect(after.carrier).toBeNull();
    expect(dist(after.pos, { x: 17, y: 12 })).toBeLessThan(0.01);
  });
});

describe("regrow and revive placement", () => {
  it("never brings a model back into base contact with an enemy", () => {
    const s = game();
    const nib = placeAt(s, uidOf(s, 1, "munch-nibblers"), [
      { x: 10, y: 20 },
      { x: 10.95, y: 20 },
    ]);
    // Enemies hugging the pack's west side, 1.4" away (not engaged).
    const g = placeAt(s, uidOf(s, 0, "mil-grunts", 2), [
      { x: 7.6, y: 19.4 },
      { x: 7.6, y: 20.6 },
      { x: 8.2, y: 21.6 },
      { x: 8.2, y: 18.4 },
    ]);
    expect(unitsEngage(nib, g)).toBe(false);
    for (let i = 0; i < 4; i++) {
      const spot = reviveSpot(s, nib);
      expect(spot).not.toBeNull();
      const dead = nib.models.find((m) => !m.alive)!;
      Object.assign(dead, { alive: true, pos: spot!.pos, elevation: spot!.elevation });
      expect(unitsEngage(nib, g)).toBe(false);
    }
  });

  it("regrow keeps the critter in coherency with the pack", () => {
    const s = game();
    const nib = placeAt(s, uidOf(s, 1, "munch-nibblers"), [
      { x: 20, y: 26 },
      { x: 21, y: 26 },
    ]);
    cleanupRound(s, []);
    const alive = aliveModels(nib);
    expect(alive.length).toBe(3);
    const r = profileOf(nib).baseRadius;
    const newest = alive[2]!;
    expect(Math.min(...alive.slice(0, 2).map((m) => dist(m.pos, newest.pos) - 2 * r))).toBeLessThanOrEqual(2 + 1e-6);
  });
});

describe("coherency after casualties", () => {
  it("a squad split up by casualties can still move; the straggler catches up", () => {
    const s = game();
    const g = placeAt(s, uidOf(s, 0, "mil-grunts", 2), [
      { x: 10, y: 28 },
      { x: 16, y: 28 }, // stranded 6" away after its neighbours died
    ]);
    const plan = planUnitMove(s, g, 0, { x: 4, y: 28 }, { allowance: 6 });
    expect(typeof plan).toBe("object");
    if (typeof plan !== "object") return;
    const straggler = plan.placements.find((p) => p.modelId === 1)!;
    expect(dist(straggler.pos, { x: 16, y: 28 })).toBeGreaterThan(7);
    expect(dist(straggler.pos, { x: 4, y: 28 })).toBeLessThan(12 - 7);
  });

  it("models in coherency still have to stay in coherency", () => {
    const s = game();
    const g = placeAt(s, uidOf(s, 0, "mil-grunts", 2), [
      { x: 10, y: 28 },
      { x: 11.2, y: 28 },
    ]);
    const plan = planUnitMove(s, g, 0, { x: 4, y: 28 }, { allowance: 6 });
    if (typeof plan !== "object") throw new Error(plan);
    const r = profileOf(g).baseRadius;
    for (const p of plan.placements) expect(dist(p.pos, { x: 4, y: 28 }) - 2 * r).toBeLessThanOrEqual(2 + 1e-6);
  });
});

describe("charges and engagement across levels", () => {
  it("a charge onto a platform goes up the ramp and ends on the deck", () => {
    let s = game();
    s.phase = "assault";
    s.activePlayer = 1;
    const target = placeAt(
      s,
      uidOf(s, 0, "mil-grunts", 2),
      [
        { x: 19, y: 19.4 },
        { x: 20.2, y: 19.4 },
        { x: 21.4, y: 19.4 },
        { x: 19, y: 18.2 },
      ],
      1,
    );
    const nib = placeAt(s, uidOf(s, 1, "munch-nibblers", 1), [
      { x: 18.5, y: 23.5 },
      { x: 19.5, y: 23.5 },
      { x: 20.5, y: 23.5 },
    ]);
    s = ok(applyCommand(s, { type: "charge", uid: nib.uid, target: target.uid }));
    const after = unitById(s, nib.uid)!;
    expect(aliveModels(after).every((m) => m.elevation === 1)).toBe(true);
    expect(unitsEngage(after, unitById(s, target.uid)!)).toBe(true);
  });

  it("models right under a ledge aren't engaged with models on top, and can move there freely", () => {
    const s = game();
    const top = placeAt(s, uidOf(s, 1, "munch-nibblers"), [{ x: 13.1, y: 17.5 }], 1);
    const below = placeAt(s, uidOf(s, 0, "mil-grunts", 2), [{ x: 11.9, y: 18.1 }]);
    expect(modelGap(below, below.models[0]!, top, top.models[0]!)).toBeLessThan(1);
    expect(unitsEngage(below, top)).toBe(false);
    expect(wouldEngage(s, below, { x: 11.9, y: 18.6 })).toBe(false);
    expect(isEngaged(s, below)).toBe(false);
  });
});

describe("objective control and the AI's view of it", () => {
  it("sticky objectives the AI owns count for it even when nobody stands on them", () => {
    const s = game({ missionId: "grab" });
    const before = evaluate(s, 0);
    s.objectives[0]!.controller = 0;
    expect(evaluate(s, 0)).toBeGreaterThan(before);
    expect(onBoard(s).length).toBe(0);
  });
});
