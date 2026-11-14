import { SUPPORTS } from "./data/factions";
// Greedy one-activation AI. Each call returns the single best command for the active player.
// Candidates are generated per phase and simulated with the real reducer (on a scrambled RNG so
// the AI can't peek at future dice), then scored as:
//
//   score = (evaluate(after) - evaluate(before))     positional / mission value
//         + bonus                                     expected value the state can't show (attacks)
//         + FOLLOW_UP * (followUp(after) - followUp(before))   movement phase: what this unit can
//                                                     shoot or charge in the coming assault phase
//
// The evaluation is mission-aware: objectives are worth the VP they'll score (sticky objectives
// count for whoever owns them), snacks pull carriers home, and units are drawn toward objectives,
// into weapon range, or into charge range depending on what they're good at.

import { ABILITIES } from "./data/abilities";
import { airdropSpotProblem, canPlaySupport, deployZones, supportTarget } from "./supports";
import { abilityOf } from "./reactions";
import { allRules, MISSIONS, rulesFor } from "./data/missions";
import { cargoDestination, crownObjectives, crownPayout, loadsLeft, markedUnit, targetObjective } from "./scoring";
import { expectedDamage, isFearless, nerveOf, planMelee, planShooting, shakeChance, weaponBonus } from "./combat";
import { applyCommand, planDemoCharge, RALLY_CP } from "./game";
import { planUnitMove } from "./formation";
import { dist, pointInPolygon, pointInZone, towards } from "./geometry";
import { hasKeyword, isFlying, profileOf } from "./profile";
import {
  aliveModels,
  controlWeight,
  supplyFor,
  deployable,
  effectiveMove,
  eligibleUnits,
  engagedWith,
  isEngaged,
  meleeCanHit,
  objectivePresence,
  onBoard,
  presenceController,
  unitGap,
  reserves,
} from "./rules";
import { platformAt, planRoute } from "./terrain";
import type { AbilityId, Command, GameState, Objective, PlayerId, SupportEffect, Unit, Vec } from "./types";

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** Eval points per VP. */
const VP = 10;
/** Eval points per resource of unit value (material). */
const MATERIAL = 1.5;
/** Inches closer an objective seems to the movement shaping per VP it's worth above 1. */
const OBJECTIVE_PULL = 2.5;
/** How much of a unit's assault-phase potential a movement-phase choice is credited with. */
const FOLLOW_UP = 0.7;

// ---------- unit helpers ----------

function centroid(u: Unit): Vec {
  const ms = aliveModels(u);
  if (!ms.length) return u.models[0]?.pos ?? { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const m of ms) {
    x += m.pos.x;
    y += m.pos.y;
  }
  return { x: x / ms.length, y: y / ms.length };
}

const wounds = (u: Unit): number => aliveModels(u).reduce((s, m) => s + m.hp + m.shield, 0);
const maxWounds = (u: Unit): number => {
  const p = profileOf(u);
  return p.models * (p.hp + p.shield);
};
/** Material value of one wound of this unit, in eval points. */
const valuePerWound = (u: Unit): number => (profileOf(u).cost * MATERIAL) / Math.max(1, maxWounds(u));

const pAtLeast = (n: number): number => Math.max(0, Math.min(1, (7 - n) / 6));

/** Rough damage a unit could throw at something in one activation (ignores sight; cheap). */
function firepower(u: Unit): number {
  const p = profileOf(u);
  const n = aliveModels(u).length;
  let best = 0;
  for (const w of p.weapons) best = Math.max(best, n * w.dice * pAtLeast(w.hit) * w.damage * 0.5);
  return best;
}

function reach(u: Unit): number {
  const p = profileOf(u);
  return p.move + Math.max(...p.weapons.map((w) => (w.melee ? 1 : w.range)));
}

/**
 * Can this ground unit ever stand on the objective? A heavy unit can't get onto a raised deck that
 * only has ladders, so it shouldn't wait at the foot of one.
 */
export function canReach(s: GameState, u: Unit, o: Objective): boolean {
  if (o.elevation !== 1 || !hasKeyword(u, "heavy") || hasKeyword(u, "jump")) return true;
  const plat = platformAt(s, o.pos);
  return !plat || s.access.some((ap) => ap.platform === plat.id && ap.kind === "ramp");
}

const rangedWeapons = (u: Unit) => profileOf(u).weapons.filter((w) => !w.melee);
const meleeWeapons = (u: Unit) => profileOf(u).weapons.filter((w) => w.melee);
const isMeleeUnit = (u: Unit): boolean => rangedWeapons(u).length === 0;

// ---------- mission model ----------

/** Eval points for player `p` controlling objective `o` at the coming scoring phase. */
function objectiveWorth(s: GameState, o: Objective, p: PlayerId): number {
  const mission = MISSIONS[s.missionId];
  if (!mission) return 0;
  const roundsLeft = s.maxRounds - s.round + 1;
  let vp = 0;
  // Denial: holding it stops the enemy's crown streak or guard VP.
  for (const rule of rulesFor(mission, other(p))) {
    if (rule.kind === "guard" && o === targetObjective(s, other(p), rule.target) && s.round >= rule.fromRound - 1) vp += rule.vp * 0.8;
    else if (rule.kind === "crown" && o.team === null) {
      const st = s.missionState?.streaks?.[o.id];
      if (st && st.player === other(p) && crownObjectives(s).includes(o)) vp += rule.step * st.rounds * 0.6;
    }
  }
  for (const rule of rulesFor(mission, p)) {
    if (rule.kind === "crown" && o.team === null) {
      vp += crownObjectives(s).includes(o) ? crownPayout(s, o, p, rule) + (roundsLeft > 1 ? rule.step * 0.5 : 0) : rule.outerVp;
    } else if (rule.kind === "shifting" && o.team === null) {
      const ms = s.missionState;
      // The announced objective is worth getting onto early.
      vp += o.number === ms?.live ? rule.vp : o.number === ms?.next && roundsLeft > 1 ? rule.otherVp + rule.vp * 0.4 : rule.otherVp;
    } else if (rule.kind === "loot" && o.team === null && loadsLeft(s, o) > 0) {
      vp += rule.vp + rule.resources * 0.25 + (loadsLeft(s, o) > 1 && roundsLeft > 1 ? rule.vp * 0.3 : 0);
    } else if (rule.kind === "hold" && o.team === null) {
      // Worth taking early: you need to be there when it starts counting.
      vp += rule.vp * (s.round >= rule.fromRound ? 1 : 0.5);
    } else if (rule.kind === "raidHome" && o === targetObjective(s, other(p), rule.target)) {
      vp += rule.vp;
    } else if (rule.kind === "sticky") {
      // Ownership persists, so it keeps paying out in later rounds too.
      const each = o.team === null ? rule.vpNeutral : o.team === other(p) ? rule.vpEnemyHome : 0;
      vp += each * Math.min(2, roundsLeft) * 0.75;
    }
  }
  return vp * VP * 0.6;
}

const isSticky = (s: GameState): boolean => {
  const m = MISSIONS[s.missionId];
  return !!m && allRules(m).some(({ rule }) => rule.kind === "sticky");
};

/** Who will hold an objective at scoring if nothing changes. */
function controlOf(s: GameState, o: Objective): PlayerId | null {
  const c = presenceController(s, o);
  if (c !== null) return c;
  return isSticky(s) ? o.controller : null;
}

function flagVp(s: GameState): number {
  const r = MISSIONS[s.missionId]?.scoring.find((x) => x.kind === "flag");
  return r && r.kind === "flag" ? r.vp : 0;
}

/** VP per enemy supply destroyed that player `p` scores (eliminate, or a role's cull). */
function eliminateVp(s: GameState, p: PlayerId): number {
  const m = MISSIONS[s.missionId];
  let vp = 0;
  for (const r of m ? rulesFor(m, p) : []) if (r.kind === "eliminate" || r.kind === "cull") vp += r.vpPerSupply;
  return vp;
}

/** Bounty VP player `p` scores for destroying unit `t` (if it's the enemy's marked unit). */
function bountyVp(s: GameState, p: PlayerId, t: Unit): number {
  const m = MISSIONS[s.missionId];
  if (!m || t.owner === p || markedUnit(s, t.owner)?.uid !== t.uid) return 0;
  let vp = 0;
  for (const r of rulesFor(m, p)) if (r.kind === "bounty") vp += r.vp;
  return vp;
}

const homeOf = (s: GameState, p: PlayerId): Objective | undefined => s.objectives.find((o) => o.team === p);

// ---------- side-neutral tie-breaking ----------
// Built-in maps are point-symmetric, so each side should see the same game from its own seat. Lists
// (grid samples, objectives, candidates) come in board order, though, and "first among equals"
// then favours one corner of the board, which is a different place for each side. Ordering and
// tie-breaking in each player's own frame (player 2's board rotated 180°) keeps the AI side-neutral.

