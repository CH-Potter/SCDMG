// "Why can't I?" queries for the UI: is an action allowed right now, and if not, why not.
//
// Two layers, both built on the reducer's own rules so the UI can never drift out of step:
//   1. commandProblem(s, cmd): the authoritative answer for one concrete command (a unit, a target,
//      a spot). It dry-runs applyCommand on the immutable state and returns the reducer's own error,
//      or null if the command would be accepted. Nothing from the dry-run's resulting state is used
//      (that would leak dice results); errors are always decided before any dice are rolled.
//   2. actionProblem / supportProblem: "can this button do anything at all?", before a target or a
//      spot is picked. Target-picking actions (shoot, charge, fight, unit-targeted abilities and
//      supports) are answered exactly, by dry-running every candidate target. Spot-picking actions
//      (move, advance, disengage, blink, tunnel...) run the reducer's pre-target checks, with the
//      reducer's own messages; tests/legality.test.ts cross-checks them against commandProblem.
//
// Results are memoised per state object (states are never edited in place), so hover checks stay
// cheap: re-asking about the same state and command is a map lookup.

import { ABILITIES } from "./data/abilities";
import { applyCommand } from "./game";
import { profileOf } from "./profile";
import { abilityOf } from "./reactions";
import {
  aliveModels,
  canAffordDeploy,
  isEngaged,
  onBoard,
  reserves,
  unitById,
  unitGap,
} from "./rules";
import { canPlaySupport, isStructure, supportTarget, teleportProblem } from "./supports";
import type { AbilityId, Command, GameState, Phase, PlayerId, Unit, Vec } from "./types";

// ---------- layer 1: concrete commands ----------

const memo = new WeakMap<GameState, Map<string, string | null>>();
/** Hover points are many; keep each state's cache bounded. */
const MEMO_LIMIT = 4000;

/**
 * Null if the reducer would accept `cmd` in state `s` right now, otherwise its reason. Memoised per
 * state, so it's cheap to call on every refresh. Round hover points (see `snapPoint`) to share
 * results between nearby pointer positions.
 */
export function commandProblem(s: GameState, cmd: Command): string | null {
  let m = memo.get(s);
  if (!m) memo.set(s, (m = new Map()));
  const key = JSON.stringify(cmd);
  const hit = m.get(key);
  if (hit !== undefined) return hit;
  const r = applyCommand(s, cmd);
  const out = r.ok ? null : r.error;
  if (m.size >= MEMO_LIMIT) m.clear();
  m.set(key, out);
  return out;
}

/** Round a board point to a grid (default 0.1") so pointer moves within one cell reuse the cached answer. */
export function snapPoint(p: Vec, step = 0.1): Vec {
  const k = 1 / step;
  return { x: Math.round(p.x * k) / k, y: Math.round(p.y * k) / k };
}

// ---------- layer 2: unit actions before a target is picked ----------

export type UnitAction =
  | { kind: "deploy" }
  | { kind: "move" | "advance" | "disengage" | "charge" | "hunker" | "hold" }
  | { kind: "shoot" | "fight"; weapon: number }
  | { kind: "ability"; id: AbilityId };

/** Which unit commands each phase allows (the reducer's table, see `perform` in game.ts). */
export const PHASE_COMMANDS: Record<Phase, Command["type"][]> = {
  movement: ["deploy", "move", "disengage", "hunker", "hold", "ability"],
  assault: ["shoot", "charge", "advance", "hunker", "hold", "ability"],
  combat: ["fight", "hold"],
  scoring: [],
};

/**
 * The checks every unit command goes through before its own: game over, order choice, whose turn,
 * passed, still in reserve, already acted / exhausted / hunkered. "Hold" is legal in every phase that
 * has activations and has no checks of its own, so dry-running it gives exactly these reasons in the
 * reducer's own words.
 */
