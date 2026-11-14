// Shared colours for the inked frontier look. Numbers for Pixi, helpers for Canvas 2D / CSS strings.

import type { PlayerId } from "../../engine/types";

/** Warm near-black ink used for every outline. */
export const INK = 0x1c1512;
export const PAPER = 0xf1e4c6;
export const PLAYER_COLORS: Record<PlayerId, number> = { 0: 0x2fb5c8, 1: 0xf0565b };
/** Hazard yellow. */
export const ACCENT = 0xffc23a;
export const GOOD = 0x56b34a;
export const BAD = 0xe0443a;
export const SHIELD = 0x7fe7ff;
export const CLASH = 0xff8a3d;

// Ground and terrain
export const DIRT = 0xcf9f62;
export const DIRT_LIGHT = 0xe4bf86;
export const DIRT_DARK = 0x9a6c3b;
export const SAND = DIRT_LIGHT;
export const SAND_DARK = DIRT_DARK;
export const RUST = 0xa4532e;
export const RUST_DARK = 0x6e3218;
export const METAL = 0x7d8790;
export const METAL_DARK = 0x4a5259;
export const PLANK = 0xb07a45;
export const PLANK_DARK = 0x7a4e27;
export const TEAL_PAINT = 0x3f8f8a;
export const SCRUB = 0x7d8a34;
export const SCRUB_DARK = 0x4c5520;
export const TOXIC = 0x45c9a6;
export const SKIN = 0xd59a6c;
export const GLOW = 0xfff3b0;

/** Lighten (k > 0, towards white) or darken (k < 0, towards black) a colour. */
export function shade(color: number, k: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

/** Linear mix of two colours (t = 0 gives a, 1 gives b). */
export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Relative luminance (0..1), roughly. */
export function luma(c: number): number {
  return (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255;
}

export const css = (c: number): string => `#${(c & 0xffffff).toString(16).padStart(6, "0")}`;
export const rgba = (c: number, a: number): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** Shadow tone for a colour: darker and pushed a little towards warm purple-brown, like printed ink. */
export const shadowOf = (c: number, k = 0.42): number => mix(shade(c, -k), 0x2a1830, 0.18);

/** Clamp a sanitised 24-bit colour from untrusted data. */
export const safeColor = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(0xffffff, Math.round(n))) : 0xb8b0c8);
