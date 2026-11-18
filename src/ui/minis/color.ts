// Colour maths for the miniature engine: hex parsing and OKLCH, so derived shades keep their
// contrast and lean the same way (darker, a little cooler) whatever base colour a player picks.
// Pure: no DOM, no Pixi.

export interface Oklch {
  l: number;
  c: number;
  /** Hue in degrees. */
  h: number;
}

export function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export const hexToNum = (hex: string): number => parseInt(parseHex(hex).map((v) => v.toString(16).padStart(2, "0")).join(""), 16);
export const numToHex = (n: number): string => toHex((n >> 16) & 255, (n >> 8) & 255, n & 255);

const toLinear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number): number => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055);

export function hexToOklch(hex: string): Oklch {
  const [r8, g8, b8] = parseHex(hex);
  const r = toLinear(r8);
  const g = toLinear(g8);
  const b = toLinear(b8);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return toHex(fromLinear(r), fromLinear(g), fromLinear(bb));
}

/** Rotate hue `h` towards `target` by at most `deg` degrees (the short way round). */
function hueToward(h: number, target: number, deg: number): number {
  let d = target - h;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  const step = Math.max(-deg, Math.min(deg, d));
  return (h + step + 360) % 360;
}

/**
 * A cel shadow tone for `hex`: darker in OKLCH lightness, chroma kept, hue nudged a little towards
 * blue (the Hard Ink rule: shadows are the base darkened "plus a little blue"). `depth` 1 is the
 * ordinary shadow tone, 2 is the core/recess tone. Calibrated on the engine canvas's four
 * colourways (Dust, Ash, Prairie, Night shift): darker bases lose a little less lightness.
 */
export function shadeOf(hex: string, depth: 1 | 2 = 1): string {
  const o = hexToOklch(hex);
  const l = depth === 1 ? o.l * 0.72 + 0.03 : o.l * 0.52 + 0.02;
  // greys have no meaningful hue: don't invent one
  const h = o.c < 0.012 ? o.h : hueToward(o.h, 255, depth === 1 ? 3 : 8);
  return oklchToHex({ l, c: o.c * (depth === 1 ? 0.86 : 0.72), h });
}

/** A lit tone: lighter, slightly warmer (used for the team ring's bevel). */
export function lightOf(hex: string, amount = 0.18): string {
  const o = hexToOklch(hex);
  const h = o.c < 0.012 ? o.h : hueToward(o.h, 85, 6);
  return oklchToHex({ l: Math.min(0.97, o.l + amount), c: o.c * 0.9, h });
}

/** Mix two colours in sRGB (t = 0 gives a, 1 gives b). */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

/** Relative luminance (WCAG), for contrast checks in tests and the Forge's warnings later. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
