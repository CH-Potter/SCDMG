import { CLASSIC_RULES } from "../src/engine/houseRules";
import { describe, expect, it } from "vitest";
import { moraleCheck, planShooting, saveNeeded } from "../src/engine/combat";
import { applyCommand, createGame, RALLY_CP } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { eligibleUnits, presenceController, unitById } from "../src/engine/rules";
import { difficultExtra, planRoute } from "../src/engine/terrain";
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

const uidOf = (s: GameState, owner: 0 | 1, profileId: string, nth = 0): string =>
  s.units.filter((u) => u.owner === owner && u.profileId === profileId)[nth]!.uid;

const game = (factions: [string, string] = ["militia", "munch"], seed = 2): GameState => {
  const s = createGame({ map: CLASSIC_DUSTBOWL, rules: CLASSIC_RULES, factions, seed });
  s.initiative = 0;
  s.activePlayer = 0;
  return s;
};

describe("weapon traits", () => {
  it("heavy weapons hit worse after moving", () => {
    const s = game(["militia", "munch"]);
    const b = place(s, uidOf(s, 0, "mil-bertha"), { x: 10, y: 28 });
    const t = place(s, uidOf(s, 1, "munch-spitter"), { x: 10, y: 14 });
    const cannon = profileOf(b).weapons[0]!;
    const still = planShooting(s, b, t, cannon);
    b.status.moved = true;
    const moved = planShooting(s, b, t, cannon);
    if (typeof still === "string" || typeof moved === "string") throw new Error("expected shots");
    expect(moved.hitOn).toBe(still.hitOn + 1);
  });

  it("blast adds a die per model against big squads", () => {
    const s = game(["militia", "munch"]);
    const b = place(s, uidOf(s, 0, "mil-bertha"), { x: 10, y: 28 });
    const nibs = place(s, uidOf(s, 1, "munch-nibblers"), { x: 10, y: 14 });
    const plan = planShooting(s, b, nibs, profileOf(b).weapons[0]!);
    if (typeof plan === "string") throw new Error(plan);
    expect(plan.attackers[0]!.dice).toBe(5); // 3 dice + blast + Steady Aim (Bertha hasn't moved)
  });

  it("torrent weapons hit automatically", () => {
    const s = game(["munch", "militia"]);
    const pod = place(s, uidOf(s, 0, "munch-nibblers"), { x: 1, y: 1 }); // placeholder owner unit
    void pod;
    const podUnit: Unit = { ...unitById(s, uidOf(s, 0, "munch-nibblers"))!, profileId: "munch-pod", upgrades: [] };
    podUnit.models = [{ id: 0, pos: { x: 10, y: 20 }, elevation: 0, hp: 4, shield: 0, alive: true }];
    const t = place(s, uidOf(s, 1, "mil-grunts"), { x: 10, y: 24 });
    const plan = planShooting(s, podUnit, t, profileOf(podUnit).weapons[0]!);
    if (typeof plan === "string") throw new Error(plan);
    expect(plan.hitOn).toBe(1);
  });

  it("pistols let engaged units shoot the unit they're fighting", () => {
    const s = game(["concord", "munch"]);
    const g = place(s, uidOf(s, 0, "con-guard"), { x: 10, y: 20 });
    const n = place(s, uidOf(s, 1, "munch-nibblers"), { x: 10, y: 21.4 });
    void n;
    s.phase = "assault";
    expect(eligibleUnits(s, 0).some((u) => u.uid === g.uid)).toBe(true);
  });
});

describe("morale", () => {
  it("a battered unit tests its nerve and can be shaken, then rallied for CP", () => {
    let shakenState: GameState | null = null;
    for (let seed = 1; seed < 60 && !shakenState; seed++) {
      const s = game(["militia", "munch"], seed);
      const g = place(s, uidOf(s, 0, "mil-grunts", 2), { x: 10, y: 28 });
      g.models.slice(0, Math.ceil(g.models.length / 2)).forEach((m) => (m.alive = false));
      const events: GameEvent[] = [];
      moraleCheck(s, g, events);
      expect(events[0]?.type).toBe("morale");
      if (g.status.shaken) shakenState = s;
    }
    expect(shakenState).not.toBeNull();
    const s = shakenState!;
    const g = s.units.find((u) => u.status.shaken)!;
    // Shaken units don't hold objectives.
    const o = s.objectives[1]!;
    g.models.filter((m) => m.alive).forEach((m) => (m.pos = { ...o.pos }));
    expect(presenceController(s, o)).toBeNull();
    s.players[0].cp = RALLY_CP;
    const r = applyCommand(s, { type: "rally", player: 0, target: g.uid });
    if (!r.ok) throw new Error(r.error);
    expect(unitById(r.state, g.uid)!.status.shaken).toBe(false);
    expect(r.state.players[0].cp).toBe(0);
    expect(r.state.activePlayer).toBe(0);
  });

  it("fearless units never test", () => {
    const s = game(["militia", "munch"]);
    const b = place(s, uidOf(s, 0, "mil-bertha"), { x: 10, y: 28 });
    b.models[0]!.hp = 1;
    const events: GameEvent[] = [];
    moraleCheck(s, b, events);
    expect(events).toHaveLength(0);
  });
});

