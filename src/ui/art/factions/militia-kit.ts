// Dustline Militia art kit: the faction palette, material helpers (tin, canvas, sandbags, rivets,
// patches) and thin wrappers over the shared toon toolkit. The wrappers draw exactly like toon's
// `fill`/`ink`/`flat`/`glowAt`/`contact`, and can optionally also record what they draw as SVG
// (used only to export the concept board in docs/art; off in the game).

import { css, mix, rgba, shade } from "../palette";
import { contact as tContact, ellipse, type FillOpts, fill as tFill, flat as tFlat, glowAt as tGlow, ink as tInk, type Mat, mat, rrect, type Toon } from "../toon";

export { ellipse, mat, rrect };
export type { Mat, Toon };

/** Interior line width (matches figures.ts). */
export const LINE = 1.5;

/** The Militia palette: denim, canvas, leather and brass around the faction orange (passed in as `s.color`). */
export const K = {
  ink: 0x1c1512,
  skin: 0xd99e72,
  skinTan: 0xb77a4e,
  skinPale: 0xeab894,
  denim: 0x4f6d8c,
  denimDark: 0x3d5571,
  canvas: 0xcdb683,
  canvasDark: 0xa98f5f,
  cream: 0xeee3c4,
  hay: 0xe4c25c,
  hayDark: 0xb48d34,
  leather: 0x7a4f2e,
  leatherDark: 0x4e3220,
  brass: 0xd2a347,
  tin: 0xa7afb1,
  steel: 0x9aa3a8,
  gun: 0x4c5158,
  rust: 0xa4532e,
  wood: 0x9a6236,
  woodLight: 0xc28b55,
  red: 0xb8432f,
  rubber: 0x2f2b29,
  lens: 0x7fd6cf,
  bag: 0xbfa16c,
  plum: 0x8a5873,
  hair: 0xe9e4dc,
  dust: 0x9a7d57,
  potato: 0xb88a52,
  white: 0xf4efe2,
};

// ---------- optional SVG recording (concept-board export only) ----------

interface Rec {
  out: string[];
  base: DOMMatrix;
  id: number;
  prefix: string;
}
let REC: Rec | null = null;

/** Start recording everything the kit draws on `ctx` as SVG (relative to ctx's current transform). */
export function recordStart(ctx: CanvasRenderingContext2D, prefix: string): void {
  REC = { out: [], base: ctx.getTransform().inverse(), id: 0, prefix };
}
/** Stop recording and return the SVG elements. */
export function recordStop(): string {
  const s = REC ? REC.out.join("") : "";
  REC = null;
  return s;
}
const r2 = (n: number) => Math.round(n * 1000) / 1000;
function recMatrix(t: Toon): string {
  const m = REC!.base.multiply(t.ctx.getTransform());
  return `matrix(${r2(m.a)} ${r2(m.b)} ${r2(m.c)} ${r2(m.d)} ${r2(m.e)} ${r2(m.f)})`;
}
const uid = () => `${REC!.prefix}${REC!.id++}`;
const col = (c: number | string) => (typeof c === "number" ? css(c) : c);
const alphaOf = (t: Toon) => t.ctx.globalAlpha;

// ---------- drawing wrappers ----------

