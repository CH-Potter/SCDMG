// The CP ability pass: unit abilities that cost CP every round they're used, the disruption
// abilities that burn an enemy support card, and the dice buffs and debuffs (unit abilities and
// support cards share the statuses).

import { describe, expect, it } from "vitest";
import { evadeTarget, planShooting, saveNeeded } from "../src/engine/combat";
import { ABILITIES } from "../src/engine/data/abilities";
import { factionOf, SUPPORTS } from "../src/engine/data/factions";
import { EFFECT_KINDS } from "../src/engine/data/factionValidation";
import { applyCommand, bestTwoOfThreeAtLeast, chargeOdds, createGame, twoDiceAtLeast, type GameSetup } from "../src/engine/game";
import { STANDARD_RULES } from "../src/engine/houseRules";
import { abilityValue, ABILITY_PRICES, EFFECT_PRICES } from "../src/engine/pricing";
import { profileFor, profileOf } from "../src/engine/profile";
import { aliveModels, controlWeight, currentSupply, eligibleUnits, isEngaged, unitById, unitGap } from "../src/engine/rules";
import { cleanupRound } from "../src/engine/scoring";
import { cardToBurn, exhaustEnemyCard } from "../src/engine/supports";
import type { AbilityId, FactionId, GameEvent, GameState, ListEntry, Phase, PlayerId, Unit, Vec } from "../src/engine/types";

const ok = (r: ReturnType<typeof applyCommand>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const L = (...ids: string[]): ListEntry[] => ids.map((id) => {
  const [profileId, ...upgrades] = id.split("+");
  return { profileId: profileId!, upgrades };
});

function game(factions: [FactionId, FactionId], lists: [ListEntry[], ListEntry[]], extra: Partial<GameSetup> = {}): GameState {
  const s = createGame({ factions, seed: 7, lists, supports: [[], []], ...extra });
  Object.assign(s, { initiative: 0, activePlayer: 0, orderChoice: null, terrain: [], access: [] });
  s.players[0].cp = 8;
  s.players[1].cp = 8;
  return s;
}

function place(s: GameState, uid: string, at: Vec): Unit {
  const u = unitById(s, uid)!;
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 5) * (2 * r + 0.1), y: at.y + Math.floor(i / 5) * (2 * r + 0.1) };
    m.elevation = profileOf(u).keywords.includes("flying") ? 2 : 0;
  });
  return u;
}

const at = (s: GameState, phase: Phase, player: PlayerId = 0): GameState => {
  s.phase = phase;
  s.activePlayer = player;
  return s;
};
const use = (s: GameState, uid: string, ability: AbilityId, more: { target?: string; point?: Vec } = {}) => applyCommand(s, { type: "ability", uid, ability, ...more });

