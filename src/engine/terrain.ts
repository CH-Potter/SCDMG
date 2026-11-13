// Elevation, line of sight, cover, placement and movement routing.
//
// Elevation: 0 = ground, 1 = on a platform, 2 = flying.
// Ground units change level only through ramps/ladders (access points), unless they have Jump.
// Line of sight: a feature blocks sight if the line crosses it and its top is above both models' eye level.
// Cover: area cover and barricades at the target's level; shooting from above ignores cover;
//        shooting up at a model on a platform gives it cover.

import {
  circleOverlapsPolygon,
  dist,
  pointInPolygon,
  pointSegmentDistance,
  segmentIntersectsPolygon,
  segmentPolygonDistance,
} from "./geometry";
import { hasKeyword, isFlying, profileOf } from "./profile";
import type { AccessPoint, Elevation, GameState, Model, Terrain, Unit, Vec } from "./types";

const EPS = 1e-6;
/** Extra distance it costs to climb a ladder or jump up/down a level. */
export const CLIMB_COST = 1;
export const JUMP_COST = 2;

export const platformAt = (s: GameState, p: Vec): Terrain | undefined =>
  s.terrain.find((t) => t.kind === "platform" && pointInPolygon(p, t.poly));

export function elevationFor(s: GameState, unit: Unit, p: Vec): Elevation {
  if (isFlying(unit)) return 2;
  return platformAt(s, p) ? 1 : 0;
}

function featureTop(t: Terrain): number {
  switch (t.kind) {
    case "building":
      return 2;
    case "platform":
      return 1;
    case "wall":
      return t.level + 1;
    default:
      return 0; // cover and barricades never block sight
  }
}

export function lineOfSight(s: GameState, a: Vec, ea: Elevation, b: Vec, eb: Elevation): boolean {
  const eye = Math.max(ea, eb);
  for (const t of s.terrain) {
    if (featureTop(t) <= eye) continue;
    if (segmentIntersectsPolygon(a, b, t.poly)) return false;
  }
  return true;
}

/** Does the target model get cover against a shot from `from`? */
export function hasCover(s: GameState, from: Vec, fromElev: Elevation, target: Unit, tm: Model): boolean {
  if (isFlying(target) || hasKeyword(target, "heavy")) return false;
  if (fromElev > tm.elevation) return false; // plunging fire
  if (tm.elevation === 1 && fromElev === 0) return true; // shooting uphill at a ledge
  return s.terrain.some((t) => {
    if (t.level !== tm.elevation) return false;
    if (t.kind === "cover") {
      if (pointInPolygon(tm.pos, t.poly)) return true;
      if (pointInPolygon(from, t.poly)) return false;
      return segmentIntersectsPolygon(from, tm.pos, t.poly);
    }
    if (t.kind === "barricade") return segmentIntersectsPolygon(from, tm.pos, t.poly);
    return false;
  });
}

export interface Placed {
  key: string; // `${uid}:${modelId}`
  pos: Vec;
  elevation: Elevation;
  radius: number;
}

export const modelKey = (u: Unit, m: Model): string => `${u.uid}:${m.id}`;

/** Every alive, on-board model as a placement obstacle. */
export function allPlaced(s: GameState): Placed[] {
  const out: Placed[] = [];
  for (const u of s.units) {
    if (!u.onBoard) continue;
    const r = profileOf(u).baseRadius;
    for (const m of u.models) if (m.alive) out.push({ key: modelKey(u, m), pos: m.pos, elevation: m.elevation, radius: r });
  }
  return out;
}

/** Can a model of `unit` stand at `pos`? `others` are the models it must not overlap. */
export function checkPlacement(s: GameState, unit: Unit, pos: Vec, elev: Elevation, others: Placed[]): string | null {
  const r = profileOf(unit).baseRadius;
  if (pos.x - r < -EPS || pos.y - r < -EPS || pos.x + r > s.board.width + EPS || pos.y + r > s.board.height + EPS) {
    return "Off the board";
  }
  if (elev !== 2) {
    if (elev === 1 && !platformAt(s, pos)) return "That's not on a platform";
    for (const t of s.terrain) {
      if (t.kind === "platform") {
        if (elev === 0 && circleOverlapsPolygon(pos, r, t.poly)) return "Too close to the cliff edge";
      } else if (t.kind === "building" || ((t.kind === "wall" || t.kind === "barricade") && t.level === elev)) {
        if (circleOverlapsPolygon(pos, r, t.poly)) return "Can't stand in impassable terrain";
      }
    }
  }
  for (const o of others) {
    if (o.elevation !== elev) continue;
    if (dist(o.pos, pos) < o.radius + r - EPS) return "Overlaps another model";
  }
  return null;
}

export interface Leg {
  from: Vec;
  to: Vec;
  elevation: Elevation;
}

