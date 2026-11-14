// Lumen Concord art kit: smug alien invaders. Palette, materials and the shared parts: the alien
// head in its fishbowl helmet, saucer hulls, ring emitters, energy blades, hex shields, teleport
// shimmer and the alloy landing-plate base. See STYLE.md for the house style.

import { makeCanvas } from "../ink";
import { mix, rgba, shade } from "../palette";
import { ellipse, fill, flat, glowAt, ink, mat, type Mat, type Toon } from "../toon";

export const LINE = 1.5;

/** The Concord palette: pearl alloy, deep navy and gold around the faction lavender (`s.color`), with mint alien skin. */
export const K = {
  pearl: 0xeeeaf4,
  pearlB: 0xcfcadc,
  silver: 0xb9bccb,
  navy: 0x2b2e62,
  navyDeep: 0x1d1f45,
  gold: 0xe2b85a,
  goldLine: "#b8892f",
  skin: 0xa6e3cf,
  glove: 0xd9dcea,
  alloy: 0x99969f,
  ink: 0x1c1512,
};

/** Energy tint for a faction colour (blades, shields, beams). */
export const gem = (c: number): number => mix(shade(c, 0.45), 0xf4f0ff, 0.25);
/** Glow tint for a faction colour. */
export const lite = (c: number): number => shade(c, 0.58);
export const deepGem = (c: number): number => mix(gem(c), c, 0.45);

export interface ConMats {
  pearl: Mat;
  pearlB: Mat;
  silver: Mat;
  navy: Mat;
  navyB: Mat;
  gold: Mat;
  glove: Mat;
  gem: Mat;
  gemB: Mat;
  sash: Mat;
  boot: Mat;
  skin: Mat;
}

export function mats(A: number): ConMats {
  return {
    pearl: mat(K.pearl, 0.35, 0.34),
    pearlB: mat(K.pearlB, 0.3, 0.34),
    silver: mat(K.silver, 0.6, 0.34),
    navy: mat(K.navy, 0.3),
    navyB: mat(K.navyDeep, 0.3),
    gold: mat(K.gold, 0.7),
    glove: mat(K.glove, 0.3),
    gem: mat(gem(A), 0.95, 0.22),
    gemB: mat(deepGem(A), 0.9, 0.24),
    sash: mat(A, 0.45),
    boot: mat(0xc4c7d6, 0.6, 0.36),
    skin: mat(K.skin, 0.25, 0.3),
  };
}

export type Pt = [number, number];
export const poly = (q: Pt[]): string => `M ${q.map((p) => `${p[0]} ${p[1]}`).join(" L ")} Z`;

/** A gold trim line. */
export const gilt = (t: Toon, d: string, w = 2.2): void => ink(t, d, w, K.goldLine);

/** A glowing seam line in the faction colour. */
export function seam(t: Toon, d: string, A: number, w = 2): void {
  ink(t, d, w + 3, rgba(lite(A), 0.3));
  ink(t, d, w, rgba(shade(lite(A), 0.25), 1));
}

/** A faceted shard (tip up), with an optional soft glow. */
export function shard(t: Toon, cx: number, top: number, bottom: number, w: number, A: number, lean = 0, glow = 0.3): void {
  const g = gem(A);
  const mid = top + (bottom - top) * 0.38;
  if (glow > 0) glowAt(t, cx, (top + bottom) / 2, (bottom - top) * 0.8, lite(A), glow);
  fill(t, `M ${cx + lean} ${top} L ${cx + w} ${mid} L ${cx + w * 0.7} ${bottom} L ${cx - w * 0.7} ${bottom} L ${cx - w} ${mid} Z`, mat(g, 0.9, 0.22), { s: w * 0.5 });
  flat(t, `M ${cx + lean} ${top} L ${cx - w} ${mid} L ${cx - w * 0.7} ${bottom} L ${cx + w * 0.05} ${bottom} L ${cx + w * 0.15} ${mid} Z`, 0xffffff, 0.3);
}

