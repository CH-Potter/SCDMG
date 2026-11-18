// The Munch art kit: palette, materials and the small reusable bits shared by every Munch painter.
// The Munch are one insect hive: segmented chitin bodies, mandibles, jointed legs, and a shared
// "hive thread" on every unit: glowing faction-green compound eyes and chevron hive marks on the
// carapace (glowing green cells on the structures). See STYLE.md for the house style.

import { mix, rgba, shade } from "../palette";
import { ellipse, fill, type FillOpts, flat, glowAt, ink, mat, type Mat, teethRow, type Toon, tube } from "../toon";

export const LINE = 1.5;

/** The Munch palette. The faction colour (s.color) is the accent: stripes, spines, crests. */
export const M = {
  bone: 0xf1e6c6,
  gum: 0xd65a7a,
  mouth: 0x3c0b18,
  throat: 0x1e0509,
  tongue: 0xec7590,
  goo: 0xc9ec4e,
  gooHot: 0xeaff8a,
  bruise: 0x8a5b9c,
  bruiseDeep: 0x5b3c70,
  belly: 0xe0d9a4,
  eye: 0xfbf6e6,
  pupil: 0x1c1512,
  beady: 0xffcf3a,
  egg: 0xf3ead0,
  loam: 0x3e3226,
  loamDark: 0x2c231b,
  dirt: 0x7c5a3a,
  dirtLight: 0x9a7650,
  moss: 0x66762f,
  stone: 0x8d857c,
  hole: 0x140b08,
  wax: 0xdcc583,
  waxDeep: 0xa98a4c,
  paper: 0xa5938e,
  membrane: 0xe8e0c0,
  wing: 0xe6f0ec,
};

/** Creature hide: the faction colour deepened and desaturated towards a green-grey. */
export const hideOf = (A: number): number => mix(shade(A, -0.2), 0x58645a, 0.4);
/** The darker hide for far limbs and undersides. */
export const hideBack = (A: number): number => mix(shade(hideOf(A), -0.2), 0x3a2a4a, 0.12);
/** Bruised-purple hide (Hoppers, Steel-Jaw Crows wings, Mutagen Vat). */
export const bruiseOf = (A: number): number => mix(M.bruise, hideOf(A), 0.22);

export const hideMat = (A: number): Mat => mat(hideOf(A), 0.15);
export const backMat = (A: number): Mat => mat(hideBack(A), 0.1);
export const boneMat = mat(M.bone, 0.2, 0.26);
export const gooMat = mat(M.goo, 0.85, 0.22);

/** Fill a part without its interior line, paint `inside` clipped to it (spots, stripes), then ink its edge. */
export function part(t: Toon, d: string, m: Mat, o: FillOpts = {}, inside?: () => void): void {
  fill(t, d, m, { ...o, line: 0 });
  if (inside) {
    t.ctx.save();
    t.ctx.clip(new Path2D(d));
    inside();
    t.ctx.restore();
  }
  const line = o.line ?? t.line;
  if (line > 0) ink(t, d, line);
}

/** Soft blotches (mottled hide), meant to be called inside a `part` clip. */
export function blotches(t: Toon, spots: [number, number, number][], color: number, alpha = 0.5): void {
  for (const [x, y, r] of spots) flat(t, ellipse(x, y, r, r * 0.78), color, alpha);
}

/** A big wet googly eye. `look` pushes the pupil (units of the eye radius), `lid` 0 open … 1 shut. */
export function googly(t: Toon, x: number, y: number, r: number, o: { look?: [number, number]; lid?: number; lidColor?: number; pupil?: number } = {}): void {
  const [lx, ly] = o.look ?? [0.4, 0.05];
  const e = ellipse(x, y, r, r * 0.96);
  fill(t, e, mat(M.eye, 0.4, 0.16), { s: r * 0.32, line: LINE * 0.85, hi: 0.3 });
  const pr = r * (o.pupil ?? 0.48);
  const px = x + lx * (r - pr) * 0.95;
  const py = y + ly * (r - pr) * 0.95;
  flat(t, ellipse(px, py, pr, pr * 1.06), M.pupil);
  flat(t, ellipse(px - pr * 0.36, py - pr * 0.4, pr * 0.34, pr * 0.3), "rgba(255,255,255,0.95)");
  const lid = o.lid ?? 0;
  if (lid > 0) {
    const ly2 = y - r + lid * 2 * r;
    t.ctx.save();
    t.ctx.clip(new Path2D(e));
    fill(t, `M ${x - r * 1.2} ${y - r * 1.3} L ${x + r * 1.2} ${y - r * 1.3} L ${x + r * 1.2} ${ly2} Q ${x} ${ly2 + r * 0.3} ${x - r * 1.2} ${ly2} Z`, mat(o.lidColor ?? 0x6f8a5c), { s: r * 0.25, line: 0 });
    ink(t, `M ${x - r * 1.2} ${ly2} Q ${x} ${ly2 + r * 0.3} ${x + r * 1.2} ${ly2}`, LINE * 0.9);
    t.ctx.restore();
  }
}

