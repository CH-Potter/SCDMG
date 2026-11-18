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
  segmentEntry,
  segmentIntersectsPolygon,
  segmentNearPolygon,
  segmentPolygonDistance,
  polyBounds,
  type Bounds,
} from "./geometry";
import { rulesOf } from "./houseRules";
import { NumKeyMap } from "./numKey";
import { hasKeyword, isFlying, profileOf } from "./profile";
import type { AccessPoint, Elevation, GameState, Model, PlayerId, Terrain, Unit, Vec } from "./types";

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

/**
 * Does the target model get cover against a shot from `from`? Terrain gives cover, and so do other
 * models standing in the way at the target's level (pass `shooterUid` to check them).
 */
export function hasCover(s: GameState, from: Vec, fromElev: Elevation, target: Unit, tm: Model, shooterUid?: string): boolean {
  if (isFlying(target) || hasKeyword(target, "heavy")) return false;
  if (fromElev > tm.elevation) return false; // plunging fire
  if (tm.elevation === 1 && fromElev === 0) return true; // shooting uphill at a ledge
  if (shooterUid && rulesOf(s).obscuring && obscured(s, from, target, tm, shooterUid)) return true;
  return terrainCovers(s.terrain, from, tm.pos, tm.elevation);
}

/**
 * Does one of these terrain features cover a model at `pos` (level `elev`) from a shot coming from
 * `from`? Area cover covers models inside it (unless the shooter is in it too) or behind it; a
 * barricade covers models behind it. Pass a short list of nearby features for a quick local check.
 */
export function terrainCovers(features: Terrain[], from: Vec, pos: Vec, elev: Elevation): boolean {
  return features.some((t) => {
    if (t.level !== elev) return false;
    if (t.kind === "cover") {
      if (pointInPolygon(pos, t.poly)) return true;
      if (pointInPolygon(from, t.poly)) return false;
      return segmentIntersectsPolygon(from, pos, t.poly);
    }
    if (t.kind === "barricade") return segmentIntersectsPolygon(from, pos, t.poly);
    return false;
  });
}

/** Is the shot passing through another unit's models (not the shooter's or the target's)? */
function obscured(s: GameState, from: Vec, target: Unit, tm: Model, shooterUid: string): boolean {
  for (const u of s.units) {
    if (!u.onBoard || u.uid === shooterUid || u.uid === target.uid || isFlying(u)) continue;
    const r = profileOf(u).baseRadius;
    for (const m of u.models) {
      if (!m.alive || m.elevation !== tm.elevation) continue;
      if (pointSegmentDistance(m.pos, from, tm.pos) < r) return true;
    }
  }
  return false;
}

/** What a mark on an aim line means. */
export type ShotMarkKind = "blocks" | "cover" | "cover-ignored" | "plunge";

/** A point of interest along a shot, `t` of the way (0..1) from the shooter to the target model. */
export interface ShotMark {
  t: number;
  kind: ShotMarkKind;
  note: string;
}

export interface ShotLine {
  sight: boolean;
  /** The target model gets cover (−1 to its save) against this shot. */
  cover: boolean;
  marks: ShotMark[];
}

const FEATURE_NAME: Record<string, string> = {
  building: "a building",
  wall: "a wall",
  platform: "a raised platform",
  cover: "area cover",
  barricade: "a barricade",
};

/**
 * Explain one shot for the aim line: which features block it, which give the target cover, models
 * in the way, a ledge, or plunging fire that ignores cover. Uses the same rules as `lineOfSight`
 * and `hasCover`, so what it shows is what the dice will use.
 */