/** A point as player `p` sees it: player 2's view is the board rotated 180°. */
const framed = (s: GameState, p: PlayerId, v: Vec): Vec => (p === 0 ? v : { x: s.board.width - v.x, y: s.board.height - v.y });

/** Sort points left-to-right, then top-to-bottom, in player `p`'s frame. */
const frameOrder =
  (s: GameState, p: PlayerId) =>
  (a: Vec, b: Vec): number => {
    const fa = framed(s, p, a);
    const fb = framed(s, p, b);
    return fa.x - fb.x || fa.y - fb.y;
  };

/** Unit ids without the owner prefix ("p0-3" and "p1-3" are the same slot in each army). */
const slot = (uid: string | undefined): string => (uid ?? "").replace(/^p[01]-/, "");

/** A side-neutral sort key for breaking exact ties between candidate commands. */
function tieKey(s: GameState, me: PlayerId, c: Command): string {
  const x = c as Command & { uid?: string; target?: string; weapon?: number; ability?: string; leader?: number; to?: Vec; point?: Vec };
  const at = x.to ?? x.point;
  const f = at ? framed(s, me, at) : null;
  const num = (n: number) => (Math.round(n * 1000) + 1e9).toString().padStart(12, "0");
  return [c.type, slot(x.uid), slot(x.target), x.weapon ?? "", x.ability ?? "", x.leader ?? "", f ? num(f.x) : "", f ? num(f.y) : ""].join("|");
}

/** Scores this close are a tie (mirrored positions can differ by float rounding). */
const TIE = 1e-6;

/**
 * Convoy cargo, from `me`'s point of view: a carried cargo is worth more the closer it gets to its
 * destination; a loose one pulls its own side to pick it up and the other side to kick it back.
 */
function cargoScore(s: GameState, me: PlayerId): number {
  const m = MISSIONS[s.missionId];
  if (!m) return 0;
  let score = 0;
  const diag = Math.hypot(s.board.width, s.board.height);
  for (const f of s.flags) {
    if (!f.cargo) continue;
    const rule = rulesFor(m, f.team).find((r) => r.kind === "convoy");
    if (!rule || rule.kind !== "convoy") continue;
    const sign = f.team === me ? 1 : -1;
    const dest = cargoDestination(s, f);
    const span = Math.max(8, deliveryDistance(s, dest, f.home, diag));
    const carrier = f.carrier ? onBoard(s).find((u) => u.uid === f.carrier) : undefined;
    const progress = (from: Vec) => 1 - Math.min(1, deliveryDistance(s, dest, from, diag) / span);
    if (carrier) {
      score += sign * (rule.vp * VP * (0.25 + 0.55 * progress(centroid(carrier))) + rule.carryVp * VP * 0.6);
      continue;
    }
    const atStart = dist(f.pos, f.home) < 0.01;
    if (!atStart) score += sign * rule.vp * VP * 0.15 * progress(f.pos);
    if (sign === 1 || !atStart) {
      const pullers = onBoard(s, me).filter((u) => !isFlying(u) && !profileOf(u).structure);
      if (pullers.length) score -= Math.min(...pullers.map((u) => dist(centroid(u), f.pos))) * (sign === 1 ? 0.4 : 0.3);
    }
  }
  return score;
}

/** Is any model of `u` standing on an objective that matters? */
function onObjective(s: GameState, u: Unit): boolean {
  if (isFlying(u)) return false;
  const r = profileOf(u).baseRadius;
  return s.objectives.some((o) => aliveModels(u).some((m) => m.elevation === o.elevation && dist(m.pos, o.pos) <= o.radius + r));
}

// ---------- evaluation ----------

/** Static evaluation from `me`'s point of view. */
export function evaluate(s: GameState, me: PlayerId): number {
  const them = other(me);
  let score = (s.players[me].vp - s.players[them].vp) * VP;
  if (s.over) return s.winner === me ? 1000 + score : s.winner === them ? -1000 + score : score;

  // Objectives: worth the VP they'll score.
  for (const o of s.objectives) {
    const c = controlOf(s, o);
    if (c === me) score += objectiveWorth(s, o, me);
    else if (c === them) score -= objectiveWorth(s, o, them);
    else {
      // Contested: a little credit for having a foot in the door.
      const [a, b] = objectivePresence(s, o);
      const mine = me === 0 ? a : b;
      if (mine > 0) score += objectiveWorth(s, o, me) * 0.25;
    }
  }

  // Material.
  for (const u of s.units) {
    if (!u.onBoard || u.destroyed) continue;
    const sign = u.owner === me ? 1 : -1;
    score += sign * (wounds(u) / Math.max(1, maxWounds(u))) * profileOf(u).cost * MATERIAL;
  }

  // Snacks.
  const fvp = flagVp(s);
  if (fvp) {
    const diag = Math.hypot(s.board.width, s.board.height);
    for (const f of s.flags) {
      if (f.cargo) continue;
      const sign = f.team === them ? 1 : -1; // their snack is ours to steal
      const thief = sign === 1 ? me : them;
      const carrier = f.carrier ? onBoard(s).find((u) => u.uid === f.carrier) : undefined;
      if (carrier) {
        const d = deliveryDistance(s, thief, centroid(carrier), diag);
        score += sign * fvp * VP * (0.35 + 0.45 * (1 - Math.min(1, d / diag)));
      } else {
        // Get a model to it: thieves to grab it, defenders to return it if it's been dropped.
        const atHome = dist(f.pos, f.home) < 0.01;
        if (sign === 1 || !atHome) {
          const pullers = onBoard(s, me).filter((u) => !isFlying(u));
          if (pullers.length) score -= Math.min(...pullers.map((u) => dist(centroid(u), f.pos))) * 0.3;
        }
      }
    }
  }

  // Convoy cargo: its own side carries it toward its destination; the other side kicks it back.
  score += cargoScore(s, me);

  // Shaping for our own units: toward objectives, into range, into charge reach; away from threats.
  const enemies = onBoard(s, them);
  // Objectives worth VP to us, plus our own ones the enemy is scoring from.
  const wanted = s.objectives.filter((o) => objectiveWorth(s, o, me) > 0 || (o.team === me && controlOf(s, o) === them && objectiveWorth(s, o, them) > 0));
  // Richer objectives pull from further away: each VP of worth above 1 counts as OBJECTIVE_PULL" closer.
  const pull = new Map(wanted.map((o) => [o, Math.max(0, objectiveWorth(s, o, me) / (VP * 0.6) - 1) * OBJECTIVE_PULL]));
  for (const u of onBoard(s, me)) {
    const c = centroid(u);
    const prof = profileOf(u);
    const flying = isFlying(u);
    if (!flying) {
      let best = Infinity;
      for (const o of wanted) {
        if (!canReach(s, u, o)) continue;
        const d = Math.max(0, dist(o.pos, c) - o.radius);
        // Objectives we already hold only pull the units standing on them.
        if (controlOf(s, o) === me && d > 1) continue;
        best = Math.min(best, d - (pull.get(o) ?? 0));
      }
      if (best < Infinity) score -= best * (isMeleeUnit(u) ? 0.12 : 0.22);
    }
    if (enemies.length) {
      const ranged = rangedWeapons(u);
      if (ranged.length) {
        const range = Math.max(...ranged.map((w) => w.range));
        const targetable = enemies.filter((e) => ranged.some((w) => (isFlying(e) ? w.targets !== "ground" : w.targets !== "air")));
        if (targetable.length) {
          const gap = Math.min(...targetable.map((e) => unitGap(u, e)));
          score -= Math.max(0, gap - range + 1) * 0.12;
        }
      }
      if (isMeleeUnit(u) || flying) {
        const reachable = enemies.filter((e) => meleeWeapons(u).some((w) => meleeCanHit(u, e, w.targets)));
        if (reachable.length) {
          const gap = Math.min(...reachable.map((e) => unitGap(u, e)));
          score -= Math.max(0, gap - prof.move) * 0.18;
        }
      }
    }
    let threat = 0;
    for (const e of enemies) if (unitGap(e, u) <= reach(e)) threat += firepower(e);
    const cover = u.status.hunkered ? 0.75 : 1;
    score -= Math.min(threat * cover, wounds(u)) * (valuePerWound(u) / MATERIAL) * 0.15;
  }
  return score;
}

// ---------- attack values ----------

/** Share of an objective swing credited to the attack that causes it (the enemy can still answer it). */
const HOLDER = 0.7;

/**
 * Eval points gained if `e` damage on `t` costs it enough supply (a kill, or losing models) to lose an objective it's holding: to contested, or to us. A sticky objective only
 * changes hands if we have supply on it too (with nobody on it, it stays with its owner).
 */