function readyProblem(s: GameState, u: Unit): string | null {
  return commandProblem(s, { type: "hold", uid: u.uid });
}

export interface TargetCheck {
  uid: string;
  /** Null if this target can be picked, otherwise why not. */
  problem: string | null;
}

/**
 * Dry-run a unit-targeting command against each candidate. Exact (it is the reducer). The commands
 * for one state are memoised, so asking again on the next refresh is free.
 */
export function checkTargets(s: GameState, candidates: Unit[], make: (t: Unit) => Command): TargetCheck[] {
  return candidates.map((t) => ({ uid: t.uid, problem: commandProblem(s, make(t)) }));
}

/** When no candidate works: the reason for the nearest one (or a fallback if there are none). */
function nearestReason(s: GameState, from: Unit, checks: TargetCheck[], none: string): string | null {
  if (checks.some((c) => c.problem === null)) return null;
  let best: { gap: number; why: string } | null = null;
  for (const c of checks) {
    const t = unitById(s, c.uid);
    if (!t) continue;
    const gap = from.onBoard ? unitGap(from, t) : 0;
    if (!best || gap < best.gap) best = { gap, why: c.problem! };
  }
  return best?.why ?? none;
}

/** The command an action makes against a unit target, or null if it doesn't pick units. */
export function targetCommand(u: Unit, a: UnitAction, target: Unit, point?: Vec): Command | null {
  switch (a.kind) {
    case "charge":
      return { type: "charge", uid: u.uid, target: target.uid };
    case "shoot":
    case "fight":
      return { type: a.kind, uid: u.uid, target: target.uid, weapon: a.weapon };
    case "ability": {
      const needs = ABILITIES[a.id].needs;
      if (needs === "enemyUnit" || needs === "friendlyUnit") return { type: "ability", uid: u.uid, ability: a.id, target: target.uid };
      if (needs === "friendlyUnitAndPoint" && point) return { type: "ability", uid: u.uid, ability: a.id, target: target.uid, point };
      return null;
    }
    default:
      return null;
  }
}

/** The units an action can be aimed at: enemies, the units it's engaged with, or friends. */
export function targetCandidates(s: GameState, u: Unit, a: UnitAction): Unit[] {
  const enemies = onBoard(s).filter((x) => x.owner !== u.owner);
  if (a.kind === "charge" || a.kind === "shoot" || a.kind === "fight") return enemies;
  if (a.kind === "ability") {
    const needs = ABILITIES[a.id].needs;
    if (needs === "enemyUnit") return enemies;
    if (needs === "friendlyUnit") return onBoard(s, u.owner);
    if (needs === "friendlyUnitAndPoint") return onBoard(s, u.owner).filter((x) => x.uid !== u.uid);
  }
  return [];
}

/** Exact per-target answers for a target-picking action (empty for spot-picking ones). */
export function actionTargets(s: GameState, uid: string, a: UnitAction): TargetCheck[] {
  const u = unitById(s, uid);
  if (!u) return [];
  const probe = targetCandidates(s, u, a);
  if (!probe.length || !targetCommand(u, a, probe[0]!)) return [];
  return checkTargets(s, probe, (t) => targetCommand(u, a, t)!);
}

/**
 * Null if unit `uid` can take this kind of action now (there's at least one legal target, for
 * actions that pick a unit), otherwise a short reason. Spot-picking actions only get the checks
 * that don't depend on the spot: whether a spot works is `commandProblem` with that spot.
 */