/** A small mean glowing eye (Big Mama's cluster). */
export function beady(t: Toon, x: number, y: number, r: number): void {
  glowAt(t, x, y, r * 2.6, M.beady, 0.45);
  fill(t, ellipse(x, y, r, r * 0.9), mat(M.beady, 0.5), { s: r * 0.4, line: LINE * 0.8 });
  flat(t, ellipse(x + r * 0.15, y, r * 0.24, r * 0.66), M.pupil);
  flat(t, ellipse(x - r * 0.35, y - r * 0.35, r * 0.22, r * 0.18), "rgba(255,255,255,0.9)");
}

/** A heavy angry brow over an eye. */
export function brow(t: Toon, x: number, y: number, w: number, tilt: number, m: Mat): void {
  fill(t, `M ${x - w} ${y - tilt} Q ${x} ${y - w * 0.35} ${x + w} ${y + tilt} L ${x + w * 0.9} ${y + tilt + w * 0.32} Q ${x} ${y + w * 0.05} ${x - w} ${y - tilt + w * 0.3} Z`, m, { s: w * 0.2, line: LINE * 0.8 });
}

/** Bone teeth along a quadratic edge (dir +1 points down, -1 up). */
export function teeth(t: Toon, ax: number, ay: number, cx: number, cy: number, bx: number, by: number, n: number, len: number, dir: 1 | -1, s = 1.2): void {
  fill(t, teethRow(ax, ay, cx, cy, bx, by, n, len, dir), boneMat, { s, line: LINE * 0.6, hi: 0.3 });
}

/** A curved bone spike rising from (x, y). */
export function spike(t: Toon, x: number, y: number, h: number, w: number, lean: number, m: Mat = boneMat): void {
  fill(t, `M ${x - w} ${y} Q ${x - w * 0.7} ${y - h * 0.6} ${x + lean} ${y - h} Q ${x + w * 0.3} ${y - h * 0.45} ${x + w} ${y} Z`, m, { s: w * 0.5, line: LINE * 0.8 });
}

/** Bone claws on a foot at (x, y): `n` hooks pointing in `dir`. */
export function claws(t: Toon, x: number, y: number, n: number, size: number, dir = 1): void {
  let d = "";
  for (let i = 0; i < n; i++) {
    const cx = x + (i - (n - 1) / 2) * size * 0.75;
    d += `M ${cx - size * 0.35} ${y - size * 0.55} Q ${cx + dir * size * 0.75} ${y - size * 0.5} ${cx + dir * size * 0.85} ${y + size * 0.1} Q ${cx + dir * size * 0.3} ${y - size * 0.05} ${cx - size * 0.2} ${y + size * 0.05} Z `;
  }
  fill(t, d, boneMat, { s: 0, line: LINE * 0.6 });
}

/** A hanging goo drip from (x, y), `len` long, ending in a fat drop. */
export function drip(t: Toon, x: number, y: number, len: number, w = 2.4): void {
  fill(t, tube([[x, y], [x + w * 0.2, y + len * 0.6], [x, y + len]], [w, w * 0.7, w * 0.9]), gooMat, { s: 0, line: LINE * 0.6 });
  fill(t, ellipse(x, y + len + w * 0.6, w * 1.35, w * 1.6), gooMat, { s: w * 0.5, line: LINE * 0.6, spec: [x - w * 0.4, y + len, w * 0.35, w * 0.3] });
}

/** A glowing goo blob with bubbles. */
export function gooBlob(t: Toon, x: number, y: number, rx: number, ry: number, alpha = 0.95): void {
  glowAt(t, x, y, Math.max(rx, ry) * 2, M.gooHot, 0.5);
  fill(t, ellipse(x, y, rx, ry), gooMat, { s: rx * 0.35, alpha, spec: [x - rx * 0.4, y - ry * 0.45, rx * 0.22, ry * 0.14] });
  flat(t, ellipse(x + rx * 0.25, y + ry * 0.2, rx * 0.12, rx * 0.12), "rgba(255,255,230,0.85)");
}

