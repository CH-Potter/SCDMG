// Pure map-editing helpers for the map builder (no DOM): creation, mirroring, moving, hit testing.

import type { MapDef } from "../engine/data/maps";
import { MODES, type ModeId } from "../engine/data/modes";
import { pointInPolygon, pointSegmentDistance, polygonCentroid, rect } from "../engine/geometry";
import type { AccessPoint, Objective, PlayerId, Terrain, TerrainKind, Vec } from "../engine/types";
import { newId } from "../ui/files";

export type MapObjective = Omit<Objective, "controller">;
export type CoverLook = "scrub" | "crater";

/** A reference to one editable thing on the map. */
export type ItemRef =
  | { type: "terrain"; id: string }
  | { type: "access"; id: string }
  | { type: "objective"; id: string }
  | { type: "spawn"; player: PlayerId; index: number };

export const OBJECTIVE_RADIUS = 2.5;
const EPS = 1e-6;

/** Round away float noise (coordinates are kept to 1/1000"). */
export const tidy = (n: number): number => Math.round(n * 1000) / 1000 + 0;
export const tidyVec = (p: Vec): Vec => ({ x: tidy(p.x), y: tidy(p.y) });

export const snapTo = (v: number, step: number): number => tidy(Math.round(v / step) * step);
export const snapVec = (p: Vec, step: number | null): Vec => (step ? { x: snapTo(p.x, step), y: snapTo(p.y, step) } : tidyVec(p));

export const clampVec = (p: Vec, w: number, h: number): Vec => ({ x: Math.min(w, Math.max(0, p.x)), y: Math.min(h, Math.max(0, p.y)) });

export const cloneMap = (m: MapDef): MapDef => JSON.parse(JSON.stringify(m)) as MapDef;

export const sameRef = (a: ItemRef | null, b: ItemRef | null): boolean =>
  !!a && !!b && a.type === b.type && (a.type === "spawn" ? b.type === "spawn" && a.player === b.player && a.index === b.index : (a as { id: string }).id === (b as { id: string }).id);

// ---------- creating maps ----------

/** A new, empty-ish map for a mode: spawn strips on opposite edges and one central objective. */
export function blankMap(mode: ModeId, name = "Untitled battlefield"): MapDef {
  const { width: W, height: H } = MODES[mode];
  const spawn: [Vec[][], Vec[][]] =
    mode === "assault"
      ? [[rect(0, 0, 6, H)], [rect(W - 6, 0, 6, H)]]
      : [[rect(0, H - 5, W, 5)], [rect(0, 0, W, 5)]];
  return {
    id: newId("map"),
    name,
    blurb: "",
    mode,
    width: W,
    height: H,
    terrain: [],
    access: [],
    spawn,
    objectives: [{ id: "obj-1", number: 1, pos: { x: W / 2, y: H / 2 }, radius: OBJECTIVE_RADIUS, elevation: 0, team: null }],
    custom: true,
  };
}

/** A copy of any map with a fresh id, ready to edit and save as a custom map. */
export function duplicateMap(src: MapDef, name = `${src.name} (copy)`): MapDef {
  const m = cloneMap(src);
  m.id = newId("map");
  m.name = name;
  m.custom = true;
  return m;
}

// ---------- ids ----------

export function allIds(map: MapDef): Set<string> {
  return new Set([...map.terrain.map((t) => t.id), ...map.access.map((a) => a.id), ...map.objectives.map((o) => o.id)]);
}

export function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  const stem = base.replace(/-\d+$/, "");
  for (let i = 2; ; i++) if (!taken.has(`${stem}-${i}`)) return `${stem}-${i}`;
}

/** The id for a mirrored copy: `x-a` ↔ `x-b`, otherwise `x-b`. */
export function pairedId(id: string, taken: Set<string>): string {
  const base = id.endsWith("-a") ? `${id.slice(0, -2)}-b` : id.endsWith("-b") ? `${id.slice(0, -2)}-a` : `${id}-b`;
  return uniqueId(base, taken);
}

