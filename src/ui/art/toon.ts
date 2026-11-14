// Cartoon rendering toolkit for the miniatures. Parts are authored as SVG path strings (bezier
// curves) in centi-inches, then painted with 2–3 cel tones from a top-left light, optional specular
// highlights, and thin interior ink lines. The heavy outer silhouette line is added afterwards by
// dilating the finished figure's alpha (see `outline`), so the line weight is thick outside and
// thin inside, like a hand-inked cartoon.

import { makeCanvas } from "./ink";
import { css, INK, mix, rgba, shade } from "./palette";

export interface Mat {
  base: number;
  shade: number;
  deep: number;
  hi: number;
  /** Specular strength 0..1 (metal, glass, crystal, helmets). */
  gloss: number;
}

/** A material from a base colour: shadow tones lean cool/purple, highlights warm. */
export function mat(c: number, gloss = 0, shadowK = 0.3): Mat {
  return {
    base: c,
    shade: mix(shade(c, -shadowK), 0x32204a, 0.14),
    deep: mix(shade(c, -shadowK - 0.25), 0x24163a, 0.2),
    hi: mix(shade(c, 0.3), 0xfff2d6, 0.12),
    gloss,
  };
}

export type Shape = string | Path2D;
const toPath = (d: Shape): Path2D => (typeof d === "string" ? new Path2D(d) : d);

/** Everything except `path` moved by (dx, dy): clip with "evenodd" to get a crescent. */
function minus(path: Path2D, dx: number, dy: number): Path2D {
  const q = new Path2D();
  q.rect(-1e5, -1e5, 2e5, 2e5);
  q.addPath(path, { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });
  return q;
}

export interface FillOpts {
  /** Shadow depth in path units (default 7). 0 = flat. */
  s?: number;
  /** Interior line width (default: the toon's). 0 = none. */
  line?: number;
  /** Highlight strength 0..1 (default 0.55). */
  hi?: number;
  /** Specular spot: [x, y, rx, ry, rot]. */
  spec?: [number, number, number, number, number?];
  alpha?: number;
}

export interface Toon {
  ctx: CanvasRenderingContext2D;
  /** Interior line width, in path units. */
  line: number;
}

const INK_LINE = rgba(INK, 0.92);

/** Paint one cel-shaded part. */
export function fill(t: Toon, d: Shape, m: Mat, o: FillOpts = {}): Path2D {
  const { ctx } = t;
  const path = toPath(d);
  const s = o.s ?? 7;
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = css(m.base);
  ctx.fill(path);
  if (s > 0) {
    // mid shadow: lower-right crescent
    ctx.save();
    ctx.clip(minus(path, -s * 0.7, -s), "evenodd");
    ctx.fillStyle = css(m.shade);
    ctx.fill(path);
    // core shadow hugging the far edge
    ctx.save();
    ctx.clip(minus(path, -s * 0.22, -s * 0.34), "evenodd");
    ctx.fillStyle = css(m.deep);
    ctx.fill(path);
    ctx.restore();
    ctx.restore();
    // highlight: upper-left crescent
    const h = o.hi ?? 0.55;
    if (h > 0) {
      ctx.save();
      ctx.clip(minus(path, s * 0.32, s * 0.45), "evenodd");
      ctx.globalAlpha *= h;
      ctx.fillStyle = css(m.hi);
      ctx.fill(path);
      ctx.restore();
    }
  }
  if (o.spec || m.gloss > 0) {
    const [x, y, rx, ry, rot] = o.spec ?? [0, 0, 0, 0, 0];
    if (o.spec) {
      ctx.fillStyle = `rgba(255,255,255,${0.55 + m.gloss * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rot ?? -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + rx * 1.3, y + ry * 1.4, rx * 0.28, rx * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  const line = o.line ?? t.line;
  if (line > 0) {
    ctx.lineWidth = line;
    ctx.strokeStyle = INK_LINE;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke(path);
  }
  ctx.restore();
  return path;
}

/** A thin interior ink line (creases, seams, details). */
export function ink(t: Toon, d: Shape, w = t.line, color = INK_LINE, alpha = 1): void {
  const { ctx } = t;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(toPath(d));
  ctx.restore();
}

/** Flat colour with no shading or line. */
export function flat(t: Toon, d: Shape, color: number | string, alpha = 1): void {
  const { ctx } = t;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = typeof color === "number" ? css(color) : color;
  ctx.fill(toPath(d));
  ctx.restore();
}

/** Additive glow. */
export function glowAt(t: Toon, x: number, y: number, r: number, color: number, a = 0.7): void {
  const { ctx } = t;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.4, rgba(color, a * 0.4));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** Soft dark contact shadow. */
export function contact(t: Toon, x: number, y: number, rx: number, ry: number, a = 0.45): void {
  const { ctx } = t;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgba(INK, a));
  g.addColorStop(0.55, rgba(INK, a * 0.55));
  g.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

// ---------- shape builders (path units) ----------

const f = (n: number): string => (Math.round(n * 100) / 100).toString();

export function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${f(cx - rx)} ${f(cy)} A ${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)} A ${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)} Z`;
}

export function rrect(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2);
  return `M ${f(x + r)} ${f(y)} H ${f(x + w - r)} Q ${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)} V ${f(y + h - r)} Q ${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} H ${f(x + r)} Q ${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)} V ${f(y + r)} Q ${f(x)} ${f(y)} ${f(x + r)} ${f(y)} Z`;
}

/** A smooth tapered tube (limb, hose, tail) through points with per-point half-widths. */
export function tube(pts: [number, number][], widths: number[]): string {
  const n = pts.length;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L;
    const ny = dx / L;
    const w = widths[i] ?? widths[widths.length - 1]!;
    left.push([pts[i]![0] + nx * w, pts[i]![1] + ny * w]);
    right.push([pts[i]![0] - nx * w, pts[i]![1] - ny * w]);
  }
  const smooth = (side: [number, number][]): string => {
    let d = "";
    for (let i = 1; i < side.length - 1; i++) {
      const mx = (side[i]![0] + side[i + 1]![0]) / 2;
      const my = (side[i]![1] + side[i + 1]![1]) / 2;
      d += ` Q ${f(side[i]![0])} ${f(side[i]![1])} ${f(i === side.length - 2 ? side[i + 1]![0] : mx)} ${f(i === side.length - 2 ? side[i + 1]![1] : my)}`;
    }
    if (side.length === 2) d += ` L ${f(side[1]![0])} ${f(side[1]![1])}`;
    return d;
  };
  const e0 = pts[0]!;
  const e1 = pts[n - 1]!;
  const w0 = widths[0]!;
  const w1 = widths[n - 1] ?? w0;
  const rr = right.slice().reverse();
  return (
    `M ${f(left[0]![0])} ${f(left[0]![1])}` +
    smooth(left) +
    ` A ${f(w1)} ${f(w1)} 0 0 0 ${f(rr[0]![0])} ${f(rr[0]![1])}` +
    smooth(rr) +
    ` A ${f(w0)} ${f(w0)} 0 0 0 ${f(left[0]![0])} ${f(left[0]![1])} Z` +
    (e0 && e1 ? "" : "")
  );
}

