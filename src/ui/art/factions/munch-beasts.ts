// The Munch big critters and flyers: Dr. Graft and Big Mama (the scientist on his grafted war-badger), the
// Stink Mortar (a skunk with a mutagen mortar), the Bomb Wasps (wasps with mutagen bombs) and the
// Steel-Jaw Crows (a crow with a grafted steel jaw).

import { mix, shade } from "../palette";
import { contact, ellipse, fill, flat, glowAt, ink, mat, type Mat, rrect, type Toon, tube } from "../toon";
import type { FigureArt, Painter } from "./types";
import { antenna, chromeMat, critterEye, glowOf, gooBlob, implant, LAB, LINE, lumpy, mandibles, part, staple, staples, steelClaws, steelMat, stitches, teeth, vial, wing } from "./munch-kit";

// ---------- Dr. Graft and Big Mama: the scientist riding his grafted war-badger ----------

function badger(t: Toon, A: number, f: number, rider: boolean): void {
  const G = mat(LAB.grey, 0.15);
  const K = mat(LAB.black, 0.2);
  const W = mat(LAB.white, 0.1);
  const st = f === 1;
  contact(t, 0, -4, 176, 26, 0.55);
  // far legs
  const LEGS = mat(LAB.black, 0.2);
  const LEGF = mat(shade(LAB.black, -0.25), 0.1);
  fill(t, tube([[-92, -44], [-98, -8]], [20, 18]), LEGF, { s: 6 });
  fill(t, tube([[70, -44], [80, -8]], [20, 18]), LEGF, { s: 6 });
  steelClaws(t, -88, -6, 3, 11);
  steelClaws(t, 90, -6, 3, 11);
  // a short, flat, fluffy tail
  fill(t, "M -148 -74 C -170 -82 -186 -66 -178 -48 C -168 -54 -158 -58 -146 -58 Z", G, { s: 4 });
  // the body
  const body = "M -156 -60 C -160 -110 -110 -140 -30 -142 C 50 -144 110 -122 128 -88 C 140 -60 120 -24 80 -14 C 10 -6 -110 -8 -146 -30 C -154 -38 -156 -48 -156 -60 Z";
  part(t, body, G, { s: 20, spec: [-80, -128, 16, 5, -0.15] }, () => {
    for (let i = 0; i < 9; i++) {
      const x = -140 + i * 30;
      ink(t, `M ${x} ${-120 + Math.abs(i - 4) * 4} l 6 10 l 6 -10`, 1.4, "rgba(40,36,34,0.4)");
    }
    // the coat darkens towards the legs
    fill(t, "M -160 -50 C -110 -62 40 -66 140 -60 L 140 0 L -160 0 Z", mat(LAB.greyDark, 0.1), { s: 0, line: 0, alpha: 0.75 });
    fill(t, "M -160 -30 C -100 -36 40 -40 140 -34 L 140 0 L -160 0 Z", LEGS, { s: 0, line: 0, alpha: 0.8 });
  });
  // armour plates, stapled on
  graftPlateAt(t, "M 34 -130 C 76 -130 108 -110 118 -84 L 84 -70 C 72 -92 56 -106 26 -112 Z", [[30, -110], [84, -72]], 4, 4);
  graftPlateAt(t, "M -134 -98 C -112 -126 -72 -134 -40 -132 L -46 -110 C -80 -110 -104 -100 -122 -82 Z", [[-122, -84], [-46, -112]], 4, 4);
  stitches(t, "M -40 -60 Q 0 -50 40 -62", 1.6);
  // the head: black-and-white striped, snarling, with the overmind implant
  const head = "M 92 -104 C 120 -118 160 -102 186 -72 C 192 -64 188 -54 178 -52 C 156 -46 126 -46 106 -54 C 92 -62 86 -86 92 -104 Z";
  part(t, head, W, { s: 8, spec: [112, -106, 6, 2, -0.3] }, () => {
    fill(t, "M 90 -82 C 120 -96 152 -88 184 -66 L 186 -58 C 152 -74 120 -78 92 -66 Z", K, { s: 2, line: 0 });
    flat(t, ellipse(100, -60, 22, 10), LAB.grey, 0.8);
  });
  fill(t, ellipse(186, -64, 7, 6), K, { s: 2, line: LINE });
  fill(t, ellipse(104, -106, 9, 7), K, { s: 2 });
  fill(t, `M 138 -52 C 154 -50 170 -50 182 -54 C 178 ${st ? -38 : -44} 156 ${st ? -36 : -40} 140 -46 Z`, mat(0x3c0b18), { s: 0 });
  teeth(t, 142, -51, 162, -49, 180, -53, 5, 6, 1, 0.5);
  critterEye(t, 150, -76, 4.6, A);
  implant(t, 126, -104, 15, A, 0.3);
  if (rider) {
    // mutagen tanks on the saddle, piped into the badger's neck
    ink(t, "M -54 -146 C -30 -118 40 -126 86 -110", 5, "#4d565d");
    ink(t, "M -54 -146 C -30 -118 40 -126 86 -110", 2, "#9aa5ad");
    vial(t, -64, -164, 12, 30, A, 0, 0.7);
    vial(t, -50, -160, 12, 26, A, 0, 0.5);
    staple(t, 86, -110, 4, 0.5);
    // the saddle
    fill(t, "M -60 -138 C -52 -152 14 -154 26 -138 L 20 -130 L -54 -130 Z", mat(LAB.leather, 0.3), { s: 4 });
    ink(t, "M -40 -132 L -46 -80 M 6 -132 L 10 -82", 4, "#3b2a1f");
    scientist(t, A, f);
  }
  // near legs with big steel digging claws
  fill(t, tube([[-66, -44], [-72, -8 - (st ? 4 : 0)]], [22, 20]), LEGS, { s: 6 });
  fill(t, tube([[98, -46], [110, -8]], [22, 20]), LEGS, { s: 6 });
  steelClaws(t, -60, -6 - (st ? 4 : 0), 3, 13);
  steelClaws(t, 122, -6, 3, 13);
  staples(t, -76, -40, -58, -40, 3, 3);
  staples(t, 90, -42, 108, -42, 3, 3);
}