/** A fresh id for a new terrain piece. Cover uses its look as the prefix (the game draws craters by id). */
export function terrainIdFor(map: MapDef, kind: TerrainKind, look: CoverLook = "scrub"): string {
  const prefix = kind === "cover" ? look : kind;
  const taken = allIds(map);
  for (let i = 1; ; i++) if (!taken.has(`${prefix}-${i}`)) return `${prefix}-${i}`;
}

export const coverLook = (t: Terrain): CoverLook => (/^(crater|rubble)/.test(t.id) ? "crater" : "scrub");

// ---------- lookups ----------

export const platformAt = (map: MapDef, p: Vec, except?: string): Terrain | undefined =>
  map.terrain.find((t) => t.kind === "platform" && t.id !== except && pointInPolygon(p, t.poly));

export function findTerrain(map: MapDef, id: string): Terrain | undefined {
  return map.terrain.find((t) => t.id === id);
}

export function itemExists(map: MapDef, ref: ItemRef): boolean {
  switch (ref.type) {
    case "terrain":
      return map.terrain.some((t) => t.id === ref.id);
    case "access":
      return map.access.some((a) => a.id === ref.id);
    case "objective":
      return map.objectives.some((o) => o.id === ref.id);
    case "spawn":
      return !!map.spawn[ref.player][ref.index];
  }
}

/** The polygon behind a ref (terrain or spawn zone), or null for points and strips. */
export function polyOf(map: MapDef, ref: ItemRef): Vec[] | null {
  if (ref.type === "terrain") return findTerrain(map, ref.id)?.poly ?? null;
  if (ref.type === "spawn") return map.spawn[ref.player][ref.index] ?? null;
  return null;
}

export function bbox(points: Vec[]): { x0: number; y0: number; x1: number; y1: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** A rectangle polygon from two opposite corners (any order). */
export function rectFrom(a: Vec, b: Vec): Vec[] {
  return rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y)).map(tidyVec);
}

// ---------- normalizing ----------

/** Renumber objectives (neutral first, then team 0's home, then team 1's) and give them tidy ids. */
export function renumberObjectives(objs: MapObjective[]): MapObjective[] {
  const rank = (o: MapObjective) => (o.team === null ? 0 : o.team === 0 ? 1 : 2);
  const sorted = objs.map((o, i) => ({ o, i })).sort((a, b) => rank(a.o) - rank(b.o) || a.o.number - b.o.number || a.i - b.i);
  const taken = new Set<string>();
  return sorted.map(({ o }, i) => {
    const number = i + 1;
    const id = uniqueId(o.team === null ? `obj-${number}` : `obj-home-${o.team}`, taken);
    taken.add(id);
    return { ...o, id, number };
  });
}

/**
 * Bring a map back into a consistent state after an edit: ground-only platforms and buildings,
 * objective numbering and elevations, and ramps/ladders attached to the platform under their top end.
 */
export function normalize(map: MapDef): MapDef {
  for (const t of map.terrain) {
    if (t.kind === "platform" || t.kind === "building") t.level = 0;
    t.poly = t.poly.map(tidyVec);
  }
  for (const a of map.access) {
    a.low = tidyVec(a.low);
    a.high = tidyVec(a.high);
    const under = platformAt(map, a.high);
    if (under) a.platform = under.id;
  }
  map.spawn = [map.spawn[0].map((z) => z.map(tidyVec)), map.spawn[1].map((z) => z.map(tidyVec))];
  map.objectives = renumberObjectives(
    map.objectives.map((o) => ({ ...o, pos: tidyVec(o.pos), elevation: platformAt(map, o.pos) ? 1 : 0 })),
  );
  return map;
}

// ---------- adding and removing ----------

export function addTerrain(map: MapDef, kind: TerrainKind, poly: Vec[], level: 0 | 1 = 0, look: CoverLook = "scrub"): ItemRef {
  const id = terrainIdFor(map, kind, look);
  map.terrain.push({ id, kind, level: kind === "platform" || kind === "building" ? 0 : level, poly: poly.map(tidyVec) });
  return { type: "terrain", id };
}

