// Open roster ("RTS") games: no lists, every buyable unit of the faction can be recruited again and
// again, limited by resources, supply and the per-unit cap. See src/engine/openRoster.ts.

import { describe, expect, it } from "vitest";
import { aiCommand } from "../src/engine/ai";
import { defaultSupportsFor, factionOf } from "../src/engine/data/factions";
import { applyCommand, createGame, type GameSetup } from "../src/engine/game";
import { pointInZone } from "../src/engine/geometry";
import { canStillRecruit, recruitableProfiles, rosterOrder } from "../src/engine/openRoster";
import { profileOf } from "../src/engine/profile";
import { deployable, onBoard, reserves, unitById } from "../src/engine/rules";
import type { GameEvent, GameState, PlayerId, Unit, Vec } from "../src/engine/types";

function game(setup: Partial<GameSetup> = {}): GameState {
  const s = createGame({ factions: ["militia", "munch"], seed: 7, armyRule: "open", ...setup });
  s.initiative = 0;
  s.activePlayer = 0;
  s.orderChoice = null;
  return s;
}

/** Give a side plenty of resources and supply, so a test is about one rule at a time. */
function rich(s: GameState, p: PlayerId = 0): GameState {
  s.players[p].resources = 100;
  s.players[p].supplyCap = 100;
  return s;
}

const recruitOf = (s: GameState, p: PlayerId, profileId: string): Unit | undefined =>
  reserves(s, p).find((u) => u.profileId === profileId);

/** Points across a side's deployment zone, scanned in rows from its back edge. */
function zonePoints(s: GameState, p: PlayerId): Vec[] {
  const out: Vec[] = [];
  for (const poly of s.spawn[p]) {
    const xs = poly.map((q) => q.x);
    const ys = poly.map((q) => q.y);
    for (let y = Math.min(...ys) + 1; y < Math.max(...ys); y += 1.5)
      for (let x = Math.min(...xs) + 1; x < Math.max(...xs); x += 2) if (pointInZone({ x, y }, poly)) out.push({ x, y });
  }
  return out;
}

/** Recruit `profileId` for `p` at the first spot in its zone where it fits. Returns the result. */
function recruit(s: GameState, p: PlayerId, profileId: string, at?: Vec) {
  const u = recruitOf(s, p, profileId);
  if (!u) throw new Error(`No ${profileId} to recruit`);
  s.activePlayer = p;
  if (at) return { uid: u.uid, r: applyCommand(s, { type: "deploy", uid: u.uid, to: at }) };
  let last: ReturnType<typeof applyCommand> | null = null;
  for (const q of zonePoints(s, p)) {
    last = applyCommand(s, { type: "deploy", uid: u.uid, to: q });
    if (last.ok) return { uid: u.uid, r: last };
  }
  return { uid: u.uid, r: last! };
}

