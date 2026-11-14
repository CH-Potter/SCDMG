// Lumen Concord infantry, as smug alien invaders: the shock trooper (energy shield and blade), the
// marksman (long laser rifle, targeting visor), the overseer on a hover-disc (radiant aura, tractor
// beam) and the hover-blade assassin (twin energy blades, holographic afterimage).

import { contact, ellipse, fill, flat, glowAt, ink, mat, rrect, type Toon, tube } from "../toon";
import { rgba, shade } from "../palette";
import { afterimage, alienHead, blade, gem, gilt, halo, K, LINE, lite, mats, type Pt, poly, rayBarrel, ringEmitter, saucer, seam, sparkle, stud } from "./concord-kit";
import type { Design, Painter } from "./types";

/** A hex energy shield, side-on: faint fill and cells, with a crisp glowing rim that gets the ink line. */
function hexShield(t: Toon, A: number, cx: number, cy: number, h: number, w: number): void {
  const L = lite(A);
  const pts: Pt[] = [[cx, cy - h], [cx + w, cy - h / 2], [cx + w, cy + h / 2], [cx, cy + h], [cx - w, cy + h / 2], [cx - w, cy - h / 2]];
  glowAt(t, cx, cy, h * 1.4, L, 0.4);
  flat(t, poly(pts), L, 0.42);
  const c = (k: number) => poly(pts.map(([x, y]): Pt => [cx + (x - cx) * k, cy + (y - cy) * k]));
  ink(t, `${c(0.5)} M ${cx} ${cy - h * 0.5} L ${cx} ${cy - h} M ${cx} ${cy + h * 0.5} L ${cx} ${cy + h} M ${cx + w * 0.5} ${cy - h * 0.25} L ${cx + w} ${cy - h / 2} M ${cx - w * 0.5} ${cy + h * 0.25} L ${cx - w} ${cy + h / 2}`, 1.3, rgba(0xffffff, 0.55));
  ink(t, poly(pts), 3, rgba(shade(L, 0.35), 1));
  flat(t, ellipse(cx - w * 0.4, cy - h * 0.55, w * 0.2, h * 0.08), 0xffffff, 0.7);
}

// ---------- Phase Guard: an alien shock trooper with an energy shield and an energy blade ----------

export const GUARD_DESIGN: Design = { ref: 0.5, b: [-90, -176, 100, 12], top: 166 };

