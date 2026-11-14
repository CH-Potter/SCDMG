// Custom maps made in the map builder, kept in browser storage.

import { MAPS, type MapDef } from "../engine/data/maps";
import { mapProblems } from "../engine/data/mapValidation";
import type { ModeId } from "../engine/data/modes";
import { loadJson, newId, saveJson, slug } from "./files";

const KEY = "scdmg.customMaps.v1";
const DRAFT_KEY = "scdmg.mapDraft.v1";

export function listCustomMaps(): MapDef[] {
  const maps = loadJson<unknown[]>(KEY, []);
  return Array.isArray(maps)
    ? maps.map(cleanMap).filter((m) => mapProblems(m).length === 0).map((m) => ({ ...m, custom: true }))
    : [];
}

/** Is this id taken by a built-in map? */
export const isBuiltInMapId = (id: string): boolean => Object.prototype.hasOwnProperty.call(MAPS, id);

/** Insert or replace a custom map (by id). Returns problems instead of saving if it's invalid. */
export function saveCustomMap(map: MapDef): string[] {
  const problems = mapProblems(map);
  if (problems.length) return problems;
  if (isBuiltInMapId(map.id)) return [`The id "${map.id}" belongs to a built-in map`];
  const stored = loadJson<MapDef[]>(KEY, []);
  const rest = (Array.isArray(stored) ? stored : []).filter((m) => m.id !== map.id);
  if (!saveJson(KEY, [...rest, { ...cleanMap(map), custom: true }])) return ["Couldn't save: browser storage is unavailable or full"];
  return [];
}

export function deleteCustomMap(id: string): void {
  const stored = loadJson<MapDef[]>(KEY, []);
  saveJson(
    KEY,
    (Array.isArray(stored) ? stored : []).filter((m) => m.id !== id),
  );
}

/** Built-in plus custom maps for a mode. */
export function mapsForMode(mode: ModeId): MapDef[] {
  return [...Object.values(MAPS), ...listCustomMaps()].filter((m) => m.mode === mode);
}

export function findMap(id: string): MapDef | undefined {
  return MAPS[id] ?? listCustomMaps().find((m) => m.id === id);
}

// ---------- serialization ----------

const pick = <T extends object>(o: unknown, keys: (keyof T)[]): T => {
  if (typeof o !== "object" || o === null) return o as T;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in o) out[k as string] = (o as Record<string, unknown>)[k as string];
  return out as T;
};
// Coerce fields to their real types so nothing unexpected (e.g. markup in a "number") survives an import.
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));
const str = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  allowed.includes(v as T) ? (v as T) : undefined;
const level = (v: unknown): 0 | 1 => (num(v) === 1 ? 1 : 0);
const vec = (v: unknown) => {
  const r = pick<{ x: unknown; y: unknown }>(v, ["x", "y"]);
  return typeof r === "object" && r !== null ? { x: num(r.x), y: num(r.y) } : r;
};
const poly = (p: unknown) => (Array.isArray(p) ? p.map(vec) : p);

/**
 * A copy of the map with only the fields the game uses (drops the `custom` flag and anything unknown),
 * with every field coerced to its type. Structurally broken values are kept so `mapProblems` can report them.
 */
