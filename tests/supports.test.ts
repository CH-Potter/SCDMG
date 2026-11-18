import { describe, expect, it } from "vitest";
import { planShooting } from "../src/engine/combat";
import { defaultSupportsFor, SUPPORTS } from "../src/engine/data/factions";
import { applyCommand, createGame, type GameSetup } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { presenceController, unitById } from "../src/engine/rules";
import type { Elevation, GameState, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";
import { registerMunch } from "./helpers/munch";

// The Munch are a Forge template now: register a test copy under their old ids.
registerMunch();

const ok = (r: ReturnType<typeof applyCommand>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

function game(setup: Partial<GameSetup> = {}): GameState {
  // The radio and depot tests below pick those cards explicitly, whatever the starter supports are.
  const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "concord"], seed: 3, supports: [["mil-radio", "mil-depot"], defaultSupportsFor("concord", "skirmish")], ...setup });
  s.initiative = 0;
  s.activePlayer = 0;
  return s;
}

function place(s: GameState, uid: string, at: Vec, elevation: Elevation = 0): Unit {
  const u = unitById(s, uid)!;
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.1), y: at.y + Math.floor(i / 3) * (2 * r + 0.1) };
    m.elevation = elevation;
  });
  return u;
}

const uidOf = (s: GameState, owner: 0 | 1, profileId: string, nth = 0): string =>
  s.units.filter((u) => u.owner === owner && u.profileId === profileId)[nth]!.uid;

describe("off-board supports", () => {
  it("starts with CP from the starter supports", () => {
    const s = game({ supports: undefined });
    const expected = s.players[0].supports.reduce((n, c) => n + SUPPORTS[c.id]!.cp, 0);
    expect(s.players[0].cp).toBe(expected);
    expect(s.players[0].supports.map((c) => c.id)).toEqual(defaultSupportsFor("militia", "skirmish"));
  });

  it("plays as a free action: spends CP, exhausts, keeps the turn", () => {
    let s = game();
    const cp = s.players[0].cp;
    s = ok(applyCommand(s, { type: "support", player: 0, support: "mil-radio", ability: "supply-run" }));
    expect(s.players[0].resources).toBe(13);
    expect(s.players[0].cp).toBe(cp - 1);
    expect(s.players[0].supports.find((c) => c.id === "mil-radio")!.exhausted).toBe(true);
    expect(s.activePlayer).toBe(0);
    const again = applyCommand(s, { type: "support", player: 0, support: "mil-radio", ability: "supply-run" });
    expect(again.ok).toBe(false);
  });

  it("refreshes cards and adds CP at the end of the round", () => {
    let s = game();
    s = ok(applyCommand(s, { type: "support", player: 0, support: "mil-radio", ability: "supply-run" }));
    const before = s.players[0].cp;
    while (s.round === 1) s = ok(applyCommand(s, { type: "pass", player: s.activePlayer }));
    expect(s.players[0].supports.every((c) => !c.exhausted)).toBe(true);
    const perRound = s.players[0].supports.reduce((n, c) => n + SUPPORTS[c.id]!.cp, 0);
    expect(s.players[0].cp).toBe(Math.min(8, before + perRound));
  });

  it("summons a temporary structure that vanishes at the end of the round", () => {
    let s = game();
    place(s, uidOf(s, 0, "mil-grunts", 2), { x: 10, y: 28 });
    s = ok(applyCommand(s, { type: "support", player: 0, support: "mil-depot", ability: "junk-wall", point: { x: 10, y: 24 } }));
    const junk = s.units.find((u) => u.profileId === "mil-junk")!;
    expect(junk.onBoard).toBe(true);
    expect(junk.expiresRound).toBe(1);
    while (s.round === 1) s = ok(applyCommand(s, { type: "pass", player: s.activePlayer }));
    expect(unitById(s, junk.uid)!.onBoard).toBe(false);
  });

  it("a Glimmer Dome makes enemy shots at nearby friends hit one worse", () => {
    let s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["concord", "militia"], seed: 4, supports: [["con-spire", "con-portal"], defaultSupportsFor("militia", "skirmish")] });
    s.initiative = 0;
    s.activePlayer = 0;
    const guard = place(s, uidOf(s, 0, "con-guard"), { x: 10, y: 26 });
    const grunts = place(s, uidOf(s, 1, "mil-grunts"), { x: 10, y: 14 });
    const rifle = profileOf(grunts).weapons[0]!;
    const before = planShooting(s, grunts, guard, rifle);
    s.players[0].cp = 8; // don't depend on tuned CP numbers
    s = ok(applyCommand(s, { type: "support", player: 0, support: "con-spire", ability: "glimmer-ward", point: { x: 11, y: 28.5 } })); // clear of the guard, whatever its size
    const after = planShooting(s, unitById(s, grunts.uid)!, unitById(s, guard.uid)!, rifle);
    if (typeof before === "string" || typeof after === "string") throw new Error("expected a valid shot");
    expect(after.hitOn).toBe(before.hitOn + 1);
  });

  it("an armed brace triggers when the enemy charges", () => {
    let s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["concord", "munch"], seed: 5, supports: [["con-spire", "con-choir"], defaultSupportsFor("munch", "skirmish")] });
    s.initiative = 0;
    s.activePlayer = 0;
    const guard = place(s, uidOf(s, 0, "con-guard"), { x: 10, y: 28 });
    const nibs = place(s, uidOf(s, 1, "munch-nibblers"), { x: 10, y: 22 });
    s = ok(applyCommand(s, { type: "support", player: 0, support: "con-choir", ability: "hold-fast" }));
    expect(s.players[0].armed).toHaveLength(1);
    s.phase = "assault";
    s.activePlayer = 1;
    s = ok(applyCommand(s, { type: "charge", uid: nibs.uid, target: guard.uid }));
    expect(unitById(s, guard.uid)!.status.braced).toBe(true);
    expect(s.players[0].armed).toHaveLength(0);
  });
});