function guardBody(t: Toon, A: number, step: boolean): Pt {
  const { ctx } = t;
  const m = mats(A);
  // short navy half-cape behind, faction-colour lining
  fill(t, `M -6 -96 C -22 -84 -30 -58 -32 ${step ? -26 : -22} C -22 -18 -12 -20 -4 -26 C -6 -50 -4 -76 4 -96 Z`, m.navy, { s: 6 });
  fill(t, `M -32 ${step ? -26 : -22} C -22 -18 -12 -20 -4 -26 C -12 -30 -22 -31 -31 ${step ? -30 : -27} Z`, m.sash, { s: 2, line: LINE * 0.8 });
  // far leg and armoured boot
  ctx.save();
  if (step) ctx.translate(-5, -2);
  fill(t, "M -13 -46 C -14 -32 -13 -22 -12 -14 L -1 -14 C -1 -24 -1 -34 0 -46 Z", m.navyB);
  fill(t, "M -15 -17 L 0 -17 L 2 -7 L 9 -5 L 9 0 L -15 0 Z", mat(shade(K.silver, -0.2), 0.5), { s: 3 });
  ctx.restore();
  // near leg: knee guard, armoured boot with a glow seam
  ctx.save();
  if (step) ctx.translate(6, -4);
  fill(t, "M 2 -46 C 2 -34 4 -24 5 -14 L 17 -14 C 17 -24 16 -36 14 -46 Z", m.navy);
  fill(t, rrect(3, -34, 14, 10, 3), m.silver, { s: 3 });
  fill(t, "M 3 -17 L 18 -17 L 20 -7 L 31 -5 L 31 0 L 3 0 Z", m.boot, { s: 3 });
  seam(t, "M 6 -11 L 18 -11", A, 1.2);
  ctx.restore();
  // hips and gold belt
  fill(t, "M -16 -54 C -18 -46 -18 -40 -16 -36 L 16 -36 C 18 -40 18 -46 16 -54 Z", m.navyB, { s: 3 });
  fill(t, "M -17 -56 C -6 -52 8 -52 17 -56 L 17 -49 C 8 -45 -6 -45 -17 -49 Z", m.gold, { s: 2 });
  // far pauldron
  fill(t, "M -27 -91 C -27 -102 -16 -106 -8 -104 L -6 -89 C -14 -85 -23 -85 -27 -91 Z", mat(shade(K.silver, -0.15), 0.5), { s: 3 });
  // a smooth chest shell with a glowing hex core
  fill(t, "M -17 -96 C -21 -84 -20 -66 -16 -54 C -6 -50 8 -50 16 -54 C 21 -66 21 -84 16 -96 C 6 -101 -8 -101 -17 -96 Z", m.pearl, { s: 8, spec: [-9, -88, 3, 7, -0.2] });
  seam(t, "M 2 -72 L 2 -57", A, 1.4);
  glowAt(t, 2, -80, 14, lite(A), 0.8);
  fill(t, "M 2 -87 L 8 -83.5 L 8 -76.5 L 2 -73 L -4 -76.5 L -4 -83.5 Z", mat(gem(A), 1), { s: 2, line: LINE * 0.8 });
  gilt(t, "M -15 -94 C -6 -98 8 -98 15 -94", 2);
  alienHead(t, A, 2, -96, 0.95, -0.1);
  // sword arm, raised across the chest, and the energy blade
  const lift = step ? -4 : 0;
  fill(t, tube([[-8, -90], [14, -88], [34, -98 + lift]], [7, 6, 5]), m.navy, { s: 4 });
  const tip: Pt = step ? [70, -170] : [80, -160];
  blade(t, 42, -108 + lift, tip[0], tip[1], 5, A);
  fill(t, `M 31 ${-94 + lift} L 37 ${-99 + lift} L 44 ${-108 + lift} L 39 ${-112 + lift} L 32 ${-104 + lift} Z`, m.silver, { s: 1.5, line: LINE * 0.8 });
  fill(t, `M 34 ${-112 + lift} L 50 ${-102 + lift} L 48 ${-99 + lift} L 32 ${-109 + lift} Z`, m.gold, { s: 1, line: LINE * 0.7 });
  fill(t, ellipse(35, -98 + lift, 5.6, 5.2), m.glove, { s: 2 });
  // near pauldron, shield arm and its gauntlet emitter
  fill(t, tube([[8, -88], [22, -78], [30, -74]], [6.5, 5.5, 5]), m.navy, { s: 4 });
  fill(t, rrect(24, -82, 13, 13, 3), m.silver, { s: 2 });
  stud(t, 31, -75.5, 2.6, A);
  hexShield(t, A, 48, -70, 34, 15);
  fill(t, "M -4 -100 C 4 -108 18 -106 22 -96 C 20 -88 12 -84 4 -86 C -2 -88 -5 -94 -4 -100 Z", m.silver, { s: 4 });
  gilt(t, "M -2 -88 C 6 -84 14 -86 21 -92", 2);
  return tip;
}

export const guard: Painter = (t, s, f) => {
  const A = s.color;
  const step = f === 1;
  if (step) {
    // a blink: a scan-lined hologram of the trooper a step behind
    afterimage(t, -24, -2, 0.4, lite(A), (g) => guardBody(g, A, false));
    sparkle(t, -40, -120, 5, lite(A));
  }
  contact(t, 4, -2, 32, 9, 0.5);
  return guardBody(t, A, step);
};

// ---------- Ray Lancer: an alien marksman with a long laser rifle and a targeting visor ----------