export function cleanMap(raw: unknown): MapDef {
  if (typeof raw !== "object" || raw === null) return raw as MapDef;
  const m = raw as Record<string, unknown>;
  const list = (v: unknown, f: (x: unknown) => unknown) => (Array.isArray(v) ? v.map(f) : v);
  const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
  const out: Record<string, unknown> = {
    id: str(m.id),
    name: str(m.name),
    blurb: str(m.blurb),
    mode: oneOf(m.mode, ["skirmish", "assault"] as const),
    width: num(m.width),
    height: num(m.height),
  };
  out.terrain = list(m.terrain, (t) =>
    obj(t)
      ? {
          id: str(t.id),
          kind: oneOf(t.kind, ["platform", "building", "wall", "barricade", "cover"] as const),
          level: level(t.level),
          poly: poly(t.poly),
        }
      : t,
  );
  out.access = list(m.access, (a) =>
    obj(a) ? { id: str(a.id), kind: oneOf(a.kind, ["ramp", "ladder"] as const), platform: str(a.platform), low: vec(a.low), high: vec(a.high) } : a,
  );
  out.spawn = list(m.spawn, (zones) => list(zones, poly));
  out.objectives = list(m.objectives, (o) =>
    obj(o)
      ? {
          id: str(o.id),
          number: num(o.number),
          pos: vec(o.pos),
          radius: num(o.radius),
          elevation: level(o.elevation),
          team: o.team === 0 || o.team === 1 ? o.team : null,
        }
      : o,
  );
  return out as unknown as MapDef;
}

const isNum = (n: unknown): boolean => typeof n === "number" && Number.isFinite(n);
const isVecLike = (v: unknown): boolean => typeof v === "object" && v !== null && isNum((v as { x: unknown }).x) && isNum((v as { y: unknown }).y);
const isPolyLike = (p: unknown): boolean => Array.isArray(p) && p.every(isVecLike);

/** Can the map builder open this (even if it still has problems to fix)? */
export function isEditable(m: unknown): m is MapDef {
  if (typeof m !== "object" || m === null) return false;
  const map = m as MapDef;
  return (
    typeof map.id === "string" &&
    (map.mode === "skirmish" || map.mode === "assault") &&
    Array.isArray(map.terrain) &&
    map.terrain.every((t) => typeof t === "object" && t !== null && typeof t.id === "string" && isPolyLike(t.poly)) &&
    Array.isArray(map.access) &&
    map.access.every((a) => typeof a === "object" && a !== null && typeof a.id === "string" && isVecLike(a.low) && isVecLike(a.high)) &&
    Array.isArray(map.objectives) &&
    map.objectives.every((o) => typeof o === "object" && o !== null && isVecLike(o.pos)) &&
    Array.isArray(map.spawn) &&
    map.spawn.length === 2 &&
    map.spawn.every((zones) => Array.isArray(zones) && zones.every(isPolyLike))
  );
}

export interface ImportResult {
  /** The cleaned map, or null if it's too broken to open in the map builder. */
  map: MapDef | null;
  /** Problems from `mapProblems` (empty means it's ready to save and play). */
  problems: string[];
  /** True if the map was given a fresh id because its id was missing or already taken. */
  renamed: boolean;
}

/**
 * Prepare a map read from a JSON file: keep only known fields, give it a fresh id if its id
 * clashes with a built-in map (or one of `takenIds`, e.g. existing custom maps), and validate it.
 */
export function importMap(raw: unknown, takenIds: Iterable<string> = []): ImportResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { map: null, problems: ["Not a map object"], renamed: false };
  const map = cleanMap(raw);
  if (typeof map.name !== "string" || !map.name.trim()) map.name = "Imported map";
  if (typeof map.blurb !== "string") map.blurb = "";
  const taken = new Set(takenIds);
  let renamed = false;
  if (typeof map.id !== "string" || !map.id || isBuiltInMapId(map.id) || taken.has(map.id)) {
    map.id = newId(slug(map.name));
    renamed = true;
  }
  map.custom = true;
  const problems = mapProblems(map);
  return { map: isEditable(map) ? map : null, problems, renamed };
}

// ---------- work-in-progress draft ----------

/** Keep the map being edited (valid or not) so it survives a reload or a play test. */
export function saveDraft(map: MapDef): boolean {
  return saveJson(DRAFT_KEY, map);
}

export function loadDraft(): MapDef | null {
  const m = loadJson<unknown>(DRAFT_KEY, null);
  if (m === null) return null;
  const clean = cleanMap(m);
  return isEditable(clean) ? clean : null;
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // storage blocked: nothing to clear
  }
}
