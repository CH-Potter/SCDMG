// Structural validation for map definitions (built-in, imported, or made in the map builder).
//
// `mapProblems` lists hard errors (the map can't be played or saved).
// `mapWarnings` lists softer layout issues worth a look (the map still works).

import { dist, pointInPolygon, pointSegmentDistance, polygonCentroid } from "../geometry";
import type { Terrain, Vec } from "../types";
import type { MapDef } from "./maps";
import { MODES } from "./modes";

const EPS = 1e-6;

const isVec = (v: unknown): v is Vec =>
  typeof v === "object" && v !== null && Number.isFinite((v as Vec).x) && Number.isFinite((v as Vec).y);
const isPoly = (p: unknown): p is Vec[] => Array.isArray(p) && p.length >= 3 && p.every(isVec);

function isConvex(poly: Vec[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const c = poly[(i + 2) % poly.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/** Distance from a point to a polygon's outline. */
function edgeDistance(p: Vec, poly: Vec[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, pointSegmentDistance(p, poly[i]!, poly[(i + 1) % poly.length]!));
  return best;
}

/** Inside the polygon and not just touching its outline. */
export function strictlyInside(p: Vec, poly: Vec[]): boolean {
  return pointInPolygon(p, poly) && edgeDistance(p, poly) > EPS;
}

const orient = (o: Vec, a: Vec, b: Vec): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Segments cross at a single interior point (touching or collinear overlap doesn't count). */
function properCross(p1: Vec, p2: Vec, q1: Vec, q2: Vec): boolean {
  const d1 = orient(q1, q2, p1);
  const d2 = orient(q1, q2, p2);
  const d3 = orient(p1, p2, q1);
  const d4 = orient(p1, p2, q2);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/** Do two polygons share some area? Pieces that only touch along an edge or at a corner don't count. */
export function polygonsOverlap(a: Vec[], b: Vec[]): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (properCross(a[i]!, a[(i + 1) % a.length]!, b[j]!, b[(j + 1) % b.length]!)) return true;
    }
  }
  if (a.some((p) => strictlyInside(p, b)) || b.some((p) => strictlyInside(p, a))) return true;
  return strictlyInside(polygonCentroid(a), b) || strictlyInside(polygonCentroid(b), a);
}

const onBoard = (p: Vec, w: number, h: number): boolean => p.x >= -EPS && p.y >= -EPS && p.x <= w + EPS && p.y <= h + EPS;

/** Pieces that stop a model standing at this level (mirrors the engine's path blockers for non-jumpers). */
function blocksAt(t: Terrain, level: 0 | 1): boolean {
  if (t.kind === "building") return true;
  if (t.kind === "platform") return level === 0;
  if (t.kind === "wall" || t.kind === "barricade") return t.level === level;
  return false;
}

const objLabel = (o: { number?: unknown; id?: unknown }): string => `Objective ${typeof o.number === "number" ? o.number : String(o.id)}`;

/** Returns a list of problems; an empty list means the map is playable. */
export function mapProblems(m: unknown): string[] {
  const errs: string[] = [];
  if (typeof m !== "object" || m === null) return ["Not a map object"];
  const map = m as Partial<MapDef>;
  if (typeof map.id !== "string" || !map.id) errs.push("Missing id");
  if (typeof map.name !== "string" || !map.name) errs.push("Missing name");
  const mode = map.mode && MODES[map.mode];
  if (!mode) errs.push("Unknown game mode");
  else if (map.width !== mode.width || map.height !== mode.height) {
    errs.push(`${mode.name} maps must be ${mode.width}" × ${mode.height}"`);
  }
  if (!Array.isArray(map.terrain)) errs.push("Missing terrain list");
  if (!Array.isArray(map.access)) errs.push("Missing ramps/ladders list");
  if (!Array.isArray(map.objectives)) errs.push("Missing objectives list");
  if (!Array.isArray(map.spawn) || map.spawn.length !== 2) errs.push("Needs a spawn zone list for each player");
  if (errs.length) return errs;

  const W = map.width!;
  const H = map.height!;
  const ids = new Set<string>();
  for (const t of map.terrain!) {
    if (!t || typeof t.id !== "string") {
      errs.push("Terrain piece without an id");
      continue;
    }
    if (ids.has(t.id)) errs.push(`Duplicate terrain id ${t.id}`);
    ids.add(t.id);
    if (!["platform", "building", "wall", "barricade", "cover"].includes(t.kind)) errs.push(`${t.id}: unknown kind`);
    if (t.level !== 0 && t.level !== 1) errs.push(`${t.id}: level must be 0 or 1`);
    if (!isPoly(t.poly)) errs.push(`${t.id}: needs a polygon with at least 3 points`);
    else if (t.kind === "platform" && !isConvex(t.poly)) errs.push(`${t.id}: platforms must be convex`);
  }
  // Only well-formed pieces take part in the layout checks below.
  const terrain = map.terrain!.filter((t): t is Terrain => !!t && typeof t.id === "string" && isPoly(t.poly));

  const accessIds = new Set<string>();
  for (const a of map.access!) {
    if (!a || typeof a.id !== "string") {
      errs.push("Ramp or ladder without an id");
      continue;
    }
    if (accessIds.has(a.id)) errs.push(`Duplicate ramp/ladder id ${a.id}`);
    accessIds.add(a.id);
    const plat = map.terrain!.find((t) => t.id === a.platform && t.kind === "platform");
    if (!plat) {
      errs.push(`${a.id}: must belong to a platform`);
      continue;
    }
    if (!isVec(a.low) || !isVec(a.high)) errs.push(`${a.id}: needs low and high points`);
    else {
      if (!pointInPolygon(a.high, plat.poly)) errs.push(`${a.id}: top end must be on the platform`);
      if (pointInPolygon(a.low, plat.poly)) errs.push(`${a.id}: bottom end must be off the platform`);
      if (!onBoard(a.low, W, H) || !onBoard(a.high, W, H)) errs.push(`${a.id}: must be on the board`);
      const lowBlock = terrain.find((t) => t.id !== plat.id && blocksAt(t, 0) && strictlyInside(a.low, t.poly));
      if (lowBlock) errs.push(`${a.id}: bottom end is blocked by ${lowBlock.id}`);
      const highBlock = terrain.find((t) => blocksAt(t, 1) && strictlyInside(a.high, t.poly));
      if (highBlock) errs.push(`${a.id}: top end is blocked by ${highBlock.id}`);
    }
  }
  map.spawn!.forEach((zones, p) => {
    if (!Array.isArray(zones) || zones.length === 0 || !zones.every(isPoly)) errs.push(`Player ${p + 1} needs a spawn zone`);
  });
  if (!map.objectives!.length) errs.push("Needs at least one objective");
  const objIds = new Set<string>();
  const objNumbers = new Set<number>();
  for (const o of map.objectives!) {
    if (!o || typeof o !== "object") {
      errs.push("Bad objective entry");
      continue;
    }
    if (typeof o.id === "string") {
      if (objIds.has(o.id)) errs.push(`Duplicate objective id ${o.id}`);
      objIds.add(o.id);
    }
    if (typeof o.number === "number") {
      if (objNumbers.has(o.number)) errs.push(`Two objectives are numbered ${o.number}`);
      objNumbers.add(o.number);
    }
    if (!isVec(o.pos) || !(o.radius > 0)) {
      errs.push(`${objLabel(o)}: bad position or radius`);
      continue;
    }
    if (o.team !== null && o.team !== 0 && o.team !== 1) errs.push(`${objLabel(o)}: team must be null, 0 or 1`);
    if (!onBoard(o.pos, W, H)) {
      errs.push(`${objLabel(o)}: must be on the board`);
      continue;
    }
    const plat = terrain.find((t) => t.kind === "platform" && pointInPolygon(o.pos, t.poly));
    if (o.elevation === 1 && !plat) errs.push(`${objLabel(o)}: elevation 1 but not on a platform`);
    if (o.elevation === 0 && plat) errs.push(`${objLabel(o)}: is on ${plat.id}, so its elevation must be 1`);
    // Pieces may stand on an objective, but models must still be able to reach its edge.
    const level = o.elevation === 1 ? 1 : 0;
    const covered = terrain.find(
      (t) => t.kind !== "platform" && blocksAt(t, level) && strictlyInside(o.pos, t.poly) && edgeDistance(o.pos, t.poly) >= o.radius - EPS,
    );
    if (covered) errs.push(`${objLabel(o)}: is completely covered by ${covered.id}`);
  }
  return errs;
}

/**
 * Softer layout checks for a map that already has no `mapProblems`: things that work but are
 * probably mistakes or make for a poor game. Returns an empty list for malformed maps.
 */
export function mapWarnings(map: MapDef): string[] {
  if (mapProblems(map).length) return [];
  const out: string[] = [];
  const { width: W, height: H, terrain } = map;

  // Overlapping impassable pieces at the same level. A wall butting into a building is a fine
  // design, so only flag pieces of the same kind (likely duplicates) and anything under a platform.
  for (const level of [0, 1] as const) {
    const blocks = terrain.filter((t) => blocksAt(t, level) && (level === 0 || t.kind !== "building"));
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i]!;
        const b = blocks[j]!;
        if (a.kind !== b.kind && a.kind !== "platform" && b.kind !== "platform") continue;
        if (polygonsOverlap(a.poly, b.poly)) out.push(`${a.id} overlaps ${b.id}`);
      }
    }
  }
  for (const t of terrain) {
    if (!t.poly.every((p) => onBoard(p, W, H))) out.push(`${t.id}: sticks out past the board edge`);
    if (t.kind === "platform" && t.level !== 0) out.push(`${t.id}: platforms always stand on the ground (use level 0)`);
    if (t.kind === "building" && t.level !== 0) out.push(`${t.id}: buildings always stand on the ground (use level 0)`);
    if (t.level === 1 && t.kind !== "platform" && t.kind !== "building") {
      const c = polygonCentroid(t.poly);
      if (!terrain.some((p) => p.kind === "platform" && pointInPolygon(c, p.poly))) out.push(`${t.id}: is on level 1 but not on a platform`);
    }
    if (t.kind === "platform" && !map.access.some((a) => a.platform === t.id)) out.push(`${t.id}: has no ramp or ladder (only jumpers and flyers can get up)`);
  }
  for (const o of map.objectives) {
    const b = terrain.find((t) => t.kind === "building" && strictlyInside(o.pos, t.poly));
    if (b) out.push(`Objective ${o.number}: centre is inside ${b.id}`);
  }
  for (const a of map.access) {
    const len = dist(a.low, a.high);
    if (len < 1) out.push(`${a.id}: is very short (${len.toFixed(1)}")`);
    else if (len > 6) out.push(`${a.id}: is very long (${len.toFixed(1)}")`);
  }

  // Spawn zones.
  const blockers = terrain.filter((t) => blocksAt(t, 0));
  map.spawn.forEach((zones, p) => {
    for (const z of zones) {
      if (!z.every((v) => onBoard(v, W, H))) out.push(`Player ${p + 1} spawn zone sticks out past the board edge`);
      for (const t of blockers) if (polygonsOverlap(z, t.poly)) out.push(`Player ${p + 1} spawn zone overlaps ${t.id}`);
    }
  });
  if (map.spawn[0].some((a) => map.spawn[1].some((b) => polygonsOverlap(a, b)))) out.push("The two players' spawn zones overlap");

  if (![0, 1].every((p) => map.objectives.some((o) => o.team === p))) {
    out.push("No home objective for each team, so capture-the-snack missions won't be offered");
  }
  return out;
}

/** Does this map support capture-the-snack missions (needs a home objective for each team)? */
export const supportsFlags = (m: MapDef): boolean => [0, 1].every((p) => m.objectives.some((o) => o.team === p));
