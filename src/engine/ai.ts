// A greedy one-activation-lookahead AI. For each ready unit it generates candidate plans
// (move/move, move/attack, attack/move, move/special), simulates the deterministic parts with
// the real engine, scores the result with expected values, and picks the best plan overall.

import { profileOf } from "./data/factions";
import { applyCommand } from "./game";
import { dist, towards } from "./geometry";
import {
  canEntrench,
  checkAttack,
  checkMove,
  enemiesOf,
  expectedDamage,
  friendsOf,
  healTargets,
  objectiveControl,
  unitById,
  woundsLeft,
} from "./rules";
import type { Command, GameState, PlayerId, Unit, Vec } from "./types";

export interface AiPlan {
  commands: Command[];
  score: number;
}

const DIRECTIONS = 12;

function candidatePoints(s: GameState, u: Unit): Vec[] {
  const p = profileOf(u.profileId);
  const goals: Vec[] = [
    ...s.objectives.map((o) => o.pos),
    ...enemiesOf(s, u.owner).map((e) => e.pos),
  ];
  const pts: Vec[] = goals.flatMap((g) => [towards(u.pos, g, p.move), towards(u.pos, g, p.move / 2)]);
  for (let i = 0; i < DIRECTIONS; i++) {
    const a = (i / DIRECTIONS) * Math.PI * 2;
    pts.push({ x: u.pos.x + Math.cos(a) * p.move, y: u.pos.y + Math.sin(a) * p.move });
  }
  // Charge points: just into base contact with each enemy.
  for (const e of enemiesOf(s, u.owner)) {
    const d = dist(u.pos, e.pos);
    const contact = p.baseRadius + profileOf(e.profileId).baseRadius + 0.05;
    if (d > contact) pts.push(towards(u.pos, e.pos, d - contact));
  }
  return pts.filter((pt) => checkMove(s, u, pt) === null);
}

function bestAttack(s: GameState, u: Unit): { cmd: Command; value: number } | null {
  let best: { cmd: Command; value: number } | null = null;
  profileOf(u.profileId).weapons.forEach((w, wi) => {
    for (const e of enemiesOf(s, u.owner)) {
      if (checkAttack(s, u, e, w) !== null) continue;
      const exp = Math.min(expectedDamage(s, u, e, w), woundsLeft(e));
      const killChance = exp >= woundsLeft(e) * 0.8 ? 1 : 0;
      const value = exp * 2 + killChance * profileOf(e.profileId).cost * 1.5;
      if (!best || value > best.value) best = { cmd: { type: "attack", uid: u.uid, target: e.uid, weapon: wi }, value };
    }
  });
  return best;
}

/** How much damage enemies could plausibly throw at `u` next turn (rough move + attack reach). */
function threatTo(s: GameState, u: Unit): number {
  let total = 0;
  for (const e of enemiesOf(s, u.owner)) {
    const p = profileOf(e.profileId);
    let worst = 0;
    for (const w of p.weapons) {
      const reach = p.move + (w.melee ? 1 : w.range);
      if (dist(e.pos, u.pos) - profileOf(u.profileId).baseRadius - p.baseRadius > reach) continue;
      worst = Math.max(worst, expectedDamage(s, e, u, { ...w, range: Infinity }));
    }
    total += worst;
  }
  return Math.min(total, woundsLeft(u)) / Math.max(1, woundsLeft(u));
}

function positionalScore(s: GameState, me: PlayerId, uid: string): number {
  const control = objectiveControl(s);
  let score = 0;
  for (const c of control) score += c === me ? 3 : c === null ? 0 : -3;
  const u = unitById(s, uid);
  if (u && u.alive) {
    const nearest = Math.min(...s.objectives.map((o) => dist(o.pos, u.pos) - o.radius));
    score -= Math.max(0, nearest) * 0.12;
    const nearestEnemy = Math.min(...enemiesOf(s, me).map((e) => dist(e.pos, u.pos)), 99);
    // Melee-only units want to close in.
    if (profileOf(u.profileId).weapons.every((w) => w.melee)) score -= nearestEnemy * 0.1;
    score -= threatTo(s, u) * profileOf(u.profileId).cost * 0.8;
  }
  return score;
}