export const LANCER_DESIGN: Design = { ref: 0.5, b: [-62, -170, 146, 12], top: 160 };
export const NOBLE_DESIGN: Design = { ref: 0.5, b: [-62, -170, 100, 12], top: 160 };

/** The marksman; with `pistol` it's a plain alien noble with a ray pistol (the generic fallback). */
function noble(pistol: boolean): Painter {
  return (t, s, f) => {
    const { ctx } = t;
    const A = s.color;
    const m = mats(A);
    const step = f === 1;
    contact(t, 2, -2, 30, 8, 0.5);
    // long coat tails, faction-colour lining
    fill(t, `M -10 -92 C -24 -68 -30 -38 -34 ${step ? -11 : -8} C -22 -3 -12 -5 -2 -10 L 2 -58 Z`, m.navy, { s: 6 });
    fill(t, `M -34 ${step ? -11 : -8} C -22 -3 -12 -5 -2 -10 C -10 -15 -22 -16 -32 ${step ? -16 : -13} Z`, m.sash, { s: 2, line: LINE * 0.8 });
    // slim legs, tall silver boots
    ctx.save();
    if (step) ctx.translate(-4, -2);
    fill(t, "M -10 -50 C -10 -36 -9 -22 -8 -9 L 2 -9 C 2 -22 2 -36 3 -50 Z", m.navyB);
    fill(t, "M -10 -28 L 2 -28 L 2 -8 L 9 -5 L 9 0 L -10 0 Z", mat(shade(K.silver, -0.2), 0.5), { s: 2 });
    ctx.restore();
    ctx.save();
    if (step) ctx.translate(5, -3);
    fill(t, "M 4 -50 C 5 -36 6 -22 7 -9 L 16 -9 C 16 -22 15 -36 14 -50 Z", m.navy);
    fill(t, "M 5 -28 L 16 -28 L 17 -8 L 28 -5 L 28 0 L 5 0 Z", m.boot, { s: 2 });
    seam(t, "M 7 -22 L 15 -22", A, 1.1);
    ctx.restore();
    // the far arm reaching for the foregrip
    if (!pistol) fill(t, tube([[-6, -90], [18, -84], [46, -86]], [6, 5, 4.4]), m.navyB, { s: 4 });
    // a sleek suit: pearl front, navy side, a glow seam and a gold belt
    fill(t, "M -15 -96 C -20 -80 -19 -62 -15 -46 C -5 -42 7 -42 13 -46 C 17 -62 17 -80 13 -96 C 3 -101 -6 -101 -15 -96 Z", m.navy, { s: 8 });
    fill(t, "M -2 -99 C 8 -97 13 -90 14 -80 C 15 -66 13 -54 10 -46 L 0 -45 C 2 -60 2 -82 -2 -99 Z", m.pearl, { s: 4, spec: [4, -92, 2, 5, -0.2] });
    seam(t, "M -10 -92 C -14 -76 -13 -60 -10 -48", A, 1.3);
    fill(t, "M -16 -50 C -6 -46 6 -46 14 -50 L 14 -44 C 6 -40 -6 -40 -16 -44 Z", m.gold, { s: 2 });
    // stiff collar fins behind the helmet
    fill(t, "M -10 -96 L -26 -134 L -18 -132 L -2 -100 Z", m.pearlB, { s: 3 });
    gilt(t, "M -10 -96 L -26 -134 L -18 -132", 1.8);
    alienHead(t, A, 2, -97, 0.95, -0.15, { scope: !pistol, diadem: pistol });
    // pauldron
    fill(t, "M -4 -98 C 2 -104 14 -103 17 -95 C 14 -89 6 -88 0 -90 C -4 -92 -5 -95 -4 -98 Z", m.silver, { s: 3 });
    if (pistol) {
      // a ray pistol held out at chest height
      fill(t, tube([[6, -92], [20, -86], [30, -84]], [6, 5, 4.4]), m.navy, { s: 4 });
      fill(t, "M 26 -92 L 40 -92 L 40 -82 L 32 -82 L 30 -76 L 25 -76 Z", m.pearl, { s: 2 });
      const muz = rayBarrel(t, 40, -88, 60, 3, A, [0.45], -0.06);
      fill(t, ellipse(30, -84, 5, 4.6), m.glove, { s: 2 });
      return muz;
    }
    // the laser rifle at chest height, angled a touch up: stock, receiver, a long barrel with ring emitters
    const y = step ? -87 : -88;
    const ang = -0.05;
    fill(t, `M -14 ${y + 10} L -4 ${y - 3} L 20 ${y - 5} L 22 ${y + 4} L 6 ${y + 6} L -6 ${y + 14} Z`, m.navy, { s: 3 });
    gilt(t, `M -14 ${y + 10} L -4 ${y - 3} L 20 ${y - 5}`, 1.8);
    fill(t, `M 16 ${y - 8} L 48 ${y - 10} L 50 ${y + 3} L 18 ${y + 5} Z`, m.pearl, { s: 3, spec: [24, y - 6, 3, 0.9, 0] });
    seam(t, `M 20 ${y} L 46 ${y - 2}`, A, 1.2);
    // a square sight block
    fill(t, `M 24 ${y - 15} L 40 ${y - 16} L 40 ${y - 9} L 24 ${y - 8} Z`, m.gold, { s: 1.5, line: LINE * 0.8 });
    flat(t, `M 38 ${y - 15} L 40 ${y - 15} L 40 ${y - 10} L 38 ${y - 10} Z`, lite(A), 0.95);
    const muzzle = rayBarrel(t, 48, y - 3, 132, 3.6, A, [0.3, 0.64], ang);
    fill(t, ellipse(46, y + 1, 5, 4.6), m.glove, { s: 2 });
    fill(t, tube([[6, -94], [14, -84], [18, y + 4]], [6.5, 5.5, 4.5]), m.navy, { s: 4 });
    fill(t, ellipse(19, y + 5, 5, 4.6), m.glove, { s: 2 });
    if (step) sparkle(t, muzzle[0] + 2, muzzle[1], 6, lite(A));
    return muzzle;
  };
}

