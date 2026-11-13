// Greedy one-activation AI. Each call returns the single best command for the active player:
// candidates are generated per phase, simulated with the real reducer (with a scrambled RNG so
// the AI can't peek at future dice), and scored with expected damage plus a positional evaluation.

import { ABILITIES } from "./data/abilities";
import { expectedDamage, planMelee, planShooting } from "./combat";
import { applyCommand } from "./game";
import { dist, pointInPolygon, towards } from "./geometry";
import { isFlying, profileOf } from "./profile";
import {
  aliveModels,
  deployable,
  effectiveMove,
  eligibleUnits,
  engagedWith,
  isEngaged,
  onBoard,
  presenceController,
  unitGap,
} from "./rules";
import { platformAt } from "./terrain";
import type { Command, GameState, PlayerId, Unit, Vec } from "./types";

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

function centroid(u: Unit): Vec {
  const ms = aliveModels(u);
  return { x: ms.reduce((s, m) => s + m.pos.x, 0) / ms.length, y: ms.reduce((s, m) => s + m.pos.y, 0) / ms.length };
}

const wounds = (u: Unit): number => aliveModels(u).reduce((s, m) => s + m.hp + m.shield, 0);
const maxWounds = (u: Unit): number => {
  const p = profileOf(u);
  return p.models * (p.hp + p.shield);
};
const valuePerWound = (u: Unit): number => profileOf(u).cost / Math.max(1, maxWounds(u));

/** Rough damage a unit could throw at something next turn (ignores sight; cheap). */
function firepower(u: Unit): number {
  const p = profileOf(u);
  const n = aliveModels(u).length;
  return Math.max(...p.weapons.map((w) => (n * w.dice * (7 - w.hit)) / 6 * w.damage * 0.5));
}

function reach(u: Unit): number {
  const p = profileOf(u);
  return p.move + Math.max(...p.weapons.map((w) => (w.melee ? 1 : w.range)));
}

/** Static evaluation from `me`'s point of view. */
export function evaluate(s: GameState, me: PlayerId): number {
  const them = other(me);
  let score = (s.players[me].vp - s.players[them].vp) * 10;
  if (s.over) return s.winner === me ? 1000 : s.winner === them ? -1000 : score;

  for (const o of s.objectives) {
    const c = presenceController(s, o);
    const weight = o.team === null ? 4 : o.team === them ? 3 : 2;
    if (c === me) score += weight;
    else if (c === them) score -= weight;
  }
  for (const u of s.units) {
    if (u.destroyed) {
      score += (u.owner === me ? -1 : 1) * profileOf(u).cost * 1.5;
      continue;
    }
    if (!u.onBoard) continue;
    const sign = u.owner === me ? 1 : -1;
    score += sign * (wounds(u) / maxWounds(u)) * profileOf(u).cost * 1.5;
  }
  // Shaping: our units drift toward objectives we don't hold; melee units toward enemies; avoid threats.
  const enemies = onBoard(s, them);
  for (const u of onBoard(s, me)) {
    const c = centroid(u);
    const prof = profileOf(u);
    if (!isFlying(u)) {
      const targets = s.objectives.filter((o) => presenceController(s, o) !== me || dist(o.pos, c) < o.radius + 1);
      if (targets.length) score -= Math.min(...targets.map((o) => Math.max(0, dist(o.pos, c) - o.radius))) * 0.25;
    }
    const meleeOnly = prof.weapons.every((w) => w.melee);
    if (enemies.length) {
      const nearest = Math.min(...enemies.map((e) => dist(centroid(e), c)));
      if (meleeOnly || isFlying(u)) score -= nearest * 0.15;
    }
    let threat = 0;
    for (const e of enemies) if (unitGap(e, u) <= reach(e)) threat += firepower(e);
    const hunker = u.status.hunkered ? 0.8 : 1;
    score -= Math.min(threat * hunker, wounds(u)) * valuePerWound(u) * 0.2;
  }
  return score;
}

interface Candidate {
  cmd: Command;
  bonus: number; // expected value not visible in the simulated state (attacks)
}

function simulate(s: GameState, cmd: Command): GameState | null {
  const scrambled = { ...s, rng: (s.rng ^ 0x9e3779b9) >>> 0 };
  const r = applyCommand(scrambled, cmd);
  return r.ok ? r.state : null;
}

function sampleZone(zone: Vec[][], step = 2.5): Vec[] {
  const pts: Vec[] = [];
  for (const poly of zone) {
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    for (let x = Math.min(...xs) + 1; x < Math.max(...xs); x += step) {
      for (let y = Math.min(...ys) + 1; y < Math.max(...ys); y += step) {
        const p = { x, y };
        if (pointInPolygon(p, poly)) pts.push(p);
      }
    }
  }
  return pts;
}