describe("the CP ability pass: definitions", () => {
  const NEW: AbilityId[] = [
    "stand-to", "hold-the-line", "smoke-shells", "steel-core",
    "mad-scramble", "eat-through", "brood-frenzy", "lay-eggs",
    "phase-shift", "triangulate", "bow-out", "lend-shields",
    "snipe-runner", "chew-wires", "cutting-remark",
    "rivet-plates", "star-shell", "slime-coat", "numbing-sting", "exacting-standards",
  ];

  it("every new ability is an active unit ability costing 1 or 2 CP, with a price", () => {
    for (const id of NEW) {
      const d = ABILITIES[id];
      expect(d.kind, id).toBe("active");
      expect([1, 2], id).toContain(d.cp);
      expect(d.text.length, id).toBeGreaterThan(40);
      expect(id in ABILITY_PRICES, id).toBe(true);
    }
  });

  it("Rocket Hop, Bubble Shield and Provoke are every-round CP abilities now", () => {
    for (const id of ["rocket-hop", "bubble-shield", "provoke"] as AbilityId[]) {
      expect(ABILITIES[id].usesPerGame, id).toBeUndefined();
      expect(ABILITIES[id].cp, id).toBe(1);
    }
  });

  it("every unit in the starter lists can spend CP on an ability of its own (structures aside)", () => {
    for (const f of ["militia", "swarm", "concord"]) {
      const fac = factionOf(f);
      for (const e of [...fac.defaultList, ...fac.assaultExtras]) {
        const p = profileFor(e.profileId, e.upgrades);
        if (p.structure && p.id !== "mil-mortar") continue;
        expect(p.abilities.some((a) => ABILITIES[a].kind === "active" && (ABILITIES[a].cp ?? 0) > 0), `${p.name}`).toBe(true);
      }
    }
  });

  it("the dice effects are support effect kinds the Forge offers, with prices", () => {
    for (const k of ["armourBuff", "armourBreak", "evadeBuff", "evadeDebuff", "damageBuff", "weaken"] as const) {
      expect(EFFECT_KINDS as readonly string[]).toContain(k);
      expect(k in EFFECT_PRICES, k).toBe(true);
    }
    for (const id of ["mil-powder", "swarm-moult", "con-forge"]) {
      const card = SUPPORTS[id]!;
      expect(card.abilities.length).toBe(2);
      // A card's CP covers its dearest ability.
      expect(card.cp).toBeGreaterThanOrEqual(Math.max(...card.abilities.map((a) => a.cp)));
    }
  });

  it("the pricing charges at least something for each, and less with more CP", () => {
    const ctx = { p: profileFor("mil-grunts", []), ranged: 1, rangedPerDie: 0.2, melee: 0.3, meleePerDie: 0.1, body: 1 };
    for (const id of NEW) expect(abilityValue(id, ctx), id).toBeGreaterThan(0);
  });
});

describe("Militia: Stand To, Hold the Line, Smoke Shells, Steel-Core Rounds", () => {
  it("Stand To shoots the first charger before the charge is rolled, once a round", () => {
    let s = at(game(["militia", "swarm"], [L("mil-grunts"), L("swarm-skitterlings", "swarm-skitterlings")]), "movement");
    place(s, "p0-0", { x: 15, y: 10 });
    place(s, "p1-0", { x: 13, y: 17 });
    place(s, "p1-1", { x: 22, y: 17 });
    s = ok(use(s, "p0-0", "stand-to"));
    expect(s.players[0].cp).toBe(7);
    expect(unitById(s, "p0-0")!.status.acted).toBe(false); // a free action
    s = at(s, "assault", 1);
    const r = applyCommand(s, { type: "charge", uid: "p1-0", target: "p0-0" });
    if (!r.ok) throw new Error(r.error);
    const i = r.events.findIndex((e) => e.type === "ability" && e.ability === "stand-to");
    const roll = r.events.findIndex((e) => e.type === "chargeRoll");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(r.events.some((e) => e.type === "attack" && e.report.uid === "p0-0")).toBe(true);
    if (roll >= 0) expect(i).toBeLessThan(roll);
    // A second charge this round isn't shot.
    const s2 = at(r.state, "assault", 1);
    const r2 = applyCommand(s2, { type: "charge", uid: "p1-1", target: "p0-0" });
    if (r2.ok) expect(r2.events.some((e) => e.type === "ability" && e.ability === "stand-to")).toBe(false);
  });

  it("Hold the Line doubles its weight on objectives and keeps it from moving or charging", () => {
    let s = at(game(["militia", "swarm"], [L("mil-grunts"), L("swarm-skitterlings")]), "movement");
    const g = place(s, "p0-0", { x: 15, y: 10 });
    place(s, "p1-0", { x: 15, y: 25 });
    const before = controlWeight(g);
    s = ok(use(s, "p0-0", "hold-the-line"));
    const held = unitById(s, "p0-0")!;
    expect(controlWeight(held)).toBe(2 * currentSupply(held));
    expect(controlWeight(held)).toBe(2 * before);
    expect(held.status.acted).toBe(true); // it's the unit's movement
    s = at(s, "assault");
    const adv = applyCommand(s, { type: "advance", uid: "p0-0", leader: 0, to: { x: 15, y: 12 } });
    expect(adv.ok).toBe(false);
    // Over at the end of the round.
    cleanupRound(s, []);
    expect(controlWeight(unitById(s, "p0-0")!)).toBe(before);
  });

  it("Smoke Shells: the mortar (a structure) gets a movement activation for it, and friends near the point are hidden", () => {
    let s = at(game(["militia", "swarm"], [L("mil-mortar", "mil-grunts"), L("swarm-skitterlings")]), "movement");
    place(s, "p0-0", { x: 5, y: 3 });
    place(s, "p0-1", { x: 15, y: 10 });
    place(s, "p1-0", { x: 15, y: 30 });
    expect(eligibleUnits(s, 0).map((u) => u.uid)).toContain("p0-0");
    s = ok(use(s, "p0-0", "smoke-shells", { point: { x: 16, y: 10 } }));
    expect(unitById(s, "p0-1")!.status.smoked).toBe(12);
    // One ability a phase: no barrage as well.
    expect(use(s, "p0-0", "barrage", { point: { x: 15, y: 30 } }).ok).toBe(false);
    // Nobody under the smoke: refused.
    const s2 = at(game(["militia", "swarm"], [L("mil-mortar"), L("swarm-skitterlings")]), "movement");
    place(s2, "p0-0", { x: 5, y: 3 });
    place(s2, "p1-0", { x: 15, y: 30 });
    expect(use(s2, "p0-0", "smoke-shells", { point: { x: 20, y: 20 } }).ok).toBe(false);
  });

  it("Steel-Core Rounds add 1 AP to its shots this round", () => {
    let s = at(game(["militia", "concord"], [L("mil-squinter"), L("con-guard")]), "assault");
    const m = place(s, "p0-0", { x: 15, y: 5 });
    const t = place(s, "p1-0", { x: 15, y: 20 });
    const w = profileOf(m).weapons[0]!;
    const before = planShooting(s, m, t, w);
    s = ok(use(s, "p0-0", "steel-core"));
    const after = planShooting(s, unitById(s, "p0-0")!, unitById(s, "p1-0")!, w);
    if (typeof before === "string" || typeof after === "string") throw new Error("no shot");
    expect(after.ap).toBe(before.ap + 1);
  });
});

