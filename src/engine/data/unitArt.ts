// Custom unit art (`UnitProfile.art`): the allowed parts, size limits, validation and cleaning.
// Pure: no DOM. Uploaded images are only ever accepted as base64 raster data URLs whose bytes really
// are PNG, JPEG or WebP (checked by magic number), never SVG or anything else.

import type { MiniatureRecipe, MiniBack, MiniBody, MiniHead, MiniHeadgear, MiniWeapon, UnitArt } from "../types";

// Records so the compiler flags any part added to types.ts but missing here.
const BODY: Record<MiniBody, true> = { trooper: true, critter: true, brute: true, walker: true, flyer: true, structure: true, rider: true };
const HEAD: Record<MiniHead, true> = { face: true, visor: true, beast: true, gem: true, skull: true, bug: true, beard: true };
const HEADGEAR: Record<MiniHeadgear, true> = { none: true, helmet: true, hat: true, goggles: true, horns: true, crown: true, antennae: true, hood: true, plume: true };
const WEAPON: Record<MiniWeapon, true> = { none: true, rifle: true, cannon: true, blade: true, claws: true, staff: true, bow: true, shield: true, axe: true };
const BACK: Record<MiniBack, true> = { none: true, pack: true, jets: true, tank: true, banner: true, wings: true };

export const MINI_BODIES = Object.keys(BODY) as readonly MiniBody[];
export const MINI_HEADS = Object.keys(HEAD) as readonly MiniHead[];
export const MINI_HEADGEAR = Object.keys(HEADGEAR) as readonly MiniHeadgear[];
export const MINI_WEAPONS = Object.keys(WEAPON) as readonly MiniWeapon[];
export const MINI_BACKS = Object.keys(BACK) as readonly MiniBack[];

export const ART_LIMITS = {
  /** Largest stored image, in decoded bytes (the data URL is about a third longer). */
  imageBytes: 60 * 1024,
  /** All uploaded images in one faction together, in decoded bytes (browser storage is small). */
  factionImageBytes: 900 * 1024,
  scale: [0.6, 1.5] as const,
};

export const DEFAULT_RECIPE: MiniatureRecipe = { body: "trooper", head: "face", headgear: "helmet", weapon: "rifle", back: "pack", secondary: 0xffc23a, scale: 1 };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isColor = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 0xffffff;

const DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Decode the first `n` bytes of a base64 string (no atob, so this works anywhere). */
function base64Head(b64: string, n: number): number[] {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out: number[] = [];
  let bits = 0;
  let acc = 0;
  for (let i = 0; i < b64.length && out.length < n; i++) {
    const v = A.indexOf(b64[i]!);
    if (v < 0) break;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
  }
  return out;
}

export interface ImageInfo {
  mime: "image/png" | "image/jpeg" | "image/webp";
  /** Decoded size in bytes. */
  bytes: number;
}

/** Facts about an image data URL, or null if it isn't a base64 PNG/JPEG/WebP whose bytes match its type. */
export function imageDataUrlInfo(v: unknown): ImageInfo | null {
  // Far too long to be a capped image: refuse before running the regex over it.
  if (typeof v !== "string" || v.length > ART_LIMITS.imageBytes * 4) return null;
  const m = DATA_URL_RE.exec(v);
  if (!m) return null;
  const type = m[1] as "png" | "jpeg" | "webp";
  const b64 = m[2]!;
  const h = base64Head(b64, 12);
  const ascii = (from: number, len: number) => String.fromCharCode(...h.slice(from, from + len));
  const ok =
    type === "png"
      ? h[0] === 0x89 && ascii(1, 3) === "PNG" && h[4] === 0x0d && h[5] === 0x0a
      : type === "jpeg"
        ? h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff
        : ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
  if (!ok) return null;
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return { mime: `image/${type}`, bytes: Math.floor((b64.length * 3) / 4) - pad };
}

