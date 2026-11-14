// Dustline Militia machines: Big Bertha (a combine harvester on legs with a cannon), the Sky Rustler
// (orange crop-duster monoplane), the Hay Bomber (twin-engine cargo biplane loaded with hay) and the
// Tumbleweed Riders (wire-bound dirt bikes). Flyers are seen from above at the board's 3/4 angle, so the
// far wing rises up the screen and the near wing comes down towards the viewer.

import { css, mix, shade } from "../palette";
import { tube } from "../toon";
import type { Design, Painter } from "./types";
import { at, back, chevron, poly, clipTo, contact, corrugate, ellipse, faded, fill, flat, glowAt, goggle, ink, K, LINE, type Mat, mat, mitt, patch, place, type Pt, puffs, rivets, rrect, rustSpots, type Toon } from "./militia-kit";

// ---------- Big Bertha ----------

/** A hydraulic tractor leg: thigh, piston, brass knee, shin and a wide plough-share foot. */
function mechLeg(t: Toon, hx: number, kx: number, fx: number, lift: number, m: Mat, A: number): void {
  const hy = -104;
  const ky = -60 - lift;
  const fy = -16 - lift;
  fill(t, tube([[hx, hy], [kx, ky]], [19, 15]), m, { s: 6 });
  ink(t, `M ${hx + 6} ${hy + 6} L ${kx + 7} ${ky - 6}`, 3, "rgba(230,232,232,0.75)");
  fill(t, tube([[kx, ky], [fx, fy]], [15, 13]), m, { s: 6 });
  fill(t, ellipse(kx, ky, 14, 14), mat(K.brass, 0.6), { s: 4, spec: [kx - 4, ky - 4, 3, 2] });
  rivets(t, [[kx, ky]], 3);
  fill(t, `M ${fx - 34} ${-2 - lift} C ${fx - 36} ${-17 - lift} ${fx - 22} ${-25 - lift} ${fx} ${-25 - lift} C ${fx + 24} ${-25 - lift} ${fx + 38} ${-15 - lift} ${fx + 36} ${-2 - lift} Z`, mat(K.gun, 0.5), { s: 5 });
  fill(t, `M ${fx + 16} ${-23 - lift} C ${fx + 28} ${-21 - lift} ${fx + 38} ${-13 - lift} ${fx + 36} ${-2 - lift} L ${fx + 18} ${-2 - lift} Z`, mat(A, 0.4), { s: 2, line: LINE * 0.8 });
}

