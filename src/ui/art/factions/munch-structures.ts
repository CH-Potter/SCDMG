// The Munch structures (Mutagen Vat vat, Gopher Hole, Trapdoor Pit, The Sett Lab) and the faction's base
// ground: farmland dirt with the scientist's lab tech grafted on. Each structure carries the faction
// thread: chrome, staples and the glowing mutagen green.

import { mix, shade } from "../palette";
import { contact, ellipse, fill, flat, glowAt, ink, mat, rrect, type Toon } from "../toon";
import type { FigureArt, Painter } from "./types";
import { chromeMat, claws, critterEye, glowOf, implant, LAB, leg, LINE, lumpy, M, part, rng, staple, staples, steelMat } from "./munch-kit";

const gooCloud = (t: Toon, x: number, y: number, r: number, A: number, seed: number) => {
  glowAt(t, x, y, r * 2.4, A, 0.35);
  fill(t, lumpy(x, y, r * 1.35, r * 0.9, 7, 0.25, seed), mat(mix(glowOf(A), 0xffffff, 0.25), 0.3), { s: r * 0.35, line: LINE * 0.7, alpha: 0.85 });
};

// ---------- Mutagen Vat: a lab mutagen vat on chrome legs, puffing spores ----------

const vat: Painter = (t, s, f) => {
  const A = s.color;
  const big = f === 1;
  contact(t, 0, -6, 86, 18, 0.5);
  leg(t, [-26, -40], [-54, -50], [-72, -4], 4.5, steelMat);
  leg(t, [26, -40], [54, -50], [72, -4], 4.5, steelMat);
  fill(t, ellipse(0, -36, 48, 12), steelMat, { s: 3 });
  // the glass tank of glowing mutagen, something small floating in it
  const glass = "M -44 -40 L -44 -112 A 44 11 0 0 1 44 -112 L 44 -40 A 44 11 0 0 1 -44 -40 Z";
  glowAt(t, 0, -76, 84, A, 0.4);
  fill(t, glass, mat(LAB.glass, 0.9, 0.2), { s: 0, line: 0, alpha: 0.65 });
  t.ctx.save();
  t.ctx.clip(new Path2D(glass));
  const lvl = big ? -104 : -98;
  fill(t, `M -50 ${lvl} L 50 ${lvl} L 50 0 L -50 0 Z`, mat(glowOf(A), 0.6), { s: 10, line: 0 });
  fill(t, ellipse(0, lvl, 44, 9), mat(mix(glowOf(A), 0xffffff, 0.3)), { s: 0, line: 0, alpha: 0.8 });
  // the floating specimen: a curled-up little critter
  fill(t, ellipse(-4, -66, 16, 11), mat(shade(LAB.beetle, 0.1)), { s: 3, line: LINE * 0.7, alpha: 0.55 });
  ink(t, "M -16 -60 l -6 6 M -8 -58 l -2 8 M 2 -58 l 2 8", 1.6, "rgba(40,30,20,0.45)");
  for (const [x, y, r] of [[-26, -50, 3], [20, -60, 2.4], [10, -84, 2], [-14, -88, 1.6], [30, -44, 1.8]] as const) flat(t, ellipse(x, y + (big ? -4 : 0), r, r), "rgba(255,255,230,0.85)");
  flat(t, "M -36 -108 L -30 -108 L -30 -42 L -36 -42 Z", "rgba(255,255,255,0.45)");
  t.ctx.restore();
  ink(t, glass, LINE);
  staples(t, -40, -38, 40, -38, 5, 3);
  // the chrome lid with its vent
  fill(t, ellipse(0, -112, 48, 13), chromeMat, { s: 4, spec: [-20, -118, 10, 2, 0] });
  fill(t, ellipse(0, -116, 30, 7.5), steelMat, { s: 1.5 });
  ink(t, "M -22 -118 L 22 -118 M -26 -115 L 26 -115 M -20 -112 L 20 -112", 1.2, "rgba(28,21,18,0.55)");
  glowAt(t, 0, -116, 26, A, big ? 0.7 : 0.45);
  // a control box and its hose
  ink(t, "M 50 -88 C 56 -104 44 -118 30 -118", 5, "#4d565d");
  ink(t, "M 50 -88 C 56 -104 44 -118 30 -118", 2, "#9aa5ad");
  fill(t, rrect(42, -90, 18, 28, 3), chromeMat, { s: 3 });
  for (const [y, c] of [[-84, A], [-76, 0xffc23a], [-68, A]] as const) {
    glowAt(t, 51, y, 5, c, 0.6);
    flat(t, ellipse(51, y, 2.2, 2.2), mix(c, 0xffffff, 0.3));
  }
  // near legs
  leg(t, [-18, -34], [-40, -24], [-54, 0], 5, chromeMat);
  leg(t, [18, -34], [40, -24], [54, 0], 5, chromeMat);
  // spore puffs from the vent
  const lift = big ? 14 : 0;
  for (const [x, y, r] of [[2, -132, 11], [-18, -152, 8.5], [18, -164, 7]] as const) gooCloud(t, x, y - lift, r * (big ? 1.1 : 1), A, x + 50);
  return [0, -126];
};