/** A cut block: a polygon with a raised table and bevel facets lit from the top left. */
export function gemCut(t: Toon, pts: Pt[], m: Mat, s = 8, table = 0.52): void {
  const n = pts.length;
  const cx = pts.reduce((a, p) => a + p[0], 0) / n;
  const cy = pts.reduce((a, p) => a + p[1], 0) / n;
  const span = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
  const inner = pts.map(([x, y]): Pt => [cx + (x - cx) * table - span * 0.06, cy + (y - cy) * table - span * 0.08]);
  const outer = poly(pts);
  fill(t, outer, m, { s });
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const ex = (a[0] + b[0]) / 2 - cx;
    const ey = (a[1] + b[1]) / 2 - cy;
    const lit = -(ex + ey) / (Math.SQRT2 * (Math.hypot(ex, ey) || 1));
    const quad = poly([a, b, inner[(i + 1) % n]!, inner[i]!]);
    if (lit > 0.2) flat(t, quad, 0xffffff, 0.36 * lit);
    else if (lit < -0.2) flat(t, quad, shade(m.base, -0.5), -0.34 * lit);
  }
  flat(t, poly(inner), 0xffffff, 0.14);
  ink(t, poly(inner) + pts.map((p, i) => ` M ${p[0]} ${p[1]} L ${inner[i]![0]} ${inner[i]![1]}`).join(""), LINE * 0.55, "rgba(40,30,70,0.42)");
  ink(t, outer, LINE);
}

/** A four-point star glint. */
export function sparkle(t: Toon, x: number, y: number, r: number, color = 0xffffff, a = 0.95): void {
  glowAt(t, x, y, r * 2.2, color, 0.5 * a);
  const q = r * 0.22;
  flat(t, `M ${x} ${y - r} Q ${x + q} ${y - q} ${x + r} ${y} Q ${x + q} ${y + q} ${x} ${y + r} Q ${x - q} ${y + q} ${x - r} ${y} Q ${x - q} ${y - q} ${x} ${y - r} Z`, 0xffffff, a);
}

/** A small glowing light set in a gold bezel. */
export function stud(t: Toon, x: number, y: number, r: number, A: number, glow = true): void {
  if (glow) glowAt(t, x, y, r * 3, lite(A), 0.7);
  fill(t, ellipse(x, y, r + 1.2, r + 1.2), mat(K.gold, 0.7), { s: 1, line: LINE * 0.6 });
  fill(t, ellipse(x, y, r, r), mat(gem(A), 1, 0.2), { s: r * 0.4, line: LINE * 0.5 });
  flat(t, ellipse(x - r * 0.3, y - r * 0.3, r * 0.35, r * 0.3), 0xffffff, 0.8);
}

/** A radiant aura: a glowing gold ring (seen in 3/4, a slightly tall ellipse) with short rays. */
export function halo(t: Toon, x: number, y: number, r: number, A: number, rays = 0, color = K.gold): void {
  glowAt(t, x, y, r * 1.6, lite(A), 0.42);
  t.ctx.save();
  t.ctx.globalAlpha *= 0.42;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const r0 = r * 1.12;
    const r1 = r * (i % 2 ? 1.3 : 1.46);
    ink(t, `M ${x + Math.cos(a) * r0} ${y + Math.sin(a) * r0} L ${x + Math.cos(a) * r1} ${y + Math.sin(a) * r1}`, 3.2, rgba(shade(color, 0.45), 1));
  }
  t.ctx.restore();
  const ring = `${ellipse(x, y, r, r * 1.04)} ${ellipse(x, y, r - 4, (r - 4) * 1.04)}`;
  t.ctx.save();
  t.ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  t.ctx.fill(new Path2D(ring), "evenodd");
  t.ctx.restore();
  ink(t, ellipse(x, y, r - 1.5, (r - 1.5) * 1.04), 1.4, rgba(0xfff6d8, 0.9));
  ink(t, ring, LINE * 0.8);
}

