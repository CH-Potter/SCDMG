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
import { airdropSpotProblem, canPlaySupport, cardToBurn, deployZones, supportTarget, type DiceEffect } from "./supports";
import { supportAbilityValue } from "./pricing";
import { abilityOf } from "./reactions";
import { allRules, MISSIONS, rulesFor } from "./data/missions";
import { cargoDestination, crownObjectives, crownPayout, loadsLeft, markedUnit, targetObjective } from "./scoring";
import { barrageGun, barrageMarkerFor, evadeTarget, expectedBarrage, expectedDamage, markerCatches, expectedStray, isFearless, nerveOf, PHASE_EVADE, planImpact, planMelee, planShooting, reportMisses, shakeChance, shellOdds, shellSpotted, weaponBonus, type AttackPlan } from "./combat";
import { REROLL_CP, ROLLED_CHARGE_MAX, rulesOf } from "./houseRules";
import { HIDDEN_RANGE } from "./constants";
import { applyCommand, BALE_OUT, bestTwoOfThreeAtLeast, canSee, chargeBonus, chargeNeed, chargeOdds, closeRanksPreview, CROP_DUST, cropDustCaught, disruptProblem, LAY_EGGS, overwatchPlan, planDemoCharge, RALLY_CP, returnFirePlan, smokeCaught, SMOKE_SHELLS, standsTo, standToPlan, tableKey, twoDiceAtLeast, UNIT_DICE_EFFECTS } from "./game";
import { planUnitMove } from "./formation";
import { dist, pointInPolygon, pointInZone, towards } from "./geometry";
import { hasAbility, hasKeyword, isFlying, profileFor, profileOf, reacts } from "./profile";
import {
  aliveModels,
  controlWeight,
  concealment,
  supplyFor,
  deployable,
  effectiveMove,
  eligibleUnits,
  engagedWith,
  isEngaged,
  meleeCanHit,
  allObjectivePresence,
  detected,
  isHidden,
  objectivePresence,
  onBoard,
  presenceController,
  unitGap,
  AURA_RANGE,
  ENGAGE_RANGE,
  reserves,
} from "./rules";
import { allPlaced, platformAt, planRoute, type Placed, type Route } from "./terrain";
import type { AbilityId, BarrageMarker, Command, GameState, Objective, PlayerId, SupportEffect, Unit, Vec } from "./types";

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** Eval points per VP. */
const VP = 10;
/** Eval points per resource of unit value (material). */
const MATERIAL = 1.5;
/** Brood Bond: share of a model's worth credited to a hurt unit standing within reach of its Broodmother (it regrows one at the end of the round). */
const BROOD_REFILL = 0.6;
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
/** A flyer that strikes by diving (impact) or bombing: it wants to get close to ground units. */
const divesAt = (u: Unit, e: Unit): boolean => isFlying(u) && !isFlying(e) && (!!profileOf(u).impact || hasAbility(u, "bombs-away"));
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

/**
 * [unitGap(a, b), unitGap(b, a)] in one pass: the same sums in the same order as unitGap's (the
 * centre distance is the same either way round), so the same numbers.
 */
function gapsBetween(a: Unit, b: Unit): [number, number] {
  const ra = profileOf(a).baseRadius;
  const rb = profileOf(b).baseRadius;
  let ab = Infinity;
  let ba = Infinity;
  for (const am of a.models) {
    if (!am.alive) continue;
    for (const bm of b.models) {
      if (!bm.alive) continue;
      const d = dist(am.pos, bm.pos);
      ab = Math.min(ab, d - ra - rb);
      ba = Math.min(ba, d - rb - ra);
    }
  }
  return [ab, ba];
}

/** Static evaluation from `me`'s point of view. */
export function evaluate(s: GameState, me: PlayerId): number {
  const them = other(me);
  let score = (s.players[me].vp - s.players[them].vp) * VP;
  if (s.over) return s.winner === me ? 1000 + score : s.winner === them ? -1000 + score : score;
  // Pure lookups asked many times per call (per unit and objective): work each out once.
  // controlOf for every objective (presenceController, else a sticky objective's owner).
  const presence = allObjectivePresence(s);
  const sticky = isSticky(s);
  const control = new Map<Objective, PlayerId | null>();
  s.objectives.forEach((o, i) => {
    const [a, b] = presence[i]!;
    control.set(o, a > b ? 0 : b > a ? 1 : sticky ? o.controller : null);
  });
  const controlOfHere = (o: Objective): PlayerId | null => control.get(o)!;
  const worthMemo: [Map<Objective, number>, Map<Objective, number>] = [new Map(), new Map()];
  const worth = (o: Objective, p: PlayerId): number => {
    let w = worthMemo[p].get(o);
    if (w === undefined) {
      w = objectiveWorth(s, o, p);
      worthMemo[p].set(o, w);
    }
    return w;
  };

  // Objectives: worth the VP they'll score.
  for (const [i, o] of s.objectives.entries()) {
    const c = controlOfHere(o);
    if (c === me) score += worth(o, me);
    else if (c === them) score -= worth(o, them);
    else {
      // Contested: a little credit for having a foot in the door.
      const [a, b] = presence[i]!;
      const mine = me === 0 ? a : b;
      if (mine > 0) score += worth(o, me) * 0.25;
    }
  }

  // Material.
  const mothers = s.units.filter((u) => u.onBoard && !u.destroyed && hasAbility(u, "brood-bond"));
  for (const u of s.units) {
    if (!u.onBoard || u.destroyed) continue;
    const sign = u.owner === me ? 1 : -1;
    const prof = profileOf(u);
    score += sign * (wounds(u) / Math.max(1, maxWounds(u))) * prof.cost * MATERIAL;
    // Brood Bond: a hurt brood near its Broodmother gets a model back at the end of the round, so keep
    // hurt broods close to her (and, for the other side, pull them apart or kill her).
    if (mothers.length && !prof.structure && u.models.some((m) => !m.alive) && mothers.some((f) => f.owner === u.owner && f.uid !== u.uid && unitGap(f, u) <= AURA_RANGE))
      score += sign * ((prof.cost * MATERIAL) / Math.max(1, prof.models)) * BROOD_REFILL;
  }

  // Barrage markers still to come down: the damage they'll do to whoever is likely to still be under them.
  for (const mk of s.barrages ?? []) {
    for (const t of s.units) {
      if (!t.onBoard || t.destroyed) continue;
      const exp = expectedBarrage(s, mk, t);
      if (exp > 0) score += (t.owner === me ? -1 : 1) * exp * valuePerWound(t) * stayOdds(s, t);
    }
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
  const enemyReach = enemies.map(reach);
  const enemyFire = enemies.map(firepower);
  // Objectives worth VP to us, plus our own ones the enemy is scoring from.
  const wanted = s.objectives.filter((o) => worth(o, me) > 0 || (o.team === me && controlOfHere(o) === them && worth(o, them) > 0));
  // Richer objectives pull from further away: each VP of worth above 1 counts as OBJECTIVE_PULL" closer.
  const pull = new Map(wanted.map((o) => [o, Math.max(0, worth(o, me) / (VP * 0.6) - 1) * OBJECTIVE_PULL]));
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
        if (controlOfHere(o) === me && d > 1) continue;
        best = Math.min(best, d - (pull.get(o) ?? 0));
      }
      if (best < Infinity) score -= best * (isMeleeUnit(u) ? 0.12 : 0.22);
    }
    // unitGap(u, e) and unitGap(e, u) for every enemy, in one pass over the model pairs.
    const gaps = enemies.map((e) => gapsBetween(u, e));
    if (enemies.length) {
      const ranged = rangedWeapons(u);
      if (ranged.length) {
        const range = Math.max(...ranged.map((w) => w.range));
        const targetable = enemies.flatMap((e, i) => (ranged.some((w) => (isFlying(e) ? w.targets !== "ground" : w.targets !== "air")) ? [i] : []));
        if (targetable.length) {
          const gap = Math.min(...targetable.map((i) => gaps[i]![0]));
          score -= Math.max(0, gap - range + 1) * 0.12;
        }
      }
      if (isMeleeUnit(u) || flying) {
        const reachable = enemies.flatMap((e, i) => (divesAt(u, e) || meleeWeapons(u).some((w) => meleeCanHit(u, e, w.targets)) ? [i] : []));
        if (reachable.length) {
          const gap = Math.min(...reachable.map((i) => gaps[i]![0]));
          score -= Math.max(0, gap - prof.move) * 0.18;
        }
      }
    }
    let threat = 0;
    // Under the ground nobody can reach it; hidden, only enemies close enough to pick it out can.
    const buried = u.status.burrowed && !detected(s, u);
    const hiddenNow = !buried && isHidden(s, u);
    enemies.forEach((_, i) => {
      if (buried || (hiddenNow && gaps[i]![1] > HIDDEN_RANGE)) return;
      if (gaps[i]![1] <= enemyReach[i]!) threat += enemyFire[i]!;
    });
    const cover = u.status.hunkered ? 0.75 : 1;
    score -= Math.min(threat * cover, wounds(u)) * (valuePerWound(u) / MATERIAL) * 0.15;
  }
  return score;
}

// ---------- attack values ----------

/** Models `t` has left after `e` damage (wounds come off whole models). */
function modelsLeft(t: Unit, e: number): number {
  const p = profileOf(t);
  const rem = wounds(t) - e;
  return rem <= 0.5 ? 0 : Math.min(aliveModels(t).length, Math.ceil(rem / Math.max(1, p.hp + p.shield) - 1e-9));
}