export const lancer = noble(false);
export const nobleGunner = noble(true);

// ---------- Beam Warden: an alien overseer on a hover-disc, radiant aura and tractor beam ----------

export const WARDEN_DESIGN: Design = { ref: 0.62, b: [-76, -212, 116, 16], top: 200 };

export const warden: Painter = (t, s, f) => {
  const A = s.color;
  const m = mats(A);
  const L = lite(A);
  const pulse = f === 1;
  contact(t, 2, -2, 40, 10, 0.4);
  // the radiant aura behind everything
  halo(t, -4, -150, pulse ? 38 : 35, A, 16);
  // the tractor beam: a faint cone from the ring emitter down to the ground ahead
  const rx = 52;
  const ry = -108;
  const beam = `M ${rx - 4} ${ry - 10} L ${rx + 6} ${ry + 10} L 112 -2 L 70 6 Z`;
  flat(t, beam, L, pulse ? 0.3 : 0.2);
  t.ctx.save();
  t.ctx.clip(new Path2D(beam));
  for (let y = ry; y < 8; y += 9) flat(t, `M 40 ${y} L 120 ${y} L 120 ${y + 2.4} L 40 ${y + 2.4} Z`, 0xffffff, 0.22);
  t.ctx.restore();
  // the hover-disc under the overseer
  saucer(t, 0, -14, 40, A, 5, 0.34);
  // bell robe of pearl, navy front panel, gold and lavender hem
  fill(t, "M -16 -100 C -24 -74 -32 -46 -36 -24 C -16 -16 16 -16 34 -24 C 30 -46 24 -74 18 -100 Z", m.pearl, { s: 9, spec: [-12, -84, 3, 9, 0.25] });
  fill(t, "M -2 -98 C -4 -70 -5 -44 -7 -20 L 13 -20 C 12 -44 11 -70 9 -98 Z", m.navy, { s: 4 });
  fill(t, "M -36 -24 C -16 -16 16 -16 34 -24 L 33 -30 C 16 -22 -16 -22 -35 -30 Z", m.sash, { s: 2, line: LINE * 0.8 });
  gilt(t, "M -35 -30 C -16 -22 16 -22 33 -30", 2.4);
  seam(t, "M 3 -90 L 3 -40", A, 1.2);
  // mantle with tall angular collar fins
  fill(t, "M -18 -98 L -32 -138 L -24 -136 L -6 -104 Z", m.navy, { s: 3 });
  gilt(t, "M -18 -98 L -32 -138 L -24 -136", 1.8);
  fill(t, "M -24 -100 C -30 -90 -30 -80 -26 -72 C -10 -66 14 -66 28 -72 C 32 -80 30 -92 24 -100 C 10 -107 -10 -107 -24 -100 Z", m.navy, { s: 6, spec: [-17, -96, 3, 4, -0.4] });
  gilt(t, "M -26 -72 C -10 -66 14 -66 28 -72", 2.6);
  for (const x of [-16, -2, 12]) stud(t, x, -69 + Math.abs(x) * 0.05, 2.4, A, false);
  alienHead(t, A, 2, -102, 1.02, -0.08, { diadem: true });
  // the far hand, holding a glow orb at shoulder height
  const oy = pulse ? -116 : -112;
  glowAt(t, -36, oy, 20, L, 0.95);
  fill(t, ellipse(-36, oy, 5.6, 5.6), mat(gem(A), 1), { s: 2, spec: [-38, oy - 2, 1.8, 1.3] });
  fill(t, tube([[-18, -94], [-30, -98], [-36, oy + 9]], [6.5, 6, 5]), m.pearlB, { s: 4 });
  fill(t, ellipse(-36, oy + 8, 5, 4.4), m.glove, { s: 2 });
  // the near arm, held out, the tractor-beam ring hovering over the palm
  fill(t, "M 10 -98 C 22 -98 32 -100 40 -104 L 42 -96 C 34 -92 24 -90 14 -88 Z", m.pearl, { s: 3 });
  fill(t, "M 38 -106 L 44 -106 L 44 -94 L 38 -94 Z", m.gold, { s: 1, line: LINE * 0.7 });
  fill(t, ellipse(46, -100, 5, 4.6), m.glove, { s: 2 });
  t.ctx.save();
  t.ctx.translate(rx, ry);
  t.ctx.rotate(0.75);
  ringEmitter(t, 0, 0, 12, A, pulse ? 1 : 0.8);
  t.ctx.restore();
  if (pulse) sparkle(t, rx + 14, ry - 12, 4.5, L);
  return [rx, ry];
};

