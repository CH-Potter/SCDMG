// New unit abilities (Reel In, Rocket Hop, Rampage, Spotter, Bubble Shield, Sugar Rush, Provoke,
// Demo Charge, Lurk, Steadying Presence, Mending Spores) and the airdrop / rattle support effects.

import { describe, expect, it } from "vitest";
import { aiCommand } from "../src/engine/ai";
import { nerveOf, planShooting, saveNeeded } from "../src/engine/combat";
import { ABILITIES } from "../src/engine/data/abilities";
import { BUILT_IN_FACTION_IDS, factionOf } from "../src/engine/data/factions";
import { EFFECT_KINDS, factionProblems } from "../src/engine/data/factionValidation";
import { applyCommand, createGame, DEMO, planDemoCharge, type GameSetup } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { aliveModels, effectiveMove, unitById, unitGap } from "../src/engine/rules";
import { cleanupRound } from "../src/engine/scoring";
import { supportTarget } from "../src/engine/supports";
import type { GameState, ListEntry, Phase, PlayerId, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

const ok = (r: ReturnType<typeof applyCommand>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

const L = (...ids: string[]): ListEntry[] => ids.map((profileId) => ({ profileId, upgrades: [] }));

function game(lists: [ListEntry[], ListEntry[]], extra: Partial<GameSetup> = {}): GameState {
  const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 7, lists, supports: [[], []], ...extra });
  s.initiative = 0;
  s.activePlayer = 0;
  s.orderChoice = null; // skip the opening go-first/go-second choice
  s.players[0].cp = 8;
  s.players[1].cp = 8;
  return s;
}

function place(s: GameState, uid: string, at: Vec): Unit {
  const u = unitById(s, uid)!;
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.1), y: at.y + Math.floor(i / 3) * (2 * r + 0.1) };
    m.elevation = profileOf(u).keywords.includes("flying") ? 2 : 0;
  });
  return u;
}

const at = (s: GameState, phase: Phase, player: PlayerId = 0): GameState => {
  s.phase = phase;
  s.activePlayer = player;
  return s;
};

const centroidY = (u: Unit) => aliveModels(u).reduce((n, m) => n + m.pos.y, 0) / aliveModels(u).length;