// ---------- Gopher Hole: a freshly dug burrow with a grafted gopher popping out ----------

const burrow: Painter = (t, s, f) => {
  const A = s.color;
  const B = mat(LAB.brown, 0.15);
  const D = mat(M.dirt);
  const alt = f === 1;
  contact(t, 0, -4, 108, 22, 0.45);
  const rim = lumpy(0, -26, 94, 36, 16, 0.14, 5);
  part(t, rim, D, { s: 12, spec: [-50, -54, 14, 3, -0.1] }, () => {
    for (const [x, y, r] of [[-70, -30, 7], [70, -26, 6], [-40, -54, 5], [50, -50, 5]] as const) flat(t, ellipse(x, y, r, r * 0.6), M.dirtLight, 0.5);
    for (let i = 0; i < 3; i++) ink(t, `M ${-84 + i * 8} ${-30 + i * 2} Q ${-78 + i * 8} -18 ${-74 + i * 8} ${-6 + i}`, 2.2, "rgba(40,24,14,0.55)");
  });
  for (const [x, y, r] of [[-80, -38, 11], [-56, -56, 12], [-24, -64, 10], [14, -66, 11], [48, -58, 12], [76, -42, 10]] as const)
    fill(t, lumpy(x, y, r, r * 0.75, 7, 0.2, x + 300), D, { s: r * 0.5, line: LINE * 0.8, spec: [x - r * 0.4, y - r * 0.4, r * 0.3, r * 0.12, -0.2] });
  part(t, ellipse(0, -24, 60, 26), mat(M.hole), { s: 0 }, () => {
    fill(t, ellipse(0, -46, 66, 18), mat(shade(M.dirt, -0.45)), { s: 0, line: 0 });
  });
  // the gopher, wearing its implant
  const up = alt ? 6 : 0;
  t.ctx.save();
  t.ctx.clip(new Path2D("M -90 -200 L 90 -200 L 90 -20 Q 0 4 -90 -20 Z"));
  part(t, ellipse(6, -34 - up, 26, 20), B, { s: 6, spec: [-4, -46 - up, 4, 2, -0.5] }, () => {
    fill(t, ellipse(18, -28 - up, 12, 9), mat(LAB.cream), { s: 2, line: 0 });
  });
  t.ctx.restore();
  fill(t, ellipse(-14, -46 - up, 6, 5), B, { s: 2 });
  fill(t, ellipse(30, -38 - up, 4.2, 3.4), mat(0xd88a8a, 0.4), { s: 1, line: LINE * 0.7 });
  fill(t, `M 21 ${-31 - up} L 29 ${-31 - up} L 29 ${-24 - up} L 21 ${-24 - up} Z`, mat(LAB.white, 0.3), { s: 1, line: LINE * 0.8 });
  ink(t, `M 25 ${-31 - up} L 25 ${-24 - up}`, 1);
  critterEye(t, 16, -44 - up, 3.4, A);
  implant(t, 2, -52 - up, 12, A, -0.1);
  // paws gripping the lip
  fill(t, ellipse(-24, -10, 8, 5), B, { s: 2 });
  fill(t, ellipse(36, -10, 8, 5), B, { s: 2 });
  claws(t, -20, -7, 3, 4);
  claws(t, 40, -7, 3, 4);
  fill(t, "M -62 -18 C -40 4 40 4 62 -18 C 70 -6 50 10 0 10 C -50 10 -70 -6 -62 -18 Z", D, { s: 4, line: 0 });
  ink(t, "M -62 -18 C -40 4 40 4 62 -18", LINE);
  const clods: [number, number, number][] = alt ? [[-58, -86, 6], [52, -94, 5]] : [[-50, -76, 6], [46, -84, 5]];
  for (const [x, y, r] of clods) fill(t, `M ${x - r} ${y} L ${x - r * 0.3} ${y - r} L ${x + r} ${y - r * 0.4} L ${x + r * 0.6} ${y + r * 0.8} L ${x - r * 0.5} ${y + r * 0.7} Z`, D, { s: r * 0.4, line: LINE * 0.8 });
  for (const [x, y, r] of [[-86, -14, 6], [84, -8, 5.5]] as const) fill(t, ellipse(x, y, r, r * 0.7), mat(M.stone), { s: r * 0.4, line: LINE * 0.7 });
  return [24, -34];
};