/** A wet gum-and-throat mouth: `outer` lip shape, `inner` cavity. */
export function maw(t: Toon, outer: string, inner: string, s = 3): void {
  fill(t, outer, mat(M.gum, 0.3), { s });
  fill(t, inner, mat(M.mouth), { s: 0, line: 0 });
}

/** Seeded random in [0, 1) for scatter that stays put between frames. */
export function rng(seed: number): () => number {
  let x = Math.max(1, Math.floor(Math.abs(seed)) % 2147483646);
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

export const glow = (c: number, a: number): string => rgba(c, a);

/** A lumpy closed blob around an ellipse: `n` bumps of relative size `amp` (seeded, so it holds still). */
export function lumpy(cx: number, cy: number, rx: number, ry: number, n: number, amp: number, seed = 1): string {
  const r = rng(seed * 131 + 17);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (r() - 0.3) * amp;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  let d = "";
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % n]!;
    const m: [number, number] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    // push the control point outwards so each segment bulges like a clod
    const ox = m[0] - cx;
    const oy = m[1] - cy;
    const c: [number, number] = [cx + ox * (1 + amp * 0.9), cy + oy * (1 + amp * 0.9)];
    if (i === 0) d += `M ${p[0].toFixed(2)} ${p[1].toFixed(2)} `;
    d += `Q ${c[0].toFixed(2)} ${c[1].toFixed(2)} ${q[0].toFixed(2)} ${q[1].toFixed(2)} `;
  }
  return d + "Z";
}

// ---------- the hive kit ----------

/** Carapace chitin: the hide colour, glossy. */
export const chitinMat = (A: number): Mat => mat(hideOf(A), 0.55);
/** Legs, joints and undersides: a dark plum-green. */
export const legOf = (A: number): number => shade(mix(hideBack(A), 0x5a4a60, 0.35), 0.04);
export const legMat = (A: number): Mat => mat(legOf(A), 0.3);
/** The hive glow: the faction colour lifted towards white (eyes, marks, cells). */
export const glowOf = (A: number): number => mix(A, 0xeaffd0, 0.3);