/** Supply `e` damage would make `t` concede for the first time (the VP it pays in kill missions). */
function supplyConceded(t: Unit, e: number): number {
  const p = profileOf(t);
  return Math.max(0, p.supply - supplyFor(p, modelsLeft(t, e)) - (t.supplyPaid ?? 0));
}

/** Share of an objective swing credited to the attack that causes it (the enemy can still answer it). */
const HOLDER = 0.7;

/**
 * Eval points gained if `e` damage on `t` costs it enough supply (a kill, or losing models) to lose an objective it's holding: to contested, or to us. A sticky objective only
 * changes hands if we have supply on it too (with nobody on it, it stays with its owner).
 */
export function holderValue(s: GameState, t: Unit, e: number): number {
  const p = profileOf(t);
  if (isFlying(t) || p.structure || t.status.shaken) return 0;
  const after = supplyFor(p, modelsLeft(t, e));
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
  if (elim) v += supplyConceded(t, e) * elim * VP;
  const bounty = bountyVp(s, other(t.owner), t);
  if (bounty) v += bounty * VP * (kill * 0.8 + frac * 0.2); // chip damage sets up the kill
  if (onObjective(s, t)) v += 2 * frac + holderValue(s, t, e) * HOLDER;
  if (s.flags.some((f) => f.carrier === t.uid)) v += 8 * frac;
  v += firepower(t) * frac * 0.4; // fewer guns pointed at us next turn
  return v;
}

/** Best attack value a unit could make in the coming assault phase from where it stands. */
function followUp(s: GameState, u: Unit): number {
  if (!u.onBoard || u.destroyed || u.status.hunkered || u.status.burrowed || isEngaged(s, u)) return 0;
  const enemies = onBoard(s, other(u.owner));
  const prof = profileOf(u);
  const canShoot = !u.status.disengaged || hasKeyword(u, "light");
  let best = 0;
  for (const e of enemies) {
    // Out of reach for anything but a lucky blast: burrowed, or hidden beyond pick-out range.
    if (e.status.burrowed && !detected(s, e)) continue;
    if (isHidden(s, e) && unitGap(u, e) > HIDDEN_RANGE) continue;
    // A flyer's dive (its impact) or the wasps' bomb run: no melee follows, so count it in full.
    if (divesAt(u, e) && !u.status.disengaged && unitGap(u, e) <= effectiveMove(s, u) + 0.8) {
      const imp = prof.impact;
      const fail = (ap: number) => {
        const save = profileOf(e).armor + ap;
        return save > 6 ? 1 : 1 - pAtLeast(Math.max(2, save));
      };
      if (imp) best = Math.max(best, attackValue(s, e, aliveModels(u).length * imp.dice * pAtLeast(imp.hit) * fail(imp.ap) * imp.damage) * 0.8);
      if (hasAbility(u, "bombs-away") && !(u.abilityUses["bombs-away"] ?? 0)) {
        best = Math.max(best, attackValue(s, e, aliveModels(u).length * pAtLeast(3) * fail(1)) * 0.5);
      }
    }
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
  /** The state `simulate` gave for `cmd` while the candidate was built (so it needn't be simulated again on that same state). */
  after?: GameState;
}

/**
 * `tableKey(s)` for the state the AI is thinking about, worked out once per state (the AI never
 * edits a state it's given, and nobody may edit one after applyCommand returned it).
 */
let lastTable: { s: GameState; key: string } | null = null;
function tableOf(s: GameState): string {
  if (lastTable?.s !== s) lastTable = { s, key: tableKey(s) };
  return lastTable.key;
}

/** `evaluate(s, me)` for the state the AI is deciding on, worked out once (same trust as `tableOf`). */
let lastEval: { s: GameState; me: PlayerId; v: number } | null = null;
function baseEval(s: GameState, me: PlayerId): number {
  if (lastEval?.s !== s || lastEval.me !== me) lastEval = { s, me, v: evaluate(s, me) };
  return lastEval.v;
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

/** The planned route from `from` toward `goal` (null if there's none), for `alongRoute`. */
function routeToward(s: GameState, u: Unit, from: { pos: Vec; elevation: 0 | 1 | 2 }, goal: Vec, enemies?: Placed[]): Route | null {
  // Bound the search: a detour much longer than the straight line isn't worth planning toward,
  // and an unbounded A* over every waypoint was most of the AI's thinking time on Assault boards.
  const route = planRoute(s, u, from.pos, from.elevation, goal, enemies, dist(from.pos, goal) * 1.5 + 4);
  return typeof route === "string" ? null : route;
}

/** The point `budget` inches along `route` toward `goal` (or null if there's no route). */
function alongRoute(route: Route | null, goal: Vec, budget: number): Vec | null {
  if (!route) return null;
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
  // The enemy bases routes go around: the same for every goal (planRoute would gather them each time).
  const enemies = allPlaced(s).filter((p) => p.owner !== u.owner);
  for (const g of goals(s, u).sort(frameOrder(s, u.owner))) {
    const leader = nearestTo(g);
    if (dist(leader.pos, g) <= mv) add(g);
    const route = routeToward(s, u, leader, g, enemies);
    add(alongRoute(route, g, mv));
    add(alongRoute(route, g, mv * 0.55));
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
      const stray = expectedStray(s, u, e, w, plan);
      const risk = stray ? stray.damage * valuePerWound(stray.friend) * 2 : 0;
      out.push({ cmd: { type: "shoot", uid: u.uid, target: e.uid, weapon: i }, bonus: attackValue(s, e, exp) - risk - returnFireRisk(s, u, e, exp) });
    }
  });
  return out;
}

/** How far this unit can charge: its move, or with rolled charges the best 2d6 roll. */
const chargeRange = (s: GameState, u: Unit): number => (rulesOf(s).rolledCharges ? ROLLED_CHARGE_MAX + chargeBonus(s, u) : effectiveMove(s, u));
/** How far this unit usually charges (for positioning): its move, or with rolled charges an average roll. */
const likelyChargeRange = (s: GameState, u: Unit): number => (rulesOf(s).rolledCharges ? 7 + chargeBonus(s, u) : effectiveMove(s, u));

function chargeCandidates(s: GameState, u: Unit): Candidate[] {
  const rules = rulesOf(s);
  if (u.status.holding) return []; // holding the line: it stays put
  // Rolled charges and overwatch roll dice the AI mustn't peek at: judge the charge as if it lands,
  // then weigh it by the odds of the roll and the overwatch (or Stand To) it will face.
  if (rules.rolledCharges || rules.overwatch || onBoard(s, other(u.owner)).some(standsTo)) {
    const sure: GameState = { ...s, rules: { ...rules, overwatch: false }, aiAssumeChargesLand: true };
    const base = baseEval(s, u.owner);
    return chargeCandidatesIn(sure, u).map((c): Candidate | null => {
      const e = s.units.find((x) => c.cmd.type === "charge" && x.uid === c.cmd.target)!;
      const raw = rules.rolledCharges ? chargeNeed(s, u, e, tableOf(s)) : 0;
      // Pirouette: the target steps up to 3" away before the roll (the "sure" look-ahead can't show it).
      const dodge = rules.rolledCharges && reacts(e, "pirouette") && !e.reactionsUsed.includes("pirouette") && !isEngaged(s, e) ? (ABILITIES.pirouette.range ?? 3) : 0;
      const need = raw === null ? null : raw + dodge;
      if (need === null || need > ROLLED_CHARGE_MAX) return null;
      const odds = rules.rolledCharges ? chargeOdds(u, need) : 1;
      const after = c.after ?? simulate(sure, c.cmd);
      const position = after ? evaluate(after, u.owner) - base : 0;
      const ow = rules.overwatch ? overwatchPlan(s, e, u) : null;
      // Stand To: a unit braced for it shoots first, at full accuracy, whether the charge lands or not.
      const st = standsTo(e) ? standToPlan(s, e, u) : null;
      const shot = (ow ? expectedDamage(s, e, u, ow.plan, false) * valuePerWound(u) : 0) + (st ? expectedDamage(s, e, u, st.plan, false) * valuePerWound(u) : 0);
      return { cmd: c.cmd, bonus: odds * (c.bonus + position) - shot, expected: true };
    }).filter((c): c is Candidate => c !== null);
  }
  return chargeCandidatesIn(s, u);
}

function chargeCandidatesIn(s: GameState, u: Unit): Candidate[] {
  const out: Candidate[] = [];
  // A flyer's charge is a dive: its impact, with no melee afterwards (flyers never engage).
  const dive = isFlying(u);
  if (u.status.disengaged || (dive ? !profileOf(u).impact : !meleeWeapons(u).length)) return out;
  for (const e of onBoard(s, other(u.owner))) {
    if (isFlying(e)) continue; // flyers can't be charged
    if (!dive && !meleeWeapons(u).some((w) => meleeCanHit(u, e, w.targets))) continue;
    if (unitGap(u, e) > chargeRange(s, u) + 1) continue;
    const cmd: Command = { type: "charge", uid: u.uid, target: e.uid };
    const after = simulate(s, cmd);
    if (!after) continue;
    const me = after.units.find((x) => x.uid === u.uid)!;
    const them = after.units.find((x) => x.uid === e.uid)!;
    if (me.destroyed || them.destroyed) {
      out.push({ cmd, bonus: 0, after });
      continue;
    }
    if (dive) {
      const imp = planImpact(me, them, rulesOf(after));
      const exp = imp ? expectedDamage(after, me, them, imp, true) : 0;
      // Eye Peck: a dive on a gun that hasn't fired yet this round puts it off its aim.
      const peck = exp > 0 && reacts(u, "eye-peck") && !e.status.blinded && !e.status.acted && rangedWeapons(e).length ? Math.min(2.5, firepower(e) * 0.8) * Math.min(1, exp) : 0;
      out.push({ cmd, bonus: imp ? attackValue(after, them, exp) + peck : 0, after });
      continue;
    }
    let best = 0;
    // Both sides close ranks before they strike (if that rule is on).
    const meIn = closeRanksPreview(after, me, them);
    const themIn = closeRanksPreview(after, them, me);
    for (const w of meleeWeapons(me)) {
      const plan = planMelee(meIn, them, w, rulesOf(after));
      if (typeof plan !== "string") best = Math.max(best, expectedDamage(after, me, them, plan, true));
    }
    // What they hit back with (after our hits land, so a bit less).
    let back = 0;
    for (const w of meleeWeapons(them)) {
      const plan = planMelee(themIn, me, w, rulesOf(after));
      if (typeof plan !== "string") back = Math.max(back, expectedDamage(after, them, me, plan, true));
    }
    const survive = 1 - Math.min(1, best / Math.max(1, wounds(them)));
    // Tying up a shooter in melee also stops it shooting next round.
    const tieUp = rangedWeapons(them).length ? firepower(them) * valuePerWound(u) * 0.2 : 0;
    out.push({ cmd, bonus: attackValue(after, them, best) - back * survive * valuePerWound(me) * 0.8 + tieUp, after });
  }
  return out;
}

