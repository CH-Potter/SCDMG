import { describe, expect, it } from "vitest";
import { applyCommand, createGame } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { aliveModels, isEngaged, unitGap, unitsEngage } from "../src/engine/rules";
import { allPlaced, checkPlacement, planRoute } from "../src/engine/terrain";
import type { GameEvent, GameState, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

function place(u: Unit, at: Vec, elevation: 0 | 2 = 0): Unit {
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.1), y: at.y + Math.floor(i / 3) * (2 * r + 0.1) };
    m.elevation = elevation;
  });
  return u;
}

function setup(seed = 3): { s: GameState; grunts: Unit; crows: Unit; wasps: Unit } {
  const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed, missionId: "brawl" });
  s.terrain = [];
  const munch = (id: string) => s.units.find((u) => u.owner === 1 && u.profileId === id) ?? addUnit(s, id);
  const grunts = place(s.units.find((u) => u.owner === 0 && u.profileId === "mil-grunts")!, { x: 10, y: 10 });
  const crows = place(munch("munch-flapjaw"), { x: 10, y: 18 }, 2);
  const wasps = place(munch("munch-buzz"), { x: 22, y: 10 }, 2);
  Object.assign(s, { phase: "assault", activePlayer: 1, orderChoice: null });
  return { s, grunts, crows, wasps };
}

function addUnit(s: GameState, profileId: string): Unit {
  const p = profileOf({ profileId, upgrades: [] } as unknown as Unit);
  const u = structuredClone(s.units.find((x) => x.owner === 1)!);
  Object.assign(u, {
    uid: `test-${profileId}`,
    profileId,
    upgrades: [],
    destroyed: false,
    models: Array.from({ length: p.models }, (_, id) => ({ id, pos: { x: 0, y: 0 }, elevation: 2, hp: p.hp, shield: p.shield, alive: true })),
  });
  u.status = { ...u.status, acted: false, charged: false, moved: false };
  u.abilityUses = {};
  s.units.push(u);
  return u;
}

describe("flyers never get stuck in a melee", () => {
  it("a flyer next to a ground unit isn't engaged with it", () => {
    const { s, grunts, crows } = setup();
    place(crows, { x: 10, y: 11.6 }, 2);
    expect(unitGap(crows, grunts)).toBeLessThan(1);
    expect(unitsEngage(crows, grunts)).toBe(false);
    expect(isEngaged(s, grunts)).toBe(false);
  });

  it("ground units can't charge flyers", () => {
    const { s, grunts, crows } = setup();
    Object.assign(s, { activePlayer: 0 });
    const r = applyCommand(s, { type: "charge", uid: grunts.uid, target: crows.uid });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/flyer/i);
  });

  it("the Steel-Jaw Crows dive: impact dice, then neither side is engaged", () => {
    const { s, grunts, crows } = setup();
    const r = applyCommand(s, { type: "charge", uid: crows.uid, target: grunts.uid });
    if (!r.ok) throw new Error(r.error);
    const dive = r.events.find((e): e is Extract<GameEvent, { type: "attack" }> => e.type === "attack" && e.report.uid === crows.uid);
    expect(dive?.report.weapon).toBe("Dive");
    expect(dive?.report.hitRolls.length).toBeGreaterThanOrEqual(profileOf(crows).impact!.dice);
    const after = r.state;
    const c = after.units.find((u) => u.uid === crows.uid)!;
    const g = after.units.find((u) => u.uid === grunts.uid)!;
    expect(unitGap(c, g)).toBeLessThanOrEqual(1 + 1e-6);
    expect(unitsEngage(c, g)).toBe(false);
    expect(isEngaged(after, g)).toBe(false);
  });

  it("flyers have no melee weapons: they fight from range or with a dive or suicide attack", () => {
    const { crows, wasps } = setup();
    for (const u of [crows, wasps]) expect(profileOf(u).weapons.filter((w) => w.melee)).toEqual([]);
  });
});

describe("Bomb Wasps: Bombs Away!", () => {
  it("every wasp bombs the target, then the swarm is gone and the enemy scores nothing for it", () => {
    const { s, grunts, wasps } = setup(5);
    const n = aliveModels(wasps).length;
    const vp0 = s.players[0].vp;
    const r = applyCommand(s, { type: "ability", uid: wasps.uid, ability: "bombs-away", target: grunts.uid });
    if (!r.ok) throw new Error(r.error);
    const bomb = r.events.find((e): e is Extract<GameEvent, { type: "attack" }> => e.type === "attack" && e.report.uid === wasps.uid);
    expect(bomb?.report.hitRolls).toHaveLength(n);
    const w = r.state.units.find((u) => u.uid === wasps.uid)!;
    expect(w.destroyed).toBe(true);
    expect(r.state.players[0].vp).toBe(vp0);
  });

  it("only reaches 10\"", () => {
    const { s, grunts, wasps } = setup();
    place(wasps, { x: 30, y: 30 }, 2);
    const r = applyCommand(s, { type: "ability", uid: wasps.uid, ability: "bombs-away", target: grunts.uid });
    expect(r.ok).toBe(false);
  });
});

describe("ground units and flyer bases", () => {
  it("can pass under a flyer but not stop on its base", () => {
    const { s, grunts, crows } = setup();
    const cm = aliveModels(crows)[0]!;
    const others = allPlaced(s).filter((p) => p.uid !== grunts.uid);
    expect(checkPlacement(s, grunts, cm.pos, 0, others)).toMatch(/under a flyer/);
    // A straight path that runs under the crows is fine.
    const gm = aliveModels(grunts)[0]!;
    const beyond = { x: cm.pos.x, y: cm.pos.y + 3 };
    const route = planRoute(s, grunts, { x: cm.pos.x, y: gm.pos.y }, 0, beyond);
    expect(typeof route).not.toBe("string");
  });
});
