// Pure Pixi drawing helpers for the board renderer's live layers (overlays, rings, ghosts, objectives).
// The static board and the miniatures are painted in Canvas 2D by `./art/*` and baked to textures.

import type { Graphics } from "pixi.js";
import type { Vec } from "../engine/types";

export { ACCENT, BAD, CLASH, GOOD, INK, PLAYER_COLORS, SAND, SAND_DARK, shade, SHIELD } from "./art/palette";
export type { Look } from "./art/figures";
import { INK } from "./art/palette";

export const flat = (poly: Vec[]): number[] => poly.flatMap((p) => [p.x, p.y]);

export function bbox(poly: Vec[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return [x0, y0, x1, y1];
}

/** Adds dashed segments from a to b to the current path (caller strokes). */
export function dashLine(g: Graphics, a: Vec, b: Vec, dash: number, gap: number, offset = 0): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return;
  const ux = dx / L;
  const uy = dy / L;
  let t = -(offset % (dash + gap));
  while (t < L) {
    const t0 = Math.max(0, t);
    const t1 = Math.min(L, t + dash);
    if (t1 > t0) g.moveTo(a.x + ux * t0, a.y + uy * t0).lineTo(a.x + ux * t1, a.y + uy * t1);
    t += dash + gap;
  }
}

export function dashPoly(g: Graphics, pts: Vec[], dash: number, gap: number, closed = true): void {
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) dashLine(g, pts[i]!, pts[(i + 1) % n]!, dash, gap);
}

export function dashCircle(g: Graphics, x: number, y: number, r: number, segments: number, fill = 0.55, rot = 0, ry = r): void {
  const step = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    const a0 = rot + i * step;
    const a1 = a0 + step * fill;
    const n = 4;
    g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * ry);
    for (let j = 1; j <= n; j++) {
      const a = a0 + ((a1 - a0) * j) / n;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * ry);
    }
  }
}

/** Ghost preview of a model's base, for placement/move previews. */
/** Cover colours, as in the move preview: green for full cover, yellow for partial. */
export const COVER_FULL = 0x4fd36b;
export const COVER_PARTIAL = 0xf2c230;

/** A little shield above a ghost model showing the cover it will have at that spot. */
export function drawCoverPip(g: Graphics, pos: Vec, r: number, cover: 1 | 2): void {
  const c = cover === 2 ? COVER_FULL : COVER_PARTIAL;
  const x = pos.x + r * 0.75;
  const y = pos.y - r * 0.95;
  const w = 0.26;
  const h = 0.32;
  // Shield: flat top, pointed bottom.
  g.poly([x - w, y - h * 0.7, x + w, y - h * 0.7, x + w, y + h * 0.05, x, y + h, x - w, y + h * 0.05]).fill(c).stroke({ width: 0.06, color: INK });
  if (cover === 2) {
    // A tick for full cover.
    g.moveTo(x - w * 0.45, y + h * 0.05).lineTo(x - w * 0.05, y + h * 0.4).lineTo(x + w * 0.5, y - h * 0.3).stroke({ width: 0.06, color: INK });
  } else {
    // A "!" for partial cover.
    g.moveTo(x, y - h * 0.45).lineTo(x, y + h * 0.15).stroke({ width: 0.07, color: INK });
    g.circle(x, y + h * 0.45, 0.035).fill(INK);
  }
}

export function drawGhost(g: Graphics, pos: Vec, r: number, ok: boolean, good: number, bad: number): void {
  const c = ok ? good : bad;
  g.ellipse(pos.x + 0.06, pos.y + 0.1, r + 0.1, (r + 0.1) * 0.92).fill({ color: INK, alpha: 0.25 });
  g.ellipse(pos.x, pos.y, r + 0.1, (r + 0.1) * 0.92).fill({ color: c, alpha: 0.3 });
  dashCircle(g, pos.x, pos.y, r + 0.1, Math.max(8, Math.round(r * 10)), 0.6, 0, (r + 0.1) * 0.92);
  g.stroke({ width: 0.13, color: INK });
  dashCircle(g, pos.x, pos.y, r + 0.1, Math.max(8, Math.round(r * 10)), 0.6, 0, (r + 0.1) * 0.92);
  g.stroke({ width: 0.07, color: c });
  g.moveTo(pos.x - 0.18, pos.y).lineTo(pos.x + 0.18, pos.y).moveTo(pos.x, pos.y - 0.18).lineTo(pos.x, pos.y + 0.18).stroke({ width: 0.06, color: INK, alpha: 0.8 });
}

/** A short bar across an aim line where the weapon's reach ends. */
export function drawRangeTick(g: Graphics, from: Vec, to: Vec, at: Vec): void {
  const L = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const nx = -(to.y - from.y) / L;
  const ny = (to.x - from.x) / L;
  const w = 0.32;
  g.moveTo(at.x - nx * w, at.y - ny * w).lineTo(at.x + nx * w, at.y + ny * w).stroke({ width: 0.16, color: INK });
  g.moveTo(at.x - nx * w, at.y - ny * w).lineTo(at.x + nx * w, at.y + ny * w).stroke({ width: 0.08, color: 0xd23a2f });
}

const MARK_GREY = 0xb8ad9a;

/** A mark on an aim line: ✕ blocked, shield for cover (grey and struck through when ignored), arrow for plunging fire. */
export function drawShotMark(g: Graphics, p: Vec, kind: "blocks" | "cover" | "cover-ignored" | "plunge"): void {
  if (kind === "blocks") {
    g.circle(p.x, p.y, 0.3).fill(0xd23a2f).stroke({ width: 0.06, color: INK });
    const d = 0.14;
    g.moveTo(p.x - d, p.y - d).lineTo(p.x + d, p.y + d).moveTo(p.x + d, p.y - d).lineTo(p.x - d, p.y + d).stroke({ width: 0.08, color: 0xffffff });
    return;
  }
  if (kind === "plunge") {
    g.circle(p.x, p.y, 0.28).fill(COVER_FULL).stroke({ width: 0.06, color: INK });
    g.moveTo(p.x, p.y - 0.16).lineTo(p.x, p.y + 0.12).moveTo(p.x - 0.11, p.y + 0.02).lineTo(p.x, p.y + 0.14).lineTo(p.x + 0.11, p.y + 0.02).stroke({ width: 0.07, color: INK });
    return;
  }
  const c = kind === "cover" ? COVER_PARTIAL : MARK_GREY;
  const w = 0.24;
  const h = 0.3;
  g.poly([p.x - w, p.y - h * 0.8, p.x + w, p.y - h * 0.8, p.x + w, p.y, p.x, p.y + h, p.x - w, p.y]).fill(c).stroke({ width: 0.06, color: INK });
  if (kind === "cover") {
    g.moveTo(p.x - w * 0.55, p.y - h * 0.2).lineTo(p.x + w * 0.55, p.y - h * 0.2).stroke({ width: 0.07, color: INK }); // a "−" for −1 save
  } else {
    g.moveTo(p.x - w * 1.1, p.y + h * 0.7).lineTo(p.x + w * 1.1, p.y - h * 1.0).stroke({ width: 0.07, color: INK });
  }
}
