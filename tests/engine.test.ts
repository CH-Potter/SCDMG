import { describe, expect, it } from "vitest";
import { playAiTurn } from "../src/engine/ai";
import { planMelee, planShooting } from "../src/engine/combat";
import { FACTIONS } from "../src/engine/data/factions";
import { COHERENCY, planUnitMove } from "../src/engine/formation";
import { applyCommand, createGame, type GameSetup } from "../src/engine/game";
import { dist, pointInPolygon, rect, segmentsIntersect } from "../src/engine/geometry";
import { profileOf } from "../src/engine/profile";
import { aliveModels, eligibleUnits, isEngaged, presenceController, supplyUsed, unitById } from "../src/engine/rules";
import { lineOfSight, planRoute } from "../src/engine/terrain";
import type { Command, Elevation, FactionId, GameState, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

const ok = (r: ReturnType<typeof applyCommand>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

/** Put a reserve unit on the board in a tight cluster around `at` (test helper, bypasses rules). */
function place(s: GameState, uid: string, at: Vec, elevation: Elevation = 0): Unit {
  const u = unitById(s, uid)!;
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.1), y: at.y + Math.floor(i / 3) * (2 * r + 0.1) };
    m.elevation = u.models.length && profileOf(u).keywords.includes("flying") ? 2 : elevation;
  });
  return u;
}

const uidOf = (s: GameState, owner: 0 | 1, profileId: string, nth = 0): string =>
  s.units.filter((u) => u.owner === owner && u.profileId === profileId)[nth]!.uid;

function game(setup: Partial<GameSetup> = {}): GameState {
  const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 7, ...setup });
  s.initiative = 0;
  s.activePlayer = 0;
  return s;
}

describe("geometry", () => {
  it("detects crossing segments and points in polygons", () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBe(false);
    expect(pointInPolygon({ x: 1, y: 1 }, rect(0, 0, 2, 2))).toBe(true);
  });
});

describe("elevation", () => {
  it("platforms block sight between ground models but not to models on top", () => {
    const s = game();
    // Silo deck spans x 13-23, y 15-21.
    expect(lineOfSight(s, { x: 18, y: 12 }, 0, { x: 18, y: 24 }, 0)).toBe(false);
    expect(lineOfSight(s, { x: 18, y: 12 }, 0, { x: 18, y: 18 }, 1)).toBe(true);
    expect(lineOfSight(s, { x: 18, y: 12 }, 2, { x: 18, y: 24 }, 0)).toBe(true);
  });

  it("ground units must use a ramp or ladder to get onto a platform", () => {
    const s = game();
    const grunts = place(s, uidOf(s, 0, "mil-grunts", 2), { x: 18, y: 23.8 });
    const route = planRoute(s, grunts, { x: 18, y: 23.8 }, 0, { x: 15, y: 19.5 });
    expect(typeof route).toBe("object");
    if (typeof route === "object") expect(route.via).toBe("ramp-a");
    // Straight up the cliff from the side isn't possible without a ladder nearby; Bertha can't climb ladders.
    const bertha = place(s, uidOf(s, 0, "mil-bertha"), { x: 9, y: 18 });
    const r2 = planRoute(s, bertha, { x: 9, y: 18 }, 0, { x: 15, y: 18 });
    if (typeof r2 === "object") expect(r2.via).not.toMatch(/ladder/);
  });

  it("jump jets hop straight up without a ramp", () => {
    const s = game();
    const jumpers = place(s, uidOf(s, 0, "mil-grunts", 1), { x: 18, y: 23 });
    const route = planRoute(s, jumpers, { x: 18, y: 23 }, 0, { x: 16, y: 19 });
    expect(typeof route).toBe("object");
    if (typeof route === "object") expect(route.via).toBeUndefined();
  });

  it("an enemy standing on the ramp blocks it", () => {
    const s = game();
    const grunts = place(s, uidOf(s, 0, "mil-grunts", 2), { x: 18, y: 26 });
    const blocker = unitById(s, uidOf(s, 1, "munch-nibblers"))!;
    blocker.onBoard = true;
    blocker.models.forEach((m, i) => {
      m.alive = i === 0;
      m.pos = { x: 18, y: 21.6 };
    });
    const r = planRoute(s, grunts, { x: 18, y: 26 }, 0, { x: 18, y: 19 });
    expect(typeof r === "string" || r.via !== "ramp-a").toBe(true);
  });
});