/**
 * How likely `t` is to still be where it stands when the barrages come down at the end of the assault
 * phase: structures and units in a melee stay put; a unit that has already moved this round mostly
 * stays; one still to move will usually step out of a marker it can see.
 */
function stayOdds(s: GameState, t: Unit): number {
  const p = profileOf(t);
  if (p.structure || t.status.hunkered) return 1;
  if (isEngaged(s, t)) return 0.9;
  // A free melee unit is about to charge somewhere: it won't wait under a marker.
  if (isMeleeUnit(t)) return s.phase === "movement" && !t.status.acted ? 0.15 : 0.35;
  const settled = s.phase !== "movement" || t.status.acted;
  let odds = settled ? 0.8 : effectiveMove(s, t) <= 4 ? 0.55 : 0.3;
  if (onObjective(s, t)) odds = Math.min(1, odds + 0.15);
  return odds;
}

/**
 * Our own units the enemies under a marker could drag into a fight on top of it: within charge reach
 * of an enemy melee unit the marker catches, and close enough to the marker for the scrum to spill
 * under it. Their wounds count as at risk.
 */
function scrumRisk(s: GameState, mark: BarrageMarker, me: PlayerId): number {
  let risk = 0;
  const caughtMelee = onBoard(s, other(me)).filter((e) => isMeleeUnit(e) && markerCatches(mark, e).length && !isEngaged(s, e));
  if (!caughtMelee.length) return 0;
  for (const f of onBoard(s, me)) {
    if (isFlying(f) || profileOf(f).structure) continue;
    const near = aliveModels(f).some((m) => dist(m.pos, mark.pos) <= mark.radius + 4);
    if (!near || !caughtMelee.some((e) => unitGap(e, f) <= likelyChargeRange(s, e))) continue;
    risk += Math.min(wounds(f), mark.dice * mark.damage * 0.4) * valuePerWound(f);
  }
  return risk;
}

/**
 * Barrage marker spots: on the enemy units it can reach, scored by the damage it would do to the ones
 * likely to stay under it, discounted for drift, less twice the damage it would do to our own.
 */