/** A row of pointed teeth along a quadratic edge from a to b (bulging through c), pointing to `dir` (+1 down / -1 up). */
export function teethRow(ax: number, ay: number, cx: number, cy: number, bx: number, by: number, n: number, len: number, dir: 1 | -1, jitter = 0.25): string {
  let d = "";
  const at = (t: number): [number, number] => [(1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx, (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by];
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const [x0, y0] = at(t0);
    const [x1, y1] = at(t1);
    const [xm, ym] = at((t0 + t1) / 2);
    const l = len * (1 - jitter + ((i * 7919) % 13) / 13 * jitter * 2) * (0.7 + 0.3 * Math.sin(Math.PI * ((t0 + t1) / 2)));
    const lean = (x1 - x0) * 0.15;
    d += `M ${f(x0)} ${f(y0)} Q ${f(xm - lean)} ${f(ym + dir * l * 0.35)} ${f(xm + lean)} ${f(ym + dir * l)} Q ${f(xm + lean * 0.5)} ${f(ym + dir * l * 0.3)} ${f(x1)} ${f(y1)} Z `;
  }
  return d;
}

// ---------- the heavy outer silhouette ----------

/**
 * Draw `paint` (which draws a figure into a context set up for it) with a heavy ink silhouette
 * around everything it painted: thicker towards the lower right, like a weighted brush line.
 * `w` is the outline width in device pixels.
 */
export function outlined(target: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lineW: number, paint: (ctx: CanvasRenderingContext2D) => void): void {
  const art = makeCanvas(w, h);
  const actx = art.getContext("2d")!;
  paint(actx);
  const mask = makeCanvas(w, h);
  const mctx = mask.getContext("2d", { willReadFrequently: true })!;
  mctx.drawImage(art, 0, 0);
  // Only solid paint gets a silhouette line: soft glows and translucent wings stay clean.
  const img = mctx.getImageData(0, 0, w, h);
  const px = img.data;
  const ir = (INK >> 16) & 255;
  const ig = (INK >> 8) & 255;
  const ib = INK & 255;
  for (let i = 0; i < px.length; i += 4) {
    const a = Math.max(0, Math.min(255, (px[i + 3]! - 120) * 2.6));
    px[i] = ir;
    px[i + 1] = ig;
    px[i + 2] = ib;
    px[i + 3] = a;
  }
  mctx.putImageData(img, 0, 0);
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    // heavier on the shadow side (down-right)
    const k = 1 + 0.45 * Math.max(0, Math.cos(a - Math.PI / 4));
    target.drawImage(mask, x + Math.cos(a) * lineW * k, y + Math.sin(a) * lineW * k);
  }
  target.drawImage(mask, x, y);
  target.drawImage(art, x, y);
}
