// Read-only rule queries shared by the reducer, the AI and the UI.

import { dist } from "./geometry";
import { hasAbility, hasKeyword, isFlying, profileOf } from "./profile";
import type { GameState, Model, Objective, PlayerId, Unit, UnitProfile, Vec } from "./types";

export const ENGAGE_RANGE = 1;
export const AURA_RANGE = 6;
const EPS = 1e-6;

export const unitById = (s: GameState, uid: string): Unit | undefined => s.units.find((u) => u.uid === uid);
export const aliveModels = (u: Unit): Model[] => u.models.filter((m) => m.alive);
export const onBoard = (s: GameState, p?: PlayerId): Unit[] =>
  s.units.filter((u) => u.onBoard && !u.destroyed && (p === undefined || u.owner === p));
export const reserves = (s: GameState, p: PlayerId): Unit[] =>
  s.units.filter((u) => !u.onBoard && !u.destroyed && u.owner === p);
export const radiusOf = (u: Unit): number => profileOf(u).baseRadius;

/** Edge-to-edge distance between two models (horizontal). */
export function modelGap(a: Unit, am: Model, b: Unit, bm: Model): number {
  return dist(am.pos, bm.pos) - radiusOf(a) - radiusOf(b);
}

/** Closest edge-to-edge gap between any models of two units. */
export function unitGap(a: Unit, b: Unit): number {
  let best = Infinity;
  for (const am of aliveModels(a)) for (const bm of aliveModels(b)) best = Math.min(best, modelGap(a, am, b, bm));
  return best;
}

/** Two models are within striking reach (for impact on a charge or dive): close and on the same level; a flyer reaches any level. */
export function modelsInReach(a: Unit, am: Model, b: Unit, bm: Model): boolean {
  if (modelGap(a, am, b, bm) > ENGAGE_RANGE + EPS) return false;
  return am.elevation === bm.elevation || am.elevation === 2 || bm.elevation === 2;
}

/**
 * Two models are engaged in melee if close and on the same level. Flyers are never engaged: they
 * fight from range, and a flyer's dive (its impact) leaves both sides free.
 */
export function modelsEngage(a: Unit, am: Model, b: Unit, bm: Model): boolean {
  if (am.elevation === 2 || bm.elevation === 2) return false;
  return modelsInReach(a, am, b, bm);
}

export function unitsEngage(a: Unit, b: Unit): boolean {
  if (a.owner === b.owner || !a.onBoard || !b.onBoard) return false;
  return aliveModels(a).some((am) => aliveModels(b).some((bm) => modelsEngage(a, am, b, bm)));
}

export const engagedWith = (s: GameState, u: Unit): Unit[] => onBoard(s).filter((e) => unitsEngage(u, e));
export const isEngaged = (s: GameState, u: Unit): boolean => engagedWith(s, u).length > 0;

export function supplyUsed(s: GameState, p: PlayerId): number {
  return onBoard(s, p).reduce((sum, u) => sum + profileOf(u).supply, 0);
}

export function canAffordDeploy(s: GameState, u: Unit): string | null {
  const pl = s.players[u.owner];
  const prof = profileOf(u);
  if (prof.cost > pl.resources) return `Needs ${prof.cost} resources (you have ${pl.resources})`;
  if (supplyUsed(s, u.owner) + prof.supply > pl.supplyCap) {
    return `Needs ${prof.supply} supply (${supplyUsed(s, u.owner)}/${pl.supplyCap} used)`;
  }
  // Open roster: at most `cap` copies of one unit on the table at once (openRoster.ts).
  const cap = s.openRoster?.cap;
  if (cap !== undefined && onBoard(s, u.owner).filter((x) => x.profileId === u.profileId).length >= cap) {
    return `Already ${cap} × ${prof.name} on the table (the most you can field at once)`;
  }
  return null;
}

export const deployable = (s: GameState, p: PlayerId): Unit[] => reserves(s, p).filter((u) => canAffordDeploy(s, u) === null);

export function effectiveMove(s: GameState, u: Unit): number {
  let mv = profileOf(u).move;
  if (hasKeyword(u, "beast")) {
    const caller = onBoard(s, u.owner).some((f) => f.uid !== u.uid && hasAbility(f, "brood-call") && unitGap(f, u) <= AURA_RANGE);
    if (caller) mv += 1;
  }
  mv += u.status.hasted ?? 0;
  if (u.status.slowedRounds > 0) mv -= 2;
  return Math.max(1, mv);
}

// ---------- objectives ----------

