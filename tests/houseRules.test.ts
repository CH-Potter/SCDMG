import { describe, expect, it } from "vitest";
import { playAiTurn } from "../src/engine/ai";
import { breachFor, expectedBreach, expectedDamage, nerveTest, planMelee, planShooting, resolveAttack, scatterShell, strayTarget } from "../src/engine/combat";
import { applyCommand, createGame, planCloseRanks, type GameSetup } from "../src/engine/game";
import { CLASSIC_RULES, cleanRules, HOUSE_RULES, rulesOf, rulesSummary, STANDARD_RULES, type HouseRules } from "../src/engine/houseRules";
import { planUnitMove } from "../src/engine/formation";
import { rect } from "../src/engine/geometry";
import { profileOf } from "../src/engine/profile";
import { eligibleUnits, modelsEngage, unitById } from "../src/engine/rules";
import type { GameEvent, GameState, ListEntry, Unit, Vec } from "../src/engine/types";

function place(_s: GameState, u: Unit, at: Vec): Unit {
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.1), y: at.y + Math.floor(i / 3) * (2 * r + 0.1) };
    m.elevation = 0;
  });
  return u;
}

const LISTS: [ListEntry[], ListEntry[]] = [
  [
    { profileId: "mil-bertha", upgrades: [] },
    { profileId: "mil-grunts", upgrades: [] },
  ],
  [
    { profileId: "con-guard", upgrades: [] },
    { profileId: "con-dancers", upgrades: [] },
  ],
];

/** Bertha and grunts (player 0) facing Phase Guard and dancers (player 1) on open ground, in the assault phase. */
function battle(rules: Partial<HouseRules> = {}, seed = 3) {
  const setup: GameSetup = { factions: ["militia", "concord"], lists: LISTS, seed, rules };
  const s = createGame(setup);
  s.terrain = [];
  const bertha = place(s, s.units.find((u) => u.profileId === "mil-bertha")!, { x: 10, y: 10 });
  const grunts = place(s, s.units.find((u) => u.profileId === "mil-grunts")!, { x: 20, y: 10 });
  const guard = place(s, s.units.find((u) => u.profileId === "con-guard")!, { x: 10, y: 24 });
  const dancers = place(s, s.units.find((u) => u.profileId === "con-dancers")!, { x: 20, y: 24 });
  s.phase = "assault";
  s.activePlayer = 0;
  s.orderChoice = null;
  return { s, bertha, grunts, guard, dancers };
}

const weapon = (u: Unit, name: string) => profileOf(u).weapons.findIndex((w) => w.name === name);

describe("house rules: setup", () => {
  it("a game without rules plays standard, and partial rules fill in the rest", () => {
    expect(rulesOf(createGame({ factions: ["militia", "munch"], seed: 1 }))).toEqual(STANDARD_RULES);
    expect(STANDARD_RULES.morale).toBe(false);
    expect(STANDARD_RULES.rolledCharges).toBe(true);
    const s = createGame({ factions: ["militia", "munch"], seed: 1, rules: { evade: false, overwatch: true } });
    expect(rulesOf(s)).toEqual({ ...STANDARD_RULES, evade: false, overwatch: true });
    expect(rulesSummary(rulesOf(s))).toEqual(["Evade rolls off", "Overwatch"]);
  });

  it("random order and whole-army turns can't both be on", () => {
    expect(cleanRules({ randomOrder: true, wholeArmy: true })).toMatchObject({ randomOrder: false, wholeArmy: true });
  });

  it("cleanRules keeps only known switches with true/false values", () => {
    expect(cleanRules({ morale: true, evade: "no", bogus: true, breach: true })).toEqual({ ...STANDARD_RULES, morale: true, breach: true });
    expect(cleanRules(null)).toEqual(STANDARD_RULES);
    expect(HOUSE_RULES.map((r) => r.id).sort()).toEqual(Object.keys(STANDARD_RULES).sort());
  });
});