/** Big Bertha: a combine harvester someone bolted a cannon to, now walking. */
export const bertha: Painter = (t, s, f) => {
  const A = s.color;
  const step = f === 1;
  const tin = mat(K.tin, 0.4);
  contact(t, 4, -4, 112, 18, 0.55);

  // exhaust stack, coughing smoke straight up
  fill(t, rrect(-108, -228, 20, 66, 1.5), mat(K.steel, 0.6), { s: 3, spec: [-105, -222, 1.5, 12, 0] });
  fill(t, rrect(-110, -232, 24, 8, 1), mat(K.gun, 0.5), { s: 2 });
  fill(t, poly([[-110, -232], [-86, -232], [-80, step ? -250 : -244], [-104, step ? -250 : -244]]), mat(K.rust, 0.4), { s: 2, line: LINE * 0.8 });
  puffs(t, -92, -250 - (step ? 3 : 0), 10, 0x9a948c, 2, 1.2, -0.3);

  mechLeg(t, -46, -66, -52, step ? 14 : 0, mat(shade(K.gun, -0.18), 0.4), back(A, 0.2));

  // the header: cutter bar with guards, reel arms and the turning reel of wooden bats
  fill(t, "M 60 -118 L 110 -90 L 104 -82 L 54 -108 Z", mat(K.gun, 0.5), { s: 2 });
  fill(t, "M 78 -62 L 158 -62 C 166 -62 170 -52 166 -42 L 80 -40 C 72 -46 72 -58 78 -62 Z", mat(faded(A), 0.35), { s: 6, spec: [96, -59, 16, 1.4, 0] });
  for (let i = 0; i < 9; i++) fill(t, `M ${84 + i * 9.5} -41 L ${88 + i * 9.5} -32 L ${92 + i * 9.5} -41 Z`, mat(K.steel, 0.8), { s: 0, line: LINE * 0.7 });
  const rx = 118;
  const ry = -86;
  const spin = step ? 0.5 : 0;
  fill(t, ellipse(rx, ry, 30, 30), mat(mix(K.wood, K.ink, 0.5)), { s: 0, line: LINE * 0.6, alpha: 0.35 });
  for (let i = 0; i < 5; i++) {
    const a = spin + (i / 5) * Math.PI * 2;
    ink(t, `M ${rx} ${ry} L ${rx + Math.cos(a) * 28} ${ry + Math.sin(a) * 28}`, 3, "#5b5f64");
    fill(t, ellipse(rx + Math.cos(a) * 30, ry + Math.sin(a) * 30, 7, 7), mat(K.woodLight), { s: 2.5, line: LINE * 0.8 });
  }
  fill(t, ellipse(rx, ry, 8, 8), mat(A, 0.5), { s: 2 });
  rivets(t, [[rx, ry]], 2.6);

  // hull: corrugated tin belly, orange grain tank, hazard band
  const belly = rrect(-104, -152, 176, 58, 10);
  fill(t, belly, tin, { s: 12 });
  corrugate(t, belly, -104, 72, -152, -94, 9);
  rustSpots(t, belly, [[-80, -110, 10], [30, -100, 7], [52, -140, 6]]);
  const tank = "M -100 -148 L -94 -196 C -93 -200 -90 -202 -86 -202 L 52 -202 C 58 -202 60 -198 62 -194 L 76 -148 Z";
  fill(t, tank, mat(faded(A), 0.35), { s: 12, spec: [-40, -196, 26, 2.4, 0] });
  ink(t, "M -20 -200 L -22 -150", LINE * 0.8, "rgba(60,30,10,0.45)");
  chevron(t, 32, -176, 2.2, shade(A, -0.45));
  rivets(t, [[-88, -192], [-28, -194], [-30, -156], [46, -194], [64, -156], [-92, -156]], 2.4);
  patch(t, -76, -186, 26, 20, K.tin);
  fill(t, rrect(-104, -104, 176, 12, 3), mat(K.gun, 0.4), { s: 3 });
  clipTo(t, rrect(-104, -104, 176, 12, 3), () => {
    for (let x = -112; x < 76; x += 16) flat(t, `M ${x} -92 L ${x + 12} -104 L ${x + 20} -104 L ${x + 8} -92 Z`, "#e8b632");
  });
  // headlamp
  glowAt(t, 80, -132, 22, 0xffe2a0, 0.5);
  fill(t, ellipse(74, -132, 8, 8), mat(K.brass, 0.7), { s: 2 });
  fill(t, ellipse(74.6, -132, 5, 5), mat(0xfff3c0, 0.9), { s: 0, line: 0 });

  // cab at the back with the driver, under a tin roof
  fill(t, rrect(-96, -248, 66, 52, 9), mat(shade(K.tin, -0.05), 0.4), { s: 8 });
  fill(t, rrect(-88, -238, 50, 30, 6), mat(K.lens, 0.9, 0.2), { s: 4, spec: [-80, -232, 6, 2.4, 0] });
  clipTo(t, rrect(-88, -238, 50, 30, 6), () => {
    fill(t, ellipse(-58, -214, 11, 11), mat(K.skin), { s: 4, line: LINE * 0.8 });
    fill(t, "M -70 -218 C -71 -232 -45 -232 -46 -218 Z", mat(A, 0.5), { s: 2, line: LINE * 0.8 });
    goggle(t, -52, -215, 3.6, 3.4);
  });
  flat(t, "M -86 -236 L -74 -236 L -88 -212 Z", "rgba(255,255,255,0.35)");
  fill(t, "M -102 -250 L -24 -250 L -28 -242 L -98 -242 Z", mat(K.tin, 0.5), { s: 2 });

  // turret ring, shell rack and the Thumper cannon (a culvert pipe with ambitions)
  fill(t, ellipse(12, -202, 34, 10), mat(K.gun, 0.5), { s: 3 });
  fill(t, poly([[-22, -228], [6, -228], [10, -234], [-18, -234]]), mat(K.woodLight), { s: 1.5, line: LINE * 0.8 });
  fill(t, rrect(-22, -228, 28, 22, 2), mat(K.wood), { s: 3 });
  for (const x of [-18, -10, -2]) fill(t, rrect(x, -233, 6, 5, 1), mat(K.brass, 0.75), { s: 0, line: LINE * 0.6 });
  chevron(t, -8, -217, 1, A);
  const ca = -0.26 + (step ? 0.03 : 0);
  const ck = step ? -5 : 0;
  at(t, 20, -208, ca, () => {
    fill(t, rrect(-26, -16, 44, 32, 8), mat(K.gun, 0.5), { s: 5 });
    fill(t, rrect(10 + ck, -11, 108, 22, 8), mat(K.steel, 0.55), { s: 6, spec: [24, -8, 26, 1.8, 0] });
    for (const x of [36, 72]) fill(t, rrect(x + ck, -13, 9, 26, 2), mat(A, 0.45), { s: 2, line: LINE * 0.8 });
    rivets(t, [[40.5 + ck, -8], [76.5 + ck, -8]], 1.6);
    fill(t, poly([[112 + ck, -15], [134 + ck, -17], [134 + ck, 17], [112 + ck, 15]]), mat(K.gun, 0.55), { s: 4 });
    for (const y of [-9, 1]) flat(t, rrect(118 + ck, y, 10, 4, 1.5), "#1c1512");
    rivets(t, [[-16, -8], [8, -8]], 2);
  });

  mechLeg(t, 28, 50, 40, 0, mat(K.gun, 0.55), A);
  return place(20, -208, ca, 134 + ck, 0);
};

