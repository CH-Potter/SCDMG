// Canvas 2D "hand-inked comic" toolkit: cel-shaded parts with heavy uneven outlines, halftone and
// cross-hatching in the shadows, rim light, glow. Shared by the figure painter, the board painter,
// the map builder, the menu previews and the forge. Everything draws in board units (inches);
// pattern textures stay in device pixels so line density reads the same at any zoom.

import { css, INK, rgba, shade, shadowOf } from "./palette";

export const INK_CSS = css(INK);

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap string hash (FNV-1a). */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// ---------- pattern tiles (device pixels), cached ----------

const tiles = new Map<string, HTMLCanvasElement>();

function tile(key: string, size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  let t = tiles.get(key);
  if (!t) {
    t = makeCanvas(size, size);
    draw(t.getContext("2d")!, size);
    tiles.set(key, t);
  }
  return t;
}

export type HatchKind = "lines" | "back" | "cross" | "dots" | "vlines";

function hatchTile(kind: HatchKind, spacing: number, color: string, width: number): HTMLCanvasElement {
  const s = Math.max(3, Math.round(spacing));
  return tile(`${kind}|${s}|${color}|${width}`, s, (c, n) => {
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = width;
    c.lineCap = "square";
    const diag = (flip: boolean) => {
      c.beginPath();
      for (const o of [-n, 0, n]) {
        if (flip) {
          c.moveTo(o, 0);
          c.lineTo(o + n, n);
        } else {
          c.moveTo(o, n);
          c.lineTo(o + n, 0);
        }
      }
      c.stroke();
    };
    if (kind === "lines") diag(false);
    else if (kind === "back") diag(true);
    else if (kind === "cross") {
      diag(false);
      diag(true);
    } else if (kind === "vlines") {
      c.fillRect(Math.floor(n / 2), 0, Math.max(1, width), n);
    } else {
      const r = Math.max(0.6, width);
      for (const [x, y] of [[0, 0], [n, 0], [0, n], [n, n], [n / 2, n / 2]] as const) {
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    }
  });
}

/** Device pixels per unit for the context's current transform. */
export const pxPerUnit = (ctx: CanvasRenderingContext2D): number => {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
};

/** A pattern whose tile stays in device pixels under the current transform. */
export function hatchPattern(ctx: CanvasRenderingContext2D, kind: HatchKind, spacing: number, color: string, width = 1): CanvasPattern | null {
  const p = ctx.createPattern(hatchTile(kind, spacing, color, width), "repeat");
  if (!p) return null;
  const k = pxPerUnit(ctx);
  p.setTransform(new DOMMatrix([1 / k, 0, 0, 1 / k, 0, 0]));
  return p;
}

/** Fill a path with hatching / halftone. */
export function hatchFill(ctx: CanvasRenderingContext2D, path: Path2D, kind: HatchKind, spacing: number, color: string, width = 1, alpha = 1): void {
  const p = hatchPattern(ctx, kind, spacing, color, width);
  if (!p) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = p;
  ctx.fill(path);
  ctx.restore();
}

// ---------- paths (units) ----------

export const P = {
  ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0): Path2D {
    const p = new Path2D();
    p.ellipse(cx, cy, Math.max(0.001, rx), Math.max(0.001, ry), rot, 0, Math.PI * 2);
    return p;
  },
  circle(cx: number, cy: number, r: number): Path2D {
    return P.ellipse(cx, cy, r, r);
  },
  rrect(x: number, y: number, w: number, h: number, r: number): Path2D {
    const p = new Path2D();
    p.roundRect(x, y, w, h, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    return p;
  },
  /** Polygon from flat [x0, y0, x1, y1, ...]. */
  poly(pts: number[]): Path2D {
    const p = new Path2D();
    for (let i = 0; i < pts.length; i += 2) {
      if (i) p.lineTo(pts[i]!, pts[i + 1]!);
      else p.moveTo(pts[i]!, pts[i + 1]!);
    }
    p.closePath();
    return p;
  },
  /** Smooth closed curve through flat points (midpoint quadratic smoothing). */
  smooth(pts: number[]): Path2D {
    const p = new Path2D();
    const n = pts.length / 2;
    const X = (i: number) => pts[((i + n) % n) * 2]!;
    const Y = (i: number) => pts[((i + n) % n) * 2 + 1]!;
    p.moveTo((X(-1) + X(0)) / 2, (Y(-1) + Y(0)) / 2);
    for (let i = 0; i < n; i++) p.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
    p.closePath();
    return p;
  },
  /** Lumpy organic ellipse. */
  blob(cx: number, cy: number, rx: number, ry: number, n: number, jitter: number, rnd: () => number, rot = 0): Path2D {
    const pts: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + (rnd() - 0.5) * 2 * jitter;
      const x = Math.cos(a) * rx * k;
      const y = Math.sin(a) * ry * k;
      pts.push(cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot));
    }
    return P.smooth(pts);
  },
  /** Open polyline (for strokes). */
  line(pts: number[]): Path2D {
    const p = new Path2D();
    for (let i = 0; i < pts.length; i += 2) {
      if (i) p.lineTo(pts[i]!, pts[i + 1]!);
      else p.moveTo(pts[i]!, pts[i + 1]!);
    }
    return p;
  },
  /** Jitter the vertices of a flat point list a little, for a hand-cut look. */
  wobble(pts: number[], amt: number, rnd: () => number): number[] {
    return pts.map((v) => v + (rnd() - 0.5) * 2 * amt);
  },
};