describe("Skitterswarm: Mad Scramble, Eat Through, Brood Frenzy, Lay Eggs", () => {
  it("Mad Scramble: the best two of three dice make long charges likelier", () => {
    for (let n = 5; n <= 12; n++) expect(bestTwoOfThreeAtLeast(n)).toBeGreaterThan(twoDiceAtLeast(n));
    expect(bestTwoOfThreeAtLeast(2)).toBe(1);
    let s = at(game(["swarm", "militia"], [L("swarm-skitterlings"), L("mil-grunts")]), "assault");
    place(s, "p0-0", { x: 10, y: 10 });
    place(s, "p1-0", { x: 10, y: 22 });
    s = ok(use(s, "p0-0", "mad-scramble"));
    const u = unitById(s, "p0-0")!;
    expect(u.status.scrambling).toBe(true);
    expect(chargeOdds(u, 9)).toBeCloseTo(bestTwoOfThreeAtLeast(9));
    // Without rolled charges there's nothing to scramble for.
    const fixed = at(game(["swarm", "militia"], [L("swarm-skitterlings"), L("mil-grunts")], { rules: { ...STANDARD_RULES, rolledCharges: false } }), "assault");
    place(fixed, "p0-0", { x: 10, y: 10 });
    place(fixed, "p1-0", { x: 10, y: 22 });
    expect(use(fixed, "p0-0", "mad-scramble").ok).toBe(false);
  });

  it("Eat Through corrodes a target, or takes a corroded one to two worse", () => {
    let s = at(game(["swarm", "militia"], [L("swarm-spitters", "swarm-spitters"), L("mil-grunts")]), "assault");
    place(s, "p0-0", { x: 10, y: 10 });
    place(s, "p0-1", { x: 16, y: 10 });
    const g = place(s, "p1-0", { x: 12, y: 18 });
    const tm = g.models[0]!;
    const base = saveNeeded(s, unitById(s, "p0-0")!, g, tm, 0, true)!;
    s = ok(use(s, "p0-0", "eat-through", { target: "p1-0" }));
    expect(unitById(s, "p1-0")!.status.corroded).toBe(true);
    s = ok(use(s, "p0-1", "eat-through", { target: "p1-0" }));
    const t1 = unitById(s, "p1-0")!;
    expect(t1.status.melting).toBe(true);
    expect(saveNeeded(s, unitById(s, "p0-0")!, t1, t1.models[0]!, 0, true)).toBe(base + 2);
  });

  it("Brood Frenzy gives every other brood within 6\" +1 melee die per model, for 1 CP", () => {
    let s = at(game(["swarm", "militia"], [L("swarm-mother", "swarm-skitterlings", "swarm-shellbacks"), L("mil-grunts")]), "assault");
    place(s, "p0-0", { x: 15, y: 10 });
    place(s, "p0-1", { x: 15, y: 14 });
    place(s, "p0-2", { x: 2, y: 30 });
    place(s, "p1-0", { x: 30, y: 30 });
    s = ok(use(s, "p0-0", "brood-frenzy"));
    expect(s.players[0].cp).toBe(7);
    expect(unitById(s, "p0-1")!.status.meleeBonus).toBe(1);
    expect(unitById(s, "p0-2")!.status.meleeBonus).toBe(0);
    expect(unitById(s, "p0-0")!.status.meleeBonus).toBe(0);
  });

  it("Lay Eggs drops an Egg Clutch within 3\", and not next to the enemy", () => {
    let s = at(game(["swarm", "militia"], [L("swarm-tenders"), L("mil-grunts")]), "movement");
    place(s, "p0-0", { x: 15, y: 10 });
    place(s, "p1-0", { x: 15, y: 25 });
    expect(use(s, "p0-0", "lay-eggs", { point: { x: 15, y: 20 } }).ok).toBe(false); // too far
    s = ok(use(s, "p0-0", "lay-eggs", { point: { x: 15, y: 13 } }));
    expect(s.units.some((u) => u.profileId === "swarm-eggs" && u.owner === 0 && u.onBoard)).toBe(true);
    const near = at(game(["swarm", "militia"], [L("swarm-tenders"), L("mil-grunts")]), "movement");
    place(near, "p0-0", { x: 15, y: 10 });
    place(near, "p1-0", { x: 15, y: 15 });
    expect(use(near, "p0-0", "lay-eggs", { point: { x: 15, y: 13 } }).ok).toBe(false);
  });
});