function run(s: GameState, cmds: Command[]): GameState | null {
  let cur = s;
  for (const c of cmds) {
    if (c.type === "attack") continue; // attacks are valued by expectation, not rolled
    const r = applyCommand(cur, c);
    if (!r.ok) return null;
    cur = r.state;
  }
  return cur;
}

/** The full command sequence for the AI's next activation, ending it explicitly if needed. */
export function aiCommands(s: GameState): Command[] {
  const plan = planActivation(s);
  if (!plan) return [];
  const uid = plan.commands[0]?.uid ?? s.activation?.uid ?? friendsOf(s, s.activePlayer).find((u) => !u.activated)?.uid;
  if (!uid) return [];
  return [...plan.commands, { type: "end", uid }];
}

/** True if `uid` still needs an explicit "end" (it's mid-activation, or holding without acting). */
export function needsEnd(s: GameState, uid: string): boolean {
  const u = unitById(s, uid);
  return !s.over && !!u && u.alive && !u.activated && u.owner === s.activePlayer;
}

/** Plays one whole AI activation headlessly (used by tests and AI-vs-AI simulation). */
export function playAiActivation(s: GameState): GameState {
  let cur = s;
  for (const cmd of aiCommands(s)) {
    if (cmd.type === "end" && !needsEnd(cur, cmd.uid)) break;
    const r = applyCommand(cur, cmd);
    if (!r.ok) throw new Error(`AI made an illegal move: ${r.error}`);
    cur = r.state;
  }
  return cur;
}

export function planActivation(s: GameState): AiPlan | null {
  const me = s.activePlayer;
  const ready = s.activation
    ? [unitById(s, s.activation.uid)!]
    : friendsOf(s, me).filter((u) => !u.activated);
  let best: AiPlan | null = null;
  const consider = (commands: Command[], attackValue: number, sim: GameState | null, uid: string) => {
    if (!sim) return;
    const score = attackValue + positionalScore(sim, me, uid);
    if (!best || score > best.score) best = { commands, score };
  };

  for (const u of ready) {
    // Attack first, then reposition.
    const atkNow = bestAttack(s, u);
    if (atkNow) {
      consider([atkNow.cmd], atkNow.value, s, u.uid);
      for (const pt of candidatePoints(s, u)) {
        const mv: Command = { type: "move", uid: u.uid, to: pt };
        consider([atkNow.cmd, mv], atkNow.value, run(s, [mv]), u.uid);
      }
    }
    for (const pt of candidatePoints(s, u)) {
      const mv: Command = { type: "move", uid: u.uid, to: pt };
      const after = run(s, [mv]);
      if (!after) continue;
      const moved = unitById(after, u.uid)!;
      // Move then attack.
      const atk = bestAttack(after, moved);
      if (atk) consider([mv, atk.cmd], atk.value, after, u.uid);
      // Move then special.
      if (canEntrench(after, moved)) {
        consider([mv, { type: "entrench", uid: u.uid }], 0.6 * threatTo(after, moved) * profileOf(u.profileId).cost, after, u.uid);
      }
      const heal = healTargets(after, moved)[0];
      if (heal) consider([mv, { type: "heal", uid: u.uid, target: heal.uid }], 1.5, after, u.uid);
      // Double move (dash).
      for (const pt2 of candidatePoints(after, moved).slice(0, 10)) {
        const mv2: Command = { type: "move", uid: u.uid, to: pt2 };
        consider([mv, mv2], 0, run(after, [mv2]), u.uid);
      }
      consider([mv], 0, after, u.uid);
    }
    consider([], 0, s, u.uid);
  }
  return best;
}