/** Region = everything except `path` shifted by (dx, dy); clip with "evenodd". */
function minus(path: Path2D, dx: number, dy: number): Path2D {
  const q = new Path2D();
  q.rect(-1e4, -1e4, 2e4, 2e4);
  q.addPath(path, { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });
  return q;
}

// ---------- the pen ----------

export interface Pen {
  ctx: CanvasRenderingContext2D;
  /** Outline width in units. */
  ink: number;
  /** Hatch spacing in device pixels. */
  hatch: number;
}

export interface PartOpts {
  /** Outline width (units); 0 = none. Defaults to the pen's. */
  ink?: number;
  /** Shadow band offset (units). 0 = flat. */
  shadow?: number;
  /** Shadow colour override. */
  dark?: number;
  /** Texture in the shadow band. */
  tone?: "dots" | "lines" | "none";
  /** Cross-hatch the deepest shadow. Default true. */
  deep?: boolean;
  /** Highlight strength (0..1) on the lit (upper-left) side. */
  hi?: number;
  /** Rim light along the shadow-side edge. */
  rim?: boolean | number;
  /** Heavier back-line on the shadow side. Default true. */
  back?: boolean;
  alpha?: number;
}

/**
 * Paint one cel-shaded part: heavy back-line, flat base, shadow crescent away from the
 * upper-left light (with halftone), cross-hatched core shadow, highlight, rim light, ink outline.
 */
export function part(pen: Pen, path: Path2D, color: number, o: PartOpts = {}): void {
  const { ctx } = pen;
  const ink = o.ink ?? pen.ink;
  const s = o.shadow ?? pen.ink * 2.6;
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (ink > 0 && o.back !== false) {
    ctx.save();
    ctx.translate(ink * 0.45, ink * 0.6);
    ctx.lineWidth = ink * 1.7;
    ctx.strokeStyle = INK_CSS;
    ctx.stroke(path);
    ctx.restore();
  }
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = css(color);
  ctx.fill(path);
  if (s > 0) {
    const dark = o.dark ?? shadowOf(color);
    ctx.save();
    ctx.clip(minus(path, -s, -s * 0.85), "evenodd");
    ctx.fillStyle = css(dark);
    ctx.fill(path);
    const tone = o.tone ?? "dots";
    if (tone !== "none") hatchFill(ctx, path, tone === "dots" ? "dots" : "lines", pen.hatch, rgba(shade(dark, -0.55), 0.55), tone === "dots" ? 0.75 : 0.9);
    if (o.deep !== false) {
      ctx.save();
      ctx.clip(minus(path, -s * 2.3, -s * 2), "evenodd");
      hatchFill(ctx, path, "cross", pen.hatch, rgba(shade(dark, -0.6), 0.7), 0.9);
      ctx.restore();
    }
    ctx.restore();
  }
  if (o.hi) {
    ctx.save();
    ctx.clip(minus(path, s * 0.75, s * 0.9), "evenodd");
    ctx.fillStyle = rgba(shade(color, 0.5), o.hi);
    ctx.fill(path);
    ctx.restore();
  }
  if (o.rim) {
    const w = (typeof o.rim === "number" ? o.rim : 1) * Math.max(ink, pen.ink) * 1.3;
    ctx.save();
    ctx.clip(minus(path, -w, -w), "evenodd");
    ctx.fillStyle = rgba(shade(color, 0.6), 0.85);
    ctx.fill(path);
    ctx.restore();
  }
  ctx.restore();
  if (ink > 0) {
    ctx.lineWidth = ink;
    ctx.strokeStyle = INK_CSS;
    ctx.stroke(path);
  }
  ctx.restore();
}

/** Plain ink stroke of a path. */
export function stroke(pen: Pen, path: Path2D, width = pen.ink, color = INK_CSS, alpha = 1): void {
  const { ctx } = pen;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(path);
  ctx.restore();
}

/** Flat fill (no shading), optionally inked. */
export function flat(pen: Pen, path: Path2D, color: number | string, ink = 0, alpha = 1): void {
  const { ctx } = pen;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = typeof color === "number" ? css(color) : color;
  ctx.fill(path);
  ctx.restore();
  if (ink > 0) stroke(pen, path, ink);
}

/** Additive glow halo. */
export function glow(pen: Pen, x: number, y: number, r: number, color: number, alpha = 0.8): void {
  const { ctx } = pen;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.45, rgba(color, alpha * 0.35));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** Soft dark spot (ambient occlusion / drop shadow). */
export function soft(pen: Pen, x: number, y: number, rx: number, ry: number, alpha = 0.45): void {
  const { ctx } = pen;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgba(INK, alpha));
  g.addColorStop(0.6, rgba(INK, alpha * 0.6));
  g.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

/** A small rivet: dark dot with a glint. */
export function rivet(pen: Pen, x: number, y: number, r: number, color = 0xc9c2b4): void {
  part(pen, P.circle(x, y, r), color, { ink: pen.ink * 0.45, shadow: r * 0.5, deep: false, tone: "none", back: false });
}

/** Comic "ZAP" sparkle glint. */
export function glint(pen: Pen, x: number, y: number, r: number, color = 0xffffff): void {
  const { ctx } = pen;
  ctx.save();
  ctx.fillStyle = css(color);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? r * 0.25 : r;
    if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Jagged starburst points (flat list), for comic bursts and muzzle flashes. */
export function burstPts(cx: number, cy: number, r0: number, r1: number, n: number, rnd: () => number, rot = 0): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r0 * (0.85 + rnd() * 0.3) : r1 * (0.75 + rnd() * 0.5);
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}

export { shade };