// ---------- Blink Dancers: alien hover-blade assassins with a holographic afterimage ----------

export const DANCER_DESIGN: Design = { ref: 0.5, b: [-104, -176, 100, 12], top: 160 };

function dancerBody(t: Toon, A: number, up: boolean): Pt {
  const m = mats(A);
  const L = lite(A);
  const lift = up ? -6 : 0;
  // hover jets under the boots
  glowAt(t, 6, -6, 22, L, 0.6);
  // a scarf streaming behind
  fill(t, `M -4 ${-98 + lift} C -24 ${-104 + lift} -44 ${-96 + lift} -66 ${-108 + lift} C -60 ${-98 + lift} -64 ${-90 + lift} -70 ${-86 + lift} C -48 ${-84 + lift} -26 ${-90 + lift} -6 ${-90 + lift} Z`, m.sash, { s: 2, line: LINE * 0.8 });
  // far leg swept back, near leg tucked: a leap
  fill(t, tube([[-4, -58 + lift], [-22, -40 + lift], [-42, -30 + lift]], [7.5, 6, 4.5]), m.navyB, { s: 3 });
  fill(t, `M -40 ${-36 + lift} L -54 ${-30 + lift} L -52 ${-24 + lift} L -38 ${-26 + lift} Z`, mat(shade(K.silver, -0.2), 0.5), { s: 1, line: LINE * 0.7 });
  fill(t, tube([[4, -58 + lift], [22, -42 + lift], [10, -18 + lift]], [8, 6.5, 5]), m.navy, { s: 3 });
  fill(t, `M 2 ${-22 + lift} L 18 ${-22 + lift} L 22 ${-12 + lift} L 2 ${-12 + lift} Z`, m.boot, { s: 2 });
  glowAt(t, 12, -8 + lift, 10, L, 0.9);
  flat(t, `M 4 ${-12 + lift} L 20 ${-12 + lift} L 16 ${-4 + lift} L 8 ${-4 + lift} Z`, L, 0.8);
  // far arm up and back, with the second blade
  const fh: Pt = [-26, -120 + lift];
  blade(t, fh[0] - 2, fh[1] - 4, fh[0] - 34, fh[1] - 28, 4, A);
  fill(t, tube([[-8, -94 + lift], [-18, -108 + lift], fh], [6, 5, 4]), m.navyB, { s: 3 });
  fill(t, ellipse(fh[0], fh[1], 4.6, 4.4), m.glove, { s: 2 });
  // a lithe bodysuit leaning into the leap: navy with a pearl chest plate and glow seams
  fill(t, `M -14 ${-96 + lift} C -18 ${-82 + lift} -14 ${-66 + lift} -8 ${-56 + lift} L 12 ${-56 + lift} C 18 ${-68 + lift} 20 ${-84 + lift} 16 ${-98 + lift} C 6 ${-104 + lift} -6 ${-104 + lift} -14 ${-96 + lift} Z`, m.navy, { s: 7 });
  fill(t, `M 0 ${-100 + lift} C 10 ${-98 + lift} 16 ${-90 + lift} 16 ${-80 + lift} C 14 ${-72 + lift} 10 ${-68 + lift} 4 ${-68 + lift} C 4 ${-80 + lift} 2 ${-92 + lift} 0 ${-100 + lift} Z`, m.pearl, { s: 3 });
  seam(t, `M -10 ${-90 + lift} C -12 ${-76 + lift} -8 ${-64 + lift} -4 ${-58 + lift}`, A, 1.2);
  fill(t, `M -10 ${-62 + lift} C -2 ${-58 + lift} 8 ${-58 + lift} 14 ${-62 + lift} L 13 ${-56 + lift} C 6 ${-53 + lift} -2 ${-53 + lift} -9 ${-56 + lift} Z`, m.gold, { s: 1, line: LINE * 0.8 });
  alienHead(t, A, 4, -99 + lift, 0.9, -0.12, { eyes: "shut" });
  // near arm slashing forward with the main blade
  fill(t, tube([[8, -92 + lift], [24, -88 + lift], [36, -86 + lift]], [6, 5, 4]), m.navy, { s: 3 });
  const tip: Pt = up ? [80, -112 + lift] : [78, -96 + lift];
  blade(t, 42, -88 + lift, tip[0], tip[1], 4.4, A);
  fill(t, `M 36 ${-96 + lift} L 42 ${-96 + lift} L 44 ${-80 + lift} L 38 ${-80 + lift} Z`, m.gold, { s: 1, line: LINE * 0.7 });
  fill(t, ellipse(38, -87 + lift, 4.8, 4.4), m.glove, { s: 2 });
  return tip;
}

export const dancer: Painter = (t, s, f) => {
  const A = s.color;
  const up = f === 1;
  // the hologram: a scan-lined ghost of the assassin a beat behind
  afterimage(t, -36, -2, 0.42, lite(A), (g) => dancerBody(g, A, !up));
  contact(t, 4, -2, 22, 7, 0.45);
  const tip = dancerBody(t, A, up);
  if (up) sparkle(t, tip[0] + 4, tip[1] - 2, 5, lite(A));
  return tip;
};