export function actionProblem(s: GameState, uid: string, a: UnitAction): string | null {
  const unit = unitById(s, uid);
  if (!unit || unit.destroyed) return "No such unit";
  if (s.over) return "The game is over";
  const type: Command["type"] = a.kind;
  if (!PHASE_COMMANDS[s.phase].includes(type)) return `You can't ${type} in the ${s.phase} phase`;

  if (a.kind === "deploy") {
    if (s.orderChoice || unit.owner !== s.activePlayer || s.players[unit.owner].passed) {
      return s.orderChoice ? "Waiting for the order choice" : unit.owner !== s.activePlayer ? "Not your turn" : "You've passed this phase";
    }
    if (unit.onBoard) return "That unit is already deployed";
    return canAffordDeploy(s, unit);
  }
  const ready = readyProblem(s, unit);
  if (ready) return ready;
  if ((a.kind === "move" || a.kind === "advance" || a.kind === "disengage" || a.kind === "charge") && isStructure(unit)) {
    return "Structures can't move";
  }
  const engaged = isEngaged(s, unit);

  switch (a.kind) {
    case "hunker":
    case "hold":
      return commandProblem(s, { type: a.kind, uid: unit.uid });
    case "move":
    case "advance":
      return engaged ? "Engaged units must disengage instead" : null;
    case "disengage":
      return engaged ? null : "That unit isn't engaged";
    case "charge":
      // Every reason (exhausted, shaken, already engaged, out of range...) comes from the reducer.
      return nearestReason(s, unit, actionTargets(s, unit.uid, a), "No enemy units on the table");
    case "shoot":
    case "fight": {
      const w = profileOf(unit).weapons[a.weapon];
      if (!w) return "No such weapon";
      if (w.melee !== (a.kind === "fight")) return a.kind === "fight" ? "That's not a melee weapon" : "That's a melee weapon";
      return nearestReason(s, unit, actionTargets(s, unit.uid, a), a.kind === "fight" ? "Not engaged with anyone" : "No enemy units on the table");
    }
    case "ability":
      return abilityProblem(s, unit, a.id);
  }
}

/** The reducer's ability checks that come before the target (see `useAbility` in game.ts). */
function abilityProblem(s: GameState, u: Unit, id: AbilityId): string | null {
  const def = ABILITIES[id];
  if (!def || !profileOf(u).abilities.includes(id) || def.kind !== "active") return "This unit doesn't have that ability";
  if (def.phase !== s.phase) return `${def.name} is used in the ${def.phase} phase`;
  const used = u.abilityUses[id] ?? 0;
  if (def.usesPerGame !== undefined && used >= def.usesPerGame) return `${def.name} is used up`;
  if (u.status.abilityUsed) return "This unit has already used an ability this phase";
  if (u.status.silenced) return "Silenced: it can't use abilities this round";
  const cp = def.cp ?? 0;
  if (s.players[u.owner].cp < cp) return `${def.name} needs ${cp} CP (you have ${s.players[u.owner].cp})`;
  if (isEngaged(s, u) && id !== "patch-up") return "Can't do that while engaged";
  // Things the ability checks before the spot is known.
  if (id === "tunnel" && s.round === 1) return "Tunnelling can't start until round 2";
  if (id === "rampage" && !profileOf(u).weapons.some((w) => w.melee)) return "This unit has no melee weapon";
  if (!def.needs) return commandProblem(s, { type: "ability", uid: u.uid, ability: id });
  if (def.needs === "enemyUnit" || def.needs === "friendlyUnit") {
    const a: UnitAction = { kind: "ability", id };
    return nearestReason(s, u, actionTargets(s, u.uid, a), def.needs === "enemyUnit" ? "No enemy units on the table" : "No friendly unit to pick");
  }
  if (def.needs === "friendlyUnitAndPoint") {
    const range = def.range ?? 12;
    const friends = onBoard(s, u.owner).filter((f) => f.uid !== u.uid);
    if (!friends.some((f) => unitGap(u, f) <= range)) return `No friendly unit within ${range}"`;
    if (!friends.some((f) => unitGap(u, f) <= range && !isEngaged(s, f))) return "Every friendly unit in range is engaged";
  }
  return null;
}

/**
 * For an ability that picks a unit and then a spot (Recall): null if `target` can be picked as the
 * unit, otherwise why not. The reducer checks these before it looks at the spot.
 */