export function shotLine(s: GameState, from: Vec, fromElev: Elevation, target: Unit, tm: Model, shooterUid?: string): ShotLine {
  const marks: ShotMark[] = [];
  const eye = Math.max(fromElev, tm.elevation);
  for (const t of s.terrain) {
    if (featureTop(t) <= eye) continue;
    const at = segmentEntry(from, tm.pos, t.poly);
    if (at !== null) marks.push({ t: at, kind: "blocks", note: `${FEATURE_NAME[t.kind] ?? t.kind} blocks sight` });
  }
  const sight = !marks.length;
  const cover = sight && hasCover(s, from, fromElev, target, tm, shooterUid);
  const immune = isFlying(target) ? "flyers ignore cover" : hasKeyword(target, "heavy") ? "heavy units ignore cover" : null;
  const plunging = !immune && fromElev > tm.elevation;
  const kind: ShotMarkKind = immune || plunging ? "cover-ignored" : "cover";
  const why = immune ?? (plunging ? "shooting down ignores cover" : "−1 to their save");
  for (const t of s.terrain) {
    if (t.kind !== "cover" && t.kind !== "barricade") continue;
    if (!terrainCovers([t], from, tm.pos, tm.elevation)) continue;
    marks.push({ t: segmentEntry(from, tm.pos, t.poly) ?? 1, kind, note: `${FEATURE_NAME[t.kind]}: ${why}` });
  }
  if (shooterUid) {
    const at = firstObstruction(s, from, target, tm, shooterUid);
    if (at !== null) marks.push({ t: at, kind, note: `models in the way: ${why}` });
  }
  if (tm.elevation === 1 && fromElev === 0 && !immune) marks.push({ t: 1, kind: "cover", note: "target up on a ledge: −1 to their save" });
  if (plunging && marks.some((x) => x.kind === "cover-ignored")) marks.push({ t: 0, kind: "plunge", note: "plunging fire from above" });
  marks.sort((a, b) => a.t - b.t);
  return { sight, cover, marks };
}

/** How far along the shot (0..1) the first other model it passes through stands (see `obscured`). */
function firstObstruction(s: GameState, from: Vec, target: Unit, tm: Model, shooterUid: string): number | null {
  if (!rulesOf(s).obscuring) return null;
  let best: number | null = null;
  const dx = tm.pos.x - from.x;
  const dy = tm.pos.y - from.y;
  const L2 = dx * dx + dy * dy || 1;
  for (const u of s.units) {
    if (!u.onBoard || u.uid === shooterUid || u.uid === target.uid || isFlying(u)) continue;
    const r = profileOf(u).baseRadius;
    for (const m of u.models) {
      if (!m.alive || m.elevation !== tm.elevation) continue;
      if (pointSegmentDistance(m.pos, from, tm.pos) >= r) continue;
      const t = Math.max(0, Math.min(1, ((m.pos.x - from.x) * dx + (m.pos.y - from.y) * dy) / L2));
      if (best === null || t < best) best = t;
    }
  }
  return best;
}

