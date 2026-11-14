// Dustline Militia structures and ground: the Scrap Turret (three rifles and a tractor seat behind a tin
// shield), the Spud Mortar (a drainpipe on a pallet, a hairspray can and a sack of spuds), the Junk
// Barricade (bedframe, fridge, tyre and one confused goat), the radio-shack beacon, and the dry cracked
// dust on every Militia base.

import { shade } from "../palette";
import { tube } from "../toon";
import type { Painter } from "./types";
import { at, chevron, poly, clipTo, contact, corrugate, ellipse, faded, fill, flat, glowAt, ink, K, LINE, mat, mitt, place, puffs, rivets, rng, rrect, rustSpots, sandbag, sandbagRing, type Toon } from "./militia-kit";

// ---------- Scrap Turret ----------

/** Scrap Turret: three rifles wired together on a swivel, a tractor seat and its gunner, behind a corrugated tin shield in a sandbag ring. */
export const scrapTurret: Painter = (t, s, f) => {
  const A = s.color;
  const kick = f === 1 ? -4 : 0;
  contact(t, 0, -6, 84, 20, 0.5);
  sandbagRing(t, false, 74, 32, 6);

  // tractor seat on its spring post, gunner sitting in it
  fill(t, tube([[-22, -20], [-22, -64]], [4, 4]), mat(K.gun, 0.5), { s: 2 });
  ink(t, "M -27 -30 L -17 -34 L -27 -38 L -17 -42 L -27 -46 L -17 -50", 2, "#cfd4d4");
  // the ammo crate everything is bolted to
  fill(t, "M -34 -64 L 46 -64 L 40 -50 L -40 -50 Z", mat(K.woodLight), { s: 3 });
  const crate = rrect(-40, -51, 80, 40, 3);
  fill(t, crate, mat(K.wood), { s: 6 });
  clipTo(t, crate, () => {
    for (const y of [-38, -25]) ink(t, `M -42 ${y} L 42 ${y}`, 1.2, "rgba(60,30,10,0.5)");
  });
  chevron(t, 0, -34, 1.6, A);
  rivets(t, [[-35, -46], [35, -46], [-35, -16], [35, -16]], 1.6);
  fill(t, "M -50 -98 C -56 -86 -54 -72 -46 -66 L -36 -68 C -42 -76 -44 -88 -40 -98 Z", mat(A, 0.5), { s: 4 });
  for (const y of [-88, -78]) flat(t, ellipse(-46, y, 2, 2.4), "#1c1512");
  fill(t, "M -48 -70 C -48 -78 -6 -78 -4 -70 C -4 -62 -48 -62 -48 -70 Z", mat(A, 0.5), { s: 3 });
  // gunner: denim, orange tin hat
  fill(t, tube([[-24, -76], [2, -72], [12, -60]], [9, 8, 7]), mat(K.denimDark), { s: 4 });
  fill(t, "M -40 -116 C -44 -100 -42 -84 -38 -72 C -28 -68 -12 -68 -6 -74 C -4 -90 -6 -104 -12 -118 C -20 -122 -34 -121 -40 -116 Z", mat(K.denim), { s: 7 });
  fill(t, "M -36 -118 L -31 -119 L -26 -76 L -31 -75 Z", mat(K.leather), { s: 1.5, line: LINE * 0.8 });
  fill(t, ellipse(-18, -132, 15, 15.5), mat(K.skin), { s: 5 });
  fill(t, "M -30 -122 C -24 -116 -8 -116 -4 -122 C -6 -128 -28 -128 -30 -122 Z", mat(K.red), { s: 2, line: LINE * 0.8 });
  fill(t, ellipse(-17, -144, 27, 8), mat(shade(A, -0.1), 0.45), { s: 3 });
  fill(t, "M -33 -145 C -34 -160 -26 -168 -17 -168 C -6 -168 1 -160 0 -145 C -8 -141 -25 -141 -33 -145 Z", mat(A, 0.55), { s: 7, spec: [-24, -160, 4, 2.2, -0.6] });
  flat(t, ellipse(-6, -134, 1.8, 2.4), "#1c1512");

  // swivel post and the three-rifle repeater
  fill(t, tube([[16, -58], [16, -84]], [6, 5]), mat(K.gun, 0.5), { s: 2 });
  fill(t, ellipse(16, -86, 10, 5), mat(K.brass, 0.6), { s: 2 });
  at(t, 10 + kick, -104, 0, () => {
    for (const [dy, k] of [[-10, 0.9], [0, 1], [10, 0.95]] as const) {
      fill(t, `M -26 ${dy - 4} C -30 ${dy} -28 ${dy + 6} -22 ${dy + 6} L -4 ${dy + 3} L -4 ${dy - 4} Z`, mat(K.wood), { s: 2 });
      fill(t, rrect(-6, dy - 5, 22, 9, 2.5), mat(K.gun, 0.55), { s: 2 });
      fill(t, rrect(14, dy - 3, 90 * k, 5, 2), mat(K.gun, 0.6), { s: 1.5, spec: [20, dy - 2, 8, 0.7, 0] });
      fill(t, rrect(10 + 90 * k, dy - 4, 6, 7, 1.5), mat(K.gun, 0.6), { s: 1 });
    }
    // baling wire and a coffee-can magazine
    for (const x of [26, 70]) ink(t, `M ${x} -16 L ${x + 2} 16 M ${x + 3} -16 L ${x + 5} 16`, 1.6, "#cfc7b2");
    fill(t, rrect(-4, -30, 18, 18, 3), mat(A, 0.5), { s: 3, spec: [0, -28, 3, 1, 0] });
    ink(t, "M -4 -24 L 14 -24", LINE * 0.7, "rgba(40,20,10,0.5)");
  });
  // tin shield with gun slits
  const shield = "M 30 -136 L 54 -140 L 56 -58 L 30 -54 Z";
  fill(t, shield, mat(K.tin, 0.5), { s: 6 });
  corrugate(t, shield, 30, 56, -142, -52, 6, true);
  rustSpots(t, shield, [[36, -64, 6], [50, -126, 5]]);
  fill(t, "M 30 -100 L 55 -103 L 55 -94 L 30 -91 Z", mat(A, 0.4), { s: 1.5, line: LINE * 0.8 });
  rivets(t, [[34, -130], [51, -133], [34, -62], [52, -64]], 1.8);
  // barrels come out through the slits
  for (const [dy, k] of [[-10, 0.9], [0, 1], [10, 0.95]] as const) {
    fill(t, rrect(56, -104 + dy - 3, 10 + kick + 90 * k - 46, 5, 2), mat(K.gun, 0.6), { s: 1.5 });
    fill(t, rrect(10 + kick + 10 + 90 * k, -104 + dy - 4, 6, 7, 1.5), mat(K.gun, 0.6), { s: 1 });
  }
  mitt(t, 12, -60);
  sandbagRing(t, true, 78, 36, 5);
  return [118 + kick, -104];
};