function graftPlateAt(t: Toon, d: string, seam: [[number, number], [number, number]], n: number, s: number): void {
  fill(t, d, chromeMat, { s: 6, spec: [seam[0][0] + 14, seam[0][1] - 12, 6, 1.6, -0.2] });
  staples(t, seam[0][0], seam[0][1], seam[1][0], seam[1][1], n, s);
}

/** The evil scientist: lab coat, wild white hair, goggles, cackling over his transmitter. */
function scientist(t: Toon, A: number, f: number): void {
  const COAT = mat(LAB.coat, 0.1);
  const SKIN = mat(LAB.skin, 0.1);
  const st = f === 1;
  // far arm gripping the reins
  fill(t, tube([[-28, -192], [-40, -170], [-44, -150]], [6, 5.6, 5.2]), mat(shade(LAB.coat, -0.15)), { s: 2 });
  // near leg astride
  fill(t, tube([[-10, -142], [6, -124], [2, -106]], [8, 7.4, 7]), mat(0x3e4450), { s: 3 });
  fill(t, ellipse(8, -102, 10, 5.6), mat(LAB.black, 0.3), { s: 2 });
  // coat tails and body
  fill(t, "M -36 -150 L -70 -132 L -30 -136 Z", COAT, { s: 3 });
  part(t, "M -40 -150 C -44 -186 -30 -206 -10 -208 C 10 -208 22 -194 22 -170 C 22 -156 16 -146 4 -142 L -36 -140 Z", COAT, { s: 7, spec: [-26, -196, 4, 2, -0.3] }, () => {
    fill(t, "M -4 -206 L 6 -180 L 0 -150 L -6 -180 Z", mat(mix(A, 0x2a4020, 0.35), 0.3), { s: 1, line: LINE * 0.7 });
    ink(t, "M -14 -206 L -4 -176 M 8 -204 L 4 -178", 1.4, "rgba(28,21,18,0.5)");
  });
  // the head: wild white hair, goggles, a manic grin
  fill(t, lumpy(-16, -236, 18, 15, 9, 0.35, 3), mat(LAB.hair, 0.2), { s: 4 });
  part(t, ellipse(-4, -226, 16, 17), SKIN, { s: 5, spec: [-12, -236, 3.6, 2, -0.4] });
  fill(t, lumpy(-20, -222, 7, 9, 6, 0.4, 8), mat(LAB.hair, 0.2), { s: 2 });
  ink(t, "M -20 -232 L 12 -234", 3.4, "#3b2a1f");
  for (const [x, r] of [[9, 6.4], [-3, 5.4]] as const) {
    fill(t, ellipse(x, -232, r, r), chromeMat, { s: 1.5, line: LINE * 0.9 });
    glowAt(t, x, -232, r * 2, A, 0.55);
    fill(t, ellipse(x, -232, r * 0.66, r * 0.66), mat(glowOf(A), 0.9), { s: 0, line: 0 });
    flat(t, ellipse(x - r * 0.25, -234, r * 0.2, r * 0.15), "rgba(255,255,255,0.95)");
  }
  fill(t, ellipse(14, -224, 3.6, 3), SKIN, { s: 1, line: LINE * 0.8 });
  fill(t, `M 0 -216 Q 8 -212 14 -216 Q 12 ${st ? -206 : -209} 4 ${st ? -207 : -210} Q -1 -211 0 -216 Z`, mat(0x3c0b18), { s: 0, line: LINE * 0.8 });
  flat(t, "M 1 -215 Q 8 -212 13 -215 L 12 -213 Q 7 -211 2 -213 Z", LAB.white);
  // the raised arm and the overmind transmitter: a chrome box, a short mast and a flat dish
  const lift = st ? -4 : 0;
  fill(t, tube([[8, -196], [24, -210 + lift], [32, -228 + lift]], [6, 5.6, 5.2]), COAT, { s: 2 });
  fill(t, ellipse(34, -232 + lift, 5, 5), SKIN, { s: 1.5 });
  fill(t, rrect(24, -252 + lift, 24, 16, 3), chromeMat, { s: 3, line: LINE, spec: [28, -250 + lift, 4, 1, 0] });
  fill(t, rrect(28, -248 + lift, 14, 8, 1.5), mat(glowOf(A), 0.7), { s: 0, line: LINE * 0.6 });
  glowAt(t, 35, -244 + lift, 14, A, 0.5);
  fill(t, tube([[42, -252 + lift], [46, -262 + lift]], [1.8, 1.8]), steelMat, { s: 0, line: LINE * 0.6 });
  t.ctx.save();
  t.ctx.translate(47, -264 + lift);
  t.ctx.rotate(-0.35);
  fill(t, ellipse(0, 0, 10, 3), chromeMat, { s: 1, line: LINE * 0.8 });
  t.ctx.restore();
  for (const r of st ? [10, 16, 22] : [8, 14]) ink(t, `M ${52 + r * 0.4} ${-272 + lift - r * 0.5} q ${r * 0.3} ${r * 0.25} 0 ${r * 0.5} q ${-r * 0.3} ${r * 0.25} 0 ${r * 0.5}`, 1.6, `rgba(${(A >> 16) & 255},${(A >> 8) & 255},${A & 255},0.9)`);
}