/** Add a ramp or ladder from its ground end to its platform end. Returns an error message if the top isn't on a platform. */
export function addAccess(map: MapDef, kind: AccessPoint["kind"], low: Vec, high: Vec): ItemRef | string {
  const plat = platformAt(map, high);
  if (!plat) return "The top end of a ramp or ladder must be on a platform";
  if (pointInPolygon(low, plat.poly)) return "The bottom end must be off the platform";
  const id = uniqueId(`${plat.id}-${kind}`, allIds(map));
  map.access.push({ id, kind, platform: plat.id, low: tidyVec(low), high: tidyVec(high) });
  return { type: "access", id };
}

/** Add an objective (auto-numbered: neutral ones before home ones) and normalize the map. */
export function addObjective(map: MapDef, pos: Vec, team: PlayerId | null): ItemRef {
  const p = tidyVec(pos);
  const number = Math.max(0, ...map.objectives.map((o) => o.number)) + 1;
  map.objectives.push({ id: "__new", number, pos: p, radius: OBJECTIVE_RADIUS, elevation: 0, team });
  normalize(map);
  // Renumbering keeps the new one last among its team, so search from the end.
  const found = [...map.objectives].reverse().find((o) => o.team === team && o.pos.x === p.x && o.pos.y === p.y);
  return { type: "objective", id: found?.id ?? "" };
}

export function addSpawn(map: MapDef, player: PlayerId, poly: Vec[]): ItemRef {
  map.spawn[player].push(poly.map(tidyVec));
  return { type: "spawn", player, index: map.spawn[player].length - 1 };
}

/** Remove an item. Deleting a platform also removes its ramps and ladders. */
export function deleteItem(map: MapDef, ref: ItemRef): void {
  switch (ref.type) {
    case "terrain": {
      const t = findTerrain(map, ref.id);
      map.terrain = map.terrain.filter((x) => x.id !== ref.id);
      if (t?.kind === "platform") map.access = map.access.filter((a) => a.platform !== t.id);
      break;
    }
    case "access":
      map.access = map.access.filter((a) => a.id !== ref.id);
      break;
    case "objective":
      map.objectives = map.objectives.filter((o) => o.id !== ref.id);
      break;
    case "spawn":
      map.spawn[ref.player].splice(ref.index, 1);
      break;
  }
}

/** Rename a terrain piece, keeping ramps/ladders attached. Returns an error message on a bad or taken id. */
export function renameTerrain(map: MapDef, from: string, to: string): string | null {
  const id = to.trim();
  if (!id) return "The id can't be empty";
  if (id === from) return null;
  if (allIds(map).has(id)) return `The id "${id}" is already used`;
  const t = findTerrain(map, from);
  if (!t) return "Nothing to rename";
  t.id = id;
  for (const a of map.access) if (a.platform === from) a.platform = id;
  return null;
}

export function renameAccess(map: MapDef, from: string, to: string): string | null {
  const id = to.trim();
  if (!id) return "The id can't be empty";
  if (id === from) return null;
  if (allIds(map).has(id)) return `The id "${id}" is already used`;
  const a = map.access.find((x) => x.id === from);
  if (!a) return "Nothing to rename";
  a.id = id;
  return null;
}

// ---------- moving ----------

/** Everything that rides along when a platform moves: its ramps/ladders, level-1 pieces and objectives on top. */
export interface Riders {
  access: string[];
  terrain: string[];
  objectives: string[];
}

export function ridersOf(map: MapDef, ref: ItemRef): Riders {
  const none: Riders = { access: [], terrain: [], objectives: [] };
  if (ref.type !== "terrain") return none;
  const plat = findTerrain(map, ref.id);
  if (!plat || plat.kind !== "platform") return none;
  return {
    access: map.access.filter((a) => a.platform === plat.id).map((a) => a.id),
    terrain: map.terrain.filter((t) => t.level === 1 && t.id !== plat.id && pointInPolygon(polygonCentroid(t.poly), plat.poly)).map((t) => t.id),
    objectives: map.objectives.filter((o) => pointInPolygon(o.pos, plat.poly)).map((o) => o.id),
  };
}

