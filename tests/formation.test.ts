// Squad movement: squads spread out and snap to cover (no rigid blocks), chain coherency, charges.

import { describe, expect, it } from "vitest";
import {
  COHERENCY,
  coherencyGroups,
  coverRating,
  inCoherency,
  isStraggler,
  planUnitMove,
  reviveSpot,
  SNAP_RADIUS,
  type UnitMovePlan,
} from "../src/engine/formation";
import { applyCommand, createGame, planCharge } from "../src/engine/game";
import { dist, pointInPolygon } from "../src/engine/geometry";
import { profileOf } from "../src/engine/profile";
import { aliveModels, ENGAGE_RANGE, unitById, unitsEngage } from "../src/engine/rules";
import { deployZones } from "../src/engine/supports";
import { platformAt } from "../src/engine/terrain";
import type { Elevation, GameState, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

// Dustbowl Crossing (the default map): barn x 4-9 y 11-16, east wall x 4.7-5.5 y 15.5-20.5,
// fence x 14-21 y 25.2-26, silo deck x 12.5-22.5 y 14.5-20.5 with a ramp from (17.5, 22.1) up to (17.5, 19.7).

function game(): GameState {
  const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 7 });
  s.initiative = 0;
  s.activePlayer = 0;
  return s;
}

const uidOf = (s: GameState, owner: 0 | 1, profileId: string, nth = 0): string =>
  s.units.filter((u) => u.owner === owner && u.profileId === profileId)[nth]!.uid;

/** A block of rows of `perRow` (three by default), `gap` apart edge to edge. */
function block(s: GameState, uid: string, at: Vec, gap = 0.2, elevation: Elevation = 0, perRow = 3): Unit {
  const u = unitById(s, uid)!;
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % perRow) * (2 * r + gap), y: at.y + Math.floor(i / perRow) * (2 * r + gap) };
    m.elevation = elevation;
  });
  return u;
}

/** Put each model at the given spot; models without a spot are dead. */
function placeAt(s: GameState, uid: string, spots: Vec[], elevation: Elevation = 0): Unit {
  const u = unitById(s, uid)!;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    const p = spots[i];
    if (!p) m.alive = false;
    else Object.assign(m, { pos: { ...p }, elevation });
  });
  return u;
}

function plan(p: UnitMovePlan | string): UnitMovePlan {
  if (typeof p === "string") throw new Error(p);
  return p;
}

/** The unit as it would stand after the plan. */
function after(u: Unit, p: UnitMovePlan): Unit {
  return {
    ...u,
    models: u.models.map((m) => {
      const at = p.placements.find((q) => q.modelId === m.id);
      return at ? { ...m, pos: at.pos, elevation: at.elevation } : m;
    }),
  };
}

const gaps = (u: Unit, p: UnitMovePlan): number[] => {
  const r = profileOf(u).baseRadius;
  return p.placements.map((a) =>
    Math.min(...p.placements.filter((b) => b !== a).map((b) => dist(a.pos, b.pos) - 2 * r)),
  );
};

function expectLegal(u: Unit, p: UnitMovePlan): void {
  const r = profileOf(u).baseRadius;
  expect(p.placements.length).toBe(aliveModels(u).length);
  expect(inCoherency(after(u, p))).toBe(true);
  for (const a of p.placements) {
    for (const b of p.placements)
      if (a !== b) expect(dist(a.pos, b.pos)).toBeGreaterThanOrEqual(2 * r - 1e-6);
    expect(a.elevation).toBe(p.placements[0]!.elevation);
  }
}

/** Loose squads: neighbours sit about an inch apart, never base to base in a block. */
const LOOSE = 1.3;