describe("house rules: switching core mechanics off", () => {
  it("morale off: no nerve tests, no Rally", () => {
    const { s, grunts } = battle({ morale: false });
    const events: GameEvent[] = [];
    expect(nerveTest(s, grunts, events, 12)).toBe(false);
    expect(events).toEqual([]);
    grunts.status.shaken = true;
    const r = applyCommand(s, { type: "rally", player: 0, target: grunts.uid });
    expect(r.ok).toBe(false);
  });

  it("evade off: nimble units get no evade roll", () => {
    const on = battle();
    const off = battle({ evade: false });
    for (const b of [on, off]) {
      const r = profileOf(b.grunts).baseRadius + profileOf(b.dancers).baseRadius;
      place(b.s, b.grunts, { x: b.dancers.models[0]!.pos.x, y: b.dancers.models[0]!.pos.y - r - 0.05 });
    }
    const plan = (b: ReturnType<typeof battle>) => planMelee(b.grunts, b.dancers, profileOf(b.grunts).weapons.find((w) => w.melee)!, rulesOf(b.s));
    expect(typeof plan(on)).not.toBe("string");
    expect((plan(on) as { evadeOn: number | null }).evadeOn).toEqual(expect.any(Number));
    expect((plan(off) as { evadeOn: number | null }).evadeOn).toBeNull();
  });

  it("strays off: shooting into a melee never hits your own side", () => {
    const { s, grunts, dancers, bertha } = battle({ strays: false });
    // Put the grunts in base contact with the dancers: Bertha shooting the dancers would normally risk them.
    const r = profileOf(grunts).baseRadius + profileOf(dancers).baseRadius;
    place(s, grunts, { x: dancers.models[0]!.pos.x, y: dancers.models[0]!.pos.y - r - 0.05 });
    const w = profileOf(bertha).weapons.find((x) => !x.melee)!;
    expect(strayTarget(s, bertha, dancers, w)).toBeNull();
  });

  it("scatter off: shells land where they're aimed, without a roll", () => {
    const { s, bertha } = battle({ scatter: false });
    const events: GameEvent[] = [];
    const rng = s.rng;
    expect(scatterShell(s, bertha, "Spud", { x: 5, y: 5 }, 6, events)).toEqual({ x: 5, y: 5 });
    expect(events).toEqual([]);
    expect(s.rng).toBe(rng);
  });

  it("difficult terrain off: area cover costs normal movement", () => {
    const { s, grunts } = battle({ difficultTerrain: false });
    s.terrain = [{ id: "scrub", kind: "cover", level: 0, poly: rect(18, 8, 8, 8) }];
    const leader = grunts.models[0]!;
    const plan = planUnitMove(s, grunts, leader.id, { x: leader.pos.x + 5.5, y: leader.pos.y }, { allowance: 6 });
    expect(typeof plan).not.toBe("string");
  });

  it("impact off: a ground charge rolls no impact, but a flyer's dive still strikes", () => {
    const s = createGame({ factions: ["munch", "militia"], seed: 2, rules: { impact: false } });
    s.terrain = [];
    s.orderChoice = null;
    const nib = place(s, s.units.find((u) => u.owner === 0 && profileOf(u).impact && !profileOf(u).keywords.includes("flying"))!, { x: 10, y: 10 });
    const foe = place(s, s.units.find((u) => u.owner === 1 && !profileOf(u).keywords.includes("flying") && !profileOf(u).structure)!, { x: 10, y: 15 });
    s.phase = "assault";
    s.activePlayer = 0;
    const r = applyCommand(s, { type: "charge", uid: nib.uid, target: foe.uid });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.events.some((e) => e.type === "attack" && e.report.kind === "impact")).toBe(false);
  });
});

