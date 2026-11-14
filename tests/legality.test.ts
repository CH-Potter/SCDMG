// The UI's "is this allowed, and why not?" queries (src/engine/legality.ts) must agree with the
// reducer. These tests play real AI-vs-AI games and, at every step, compare each answer with what
// applyCommand actually does, so a rule change can't leave the UI saying something stale.

import { describe, expect, it } from "vitest";
import { aiCommand } from "../src/engine/ai";
import { ABILITIES } from "../src/engine/data/abilities";
import { SUPPORTS } from "../src/engine/data/factions";
import { applyCommand, createGame, type GameSetup } from "../src/engine/game";
import {
  actionProblem,
  actionTargets,
  commandProblem,
  deploySpotProblem,
  snapPoint,
  supportProblem,
  type UnitAction,
} from "../src/engine/legality";
import { profileOf } from "../src/engine/profile";
import { abilityOf } from "../src/engine/reactions";
import { aliveModels, onBoard, reserves, unitById } from "../src/engine/rules";
import { supportTarget } from "../src/engine/supports";
import type { Command, GameState, Unit, Vec } from "../src/engine/types";

function actionsFor(u: Unit): UnitAction[] {
  const p = profileOf(u);
  const out: UnitAction[] = [
    { kind: "move" },
    { kind: "advance" },
    { kind: "disengage" },
    { kind: "charge" },
    { kind: "hunker" },
    { kind: "hold" },
  ];
  p.weapons.forEach((w, i) => out.push({ kind: w.melee ? "fight" : "shoot", weapon: i }));
  for (const id of p.abilities) if (ABILITIES[id].kind === "active") out.push({ kind: "ability", id });
  return out;
}

/** A few spots to try spot-picking commands at: around the unit and the board centre. */
function spots(s: GameState, u: Unit): Vec[] {
  const lead = aliveModels(u)[0]!.pos;
  const c = { x: s.board.width / 2, y: s.board.height / 2 };
  return [
    { x: lead.x + 3, y: lead.y },
    { x: lead.x, y: lead.y + 3 },
    { x: lead.x - 2.5, y: lead.y - 2.5 },
    c,
  ].map((p) => ({ x: Math.min(s.board.width - 1, Math.max(1, p.x)), y: Math.min(s.board.height - 1, Math.max(1, p.y)) }));
}

/** Every concrete command an action could become (targets for unit-picking ones, sample spots otherwise). */
function concrete(s: GameState, u: Unit, a: UnitAction): Command[] {
  const lead = aliveModels(u)[0]!;
  const enemies = onBoard(s).filter((x) => x.owner !== u.owner);
  const friends = onBoard(s, u.owner);
  switch (a.kind) {
    case "deploy":
      return [];
    case "move":
    case "advance":
    case "disengage":
      return spots(s, u).map((to) => ({ type: a.kind as "move" | "advance" | "disengage", uid: u.uid, leader: lead.id, to }));
    case "hunker":
    case "hold":
      return [{ type: a.kind as "hunker" | "hold", uid: u.uid }];
    case "charge":
      return enemies.map((t) => ({ type: "charge", uid: u.uid, target: t.uid }));
    case "shoot":
    case "fight":
      return enemies.map((t) => ({ type: a.kind, uid: u.uid, target: t.uid, weapon: a.weapon }));
    case "ability": {
      const needs = ABILITIES[a.id].needs;
      if (!needs) return [{ type: "ability", uid: u.uid, ability: a.id }];
      if (needs === "enemyUnit") return enemies.map((t) => ({ type: "ability", uid: u.uid, ability: a.id, target: t.uid }));
      if (needs === "friendlyUnit") return friends.map((t) => ({ type: "ability", uid: u.uid, ability: a.id, target: t.uid }));
      if (needs === "point") return spots(s, u).map((point) => ({ type: "ability", uid: u.uid, ability: a.id, point }));
      return friends
        .filter((f) => f.uid !== u.uid)
        .flatMap((f) => spots(s, u).map((point) => ({ type: "ability" as const, uid: u.uid, ability: a.id, target: f.uid, point })));
    }
  }
}

/** Actions whose answer is exact (they pick a unit, or need nothing): null must mean some target works. */
function exact(a: UnitAction): boolean {
  if (a.kind === "charge" || a.kind === "shoot" || a.kind === "fight" || a.kind === "hunker" || a.kind === "hold") return true;
  if (a.kind === "ability") {
    const needs = ABILITIES[a.id].needs;
    return !needs || needs === "enemyUnit" || needs === "friendlyUnit";
  }
  return false;
}