describe("squads spread out and take cover", () => {
  it("in the open, followers form a loose line across the enemy's direction, not a block", () => {
    const s = game();
    s.terrain = []; // open ground
    const u = block(s, uidOf(s, 0, "mil-grunts", 2), { x: 16, y: 32 });
    const p = plan(planUnitMove(s, u, 0, { x: 17, y: 27 }, { allowance: 6 }));
    expectLegal(u, p);
    for (const g of gaps(u, p)) {
      expect(g).toBeGreaterThanOrEqual(0.3 - 1e-6);
      expect(g).toBeLessThanOrEqual(LOOSE);
    }
    // The enemy deploys along the top edge, so the line runs left-right.
    const xs = p.placements.map((q) => q.pos.x);
    const ys = p.placements.map((q) => q.pos.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(2 * (Math.max(...ys) - Math.min(...ys)));
  });

  it("followers snap into nearby area cover", () => {
    const s = game();
    const u = block(s, uidOf(s, 0, "mil-grunts", 2), { x: 7, y: 32 }, 0.2, 0, 4); // two rows: on the table
    const crater = s.terrain.find((t) => t.id === "crater-a")!;
    // The leader stops just south of the crater; the enemy is to the north.
    const p = plan(planUnitMove(s, u, 0, { x: 9, y: 28.6 }, { allowance: 6 }));
    expectLegal(u, p);
    // Followers end in cover: in the crater, or behind it from the enemy's side. One crater holds six
    // Grunts within the snap radius; a seventh has no room left, so it may stand in the open, but only
    // once the cover is full (it is further from the leader's spot than every model in cover).
    const covered = p.placements.filter((q) => coverRating(s, u, q.pos, 0) === 2);
    const open = p.placements.filter((q) => coverRating(s, u, q.pos, 0) !== 2);
    expect(covered.length).toBeGreaterThanOrEqual(Math.min(6, p.placements.length));
    const to = { x: 9, y: 28.6 };
    for (const q of open) for (const c of covered) expect(dist(q.pos, to)).toBeGreaterThan(dist(c.pos, to));
    for (const q of open) expect(dist(q.pos, to)).toBeGreaterThan(SNAP_RADIUS);
    expect(p.placements.some((q) => q.modelId !== 0 && pointInPolygon(q.pos, crater.poly))).toBe(true);
  });

  it("followers tuck in behind a barricade on the side away from the enemy", () => {
    const s = game();
    block(s, uidOf(s, 1, "munch-nibblers"), { x: 16, y: 14 }); // the enemy, north of the fence
    const u = block(s, uidOf(s, 0, "mil-grunts", 2), { x: 16, y: 32 });
    const p = plan(planUnitMove(s, u, 0, { x: 17.5, y: 27.8 }, { allowance: 6 }));
    expectLegal(u, p);
    const r = profileOf(u).baseRadius;
    const tucked = p.placements.filter((q) => q.pos.y > 26 && q.pos.y - r < 26 + 0.5);
    expect(tucked.length).toBeGreaterThanOrEqual(3);
    for (const q of tucked) expect(coverRating(s, u, q.pos, 0)).toBe(2);
  });

  it("the squad stays on the side of a fence the player sent it to", () => {
    const s = game();
    const u = block(s, uidOf(s, 1, "munch-nibblers", 1), { x: 16.5, y: 22.8 }, 0.2, 0, 5); // two rows: clear of the fence
    const p = plan(planUnitMove(s, u, 0, { x: 13, y: 28 }, { allowance: 8 }));
    expectLegal(u, p);
    // Nobody is left on the far side of the fence (x 14-21, y 25.2-26) from the leader.
    for (const at of p.placements) if (at.pos.x > 13.5 && at.pos.x < 21.5) expect(at.pos.y).toBeGreaterThan(26);
  });

  it("squeezing past a building still gives a connected squad clear of it", () => {
    const s = game();
    // Three abreast, the right-hand file would walk into the barn.
    const u = block(s, uidOf(s, 1, "munch-nibblers"), { x: 2, y: 20 });
    const p = plan(planUnitMove(s, u, 0, { x: 2, y: 13 }, { allowance: 8 }));
    expectLegal(u, p);
    const r = profileOf(u).baseRadius;
    for (const at of p.placements) {
      expect(at.pos.x + r).toBeLessThanOrEqual(4 + 1e-6); // clear of the barn
      expect(dist(at.pos, p.placements[0]!.pos)).toBeLessThan(6); // arrived with the leader
    }
  });

  it("a squad going up a ramp ends together on the platform", () => {
    const s = game();
    const u = block(s, uidOf(s, 1, "munch-nibblers", 1), { x: 16.5, y: 22.8 }, 0.2, 0, 5); // two rows: clear of the fence
    const p = plan(planUnitMove(s, u, 0, { x: 18.5, y: 19.2 }, { allowance: 8 }));
    expectLegal(u, p);
    expect(p.via).toBe("ramp-a");
    for (const at of p.placements) {
      expect(at.elevation).toBe(1);
      expect(platformAt(s, at.pos)?.id).toBe("deck");
    }
  });

  it("deploying spreads the squad out inside the zone", () => {
    const s = game();
    const u = unitById(s, uidOf(s, 1, "munch-nibblers"))!;
    const p = plan(
      planUnitMove(
        s,
        u,
        0,
        { x: 17, y: 2.5 },
        { allowance: 0, teleport: true, zone: deployZones(s, u) },
      ),
    );
    expectLegal(u, p);
    for (const g of gaps(u, p)) expect(g).toBeLessThanOrEqual(LOOSE);
  });

  it("flyers and heavy units never count as in cover", () => {
    const s = game();
    const u = unitById(s, uidOf(s, 0, "mil-bertha"))!;
    expect(coverRating(s, u, { x: 9, y: 25 }, 0)).toBe(0);
  });
});

describe("chain coherency", () => {
  it('a file of models can stretch beyond 2" of the leader as long as the chain holds', () => {
    const s = game();
    s.terrain = []; // open ground, so the squad spreads into its line rather than tucking behind the fence
    const r = profileOf(unitById(s, uidOf(s, 0, "mil-grunts", 2))!).baseRadius;
    const spots = [0, 1, 2, 3].map((i) => ({ x: 18 + i * (2 * r + 0.3), y: 33 }));
    const u = placeAt(s, uidOf(s, 0, "mil-grunts", 2), spots);
    expect(inCoherency(u)).toBe(true);
    const p = plan(planUnitMove(s, u, 0, { x: 18, y: 28 }, { allowance: 6 }));
    expectLegal(u, p);
    // Not tied to the leader: the far end of the line is more than 2" from it, chained through the others.
    expect(Math.max(...p.placements.map((q) => dist(q.pos, { x: 18, y: 28 }) - 2 * r))).toBeGreaterThan(COHERENCY);
  });

  it("groups and stragglers follow the chain, not the distance to one model", () => {
    const s = game();
    const u = placeAt(s, uidOf(s, 1, "munch-nibblers"), [
      { x: 10, y: 10 },
      { x: 11.5, y: 10 },
      { x: 13, y: 10 },
      { x: 14.5, y: 10 }, // > 2" from the first model, chained through the others
      { x: 25, y: 10 },
      { x: 26, y: 10 }, // a pair cut off by casualties
    ]);
    const groups = coherencyGroups(u);
    expect(groups.map((g) => g.length)).toEqual([4, 2]);
    expect(isStraggler(u, u.models[3]!)).toBe(false);
    expect(isStraggler(u, u.models[4]!)).toBe(true);
    expect(isStraggler(u, u.models[0]!, 5)).toBe(true); // measured from the pair's side
    expect(inCoherency(u)).toBe(false);
  });

  it("every legal move across the deck area leaves the squad chained, unoverlapped and on one level", () => {
    const s = game();
    const u = block(s, uidOf(s, 1, "munch-nibblers", 1), { x: 16.5, y: 22.8 }, 0.2, 0, 5); // two rows: clear of the fence
    let legal = 0;
    for (let dx = -8; dx <= 8; dx += 2) {
      for (let dy = -8; dy <= 8; dy += 2) {
        const p = planUnitMove(s, u, 0, { x: 17 + dx, y: 23 + dy }, { allowance: 8 });
        if (typeof p === "string") continue;
        legal++;
        expectLegal(u, p);
      }
    }
    expect(legal).toBeGreaterThan(20);
  });
});

describe("charges", () => {
  it("chargers pile in around the target", () => {
    const s = game();
    const target = block(s, uidOf(s, 0, "mil-grunts", 2), { x: 24, y: 29 });
    const nib = block(s, uidOf(s, 1, "munch-nibblers", 1), { x: 20, y: 22 });
    const p = plan(planCharge(s, nib, target));
    expectLegal(nib, p);
    const rn = profileOf(nib).baseRadius;
    const rt = profileOf(target).baseRadius;
    const inReach = p.placements.filter((at) =>
      aliveModels(target).some((tm) => dist(at.pos, tm.pos) - rn - rt <= ENGAGE_RANGE + 1e-6),
    );
    expect(inReach.length).toBeGreaterThanOrEqual(5);
  });

  it("a charge resolves into base contact", () => {
    let s = game();
    s.phase = "assault";
    s.activePlayer = 1;
    const target = block(s, uidOf(s, 0, "mil-grunts", 2), { x: 24, y: 29 });
    const nib = block(s, uidOf(s, 1, "munch-nibblers", 1), { x: 20, y: 22 });
    const r = applyCommand(s, { type: "charge", uid: nib.uid, target: target.uid });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(unitsEngage(unitById(s, nib.uid)!, unitById(s, target.uid)!)).toBe(true);
  });
});

describe("casualties", () => {
  it("a straggler too far to rejoin this move catches up as far as it can", () => {
    const s = game();
    const u = placeAt(s, uidOf(s, 0, "mil-grunts", 2), [
      { x: 10, y: 30 },
      { x: 11.2, y: 30 },
      { x: 19, y: 30 }, // its neighbours died
    ]);
    const p = plan(planUnitMove(s, u, 0, { x: 5, y: 30 }, { allowance: 6 }));
    const s2 = p.placements.find((q) => q.modelId === 2)!;
    expect(dist(s2.pos, { x: 19, y: 30 })).toBeGreaterThan(7.5); // used (almost) its full move + 2"
    expect(dist(s2.pos, { x: 6.2, y: 30 })).toBeLessThan(19 - 6.2);
    // The rest moves on with the leader, chained to it.
    const r = profileOf(u).baseRadius;
    expect(dist(p.placements.find((q) => q.modelId === 1)!.pos, { x: 5, y: 30 }) - 2 * r).toBeLessThanOrEqual(COHERENCY + 1e-6);
  });

  it("a straggler within reach rejoins the squad", () => {
    const s = game();
    const u = placeAt(s, uidOf(s, 0, "mil-grunts", 2), [
      { x: 10, y: 30 },
      { x: 11.2, y: 30 },
      { x: 15.5, y: 30 },
    ]);
    expect(isStraggler(u, u.models[2]!)).toBe(true);
    const p = plan(planUnitMove(s, u, 0, { x: 8, y: 28 }, { allowance: 6 }));
    expectLegal(u, p);
    expect(Math.max(...gaps(u, p))).toBeLessThanOrEqual(LOOSE);
  });

  it("a split squad's pair cut off from the leader both catch up toward it", () => {
    const s = game();
    const u = placeAt(s, uidOf(s, 1, "munch-nibblers"), [
      { x: 6, y: 30 },
      { x: 7, y: 30 },
      { x: 24, y: 30 },
      { x: 25, y: 30 },
    ]);
    const p = plan(planUnitMove(s, u, 0, { x: 8, y: 28 }, { allowance: 8 }));
    for (const id of [2, 3]) {
      const at = p.placements.find((q) => q.modelId === id)!;
      const was = u.models[id]!.pos;
      expect(dist(at.pos, { x: 8, y: 28 })).toBeLessThan(dist(was, { x: 8, y: 28 }) - 7);
    }
  });

  it("revived models come back snug against the squad", () => {
    const s = game();
    const u = placeAt(s, uidOf(s, 1, "munch-nibblers"), [
      { x: 20, y: 28 },
      { x: 21.1, y: 28 },
    ]);
    const r = profileOf(u).baseRadius;
    const spot = reviveSpot(s, u)!;
    expect(spot).not.toBeNull();
    const nearestGap = Math.min(...aliveModels(u).map((m) => dist(m.pos, spot.pos) - 2 * r));
    expect(nearestGap).toBeGreaterThanOrEqual(-1e-6);
    expect(nearestGap).toBeLessThanOrEqual(0.5);
  });
});