/** All points that move when `ref` (and its riders) moves. */
function movingPoints(map: MapDef, ref: ItemRef, riders: Riders): Vec[] {
  const pts: Vec[] = [];
  const poly = polyOf(map, ref);
  if (poly) pts.push(...poly);
  if (ref.type === "access") {
    const a = map.access.find((x) => x.id === ref.id);
    if (a) pts.push(a.low, a.high);
  }
  if (ref.type === "objective") {
    const o = map.objectives.find((x) => x.id === ref.id);
    if (o) pts.push(o.pos);
  }
  for (const id of riders.access) {
    const a = map.access.find((x) => x.id === id);
    if (a) pts.push(a.low, a.high);
  }
  for (const id of riders.terrain) pts.push(...(findTerrain(map, id)?.poly ?? []));
  for (const id of riders.objectives) {
    const o = map.objectives.find((x) => x.id === id);
    if (o) pts.push(o.pos);
  }
  return pts;
}

/** Limit a move so the moving points stay on the board. */
export function clampDelta(map: MapDef, ref: ItemRef, d: Vec, riders: Riders): Vec {
  const pts = movingPoints(map, ref, riders);
  if (!pts.length) return d;
  const b = bbox(pts);
  return {
    x: Math.min(map.width - b.x1, Math.max(-b.x0, d.x)),
    y: Math.min(map.height - b.y1, Math.max(-b.y0, d.y)),
  };
}

/** Move an item (and its riders) by `d`. Mutates `map`. */
export function translateItem(map: MapDef, ref: ItemRef, d: Vec, riders: Riders = ridersOf(map, ref)): void {
  const mv = (p: Vec): Vec => tidyVec({ x: p.x + d.x, y: p.y + d.y });
  const poly = polyOf(map, ref);
  if (poly) poly.splice(0, poly.length, ...poly.map(mv));
  if (ref.type === "access") {
    const a = map.access.find((x) => x.id === ref.id);
    if (a) {
      a.low = mv(a.low);
      a.high = mv(a.high);
    }
  }
  if (ref.type === "objective") {
    const o = map.objectives.find((x) => x.id === ref.id);
    if (o) o.pos = mv(o.pos);
  }
  for (const id of riders.access) {
    const a = map.access.find((x) => x.id === id);
    if (a) {
      a.low = mv(a.low);
      a.high = mv(a.high);
    }
  }
  for (const id of riders.terrain) {
    const t = findTerrain(map, id);
    if (t) t.poly = t.poly.map(mv);
  }
  for (const id of riders.objectives) {
    const o = map.objectives.find((x) => x.id === id);
    if (o) o.pos = mv(o.pos);
  }
}

export function setVertex(map: MapDef, ref: ItemRef, index: number, p: Vec): void {
  const poly = polyOf(map, ref);
  if (poly && index >= 0 && index < poly.length) poly[index] = tidyVec(p);
}

export function insertVertex(map: MapDef, ref: ItemRef, after: number, p: Vec): void {
  const poly = polyOf(map, ref);
  if (poly) poly.splice(after + 1, 0, tidyVec(p));
}

/** Remove a polygon corner (polygons keep at least 3). Returns false if it couldn't. */
export function removeVertex(map: MapDef, ref: ItemRef, index: number): boolean {
  const poly = polyOf(map, ref);
  if (!poly || poly.length <= 3) return false;
  poly.splice(index, 1);
  return true;
}

// ---------- mirroring ----------

/** Rotate a point 180° about the board centre. */
export const mirrorVec = (p: Vec, w: number, h: number): Vec => tidyVec({ x: w - p.x, y: h - p.y });

const near = (a: Vec, b: Vec, tol = 0.01): boolean => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
/** Same corners, in any order and starting point. */
export const samePoly = (a: Vec[], b: Vec[], tol = 0.01): boolean =>
  a.length === b.length && a.every((p) => b.some((q) => near(p, q, tol))) && b.every((p) => a.some((q) => near(p, q, tol)));

export interface MirrorResult {
  /** The copy that was made (or null if the item is already its own mirror image). */
  ref: ItemRef | null;
  /** Things that couldn't be mirrored, e.g. a ramp whose mirrored top isn't on a platform. */
  notes: string[];
}

