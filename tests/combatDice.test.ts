import { describe, expect, it } from "vitest";
import { evadeTarget, expectedDamage, planShooting, resolveAttack, shotConditions, type AttackPlan } from "../src/engine/combat";
import { applyCommand, createGame } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { unitById, unitsEngage } from "../src/engine/rules";
import type { GameEvent, GameState, Unit, Vec } from "../src/engine/types";

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

const unitOf = (s: GameState, owner: 0 | 1, profileId: string): Unit => {
  const u = s.units.find((x) => x.owner === owner && x.profileId === profileId);
  if (!u) throw new Error(`no ${profileId} in player ${owner}'s list`);
  return u;
};

/** Militia grunts (player 0) in base contact with Concord dancers (player 1), plus unengaged shooters on both sides. */
function melee(seed = 3) {
  const s = createGame({ factions: ["militia", "concord"], seed });
  s.terrain = []; // open ground: line of sight never gets in the way
  const grunts = place(s, unitOf(s, 0, "mil-grunts").uid, { x: 12, y: 20 });
  const gr = profileOf(grunts).baseRadius;
  const dancers = unitOf(s, 1, "con-dancers");
  place(s, dancers.uid, { x: 12, y: 20 + 2 * gr + 0.1 + gr + profileOf(dancers).baseRadius + 0.02 });
  s.phase = "assault";
  s.activePlayer = 0;
  return { s, grunts, dancers };
}

const weaponIndex = (u: Unit, name: string) => profileOf(u).weapons.findIndex((w) => w.name === name);

describe("combat dice: precision, evade, tracking", () => {
  it("precision moves missed dice into the hits", () => {
    const { s, grunts, dancers } = melee();
    const plan: AttackPlan = {
      attackers: [{ model: grunts.models[0]!, dice: 6 }],
      targets: dancers.models,
      hitOn: 6,
      damage: 1,
      ap: 0,
      precision: 2,
      evadeOn: null,
    };
    const r = resolveAttack(s, grunts, dancers, "test", plan, "shoot", []);
    const natural = r.hitRolls.filter((x) => x >= 6).length;
    expect(r.precisionMoved).toBe(Math.min(2, 6 - natural));
    expect(r.saveOn.length).toBeLessThanOrEqual(natural + r.precisionMoved!);
  });

  it("evade rolls one die per hit, and tracking cancels successful evades", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { s, grunts, dancers } = melee(seed);
      const plan: AttackPlan = {
        attackers: [{ model: grunts.models[0]!, dice: 8 }],
        targets: dancers.models,
        hitOn: 2,
        damage: 1,
        ap: 0,
        evadeOn: 3,
        tracking: 1,
      };
      const r = resolveAttack(s, grunts, dancers, "test", plan, "shoot", []);
      const hits = r.hitRolls.filter((x) => x >= 2).length;
      expect(r.evadeRolls).toHaveLength(hits);
      expect(r.evadeOn).toBe(3);
      const evaded = r.evadeRolls!.filter((x) => x >= 3).length;
      expect(r.evadesCancelled).toBe(Math.min(1, evaded));
      // Every hit that wasn't evaded goes to a save roll (until the target runs out of models).
      if (!r.unitDestroyed) expect(r.saveOn).toHaveLength(hits - evaded + r.evadesCancelled!);
    }
  });

  it("evade is conditional on the kind of attack, and buffs adjust it", () => {
    const { dancers } = melee();
    expect(profileOf(dancers).evade).toEqual({ target: 4, against: ["pointBlank", "melee"] });
    expect(evadeTarget(dancers, ["melee"])).toBe(4);
    expect(evadeTarget(dancers, ["ranged"])).toBeNull();
    expect(evadeTarget(dancers, ["ranged", "pointBlank"])).toBe(4);
    dancers.status.evadeBonus = 1;
    expect(evadeTarget(dancers, ["melee"])).toBe(3);
    dancers.status.evadeBonus = -5;
    expect(evadeTarget(dancers, ["melee"])).toBe(6);
  });

  it("expected damage accounts for evade and tracking", () => {
    const { s, grunts, dancers } = melee();
    const base: AttackPlan = { attackers: [{ model: grunts.models[0]!, dice: 6 }], targets: dancers.models, hitOn: 4, damage: 1, ap: 0, evadeOn: null };
    const noEvade = expectedDamage(s, grunts, dancers, base, false);
    const evade = expectedDamage(s, grunts, dancers, { ...base, evadeOn: 4 }, false);
    const tracked = expectedDamage(s, grunts, dancers, { ...base, evadeOn: 4, tracking: 1 }, false);
    const precise = expectedDamage(s, grunts, dancers, { ...base, precision: 1 }, false);
    expect(evade).toBeLessThan(noEvade);
    expect(tracked).toBeGreaterThan(evade);
    expect(precise).toBeGreaterThan(noEvade);
  });
});