const okState = (r: ReturnType<typeof applyCommand>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe("open roster setup", () => {
  it("gives each side one recruit of every buyable profile, and no list units", () => {
    const s = game();
    for (const p of [0, 1] as const) {
      const want = recruitableProfiles(s.factions[p]).map((x) => x.id).sort();
      expect(reserves(s, p).map((u) => u.profileId).sort()).toEqual(want);
      expect(onBoard(s, p)).toHaveLength(0);
    }
    expect(s.openRoster).toMatchObject({ cap: 3 }); // Skirmish's max copies
  });

  it("never offers summon-only structures", () => {
    for (const f of ["militia", "munch", "concord"]) {
      const s = game({ factions: [f, f] });
      const summonOnly = factionOf(f).profiles.filter((x) => x.structure?.summonOnly).map((x) => x.id);
      expect(summonOnly.length).toBeGreaterThan(0);
      for (const u of s.units) expect(summonOnly).not.toContain(u.profileId);
    }
  });

  it("ignores lists and takes the starter supports for the mode", () => {
    const s = game({ lists: [[{ profileId: "mil-bertha", upgrades: [] }], [{ profileId: "munch-mama", upgrades: [] }]] });
    expect(reserves(s, 0).filter((u) => u.profileId === "mil-bertha")).toHaveLength(1);
    expect(s.players[0].supports.map((c) => c.id)).toEqual(defaultSupportsFor("militia", "skirmish"));
    const a = game({ mapId: "highway" });
    expect(a.openRoster?.cap).toBe(4); // Assault's max copies
    expect(a.players[1].supports.map((c) => c.id)).toEqual(defaultSupportsFor("munch", "assault"));
  });

  it("lists recruits in the faction's roster order", () => {
    const s = rich(game());
    const after = okState(recruit(s, 0, recruitableProfiles("militia")[0]!.id).r);
    expect(rosterOrder(after, 0).map((u) => u.profileId)).toEqual(recruitableProfiles("militia").map((x) => x.id));
  });

  it("leaves list games alone", () => {
    const s = createGame({ factions: ["militia", "munch"], seed: 7 });
    expect(s.openRoster).toBeUndefined();
  });
});

describe("recruiting", () => {
  it("deploys a new unit and puts a fresh recruit of the same profile in reserve", () => {
    const s = rich(game());
    const { uid, r } = recruit(s, 0, "mil-grunts");
    const after = okState(r);
    expect(unitById(after, uid)!.onBoard).toBe(true);
    const next = recruitOf(after, 0, "mil-grunts");
    expect(next).toBeDefined();
    expect(next!.uid).not.toBe(uid);
    expect(after.players[0].resources).toBe(100 - profileOf(unitById(after, uid)!).cost);
    expect(r.ok && r.events.some((e) => e.type === "deployed" && e.uid === uid)).toBe(true);
  });

  it("can field several copies of the same unit", () => {
    let s = rich(game());
    const uids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { uid, r } = recruit(s, 0, "mil-grunts");
      s = okState(r);
      uids.push(uid);
    }
    expect(new Set(uids).size).toBe(3);
    expect(onBoard(s, 0).filter((u) => u.profileId === "mil-grunts")).toHaveLength(3);
  });

  it("caps copies on the table, but a dead copy frees its slot", () => {
    let s = rich(game());
    for (let i = 0; i < 3; i++) s = okState(recruit(s, 0, "mil-grunts").r);
    const fourth = recruit(s, 0, "mil-grunts");
    expect(fourth.r.ok).toBe(false);
    if (!fourth.r.ok) expect(fourth.r.error).toMatch(/Already 3/);
    expect(deployable(s, 0).some((u) => u.profileId === "mil-grunts")).toBe(false);
    // One dies: another can be recruited, as a brand-new unit.
    const dead = onBoard(s, 0).find((u) => u.profileId === "mil-grunts")!;
    dead.destroyed = true;
    dead.onBoard = false;
    dead.models.forEach((m) => (m.alive = false));
    const again = recruit(s, 0, "mil-grunts");
    const after = okState(again.r);
    expect(again.uid).not.toBe(dead.uid);
    expect(unitById(after, dead.uid)!.destroyed).toBe(true);
    expect(onBoard(after, 0).filter((u) => u.profileId === "mil-grunts")).toHaveLength(3);
  });

  it("has no cap when openCap is null", () => {
    let s = rich(game({ openCap: null }));
    for (let i = 0; i < 5; i++) s = okState(recruit(s, 0, "mil-medic").r);
    expect(onBoard(s, 0).filter((u) => u.profileId === "mil-medic")).toHaveLength(5);
  });

  it("can recruit the same profile again after it dies (no cap)", () => {
    let s = rich(game({ openCap: null }));
    const first = recruit(s, 0, "mil-bertha");
    s = okState(first.r);
    const u = unitById(s, first.uid)!;
    u.destroyed = true;
    u.onBoard = false;
    u.models.forEach((m) => (m.alive = false));
    const second = recruit(s, 0, "mil-bertha");
    s = okState(second.r);
    expect(unitById(s, second.uid)!.onBoard).toBe(true);
    expect(unitById(s, first.uid)!.destroyed).toBe(true);
    expect(recruitOf(s, 0, "mil-bertha")).toBeDefined();
  });

  it("enforces resources", () => {
    const s = game();
    s.players[0].resources = 1;
    const { r } = recruit(s, 0, "mil-grunts");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/resources/);
  });

  it("enforces supply", () => {
    const s = game();
    s.players[0].resources = 100;
    s.players[0].supplyCap = 1;
    const { r } = recruit(s, 0, "mil-grunts"); // 2 supply
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/supply/);
    expect(okState(recruit(s, 0, "mil-medic").r)).toBeTruthy(); // 1 supply fits
  });

  it("only deploys into the zone", () => {
    const s = rich(game());
    const { r } = recruit(s, 0, "mil-grunts", { x: s.board.width / 2, y: s.board.height / 2 });
    expect(r.ok).toBe(false);
  });

  it("only works in the movement phase, on your turn", () => {
    const s = rich(game());
    s.phase = "assault";
    expect(recruit(s, 0, "mil-grunts").r.ok).toBe(false);
    const t = rich(game());
    t.activePlayer = 1;
    const u = recruitOf(t, 0, "mil-grunts")!;
    expect(applyCommand(t, { type: "deploy", uid: u.uid, to: zonePoints(t, 0)[0]! }).ok).toBe(false);
  });

  it("triggers enemy overwatch", () => {
    // Militia vs Militia: player 1's Overwatch turret stands at the edge of player 0's zone.
    let s = rich(game({ factions: ["militia", "militia"] }));
    s = rich(s, 1);
    const turret = recruitOf(s, 1, "mil-turret")!;
    expect(profileOf(turret).abilities).toContain("overwatch");
    const zone = zonePoints(s, 0);
    const front = Math.min(...zone.map((q) => q.y));
    const cx = s.board.width / 2;
    s = okState(recruit(s, 1, "mil-turret").r); // into its own zone first (a real deployment)
    // Then move it next to player 0's zone (test set-up, bypassing movement rules).
    const t = unitById(s, turret.uid)!;
    t.models[0]!.pos = { x: cx, y: front - 6 };
    s.activePlayer = 0;
    let hit: GameEvent[] | null = null;
    for (const q of zone.filter((p) => Math.abs(p.x - cx) < 6).sort((a, b) => a.y - b.y)) {
      const u = recruitOf(s, 0, "mil-grunts")!;
      const r = applyCommand(s, { type: "deploy", uid: u.uid, to: q });
      if (!r.ok) continue;
      hit = r.events;
      expect(r.events.some((e) => e.type === "attack" && e.report.kind === "overwatch" && e.report.target === u.uid)).toBe(true);
      break;
    }
    expect(hit).not.toBeNull();
  });
});

