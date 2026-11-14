// Mission scoring kinds (crown, shifting, bounty, loot, guard, cull, convoy), role setup and map fit.

import { describe, expect, it } from "vitest";
import { playAiTurn } from "../src/engine/ai";
import { MAPS } from "../src/engine/data/maps";
import { economyOf, MISSIONS, missionFitsMap, missionMapProblem, rulesFor } from "../src/engine/data/missions";
import { applyCommand, createGame } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { onBoard, supplyUsed, unitById } from "../src/engine/rules";
import { crownObjectives, economyState, forwardObjective, scoreRound, updateFlags } from "../src/engine/scoring";
import type { FactionId, GameEvent, GameState, Objective, PlayerId, Unit, Vec } from "../src/engine/types";

/** Put a reserve unit on the board in a tight cluster around `at` (test helper, bypasses rules). */
function place(s: GameState, owner: PlayerId, at: Vec, nth = 0, elevation: 0 | 1 = 0): Unit {
  const u = s.units.filter((x) => x.owner === owner && !x.onBoard && !x.destroyed && !profileOf(x).structure && !profileOf(x).keywords.includes("flying"))[nth]!;
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.1) - r, y: at.y + Math.floor(i / 3) * (2 * r + 0.1) - r };
    m.elevation = elevation;
  });
  return u;
}

function lift(u: Unit): void {
  u.onBoard = false;
}

const obj = (s: GameState, n: number): Objective => s.objectives.find((o) => o.number === n)!;

function score(s: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  scoreRound(s, events);
  s.round += 1;
  return events;
}

const vpOf = (events: GameEvent[], p: PlayerId): number => events.reduce((n, e) => n + (e.type === "scored" && e.player === p ? e.vp : 0), 0);

function game(missionId: string, mapId: string, factions: [FactionId, FactionId] = ["militia", "munch"]): GameState {
  return createGame({ factions, seed: 3, missionId, mapId });
}

describe("mission data", () => {
  it("every mission has a blurb, rounds, and at least one built-in map it fits", () => {
    for (const m of Object.values(MISSIONS)) {
      expect(m.blurb.length).toBeGreaterThan(20);
      expect(m.rounds).toBeGreaterThan(2);
      expect(Object.values(MAPS).some((map) => missionFitsMap(m, map)), m.id).toBe(true);
      for (const r of m.roles ?? []) expect(r.blurb.length).toBeGreaterThan(20);
    }
  });

  it("role missions need tagged maps; symmetric missions stay off asymmetric maps", () => {
    expect(missionFitsMap(MISSIONS.siege!, MAPS.grubstake!)).toBe(true);
    expect(missionMapProblem(MISSIONS.siege!, MAPS.dustbowl!)).toMatch(/needs a battlefield/);
    expect(missionFitsMap(MISSIONS.salvage!, MAPS.velvetcomet!)).toBe(true);
    expect(missionFitsMap(MISSIONS.convoy!, MAPS.gemhaul!)).toBe(true);
    expect(missionMapProblem(MISSIONS.hold!, MAPS.grubstake!)).toMatch(/role missions/);
    expect(missionFitsMap(MISSIONS.hill!, MAPS.mesa!)).toBe(true);
    expect(missionMapProblem(MISSIONS.hill!, MAPS.highway!)).toMatch(/skirmish/);
  });

  it("roles override the economy and add their own scoring", () => {
    const m = MISSIONS.siege!;
    expect(economyOf(m, 0).startResources).toBe(m.roles![0].economy!.startResources);
    expect(economyOf(m, 1).income).toBe(m.roles![1].economy!.income);
    expect(economyOf(m, 0).maxSupply).toBe(m.maxSupply);
    expect(rulesFor(m, 0).some((r) => r.kind === "guard")).toBe(true);
    expect(rulesFor(m, 1).some((r) => r.kind === "guard")).toBe(false);
    expect(economyOf(MISSIONS.hold!, 1)).toEqual(economyOf(MISSIONS.hold!, 0));
  });
});