// ---------- Sky Rustler ----------

/** A propeller disc (idle: a blur; f 1: two blades). */
function prop(t: Toon, x: number, y: number, ry: number, f: number): void {
  if (f === 1) {
    fill(t, `M ${x - 2} ${y - 2} L ${x + 1} ${y - ry} L ${x + 5} ${y - ry + 2} L ${x + 3} ${y - 2} Z M ${x - 2} ${y + 2} L ${x + 1} ${y + ry} L ${x + 5} ${y + ry - 2} L ${x + 3} ${y + 2} Z`, mat(0x5c3a1c, 0.4), { s: 1, line: LINE * 0.8 });
  } else {
    flat(t, ellipse(x + 2, y, 5, ry), "rgba(250,245,235,0.5)");
    ink(t, ellipse(x + 2, y, 5, ry), LINE * 0.6, "rgba(28,21,18,0.45)");
  }
  fill(t, ellipse(x + 3, y, 4, 5), mat(K.brass, 0.7), { s: 1.5, line: LINE * 0.7 });
}

/** A pilot's head in a leather flying cap and goggles, scarf streaming back. */
function pilot(t: Toon, x: number, y: number, f: number, A: number): void {
  fill(t, `M ${x - 8} ${y + 6} C ${x - 24} ${y + 4} ${x - 38} ${f ? y + 12 : y + 6} ${x - 48} ${f ? y + 14 : y + 8} C ${x - 38} ${y + 14} ${x - 24} ${y + 10} ${x - 8} ${y + 10} Z`, mat(A, 0.3), { s: 2, line: LINE * 0.7 });
  fill(t, ellipse(x, y, 10, 9.5), mat(K.skin), { s: 4 });
  fill(t, `M ${x - 11} ${y - 1} C ${x - 12} ${y - 13} ${x + 8} ${y - 14} ${x + 8} ${y - 3} Z`, mat(K.leather, 0.3), { s: 2, line: LINE * 0.8 });
  goggle(t, x + 6, y - 2, 3.6, 3.4);
}