describe("engagement and shooting", () => {
  it("the setup really is engaged", () => {
    const { grunts, dancers } = melee();
    expect(unitsEngage(grunts, dancers)).toBe(true);
  });

  it("unengaged units can't shoot into a melee unless the weapon has precision", () => {
    const { s, dancers } = melee();
    const bertha = place(s, unitOf(s, 0, "mil-bertha").uid, { x: 4, y: 8 });
    const squinter = place(s, unitOf(s, 0, "mil-squinter").uid, { x: 20, y: 8 });
    const cannon = profileOf(bertha).weapons[weaponIndex(bertha, "Thumper Cannon")]!;
    expect(planShooting(s, bertha, dancers, cannon)).toMatch(/melee/);
    const rifle = profileOf(squinter).weapons[weaponIndex(squinter, "Varmint Rifle")]!;
    expect(rifle.precision).toBe(1);
    const sq = planShooting(s, squinter, dancers, rifle);
    expect(typeof sq === "string" ? sq : "ok").toBe("ok");
    // A precision buff from an ability or support works too.
    bertha.status.precisionBonus = 1;
    expect(typeof planShooting(s, bertha, dancers, cannon)).not.toBe("string");
  });

  it("engaged units can only shoot the unit they're fighting, and it gets its point-blank evade", () => {
    const { s, grunts, dancers } = melee();
    const guard = place(s, unitOf(s, 1, "con-guard").uid, { x: 4, y: 30 });
    const rifle = profileOf(grunts).weapons[weaponIndex(grunts, "Rivet Rifle")]!;
    expect(planShooting(s, grunts, guard, rifle)).toMatch(/fighting/);
    const plan = planShooting(s, grunts, dancers, rifle);
    if (typeof plan === "string") throw new Error(plan);
    expect(plan.evadeOn).toBe(4);
    expect(shotConditions(s, grunts, dancers, rifle, "shoot")).toEqual(["ranged", "pointBlank"]);
    // The command path agrees: engaged units are eligible in the assault phase and the shot resolves.
    const r = applyCommand(s, { type: "shoot", uid: grunts.uid, target: dancers.uid, weapon: weaponIndex(grunts, "Rivet Rifle") });
    if (!r.ok) throw new Error(r.error);
    const atk = r.events.find((e): e is Extract<GameEvent, { type: "attack" }> => e.type === "attack")!;
    const hits = atk.report.hitRolls.filter((x) => x >= atk.report.hitOn).length;
    if (hits) expect(atk.report.evadeOn).toBe(4);
  });

  it("point-blank pistol shots don't allow evade", () => {
    const s = createGame({ factions: ["concord", "munch"], seed: 4 });
    const dancers = place(s, unitOf(s, 0, "con-dancers").uid, { x: 12, y: 20 });
    const nib = unitOf(s, 1, "munch-nibblers");
    const dr = profileOf(dancers).baseRadius;
    place(s, nib.uid, { x: 12, y: 20 + dr + profileOf(nib).baseRadius + 0.02 });
    expect(unitsEngage(dancers, nib)).toBe(true);
    const darts = profileOf(dancers).weapons[weaponIndex(dancers, "Glint Darts")]!;
    expect(darts.traits).toContain("pistol");
    const plan = planShooting(s, dancers, nib, darts);
    if (typeof plan === "string") throw new Error(plan);
    expect(plan.evadeOn).toBeNull();
    // From range, blasts at the swarm can still be dodged.
    expect(evadeTarget(nib, ["ranged", "blast"])).toBe(4);
  });
});
