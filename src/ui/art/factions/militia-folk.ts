// Dustline Militia infantry: Rivet Grunts, Patch Medic, Ridgeline Squinter, Front Porch Grannies.
// Each has its own silhouette and colour block so they read apart at board size:
// Grunts = orange tin hat, denim, shovel on the back; Medic = white coat and hat, big aid box;
// Squinter = kneeling, wide straw hat, very long scoped rifle; Grannies = silver bun, skirt, raised rolling pin.

import type { FigureSpec } from "../figures";
import { shade } from "../palette";
import { tube } from "../toon";
import type { Design, Painter } from "./types";
import { at, chevron, poly, contact, ellipse, eyeDot, fill, flat, glowAt, ink, K, LINE, type Mat, mat, mitt, patch, place, rivets, rrect, type Toon } from "./militia-kit";

// ---------- shared body parts ----------

/** Standing legs and boots (back leg first). */
function legs(t: Toon, pant: Mat, step: boolean, kneePatch = true): void {
  const { ctx } = t;
  const boot = mat(K.leatherDark, 0.2);
  ctx.save();
  if (step) ctx.translate(-6, -3);
  fill(t, "M -15 -47 C -17 -33 -16 -23 -14 -13 L -2 -13 C -1 -23 -1 -35 -1 -47 Z", mat(shade(pant.base, -0.16)));
  fill(t, "M -18 -16 C -20 -6 -18 0 -11 0 L 1 0 C 6 0 7 -6 3 -10 C 0 -14 -5 -17 -10 -17 Z", boot, { s: 4 });
  ctx.restore();
  ctx.save();
  if (step) ctx.translate(7, -5);
  fill(t, "M 0 -47 C 0 -34 2 -24 4 -13 L 17 -13 C 18 -25 17 -36 15 -47 Z", pant);
  if (kneePatch) patch(t, 4, -33, 11, 9);
  fill(t, "M 1 -16 C 0 -6 2 0 9 0 L 23 0 C 28 0 30 -6 26 -10 C 23 -14 16 -17 10 -17 Z", boot, { s: 4, spec: [20, -10, 3, 1.6] });
  ink(t, "M 3 -2 L 27 -2", LINE * 1.3);
  ctx.restore();
}

const TORSO = "M -21 -89 C -26 -75 -26 -59 -23 -45 C -12 -39 8 -39 19 -44 C 23 -59 22 -76 17 -89 C 6 -94 -10 -94 -21 -89 Z";

/** Belt with a brass buckle and a canvas pouch. */
function belt(t: Toon): void {
  fill(t, "M -24 -51 C -10 -47 8 -47 21 -51 L 21 -44 C 8 -41 -10 -41 -24 -45 Z", mat(K.leather), { s: 3 });
  fill(t, rrect(-2, -50, 8, 7, 1.5), mat(K.brass, 0.7), { s: 2, line: LINE * 0.8 });
  fill(t, rrect(11, -52, 9, 11, 2.5), mat(K.canvas), { s: 3, line: LINE * 0.8 });
}

/** Head (skin), ear and a big nose, facing right. */
function face(t: Toon, x: number, y: number, r: number, skin: number): void {
  fill(t, ellipse(x, y, r, r * 1.03), mat(skin), { s: 6 });
  fill(t, ellipse(x - r * 0.82, y + 2, r * 0.24, r * 0.3), mat(shade(skin, -0.08)), { s: 2, line: LINE * 0.8 });
  fill(t, ellipse(x + r * 0.95, y + r * 0.12, r * 0.3, r * 0.26), mat(shade(skin, -0.04)), { s: 2, line: LINE * 0.8 });
}