/** Goal points for a unit: objectives, the enemy, ramps up to raised objectives. */
function goals(s: GameState, u: Unit): Vec[] {
  const me = u.owner;
  const out: Vec[] = [];
  for (const o of s.objectives) {
    if (o.team === me && presenceController(s, o) === me) continue;
    out.push(o.pos);
    if (o.elevation === 1 && !isFlying(u)) {
      const plat = platformAt(s, o.pos);
      for (const ap of s.access) if (plat && ap.platform === plat.id) out.push(ap.low, ap.high);
    }
  }
  for (const f of s.flags) if (f.team !== me) out.push(f.pos);
  const enemies = onBoard(s, other(me));
  enemies
    .sort((a, b) => unitGap(u, a) - unitGap(u, b))
    .slice(0, 2)
    .forEach((e) => out.push(centroid(e)));
  return out;
}

function moveCandidates(s: GameState, u: Unit, type: "move" | "advance" | "disengage"): Candidate[] {
  const mv = effectiveMove(s, u);
  const out: Candidate[] = [];
  const models = aliveModels(u);
  const targets: Vec[] = [];
  for (const g of goals(s, u)) {
    const leader = models.reduce((a, b) => (dist(a.pos, g) < dist(b.pos, g) ? a : b));
    for (const f of [1, 0.6]) targets.push(towards(leader.pos, g, mv * f));
    targets.push(g);
  }
  const c = centroid(u);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    targets.push({ x: c.x + Math.cos(a) * mv * 0.8, y: c.y + Math.sin(a) * mv * 0.8 });
  }
  for (const t of targets) {
    const leader = models.reduce((a, b) => (dist(a.pos, t) < dist(b.pos, t) ? a : b));
    out.push({ cmd: { type, uid: u.uid, leader: leader.id, to: t }, bonus: 0 });
  }
  return out;
}

function attackCandidates(s: GameState, u: Unit): Candidate[] {
  const out: Candidate[] = [];
  const weapons = profileOf(u).weapons;
  for (const e of onBoard(s, other(u.owner))) {
    weapons.forEach((w, i) => {
      if (w.melee) return;
      const plan = planShooting(s, u, e, w);
      if (typeof plan === "string") return;
      const exp = expectedDamage(s, u, e, plan, false);
      const kill = exp >= wounds(e) * 0.8 ? profileOf(e).cost * 1.5 : 0;
      out.push({ cmd: { type: "shoot", uid: u.uid, target: e.uid, weapon: i }, bonus: exp * valuePerWound(e) * 1.5 + kill });
    });
  }
  return out;
}

function chargeCandidates(s: GameState, u: Unit): Candidate[] {
  const out: Candidate[] = [];
  if (!profileOf(u).weapons.some((w) => w.melee)) return out;
  for (const e of onBoard(s, other(u.owner))) {
    if (unitGap(u, e) > effectiveMove(s, u) + 1) continue;
    const cmd: Command = { type: "charge", uid: u.uid, target: e.uid };
    const after = simulate(s, cmd);
    if (!after) continue;
    const me = after.units.find((x) => x.uid === u.uid)!;
    const them = after.units.find((x) => x.uid === e.uid)!;
    if (me.destroyed || them.destroyed) {
      out.push({ cmd, bonus: 0 });
      continue;
    }
    let best = 0;
    for (const w of profileOf(me).weapons) {
      if (!w.melee) continue;
      const plan = planMelee(me, them, w);
      if (typeof plan !== "string") best = Math.max(best, expectedDamage(after, me, them, plan, true));
    }
    // What they hit back with.
    let back = 0;
    for (const w of profileOf(them).weapons) {
      if (!w.melee) continue;
      const plan = planMelee(them, me, w);
      if (typeof plan !== "string") back = Math.max(back, expectedDamage(after, them, me, plan, true));
    }
    out.push({ cmd, bonus: best * valuePerWound(e) * 1.5 - back * valuePerWound(u) * 0.8 });
  }
  return out;
}