/** Problems with a profile's `art` field (none if it's absent or fine). */
export function artProblems(art: unknown, where: string): string[] {
  if (art === undefined) return [];
  if (!isObj(art)) return [`${where}: the miniature art isn't valid`];
  if (art.kind === "image") {
    const info = imageDataUrlInfo(art.dataUrl);
    if (!info) return [`${where}: the uploaded image isn't a PNG, JPEG or WebP picture`];
    if (info.bytes > ART_LIMITS.imageBytes) return [`${where}: the uploaded image is larger than ${Math.round(ART_LIMITS.imageBytes / 1024)} KB`];
    return [];
  }
  if (art.kind === "parts") {
    const r = art.recipe;
    if (!isObj(r)) return [`${where}: the miniature recipe isn't valid`];
    const errs: string[] = [];
    const pick = (field: string, v: unknown, allowed: readonly string[]) => {
      if (!allowed.includes(v as string)) errs.push(`${where}: unknown miniature ${field} "${String(v)}"`);
    };
    pick("body", r.body, MINI_BODIES);
    pick("head", r.head, MINI_HEADS);
    pick("headgear", r.headgear, MINI_HEADGEAR);
    pick("weapon", r.weapon, MINI_WEAPONS);
    pick("back", r.back, MINI_BACKS);
    if (r.primary !== undefined && !isColor(r.primary)) errs.push(`${where}: miniature main colour must be an RGB number`);
    if (!isColor(r.secondary)) errs.push(`${where}: miniature trim colour must be an RGB number`);
    const [lo, hi] = ART_LIMITS.scale;
    if (typeof r.scale !== "number" || !Number.isFinite(r.scale) || r.scale < lo || r.scale > hi) errs.push(`${where}: miniature size must be from ${lo} to ${hi}`);
    return errs;
  }
  return [`${where}: unknown kind of miniature art`];
}

/** Total decoded bytes of every uploaded image in a list of profiles. */
export function imageBytesOf(profiles: unknown): number {
  if (!Array.isArray(profiles)) return 0;
  let total = 0;
  for (const p of profiles) if (isObj(p) && isObj(p.art) && p.art.kind === "image") total += imageDataUrlInfo(p.art.dataUrl)?.bytes ?? 0;
  return total;
}

/** Faction-wide art problems (the storage budget for uploads). */
export function factionArtProblems(profiles: unknown): string[] {
  const total = imageBytesOf(profiles);
  return total > ART_LIMITS.factionImageBytes
    ? [`Faction: uploaded images take ${Math.round(total / 1024)} KB, more than the ${Math.round(ART_LIMITS.factionImageBytes / 1024)} KB allowed. Remove some.`]
    : [];
}

/**
 * Coerce untrusted `art` data into a valid UnitArt, or undefined (dropped, with a note) if it can't be.
 * Only the known fields survive; enum parts that aren't known fall back to defaults; images must pass
 * `imageDataUrlInfo` and the size cap, or they are dropped entirely.
 */
export function cleanArt(raw: unknown, notes: string[] = [], where = "Unit"): UnitArt | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isObj(raw)) {
    notes.push(`${where}: dropped miniature art that wasn't valid`);
    return undefined;
  }
  if (raw.kind === "image") {
    const info = imageDataUrlInfo(raw.dataUrl);
    if (!info || info.bytes > ART_LIMITS.imageBytes) {
      notes.push(`${where}: dropped an uploaded image that wasn't a small PNG, JPEG or WebP picture`);
      return undefined;
    }
    return { kind: "image", dataUrl: raw.dataUrl as string };
  }
  if (raw.kind === "parts" && isObj(raw.recipe)) {
    const r = raw.recipe;
    const d = DEFAULT_RECIPE;
    const pick = <T extends string>(field: string, v: unknown, allowed: readonly T[], fallback: T): T => {
      if (allowed.includes(v as T)) return v as T;
      notes.push(`${where}: miniature ${field} "${String(v)}" isn't known, so it was set to "${fallback}"`);
      return fallback;
    };
    const color = (v: unknown): number | undefined => {
      if (isColor(v)) return v;
      if (typeof v === "string") {
        const m = /^(?:#|0x)?([0-9a-f]{6})$/i.exec(v.trim());
        if (m) return parseInt(m[1]!, 16);
      }
      return undefined;
    };
    const [lo, hi] = ART_LIMITS.scale;
    const scale = typeof r.scale === "number" && Number.isFinite(r.scale) ? Math.max(lo, Math.min(hi, r.scale)) : 1;
    const recipe: MiniatureRecipe = {
      body: pick("body", r.body, MINI_BODIES, d.body),
      head: pick("head", r.head, MINI_HEADS, d.head),
      headgear: pick("headgear", r.headgear, MINI_HEADGEAR, d.headgear),
      weapon: pick("weapon", r.weapon, MINI_WEAPONS, d.weapon),
      back: pick("back", r.back, MINI_BACKS, d.back),
      secondary: color(r.secondary) ?? d.secondary,
      scale: Math.round(scale * 100) / 100,
    };
    const primary = color(r.primary);
    if (primary !== undefined) recipe.primary = primary;
    return { kind: "parts", recipe };
  }
  notes.push(`${where}: dropped miniature art of an unknown kind`);
  return undefined;
}