export function holderValue(s: GameState, t: Unit, e: number): number {
  const p = profileOf(t);
  if (isFlying(t) || p.structure || t.status.shaken) return 0;
  const rem = wounds(t) - e;
  // models left after the damage (wounds come off whole models), and the supply they're worth
  const left = rem <= 0.5 ? 0 : Math.min(aliveModels(t).length, Math.ceil(rem / Math.max(1, p.hp + p.shield) - 1e-9));
  const after = supplyFor(p, left);
  const lost = controlWeight(t) - after;
  if (lost <= 0) return 0;
  const me = other(t.owner);
  const worth = (c: PlayerId | null, o: Objective): number => (c === me ? objectiveWorth(s, o, me) : c === t.owner ? -objectiveWorth(s, o, t.owner) : 0);
  const sticky = isSticky(s);
  const holder = (o: Objective, theirs: number, ours: number): PlayerId | null =>
    theirs > ours ? t.owner : ours > theirs ? me : sticky ? o.controller : null;
  let v = 0;
  for (const o of s.objectives) {
    if (!aliveModels(t).some((m) => m.elevation === o.elevation && dist(m.pos, o.pos) <= o.radius + p.baseRadius)) continue;
    const [a, b] = objectivePresence(s, o);
    const theirs = t.owner === 0 ? a : b;
    const ours = t.owner === 0 ? b : a;
    v += worth(holder(o, theirs - lost, ours), o) - worth(holder(o, theirs, ours), o);
  }
  return Math.max(0, v);
}

/** Eval points for expected damage `exp` on unit `t`: material, focus fire, kills and what it denies. */
function attackValue(s: GameState, t: Unit, exp: number): number {
  const rem = wounds(t);
  if (rem <= 0 || exp <= 0) return 0;
  const e = Math.min(exp, rem);
  const frac = e / rem;
  const prof = profileOf(t);
  let v = e * valuePerWound(t);
  v += prof.cost * MATERIAL * frac * frac * 0.5; // finishing a unit off beats spreading damage around
  if (frac >= 0.85) v += 2;
  const elim = eliminateVp(s, other(t.owner));
  const kill = Math.max(0, Math.min(1, (frac - 0.5) * 2));
  if (elim) v += prof.supply * elim * VP * kill;
  const bounty = bountyVp(s, other(t.owner), t);
  if (bounty) v += bounty * VP * (kill * 0.8 + frac * 0.2); // chip damage sets up the kill
  if (onObjective(s, t)) v += 2 * frac + holderValue(s, t, e) * HOLDER;
  if (s.flags.some((f) => f.carrier === t.uid)) v += 8 * frac;
  v += firepower(t) * frac * 0.4; // fewer guns pointed at us next turn
  return v;
}

/** Best attack value a unit could make in the coming assault phase from where it stands. */
function followUp(s: GameState, u: Unit): number {
  if (!u.onBoard || u.destroyed || u.status.hunkered || isEngaged(s, u)) return 0;
  const enemies = onBoard(s, other(u.owner));
  const prof = profileOf(u);
  const canShoot = !u.status.disengaged || hasKeyword(u, "light");
  let best = 0;
  for (const e of enemies) {
    for (const w of prof.weapons) {
      if (w.melee) {
        if (u.status.disengaged || !meleeCanHit(u, e, w.targets)) continue;
        if (unitGap(u, e) > effectiveMove(s, u) + 0.8) continue;
        const b = weaponBonus(w, e);
        const save = profileOf(e).armor + w.ap + b.ap;
        const pFail = save > 6 ? 1 : 1 - pAtLeast(Math.max(2, save));
        const exp = aliveModels(u).length * (w.dice + b.dice + 1) * pAtLeast(w.hit) * pFail * (w.damage + b.damage);
        best = Math.max(best, attackValue(s, e, exp) * 0.6);
      } else if (canShoot) {
        const plan = planShooting(s, u, e, w);
        if (typeof plan === "string") continue;
        best = Math.max(best, attackValue(s, e, expectedDamage(s, u, e, plan, false)));
      }
    }
  }
  return best;
}

// ---------- candidates ----------

interface Candidate {
  cmd: Command;
  bonus: number; // expected value not visible in the simulated state (attacks)
  /** Unit whose assault-phase potential this movement-phase command changes. */
  follow?: string;
  /**
   * A free ability used before the unit's real action: it's scored as its own gain plus the best
   * action the unit has anyway, so it's used whenever its gain is positive.
   */
  stack?: boolean;
  /** Valued by expectation in `bonus` only (no simulated dice or status changes in the evaluation). */
  expected?: boolean;
}

function simulate(s: GameState, cmd: Command): GameState | null {
  const scrambled = { ...s, rng: (s.rng ^ 0x9e3779b9) >>> 0 };
  const r = applyCommand(scrambled, cmd);
  return r.ok ? r.state : null;
}

/**
 * Candidate points inside a zone, on a grid anchored at the zone's centre. Anchoring on the centre
 * (not a corner) keeps the samples point-symmetric, so mirrored deployment zones get mirrored
 * candidate spots and neither side deploys further forward than the other.
 */
function sampleZone(zone: Vec[][], step = 2, order?: (a: Vec, b: Vec) => number): Vec[] {
  const pts: Vec[] = [];
  for (const poly of zone) {
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const kx = Math.floor((x1 - x0) / 2 / step);
    const ky = Math.floor((y1 - y0) / 2 / step);
    for (let i = -kx; i <= kx; i++) {
      for (let j = -ky; j <= ky; j++) {
        const p = { x: cx + i * step, y: cy + j * step };
        if (pointInZone(p, poly)) pts.push(p);
      }
    }
  }
  return order ? pts.sort(order) : pts;
}

/** Closest point on a polygon's outline to `p` (or `p` itself if it's inside). */
function nearestPointOnPolygon(poly: Vec[], p: Vec): Vec {
  if (pointInPolygon(p, poly)) return p;
  let best = poly[0]!;
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const l2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2));
    const q = { x: a.x + abx * t, y: a.y + aby * t };
    const d = dist(q, p);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/** How far a snack carrier is from delivering: its home objective or its own deployment zone. */
function deliveryDistance(s: GameState, p: PlayerId, from: Vec, fallback: number): number {
  const home = homeOf(s, p);
  let d = home ? Math.max(0, dist(from, home.pos) - home.radius) : fallback;
  for (const poly of s.spawn[p]) d = Math.min(d, dist(from, nearestPointOnPolygon(poly, from)));
  return d;
}

/** Where a unit might want to head: objectives (and the ramps up to them), snacks, enemies. */
function goals(s: GameState, u: Unit): Vec[] {
  const me = u.owner;
  const out: Vec[] = [];
  const flying = isFlying(u);
  const c = centroid(u);
  const carried = s.flags.find((f) => f.carrier === u.uid);
  if (carried) {
    // Snacks go to our home; convoy cargo to its destination side's home.
    const dest = carried.cargo ? cargoDestination(s, carried) : me;
    const home = homeOf(s, dest);
    if (home) out.push(home.pos);
    // The edge of the deployment zone counts as home for delivery.
    for (const poly of s.spawn[dest]) out.push(nearestPointOnPolygon(poly, c));
  }
  if (!flying) {
    for (const o of s.objectives) {
      const worth = objectiveWorth(s, o, me);
      // Our home only needs minding if the enemy can score from it.
      const threatenedHome = o.team === me && controlOf(s, o) !== me && objectiveWorth(s, o, other(me)) > 0;
      if (worth <= 0 && !threatenedHome) continue;
      if (controlOf(s, o) === me && dist(o.pos, c) > o.radius + 2) continue;
      if (!canReach(s, u, o)) continue;
      out.push(o.pos);
      if (o.elevation === 1 && !hasKeyword(u, "jump") && !platformAt(s, c)) {
        const plat = platformAt(s, o.pos);
        // Heavy units can't climb ladders: only the ramps are a way up for them.
        const heavy = hasKeyword(u, "heavy");
        for (const ap of s.access) if (plat && ap.platform === plat.id && !(heavy && ap.kind === "ladder")) out.push(ap.low);
      }
    }
    for (const f of s.flags) {
      if (f.carrier) continue;
      // Snacks: steal theirs, return ours. Cargo: pick ours up, kick theirs back once it's moved.
      if (f.cargo ? f.team === me || dist(f.pos, f.home) > 0.01 : f.team !== me || dist(f.pos, f.home) > 0.01) out.push(f.pos);
    }
  }
  // Enemies: the nearest few, and snack carriers.
  const enemies = onBoard(s, other(me));
  const r = profileOf(u).baseRadius;
  const ranged = rangedWeapons(u);
  const range = ranged.length ? Math.max(...ranged.map((w) => w.range)) : 0;
  const near = [...enemies].sort((a, b) => unitGap(u, a) - unitGap(u, b)).slice(0, 3);
  for (const f of s.flags) {
    const carrier = f.carrier && (f.cargo ? f.team !== me : f.team === me) ? enemies.find((e) => e.uid === f.carrier) : undefined;
    if (carrier && !near.includes(carrier)) near.push(carrier);
  }
  for (const e of near) {
    const ec = centroid(e);
    if (isMeleeUnit(u) || flying) {
      // Stop just short of contact: only charges may end in base contact.
      out.push(towards(ec, c, profileOf(e).baseRadius + r + 1.6));
    }
    if (range) {
      const gap = unitGap(u, e);
      if (gap > range - 1) out.push(towards(c, ec, gap - range + 2));
    }
  }
  return out;
}