describe("house rules: breach dice", () => {
  it("turn a keyword bonus into a breach die instead of extra dice", () => {
    const { s, bertha, guard } = battle({ breach: true });
    const thumper = profileOf(bertha).weapons[weapon(bertha, "Thumper Cannon")]!;
    expect(breachFor(thumper, guard)).toEqual({ die: 3, vs: "armoured" });
    const plan = planShooting(s, bertha, guard, thumper);
    if (typeof plan === "string") throw new Error(plan);
    expect(plan.breach).toEqual({ die: 3, vs: "armoured" });
    const std = battle();
    const stdPlan = planShooting(std.s, std.bertha, std.guard, thumper);
    if (typeof stdPlan === "string") throw new Error(stdPlan);
    expect(stdPlan.breach).toBeUndefined();
    expect(stdPlan.attackers[0]!.dice).toBe(plan.attackers[0]!.dice + 1); // breach replaces the bonus die
  });

  it("skip the save for that many hits, never more than hit", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { s, grunts, guard } = battle({ breach: true }, seed);
      const plan = {
        attackers: [{ model: grunts.models[0]!, dice: 6 }],
        targets: guard.models,
        hitOn: 4,
        damage: 1,
        ap: 0,
        evadeOn: null,
        breach: { die: 6 as const, vs: "armoured" },
      };
      const r = resolveAttack(s, grunts, guard, "test", plan, "shoot", []);
      const hits = r.hitRolls.filter((x) => x >= 4).length;
      if (!hits) {
        expect(r.breach).toBeUndefined();
        continue;
      }
      expect(r.breach!.roll).toBeGreaterThanOrEqual(1);
      expect(r.breach!.roll).toBeLessThanOrEqual(6);
      expect(r.breach!.skipped).toBe(Math.min(r.breach!.roll, hits));
      // The skipped hits are logged with no save (until the unit dies).
      const noSave = r.saveOn.filter((x) => x === null).length;
      expect(noSave).toBeLessThanOrEqual(r.breach!.skipped);
    }
  });

  it("count in the expected damage", () => {
    expect(expectedBreach(3, 10)).toBe(2);
    expect(expectedBreach(6, 10)).toBe(3.5);
    expect(expectedBreach(6, 2)).toBeCloseTo((1 + 2 * 5) / 6);
    const on = battle({ breach: true });
    const off = battle();
    const p = (b: ReturnType<typeof battle>) => {
      const w = profileOf(b.grunts).weapons.find((x) => !x.melee)!;
      const plan = planShooting(b.s, b.grunts, b.guard, w);
      if (typeof plan === "string") throw new Error(plan);
      return { ...plan, breach: { die: 6 as const, vs: "armoured" } };
    };
    expect(expectedDamage(on.s, on.grunts, on.guard, p(on), false)).toBeGreaterThan(expectedDamage(off.s, off.grunts, off.guard, { ...p(off), breach: undefined }, false));
  });
});

describe("house rules: charges", () => {
  /** Grunts charging the Phase Guard from `gap` inches away. */
  function chargeFrom(gap: number, rules: Partial<HouseRules>, seed = 3) {
    const b = battle(rules, seed);
    const r = profileOf(b.grunts).baseRadius + profileOf(b.guard).baseRadius;
    place(b.s, b.guard, { x: 20, y: 10 + r + gap + 2 * profileOf(b.grunts).baseRadius + 0.1 });
    return b;
  }

  it("rolled charges: declared within 12\", then the 2d6 decides", () => {
    let made = 0;
    let failed = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { s, grunts, guard } = chargeFrom(8, { rolledCharges: true }, seed);
      const before = grunts.models.map((m) => m.pos);
      const r = applyCommand(s, { type: "charge", uid: grunts.uid, target: guard.uid });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const roll = r.events.find((e) => e.type === "chargeRoll");
      expect(roll).toBeDefined();
      if (roll?.type !== "chargeRoll") continue;
      const g = unitById(r.state, grunts.uid)!;
      expect(g.status.acted).toBe(true);
      if (roll.made) {
        made++;
        expect(roll.roll[0] + roll.roll[1]).toBeGreaterThanOrEqual(roll.need);
        expect(g.status.charged).toBe(true);
      } else {
        failed++;
        expect(roll.roll[0] + roll.roll[1]).toBeLessThan(roll.need);
        expect(g.models.map((m) => m.pos)).toEqual(before);
      }
    }
    expect(made + failed).toBe(10);
  });

  it("rolled charges: out of reach past 12\"", () => {
    const { s, grunts, guard } = chargeFrom(14, { rolledCharges: true });
    const r = applyCommand(s, { type: "charge", uid: grunts.uid, target: guard.uid });
    expect(r.ok).toBe(false);
  });

  it("overwatch: the charged unit fires first, hitting only on 6s", () => {
    const { s, grunts, guard } = chargeFrom(3, { overwatch: true });
    const r = applyCommand(s, { type: "charge", uid: grunts.uid, target: guard.uid });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ow = r.events.find((e) => e.type === "attack" && e.report.kind === "overwatch");
    expect(ow?.type === "attack" && ow.report.uid).toBe(guard.uid);
    expect(ow?.type === "attack" && ow.report.hitOn).toBe(6);
  });
});