/** Sky Rustler: an orange crop-duster monoplane with a spray boom, a hopper and a chain popper on the nose. */
export const rustler: Painter = (t, s, f) => {
  const A = s.color;
  const cream = mat(K.cream, 0.3);
  const wingF = mat(back(A, 0.22), 0.35);
  const wingN = mat(A, 0.4);
  const ribs = (d: string, y0: number, y1: number) =>
    clipTo(t, d, () => {
      for (let y = y0; y < y1; y += 13) ink(t, `M -20 ${y} L 50 ${y}`, 1, "rgba(90,40,10,0.28)");
    });
  // far wing and far tailplane, behind the fuselage
  const farWing = "M -8 -58 L 0 -118 Q 2 -127 12 -127 L 30 -127 Q 40 -127 40 -118 L 42 -58 Z";
  fill(t, farWing, wingF, { s: 6 });
  ribs(farWing, -120, -60);
  fill(t, "M 1 -114 L 40 -114 L 40 -105 L 0 -105 Z", mat(shade(K.cream, -0.15)), { s: 0, line: LINE * 0.7 });
  ink(t, "M -9 -64 L -1 -118", 2.6, "#5b5f64");
  fill(t, "M -92 -58 L -90 -84 Q -89 -90 -82 -90 L -74 -90 L -72 -58 Z", wingF, { s: 3 });
  // fuselage, fin, stripe
  const body = "M -98 -56 C -90 -64 -54 -70 -10 -72 C 36 -74 70 -70 84 -64 C 94 -60 94 -42 84 -38 C 70 -32 36 -32 -10 -34 C -54 -36 -90 -44 -98 -50 Z";
  fill(t, body, cream, { s: 8, spec: [-30, -68, 26, 2.2, 0] });
  clipTo(t, body, () => flat(t, "M -100 -46 C -54 -44 30 -46 96 -50 L 96 -42 C 30 -38 -54 -38 -100 -40 Z", css(A)));
  ink(t, body, LINE);
  rivets(t, [[-64, -54], [-36, -56], [56, -58]], 1.3);
  fill(t, "M -98 -56 L -94 -96 C -92 -100 -84 -100 -82 -94 L -70 -62 Z", wingN, { s: 4 });
  fill(t, "M -94 -90 L -84 -92 L -82 -86 L -93 -84 Z", mat(K.cream), { s: 0, line: LINE * 0.6 });
  // hopper tank
  fill(t, rrect(18, -84, 30, 18, 6), mat(K.tin, 0.6), { s: 4, spec: [24, -81, 6, 1.4, 0] });
  fill(t, ellipse(33, -84, 6, 2.6), mat(K.brass, 0.7), { s: 1, line: LINE * 0.7 });
  // pilot in the open cockpit
  fill(t, ellipse(-10, -66, 15, 6), mat(K.leatherDark), { s: 0, line: LINE * 0.8 });
  pilot(t, -8, -76, f, K.red);
  fill(t, "M 2 -72 L 10 -82 L 14 -80 L 8 -70 Z", mat(0xdff4f2, 0.9), { s: 0, line: LINE * 0.7, alpha: 0.85 });
  // nose: cowling, chain popper, propeller
  fill(t, ellipse(84, -51, 10, 17), mat(K.steel, 0.7), { s: 3, spec: [81, -59, 2, 4] });
  fill(t, rrect(52, -84, 40, 6, 2.5), mat(K.gun, 0.6), { s: 2, spec: [58, -83, 6, 0.8, 0] });
  fill(t, rrect(50, -88, 14, 12, 3), mat(K.gun, 0.5), { s: 2 });
  for (let i = 0; i < 4; i++) fill(t, rrect(46 - i * 5, -80 + i * 2, 4, 7, 1.2), mat(K.brass, 0.7), { s: 0, line: LINE * 0.5 });
  prop(t, 92, -51, 32, f);
  // near tailplane and near wing, with the spray boom
  fill(t, "M -92 -46 L -72 -46 L -72 -22 Q -73 -16 -80 -16 L -86 -16 Q -92 -17 -92 -24 Z", wingN, { s: 3 });
  const wing = "M -8 -46 L 42 -46 L 40 14 Q 40 24 30 24 L 12 24 Q 2 24 0 14 Z";
  fill(t, wing, wingN, { s: 7, spec: [8, -36, 2, 14, 0] });
  ribs(wing, -32, 24);
  fill(t, "M 0 6 L 41 6 L 41 15 L 0 15 Z", mat(K.cream), { s: 0, line: LINE * 0.7 });
  patch(t, 16, -30, 13, 11, K.canvas);
  chevron(t, 20, -6, 1.3, shade(A, -0.5));
  rivets(t, [[4, -38], [34, -38]], 1.3);
  ink(t, "M -10 -38 L -2 22", 2.6, "#5b5f64");
  for (const [x, y] of [[-9, -28], [-7, -12], [-5, 4], [-3, 18]] as const) fill(t, ellipse(x, y, 2.4, 2.4), mat(K.brass, 0.7), { s: 0, line: LINE * 0.5 });
  if (f === 1) for (const [x, y, r] of [[-22, -18, 7], [-34, -2, 9], [-50, 12, 8]] as const) fill(t, ellipse(x, y, r, r * 0.8), mat(K.cream), { s: 2, alpha: 0.75, line: LINE * 0.6 });
  return [94, -81];
};