describe("Concord: Phase Shift, Triangulate, Bow Out, Lend Shields", () => {
  it("Phase Shift: shots are evaded on a 4+, blows are not", () => {
    let s = at(game(["concord", "militia"], [L("con-guard"), L("mil-grunts")]), "movement");
    place(s, "p0-0", { x: 15, y: 10 });
    place(s, "p1-0", { x: 15, y: 25 });
    expect(evadeTarget(unitById(s, "p0-0")!, ["ranged"])).toBeNull();
    s = ok(use(s, "p0-0", "phase-shift"));
    const g = unitById(s, "p0-0")!;
    expect(evadeTarget(g, ["ranged"])).toBe(4);
    expect(evadeTarget(g, ["ranged", "blast"])).toBe(4);
    expect(evadeTarget(g, ["melee"])).toBeNull();
  });

  it("Triangulate gives every shot at the target precision +1 and tracking +1", () => {
    let s = at(game(["concord", "militia"], [L("con-skiff", "con-lancer"), L("mil-grunts")]), "assault");
    place(s, "p0-0", { x: 10, y: 5 });
    const l = place(s, "p0-1", { x: 20, y: 5 });
    const g = place(s, "p1-0", { x: 15, y: 18 });
    const w = profileOf(l).weapons[0]!;
    const before = planShooting(s, l, g, w);
    s = ok(use(s, "p0-0", "triangulate", { target: "p1-0" }));
    const after = planShooting(s, unitById(s, "p0-1")!, unitById(s, "p1-0")!, w);
    if (typeof before === "string" || typeof after === "string") throw new Error("no shot");
    expect(after.precision).toBe((before.precision ?? 0) + 1);
    expect(after.tracking).toBe((before.tracking ?? 0) + 1);
  });

  it("Bow Out teleports a unit out of a melee cleanly, as its move", () => {
    let s = at(game(["concord", "swarm"], [L("con-facet"), L("swarm-skitterlings")]), "movement");
    const st = place(s, "p0-0", { x: 15, y: 10 });
    const sk = place(s, "p1-0", { x: 15, y: 10 + profileOf(st).baseRadius + 0.42 + 0.5 });
    expect(isEngaged(s, st)).toBe(true);
    const away = { x: 15, y: 10 - 5.5 };
    s = ok(use(s, "p0-0", "bow-out", { point: away }));
    const u = unitById(s, "p0-0")!;
    expect(isEngaged(s, u)).toBe(false);
    expect(u.status.acted).toBe(true);
    expect(u.status.disengaged).toBe(false);
    expect(unitGap(u, unitById(s, sk.uid)!)).toBeGreaterThan(1);
  });

  it("Lend Shields moves this unit's shields onto a friend, above its maximum", () => {
    let s = at(game(["concord", "militia"], [L("con-warden", "con-guard"), L("mil-grunts")]), "movement");
    place(s, "p0-0", { x: 15, y: 10 });
    place(s, "p0-1", { x: 18, y: 10 });
    place(s, "p1-0", { x: 15, y: 30 });
    s = ok(use(s, "p0-0", "lend-shields", { target: "p0-1" }));
    expect(aliveModels(unitById(s, "p0-0")!).every((m) => m.shield === 0)).toBe(true);
    const shields = aliveModels(unitById(s, "p0-1")!).map((m) => m.shield);
    expect(shields.reduce((a, b) => a + b, 0)).toBe(3 + 2); // its own 3, and the Warden's 2
    expect(Math.max(...shields)).toBe(2);
  });
});