describe("house rules: melee", () => {
  /** Grunts (7 models in a 3-wide block) with their front row in base contact with the Phase Guard. */
  function melee(rules: Partial<HouseRules> = {}) {
    const b = battle(rules);
    const gr = profileOf(b.grunts).baseRadius;
    const r = gr + profileOf(b.guard).baseRadius;
    // Guard in a row; grunts' front row (models 0-2) just in contact, the rest behind.
    b.guard.models.forEach((m, i) => (m.pos = { x: 20 + i * (2 * profileOf(b.guard).baseRadius + 0.1), y: 10 }));
    b.grunts.models.forEach((m, i) => (m.pos = { x: 20 + (i % 3) * (2 * gr + 0.1), y: 10 + r + 0.3 + Math.floor(i / 3) * (2 * gr + 0.1) }));
    b.s.phase = "combat";
    return b;
  }

  it("supporting rank: models behind a squad-mate in contact fight too", () => {
    const off = melee({ supportingRank: false, closeRanks: false });
    const on = melee({ supportingRank: true, closeRanks: false });
    const w = profileOf(off.grunts).weapons.find((x) => x.melee)!;
    const a = planMelee(off.grunts, off.guard, w, rulesOf(off.s));
    const b = planMelee(on.grunts, on.guard, w, rulesOf(on.s));
    if (typeof a === "string" || typeof b === "string") throw new Error("no plan");
    expect(b.attackers.length).toBeGreaterThan(a.attackers.length);
  });

  it("close ranks: models step up to 3\" into contact (or behind a squad-mate) before fighting", () => {
    const { s, grunts, guard } = melee();
    const moves = planCloseRanks(s, grunts, guard);
    expect(moves.length).toBeGreaterThan(0);
    for (const mv of moves) {
      const m = grunts.models.find((x) => x.id === mv.id)!;
      expect(Math.hypot(mv.pos.x - m.pos.x, mv.pos.y - m.pos.y)).toBeLessThanOrEqual(3 + 1e-6);
    }
    const w = weapon(grunts, profileOf(grunts).weapons.find((x) => x.melee)!.name);
    const r = applyCommand(s, { type: "fight", uid: grunts.uid, target: guard.uid, weapon: w });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.some((e) => e.type === "moved" && e.kind === "closeRanks")).toBe(true);
    const g = unitById(r.state, grunts.uid)!;
    const t = unitById(r.state, guard.uid)!;
    const inContact = g.models.filter((m) => m.alive && t.models.some((tm) => tm.alive && modelsEngage(g, m, t, tm))).length;
    expect(inContact).toBeGreaterThan(3);
  });

  it("combat alternates by default, each side's chargers first; Chargers strike first restores the old order", () => {
    for (const chargersFirst of [false, true]) {
      const { s, grunts, guard, bertha, dancers } = melee({ chargersFirst });
      // Bertha (player 0) also charged into the dancers.
      const br = profileOf(bertha).baseRadius + profileOf(dancers).baseRadius;
      bertha.models[0]!.pos = { x: dancers.models[0]!.pos.x, y: dancers.models[0]!.pos.y - br - 0.2 };
      grunts.status.charged = true;
      bertha.status.charged = true;
      s.activePlayer = 1;
      const p1 = eligibleUnits(s, 1).map((u) => u.uid);
      if (chargersFirst) expect(p1).toEqual([]); // player 0's chargers go first
      else expect(p1.length).toBeGreaterThan(0); // player 1 may fight back in turn
      expect(guard).toBeDefined();
    }
  });
});