// ---------- Trapdoor Pit: a trapdoor-spider pit, its lid propped open, legs and eyes in the dark ----------

const pit: Painter = (t, s, f) => {
  const A = s.color;
  const H = mat(LAB.spider, 0.15);
  const D = mat(M.dirt);
  const shut = f === 1;
  contact(t, 0, -6, 100, 22, 0.4);
  // the hinged lid, propped up at the back: a thick disc of dirt, silk-lined underneath, grass on top
  const ly = shut ? -52 : -68;
  const lr = shut ? 24 : 36;
  fill(t, ellipse(0, ly - 3, 58, lr + 3), D, { s: 8 });
  for (let i = 0; i < 7; i++) {
    const x = -48 + i * 16;
    const y = ly - 3 - Math.sqrt(Math.max(0, 1 - (x / 58) ** 2)) * (lr + 3);
    fill(t, `M ${x - 6} ${y + 3} L ${x - 6} ${y - 6} L ${x - 2} ${y} L ${x} ${y - 10} L ${x + 2} ${y} L ${x + 6} ${y - 7} L ${x + 6} ${y + 3} Z`, mat(0x7a8a3a), { s: 1.5, line: LINE * 0.7 });
  }
  part(t, ellipse(0, ly, 50, lr - 2), mat(0xa39a88, 0.3), { s: 5 }, () => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ink(t, `M 0 ${ly} L ${Math.cos(a) * 50} ${ly + Math.sin(a) * lr}`, 1, "rgba(236,230,214,0.5)");
    }
  });
  // the burrow mouth
  fill(t, ellipse(0, -18, 60, 25), D, { s: 6 });
  fill(t, ellipse(0, -18, 48, 18), mat(M.hole), { s: 0 });
  ink(t, ellipse(0, -18, 46, 17), 2, "rgba(232,224,192,0.6)");
  // the implant glinting in the dark above a cluster of eyes
  implant(t, 0, -24, 11, A, 0);
  for (const [x, y, r] of [[-8, -18, 2.8], [8, -18, 2.8], [-15, -15, 1.8], [15, -15, 1.8], [-4, -12, 1.6], [4, -12, 1.6]] as const) {
    glowAt(t, x, y, r * 3, A, 0.6);
    flat(t, ellipse(x, y, r, r), glowOf(A));
  }
  // hairy legs reaching out over the rim
  const k = shut ? -4 : 0;
  leg(t, [-18, -16], [-34, -36 - k], [-54, -8], 3.6, H);
  leg(t, [18, -16], [34, -36 - k], [54, -8], 3.6, H);
  leg(t, [-10, -12], [-22, -26 - k], [-34, 0], 3.4, H);
  leg(t, [10, -12], [22, -26 - k], [34, 0], 3.4, H);
  return [0, -24];
};