export interface HeadOpts {
  /** A fishbowl helmet (default true). */
  helmet?: boolean;
  /** A targeting visor: a holo lens hinged over the near eye. */
  scope?: boolean;
  /** A gold diadem on the helmet collar (officers and nobles). */
  diadem?: boolean;
  monocle?: boolean;
  /** Eyes: smug half-lidded (default), or serenely shut. */
  eyes?: "smug" | "shut";
  /** A small gold crown on the cranium (the noble in the war-walker). */
  crown?: boolean;
}

/**
 * The Concord alien: a big domed mint head with half-lidded, smug almond eyes and a tiny smirk, in a
 * glass fishbowl helmet. Drawn with the neck at (x, y), `k` times the base size (head 40 wide, 48 tall;
 * helmet 60 across), tilted by `rot` (chin up < 0).
 */
export function alienHead(t: Toon, A: number, x: number, y: number, k: number, rot: number, o: HeadOpts = {}): void {
  const { ctx } = t;
  const helmet = o.helmet ?? true;
  const L = lite(A);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(k, k);
  const hx = 2;
  const hy = -28;
  const HR = 30;
  if (helmet) {
    // the glass: a faint tinted fill behind the head
    flat(t, ellipse(hx, hy, HR, HR), L, 0.16);
  }
  // the head: a big cranium tapering to a small chin, facing right
  const head = "M -16 -18 C -22 -34 -14 -52 4 -52 C 22 -52 28 -38 25 -24 C 23 -12 16 -3 8 -2 C -1 -1 -11 -8 -16 -18 Z";
  fill(t, head, mat(K.skin, 0.3, 0.3), { s: 6, spec: [-4, -44, 3.4, 2.2, -0.5] });
  ink(t, "M -6 -40 Q -2 -44 4 -45", LINE * 0.6, "rgba(40,70,60,0.35)");
  // eyes: the far one narrow at the edge, the near one big; heavy smug lids
  const shut = o.eyes === "shut";
  if (shut) {
    ink(t, "M 4 -27 Q 10 -23 16 -27.5", 2.4, "rgba(28,21,18,0.95)");
    ink(t, "M 19 -28 Q 22 -25.5 24 -28", 2, "rgba(28,21,18,0.9)");
  } else {
    fill(t, "M 3 -27 C 6 -32 14 -33 17 -28 C 14 -23 7 -22 3 -27 Z", mat(0x1d1f45, 0.9), { s: 0, line: LINE * 0.6 });
    fill(t, "M 19 -28.5 C 21 -32 24 -32 25 -29 C 24 -25.5 21 -25 19 -28.5 Z", mat(0x1d1f45, 0.9), { s: 0, line: LINE * 0.5 });
    // lavender glints
    flat(t, ellipse(12, -28, 2.6, 2), L);
    flat(t, ellipse(23, -28.8, 1.2, 1.1), L);
    glowAt(t, 12, -28, 7, L, 0.6);
    // the lids, drooping with disdain
    fill(t, "M 2 -27.5 C 5 -34 15 -35 18 -28.5 C 14 -30 7 -30.5 2 -27.5 Z", mat(shade(K.skin, -0.12)), { s: 0, line: 0 });
    ink(t, "M 2 -27.5 C 7 -30.5 14 -30 18 -28.5", 2, "rgba(28,21,18,0.95)");
    ink(t, "M 18.6 -29 C 21 -30.5 23.5 -30.5 25.4 -29.4", 1.6, "rgba(28,21,18,0.9)");
  }
  // a raised brow and a tiny smirk
  ink(t, "M 4 -36 Q 11 -39 17 -35.5", 1.6, "rgba(40,70,60,0.6)");
  ink(t, "M 14 -12 Q 18 -12 21 -15", 1.6, "rgba(28,21,18,0.85)");
  if (o.crown) {
    fill(t, "M -12 -47 L -14 -61 L -6 -54 L 1 -66 L 8 -54 L 16 -60 L 15 -46 C 6 -50 -4 -50 -12 -47 Z", mat(K.gold, 0.8), { s: 2, line: LINE * 0.8 });
    stud(t, 1, -52, 2.2, A, false);
  }
  if (o.monocle) {
    ink(t, ellipse(11, -28, 7.5, 7.5), 2.2, K.goldLine);
    flat(t, ellipse(11, -28, 6.5, 6.5), 0xffffff, 0.18);
    ctx.save();
    ctx.setLineDash([1.8, 1.8]);
    ink(t, "M 16 -22 C 20 -14 20 -6 14 -2", 1.3, K.goldLine);
    ctx.restore();
  }
  if (o.scope) {
    // a hinged holo lens: a square frame on a short arm, glowing lavender glass
    fill(t, "M -6 -42 L 8 -44 L 12 -40 L -2 -38 Z", mat(K.silver, 0.6), { s: 1, line: LINE * 0.7 });
    glowAt(t, 15, -29, 14, L, 0.6);
    flat(t, "M 7 -38 L 22 -39 L 22 -21 L 7 -20 Z", L, 0.45);
    ink(t, "M 7 -38 L 22 -39 L 22 -21 L 7 -20 Z", 2, rgba(shade(L, 0.3), 1));
    ink(t, "M 11 -29.5 L 19 -29.8 M 15 -34 L 15 -25", 1, rgba(0xffffff, 0.9));
  }
  if (helmet) {
    // the bowl: a crisp rim (it gets the silhouette line), a lit edge and a window glint
    ink(t, ellipse(hx, hy, HR, HR), 2.6, rgba(shade(L, 0.45), 1));
    ink(t, `M ${hx - HR * 0.78} ${hy - HR * 0.3} A ${HR * 0.86} ${HR * 0.86} 0 0 1 ${hx - HR * 0.1} ${hy - HR * 0.86}`, 3.2, "rgba(255,255,255,0.75)");
    flat(t, ellipse(hx + HR * 0.52, hy - HR * 0.52, 3, 2), "rgba(255,255,255,0.85)");
  }
  // the collar ring the helmet seals into
  fill(t, "M -16 -4 C -10 2 14 2 20 -4 L 19 4 C 12 9 -8 9 -15 4 Z", mat(K.silver, 0.6), { s: 2, line: LINE * 0.8 });
  if (o.diadem) {
    gilt(t, "M -15 -1 C -8 4 12 4 19 -1", 3);
    stud(t, 2, 2, 2.6, A, false);
  }
  ctx.restore();
}