export const RUSTLER_DESIGN: Design = { ref: 0.9, b: [-108, -134, 116, 30], top: 100 };

// ---------- Hay Bomber ----------

/** A square hay bale with twine. */
function bale(t: Toon, x: number, y: number, w: number, h: number): void {
  const d = rrect(x, y, w, h, 3);
  fill(t, d, mat(K.hay), { s: 4 });
  clipTo(t, d, () => {
    for (let i = 0; i < 5; i++) ink(t, `M ${x + 3 + i * (w / 5)} ${y + 2} l 3 ${h - 4}`, 0.9, "rgba(140,96,30,0.6)");
  });
  ink(t, `M ${x + w * 0.3} ${y} L ${x + w * 0.3} ${y + h} M ${x + w * 0.7} ${y} L ${x + w * 0.7} ${y + h}`, 1.6, "#7a4f2e");
}

/** A wing engine nacelle with its propeller. */
function engine(t: Toon, x: number, y: number, f: number, A: number): void {
  fill(t, `M ${x} ${y - 10} L ${x + 34} ${y - 12} C ${x + 42} ${y - 12} ${x + 44} ${y + 12} ${x + 34} ${y + 12} L ${x} ${y + 10} L ${x - 4} ${y + 8} L ${x - 4} ${y - 8} Z`, mat(K.tin, 0.6), { s: 4, spec: [x + 8, y - 8, 8, 1, 0] });
  fill(t, ellipse(x + 38, y, 6, 12.5), mat(A, 0.5), { s: 2 });
  rivets(t, [[x + 8, y - 4], [x + 22, y - 4]], 1.2);
  prop(t, x + 42, y, 24, f);
}

/** Hay Bomber: a fat twin-engine cargo biplane, cream wings, denim hull, hay bales lashed on the back. */
export const bomber: Painter = (t, s, f) => {
  const A = s.color;
  const wingC = K.cream;
  const hull = mat(K.denim, 0.3);
  // lower wing, staggered back and mostly under the upper one
  const lower = "M -16 -66 L -12 -150 Q -10 -158 0 -158 L 34 -158 Q 44 -158 44 -150 L 46 18 Q 46 26 36 26 L -2 26 Q -12 26 -12 18 Z";
  fill(t, lower, mat(shade(wingC, -0.18), 0.3), { s: 6 });
  // tailplane, fuselage, fin
  fill(t, "M -120 -72 L -116 -102 Q -114 -108 -106 -108 L -96 -108 L -92 -72 Z", mat(shade(wingC, -0.12)), { s: 3 });
  const body = "M -126 -70 C -116 -80 -56 -92 0 -94 C 56 -96 92 -90 108 -80 C 124 -72 124 -56 108 -50 C 92 -42 56 -40 0 -40 C -56 -40 -116 -52 -126 -60 Z";
  fill(t, body, hull, { s: 10, spec: [-50, -88, 30, 2.4, 0] });
  clipTo(t, body, () => {
    flat(t, "M 88 -100 L 98 -100 L 98 -36 L 88 -36 Z", css(A));
    flat(t, "M -130 -60 C -80 -56 20 -56 130 -62 L 130 -56 C 20 -50 -80 -50 -130 -54 Z", "rgba(255,240,210,0.55)");
  });
  ink(t, body, LINE);
  rivets(t, [[-100, -64], [-56, -70], [72, -72]], 1.4);
  patch(t, -66, -60, 14, 11, K.canvas);
  fill(t, "M -126 -70 L -120 -116 C -118 -122 -108 -122 -106 -114 L -92 -76 Z", mat(A, 0.4), { s: 4 });
  chevron(t, -112, -102, 1.1, K.cream);
  fill(t, "M -120 -46 L -94 -46 L -94 -22 Q -95 -16 -102 -16 L -112 -16 Q -120 -17 -120 -24 Z", mat(wingC), { s: 3 });
  // tail gunner's perch and gun
  fill(t, ellipse(-100, -80, 10, 5), mat(K.leatherDark), { s: 0, line: LINE * 0.8 });
  fill(t, rrect(-132, -92, 30, 5, 2), mat(K.gun, 0.6), { s: 1.5 });
  // hay bales lashed on the back, under a net
  bale(t, -86, -100, 26, 20);
  bale(t, -64, -104, 26, 20);
  bale(t, -76, -120, 26, 20);
  ink(t, "M -90 -94 L -36 -110 M -90 -82 L -36 -94", 1.4, "rgba(60,40,22,0.7)");
  // glazed nose
  fill(t, "M 104 -82 C 118 -82 126 -72 126 -65 C 126 -58 118 -48 104 -48 Z", mat(K.lens, 0.9, 0.2), { s: 4, spec: [112, -76, 3, 2, 0] });
  ink(t, "M 104 -82 L 104 -48 M 114 -80 L 114 -50", LINE * 0.9, "#a07a2e");
  // pilot behind the upper wing
  fill(t, ellipse(-24, -84, 15, 6), mat(K.leatherDark), { s: 0, line: LINE * 0.8 });
  pilot(t, -22, -93, f, K.red);
  // the upper wing across the top, with ribs and orange tips
  const upper = "M -4 -100 L 0 -176 Q 2 -184 12 -184 L 48 -184 Q 58 -184 58 -176 L 60 -8 Q 60 0 50 0 L 10 0 Q 0 0 0 -8 Z";
  fill(t, upper, mat(wingC, 0.3), { s: 8, spec: [12, -170, 2.4, 26, 0] });
  clipTo(t, upper, () => {
    for (let y = -172; y < 0; y += 14) ink(t, `M -6 ${y} L 64 ${y}`, 1, "rgba(120,100,70,0.35)");
    flat(t, "M -6 -186 L 64 -186 L 64 -168 L -6 -168 Z", css(A));
    flat(t, "M -6 -16 L 64 -16 L 64 2 L -6 2 Z", css(A));
  });
  ink(t, upper, LINE);
  patch(t, 14, -150, 18, 13, K.canvas);
  rivets(t, [[30, -100], [30, -84]], 1.6);
  // struts down to the lower wing's near tip
  for (const x of [8, 40]) ink(t, `M ${x} 18 L ${x + 3} -2`, 3.2, "#7a4f2e");
  // engines on the upper wing
  engine(t, 34, -146, f, A);
  engine(t, 34, -38, f, A);
  return [-20, -46];
};