describe("terrain staples", () => {
  it("cover areas are difficult terrain and cost double", () => {
    const s = game();
    // Crater-a on Dustbowl is an octagon around (9, 25).
    const extra = difficultExtra(s, { x: 4, y: 25 }, { x: 13, y: 24.5 }, 0, false);
    expect(extra).toBeGreaterThan(3);
    expect(difficultExtra(s, { x: 4, y: 25 }, { x: 13, y: 24.5 }, 0, true)).toBe(0);
    const g = place(s, uidOf(s, 0, "mil-grunts", 2), { x: 4, y: 25 });
    const r = planRoute(s, g, { x: 4, y: 25 }, 0, { x: 13, y: 24.5 });
    if (typeof r === "string") throw new Error(r);
    expect(r.length).toBeLessThan(9.02 + extra); // goes round (or partly round) rather than straight through
  });

  it("models in the way give the target cover", () => {
    const s = game(["militia", "munch"]);
    const shooter = place(s, uidOf(s, 0, "mil-grunts", 2), { x: 30, y: 30 });
    const target = place(s, uidOf(s, 1, "munch-mama"), { x: 30, y: 20 });
    const sm = shooter.models[0]!;
    const tm = target.models[0]!;
    const rifle = profileOf(shooter).weapons[0]!;
    void rifle;
    const open = saveNeeded(s, shooter, target, tm, 0, false, sm);
    const blocker = place(s, uidOf(s, 1, "munch-nibblers"), { x: 30, y: 25 });
    blocker.models.forEach((m, i) => (m.pos = { x: 29.6 + (i % 2) * 0.9, y: 25 + Math.floor(i / 2) * 0.9 }));
    // Mama is heavy (never gets cover), so check a Spitter instead.
    const spit = place(s, uidOf(s, 1, "munch-spitter"), { x: 30, y: 20 });
    const before = open;
    const withBlock = saveNeeded(s, shooter, spit, spit.models[0]!, 0, false, sm);
    expect(before).not.toBeNull();
    expect(withBlock).toBe(5); // armor 6, -1 for being obscured
  });
});

describe("initiative roll-off", () => {
  it("rolls a d6 each, re-rolls ties, and the higher roll goes first", () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = createGame({ map: CLASSIC_DUSTBOWL, rules: CLASSIC_RULES, factions: ["militia", "munch"], seed });
      const rolls = s.initiativeRolls!;
      expect(rolls.length).toBeGreaterThan(0);
      rolls.slice(0, -1).forEach(([a, b]) => expect(a).toBe(b));
      const [a, b] = rolls[rolls.length - 1]!;
      expect(a).not.toBe(b);
      expect(s.initiative).toBe(a > b ? 0 : 1);
      expect(s.activePlayer).toBe(s.initiative);
    }
  });
});

describe("abilities are free actions", () => {
  it("Blink doesn't use up the activation: the unit can still move, and the turn stays", () => {
    let s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["concord", "munch"], seed: 8 });
    s.initiative = 0;
    s.activePlayer = 0;
    s.players[0].cp = 5;
    const guard = place(s, uidOf(s, 0, "con-guard"), { x: 10, y: 28 });
    let r = applyCommand(s, { type: "ability", uid: guard.uid, ability: "blink", point: { x: 10, y: 21 } });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(s.activePlayer).toBe(0);
    expect(unitById(s, guard.uid)!.status.acted).toBe(false);
    expect(s.players[0].cp).toBe(4);
    // A second ability in the same phase is refused…
    expect(applyCommand(s, { type: "ability", uid: guard.uid, ability: "blink", point: { x: 10, y: 15 } }).ok).toBe(false);
    // …but the unit can still take its activation.
    r = applyCommand(s, { type: "move", uid: guard.uid, leader: 0, to: { x: 10, y: 18 } });
    if (!r.ok) throw new Error(r.error);
    expect(unitById(r.state, guard.uid)!.status.acted).toBe(true);
  });
});