/** A tapered energy blade from (x0, y0) to its pointed tip (x1, y1), half-width `w` at the base. */
export function blade(t: Toon, x0: number, y0: number, x1: number, y1: number, w: number, A: number, curve = 0): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const mx = x0 + dx * 0.72 + nx * curve;
  const my = y0 + dy * 0.72 + ny * curve;
  glowAt(t, (x0 + x1) / 2, (y0 + y1) / 2, L * 0.6, lite(A), 0.45);
  const d = `M ${x0 + nx * w} ${y0 + ny * w} L ${mx + nx * w} ${my + ny * w} L ${x1} ${y1} L ${mx - nx * w * 0.8} ${my - ny * w * 0.8} L ${x0 - nx * w} ${y0 - ny * w} Z`;
  fill(t, d, mat(gem(A), 0.95, 0.2), { s: w * 0.5 });
  flat(t, `M ${x0 + nx * w * 0.3} ${y0 + ny * w * 0.3} L ${mx + nx * w * 0.3} ${my + ny * w * 0.3} L ${x1} ${y1} L ${mx - nx * w * 0.2} ${my - ny * w * 0.2} L ${x0 - nx * w * 0.2} ${y0 - ny * w * 0.2} Z`, 0xffffff, 0.85);
  ink(t, d, LINE * 0.9);
}

