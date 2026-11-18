// The Militia drop-ship (Rust Bucket Drop-Ship, "Bumpy Landing"): an airdrop that lands anywhere
// on the table, from round 2, away from enemies and the enemy's home objective.

import { describe, expect, it } from "vitest";
import { aiCommand } from "../src/engine/ai";
import { factionOf, supportOf } from "../src/engine/data/factions";
import { factionProblems } from "../src/engine/data/factionValidation";
import { applyCommand, createGame, type GameSetup } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { aliveModels, unitById, unitGap } from "../src/engine/rules";
import { airdropSpotProblem, canPlaySupport, supportTarget } from "../src/engine/supports";
import type { GameEvent, GameState, ListEntry, SupportEffect, Unit, Vec } from "../src/engine/types";
import { effectSummary } from "../src/forge/model";
import { cleanFaction, copyFaction } from "../src/ui/customFactions";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";
import { registerMunch } from "./helpers/munch";

// The Munch are a Forge template now: register a test copy under their old ids.
registerMunch();

const CARD = "mil-dropship";
const ABILITY = "bumpy-landing";

const ok = (r: ReturnType<typeof applyCommand>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

const L = (...ids: string[]): ListEntry[] => ids.map((profileId) => ({ profileId, upgrades: [] }));

/** Dustbowl (35" x 35"): player 1's home objective is at (9, 3.5); the central platform spans x 12.5-22.5, y 14.5-20.5. */
function game(lists: [ListEntry[], ListEntry[]], extra: Partial<GameSetup> = {}): GameState {
  const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 7, lists, supports: [[CARD], []], ...extra });
  s.initiative = 0;
  s.activePlayer = 0;
  s.orderChoice = null;
  s.players[0].cp = 8;
  s.players[1].cp = 8;
  s.round = 2;
  s.phase = "movement";
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

const drop = (s: GameState, uid: string, point: Vec) =>
  applyCommand(s, { type: "support", player: 0, support: CARD, ability: ABILITY, target: uid, point });