// ---------- The Sett Lab: the scientist's burrow-lab, a badger sett with a steel hatch ----------

const warren: Painter = (t, s, f) => {
  const A = s.color;
  const alt = f === 1;
  contact(t, 0, -4, 118, 20, 0.5);
  // a little flat dish on a stub, receiving orders
  fill(t, "M 22 -108 L 26 -124 L 30 -108 Z", steelMat, { s: 1, line: LINE * 0.8 });
  t.ctx.save();
  t.ctx.translate(27, -126);
  t.ctx.rotate(-0.4);
  fill(t, ellipse(0, 0, 14, 4), chromeMat, { s: 1.5, line: LINE * 0.9 });
  t.ctx.restore();
  // the mound, with a grassy top
  const hill = "M -116 -4 C -118 -44 -92 -80 -54 -94 C -36 -108 2 -112 26 -102 C 68 -94 108 -60 116 -4 C 82 14 -82 14 -116 -4 Z";
  part(t, hill, mat(M.dirt), { s: 16, spec: [-44, -90, 12, 3, -0.3] }, () => {
    for (const [y, k] of [[-30, 1], [-56, -1]] as const) ink(t, `M -120 ${y} Q -60 ${y - 10 * k} 0 ${y - 2} T 120 ${y - 6 * k}`, 1.6, "rgba(50,30,18,0.35)");
    fill(t, "M -96 -60 C -80 -96 -30 -116 20 -108 C 64 -100 100 -70 108 -40 C 90 -54 60 -66 40 -60 C 20 -76 -10 -70 -24 -62 C -44 -76 -74 -74 -96 -60 Z", mat(0x7a8a3a, 0.1), { s: 6, line: LINE * 0.8 });
  });
  // pipes looping in and out of the earth
  for (const [x0, x1, top] of [[62, 86, -88], [74, 96, -70]] as const) {
    const d = `M ${x0} -46 L ${x0} ${top + 10} Q ${x0} ${top} ${x0 + 10} ${top} L ${x1 - 10} ${top} Q ${x1} ${top} ${x1} ${top + 10} L ${x1} -40`;
    ink(t, d, 9, "#2a2522");
    ink(t, d, 6.5, "#9aa5ad");
    ink(t, d, 2, "rgba(255,255,255,0.6)");
    for (const x of [x0, x1]) fill(t, rrect(x - 6, -48, 12, 5, 1), steelMat, { s: 1, line: LINE * 0.7 });
  }
  // a glowing vent grille
  fill(t, rrect(-96, -56, 30, 18, 3), chromeMat, { s: 3 });
  fill(t, rrect(-92, -52, 22, 10, 1.5), mat(glowOf(A), 0.5), { s: 0, line: LINE * 0.6 });
  ink(t, "M -88 -52 L -88 -42 M -82 -52 L -82 -42 M -76 -52 L -76 -42", 1.4);
  glowAt(t, -81, -47, 22, A, alt ? 0.7 : 0.5);
  staples(t, -94, -38, -68, -38, 3, 2.6);
  gooCloud(t, -76, alt ? -84 : -74, 7, A, 9);
  // the sett entrance, sealed with a round steel hatch
  fill(t, "M -50 -2 C -54 -48 -28 -72 0 -72 C 28 -72 54 -48 50 -2 Z", mat(shade(M.dirt, -0.3)), { s: 5 });
  fill(t, ellipse(0, -32, 36, 32), chromeMat, { s: 8, spec: [-16, -54, 8, 2.4, -0.4] });
  fill(t, ellipse(2, -31, 26, 23), steelMat, { s: 5 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    flat(t, ellipse(Math.cos(a) * 31, -32 + Math.sin(a) * 27.5, 1.8, 1.6), 0x4d565d);
  }
  // the porthole, lit green from inside, and the wheel
  glowAt(t, 2, -44, 16, A, alt ? 0.8 : 0.55);
  fill(t, ellipse(2, -44, 7, 6), mat(glowOf(A), 0.8), { s: 0, line: LINE * 0.9 });
  const rot = alt ? 0.4 : 0;
  ink(t, ellipse(2, -24, 9, 8), 2.6, "#c9d2d8");
  for (let i = 0; i < 4; i++) {
    const a = rot + (i / 4) * Math.PI;
    ink(t, `M ${2 + Math.cos(a) * 9} ${-24 + Math.sin(a) * 8} L ${2 - Math.cos(a) * 9} ${-24 - Math.sin(a) * 8}`, 2, "#c9d2d8");
  }
  staple(t, -36, -30, 4, 0);
  staple(t, 38, -30, 4, 0);
  for (const [x, y, r] of [[-90, -22, 6], [94, -10, 4], [60, -8, 5]] as const) fill(t, ellipse(x, y, r, r * 0.75), mat(M.stone), { s: r * 0.4, line: LINE * 0.7 });
  return [2, -44];
};

// ---------- the base ground: farmland dirt, straw, and a little spilled mutagen ----------

const MUTAGEN = 0x6cc24a;
const FIELD = 0x8a6b48;

export function munchBaseTop(t: Toon, R: number, RY: number, seed: number): void {
  const rnd = rng(seed * 7 + 3);
  fill(t, ellipse(0, 0, R + 2, RY + 2), mat(FIELD), { s: 8, line: 0, hi: 0.3 });
  // plough furrows
  for (const k of [-0.45, 0, 0.45]) ink(t, `M ${-R} ${k * RY + R * 0.1} Q 0 ${k * RY - R * 0.12} ${R} ${k * RY + R * 0.1}`, 2.2, "rgba(40,26,14,0.35)");
  // straw
  for (let i = 0; i < Math.round(3 + R / 18); i++) {
    const x = (rnd() - 0.5) * R * 1.5;
    const y = (rnd() - 0.5) * RY * 1.5;
    const a = rnd() * Math.PI;
    const l = 5 + rnd() * 5;
    ink(t, `M ${x} ${y} l ${Math.cos(a) * l} ${Math.sin(a) * l * 0.6}`, 1.4, "rgba(214,184,96,0.75)");
  }
  // a small puddle of spilled mutagen near the rim
  {
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * R * 0.6;
    const y = Math.sin(a) * RY * 0.6;
    const r = Math.max(5, R * 0.1);
    glowAt(t, x, y, r * 1.6, MUTAGEN, 0.18);
    fill(t, `M ${x - r} ${y} C ${x - r} ${y - r * 0.5} ${x} ${y - r * 0.55} ${x + r * 0.4} ${y - r * 0.4} C ${x + r * 1.1} ${y - r * 0.3} ${x + r * 1.1} ${y + r * 0.4} ${x + r * 0.3} ${y + r * 0.45} C ${x - r * 0.4} ${y + r * 0.5} ${x - r} ${y + r * 0.35} ${x - r} ${y} Z`, mat(glowOf(MUTAGEN), 0.7), { s: r * 0.2, line: 1, hi: 0.4, alpha: 0.7 });
    flat(t, ellipse(x - r * 0.3, y - r * 0.15, r * 0.25, r * 0.08), "rgba(255,255,230,0.8)");
  }
  // pebbles, and now and then a dropped staple
  for (let i = 0; i < Math.round(5 + R / 12); i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * R * 0.92;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d * 0.92;
    const pr = 1.6 + rnd() * 2.2;
    fill(t, ellipse(x, y, pr, pr * 0.75), mat(rnd() < 0.5 ? 0x8a7458 : 0x5a4632), { s: pr * 0.5, line: 0.8, hi: 0.5 });
  }
  if (R > 40) staple(t, (rnd() - 0.5) * R, (rnd() - 0.5) * RY, 2.4, rnd() * 3);
}

export const POD: FigureArt = { paint: vat, design: { ref: 0.9, b: [-100, -186, 100, 22], top: 150 } };
export const BURROW: FigureArt = { paint: burrow, design: { ref: 1, b: [-116, -120, 116, 30], top: 80 } };
export const PIT: FigureArt = { paint: pit, design: { ref: 1, b: [-112, -126, 112, 34], top: 100 } };
export const WARREN: FigureArt = { paint: warren, design: { ref: 1, b: [-124, -150, 124, 24], top: 120 } };