// ---------- Spud Mortar ----------

/** One potato. */
function spud(t: Toon, x: number, y: number, r: number, rot = 0): void {
  at(t, x, y, rot, () => {
    fill(t, ellipse(0, 0, r, r * 0.72), mat(K.potato), { s: r * 0.35, line: LINE * 0.8 });
    for (const [dx, dy] of [[-r * 0.3, -r * 0.1], [r * 0.35, r * 0.15]] as const) flat(t, ellipse(dx, dy, 1.1, 0.8), "rgba(80,50,20,0.6)");
  });
}

/** Spud Mortar: a stubby drainpipe with a flared, squared mouth on a pallet, a hairspray can taped to the breech, a sack and a crate of spuds. */
export const spudMortar: Painter = (t, s, f) => {
  const A = s.color;
  const fire = f === 1;
  contact(t, 0, -8, 82, 18, 0.5);

  // pallet: top boards and front face
  fill(t, "M -64 -6 L 64 -6 L 64 4 L -64 4 Z", mat(shade(K.wood, -0.25)), { s: 2 });
  for (const x of [-60, -6, 48]) fill(t, rrect(x, -6, 12, 10, 1.5), mat(shade(K.wood, -0.1)), { s: 1, line: LINE * 0.8 });
  const top = "M -60 -40 L 60 -40 L 66 -6 L -66 -6 Z";
  fill(t, top, mat(K.woodLight), { s: 5 });
  clipTo(t, top, () => {
    for (const y of [-31, -22, -14]) ink(t, `M -70 ${y} L 70 ${y}`, 1.2, "rgba(80,40,10,0.45)");
  });
  rivets(t, [[-54, -35], [54, -35], [-58, -11], [58, -11]], 1.3);

  // burlap sack on the left
  fill(t, "M -66 -30 C -76 -40 -74 -78 -60 -86 L -58 -94 L -44 -94 L -44 -84 C -28 -76 -24 -44 -32 -30 C -42 -24 -58 -24 -66 -30 Z", mat(0xb79a66), { s: 7 });
  ink(t, "M -62 -86 Q -51 -82 -42 -86", 2.2, "#7a4f2e");
  fill(t, "M -60 -94 L -64 -102 L -56 -98 L -52 -104 L -48 -98 L -42 -102 L -44 -94 Z", mat(0xb79a66), { s: 1.5, line: LINE * 0.7 });
  ink(t, "M -64 -60 L -56 -52 M -48 -66 L -40 -58 M -60 -44 L -52 -38", 1, "rgba(80,50,20,0.45)");
  chevron(t, -52, -56, 1.2, A);

  // A-frame legs
  fill(t, tube([[-6, -34], [16, -84]], [3.4, 3]), mat(K.wood), { s: 1.5 });
  fill(t, tube([[40, -30], [26, -86]], [3.4, 3]), mat(shade(K.wood, -0.12)), { s: 1.5 });

  // the drainpipe: stubby, banded, squared and flared at the mouth
  const k = fire ? -3 : 0;
  const a = -0.9;
  const bx = -12 + k * Math.cos(a);
  const by = -42 + k * Math.sin(a);
  const L = 100;
  at(t, bx, by, a, () => {
    fill(t, rrect(-10, -20, 10, 40, 1.5), mat(K.gun, 0.5), { s: 3 });
    const pipe = rrect(0, -16, L - 12, 32, 2);
    fill(t, pipe, mat(K.tin, 0.55), { s: 7, spec: [24, -11, 24, 1.6, 0] });
    rustSpots(t, pipe, [[18, 9, 7], [70, -7, 5]]);
    fill(t, rrect(50, -17.5, 12, 35, 1), mat(A, 0.45), { s: 2, line: LINE * 0.8 });
    for (const x of [22, 78]) fill(t, rrect(x, -17, 5, 34, 1), mat(K.brass, 0.7), { s: 1, line: LINE * 0.7 });
    fill(t, poly([[L - 14, -16], [L, -22], [L, 22], [L - 14, 16]]), mat(K.tin, 0.5), { s: 4 });
    fill(t, rrect(L - 2, -23, 6, 46, 1), mat(K.gun, 0.5), { s: 2 });
    flat(t, ellipse(L + 3, 0, 2.6, 17), "#2a1d16");
    // hairspray can, taped on, and the igniter
    fill(t, rrect(6, 17, 26, 13, 2), mat(A, 0.5), { s: 3, spec: [10, 19, 6, 1, 0] });
    fill(t, rrect(30, 18.5, 7, 10, 1.5), mat(K.white, 0.5), { s: 1.5, line: LINE * 0.7 });
    for (const x of [10, 22]) fill(t, rrect(x, 13, 6, 20, 1), mat(0xb8bcbc, 0.3), { s: 1, line: LINE * 0.6 });
    fill(t, rrect(-8, 22, 9, 8, 1.5), mat(K.red, 0.7), { s: 1.5, line: LINE * 0.7 });
    ink(t, "M -4 30 Q -10 38 4 42", 1.4, "#3a2a20");
  });

  // a crate of spuds in front
  fill(t, poly([[22, -32], [64, -32], [60, -24], [18, -24]]), mat(0x3a2a20), { s: 0, line: LINE * 0.8 });
  for (const [x, y, r] of [[28, -30, 5.5], [38, -32, 6], [48, -31, 5.5], [57, -30, 5], [33, -26, 5], [44, -26, 5.5], [53, -26, 5]] as const) spud(t, x, y, r, (x % 3) * 0.3);
  const crate = rrect(18, -25, 44, 20, 2);
  fill(t, crate, mat(K.wood), { s: 4 });
  ink(t, "M 18 -15 L 62 -15", 1.2, "rgba(60,30,10,0.5)");
  rivets(t, [[22, -20], [58, -20]], 1.3);

  const m = place(bx, by, a, L + 4, 0);
  if (fire) {
    glowAt(t, m[0], m[1], 26, 0xffb030, 0.6);
    puffs(t, m[0] + 8, m[1] - 2, 10, 0xb8b0a4, 3, 1.1, 0.15);
  }
  return m;
};