/** Messages the action checks itself (not by dry-running), which must match the reducer word for word. */
const restated = (why: string): boolean =>
  /^(You can't \w+ in the|Engaged units must disengage instead|That unit isn't engaged|Structures can't move|.* is used in the .* phase|.* is used up|This unit has already used an ability|.* needs \d+ CP|Can't do that while engaged|Tunnelling can't start|This unit doesn't have that ability)/.test(why);

function checkState(s: GameState): number {
  let checks = 0;
  const p = s.activePlayer;
  for (const u of onBoard(s, p)) {
    for (const a of actionsFor(u)) {
      const why = actionProblem(s, u.uid, a);
      const cmds = concrete(s, u, a);
      const results = cmds.map((c) => applyCommand(s, c));
      checks++;
      if (why !== null) {
        // "Disabled" must be true: nothing the player could click would be accepted...
        for (const r of results) expect(r.ok, `${a.kind} ${u.uid} disabled ("${why}") but a concrete command worked`).toBe(false);
        // ...and a reason the helper states itself must be the reducer's own words.
        if (restated(why) && results.length) {
          const errs = results.map((r) => (r.ok ? null : r.error));
          expect(errs, `${a.kind} ${u.uid}`).toContain(why);
        }
      } else if (exact(a)) {
        // "Enabled" must be true for unit-picking actions: at least one target works.
        expect(
          results.some((r) => r.ok),
          `${a.kind} ${u.uid} enabled but no target worked`,
        ).toBe(true);
      }
    }
  }
  return checks;
}

function supportChecks(s: GameState): void {
  const p = s.activePlayer;
  for (const card of s.players[p].supports) {
    const support = card.id;
    const ids = SUPPORT_ABILITIES(support);
    for (const ability of ids) {
      const a = abilityOf(support, ability)!;
      const need = supportTarget(a);
      if (need !== "friendlyUnit" && need !== "enemyUnit" && need !== "none") continue;
      const why = supportProblem(s, p, support, ability);
      const pool = need === "none" ? [undefined] : need === "friendlyUnit" ? onBoard(s, p) : onBoard(s).filter((u) => u.owner !== p);
      const ok = pool.some((t) => applyCommand(s, { type: "support", player: p, support, ability, ...(t ? { target: t.uid } : {}) }).ok);
      expect(why === null, `support ${support}/${ability}: "${why}"`).toBe(ok);
    }
  }
}

const SUPPORT_ABILITIES = (id: string): string[] => SUPPORTS[id]?.abilities.map((a) => a.id) ?? [];

function play(setup: GameSetup, steps: number, every: (s: GameState) => void): void {
  let s = createGame({ ...setup, orderChoice: false });
  for (let i = 0; i < steps && !s.over; i++) {
    every(s);
    const r = applyCommand(s, aiCommand(s));
    if (!r.ok) break;
    s = r.state;
  }
}

describe("legality helpers agree with the reducer", () => {
  const games: [string, GameSetup][] = [
    ["militia vs munch, skirmish", { factions: ["militia", "munch"], mapId: "dustbowl", seed: 11 }],
    ["concord vs militia, skirmish", { factions: ["concord", "militia"], mapId: "mesa", seed: 5 }],
    ["munch vs concord, assault", { factions: ["munch", "concord"], mapId: "highway", seed: 7 }],
  ];
  for (const [name, setup] of games) {
    it(`unit actions and supports: ${name}`, () => {
      let n = 0;
      play(setup, 70, (s) => {
        n += checkState(s);
        supportChecks(s);
      });
      expect(n).toBeGreaterThan(50);
    }, 120_000);
  }
});

