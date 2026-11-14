// Canvas 2D board painter, overhead "colony sim" style: a tiled dusty ground with subtle noise and
// dirt/scrub patches; buildings as top-down structures with visible wall thickness and roofs; raised
// floors with edge shading and a clear border; obvious ramps and ladders; crates, sandbags and fences;
// craters as dark rings. One painter serves the game board (baked to a texture), the map builder and
// the menu thumbnails, so the look matches everywhere. The context must already map inches to pixels.

import type { AccessPoint, PlayerId, Terrain, Vec } from "../../engine/types";
import { hash, INK_CSS, makeCanvas, P, rng, stroke, type Pen } from "./ink";
import { css, DIRT, METAL, mix, PLANK, PLAYER_COLORS, rgba, RUST, shade, TEAL_PAINT } from "./palette";

export const PLATFORM_FACE = 0.7;
export const BUILDING_FACE = 1.3;
const LINE = 0.06;
const EDGE = "#2a211c";

// Muted, earthy board palette
const GROUND = 0xb39469;
const GROUND_DARK = 0x8f7350;
const FLOOR = 0x9a8466;
const ROOF = [0x7d5a44, 0x6f7472, 0x8a6a48, 0x5f6b62] as const;
const WALL = 0x4c4038;
const CONCRETE = 0x9d978b;
const WATER = 0x5f9a92;
const SHRUB = 0x6f7a3f;

export interface BoardLike {
  width: number;
  height: number;
  terrain: Terrain[];
  access: AccessPoint[];
  spawn: [Vec[][], Vec[][]];
}

export interface PaintOpts {
  /** Inches of table frame drawn around the board (0 = none). */
  frame?: number;
  /** Draw the 6" grid. */
  grid?: boolean;
  /** Smaller thumbnails skip the finest detail. */
  low?: boolean;
}

// ---------- geometry ----------

const polyPath = (poly: Vec[], dx = 0, dy = 0): Path2D => P.poly(poly.flatMap((p) => [p.x + dx, p.y + dy]));

function centroid(poly: Vec[]): Vec {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / Math.max(1, poly.length), y: y / Math.max(1, poly.length) };
}

function bbox(poly: Vec[]): { x0: number; y0: number; x1: number; y1: number } {
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
  return { x0, y0, x1, y1 };
}

/** Shrink a polygon towards its centroid by roughly `d` inches. */
function inset(poly: Vec[], d: number): Vec[] {
  const c = centroid(poly);
  return poly.map((p) => {
    const l = Math.hypot(p.x - c.x, p.y - c.y) || 1;
    const k = Math.max(0, 1 - d / l);
    return { x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k };
  });
}

const isRound = (poly: Vec[]): boolean => poly.length >= 7;