/** Cel-shaded part (toon `fill`). */
export function fill(t: Toon, d: string, m: Mat, o: FillOpts = {}): void {
  tFill(t, d, m, o);
  if (!REC) return;
  const s = o.s ?? 7;
  const line = o.line ?? t.line;
  const h = o.hi ?? 0.55;
  const a = alphaOf(t) * (o.alpha ?? 1);
  const c = uid();
  let g = `<g transform="${recMatrix(t)}"${a < 1 ? ` opacity="${r2(a)}"` : ""}><clipPath id="${c}"><path d="${d}"/></clipPath><g clip-path="url(#${c})">`;
  if (s > 0) {
    g += `<path d="${d}" fill="${css(m.deep)}"/>`;
    g += `<path d="${d}" fill="${css(m.shade)}" transform="translate(${r2(-s * 0.22)} ${r2(-s * 0.34)})"/>`;
    g += `<path d="${d}" fill="${css(m.base)}" transform="translate(${r2(-s * 0.7)} ${r2(-s)})"/>`;
    if (h > 0) {
      const k = uid();
      g += `<mask id="${k}" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="4000" height="4000"><rect x="-2000" y="-2000" width="4000" height="4000" fill="#fff"/><path d="${d}" fill="#000" transform="translate(${r2(s * 0.32)} ${r2(s * 0.45)})"/></mask>`;
      g += `<path d="${d}" fill="${css(m.hi)}" opacity="${r2(h)}" mask="url(#${k})"/>`;
    }
  } else g += `<path d="${d}" fill="${css(m.base)}"/>`;
  if (o.spec) {
    const [x, y, rx, ry, rot] = o.spec;
    const op = r2(0.55 + m.gloss * 0.4);
    g += `<ellipse cx="${r2(x)}" cy="${r2(y)}" rx="${r2(rx)}" ry="${r2(ry)}" transform="rotate(${r2(((rot ?? -0.5) * 180) / Math.PI)} ${r2(x)} ${r2(y)})" fill="#fff" opacity="${op}"/>`;
    g += `<circle cx="${r2(x + rx * 1.3)}" cy="${r2(y + ry * 1.4)}" r="${r2(rx * 0.28)}" fill="#fff" opacity="${op}"/>`;
  }
  g += `</g>`;
  if (line > 0) g += `<path d="${d}" fill="none" stroke="rgba(28,21,18,0.92)" stroke-width="${r2(line)}" stroke-linejoin="round" stroke-linecap="round"/>`;
  REC.out.push(g + `</g>`);
}

/** Thin interior line (toon `ink`). */
export function ink(t: Toon, d: string, w = t.line, color = "rgba(28,21,18,0.92)", alpha = 1): void {
  tInk(t, d, w, color, alpha);
  if (!REC) return;
  const a = alphaOf(t) * alpha;
  const dash = t.ctx.getLineDash();
  REC.out.push(`<path transform="${recMatrix(t)}" d="${d}" fill="none" stroke="${color}" stroke-width="${r2(w)}" stroke-linecap="round" stroke-linejoin="round"${dash.length ? ` stroke-dasharray="${dash.join(" ")}"` : ""}${a < 1 ? ` opacity="${r2(a)}"` : ""}/>`);
}

/** Flat colour (toon `flat`). */
export function flat(t: Toon, d: string, color: number | string, alpha = 1): void {
  tFlat(t, d, color, alpha);
  if (!REC) return;
  const a = alphaOf(t) * alpha;
  REC.out.push(`<path transform="${recMatrix(t)}" d="${d}" fill="${col(color)}"${a < 1 ? ` opacity="${r2(a)}"` : ""}/>`);
}

/** Additive glow (toon `glowAt`). */
export function glowAt(t: Toon, x: number, y: number, r: number, color: number, a = 0.7): void {
  tGlow(t, x, y, r, color, a);
  if (!REC) return;
  const g = uid();
  REC.out.push(
    `<g transform="${recMatrix(t)}" style="mix-blend-mode:screen"><radialGradient id="${g}" cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${rgba(color, a)}"/><stop offset="0.4" stop-color="${rgba(color, a * 0.4)}"/><stop offset="1" stop-color="${rgba(color, 0)}"/></radialGradient><circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="url(#${g})"/></g>`,
  );
}

/** Soft contact shadow (toon `contact`). */
export function contact(t: Toon, x: number, y: number, rx: number, ry: number, a = 0.45): void {
  tContact(t, x, y, rx, ry, a);
  if (!REC) return;
  const g = uid();
  REC.out.push(
    `<g transform="${recMatrix(t)}"><radialGradient id="${g}"><stop offset="0" stop-color="${rgba(K.ink, a)}"/><stop offset="0.55" stop-color="${rgba(K.ink, a * 0.55)}"/><stop offset="1" stop-color="${rgba(K.ink, 0)}"/></radialGradient><ellipse cx="${r2(x)}" cy="${r2(y)}" rx="${r2(rx)}" ry="${r2(ry)}" fill="url(#${g})"/></g>`,
  );
}