/** Rivet rifle (two-handed). Returns its muzzle in figure space. */
function rivetRifle(t: Toon, ox: number, oy: number, a: number, L: number): [number, number] {
  at(t, ox, oy, a, () => {
    fill(t, "M -26 -6 C -29 -2 -27 6 -20 6 L -6 3 L -6 -5 Z", mat(K.wood), { s: 3 });
    fill(t, rrect(-8, -9, 32, 13, 4), mat(K.gun, 0.6), { s: 4, spec: [0, -7, 5, 1.4, 0] });
    fill(t, rrect(22, -7, L, 6, 2.5), mat(K.gun, 0.6), { s: 2, spec: [26, -6, 6, 0.8, 0] });
    fill(t, rrect(30, -8.5, 4, 9, 1.2), mat(K.brass, 0.6), { s: 1.5, line: LINE * 0.7 });
    fill(t, poly([[18 + L, -9], [28 + L, -11], [28 + L, 3], [18 + L, 1]]), mat(K.gun, 0.6), { s: 2 });
    // the box of rivets that gives it its name
    fill(t, rrect(0, 3, 16, 11, 1.5), mat(K.brass, 0.7), { s: 3, spec: [3, 5, 2.6, 1.2, 0] });
    rivets(t, [[0, -3], [14, -3]], 1.2);
  });
  return place(ox, oy, a, 28 + L, -4);
}

// ---------- Rivet Grunts ----------