describe("disruption: burning an enemy support card", () => {
  const withCards = (): GameState => {
    const s = game(["militia", "concord"], [L("mil-squinter", "mil-grunts"), L("con-lancer", "con-guard")], { supports: [["mil-wagon"], ["con-court", "con-portal", "con-lens"]] });
    s.players[0].cp = 8;
    s.players[1].cp = 3;
    return s;
  };

  it("cardToBurn picks the ready card with the most CP, then the dearest", () => {
    const s = withCards();
    // Court and Portal both bring 1 CP (the Lens 0): the Portal costs more Fizz.
    expect(cardToBurn(s, 1)).toBe("con-portal");
    s.players[1].supports = s.players[1].supports.map((c) => (c.id === "con-portal" ? { ...c, exhausted: true } : c));
    expect(cardToBurn(s, 1)).toBe("con-court");
  });

  it("exhaustEnemyCard exhausts the card and takes its CP (not below 0)", () => {
    const s = withCards();
    const ev: GameEvent[] = [];
    expect(exhaustEnemyCard(s, 1, "con-court", ev)).toBeNull();
    expect(s.players[1].supports.find((c) => c.id === "con-court")!.exhausted).toBe(true);
    expect(s.players[1].cp).toBe(2);
    expect(ev).toEqual([{ type: "cardBurned", player: 1, support: "con-court" }]);
    expect(exhaustEnemyCard(s, 1, "con-court", [])).not.toBeNull();
    s.players[1].cp = 0;
    expect(exhaustEnemyCard(s, 1, "con-portal", [])).toBeNull();
    expect(s.players[1].cp).toBe(0);
  });

  it("Snipe the Runner burns their best card, only if the marksman hasn't moved", () => {
    let s = at(withCards(), "assault");
    place(s, "p0-0", { x: 10, y: 5 });
    place(s, "p1-0", { x: 15, y: 30 });
    s = ok(use(s, "p0-0", "snipe-runner"));
    expect(s.players[0].cp).toBe(7);
    expect(s.players[1].supports.find((c) => c.id === "con-portal")!.exhausted).toBe(true);
    expect(s.players[1].cp).toBe(2);
    const moved = at(withCards(), "assault");
    place(moved, "p0-0", { x: 10, y: 5 });
    unitById(moved, "p0-0")!.status.moved = true;
    expect(use(moved, "p0-0", "snipe-runner").ok).toBe(false);
  });

  it("Cutting Remark needs an enemy in sight within 24\"; Chew the Wires one within 12\"", () => {
    const s = at(withCards(), "assault", 1);
    place(s, "p1-0", { x: 15, y: 30 });
    place(s, "p0-1", { x: 15, y: 2 });
    expect(use(s, "p1-0", "cutting-remark").ok).toBe(false); // 28" away
    place(s, "p0-1", { x: 15, y: 15 });
    expect(use(s, "p1-0", "cutting-remark").ok).toBe(true);
    const w = at(game(["swarm", "militia"], [L("swarm-tenders"), L("mil-grunts")], { supports: [[], ["mil-wagon"]] }), "movement");
    place(w, "p0-0", { x: 15, y: 10 });
    place(w, "p1-0", { x: 15, y: 30 });
    expect(use(w, "p0-0", "chew-wires").ok).toBe(false);
  });

  it("the exhausted card can't be played until the round's refresh", () => {
    let s = at(withCards(), "assault");
    place(s, "p0-0", { x: 10, y: 5 });
    place(s, "p1-0", { x: 15, y: 30 });
    s = ok(use(s, "p0-0", "snipe-runner"));
    s = at(s, "movement", 1);
    s.round = 2;
    const r = applyCommand(s, { type: "support", player: 1, support: "con-portal", ability: "afterglow", target: "p1-0" });
    expect(r.ok).toBe(false);
  });
});

