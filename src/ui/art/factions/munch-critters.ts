// The Munch small fry: grafted, mind-controlled farmland critters. Nibbler beetles, Boing Hopper
// foxes, Web-Gunner Spiders spiders, the Brood Scorpion scorpion broodmother, and a grafted raccoon for custom
// "teeth" troopers. Designs are drawn at their own base radius (ref), so one design unit is one
// centi-inch on the table. Every critter wears the overmind implant (see munch-kit.ts).

import { mix, shade } from "../palette";
import { contact, ellipse, fill, flat, glowAt, ink, mat, tube } from "../toon";
import type { FigureArt, Painter } from "./types";
import { antenna, chromeMat, critterEye, gooBlob, implant, LAB, leg, LINE, mandibles, part, staple, staples, steelClaws, steelMat, stitches, vial } from "./munch-kit";

// ---------- Nibbler: a grafted beetle with chrome mandibles ----------

const beetle: Painter = (t, s, f) => {
  const A = s.color;
  const SH = mat(LAB.beetle, 0.75);
  const LG = mat(shade(LAB.beetle, -0.2), 0.4);
  const LF = mat(shade(LAB.beetle, -0.4), 0.3);
  const st = f === 1;
  const a = st ? 5 : 0; // tripod gait
  contact(t, 2, -2, 42, 9, 0.5);
  leg(t, [-12, -18], [-24, -30], [-36 + a, -4], 3.4, LF);
  leg(t, [0, -18], [-2, -32], [-4 - a, -4], 3.4, LF);
  leg(t, [12, -18], [22, -30], [30 + a, -4], 3.4, LF);
  antenna(t, 32, -34, 38, -44, 48, -44, 1.6, LF);
  // the glossy shell, a chrome plate stapled onto it
  part(t, ellipse(-10, -28, 28, 18), SH, { s: 7, spec: [-20, -40, 7, 2.6, -0.25] }, () => {
    ink(t, "M 16 -42 Q -8 -32 -36 -26", 1.4, "rgba(20,12,10,0.6)");
  });
  vial(t, -16, -44, 18, 7, A, -0.12);
  staples(t, -24, -38, -8, -40, 3, 2);
  part(t, ellipse(16, -30, 10, 10), SH, { s: 4, spec: [12, -36, 3, 1.4, -0.4] });
  part(t, ellipse(28, -26, 9, 8), SH, { s: 3 });
  implant(t, 26, -32, 9, A, 0.15);
  critterEye(t, 32, -26, 2.4, A);
  mandibles(t, 34, -22, 15, st ? 0.95 : 0.5, chromeMat);
  antenna(t, 30, -32, 34, -46, 44, -50, 1.8, LG);
  leg(t, [-14, -14], [-26, -22], [-38 - a, 0], 3.8, LG);
  leg(t, [0, -14], [2, -24], [4 + a, 0], 3.8, LG);
  leg(t, [12, -14], [24, -22], [32 - a, 0], 3.8, LG);
  return [49, -22];
};

// ---------- Boing Hopper: a fox on a grafted spring-piston hind leg, pouncing ----------