/** A jointed leg: femur from the hip to the knee, tibia to a pointed foot. */
export function leg(t: Toon, hip: [number, number], knee: [number, number], foot: [number, number], w0: number, m: Mat): void {
  const w = w0 * 1.15;
  fill(t, tube([hip, knee], [w, w * 0.8]), m, { s: w * 0.5, line: LINE * 0.9 });
  const dx = foot[0] - knee[0];
  const dy = foot[1] - knee[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const tw = w * 0.62;
  // the tibia tapers to a hooked point
  fill(t, `M ${knee[0] + nx * tw} ${knee[1] + ny * tw} L ${foot[0] + nx * tw * 0.35} ${foot[1] + ny * tw * 0.35} L ${foot[0] + (dx / L) * w * 0.7} ${foot[1] + (dy / L) * w * 0.7} L ${foot[0] - nx * tw * 0.35} ${foot[1] - ny * tw * 0.35} L ${knee[0] - nx * tw} ${knee[1] - ny * tw} Z`, m, { s: w * 0.3, line: LINE * 0.9 });
  fill(t, ellipse(knee[0], knee[1], w * 0.85, w * 0.85), m, { s: w * 0.3, line: LINE * 0.8 });
}

/** A glowing compound eye in the hive green: faceted, with a hard glint. */
export function compoundEye(t: Toon, x: number, y: number, rx: number, ry: number, A: number, glowK = 1): void {
  const g = glowOf(A);
  glowAt(t, x, y, Math.max(rx, ry) * 2.6, A, 0.5 * glowK);
  const e = ellipse(x, y, rx, ry);
  fill(t, e, mat(g, 0.7, 0.4), { s: Math.min(rx, ry) * 0.5, line: LINE * 0.9, hi: 0.3 });
  t.ctx.save();
  t.ctx.clip(new Path2D(e));
  const step = Math.max(1.6, Math.min(rx, ry) * 0.42);
  for (let j = -3; j <= 3; j++)
    for (let i = -3; i <= 3; i++) {
      const fx = x + i * step + (j % 2 ? step / 2 : 0);
      const fy = y + j * step * 0.86;
      flat(t, ellipse(fx, fy, step * 0.2, step * 0.2), shade(A, -0.45), 0.4);
    }
  t.ctx.restore();
  flat(t, ellipse(x - rx * 0.35, y - ry * 0.4, rx * 0.28, ry * 0.18), "rgba(255,255,255,0.9)");
}

/** Glowing hive-mark chevrons (pointing towards +x, the head) on a carapace, `n` in a row. */
export function hiveMark(t: Toon, x: number, y: number, w: number, A: number, n = 2, rot = 0): void {
  const { ctx } = t;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const h = w * 0.55;
  const k = w * 0.32;
  for (let i = 0; i < n; i++) {
    const ox = -i * w * 0.62;
    glowAt(t, ox - w * 0.2, 0, w * 1.1, A, 0.35);
    fill(t, `M ${ox - w * 0.5} ${-h} L ${ox - w * 0.5 + k} ${-h} L ${ox + k * 0.4} 0 L ${ox - w * 0.5 + k} ${h} L ${ox - w * 0.5} ${h} L ${ox - k * 0.6} 0 Z`, mat(glowOf(A), 0.4), { s: 0, line: LINE * 0.5, hi: 0 });
  }
  ctx.restore();
}

/** A pair of curved pincer mandibles at (x, y) reaching `L` towards +x; `open` 0 shut … 1 wide. */
export function mandibles(t: Toon, x: number, y: number, L: number, open: number, m: Mat = boneMat): void {
  for (const sg of [-1, 1] as const) {
    const b1y = y + sg * L * 0.26;
    const b2y = y + sg * L * 0.02;
    const tx = x + L * (1 - open * 0.12);
    const ty = y + sg * L * (0.02 + 0.32 * open);
    const cox = x + L * 0.62;
    const coy = y + sg * L * (0.5 + 0.35 * open);
    const cix = x + L * 0.5;
    const ciy = y + sg * L * (0.16 + 0.3 * open);
    // inner tooth
    const mx = x + L * 0.45;
    const my = y + sg * L * (0.1 + 0.26 * open);
    fill(t, `M ${x} ${b1y} Q ${cox} ${coy} ${tx} ${ty} Q ${cix} ${ciy} ${mx + L * 0.08} ${my} L ${mx} ${my - sg * L * 0.12} L ${mx - L * 0.06} ${my} Q ${x + L * 0.2} ${b2y} ${x} ${b2y} Z`, m, { s: L * 0.12, line: LINE * 0.9 });
  }
}

/** An elbowed antenna from (x, y): up to the elbow, out to a small forked tip. */
export function antenna(t: Toon, x: number, y: number, ex: number, ey: number, tx: number, ty: number, w: number, m: Mat): void {
  fill(t, tube([[x, y], [ex, ey], [tx, ty]], [w, w * 0.75, w * 0.45]), m, { s: 0, line: LINE * 0.7 });
  const dx = tx - ex;
  const dy = ty - ey;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const f = w * 2.2;
  ink(t, `M ${tx} ${ty} l ${(ux - uy * 0.7) * f} ${(uy + ux * 0.7) * f} M ${tx} ${ty} l ${(ux + uy * 0.7) * f} ${(uy - ux * 0.7) * f}`, w * 0.8);
}

/** A translucent veined insect wing from its root, `len` long, rotated by `rot`. */
export function wing(t: Toon, x: number, y: number, len: number, wid: number, rot: number, tint = M.wing, alpha = 0.72): void {
  const { ctx } = t;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  fill(t, `M 0 0 C ${-len * 0.3} ${-wid} ${-len * 0.85} ${-wid * 1.1} ${-len} ${-wid * 0.2} C ${-len * 0.9} ${wid * 0.5} ${-len * 0.4} ${wid * 0.55} 0 0 Z`, mat(tint, 0.6), { s: wid * 0.3, alpha, line: LINE * 0.7 });
  ink(t, `M 0 0 L ${-len * 0.92} ${-wid * 0.3} M ${-len * 0.3} ${-wid * 0.1} L ${-len * 0.55} ${wid * 0.35} M ${-len * 0.55} ${-wid * 0.2} L ${-len * 0.75} ${-wid * 0.75}`, LINE * 0.5, "rgba(28,21,18,0.4)");
  ctx.restore();
}

/** A flat hexagon (comb cell) path. */
export function hex(x: number, y: number, r: number, squash = 0.8): string {
  let d = "";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    d += `${i ? "L" : "M"} ${(x + Math.cos(a) * r).toFixed(2)} ${(y + Math.sin(a) * r * squash).toFixed(2)} `;
  }
  return d + "Z";
}