/** A ring emitter seen side-on, facing right: a gold-rimmed hoop with energy glowing inside. */
export function ringEmitter(t: Toon, x: number, y: number, r: number, A: number, glow = 0.8): void {
  glowAt(t, x, y, r * 1.8, lite(A), glow * 0.6);
  const outer = ellipse(x, y, r * 0.42, r);
  const inner = ellipse(x + r * 0.05, y, r * 0.24, r * 0.66);
  t.ctx.save();
  t.ctx.fillStyle = "#b9bccb";
  t.ctx.fill(new Path2D(`${outer} ${inner}`), "evenodd");
  t.ctx.restore();
  flat(t, inner, lite(A), 0.9);
  flat(t, ellipse(x - r * 0.12, y - r * 0.5, r * 0.12, r * 0.28), 0xffffff, 0.7);
  ink(t, `${outer} ${inner}`, LINE * 0.8);
  ink(t, `M ${x + r * 0.2} ${y - r * 0.9} A ${r * 0.42} ${r} 0 0 1 ${x + r * 0.2} ${y + r * 0.9}`, 1.6, K.goldLine);
}

/**
 * A ray gun barrel from the body (x0, y) to the muzzle at x1, angled by `ang` (radians, negative =
 * up): a squared-off barrel with ring emitters and a flat muzzle plate carrying a small prism.
 */
export function rayBarrel(t: Toon, x0: number, y: number, x1: number, h: number, A: number, rings: number[], ang: number): Pt {
  const { ctx } = t;
  ctx.save();
  ctx.translate(x0, y);
  ctx.rotate(ang);
  const len = x1 - x0;
  fill(t, `M 0 ${-h} L ${len - 6} ${-h} L ${len - 6} ${h} L 0 ${h} Z`, mat(K.pearl, 0.4, 0.34), { s: h * 0.8 });
  flat(t, `M 0 ${-h} L ${len - 6} ${-h} L ${len - 6} ${-h * 0.3} L 0 ${-h * 0.3} Z`, 0xffffff, 0.4);
  seam(t, `M 4 ${h * 0.35} L ${len - 10} ${h * 0.35}`, A, 1.2);
  for (const r of rings) ringEmitter(t, len * r, 0, h * 1.9, A, 0.5);
  // the flat muzzle plate and its prism
  fill(t, `M ${len - 8} ${-h * 1.7} L ${len} ${-h * 1.7} L ${len} ${h * 1.7} L ${len - 8} ${h * 1.7} Z`, mat(K.navy, 0.4), { s: 2, line: LINE * 0.8 });
  gilt(t, `M ${len} ${-h * 1.7} L ${len} ${h * 1.7}`, 1.8);
  glowAt(t, len + 4, 0, h * 4, lite(A), 0.9);
  fill(t, `M ${len} ${-h * 0.9} L ${len + 6} 0 L ${len} ${h * 0.9} Z`, mat(gem(A), 1), { s: 1, line: LINE * 0.7 });
  ctx.restore();
  return [x0 + Math.cos(ang) * (len + 6), y + Math.sin(ang) * (len + 6)];
}

/**
 * A saucer hull centred on its rim at (cx, cy): a navy belly, a silver rim band studded with lights
 * and a pearl upper deck seen from above. `lights` sets how many glow along the near rim.
 */