function abilityCandidates(s: GameState, u: Unit): Candidate[] {
  const out: Candidate[] = [];
  const prof = profileOf(u);
  for (const id of prof.abilities) {
    const def = ABILITIES[id];
    if (def.kind !== "active" || def.phase !== s.phase) continue;
    if (def.usesPerGame !== undefined && (u.abilityUses[id] ?? 0) >= def.usesPerGame) continue;
    if (id === "patch-up") {
      for (const f of onBoard(s, u.owner)) {
        const missing = maxWounds(f) - wounds(f);
        if (missing > 0 && (f.uid === u.uid || unitGap(u, f) <= 3)) {
          out.push({ cmd: { type: "ability", uid: u.uid, ability: id, target: f.uid }, bonus: Math.min(2, missing) * valuePerWound(f) * 1.2 });
        }
      }
    } else if (id === "barrage") {
      for (const e of onBoard(s, other(u.owner))) {
        if (isFlying(e)) continue;
        const c = centroid(e);
        const caught = aliveModels(e).filter((m) => dist(m.pos, c) <= 2 + prof.baseRadius).length;
        const friendly = onBoard(s, u.owner).reduce(
          (n, f) => n + aliveModels(f).filter((m) => dist(m.pos, c) <= 2.5).length,
          0,
        );
        out.push({ cmd: { type: "ability", uid: u.uid, ability: id, point: c }, bonus: (caught * 0.4 - friendly * 0.6) * valuePerWound(e) * 2 });
      }
    } else if (id === "blink" || id === "tunnel") {
      for (const g of goals(s, u).slice(0, 4)) {
        const leader = aliveModels(u)[0]!;
        const to = id === "blink" ? towards(leader.pos, g, 9.5) : g;
        out.push({ cmd: { type: "ability", uid: u.uid, ability: id, point: to }, bonus: -0.5 });
      }
    }
  }
  return out;
}

function deployCandidates(s: GameState, p: PlayerId): Candidate[] {
  const out: Candidate[] = [];
  const zone = s.spawn[p];
  const pts = sampleZone(zone);
  const focus = s.objectives.filter((o) => o.team !== p);
  const score = (q: Vec) => Math.min(...focus.map((o) => dist(o.pos, q)));
  pts.sort((a, b) => score(a) - score(b));
  // Deploy the most expensive affordable unit first, at a few good spots.
  const units = deployable(s, p).sort((a, b) => profileOf(b).cost - profileOf(a).cost);
  for (const u of units.slice(0, 3)) {
    for (const q of pts.slice(0, 6)) {
      out.push({ cmd: { type: "deploy", uid: u.uid, to: q }, bonus: 4 + profileOf(u).cost * 0.5 });
    }
  }
  return out;
}

function meleeChoice(s: GameState, u: Unit): Candidate[] {
  const out: Candidate[] = [];
  profileOf(u).weapons.forEach((w, i) => {
    if (!w.melee) return;
    for (const e of engagedWith(s, u)) {
      const plan = planMelee(u, e, w);
      if (typeof plan === "string") continue;
      const exp = expectedDamage(s, u, e, plan, true);
      out.push({ cmd: { type: "fight", uid: u.uid, target: e.uid, weapon: i }, bonus: exp * valuePerWound(e) * 1.5 + 1 });
    }
  });
  return out;
}

/** The AI's next command for the active player. Always returns something legal (falls back to pass). */
export function aiCommand(s: GameState): Command {
  const me = s.activePlayer;
  const candidates: Candidate[] = [];
  const units = eligibleUnits(s, me);

  if (s.phase === "movement") {
    candidates.push(...deployCandidates(s, me));
    for (const u of units) {
      if (isEngaged(s, u)) candidates.push(...moveCandidates(s, u, "disengage"));
      else candidates.push(...moveCandidates(s, u, "move"), ...abilityCandidates(s, u));
      candidates.push({ cmd: { type: "hunker", uid: u.uid }, bonus: 0 });
      candidates.push({ cmd: { type: "hold", uid: u.uid }, bonus: 0.1 });
    }
  } else if (s.phase === "assault") {
    for (const u of units) {
      candidates.push(...attackCandidates(s, u), ...chargeCandidates(s, u), ...abilityCandidates(s, u));
      if (!u.status.disengaged) candidates.push(...moveCandidates(s, u, "advance").slice(0, 10));
      candidates.push({ cmd: { type: "hunker", uid: u.uid }, bonus: 0 });
      candidates.push({ cmd: { type: "hold", uid: u.uid }, bonus: 0 });
    }
  } else if (s.phase === "combat") {
    for (const u of units) {
      candidates.push(...meleeChoice(s, u));
      candidates.push({ cmd: { type: "hold", uid: u.uid }, bonus: -5 });
    }
  }

  const base = evaluate(s, me);
  let best: { cmd: Command; score: number } | null = null;
  for (const c of candidates) {
    const after = simulate(s, c.cmd);
    if (!after) continue;
    // Attacks are valued by expectation; don't double count their simulated (scrambled) dice.
    const positional = c.cmd.type === "shoot" || c.cmd.type === "fight" ? 0 : evaluate(after, me) - base;
    const score = positional + c.bonus;
    if (!best || score > best.score) best = { cmd: c.cmd, score };
  }
  if (best) return best.cmd;
  return { type: "pass", player: me };
}

/** Apply one AI activation (used by tests and AI-vs-AI simulation). */
export function playAiTurn(s: GameState): GameState {
  const r = applyCommand(s, aiCommand(s));
  if (!r.ok) throw new Error(`AI made an illegal move: ${r.error}`);
  return r.state;
}
