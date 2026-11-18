// The Skitterswarm's own abilities: Corrode (acid softens a target for the rest of the swarm) and the
// Broodmother's Brood Bond (hurt broods around her regrow a model every round, hurt or not), plus how
// the AI plays them and a whole AI game with the starter armies.

import { describe, expect, it } from "vitest";
import { aiCommand, evaluate } from "../src/engine/ai";
import { expectedDamage, planShooting, resolveAttack, saveNeeded } from "../src/engine/combat";
import { ABILITIES } from "../src/engine/data/abilities";
import { applyCommand, createGame } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { aliveModels, unitById } from "../src/engine/rules";
import { cleanupRound } from "../src/engine/scoring";
import type { GameEvent, GameState, ListEntry, Unit, Vec } from "../src/engine/types";

const L = (...ids: string[]): ListEntry[] => ids.map((profileId) => ({ profileId, upgrades: [] }));

function game(lists: [ListEntry[], ListEntry[]]): GameState {
  const s = createGame({ factions: ["swarm", "militia"], seed: 9, lists, supports: [[], []] });
  Object.assign(s, { initiative: 0, activePlayer: 0, orderChoice: null, terrain: [], access: [] });
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

/** Shoot until an attack deals damage (seeded dice), returning the events of that attack. */
function shootUntilHurt(s: GameState, a: Unit, t: Unit, weapon = 0): GameEvent[] {
  const w = profileOf(a).weapons[weapon]!;
  for (let i = 0; i < 40; i++) {
    const plan = planShooting(s, a, t, w);
    if (typeof plan === "string") throw new Error(plan);
    const events: GameEvent[] = [];
    if (resolveAttack(s, a, t, w.name, plan, "shoot", events).damage > 0) return events;
  }
  throw new Error("never hurt");
}

describe("Corrode", () => {
  it("is a passive ability with a price", () => {
    expect(ABILITIES.corrode.kind).toBe("passive");
    expect(ABILITIES["brood-bond"].kind).toBe("passive");
  });

  it("an acid hit leaves the target's saves one worse for the round, against everyone; it doesn't stack", () => {
    const s = game([L("swarm-spitters", "swarm-skitterlings"), L("mil-grunts")]);
    const spit = place(s, "p0-0", { x: 10, y: 22 });
    const bugs = place(s, "p0-1", { x: 20, y: 22 });
    const grunts = place(s, "p1-0", { x: 10, y: 12 });
    const before = saveNeeded(s, bugs, grunts, grunts.models[0]!, 0, true);
    const events = shootUntilHurt(s, spit, grunts);
    expect(grunts.status.corroded).toBe(true);
    expect(events.some((e) => e.type === "ability" && e.ability === "corrode" && e.uid === spit.uid)).toBe(true);
    // Melee from a different unit, and shooting, both feel it.
    expect(saveNeeded(s, bugs, grunts, grunts.models[0]!, 0, true)).toBe(before! + 1);
    expect(saveNeeded(s, spit, grunts, grunts.models[0]!, 0, false)).toBe(profileOf(grunts).armor + 1);
    // No stacking: a second acid hit changes nothing and says nothing.
    const again = shootUntilHurt(s, spit, grunts);
    expect(again.some((e) => e.type === "ability" && e.ability === "corrode")).toBe(false);
    expect(saveNeeded(s, bugs, grunts, grunts.models[0]!, 0, true)).toBe(before! + 1);
    // Gone at the end of the round.
    cleanupRound(s, []);
    expect(unitById(s, grunts.uid)!.status.corroded).toBe(false);
    expect(saveNeeded(s, bugs, unitById(s, grunts.uid)!, grunts.models[0]!, 0, true)).toBe(before);
  });

  it("only units with acid corrode, and the AI's odds count the softer target", () => {
    const s = game([L("swarm-spitters"), L("mil-grunts")]);
    const spit = place(s, "p0-0", { x: 20, y: 22 });
    const grunts = place(s, "p1-0", { x: 10, y: 12 });
    // The Rivet Grunts have no acid: their shots never corrode anything.
    const rifle = profileOf(grunts).weapons[0]!;
    const plan = planShooting(s, grunts, spit, rifle);
    if (typeof plan === "string") throw new Error(plan);
    resolveAttack(s, grunts, spit, rifle.name, plan, "shoot", []);
    expect(spit.status.corroded ?? false).toBe(false);
    // Expected damage (what the AI weighs) goes up on a corroded target.
    const acid = profileOf(spit).weapons[0]!;
    const p2 = planShooting(s, spit, grunts, acid);
    if (typeof p2 === "string") throw new Error(p2);
    const plain = expectedDamage(s, spit, grunts, p2, false);
    grunts.status.corroded = true;
    expect(expectedDamage(s, spit, grunts, p2, false)).toBeGreaterThan(plain);
  });
});

describe("Brood Bond", () => {
  it("regrows a model in every hurt unit near the Broodmother at the end of the round, even after damage", () => {
    const s = game([L("swarm-mother", "swarm-skitterlings", "swarm-spitters"), L("mil-grunts")]);
    place(s, "p0-0", { x: 10, y: 20 });
    const near = place(s, "p0-1", { x: 14, y: 20 });
    const far = place(s, "p0-2", { x: 30, y: 30 });
    place(s, "p1-0", { x: 30, y: 4 });
    for (const u of [near, far]) {
      u.models[0]!.alive = false;
      u.models[1]!.alive = false;
      u.status.hurt = true; // took damage this round: plain Regrow wouldn't fire
    }
    const events: GameEvent[] = [];
    cleanupRound(s, events);
    expect(aliveModels(unitById(s, near.uid)!).length).toBe(profileOf(near).models - 1);
    expect(aliveModels(unitById(s, far.uid)!).length).toBe(profileOf(far).models - 2);
    expect(events.some((e) => e.type === "ability" && e.ability === "brood-bond" && e.uid === "p0-0")).toBe(true);
  });

  it("doesn't stack with Regrow, doesn't touch structures or the Broodmother herself, and stops when she's gone", () => {
    const s = game([L("swarm-mother", "swarm-skitterlings"), L("mil-grunts")]);
    const mother = place(s, "p0-0", { x: 10, y: 20 });
    const bugs = place(s, "p0-1", { x: 14, y: 20 });
    place(s, "p1-0", { x: 30, y: 4 });
    for (const m of bugs.models.slice(0, 3)) m.alive = false;
    // Unhurt, with its own Regrow and the bond: still only one model back.
    cleanupRound(s, []);
    expect(aliveModels(unitById(s, bugs.uid)!).length).toBe(profileOf(bugs).models - 2);
    // She's gone: a hurt brood gets nothing.
    const b = unitById(s, bugs.uid)!;
    unitById(s, mother.uid)!.destroyed = true;
    unitById(s, mother.uid)!.onBoard = false;
    b.status.hurt = true;
    cleanupRound(s, []);
    expect(aliveModels(unitById(s, bugs.uid)!).length).toBe(profileOf(bugs).models - 2);
  });

  it("the AI values a hurt brood next to the Broodmother over one out on its own", () => {
    const s = game([L("swarm-mother", "swarm-skitterlings"), L("mil-grunts")]);
    place(s, "p0-0", { x: 10, y: 20 });
    const bugs = place(s, "p0-1", { x: 14, y: 20 });
    place(s, "p1-0", { x: 30, y: 4 });
    bugs.models[0]!.alive = false;
    const close = evaluate(s, 0);
    place(s, bugs.uid, { x: 28, y: 28 });
    expect(evaluate(s, 0)).toBeLessThan(close);
  });
});

describe("the Skitterswarm in play", () => {
  it("plays a whole Skirmish game against the Militia with its starter armies without an illegal move", () => {
    let s = createGame({ factions: ["swarm", "militia"], mapId: "dustbowl", seed: 12, orderChoice: true });
    const used = new Set<string>();
    for (let i = 0; i < 4000 && !s.over; i++) {
      const cmd = aiCommand(s);
      const r = applyCommand(s, cmd);
      if (!r.ok) throw new Error(`illegal AI move at step ${i}: ${JSON.stringify(cmd)}: ${r.error}`);
      for (const e of r.events) if (e.type === "ability") used.add(e.ability);
      s = r.state;
    }
    expect(s.over).toBe(true);
    // The acid lands at least once in a whole game.
    expect(used.has("corrode")).toBe(true);
  }, 240_000);
});