const fox: Painter = (t, s, f) => {
  const A = s.color;
  const R = mat(LAB.rust, 0.15);
  const RD = mat(shade(LAB.rust, -0.28));
  const W = mat(LAB.white);
  const K = mat(LAB.black, 0.2);
  const st = f === 1;
  const dy = st ? 7 : 0; // the piston compresses
  contact(t, 2, -2, 40, 8, 0.5);
  // the brush: big, flat, swept down and back, white-tipped
  const tail = "M -16 -34 C -36 -44 -58 -34 -62 -12 C -54 -15 -44 -19 -36 -22 C -28 -26 -22 -27 -14 -28 Z";
  part(t, tail, R, { s: 5 }, () => {
    flat(t, ellipse(-60, -14, 10, 9), LAB.white);
    ink(t, "M -24 -32 Q -40 -34 -52 -24 M -26 -28 Q -40 -28 -48 -20", 1, "rgba(80,30,10,0.4)");
  });
  // far legs
  fill(t, tube([[16, -30 + dy], [24, -18], [30, -6]], [3.6, 3.2, 3]), RD, { s: 1.5 });
  fill(t, ellipse(31, -4, 4.6, 2.8), K, { s: 1 });
  fill(t, tube([[-12, -24 + dy], [-14, -6]], [3.4, 3]), mat(LAB.steel, 0.6), { s: 1 });
  // body, slung forward to pounce
  t.ctx.save();
  t.ctx.translate(0, dy);
  part(t, "M -24 -26 C -26 -40 -10 -48 6 -48 C 18 -48 26 -42 24 -32 C 20 -22 4 -18 -10 -18 C -18 -18 -24 -20 -24 -26 Z", R, { s: 6, spec: [-10, -44, 4, 1.6, -0.2] }, () => {
    fill(t, "M 10 -22 C 20 -24 26 -32 24 -40 C 18 -34 10 -30 4 -26 Z", W, { s: 2, line: 0 });
  });
  // a stapled seam where the leg graft goes in
  stitches(t, "M -22 -34 Q -16 -24 -8 -20", 1);
  // the head
  fill(t, "M 18 -60 L 20 -78 L 28 -62 Z", R, { s: 2, line: LINE * 0.9 });
  fill(t, "M 25 -62 L 31 -78 L 35 -61 Z", R, { s: 2, line: LINE * 0.9 });
  flat(t, "M 21 -64 L 21 -74 L 26 -64 Z", LAB.black);
  part(t, "M 14 -52 C 14 -62 26 -66 34 -60 L 46 -52 C 46 -48 40 -45 34 -45 C 24 -44 14 -46 14 -52 Z", R, { s: 4, spec: [20, -60, 3, 1.4, -0.3] }, () => {
    fill(t, "M 24 -47 L 46 -51 C 46 -47 40 -44 32 -44 C 28 -44 25 -45 24 -47 Z", W, { s: 1, line: 0 });
  });
  fill(t, ellipse(46, -51.5, 2.6, 2.2), K, { s: 0, line: LINE * 0.6 });
  ink(t, "M 34 -47 Q 38 -45 42 -47", LINE * 0.8);
  critterEye(t, 31, -55, 2.6, A);
  implant(t, 25, -62, 7, A, 0.1);
  t.ctx.restore();
  // front legs reaching for the landing
  fill(t, tube([[12, -28 + dy], [22, -16], [26, -6]], [4, 3.6, 3.2]), R, { s: 1.5 });
  fill(t, ellipse(27, -3, 5, 3), K, { s: 1 });
  // the grafted spring piston: chrome sleeve, steel rod, coil, paw
  const top = -24 + dy;
  fill(t, ellipse(-14, -26 + dy, 9, 8), R, { s: 3 });
  fill(t, `M -18 ${top} L -10 ${top} L -10 ${top + 10} L -18 ${top + 10} Z`, chromeMat, { s: 2, line: LINE * 0.8 });
  fill(t, `M -15.6 ${top + 10} L -12.4 ${top + 10} L -12.4 -5 L -15.6 -5 Z`, steelMat, { s: 0, line: LINE * 0.7 });
  let coil = `M -18 ${top + 11}`;
  const n = 5;
  for (let i = 1; i <= n; i++) coil += ` L ${i % 2 ? -10 : -18} ${top + 11 + ((-6 - (top + 11)) * i) / n}`;
  ink(t, coil, 2.2);
  ink(t, coil, 1, "#e4eaee");
  staple(t, -14, top - 1, 3, 0);
  fill(t, ellipse(-12, -3, 7, 3.4), K, { s: 1 });
  return [46, -50 + dy];
};

// ---------- Web-Gunner Spiders: a spider with a grafted spinneret cannon ----------