describe("Rust Bucket Drop-Ship", () => {
  it("is an anywhere airdrop from round 2, targeting a reserve unit and a point", () => {
    const a = supportOf(CARD).abilities[0]!;
    expect(a.effect).toMatchObject({ kind: "airdrop", anywhere: true, fromRound: 2, minEnemyDistance: 8 });
    expect(supportTarget(a)).toBe("reservePoint");
    expect(a.text).toContain('8"');
    expect(a.text).toContain("round 2");
    expect(factionOf("militia").supports.some((x) => x.id === CARD)).toBe(true);
  });

  it("lands a reserve unit far from your own models, paying resources and supply", () => {
    let s = game([L("mil-grunts", "mil-grunts"), L("munch-nibblers")]);
    place(s, "p0-0", { x: 10, y: 32 });
    place(s, "p1-0", { x: 28, y: 5 });
    const res = s.players[0].resources;
    // More than 12" from the grunts: the short-range Hay Bale Drop couldn't do this.
    s = ok(drop(s, "p0-1", { x: 22, y: 25 }));
    const u = unitById(s, "p0-1")!;
    expect(u.onBoard).toBe(true);
    expect(u.status).toMatchObject({ acted: true, moved: true, deployedRound: 2 });
    expect(s.players[0].resources).toBe(res - profileOf(u).cost);
    expect(s.players[0].cp).toBe(7); // Bumpy Landing costs 1 CP
    expect(s.players[0].supports.find((c) => c.id === CARD)!.exhausted).toBe(true);
    expect(unitGap(u, unitById(s, "p1-0")!)).toBeGreaterThanOrEqual(8);
    // Exhausted: no second drop this round.
    expect(canPlaySupport(s, 0, CARD, ABILITY)).toMatch(/exhausted/);
  });

  it("works with no friendly models on the table at all", () => {
    let s = game([L("mil-medic"), L("munch-nibblers")]);
    place(s, "p1-0", { x: 28, y: 5 });
    s = ok(drop(s, "p0-0", { x: 6, y: 26 }));
    expect(unitById(s, "p0-0")!.onBoard).toBe(true);
  });

  it("can't be used in round 1", () => {
    const s = game([L("mil-grunts", "mil-medic"), L("munch-nibblers")]);
    s.round = 1;
    place(s, "p0-0", { x: 10, y: 32 });
    place(s, "p1-0", { x: 28, y: 5 });
    expect(canPlaySupport(s, 0, CARD, ABILITY)).toBe("Not before round 2");
    const r = drop(s, "p0-1", { x: 20, y: 25 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Not before round 2");
  });

  it("must land at least 8\" from enemy models", () => {
    const s = game([L("mil-grunts", "mil-medic"), L("munch-nibblers")]);
    place(s, "p0-0", { x: 10, y: 32 });
    place(s, "p1-0", { x: 22, y: 20 });
    const r = drop(s, "p0-1", { x: 22, y: 26 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at least 8" from enemies/);
    expect(airdropSpotProblem(s, 0, supportOf(CARD).abilities[0]!.effect as Extract<SupportEffect, { kind: "airdrop" }>, { x: 22, y: 26 })).toMatch(/8"/);
    // Further back is fine, and the whole unit ends up clear.
    const back = ok(drop(s, "p0-1", { x: 22, y: 32 }));
    expect(unitGap(unitById(back, "p0-1")!, unitById(back, "p1-0")!)).toBeGreaterThanOrEqual(8);
  });

  it("never lands within 6\" of the enemy's home objective", () => {
    const s = game([L("mil-grunts", "mil-medic"), L("munch-nibblers")]);
    place(s, "p0-0", { x: 10, y: 32 });
    place(s, "p1-0", { x: 30, y: 30 });
    const home = s.objectives.find((o) => o.team === 1)!;
    const near = { x: home.pos.x + home.radius + 5, y: home.pos.y + 1 };
    const r = drop(s, "p0-1", near);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/home objective/);
    // Just outside the exclusion is fine.
    expect(drop(s, "p0-1", { x: home.pos.x + 2, y: home.pos.y + home.radius + 9 }).ok).toBe(true); // room for the whole medic team
  });

  it("needs the unit's resources and supply", () => {
    const s = game([L("mil-grunts", "mil-grunts"), L("munch-nibblers")]);
    place(s, "p0-0", { x: 10, y: 32 });
    place(s, "p1-0", { x: 28, y: 5 });
    s.players[0].resources = 1;
    const poor = drop(s, "p0-1", { x: 22, y: 25 });
    expect(poor.ok).toBe(false);
    if (!poor.ok) expect(poor.error).toMatch(/resources/);
    s.players[0].resources = 10;
    s.players[0].supplyCap = 3;
    const full = drop(s, "p0-1", { x: 22, y: 25 });
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.error).toMatch(/supply/);
  });

  it("lands on ground or a platform, never inside a building or off the table", () => {
    const s = game([L("mil-grunts", "mil-medic"), L("munch-nibblers")]);
    place(s, "p0-0", { x: 10, y: 32 });
    place(s, "p1-0", { x: 30, y: 2 });
    const onPlatform = ok(drop(s, "p0-1", { x: 14, y: 16 }));
    expect(aliveModels(unitById(onPlatform, "p0-1")!)[0]!.elevation).toBe(1);
    expect(drop(s, "p0-1", { x: 6.5, y: 13.5 }).ok).toBe(false); // building
    const off = drop(s, "p0-1", { x: -3, y: 20 });
    expect(off.ok).toBe(false);
    if (!off.ok) expect(off.error).toMatch(/table/);
  });

  it("can't drop structures", () => {
    const s = game([L("mil-grunts", "mil-turret"), L("munch-nibblers")]);
    place(s, "p0-0", { x: 10, y: 32 });
    place(s, "p1-0", { x: 28, y: 5 });
    expect(drop(s, "p0-1", { x: 22, y: 25 }).ok).toBe(false);
  });

  it("enemy overwatch fires at the unit as it lands", () => {
    const s = game([L("mil-grunts", "mil-medic"), L("mil-turret")], { factions: ["militia", "militia"], supports: [[CARD], []] });
    place(s, "p0-0", { x: 10, y: 32 });
    place(s, "p1-0", { x: 33, y: 6 });
    const r = drop(s, "p0-1", { x: 33, y: 15.7 });
    if (!r.ok) throw new Error(r.error);
    const events: GameEvent[] = r.events;
    const deployedAt = events.findIndex((e) => e.type === "deployed" && e.uid === "p0-1");
    const ow = events.findIndex((e) => e.type === "attack" && e.report.kind === "overwatch" && e.report.target === "p0-1");
    expect(deployedAt).toBeGreaterThanOrEqual(0);
    expect(ow).toBeGreaterThan(deployedAt);
    expect(unitById(r.state, "p1-0")!.reactionsUsed).toContain("overwatch");
  });
});

describe("drop-ship data", () => {
  const militia = () => copyFaction(factionOf("militia"), "Test Militia");
  const effectOf = (f: ReturnType<typeof militia>) => f.supports.find((x) => x.name === "Rust Bucket Drop-Ship")!.abilities[0]!.effect as Record<string, unknown>;

  it("validates the anywhere and fromRound fields", () => {
    const good = militia();
    expect(factionProblems(good)).toEqual([]);

    const noRange = militia();
    effectOf(noRange).anywhere = false; // range 0 only makes sense when landing anywhere
    expect(factionProblems(noRange).some((p) => /drop range/.test(p))).toBe(true);

    const badRound = militia();
    effectOf(badRound).fromRound = 0;
    expect(factionProblems(badRound).some((p) => /first round/.test(p))).toBe(true);

    const badFlag = militia();
    effectOf(badFlag).anywhere = "yes";
    expect(factionProblems(badFlag).some((p) => /anywhere on the table/.test(p))).toBe(true);

    // Old airdrops without the new fields stay valid.
    const old = militia();
    const hay = old.supports.find((x) => x.name === "Forward Airstrip")!.abilities[0]!.effect as Record<string, unknown>;
    expect(hay.anywhere).toBeUndefined();
    expect(hay.fromRound).toBeUndefined();
    expect(factionProblems(old)).toEqual([]);
  });

  it("keeps the new fields through custom faction cleaning, and drops them when absent", () => {
    const f = cleanFaction(JSON.parse(JSON.stringify(militia())));
    expect(f.supports.find((x) => x.name === "Rust Bucket Drop-Ship")!.abilities[0]!.effect).toEqual({
      kind: "airdrop",
      range: 0,
      minEnemyDistance: 8,
      anywhere: true,
      fromRound: 2,
    });
    expect(f.supports.find((x) => x.name === "Forward Airstrip")!.abilities[0]!.effect).toEqual({ kind: "airdrop", range: 12, minEnemyDistance: 6 });
  });

  it("describes anywhere drops in the forge summary", () => {
    const f = factionOf("militia");
    const text = effectSummary({ kind: "airdrop", range: 0, minEnemyDistance: 8, anywhere: true, fromRound: 2 }, f);
    expect(text).toMatch(/^From round 2: deploy/);
    expect(text).toContain("anywhere on the table");
    expect(text).not.toContain('0"');
    expect(effectSummary({ kind: "airdrop", range: 12, minEnemyDistance: 6 }, f)).toContain('within 12"');
  });
});

describe("AI and the drop-ship", () => {
  it("drops a unit onto an objective it wants rather than at random", () => {
    const s = game([L("mil-grunts", "mil-grunts"), L("munch-nibblers")]);
    place(s, "p0-0", { x: 10, y: 32 });
    place(s, "p1-0", { x: 28, y: 3 });
    const cmd = aiCommand(s);
    expect(cmd).toMatchObject({ type: "support", support: CARD, ability: ABILITY, target: "p0-1" });
    const point = (cmd as { point: Vec }).point;
    const near = s.objectives.filter((o) => o.team === null).some((o) => Math.hypot(o.pos.x - point.x, o.pos.y - point.y) <= o.radius + 0.01);
    expect(near).toBe(true);
    expect(applyCommand(s, cmd).ok).toBe(true);
  });

  it("uses it in a full AI game without an illegal move", () => {
    let uses = 0;
    for (const seed of [21, 33, 45, 57]) {
      let s = createGame({ map: CLASSIC_DUSTBOWL,
        factions: ["militia", "munch"],
        seed,
        supports: [[CARD, "mil-radio"], ["munch-stink"]],
      });
      let n = 0;
      while (!s.over && n++ < 3000) {
        const cmd = aiCommand(s);
        const r = applyCommand(s, cmd);
        if (!r.ok) throw new Error(`${JSON.stringify(cmd)}: ${r.error}`);
        if (cmd.type === "support" && cmd.support === CARD) uses++;
        s = r.state;
      }
      expect(s.over).toBe(true);
    }
    expect(uses).toBeGreaterThan(0);
  }, 120_000);
});