/**
 * Add a copy of an item rotated 180° about the board centre. Mirroring a platform also mirrors
 * its ramps/ladders, the level-1 pieces and the objectives on top of it.
 * Objectives and spawn zones swap sides (a team-0 home becomes team 1's).
 */
export function mirrorItem(map: MapDef, ref: ItemRef): MirrorResult {
  const { width: W, height: H } = map;
  const m = (p: Vec) => mirrorVec(p, W, H);
  const notes: string[] = [];
  switch (ref.type) {
    case "terrain": {
      const t = findTerrain(map, ref.id);
      if (!t) return { ref: null, notes };
      const poly = t.poly.map(m);
      if (samePoly(poly, t.poly)) return { ref: null, notes: [`${t.id} is already symmetric about the centre`] };
      const riders = ridersOf(map, ref);
      const id = pairedId(t.id, allIds(map));
      map.terrain.push({ id, kind: t.kind, level: t.level, poly });
      for (const rid of riders.terrain) {
        const r = findTerrain(map, rid);
        if (r) map.terrain.push({ id: pairedId(r.id, allIds(map)), kind: r.kind, level: r.level, poly: r.poly.map(m) });
      }
      for (const aid of riders.access) {
        const a = map.access.find((x) => x.id === aid);
        if (a) map.access.push({ id: pairedId(a.id, allIds(map)), kind: a.kind, platform: id, low: m(a.low), high: m(a.high) });
      }
      for (const oid of riders.objectives) mirrorObjective(map, oid);
      return { ref: { type: "terrain", id }, notes };
    }
    case "access": {
      const a = map.access.find((x) => x.id === ref.id);
      if (!a) return { ref: null, notes };
      const low = m(a.low);
      const high = m(a.high);
      if (near(low, a.low) && near(high, a.high)) return { ref: null, notes: [`${a.id} is already symmetric about the centre`] };
      const plat = platformAt(map, high);
      if (!plat) return { ref: null, notes: [`No platform under the mirrored top of ${a.id}: mirror its platform first`] };
      const id = pairedId(a.id, allIds(map));
      map.access.push({ id, kind: a.kind, platform: plat.id, low, high });
      return { ref: { type: "access", id }, notes };
    }
    case "objective": {
      const id = mirrorObjective(map, ref.id);
      if (!id) return { ref: null, notes: ["That objective is at the centre already"] };
      return { ref: { type: "objective", id }, notes };
    }
    case "spawn": {
      const z = map.spawn[ref.player][ref.index];
      if (!z) return { ref: null, notes };
      const other: PlayerId = ref.player === 0 ? 1 : 0;
      const poly = z.map(m);
      if (map.spawn[other].some((q) => samePoly(q, poly))) return { ref: null, notes: ["The other player already has the mirrored zone"] };
      map.spawn[other].push(poly);
      return { ref: { type: "spawn", player: other, index: map.spawn[other].length - 1 }, notes };
    }
  }
}

/** Mirror one objective (swapping home team). Returns the new id after renumbering, or null if it's on the centre. */
function mirrorObjective(map: MapDef, id: string): string | null {
  const o = map.objectives.find((x) => x.id === id);
  if (!o) return null;
  const pos = mirrorVec(o.pos, map.width, map.height);
  if (near(pos, o.pos)) return null;
  const team: PlayerId | null = o.team === null ? null : o.team === 0 ? 1 : 0;
  map.objectives.push({ id: uniqueId("obj-mirror", allIds(map)), number: o.number + 0.5, pos, radius: o.radius, elevation: o.elevation, team });
  normalize(map);
  return map.objectives.find((x) => near(x.pos, pos) && x.team === team)?.id ?? null;
}

export type Half = "top" | "bottom" | "left" | "right";

/**
 * Make the map point-symmetric by keeping one half and replacing the other with the kept half
 * rotated 180°. Pieces exactly on the centre line are split by the other axis; pieces centred
 * on the board centre are kept once.
 */