describe("house rules: random activation order", () => {
  it("draws who goes next, weighted by units left, and logs the draw", () => {
    let draws = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { s, bertha } = battle({ randomOrder: true }, seed);
      const r = applyCommand(s, { type: "hold", uid: bertha.uid });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const d = r.events.find((e) => e.type === "orderDraw");
      if (d?.type === "orderDraw") {
        draws++;
        expect(r.state.activePlayer).toBe(d.player);
        expect(d.left[0] + d.left[1]).toBeGreaterThan(0);
      }
    }
    expect(draws).toBe(6);
  });

  it("the AI plays a whole game with random order", () => {
    let s = createGame({ factions: ["militia", "concord"], seed: 4, orderChoice: true, rules: { randomOrder: true } });
    for (let i = 0; i < 3000 && !s.over; i++) s = playAiTurn(s);
    expect(s.over).toBe(true);
  }, 120_000);
});

describe("house rules: command re-roll and whole-army turns", () => {
  it("re-rolling costs 1 CP and only works with the rule on", () => {
    const off = battle();
    const w = weapon(off.grunts, profileOf(off.grunts).weapons.find((x) => !x.melee)!.name);
    expect(applyCommand(off.s, { type: "shoot", uid: off.grunts.uid, target: off.guard.uid, weapon: w, reroll: true }).ok).toBe(false);
    for (const seed of [1, 2, 3, 4]) {
      const { s, grunts, guard } = battle({ reroll: true }, seed);
      s.players[0].cp = 2;
      const r = applyCommand(s, { type: "shoot", uid: grunts.uid, target: guard.uid, weapon: w, reroll: true });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.state.players[0].cp).toBe(1);
      const a = r.events.find((e) => e.type === "attack");
      if (a?.type !== "attack") throw new Error("no attack");
      // Same seed without the re-roll: the first dice match, and every miss was rolled again.
      const plain = applyCommand(s, { type: "shoot", uid: grunts.uid, target: guard.uid, weapon: w });
      const b = plain.ok ? plain.events.find((e) => e.type === "attack") : undefined;
      if (b?.type !== "attack") throw new Error("no attack");
      const misses = b.report.hitRolls.filter((x) => x < b.report.hitOn);
      expect(a.report.rerolledFrom ?? []).toEqual(misses);
    }
  });

  it("whole-army turns: a player keeps the turn until all their units have gone", () => {
    const { s, bertha, grunts } = battle({ wholeArmy: true });
    let r = applyCommand(s, { type: "hold", uid: bertha.uid });
    expect(r.ok && r.state.activePlayer).toBe(0);
    if (!r.ok) return;
    r = applyCommand(r.state, { type: "hold", uid: grunts.uid });
    expect(r.ok && r.state.activePlayer).toBe(1);
  });

  it("the AI plays a whole game with every house rule flipped", () => {
    const rules: HouseRules = { ...STANDARD_RULES };
    for (const k of Object.keys(rules) as (keyof HouseRules)[]) rules[k] = !rules[k];
    rules.randomOrder = false; // can't be on with whole-army turns
    expect(CLASSIC_RULES.morale).toBe(true);
    let s = createGame({ factions: ["munch", "concord"], seed: 11, orderChoice: true, rules });
    let steps = 0;
    while (!s.over && steps < 3000) {
      s = playAiTurn(s);
      steps++;
    }
    expect(s.over).toBe(true);
  }, 120_000);
});