describe("Reel In (grapple)", () => {
  it("drags an enemy unit closer without reaching base contact", () => {
    let s = at(game([L("mil-grunts"), L("munch-spitter")]), "assault", 1);
    const grunts = place(s, "p0-0", { x: 8, y: 17 });
    const spit = place(s, "p1-0", { x: 8, y: 27 });
    const before = unitGap(grunts, spit);
    s = ok(applyCommand(s, { type: "ability", uid: spit.uid, ability: "grapple", target: grunts.uid }));
    const g = unitById(s, grunts.uid)!;
    const moved = Math.hypot(g.models[0]!.pos.x - grunts.models[0]!.pos.x, g.models[0]!.pos.y - grunts.models[0]!.pos.y);
    expect(moved).toBeCloseTo(4, 5);
    expect(centroidY(g)).toBeGreaterThan(centroidY(grunts));
    expect(unitGap(g, unitById(s, spit.uid)!)).toBeLessThan(before);
    expect(s.players[1].cp).toBe(7);
    expect(unitById(s, spit.uid)!.status.acted).toBe(false); // free action: it can still shoot
  });

  it("refuses heavy units and targets out of range", () => {
    const s = at(game([L("mil-bertha", "mil-grunts"), L("munch-spitter")]), "assault", 1);
    const bertha = place(s, "p0-0", { x: 10, y: 18 });
    const grunts = place(s, "p0-1", { x: 25, y: 5 });
    place(s, "p1-0", { x: 10, y: 25 });
    const heavy = applyCommand(s, { type: "ability", uid: "p1-0", ability: "grapple", target: bertha.uid });
    expect(heavy.ok).toBe(false);
    const far = applyCommand(s, { type: "ability", uid: "p1-0", ability: "grapple", target: grunts.uid });
    expect(far.ok || far.error).toMatch(/within 10"/);
  });
});

describe("Rocket Hop", () => {
  it("leaps in the assault phase and leaves the unit free to act", () => {
    let s = at(game([L("mil-medic"), L("munch-nibblers")]), "assault");
    place(s, "p0-0", { x: 10, y: 28 });
    place(s, "p1-0", { x: 28, y: 5 });
    s = ok(applyCommand(s, { type: "ability", uid: "p0-0", ability: "rocket-hop", point: { x: 10, y: 23 } }));
    const medic = unitById(s, "p0-0")!;
    expect(medic.models[0]!.pos).toEqual({ x: 10, y: 23 });
    expect(medic.status.acted).toBe(false);
    expect(medic.status.abilityUsed).toBe(true);
    const tooFar = applyCommand(at(game([L("mil-medic"), L("munch-nibblers")]), "assault"), { type: "ability", uid: "p0-0", ability: "rocket-hop", point: { x: 10, y: 10 } });
    expect(tooFar.ok).toBe(false);
  });
});

describe("Rampage", () => {
  it("adds a melee die per model and makes saves one worse for the round", () => {
    let s = at(game([L("mil-grunts"), L("munch-nibblers")]), "assault", 1);
    const grunts = place(s, "p0-0", { x: 10, y: 16 });
    const nibs = place(s, "p1-0", { x: 10, y: 24 });
    const saveBefore = saveNeeded(s, grunts, nibs, nibs.models[0]!, 0, true);
    s = ok(applyCommand(s, { type: "ability", uid: nibs.uid, ability: "rampage" }));
    const n = unitById(s, nibs.uid)!;
    expect(n.status.meleeBonus).toBe(1);
    expect(saveNeeded(s, grunts, n, n.models[0]!, 0, true)).toBe(saveBefore === null ? null : saveBefore + 1 > 6 ? null : saveBefore + 1);
    cleanupRound(s, []);
    expect(n.status.reckless).toBe(false);
    expect(n.status.meleeBonus).toBe(0);
  });
});

describe("Spotter", () => {
  it("makes friendly shots at the spotted unit hit one better", () => {
    let s = at(game([L("mil-rustler", "mil-grunts"), L("munch-spitter")]), "assault");
    place(s, "p0-0", { x: 2, y: 28 });
    const grunts = place(s, "p0-1", { x: 6, y: 28 });
    const spit = place(s, "p1-0", { x: 6, y: 18 });
    const rifle = profileOf(grunts).weapons[0]!;
    const before = planShooting(s, grunts, spit, rifle);
    s = ok(applyCommand(s, { type: "ability", uid: "p0-0", ability: "spotter", target: spit.uid }));
    const after = planShooting(s, unitById(s, grunts.uid)!, unitById(s, spit.uid)!, rifle);
    if (typeof before === "string" || typeof after === "string") throw new Error("expected shots");
    expect(after.hitOn).toBe(before.hitOn - 1);
  });
});

describe("Bubble Shield", () => {
  it("adds a shield per model above the maximum, gone at the end of the round", () => {
    let s = at(game([L("mil-grunts"), L("munch-nibblers")], { factions: ["concord", "munch"], lists: [L("con-skiff", "con-guard"), L("munch-nibblers")] }), "movement");
    place(s, "p0-0", { x: 10, y: 26 });
    place(s, "p0-1", { x: 14, y: 27 });
    s = ok(applyCommand(s, { type: "ability", uid: "p0-0", ability: "bubble-shield", target: "p0-1" }));
    const guard = unitById(s, "p0-1")!;
    expect(aliveModels(guard).every((m) => m.shield === 2)).toBe(true);
    cleanupRound(s, []);
    expect(aliveModels(guard).every((m) => m.shield === 1)).toBe(true);
  });
});

describe("Sugar Rush", () => {
  it("gives +2 move for the round at the cost of 1 damage", () => {
    let s = at(game([L("mil-grunts"), L("munch-mama")]), "movement", 1);
    place(s, "p0-0", { x: 28, y: 5 });
    const mama = place(s, "p1-0", { x: 10, y: 26 });
    const mv = effectiveMove(s, mama);
    s = ok(applyCommand(s, { type: "ability", uid: mama.uid, ability: "sugar-rush" }));
    const m = unitById(s, mama.uid)!;
    expect(effectiveMove(s, m)).toBe(mv + 2);
    expect(m.models[0]!.hp).toBe(profileOf(m).hp - 1);
  });
});

describe("Provoke", () => {
  it("forces enemy shots onto the provoking unit when they can hit it", () => {
    let s = at(game([L("con-facet", "con-guard"), L("munch-spitter")], { factions: ["concord", "munch"] }), "movement");
    const facet = place(s, "p0-0", { x: 8, y: 24 });
    const guard = place(s, "p0-1", { x: 13, y: 24 });
    const spit = place(s, "p1-0", { x: 10, y: 14 });
    s = ok(applyCommand(s, { type: "ability", uid: facet.uid, ability: "provoke" }));
    at(s, "assault", 1);
    const wrong = applyCommand(s, { type: "shoot", uid: spit.uid, target: guard.uid, weapon: 0 });
    expect(wrong.ok).toBe(false);
    expect(applyCommand(s, { type: "shoot", uid: spit.uid, target: facet.uid, weapon: 0 }).ok).toBe(true);
  });
});

describe("Demo Charge", () => {
  it("hits harder against mechs and structures, once per game", () => {
    let s = at(game([L("mil-grunts", "mil-grunts"), L("munch-nibblers")], { factions: ["militia", "militia"], lists: [L("mil-grunts"), L("mil-bertha", "mil-grunts")] }), "assault");
    const grunts = place(s, "p0-0", { x: 10, y: 22 });
    const bertha = place(s, "p1-0", { x: 10, y: 18 });
    const other = place(s, "p1-1", { x: 3, y: 19 });
    expect(planDemoCharge(grunts, bertha)!.damage).toBe(DEMO.vsHard);
    expect(planDemoCharge(grunts, other)!.damage).toBe(DEMO.damage);
    const r = applyCommand(s, { type: "ability", uid: grunts.uid, ability: "demo-charge", target: bertha.uid });
    if (!r.ok) throw new Error(r.error);
    expect(r.events.some((e) => e.type === "attack" && e.report.weapon === "Demo Charge")).toBe(true);
    s = r.state;
    unitById(s, grunts.uid)!.status.abilityUsed = false;
    expect(applyCommand(s, { type: "ability", uid: grunts.uid, ability: "demo-charge", target: other.uid }).ok).toBe(false);
  });
});

describe("Lurk", () => {
  it("lashes out once per round at an enemy that ends a move within 3\"", () => {
    const s = at(game([L("mil-grunts"), L("munch-mama")]), "movement");
    place(s, "p0-0", { x: 1, y: 17 });
    place(s, "p1-0", { x: 2, y: 27 });
    const r = applyCommand(s, { type: "move", uid: "p0-0", leader: 0, to: { x: 2, y: 22.4 } });
    if (!r.ok) throw new Error(r.error);
    expect(r.events.some((e) => e.type === "ability" && e.ability === "lurk")).toBe(true);
    expect(r.events.some((e) => e.type === "attack" && e.report.weapon === "Lurk")).toBe(true);
    expect(unitById(r.state, "p1-0")!.reactionsUsed).toContain("lurk");
  });
});

describe("auras", () => {
  it("Steadying Presence gives nearby friends +1 nerve", () => {
    const s = game([L("mil-medic", "mil-grunts"), L("munch-nibblers")]);
    place(s, "p0-0", { x: 10, y: 26 });
    const grunts = place(s, "p0-1", { x: 13, y: 26 });
    expect(nerveOf(grunts)).toBe(7);
    expect(nerveOf(grunts, s)).toBe(8);
    place(s, "p0-1", { x: 28, y: 26 });
    expect(nerveOf(grunts, s)).toBe(7);
  });

  it("Mending Spores heal unhurt friends nearby at the end of the round", () => {
    const s = game([L("munch-pod", "mil-medic"), L("mil-grunts")]);
    place(s, "p0-0", { x: 10, y: 26 });
    const medic = place(s, "p0-1", { x: 13, y: 26 });
    place(s, "p1-0", { x: 28, y: 5 });
    medic.models[0]!.hp = 1;
    cleanupRound(s, []);
    expect(medic.models[0]!.hp).toBe(2);
  });
});

describe("new support effects", () => {
  it("airdrop deploys a reserve unit near your models, paying for it", () => {
    let s = game([L("mil-grunts", "mil-medic"), L("munch-nibblers")], { supports: [["mil-airstrip"], []] });
    place(s, "p0-0", { x: 10, y: 26 });
    place(s, "p1-0", { x: 28, y: 5 });
    const res = s.players[0].resources;
    const near = applyCommand(s, { type: "support", player: 0, support: "mil-airstrip", ability: "hay-drop", target: "p0-1", point: { x: 25, y: 9 } });
    expect(near.ok).toBe(false);
    s = ok(applyCommand(s, { type: "support", player: 0, support: "mil-airstrip", ability: "hay-drop", target: "p0-1", point: { x: 10, y: 16 } }));
    const medic = unitById(s, "p0-1")!;
    expect(medic.onBoard).toBe(true);
    expect(medic.status.acted).toBe(true);
    expect(s.players[0].resources).toBe(res - profileOf(medic).cost);
    expect(s.activePlayer).toBe(0);
  });

  it("rattle forces a nerve test at a penalty; fearless units are immune", () => {
    const s = game([L("munch-nibblers"), L("con-guard", "con-facet")], { factions: ["munch", "concord"], supports: [["munch-stink"], []] });
    place(s, "p0-0", { x: 10, y: 26 });
    place(s, "p1-0", { x: 10, y: 18 });
    place(s, "p1-1", { x: 16, y: 18 });
    const r = applyCommand(s, { type: "support", player: 0, support: "munch-stink", ability: "awful-whiff", target: "p1-0" });
    if (!r.ok) throw new Error(r.error);
    const test = r.events.find((e) => e.type === "morale");
    expect(test && test.type === "morale" && test.nerve).toBe(6); // Prism Guard nerve 8, -2
    expect(applyCommand(s, { type: "support", player: 0, support: "munch-stink", ability: "awful-whiff", target: "p1-1" }).ok).toBe(false);
  });

  it("validation accepts the new effects in custom factions", () => {
    expect(EFFECT_KINDS).toContain("airdrop");
    expect(EFFECT_KINDS).toContain("rattle");
    for (const fid of BUILT_IN_FACTION_IDS) {
      const f = structuredClone(factionOf(fid));
      f.id = `custom-${fid}`;
      f.profiles = f.profiles.map((p) => ({ ...p, id: `custom-${p.id}`, faction: f.id }));
      const rename = (id: string) => `custom-${id}`;
      for (const sp of f.supports) {
        sp.id = rename(sp.id);
        sp.faction = f.id;
        for (const a of sp.abilities) if (a.effect.kind === "summon") a.effect.profileId = rename(a.effect.profileId);
      }
      f.defaultList = f.defaultList.map((e) => ({ ...e, profileId: rename(e.profileId) }));
      f.assaultExtras = f.assaultExtras.map((e) => ({ ...e, profileId: rename(e.profileId) }));
      f.defaultSupports = f.defaultSupports.map(rename);
      f.assaultSupports = f.assaultSupports.map(rename);
      const problems = factionProblems(f).filter((p) => /effect|drop range|rattle|nerve penalty|unknown ability/i.test(p));
      expect(problems).toEqual([]);
    }
  });

  it("new support cards and abilities keep their numbers in their text", () => {
    for (const fid of BUILT_IN_FACTION_IDS) {
      for (const sp of factionOf(fid).supports) {
        for (const a of sp.abilities) {
          const e = a.effect;
          if (e.kind === "airdrop") {
            if (!e.anywhere) expect(a.text).toContain(`${e.range}"`);
            expect(a.text).toContain(`${e.minEnemyDistance}"`);
            expect(supportTarget(a)).toBe("reservePoint");
          } else if (e.kind === "rattle") {
            expect(a.text).toContain(`${e.range}"`);
            expect(a.text).toContain(`-${e.penalty} nerve`);
            expect(supportTarget(a)).toBe("enemyUnit");
          }
        }
      }
    }
    expect(ABILITIES.lurk.text).toContain('3"');
    expect(ABILITIES["demo-charge"].text).toContain(`${DEMO.dice} dice`);
    expect(ABILITIES["demo-charge"].text).toContain(`${DEMO.hit}+`);
    expect(ABILITIES["demo-charge"].text).toContain(`${DEMO.damage} damage`);
    expect(ABILITIES["demo-charge"].text).toContain(`${DEMO.vsHard} damage`);
    expect(ABILITIES.steadying.text).toContain('6"');
    expect(ABILITIES["mending-aura"].text).toContain('6"');
  });
});

describe("AI with the new content", () => {
  it("plays a full game with the new supports without an illegal move", () => {
    let s = createGame({ map: CLASSIC_DUSTBOWL,
      factions: ["militia", "munch"],
      seed: 21,
      supports: [
        ["mil-airstrip", "mil-wagon"],
        ["munch-stink", "munch-burrows"],
      ],
    });
    let n = 0;
    while (!s.over && n++ < 3000) {
      const cmd = aiCommand(s);
      const r = applyCommand(s, cmd);
      if (!r.ok) throw new Error(`${JSON.stringify(cmd)}: ${r.error}`);
      s = r.state;
    }
    expect(s.over).toBe(true);
  }, 60_000);
});
