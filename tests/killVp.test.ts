import { describe, expect, it } from "vitest";
import { applyDamage, planShooting } from "../src/engine/combat";
import { BLAST_SQUAD } from "../src/engine/constants";
import { createGame } from "../src/engine/game";
import { MISSIONS } from "../src/engine/data/missions";
import { profileFor, profileOf } from "../src/engine/profile";
import { freshStatus } from "../src/engine/supports";
import { aliveModels, supplyFor, unitById } from "../src/engine/rules";
import { scoreRound } from "../src/engine/scoring";
import type { GameEvent, GameState, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

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

const unitOf = (s: GameState, owner: 0 | 1, profileId: string): Unit => s.units.find((u) => u.owner === owner && u.profileId === profileId)!;

/** Kill the next living model outright, returning the VP the killer gained. */
function killOne(s: GameState, u: Unit, events: GameEvent[] = []): number {
  const before = s.players[u.owner === 0 ? 1 : 0].vp;
  const m = aliveModels(u)[0]!;
  applyDamage(s, u, m, m.hp + m.shield, events);
  return s.players[u.owner === 0 ? 1 : 0].vp - before;
}

describe("kill VP follows the supply a squad loses", () => {
  it("pays as the squad's supply drops, not only for the last model", () => {
    const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 7, missionId: "brawl" });
    const pack = unitOf(s, 1, "munch-nibblers");
    const p = profileOf(pack);
    expect(p.models).toBeGreaterThan(1);
    place(s, pack.uid, { x: 26, y: 8 });
    const paid: number[] = [];
    const events: GameEvent[] = [];
    for (let i = 0; i < p.models; i++) paid.push(killOne(s, pack, events));
    // Each kill pays exactly the supply it cost the squad.
    paid.forEach((vp, i) => expect(vp, `kill ${i + 1}`).toBe(supplyFor(p, p.models - i) - supplyFor(p, p.models - i - 1)));
    expect(paid.reduce((a, b) => a + b, 0)).toBe(p.supply);
    // Some of it arrives before the squad is wiped out.
    expect(paid.slice(0, -1).some((vp) => vp > 0)).toBe(true);
    expect(events.some((e) => e.type === "scored" && /cutting down/.test(e.reason))).toBe(true);
  });

  it("a single-model unit still pays its full supply when it dies", () => {
    const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 7, missionId: "brawl" });
    const mama = unitOf(s, 1, "munch-mama");
    place(s, mama.uid, { x: 26, y: 8 });
    expect(killOne(s, mama)).toBe(profileOf(mama).supply);
  });

  it("regrown models don't pay out twice", () => {
    const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 7, missionId: "brawl" });
    const pack = unitOf(s, 1, "munch-nibblers");
    const p = profileOf(pack);
    place(s, pack.uid, { x: 26, y: 8 });
    // Kill until the squad has conceded 1 supply.
    let total = 0;
    while (total < 1) total += killOne(s, pack);
    // Bring every model back, then lose the same number again: nothing more is owed.
    const dead = pack.models.filter((m) => !m.alive);
    for (const m of dead) Object.assign(m, { alive: true, hp: p.hp, shield: p.shield });
    for (let i = 0; i < dead.length; i++) total += killOne(s, pack);
    expect(total).toBe(1);
  });

  it("a half rate (Scrapheap Showdown) pays 1 VP each time the side's conceded supply passes another 2", () => {
    const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 7, missionId: "scrapheap" });
    const rate = MISSIONS.scrapheap!.scoring.find((r) => r.kind === "eliminate")!;
    expect(rate.kind === "eliminate" && rate.vpPerSupply).toBe(0.5);
    const packs = s.units.filter((u) => u.owner === 1 && profileOf(u).models > 1);
    expect(packs.length).toBeGreaterThan(1);
    packs.forEach((u, i) => place(s, u.uid, { x: 4 + i * 8, y: 8 }));
    let conceded = 0;
    for (const u of packs) {
      while (aliveModels(u).length) {
        const vp = killOne(s, u);
        conceded = packs.reduce((n, x) => n + (x.supplyPaid ?? 0), 0);
        expect(vp).toBeLessThanOrEqual(1);
        // VP always equals half the side's conceded supply, rounded down, across squads.
        expect(s.players[0].vp).toBe(Math.floor(conceded / 2));
      }
    }
    expect(conceded).toBe(packs.reduce((n, u) => n + profileOf(u).supply, 0));
  });

  it("the cull scoring rule counts the supply squads have conceded", () => {
    // Convoy's second side, the Raiders, scores the cull.
    const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["munch", "militia"], seed: 7, missionId: "convoy" });
    const pack = unitOf(s, 0, "munch-nibblers");
    const p = profileOf(pack);
    place(s, pack.uid, { x: 26, y: 8 });
    const keep = p.models - Math.ceil(p.models / p.supply); // lose one supply's worth of models
    while (aliveModels(pack).length > keep) killOne(s, pack);
    const owed = p.supply - supplyFor(p, keep);
    expect(owed).toBeGreaterThan(0);
    expect(pack.supplyPaid).toBe(owed);
    const events: GameEvent[] = [];
    scoreRound(s, events);
    const cull = events.filter((e) => e.type === "scored" && e.player === 1 && /enemy supply/.test(e.reason));
    expect(cull.reduce((n, e) => n + (e.type === "scored" ? e.vp : 0), 0)).toBe(owed);
  });
});

describe("blast weapons", () => {
  it(`get their extra die only against squads of ${BLAST_SQUAD} or more models`, () => {
    const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 8 });
    // Field a Spud Mortar whether or not the starter list has one.
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
    const mortar = place(s, "test-mortar", { x: 18, y: 8 });
    const w = prof.weapons.find((x) => x.traits?.includes("blast"))!;
    expect(w).toBeDefined();
    const pack = place(s, unitOf(s, 1, "munch-nibblers").uid, { x: 26, y: 8 });
    expect(aliveModels(pack).length).toBeGreaterThanOrEqual(BLAST_SQUAD);
    const dice = () => {
      const plan = planShooting(s, mortar, pack, w);
      if (typeof plan === "string") throw new Error(plan);
      return plan.attackers[0]!.dice;
    };
    const big = dice();
    while (aliveModels(pack).length >= BLAST_SQUAD) aliveModels(pack).at(-1)!.alive = false;
    expect(dice()).toBe(big - 1);
  });
});