/** Clip everything `draw` paints to the shape `d`. */
export function clipTo(t: Toon, d: string, draw: () => void): void {
  t.ctx.save();
  t.ctx.clip(new Path2D(d));
  let start = 0;
  let c = "";
  if (REC) {
    c = uid();
    REC.out.push(`<clipPath id="${c}"><path transform="${recMatrix(t)}" d="${d}"/></clipPath>`);
    start = REC.out.length;
  }
  draw();
  if (REC) {
    const inner = REC.out.splice(start);
    REC.out.push(`<g clip-path="url(#${c})">${inner.join("")}</g>`);
  }
  t.ctx.restore();
}

/** Run `draw` with a transform (translate, then rotate, then uniform scale). */
export function at(t: Toon, x: number, y: number, rot: number, draw: () => void, k = 1): void {
  t.ctx.save();
  t.ctx.translate(x, y);
  if (rot) t.ctx.rotate(rot);
  if (k !== 1) t.ctx.scale(k, k);
  draw();
  t.ctx.restore();
}

/** Rotate a local point (x, y) by `a` and offset it by (ox, oy): where a muzzle ends up after `at`. */
export const place = (ox: number, oy: number, a: number, x: number, y: number): [number, number] => [ox + x * Math.cos(a) - y * Math.sin(a), oy + x * Math.sin(a) + y * Math.cos(a)];

// ---------- shape helpers ----------

export type Pt = [number, number];
export const poly = (q: Pt[]): string => `M ${q.map((p) => `${r2(p[0])} ${r2(p[1])}`).join(" L ")} Z`;

/** A seeded pseudo-random generator (stable per base). */
export function rng(seed: number): () => number {
  let s = Math.abs(Math.round(seed)) % 2147483646 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ---------- materials and props ----------

export function rivets(t: Toon, pts: Pt[], r = 1.8): void {
  for (const [x, y] of pts) fill(t, ellipse(x, y, r, r), mat(K.steel, 0.5), { s: r * 0.7, line: LINE * 0.6, hi: 0.8 });
}

/** Light running stitches inside a rectangle (a sewn-on patch). */
export function stitch(t: Toon, x: number, y: number, w: number, h: number): void {
  t.ctx.save();
  t.ctx.setLineDash([2.2, 1.8]);
  ink(t, rrect(x + 1.6, y + 1.6, w - 3.2, h - 3.2, 1), 0.9, "rgba(255,240,210,0.85)");
  t.ctx.restore();
}

/** A sewn canvas patch. */
export function patch(t: Toon, x: number, y: number, w: number, h: number, c = K.canvas): void {
  fill(t, rrect(x, y, w, h, 1.6), mat(c), { s: 2.5, line: LINE * 0.7 });
  stitch(t, x, y, w, h);
}

/** Puffs of smoke or dust rising up-left from (x, y). */
export function puffs(t: Toon, x: number, y: number, r: number, c = 0x9a948c, n = 3, dx = -0.8, dy = -1.1): void {
  for (let i = 0; i < n; i++) {
    const k = 1 - i * 0.22;
    fill(t, ellipse(x + i * r * dx, y + i * r * dy, r * k, r * k * 0.85), mat(c), { s: r * 0.4, alpha: 0.92 - i * 0.2, line: LINE * 0.8 });
  }
}

/** Corrugation ridges across a shape (vertical by default), clipped to it. */
export function corrugate(t: Toon, d: string, x0: number, x1: number, y0: number, y1: number, step = 7, horizontal = false): void {
  clipTo(t, d, () => {
    if (horizontal) for (let y = y0 + step / 2; y < y1; y += step) ink(t, `M ${x0} ${y} L ${x1} ${y}`, 1.6, "rgba(40,36,46,0.32)");
    else for (let x = x0 + step / 2; x < x1; x += step) ink(t, `M ${x} ${y0} L ${x} ${y1}`, 1.6, "rgba(40,36,46,0.32)");
    if (horizontal) for (let y = y0 + step / 2 - 2.4; y < y1; y += step) ink(t, `M ${x0} ${y} L ${x1} ${y}`, 1.2, "rgba(255,250,235,0.35)");
    else for (let x = x0 + step / 2 - 2.4; x < x1; x += step) ink(t, `M ${x} ${y0} L ${x} ${y1}`, 1.2, "rgba(255,250,235,0.35)");
  });
}

/** Rust blotches clipped to a shape. */
export function rustSpots(t: Toon, d: string, spots: [number, number, number][]): void {
  clipTo(t, d, () => {
    for (const [x, y, r] of spots) flat(t, ellipse(x, y, r, r * 0.7), rgba(K.rust, 0.55));
  });
}

/** One plump sandbag centred at (x, y), `w` wide. */
export function sandbag(t: Toon, x: number, y: number, w = 32, h = 18, c = K.bag): void {
  const hw = w / 2;
  const hh = h / 2;
  fill(t, `M ${x - hw} ${y} C ${x - hw} ${y - hh * 1.15} ${x + hw} ${y - hh * 1.15} ${x + hw} ${y} C ${x + hw} ${y + hh} ${x - hw} ${y + hh} ${x - hw} ${y} Z`, mat(c), { s: 4 });
  ink(t, `M ${x - hw * 0.7} ${y - hh * 0.5} Q ${x - hw * 0.84} ${y} ${x - hw * 0.7} ${y + hh * 0.55} M ${x + hw * 0.66} ${y - hh * 0.55} Q ${x + hw * 0.8} ${y} ${x + hw * 0.66} ${y + hh * 0.5}`, LINE * 0.6, "rgba(60,40,22,0.55)");
}

/** A ring of sandbags around (0, cy): `front` the near half, else the far half. */
export function sandbagRing(t: Toon, front: boolean, rx: number, ry: number, n: number, cy = -10, w = 32): void {
  const a0 = front ? 0.06 : 1.04;
  const a1 = front ? 0.94 : 1.96;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (a0 + ((a1 - a0) * (i + 0.5)) / n);
    sandbag(t, Math.cos(a) * rx, cy + Math.sin(a) * ry, w, w * 0.56, i % 3 === 1 ? shade(K.bag, -0.08) : K.bag);
  }
}