export interface Placed {
  uid: string;
  owner: PlayerId;
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
    for (const m of u.models) {
      if (m.alive) out.push({ uid: u.uid, owner: u.owner, pos: m.pos, elevation: m.elevation, radius: r });
    }
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
    // A ground model may pass under a flyer but can't stop on its base (flyers may hover over anyone).
    const underFlyer = o.elevation === 2 && elev !== 2;
    if (o.elevation !== elev && !underFlyer) continue;
    if (dist(o.pos, pos) < o.radius + r - EPS) return underFlyer ? "Can't stop under a flyer" : "Overlaps another model";
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

/**
 * Can a base of radius `r` walk this leg past the terrain (and stay on its platform)? The terrain
 * half of a leg check; `levelEnemies` (the enemy models on the leg's level) are the other half.
 */
function terrainLegError(s: GameState, from: Vec, to: Vec, elevation: Elevation, r: number, jump: boolean, blocks = boxedBlockers(s, elevation, jump)): string | null {
  if (elevation === 1 && !jump) {
    const plat = platformAt(s, from);
    if (!plat || !pointInPolygon(to, plat.poly)) return "That path leaves the platform";
  }
  for (const { t, bb } of blocks) {
    if (segmentNearPolygon(from, to, t.poly, r - EPS, bb)) {
      return t.kind === "platform" ? "Path runs into a cliff" : "Path blocked by terrain";
    }
  }
  return null;
}

/** Does an enemy base (on the leg's level) stand in the way of this leg? */
function enemyLegClear(from: Vec, to: Vec, r: number, levelEnemies: Placed[]): boolean {
  const x0 = Math.min(from.x, to.x);
  const x1 = Math.max(from.x, to.x);
  const y0 = Math.min(from.y, to.y);
  const y1 = Math.max(from.y, to.y);
  for (const e of levelEnemies) {
    const reach = r + e.radius;
    // Further than `reach` from the leg's bounding box: further than that from the leg, so clear.
    if (e.pos.x < x0 - reach || e.pos.x > x1 + reach || e.pos.y < y0 - reach || e.pos.y > y1 + reach) continue;
    if (pointSegmentDistance(e.pos, from, to) < r + e.radius - EPS) return false;
  }
  return true;
}

function legError(s: GameState, from: Vec, to: Vec, elevation: Elevation, r: number, levelEnemies: Placed[], jump: boolean): string | null {
  return terrainLegError(s, from, to, elevation, r, jump) ?? (enemyLegClear(from, to, r, levelEnemies) ? null : "Path blocked by an enemy");
}


function enemyObstacles(s: GameState, unit: Unit): Placed[] {
  return allPlaced(s).filter((p) => p.owner !== unit.owner);
}

/**
 * Plans how a model gets from `from` (at `fromElev`) to `to`. Routes around obstacles and enemy
 * models, and through ramps/ladders when changing level. `maxLen` prunes the search (pass the
 * move allowance); routes longer than it come back as an error.
 */
export function planRoute(
  s: GameState,
  unit: Unit,
  from: Vec,
  fromElev: Elevation,
  to: Vec,
  enemies: Placed[] = enemyObstacles(s, unit),
  maxLen = Infinity,
): Route | string {
  if (isFlying(unit)) return { legs: [{ from, to, elevation: 2 }], length: dist(from, to) };
  const toElev = elevationFor(s, unit, to);

  if (hasKeyword(unit, "jump")) {
    const climb = JUMP_COST * Math.abs(toElev - fromElev);
    const path = findPath(s, unit, from, to, 0, enemies, maxLen - climb, true);
    if (typeof path === "string") return path;
    return { legs: path.legs, length: path.length + climb };
  }

  if (fromElev === toElev) return findPath(s, unit, from, to, fromElev, enemies, maxLen, false);

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
    const route = routeVia(s, unit, ap, going, from, to, enemies, Math.min(maxLen, best?.length ?? Infinity));
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
  maxLen: number,
): Route | string {
  const r = profileOf(unit).baseRadius;
  // The ramp/ladder itself: blocked by any enemy standing on either end.
  for (const e of enemies) {
    if (e.elevation === 2) continue;
    if (pointSegmentDistance(e.pos, ap.low, ap.high) < r + e.radius - EPS) return "An enemy is blocking the ramp";
  }
  const climb = dist(ap.low, ap.high) + (ap.kind === "ladder" ? CLIMB_COST : 0);
  const [aFrom, aTo, aElev, bFrom, bTo, bElev]: [Vec, Vec, Elevation, Vec, Vec, Elevation] =
    going === "up" ? [from, ap.low, 0, ap.high, to, 1] : [from, ap.high, 1, ap.low, to, 0];
  const first = findPath(s, unit, aFrom, aTo, aElev, enemies, maxLen - climb, false);
  if (typeof first === "string") return first;
  const second = findPath(s, unit, bFrom, bTo, bElev, enemies, maxLen - climb - first.length, false);
  if (typeof second === "string") return second;
  return { legs: [...first.legs, ...second.legs], length: first.length + climb + second.length, via: ap.id };
}

// ---------- pathfinding ----------

/** Area cover (scrub, craters, rubble...) is difficult terrain: it costs double for ground models. */
export const DIFFICULT_TERRAIN_FACTOR = 2;
const DIFFICULT_SAMPLES = 12;

/** Extra movement a leg costs because it crosses difficult terrain (0 for jumpers). */
export function difficultExtra(s: GameState, a: Vec, b: Vec, elevation: Elevation, jump: boolean): number {
  if (jump || elevation === 2 || !rulesOf(s).difficultTerrain) return 0;
  const len = dist(a, b);
  if (len < EPS) return 0;
  let extra = 0;
  const idx = pathIndex(s);
  const covers = (idx.covers[elevation] ??= s.terrain.filter((t) => t.kind === "cover" && t.level === elevation).map((t) => ({ t, bb: polyBounds(t.poly) })));
  for (const { t, bb } of covers) {
    if (Math.max(a.x, b.x) < bb.x0 || Math.min(a.x, b.x) > bb.x1 || Math.max(a.y, b.y) < bb.y0 || Math.min(a.y, b.y) > bb.y1) continue;
    let inside = 0;
    for (let i = 0; i < DIFFICULT_SAMPLES; i++) {
      const k = (i + 0.5) / DIFFICULT_SAMPLES;
      if (pointInPolygon({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, t.poly)) inside++;
    }
    extra += (inside / DIFFICULT_SAMPLES) * len * (DIFFICULT_TERRAIN_FACTOR - 1);
  }
  return extra;
}

const NODE_MARGIN = 0.15;
/** Enemy waypoints sit on a hexagon around the base: this far out per inch of clearance. */
const HEX_K = 1 / Math.cos(Math.PI / 6);

/**
 * Pathfinding data per terrain list, shared by every state of one game (a new game or edited map
 * gets a new list). Everything in it is derived from the terrain alone, or (the route memo) keyed
 * on every other input, so it never changes what a search returns, only how fast.
 */
interface PathIndex {
  board: GameState["board"];
  /** Features that block a path, per `${elevation}|${jump}`. */
  blockers: Map<string, Terrain[]>;
  /** The same with their bounding boxes, per elevation * 2 + jump. */
  boxed: { t: Terrain; bb: Bounds }[][];
  /** Area cover (difficult terrain) per elevation, with bounding boxes. */
  covers: { t: Terrain; bb: Bounds }[][];
  /**
   * Terrain-only leg checks between one other point (an end point or an enemy waypoint, keyed by
   * its coordinates and `${elevation}|${r}|${jump}`) and each corner waypoint, one row per direction
   * (`>` from the point, `<` to it). Same encoding as `clear`. Units stand still for most of the
   * game, so the same points come up again and again.
   */
  rows: NumKeyMap<Uint8Array>;
  /** Corner waypoints per `${elevation}|${r}|${jump}`. */
  nodes: Map<string, Vec[]>;
  /**
   * Terrain-only leg checks between two corner waypoints, per `${elevation}|${r}|${jump}`, indexed
   * `from * n + to` (0 = not checked yet, 1 = clear, 2 = blocked).
   */
  clear: Map<string, Uint8Array>;
  /** Finished searches, keyed on everything a search reads (see `findPath`). */
  routes: NumKeyMap<Route | string>;
}
const pathIndexes = new WeakMap<Terrain[], PathIndex>();
/** Routes remembered per game before the memo starts over (bounds memory on long games). */
const ROUTE_MEMO_MAX = 60_000;
const ROW_MEMO_MAX = 60_000;

function pathIndex(s: GameState): PathIndex {
  let idx = pathIndexes.get(s.terrain);
  if (!idx || idx.board.width !== s.board.width || idx.board.height !== s.board.height) {
    idx = { board: { ...s.board }, blockers: new Map(), boxed: [], covers: [], rows: new NumKeyMap(ROW_MEMO_MAX), nodes: new Map(), clear: new Map(), routes: new NumKeyMap(ROUTE_MEMO_MAX) };
    pathIndexes.set(s.terrain, idx);
  }
  return idx;
}

/** `blockers` with each feature's bounding box. */
function boxedBlockers(s: GameState, elevation: Elevation, jump: boolean): { t: Terrain; bb: Bounds }[] {
  const idx = pathIndex(s);
  const k = elevation * 2 + (jump ? 1 : 0);
  return (idx.boxed[k] ??= blockers(s, elevation, jump).map((t) => ({ t, bb: polyBounds(t.poly) })));
}

/** Features that block a path at this elevation (mirrors legError). */
function blockers(s: GameState, elevation: Elevation, jump: boolean): Terrain[] {
  const idx = pathIndex(s);
  const key = `${elevation}|${jump}`;
  let hit = idx.blockers.get(key);
  if (!hit) {
    hit = s.terrain.filter((t) => {
      if (t.kind === "building") return true;
      if (t.kind === "platform") return elevation === 0 && !jump;
      if (t.kind === "wall") return t.level === elevation;
      if (t.kind === "barricade") return t.level === elevation && !jump;
      return false;
    });
    idx.blockers.set(key, hit);
  }
  return hit;
}

/** Waypoints just outside each convex corner, far enough that a base of radius `r` clears both edges. */
function cornerNodes(poly: Vec[], r: number): Vec[] {
  const out: Vec[] = [];
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += poly[i]!.x * poly[(i + 1) % n]!.y - poly[(i + 1) % n]!.x * poly[i]!.y;
  for (let i = 0; i < n; i++) {
    const v = poly[i]!;
    const prev = poly[(i - 1 + n) % n]!;
    const next = poly[(i + 1) % n]!;
    const a = { x: prev.x - v.x, y: prev.y - v.y };
    const b = { x: next.x - v.x, y: next.y - v.y };
    const la = Math.hypot(a.x, a.y) || 1;
    const lb = Math.hypot(b.x, b.y) || 1;
    const cross = a.x * b.y - a.y * b.x;
    // Skip reflex corners: only convex corners need waypoints.
    if ((area > 0 && cross > 0) || (area < 0 && cross < 0)) continue;
    const ua = { x: a.x / la, y: a.y / la };
    const ub = { x: b.x / lb, y: b.y / lb };
    const bis = { x: -(ua.x + ub.x), y: -(ua.y + ub.y) };
    const lbis = Math.hypot(bis.x, bis.y);
    if (lbis < 1e-6) continue;
    const half = Math.acos(Math.max(-1, Math.min(1, ua.x * ub.x + ua.y * ub.y))) / 2;
    const d = (r + NODE_MARGIN) / Math.max(0.2, Math.sin(half));
    out.push({ x: v.x + (bis.x / lbis) * d, y: v.y + (bis.y / lbis) * d });
  }
  return out;
}

function staticNodes(s: GameState, elevation: Elevation, r: number, jump: boolean): Vec[] {
  const perMap = pathIndex(s).nodes;
  const key = `${elevation}|${r}|${jump}`;
  const hit = perMap.get(key);
  if (hit) return hit;
  const blocks = blockers(s, elevation, jump);
  const soft = jump ? [] : s.terrain.filter((t) => t.kind === "cover" && t.level === elevation);
  const nodes = [...blocks, ...soft]
    .flatMap((t) => cornerNodes(t.poly, r))
    .filter((p) => p.x - r >= 0 && p.y - r >= 0 && p.x + r <= s.board.width && p.y + r <= s.board.height)
    .filter((p) => blocks.every((t) => segmentPolygonDistance(p, p, t.poly) >= r - EPS))
    .filter((p) => (elevation === 1 ? !!platformAt(s, p) : true));
  perMap.set(key, nodes);
  return nodes;
}

function enemyNodes(levelEnemies: Placed[], r: number): Vec[] {
  const out: Vec[] = [];
  for (const e of levelEnemies) {
    const d = (r + e.radius + NODE_MARGIN) * HEX_K;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      out.push({ x: e.pos.x + Math.cos(a) * d, y: e.pos.y + Math.sin(a) * d });
    }
  }
  return out;
}

/**
 * Shortest legal path on one level: straight if clear, otherwise A* over corner waypoints.
 *
 * Searches are remembered per game (the AI asks for the same routes over and over). The memo key is
 * everything the search reads: the level, base radius, jump, difficult terrain, the end points, the
 * length limit, and the enemy bases on this level that could matter. An enemy matters only if it is
 * near the ellipse of points within `maxLen` of both ends (every leg the search can try lies inside
 * it, and so do all the waypoints it keeps); one further off neither blocks a leg nor adds a
 * waypoint, so leaving it out of the key can't change the answer.
 */
function findPath(
  s: GameState,
  unit: Unit,
  from: Vec,
  to: Vec,
  elevation: Elevation,
  enemies: Placed[],
  maxLen: number,
  jump: boolean,
): Route | string {
  const r = profileOf(unit).baseRadius;
  const straight = dist(from, to);
  const reach = Math.max(maxLen + EPS, straight);
  const level: Placed[] = [];
  const idx = pathIndex(s);
  const key = idx.routes.reset().push(elevation).push(jump ? 1 : 0).push(r).push(rulesOf(s).difficultTerrain ? 1 : 0);
  key.push(from.x).push(from.y).push(to.x).push(to.y).push(maxLen);
  for (const e of enemies) {
    if (e.elevation !== elevation) continue;
    const d = (r + e.radius + NODE_MARGIN) * HEX_K;
    if (dist(from, e.pos) + dist(e.pos, to) > reach + 2 * d + 1e-3) continue;
    level.push(e);
    key.push(e.pos.x).push(e.pos.y).push(e.radius);
  }
  const hit = key.get();
  if (hit !== undefined) return hit;
  const found = searchPath(s, idx, from, to, elevation, level, maxLen, jump, r, straight);
  key.set(found);
  return found;
}

function searchPath(
  s: GameState,
  idx: PathIndex,
  from: Vec,
  to: Vec,
  elevation: Elevation,
  level: Placed[],
  maxLen: number,
  jump: boolean,
  r: number,
  straight: number,
): Route | string {
  const direct = legError(s, from, to, elevation, r, level, jump);
  const directExtra = direct ? 0 : difficultExtra(s, from, to, elevation, jump);
  // A clear, easy straight line is always best.
  if (!direct && directExtra === 0) return { legs: [{ from, to, elevation }], length: straight };
  if (straight > maxLen + EPS) return direct ?? `Too far: ${(straight + directExtra).toFixed(1)}" of ${maxLen}"`;
  if (direct === "That path leaves the platform") return direct;

  const plat = elevation === 1 && !jump ? platformAt(s, from) : undefined;
  const W = s.board.width;
  const H = s.board.height;
  const keep = (p: Vec) =>
    dist(from, p) + dist(p, to) <= maxLen + EPS &&
    (!plat || pointInPolygon(p, plat.poly)) &&
    p.x - r >= 0 &&
    p.y - r >= 0 &&
    p.x + r <= W &&
    p.y + r <= H;
  const nodeKey = `${elevation}|${r}|${jump}`;
  const corners = staticNodes(s, elevation, r, jump);
  const pts: Vec[] = [from, to];
  /** Each point's index among the corner waypoints (-1: an end point or an enemy waypoint). */
  const corner: number[] = [-1, -1];
  corners.forEach((p, i) => {
    if (!keep(p)) return;
    pts.push(p);
    corner.push(i);
  });
  for (const p of enemyNodes(level, r)) {
    if (!keep(p)) continue;
    pts.push(p);
    corner.push(-1);
  }
  const nc = corners.length;
  let cornerClear = idx.clear.get(nodeKey);
  if (!cornerClear || cornerClear.length !== nc * nc) {
    cornerClear = new Uint8Array(nc * nc);
    idx.clear.set(nodeKey, cornerClear);
  }
  const n = pts.length;
  const g = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  /** Straight-line distance from each point to the goal (the A* heuristic). */
  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) h[i] = dist(pts[i]!, to);
  g[0] = 0;
  /** Leg checks done in this search (symmetric: the first direction asked decides). 0 = not yet, 1 = clear, 2 = blocked. */
  const seen = new Uint8Array(n * n);
  const blocks = boxedBlockers(s, elevation, jump);
  /** Point `i`'s row of checks to (`>`) or from (`<`) every corner waypoint. */
  const rowsOut: (Uint8Array | undefined)[] = [];
  const rowsIn: (Uint8Array | undefined)[] = [];
  const rowOf = (i: number, dir: ">" | "<"): Uint8Array => {
    const p = pts[i]!;
    const key = idx.rows.reset().push(p.x).push(p.y).push(elevation).push(r).push(jump ? 1 : 0).push(dir === ">" ? 1 : 0);
    let row = key.get();
    if (!row || row.length !== nc) {
      row = new Uint8Array(nc);
      key.set(row);
    }
    return row;
  };
  /**
   * The terrain half of a leg check (`i` to `j`, in that direction). It depends on the two points
   * alone, so checks that involve a corner waypoint are kept for the rest of the game.
   */
  const terrainClear = (i: number, j: number): boolean => {
    const a = corner[i]!;
    const b = corner[j]!;
    let row: Uint8Array;
    let k: number;
    if (a >= 0 && b >= 0) {
      row = cornerClear;
      k = a * nc + b;
    } else if (b >= 0) {
      row = rowsOut[i] ??= rowOf(i, ">");
      k = b;
    } else if (a >= 0) {
      row = rowsIn[j] ??= rowOf(j, "<");
      k = a;
    } else return terrainLegError(s, pts[i]!, pts[j]!, elevation, r, jump, blocks) === null;
    let v = row[k]!;
    if (v === 0) {
      v = terrainLegError(s, pts[i]!, pts[j]!, elevation, r, jump, blocks) === null ? 1 : 2;
      row[k] = v;
    }
    return v === 1;
  };
  const clear = (i: number, j: number): boolean => {
    const key = i < j ? i * n + j : j * n + i;
    let v = seen[key]!;
    if (v === 0) {
      v = terrainClear(i, j) && enemyLegClear(pts[i]!, pts[j]!, r, level) ? 1 : 2;
      seen[key] = v;
    }
    return v === 1;
  };
  const limit = maxLen + EPS;
  for (let iter = 0; iter < n; iter++) {
    let cur = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (closed[i] || g[i] === Infinity) continue;
      const f = g[i]! + h[i]!;
      if (f < best) {
        best = f;
        cur = i;
      }
    }
    if (cur === -1 || best > limit || cur === 1) break;
    closed[cur] = 1;
    const pc = pts[cur]!;
    const gc = g[cur]!;
    for (let j = 0; j < n; j++) {
      if (closed[j] || j === cur) continue;
      const base = gc + dist(pc, pts[j]!);
      if (base >= g[j]! || base + h[j]! > limit) continue;
      if (!clear(cur, j)) continue;
      const cand = base + difficultExtra(s, pc, pts[j]!, elevation, jump);
      if (cand >= g[j]! || cand + h[j]! > limit) continue;
      g[j] = cand;
      prev[j] = cur;
    }
  }
  if (g[1] === Infinity) {
    if (!direct) return { legs: [{ from, to, elevation }], length: straight + directExtra };
    return maxLen < Infinity ? `No clear path within ${maxLen.toFixed(1)}"` : direct;
  }
  const chain: Vec[] = [];
  for (let i = 1; i !== -1; i = prev[i]!) chain.unshift(pts[i]!);
  const legs: Leg[] = chain.slice(1).map((p, i) => ({ from: chain[i]!, to: p, elevation }));
  return { legs, length: g[1]! };
}