describe("pathfinding", () => {
  it("routes around a building instead of failing", () => {
    const s = game();
    const g = place(s, uidOf(s, 0, "mil-grunts", 2), { x: 6.5, y: 18.5 });
    // The barn (x 4-9, y 11-16) sits between here and the target.
    const r = planRoute(s, g, { x: 6.5, y: 18.5 }, 0, { x: 6.5, y: 8.5 });
    expect(typeof r).toBe("object");
    if (typeof r !== "object") return;
    expect(r.legs.length).toBeGreaterThan(1);
    expect(r.length).toBeGreaterThan(10);
    expect(r.length).toBeLessThan(16);
  });

  it("respects the move allowance", () => {
    const s = game();
    const g = place(s, uidOf(s, 0, "mil-grunts", 2), { x: 6.5, y: 18.5 });
    const plan = planUnitMove(s, g, 0, { x: 6.5, y: 8.5 }, { allowance: 6 });
    expect(typeof plan).toBe("string");
  });

  it("walks around enemy models", () => {
    const s = game();
    const g = place(s, uidOf(s, 0, "mil-grunts", 2), { x: 20, y: 28 });
    const e = unitById(s, uidOf(s, 1, "munch-mama"))!;
    e.onBoard = true;
    e.models[0]!.pos = { x: 20, y: 25 };
    const r = planRoute(s, g, { x: 20, y: 28 }, 0, { x: 20, y: 22 });
    expect(typeof r).toBe("object");
    if (typeof r === "object") expect(r.legs.length).toBeGreaterThan(1);
  });
});

describe("multi-model movement", () => {
  it("followers end in chain coherency (each within 2\" of a squad mate)", () => {
    const s = game();
    const u = place(s, uidOf(s, 0, "mil-grunts", 2), { x: 26, y: 33 });
    const plan = planUnitMove(s, u, 0, { x: 26, y: 28 }, { allowance: 6 });
    expect(typeof plan).toBe("object");
    if (typeof plan !== "object") return;
    const r = profileOf(u).baseRadius;
    for (const p of plan.placements) {
      const nearest = Math.min(...plan.placements.filter((q) => q !== p).map((q) => dist(p.pos, q.pos) - 2 * r));
      expect(nearest).toBeLessThanOrEqual(COHERENCY + 1e-6);
    }
  });
});

describe("deployment, supply and phases", () => {
  it("deploys into the spawn zone, spending resources and supply", () => {
    let s = game();
    const uid = uidOf(s, 0, "mil-grunts");
    const bad = applyCommand(s, { type: "deploy", uid, to: { x: 18, y: 18 } });
    expect(bad.ok).toBe(false);
    s = ok(applyCommand(s, { type: "deploy", uid, to: { x: 10, y: 33.5 } }));
    expect(s.players[0].resources).toBe(10 - 4);
    expect(supplyUsed(s, 0)).toBe(2);
    expect(s.activePlayer).toBe(1);
  });

  it("enforces the supply cap", () => {
    const s = game();
    s.players[0].supplyCap = 2;
    s.players[0].resources = 99;
    const s2 = ok(applyCommand(s, { type: "deploy", uid: uidOf(s, 0, "mil-grunts"), to: { x: 10, y: 33.5 } }));
    s2.activePlayer = 0;
    const r = applyCommand(s2, { type: "deploy", uid: uidOf(s, 0, "mil-medic"), to: { x: 20, y: 33.5 } });
    expect(r.ok).toBe(false);
  });

  it("moves through movement, assault and combat into the next round", () => {
    let s = game();
    s = ok(applyCommand(s, { type: "pass", player: 0 }));
    s = ok(applyCommand(s, { type: "pass", player: 1 }));
    expect(s.round).toBe(2);
    expect(s.phase).toBe("movement");
    expect(s.players[0].resources).toBe(15);
    expect(s.players[0].supplyCap).toBe(8);
  });
});