/** The point `budget` inches along the planned route from `from` toward `goal` (or null if no route). */
function alongRoute(s: GameState, u: Unit, from: { pos: Vec; elevation: 0 | 1 | 2 }, goal: Vec, budget: number): Vec | null {
  // Bound the search: a detour much longer than the straight line isn't worth planning toward,
  // and an unbounded A* over every waypoint was most of the AI's thinking time on Assault boards.
  const route = planRoute(s, u, from.pos, from.elevation, goal, undefined, dist(from.pos, goal) * 1.5 + 4);
  if (typeof route === "string") return null;
  if (route.length <= budget) return goal;
  const legSum = route.legs.reduce((a, l) => a + dist(l.from, l.to), 0);
  const climb = Math.max(0, route.length - legSum);
  let left = budget;
  for (let i = 0; i < route.legs.length; i++) {
    const leg = route.legs[i]!;
    const prev = route.legs[i - 1];
    if (prev && dist(prev.to, leg.from) > 0.01) {
      // Crossing a ramp or ladder.
      if (left < climb) return prev.to;
      left -= climb;
    }
    const l = dist(leg.from, leg.to);
    if (l >= left) return towards(leg.from, leg.to, Math.max(0, left - 0.05));
    left -= l;
  }
  return goal;
}

function moveCandidates(s: GameState, u: Unit, type: "move" | "advance" | "disengage", limit = 30): Candidate[] {
  const mv = effectiveMove(s, u);
  const models = aliveModels(u);
  const targets: Vec[] = [];
  const add = (p: Vec | null) => {
    if (!p) return;
    if (targets.some((q) => dist(p, q) < 0.75)) return;
    targets.push(p);
  };
  const nearestTo = (p: Vec) => models.reduce((a, b) => (dist(a.pos, p) < dist(b.pos, p) ? a : b));
  for (const g of goals(s, u).sort(frameOrder(s, u.owner))) {
    const leader = nearestTo(g);
    if (dist(leader.pos, g) <= mv) add(g);
    add(alongRoute(s, u, leader, g, mv));
    add(alongRoute(s, u, leader, g, mv * 0.55));
  }
  const c = centroid(u);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + (u.owner === 1 ? Math.PI : 0);
    add({ x: c.x + Math.cos(a) * mv * 0.8, y: c.y + Math.sin(a) * mv * 0.8 });
  }
  return targets.slice(0, limit).map((t) => ({ cmd: { type, uid: u.uid, leader: nearestTo(t).id, to: t }, bonus: 0, follow: u.uid }));
}

function attackCandidates(s: GameState, u: Unit): Candidate[] {
  const out: Candidate[] = [];
  profileOf(u).weapons.forEach((w, i) => {
    if (w.melee) return;
    for (const e of onBoard(s, other(u.owner))) {
      const plan = planShooting(s, u, e, w);
      if (typeof plan === "string") continue;
      const exp = expectedDamage(s, u, e, plan, false);
      out.push({ cmd: { type: "shoot", uid: u.uid, target: e.uid, weapon: i }, bonus: attackValue(s, e, exp) });
    }
  });
  return out;
}

function chargeCandidates(s: GameState, u: Unit): Candidate[] {
  const out: Candidate[] = [];
  if (!meleeWeapons(u).length || u.status.disengaged) return out;
  for (const e of onBoard(s, other(u.owner))) {
    if (!meleeWeapons(u).some((w) => meleeCanHit(u, e, w.targets))) continue;
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
    for (const w of meleeWeapons(me)) {
      const plan = planMelee(me, them, w);
      if (typeof plan !== "string") best = Math.max(best, expectedDamage(after, me, them, plan, true));
    }
    // What they hit back with (after our hits land, so a bit less).
    let back = 0;
    for (const w of meleeWeapons(them)) {
      const plan = planMelee(them, me, w);
      if (typeof plan !== "string") back = Math.max(back, expectedDamage(after, them, me, plan, true));
    }
    const survive = 1 - Math.min(1, best / Math.max(1, wounds(them)));
    // Tying up a shooter in melee also stops it shooting next round.
    const tieUp = rangedWeapons(them).length ? firepower(them) * valuePerWound(u) * 0.2 : 0;
    out.push({ cmd, bonus: attackValue(after, them, best) - back * survive * valuePerWound(me) * 0.8 + tieUp });
  }
  return out;
}

function barrageCandidates(s: GameState, u: Unit, range: number): Candidate[] {
  const out: Candidate[] = [];
  const points: Vec[] = [];
  for (const e of onBoard(s, other(u.owner))) {
    if (isFlying(e)) continue;
    points.push(centroid(e));
    for (const m of aliveModels(e)) points.push(m.pos);
  }
  const seen: Vec[] = [];
  const scored: { p: Vec; v: number }[] = [];
  for (const p of points) {
    if (seen.some((q) => dist(p, q) < 0.8)) continue;
    seen.push(p);
    if (!aliveModels(u).some((m) => dist(m.pos, p) <= range)) continue;
    let v = 0;
    for (const t of onBoard(s)) {
      if (isFlying(t)) continue;
      const r = profileOf(t).baseRadius;
      const caught = aliveModels(t).filter((m) => dist(m.pos, p) <= 2 + r);
      if (!caught.length) continue;
      const save = profileOf(t).armor + 1 - (t.status.hunkered ? 1 : 0);
      const pFail = save > 6 ? 1 : 1 - pAtLeast(Math.max(2, save));
      const exp = caught.length * 0.5 * pFail;
      v += t.owner === u.owner ? -exp * valuePerWound(t) * 2 : attackValue(s, t, exp);
    }
    scored.push({ p, v });
  }
  scored.sort((a, b) => b.v - a.v);
  for (const { p, v } of scored.slice(0, 4)) {
    // Shells are limited: hold them for a decent target.
    out.push({ cmd: { type: "ability", uid: u.uid, ability: "barrage", point: p }, bonus: v - 1.5 });
  }
  return out;
}

function abilityCandidates(s: GameState, u: Unit): Candidate[] {
  const out: Candidate[] = [];
  const prof = profileOf(u);
  const enemies = onBoard(s, other(u.owner));
  for (const id of prof.abilities) {
    const def = ABILITIES[id];
    if (def.kind !== "active" || def.phase !== s.phase) continue;
    if (def.usesPerGame !== undefined && (u.abilityUses[id] ?? 0) >= def.usesPerGame) continue;
    if (id === "patch-up") {
      for (const f of onBoard(s, u.owner)) {
        const missing = maxWounds(f) - wounds(f);
        if (missing > 0 && (f.uid === u.uid || unitGap(u, f) <= (def.range ?? 3))) {
          out.push({ cmd: { type: "ability", uid: u.uid, ability: id, target: f.uid }, bonus: 0.5 });
        }
      }
    } else if (id === "hatch") {
      for (const f of onBoard(s, u.owner)) {
        const lost = f.models.filter((m) => !m.alive).length;
        if (lost > 0 && !isEngaged(s, u) && (f.uid === u.uid || unitGap(u, f) <= (def.range ?? 3))) {
          out.push({ cmd: { type: "ability", uid: u.uid, ability: id, target: f.uid }, bonus: 0.5 });
        }
      }
    } else if (id === "barrage") {
      out.push(...barrageCandidates(s, u, def.range ?? 24));
    } else if (id === "blink" || id === "tunnel") {
      const leader = aliveModels(u)[0]!;
      const pts: Vec[] = [];
      for (const g of goals(s, u)) pts.push(id === "blink" ? towards(leader.pos, g, (def.range ?? 10) - 0.3) : g);
      if (id === "tunnel") {
        // Pop up just outside 6" of an enemy, ready to charge it in the assault phase.
        for (const e of enemies) {
          if (isFlying(e)) continue;
          const ec = centroid(e);
          const er = profileOf(e).baseRadius + prof.baseRadius;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            pts.push({ x: ec.x + Math.cos(a) * (er + 6.6), y: ec.y + Math.sin(a) * (er + 6.6) });
          }
        }
      }
      // Once- or twice-per-game tricks: only worth it for a real gain.
      const cost = id === "tunnel" ? 4 : 1.5;
      for (const p of pts) out.push({ cmd: { type: "ability", uid: u.uid, ability: id, point: p }, bonus: -cost, follow: u.uid });
    } else if (id === "recall") {
      const c = centroid(u);
      const front = enemies.length ? centroid(enemies.reduce((a, b) => (unitGap(u, a) < unitGap(u, b) ? a : b))) : c;
      for (const f of onBoard(s, u.owner)) {
        if (f.uid === u.uid || isEngaged(s, f) || unitGap(u, f) > (def.range ?? 12)) continue;
        if (f.status.acted && s.phase === "assault") continue; // bring units that can still act
        for (const k of [3.2, 2.2]) {
          const toward = towards(c, front, k + prof.baseRadius);
          out.push({ cmd: { type: "ability", uid: u.uid, ability: id, target: f.uid, point: toward }, bonus: -2, follow: f.uid });
        }
      }
    } else if (NEW_ABILITY_AI[id]) {
      out.push(...NEW_ABILITY_AI[id]!(s, u));
    }
  }
  return out;
}