const spider: Painter = (t, s, f) => {
  const A = s.color;
  const H = mat(LAB.spider, 0.15);
  const HD = mat(shade(LAB.spider, -0.32), 0.1);
  const st = f === 1;
  contact(t, 0, -2, 50, 10, 0.5);
  for (const [hx, kx, ky, fx] of [[-8, -32, -56, -50], [0, -14, -62, -22], [8, 18, -62, 22], [14, 38, -56, 50]] as const) leg(t, [hx, -30], [kx, ky], [fx, -4], 3.2, HD);
  // the hairy abdomen
  part(t, ellipse(-22, -34, 24, 20), H, { s: 8, spec: [-30, -46, 5, 2, -0.4] }, () => {
    for (const [x, y] of [[-34, -26], [-24, -18], [-12, -24], [-30, -40]] as const) ink(t, `M ${x} ${y} l -3 -3 M ${x + 4} ${y} l -3 -3`, 1, "rgba(30,20,14,0.45)");
    fill(t, "M -26 -48 L -18 -40 L -10 -48 L -10 -44 L -18 -36 L -26 -44 Z", mat(LAB.cream), { s: 0, line: 0, alpha: 0.7 });
  });
  // the mutagen tank strapped on top, feeding the cannon
  vial(t, -26, -56, 24, 11, A, -0.12);
  staples(t, -36, -50, -16, -52, 3, 2.2);
  // cephalothorax, eyes, implant
  part(t, ellipse(12, -32, 14, 12), H, { s: 5 });
  for (const [x, y, r] of [[22, -34, 2.2], [18, -38, 1.8], [25, -38, 1.6], [21, -30, 1.4]] as const) critterEye(t, x, y, r, A);
  implant(t, 8, -42, 8, A, -0.1);
  // fangs
  fill(t, "M 24 -26 Q 30 -22 26 -16 Q 25 -21 22 -24 Z", mat(LAB.black), { s: 0, line: LINE * 0.7 });
  // the spinneret cannon: a chrome box with a squared barrel and a flared muzzle
  ink(t, "M -14 -60 Q -8 -72 2 -66", 3.4, "#556068");
  fill(t, "M 0 -72 L 24 -72 L 24 -58 L 0 -58 Z", chromeMat, { s: 4, line: LINE, spec: [6, -70, 4, 1, 0] });
  fill(t, "M 24 -69 L 36 -69 L 36 -61 L 24 -61 Z", steelMat, { s: 2, line: LINE * 0.9 });
  fill(t, "M 36 -72 L 44 -76 L 44 -54 L 36 -58 Z", chromeMat, { s: 2, line: LINE * 0.9 });
  glowAt(t, 44, -65, 12, A, 0.6);
  staples(t, 2, -58, 22, -58, 3, 2.2);
  if (st) gooBlob(t, 54, -66, 7, 5.5);
  else gooBlob(t, 46, -65, 3.6, 4.6);
  for (const [hx, kx, ky, fx] of [[-6, -34, -50, -52], [0, -14, -56, -24], [10, 22, -56, 28], [16, 42, -50, 56]] as const) leg(t, [hx, -26], [kx, ky], [fx, 0], 3.6, H);
  return [54, -66];
};

// ---------- Brood Scorpion: a scorpion broodmother with babies on her back and an incubator graft ----------