export const BOMBER_DESIGN: Design = { ref: 1.1, b: [-140, -192, 136, 34], top: 140 };

// ---------- Tumbleweed Riders ----------

/** A knobbly dirt-bike tyre with a hub in the faction colour. */
function knobby(t: Toon, cx: number, cy: number, r: number, spin: number, A: number, hubcap: boolean): void {
  let d = "";
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * Math.PI * 2;
    const a2 = a + Math.PI / n;
    d += `${i ? "L" : "M"} ${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r} L ${cx + Math.cos(a2) * r * 0.9} ${cy + Math.sin(a2) * r * 0.9} `;
  }
  fill(t, d + "Z", mat(K.rubber, 0.2), { s: r * 0.22 });
  fill(t, ellipse(cx, cy, r * 0.62, r * 0.62), mat(shade(K.steel, -0.3), 0.4), { s: 2, line: LINE * 0.8 });
  if (hubcap) {
    fill(t, ellipse(cx, cy, r * 0.54, r * 0.54), mat(K.steel, 0.95), { s: r * 0.16, spec: [cx - r * 0.2, cy - r * 0.22, r * 0.15, r * 0.08] });
    ink(t, ellipse(cx, cy, r * 0.3, r * 0.3), LINE * 0.7, "rgba(40,30,30,0.5)");
  } else
    for (let i = 0; i < 8; i++) {
      if (i === 3) continue;
      const a = spin + (i / 8) * Math.PI * 2;
      ink(t, `M ${cx} ${cy} L ${cx + Math.cos(a) * r * 0.6} ${cy + Math.sin(a) * r * 0.6}`, 1.4, "#d8dcdc");
    }
  fill(t, ellipse(cx, cy, r * 0.16, r * 0.16), mat(A, 0.5), { s: 1, line: LINE * 0.6 });
}