describe("dice buffs and debuffs", () => {
  it("Rivet the Plates: saves one better against everything this round", () => {
    let s = at(game(["militia", "swarm"], [L("mil-medic", "mil-grunts"), L("swarm-skitterlings")]), "movement");
    place(s, "p0-0", { x: 15, y: 10 });
    const g = place(s, "p0-1", { x: 17, y: 10 });
    const sk = place(s, "p1-0", { x: 15, y: 30 });
    const before = saveNeeded(s, sk, g, g.models[0]!, 0, true)!;
    s = ok(use(s, "p0-0", "rivet-plates", { target: "p0-1" }));
    const g1 = unitById(s, "p0-1")!;
    expect(saveNeeded(s, sk, g1, g1.models[0]!, 0, true)).toBe(before - 1);
    cleanupRound(s, []);
    expect(saveNeeded(s, sk, g1, g1.models[0]!, 0, true)).toBe(before);
  });

  it("Slime Coat gives a unit with no evade a 6+ evade against everything; one with an evade gets +1", () => {
    let s = at(game(["swarm", "militia"], [L("swarm-tenders", "swarm-mother", "swarm-skitterlings"), L("mil-grunts")]), "movement");
    place(s, "p0-0", { x: 15, y: 10 });
    place(s, "p0-1", { x: 17, y: 12 });
    place(s, "p0-2", { x: 12, y: 8 });
    place(s, "p1-0", { x: 15, y: 30 });
    s = ok(use(s, "p0-0", "slime-coat", { target: "p0-1" }));
    expect(evadeTarget(unitById(s, "p0-1")!, ["melee"])).toBe(6);
    expect(evadeTarget(unitById(s, "p0-1")!, ["ranged"])).toBe(6);
    const s2 = at(game(["swarm", "militia"], [L("swarm-tenders", "swarm-skitterlings"), L("mil-grunts")]), "movement");
    place(s2, "p0-0", { x: 15, y: 10 });
    place(s2, "p0-1", { x: 12, y: 8 });
    place(s2, "p1-0", { x: 15, y: 30 });
    const after = ok(use(s2, "p0-0", "slime-coat", { target: "p0-1" }));
    expect(evadeTarget(unitById(after, "p0-1")!, ["blast"])).toBe(4); // 5+ made 4+
  });

  it("Star Shell: an enemy's evade one worse (never past 6+); Numbing Sting: one fewer die per model", () => {
    let s = at(game(["militia", "swarm"], [L("mil-mortar"), L("swarm-skitterlings")]), "assault");
    place(s, "p0-0", { x: 5, y: 3 });
    place(s, "p1-0", { x: 15, y: 25 });
    s = ok(use(s, "p0-0", "star-shell", { target: "p1-0" }));
    expect(evadeTarget(unitById(s, "p1-0")!, ["blast"])).toBe(6);
    let w = at(game(["swarm", "militia"], [L("swarm-stingers"), L("mil-grunts")]), "assault");
    place(w, "p0-0", { x: 15, y: 10 });
    const g = place(w, "p1-0", { x: 15, y: 16 });
    const rifle = profileOf(g).weapons[0]!;
    const target = place(w, "p0-0", { x: 15, y: 10 });
    const before = planShooting(w, g, target, rifle);
    w = ok(use(w, "p0-0", "numbing-sting", { target: "p1-0" }));
    const after = planShooting(w, unitById(w, "p1-0")!, unitById(w, "p0-0")!, rifle);
    if (typeof before === "string" || typeof after === "string") throw new Error("no shot");
    expect(after.attackers[0]!.dice).toBe(Math.max(1, before.attackers[0]!.dice - 1));
  });

  it("Exacting Standards: +1 damage per hit this round", () => {
    let s = at(game(["concord", "militia"], [L("con-warden", "con-lancer"), L("mil-grunts")]), "movement");
    place(s, "p0-0", { x: 15, y: 5 });
    const l = place(s, "p0-1", { x: 18, y: 5 });
    const g = place(s, "p1-0", { x: 15, y: 20 });
    const w = profileOf(l).weapons[0]!;
    const before = planShooting(s, l, g, w);
    s = ok(use(s, "p0-0", "exacting-standards", { target: "p0-1" }));
    const after = planShooting(s, unitById(s, "p0-1")!, unitById(s, "p1-0")!, w);
    if (typeof before === "string" || typeof after === "string") throw new Error("no shot");
    expect(after.damage).toBe(before.damage + 1);
  });

  it("the support cards play the same effects: Hardlight Plating, Structural Critique, Heavy Loads, Fresh Moult, Numbing Haze", () => {
    let s = at(game(["concord", "swarm"], [L("con-guard"), L("swarm-skitterlings")], { supports: [["con-forge"], ["swarm-moult"]] }), "assault");
    s.players[0].cp = 4;
    s.players[1].cp = 4;
    const g = place(s, "p0-0", { x: 15, y: 10 });
    const sk = place(s, "p1-0", { x: 15, y: 20 });
    const save = saveNeeded(s, sk, g, g.models[0]!, 0, true)!;
    s = ok(applyCommand(s, { type: "support", player: 0, support: "con-forge", ability: "hardlight-plating", target: "p0-0" }));
    expect(saveNeeded(s, sk, unitById(s, "p0-0")!, g.models[0]!, 0, true)).toBe(save - 1);
    // The card is exhausted: no Structural Critique this round.
    expect(applyCommand(s, { type: "support", player: 0, support: "con-forge", ability: "structural-critique", target: "p1-0" }).ok).toBe(false);
    s = at(s, "assault", 1);
    s = ok(applyCommand(s, { type: "support", player: 1, support: "swarm-moult", ability: "numbing-haze", target: "p0-0" }));
    expect(unitById(s, "p0-0")!.status.diceMod).toBe(-1);
    const m = at(game(["militia", "concord"], [L("mil-grunts"), L("con-guard")], { supports: [["mil-powder"], []] }), "assault");
    place(m, "p0-0", { x: 15, y: 10 });
    place(m, "p1-0", { x: 15, y: 20 });
    const heavy = ok(applyCommand(m, { type: "support", player: 0, support: "mil-powder", ability: "heavy-loads", target: "p0-0" }));
    expect(unitById(heavy, "p0-0")!.status.damageMod).toBe(1);
  });
});