// ---------- Junk Barricade ----------

/** Junk Barricade: a brass bedframe, a fridge on its side, a tyre and planks, with a very confused goat. */
export const junkPile: Painter = (t, s) => {
  const A = s.color;
  contact(t, 0, -4, 124, 22, 0.5);
  const brass = mat(K.brass, 0.75);

  // bedframe headboard standing up on the left
  for (let i = 0; i < 5; i++) ink(t, `M ${-108 + i * 11} -86 L ${-108 + i * 11} -12`, 3, "#a77d32");
  fill(t, "M -120 -86 C -104 -104 -72 -104 -56 -86 L -56 -80 C -72 -96 -104 -96 -120 -80 Z", brass, { s: 2, line: LINE * 0.8 });
  for (const x of [-120, -56]) {
    fill(t, rrect(x - 4, -88, 8, 84, 1.5), brass, { s: 2, spec: [x - 2, -82, 1, 10, 0] });
    fill(t, rrect(x - 7, -96, 14, 8, 1.5), brass, { s: 2 });
  }
  // corrugated tin sheet leaning behind
  const sheet = "M -48 -6 L -32 -110 L 62 -98 L 56 -6 Z";
  fill(t, sheet, mat(K.tin, 0.45), { s: 8 });
  corrugate(t, sheet, -50, 64, -112, -4, 9);
  rustSpots(t, sheet, [[-26, -90, 10], [40, -30, 12], [10, -60, 6]]);

  // the goat, peeking over the fridge, confused
  const gx = 20;
  const gy = -96;
  fill(t, `M ${gx - 6} ${gy - 10} C ${gx - 14} ${gy - 26} ${gx - 26} ${gy - 26} ${gx - 28} ${gy - 16} C ${gx - 22} ${gy - 20} ${gx - 14} ${gy - 18} ${gx - 10} ${gy - 8} Z`, mat(0x9a8a76), { s: 2, line: LINE * 0.8 });
  fill(t, `M ${gx + 4} ${gy - 12} C ${gx + 4} ${gy - 30} ${gx + 16} ${gy - 34} ${gx + 22} ${gy - 26} C ${gx + 14} ${gy - 26} ${gx + 10} ${gy - 20} ${gx + 9} ${gy - 10} Z`, mat(0x9a8a76), { s: 2, line: LINE * 0.8 });
  fill(t, ellipse(gx - 18, gy - 4, 8, 4), mat(K.white), { s: 1.5, line: LINE * 0.8 });
  fill(t, `M ${gx - 12} ${gy + 4} C ${gx - 14} ${gy - 14} ${gx + 10} ${gy - 18} ${gx + 18} ${gy - 4} C ${gx + 24} ${gy + 6} ${gx + 22} ${gy + 18} ${gx + 12} ${gy + 20} C ${gx} ${gy + 22} ${gx - 10} ${gy + 16} ${gx - 12} ${gy + 4} Z`, mat(K.white, 0.1), { s: 5 });
  fill(t, ellipse(gx + 20, gy + 2, 6, 3.6), mat(K.white), { s: 1.5, line: LINE * 0.8 });
  fill(t, ellipse(gx + 4, gy - 2, 4.4, 4), mat(0xf2d040, 0.4), { s: 0, line: LINE * 0.7 });
  flat(t, rrect(gx + 1.2, gy - 2.8, 5.6, 1.8, 0.8), "#1c1512");
  fill(t, `M ${gx + 12} ${gy + 18} L ${gx + 14} ${gy + 28} L ${gx + 18} ${gy + 18} Z`, mat(K.hair), { s: 0, line: LINE * 0.7 });
  ink(t, `M ${gx + 34} ${gy - 30} C ${gx + 34} ${gy - 38} ${gx + 46} ${gy - 38} ${gx + 44} ${gy - 30} C ${gx + 43} ${gy - 26} ${gx + 38} ${gy - 26} ${gx + 38} ${gy - 20}`, 2.6, "rgba(40,28,20,0.85)");
  flat(t, ellipse(gx + 38, gy - 14, 1.8, 1.8), "rgba(40,28,20,0.85)");

  // the fridge, lying on its side
  const fr = rrect(-52, -66, 100, 60, 14);
  fill(t, fr, mat(K.cream, 0.3), { s: 10, spec: [-36, -62, 18, 2, 0] });
  ink(t, "M -52 -48 L 48 -48", LINE);
  fill(t, rrect(-20, -44, 34, 6, 3), mat(K.steel, 0.9), { s: 1.5, spec: [-14, -43, 6, 0.8, 0] });
  rustSpots(t, fr, [[30, -12, 9], [-44, -20, 6]]);
  fill(t, ellipse(26, -28, 6, 5), mat(A, 0.5), { s: 1.5, line: LINE * 0.8 });
  flat(t, rrect(-36, -30, 18, 10, 1.5), "rgba(232,182,50,0.9)");
  ink(t, rrect(-36, -30, 18, 10, 1.5), LINE * 0.6);

  // tyre, planks
  fill(t, ellipse(80, -34, 30, 26), mat(K.rubber, 0.2), { s: 8 });
  fill(t, ellipse(80, -34, 12, 10), mat(shade(K.dust, -0.2)), { s: 3 });
  ink(t, ellipse(80, -34, 22, 19), 1.2, "rgba(120,110,100,0.5)");
  fill(t, "M 56 -2 L 76 -96 L 90 -94 L 70 0 Z", mat(K.wood), { s: 4 });
  fill(t, "M 70 -10 L 120 -66 L 128 -56 L 80 -2 Z", mat(K.woodLight), { s: 4 });
  rivets(t, [[80, -60], [96, -36]], 1.6);

  // sandbags along the front
  sandbag(t, -100, -2, 34, 18);
  sandbag(t, -70, 2, 32, 17, shade(K.bag, -0.08));
  sandbag(t, 104, 0, 32, 17);
  chevron(t, 6, -26, 1.4, A);
  return [0, -70];
};