export function mirrorHalf(map: MapDef, keep: Half): { map: MapDef; notes: string[] } {
  const { width: W, height: H } = map;
  const m = (p: Vec) => mirrorVec(p, W, H);
  const vertical = keep === "top" || keep === "bottom";
  const keepSign = keep === "top" || keep === "left" ? -1 : 1;
  const side = (c: Vec): number => {
    const a = vertical ? c.y - H / 2 : c.x - W / 2;
    const b = vertical ? c.x - W / 2 : c.y - H / 2;
    if (Math.abs(a) > 1e-3) return Math.sign(a);
    if (Math.abs(b) > 1e-3) return Math.sign(b);
    return 0;
  };
  const notes: string[] = [];
  const out: MapDef = { ...cloneMap(map), terrain: [], access: [], objectives: [], spawn: [[], []] };

  const keptTerrain = map.terrain.filter((t) => side(polygonCentroid(t.poly)) !== -keepSign);
  const taken = new Set<string>([...keptTerrain.map((t) => t.id), ...map.access.map((a) => a.id)]);
  out.terrain = keptTerrain.map((t) => ({ ...t, poly: t.poly.map(tidyVec) }));
  for (const t of keptTerrain) {
    if (side(polygonCentroid(t.poly)) !== keepSign) continue;
    const id = pairedId(t.id, taken);
    taken.add(id);
    out.terrain.push({ id, kind: t.kind, level: t.level, poly: t.poly.map(m) });
  }

  const mid = (a: AccessPoint): Vec => ({ x: (a.low.x + a.high.x) / 2, y: (a.low.y + a.high.y) / 2 });
  const keptAccess = map.access.filter((a) => side(mid(a)) !== -keepSign && out.terrain.some((t) => t.id === a.platform));
  const accTaken = new Set<string>([...out.terrain.map((t) => t.id), ...keptAccess.map((a) => a.id)]);
  out.access = keptAccess.map((a) => ({ ...a }));
  for (const a of keptAccess) {
    if (side(mid(a)) !== keepSign) continue;
    const high = m(a.high);
    const plat = out.terrain.find((t) => t.kind === "platform" && pointInPolygon(high, t.poly));
    if (!plat) {
      notes.push(`${a.id}: no platform under its mirrored top, so it wasn't copied`);
      continue;
    }
    const id = pairedId(a.id, accTaken);
    accTaken.add(id);
    out.access.push({ id, kind: a.kind, platform: plat.id, low: m(a.low), high });
  }

  for (const o of map.objectives) {
    const s = side(o.pos);
    if (s === -keepSign) continue;
    out.objectives.push({ ...o });
    if (s === keepSign) {
      out.objectives.push({
        ...o,
        id: `${o.id}~m`,
        number: o.number + 0.5,
        pos: m(o.pos),
        team: o.team === null ? null : o.team === 0 ? 1 : 0,
      });
    }
  }

  for (const p of [0, 1] as const) {
    for (const z of map.spawn[p]) {
      const s = side(polygonCentroid(z));
      if (s === -keepSign) continue;
      out.spawn[p].push(z.map(tidyVec));
      if (s === keepSign) out.spawn[p === 0 ? 1 : 0].push(z.map(m));
    }
  }
  return { map: normalize(out), notes };
}

/** Items with no 180° partner: an empty list means the map is point-symmetric. */
export function asymmetricItems(map: MapDef): ItemRef[] {
  const { width: W, height: H } = map;
  const m = (p: Vec) => mirrorVec(p, W, H);
  const out: ItemRef[] = [];
  for (const t of map.terrain) {
    const poly = t.poly.map(m);
    if (!map.terrain.some((u) => u.kind === t.kind && u.level === t.level && samePoly(u.poly, poly))) out.push({ type: "terrain", id: t.id });
  }
  for (const a of map.access) {
    const low = m(a.low);
    const high = m(a.high);
    if (!map.access.some((b) => b.kind === a.kind && near(b.low, low) && near(b.high, high))) out.push({ type: "access", id: a.id });
  }
  for (const o of map.objectives) {
    const pos = m(o.pos);
    const team = o.team === null ? null : o.team === 0 ? 1 : 0;
    if (!map.objectives.some((q) => q.team === team && near(q.pos, pos))) out.push({ type: "objective", id: o.id });
  }
  for (const p of [0, 1] as const) {
    map.spawn[p].forEach((z, index) => {
      const poly = z.map(m);
      if (!map.spawn[p === 0 ? 1 : 0].some((q) => samePoly(q, poly))) out.push({ type: "spawn", player: p, index });
    });
  }
  return out;
}