const scorpion: Painter = (t, s, f) => {
  const A = s.color;
  const S = mat(LAB.scorp, 0.45);
  const SD = mat(shade(LAB.scorp, -0.3), 0.3);
  const st = f === 1;
  contact(t, 0, -2, 52, 10, 0.5);
  for (const [hx, kx, fx] of [[-24, -36, -46], [-12, -22, -28], [0, -4, -8], [10, 14, 14]] as const) leg(t, [hx, -18], [kx, -30], [fx, -4], 2.8, SD);
  // far pincer
  fill(t, tube([[16, -24], [28, -30], [36, -28]], [3.6, 3.4, 3.2]), SD, { s: 1 });
  fill(t, ellipse(42, -28, 7, 5), SD, { s: 2 });
  // the tail: chunky segments rising behind and curling over into a wide hook
  const seg: [number, number, number][] = [[-34, -24, 10], [-48, -34, 9.5], [-56, -50, 9], [-56, -68, 8.6], [-46, -82, 8.2], [-30, -86, 8]];
  for (const [x, y, r] of seg) part(t, ellipse(x, y, r, r * 0.9), S, { s: r * 0.45, spec: [x - r * 0.4, y - r * 0.4, r * 0.25, r * 0.15, -0.4] });
  fill(t, "M -24 -92 C -8 -94 -2 -78 -12 -70 C -14 -76 -18 -80 -26 -80 Z", mat(LAB.cream, 0.3), { s: 2, line: LINE });
  // the body
  part(t, ellipse(-8, -22, 30, 12), S, { s: 5, spec: [-16, -30, 6, 2, -0.2] }, () => {
    for (const x of [-26, -16, -6, 4]) ink(t, `M ${x} -34 Q ${x - 3} -22 ${x} -10`, 1.2, "rgba(40,16,8,0.5)");
  });
  // the incubator graft: a glass dome of mutagen with eggs, on a stapled chrome base
  const dome = "M -24 -32 C -24 -52 4 -52 4 -32 Z";
  glowAt(t, -10, -38, 22, A, st ? 0.6 : 0.4);
  fill(t, dome, mat(LAB.glass, 0.9, 0.2), { s: 0, line: 0, alpha: 0.75 });
  t.ctx.save();
  t.ctx.clip(new Path2D(dome));
  fill(t, "M -30 -42 L 10 -42 L 10 -30 L -30 -30 Z", mat(mix(A, 0xeaffd0, 0.3), 0.5), { s: 2, line: 0 });
  for (const [x, y] of [[-16, -38], [-6, -40], [-10, -34]] as const) fill(t, ellipse(x, y, 3.2, 3.8), mat(LAB.cream, 0.4), { s: 1, line: LINE * 0.5 });
  t.ctx.restore();
  ink(t, dome, LINE);
  flat(t, ellipse(-18, -44, 2.4, 1.4), "rgba(255,255,255,0.9)");
  fill(t, "M -28 -34 L 8 -34 L 8 -29 L -28 -29 Z", chromeMat, { s: 1.5, line: LINE * 0.8 });
  staples(t, -26, -28, 6, -28, 4, 2);
  // babies riding along
  for (const [x, y, k] of [[14, -34, 1], [-40, -36, 0.85]] as const) {
    fill(t, ellipse(x, y, 6 * k, 3.4 * k), mat(LAB.cream, 0.3), { s: 1, line: LINE * 0.7 });
    ink(t, `M ${x - 5 * k} ${y - 1} q ${-3 * k} ${-5 * k} ${1 * k} ${-6 * k} q ${3 * k} 0 ${2 * k} ${3 * k}`, 1.6 * k, "rgba(120,90,60,0.9)");
    flat(t, ellipse(x + 4 * k, y - 1, 1, 1), A);
  }
  // head, implant
  part(t, ellipse(18, -22, 11, 8), S, { s: 3 });
  critterEye(t, 23, -25, 2, A);
  implant(t, 14, -28, 7, A, 0.1);
  // near pincer, open (snapping on the step frame)
  fill(t, tube([[20, -18], [32, -12], [40, -16]], [4.4, 4, 3.8]), S, { s: 1.5 });
  part(t, ellipse(46, -16, 9, 7), S, { s: 3, spec: [43, -20, 2.4, 1.2, -0.3] });
  const o = st ? 2 : 6;
  fill(t, `M 50 -21 Q 64 ${-24 - o} 66 -18 Q 58 -20 52 -18 Z`, S, { s: 1.5, line: LINE * 0.9 });
  fill(t, `M 50 -12 Q 62 ${-6 + o * 0.6} 64 -13 Q 57 -13 52 -15 Z`, S, { s: 1.5, line: LINE * 0.9 });
  for (const [hx, kx, fx] of [[-22, -36, -48], [-10, -20, -30], [2, -2, -8], [12, 18, 18]] as const) leg(t, [hx, -14], [kx, -24], [fx, 0], 3.2, S);
  return [64, -16];
};

// ---------- grafted raccoon (fallback for custom "teeth" troopers) ----------