const mama: Painter = (t, s, f) => {
  badger(t, s.color, f, true);
  return [188, -56];
};

const warBadger: Painter = (t, s, f) => {
  badger(t, s.color, f, false);
  return [188, -56];
};

// ---------- Stink Mortar: a giant skunk with a grafted mutagen mortar on its back ----------

const skunk: Painter = (t, s, f) => {
  const { ctx } = t;
  const A = s.color;
  const K = mat(LAB.black, 0.25);
  const KD = mat(shade(LAB.black, -0.2), 0.1);
  const W = mat(LAB.white, 0.1);
  const st = f === 1;
  contact(t, -6, -4, 130, 22, 0.55);
  // the great plume of a tail: big, flat and fluffy, curled back at the top
  part(t, "M -92 -56 C -130 -66 -152 -116 -140 -152 C -130 -180 -94 -184 -82 -160 C -100 -160 -114 -146 -112 -124 C -110 -100 -98 -84 -76 -72 Z", K, { s: 10 }, () => {
    fill(t, "M -98 -78 C -124 -100 -130 -134 -118 -158 L -108 -154 C -118 -132 -116 -104 -92 -86 Z", W, { s: 2, line: 0 });
    for (const [x, y] of [[-140, -120], [-136, -144], [-120, -168]] as const) ink(t, `M ${x} ${y} l 6 4`, 1.4, "rgba(255,255,255,0.35)");
  });
  fill(t, tube([[-60, -30], [-64, -6]], [13, 12]), KD, { s: 4 });
  fill(t, tube([[50, -30], [56, -6]], [13, 12]), KD, { s: 4 });
  // the body, with its white stripes
  part(t, "M -110 -40 C -114 -86 -60 -110 0 -108 C 56 -106 96 -82 100 -50 C 102 -20 76 -8 30 -6 C -40 -4 -100 -12 -110 -40 Z", K, { s: 14, spec: [-40, -98, 12, 3.4, -0.1] }, () => {
    fill(t, "M 90 -84 C 40 -108 -40 -110 -110 -70 L -108 -58 C -40 -96 40 -94 92 -72 Z", W, { s: 3, line: 0 });
  });
  // the mortar graft: a chrome mount, a mutagen tank and a short, square barrel angled up
  fill(t, "M -64 -104 L 28 -108 L 26 -94 L -60 -90 Z", chromeMat, { s: 3 });
  staples(t, -58, -90, 24, -94, 5, 3.4);
  vial(t, -40, -120, 44, 18, A, -0.04, st ? 0.4 : 0.7);
  ink(t, "M -16 -124 C -6 -134 0 -126 4 -116", 5, "#4d565d");
  ink(t, "M -16 -124 C -6 -134 0 -126 4 -116", 2, "#9aa5ad");
  const ang = -0.95 + (st ? -0.06 : 0);
  ctx.save();
  ctx.translate(8, -110);
  ctx.rotate(ang);
  fill(t, rrect(-16, -16, 30, 32, 5), steelMat, { s: 4 });
  fill(t, `M 8 -14 L ${st ? 54 : 58} -14 L ${st ? 54 : 58} 14 L 8 14 Z`, chromeMat, { s: 4, spec: [20, -10, 10, 1.6, 0] });
  const mx = st ? 54 : 58;
  fill(t, `M ${mx} -19 L ${mx + 10} -19 L ${mx + 10} 19 L ${mx} 19 Z`, steelMat, { s: 2 });
  ink(t, `M 24 -14 L 24 14 M 40 -14 L 40 14`, 1.2, "rgba(28,21,18,0.4)");
  ctx.restore();
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  const end: [number, number] = [8 + c * 70, -110 + sn * 70];
  glowAt(t, end[0], end[1], 18, A, 0.6);
  const gl: [number, number] = st ? [end[0] + c * 26, end[1] + sn * 26] : [end[0] + c * 10, end[1] + sn * 10];
  gooBlob(t, gl[0], gl[1], st ? 15 : 10, st ? 12 : 8);
  // the head
  part(t, "M 70 -78 C 84 -94 112 -88 128 -62 C 130 -54 124 -50 116 -50 C 100 -48 82 -50 72 -56 C 64 -62 64 -72 70 -78 Z", K, { s: 6 }, () => {
    fill(t, "M 126 -60 C 110 -76 96 -86 80 -90 L 84 -82 C 98 -76 110 -68 120 -56 Z", W, { s: 1, line: 0 });
  });
  fill(t, ellipse(128, -58, 4.6, 4), mat(0x2a2224), { s: 1, line: LINE * 0.8 });
  critterEye(t, 104, -68, 3.8, A);
  implant(t, 90, -84, 13, A, 0.25);
  fill(t, tube([[-40, -24], [-44, -4]], [14, 13]), K, { s: 4 });
  fill(t, tube([[70, -26], [76, -4]], [14, 13]), K, { s: 4 });
  steelClaws(t, -36, -3, 3, 7);
  steelClaws(t, 84, -3, 3, 7);
  return gl;
};