/** Tumbleweed Rider: a settler in a duster and a wide leather hat on a wire-bound dirt bike, tumbleweed on the rack. */
export const rider: Painter = (t, s, f) => {
  const { ctx } = t;
  const A = s.color;
  const go = f === 1;
  const steel = mat(K.steel, 0.6);
  const metal = mat(K.gun, 0.5);
  const wire = "#cfc7b2";
  const coat = mat(K.canvasDark);
  contact(t, 4, -2, 96, 13, 0.5);
  if (go) for (let i = 0; i < 3; i++) fill(t, ellipse(-92 - i * 12, -12 - i * 7, 11 - i * 2.5, 8 - i * 1.8), mat(K.canvas), { s: 3, alpha: 0.85 - i * 0.2, line: LINE * 0.7 });
  const pivot: Pt = [-60, -28];
  const tilt = go ? -0.07 : 0;
  ctx.save();
  ctx.translate(pivot[0], pivot[1]);
  ctx.rotate(tilt);
  ctx.translate(-pivot[0], -pivot[1]);

  // the tumbleweed on the rear rack
  fill(t, tube([[-34, -62], [-86, -64]], [2.4, 2.4]), steel, { s: 1, line: LINE * 0.8 });
  fill(t, ellipse(-84, -86, 25, 21), mat(K.hayDark), { s: 6 });
  for (let i = 0; i < 9; i++) {
    const a = i * 0.79;
    ink(t, `M ${-84 + Math.cos(a) * 21} ${-86 + Math.sin(a) * 18} Q ${-84 + Math.cos(a + 2) * 6} ${-86 + Math.sin(a + 2) * 5} ${-84 + Math.cos(a + 3.4) * 20} ${-86 + Math.sin(a + 3.4) * 17}`, 1.4, "rgba(90,58,24,0.85)");
  }
  ink(t, "M -106 -80 Q -84 -66 -62 -82", 1.8, wire);
  // exhaust
  fill(t, tube([[-6, -38], [-46, -46], [-88, -50]], [4, 4, 4.5]), steel, { s: 2, spec: [-50, -48, 8, 1, 0] });
  fill(t, rrect(-96, -56, 10, 12, 3), metal, { s: 2 });
  puffs(t, -102, -64 - (go ? 4 : 0), go ? 9 : 7);
  // rear wheel, swingarm, frame, engine
  knobby(t, -60, -28, 28, go ? 0.2 : 0, A, false);
  fill(t, tube([[-60, -28], [-14, -40]], [5, 4]), metal, { s: 2 });
  fill(t, tube([[-30, -62], [8, -40], [52, -80]], [4.5, 4.5, 4]), mat(K.rust, 0.3), { s: 2 });
  fill(t, rrect(-16, -58, 34, 26, 5), steel, { s: 5, spec: [-10, -54, 5, 1.6, 0] });
  for (const y of [-52, -46, -40]) ink(t, `M -12 ${y} L 14 ${y}`, 1.4, "rgba(40,36,40,0.6)");
  fill(t, ellipse(2, -31, 11, 8), metal, { s: 3 });
  // front wheel with its hubcap, fender, fork, headlamp
  knobby(t, 70, -24, 24, go ? 0.2 : 0, A, true);
  fill(t, "M 46 -34 C 50 -54 90 -56 96 -34 L 90 -33 C 86 -47 58 -48 52 -33 Z", mat(A, 0.4), { s: 2, line: LINE * 0.8 });
  fill(t, tube([[70, -24], [52, -84]], [3.6, 4]), steel, { s: 1.5, spec: [60, -56, 1, 8, -0.3] });
  glowAt(t, 68, -78, 22, 0xffe2a0, 0.5);
  fill(t, rrect(52, -86, 16, 16, 3), mat(K.brass, 0.7), { s: 2 });
  fill(t, rrect(57, -82, 9, 9, 2), mat(0xfff3c0, 0.9), { s: 0, line: LINE * 0.6 });
  // orange tank, wired and patched; seat
  fill(t, "M -4 -74 C 6 -86 36 -86 46 -78 L 42 -62 C 28 -58 6 -58 -4 -62 Z", mat(A, 0.5), { s: 5, spec: [8, -80, 6, 1.6, -0.1] });
  patch(t, 16, -76, 12, 10, K.tin);
  for (const x of [4, 36]) ink(t, `M ${x} -83 L ${x + 2} -59`, 1.5, wire);
  fill(t, "M -46 -66 C -44 -74 -10 -76 -2 -70 L -4 -62 L -44 -60 Z", mat(K.leather), { s: 3 });

  // --- the rider: duster tails flying, hunched forward
  fill(t, `M -24 -88 C -44 -84 -62 ${go ? -84 : -74} -82 ${go ? -86 : -70} C -70 -60 -44 -62 -22 -68 Z`, mat(shade(K.canvasDark, -0.1)), { s: 3 });
  fill(t, tube([[0, -112], [26, -102], [38, -94]], [6.5, 5.5, 4.5]), mat(shade(K.canvasDark, -0.16)), { s: 4 });
  fill(t, "M -30 -94 C -28 -110 -8 -124 10 -120 C 22 -116 24 -100 16 -88 C 6 -76 -12 -68 -24 -70 C -32 -74 -33 -86 -30 -94 Z", coat, { s: 7 });
  fill(t, "M -16 -110 L -10 -113 L 6 -78 L -1 -75 Z", mat(K.leather), { s: 2, line: LINE * 0.8 });
  for (let i = 0; i < 4; i++) fill(t, rrect(-14 + i * 4.4, -104 + i * 8.4, 4, 6, 1), mat(K.brass, 0.7), { s: 0, line: LINE * 0.5 });
  // near leg in denim, boot on the peg
  fill(t, rrect(-2, -36, 22, 3.4, 1.5), steel, { s: 1, line: LINE * 0.7 });
  fill(t, tube([[-16, -74], [14, -68]], [10, 8.5]), mat(K.denim), { s: 4 });
  fill(t, tube([[14, -68], [8, -44]], [8.5, 6.5]), mat(K.denim), { s: 4 });
  patch(t, 8, -74, 11, 9);
  fill(t, "M -2 -46 C -4 -38 0 -34 8 -34 L 22 -34 C 26 -34 26 -40 22 -42 C 18 -46 10 -48 4 -48 Z", mat(K.leatherDark, 0.2), { s: 3, spec: [16, -41, 2.4, 1.2] });
  // scarf, head, bandana mask, goggles, wide leather hat with the orange band
  fill(t, `M 8 -120 C -8 -122 -24 ${go ? -114 : -122} -44 ${go ? -110 : -120} C -30 -110 -12 -112 8 -114 Z`, mat(K.red), { s: 2, line: LINE * 0.8 });
  fill(t, ellipse(18, -132, 14, 14.5), mat(K.skin), { s: 5 });
  fill(t, "M 7 -128 C 15 -124 28 -124 33 -128 C 33 -120 26 -116 19 -116 C 12 -116 7 -120 7 -128 Z", mat(K.red), { s: 3 });
  goggle(t, 24, -135.5, 5.2, 4.8);
  fill(t, ellipse(19, -144, 30, 9), mat(K.leather, 0.3), { s: 3, spec: [2, -148, 5, 1.2, -0.1] });
  fill(t, "M 5 -145 C 3 -158 10 -165 19 -165 C 29 -165 35 -158 33 -145 C 26 -141 12 -141 5 -145 Z", mat(K.leather, 0.3), { s: 6 });
  fill(t, "M 4 -149 C 12 -145 26 -145 34 -149 L 34 -144 C 26 -140 12 -140 4 -144 Z", mat(A, 0.4), { s: 1.5, line: LINE * 0.8 });
  ink(t, "M 19 -164 Q 22 -156 19 -148", LINE * 0.8, "rgba(40,20,10,0.5)");
  // handlebars and the sawn-off scattergun wired on
  fill(t, tube([[52, -84], [44, -96], [34, -98]], [2.6, 2.6, 2.6]), steel, { s: 1 });
  fill(t, rrect(34, -112, 16, 9, 3), mat(K.wood), { s: 2 });
  fill(t, rrect(46, -114, 36, 5, 2), metal, { s: 1.5, spec: [52, -113, 6, 0.8, 0] });
  fill(t, rrect(46, -109, 36, 5, 2), metal, { s: 1.5 });
  ink(t, "M 56 -116 L 52 -96 M 59 -116 L 55 -96", 1.4, wire);
  // near arm, glove
  fill(t, tube([[4, -114], [24, -104], [36, -98]], [7, 6, 5]), coat, { s: 4 });
  mitt(t, 37, -97);
  ctx.restore();
  const [mx, my] = [84, -110];
  const c = Math.cos(tilt);
  const sn = Math.sin(tilt);
  return [pivot[0] + (mx - pivot[0]) * c - (my - pivot[1]) * sn, pivot[1] + (mx - pivot[0]) * sn + (my - pivot[1]) * c];
};