export function abilityUnitProblem(s: GameState, u: Unit, id: AbilityId, target: Unit): string | null {
  const def = ABILITIES[id];
  if (!target.onBoard || target.owner !== u.owner || target.uid === u.uid) return "Pick another friendly unit";
  if (unitGap(u, target) > (def.range ?? 12)) return `Must be within ${def.range}"`;
  if (isEngaged(s, target)) return "Can't recall an engaged unit";
  return null;
}

// ---------- supports ----------

/** Reserve units an airdrop could bring in: not structures, and payable right now. */
export function droppableReserves(s: GameState, player: PlayerId): Unit[] {
  return reserves(s, player).filter((u) => !isStructure(u));
}

/**
 * Null if the support ability can be played now and has something to aim at, otherwise why not.
 * Unit-targeted supports are answered exactly (every candidate is dry-run); spot-targeted ones
 * check whether there's anything they could act on.
 */
export function supportProblem(s: GameState, player: PlayerId, support: string, ability: string): string | null {
  const why = canPlaySupport(s, player, support, ability);
  if (why) return why;
  const a = abilityOf(support, ability)!;
  const need = supportTarget(a);
  const base = { type: "support" as const, player, support, ability };
  if (need === "none") return commandProblem(s, base);
  if (need === "friendlyUnit" || need === "enemyUnit") {
    const pool = need === "friendlyUnit" ? onBoard(s, player) : onBoard(s).filter((u) => u.owner !== player);
    if (!pool.length) return need === "friendlyUnit" ? "None of your units are on the table" : "No enemy units on the table";
    const checks = checkTargets(s, pool, (t) => ({ ...base, target: t.uid }));
    if (checks.some((c) => c.problem === null)) return null;
    // All fail for the same kind of reason more often than not: show the first.
    return checks[0]!.problem;
  }
  if (need === "reservePoint") {
    const res = droppableReserves(s, player);
    if (!res.length) return "No reserve units to drop in";
    if (!res.some((u) => canAffordDeploy(s, u) === null)) return canAffordDeploy(s, res[0]!) ?? "Nothing you can afford";
    return null;
  }
  if (need === "unitPoint" && a.effect.kind === "teleport") {
    const e = a.effect;
    const movers = onBoard(s, player);
    const reasons = movers.map((u) => {
      const lead = aliveModels(u)[0];
      return lead ? teleportProblem(s, player, e, u, lead.pos) : "Pick one of your units on the table";
    });
    if (reasons.some((r) => r === null)) return null;
    return reasons[0] ?? "None of your units are on the table";
  }
  return null;
}

/** For a support that moves one of your units (Gate Step): null if `u` can be picked, otherwise why not. */
export function supportUnitProblem(s: GameState, player: PlayerId, support: string, ability: string, u: Unit): string | null {
  const a = abilityOf(support, ability);
  if (!a || a.effect.kind !== "teleport") return null;
  const lead = aliveModels(u)[0];
  return lead ? teleportProblem(s, player, a.effect, u, lead.pos) : "Pick one of your units on the table";
}

/**
 * Normal deployment at a spot: null if at least one of `units` can deploy with its leader there,
 * otherwise the reason for the nearest miss. Tries the units in order and stops at the first that
 * fits, so put the likeliest (cheapest, smallest) first.
 */
export function deploySpotProblem(s: GameState, units: Unit[], p: Vec, tries = 4): string | null {
  let first: string | null = null;
  let n = 0;
  for (const u of units) {
    if (n >= tries) break;
    if (canAffordDeploy(s, u)) continue;
    n++;
    const why = commandProblem(s, { type: "deploy", uid: u.uid, to: p });
    if (why === null) return null;
    first ??= why;
  }
  if (first) return first;
  const any = units[0];
  return any ? (canAffordDeploy(s, any) ?? "Nothing to deploy") : "Nothing to deploy";
}