// ---------- beacon (custom Militia structures without guns) ----------

/** A corrugated radio shack with a mast and a warning lamp in the faction colour. */
export const radioShack: Painter = (t, s, f) => {
  const A = s.color;
  contact(t, 0, -6, 66, 15, 0.5);
  ink(t, "M 24 -96 L 32 -170 M 24 -96 L 44 -110 M 24 -96 L 8 -110", 2.6, "#5b5f64");
  for (const y of [-120, -140, -160]) ink(t, `M ${24 + (-96 - y) * 0.1 - 6} ${y} L ${24 + (-96 - y) * 0.1 + 6} ${y}`, 1.6, "#5b5f64");
  glowAt(t, 32, -172, f ? 26 : 20, A, 0.9);
  fill(t, rrect(25, -180, 14, 14, 2), mat(shade(A, 0.3), 0.8), { s: 2 });
  const shack = "M -54 -10 L -54 -88 L 54 -96 L 54 -10 Z";
  fill(t, shack, mat(K.tin, 0.4), { s: 10 });
  corrugate(t, shack, -54, 54, -98, -8, 8);
  fill(t, "M -60 -86 L 60 -98 L 60 -88 L -60 -78 Z", mat(faded(A), 0.4), { s: 2 });
  fill(t, rrect(-12, -66, 26, 56, 3), mat(K.wood), { s: 4 });
  fill(t, rrect(-44, -66, 24, 18, 3), mat(K.lens, 0.9, 0.2), { s: 3, spec: [-40, -63, 4, 1.4, 0] });
  rivets(t, [[-48, -80], [48, -86], [-48, -16], [48, -16]], 2);
  sandbag(t, -40, -4, 30, 16);
  sandbag(t, 34, -4, 30, 16);
  return [32, -172];
};

