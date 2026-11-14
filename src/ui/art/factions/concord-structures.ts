// Lumen Concord structures, alien tech: the Shield Pylon (a shield generator: a floating crystal core
// in two generator rings over a broad hex plinth), the Sunray Tower (a laser defence tower with
// a faceted turret and a ring-emitter cannon) and the Glimmer Dome (a tripod field emitter under a
// hex-cell dome).

import { contact, ellipse, fill, flat, glowAt, ink, mat, type Toon } from "../toon";
import { rgba, shade } from "../palette";
import { gemCut, gilt, hexDome, hexDomeRim, K, LINE, lite, mats, type Pt, poly, rayBarrel, seam, sparkle, stud } from "./concord-kit";
import type { Design, Painter } from "./types";

/**
 * A tapered hexagonal block from a bottom half-width `w0` at y0 to a top half-width `w1` at y1:
 * a lit left face, a front face, a shadowed right face and a flat top.
 */
function hexBlock(t: Toon, A: number, w0: number, y0: number, w1: number, y1: number, front: number, side: number): void {
  const m = mats(A);
  const f0 = w0 * 0.55;
  const f1 = w1 * 0.55;
  const left: Pt[] = [[-w0, y0 - 8], [-f0, y0], [-f1, y1], [-w1, y1 - 6]];
  const mid: Pt[] = [[-f0, y0], [f0, y0], [f1, y1], [-f1, y1]];
  const right: Pt[] = [[f0, y0], [w0, y0 - 8], [w1, y1 - 6], [f1, y1]];
  const top: Pt[] = [[-w1, y1 - 6], [-f1, y1], [f1, y1], [w1, y1 - 6], [f1, y1 - 12], [-f1, y1 - 12]];
  fill(t, poly(left), mat(shade(front, 0.12), 0.4, 0.3), { s: 3 });
  fill(t, poly(mid), mat(front, 0.4, 0.3), { s: 4 });
  fill(t, poly(right), mat(side, 0.3, 0.3), { s: 3 });
  fill(t, poly(top), m.pearl, { s: 2, hi: 0.8 });
  gilt(t, `M ${-f0} ${y0} L ${-f1} ${y1} M ${f0} ${y0} L ${f1} ${y1}`, 2);
}

// ---------- Shield Pylon: a shield generator ----------

export const PYLON_DESIGN: Design = { ref: 0.85, b: [-92, -238, 92, 26], top: 224 };

export const pylon: Painter = (t, s, f) => {
  const A = s.color;
  const m = mats(A);
  const L = lite(A);
  const pulse = f === 1;
  contact(t, 0, -6, 84, 16, 0.5);
  // a broad, low hex plinth with glowing seams
  hexBlock(t, A, 78, -2, 54, -62, K.pearlB, 0x5a5e8a);
  seam(t, "M -24 -10 L -18 -56 M 24 -10 L 18 -56", A, 1.4);
  for (const x of [-12, 0, 12]) stud(t, x, -30, 2.6, A, x === 0);
  // the emitter plate on top
  fill(t, ellipse(0, -70, 34, 8), m.gold, { s: 2 });
  glowAt(t, 0, -72, 30, L, 0.8);
  fill(t, ellipse(0, -72, 24, 5.4), m.gem, { s: 1, line: LINE * 0.7 });
  // the core: a faceted crystal floating between two generator rings
  const cy = pulse ? -152 : -146;
  const ring = (y: number, rx: number, back: boolean) => {
    const d = back ? `M ${-rx} ${y} A ${rx} ${rx * 0.26} 0 0 1 ${rx} ${y}` : `M ${-rx} ${y} A ${rx} ${rx * 0.26} 0 0 0 ${rx} ${y}`;
    ink(t, d, 7, back ? "#7e8098" : "#b9bccb");
    ink(t, d, 2.4, rgba(shade(L, back ? 0 : 0.3), back ? 0.7 : 1));
  };
  ring(cy - 26, 40, true);
  ring(cy + 24, 54, true);
  glowAt(t, 0, cy, pulse ? 96 : 84, L, 0.55);
  gemCut(t, [[0, cy - 58], [24, cy - 4], [0, cy + 40], [-24, cy - 4]], m.gem, 8, 0.42);
  glowAt(t, 0, cy - 4, 16, 0xffffff, 0.7);
  ring(cy - 26, 40, false);
  ring(cy + 24, 54, false);
  for (const a of [0.5, 2.6]) {
    const x = Math.cos(a + (pulse ? 0.4 : 0)) * 54;
    const y = cy + 24 + Math.sin(a + (pulse ? 0.4 : 0)) * 14;
    glowAt(t, x, y, 8, L, 0.9);
    flat(t, ellipse(x, y, 2.4, 2), 0xffffff, 0.95);
  }
  return [0, cy - 58];
};

// ---------- Sunray Tower: a laser defence tower ----------

export const OBELISK_DESIGN: Design = { ref: 0.85, b: [-84, -232, 136, 26], top: 220 };