/** Rivet Grunt: the gunline. Orange tin hat, denim, riveted tin breastplate, rifle, shovel slung on the back. */
export const grunt: Painter = (t, s, f) => {
  const A = s.color;
  const step = f === 1;
  const denim = mat(K.denim);
  contact(t, 2, -2, 32, 9, 0.55);

  // --- back: jump jets, or a pack with the shovel strapped on
  if (s.jump) {
    for (const x of [-42, -32]) fill(t, rrect(x, -102, 14, 42, 2), mat(K.tin, 0.6), { spec: [x + 4, -96, 2, 6] });
    fill(t, rrect(-44, -88, 30, 6, 2), mat(A, 0.4), { s: 2, line: LINE * 0.8 });
    glowAt(t, -30, -52, 18, 0xff9a3a, 0.8);
    fill(t, `M -40 -60 Q -35 ${step ? -36 : -42} -30 ${step ? -28 : -36} Q -26 -46 -20 -60 Z`, mat(0xffb347), { s: 0, line: LINE * 0.8 });
  } else {
    fill(t, "M -36 -88 C -40 -74 -38 -60 -32 -52 L -18 -54 L -18 -88 C -24 -92 -32 -92 -36 -88 Z", mat(K.canvasDark));
    // shovel: handle up the back, blade up behind the head
    fill(t, tube([[-6, -50], [-30, -124]], [2.8, 2.8]), mat(K.wood), { s: 1.5 });
    at(t, -30, -124, -0.314, () => {
      fill(t, rrect(-3.5, -7, 7, 9, 2), mat(K.gun, 0.5), { s: 1.5, line: LINE * 0.8 });
      fill(t, "M -10 -6 L -11 -20 Q -11 -31 0 -36 Q 11 -31 11 -20 L 10 -6 Q 0 -9 -10 -6 Z", mat(K.steel, 0.8), { s: 4, spec: [-4, -26, 2.4, 4, 0] });
      ink(t, "M 0 -10 L 0 -28", LINE * 0.7, "rgba(40,30,30,0.45)");
    });
    fill(t, "M -11 -46 Q -6 -40 -1 -46 Q -6 -52 -11 -46 Z", mat(K.wood), { s: 1, line: LINE * 0.8 });
  }

  legs(t, denim, step);

  const { ctx } = t;
  ctx.save();
  ctx.translate(0, -46);
  ctx.rotate(0.05);
  ctx.translate(0, 46);
  const ranged = s.ranged;
  // back arm (reaching for the foregrip, or down at the side)
  const RA = -0.16;
  const grip = place(2, -76, RA, 30, 1);
  const trig = place(2, -76, RA, 5, 5);
  if (ranged) fill(t, tube([[-6, -84], [10, -78], grip], [8, 7, 5.5]), mat(K.denimDark), { s: 5 });
  else fill(t, tube([[-8, -83], [-14, -68], [-10, -56]], [8, 7, 6]), mat(K.denimDark), { s: 5 });
  // torso: denim, braces, riveted tin breastplate with the orange chevron
  fill(t, TORSO, denim, { s: 9 });
  fill(t, "M -15 -90 L -9 -91 L -7 -60 L -13 -60 Z", mat(K.leather), { s: 2, line: LINE * 0.8 });
  fill(t, "M -14 -82 C -4 -85 8 -85 14 -82 L 13 -58 C 4 -55 -6 -55 -15 -58 Z", mat(K.tin, 0.55), { s: 5, spec: [-8, -79, 4, 1.6, -0.2] });
  chevron(t, 0, -72, 1, A);
  rivets(t, [[-11, -79], [10, -79], [-11, -61], [10, -61]], 1.4);
  if (s.armoured) fill(t, ellipse(-14, -86, 10, 7), mat(K.tin, 0.6), { s: 3 });
  belt(t);

  // --- head: neckerchief, face, Brodie-style tin hat in the faction colour
  fill(t, "M -15 -89 C -10 -83 10 -83 15 -89 C 12 -97 -12 -97 -15 -89 Z", mat(K.red), { s: 3 });
  fill(t, "M 9 -88 L 18 -80 L 12 -78 Z", mat(K.red), { s: 1, line: LINE * 0.8 });
  face(t, 3, -105, 17, K.skin);
  eyeDot(t, 13, -107, 2.6);
  ink(t, "M 8 -113 L 18 -111", 2.2, "#4e3220");
  ink(t, "M 9 -96 Q 14 -94 18 -96", LINE * 0.8, "rgba(60,30,20,0.7)");
  flat(t, ellipse(-2, -98, 9, 5), "rgba(90,60,40,0.18)");
  // hat: wide flat brim seen from above, then the dome
  fill(t, ellipse(4, -119, 31, 9.5), mat(shade(A, -0.1), 0.45), { s: 4, spec: [-14, -123, 6, 1.4, -0.1] });
  fill(t, "M -15 -120 C -16 -137 -7 -146 4 -146 C 16 -146 24 -137 23 -120 C 14 -116 -6 -116 -15 -120 Z", mat(A, 0.55), { s: 8, spec: [-5, -137, 4.5, 2.6, -0.6] });
  ink(t, "M -14 -123 C -4 -119 14 -119 22 -123", LINE * 0.8, "rgba(40,20,10,0.5)");
  rivets(t, [[-24, -120], [30, -121]], 1.4);

  // --- weapon and front arm
  let muzzle: [number, number];
  if (ranged) {
    muzzle = rivetRifle(t, 2, -76, RA, s.long ? 50 : 36);
    mitt(t, grip[0], grip[1]);
    fill(t, tube([[10, -84], [20, -74], trig], [8.5, 7.5, 6]), denim, { s: 6 });
    fill(t, ellipse(11, -86, 9.5, 6), mat(A, 0.3), { s: 3, spec: [8, -89, 2.6, 1.2] });
    mitt(t, trig[0], trig[1]);
  } else {
    // shovel in both hands, raised to swing
    fill(t, tube([[-6, -46], [16, -76], [34, -104]], [2.8, 2.8, 2.8]), mat(K.wood), { s: 1.5 });
    at(t, 38, -110, 0.6, () => fill(t, "M -10 6 L -11 -8 Q -11 -19 0 -24 Q 11 -19 11 -8 L 10 6 Q 0 3 -10 6 Z", mat(K.steel, 0.8), { s: 4, spec: [-4, -12, 2.4, 4, 0] }));
    fill(t, tube([[10, -83], [18, -74], [14, -70]], [8.5, 7.5, 6]), denim, { s: 6 });
    fill(t, ellipse(11, -86, 9.5, 6), mat(A, 0.3), { s: 3, spec: [8, -89, 2.6, 1.2] });
    mitt(t, 14, -70);
    muzzle = [48, -122];
  }
  ctx.restore();
  return muzzle;
};

// ---------- Patch Medic ----------