describe("structures", () => {
  const turretList: GameSetup["lists"] = [
    [
      { profileId: "mil-grunts", upgrades: [] },
      { profileId: "mil-turret", upgrades: [] },
    ],
    [{ profileId: "munch-nibblers", upgrades: [] }],
  ];

  it("can field-deploy next to a friendly unit, but can't move", () => {
    let s = game({ lists: turretList, factions: ["militia", "munch"] });
    const grunts = place(s, uidOf(s, 0, "mil-grunts"), { x: 17, y: 24 });
    void grunts;
    const turret = uidOf(s, 0, "mil-turret");
    s = ok(applyCommand(s, { type: "deploy", uid: turret, to: { x: 17, y: 21.5 } }));
    expect(unitById(s, turret)!.onBoard).toBe(true);
    s.activePlayer = 0;
    unitById(s, turret)!.status.acted = false;
    const mv = applyCommand(s, { type: "move", uid: turret, leader: 0, to: { x: 17, y: 20 } });
    expect(mv.ok).toBe(false);
  });

  it("doesn't hold objectives", () => {
    const s = game({ lists: turretList, factions: ["militia", "munch"] });
    const o = s.objectives[1]!;
    place(s, uidOf(s, 0, "mil-turret"), { x: o.pos.x, y: o.pos.y });
    expect(presenceController(s, o)).toBeNull();
  });

  it("a Gopher Hole lets reserves deploy beside it (the temporary tunnel; the Sett Lab is the permanent one)", () => {
    let s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["munch", "militia"], seed: 9 });
    s.initiative = 0;
    s.activePlayer = 0;
    s.players[0].resources = 50;
    s.players[0].cp = 8; // don't depend on tuned CP numbers
    place(s, uidOf(s, 0, "munch-nibblers"), { x: 17, y: 26 });
    s = ok(applyCommand(s, { type: "support", player: 0, support: "munch-tunnels", ability: "dig-through", point: { x: 26, y: 18 } }));
    const hole = s.units.find((u) => u.profileId === "munch-hole" && u.onBoard)!;
    expect(hole.expiresRound).toBe(s.round);
    const res = applyCommand(s, { type: "deploy", uid: uidOf(s, 0, "munch-spitter"), to: { x: 26, y: 15.6 } });
    expect(res.ok).toBe(true);
  });
});