export interface Route {
  legs: Leg[];
  length: number;
  via?: string;
}

function legError(s: GameState, unit: Unit, leg: Leg, enemies: Placed[], jump: boolean): string | null {
  const r = profileOf(unit).baseRadius;
  const { from, to, elevation } = leg;
  if (elevation === 1) {
    const plat = platformAt(s, from);
    if (!plat || !pointInPolygon(to, plat.poly)) return "That path leaves the platform";
  }
  for (const t of s.terrain) {
    let blocks = false;
    if (t.kind === "building") blocks = true;
    else if (t.kind === "platform") blocks = elevation === 0 && !jump;
    else if (t.kind === "wall") blocks = t.level === elevation;
    else if (t.kind === "barricade") blocks = t.level === elevation && !jump;
    if (blocks && segmentPolygonDistance(from, to, t.poly) < r - EPS) {
      return t.kind === "platform" ? "Path runs into a cliff" : "Path blocked by terrain";
    }
  }
  for (const e of enemies) {
    if (e.elevation !== elevation) continue;
    if (pointSegmentDistance(e.pos, from, to) < r + e.radius - EPS) return "Path blocked by an enemy";
  }
  return null;
}

const legsLength = (legs: Leg[]): number => legs.reduce((s, l) => s + dist(l.from, l.to), 0);

function enemyObstacles(s: GameState, unit: Unit): Placed[] {
  return allPlaced(s).filter((p) => {
    const uid = p.key.split(":")[0]!;
    const u = s.units.find((x) => x.uid === uid)!;
    return u.owner !== unit.owner;
  });
}

/**
 * Plans how a model gets from `from` (at `fromElev`) to `to`. Returns a route or an error.
 * `enemies` can be passed in to avoid recomputation.
 */
export function planRoute(
  s: GameState,
  unit: Unit,
  from: Vec,
  fromElev: Elevation,
  to: Vec,
  enemies: Placed[] = enemyObstacles(s, unit),
): Route | string {
  if (isFlying(unit)) return { legs: [{ from, to, elevation: 2 }], length: dist(from, to) };
  const toElev = elevationFor(s, unit, to);
  const jump = hasKeyword(unit, "jump");

  if (jump) {
    const leg: Leg = { from, to, elevation: Math.min(fromElev, toElev) as Elevation };
    // Jumpers only care about buildings, walls at their level and enemies on the ground they cross.
    for (const t of s.terrain) {
      if ((t.kind === "building" || (t.kind === "wall" && t.level === leg.elevation)) &&
        segmentPolygonDistance(from, to, t.poly) < profileOf(unit).baseRadius - EPS) {
        return "Path blocked by terrain";
      }
    }
    return { legs: [leg], length: dist(from, to) + JUMP_COST * Math.abs(toElev - fromElev) };
  }

  if (fromElev === toElev) {
    const leg: Leg = { from, to, elevation: fromElev };
    const err = legError(s, unit, leg, enemies, false);
    return err ?? { legs: [leg], length: dist(from, to) };
  }

  const going = toElev > fromElev ? "up" : "down";
  const platform = going === "up" ? platformAt(s, to) : platformAt(s, from);
  let best: Route | null = null;
  let lastErr = "No ramp or ladder leads there";
  for (const ap of s.access) {
    if (!platform || ap.platform !== platform.id) continue;
    if (ap.kind === "ladder" && hasKeyword(unit, "heavy")) {
      lastErr = "Heavy units can't climb ladders";
      continue;
    }
    const route = routeVia(s, unit, ap, going, from, to, enemies);
    if (typeof route === "string") {
      lastErr = route;
      continue;
    }
    if (!best || route.length < best.length) best = route;
  }
  return best ?? lastErr;
}

function routeVia(
  s: GameState,
  unit: Unit,
  ap: AccessPoint,
  going: "up" | "down",
  from: Vec,
  to: Vec,
  enemies: Placed[],
): Route | string {
  const legs: Leg[] =
    going === "up"
      ? [
          { from, to: ap.low, elevation: 0 },
          { from: ap.high, to, elevation: 1 },
        ]
      : [
          { from, to: ap.high, elevation: 1 },
          { from: ap.low, to, elevation: 0 },
        ];
  for (const leg of legs) {
    const err = legError(s, unit, leg, enemies, false);
    if (err) return err;
  }
  // The ramp/ladder itself: blocked by any enemy standing on either end.
  const r = profileOf(unit).baseRadius;
  for (const e of enemies) {
    if (e.elevation === 2) continue;
    if (pointSegmentDistance(e.pos, ap.low, ap.high) < r + e.radius - EPS) return "An enemy is blocking the ramp";
  }
  const climb = dist(ap.low, ap.high) + (ap.kind === "ladder" ? CLIMB_COST : 0);
  return { legs, length: legsLength(legs) + climb, via: ap.id };
}
