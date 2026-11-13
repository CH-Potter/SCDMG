// Read-only rule queries shared by the reducer, the AI and the UI.

import { dist } from "./geometry";
import { hasAbility, hasKeyword, isFlying, profileOf } from "./profile";
import type { GameState, Model, Objective, PlayerId, Unit } from "./types";

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

/** Two models are in base contact for melee if close and on the same level (flyers reach anyone). */
export function modelsEngage(a: Unit, am: Model, b: Unit, bm: Model): boolean {
  if (modelGap(a, am, b, bm) > ENGAGE_RANGE + EPS) return false;
  return am.elevation === bm.elevation || am.elevation === 2 || bm.elevation === 2;
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
  return null;
}

export const deployable = (s: GameState, p: PlayerId): Unit[] => reserves(s, p).filter((u) => canAffordDeploy(s, u) === null);

export function effectiveMove(s: GameState, u: Unit): number {
  let mv = profileOf(u).move;
  if (hasKeyword(u, "beast")) {
    const caller = onBoard(s, u.owner).some((f) => f.uid !== u.uid && hasAbility(f, "brood-call") && unitGap(f, u) <= AURA_RANGE);
    if (caller) mv += 1;
  }
  if (u.status.slowedRounds > 0) mv -= 2;
  return Math.max(1, mv);
}

// ---------- objectives ----------

export function objectivePresence(s: GameState, o: Objective): [number, number] {
  const v: [number, number] = [0, 0];
  for (const u of onBoard(s)) {
    if (isFlying(u)) continue;
    const r = radiusOf(u);
    if (aliveModels(u).some((m) => m.elevation === o.elevation && dist(m.pos, o.pos) <= o.radius + r + EPS)) {
      v[u.owner] += profileOf(u).supply;
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
      return units.filter((u) => !u.status.acted);
    case "assault":
      return units.filter(
        (u) =>
          !u.status.acted &&
          !u.status.hunkered &&
          !isEngaged(s, u) &&
          (!u.status.disengaged || hasKeyword(u, "light")),
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