/** A patch of wax comb: cells on a hex grid inside `clip`; cells in `lit` (indices) glow in the hive green. */
export function comb(t: Toon, x0: number, y0: number, cols: number, rows: number, r: number, A: number, lit: number[] = [], wax = M.wax, squash = 0.8): void {
  const W = mat(wax, 0.3);
  let k = 0;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++, k++) {
      const cx = x0 + i * r * 1.73 + (j % 2 ? r * 0.87 : 0);
      const cy = y0 + j * r * 1.5 * squash;
      fill(t, hex(cx, cy, r, squash), W, { s: r * 0.35, line: LINE * 0.7, hi: 0.4 });
      if (lit.includes(k)) {
        glowAt(t, cx, cy, r * 1.8, A, 0.45);
        fill(t, hex(cx, cy, r * 0.62, squash), mat(glowOf(A), 0.6), { s: 0, line: 0 });
      } else flat(t, hex(cx, cy, r * 0.6, squash), shade(wax, -0.45), 0.85);
    }
}

// ---------- the lab graft kit (final direction: grafted, mind-controlled farmland critters) ----------
// Natural animal coats, plus the scientist's clean lab tech: chrome plates held on with surgical
// staples, glass vials of glowing mutagen, and on every critter the signal implant: a chrome
// skull cap with a glowing faction-green lens. That implant and the green glow are the faction's
// shared thread.

export const LAB = {
  chrome: 0xc9d2d8,
  steel: 0x7d8992,
  glass: 0xdcefeb,
  coat: 0xf3f1ea,
  skin: 0xe8b88e,
  hair: 0xeeeeee,
  brown: 0x8a5a36,
  grey: 0x8f8d88,
  greyDark: 0x5c5a58,
  rust: 0xcb6a32,
  black: 0x3a3438,
  white: 0xeee8dc,
  cream: 0xe8d8b6,
  beetle: 0x6e432c,
  amber: 0xdf9f3a,
  crow: 0x37323f,
  spider: 0x7a726a,
  scorp: 0x9c5c34,
  leather: 0x5e4230,
};

export const chromeMat = mat(LAB.chrome, 0.9, 0.35);
export const steelMat = mat(LAB.steel, 0.7);

/** A surgical staple across a seam at (x, y), `s` wide, rotated by `rot`. */
export function staple(t: Toon, x: number, y: number, s: number, rot = 0): void {
  const { ctx } = t;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const d = `M ${-s} ${s * 0.35} L ${-s} ${-s * 0.35} L ${s} ${-s * 0.35} L ${s} ${s * 0.35}`;
  ink(t, d, Math.max(1.4, s * 0.55));
  ink(t, d, Math.max(0.7, s * 0.25), "#dfe6ea");
  ctx.restore();
}

/** Staples along a straight seam from (x0, y0) to (x1, y1). */
export function staples(t: Toon, x0: number, y0: number, x1: number, y1: number, n: number, s: number): void {
  const rot = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    staple(t, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, s, rot);
  }
}

/** Surgical stitches along a path. */
export function stitches(t: Toon, d: string, w = 1.2): void {
  t.ctx.save();
  t.ctx.setLineDash([w * 2.2, w * 1.6]);
  ink(t, d, w);
  t.ctx.restore();
}

/** The signal implant: a chrome skull cap at (x, y) of radius r, with a glowing hive-green lens. */
export function implant(t: Toon, x: number, y: number, r: number, A: number, rot = 0): void {
  const { ctx } = t;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  fill(t, `M ${-r} ${r * 0.1} C ${-r} ${-r * 0.95} ${r} ${-r * 0.95} ${r} ${r * 0.1} Q 0 ${r * 0.35} ${-r} ${r * 0.1} Z`, chromeMat, { s: r * 0.3, spec: [-r * 0.45, -r * 0.5, r * 0.22, r * 0.11, -0.4] });
  ink(t, `M ${-r * 0.92} ${-r * 0.12} Q 0 ${r * 0.12} ${r * 0.92} ${-r * 0.12}`, LINE * 0.6, "rgba(28,21,18,0.5)");
  glowAt(t, r * 0.1, -r * 0.42, r * 1.7, A, 0.65);
  fill(t, ellipse(r * 0.1, -r * 0.42, r * 0.36, r * 0.32), mat(glowOf(A), 0.8), { s: 0, line: LINE * 0.6 });
  flat(t, ellipse(0, -r * 0.5, r * 0.12, r * 0.08), "rgba(255,255,255,0.95)");
  staple(t, -r * 0.8, r * 0.18, r * 0.2, 0.3);
  staple(t, r * 0.8, r * 0.18, r * 0.2, -0.3);
  ctx.restore();
}