export const obelisk: Painter = (t, s, f) => {
  const A = s.color;
  const m = mats(A);
  const L = lite(A);
  const pulse = f === 1;
  contact(t, 0, -6, 78, 16, 0.5);
  // a broad tapered tower, faceted, navy with pearl and gold
  hexBlock(t, A, 66, -2, 34, -146, K.navy, K.navyDeep);
  // horizontal gold bands and a vertical glow slot
  gilt(t, "M -36 -40 L 36 -40 M -28 -96 L 28 -96", 2.6);
  for (let y = -54; y >= -128; y -= 14) {
    glowAt(t, 0, y, 8, L, 0.55);
    flat(t, `M -4 ${y} L 4 ${y} L 3 ${y - 8} L -3 ${y - 8} Z`, L, 0.95);
  }
  // the turret: a flat-topped faceted block, a visor slit, a cannon with ring emitters
  const ty = -154;
  const left: Pt[] = [[-46, ty - 6], [-28, ty], [-28, ty - 34], [-46, ty - 40]];
  const mid: Pt[] = [[-28, ty], [30, ty], [30, ty - 34], [-28, ty - 34]];
  const right: Pt[] = [[30, ty], [46, ty - 6], [46, ty - 40], [30, ty - 34]];
  const top: Pt[] = [[-46, ty - 40], [-28, ty - 34], [30, ty - 34], [46, ty - 40], [30, ty - 46], [-28, ty - 46]];
  fill(t, poly(left), m.pearl, { s: 3 });
  fill(t, poly(mid), m.pearlB, { s: 5 });
  fill(t, poly(right), m.silver, { s: 3 });
  fill(t, poly(top), m.pearl, { s: 2, hi: 0.8 });
  gilt(t, `M -28 ${ty} L 30 ${ty} M -28 ${ty - 34} L 30 ${ty - 34}`, 2);
  glowAt(t, 6, ty - 22, 22, L, 0.7);
  fill(t, `M -16 ${ty - 25} L 26 ${ty - 25} L 26 ${ty - 18} L -16 ${ty - 18} Z`, m.gem, { s: 0, line: LINE * 0.8 });
  flat(t, `M -16 ${ty - 25} L 26 ${ty - 25} L 26 ${ty - 23} L -16 ${ty - 23} Z`, 0xffffff, 0.8);
  const muzzle = rayBarrel(t, 46, ty - 14, 128, 6, A, [0.26, 0.58], -0.1);
  if (pulse) sparkle(t, muzzle[0] + 4, muzzle[1], 7, L);
  return muzzle;
};

// ---------- Glimmer Dome: a deployable field emitter under a hex dome ----------

export const WARD_DESIGN: Design = { ref: 0.7, b: [-92, -186, 92, 28], top: 172 };

export const ward: Painter = (t, s, f) => {
  const A = s.color;
  const m = mats(A);
  const L = lite(A);
  const pulse = f === 1;
  const R = pulse ? 80 : 76;
  const H = pulse ? 94 : 90;
  const base = -4;
  // a rune ring on the ground, the dome's fill and lattice
  ink(t, ellipse(0, base, R * 0.62, R * 0.62 * 0.3), 2, rgba(L, 0.45));
  hexDome(t, 0, base, R, H, A, pulse ? 1.3 : 1.1);
  // the beam from the emitter to the dome's crown
  glowAt(t, 0, base - H * 0.62, 30, L, 0.5);
  flat(t, `M -5 -52 L 5 -52 L 2 ${base - H + 4} L -2 ${base - H + 4} Z`, L, 0.35);
  // tripod: three short, angled legs with flat feet
  const legPlate = mat(shade(K.silver, -0.15), 0.5, 0.34);
  for (const [fx, fy, dark] of [[-36, -10, 1], [34, -14, 1], [8, 12, 0]] as const) {
    const d = `M ${-6 + fx * 0.15} -36 L ${6 + fx * 0.15} -36 L ${fx + 4} ${fy} L ${fx - 4} ${fy} Z`;
    fill(t, d, dark ? m.navyB : m.navy, { s: 2 });
    fill(t, `M ${fx - 9} ${fy + 2} L ${fx + 9} ${fy + 2} L ${fx + 6} ${fy - 4} L ${fx - 6} ${fy - 4} Z`, dark ? legPlate : m.silver, { s: 1.5 });
  }
  // the emitter hub: a small faceted block with a glowing lens on top
  fill(t, poly([[-20, -38], [-12, -32], [-12, -50], [-20, -56]]), m.pearl, { s: 2 });
  fill(t, poly([[-12, -32], [12, -32], [12, -50], [-12, -50]]), m.pearlB, { s: 3 });
  fill(t, poly([[12, -32], [20, -38], [20, -56], [12, -50]]), m.silver, { s: 2 });
  gilt(t, "M -12 -32 L 12 -32", 2);
  stud(t, 0, -41, 3, A);
  glowAt(t, 0, -58, 20, L, 0.9);
  fill(t, poly([[-20, -56], [-12, -50], [12, -50], [20, -56], [12, -61], [-12, -61]]), m.gem, { s: 1.5, line: LINE * 0.8 });
  // the crown projector, hovering at the top of the dome
  const py = base - H + (pulse ? 4 : 8);
  glowAt(t, 0, py, 18, L, 0.9);
  fill(t, `M -9 ${py} L 0 ${py - 7} L 9 ${py} L 0 ${py + 7} Z`, m.gem, { s: 1, line: LINE * 0.8 });
  hexDomeRim(t, 0, base, R, H, A);
  if (pulse) sparkle(t, R * 0.5, base - H * 0.78, 5, L);
  return [0, -58];
};