describe("combat and keywords", () => {
  it("ground melee can't hit flyers and ground-only guns can't shoot them", () => {
    // Explicit lists, so the test doesn't depend on which flyers the starter rosters carry.
    const s = game({ lists: [[{ profileId: "mil-bertha", upgrades: [] }], [{ profileId: "munch-buzz", upgrades: [] }]] });
    const bertha = place(s, uidOf(s, 0, "mil-bertha"), { x: 10, y: 28 });
    const buzz = place(s, uidOf(s, 1, "munch-buzz"), { x: 12.8, y: 28 });
    expect(planMelee(bertha, buzz, profileOf(bertha).weapons[1]!)).toMatch(/flyers/);
    expect(planShooting(s, bertha, buzz, profileOf(bertha).weapons[0]!)).toMatch(/flyers/);
  });

  it("only models with line of sight contribute dice", () => {
    const s = game();
    const grunts = place(s, uidOf(s, 0, "mil-grunts", 2), { x: 2, y: 20 });
    // Spread: two models behind the barn (x 4-9, y 11-16), two in the open.
    grunts.models[0]!.pos = { x: 8.2, y: 17 };
    grunts.models[1]!.pos = { x: 9.5, y: 17.5 };
    grunts.models[2]!.pos = { x: 1.5, y: 13.5 };
    grunts.models[3]!.pos = { x: 1.5, y: 12.3 };
    // Any extra squad members stay out of sight too (squad size is a balance knob).
    for (const m of grunts.models.slice(4)) m.pos = { x: 1.5, y: 11.1 - (m.id - 4) * 1.2 };
    const target = place(s, uidOf(s, 1, "munch-spitter"), { x: 11, y: 13 });
    const plan = planShooting(s, grunts, target, profileOf(grunts).weapons[0]!);
    expect(typeof plan).toBe("object");
    if (typeof plan === "object") expect(plan.attackers.length).toBe(2);
  });

  it("charges into base contact, then the combat phase resolves melee", () => {
    let s = game();
    const nib = place(s, uidOf(s, 1, "munch-nibblers"), { x: 10, y: 24 });
    place(s, uidOf(s, 0, "mil-grunts", 2), { x: 10, y: 29 });
    s.phase = "assault";
    s.activePlayer = 1;
    s = ok(applyCommand(s, { type: "charge", uid: nib.uid, target: uidOf(s, 0, "mil-grunts", 2) }));
    expect(isEngaged(s, unitById(s, nib.uid)!)).toBe(true);
    // The charged grunts may return point-blank fire at the unit they're fighting (and only that unit).
    const grunts = uidOf(s, 0, "mil-grunts", 2);
    expect(s.phase).toBe("assault");
    expect(eligibleUnits(s, 0).map((u) => u.uid)).toContain(grunts);
    s = ok(applyCommand(s, { type: "shoot", uid: grunts, target: nib.uid, weapon: 0 }));
    // With nothing left to do in the assault phase, it rolls on to combat, chargers first.
    while (s.phase === "assault") s = ok(applyCommand(s, { type: "pass", player: s.activePlayer }));
    expect(s.phase).toBe("combat");
    expect(eligibleUnits(s, s.activePlayer).every((u) => u.status.charged)).toBe(true);
  });

  it("the Munch's spit leaves its target slowed", () => {
    const s = game();
    const spit = place(s, uidOf(s, 1, "munch-spitter"), { x: 10, y: 20 });
    const grunts = place(s, uidOf(s, 0, "mil-grunts", 2), { x: 10, y: 28 });
    let cur: GameState = s;
    cur.phase = "assault";
    cur.activePlayer = 1;
    for (let seed = 1; seed < 40; seed++) {
      cur = structuredClone(s);
      cur.rng = seed;
      cur = ok(applyCommand(cur, { type: "shoot", uid: spit.uid, target: grunts.uid, weapon: 0 }));
      const g = unitById(cur, grunts.uid)!;
      if (g.status.hurt) {
        expect(g.status.slowedRounds).toBe(2);
        return;
      }
    }
    throw new Error("Spitter never hit in 40 seeds");
  });
});

describe("missions", () => {
  it("scores held neutral objectives at the end of the round", () => {
    let s = game({ missionId: "brawl" });
    place(s, uidOf(s, 0, "mil-grunts", 2), { x: 4.5, y: 20.5 });
    expect(presenceController(s, s.objectives[1]!)).toBe(0);
    while (s.round === 1) s = ok(applyCommand(s, { type: "pass", player: s.activePlayer }));
    expect(s.players[0].vp).toBeGreaterThanOrEqual(1);
  });

  it("grabs the enemy snack and scores by bringing it home", () => {
    let s = game({ missionId: "flag" });
    const enemyFlag = s.flags.find((f) => f.team === 1)!;
    const g = place(s, uidOf(s, 0, "mil-grunts", 2), { x: enemyFlag.home.x - 3, y: enemyFlag.home.y + 1 });
    s = ok(applyCommand(s, { type: "move", uid: g.uid, leader: 0, to: { x: enemyFlag.home.x - 1.2, y: enemyFlag.home.y + 0.4 } }));
    expect(s.flags.find((f) => f.team === 1)!.carrier).toBe(g.uid);
  });
});

describe("AI", () => {
  const ids = Object.keys(FACTIONS) as FactionId[];
  const matchups: [FactionId, FactionId, string, string][] = [
    [ids[0]!, ids[1]!, "hold", "dustbowl"],
    [ids[1]!, ids[2]!, "grab", "mesa"],
    [ids[2]!, ids[0]!, "brawl", "refinery"],
    [ids[1]!, ids[0]!, "flag", "dustbowl"],
  ];
  for (const [a, b, missionId, mapId] of matchups) {
    it(`plays a full legal game: ${a} vs ${b}, ${missionId} on ${mapId}`, () => {
      let s = createGame({ factions: [a, b], seed: 99, missionId, mapId });
      let guard = 0;
      while (!s.over && guard++ < 600) s = playAiTurn(s);
      expect(s.over).toBe(true);
      expect(s.units.some((u) => u.onBoard || u.destroyed)).toBe(true);
    }, 120_000);
  }

  it("never returns an illegal command mid-game", () => {
    let s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["concord", "munch"], seed: 5 });
    for (let i = 0; i < 40 && !s.over; i++) {
      s = playAiTurn(s);
      for (const u of s.units.filter((x) => x.onBoard)) expect(aliveModels(u).length).toBeGreaterThan(0);
    }
  }, 60_000);
});

// Keep the Command type referenced for editors.
export type _C = Command;