// ---------- Bomb Wasps: wasps carrying grafted mutagen bomb canisters ----------

function wasp(t: Toon, A: number, cx: number, cy: number, k: number, up: boolean): void {
  const Y = mat(LAB.amber, 0.4);
  const K = mat(LAB.black, 0.3);
  wing(t, cx - 2 * k, cy - 7 * k, 26 * k, 9 * k, up ? 1.15 : 0.35);
  wing(t, cx + 2 * k, cy - 7 * k, 22 * k, 8 * k, up ? 1.4 : 0.15);
  // striped abdomen hanging down and back, with a short swept-back sting
  t.ctx.save();
  t.ctx.translate(cx - 14 * k, cy + 4 * k);
  t.ctx.rotate(0.45);
  part(t, ellipse(0, 0, 14 * k, 9 * k), Y, { s: 3 * k, spec: [-5 * k, -4 * k, 3 * k, 1.4 * k, -0.3] }, () => {
    for (const x of [-7, 1]) flat(t, `M ${x * k} ${-12 * k} l ${4 * k} 0 l ${-1 * k} ${24 * k} l ${-4 * k} 0 Z`, LAB.black, 0.9);
  });
  fill(t, `M ${-13 * k} ${-2 * k} L ${-19 * k} 0 L ${-13 * k} ${2 * k} Z`, K, { s: 0, line: LINE * 0.6 });
  t.ctx.restore();
  // the bomb: a glowing mutagen canister slung under the thorax
  vial(t, cx + 2 * k, cy + 11 * k, 18 * k, 8 * k, A, 0, 0.75);
  fill(t, ellipse(cx, cy, 9 * k, 8 * k), K, { s: 3 * k, spec: [cx - 3 * k, cy - 4 * k, 2 * k, 1.2 * k] });
  fill(t, ellipse(cx + 11 * k, cy, 7 * k, 6.5 * k), Y, { s: 2 * k });
  critterEye(t, cx + 14 * k, cy - 1 * k, 2.4 * k, A);
  implant(t, cx + 10 * k, cy - 5 * k, 5 * k, A, 0.2);
  mandibles(t, cx + 16 * k, cy + 3 * k, 6 * k, 0.4, chromeMat);
  antenna(t, cx + 13 * k, cy - 7 * k, cx + 17 * k, cy - 14 * k, cx + 24 * k, cy - 15 * k, 1.1 * k, K);
}