/** A glass vial of glowing mutagen with flat chrome caps, `w` long and `h` tall, rotated by `rot`. */
export function vial(t: Toon, x: number, y: number, w: number, h: number, A: number, rot = 0, level = 0.62): void {
  const { ctx } = t;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const body = `M ${-w / 2} ${-h / 2} L ${w / 2} ${-h / 2} L ${w / 2} ${h / 2} L ${-w / 2} ${h / 2} Z`;
  glowAt(t, 0, 0, w * 0.7, A, 0.4);
  fill(t, body, mat(LAB.glass, 0.9, 0.2), { s: 0, line: 0, alpha: 0.75 });
  ctx.save();
  ctx.clip(new Path2D(body));
  const top = h / 2 - h * level;
  fill(t, `M ${-w} ${top} L ${w} ${top} L ${w} ${h} L ${-w} ${h} Z`, mat(glowOf(A), 0.6), { s: h * 0.25, line: 0 });
  for (const [bx, by, br] of [[-w * 0.2, h * 0.15, h * 0.1], [w * 0.15, h * 0.28, h * 0.07], [w * 0.3, h * 0.05, h * 0.06]] as const) flat(t, ellipse(bx, by, br, br), "rgba(255,255,230,0.85)");
  flat(t, `M ${-w / 2} ${-h * 0.32} L ${w / 2} ${-h * 0.32} L ${w / 2} ${-h * 0.18} L ${-w / 2} ${-h * 0.18} Z`, "rgba(255,255,255,0.6)");
  ctx.restore();
  ink(t, body, LINE * 0.9);
  for (const sx of [-1, 1]) fill(t, `M ${sx * w / 2} ${-h * 0.62} L ${sx * (w / 2 + h * 0.3)} ${-h * 0.62} L ${sx * (w / 2 + h * 0.3)} ${h * 0.62} L ${sx * w / 2} ${h * 0.62} Z`, chromeMat, { s: h * 0.15, line: LINE * 0.8 });
  ctx.restore();
}

/** A chrome plate graft, stapled along its lower edge. */
export function graftPlate(t: Toon, d: string, seam: [number, number, number, number], n: number, s: number): void {
  fill(t, d, chromeMat, { s: 5 });
  staples(t, seam[0], seam[1], seam[2], seam[3], n, s);
}

/** A natural eye with the signal's green glint. */
export function critterEye(t: Toon, x: number, y: number, r: number, A: number): void {
  glowAt(t, x, y, r * 2.4, A, 0.35);
  fill(t, ellipse(x, y, r, r * 1.05), mat(0x1c1512, 0.5), { s: 0, line: 0 });
  flat(t, ellipse(x + r * 0.15, y + r * 0.1, r * 0.55, r * 0.58), glowOf(A), 0.9);
  flat(t, ellipse(x + r * 0.2, y + r * 0.12, r * 0.25, r * 0.3), 0x1c1512);
  flat(t, ellipse(x - r * 0.35, y - r * 0.4, r * 0.25, r * 0.2), "rgba(255,255,255,0.95)");
}

/** Chrome claw blades on a foot at (x, y): `n` curved hooks reaching towards +x. */
export function steelClaws(t: Toon, x: number, y: number, n: number, size: number): void {
  let d = "";
  for (let i = 0; i < n; i++) {
    const cx = x + (i - (n - 1) / 2) * size * 0.7;
    d += `M ${cx - size * 0.3} ${y - size * 0.6} Q ${cx + size * 0.9} ${y - size * 0.7} ${cx + size * 1.05} ${y + size * 0.1} Q ${cx + size * 0.4} ${y - size * 0.1} ${cx - size * 0.2} ${y + size * 0.05} Z `;
  }
  fill(t, d, chromeMat, { s: size * 0.2, line: LINE * 0.8 });
}