// ---------- hit testing ----------

export const ACCESS_HALF_WIDTH = { ramp: 1.1, ladder: 0.45 } as const;

function distToPoly(p: Vec, poly: Vec[]): number {
  if (pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, pointSegmentDistance(p, poly[i]!, poly[(i + 1) % poly.length]!));
  return best;
}

/** The top-most item under `p` (in board inches), in reverse draw order. `tol` is the pick slack in inches. */
export function hitTest(map: MapDef, p: Vec, tol: number): ItemRef | null {
  for (let i = map.objectives.length - 1; i >= 0; i--) {
    const o = map.objectives[i]!;
    if (Math.hypot(p.x - o.pos.x, p.y - o.pos.y) <= 0.9 + tol) return { type: "objective", id: o.id };
  }
  const terrainHit = (pred: (t: Terrain) => boolean): ItemRef | null => {
    for (let i = map.terrain.length - 1; i >= 0; i--) {
      const t = map.terrain[i]!;
      if (pred(t) && distToPoly(p, t.poly) <= tol) return { type: "terrain", id: t.id };
    }
    return null;
  };
  const accessHit = (kind: AccessPoint["kind"]): ItemRef | null => {
    for (let i = map.access.length - 1; i >= 0; i--) {
      const a = map.access[i]!;
      if (a.kind === kind && pointSegmentDistance(p, a.low, a.high) <= ACCESS_HALF_WIDTH[kind] + tol) return { type: "access", id: a.id };
    }
    return null;
  };
  return (
    terrainHit((t) => t.kind === "building") ??
    terrainHit((t) => t.level === 1 && t.kind !== "platform" && t.kind !== "building") ??
    accessHit("ladder") ??
    terrainHit((t) => t.kind === "platform") ??
    accessHit("ramp") ??
    terrainHit((t) => t.level === 0 && t.kind !== "platform" && t.kind !== "building") ??
    spawnHit(map, p)
  );
}

function spawnHit(map: MapDef, p: Vec): ItemRef | null {
  for (const player of [1, 0] as const) {
    const zones = map.spawn[player];
    for (let i = zones.length - 1; i >= 0; i--) if (pointInPolygon(p, zones[i]!)) return { type: "spawn", player, index: i };
  }
  return null;
}

/** Index of the polygon corner within `tol` of `p`, or -1. */
export function vertexAt(poly: Vec[], p: Vec, tol: number): number {
  let best = -1;
  let bestD = tol;
  poly.forEach((v, i) => {
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    if (d <= bestD + EPS) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Index of the edge whose midpoint is within `tol` of `p` (edge i runs from corner i to i+1), or -1. */
export function edgeMidAt(poly: Vec[], p: Vec, tol: number): number {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if (Math.hypot((a.x + b.x) / 2 - p.x, (a.y + b.y) / 2 - p.y) <= tol) return i;
  }
  return -1;
}

/** Find the item a validation message is about (messages start with an id or "Objective N"). */
export function refForMessage(map: MapDef, msg: string): ItemRef | null {
  const obj = /^Objective (\d+)/.exec(msg);
  if (obj) {
    const o = map.objectives.find((x) => x.number === Number(obj[1]));
    return o ? { type: "objective", id: o.id } : null;
  }
  const spawn = /^Player ([12]) spawn zone/.exec(msg);
  if (spawn) {
    const player = (Number(spawn[1]) - 1) as PlayerId;
    return map.spawn[player].length ? { type: "spawn", player, index: 0 } : null;
  }
  const head = /^([^\s:]+)/.exec(msg)?.[1];
  if (!head) return null;
  if (map.terrain.some((t) => t.id === head)) return { type: "terrain", id: head };
  if (map.access.some((a) => a.id === head)) return { type: "access", id: head };
  return null;
}