/** Patch Medic: long cream duster covered in patches, white hat with the red cross, aid box with rocket hops, staple pistol. */
export const medic: Painter = (t, s, f) => {
  const A = s.color;
  const step = f === 1;
  const coat = mat(K.cream);
  const coatB = mat(shade(K.cream, -0.16));
  contact(t, 2, -2, 34, 9, 0.55);

  // --- aid box with the rocket hop underneath
  for (const x of [-44, -34]) fill(t, poly([[x, -62], [x + 9, -62], [x + 10, -46], [x - 1, -46]]), mat(K.brass, 0.6), { s: 2, line: LINE * 0.8 });
  if (step) {
    glowAt(t, -36, -36, 16, 0xff9a3a, 0.8);
    fill(t, "M -44 -46 Q -40 -30 -36 -24 Q -32 -32 -26 -46 Z", mat(0xffb347), { s: 0, line: LINE * 0.8 });
  }
  fill(t, rrect(-50, -104, 32, 48, 6), mat(K.white, 0.2), { s: 7 });
  flat(t, rrect(-41, -86, 14, 5, 1), K.red);
  flat(t, rrect(-36.5, -90.5, 5, 14, 1), K.red);
  fill(t, rrect(-52, -70, 36, 6, 2), mat(K.leather), { s: 2, line: LINE * 0.8 });
  fill(t, rrect(-38, -71.5, 6, 9, 1.5), mat(K.brass, 0.7), { s: 1.5, line: LINE * 0.7 });

  legs(t, mat(K.denimDark), step, false);

  const { ctx } = t;
  ctx.save();
  ctx.translate(0, -46);
  ctx.rotate(0.04);
  ctx.translate(0, 46);
  // back arm
  fill(t, tube([[-8, -83], [-15, -68], [-12, -56]], [8, 7, 6]), coatB, { s: 5 });
  mitt(t, -12, -56);
  // long duster coat over the torso and thighs, split at the front
  fill(t, "M -22 -91 C -29 -70 -32 -44 -30 -22 C -16 -16 4 -16 22 -22 C 24 -46 23 -72 18 -90 C 6 -96 -10 -96 -22 -91 Z", coat, { s: 9 });
  ink(t, "M 8 -84 C 10 -62 10 -40 8 -20", LINE * 0.9);
  flat(t, "M 8 -40 L 22 -22 L 9 -20 Z", "rgba(60,40,60,0.18)");
  patch(t, -24, -40, 11, 9, K.canvas);
  patch(t, 12, -36, 8, 8, K.denim);
  // satchel strap and belt with the duct tape roll
  fill(t, "M -14 -92 L -8 -93 L 14 -52 L 8 -50 Z", mat(K.leather), { s: 2, line: LINE * 0.8 });
  fill(t, "M -26 -54 C -10 -50 8 -50 21 -54 L 21 -47 C 8 -44 -10 -44 -26 -48 Z", mat(K.leather), { s: 3 });
  fill(t, ellipse(-17, -46, 8, 7), mat(K.tin, 0.7), { s: 3, spec: [-20, -49, 2, 1.2] });
  fill(t, ellipse(-17, -46, 3.4, 3), mat(K.canvasDark), { s: 0, line: LINE * 0.7 });
  // red cross pocket
  fill(t, rrect(-6, -82, 12, 11, 2), mat(K.white), { s: 2, line: LINE * 0.8 });
  flat(t, rrect(-3.5, -78, 7, 3, 0.6), K.red);
  flat(t, rrect(-1.5, -80.5, 3, 8, 0.6), K.red);

  // --- head: round brass spectacles, moustache, white hat with a red cross and a headlamp
  fill(t, "M -15 -89 C -10 -83 10 -83 15 -89 C 12 -97 -12 -97 -15 -89 Z", mat(A, 0.2), { s: 3 });
  face(t, 3, -105, 17, K.skinTan);
  fill(t, "M 8 -98 C 12 -102 20 -102 23 -97 C 20 -94 16 -95 15 -96 C 13 -94 9 -94 8 -98 Z", mat(0x6b4a34), { s: 1, line: LINE * 0.7 });
  fill(t, ellipse(13, -107, 5, 5), mat(K.brass, 0.7), { s: 1.5 });
  fill(t, ellipse(13, -107, 3.4, 3.4), mat(K.lens, 1), { s: 1, line: LINE * 0.5, spec: [12, -108.5, 1, 0.8] });
  ink(t, "M 18 -107 L 22 -106", LINE);
  fill(t, ellipse(4, -119, 27, 8.5), mat(shade(K.white, -0.12), 0.4), { s: 3 });
  fill(t, "M -14 -120 C -15 -137 -7 -146 4 -146 C 16 -146 23 -137 22 -120 C 13 -116 -5 -116 -14 -120 Z", mat(K.white, 0.55), { s: 8, spec: [-5, -137, 4.5, 2.6, -0.6] });
  flat(t, rrect(-4, -136, 12, 4.4, 1), K.red);
  flat(t, rrect(-0.2, -140, 4.4, 12, 1), K.red);
  glowAt(t, 23, -126, 10, 0xfff0b0, 0.6);
  fill(t, ellipse(21, -126, 4, 4.4), mat(K.brass, 0.7), { s: 1.5, line: LINE * 0.8 });
  fill(t, ellipse(21.6, -126, 2.4, 2.8), mat(0xfff3c0, 0.9), { s: 0, line: 0 });

  // --- staple pistol, front arm with the orange armband
  const PA = -0.2;
  const pgrip = place(16, -80, PA, 1, 5);
  at(t, 16, -80, PA, () => {
    fill(t, rrect(-3, -2, 8, 13, 2.5), mat(K.gun, 0.4), { s: 2 });
    fill(t, rrect(-6, -12, 30, 11, 3), mat(A, 0.45), { s: 3, spec: [0, -10, 5, 1.2, 0] });
    fill(t, poly([[18, -11], [27, -12], [27, -2], [18, -3]]), mat(K.gun, 0.6), { s: 1.5, line: LINE * 0.8 });
    flat(t, rrect(0, -4, 16, 2, 0.6), "rgba(220,225,230,0.9)");
  });
  fill(t, tube([[10, -84], [21, -73], pgrip], [8.5, 7.5, 6]), coat, { s: 6 });
  fill(t, rrect(13, -80, 13, 6, 2), mat(A, 0.3), { s: 2, line: LINE * 0.8 });
  mitt(t, pgrip[0], pgrip[1], K.skinTan);
  ctx.restore();
  return place(16, -80, PA, 27, -7);
};