/** Convex hull (monotone chain). */
function hull(pts: Vec[]): Vec[] {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Vec[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function edges(poly: Vec[]): { a: Vec; b: Vec; nx: number; ny: number; len: number }[] {
  const c = centroid(poly);
  const out: { a: Vec; b: Vec; nx: number; ny: number; len: number }[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    let nx = dy / L;
    let ny = -dx / L;
    if (nx * ((a.x + b.x) / 2 - c.x) + ny * ((a.y + b.y) / 2 - c.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    out.push({ a, b, nx, ny, len: L });
  }
  return out;
}

/** The silhouette of a block whose top is `poly` and which stands `h` tall (3/4 view: faces hang down-screen). */
function blockOutline(poly: Vec[], h: number): Path2D {
  return polyPath(hull([...poly, ...poly.map((p) => ({ x: p.x, y: p.y + h }))]));
}

/** Cel cast shadow for a block, falling down-right. */
function castShadow(ctx: CanvasRenderingContext2D, poly: Vec[], h: number, dx: number, dy: number): void {
  const path = polyPath(hull([...poly.map((p) => ({ x: p.x, y: p.y + h })), ...poly.map((p) => ({ x: p.x + dx, y: p.y + h + dy }))]));
  ctx.save();
  ctx.fillStyle = "rgba(30,22,16,0.32)";
  ctx.fill(path);
  ctx.restore();
}

type FaceStyle = "cliff" | "metal" | "concrete" | "wood";

/** The front faces of a block (3/4 view), cel shaded per orientation, with material detail. */
function faces(ctx: CanvasRenderingContext2D, poly: Vec[], h: number, color: number, style: FaceStyle, seed: number): void {
  const rnd = rng(seed);
  for (const e of edges(poly)) {
    if (e.ny <= 0.05) continue;
    // light from the upper left: faces turned left are brighter
    const tone = shade(color, e.nx < -0.2 ? 0.06 : e.nx > 0.2 ? -0.3 : -0.14);
    const quad = P.poly([e.a.x, e.a.y, e.b.x, e.b.y, e.b.x, e.b.y + h, e.a.x, e.a.y + h]);
    const along = (t: number, down: number) => ({ x: e.a.x + ((e.b.x - e.a.x) * t) / e.len, y: e.a.y + ((e.b.y - e.a.y) * t) / e.len + down });
    ctx.save();
    ctx.fillStyle = css(tone);
    ctx.fill(quad);
    ctx.clip(quad);
    ctx.lineWidth = 0.035;
    ctx.strokeStyle = "rgba(30,22,16,0.45)";
    ctx.beginPath();
    if (style === "cliff") {
      for (let d = 0.16; d < h; d += 0.16 + rnd() * 0.1) {
        const p0 = along(0, d);
        ctx.moveTo(p0.x, p0.y);
        for (let t = 0.6; t <= e.len + 0.6; t += 0.6) {
          const q = along(Math.min(t, e.len), d + (rnd() - 0.5) * 0.06);
          ctx.lineTo(q.x, q.y);
        }
      }
      ctx.stroke();
      for (let t = 0.3; t < e.len; t += 0.7 + rnd() * 0.6) {
        const q = along(t, h * (0.3 + rnd() * 0.5));
        ctx.fillStyle = rgba(shade(tone, 0.25), 0.8);
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, 0.1 + rnd() * 0.12, 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style === "metal") {
      for (let t = 0.18; t < e.len; t += 0.18) {
        const q = along(t, 0);
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x, q.y + h);
      }
      ctx.stroke();
      for (let t = 0.5; t < e.len; t += 1.1 + rnd()) {
        const q = along(t, h * 0.25);
        const g = ctx.createLinearGradient(q.x, q.y, q.x, q.y + h * 0.7);
        g.addColorStop(0, "rgba(140,64,30,0.55)");
        g.addColorStop(1, "rgba(140,64,30,0)");
        ctx.fillStyle = g;
        ctx.fillRect(q.x - 0.08, q.y, 0.16, h * 0.7);
      }
    } else if (style === "wood") {
      for (let d = 0.1; d < h; d += 0.1) {
        const q0 = along(0, d);
        const q1 = along(e.len, d);
        ctx.moveTo(q0.x, q0.y);
        ctx.lineTo(q1.x, q1.y);
      }
      ctx.stroke();
    } else {
      for (let t = 1; t < e.len; t += 1) {
        const q = along(t, 0);
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x, q.y + h);
      }
      ctx.stroke();
    }
    // a lit lip at the top, ambient occlusion at the foot
    const top = Math.min(e.a.y, e.b.y);
    const g = ctx.createLinearGradient(0, top, 0, Math.max(e.a.y, e.b.y) + h);
    g.addColorStop(0, "rgba(255,240,210,0.2)");
    g.addColorStop(0.3, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(30,22,16,0.4)");
    ctx.fillStyle = g;
    ctx.fill(quad);
    ctx.restore();
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = EDGE;
    ctx.stroke(quad);
  }
}

/** Heavy silhouette line around a whole block. */
function heavyOutline(ctx: CanvasRenderingContext2D, poly: Vec[], h: number, w = 0.13): void {
  ctx.lineWidth = w;
  ctx.strokeStyle = EDGE;
  ctx.lineJoin = "round";
  ctx.stroke(blockOutline(poly, h));
}

function pen(ctx: CanvasRenderingContext2D, ink = LINE): Pen {
  return { ctx, ink, hatch: 4 };
}

/** Flat fill + clean outline. */
function fillPath(ctx: CanvasRenderingContext2D, path: Path2D, color: number | string, line = LINE, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = typeof color === "number" ? css(color) : color;
  ctx.fill(path);
  ctx.restore();
  if (line > 0) {
    ctx.lineWidth = line;
    ctx.strokeStyle = EDGE;
    ctx.lineJoin = "round";
    ctx.stroke(path);
  }
}

/** Soft drop shadow of a footprint, offset down-right. */
function dropShadow(ctx: CanvasRenderingContext2D, path: Path2D, d: number, alpha = 0.35): void {
  const k = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
  ctx.save();
  ctx.shadowColor = `rgba(30,22,16,${alpha})`;
  ctx.shadowBlur = d * k * 0.9;
  ctx.shadowOffsetX = d * 0.6 * k;
  ctx.shadowOffsetY = d * k;
  ctx.fillStyle = `rgba(30,22,16,${alpha * 0.5})`;
  ctx.fill(path);
  ctx.restore();
}

/** Inner bevel: light along the top-left edges, dark along the bottom-right ones. */
function bevel(ctx: CanvasRenderingContext2D, path: Path2D, w: number, light = 0.35, dark = 0.4): void {
  const band = (dx: number, dy: number, style: string) => {
    ctx.save();
    ctx.clip(path);
    const q = new Path2D();
    q.rect(-1e4, -1e4, 2e4, 2e4);
    q.addPath(path, { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });
    ctx.clip(q, "evenodd");
    ctx.fillStyle = style;
    ctx.fill(path);
    ctx.restore();
  };
  band(w, w, `rgba(255,246,220,${light})`);
  band(-w, -w, `rgba(30,22,16,${dark})`);
}

// ---------- ground tile ----------

const TILE_IN = 12;
const TILE_PX = 480;
let groundTile: HTMLCanvasElement | null = null;

function makeGroundTile(): HTMLCanvasElement {
  const c = makeCanvas(TILE_PX, TILE_PX);
  const ctx = c.getContext("2d")!;
  const k = TILE_PX / TILE_IN;
  ctx.scale(k, k);
  const rnd = rng(4242);
  // 1" tiles, each a touch lighter or darker
  for (let y = 0; y < TILE_IN; y++) {
    for (let x = 0; x < TILE_IN; x++) {
      const v = (rnd() - 0.5) * 0.07;
      ctx.fillStyle = css(shade(GROUND, v));
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const wrap = (fn: (ox: number, oy: number) => void) => {
    for (const ox of [-TILE_IN, 0, TILE_IN]) for (const oy of [-TILE_IN, 0, TILE_IN]) fn(ox, oy);
  };
  // dirt patches
  for (let i = 0; i < 14; i++) {
    const x = rnd() * TILE_IN;
    const y = rnd() * TILE_IN;
    const r = 0.7 + rnd() * 1.6;
    const blob = P.blob(0, 0, r, r * (0.55 + rnd() * 0.35), 10, 0.22, rnd, rnd() * 3);
    const col = rnd() < 0.6 ? GROUND_DARK : 0xc9ac80;
    wrap((ox, oy) => {
      ctx.save();
      ctx.translate(x + ox, y + oy);
      ctx.fillStyle = rgba(col, 0.28);
      ctx.fill(blob);
      ctx.restore();
    });
  }
  // grain noise
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rgba(rnd() < 0.55 ? 0x5a4630 : 0xe8d4ac, 0.1 + rnd() * 0.14);
    const s = 0.03 + rnd() * 0.04;
    ctx.fillRect(rnd() * TILE_IN, rnd() * TILE_IN, s, s);
  }
  // pebbles
  for (let i = 0; i < 40; i++) {
    const x = rnd() * TILE_IN;
    const y = rnd() * TILE_IN;
    const r = 0.04 + rnd() * 0.07;
    wrap((ox, oy) => {
      if (x + ox < -0.3 || x + ox > TILE_IN + 0.3 || y + oy < -0.3 || y + oy > TILE_IN + 0.3) return;
      ctx.fillStyle = "rgba(40,30,20,0.3)";
      ctx.beginPath();
      ctx.ellipse(x + ox + 0.03, y + oy + 0.04, r, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(rnd() < 0.5 ? 0xa8977c : 0x8a7a62);
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, r, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // dry grass tufts
  for (let i = 0; i < 30; i++) {
    const x = rnd() * (TILE_IN - 1) + 0.5;
    const y = rnd() * (TILE_IN - 1) + 0.5;
    ctx.strokeStyle = rgba(rnd() < 0.5 ? 0x6f7a3f : 0x8a8a4a, 0.85);
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2 + rnd();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 0.14, y + Math.sin(a) * 0.14);
    }
    ctx.stroke();
  }
  // faint tile seams
  ctx.strokeStyle = "rgba(60,45,30,0.07)";
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  for (let i = 0; i <= TILE_IN; i++) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i, TILE_IN);
    ctx.moveTo(0, i);
    ctx.lineTo(TILE_IN, i);
  }
  ctx.stroke();
  return c;
}

function groundPattern(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  groundTile ??= makeGroundTile();
  const p = ctx.createPattern(groundTile, "repeat");
  if (!p) return css(GROUND);
  p.setTransform(new DOMMatrix([TILE_IN / TILE_PX, 0, 0, TILE_IN / TILE_PX, 0, 0]));
  return p;
}

// ---------- board base ----------

export function paintGround(ctx: CanvasRenderingContext2D, b: Pick<BoardLike, "width" | "height" | "spawn">, opts: PaintOpts = {}): void {
  const { width: w, height: h } = b;
  const m = opts.frame ?? 0;
  if (m > 0) {
    // a plain dark tabletop frame with bolts
    ctx.fillStyle = "#2a211c";
    ctx.beginPath();
    ctx.roundRect(-m, -m, w + m * 2, h + m * 2, 0.5);
    ctx.fill();
    ctx.fillStyle = "#3d3229";
    ctx.beginPath();
    ctx.roundRect(-m + 0.15, -m + 0.15, w + m * 2 - 0.3, h + m * 2 - 0.3, 0.4);
    ctx.fill();
    for (let x = 1.5; x < w; x += 6) for (const y of [-m / 2, h + m / 2]) bolt(ctx, x, y);
    for (let y = 1.5; y < h; y += 6) for (const x of [-m / 2, w + m / 2]) bolt(ctx, x, y);
  }
  ctx.fillStyle = groundPattern(ctx);
  ctx.fillRect(0, 0, w, h);
  // spawn zones: player tint, diagonal stripes, dashed rim
  for (const p of [0, 1] as PlayerId[]) {
    for (const poly of b.spawn[p]) {
      const path = polyPath(poly);
      ctx.fillStyle = rgba(PLAYER_COLORS[p], 0.16);
      ctx.fill(path);
      ctx.save();
      ctx.clip(path);
      const bb = bbox(poly);
      ctx.strokeStyle = rgba(shade(PLAYER_COLORS[p], -0.2), 0.18);
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      for (let s = bb.x0 - (bb.y1 - bb.y0); s < bb.x1; s += 1.2) {
        ctx.moveTo(s, bb.y1);
        ctx.lineTo(s + (bb.y1 - bb.y0), bb.y0);
      }
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.setLineDash([0.5, 0.3]);
      ctx.lineWidth = 0.1;
      ctx.strokeStyle = rgba(shade(PLAYER_COLORS[p], -0.25), 0.9);
      ctx.stroke(path);
      ctx.restore();
    }
  }
  if (opts.grid !== false) {
    ctx.beginPath();
    for (let x = 6; x < w; x += 6) (ctx.moveTo(x, 0), ctx.lineTo(x, h));
    for (let y = 6; y < h; y += 6) (ctx.moveTo(0, y), ctx.lineTo(w, y));
    ctx.strokeStyle = "rgba(50,38,26,0.16)";
    ctx.lineWidth = 0.05;
    ctx.stroke();
  }
  ctx.lineWidth = 0.12;
  ctx.strokeStyle = EDGE;
  ctx.strokeRect(0, 0, w, h);
}

function bolt(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "#1c1612";
  ctx.beginPath();
  ctx.arc(x + 0.03, y + 0.04, 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8d8478";
  ctx.beginPath();
  ctx.arc(x, y, 0.11, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- terrain kinds ----------

function platform(ctx: CanvasRenderingContext2D, t: Terrain): void {
  const path = polyPath(t.poly);
  const rnd = rng(hash(t.id));
  // a raised deck: cast shadow, rocky cliff faces, then a steel-edged floor of plates with a clear border
  castShadow(ctx, t.poly, PLATFORM_FACE, 0.6, 0.45);
  faces(ctx, t.poly, PLATFORM_FACE, 0x8b6440, "cliff", hash(t.id));
  fillPath(ctx, path, mix(FLOOR, 0x6a5a48, 0.35), 0);
  const top = polyPath(inset(t.poly, 0.28));
  ctx.save();
  ctx.clip(top);
  ctx.fillStyle = css(FLOOR);
  ctx.fill(top);
  const b = bbox(t.poly);
  // deck plates, a slightly different tone each
  for (let y = Math.floor(b.y0); y < b.y1; y += 2) {
    for (let x = Math.floor(b.x0); x < b.x1; x += 2) {
      ctx.fillStyle = css(shade(FLOOR, (rnd() - 0.5) * 0.12));
      ctx.fillRect(x + 0.03, y + 0.03, 1.94, 1.94);
      ctx.fillStyle = "rgba(40,30,22,0.35)";
      for (const [px, py] of [[0.2, 0.2], [1.8, 0.2], [0.2, 1.8], [1.8, 1.8]] as const) ctx.fillRect(x + px - 0.04, y + py - 0.04, 0.08, 0.08);
    }
  }
  ctx.strokeStyle = "rgba(40,30,22,0.4)";
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  for (let y = Math.floor(b.y0); y <= b.y1; y += 2) (ctx.moveTo(b.x0, y), ctx.lineTo(b.x1, y));
  for (let x = Math.floor(b.x0); x <= b.x1; x += 2) (ctx.moveTo(x, b.y0), ctx.lineTo(x, b.y1));
  ctx.stroke();
  ctx.restore();
  bevel(ctx, top, 0.12, 0.3, 0.25);
  // rim: a steel lip with yellow edge markers so the drop reads clearly
  ctx.save();
  const rim = new Path2D();
  rim.addPath(path);
  rim.addPath(top);
  ctx.clip(rim, "evenodd");
  ctx.fillStyle = css(0x6d6458);
  ctx.fill(path);
  ctx.setLineDash([0.5, 0.5]);
  ctx.lineWidth = 0.12;
  ctx.strokeStyle = "rgba(217,178,58,0.9)";
  ctx.stroke(polyPath(inset(t.poly, 0.14)));
  ctx.restore();
  bevel(ctx, path, 0.1, 0.4, 0.45);
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = EDGE;
  ctx.stroke(top);
  heavyOutline(ctx, t.poly, PLATFORM_FACE, 0.14);
  ctx.lineWidth = 0.07;
  ctx.stroke(path);
}

function building(ctx: CanvasRenderingContext2D, t: Terrain): void {
  const path = polyPath(t.poly);
  const seed = hash(t.id);
  const rnd = rng(seed);
  const roof = ROOF[seed % ROOF.length]!;
  castShadow(ctx, t.poly, BUILDING_FACE, 0.9, 0.6);
  faces(ctx, t.poly, BUILDING_FACE, isRound(t.poly) ? 0x8a8f86 : [RUST, TEAL_PAINT, 0x8a8f86, 0x9c6b3e][seed % 4]!, "metal", seed);
  // lit windows and a door on the front walls
  for (const e of edges(t.poly)) {
    if (e.ny <= 0.3 || e.len < 1.2) continue;
    let doorDone = isRound(t.poly);
    for (let s2 = 0.7; s2 < e.len - 0.5; s2 += 1.5) {
      const x = e.a.x + ((e.b.x - e.a.x) * s2) / e.len;
      const y = e.a.y + ((e.b.y - e.a.y) * s2) / e.len;
      if (!doorDone && s2 > e.len / 2 - 1) {
        doorDone = true;
        fillPath(ctx, P.rrect(x - 0.3, y + 0.38, 0.6, BUILDING_FACE - 0.38, 0.05), 0x5c3a1c, 0.05);
        fillPath(ctx, P.circle(x + 0.18, y + 0.85, 0.04), 0xcf9f42, 0);
        continue;
      }
      const win = P.rrect(x - 0.24, y + 0.32, 0.48, 0.4, 0.05);
      ctx.save();
      ctx.shadowColor = "rgba(255,200,80,0.85)";
      ctx.shadowBlur = 6;
      fillPath(ctx, win, 0xffd36a, 0.05);
      ctx.restore();
      stroke(pen(ctx), P.line([x, y + 0.32, x, y + 0.72]), 0.035);
    }
  }
  // thick outer walls
  fillPath(ctx, path, WALL, 0.08);
  const inner = inset(t.poly, 0.32);
  const ip = polyPath(inner);
  const b = bbox(inner);
  if (isRound(t.poly)) {
    // silo / tank: concentric roof bands
    const c = centroid(t.poly);
    fillPath(ctx, ip, 0x7a7f7c, 0.04);
    const R = Math.max(...inner.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    for (let k = 0.78; k > 0.1; k -= 0.22) fillPath(ctx, polyPath(inset(inner, R * (1 - k))), shade(0x7a7f7c, (0.78 - k) * 0.35), 0.03);
    for (const p of inner) stroke(pen(ctx), P.line([c.x, c.y, p.x, p.y]), 0.025, "rgba(40,30,22,0.35)");
    fillPath(ctx, P.circle(c.x, c.y, Math.min(0.5, R * 0.25)), RUST, 0.04);
    bevel(ctx, ip, 0.12);
  } else {
    // corrugated roof with ridge, patches and a vent
    fillPath(ctx, ip, roof, 0.04);
    ctx.save();
    ctx.clip(ip);
    const horiz = b.x1 - b.x0 >= b.y1 - b.y0;
    ctx.strokeStyle = "rgba(30,22,16,0.22)";
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    if (horiz) for (let x = b.x0 + 0.25; x < b.x1; x += 0.25) (ctx.moveTo(x, b.y0), ctx.lineTo(x, b.y1));
    else for (let y = b.y0 + 0.25; y < b.y1; y += 0.25) (ctx.moveTo(b.x0, y), ctx.lineTo(b.x1, y));
    ctx.stroke();
    // roof halves lit differently either side of the ridge
    ctx.fillStyle = "rgba(255,246,220,0.12)";
    if (horiz) ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, (b.y1 - b.y0) / 2);
    else ctx.fillRect(b.x0, b.y0, (b.x1 - b.x0) / 2, b.y1 - b.y0);
    ctx.fillStyle = "rgba(30,22,16,0.12)";
    if (horiz) ctx.fillRect(b.x0, (b.y0 + b.y1) / 2, b.x1 - b.x0, (b.y1 - b.y0) / 2);
    else ctx.fillRect((b.x0 + b.x1) / 2, b.y0, (b.x1 - b.x0) / 2, b.y1 - b.y0);
    for (let i = 0; i < 2; i++) {
      const w = 0.8 + rnd() * 1.0;
      const h = 0.6 + rnd() * 0.8;
      const x = b.x0 + 0.2 + rnd() * Math.max(0.1, b.x1 - b.x0 - w - 0.4);
      const y = b.y0 + 0.2 + rnd() * Math.max(0.1, b.y1 - b.y0 - h - 0.4);
      fillPath(ctx, P.rrect(x, y, w, h, 0.04), [RUST, TEAL_PAINT, METAL][(seed + i) % 3]!, 0.03, 0.9);
    }
    ctx.restore();
    stroke(pen(ctx), horiz ? P.line([b.x0, (b.y0 + b.y1) / 2, b.x1, (b.y0 + b.y1) / 2]) : P.line([(b.x0 + b.x1) / 2, b.y0, (b.x0 + b.x1) / 2, b.y1]), 0.06, "rgba(30,22,16,0.55)");
    const vx = b.x0 + (b.x1 - b.x0) * 0.72;
    const vy = b.y0 + (b.y1 - b.y0) * 0.3;
    dropShadow(ctx, P.rrect(vx - 0.25, vy - 0.25, 0.5, 0.5, 0.06), 0.15, 0.4);
    fillPath(ctx, P.rrect(vx - 0.25, vy - 0.25, 0.5, 0.5, 0.06), 0x5a5550, 0.04);
    fillPath(ctx, P.circle(vx, vy, 0.13), 0x2a2420, 0.03);
    bevel(ctx, ip, 0.1, 0.2, 0.2);
  }
  // a door gap in the wall on the bottom side, so it reads as a building
  if (!isRound(t.poly)) {
    const bb = bbox(t.poly);
    void bb;
  }
  heavyOutline(ctx, t.poly, BUILDING_FACE, 0.14);
}

function wall(ctx: CanvasRenderingContext2D, t: Terrain): void {
  const path = polyPath(t.poly);
  castShadow(ctx, t.poly, 0.35, 0.3, 0.25);
  faces(ctx, t.poly, 0.35, CONCRETE, "concrete", hash(t.id));
  fillPath(ctx, path, CONCRETE, 0.05);
  const b = bbox(t.poly);
  ctx.save();
  ctx.clip(path);
  const horiz = b.x1 - b.x0 >= b.y1 - b.y0;
  ctx.strokeStyle = "rgba(40,30,22,0.45)";
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  if (horiz) for (let x = b.x0 + 1; x < b.x1; x += 1) (ctx.moveTo(x, b.y0), ctx.lineTo(x, b.y1));
  else for (let y = b.y0 + 1; y < b.y1; y += 1) (ctx.moveTo(b.x0, y), ctx.lineTo(b.x1, y));
  ctx.stroke();
  ctx.restore();
  bevel(ctx, path, 0.08, 0.35, 0.35);
  heavyOutline(ctx, t.poly, 0.35, 0.1);
}

function barricade(ctx: CanvasRenderingContext2D, t: Terrain): void {
  const b = bbox(t.poly);
  const rnd = rng(hash(t.id));
  const path = polyPath(t.poly);
  const horiz = b.x1 - b.x0 >= b.y1 - b.y0;
  castShadow(ctx, t.poly, 0.22, 0.25, 0.2);
  faces(ctx, t.poly, 0.22, /crate|fence|plank|board/.test(t.id) ? 0x7a4e27 : 0x8a7650, "wood", hash(t.id));
  if (/crate/.test(t.id)) {
    const n = Math.max(1, Math.round((horiz ? b.x1 - b.x0 : b.y1 - b.y0) / 1));
    for (let i = 0; i < n; i++) {
      const box = horiz
        ? { x: b.x0 + ((b.x1 - b.x0) * i) / n, y: b.y0, w: (b.x1 - b.x0) / n, h: b.y1 - b.y0 }
        : { x: b.x0, y: b.y0 + ((b.y1 - b.y0) * i) / n, w: b.x1 - b.x0, h: (b.y1 - b.y0) / n };
      const p = P.rrect(box.x + 0.03, box.y + 0.03, box.w - 0.06, box.h - 0.06, 0.04);
      fillPath(ctx, p, i % 2 ? PLANK : shade(PLANK, 0.1), 0.05);
      stroke(pen(ctx), P.line([box.x + 0.1, box.y + 0.1, box.x + box.w - 0.1, box.y + box.h - 0.1]), 0.035, "rgba(40,30,22,0.6)");
      stroke(pen(ctx), P.line([box.x + box.w - 0.1, box.y + 0.1, box.x + 0.1, box.y + box.h - 0.1]), 0.035, "rgba(40,30,22,0.6)");
      bevel(ctx, p, 0.06);
    }
  } else if (/fence|plank|board/.test(t.id)) {
    fillPath(ctx, path, PLANK, 0.06);
    ctx.save();
    ctx.clip(path);
    ctx.strokeStyle = "rgba(40,30,22,0.5)";
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    if (horiz) for (let x = b.x0 + 0.4; x < b.x1; x += 0.4 + rnd() * 0.1) (ctx.moveTo(x, b.y0), ctx.lineTo(x, b.y1));
    else for (let y = b.y0 + 0.4; y < b.y1; y += 0.4 + rnd() * 0.1) (ctx.moveTo(b.x0, y), ctx.lineTo(b.x1, y));
    ctx.stroke();
    ctx.restore();
    // posts
    for (let s = 0.2; s < (horiz ? b.x1 - b.x0 : b.y1 - b.y0); s += 1.5) {
      const x = horiz ? b.x0 + s : (b.x0 + b.x1) / 2;
      const y = horiz ? (b.y0 + b.y1) / 2 : b.y0 + s;
      fillPath(ctx, P.rrect(x - 0.12, y - 0.12, 0.24, 0.24, 0.03), 0x5c3a1c, 0.04);
    }
    bevel(ctx, path, 0.06);
  } else {
    // sandbags
    const L = horiz ? b.x1 - b.x0 : b.y1 - b.y0;
    const W = horiz ? b.y1 - b.y0 : b.x1 - b.x0;
    const rows = Math.max(1, Math.round(W / 0.45));
    for (let r = 0; r < rows; r++) {
      for (let s = 0.3 + (r % 2) * 0.28; s < L - 0.1; s += 0.56) {
        const across = (W * (r + 0.5)) / rows;
        const x = horiz ? b.x0 + s : b.x0 + across;
        const y = horiz ? b.y0 + across : b.y0 + s;
        const bag = horiz ? P.ellipse(x, y, 0.3, Math.min(0.22, W / rows / 1.7)) : P.ellipse(x, y, Math.min(0.22, W / rows / 1.7), 0.3);
        fillPath(ctx, bag, 0xa89070, 0.04);
        bevel(ctx, bag, 0.05, 0.3, 0.3);
      }
    }
  }
}

function scrub(ctx: CanvasRenderingContext2D, t: Terrain, low: boolean): void {
  const path = polyPath(t.poly);
  const rnd = rng(hash(t.id));
  ctx.fillStyle = rgba(0x5f6a34, 0.32);
  ctx.fill(path);
  ctx.save();
  ctx.setLineDash([0.25, 0.18]);
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = "rgba(40,48,20,0.7)";
  ctx.stroke(path);
  ctx.restore();
  const b = bbox(t.poly);
  const step = low ? 1.2 : 0.85;
  ctx.save();
  ctx.clip(path);
  for (let y = b.y0 + 0.45; y < b.y1; y += step) {
    for (let x = b.x0 + 0.45 + ((Math.round(y / step) % 2) * step) / 2; x < b.x1; x += step) {
      const jx = x + (rnd() - 0.5) * 0.35;
      const jy = y + (rnd() - 0.5) * 0.35;
      const r = 0.3 + rnd() * 0.16;
      const bush = P.blob(jx, jy, r, r, 9, 0.18, rnd);
      dropShadow(ctx, bush, 0.12, 0.35);
      fillPath(ctx, bush, shade(SHRUB, (rnd() - 0.5) * 0.25), 0.035);
      ctx.fillStyle = "rgba(220,230,160,0.22)";
      ctx.fill(P.circle(jx - r * 0.3, jy - r * 0.3, r * 0.35));
    }
  }
  ctx.restore();
}

function crater(ctx: CanvasRenderingContext2D, t: Terrain): void {
  const c = centroid(t.poly);
  const R = Math.max(...t.poly.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
  const rnd = rng(hash(t.id));
  // a dark ring: raised lighter lip, scorched bowl, dark pit
  const lip = P.blob(c.x, c.y, R, R * 0.96, 12, 0.05, rnd);
  fillPath(ctx, lip, 0x9a7f5c, 0.05);
  bevel(ctx, lip, 0.14, 0.3, 0.3);
  const bowl = P.blob(c.x, c.y, R * 0.74, R * 0.72, 11, 0.06, rnd);
  ctx.save();
  const g = ctx.createRadialGradient(c.x + R * 0.1, c.y + R * 0.1, R * 0.1, c.x, c.y, R * 0.75);
  g.addColorStop(0, "#2a1e16");
  g.addColorStop(0.7, "#4a3828");
  g.addColorStop(1, "#5e4a36");
  ctx.fillStyle = g;
  ctx.fill(bowl);
  ctx.restore();
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = EDGE;
  ctx.stroke(bowl);
  bevel(ctx, bowl, -0.12, 0.25, 0.35);
  const n = /rubble/.test(t.id) ? 8 : 4;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = R * (0.8 + rnd() * 0.25);
    const x = c.x + Math.cos(a) * d;
    const y = c.y + Math.sin(a) * d;
    const s = 0.14 + rnd() * 0.18;
    const rock = P.poly(P.wobble([x - s, y, x - s * 0.3, y - s * 0.8, x + s, y - s * 0.3, x + s * 0.6, y + s * 0.6], s * 0.2, rnd));
    dropShadow(ctx, rock, 0.08, 0.4);
    fillPath(ctx, rock, 0x948d80, 0.04);
  }
}

function pond(ctx: CanvasRenderingContext2D, t: Terrain): void {
  const path = polyPath(t.poly);
  const c = centroid(t.poly);
  const rnd = rng(hash(t.id));
  fillPath(ctx, polyPath(inset(t.poly, -0.25)), 0x7a6a4c, 0.05);
  fillPath(ctx, path, WATER, 0.05);
  bevel(ctx, path, -0.2, 0.0, 0.3);
  for (let i = 0; i < 5; i++) {
    const x = c.x + (rnd() - 0.5) * 2.2;
    const y = c.y + (rnd() - 0.5) * 2.2;
    fillPath(ctx, P.blob(x, y, 0.3 + rnd() * 0.25, 0.18 + rnd() * 0.1, 7, 0.2, rnd), 0x8aa45a, 0.03, 0.85);
  }
  stroke(pen(ctx), P.ellipse(c.x - 0.5, c.y - 0.4, 0.6, 0.15, -0.2), 0.05, "rgba(255,255,255,0.45)");
}

function tarp(ctx: CanvasRenderingContext2D, t: Terrain): void {
  const path = polyPath(t.poly);
  dropShadow(ctx, path, 0.25, 0.4);
  fillPath(ctx, path, 0x6c7450, 0.05);
  const b = bbox(t.poly);
  stroke(pen(ctx), P.line([b.x0, b.y0, b.x1, b.y1]), 0.04, "rgba(40,30,22,0.45)");
  stroke(pen(ctx), P.line([b.x1, b.y0, b.x0, b.y1]), 0.04, "rgba(40,30,22,0.45)");
  bevel(ctx, path, 0.08);
}

export function paintFeature(ctx: CanvasRenderingContext2D, t: Terrain, low = false): void {
  if (t.kind === "wall") wall(ctx, t);
  else if (t.kind === "barricade") barricade(ctx, t);
  else if (t.kind === "cover") {
    if (/^(crater|rubble)/.test(t.id)) crater(ctx, t);
    else if (/^(pond|pool|puddle)/.test(t.id)) pond(ctx, t);
    else if (/^tarp/.test(t.id)) tarp(ctx, t);
    else scrub(ctx, t, low);
  } else if (t.kind === "building") building(ctx, t);
  else if (t.kind === "platform") platform(ctx, t);
}

export const ACCESS_WIDTH = { ramp: 1.1, ladder: 0.45 } as const;

export function paintAccess(ctx: CanvasRenderingContext2D, a: Pick<AccessPoint, "kind" | "low" | "high">, alpha = 1): void {
  const dx = a.high.x - a.low.x;
  const dy = a.high.y - a.low.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const hi = { x: a.high.x + ux * 0.35, y: a.high.y + uy * 0.35 };
  const at = (t: number) => ({ x: a.low.x + (hi.x - a.low.x) * t, y: a.low.y + (hi.y - a.low.y) * t });
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (a.kind === "ramp") {
    const w = ACCESS_WIDTH.ramp;
    const quad = (t0: number, t1: number): Path2D => {
      const p0 = at(t0);
      const p1 = at(t1);
      return P.poly([p0.x + nx * w, p0.y + ny * w, p1.x + nx * w, p1.y + ny * w, p1.x - nx * w, p1.y - ny * w, p0.x - nx * w, p0.y - ny * w]);
    };
    const all = quad(0, 1);
    dropShadow(ctx, all, 0.25, 0.4);
    // gets lighter as it climbs
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      ctx.fillStyle = css(shade(0x8f7a5c, -0.18 + (i / (steps - 1)) * 0.36));
      ctx.fill(quad(i / steps, (i + 1) / steps + 0.002));
    }
    for (let i = 1; i < steps; i++) {
      const p = at(i / steps);
      stroke(pen(ctx), P.line([p.x + nx * w, p.y + ny * w, p.x - nx * w, p.y - ny * w]), 0.04, "rgba(40,30,22,0.55)");
    }
    for (const sd of [-1, 1]) {
      const p0 = at(0);
      const p1 = at(1);
      stroke(pen(ctx), P.line([p0.x + nx * w * sd, p0.y + ny * w * sd, p1.x + nx * w * sd, p1.y + ny * w * sd]), 0.14, css(0x6d6458));
    }
    ctx.lineWidth = 0.08;
    ctx.strokeStyle = EDGE;
    ctx.stroke(all);
    // up arrows
    for (const t of [0.3, 0.62]) {
      const m = at(t);
      const arrow = P.line([m.x - ux * 0.22 + nx * 0.42, m.y - uy * 0.22 + ny * 0.42, m.x + ux * 0.2, m.y + uy * 0.2, m.x - ux * 0.22 - nx * 0.42, m.y - uy * 0.22 - ny * 0.42]);
      stroke(pen(ctx), arrow, 0.16, EDGE);
      stroke(pen(ctx), arrow, 0.08, "#d9b23a");
    }
  } else {
    const w = ACCESS_WIDTH.ladder;
    for (const sd of [-1, 1]) stroke(pen(ctx), P.line([a.low.x + nx * w * sd + 0.06, a.low.y + ny * w * sd + 0.1, hi.x + nx * w * sd + 0.06, hi.y + ny * w * sd + 0.1]), 0.14, "rgba(30,22,16,0.35)");
    for (let t = 0.08; t < 1; t += 0.15) {
      const p = at(t);
      stroke(pen(ctx), P.line([p.x + nx * w, p.y + ny * w, p.x - nx * w, p.y - ny * w]), 0.11, EDGE);
      stroke(pen(ctx), P.line([p.x + nx * w, p.y + ny * w, p.x - nx * w, p.y - ny * w]), 0.06, css(0xb8b2a6));
    }
    for (const sd of [-1, 1]) {
      const rail = P.line([a.low.x + nx * w * sd, a.low.y + ny * w * sd, hi.x + nx * w * sd, hi.y + ny * w * sd]);
      stroke(pen(ctx), rail, 0.17, EDGE);
      stroke(pen(ctx), rail, 0.09, css(0xd9b23a));
    }
  }
  ctx.restore();
}

/** All terrain in draw order: flat cover, ground features, platforms, ramps, ladders, raised bits, buildings. */
export function paintTerrain(ctx: CanvasRenderingContext2D, b: Pick<BoardLike, "terrain" | "access">, opts: PaintOpts = {}): void {
  const byY = (x: Terrain, y: Terrain) => centroid(x.poly).y - centroid(y.poly).y;
  const ground = b.terrain.filter((t) => t.level === 0 && t.kind !== "platform" && t.kind !== "building");
  const platforms = b.terrain.filter((t) => t.kind === "platform").sort(byY);
  const raised = b.terrain.filter((t) => t.level === 1 && t.kind !== "platform" && t.kind !== "building");
  const buildings = b.terrain.filter((t) => t.kind === "building").sort(byY);
  for (const t of ground.filter((x) => x.kind === "cover")) paintFeature(ctx, t, opts.low);
  for (const t of ground.filter((x) => x.kind !== "cover").sort(byY)) paintFeature(ctx, t, opts.low);
  for (const t of platforms) platform(ctx, t);
  for (const a of b.access.filter((x) => x.kind === "ramp")) paintAccess(ctx, a);
  for (const a of b.access.filter((x) => x.kind === "ladder")) paintAccess(ctx, a);
  for (const t of raised) paintFeature(ctx, t, opts.low);
  for (const t of buildings) building(ctx, t);
}

/** Ground plus terrain. */
export function paintBoard(ctx: CanvasRenderingContext2D, b: BoardLike, opts: PaintOpts = {}): void {
  paintGround(ctx, b, opts);
  paintTerrain(ctx, b, opts);
}

/** Representative colour for a terrain kind (UI swatches, ghosts). */
export function terrainSwatch(kind: Terrain["kind"]): string {
  switch (kind) {
    case "platform":
      return css(FLOOR);
    case "building":
      return css(ROOF[0]);
    case "wall":
      return css(CONCRETE);
    case "barricade":
      return css(PLANK);
    case "cover":
      return css(SHRUB);
  }
}

export { INK_CSS, DIRT };