function barrageCandidates(s: GameState, u: Unit): Candidate[] {
  const gun = barrageGun(profileOf(u));
  if (!gun) return [];
  const def = ABILITIES.barrage;
  // Cheap first pass: spots on enemy units within reach, ranked by the enemy models a marker there would catch.
  const rough: { p: Vec; n: number }[] = [];
  const seen: Vec[] = [];
  for (const e of onBoard(s, other(u.owner))) {
    if (isFlying(e)) continue;
    for (const p of [centroid(e), ...aliveModels(e).map((m) => m.pos)]) {
      if (seen.some((q) => dist(p, q) < 0.8)) continue;
      seen.push(p);
      if (!aliveModels(u).some((m) => dist(m.pos, p) <= gun.range)) continue;
      const mark = barrageMarkerFor(u, p)!;
      let n = 0;
      for (const t of onBoard(s)) n += (t.owner === u.owner ? -2 : 1) * markerCatches(mark, t).length;
      if (n > 0) rough.push({ p, n });
    }
  }
  rough.sort((a, b) => b.n - a.n);
  const out: Candidate[] = [];
  const scored: { p: Vec; v: number }[] = [];
  for (const { p } of rough.slice(0, 6)) {
    const mark = barrageMarkerFor(u, p)!;
    const { onTarget } = shellOdds(gun.hit, shellSpotted(s, u, p), rulesOf(s).scatter);
    const accuracy = onTarget + (1 - onTarget) * 0.25;
    let v = 0;
    for (const t of onBoard(s)) {
      const exp = expectedBarrage(s, mark, t);
      if (exp <= 0) continue;
      const stay = stayOdds(s, t);
      // Our own units: the full risk if they're stuck there, less if they can still walk out of it.
      v += t.owner === u.owner ? -exp * valuePerWound(t) * 2 * stay : attackValue(s, t, exp * accuracy) * stay;
    }
    v -= scrumRisk(s, mark, u.owner);
    scored.push({ p, v });
  }
  scored.sort((a, b) => b.v - a.v);
  for (const { p, v } of scored.slice(0, 3)) {
    // A free action within the move: it stacks with the unit's best real action.
    // Its CP is shared with the supports: keep it for a card play worth more.
    const reserve = cpReserve(s, u.owner, "barrage", def.cp ?? 0);
    out.push({ cmd: { type: "ability", uid: u.uid, ability: "barrage", point: p }, bonus: v - (def.cp ?? 0) * CP_VALUE - reserve - 0.3, stack: true, expected: true });
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
    } else if (id === "burrow") {
      // Going under is the unit's movement: the evaluation weighs the fire it escapes against the
      // objectives it lets go and the attacks it gives up (it surfaces later with a short move).
      if (!u.status.burrowed) {
        // Credit the shots it dodges this round (the evaluation only nudges units away from threats),
        // and a Lurk ambush waiting under the ground for enemies coming its way.
        const dodged = Math.min(threatOn(s, u), wounds(u)) * valuePerWound(u) * 0.25;
        const ambush = hasAbility(u, "lurk") && enemies.some((e) => !isFlying(e) && unitGap(u, e) <= 10) ? 0.6 : 0;
        out.push({ cmd: { type: "ability", uid: u.uid, ability: "burrow" }, bonus: dodged + ambush - 1 });
      }
    } else if (id === "barrage") {
      out.push(...barrageCandidates(s, u));
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
      // Once- or twice-per-game tricks: only worth it for a real gain. Tunnel is a free action: the unit
      // still moves (and charges) after popping up, so it stacks with its best real action.
      const tunnel = id === "tunnel";
      const cost = tunnel ? 1 + (def.cp ?? 0) * CP_VALUE : 1.5;
      for (const p of pts) out.push({ cmd: { type: "ability", uid: u.uid, ability: id, point: p }, bonus: -cost, follow: u.uid, ...(tunnel ? { stack: true } : {}) });
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
  u.status.disengaged || u.status.shaken ? [] : onBoard(s, other(u.owner)).filter((e) => meleeWeapons(u).some((w) => meleeCanHit(u, e, w.targets)) && unitGap(u, e) <= likelyChargeRange(s, u) + 1);

/**
 * How much better the shots player `me`'s ready shooters can take at enemy `targetUid` get from
 * `before` to `after` (a debuff such as Spotlight, a spot or an exposed target): the sum, over each
 * shooter, of its best attack value at the target.
 */
function shotGain(before: GameState, after: GameState, me: PlayerId, targetUid: string): number {
  const best = (st: GameState, f: Unit, t: Unit): number => {
    let v = 0;
    for (const w of rangedWeapons(f)) {
      const plan = planShooting(st, f, t, w);
      if (typeof plan === "string") continue;
      v = Math.max(v, attackValue(st, t, expectedDamage(st, f, t, plan, false)));
    }
    return v;
  };
  const t0 = before.units.find((x) => x.uid === targetUid);
  const t1 = after.units.find((x) => x.uid === targetUid);
  if (!t0 || !t1) return 0;
  let gain = 0;
  for (const f of eligibleUnits(before, me)) {
    if (!rangedWeapons(f).length) continue;
    const f1 = after.units.find((x) => x.uid === f.uid);
    if (f1) gain += Math.max(0, best(after, f1, t1) - best(before, f, t0));
  }
  return gain;
}

/** Return Fire: what shooting `e` (for `exp` expected damage) is likely to cost `u` when `e` shoots back. */
function returnFireRisk(s: GameState, u: Unit, e: Unit, exp: number): number {
  if (!reacts(e, "return-fire") || e.reactionsUsed.includes("return-fire") || exp <= 0 || exp >= wounds(e)) return 0;
  const rf = returnFirePlan(s, e, u);
  return rf ? expectedDamage(s, e, u, rf.plan, false) * valuePerWound(u) * Math.min(1, exp) : 0;
}

type AbilityAi = (s: GameState, u: Unit) => Candidate[];

// ---------- the CP ability pass: shared valuations ----------

/** How much worse `e`'s saves are right now from statuses (Corrode, Eat Through, Rampage, armour buffs). */
const saveShiftOf = (e: Unit): number => (e.status.corroded ? 1 : 0) + (e.status.melting ? 1 : 0) + (e.status.reckless ? 1 : 0) - (e.status.saveMod ?? 0);

/** Expected melee damage from `u` on `e` (charging), with extra dice per model, `worse` saves and extra damage per hit. */
function meleeExp(u: Unit, e: Unit, extra = 0, worse = 0, dmg = 0): number {
  let best = 0;
  for (const w of meleeWeapons(u)) {
    if (!meleeCanHit(u, e, w.targets)) continue;
    const b = weaponBonus(w, e);
    const dice = Math.max(1, w.dice + b.dice + 1 + u.status.meleeBonus + (u.status.diceMod ?? 0) + extra);
    const pFail = failChance(profileOf(e).armor + w.ap + b.ap + saveShiftOf(e) + worse);
    best = Math.max(best, aliveModels(u).length * dice * pAtLeast(w.hit) * pFail * Math.max(1, w.damage + b.damage + (u.status.damageMod ?? 0) + dmg));
  }
  return best;
}

/** Our units that will hit `t` in melee this round: in a fight with it, or ready to charge it. */
function meleeOn(s: GameState, me: PlayerId, t: Unit): Unit[] {
  if (isFlying(t)) return [];
  return onBoard(s, me).filter((f) => {
    if (!meleeWeapons(f).some((w) => meleeCanHit(f, t, w.targets))) return false;
    if (engagedWith(s, f).some((x) => x.uid === t.uid)) return true;
    return s.phase !== "combat" && !f.status.acted && !f.status.disengaged && !f.status.holding && unitGap(f, t) <= likelyChargeRange(s, f) + 1;
  });
}

/** Extra melee value our units get on `t` with its saves `worse` worse. */
function meleeSaveGain(s: GameState, me: PlayerId, t: Unit, worse: number): number {
  let gain = 0;
  for (const f of meleeOn(s, me, t)) gain += Math.max(0, attackValue(s, t, meleeExp(f, t, 0, worse)) - attackValue(s, t, meleeExp(f, t)));
  return gain;
}

/** Rough hits coming at our unit `t` this round: enemy guns in reach, and the enemies it's fighting. */
function incomingHits(s: GameState, t: Unit): number {
  let hits = Math.min(threatOn(s, t), wounds(t) * 3) * 0.6;
  for (const e of engagedWith(s, t)) for (const w of meleeWeapons(e).slice(0, 1)) hits += aliveModels(e).length * w.dice * pAtLeast(w.hit);
  return hits;
}

/**
 * Eval points a dice buff or debuff on `t` is worth to player `me` this round (support cards and the
 * unit abilities that share the statuses). `cmd` is the play itself, for the effects judged by
 * simulating our shots against the debuffed target.
 */
function diceEffectValue(s: GameState, me: PlayerId, t: Unit, e: DiceEffect, cmd: Command): number {
  const prof = profileOf(t);
  switch (e.kind) {
    case "armourBuff": {
      if ((t.status.saveMod ?? 0) > 0) return 0;
      const armor = prof.armor + saveShiftOf(t);
      return incomingHits(s, t) * Math.max(0, failChance(armor) - failChance(armor - e.save)) * valuePerWound(t);
    }
    case "evadeBuff": {
      if ((t.status.evadeBonus ?? 0) > 0 || (t.status.evadeGrant ?? 0) > 0 || !rulesOf(s).evade) return 0;
      const gain = prof.evade ? e.amount / 6 : pAtLeast(e.grant);
      return incomingHits(s, t) * gain * failChance(prof.armor + saveShiftOf(t)) * valuePerWound(t);
    }
    case "damageBuff": {
      if ((t.status.damageMod ?? 0) > 0) return 0;
      let gain = 0;
      for (const x of onBoard(s, other(me))) {
        if (s.phase !== "combat" && !t.status.acted) {
          for (const w of rangedWeapons(t)) {
            const plan = planShooting(s, t, x, w);
            if (typeof plan === "string") continue;
            gain = Math.max(gain, attackValue(s, x, expectedDamage(s, t, x, { ...plan, damage: plan.damage + e.amount }, false)) - attackValue(s, x, expectedDamage(s, t, x, plan, false)));
          }
        }
        if (meleeOn(s, me, x).some((f) => f.uid === t.uid)) gain = Math.max(gain, attackValue(s, x, meleeExp(t, x, 0, 0, e.amount)) - attackValue(s, x, meleeExp(t, x)));
      }
      return gain;
    }
    case "armourBreak":
    case "evadeDebuff": {
      const after = simulate(s, cmd);
      if (!after) return 0;
      const shots = s.phase === "combat" ? 0 : shotGain(s, after, me, t.uid);
      return shots + (e.kind === "armourBreak" ? meleeSaveGain(s, me, t, e.save) : 0);
    }
    case "weaken": {
      // What its attacks on us lose: its best shot (if it can still shoot) and its blows in a fight.
      let loss = 0;
      const free = s.phase !== "combat" && !t.status.acted;
      for (const u of onBoard(s, me)) {
        if (free) {
          for (const w of rangedWeapons(t)) {
            const plan = planShooting(s, t, u, w);
            if (typeof plan === "string") continue;
            const fewer = { ...plan, attackers: plan.attackers.map((a) => ({ ...a, dice: Math.max(1, a.dice - e.dice) })) };
            loss = Math.max(loss, attackValue(s, u, expectedDamage(s, t, u, plan, false)) - attackValue(s, u, expectedDamage(s, t, u, fewer, false)));
          }
        }
        if (engagedWith(s, t).some((x) => x.uid === u.uid) || (free && meleeWeapons(t).length && unitGap(t, u) <= likelyChargeRange(s, t))) {
          loss = Math.max(loss, attackValue(s, u, meleeExp(t, u)) - attackValue(s, u, meleeExp(t, u, -e.dice)));
        }
      }
      return loss;
    }
  }
}

/** A card-burning ability (Snipe the Runner, Chew the Wires, Cutting Remark): the CP it takes off them and the best play it denies. */
function burnValue(s: GameState, me: PlayerId): number {
  const victim = other(me);
  const id = cardToBurn(s, victim);
  const card = id ? SUPPORTS[id] : undefined;
  if (!card) return 0;
  const cp = s.players[victim].cp;
  if (cp <= 0) return 0;
  // Early in the round they still have most of it to spend.
  const left = s.phase === "movement" ? 1 : s.phase === "assault" ? 0.7 : 0.4;
  // Only the card's plays they could still make this round: affordable, and in a phase still to come.
  const later: string[] = s.phase === "movement" ? ["movement", "assault", "combat", "any"] : s.phase === "assault" ? ["assault", "combat", "any"] : ["combat", "any"];
  const playable = card.abilities.filter((a) => a.cp <= cp && later.includes(a.timing) && !(("fromRound" in a.effect) && (a.effect.fromRound ?? 1) > s.round));
  const denied = Math.max(0, ...playable.map((a) => supportAbilityValue(a)));
  return (Math.min(card.cp, cp) * CP_VALUE + denied * 1.5) * left;
}

/** Candidates for a unit ability that puts a dice buff or debuff on a unit (Rivet the Plates, Numbing Sting...). */
function diceAbilityCandidates(s: GameState, u: Unit, id: AbilityId): Candidate[] {
  const def = ABILITIES[id];
  const e = UNIT_DICE_EFFECTS[id];
  if (!e || s.players[u.owner].cp < (def.cp ?? 0)) return [];
  const friendly = def.needs === "friendlyUnit";
  const range = id === "star-shell" ? (barrageGun(profileOf(u))?.range ?? 0) : (def.range ?? 6);
  const reserve = cpReserve(s, u.owner, id, def.cp ?? 0);
  const out: Candidate[] = [];
  for (const t of onBoard(s, friendly ? u.owner : other(u.owner))) {
    if (t.uid !== u.uid && unitGap(u, t) > range) continue;
    if (!friendly && concealment(s, u, t)) continue;
    const cmd: Command = { type: "ability", uid: u.uid, ability: id, target: t.uid };
    const v = diceEffectValue(s, u.owner, t, e, cmd);
    if (v <= 0) continue;
    out.push({ cmd, bonus: v * 1.2 - (def.cp ?? 0) * CP_VALUE - reserve, stack: true, expected: true });
  }
  return out.sort((a, b) => b.bonus - a.bonus).slice(0, 3);
}

/** Candidates for a card-burning unit ability. */
function burnCandidates(s: GameState, u: Unit, id: AbilityId): Candidate[] {
  const def = ABILITIES[id];
  if (s.players[u.owner].cp < (def.cp ?? 0) || disruptProblem(s, u, id)) return [];
  const v = burnValue(s, u.owner) - (def.cp ?? 0) * CP_VALUE - cpReserve(s, u.owner, id, def.cp ?? 0);
  // Snipe the Runner is the marksman's whole movement; the others are free actions.
  return [{ cmd: { type: "ability", uid: u.uid, ability: id }, bonus: v, ...(id === "snipe-runner" ? {} : { stack: true, expected: true }) }];
}

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
  // The Bomb Wasps' suicide dive: worth it when the damage beats what the swarm itself is worth.
  "bombs-away"(s, u) {
    const def = ABILITIES["bombs-away"];
    const out: Candidate[] = [];
    const own = wounds(u) * valuePerWound(u);
    for (const e of onBoard(s, other(u.owner))) {
      if (isFlying(e) || unitGap(u, e) > (def.range ?? 10)) continue;
      const plan: AttackPlan = {
        attackers: aliveModels(u).map((model) => ({ model, dice: 1 })),
        targets: aliveModels(e),
        hitOn: 3,
        damage: 1,
        ap: 1,
        evadeOn: rulesOf(s).evade ? evadeTarget(e, ["blast"]) : null,
      };
      const v = attackValue(s, e, expectedDamage(s, u, e, plan, false)) - own;
      out.push({ cmd: { type: "ability", uid: u.uid, ability: "bombs-away", target: e.uid }, bonus: v - 1, stack: true, expected: true });
    }
    return out;
  },
  // Fly a line over as many enemy ground models as possible, ending where the guns can still shoot.
  "crop-dust"(s, u) {
    const def = ABILITIES["crop-dust"];
    const range = def.range ?? 10;
    if (s.players[u.owner].cp < (def.cp ?? 0)) return [];
    const from = aliveModels(u)[0]!.pos;
    const out: Candidate[] = [];
    const seen: Vec[] = [];
    for (const e of onBoard(s, other(u.owner))) {
      if (isFlying(e)) continue;
      const c = centroid(e);
      const d = dist(from, c);
      if (d < 1e-6 || d > range + 4) continue;
      // Through the unit and out the other side, as far as the flight allows.
      const ends = [towards(from, { x: from.x + ((c.x - from.x) / d) * range, y: from.y + ((c.y - from.y) / d) * range }, range), towards(from, c, Math.min(range, d + 2))];
      for (const p of ends) {
        if (seen.some((q) => dist(p, q) < 1)) continue;
        seen.push(p);
        let v = 0;
        // No evade against the dust, and no cover; digging in still helps.
        for (const { unit: t, models } of cropDustCaught(s, u, from, p)) {
          v += attackValue(s, t, models.length * pAtLeast(CROP_DUST.hit) * failChance(profileOf(t).armor + CROP_DUST.ap - (t.status.dugIn ?? 0)) * CROP_DUST.damage);
        }
        if (v <= 0) continue;
        out.push({ cmd: { type: "ability", uid: u.uid, ability: "crop-dust", point: p }, bonus: v - CP_VALUE - 0.3, follow: u.uid, stack: true, expected: true });
      }
    }
    return out.sort((a, b) => b.bonus - a.bonus).slice(0, 6);
  },
  // Drop hay bales across the path of a melee unit that's about to charge one of ours.
  "bale-out"(s, u) {
    const def = ABILITIES["bale-out"];
    if (s.players[u.owner].cp < (def.cp ?? 0)) return [];
    const reachOf = (def.range ?? 6) + profileOf(u).baseRadius;
    const out: Candidate[] = [];
    const friends = onBoard(s, u.owner).filter((f) => !isFlying(f) && !profileOf(f).structure);
    // The bales must land clear of base contact with the enemy (they're a big base).
    const clear = profileFor(BALE_OUT.profileId, []).baseRadius + ENGAGE_RANGE + 0.4;
    for (const e of onBoard(s, other(u.owner))) {
      if (isFlying(e) || !meleeWeapons(e).length || isEngaged(s, e)) continue; // it may still charge in the assault phase, moved or not
      for (const f of friends) {
        if (unitGap(e, f) > likelyChargeRange(s, e) + 2 || isEngaged(s, f)) continue;
        const fc = centroid(f);
        const front = aliveModels(e).reduce((a, b) => (dist(a.pos, fc) < dist(b.pos, fc) ? a : b));
        // Roughly the charge it may spoil, at the odds that the bales are in its way.
        const v = attackValue(s, f, chargeDamage(e, f, 0)) * 0.35 - CP_VALUE;
        if (v <= 0) continue;
        // Right in front of the charger, or a little to either side (the bomber's own base may be in the way).
        const mid = towards(front.pos, fc, profileOf(e).baseRadius + clear);
        const d = dist(front.pos, mid);
        const side = d > 1e-6 ? { x: -(mid.y - front.pos.y) / d, y: (mid.x - front.pos.x) / d } : { x: 1, y: 0 };
        for (const k of [0, 1.6, -1.6]) {
          const p = { x: mid.x + side.x * k, y: mid.y + side.y * k };
          if (!aliveModels(u).some((m) => dist(m.pos, p) <= reachOf)) continue;
          out.push({ cmd: { type: "ability", uid: u.uid, ability: "bale-out", point: p }, bonus: v - Math.abs(k) * 0.1, stack: true, expected: true });
        }
      }
    }
    return out.sort((a, b) => b.bonus - a.bonus).slice(0, 6);
  },
  // Burn the shields for a harder shot when a big target is in the sights and little can shoot back.
  overcharge(s, u) {
    const def = ABILITIES.overcharge;
    if (s.players[u.owner].cp < (def.cp ?? 0) || u.status.overcharged) return [];
    const shields = aliveModels(u).reduce((n, m) => n + m.shield, 0);
    if (!shields) return [];
    let gain = 0;
    for (const e of onBoard(s, other(u.owner))) {
      for (const w of rangedWeapons(u)) {
        const plan = planShooting(s, u, e, w);
        if (typeof plan === "string") continue;
        const before = attackValue(s, e, expectedDamage(s, u, e, plan, false));
        const after = attackValue(s, e, expectedDamage(s, u, e, { ...plan, damage: plan.damage + 1 }, false));
        gain = Math.max(gain, after - before);
      }
    }
    if (gain <= 0) return [];
    const exposure = threatOn(s, u) > 0 ? 0.6 : 0.2;
    return [{ cmd: { type: "ability", uid: u.uid, ability: "overcharge" }, bonus: gain - shields * valuePerWound(u) * exposure - CP_VALUE, stack: true, expected: true }];
  },
  // Light up the enemy unit in cover that our shooters most want to hit.
  spotlight(s, u) {
    const def = ABILITIES.spotlight;
    const out: Candidate[] = [];
    if (s.players[u.owner].cp < (def.cp ?? 0)) return out;
    for (const e of onBoard(s, other(u.owner))) {
      if (e.status.exposed || unitGap(u, e) > (def.range ?? 16)) continue;
      const cmd: Command = { type: "ability", uid: u.uid, ability: "spotlight", target: e.uid };
      const after = simulate(s, cmd);
      if (!after) continue;
      const gain = shotGain(s, after, u.owner, e.uid);
      if (gain <= 0) continue;
      out.push({ cmd, bonus: gain * 0.6 - CP_VALUE, stack: true, expected: true });
    }
    return out.sort((a, b) => b.bonus - a.bonus).slice(0, 3);
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
  // ---------- the CP ability pass ----------
  // Stand to when a melee unit can reach us this round: the shot it eats on the way in.
  "stand-to"(s, u) {
    const def = ABILITIES["stand-to"];
    if (s.players[u.owner].cp < (def.cp ?? 0) || u.status.standingTo) return [];
    const guns = rangedWeapons(u).filter((w) => !w.traits?.includes("indirect"));
    if (!guns.length) return [];
    let v = 0;
    for (const e of onBoard(s, other(u.owner))) {
      if (isFlying(e) || profileOf(e).structure || !meleeWeapons(e).some((w) => meleeCanHit(e, u, w.targets)) || isEngaged(s, e)) continue;
      if (unitGap(e, u) > effectiveMove(s, e) + likelyChargeRange(s, e)) continue;
      const ep = profileOf(e);
      let exp = 0;
      for (const w of guns) {
        if (w.targets === "air") continue;
        const b = weaponBonus(w, e);
        exp = Math.max(exp, aliveModels(u).length * (w.dice + b.dice) * pAtLeast(w.hit) * failChance(ep.armor + w.ap + b.ap) * Math.min(w.damage + b.damage, ep.hp + ep.shield));
      }
      // Melee units come for us; a mixed unit might not.
      v = Math.max(v, attackValue(s, e, exp) * (isMeleeUnit(e) ? 0.55 : 0.2));
    }
    if (v <= 0) return [];
    return [{ cmd: { type: "ability", uid: u.uid, ability: "stand-to" }, bonus: v - CP_VALUE - cpReserve(s, u.owner, "stand-to", def.cp ?? 0), stack: true, expected: true }];
  },
  // Plant the feet on an objective the enemy can contest: the evaluation sees the doubled weight.
  "hold-the-line"(s, u) {
    const def = ABILITIES["hold-the-line"];
    if (s.players[u.owner].cp < (def.cp ?? 0) || !onObjective(s, u) || isEngaged(s, u)) return [];
    const contested = onBoard(s, other(u.owner)).some((e) => !isFlying(e) && !profileOf(e).structure && unitGap(e, u) <= effectiveMove(s, e) + 3);
    if (!contested) return [];
    return [{ cmd: { type: "ability", uid: u.uid, ability: "hold-the-line" }, bonus: -CP_VALUE - cpReserve(s, u.owner, "hold-the-line", def.cp ?? 0) }];
  },
  // Smoke over the friends the enemy's long guns can reach from beyond 12".
  "smoke-shells"(s, u) {
    const def = ABILITIES["smoke-shells"];
    const gun = barrageGun(profileOf(u));
    if (!gun || s.players[u.owner].cp < (def.cp ?? 0)) return [];
    const out: Candidate[] = [];
    for (const f of onBoard(s, u.owner)) {
      if (isFlying(f) || f.status.smoked) continue;
      const p = centroid(f);
      if (!aliveModels(u).some((m) => dist(m.pos, p) <= gun.range)) continue;
      let v = 0;
      for (const hid of smokeCaught(s, u.owner, p)) {
        let blocked = 0;
        for (const t of onBoard(s, other(u.owner))) {
          if (t.status.acted || !rangedWeapons(t).length) continue;
          const gap = unitGap(t, hid);
          if (gap <= SMOKE_SHELLS.range) continue;
          const reachIt = Math.max(...rangedWeapons(t).map((w) => (w.targets === "air" ? 0 : w.range)));
          if (gap > reachIt + effectiveMove(s, t)) continue;
          blocked += firepower(t) * 0.6;
        }
        v += Math.min(blocked, wounds(hid)) * valuePerWound(hid) * 0.8;
      }
      if (v > 0) out.push({ cmd: { type: "ability", uid: u.uid, ability: "smoke-shells", point: p }, bonus: v - CP_VALUE - cpReserve(s, u.owner, "smoke-shells", def.cp ?? 0), stack: true, expected: true });
    }
    return out.sort((a, b) => b.bonus - a.bonus).slice(0, 3);
  },
  // Steel-core rounds for a shot at armour: the gain of +1 AP on the best target.
  "steel-core"(s, u) {
    const def = ABILITIES["steel-core"];
    if (s.players[u.owner].cp < (def.cp ?? 0) || u.status.apBonus) return [];
    let gain = 0;
    for (const e of onBoard(s, other(u.owner))) {
      for (const w of rangedWeapons(u)) {
        const plan = planShooting(s, u, e, w);
        if (typeof plan === "string") continue;
        gain = Math.max(gain, attackValue(s, e, expectedDamage(s, u, e, { ...plan, ap: plan.ap + 1 }, false)) - attackValue(s, e, expectedDamage(s, u, e, plan, false)));
      }
    }
    if (gain <= 0) return [];
    return [{ cmd: { type: "ability", uid: u.uid, ability: "steel-core" }, bonus: gain - CP_VALUE - cpReserve(s, u.owner, "steel-core", def.cp ?? 0), stack: true, expected: true }];
  },
  // Three dice for a long charge: the better odds of landing it, times what it's worth.
  "mad-scramble"(s, u) {
    const def = ABILITIES["mad-scramble"];
    if (s.players[u.owner].cp < (def.cp ?? 0) || u.status.scrambling || !rulesOf(s).rolledCharges || u.status.disengaged || u.status.shaken || u.status.holding) return [];
    let gain = 0;
    for (const e of onBoard(s, other(u.owner))) {
      if (isFlying(e) || !meleeWeapons(u).some((w) => meleeCanHit(u, e, w.targets))) continue;
      if (unitGap(u, e) > chargeRange(s, u) + 1) continue;
      const need = chargeNeed(s, u, e, tableOf(s));
      if (need === null || need <= 4) continue;
      gain = Math.max(gain, (bestTwoOfThreeAtLeast(need) - twoDiceAtLeast(need)) * attackValue(s, e, chargeDamage(u, e, 0)));
    }
    if (gain <= 0) return [];
    return [{ cmd: { type: "ability", uid: u.uid, ability: "mad-scramble" }, bonus: gain * 0.8 - CP_VALUE - cpReserve(s, u.owner, "mad-scramble", def.cp ?? 0), stack: true, expected: true }];
  },
  // Acid on the target the rest of the swarm (and our guns) are about to hit.
  "eat-through"(s, u) {
    const def = ABILITIES["eat-through"];
    if (s.players[u.owner].cp < (def.cp ?? 0)) return [];
    const out: Candidate[] = [];
    for (const e of onBoard(s, other(u.owner))) {
      if (e.status.melting || unitGap(u, e) > (def.range ?? 12) || concealment(s, u, e) || !canSee(s, u, e)) continue;
      const cmd: Command = { type: "ability", uid: u.uid, ability: "eat-through", target: e.uid };
      const after = simulate(s, cmd);
      if (!after) continue;
      const gain = shotGain(s, after, u.owner, e.uid) + meleeSaveGain(s, u.owner, e, 1);
      if (gain <= 0) continue;
      out.push({ cmd, bonus: gain * 0.7 - CP_VALUE - cpReserve(s, u.owner, "eat-through", def.cp ?? 0), stack: true, expected: true });
    }
    return out.sort((a, b) => b.bonus - a.bonus).slice(0, 3);
  },
  // The Broodmother's shriek: an extra die per model on every brood round her that fights this round.
  "brood-frenzy"(s, u) {
    const def = ABILITIES["brood-frenzy"];
    if (s.players[u.owner].cp < (def.cp ?? 0)) return [];
    let gain = 0;
    for (const f of onBoard(s, u.owner)) {
      if (f.uid === u.uid || profileOf(f).structure || unitGap(u, f) > (def.range ?? 6)) continue;
      let best = 0;
      for (const e of onBoard(s, other(u.owner))) {
        if (!meleeOn(s, u.owner, e).some((x) => x.uid === f.uid)) continue;
        // A charge may not land: count a fight already on in full, a charge at even odds.
        const sure = engagedWith(s, f).some((x) => x.uid === e.uid) ? 1 : 0.6;
        best = Math.max(best, (attackValue(s, e, meleeExp(f, e, 1)) - attackValue(s, e, meleeExp(f, e))) * sure);
      }
      gain += best;
    }
    if (gain <= 0) return [];
    return [{ cmd: { type: "ability", uid: u.uid, ability: "brood-frenzy" }, bonus: gain * 0.8 - (def.cp ?? 0) * CP_VALUE - cpReserve(s, u.owner, "brood-frenzy", def.cp ?? 0), stack: true, expected: true }];
  },
  // Eggs in the path of an enemy ground unit coming for us or for an objective it wants.
  "lay-eggs"(s, u) {
    const def = ABILITIES["lay-eggs"];
    if (s.players[u.owner].cp < (def.cp ?? 0)) return [];
    const reachOf = (def.range ?? 3) + profileOf(u).baseRadius - 0.2;
    const theirs = onBoard(s, other(u.owner));
    const clearOf = (p: Vec) => theirs.every((t) => aliveModels(t).every((m) => dist(m.pos, p) - profileOf(t).baseRadius >= LAY_EGGS.minEnemyDistance + 0.2));
    const out: Candidate[] = [];
    const c = centroid(u);
    for (const t of theirs) {
      if (isFlying(t) || profileOf(t).structure || isEngaged(s, t)) continue;
      const tc = centroid(t);
      if (dist(c, tc) > reach(t) + 6) continue;
      for (const k of [reachOf, reachOf * 0.6]) {
        const p = towards(c, tc, k);
        if (!clearOf(p)) continue;
        const v = 0.9 + Math.min(1.2, aliveModels(t).length * 0.2) + (isMeleeUnit(t) ? 0.5 : 0);
        out.push({ cmd: { type: "ability", uid: u.uid, ability: "lay-eggs", point: p }, bonus: v - CP_VALUE - cpReserve(s, u.owner, "lay-eggs", def.cp ?? 0), stack: true, expected: true });
      }
    }
    return out.sort((a, b) => b.bonus - a.bonus).slice(0, 3);
  },
  // Slip out of phase before the guns that can reach us fire.
  "phase-shift"(s, u) {
    const def = ABILITIES["phase-shift"];
    if (s.players[u.owner].cp < (def.cp ?? 0) || u.status.phased || !rulesOf(s).evade) return [];
    const ev = profileOf(u).evade;
    const own = ev && ev.against.includes("ranged") ? ev.target : null;
    const shifted = own === null || own > PHASE_EVADE ? PHASE_EVADE : own - 1;
    const gainChance = pAtLeast(shifted) - (own === null ? 0 : pAtLeast(own));
    const hits = Math.min(threatOn(s, u), wounds(u) * 3) * 0.6;
    const v = hits * gainChance * failChance(profileOf(u).armor + saveShiftOf(u)) * valuePerWound(u);
    if (v <= 0) return [];
    return [{ cmd: { type: "ability", uid: u.uid, ability: "phase-shift" }, bonus: v - CP_VALUE - cpReserve(s, u.owner, "phase-shift", def.cp ?? 0), stack: true, expected: true }];
  },
  // Lock on to the evasive (or brawling) target our shooters gain the most against.
  triangulate(s, u) {
    const def = ABILITIES.triangulate;
    const out: Candidate[] = [];
    if (s.players[u.owner].cp < (def.cp ?? 0)) return out;
    for (const e of onBoard(s, other(u.owner))) {
      if (e.status.triangulated || unitGap(u, e) > (def.range ?? 24) || concealment(s, u, e) || !canSee(s, u, e)) continue;
      const cmd: Command = { type: "ability", uid: u.uid, ability: "triangulate", target: e.uid };
      const after = simulate(s, cmd);
      if (!after) continue;
      const gain = shotGain(s, after, u.owner, e.uid);
      if (gain <= 0) continue;
      out.push({ cmd, bonus: gain * 0.6 - CP_VALUE - cpReserve(s, u.owner, "triangulate", def.cp ?? 0), stack: true, expected: true });
    }
    return out.sort((a, b) => b.bonus - a.bonus).slice(0, 3);
  },
  // Bow out of a fight we're losing (or that pins a gun): the evaluation and follow-up judge where to.
  "bow-out"(s, u) {
    const def = ABILITIES["bow-out"];
    if (s.players[u.owner].cp < (def.cp ?? 0) || !isEngaged(s, u)) return [];
    const range = (def.range ?? 6) - 0.3;
    const leader = aliveModels(u)[0]!;
    const foes = engagedWith(s, u);
    const fc = { x: foes.reduce((n, f) => n + centroid(f).x, 0) / foes.length, y: foes.reduce((n, f) => n + centroid(f).y, 0) / foes.length };
    const d = dist(leader.pos, fc);
    const away = d > 1e-6 ? { x: leader.pos.x + ((leader.pos.x - fc.x) / d) * range, y: leader.pos.y + ((leader.pos.y - fc.y) / d) * range } : leader.pos;
    const pts = [away, ...goals(s, u).slice(0, 3).map((g) => towards(leader.pos, g, range))];
    const cost = CP_VALUE + cpReserve(s, u.owner, "bow-out", def.cp ?? 0);
    return pts.map((p) => ({ cmd: { type: "ability", uid: u.uid, ability: "bow-out", point: p }, bonus: -cost, follow: u.uid }));
  },
  // Pour our shields into a friend about to take more fire than we are.
  "lend-shields"(s, u) {
    const def = ABILITIES["lend-shields"];
    if (s.players[u.owner].cp < (def.cp ?? 0)) return [];
    const pool = aliveModels(u).reduce((n, m) => n + m.shield, 0);
    if (!pool) return [];
    const exposure = threatOn(s, u) > 0 ? 0.5 : 0.1;
    const out: Candidate[] = [];
    for (const f of onBoard(s, u.owner)) {
      if (f.uid === u.uid || unitGap(u, f) > (def.range ?? 6)) continue;
      const v = Math.min(pool, incomingHits(s, f)) * valuePerWound(f) * 0.6 - pool * valuePerWound(u) * exposure - CP_VALUE - cpReserve(s, u.owner, "lend-shields", def.cp ?? 0);
      out.push({ cmd: { type: "ability", uid: u.uid, ability: "lend-shields", target: f.uid }, bonus: v, stack: true, expected: true });
    }
    return out.sort((a, b) => b.bonus - a.bonus).slice(0, 2);
  },
  // Disruption: burn the enemy's best ready card.
  "snipe-runner": (s, u) => burnCandidates(s, u, "snipe-runner"),
  "chew-wires": (s, u) => burnCandidates(s, u, "chew-wires"),
  "cutting-remark": (s, u) => burnCandidates(s, u, "cutting-remark"),
  // Dice buffs and debuffs on support units.
  "rivet-plates": (s, u) => diceAbilityCandidates(s, u, "rivet-plates"),
  "star-shell": (s, u) => diceAbilityCandidates(s, u, "star-shell"),
  "slime-coat": (s, u) => diceAbilityCandidates(s, u, "slime-coat"),
  "numbing-sting": (s, u) => diceAbilityCandidates(s, u, "numbing-sting"),
  "exacting-standards": (s, u) => diceAbilityCandidates(s, u, "exacting-standards"),
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
      const plan = planMelee(closeRanksPreview(s, u, e), e, w, rulesOf(s));
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
      if (!u.status.disengaged && !u.status.holding) candidates.push(...moveCandidates(s, u, "advance", 16));
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
  lastTable = lastEval = null; // only trusted within one decision
  const me = s.activePlayer;
  const pl = s.players[me];
  const mine = onBoard(s, me);
  const theirs = onBoard(s, other(me));
  let best: { cmd: Command; value: number } | null = null;
  // What the card's other abilities are likely worth later this round, lost if this one exhausts it.
  let reserve = 0;
  const consider = (cmd: Command, raw: number) => {
    const value = raw - reserve;
    if (value < SUPPORT_THRESHOLD || (best && value <= best.value)) return;
    if (!simulate(s, cmd)) return;
    best = { cmd, value };
  };
  const threatened = (u: Unit): number => theirs.reduce((n, e) => n + (unitGap(e, u) <= reach(e) ? firepower(e) : 0), 0);

  for (const card of pl.supports) {
    for (const a of abilityOfCard(card.id)) {
      if (canPlaySupport(s, me, card.id, a.id)) continue;
      reserve = Math.max(a.exhaust ? cardReserve(s, me, card.id, a.id) : 0, cpReserve(s, me, a.id, a.cp));
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
        // Gate Step in the movement phase, Flash Step in the assault phase (then shoot or charge).
        if (s.phase === "combat") continue;
        const evalBase = baseEval(s, me);
        for (const u of mine) {
          if (profileOf(u).structure || isEngaged(s, u) || u.status.acted) continue;
          const leader = aliveModels(u)[0]!;
          // In the assault phase the unit shoots or charges straight after, so count that in full,
          // and also try stepping straight toward each enemy (into range of something).
          const assault = s.phase === "assault";
          const aims = [...goals(s, u).slice(0, 5), ...(assault ? theirs.map(centroid) : [])];
          for (const g of aims) {
            const cmd = { ...base, target: u.uid, point: towards(leader.pos, g, e.range - 0.3) };
            const after = simulate(s, cmd);
            const au = after?.units.find((x) => x.uid === u.uid);
            if (!after || !au) continue;
            const gain = evaluate(after, me) - evalBase + (assault ? 1 : FOLLOW_UP) * (followUp(after, au) - followUp(s, u));
            consider(cmd, gain - a.cp * CP_VALUE);
          }
        }
      } else if (e.kind === "slow") {
        for (const t of theirs) {
          if (t.status.slowedRounds > 0 || profileOf(t).move === 0) continue;
          const close = mine.some((u) => unitGap(u, t) <= e.range);
          const early = s.phase === "movement" && !t.status.acted ? 0.6 : 0;
          consider({ ...base, target: t.uid }, close ? (isMeleeUnit(t) ? 2.4 : 1.6) + early : 0);
        }
      } else if (e.kind === "blast") {
        for (const t of theirs) {
          if (isFlying(t)) continue;
          const c = centroid(t);
          const caught = aliveModels(t).filter((m) => dist(m.pos, c) <= e.radius + profileOf(t).baseRadius).length;
          const evadeOn = rulesOf(s).evade ? evadeTarget(t, ["ranged", "blast"]) : null;
          const dodge = evadeOn === null ? 1 : 1 - pAtLeast(evadeOn);
          consider({ ...base, point: c }, caught * pAtLeast(e.hit) * dodge * e.damage * valuePerWound(t) * 0.9);
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
          const p = rulesOf(s).morale ? shakeChance(nerveOf(t, s) - e.penalty) : 0;
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
      } else if (e.kind === "spot" || e.kind === "expose") {
        // Mark the target our ready shooters gain the most against.
        if (s.phase !== "assault") continue;
        for (const t of theirs) {
          if ((e.kind === "spot" && t.status.spotted) || (e.kind === "expose" && t.status.exposed)) continue;
          const cmd = { ...base, target: t.uid };
          const after = simulate(s, cmd);
          if (after) consider(cmd, shotGain(s, after, me, t.uid) * 1.5);
        }
      } else if (e.kind === "smoke") {
        // Hide a unit from the guns that would shoot it from further away than the smoke lets them.
        if (s.phase === "combat") continue;
        for (const u of mine) {
          if (u.status.smoked || profileOf(u).structure) continue;
          let blocked = 0;
          for (const t of theirs) {
            if (t.status.acted || !rangedWeapons(t).length) continue;
            const gap = unitGap(t, u);
            if (gap <= e.range) continue;
            const reachIt = Math.max(...rangedWeapons(t).map((w) => (isFlying(u) ? (w.targets === "ground" ? 0 : w.range) : w.targets === "air" ? 0 : w.range)));
            const closing = s.phase === "movement" ? effectiveMove(s, t) : 0;
            if (gap > reachIt + closing) continue;
            blocked += firepower(t) * (closing ? 0.6 : 1);
          }
          if (!blocked) continue;
          consider({ ...base, target: u.uid }, Math.min(blocked, wounds(u)) * valuePerWound(u) * 1.6 + (onObjective(s, u) ? 0.6 : 0));
        }
      } else if (e.kind === "overwatch") {
        // Overwatch on a gun that enemy units still have to walk past this round.
        if (s.phase === "combat") continue;
        for (const u of mine) {
          if (hasAbility(u, "overwatch") || u.status.overwatching || isEngaged(s, u)) continue;
          const guns = rangedWeapons(u).filter((w) => !w.traits?.includes("indirect"));
          if (!guns.length) continue;
          let best = 0;
          for (const t of theirs) {
            if (t.status.acted || profileOf(t).structure || unitGap(u, t) > 10 + effectiveMove(s, t)) continue;
            const tp = profileOf(t);
            for (const w of guns) {
              if (isFlying(t) ? w.targets === "ground" : w.targets === "air") continue;
              const exp = aliveModels(u).length * w.dice * pAtLeast(Math.min(6, w.hit + 1)) * failChance(tp.armor + w.ap) * Math.min(w.damage, tp.hp + tp.shield);
              // A melee unit has to come close; a gunline might stay out of the 10".
              best = Math.max(best, attackValue(s, t, exp) * (isMeleeUnit(t) ? 2 : 1));
            }
          }
          consider({ ...base, target: u.uid }, best);
        }
      } else if (e.kind === "haste") {
        // Extra reach for a charge just out of range, or onto an objective just out of reach.
        if (s.phase === "combat") continue;
        for (const u of eligibleUnits(s, me)) {
          if (profileOf(u).structure || u.status.hasted || isEngaged(s, u)) continue;
          const mv = effectiveMove(s, u);
          let gain = 0;
          if (!u.status.shaken && !u.status.disengaged && meleeWeapons(u).length) {
            for (const t of theirs) {
              if (isFlying(t) || !meleeWeapons(u).some((w) => meleeCanHit(u, t, w.targets))) continue;
              const strike = attackValue(s, t, chargeDamage(u, t, 0));
              if (s.phase === "assault" && rulesOf(s).rolledCharges) {
                const need = chargeNeed(s, u, t, tableOf(s));
                const gap = unitGap(u, t);
                if (need === null && gap > ROLLED_CHARGE_MAX + chargeBonus(s, u) + e.move) continue;
                const before = need === null ? 0 : twoDiceAtLeast(need);
                const after = need === null ? twoDiceAtLeast(Math.max(2, Math.ceil(gap - chargeBonus(s, u) - e.move))) : twoDiceAtLeast(Math.max(2, need - e.move));
                gain = Math.max(gain, (after - before) * strike);
              } else {
                const gap = unitGap(u, t);
                const reachNow = s.phase === "assault" ? mv : mv + likelyChargeRange(s, u);
                if (gap > reachNow && gap <= reachNow + e.move) gain = Math.max(gain, strike * (s.phase === "assault" ? 1 : 0.4));
              }
            }
          }
          if (s.phase === "movement" && !isFlying(u)) {
            for (const o of s.objectives) {
              const d = dist(centroid(u), o.pos) - o.radius;
              if (d > mv && d <= mv + e.move && controlOf(s, o) !== me) gain = Math.max(gain, objectiveWorth(s, o, me) * 0.5);
            }
          }
          consider({ ...base, target: u.uid }, gain);
        }
      } else if (e.kind === "blind") {
        // Put off the gun about to do the most damage to us this round.
        if (s.phase === "combat") continue;
        for (const t of theirs) {
          if (t.status.blinded || t.status.acted || !rangedWeapons(t).length) continue;
          if (!aliveModels(t).some((m) => mine.some((u) => aliveModels(u).some((f) => dist(f.pos, m.pos) <= e.range)))) continue;
          let loss = 0;
          for (const u of mine) {
            for (const w of rangedWeapons(t)) {
              const plan = planShooting(s, t, u, w);
              if (typeof plan === "string") continue;
              const now = attackValue(s, u, expectedDamage(s, t, u, plan, false));
              const worse = attackValue(s, u, expectedDamage(s, t, u, { ...plan, hitOn: Math.min(6, plan.hitOn + 1) }, false));
              loss = Math.max(loss, now - worse);
            }
          }
          consider({ ...base, target: t.uid }, loss * (s.phase === "movement" ? 1.5 : 2.5));
        }
      } else if (e.kind === "resonate") {
        for (const centre of mine) {
          let v = 0;
          for (const u of mine) {
            if (u.uid !== centre.uid && unitGap(u, centre) > e.range) continue;
            const max = profileOf(u).shield;
            v += aliveModels(u).filter((m) => m.shield < max).length * valuePerWound(u);
          }
          consider({ ...base, target: centre.uid }, v * 1.2);
        }
      } else if (e.kind === "overshield") {
        for (const u of mine) {
          const soak = Math.min(threatened(u) * 0.6, aliveModels(u).length * e.amount);
          // The wounds it may soak this round, less the CP it costs over a 1-CP play (Afterglow is 2 CP,
          // and valued at 1.6x it soaked up nearly all the Concord's CP: ~4 plays a Skirmish game).
          consider({ ...base, target: u.uid }, soak * valuePerWound(u) - (a.cp - 1) * CP_VALUE);
        }
      } else if (e.kind === "silence") {
        // Switch off the reaction or trick that stands in the way of what we're about to do.
        for (const t of theirs) {
          if (t.status.silenced) continue;
          const ready = mine.filter((u) => !u.status.acted && !isEngaged(s, u));
          let v = 0;
          const watching = (hasAbility(t, "overwatch") || t.status.overwatching) && !t.reactionsUsed.includes("overwatch");
          if (watching && ready.some((u) => unitGap(u, t) <= 10 + effectiveMove(s, u))) v += 0.8 + firepower(t);
          if (hasAbility(t, "lurk") && !t.reactionsUsed.includes("lurk") && ready.some((u) => !isFlying(u) && unitGap(u, t) <= 3 + effectiveMove(s, u))) v += 1.5;
          const shooters = ready.filter((u) => rangedWeapons(u).some((w) => typeof planShooting(s, u, t, w) !== "string"));
          if (shooters.length && hasAbility(t, "return-fire") && !t.reactionsUsed.includes("return-fire")) v += 0.5 + firepower(t) * 0.6;
          if (shooters.length && hasAbility(t, "refraction") && !t.reactionsUsed.includes("refraction")) v += 0.8;
          const chargers = ready.filter((u) => meleeWeapons(u).length && unitGap(u, t) <= chargeRange(s, u));
          if (chargers.length) {
            if (hasAbility(t, "riposte") && !t.reactionsUsed.includes("riposte")) v += 1.2;
            if (hasAbility(t, "pirouette") && !t.reactionsUsed.includes("pirouette")) v += 1.2;
            if (hasAbility(t, "phase-out") && !(t.abilityUses["phase-out"] ?? 0)) v += 2;
          }
          const tricks = !t.status.acted && profileOf(t).abilities.some((a) => {
            const d = ABILITIES[a];
            return d.kind === "active" && (d.usesPerGame === undefined || (t.abilityUses[a] ?? 0) < d.usesPerGame) && s.players[t.owner].cp >= (d.cp ?? 0) && (d.cp ?? 0) > 0;
          });
          if (tricks) v += 1 + profileOf(t).cost * 0.1;
          consider({ ...base, target: t.uid }, v);
        }
      } else if (e.kind === "armourBuff" || e.kind === "armourBreak" || e.kind === "evadeBuff" || e.kind === "evadeDebuff" || e.kind === "damageBuff" || e.kind === "weaken") {
        // Dice buffs and debuffs: what the round's attacks gain or lose, less the CP over a 1-CP play.
        if (s.phase === "combat" && e.kind !== "armourBuff" && e.kind !== "armourBreak" && e.kind !== "damageBuff" && e.kind !== "weaken") continue;
        const friendly = need === "friendlyUnit";
        for (const t of friendly ? mine : theirs) {
          const cmd = { ...base, target: t.uid };
          consider(cmd, diceEffectValue(s, me, t, e, cmd) * 1.3 - (a.cp - 1) * CP_VALUE);
        }
      } else if (need === "none") {
        // Reactions: arm them when the enemy is close and we can spare the CP.
        const contact = theirs.some((t) => mine.some((u) => unitGap(u, t) <= 18));
        consider(base, contact && cpLeft >= 1 ? 2 : contact ? 1.5 : 0);
      }
    }
  }
  reserve = 0;
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

/**
 * Two abilities on one card: using an exhausting one rules out the other for the rest of the round.
 * A rough value of the card's other buffs that would still come up this round (Feeding Frenzy in
 * the combat phase, Crate of Rivets in the assault phase), so a cheap play doesn't burn the card first.
 */
function cardReserve(s: GameState, me: PlayerId, cardId: string, abilityId: string): number {
  let v = 0;
  for (const b of abilityOfCard(cardId)) if (b.id !== abilityId) v = Math.max(v, laterBuffValue(s, me, b.effect));
  return v;
}

/** A rough value of a buff that would still come up later this round (see `cardReserve`). */
function laterBuffValue(s: GameState, me: PlayerId, e: SupportEffect): number {
  let v = 0;
  if (e.kind === "meleeBuff" && s.phase !== "combat") {
    const theirs = onBoard(s, other(me));
    for (const u of onBoard(s, me)) {
      if (!meleeWeapons(u).length) continue;
      const fighting = isEngaged(s, u) || theirs.some((t) => !isFlying(t) && unitGap(u, t) <= likelyChargeRange(s, u) + 1);
      if (fighting) v = Math.max(v, aliveModels(u).length * e.dice * 0.7 * 0.6);
    }
  } else if (e.kind === "rangedBuff" && s.phase === "movement") {
    for (const u of onBoard(s, me)) if (rangedWeapons(u).length) v = Math.max(v, aliveModels(u).length * e.dice * 0.6 * 0.5);
  }
  return v;
}

/**
 * CP is shared by every card: a cheap play that leaves too little CP for a big buff on another card
 * later this round (Feeding Frenzy after an Undermine) gives that buff up. Its rough value, as in
 * `cardReserve`.
 */
function cpReserve(s: GameState, me: PlayerId, abilityId: string, cost: number): number {
  const pl = s.players[me];
  let v = 0;
  for (const card of pl.supports) {
    if (card.exhausted) continue;
    for (const b of abilityOfCard(card.id)) if (b.id !== abilityId && pl.cp >= b.cp && pl.cp - cost < b.cp) v = Math.max(v, laterBuffValue(s, me, b.effect));
  }
  return v;
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
  lastTable = lastEval = null; // only trusted within one decision
  const me = s.activePlayer;
  // Order choice: moving second lets us react to the opponent, which tests show is the stronger seat.
  if (s.orderChoice) return { type: "chooseOrder", player: s.orderChoice.player, goFirst: false };
  const support = aiSupportCommand(s);
  if (support) return support;
  const candidates = candidatesFor(s, me);
  const base = baseEval(s, me);
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
  if (best) return withReroll(s, best.cmd);
  return { type: "pass", player: me };
}

/**
 * Command re-roll house rule: like a player looking at the dice, see how the attack went and pay
 * 1 CP to re-roll the misses when enough of them would come good to be worth it.
 */
function withReroll(s: GameState, cmd: Command): Command {
  if (!rulesOf(s).reroll || (cmd.type !== "shoot" && cmd.type !== "fight")) return cmd;
  if (s.players[s.activePlayer].cp < REROLL_CP) return cmd;
  const r = applyCommand(s, cmd);
  if (!r.ok) return cmd;
  const report = r.events.find((e) => e.type === "attack" && e.report.uid === cmd.uid && e.report.target === cmd.target);
  if (!report || report.type !== "attack" || report.report.unitDestroyed) return cmd;
  const regained = reportMisses(report.report) * pAtLeast(report.report.hitOn);
  // Keep a CP for a Rally while anyone is Shaken; otherwise re-roll when about 1.5 hits would come back.
  const shaken = onBoard(s, s.activePlayer).some((u) => u.status.shaken);
  const spare = s.players[s.activePlayer].cp - REROLL_CP >= (shaken ? RALLY_CP : 0);
  return spare && regained >= 1.5 ? { ...cmd, reroll: true } : cmd;
}

/** Apply one AI activation (used by tests and AI-vs-AI simulation). */
export function playAiTurn(s: GameState): GameState {
  const r = applyCommand(s, aiCommand(s));
  if (!r.ok) throw new Error(`AI made an illegal move: ${r.error}`);
  return r.state;
}