export function saucer(t: Toon, cx: number, cy: number, rx: number, A: number, lights = 6, belly = 0.3): void {
  const m = mats(A);
  const ryT = rx * 0.3;
  const band = Math.max(4, rx * 0.08);
  fill(t, `M ${cx - rx} ${cy} A ${rx} ${rx * belly} 0 0 0 ${cx + rx} ${cy} Z`, m.navy, { s: rx * 0.12 });
  // vents on the belly
  glowAt(t, cx, cy + rx * belly * 0.6, rx * 0.5, lite(A), 0.5);
  fill(t, ellipse(cx, cy + rx * belly * 0.55, rx * 0.22, rx * 0.06), mat(gem(A), 1), { s: 0, line: LINE * 0.7 });
  fill(t, ellipse(cx, cy, rx, ryT), m.silver, { s: band * 0.8 });
  fill(t, ellipse(cx, cy - band, rx * 0.97, ryT * 0.96), m.pearl, { s: rx * 0.06, hi: 0.7 });
  flat(t, ellipse(cx - rx * 0.35, cy - band - ryT * 0.35, rx * 0.3, ryT * 0.18), 0xffffff, 0.5);
  gilt(t, ellipse(cx, cy - band, rx * 0.72, ryT * 0.7), 1.8);
  for (let i = 0; i < lights; i++) {
    const a = Math.PI * (0.12 + (0.76 * (i + 0.5)) / lights);
    const lx = cx + Math.cos(a) * rx * 0.92;
    const ly = cy - band * 0.4 + Math.sin(a) * ryT * 0.98;
    glowAt(t, lx, ly, band * 1.6, lite(A), 0.8);
    flat(t, ellipse(lx, ly, band * 0.42, band * 0.36), 0xffffff, 0.95);
  }
}

/** A glass dome on a deck at (cx, by): a crisp rim, faint tint, a glint. Returns nothing: paint the pilot first. */
export function glassDome(t: Toon, cx: number, by: number, r: number, A: number, h = 1): void {
  const L = lite(A);
  const d = `M ${cx - r} ${by} A ${r} ${r * h} 0 0 1 ${cx + r} ${by} Z`;
  flat(t, d, L, 0.18);
  ink(t, `M ${cx - r} ${by} A ${r} ${r * h} 0 0 1 ${cx + r} ${by}`, 2.6, rgba(shade(L, 0.45), 1));
  ink(t, `M ${cx - r * 0.78} ${by - r * h * 0.3} A ${r * 0.86} ${r * h * 0.86} 0 0 1 ${cx - r * 0.1} ${by - r * h * 0.86}`, 3.2, "rgba(255,255,255,0.75)");
}

/** A hex-cell energy dome on the ground at (0, base): faint fill and lattice, a crisp rim, a glint. */
export function hexDome(t: Toon, cx: number, base: number, R: number, H: number, A: number, k = 1): void {
  const { ctx } = t;
  const L = lite(A);
  const dome = `M ${cx - R} ${base} A ${R} ${H} 0 0 1 ${cx + R} ${base} A ${R} ${R * 0.28} 0 0 1 ${cx - R} ${base} Z`;
  flat(t, dome, L, 0.16 * k);
  ctx.save();
  ctx.clip(new Path2D(dome));
  let hex = "";
  const hs = R / 4.6;
  for (let row = 0; row < 14; row++) {
    for (let col = -7; col <= 7; col++) {
      const x = cx + col * hs * 1.5;
      const y = base - row * hs * 0.87 * 2 + (col % 2 ? hs * 0.87 : 0);
      for (let i = 0; i < 3; i++) {
        const a0 = (i / 6) * Math.PI * 2;
        const a1 = ((i + 1) / 6) * Math.PI * 2;
        hex += `M ${x + Math.cos(a0) * hs} ${y + Math.sin(a0) * hs} L ${x + Math.cos(a1) * hs} ${y + Math.sin(a1) * hs} `;
      }
    }
  }
  ink(t, hex, 1.4, rgba(shade(L, 0.3), 0.34 * k));
  ctx.restore();
}

/** The dome's rim and glint, painted over whatever stands inside. */
export function hexDomeRim(t: Toon, cx: number, base: number, R: number, H: number, A: number): void {
  const L = lite(A);
  ink(t, `M ${cx - R} ${base} A ${R} ${H} 0 0 1 ${cx + R} ${base}`, 2.6, rgba(shade(L, 0.4), 1));
  ink(t, `M ${cx - R * 0.78} ${base - H * 0.5} A ${R * 0.86} ${H * 0.9} 0 0 1 ${cx - R * 0.22} ${base - H * 0.93}`, 3.2, "rgba(255,255,255,0.5)");
}