// ---------- newer unit abilities ----------

/** Eval points one CP is worth when an ability spends it (CP is shared with supports). */
const CP_VALUE = 1.2;

/** Rough firepower of the enemies that can reach this unit (as in `evaluate`'s threat term). */
function threatOn(s: GameState, u: Unit): number {
  let threat = 0;
  for (const e of onBoard(s, other(u.owner))) if (unitGap(e, u) <= reach(e)) threat += firepower(e);
  return threat;
}

const failChance = (armor: number): number => (armor > 6 ? 1 : 1 - pAtLeast(Math.max(2, armor)));

/** Expected melee damage from `u` charging `e` with its best melee weapon, with `extra` dice per model. */
function chargeDamage(u: Unit, e: Unit, extra: number): number {
  let best = 0;
  for (const w of meleeWeapons(u)) {
    if (!meleeCanHit(u, e, w.targets)) continue;
    const b = weaponBonus(w, e);
    const pFail = failChance(profileOf(e).armor + w.ap + b.ap);
    best = Math.max(best, aliveModels(u).length * (w.dice + b.dice + 1 + u.status.meleeBonus + extra) * pAtLeast(w.hit) * pFail * (w.damage + b.damage));
  }
  return best;
}

/** Enemies `u` could charge from where it stands this phase. */
const chargeable = (s: GameState, u: Unit): Unit[] =>
  u.status.disengaged || u.status.shaken ? [] : onBoard(s, other(u.owner)).filter((e) => meleeWeapons(u).some((w) => meleeCanHit(u, e, w.targets)) && unitGap(u, e) <= effectiveMove(s, u) + 1);

type AbilityAi = (s: GameState, u: Unit) => Candidate[];

const NEW_ABILITY_AI: Partial<Record<AbilityId, AbilityAi>> = {
  // Drag an enemy off an objective, into our guns, or into charge reach.
  grapple(s, u) {
    const def = ABILITIES.grapple;
    const out: Candidate[] = [];
    if (s.players[u.owner].cp < (def.cp ?? 0)) return out;
    // Other friendly units that can still act may get new chances at the target too (cached "before" values).
    const helpers = eligibleUnits(s, u.owner).filter((f) => f.uid !== u.uid);
    let before: number[] | null = null;
    for (const e of onBoard(s, other(u.owner))) {
      if (isFlying(e) || hasKeyword(e, "heavy") || profileOf(e).structure || unitGap(u, e) > (def.range ?? 10) || isEngaged(s, e)) continue;
      const cmd: Command = { type: "ability", uid: u.uid, ability: "grapple", target: e.uid };
      const after = simulate(s, cmd);
      if (!after) continue;
      before ??= helpers.map((f) => followUp(s, f));
      let others = 0;
      helpers.forEach((f, i) => {
        const fa = after.units.find((x) => x.uid === f.uid)!;
        others += Math.max(0, followUp(after, fa) - before![i]!);
      });
      out.push({ cmd, bonus: others * 0.5 - CP_VALUE - 1, follow: u.uid, stack: true });
    }
    return out;
  },
  // Hop somewhere better, then still shoot or charge.
  "rocket-hop"(s, u) {
    const def = ABILITIES["rocket-hop"];
    const out: Candidate[] = [];
    if (s.players[u.owner].cp < (def.cp ?? 0)) return out;
    const leader = aliveModels(u)[0]!;
    const seen: Vec[] = [];
    for (const g of goals(s, u)) {
      const p = towards(leader.pos, g, (def.range ?? 6) - 0.3);
      if (seen.some((q) => dist(p, q) < 1)) continue;
      seen.push(p);
      out.push({ cmd: { type: "ability", uid: u.uid, ability: "rocket-hop", point: p }, bonus: -CP_VALUE - 0.8, follow: u.uid, stack: true });
    }
    return out.slice(0, 6);
  },
  // More dice for the charge we're about to make, at the cost of softer saves.
  rampage(s, u) {
    if (u.status.reckless) return [];
    const targets = chargeable(s, u);
    if (!targets.length) return [];
    let gain = 0;
    for (const e of targets) gain = Math.max(gain, attackValue(s, e, chargeDamage(u, e, 1)) - attackValue(s, e, chargeDamage(u, e, 0)));
    const exposure = Math.min(threatOn(s, u), wounds(u)) * (1 / 3) * valuePerWound(u);
    return [{ cmd: { type: "ability", uid: u.uid, ability: "rampage" }, bonus: gain * 0.8 - exposure - 0.3, stack: true, expected: true }];
  },
  // Call out the target our shooters will focus.
  spotter(s, u) {
    const def = ABILITIES.spotter;
    const out: Candidate[] = [];
    if (s.players[u.owner].cp < (def.cp ?? 0)) return out;
    const shooters = eligibleUnits(s, u.owner).filter((f) => rangedWeapons(f).length);
    for (const e of onBoard(s, other(u.owner))) {
      if (e.status.spotted || unitGap(u, e) > (def.range ?? 18)) continue;
      let gain = 0;
      for (const f of shooters) {
        let before = 0;
        let after = 0;
        for (const w of rangedWeapons(f)) {
          const plan = planShooting(s, f, e, w);
          if (typeof plan === "string") continue;
          before = Math.max(before, attackValue(s, e, expectedDamage(s, f, e, plan, false)));
          const sharper = { ...plan, hitOn: plan.hitOn > 2 ? plan.hitOn - 1 : plan.hitOn };
          after = Math.max(after, attackValue(s, e, expectedDamage(s, f, e, sharper, false)));
        }
        gain += after - before;
      }
      if (gain <= 0) continue;
      out.push({ cmd: { type: "ability", uid: u.uid, ability: "spotter", target: e.uid }, bonus: gain * 0.6 - CP_VALUE, stack: true, expected: true });
    }
    return out.sort((a, b) => b.bonus - a.bonus).slice(0, 3);
  },
  // Shield whoever is about to take the most fire.
  "bubble-shield"(s, u) {
    const def = ABILITIES["bubble-shield"];
    const out: Candidate[] = [];
    if (s.players[u.owner].cp < (def.cp ?? 0)) return out;
    for (const f of onBoard(s, u.owner)) {
      if (f.uid !== u.uid && unitGap(u, f) > (def.range ?? 6)) continue;
      const soak = Math.min(threatOn(s, f) * 0.6, aliveModels(f).length);
      out.push({ cmd: { type: "ability", uid: u.uid, ability: "bubble-shield", target: f.uid }, bonus: soak * valuePerWound(f) * 0.6 - CP_VALUE - 0.6, stack: true, expected: true });
    }
    return out;
  },
  // Burn a wound for the reach to get into a charge (or onto an objective) this round.
  "sugar-rush"(s, u) {
    const ms = aliveModels(u);
    const sturdiest = Math.max(...ms.map((m) => m.hp + m.shield));
    if (ms.length === 1 && sturdiest <= 1) return [];
    const mv = effectiveMove(s, u);
    let gain = 0;
    if (!u.status.shaken && meleeWeapons(u).length) {
      for (const e of onBoard(s, other(u.owner))) {
        if (!meleeWeapons(u).some((w) => meleeCanHit(u, e, w.targets))) continue;
        const gap = unitGap(u, e);
        if (gap > 2 * mv + 1 && gap <= 2 * mv + 5) gain = Math.max(gain, attackValue(s, e, chargeDamage(u, e, 0)) * 0.3);
      }
    }
    if (!isFlying(u)) {
      for (const o of s.objectives) {
        const d = dist(centroid(u), o.pos) - o.radius;
        if (d > mv && d <= mv + 2 && controlOf(s, o) !== u.owner) gain = Math.max(gain, objectiveWorth(s, o, u.owner) * 0.5);
      }
    }
    // The wound, plus the risk of running a lone big model deeper into enemy guns.
    const cost = valuePerWound(u) * (sturdiest <= 1 ? profileOf(u).hp + profileOf(u).shield : 1) + 0.4 + (ms.length === 1 ? Math.min(threatOn(s, u), wounds(u)) * valuePerWound(u) * 0.3 : 0);
    if (gain <= cost) return [];
    return [{ cmd: { type: "ability", uid: u.uid, ability: "sugar-rush" }, bonus: gain - cost, follow: u.uid, stack: true, expected: true }];
  },
  // Draw fire onto a tough, cheap-per-wound unit when softer friends are in the line of fire.
  provoke(s, u) {
    const def = ABILITIES.provoke;
    if (s.players[u.owner].cp < (def.cp ?? 0) || u.status.provoking) return [];
    const shooters = onBoard(s, other(u.owner)).filter((e) => rangedWeapons(e).length && unitGap(u, e) <= (def.range ?? 18));
    const fire = shooters.reduce((n, e) => n + firepower(e), 0);
    const friends = onBoard(s, u.owner).filter((f) => f.uid !== u.uid && !profileOf(f).structure);
    if (!fire || !friends.length) return [];
    const soft = friends.reduce((n, f) => n + valuePerWound(f) * failChance(profileOf(f).armor), 0) / friends.length;
    const tough = valuePerWound(u) * failChance(profileOf(u).armor);
    // firepower() is half the expected hits, so 2x fire is the round's incoming hits; most would have gone elsewhere.
    const value = fire * 1.2 * (soft - tough) - CP_VALUE - 0.3;
    return value > 0 ? [{ cmd: { type: "ability", uid: u.uid, ability: "provoke" }, bonus: value, stack: true, expected: true }] : [];
  },
  // A once-per-game bomb: save it for a juicy target (structures and mechs especially).
  "demo-charge"(s, u) {
    const def = ABILITIES["demo-charge"];
    const out: Candidate[] = [];
    if (s.players[u.owner].cp < (def.cp ?? 0)) return out;
    for (const e of onBoard(s, other(u.owner))) {
      if (isFlying(e) || unitGap(u, e) > (def.range ?? 4)) continue;
      const plan = planDemoCharge(u, e);
      if (!plan) continue;
      const v = attackValue(s, e, expectedDamage(s, u, e, plan, false));
      out.push({ cmd: { type: "ability", uid: u.uid, ability: "demo-charge", target: e.uid }, bonus: v - CP_VALUE - 1.5, stack: true, expected: true });
    }
    return out;
  },
};