/** A mitten hand. */
export function mitt(t: Toon, x: number, y: number, c = 0x8c6036, r = 6.5): void {
  fill(t, ellipse(x, y, r, r * 0.92), mat(c), { s: 3 });
}

/** A brass-rimmed goggle lens. */
export function goggle(t: Toon, x: number, y: number, rx: number, ry: number): void {
  fill(t, ellipse(x, y, rx, ry), mat(K.brass, 0.7), { s: 2 });
  fill(t, ellipse(x, y, rx * 0.68, ry * 0.68), mat(K.lens, 1), { s: 1.5, line: LINE * 0.6, spec: [x - rx * 0.25, y - ry * 0.3, rx * 0.22, ry * 0.16] });
}

/** A simple cartoon eye: dark bean with a glint. */
export function eyeDot(t: Toon, x: number, y: number, r = 2.6): void {
  flat(t, ellipse(x, y, r * 0.8, r), K.ink);
  flat(t, ellipse(x - r * 0.25, y - r * 0.4, r * 0.3, r * 0.3), "rgba(255,255,255,0.9)");
}

/** The orange stencil chevron the Militia paint on everything they own. */
export function chevron(t: Toon, x: number, y: number, k: number, c: number): void {
  flat(t, `M ${x - 6 * k} ${y - 4 * k} L ${x} ${y + 2 * k} L ${x + 6 * k} ${y - 4 * k} L ${x + 6 * k} ${y} L ${x} ${y + 6 * k} L ${x - 6 * k} ${y} Z`, css(c));
}

/** Darker, desaturated version of a colour for the far side of a pair (back leg, far wing). */
export const back = (c: number, k = 0.14): number => shade(c, -k);
/** A faded version of the faction colour, for big painted surfaces that shouldn't shout. */
export const faded = (c: number): number => mix(c, 0xd8c39a, 0.22);