/** Horizontal teleport scan lines over a box. */
export function scanLines(t: Toon, x: number, y: number, w: number, h: number, A: number, a = 0.5): void {
  const { ctx } = t;
  ctx.save();
  ctx.globalAlpha *= a;
  for (let yy = y; yy < y + h; yy += 6) flat(t, `M ${x} ${yy} L ${x + w} ${yy} L ${x + w} ${yy + 2} L ${x} ${yy + 2} Z`, lite(A));
  ctx.restore();
}

/** Seeded random generator. */
export function rng(seed: number): () => number {
  let s = Math.max(1, Math.abs(Math.round(seed)) % 2147483646);
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** The Concord base: a smooth alloy landing plate with a faint glowing pad ring and a few panel seams. */
export function alloyTop(t: Toon, R: number, RY: number, seed: number): void {
  const { ctx } = t;
  const rnd = rng(seed * 31 + 7);
  const top = ellipse(0, 0, R, RY);
  fill(t, top, mat(K.alloy, 0.4, 0.22), { s: 7, line: 0, hi: 0.4 });
  ctx.save();
  ctx.clip(new Path2D(top));
  // brushed sheen
  flat(t, ellipse(-R * 0.3, -RY * 0.45, R * 0.55, RY * 0.16), 0xffffff, 0.1);
  // the landing-pad ring: a dark groove with a faint lavender glow seam
  const r = 0.7;
  ink(t, ellipse(0, 1.2, R * r, RY * r), 2.2, "rgba(40,36,60,0.35)");
  ink(t, ellipse(0, 0, R * r, RY * r), 3.4, "rgba(216,196,255,0.18)");
  ink(t, ellipse(0, 0, R * r, RY * r), 1.2, "rgba(232,220,255,0.55)");
  // panel seams from the ring to the rim, at a seeded twist
  const tw = rnd() * Math.PI;
  let seams = "";
  for (let i = 0; i < 4; i++) {
    const a = tw + (i * Math.PI) / 2;
    seams += `M ${Math.cos(a) * R * r} ${Math.sin(a) * RY * r} L ${Math.cos(a) * R * 1.05} ${Math.sin(a) * RY * 1.05} `;
  }
  ink(t, seams, 1.1, "rgba(40,36,60,0.3)");
  // two tiny lights on the ring
  for (const a of [tw + Math.PI * 0.25, tw + Math.PI * 1.25]) {
    const lx = Math.cos(a) * R * r;
    const ly = Math.sin(a) * RY * r;
    glowAt(t, lx, ly, 6, 0xd8c4ff, 0.5);
    flat(t, ellipse(lx, ly, 1.6, 1.4), 0xffffff, 0.8);
  }
  ink(t, ellipse(0, 2, R - 2, RY - 2), 3, "rgba(255,255,255,0.14)");
  ctx.restore();
}

/**
 * A translucent, tinted afterimage of whatever `draw` paints, offset by (dx, dy), with scan lines.
 * It stays below the silhouette threshold, so it gets no outer ink line and reads as a hologram.
 */
export function afterimage(t: Toon, dx: number, dy: number, alpha: number, tint: number, draw: (g: Toon) => void): void {
  const { ctx } = t;
  const off = makeCanvas(ctx.canvas.width, ctx.canvas.height);
  const o = off.getContext("2d")!;
  o.setTransform(ctx.getTransform());
  o.translate(dx, dy);
  draw({ ctx: o, line: t.line });
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = "source-atop";
  o.fillStyle = rgba(tint, 0.6);
  o.fillRect(0, 0, off.width, off.height);
  // holographic scan lines: knock out every other band
  o.globalCompositeOperation = "destination-out";
  const step = Math.max(3, Math.round(Math.abs(ctx.getTransform().d) * 5));
  for (let y = 0; y < off.height; y += step) o.fillRect(0, y, off.width, Math.max(1, Math.round(step * 0.4)));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha *= alpha;
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}
