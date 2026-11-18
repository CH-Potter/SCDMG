// The ability pass: every unit has at least two abilities (structures at least one) and every
// support card at least two. Each new ability's effect, its legality errors, and that the AI uses it.

import { describe, expect, it } from "vitest";
import { aiCommand, aiSupportCommand } from "../src/engine/ai";
import { planShooting, saveNeeded, shellSpotted } from "../src/engine/combat";
import { ABILITIES } from "../src/engine/data/abilities";
import { BUILT_IN_FACTION_IDS, factionOf } from "../src/engine/data/factions";
import { applyCommand, createGame, type GameSetup } from "../src/engine/game";
import { CLASSIC_RULES } from "../src/engine/houseRules";
import { profileOf } from "../src/engine/profile";
import { aliveModels, disengageOdds, effectiveMove, isEngaged, unitById, unitGap } from "../src/engine/rules";
import { cleanupRound } from "../src/engine/scoring";
import { summon } from "../src/engine/supports";
import type { Command, GameEvent, GameState, ListEntry, Phase, PlayerId, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

const ok = (r: ReturnType<typeof applyCommand>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const okR = (r: ReturnType<typeof applyCommand>) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};
const err = (r: ReturnType<typeof applyCommand>): string => (r.ok ? "" : r.error);

const L = (...ids: string[]): ListEntry[] => ids.map((profileId) => ({ profileId, upgrades: [] }));

function game(lists: [ListEntry[], ListEntry[]], extra: Partial<GameSetup> = {}): GameState {
  const s = createGame({ map: CLASSIC_DUSTBOWL, rules: CLASSIC_RULES, factions: ["militia", "munch"], seed: 7, lists, supports: [[], []], ...extra });
  s.initiative = 0;
  s.activePlayer = 0;
  s.orderChoice = null;
  s.players[0].cp = 8;
  s.players[1].cp = 8;
  return s;
}

/** Put a unit on the table in rows of three from `at` (the left column of the classic board is open ground). */
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

const abilityEvent = (events: GameEvent[], id: string) => events.find((e) => e.type === "ability" && e.ability === id);
const attacks = (events: GameEvent[]) => events.flatMap((e) => (e.type === "attack" ? [e.report] : []));

/** Let the AI play the current phase (both sides) until `want` matches one of its commands. */
function aiUses(s: GameState, want: (c: Command) => boolean, steps = 12): Command | null {
  const phase = s.phase;
  for (let i = 0; i < steps && !s.over && s.phase === phase; i++) {
    const cmd = aiCommand(s);
    if (want(cmd)) return cmd;
    const r = applyCommand(s, cmd);
    if (!r.ok) throw new Error(`AI made an illegal move ${JSON.stringify(cmd)}: ${r.error}`);
    s = r.state;
  }
  return null;
}
const isAbility = (id: string) => (c: Command) => c.type === "ability" && c.ability === id;
const isSupport = (id: string) => (c: Command | null) => !!c && c.type === "support" && c.ability === id;

describe("every unit and support card has its abilities", () => {
  it("non-structures have two or more, structures at least one, support cards two or more", () => {
    for (const fid of BUILT_IN_FACTION_IDS) {
      const f = factionOf(fid);
      for (const p of f.profiles) expect(p.abilities.length, p.name).toBeGreaterThanOrEqual(p.structure ? 1 : 2);
      for (const sp of f.supports) expect(sp.abilities.length, sp.name).toBeGreaterThanOrEqual(2);
    }
  });

  it("every ability a unit has is defined, with card text", () => {
    for (const fid of BUILT_IN_FACTION_IDS)
      for (const p of factionOf(fid).profiles)
        for (const a of p.abilities) {
          expect(ABILITIES[a], `${p.name}: ${a}`).toBeDefined();
          expect(ABILITIES[a].text.length).toBeGreaterThan(10);
        }
  });
});

// ---------- unit abilities ----------

describe("Return Fire", () => {
  it("shoots back at a shooter that hurt it, hitting one worse, once per round", () => {
    let seen = false;
    for (let seed = 1; seed < 40 && !seen; seed++) {
      const s = at(game([L("mil-grunts"), L("mil-bertha")], { factions: ["militia", "militia"], seed }), "assault");
      place(s, "p0-0", { x: 0.8, y: 26 });
      place(s, "p1-0", { x: 2, y: 12 });
      const r = okR(applyCommand(s, { type: "shoot", uid: "p0-0", target: "p1-0", weapon: 0 }));
      const [shot, back] = attacks(r.events);
      if (!shot || shot.damage === 0) {
        expect(abilityEvent(r.events, "return-fire")).toBeUndefined();
        continue;
      }
      seen = true;
      expect(abilityEvent(r.events, "return-fire")).toBeDefined();
      expect(back!.uid).toBe("p1-0");
      expect(back!.target).toBe("p0-0");
      expect(back!.hitOn).toBe(5); // the Thumper Cannon hits on 4+, one worse
      expect(unitById(r.state, "p1-0")!.reactionsUsed).toContain("return-fire");
      expect(unitById(r.state, "p1-0")!.status.acted).toBe(false); // a reaction, not its activation
    }
    expect(seen).toBe(true);
  });

  it("doesn't fire while engaged or silenced", () => {
    const s = at(game([L("mil-grunts"), L("mil-bertha")], { factions: ["militia", "militia"] }), "assault");
    place(s, "p0-0", { x: 0.8, y: 26 });
    const b = place(s, "p1-0", { x: 2, y: 12 });
    b.status.silenced = true;
    for (let seed = 1; seed < 10; seed++) {
      s.rng = seed;
      const r = okR(applyCommand(s, { type: "shoot", uid: "p0-0", target: "p1-0", weapon: 0 }));
      expect(abilityEvent(r.events, "return-fire")).toBeUndefined();
    }
  });
});

describe("Crop Dust", () => {
  it("flies a line and sprays every enemy ground model near the path; the unit can still shoot", () => {
    let s = at(game([L("mil-rustler"), L("munch-nibblers")]), "assault");
    place(s, "p0-0", { x: 2, y: 29 });
    place(s, "p1-0", { x: 0.8, y: 21 });
    const r = okR(applyCommand(s, { type: "ability", uid: "p0-0", ability: "crop-dust", point: { x: 2, y: 19.5 } }));
    s = r.state;
    const spray = attacks(r.events).find((a) => a.weapon === "Crop Dust")!;
    expect(spray.target).toBe("p1-0");
    expect(spray.hitRolls.length).toBe(9); // the whole 3-wide swarm is within 1" of the path
    expect(spray.hitOn).toBe(4);
    expect(spray.evadeRolls).toBeUndefined(); // the beetles evade blasts, but not a cloud of dust
    const rustler = unitById(s, "p0-0")!;
    expect(rustler.models[0]!.pos.y).toBeCloseTo(19.5, 5);
    expect(rustler.status.acted).toBe(false);
    expect(s.players[0].cp).toBe(7);
  });

  it("refuses a flight that's too long, and runs out after two", () => {
    let s = at(game([L("mil-rustler"), L("munch-nibblers")]), "assault");
    place(s, "p0-0", { x: 2, y: 29 });
    place(s, "p1-0", { x: 28, y: 3 });
    expect(err(applyCommand(s, { type: "ability", uid: "p0-0", ability: "crop-dust", point: { x: 2, y: 15 } }))).toMatch(/Too far/);
    s = ok(applyCommand(s, { type: "ability", uid: "p0-0", ability: "crop-dust", point: { x: 2, y: 22 } }));
    unitById(s, "p0-0")!.status.abilityUsed = false;
    s = ok(applyCommand(s, { type: "ability", uid: "p0-0", ability: "crop-dust", point: { x: 2, y: 28 } }));
    unitById(s, "p0-0")!.status.abilityUsed = false;
    expect(err(applyCommand(s, { type: "ability", uid: "p0-0", ability: "crop-dust", point: { x: 2, y: 22 } }))).toMatch(/used up/);
  });

  it("the AI dusts a swarm it can fly over", () => {
    const s = at(game([L("mil-rustler"), L("munch-nibblers")]), "assault");
    place(s, "p0-0", { x: 2, y: 29 });
    place(s, "p1-0", { x: 0.8, y: 21 });
    expect(aiUses(s, isAbility("crop-dust"))).not.toBeNull();
  });
});

describe("Bale Out", () => {
  it("drops a Junk Barricade near the bomber, once per game", () => {
    let s = at(game([L("mil-bomber"), L("munch-nibblers")]), "movement");
    place(s, "p0-0", { x: 2, y: 27 });
    place(s, "p1-0", { x: 0.8, y: 8 });
    expect(err(applyCommand(s, { type: "ability", uid: "p0-0", ability: "bale-out", point: { x: 2, y: 15 } }))).toMatch(/within 6"/);
    const r = okR(applyCommand(s, { type: "ability", uid: "p0-0", ability: "bale-out", point: { x: 2, y: 22 } }));
    s = r.state;
    const bales = s.units.find((u) => u.profileId === "mil-junk")!;
    expect(bales.owner).toBe(0);
    expect(bales.onBoard).toBe(true);
    expect(bales.expiresRound).toBe(s.round);
    expect(r.events.some((e) => e.type === "summoned" && e.uid === bales.uid)).toBe(true);
    unitById(s, "p0-0")!.status.abilityUsed = false;
    expect(err(applyCommand(s, { type: "ability", uid: "p0-0", ability: "bale-out", point: { x: 2, y: 30 } }))).toMatch(/used up/);
  });

  it("must land clear of enemies", () => {
    const s = at(game([L("mil-bomber"), L("munch-nibblers")]), "movement");
    place(s, "p0-0", { x: 2, y: 27 });
    place(s, "p1-0", { x: 0.8, y: 21 });
    expect(err(applyCommand(s, { type: "ability", uid: "p0-0", ability: "bale-out", point: { x: 2, y: 24.6 } }))).toMatch(/from enemies/);
  });

  it("the AI drops bales in the path of a swarm about to charge", () => {
    const s = at(game([L("mil-bomber", "mil-grunts"), L("munch-nibblers")]), "movement");
    place(s, "p0-0", { x: 5.5, y: 24 });
    place(s, "p0-1", { x: 0.8, y: 26 }).status.acted = true; // the grunts have already moved
    place(s, "p1-0", { x: 0.8, y: 17 });
    expect(aiUses(s, isAbility("bale-out"))).not.toBeNull();
  });
});

describe("Overcharge", () => {
  it("drains the shields for +1 damage on the unit's shots this round", () => {
    let s = at(game([L("con-lancer"), L("munch-mama")], { factions: ["concord", "munch"] }), "assault");
    place(s, "p0-0", { x: 2, y: 28 });
    const mama = place(s, "p1-0", { x: 2.5, y: 8 });
    const lance = profileOf(unitById(s, "p0-0")!).weapons[0]!;
    const before = planShooting(s, unitById(s, "p0-0")!, mama, lance);
    s = ok(applyCommand(s, { type: "ability", uid: "p0-0", ability: "overcharge" }));
    const lancer = unitById(s, "p0-0")!;
    expect(aliveModels(lancer).every((m) => m.shield === 0)).toBe(true);
    expect(s.players[0].cp).toBe(7);
    const after = planShooting(s, lancer, unitById(s, "p1-0")!, lance);
    if (typeof before === "string" || typeof after === "string") throw new Error("expected a shot");
    expect(after.damage).toBe(before.damage + 1);
    lancer.status.abilityUsed = false;
    expect(err(applyCommand(s, { type: "ability", uid: "p0-0", ability: "overcharge" }))).toMatch(/Already overcharged/);
    cleanupRound(s, []);
    expect(lancer.status.overcharged).toBe(false);
  });

  it("needs shields to drain", () => {
    const s = at(game([L("con-lancer"), L("munch-mama")], { factions: ["concord", "munch"] }), "assault");
    const lancer = place(s, "p0-0", { x: 2, y: 28 });
    place(s, "p1-0", { x: 2.5, y: 8 });
    lancer.models[0]!.shield = 0;
    expect(err(applyCommand(s, { type: "ability", uid: "p0-0", ability: "overcharge" }))).toMatch(/No shields/);
  });

  it("the AI overcharges to finish off a wounded monster", () => {
    const s = at(game([L("con-lancer"), L("munch-mama")], { factions: ["concord", "munch"] }), "assault");
    place(s, "p0-0", { x: 2, y: 28 });
    const mama = place(s, "p1-0", { x: 2.5, y: 8 });
    mama.models[0]!.hp = 6;
    expect(aiUses(s, isAbility("overcharge"))).not.toBeNull();
  });
});

describe("Spotlight", () => {
  it("takes away cover, hunkering and digging in against shooting", () => {
    let s = at(game([L("con-sylph"), L("mil-grunts")], { factions: ["concord", "militia"] }), "assault");
    const jets = place(s, "p0-0", { x: 3, y: 28 });
    const grunts = place(s, "p1-0", { x: 0.8, y: 14 });
    grunts.status.hunkered = true;
    const tm = grunts.models[0]!;
    const before = saveNeeded(s, jets, grunts, tm, 1, false, jets.models[0]);
    s = ok(applyCommand(s, { type: "ability", uid: "p0-0", ability: "spotlight", target: "p1-0" }));
    const g = unitById(s, "p1-0")!;
    expect(g.status.exposed).toBe(true);
    const after = saveNeeded(s, unitById(s, "p0-0")!, g, g.models[0]!, 1, false, unitById(s, "p0-0")!.models[0]);
    expect(after).toBe(before! + 2); // entrenched hunkering gave +2
  });

  it("needs range and sight", () => {
    const s = at(game([L("con-sylph"), L("mil-grunts")], { factions: ["concord", "militia"] }), "assault");
    place(s, "p0-0", { x: 3, y: 33 });
    place(s, "p1-0", { x: 0.8, y: 3 });
    expect(err(applyCommand(s, { type: "ability", uid: "p0-0", ability: "spotlight", target: "p1-0" }))).toMatch(/within 16"/);
  });

  it("the AI lights up a dug-in squad before its guns fire", () => {
    const s = at(game([L("con-sylph", "con-lancer", "con-lancer"), L("mil-grunts")], { factions: ["concord", "militia"] }), "assault");
    place(s, "p0-0", { x: 3, y: 28 });
    place(s, "p0-1", { x: 1, y: 30 });
    place(s, "p0-2", { x: 3, y: 31 });
    const grunts = place(s, "p1-0", { x: 0.8, y: 14 });
    grunts.status.hunkered = true;
    grunts.status.dugIn = 1;
    expect(aiUses(s, isAbility("spotlight"))).not.toBeNull();
  });
});

describe("Eye Peck", () => {
  it("a dive that draws blood leaves the target's shooting one worse", () => {
    let seen = false;
    for (let seed = 1; seed < 30 && !seen; seed++) {
      const s = at(game([L("munch-flapjaw"), L("mil-grunts")], { factions: ["munch", "militia"], seed }), "assault");
      place(s, "p0-0", { x: 2, y: 30 });
      place(s, "p1-0", { x: 0.8, y: 20 });
      const r = okR(applyCommand(s, { type: "charge", uid: "p0-0", target: "p1-0" }));
      const dive = attacks(r.events).find((a) => a.weapon === "Dive");
      if (!dive || dive.damage === 0 || dive.unitDestroyed) continue;
      seen = true;
      expect(abilityEvent(r.events, "eye-peck")).toBeDefined();
      const grunts = unitById(r.state, "p1-0")!;
      expect(grunts.status.blinded).toBe(true);
      const shot = planShooting(r.state, grunts, unitById(r.state, "p0-0")!, profileOf(grunts).weapons[0]!);
      if (typeof shot === "string") throw new Error(shot);
      expect(shot.hitOn).toBe(5);
    }
    expect(seen).toBe(true);
  });
});

describe("Twirl Away", () => {
  it("disengages cleanly even when outnumbered", () => {
    let s = at(game([L("con-dancers", "con-guard"), L("munch-nibblers")], { factions: ["concord", "munch"] }), "movement");
    const dancers = place(s, "p0-0", { x: 0.8, y: 26 });
    place(s, "p1-0", { x: 0.8, y: 22.7 });
    expect(isEngaged(s, dancers)).toBe(true);
    expect(disengageOdds(s, dancers).clean).toBe(true);
    s = ok(applyCommand(s, { type: "disengage", uid: "p0-0", leader: 0, to: { x: 0.8, y: 31 } }));
    expect(unitById(s, "p0-0")!.status.disengaged).toBe(false);
    // The Phase Guard, the same size, would be exhausted.
    const t = at(game([L("con-guard"), L("munch-nibblers")], { factions: ["concord", "munch"] }), "movement");
    const guard = place(t, "p0-0", { x: 0.8, y: 26 });
    place(t, "p1-0", { x: 0.8, y: 22.6 });
    expect(isEngaged(t, guard)).toBe(true);
    expect(disengageOdds(t, guard).clean).toBe(false);
  });
});

describe("Pirouette", () => {
  it("steps 3\" away when a charge is declared, which can leave the charge short", () => {
    const s = at(game([L("con-dancers"), L("munch-nibblers")], { factions: ["concord", "munch"] }), "assault", 1);
    const dancers = place(s, "p0-0", { x: 0.8, y: 26 });
    const beetles = place(s, "p1-0", { x: 0.8, y: 16.5 });
    expect(unitGap(beetles, dancers)).toBeLessThan(effectiveMove(s, beetles));
    const r = okR(applyCommand(s, { type: "charge", uid: "p1-0", target: "p0-0" }));
    expect(abilityEvent(r.events, "pirouette")).toBeDefined();
    expect(r.events.some((e) => e.type === "chargeFailed")).toBe(true);
    const d = unitById(r.state, "p0-0")!;
    expect(d.models[0]!.pos.y).toBeCloseTo(29, 1);
    expect(d.reactionsUsed).toContain("pirouette");
    expect(unitById(r.state, "p1-0")!.status.acted).toBe(true);
  });

  it("only once per round: a second charge lands", () => {
    const s = at(game([L("con-dancers"), L("munch-nibblers")], { factions: ["concord", "munch"] }), "assault", 1);
    const dancers = place(s, "p0-0", { x: 0.8, y: 26 });
    place(s, "p1-0", { x: 0.8, y: 16.5 });
    dancers.reactionsUsed = ["pirouette"];
    const r = okR(applyCommand(s, { type: "charge", uid: "p1-0", target: "p0-0" }));
    expect(abilityEvent(r.events, "pirouette")).toBeUndefined();
    expect(isEngaged(r.state, unitById(r.state, "p0-0")!)).toBe(true);
  });
});

describe("Phase Out", () => {
  it("teleports away from a charge that reached it, once per game", () => {
    const s = at(game([L("con-lancer"), L("munch-nibblers")], { factions: ["concord", "munch"] }), "assault", 1);
    place(s, "p0-0", { x: 2, y: 26 });
    place(s, "p1-0", { x: 0.8, y: 20 });
    const r = okR(applyCommand(s, { type: "charge", uid: "p1-0", target: "p0-0" }));
    expect(abilityEvent(r.events, "phase-out")).toBeDefined();
    const lancer = unitById(r.state, "p0-0")!;
    expect(isEngaged(r.state, lancer)).toBe(false);
    expect(lancer.abilityUses["phase-out"]).toBe(1);
    expect(unitById(r.state, "p1-0")!.status.charged).toBe(true);
    expect(attacks(r.events).some((a) => a.kind === "impact")).toBe(false);
    // Used up: the next charge sticks.
    const t = at(game([L("con-lancer"), L("munch-nibblers")], { factions: ["concord", "munch"] }), "assault", 1);
    const l2 = place(t, "p0-0", { x: 2, y: 26 });
    place(t, "p1-0", { x: 0.8, y: 20 });
    l2.abilityUses["phase-out"] = 1;
    const r2 = okR(applyCommand(t, { type: "charge", uid: "p1-0", target: "p0-0" }));
    expect(abilityEvent(r2.events, "phase-out")).toBeUndefined();
  });
});

describe("Riposte", () => {
  it("the charged duellists strike first, once per round", () => {
    const s = at(game([L("con-guard"), L("munch-nibblers")], { factions: ["concord", "munch"] }), "assault", 1);
    place(s, "p0-0", { x: 0.8, y: 26 });
    place(s, "p1-0", { x: 0.8, y: 20 });
    const r = okR(applyCommand(s, { type: "charge", uid: "p1-0", target: "p0-0" }));
    expect(abilityEvent(r.events, "riposte")).toBeDefined();
    const all = attacks(r.events);
    const rip = all.findIndex((a) => a.weapon === "Riposte");
    expect(rip).toBeGreaterThanOrEqual(0);
    expect(all[rip]!.uid).toBe("p0-0");
    expect(all[rip]!.hitOn).toBe(3);
    const impact = all.findIndex((a) => a.kind === "impact");
    if (impact >= 0) expect(rip).toBeLessThan(impact);
    expect(unitById(r.state, "p0-0")!.reactionsUsed).toContain("riposte");
  });
});

describe("charge reactions with the standard rules (rolled charges, close ranks)", () => {
  it("Pirouette and Phase Out still work when the charge is rolled", () => {
    let pirouetted = false;
    let phased = false;
    for (let seed = 1; seed < 20 && !(pirouetted && phased); seed++) {
      const s = at(game([L("con-dancers"), L("munch-nibblers")], { factions: ["concord", "munch"], seed, rules: {} }), "assault", 1);
      place(s, "p0-0", { x: 0.8, y: 26 });
      place(s, "p1-0", { x: 0.8, y: 20 });
      const a = okR(applyCommand(s, { type: "charge", uid: "p1-0", target: "p0-0" }));
      if (abilityEvent(a.events, "pirouette")) pirouetted = true;
      const t = at(game([L("con-lancer"), L("munch-nibblers")], { factions: ["concord", "munch"], seed, rules: {} }), "assault", 1);
      place(t, "p0-0", { x: 2, y: 26 });
      place(t, "p1-0", { x: 0.8, y: 20 });
      const b = okR(applyCommand(t, { type: "charge", uid: "p1-0", target: "p0-0" }));
      const roll = b.events.find((e) => e.type === "chargeRoll");
      if (roll && roll.type === "chargeRoll" && roll.made) {
        expect(abilityEvent(b.events, "phase-out")).toBeDefined();
        expect(isEngaged(b.state, unitById(b.state, "p0-0")!)).toBe(false);
        phased = true;
      }
    }
    expect(pirouetted && phased).toBe(true);
  });
});

describe("Radio Spotter", () => {
  it("the mortar's shells count as spotted when any friendly unit sees the spot", () => {
    const s = game([L("mil-mortar", "mil-grunts"), L("munch-nibblers")]);
    const mortar = place(s, "p0-0", { x: 6.5, y: 9 });
    const grunts = place(s, "p0-1", { x: 11, y: 22 });
    place(s, "p1-0", { x: 28, y: 3 });
    const aim = { x: 6.5, y: 18.5 };
    expect(shellSpotted(s, mortar, aim)).toBe(true);
    grunts.onBoard = false;
    expect(shellSpotted(s, mortar, aim)).toBe(false); // the barn hides the spot from the mortar itself
  });
});

describe("Scrap Cover", () => {
  it("friendly models within 2\" of a Junk Barricade count as in cover against shooting", () => {
    const s = game([L("mil-grunts"), L("mil-grunts")], { factions: ["militia", "militia"] });
    const shooter = place(s, "p0-0", { x: 0.8, y: 26 });
    const target = place(s, "p1-0", { x: 0.8, y: 14 });
    const tm = target.models[6]!; // the back row, nearest the shooters
    const from = shooter.models[0]!;
    const open = saveNeeded(s, shooter, target, tm, 0, false, from);
    const junk = summon(s, 1, "mil-junk", { x: 2, y: 19.5 });
    if (typeof junk === "string") throw new Error(junk);
    expect(saveNeeded(s, shooter, target, tm, 0, false, from)).toBe(open! - 1);
    // Not against melee or blasts, and never for an exposed unit.
    expect(saveNeeded(s, shooter, target, tm, 0, false)).toBe(open);
    target.status.exposed = true;
    expect(saveNeeded(s, shooter, target, tm, 0, false, from)).toBe(open);
  });
});

// ---------- support abilities ----------

describe("Call It In (Grange Hall Radio)", () => {
  it("spots an enemy near your models: your shots hit one better", () => {
    const s = at(game([L("mil-grunts"), L("munch-mama")], { supports: [["mil-radio"], []] }), "assault");
    const grunts = place(s, "p0-0", { x: 0.8, y: 26 });
    const mama = place(s, "p1-0", { x: 2.5, y: 10 });
    const rifle = profileOf(grunts).weapons[0]!;
    const before = planShooting(s, grunts, mama, rifle);
    const r = okR(applyCommand(s, { type: "support", player: 0, support: "mil-radio", ability: "call-it-in", target: "p1-0" }));
    const after = planShooting(r.state, unitById(r.state, "p0-0")!, unitById(r.state, "p1-0")!, rifle);
    if (typeof before === "string" || typeof after === "string") throw new Error("expected shots");
    expect(after.hitOn).toBe(before.hitOn - 1);
    expect(r.state.players[0].supports[0]!.exhausted).toBe(true);
  });

  it("only in reach of your models, and the AI calls in its gunline's target", () => {
    const s = at(game([L("mil-grunts", "mil-grunts", "mil-grunts", "mil-bertha"), L("munch-mama")], { supports: [["mil-radio"], []] }), "assault");
    place(s, "p0-0", { x: 0.8, y: 30 });
    place(s, "p1-0", { x: 30, y: 2 });
    expect(err(applyCommand(s, { type: "support", player: 0, support: "mil-radio", ability: "call-it-in", target: "p1-0" }))).toMatch(/within 24"/);
    place(s, "p0-1", { x: 0.8, y: 26 });
    place(s, "p0-2", { x: 4.5, y: 30 });
    place(s, "p0-3", { x: 2.5, y: 21 });
    place(s, "p1-0", { x: 2.5, y: 8 });
    expect(isSupport("call-it-in")(aiSupportCommand(s))).toBe(true);
  });
});

describe("Dust Cloud (Weather Vane)", () => {
  it("hides a unit from shots more than 12\" away this round", () => {
    const s = at(game([L("mil-grunts"), L("mil-bertha")], { factions: ["militia", "militia"], supports: [["mil-vane"], []] }), "assault");
    place(s, "p0-0", { x: 0.8, y: 28 });
    const bertha = place(s, "p1-0", { x: 2, y: 10 });
    const s2 = ok(applyCommand(s, { type: "support", player: 0, support: "mil-vane", ability: "dust-cloud", target: "p0-0" }));
    const cannon = profileOf(bertha).weapons[0]!;
    const far = planShooting(s2, unitById(s2, "p1-0")!, unitById(s2, "p0-0")!, cannon);
    expect(far).toMatch(/Hidden in dust/);
    place(s2, "p1-0", { x: 2, y: 18 });
    expect(typeof planShooting(s2, unitById(s2, "p1-0")!, unitById(s2, "p0-0")!, cannon)).not.toBe("string");
  });

  it("the AI hides a unit from a big gun out of the dust's reach", () => {
    const s = at(game([L("mil-grunts"), L("mil-bertha")], { factions: ["militia", "militia"], supports: [["mil-vane"], []] }), "assault");
    place(s, "p0-0", { x: 0.8, y: 28 });
    place(s, "p1-0", { x: 2, y: 10 });
    // Dust Devil is already armed, so the card's other ability is the one in play.
    s.players[0].armed = [{ support: "mil-vane", ability: "dust-devil", trigger: "enemyShoots", expiresRound: s.round }];
    expect(isSupport("dust-cloud")(aiSupportCommand(s))).toBe(true);
  });
});

describe("Top Cover (Dirt Airstrip)", () => {
  it("gives a unit Overwatch for the round", () => {
    const s = at(game([L("mil-grunts"), L("munch-nibblers")], { supports: [["mil-airstrip"], []] }), "movement");
    place(s, "p0-0", { x: 0.8, y: 28 });
    place(s, "p1-0", { x: 0.8, y: 10 });
    const s2 = ok(applyCommand(s, { type: "support", player: 0, support: "mil-airstrip", ability: "top-cover", target: "p0-0" }));
    expect(unitById(s2, "p0-0")!.status.overwatching).toBe(true);
    at(s2, "movement", 1);
    const r = okR(applyCommand(s2, { type: "move", uid: "p1-0", leader: 0, to: { x: 0.8, y: 16 } }));
    expect(r.events.some((e) => e.type === "ability" && e.ability === "overwatch" && e.uid === "p0-0")).toBe(true);
  });

  it("the AI covers a gun a swarm has to run at", () => {
    const s = at(game([L("mil-grunts"), L("munch-nibblers")], { supports: [["mil-airstrip"], []] }), "movement");
    place(s, "p0-0", { x: 0.8, y: 28 });
    place(s, "p1-0", { x: 0.8, y: 14 });
    expect(isSupport("top-cover")(aiSupportCommand(s))).toBe(true);
  });
});

describe("Sandbag Drop (Rust Bucket Drop-Ship)", () => {
  it("digs a unit in, and the AI drops sandbags on the unit under the most guns", () => {
    const s = at(game([L("mil-grunts"), L("mil-grunts", "mil-grunts", "mil-bertha")], { factions: ["militia", "militia"], supports: [["mil-dropship"], []] }), "assault");
    place(s, "p0-0", { x: 0.8, y: 28 });
    place(s, "p1-0", { x: 0.8, y: 12 });
    place(s, "p1-1", { x: 4.5, y: 3 });
    place(s, "p1-2", { x: 2, y: 7 });
    const cmd = aiSupportCommand(s);
    expect(isSupport("sandbag-drop")(cmd)).toBe(true);
    const s2 = ok(applyCommand(s, cmd!));
    expect(unitById(s2, "p0-0")!.status.dugIn).toBe(1);
  });
});

describe("Overmind Pulse (Brood Nest)", () => {
  it("+2\" move this round, and it exhausts the nest", () => {
    const s = at(game([L("munch-nibblers"), L("mil-grunts")], { factions: ["munch", "militia"], supports: [["munch-nest"], []] }), "movement");
    const beetles = place(s, "p0-0", { x: 0.8, y: 26 });
    place(s, "p1-0", { x: 0.8, y: 5 });
    const mv = effectiveMove(s, beetles);
    const s2 = ok(applyCommand(s, { type: "support", player: 0, support: "munch-nest", ability: "overmind-pulse", target: "p0-0" }));
    expect(effectiveMove(s2, unitById(s2, "p0-0")!)).toBe(mv + 2);
    at(s2, "combat");
    expect(err(applyCommand(s2, { type: "support", player: 0, support: "munch-nest", ability: "frenzy", target: "p0-0" }))).toMatch(/exhausted/);
  });

  it("the AI pulses a swarm whose charge is just out of reach", () => {
    const s = at(game([L("munch-nibblers"), L("mil-grunts")], { factions: ["munch", "militia"], supports: [["munch-nest"], []] }), "assault");
    const beetles = place(s, "p0-0", { x: 0.8, y: 26 });
    const grunts = place(s, "p1-0", { x: 0.8, y: 12.7 });
    const gap = unitGap(beetles, grunts);
    expect(gap).toBeGreaterThan(effectiveMove(s, beetles));
    expect(gap).toBeLessThan(effectiveMove(s, beetles) + 2);
    expect(isSupport("overmind-pulse")(aiSupportCommand(s))).toBe(true);
  });
});

describe("Undermine (Tunnel Network)", () => {
  it("slows an enemy this round and next; the AI uses it before the enemy moves", () => {
    const s = at(game([L("munch-nibblers"), L("mil-grunts")], { factions: ["munch", "militia"], supports: [["munch-tunnels"], []] }), "movement");
    place(s, "p0-0", { x: 0.8, y: 26 });
    const grunts = place(s, "p1-0", { x: 0.8, y: 14 });
    const mv = effectiveMove(s, grunts);
    const cmd = aiSupportCommand(s);
    expect(isSupport("undermine")(cmd)).toBe(true);
    const s2 = ok(applyCommand(s, cmd!));
    expect(effectiveMove(s2, unitById(s2, "p1-0")!)).toBe(mv - 2);
    at(s2, "assault");
    expect(err(applyCommand(s2, { type: "support", player: 0, support: "munch-tunnels", ability: "undermine", target: "p1-0" }))).toMatch(/exhausted|movement phase/);
  });

  it("the AI doesn't spend the CP a swarm about to fight needs for Feeding Frenzy", () => {
    const setup = (cp: number) => {
      const s = at(game([L("munch-nibblers"), L("mil-grunts")], { factions: ["munch", "militia"], supports: [["munch-nest", "munch-tunnels"], []] }), "movement");
      s.players[0].cp = cp;
      place(s, "p0-0", { x: 0.8, y: 26 });
      place(s, "p1-0", { x: 0.8, y: 19 });
      return s;
    };
    // With CP to spare it undermines; with only Feeding Frenzy's CP left it keeps it.
    expect(isSupport("undermine")(aiSupportCommand(setup(2)))).toBe(true);
    expect(isSupport("undermine")(aiSupportCommand(setup(1)))).toBe(false);
  });
});

describe("Eye-Watering Reek (Stink Gland)", () => {
  it("an enemy's shooting hits one worse; units without guns can't be put off", () => {
    const s = at(game([L("munch-mama"), L("mil-bertha", "munch-nibblers")], { factions: ["munch", "militia"], supports: [["munch-stink"], []], rules: {} }), "assault");
    const mama = place(s, "p0-0", { x: 2.5, y: 26 });
    const bertha = place(s, "p1-0", { x: 2, y: 17 });
    place(s, "p1-1", { x: 0.8, y: 19 });
    const cannon = profileOf(bertha).weapons[0]!;
    const before = planShooting(s, bertha, mama, cannon);
    expect(err(applyCommand(s, { type: "support", player: 0, support: "munch-stink", ability: "eye-watering-reek", target: "p1-1" }))).toMatch(/no guns/);
    const s2 = ok(applyCommand(s, { type: "support", player: 0, support: "munch-stink", ability: "eye-watering-reek", target: "p1-0" }));
    const after = planShooting(s2, unitById(s2, "p1-0")!, unitById(s2, "p0-0")!, cannon);
    if (typeof before === "string" || typeof after === "string") throw new Error("expected shots");
    expect(after.hitOn).toBe(before.hitOn + 1);
  });

  it("the AI blinds the big gun aimed at its wounded monster", () => {
    const s = at(game([L("munch-mama"), L("mil-bertha")], { factions: ["munch", "militia"], supports: [["munch-stink"], []], rules: {} }), "assault");
    const mama = place(s, "p0-0", { x: 2.5, y: 26 });
    mama.models[0]!.hp = 5;
    place(s, "p1-0", { x: 2, y: 17 });
    expect(isSupport("eye-watering-reek")(aiSupportCommand(s))).toBe(true);
  });
});

describe("Resonance (Choir of Light)", () => {
  it("a unit and its friends within 6\" recharge 1 shield per model", () => {
    const s = at(game([L("con-lancer", "con-lancer", "con-lancer"), L("munch-nibblers")], { factions: ["concord", "munch"], supports: [["con-choir"], []] }), "movement");
    const a = place(s, "p0-0", { x: 2, y: 28 });
    const b = place(s, "p0-1", { x: 6, y: 28 });
    const far = place(s, "p0-2", { x: 20, y: 31 });
    place(s, "p1-0", { x: 28, y: 3 });
    for (const u of [a, b, far]) u.models[0]!.shield = 0;
    const s2 = ok(applyCommand(s, { type: "support", player: 0, support: "con-choir", ability: "resonance", target: "p0-0" }));
    expect(unitById(s2, "p0-0")!.models[0]!.shield).toBe(1);
    expect(unitById(s2, "p0-1")!.models[0]!.shield).toBe(1);
    expect(unitById(s2, "p0-2")!.models[0]!.shield).toBe(0);
  });

  it("the AI rings it out over a drained group (Hold Fast already armed)", () => {
    const s = at(game([L("con-lancer", "con-lancer"), L("munch-nibblers")], { factions: ["concord", "munch"], supports: [["con-choir"], []] }), "movement");
    const a = place(s, "p0-0", { x: 2, y: 28 });
    const b = place(s, "p0-1", { x: 6, y: 28 });
    place(s, "p1-0", { x: 28, y: 3 });
    a.models[0]!.shield = 0;
    b.models[0]!.shield = 0;
    s.players[0].armed = [{ support: "con-choir", ability: "hold-fast", trigger: "enemyCharges", expiresRound: s.round }];
    expect(isSupport("resonance")(aiSupportCommand(s))).toBe(true);
  });
});

describe("Glaring Light (Star Lens)", () => {
  it("an enemy unit in sight loses cover, hunker and dig-in bonuses; the AI uses it on a dug-in gunline", () => {
    const s = at(game([L("con-sylph", "con-lancer", "con-lancer"), L("mil-grunts")], { factions: ["concord", "militia"], supports: [["con-lens"], []] }), "assault");
    place(s, "p0-0", { x: 3, y: 28 });
    place(s, "p0-1", { x: 1, y: 30 });
    place(s, "p0-2", { x: 3, y: 31 });
    const grunts = place(s, "p1-0", { x: 0.8, y: 14 });
    grunts.status.hunkered = true;
    grunts.status.dugIn = 1;
    s.players[0].cp = 2; // too little for the Sunbeam
    const cmd = aiSupportCommand(s);
    expect(isSupport("glaring-light")(cmd)).toBe(true);
    const s2 = ok(applyCommand(s, cmd!));
    expect(unitById(s2, "p1-0")!.status.exposed).toBe(true);
  });
});

describe("Withering Review (Court of Disdain)", () => {
  it("a silenced unit can't use abilities and its Overwatch doesn't fire", () => {
    let s = at(game([L("con-guard"), L("mil-grunts", "munch-mama")], { factions: ["concord", "militia"], supports: [["con-court"], []], lists: [L("con-guard"), [{ profileId: "mil-grunts", upgrades: ["overwatch"] }, { profileId: "munch-mama", upgrades: [] }]] }), "movement");
    place(s, "p0-0", { x: 0.8, y: 28 });
    place(s, "p1-0", { x: 0.8, y: 14 });
    place(s, "p1-1", { x: 2.5, y: 21 });
    s = ok(applyCommand(s, { type: "support", player: 0, support: "con-court", ability: "withering-review", target: "p1-1" }));
    at(s, "movement", 1);
    expect(err(applyCommand(s, { type: "ability", uid: "p1-1", ability: "sugar-rush" }))).toMatch(/Silenced/);
    at(s, "movement", 0);
    s.players[0].supports = s.players[0].supports.map((c) => ({ ...c, exhausted: false }));
    s = ok(applyCommand(s, { type: "support", player: 0, support: "con-court", ability: "withering-review", target: "p1-0" }));
    const r = okR(applyCommand(s, { type: "move", uid: "p0-0", leader: 0, to: { x: 0.8, y: 23.5 } }));
    expect(r.events.some((e) => e.type === "ability" && e.ability === "overwatch")).toBe(false);
  });

  it("the AI silences the overwatch its units are about to walk into", () => {
    const s = at(game([L("con-guard"), L("mil-grunts")], { factions: ["concord", "militia"], supports: [["con-court"], []], lists: [L("con-guard"), [{ profileId: "mil-grunts", upgrades: ["overwatch"] }]] }), "movement");
    place(s, "p0-0", { x: 0.8, y: 28 });
    place(s, "p1-0", { x: 0.8, y: 14 });
    expect(isSupport("withering-review")(aiSupportCommand(s))).toBe(true);
  });
});

describe("Flash Step (Light Gate)", () => {
  it("in the assault phase a unit flashes 4\" and can still shoot; the AI flashes a gun into range", () => {
    const s = at(game([L("con-lancer"), L("munch-mama")], { factions: ["concord", "munch"], supports: [["con-gate"], []] }), "assault");
    const lancer = place(s, "p0-0", { x: 2, y: 33 });
    const mama = place(s, "p1-0", { x: 2.5, y: 5 });
    mama.models[0]!.hp = 6;
    expect(typeof planShooting(s, lancer, mama, profileOf(lancer).weapons[0]!)).toBe("string");
    const cmd = aiSupportCommand(s);
    expect(isSupport("flash-step")(cmd)).toBe(true);
    const s2 = ok(applyCommand(s, cmd!));
    const l2 = unitById(s2, "p0-0")!;
    expect(l2.status.acted).toBe(false);
    expect(typeof planShooting(s2, l2, unitById(s2, "p1-0")!, profileOf(l2).weapons[0]!)).not.toBe("string");
    expect(err(applyCommand(s2, { type: "support", player: 0, support: "con-gate", ability: "gate-step", target: "p0-0", point: { x: 2, y: 25 } }))).toMatch(/exhausted|movement phase/);
  });
});

describe("Afterglow (Grand Portal)", () => {
  it("+1 shield per model above the maximum for the round; the AI shields the unit under fire", () => {
    const s = at(game([L("con-guard"), L("mil-grunts", "mil-grunts")], { factions: ["concord", "militia"], supports: [["con-portal"], []] }), "assault");
    place(s, "p0-0", { x: 0.8, y: 26 });
    place(s, "p1-0", { x: 0.8, y: 12 });
    place(s, "p1-1", { x: 4.5, y: 4 });
    const cmd = aiSupportCommand(s);
    expect(isSupport("afterglow")(cmd)).toBe(true);
    const s2 = ok(applyCommand(s, cmd!));
    const guard = unitById(s2, "p0-0")!;
    expect(aliveModels(guard).every((m) => m.shield === profileOf(guard).shield + 1)).toBe(true);
    cleanupRound(s2, []);
    expect(aliveModels(guard).every((m) => m.shield === profileOf(guard).shield)).toBe(true);
  });
});