const buzz: Painter = (t, s, f) => {
  const up = f === 0;
  wasp(t, s.color, -34, -92, 0.62, !up);
  wasp(t, s.color, 36, -104, 0.56, up);
  wasp(t, s.color, 2, -60, 1, up);
  return [26, -52];
};

// ---------- Steel-Jaw Crows: a crow with a grafted steel jaw ----------

function crowWing(t: Toon, x: number, y: number, len: number, rot: number, m: Mat): void {
  const { ctx } = t;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const L = len;
  const d = `M 0 ${-L * 0.06} C ${-L * 0.3} ${-L * 0.26} ${-L * 0.75} ${-L * 0.3} ${-L} ${-L * 0.16} L ${-L * 0.86} ${-L * 0.04} L ${-L * 0.9} ${L * 0.06} L ${-L * 0.72} ${L * 0.06} L ${-L * 0.74} ${L * 0.16} L ${-L * 0.56} ${L * 0.13} L ${-L * 0.54} ${L * 0.22} L ${-L * 0.36} ${L * 0.16} L ${-L * 0.3} ${L * 0.22} L 0 ${L * 0.12} Z`;
  fill(t, d, m, { s: L * 0.06 });
  ink(t, `M ${-L * 0.2} ${-L * 0.1} L ${-L * 0.32} ${L * 0.14} M ${-L * 0.42} ${-L * 0.14} L ${-L * 0.52} ${L * 0.12} M ${-L * 0.62} ${-L * 0.16} L ${-L * 0.72} ${L * 0.04}`, 1.2, "rgba(150,140,190,0.4)");
  ctx.restore();
}