/** Open roster: eval points off a recruit for each copy of it already on the table. */
const OPEN_REPEAT = 3;
/** Open roster: eval points off a flyer or structure for each one already on the table (they can't hold objectives). */
const OPEN_NON_HOLDER = 2;
/** Open roster: objective holders the AI wants on the table, and eval points per missing one. */
const OPEN_HOLDERS = 3;
const OPEN_HOLDER_BONUS = 1.5;

/**
 * Open roster games (openRoster.ts) let the AI buy anything, any number of times. Steer it toward a
 * mixed army: fewer repeats of what it already fields, enough units that can hold objectives (when
 * the mission pays for them), not too many flyers and structures, and anti-air against enemy flyers.
 * Zero in list games.
 */
function recruitBias(s: GameState, p: PlayerId, u: Unit): number {
  if (!s.openRoster) return 0;
  const mine = onBoard(s, p);
  const holds = (x: Unit) => !isFlying(x) && !profileOf(x).structure;
  let b = -OPEN_REPEAT * mine.filter((x) => x.profileId === u.profileId).length;
  if (!holds(u)) b -= OPEN_NON_HOLDER * mine.filter((x) => !holds(x)).length;
  else if (s.objectives.some((o) => objectiveWorth(s, o, p) > 0)) b += OPEN_HOLDER_BONUS * Math.max(0, OPEN_HOLDERS - mine.filter(holds).length);
  const enemyAir = onBoard(s, other(p)).filter(isFlying).reduce((n, x) => n + profileOf(x).supply, 0);
  if (enemyAir && !isFlying(u) && rangedWeapons(u).some((w) => w.targets !== "ground")) b += Math.min(4, enemyAir * 0.8);
  return b;
}