describe("commandProblem", () => {
  it("returns the reducer's error, or null when the command would work", () => {
    const s = createGame({ factions: ["militia", "munch"], mapId: "dustbowl", seed: 1, orderChoice: false });
    const u = reserves(s, s.activePlayer)[0]!;
    expect(commandProblem(s, { type: "deploy", uid: u.uid, to: { x: -50, y: -50 } })).toBeTypeOf("string");
    const zone = s.spawn[s.activePlayer][0]!;
    const c = { x: zone.reduce((n, p) => n + p.x, 0) / zone.length, y: zone.reduce((n, p) => n + p.y, 0) / zone.length };
    const cmd: Command = { type: "deploy", uid: u.uid, to: c };
    const r = applyCommand(s, cmd);
    expect(commandProblem(s, cmd)).toBe(r.ok ? null : r.error);
    // Memoised: asking again gives the same answer without changing the state.
    expect(commandProblem(s, cmd)).toBe(commandProblem(s, cmd));
    expect(unitById(s, u.uid)!.onBoard).toBe(false);
  });

  it("snaps points to a grid", () => {
    expect(snapPoint({ x: 1.234, y: 5.678 })).toEqual({ x: 1.2, y: 5.7 });
    expect(snapPoint({ x: 1.3, y: 1.1 }, 0.5)).toEqual({ x: 1.5, y: 1 });
  });
});

describe("deploy checks", () => {
  it("disables deploys the player can't pay for, with the reducer's reason", () => {
    const s = createGame({ factions: ["militia", "munch"], mapId: "dustbowl", seed: 2, orderChoice: false });
    const p = s.activePlayer;
    s.players[p].resources = 0;
    const u = reserves(s, p)[0]!;
    const why = actionProblem(s, u.uid, { kind: "deploy" });
    expect(why).toMatch(/resources/);
    const zone = s.spawn[p][0]!;
    const c = { x: zone.reduce((n, q) => n + q.x, 0) / zone.length, y: zone.reduce((n, q) => n + q.y, 0) / zone.length };
    expect(commandProblem(s, { type: "deploy", uid: u.uid, to: c })).toBe(why);
  });

  it("says a spot works when some unit can deploy there, and why not outside the zone", () => {
    const s = createGame({ factions: ["militia", "munch"], mapId: "dustbowl", seed: 2, orderChoice: false });
    const p = s.activePlayer;
    const zone = s.spawn[p][0]!;
    const c = { x: zone.reduce((n, q) => n + q.x, 0) / zone.length, y: zone.reduce((n, q) => n + q.y, 0) / zone.length };
    const units = reserves(s, p);
    expect(deploySpotProblem(s, units, c)).toBeNull();
    const far = { x: s.board.width / 2, y: s.board.height / 2 };
    expect(deploySpotProblem(s, units, far)).toBeTypeOf("string");
  });

  it("deploy is off outside the movement phase and for the other side", () => {
    const s = createGame({ factions: ["militia", "munch"], mapId: "dustbowl", seed: 2, orderChoice: false });
    const other = reserves(s, s.activePlayer === 0 ? 1 : 0)[0]!;
    expect(actionProblem(s, other.uid, { kind: "deploy" })).toBe("Not your turn");
    const t = { ...s, phase: "assault" as const };
    const mine = reserves(t, t.activePlayer)[0]!;
    expect(actionProblem(t, mine.uid, { kind: "deploy" })).toBe("You can't deploy in the assault phase");
  });
});

describe("engaged units", () => {
  it("can only disengage in the movement phase; move and most abilities are off with the reducer's reason", () => {
    const s = createGame({ factions: ["militia", "munch"], mapId: "dustbowl", seed: 4, orderChoice: false });
    const me = s.activePlayer;
    const a = reserves(s, me)[0]!;
    const b = reserves(s, me === 0 ? 1 : 0)[0]!;
    const ra = profileOf(a).baseRadius;
    const rb = profileOf(b).baseRadius;
    a.onBoard = true;
    b.onBoard = true;
    a.models.forEach((m, i) => (m.pos = { x: 10 + i * (2 * ra + 0.2), y: 10 }));
    b.models.forEach((m, i) => (m.pos = { x: 10 + i * (2 * rb + 0.2), y: 10 + ra + rb + 0.3 }));
    expect(actionProblem(s, a.uid, { kind: "move" })).toBe("Engaged units must disengage instead");
    expect(actionProblem(s, a.uid, { kind: "disengage" })).toBeNull();
    const r = applyCommand(s, { type: "move", uid: a.uid, leader: a.models[0]!.id, to: { x: 20, y: 20 } });
    expect(r.ok ? null : r.error).toBe("Engaged units must disengage instead");
    const targets = actionTargets(s, a.uid, { kind: "charge" });
    expect(targets.every((t) => t.problem !== null)).toBe(true);
  });
});