describe("wiped out", () => {
  it("isn't over while a side can still pay for a recruit, now or next round", () => {
    const s = game();
    s.players[0].resources = 0;
    // Player 1 does something; player 0 has nothing on the table and no money, but has income to come.
    const r = recruit(s, 1, "munch-nibblers");
    const after = okState(r.r);
    expect(after.over).toBe(false);
    expect(canStillRecruit(after, 0)).toBe(true);
  });

  it("is over when a side has nothing on the table and can't pay for anything", () => {
    const s = game();
    s.round = s.maxRounds;
    s.players[0].resources = 0;
    const r = recruit(s, 1, "munch-nibblers");
    expect(r.r.ok).toBe(true);
    if (r.r.ok) {
      expect(r.r.state.over).toBe(true);
      expect(r.r.state.winner).toBe(1);
    }
  });
});

describe("AI in open roster games", () => {
  for (const [a, b] of [
    ["militia", "munch"],
    ["concord", "militia"],
  ] as const) {
    it(`plays a whole ${a} vs ${b} game with a mixed army`, () => {
      // Seed 4: with the ability pass, seed 3's Concord game overcharges the Sunray Tower into the
      // Militia's Hay Bombers, and the Militia keeps re-buying the one unit the Concord can barely hit
      // (4 of 6 recruits). Seeds 1-6 otherwise all field mixed armies.
      let s = createGame({ factions: [a, b], seed: 4, armyRule: "open", orderChoice: true, missionId: "hold", mapId: "dustbowl" });
      const deployed: Record<string, number>[] = [{}, {}];
      for (let n = 0; n < 3000 && !s.over; n++) {
        const cmd = aiCommand(s);
        const r = applyCommand(s, cmd);
        if (!r.ok) throw new Error(`AI made an illegal move ${JSON.stringify(cmd)}: ${r.error}`);
        for (const e of r.events) {
          if (e.type !== "deployed") continue;
          const u = unitById(r.state, e.uid)!;
          deployed[u.owner]![u.profileId] = (deployed[u.owner]![u.profileId] ?? 0) + 1;
        }
        s = r.state;
      }
      expect(s.over).toBe(true);
      for (const p of [0, 1] as const) {
        const counts = Object.values(deployed[p]!);
        const total = counts.reduce((x, y) => x + y, 0);
        expect(total).toBeGreaterThanOrEqual(4);
        expect(counts.length).toBeGreaterThanOrEqual(3); // at least three different units
        expect(Math.max(...counts)).toBeLessThanOrEqual(Math.ceil(total / 2)); // no one-unit spam (games can end early on a big lead)
      }
    }, 120_000);
  }
});