const crow: Painter = (t, s, f) => {
  const A = s.color;
  const K = mat(LAB.crow, 0.55);
  const KD = mat(shade(LAB.crow, -0.2), 0.4);
  const up = f === 0;
  crowWing(t, -8, -116, 84, up ? 1.05 : 0.15, KD);
  // tail fan
  fill(t, "M -36 -98 L -86 -112 L -92 -100 L -90 -88 L -40 -86 Z", KD, { s: 3 });
  ink(t, "M -40 -94 L -88 -106 M -40 -90 L -90 -94", 1.2, "rgba(150,140,190,0.35)");
  // tucked talons
  for (const dx of [-6, 8]) {
    fill(t, tube([[dx, -80], [dx + 4, -70]], [2.6, 2.4]), mat(0x6a6460), { s: 0, line: LINE * 0.8 });
    steelClaws(t, dx + 6, -68, 2, 4);
  }
  // body
  part(t, ellipse(-6, -96, 38, 22), K, { s: 8, spec: [-20, -110, 8, 2.6, -0.2] }, () => {
    stitches(t, "M 16 -114 Q 20 -96 14 -80", 1.2);
  });
  // head, beak and the grafted steel jaw
  part(t, ellipse(32, -110, 18, 16), K, { s: 5, spec: [26, -120, 3.6, 1.6, -0.4] });
  fill(t, "M 44 -118 L 78 -108 L 46 -104 Z", mat(0x4a4448, 0.5), { s: 2, line: LINE });
  const o = up ? 0 : 6;
  fill(t, `M 42 -104 L 78 ${-100 + o} L 74 ${-86 + o} L 44 -90 Z`, chromeMat, { s: 3, spec: [52, -100, 6, 1, 0.1] });
  teeth(t, 46, -103, 62, -102 + o / 2, 76, -100 + o, 5, 6, -1, 0.4);
  staples(t, 42, -104, 42, -90, 3, 2.6);
  glowAt(t, 70, -92 + o, 8, A, 0.3);
  critterEye(t, 38, -114, 3.6, A);
  implant(t, 28, -124, 10, A, -0.15);
  crowWing(t, -2, -112, 92, up ? 0.85 : -0.2, K);
  return [78, -96 + o];
};

export const MAMA: FigureArt = { paint: mama, design: { ref: 1.4, b: [-194, -282, 206, 18], top: 262 } };
export const BADGER: FigureArt = { paint: warBadger, design: { ref: 1.35, b: [-194, -134, 206, 18], top: 120 } };
export const LOBBER: FigureArt = { paint: skunk, design: { ref: 1.15, b: [-160, -206, 140, 18], top: 180 } };
export const BUZZ: FigureArt = { paint: buzz, design: { ref: 0.44, b: [-80, -132, 72, 12], top: 100 } };
export const FLAPJAW: FigureArt = { paint: crow, design: { ref: 0.9, b: [-112, -212, 100, 14], top: 190 } };