// ---------- Ridgeline Squinter ----------

/** Ridgeline Squinter: kneeling marksman under a wide straw hat and a dry-grass ghillie, long scoped varmint rifle. */
export const squinter: Painter = (t, s, f) => {
  const A = s.color;
  const recoil = f === 1;
  const pant = mat(K.denimDark);
  const ghillie = 0x9c9150;
  contact(t, -4, -2, 46, 10, 0.55);

  // --- back leg kneeling: thigh down to the knee on the ground, shin and boot trailing behind
  fill(t, tube([[-34, -7], [-6, -8]], [7, 8.5]), mat(shade(K.denimDark, -0.14)), { s: 4 });
  fill(t, "M -32 -15 L -50 -13 C -55 -11 -55 -2 -50 -1 L -32 -1 Z", mat(K.leatherDark, 0.2), { s: 3 });
  fill(t, tube([[-12, -40], [-5, -9]], [10, 8.5]), mat(shade(K.denimDark, -0.14)), { s: 4 });
  // front leg: knee up, boot planted
  fill(t, tube([[0, -40], [22, -38]], [10, 9]), pant, { s: 4 });
  fill(t, tube([[22, -38], [21, -12]], [9, 7.5]), pant, { s: 4 });
  patch(t, 15, -44, 11, 9);
  fill(t, "M 12 -15 C 10 -4 13 0 20 0 L 34 0 C 39 0 40 -6 36 -10 C 33 -14 26 -17 20 -17 Z", mat(K.leatherDark, 0.2), { s: 4, spec: [30, -10, 3, 1.6] });

  const { ctx } = t;
  ctx.save();
  if (recoil) ctx.translate(-3, 0);
  // far arm to the trigger
  fill(t, tube([[-10, -80], [0, -70], [14, -72]], [7.5, 6.5, 5.5]), mat(shade(ghillie, -0.2)), { s: 4 });
  // torso and the ragged ghillie cape over it
  fill(t, "M -24 -82 C -28 -66 -26 -52 -20 -38 C -10 -34 6 -34 14 -38 C 18 -54 18 -70 14 -84 C 4 -89 -14 -89 -24 -82 Z", mat(K.canvasDark), { s: 8 });
  fill(t, "M -26 -90 C -10 -98 8 -96 16 -88 C 18 -78 12 -66 8 -58 L 4 -52 L 0 -58 L -6 -48 L -10 -56 L -16 -46 L -20 -56 L -27 -48 L -28 -60 L -34 -54 C -32 -70 -32 -82 -26 -90 Z", mat(ghillie), { s: 7 });
  for (const [x, y] of [[-24, -74], [-12, -80], [0, -72], [-18, -62], [6, -82]] as const) ink(t, `M ${x} ${y} l -3 7 M ${x + 3} ${y} l 1 8`, 1.4, "rgba(236,214,140,0.8)");

  // --- the rifle: long, scoped, brass-banded
  const a = -0.02;
  at(t, -6, -78, a, () => {
    fill(t, "M -8 -5 C -12 -2 -12 8 -6 9 L 16 5 L 16 -4 Z", mat(K.wood), { s: 3 });
    fill(t, rrect(12, -6, 30, 10, 3), mat(K.wood), { s: 3 });
    fill(t, rrect(26, -7, 22, 9, 2.5), mat(K.gun, 0.6), { s: 3 });
    fill(t, rrect(44, -5, 84, 5.5, 2.5), mat(K.gun, 0.6), { s: 2, spec: [52, -4, 10, 0.8, 0] });
    for (const x of [62, 96]) fill(t, rrect(x, -6.5, 4, 8.5, 1.2), mat(K.brass, 0.6), { s: 1, line: LINE * 0.7 });
    fill(t, poly([[124, -7], [133, -8.5], [133, 3], [124, 2]]), mat(K.gun, 0.6), { s: 1.5 });
    // scope
    fill(t, rrect(22, -14, 4, 8, 1), mat(K.gun, 0.5), { s: 1, line: LINE * 0.7 });
    fill(t, rrect(40, -14, 4, 8, 1), mat(K.gun, 0.5), { s: 1, line: LINE * 0.7 });
    fill(t, rrect(16, -21, 36, 8, 4), mat(K.brass, 0.75), { s: 2.5, spec: [22, -20, 8, 1, 0] });
    fill(t, ellipse(52, -17, 3, 5), mat(K.lens, 1), { s: 0, line: LINE * 0.7 });
    glowAt(t, 54, -17, 7, 0xbff6ff, 0.5);
  });

  // --- head down on the stock: squint, white walrus moustache, wide straw hat with the orange band
  face(t, 8, -98, 16, K.skinTan);
  ink(t, "M 13 -101 Q 17 -99 21 -101", 2, "#2a1a12");
  ink(t, "M 12 -106 L 22 -104", 2.4, "#e9e4dc");
  fill(t, "M 10 -92 C 14 -96 24 -96 27 -91 C 24 -86 19 -88 18 -90 C 16 -86 10 -87 10 -92 Z", mat(K.hair), { s: 1.5, line: LINE * 0.7 });
  fill(t, ellipse(7, -113, 37, 11.5), mat(K.hay, 0.2), { s: 4, spec: [-14, -118, 7, 1.4, -0.1] });
  ink(t, "M -22 -112 Q 7 -104 38 -113", LINE * 0.7, "rgba(120,80,20,0.5)");
  fill(t, "M -9 -114 C -11 -128 -3 -136 7 -136 C 17 -136 23 -128 22 -114 C 14 -110 -2 -110 -9 -114 Z", mat(K.hay, 0.2), { s: 6 });
  fill(t, "M -10 -117 C -2 -113 14 -113 22 -117 L 22 -112 C 14 -108 -2 -108 -10 -112 Z", mat(A, 0.3), { s: 1.5, line: LINE * 0.8 });
  ink(t, "M 7 -135 Q 9 -126 7 -116", LINE * 0.7, "rgba(120,80,20,0.55)");

  // --- near arm along the forestock
  fill(t, tube([[4, -84], [24, -76], [40, -76]], [8, 7, 5.5]), mat(ghillie), { s: 5 });
  mitt(t, 41, -76);
  ctx.restore();
  const m = place(-6, -78, a, 133, -2.5);
  return [m[0] - (recoil ? 3 : 0), m[1]];
};