const raccoon: Painter = (t, s, f) => {
  const A = s.color;
  const G = mat(LAB.grey, 0.15);
  const GD = mat(LAB.greyDark, 0.15);
  const K = mat(LAB.black, 0.2);
  const st = f === 1;
  contact(t, 0, -2, 36, 9, 0.55);
  // the ringed tail, flat and fluffy, swept down to the ground behind
  const tail = "M -14 -34 C -40 -38 -58 -22 -58 -2 C -48 -6 -38 -10 -30 -16 C -24 -20 -18 -24 -12 -26 Z";
  part(t, tail, G, { s: 4 }, () => {
    for (const [x, y] of [[-30, -34], [-44, -26], [-54, -12]] as const) fill(t, ellipse(x, y, 5, 14), K, { s: 0, line: 0 });
  });
  fill(t, ellipse(-8 - (st ? 3 : 0), -4, 9, 5), GD, { s: 2 });
  part(t, "M -22 -46 C -26 -74 -12 -92 6 -92 C 24 -92 32 -74 28 -50 C 26 -28 16 -14 2 -14 C -14 -14 -20 -28 -22 -46 Z", G, { s: 8, spec: [-8, -82, 4, 2, -0.4] }, () => {
    fill(t, ellipse(10, -46, 14, 22), mat(LAB.cream), { s: 3, line: 0 });
  });
  if (s.medic) {
    vial(t, -24, -64, 12, 26, A, 0.1);
    staples(t, -16, -76, -16, -52, 3, 2);
  }
  // head with the bandit mask
  part(t, ellipse(6, -104, 18, 15), G, { s: 5 }, () => {
    fill(t, "M -12 -108 C -2 -114 18 -114 26 -106 L 24 -98 C 14 -104 0 -104 -10 -100 Z", K, { s: 0, line: 0 });
  });
  for (const ex of [-6, 12]) fill(t, `M ${ex - 6} -114 L ${ex - 2} -126 L ${ex + 5} -115 Z`, G, { s: 2, line: LINE * 0.9 });
  fill(t, "M 18 -104 L 32 -100 C 32 -96 26 -94 20 -95 Z", mat(LAB.white), { s: 1, line: LINE * 0.8 });
  fill(t, ellipse(32, -100, 2.6, 2.2), K, { s: 0, line: LINE * 0.6 });
  critterEye(t, 18, -106, 2.8, A);
  implant(t, 4, -116, 9, A, -0.05);
  let tip: [number, number] = [40, -80];
  if (s.ranged) {
    // a boxy goo blaster with a flared muzzle and a mutagen vial
    fill(t, "M 6 -74 L 30 -74 L 30 -62 L 6 -62 Z", chromeMat, { s: 3, line: LINE });
    fill(t, "M 30 -76 L 38 -80 L 38 -56 L 30 -60 Z", chromeMat, { s: 2, line: LINE * 0.9 });
    vial(t, 14, -80, 16, 7, A);
    glowAt(t, 38, -68, 12, A, 0.6);
    tip = [40, -68];
    fill(t, tube([[8, -60], [12, -62]], [5, 5]), G, { s: 1 });
  } else {
    // a grafted chrome claw arm
    fill(t, tube([[4, -70], [16, -66], [24, -72]], [5, 4.6, 4.4]), chromeMat, { s: 2 });
    staples(t, 2, -76, 2, -64, 2, 2.2);
    steelClaws(t, 28, -72, 3, 7);
    tip = [36, -72];
  }
  fill(t, ellipse(12 + (st ? 3 : 0), -4, 10, 5), G, { s: 2 });
  return tip;
};

export const NIBBLER: FigureArt = { paint: beetle, design: { ref: 0.45, b: [-52, -62, 60, 8], top: 50 } };
export const HOPPER: FigureArt = { paint: fox, design: { ref: 0.4, b: [-70, -88, 54, 8], top: 76 } };
export const SPITTER: FigureArt = { paint: spider, design: { ref: 0.55, b: [-62, -80, 70, 8], top: 70 } };
export const NANNY: FigureArt = { paint: scorpion, design: { ref: 0.6, b: [-70, -102, 74, 8], top: 90 } };
export const BIPED: FigureArt = { paint: raccoon, design: { ref: 0.5, b: [-66, -134, 50, 10], top: 120 } };