// ---------- base ground ----------

/** Dry cracked dust with a few pebbles and a tuft of dry grass: quiet, warm, a touch lighter in the middle. */
export function dustTop(t: Toon, R: number, RY: number, seed: number): void {
  const rnd = rng(seed * 7 + 13);
  fill(t, ellipse(0, 0, R + 2, RY + 2), mat(K.dust), { s: Math.max(6, R * 0.1), line: 0, hi: 0.35 });
  flat(t, ellipse(-R * 0.12, -RY * 0.14, R * 0.62, RY * 0.5), "rgba(232,206,160,0.12)");
  // cracks: a few short branching polylines
  const n = Math.round(2 + R / 30);
  for (let i = 0; i < n; i++) {
    let x = (rnd() - 0.5) * R * 1.5;
    let y = (rnd() - 0.5) * RY * 1.4;
    let a = rnd() * Math.PI * 2;
    let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    let hi = `M ${(x + 1).toFixed(1)} ${(y + 1).toFixed(1)}`;
    const segs = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < segs; k++) {
      a += (rnd() - 0.5) * 1.4;
      const L = 5 + rnd() * (6 + R * 0.05);
      x += Math.cos(a) * L;
      y += Math.sin(a) * L * 0.9;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      hi += ` L ${(x + 1).toFixed(1)} ${(y + 1).toFixed(1)}`;
      if (k === 1 && rnd() < 0.6) {
        const b = a + (rnd() < 0.5 ? 1 : -1) * (0.8 + rnd() * 0.6);
        d += ` M ${x.toFixed(1)} ${y.toFixed(1)} l ${(Math.cos(b) * L * 0.8).toFixed(1)} ${(Math.sin(b) * L * 0.7).toFixed(1)} M ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
    }
    ink(t, hi, 1.1, "rgba(236,214,170,0.35)");
    ink(t, d, 1.3, "rgba(62,42,24,0.5)");
  }
  // pebbles
  const p = Math.round(4 + R / 14);
  for (let i = 0; i < p; i++) {
    const a = rnd() * Math.PI * 2;
    const dd = Math.sqrt(rnd()) * 0.88;
    const x = Math.cos(a) * dd * R;
    const y = Math.sin(a) * dd * RY;
    const r = 1.6 + rnd() * 2.6;
    fill(t, ellipse(x, y, r, r * 0.78), mat(rnd() < 0.5 ? 0xb4a284 : 0x857158), { s: r * 0.5, line: 0.8, hi: 0.6 });
  }
  // one tuft of dry grass (two on big bases)
  const tufts = R > 90 ? 2 : 1;
  for (let i = 0; i < tufts; i++) {
    const x = (rnd() - 0.5) * R * 1.2;
    const y = (0.15 + rnd() * 0.5) * RY * (i ? -1 : 1);
    const c = i ? "#b8984a" : "#c9a756";
    ink(t, `M ${x} ${y} Q ${x - 3} ${y - 6} ${x - 7} ${y - 9} M ${x} ${y} Q ${x} ${y - 7} ${x + 1} ${y - 12} M ${x} ${y} Q ${x + 3} ${y - 6} ${x + 7} ${y - 8} M ${x + 1} ${y} Q ${x + 6} ${y - 3} ${x + 10} ${y - 3}`, 1.5, c);
    ink(t, `M ${x - 2} ${y} Q ${x - 6} ${y - 3} ${x - 10} ${y - 3}`, 1.3, "#9a7c38");
  }
}