export const SQUINTER_DESIGN: Design = { ref: 0.47, b: [-66, -150, 136, 12], top: 138 };

// ---------- Front Porch Grannies ----------

/** Front Porch Granny: silver bun, orange shawl, plum dress and apron, rolling pin raised, brass blunderbuss at the hip. */
export const granny: Painter = (t, s, f) => {
  const A = s.color;
  const swing = f === 1;
  const dress = mat(K.plum);
  contact(t, 2, -2, 32, 9, 0.55);

  // --- the rolling pin raised behind her head (far arm)
  const pinA = swing ? -0.55 : -0.85;
  fill(t, tube([[-10, -88], [-20, -104], [-22, -120]], [7, 6.5, 6]), mat(shade(K.plum, -0.16)), { s: 4 });
  at(t, -22, -122, pinA, () => {
    fill(t, rrect(-30, -3, 8, 6, 3), mat(K.woodLight), { s: 1.5, line: LINE * 0.8 });
    fill(t, rrect(22, -3, 8, 6, 3), mat(K.woodLight), { s: 1.5, line: LINE * 0.8 });
    fill(t, rrect(-23, -8, 46, 16, 7), mat(K.woodLight), { s: 4, spec: [-14, -5, 6, 1.2, 0] });
    ink(t, "M -12 -7 L -12 7 M 10 -7 L 10 7", LINE * 0.6, "rgba(90,50,20,0.4)");
  });
  mitt(t, -22, -121, K.skinPale);

  // --- boots, then the skirt over them
  fill(t, "M -16 -12 C -18 -4 -14 0 -8 0 L 2 0 C 6 0 6 -6 2 -9 Z", mat(K.leatherDark, 0.2), { s: 3 });
  fill(t, `M ${swing ? 8 : 4} -12 C ${swing ? 7 : 3} -4 ${swing ? 10 : 6} 0 ${swing ? 16 : 12} 0 L ${swing ? 28 : 24} 0 C ${swing ? 32 : 28} 0 ${swing ? 33 : 29} -6 ${swing ? 28 : 24} -9 Z`, mat(K.leatherDark, 0.2), { s: 3, spec: [swing ? 24 : 20, -6, 2.4, 1.2] });
  const skirt = "M -18 -54 C -25 -40 -31 -24 -31 -10 C -16 -5 16 -5 30 -10 C 29 -26 23 -42 16 -54 Z";
  fill(t, skirt, dress, { s: 8 });
  for (const [x, y] of [[-20, -22], [-10, -36], [-14, -14], [-2, -46], [-24, -40]] as const) flat(t, ellipse(x, y, 1.8, 1.5), "rgba(244,236,214,0.85)");
  // apron with a pocket and a ruffled hem
  fill(t, "M -4 -52 C -6 -36 -4 -22 0 -9 C 9 -7 18 -8 27 -11 C 25 -26 21 -42 14 -52 Z", mat(K.white), { s: 5 });
  ink(t, "M 1 -12 Q 4 -9 7 -11 Q 10 -8 13 -10 Q 16 -8 19 -10 Q 22 -9 25 -12", LINE * 0.7, "rgba(80,60,60,0.5)");
  fill(t, rrect(4, -36, 12, 9, 2), mat(K.white), { s: 2, line: LINE * 0.7 });

  // --- hunched torso, knitted shawl in the faction colour
  fill(t, "M -20 -90 C -24 -76 -22 -62 -18 -50 C -6 -46 8 -46 16 -52 C 20 -66 18 -80 12 -92 C 2 -98 -12 -96 -20 -90 Z", dress, { s: 8 });
  fill(t, "M -25 -91 C -15 -100 6 -100 17 -93 C 19 -85 15 -78 5 -73 L -1 -64 L -8 -75 C -18 -77 -25 -83 -25 -91 Z", mat(A, 0.2), { s: 5 });
  for (const [x, y] of [[-16, -88], [-6, -91], [4, -89], [-10, -81]] as const) ink(t, `M ${x} ${y} l 2 2 l 2 -2`, 1, "rgba(80,30,10,0.45)");
  fill(t, ellipse(-1, -66, 3.4, 3.4), mat(K.brass, 0.7), { s: 1, line: LINE * 0.7 });

  // --- head: silver hair and big bun, spectacles, rosy cheek, stern mouth
  face(t, 6, -106, 16, K.skinPale);
  flat(t, ellipse(10, -100, 4.4, 3), "rgba(230,110,100,0.45)");
  ink(t, "M 14 -96 L 20 -97", LINE * 1.1, "rgba(80,30,20,0.85)");
  fill(t, "M -11 -102 C -14 -118 -3 -125 8 -124 C 18 -123 24 -117 23 -110 C 16 -114 8 -114 0 -110 C -4 -106 -8 -102 -11 -102 Z", mat(K.hair, 0.2), { s: 4 });
  ink(t, "M -6 -112 Q 2 -118 12 -118 M -9 -106 Q -2 -113 6 -114", LINE * 0.6, "rgba(120,110,120,0.5)");
  fill(t, ellipse(-4, -126, 10, 9), mat(K.hair, 0.2), { s: 4 });
  ink(t, "M -10 -128 Q -4 -122 2 -128", LINE * 0.6, "rgba(120,110,120,0.5)");
  fill(t, tube([[-12, -133], [2, -119]], [1, 1]), mat(K.brass, 0.6), { s: 0, line: LINE * 0.6 });
  fill(t, ellipse(15, -107, 4.6, 4.2), mat(K.brass, 0.7), { s: 1.2 });
  fill(t, ellipse(15, -107, 3.1, 2.8), mat(0xdff4f2, 1), { s: 0, line: LINE * 0.5, spec: [14, -108.4, 1, 0.7] });
  ink(t, "M 6 -107 L 10.4 -107", LINE * 0.8);
  eyeDot(t, 15.4, -106.6, 1.5);
  ink(t, "M 11 -113 L 19 -111", 2, "#9c948c");

  // --- blunderbuss at the hip
  const ga = -0.22;
  const gg = place(8, -76, ga, 5, 1);
  at(t, 8, -76, ga, () => {
    fill(t, "M -16 -2 C -20 2 -18 10 -12 10 L 6 4 L 6 -4 Z", mat(K.wood), { s: 3 });
    fill(t, rrect(2, -6, 14, 10, 3), mat(K.wood), { s: 2 });
    fill(t, "M 14 -5 L 44 -6 L 56 -12 C 59 -12 60 7 56 8 L 44 3 L 14 4 Z", mat(K.brass, 0.75), { s: 3, spec: [24, -4, 8, 1, 0] });
    fill(t, ellipse(57, -2, 3.6, 10), mat(shade(K.brass, -0.45), 0.4), { s: 0, line: LINE * 0.8 });
    rivets(t, [[22, -0.5], [36, -1]], 1.2);
  });
  fill(t, tube([[8, -88], [19, -80], gg], [8, 7, 6]), dress, { s: 5 });
  mitt(t, gg[0], gg[1], K.skinPale);
  return place(8, -76, ga, 58, -2);
};

// ---------- kind fallback ----------

/** Custom Militia-look troopers: pick the closest built-in look from the unit's traits. */
export const trooperKind: Painter = (t, s: FigureSpec, f) => {
  if (s.medic) return medic(t, s, f);
  return grunt(t, s, f);
};