/**
 * A unit's supply for `alive` surviving models: its full supply shared out across its models and
 * rounded down, so a 3-supply squad of 6 is worth 2 at four models, 1 at two and 0 down to its last
 * one. A single-model unit keeps its full supply until it dies.
 */
export function supplyFor(p: UnitProfile, alive: number): number {
  if (alive <= 0) return 0;
  if (p.models <= 1) return p.supply;
  return Math.floor((p.supply * Math.min(alive, p.models)) / p.models + 1e-9);
}

/** A unit's supply right now, from its surviving models (see `supplyFor`). */
export const currentSupply = (u: Unit): number => supplyFor(profileOf(u), aliveModels(u).length);

/** Supply a unit has lost so far: its full supply minus what its survivors are worth. */
export const supplyLost = (u: Unit): number => profileOf(u).supply - currentSupply(u);

/** How much a unit counts towards holding an objective: its current supply. */
export const controlWeight = currentSupply;

/**
 * Disengaging: a unit worth more supply than all the enemies it's engaged with breaks away cleanly;
 * otherwise it's exhausted and sits out the next (assault) phase.
 */
export function disengageOdds(s: GameState, u: Unit): { mine: number; theirs: number; clean: boolean } {
  const mine = currentSupply(u);
  const theirs = engagedWith(s, u).reduce((n, e) => n + currentSupply(e), 0);
  return { mine, theirs, clean: mine > theirs };
}

/** Forward-deploy tricks (Tunnel, Gopher Holes) can't land this close to the enemy's home objective. */
export const HOME_EXCLUSION = 6;

export function nearEnemyHome(s: GameState, owner: PlayerId, p: Vec): boolean {
  return s.objectives.some((o) => o.team !== null && o.team !== owner && dist(o.pos, p) < o.radius + HOME_EXCLUSION);
}

export function objectivePresence(s: GameState, o: Objective): [number, number] {
  const v: [number, number] = [0, 0];
  for (const u of onBoard(s)) {
    if (isFlying(u) || profileOf(u).structure || u.status.shaken) continue;
    const r = radiusOf(u);
    if (aliveModels(u).some((m) => m.elevation === o.elevation && dist(m.pos, o.pos) <= o.radius + r + EPS)) {
      v[u.owner] += controlWeight(u);
    }
  }
  return v;
}

/** Who holds an objective right now (more supply on it), or null if empty/tied. */
export function presenceController(s: GameState, o: Objective): PlayerId | null {
  const [a, b] = objectivePresence(s, o);
  if (a > b) return 0;
  if (b > a) return 1;
  return null;
}

// ---------- activation eligibility ----------

/** Units of player `p` that can still take a meaningful activation in the current phase. */
export function eligibleUnits(s: GameState, p: PlayerId): Unit[] {
  if (s.over) return [];
  const units = onBoard(s, p);
  switch (s.phase) {
    case "movement":
      // Structures don't move, so they sit out the movement phase.
      return units.filter((u) => !u.status.acted && !profileOf(u).structure);
    case "assault":
      return units.filter(
        (u) =>
          !u.status.acted &&
          !u.status.hunkered &&
          (!isEngaged(s, u) || profileOf(u).weapons.some((w) => !w.melee)) &&
          (!u.status.disengaged || hasKeyword(u, "light")) &&
          (!profileOf(u).structure || profileOf(u).weapons.some((w) => !w.melee)),
      );
    case "combat": {
      const engaged = (x: Unit) => !x.status.fought && isEngaged(s, x) && canFightAnyone(s, x);
      const chargersLeft = onBoard(s).some((x) => x.status.charged && engaged(x));
      return units.filter((u) => engaged(u) && (!chargersLeft || u.status.charged));
    }
    default:
      return [];
  }
}

/** Can this unit hurt anything it's engaged with in melee? */
export function canFightAnyone(s: GameState, u: Unit): boolean {
  const melee = profileOf(u).weapons.filter((w) => w.melee);
  return engagedWith(s, u).some((e) => melee.some((w) => meleeCanHit(u, e, w.targets)));
}

export function meleeCanHit(a: Unit, t: Unit, targets: "ground" | "air" | "all"): boolean {
  if (!isFlying(t)) return targets !== "air";
  return isFlying(a) || targets !== "ground";
}

export function playerHasOptions(s: GameState, p: PlayerId): boolean {
  if (s.over || s.players[p].passed) return false;
  if (eligibleUnits(s, p).length > 0) return true;
  return s.phase === "movement" && deployable(s, p).length > 0;
}