describe("role setup", () => {
  it("siege: the defender's garrison is on the board by its stronghold, and its supply is added on top", () => {
    const s = game("siege", "grubstake");
    const m = MISSIONS.siege!;
    const g = s.units.filter((u) => u.uid.includes("garrison"));
    expect(g).toHaveLength(1);
    expect(g[0]!.owner).toBe(0);
    expect(g[0]!.onBoard).toBe(true);
    expect(profileOf(g[0]!).structure?.lifetime).toBe("permanent");
    const fwd = forwardObjective(s, 0)!;
    expect(Math.hypot(g[0]!.models[0]!.pos.x - fwd.pos.x, g[0]!.models[0]!.pos.y - fwd.pos.y)).toBeLessThan(fwd.radius + 8);
    const sup = profileOf(g[0]!).supply;
    expect(s.players[0].supplyCap).toBe(economyOf(m, 0).startSupply + sup);
    expect(supplyUsed(s, 0)).toBe(sup);
    expect(economyState(s, 0).maxSupply).toBe(m.maxSupply + sup);
    expect(s.players[0].resources).toBe(economyOf(m, 0).startResources);
    expect(s.players[1].resources).toBe(economyOf(m, 1).startResources);
  });

  it("each side gets its own income and supply growth at the end of the round", () => {
    let s = game("salvage", "velvetcomet");
    const start = [s.players[0].resources, s.players[1].resources];
    const cap = [s.players[0].supplyCap, s.players[1].supplyCap];
    let guard = 0;
    while (s.round === 1 && guard++ < 20) {
      const r = applyCommand(s, { type: "pass", player: s.activePlayer });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const m = MISSIONS.salvage!;
    for (const p of [0, 1] as const) {
      expect(s.players[p].resources).toBe(start[p]! + economyOf(m, p).income);
      expect(s.players[p].supplyCap).toBe(cap[p]! + economyOf(m, p).supplyPerRound);
    }
  });
});

describe("crown (Top of the Heap)", () => {
  it("pays 1, 2, 3, 4, 4 for consecutive rounds and resets when the heap is lost", () => {
    const s = game("hill", "mesa");
    const [crown] = crownObjectives(s);
    expect(crown!.number).toBe(1);
    const u = place(s, 0, crown!.pos);
    const paid = [1, 2, 3, 4, 5].map(() => vpOf(score(s), 0));
    expect(paid).toEqual([1, 2, 3, 4, 4]);
    lift(u);
    expect(vpOf(score(s), 0)).toBe(0);
    place(s, 0, crown!.pos, 1);
    expect(vpOf(score(s), 0)).toBe(1);
  });

  it("other neutral objectives pay the flat VP", () => {
    const s = game("hill", "mesa");
    place(s, 1, obj(s, 2).pos, 0, 1);
    expect(vpOf(score(s), 1)).toBe(1);
  });
});

describe("shifting (Shifting Ground)", () => {
  it("announces the next objective, pays the live one 3 VP and the others 1, then shifts", () => {
    const s = game("shifting", "highway");
    const ms = s.missionState!;
    expect(ms.live).not.toBeNull();
    expect(ms.next).not.toBe(ms.live);
    const live = obj(s, ms.live!);
    const another = s.objectives.find((o) => o.team === null && o.number !== ms.live)!;
    place(s, 0, live.pos, 0, live.elevation);
    place(s, 1, another.pos, 0, another.elevation);
    const ev = score(s);
    expect(vpOf(ev, 0)).toBe(3);
    expect(vpOf(ev, 1)).toBe(1);
    expect(s.missionState!.live).toBe(ms.next);
    expect(s.missionState!.next).not.toBe(s.missionState!.live);
  });
});

describe("bounty (Most Wanted)", () => {
  it("marks each side's priciest unit, and pays for destroying the enemy's mark", () => {
    const s = game("bounty", "highway");
    expect(s.missionState!.bounty).toEqual([null, null]);
    const units = [0, 1, 2].map((i) => place(s, 1, { x: 40 + i * 5, y: 30 }, 0));
    score(s);
    const priciest = [...units].sort((a, b) => profileOf(b).cost - profileOf(a).cost || profileOf(b).supply - profileOf(a).supply || a.uid.localeCompare(b.uid))[0]!;
    expect(s.missionState!.bounty![1]).toBe(priciest.uid);
    expect(s.missionState!.bounty![0]).toBeNull();
    const marked = unitById(s, s.missionState!.bounty![1]!)!;
    marked.destroyed = true;
    marked.onBoard = false;
    const ev = score(s);
    expect(vpOf(ev, 0)).toBe(3);
    expect(s.missionState!.bounty![1]).not.toBe(marked.uid);
  });
});

describe("loot (Scrap Rush, Salvage Rights)", () => {
  it("each hold hauls a load for VP and resources until the pile is empty", () => {
    const s = game("scavenge", "mesa");
    const o = obj(s, 1);
    expect(s.missionState!.loads![o.id]).toBe(3);
    place(s, 0, o.pos);
    const res = s.players[0].resources;
    const paid = [1, 2, 3, 4].map(() => vpOf(score(s), 0));
    expect(paid).toEqual([1, 1, 1, 0]);
    expect(s.players[0].resources).toBe(res + 3 * 2);
    expect(s.missionState!.loads![o.id]).toBe(0);
  });

  it("role loot only pays the side that has it", () => {
    const s = game("convoy", "gemhaul");
    const o = s.objectives.find((x) => x.team === null && x.elevation === 0)!;
    place(s, 0, o.pos);
    expect(vpOf(score(s), 0)).toBe(1); // escorts: 1 VP hold, no loot
    expect(s.missionState!.loads![o.id]).toBe(2);
  });
});

describe("guard and stronghold raid (Claim-Jump Siege)", () => {
  it("the defender scores while the attacker doesn't hold its stronghold; the attacker scores for holding it", () => {
    const s = game("siege", "grubstake");
    s.round = 2;
    const fwd = forwardObjective(s, 0)!;
    expect(fwd.team).toBeNull();
    expect(vpOf(score(s), 0)).toBe(1); // guard
    const raider = place(s, 1, fwd.pos, 0, fwd.elevation);
    const ev = score(s);
    expect(vpOf(ev, 0)).toBe(0);
    expect(vpOf(ev, 1)).toBe(1 + 3); // hold + stronghold raid
    lift(raider);
  });
});

describe("cull", () => {
  it("pays for destroyed enemy supply once, at scoring", () => {
    const s = game("convoy", "gemhaul");
    const u = place(s, 0, { x: 4, y: 12 });
    u.destroyed = true;
    u.onBoard = false;
    expect(vpOf(score(s), 1)).toBe(profileOf(u).supply);
    expect(vpOf(score(s), 1)).toBe(0);
  });
});

describe("convoy (Strongbox Run)", () => {
  it("cargo starts on the far objective; escorts pick it up, raiders kick it back, delivery scores", () => {
    const s = game("convoy", "gemhaul");
    expect(s.flags).toHaveLength(1);
    const f = s.flags[0]!;
    expect(f.cargo).toBe(true);
    expect(f.team).toBe(0);
    const home = s.objectives.find((o) => o.team === 0)!;
    const far = s.objectives.filter((o) => o.team === null).sort((a, b) => Math.hypot(b.pos.x - home.pos.x, b.pos.y - home.pos.y) - Math.hypot(a.pos.x - home.pos.x, a.pos.y - home.pos.y))[0]!;
    expect(f.home).toEqual(far.pos);
    const events: GameEvent[] = [];
    // A raider at the start can't take it.
    const raider = place(s, 1, f.pos, 0, far.elevation as 0 | 1);
    updateFlags(s, events);
    expect(f.carrier).toBeNull();
    lift(raider);
    // An escort picks it up and carries it.
    const escort = place(s, 0, f.pos, 0, far.elevation as 0 | 1);
    updateFlags(s, events);
    expect(f.carrier).toBe(escort.uid);
    // Carrying pays 1 VP a round.
    expect(vpOf(score(s), 0)).toBeGreaterThanOrEqual(1);
    // Drop it mid-board; a raider touching it sends it back to the start.
    f.carrier = null;
    f.pos = { x: 30, y: 25 };
    lift(escort);
    place(s, 1, { x: 30, y: 25 }, 1);
    updateFlags(s, events);
    expect(f.pos).toEqual(f.home);
    // Delivery: a carrier reaching its own home scores 5 and the cargo resets.
    for (const u of onBoard(s, 1)) lift(u);
    const porter = place(s, 0, f.pos, 2, far.elevation as 0 | 1);
    updateFlags(s, events);
    expect(f.carrier).toBe(porter.uid);
    const vp = s.players[0].vp;
    for (const m of porter.models) {
      m.pos = { x: home.pos.x + (m.pos.x - porter.models[0]!.pos.x), y: home.pos.y + (m.pos.y - porter.models[0]!.pos.y) };
      m.elevation = 0;
    }
    updateFlags(s, events);
    expect(s.players[0].vp).toBe(vp + 5);
    expect(f.carrier).toBeNull();
    expect(f.pos).toEqual(f.home);
  });
});

describe("full AI games on the new missions", () => {
  const games: [FactionId, FactionId, string, string][] = [
    ["militia", "munch", "hill", "mesa"],
    ["concord", "militia", "scavenge", "refinery"],
    ["munch", "concord", "siege", "grubstake"],
    ["militia", "concord", "salvage", "velvetcomet"],
  ];
  for (const [a, b, missionId, mapId] of games) {
    it(`plays a legal game: ${a} vs ${b}, ${missionId} on ${mapId}`, () => {
      let s = createGame({ factions: [a, b], seed: 21, missionId, mapId, orderChoice: true });
      let guard = 0;
      while (!s.over && guard++ < 800) s = playAiTurn(s);
      expect(s.over).toBe(true);
    }, 120_000);
  }
});
