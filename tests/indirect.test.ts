import { describe, expect, it } from "vitest";
import { burstAt, expectedDamage, planShooting, scatterShell, shellAim, shellOdds } from "../src/engine/combat";
import { SHELL_BURST, SHELL_DRIFT } from "../src/engine/constants";
import { createGame } from "../src/engine/game";
import { dist, rect } from "../src/engine/geometry";
import { profileFor, profileOf } from "../src/engine/profile";
import { aliveModels, unitById } from "../src/engine/rules";
import { freshStatus } from "../src/engine/supports";
import type { GameEvent, GameState, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";
import { registerMunch } from "./helpers/munch";

// The Munch are a Forge template now: register a test copy under their old ids.
registerMunch();

function place(_s: GameState, u: Unit, at: Vec): Unit {
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.1), y: at.y + Math.floor(i / 3) * (2 * r + 0.1) };
    m.elevation = 0;
  });
  return u;
}

/** A game with a Pipe Mortar for player 0, a building between it and a pack of beetles, and nothing else on the table. */
function setup(seed: number, wall = true): { s: GameState; mortar: Unit; pack: Unit } {
  const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed, missionId: "brawl" });
  s.terrain = wall ? [{ id: "b", kind: "building", level: 0, poly: rect(12, 0, 3, 35) }] : [];
  const prof = profileFor("mil-mortar", []);
  s.units.push({
    uid: "test-mortar",
    profileId: "mil-mortar",
    upgrades: [],
    owner: 0,
    models: [{ id: 0, pos: { x: 0, y: 0 }, elevation: 0, hp: prof.hp, shield: prof.shield, alive: true }],
    onBoard: false,
    destroyed: false,
    status: freshStatus(0),
    abilityUses: {},
    reactionsUsed: [],
  });
  const mortar = place(s, unitById(s, "test-mortar")!, { x: 4, y: 17 });
  const pack = place(s, s.units.find((u) => u.owner === 1 && u.profileId === "munch-nibblers")!, { x: 24, y: 16 });
  return { s, mortar, pack };
}

const lobber = (u: Unit) => profileOf(u).weapons.find((w) => w.traits?.includes("indirect"))!;

describe("indirect fire (mortars)", () => {
  it("needs no line of sight, only range", () => {
    const { s, mortar, pack } = setup(1);
    const plan = planShooting(s, mortar, pack, lobber(mortar));
    if (typeof plan === "string") throw new Error(plan);
    expect(plan.indirect).toBe(true);
    expect(expectedDamage(s, mortar, pack, plan, false)).toBeGreaterThan(0);
  });

  it("lands on target on its hit roll, else drifts up to a d6 (halved when the spot can be seen)", () => {
    for (const wall of [true, false]) {
      let onTarget = 0;
      let n = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const { s, mortar, pack } = setup(seed, wall);
        const aim = shellAim(pack);
        const events: GameEvent[] = [];
        const landed = scatterShell(s, mortar, "Spud Lobber", aim, 4, events);
        const e = events.find((x) => x.type === "scatter")!;
        if (e.type !== "scatter") throw new Error("no scatter event");
        expect(e.spotted).toBe(!wall);
        n++;
        if (e.roll >= 4) {
          onTarget++;
          expect(landed).toEqual(aim);
          expect(e.drift).toBe(0);
        } else {
          expect(e.drift).toBeGreaterThanOrEqual(1);
          expect(e.drift).toBeLessThanOrEqual(shellOdds(4, e.spotted).maxDrift);
          expect(dist(aim, landed)).toBeLessThanOrEqual(e.drift + 1e-9);
        }
      }
      // About half land on target at 4+.
      expect(onTarget / n).toBeGreaterThan(0.38);
      expect(onTarget / n).toBeLessThan(0.62);
    }
    expect(shellOdds(4, false).maxDrift).toBe(SHELL_DRIFT);
  });

  it("bursts on every ground model under it, friend or foe", () => {
    const { s, mortar, pack } = setup(4);
    const friends = place(s, s.units.find((u) => u.owner === 0 && u.profileId === "mil-grunts")!, { x: 24, y: 14 });
    const p = shellAim(pack);
    const events: GameEvent[] = [];
    burstAt(s, mortar, "Spud Lobber", p, { hit: 4, damage: 1, ap: 1 }, events);
    const hit = events.filter((e) => e.type === "attack").map((e) => (e.type === "attack" ? e.report.target : ""));
    expect(hit).toContain(pack.uid);
    const friendsUnder = aliveModels(friends).some((m) => dist(m.pos, p) <= SHELL_BURST + profileOf(friends).baseRadius);
    expect(hit.includes(friends.uid)).toBe(friendsUnder);
    expect(friendsUnder).toBe(true);
    for (const e of events) {
      if (e.type !== "attack") continue;
      const t = unitById(s, e.report.target)!;
      const under = t.models.filter((m) => dist(m.pos, p) <= SHELL_BURST + profileOf(t).baseRadius).length;
      expect(e.report.hitRolls).toHaveLength(under);
    }
  });

  it("can't be fired as overwatch", () => {
    const { s, mortar, pack } = setup(2);
    expect(planShooting(s, mortar, pack, lobber(mortar), "overwatch")).toMatch(/lobbed/);
  });
});