function deployCandidates(s: GameState, p: PlayerId): Candidate[] {
  const out: Candidate[] = [];
  const pts = sampleZone(s.spawn[p], 2, frameOrder(s, p));
  // Spots in the zone closest to each place worth going: objectives, the enemy, their spawn.
  const focus: Vec[] = s.objectives.filter((o) => objectiveWorth(s, o, p) > 0 || (o.team === p && objectiveWorth(s, o, other(p)) > 0)).map((o) => o.pos);
  for (const e of onBoard(s, other(p))) focus.push(centroid(e));
  for (const poly of s.spawn[other(p)]) {
    focus.push({ x: poly.reduce((a, q) => a + q.x, 0) / poly.length, y: poly.reduce((a, q) => a + q.y, 0) / poly.length });
  }
  const spotsFor = (zonePts: Vec[]): Vec[] => {
    const spots: Vec[] = [];
    if (!zonePts.length) return spots;
    for (const f of focus) {
      const best = zonePts.reduce((a, b) => (dist(a, f) < dist(b, f) ? a : b));
      if (!spots.some((q) => dist(q, best) < 1.5)) spots.push(best);
    }
    return spots;
  };
  focus.sort(frameOrder(s, p));
  const baseSpots = spotsFor(pts);
  // Each distinct affordable unit type, at each spot (its own zones may be bigger: burrow exits, field deploy).
  const seen = new Set<string>();
  for (const u of deployable(s, p).sort((a, b) => profileOf(b).cost - profileOf(a).cost)) {
    const key = `${u.profileId}|${u.upgrades.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const zones = deployZones(s, u);
    const spots = zones.length > s.spawn[p].length ? spotsFor(sampleZone(zones, 2, frameOrder(s, p))) : baseSpots;
    for (const q of spots.slice(0, 8)) {
      out.push({ cmd: { type: "deploy", uid: u.uid, to: q }, bonus: 4 + profileOf(u).cost * 0.5 + recruitBias(s, p, u), follow: u.uid });
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
      out.push({ cmd: { type: "fight", uid: u.uid, target: e.uid, weapon: i }, bonus: attackValue(s, e, exp) + 1 });
    }
  });
  return out;
}

/** Every candidate activation for the active player. */
function candidatesFor(s: GameState, me: PlayerId): Candidate[] {
  const candidates: Candidate[] = [];
  const units = eligibleUnits(s, me);
  // Passing early in movement/combat claims the initiative for the next phase. Worth a little,
  // so it wins out over holding units in place but not over real moves, deployments or fights.
  if ((s.phase === "movement" || s.phase === "combat") && (s.initiativeClaim ?? null) === null && !s.players[other(me)].passed) {
    candidates.push({ cmd: { type: "pass", player: me }, bonus: 0.6 });
  }
  if (s.phase === "movement") {
    candidates.push(...deployCandidates(s, me));
    for (const u of units) {
      if (isEngaged(s, u)) candidates.push(...moveCandidates(s, u, "disengage", 14));
      else candidates.push(...moveCandidates(s, u, "move"), ...abilityCandidates(s, u));
      candidates.push({ cmd: { type: "hunker", uid: u.uid }, bonus: 0, follow: u.uid });
      candidates.push({ cmd: { type: "hold", uid: u.uid }, bonus: 0.1, follow: u.uid });
    }
  } else if (s.phase === "assault") {
    for (const u of units) {
      candidates.push(...attackCandidates(s, u), ...chargeCandidates(s, u), ...abilityCandidates(s, u));
      if (!u.status.disengaged) candidates.push(...moveCandidates(s, u, "advance", 16));
      candidates.push({ cmd: { type: "hunker", uid: u.uid }, bonus: 0 });
      candidates.push({ cmd: { type: "hold", uid: u.uid }, bonus: 0 });
    }
  } else if (s.phase === "combat") {
    for (const u of units) {
      candidates.push(...meleeChoice(s, u));
      candidates.push({ cmd: { type: "hold", uid: u.uid }, bonus: -5 });
    }
  }
  return candidates;
}

// ---------- off-board supports ----------

const SUPPORT_THRESHOLD = 1.8;

/** The most useful support play right now, if any is clearly worth its CP. Supports are free actions. */
export function aiSupportCommand(s: GameState): Command | null {
  const me = s.activePlayer;
  const pl = s.players[me];
  const mine = onBoard(s, me);
  const theirs = onBoard(s, other(me));
  let best: { cmd: Command; value: number } | null = null;
  const consider = (cmd: Command, value: number) => {
    if (value < SUPPORT_THRESHOLD || (best && value <= best.value)) return;
    if (!simulate(s, cmd)) return;
    best = { cmd, value };
  };
  const threatened = (u: Unit): number => theirs.reduce((n, e) => n + (unitGap(e, u) <= reach(e) ? firepower(e) : 0), 0);

  for (const card of pl.supports) {
    for (const a of abilityOfCard(card.id)) {
      if (canPlaySupport(s, me, card.id, a.id)) continue;
      const cpLeft = pl.cp - a.cp;
      const base = { type: "support" as const, player: me, support: card.id, ability: a.id };
      const e = a.effect;
      const need = supportTarget(a);
      if (e.kind === "resources") {
        if (s.phase !== "movement") continue;
        const res = reserves(s, me);
        const unlocks = res.some((u) => profileOf(u).cost > pl.resources && profileOf(u).cost <= pl.resources + e.amount);
        consider(base, unlocks ? 3 : res.length ? 1 : 0);
      } else if (e.kind === "heal" || e.kind === "recharge") {
        for (const u of mine) {
          const prof = profileOf(u);
          const missing =
            e.kind === "heal"
              ? aliveModels(u).reduce((n, m) => n + prof.hp - m.hp, 0) + (e.revive && u.models.some((m) => !m.alive) ? prof.hp : 0)
              : aliveModels(u).reduce((n, m) => n + prof.shield - m.shield, 0);
          const amount = e.kind === "heal" ? Math.min(e.amount, missing) : missing;
          consider({ ...base, target: u.uid }, amount * valuePerWound(u) * 1.2);
        }
      } else if (e.kind === "meleeBuff") {
        if (s.phase !== "combat") continue;
        for (const u of eligibleUnits(s, me)) {
          if (u.status.meleeBonus > 0) continue;
          consider({ ...base, target: u.uid }, aliveModels(u).length * e.dice * 0.7);
        }
      } else if (e.kind === "rangedBuff") {
        if (s.phase !== "assault") continue;
        for (const u of eligibleUnits(s, me)) {
          if (u.status.rangedBonus > 0 || !rangedWeapons(u).length) continue;
          const hasShot = theirs.some((t) => rangedWeapons(u).some((w) => typeof planShooting(s, u, t, w) !== "string"));
          if (hasShot) consider({ ...base, target: u.uid }, aliveModels(u).length * e.dice * 0.6);
        }
      } else if (e.kind === "aimBuff") {
        // Precision lands misses and picks targets out of a melee; tracking beats evasive targets.
        if (s.phase !== "assault") continue;
        for (const u of eligibleUnits(s, me)) {
          if ((u.status.precisionBonus ?? 0) > 0 || !rangedWeapons(u).length) continue;
          let best = 0;
          for (const t of theirs) {
            for (const w of rangedWeapons(u)) {
              const before = planShooting(s, u, t, w);
              const evasive = profileOf(t).evade?.against.includes("ranged") ? e.tracking * 0.6 : 0;
              // A target locked in a melee only becomes shootable with precision.
              const opened = typeof before === "string" && isEngaged(s, t) && !isEngaged(s, u) ? 1.2 : 0;
              if (typeof before === "string" && !opened) continue;
              const dice = aliveModels(u).length * w.dice;
              best = Math.max(best, opened + Math.min(e.precision, dice * (1 - pAtLeast(w.hit))) * 0.7 * w.damage + evasive);
            }
          }
          consider({ ...base, target: u.uid }, best * 1.4);
        }
      } else if (e.kind === "regrow") {
        for (const u of mine) {
          const lost = u.models.filter((m) => !m.alive).length;
          if (!lost) continue;
          const back = Math.min(e.models, lost);
          consider({ ...base, target: u.uid }, back * valuePerWound(u) * 1.2 + (onObjective(s, u) ? 0.6 : 0));
        }
      } else if (e.kind === "dugIn") {
        // Dig in whoever the enemy guns can reach the most, before they shoot.
        if (s.phase === "combat") continue;
        for (const u of mine) {
          if (u.status.dugIn || profileOf(u).structure) continue;
          const t = threatened(u);
          const holding = onObjective(s, u) ? 0.8 : 0;
          consider({ ...base, target: u.uid }, t > 1 ? Math.min(3.5, 0.9 + t * 0.25 * e.save) + holding : 0);
        }
      } else if (e.kind === "teleport") {
        if (s.phase !== "movement") continue;
        const evalBase = evaluate(s, me);
        for (const u of mine) {
          if (profileOf(u).structure || isEngaged(s, u) || u.status.acted) continue;
          const leader = aliveModels(u)[0]!;
          for (const g of goals(s, u).slice(0, 5)) {
            const cmd = { ...base, target: u.uid, point: towards(leader.pos, g, e.range - 0.3) };
            const after = simulate(s, cmd);
            const au = after?.units.find((x) => x.uid === u.uid);
            if (!after || !au) continue;
            const gain = evaluate(after, me) - evalBase + FOLLOW_UP * (followUp(after, au) - followUp(s, u));
            consider(cmd, gain - a.cp * CP_VALUE);
          }
        }
      } else if (e.kind === "slow") {
        for (const t of theirs) {
          if (t.status.slowedRounds > 0 || profileOf(t).move === 0) continue;
          const close = mine.some((u) => unitGap(u, t) <= 14);
          consider({ ...base, target: t.uid }, close ? (isMeleeUnit(t) ? 2.4 : 1.6) : 0);
        }
      } else if (e.kind === "blast") {
        for (const t of theirs) {
          if (isFlying(t)) continue;
          const c = centroid(t);
          const caught = aliveModels(t).filter((m) => dist(m.pos, c) <= e.radius + profileOf(t).baseRadius).length;
          consider({ ...base, point: c }, caught * pAtLeast(e.hit) * e.damage * valuePerWound(t) * 0.9);
        }
      } else if (e.kind === "summon") {
        if (s.phase !== "movement" || !mine.length) continue;
        const prof = profileOf({ profileId: e.profileId, upgrades: [] } as unknown as Unit);
        const near = (from: Vec, to: Vec) => towards(from, to, Math.max(1, e.range - 1));
        if (prof.abilities.includes("burrow-exit")) {
          if (!deployable(s, me).length) continue;
          const goalsHere = s.objectives.filter((o) => objectiveWorth(s, o, me) > 0).map((o) => o.pos);
          for (const g of goalsHere) {
            const from = mine.map(centroid).reduce((a, b) => (dist(a, g) < dist(b, g) ? a : b));
            consider({ ...base, point: near(from, g) }, 3);
          }
        } else if (prof.abilities.includes("ward-aura")) {
          const u = [...mine].sort((a, b) => threatened(b) - threatened(a))[0]!;
          const c = centroid(u);
          const enemy = theirs.length ? centroid(theirs.reduce((a, b) => (unitGap(a, u) < unitGap(b, u) ? a : b))) : c;
          consider({ ...base, point: towards(c, enemy, 2.5) }, threatened(u) > 1 ? 2.6 : 0);
        } else if (prof.abilities.includes("lurk")) {
          // A lurking trap goes where enemy ground units are about to walk: between them and our
          // units or the objectives they want.
          const walkers = theirs.filter((t) => !isFlying(t) && !profileOf(t).structure && !isEngaged(s, t));
          for (const t of walkers) {
            const tc = centroid(t);
            const spots = [...mine.map(centroid), ...s.objectives.filter((o) => objectiveWorth(s, o, other(me)) > 0).map((o) => o.pos)];
            for (const sp of spots) {
              const d = dist(sp, tc);
              if (d > reach(t) + 3 || d < e.minEnemyDistance + 2) continue;
              const p = towards(tc, sp, e.minEnemyDistance + 1.5 + profileOf(t).baseRadius);
              consider({ ...base, point: p }, 1.6 + Math.min(1.5, aliveModels(t).length * 0.25));
            }
          }
        } else {
          const u = [...mine].sort((a, b) => threatened(b) - threatened(a))[0]!;
          if (!theirs.length) continue;
          const c = centroid(u);
          const enemy = centroid(theirs.reduce((a, b) => (unitGap(a, u) < unitGap(b, u) ? a : b)));
          consider({ ...base, point: towards(c, enemy, 3.5) }, dist(c, enemy) < 14 ? 2 : 0);
        }
      } else if (e.kind === "rattle") {
        for (const t of theirs) {
          if (isFearless(t) || t.status.shaken) continue;
          if (!aliveModels(t).some((m) => mine.some((u) => aliveModels(u).some((f) => dist(f.pos, m.pos) <= e.range)))) continue;
          const p = shakeChance(nerveOf(t, s) - e.penalty);
          const stakes = 1.5 + profileOf(t).cost * 0.5 + (onObjective(s, t) ? 3 : 0) + (s.flags.some((f) => f.carrier === t.uid) ? 3 : 0);
          consider({ ...base, target: t.uid }, p * stakes);
        }
      } else if (e.kind === "airdrop" && e.anywhere) {
        if (s.phase !== "movement") continue;
        for (const c of anywhereDrops(s, me, e)) consider({ ...base, target: c.uid, point: c.point }, c.value);
      } else if (e.kind === "airdrop") {
        if (s.phase !== "movement" || !mine.length) continue;
        const drops = deployable(s, me)
          .filter((u) => !profileOf(u).structure)
          .sort((a, b) => profileOf(b).cost - profileOf(a).cost)
          .slice(0, 2);
        const targets = s.objectives.filter((o) => objectiveWorth(s, o, me) > 0 && controlOf(s, o) !== me);
        for (const u of drops) {
          for (const o of targets) {
            const fromSpawn = Math.min(...s.spawn[me].map((poly) => dist(nearestPointOnPolygon(poly, o.pos), o.pos)));
            const from = mine.flatMap((f) => aliveModels(f).map((m) => m.pos)).reduce((a, b) => (dist(a, o.pos) < dist(b, o.pos) ? a : b));
            for (const k of [e.range - 1, e.range * 0.6]) {
              const p = dist(from, o.pos) <= k ? o.pos : towards(from, o.pos, k);
              const saved = fromSpawn - dist(p, o.pos);
              consider({ ...base, target: u.uid, point: p }, 0.8 + saved * 0.2 + profileOf(u).cost * 0.1);
            }
          }
        }
      } else if (need === "none") {
        // Reactions: arm them when the enemy is close and we can spare the CP.
        const contact = theirs.some((t) => mine.some((u) => unitGap(u, t) <= 18));
        consider(base, contact && cpLeft >= 1 ? 2 : contact ? 1.5 : 0);
      }
    }
  }
  // Rally: every army can spend CP to steady a Shaken unit.
  if (pl.cp >= RALLY_CP) {
    for (const u of mine) {
      if (!u.status.shaken) continue;
      const value = 1.6 + profileOf(u).cost * 0.25 + (theirs.some((t) => unitGap(t, u) <= 12) ? 0.6 : 0);
      consider({ type: "rally", player: me, target: u.uid }, value);
    }
  }
  return best ? (best as { cmd: Command }).cmd : null;
}

/**
 * Drop-ship landings (an airdrop that can land anywhere): onto objectives worth taking, or within
 * gun range of a soft enemy unit, preferring spots few enemy guns can reach. Best first, a handful only.
 */
function anywhereDrops(
  s: GameState,
  me: PlayerId,
  e: Extract<SupportEffect, { kind: "airdrop" }>,
): { uid: string; point: Vec; value: number }[] {
  const seen = new Set<string>();
  const drops = deployable(s, me)
    .filter((u) => !profileOf(u).structure)
    .sort((a, b) => profileOf(b).cost - profileOf(a).cost)
    .filter((u) => {
      const key = `${u.profileId}|${u.upgrades.join(",")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
  if (!drops.length) return [];
  const theirs = onBoard(s, other(me));
  // Squads spread out around the landing spot: keep some room so the whole unit clears the enemy.
  const clear = (p: Vec) =>
    airdropSpotProblem(s, me, e, p) === null &&
    theirs.every((t) => aliveModels(t).every((m) => dist(m.pos, p) - profileOf(t).baseRadius >= e.minEnemyDistance + 1.5));
  // Enemy guns that could reach a spot next turn (rough: move plus range, no sight).
  const threatAt = (p: Vec) => theirs.reduce((n, t) => n + (dist(centroid(t), p) <= reach(t) ? firepower(t) : 0), 0);
  const penalty = (u: Unit, p: Vec) => {
    const prof = profileOf(u);
    const w = prof.models * (prof.hp + prof.shield);
    return Math.min(threatAt(p), w) * ((prof.cost * MATERIAL) / Math.max(1, w)) * 0.35;
  };
  const fromSpawn = (p: Vec) => Math.min(...s.spawn[me].map((poly) => (pointInPolygon(p, poly) ? 0 : dist(nearestPointOnPolygon(poly, p), p))));
  // Offsets in this player's own frame (player 2's board is rotated 180°), so both sides pick mirrored spots.
  const flip = me === 0 ? 1 : -1;
  const around = (c: Vec, r: number, n = 8): Vec[] =>
    Array.from({ length: n }, (_, i) => ({ x: c.x + flip * Math.cos((i / n) * Math.PI * 2) * r, y: c.y + flip * Math.sin((i / n) * Math.PI * 2) * r }));
  const out: { uid: string; point: Vec; value: number }[] = [];
  /** The first spot (best first) where the whole unit can actually be set down: not in walls, buildings or other bases. */
  const landing = (u: Unit, spots: Vec[]): Vec | undefined =>
    spots.find((p) => typeof planUnitMove(s, u, aliveModels(u)[0]!.id, p, { allowance: 0, teleport: true }) !== "string");

  // Objectives worth holding that we don't already hold.
  for (const o of s.objectives) {
    const worth = objectiveWorth(s, o, me);
    if (worth <= 0 || controlOf(s, o) === me) continue;
    const spots = [o.pos, ...around(o.pos, o.radius * 0.6), ...around(o.pos, o.radius)]
      .filter(clear)
      .map((p) => ({ p, t: threatAt(p) }))
      .sort((a, b) => a.t - b.t)
      .map((x) => x.p);
    if (!spots.length) continue;
    for (const u of drops) {
      if (isFlying(u)) continue; // flyers can't hold objectives
      const p = landing(u, spots);
      if (!p) continue;
      out.push({ uid: u.uid, point: p, value: 0.6 + Math.min(4, worth * 0.12) + fromSpawn(p) * 0.08 + profileOf(u).cost * 0.1 - penalty(u, p) });
    }
  }

  // Soft targets: land just outside the no-go distance, on the far side from the rest of their army.
  const shooters = drops.filter((u) => rangedWeapons(u).length);
  if (shooters.length && theirs.length) {
    const army = { x: theirs.reduce((n, t) => n + centroid(t).x, 0) / theirs.length, y: theirs.reduce((n, t) => n + centroid(t).y, 0) / theirs.length };
    for (const t of theirs) {
      const c = centroid(t);
      const prof = profileOf(t);
      const gap = e.minEnemyDistance + 2;
      // Behind their lines: furthest from the rest of their army first.
      const spots = around(c, gap + prof.baseRadius + 0.6, 12)
        .filter(clear)
        .map((p) => ({ p, d: dist(p, army) }))
        .sort((a, b) => b.d - a.d)
        .map((x) => x.p);
      if (!spots.length) continue;
      for (const u of shooters) {
        const up = profileOf(u);
        let exp = 0;
        for (const w of rangedWeapons(u)) {
          if (w.range < gap + 0.5 || (w.targets === "ground" && isFlying(t)) || (w.targets === "air" && !isFlying(t))) continue;
          const b = weaponBonus(w, t);
          exp = Math.max(exp, up.models * (w.dice + b.dice) * pAtLeast(w.hit) * failChance(prof.armor + w.ap + b.ap) * (w.damage + b.damage));
        }
        if (exp <= 0) continue;
        const p = landing(u, spots);
        if (p) out.push({ uid: u.uid, point: p, value: 0.4 + attackValue(s, t, exp) * 0.5 - penalty(u, p) });
      }
    }
  }
  return out.sort((a, b) => b.value - a.value).slice(0, 6);
}

function abilityOfCard(id: string) {
  const out = [];
  for (const a of SUPPORTS[id]?.abilities ?? []) {
    const def = abilityOf(id, a.id);
    if (def) out.push(def);
  }
  return out;
}

/** The AI's next command for the active player. Always returns something legal (falls back to pass). */
export function aiCommand(s: GameState): Command {
  const me = s.activePlayer;
  // Order choice: moving second lets us react to the opponent, which tests show is the stronger seat.
  if (s.orderChoice) return { type: "chooseOrder", player: s.orderChoice.player, goFirst: false };
  const support = aiSupportCommand(s);
  if (support) return support;
  const candidates = candidatesFor(s, me);
  const base = evaluate(s, me);
  const baseFollow = new Map<string, number>();
  const followBefore = (uid: string): number => {
    let v = baseFollow.get(uid);
    if (v === undefined) {
      const u = s.units.find((x) => x.uid === uid);
      v = u ? followUp(s, u) : 0;
      baseFollow.set(uid, v);
    }
    return v;
  };
  const scored: { c: Candidate; score: number }[] = [];
  const bestOwn = new Map<string, number>();
  for (const c of candidates) {
    const after = simulate(s, c.cmd);
    if (!after) continue;
    // Attacks are valued by expectation; don't double count their simulated (scrambled) dice.
    const attack = c.cmd.type === "shoot" || c.cmd.type === "fight" || c.expected;
    let score = (attack ? 0 : evaluate(after, me) - base) + c.bonus;
    if (c.follow && (s.phase === "movement" || c.cmd.type === "ability")) {
      const u = after.units.find((x) => x.uid === c.follow);
      if (u) score += FOLLOW_UP * (followUp(after, u) - followBefore(c.follow));
    }
    scored.push({ c, score });
    if (c.cmd.type !== "ability" && "uid" in c.cmd) bestOwn.set(c.cmd.uid, Math.max(bestOwn.get(c.cmd.uid) ?? -Infinity, score));
  }
  let best: { cmd: Command; score: number } | null = null;
  for (const { c, score: raw } of scored) {
    // A stacking ability is a free action: credit it with the unit's best real action too.
    const own = c.stack && c.cmd.type === "ability" ? bestOwn.get(c.cmd.uid) : undefined;
    const score = own !== undefined ? raw + Math.max(0, own) : raw;
    if (!best || score > best.score + TIE || (score >= best.score - TIE && tieKey(s, me, c.cmd) < tieKey(s, me, best.cmd))) best = { cmd: c.cmd, score };
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
