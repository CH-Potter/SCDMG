// The miniature builder: original figures composed from a small set of parts (body, head, headgear,
// held weapon, back gear) in the same cartoon style as the built-in archetypes. Parts are bezier paths
// in centi-inches painted with the `toon` kit; each body places the head, weapon and back gear at its
// own anchor points and scale, so every combination lines up. Recipes come from `UnitProfile.art` and
// are baked into sheets (idle + step frames, silhouettes) by `figures.paintSheet` like any archetype.

import type { MiniatureRecipe, MiniBack, MiniBody, MiniHead, MiniHeadgear, MiniWeapon } from "../../engine/types";
import { css, luma, mix, rgba, shade } from "./palette";
import { contact, ellipse, fill, flat, glowAt, ink, mat, rrect, teethRow, type Toon, tube } from "./toon";

/** Labels for the forge's pickers. */
export const BODY_NAMES: Record<MiniBody, string> = { trooper: "Trooper", critter: "Critter", brute: "Brute", walker: "Walker", flyer: "Hover pod", structure: "Tower" };
export const HEAD_NAMES: Record<MiniHead, string> = { face: "Face", visor: "Robot visor", beast: "Beast snout", gem: "Crystal" };
export const HEADGEAR_NAMES: Record<MiniHeadgear, string> = { none: "None", helmet: "Helmet", hat: "Wide hat", goggles: "Goggles", horns: "Horns", crown: "Crystal crown", antennae: "Antennae" };
export const WEAPON_NAMES: Record<MiniWeapon, string> = { none: "Nothing", rifle: "Rifle", cannon: "Cannon", blade: "Blade", claws: "Claws", staff: "Staff" };
export const BACK_NAMES: Record<MiniBack, string> = { none: "None", pack: "Backpack", jets: "Jet pack", tank: "Goo tank", banner: "Banner" };

/** Design size per body: reference base radius (inches), bounds and height (centi-inches). */
export const BODY_DESIGN: Record<MiniBody, { ref: number; b: [number, number, number, number]; top: number }> = {
  trooper: { ref: 0.5, b: [-82, -182, 96, 14], top: 150 },
  critter: { ref: 0.42, b: [-72, -112, 84, 12], top: 76 },
  brute: { ref: 1.2, b: [-172, -296, 216, 18], top: 205 },
  walker: { ref: 1.1, b: [-152, -306, 202, 18], top: 240 },
  flyer: { ref: 0.8, b: [-126, -146, 142, 20], top: 110 },
  structure: { ref: 0.85, b: [-112, -252, 152, 28], top: 200 },
};

const N = {
  ink: 0x1c1512,
  skin: 0xd99e72,
  leather: 0x7a4f2e,
  leatherDark: 0x4e3220,
  gun: 0x4c5158,
  steel: 0x9aa3a8,
  brass: 0xcf9f42,
  wood: 0x9a6236,
  bone: 0xf2ead2,
  mouth: 0x3a0a16,
  eye: 0xffd23a,
  gold: 0xdcb55a,
  cream: 0xf2e6c8,
  canvas: 0xbca476,
  stone: 0x8f88a4,
  night: 0x262c3a,
};

/** Crystal tint for a colour. */
const gemOf = (c: number): number => mix(shade(c, 0.45), 0xf4f0ff, 0.25);
/** Very dark picks are lifted a little so shading still reads. */
const lift = (c: number): number => (luma(c) < 0.14 ? shade(c, 0.18) : c);

interface Kit {
  t: Toon;
  r: MiniatureRecipe;
  P: number;
  S: number;
  f: number;
}

type Pt = [number, number];

/** Draw in a local frame at (x, y), rotated and scaled; interior lines keep their on-screen weight. */
function local(t: Toon, x: number, y: number, k: number, rot: number, draw: () => void): void {
  const { ctx } = t;
  const line = t.line;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(k, k);
  t.line = line / Math.max(0.3, Math.min(3, k));
  try {
    draw();
  } finally {
    t.line = line;
    ctx.restore();
  }
}

/** Map a point from a local frame back to body coordinates. */
const toBody = (x: number, y: number, k: number, rot: number, p: Pt): Pt => [x + k * (p[0] * Math.cos(rot) - p[1] * Math.sin(rot)), y + k * (p[0] * Math.sin(rot) + p[1] * Math.cos(rot))];

// ---------- little shared bits ----------

function shard(t: Toon, cx: number, top: number, bottom: number, w: number, color: number, lean = 0): void {
  const g = gemOf(color);
  const mid = top + (bottom - top) * 0.32;
  glowAt(t, cx, (top + bottom) / 2, (bottom - top) * 0.85, shade(color, 0.5), 0.3);
  fill(t, `M ${cx + lean} ${top} L ${cx + w} ${mid} L ${cx + w * 0.65} ${bottom} L ${cx - w * 0.65} ${bottom} L ${cx - w} ${mid} Z`, mat(g, 0.9, 0.22), {
    s: w * 0.5,
    spec: [cx - w * 0.4, mid - (mid - top) * 0.25, w * 0.16, (bottom - top) * 0.1, -0.3],
  });
  ink(t, `M ${cx + lean} ${top} L ${cx + w * 0.1} ${mid} L ${cx} ${bottom}`, t.line * 0.6, "rgba(40,30,70,0.45)");
}

function bolts(t: Toon, pts: Pt[], r: number): void {
  for (const [x, y] of pts) fill(t, ellipse(x, y, r, r), mat(N.steel, 0.5), { s: r * 0.7, line: t.line * 0.6, hi: 0.8 });
}

/** A cartoon eye: white, a big pupil looking ahead, a glint and a cross brow. */
function eyeball(t: Toon, x: number, y: number, rx: number, ry: number): void {
  fill(t, ellipse(x, y, rx, ry), mat(0xfffaf0, 0.2), { s: rx * 0.35, line: t.line * 0.9 });
  flat(t, ellipse(x + rx * 0.3, y + ry * 0.1, rx * 0.48, ry * 0.55), N.ink);
  flat(t, ellipse(x + rx * 0.12, y - ry * 0.18, rx * 0.17, rx * 0.17), "#ffffff");
  fill(t, `M ${x - rx * 1.2} ${y - ry * 1.25} Q ${x} ${y - ry * 1.85} ${x + rx * 1.3} ${y - ry * 1.05} L ${x + rx * 1.2} ${y - ry * 0.75} Q ${x} ${y - ry * 1.35} ${x - rx * 1.15} ${y - ry * 0.9} Z`, mat(N.ink), { s: 0, line: 0 });
}

/** A glowing beast eye with a slit pupil and an angry brow. */
function glowEye(t: Toon, x: number, y: number, rx: number, ry: number): void {
  glowAt(t, x, y, rx * 2.6, N.eye, 0.4);
  fill(t, ellipse(x, y, rx, ry), mat(N.eye, 0.3), { s: rx * 0.5, line: t.line * 0.9, spec: [x - rx * 0.35, y - ry * 0.4, rx * 0.25, ry * 0.18] });
  flat(t, ellipse(x + rx * 0.15, y, rx * 0.22, ry * 0.75), N.ink);
  fill(t, `M ${x - rx * 1.5} ${y - ry * 1.9} Q ${x} ${y - ry * 2} ${x + rx * 1.5} ${y - ry * 0.5} L ${x + rx * 1.35} ${y - ry * 0.05} Q ${x} ${y - ry * 1.3} ${x - rx * 1.5} ${y - ry * 1.4} Z`, mat(N.ink), { s: 0, line: 0 });
}

/** Thruster flame pointing down from (x, y). */
function flame(t: Toon, x: number, y: number, w: number, len: number): void {
  glowAt(t, x, y + len * 0.5, len * 1.1, 0xff9a3a, 0.75);
  fill(t, `M ${x - w} ${y} Q ${x - w * 0.6} ${y + len * 0.6} ${x} ${y + len} Q ${x + w * 0.6} ${y + len * 0.6} ${x + w} ${y} Z`, mat(0xffb347), { s: 0, line: t.line * 0.7 });
  flat(t, `M ${x - w * 0.45} ${y} Q ${x} ${y + len * 0.55} ${x + w * 0.45} ${y} Z`, "#fff3c8");
}

// ---------- heads (authored at radius 20, centred, facing right) ----------

function headShape(k: Kit): void {
  const { t, P, S } = k;
  const L = t.line;
  switch (k.r.head) {
    case "face": {
      fill(t, ellipse(-13, 3, 4.5, 5.5), mat(shade(N.skin, -0.08)), { s: 2, line: L * 0.8 });
      fill(t, "M -18 2 C -19 -13 -9 -21 2 -21 C 13 -21 20 -13 20 -1 C 20 10 13 19 1 19 C -10 19 -18 13 -18 2 Z", mat(N.skin), { s: 6, spec: [-6, -13, 3.4, 2, -0.5] });
      flat(t, ellipse(5, 7, 4.2, 2.4), rgba(0xe0705a, 0.32));
      eyeball(t, 9, -1, 4.2, 5);
      fill(t, ellipse(19.5, 3, 3.6, 3.2), mat(shade(N.skin, -0.04)), { s: 1.5, line: L * 0.8 });
      ink(t, "M 8 11 Q 13 14 17.5 10", L * 0.9);
      return;
    }
    case "visor": {
      fill(t, "M -18 4 C -20 -14 -10 -21 2 -21 C 14 -21 21 -12 20 3 C 19 13 10 17 0 17 C -10 17 -17 12 -18 4 Z", mat(0x8d969c, 0.6), { s: 6, spec: [-6, -14, 4, 2.4] });
      for (let i = 0; i < 4; i++) ink(t, `M ${4 + i * 4} 8 L ${3 + i * 4} 14`, L * 0.7);
      fill(t, ellipse(-8, 3, 5, 5), mat(N.steel, 0.6), { s: 2, line: L * 0.8 });
      glowAt(t, 12, -4, 16, shade(S, 0.5), 0.6);
      fill(t, "M 0 -10 C 8 -12 19 -10 21 -5 C 22 1 14 3 1 1 C -3 -3 -3 -8 0 -10 Z", mat(shade(S, 0.3), 0.9), { s: 2, spec: [8, -8, 4, 1.2, 0] });
      return;
    }
    case "beast": {
      fill(t, "M -17 2 C -19 -14 -6 -21 6 -20 C 16 -19 22 -12 27 -5 C 32 2 29 12 19 14 C 6 17 -14 15 -17 2 Z", mat(shade(P, -0.08), 0.15), { s: 6, spec: [-4, -14, 4, 2] });
      for (const [x, y, r] of [[-8, -10, 2.6], [-12, -2, 2], [-3, -15, 1.8]] as const) fill(t, ellipse(x, y, r, r * 0.8), mat(S, 0.2), { s: 0.8, line: L * 0.5 });
      fill(t, "M 8 4 C 14 1 24 1 29 2 C 28 9 20 13 11 11 C 8 10 7 7 8 4 Z", mat(N.mouth), { s: 0 });
      fill(t, teethRow(9, 4, 19, 1, 29, 2.5, 4, 4.5, 1), mat(N.bone), { s: 1, line: L * 0.6 });
      fill(t, teethRow(11, 10.5, 19, 13, 27, 7, 3, 3.5, -1), mat(N.bone), { s: 1, line: L * 0.6 });
      flat(t, ellipse(25.5, -4, 1.4, 1), N.ink);
      glowEye(t, 8, -8, 4.2, 3.8);
      return;
    }
    case "gem": {
      const head = "M 1 -21 L 13 -14 L 17 0 L 12 14 L 1 19 L -10 14 L -14 0 L -9 -14 Z";
      glowAt(t, 2, 0, 28, shade(P, 0.55), 0.35);
      fill(t, head, mat(gemOf(P), 0.95, 0.24), { s: 5 });
      flat(t, "M 1 -21 L -9 -14 L -14 0 L 0 -1 Z", rgba(0xffffff, 0.4));
      flat(t, "M 17 0 L 12 14 L 1 19 L 3 6 Z", rgba(shade(P, -0.4), 0.35));
      ink(t, "M 1 -21 L 0 -1 L -14 0 M 0 -1 L 17 0 M 0 -1 L 3 6 L 1 19", L * 0.55, "rgba(40,30,70,0.5)");
      ink(t, head, L * 0.9);
      glowAt(t, 10, -2, 9, shade(S, 0.6), 0.8);
      fill(t, "M 4 -3.5 L 15.5 -4.5 L 15 -1 L 5 -0.5 Z", mat(0xffffff), { s: 0, line: L * 0.4 });
      return;
    }
  }
}

function headgear(k: Kit): void {
  const { t, P, S, f } = k;
  const L = t.line;
  switch (k.r.headgear) {
    case "none":
      return;
    case "helmet":
      fill(t, "M -21 1 C -23 -17 -11 -28 2 -28 C 15 -28 25 -18 23 -6 C 12 -10 -8 -8 -21 1 Z", mat(P, 0.5), { s: 6, spec: [-8, -21, 5, 2.4, -0.4] });
      ink(t, "M 2 -28 Q 7 -18 6 -9", L * 0.8);
      fill(t, "M -21.5 -1 C -8 -9 12 -11 24 -7 L 24 -3 C 12 -7 -8 -5 -21.5 3 Z", mat(S, 0.4), { s: 1.5, line: L * 0.8 });
      bolts(t, [[-14, -4], [16, -7.5]], 1.4);
      return;
    case "hat":
      fill(t, "M -34 -9 C -34 -15 -12 -17 2 -17 C 18 -17 38 -15 38 -10 C 38 -5 18 -6 2 -6 C -12 -6 -34 -4 -34 -9 Z", mat(shade(P, -0.15), 0.2), { s: 3 });
      fill(t, "M -16 -12 C -18 -28 -10 -36 2 -36 C 14 -36 20 -28 18 -12 C 8 -9 -6 -9 -16 -12 Z", mat(P, 0.2), { s: 6, spec: [-6, -30, 4, 2, -0.4] });
      fill(t, "M -16.6 -17 C -6 -14 8 -14 18.6 -17 L 18.2 -12 C 8 -9.5 -6 -9.5 -16.3 -12 Z", mat(S, 0.3), { s: 1.5, line: L * 0.8 });
      ink(t, "M -7 -34 Q 2 -29 11 -34", L * 0.8);
      return;
    case "goggles": {
      ink(t, "M -21 -9 C -4 -14 8 -14 24 -11", 4.2, css(N.leatherDark));
      const lens = (x: number, y: number, r: number) => {
        fill(t, ellipse(x, y, r, r * 0.95), mat(N.brass, 0.7), { s: 2 });
        fill(t, ellipse(x, y, r * 0.66, r * 0.63), mat(mix(S, 0x7fd6cf, 0.45), 1), { s: 1.5, line: L * 0.6, spec: [x - r * 0.25, y - r * 0.28, r * 0.2, r * 0.15] });
      };
      lens(7, -11.5, 6.4);
      lens(18.5, -10.5, 5);
      return;
    }
    case "horns":
      for (const [pts, w] of [
        [[[-6, -16], [-14, -30], [-27, -38]], [5.5, 4, 1.2]],
        [[[6, -18], [10, -33], [21, -43]], [5.5, 4, 1.2]],
      ] as [Pt[], number[]][]) {
        fill(t, tube(pts, w), mat(N.bone, 0.3), { s: 2.5 });
        const [a, b] = [pts[0]!, pts[1]!];
        ink(t, `M ${a[0] + (b[0] - a[0]) * 0.35 - 4} ${a[1] + (b[1] - a[1]) * 0.35} l 8 1`, L * 0.7, "rgba(60,40,30,0.6)");
      }
      return;
    case "crown":
      fill(t, "M -13 -16 C -4 -20 8 -20 16 -16 L 16 -11 C 8 -15 -4 -15 -13 -11 Z", mat(N.gold, 0.7), { s: 1.5, line: L * 0.8 });
      shard(t, -6, -32, -16, 3.6, S, -2);
      shard(t, 12, -31, -16, 3.6, S, 2);
      shard(t, 3, -41, -17, 4.6, S, 0);
      return;
    case "antennae": {
      const d = f ? 2.5 : 0;
      ink(t, `M -4 -19 Q -8 -30 ${-12 - d} -40`, 2.2);
      ink(t, `M 8 -19 Q 12 -31 ${14 + d} -42`, 2.2);
      for (const [x, y] of [[-12 - d, -41], [14 + d, -43]] as const) {
        glowAt(t, x, y, 9, shade(S, 0.5), 0.6);
        fill(t, ellipse(x, y, 3.6, 3.6), mat(S, 0.7), { s: 1.4, line: L * 0.7, spec: [x - 1, y - 1.2, 1, 0.7] });
      }
      return;
    }
  }
}

function head(k: Kit, x: number, y: number, R: number): void {
  local(k.t, x, y, R / 20, 0, () => {
    // horns and antennae sprout behind the hat line, so they go first
    if (k.r.headgear === "horns" || k.r.headgear === "antennae") headgear(k);
    headShape(k);
    if (k.r.headgear !== "horns" && k.r.headgear !== "antennae") headgear(k);
  });
}

// ---------- held weapons (grip at the origin, pointing right) ----------

function weaponShape(k: Kit, w: MiniWeapon): Pt {
  const { t, P, S } = k;
  const L = t.line;
  switch (w) {
    case "rifle":
      fill(t, "M -18 -3 C -22 1 -20 8 -13 8 L -3 5 L -3 -3 Z", mat(N.wood), { s: 3 });
      fill(t, rrect(4, 4, 6, 9, 2), mat(N.gun, 0.5), { s: 1.5, line: L * 0.8 });
      fill(t, rrect(-5, -7, 28, 12, 3.5), mat(N.gun, 0.6), { s: 4, spec: [2, -6, 5, 1.3, 0] });
      fill(t, rrect(21, -4.5, 26, 5.5, 2.4), mat(N.gun, 0.6), { s: 2, spec: [24, -4, 6, 0.8, 0] });
      fill(t, rrect(7, -7, 5, 12, 1.2), mat(S, 0.4), { s: 1.5, line: L * 0.7 });
      fill(t, rrect(1, -12, 12, 5, 2), mat(N.steel, 0.6), { s: 1.5, line: L * 0.8 });
      fill(t, rrect(44, -6, 7, 9, 2), mat(N.gun, 0.6), { s: 1.5 });
      return [51, -1.5];
    case "cannon":
      fill(t, ellipse(-4, 12, 9, 7), mat(S, 0.3), { s: 3 });
      fill(t, rrect(-14, -12, 22, 22, 6), mat(N.gun, 0.5), { s: 4 });
      fill(t, rrect(4, -10, 50, 17, 8), mat(mix(N.gun, P, 0.25), 0.6), { s: 5, spec: [12, -8, 14, 1.6, 0] });
      for (const x of [16, 34]) fill(t, rrect(x, -12, 5, 21, 1.5), mat(S, 0.4), { s: 1.5, line: L * 0.8 });
      fill(t, rrect(50, -14, 12, 25, 4), mat(N.gun, 0.6), { s: 2 });
      flat(t, ellipse(60, -1.5, 3, 7), "#1c1512");
      return [63, -1.5];
    case "blade":
      fill(t, rrect(-8, -3, 12, 6, 2.4), mat(N.leatherDark), { s: 1.5 });
      fill(t, ellipse(-9, 0, 3, 3), mat(N.brass, 0.7), { s: 1 });
      glowAt(t, 32, -1, 22, shade(S, 0.5), 0.35);
      fill(t, "M 8 -5 C 26 -7 44 -8 56 -5 L 62 0 L 56 3 C 44 4 26 4 8 4 Z", mat(0xd8dfe4, 0.9, 0.25), { s: 2.5, spec: [24, -4, 10, 0.9, 0] });
      ink(t, "M 11 -1.5 L 54 -1.5", 1.6, rgba(shade(S, 0.35), 0.95));
      fill(t, rrect(3, -9, 5, 18, 2), mat(N.brass, 0.7), { s: 1.5 });
      return [62, 0];
    case "claws":
      for (const [dy, l] of [[-6, 20], [0, 24], [6, 19]] as const)
        fill(t, `M 0 ${dy - 3} Q ${l * 0.6} ${dy - 7} ${l} ${dy - 1} Q ${l * 0.55} ${dy - 1.5} 0 ${dy + 2.5} Z`, mat(N.bone, 0.5), { s: 1.5, line: L * 0.8 });
      return [24, -1];
    case "staff":
      fill(t, tube([[0, 48], [0, 0], [0, -66]], [2.6, 2.6, 2.6]), mat(N.wood), { s: 1.5 });
      fill(t, rrect(-3.6, -8, 7.2, 5, 1.5), mat(S, 0.4), { s: 1, line: L * 0.7 });
      fill(t, "M -8 -64 Q 0 -58 8 -64 L 6 -71 Q 0 -66 -6 -71 Z", mat(N.gold, 0.7), { s: 1, line: L * 0.7 });
      glowAt(t, 0, -77, 24, shade(S, 0.55), 0.85);
      fill(t, ellipse(0, -77, 8, 8), mat(gemOf(S), 1), { s: 3, spec: [-2.5, -80, 2.4, 1.6] });
      return [0, -77];
    case "none":
      return [6, 0];
  }
}

/** Draw a weapon with its grip at (x, y); returns the muzzle in body coordinates. */
function weapon(k: Kit, x: number, y: number, s: number, rot: number, w: MiniWeapon = k.r.weapon): Pt {
  let m: Pt = [0, 0];
  local(k.t, x, y, s, rot, () => {
    m = weaponShape(k, w);
  });
  return toBody(x, y, s, rot, m);
}

// ---------- back gear (attached at the origin, hanging off to the left) ----------

function backShape(k: Kit): void {
  const { t, P, S, f } = k;
  const L = t.line;
  switch (k.r.back) {
    case "none":
      return;
    case "pack":
      fill(t, "M 0 -18 C -6 -20 -16 -19 -18 -14 L -19 12 C -18 17 -8 18 0 16 Z", mat(mix(P, N.canvas, 0.55)), { s: 4 });
      fill(t, ellipse(-9, -21, 11, 5), mat(S, 0.2), { s: 2, line: L * 0.8 });
      ink(t, "M -14 -24 L -14 -18 M -4 -24 L -4 -18", L * 0.8);
      fill(t, rrect(-17, -2, 11, 12, 2.5), mat(shade(mix(P, N.canvas, 0.55), -0.1)), { s: 2, line: L * 0.8 });
      fill(t, rrect(-13, -3, 4, 3, 1), mat(N.brass, 0.7), { s: 0.6, line: L * 0.5 });
      return;
    case "jets":
      for (const [x, y] of [[-15, -2], [-5, -6]] as const) {
        fill(t, rrect(x - 6, y - 18, 12, 34, 6), mat(N.steel, 0.6), { s: 3, spec: [x - 3, y - 13, 1.6, 5] });
        fill(t, rrect(x - 6.5, y - 6, 13, 5, 1.5), mat(S, 0.4), { s: 1, line: L * 0.7 });
        fill(t, rrect(x - 4.5, y + 15, 9, 5, 1.5), mat(N.gun, 0.5), { s: 1, line: L * 0.7 });
        flame(t, x, y + 20, 4, f ? 14 : 10);
      }
      return;
    case "tank":
      ink(t, "M -6 -18 Q 4 -27 8 -14", 2.6, css(N.leatherDark));
      glowAt(t, -12, 2, 22, shade(S, 0.4), 0.4);
      fill(t, rrect(-20, -22, 16, 42, 7), mat(0xd9eef2, 0.9, 0.15), { s: 2, alpha: 0.85 });
      fill(t, rrect(-18.5, -8, 13, 26, 5.5), mat(S, 0.6), { s: 2, line: 0 });
      for (const [x, y, r] of [[-13, 0, 2], [-9, -4, 1.3], [-15, 8, 1.4]] as const) flat(t, ellipse(x, y - (f ? 2 : 0), r, r), "rgba(255,255,240,0.9)");
      fill(t, rrect(-21, -26, 18, 6, 2), mat(N.steel, 0.6), { s: 1.5, line: L * 0.8 });
      fill(t, rrect(-21, 17, 18, 6, 2), mat(N.steel, 0.6), { s: 1.5, line: L * 0.8 });
      return;
    case "banner": {
      const w = f ? 3 : -3;
      fill(t, tube([[-8, 18], [-8, -78]], [1.7, 1.7]), mat(N.wood), { s: 1 });
      fill(t, ellipse(-8, -80, 3.2, 3.2), mat(N.brass, 0.7), { s: 1, line: L * 0.7 });
      fill(t, `M -8 -74 C -20 ${-77 + w} -32 ${-71 - w} -46 -74 L -39 -60 L -46 -46 C -32 ${-43 - w} -20 ${-49 + w} -8 -46 Z`, mat(S, 0.2), { s: 3 });
      fill(t, `M -32 ${-66 + w * 0.3} L -25 ${-59 + w * 0.3} L -18 -66 L -18 -60 L -25 ${-53 + w * 0.3} L -32 ${-60 + w * 0.3} Z`, mat(P, 0.2), { s: 1, line: L * 0.6 });
      return;
    }
  }
}

function back(k: Kit, x: number, y: number, s: number, rot = 0): void {
  local(k.t, x, y, s, rot, () => backShape(k));
}

// ---------- bodies ----------

type BodyPainter = (k: Kit) => Pt;

const trooper: BodyPainter = (k) => {
  const { t, P, S, f } = k;
  const { ctx } = t;
  const step = f === 1;
  const suit = mat(P);
  const suitB = mat(shade(P, -0.15));
  const pantsC = mix(shade(P, -0.32), 0x3b3a44, 0.35);
  const boot = mat(N.leatherDark, 0.2);
  const w = k.r.weapon;
  const twoHanded = w === "rifle" || w === "cannon";
  contact(t, 2, -2, 30, 9, 0.55);
  back(k, -18, -72, 1);
  // legs, back one first
  ctx.save();
  if (step) ctx.translate(-6, -3);
  fill(t, "M -14 -47 C -16 -33 -15 -23 -13 -13 L -2 -13 C -1 -23 -1 -35 -1 -47 Z", mat(shade(pantsC, -0.12)));
  fill(t, "M -17 -16 C -19 -6 -17 0 -10 0 L 1 0 C 6 0 7 -6 3 -10 C 0 -14 -5 -17 -9 -17 Z", boot, { s: 4 });
  ctx.restore();
  ctx.save();
  if (step) ctx.translate(7, -5);
  fill(t, "M 0 -47 C 0 -34 2 -24 4 -13 L 16 -13 C 17 -25 16 -36 14 -47 Z", mat(pantsC));
  fill(t, ellipse(10, -29, 6, 5), mat(S, 0.4), { s: 2, line: t.line * 0.8 });
  fill(t, "M 1 -16 C 0 -6 2 0 9 0 L 22 0 C 27 0 29 -6 25 -10 C 22 -14 16 -17 10 -17 Z", boot, { s: 4, spec: [18, -10, 3, 1.5] });
  ink(t, "M 3 -2 L 26 -2", t.line * 1.2);
  ctx.restore();
  // upper body, leaning in a touch
  ctx.save();
  ctx.translate(0, -46);
  ctx.rotate(0.05);
  ctx.translate(0, 46);
  if (twoHanded) fill(t, tube([[-6, -83], [8, -71], [30, -66]], [8, 7, 5.5]), suitB, { s: 5 });
  else fill(t, tube([[-8, -83], [-15, -68], [-12, -55]], [8, 7, 6]), suitB, { s: 5 });
  if (!twoHanded) fill(t, ellipse(-12, -54, 6, 5.5), mat(N.leather), { s: 2 });
  fill(t, "M -20 -90 C -25 -76 -25 -60 -22 -46 C -12 -40 8 -40 18 -45 C 22 -60 21 -77 16 -90 C 6 -95 -10 -95 -20 -90 Z", suit, { s: 9, spec: [-10, -84, 3, 5, -0.2] });
  fill(t, "M -16 -89 L -10 -91 L 15 -52 L 9 -48 Z", mat(S, 0.3), { s: 2, line: t.line * 0.8 });
  fill(t, "M -23 -51 C -10 -47 8 -47 20 -51 L 20 -44 C 8 -41 -10 -41 -23 -45 Z", mat(N.leather), { s: 3 });
  fill(t, rrect(-2, -50, 8, 7, 1.5), mat(S, 0.6), { s: 1.5, line: t.line * 0.8 });
  head(k, 4, -107, 17);
  // weapon, then the front arm over it
  const hand: Pt = twoHanded ? [9, -58] : w === "blade" ? [16, -63] : w === "staff" ? [26, -70] : w === "claws" ? [18, -66] : [15, -66];
  let muzzle: Pt;
  if (twoHanded) muzzle = weapon(k, 6, -60, w === "cannon" ? 0.95 : 1, -0.08);
  else if (w === "blade") muzzle = weapon(k, 16, -63, 1, -0.95);
  else if (w === "staff") muzzle = weapon(k, 26, -70, 1, 0.1);
  else muzzle = [hand[0] + 8, hand[1]];
  fill(t, tube([[10, -83], [18, -72], hand], [8.5, 7.5, 6]), suit, { s: 6 });
  fill(t, ellipse(11, -85, 10, 6.5), mat(S, 0.5), { s: 3, spec: [8, -88, 2.6, 1.2] });
  fill(t, ellipse(hand[0], hand[1], 6.6, 6.2), mat(N.leather), { s: 3 });
  if (twoHanded) fill(t, ellipse(32, -65, 6.2, 5.8), mat(N.leather), { s: 3 });
  if (w === "claws") muzzle = weapon(k, hand[0] + 3, hand[1], 1, -0.15);
  ctx.restore();
  return muzzle;
};

const critter: BodyPainter = (k) => {
  const { t, P, S, f } = k;
  const step = f === 1;
  const H = mat(P, 0.15);
  const HB = mat(shade(P, -0.18));
  const w = k.r.weapon;
  contact(t, 2, -2, 34, 9, 0.55);
  fill(t, tube([[-14, -14], [-18 + (step ? 5 : 0), -5], [-20 + (step ? 6 : 0), 0]], [6, 5, 4]), HB, { s: 3 });
  fill(t, tube([[10, -14], [13 - (step ? 5 : 0), -5], [16 - (step ? 6 : 0), 0]], [6, 5, 4]), HB, { s: 3 });
  fill(t, tube([[-26, -26], [-40, -36 + (step ? 3 : 0)], [-50, -31 + (step ? 4 : 0)]], [8, 5, 2.4]), H, { s: 4 });
  fill(t, ellipse(-51, -31 + (step ? 4 : 0), 4, 4), mat(S, 0.3), { s: 1.5, line: t.line * 0.8 });
  if (w === "staff") weapon(k, -12, -50, 0.55, -0.2);
  back(k, -12, -50, 0.6);
  fill(t, "M -30 -26 C -32 -44 -18 -56 0 -56 C 18 -56 30 -44 30 -28 C 30 -12 18 -4 0 -4 C -18 -4 -30 -12 -30 -26 Z", H, { s: 8, spec: [-10, -48, 6, 3, -0.5] });
  fill(t, "M -22 -12 C -8 -5 12 -5 24 -11 C 16 -17 -8 -18 -22 -12 Z", mat(mix(P, N.cream, 0.6)), { s: 2, line: t.line * 0.8 });
  for (const [x, y, rx, ry] of [[-16, -40, 4, 3], [-4, -48, 3, 2.4], [-22, -28, 2.6, 2]] as const) fill(t, ellipse(x, y, rx, ry), mat(S, 0.2), { s: 1, line: t.line * 0.6 });
  let muzzle: Pt = [44, -38];
  if (w === "rifle" || w === "cannon") {
    fill(t, "M -14 -54 C -6 -58 6 -58 12 -54 L 12 -48 C 6 -51 -6 -51 -14 -48 Z", mat(N.leather), { s: 2, line: t.line * 0.8 });
    muzzle = weapon(k, -4, -60, 0.62, -0.05);
  }
  head(k, 24, -40, 15);
  if (w === "blade") muzzle = weapon(k, 32, -33, 0.55, -0.25);
  fill(t, tube([[-6, -10], [-8 - (step ? 5 : 0), -4], [-6 - (step ? 6 : 0), 0]], [7, 6, 4.5]), H, { s: 3 });
  fill(t, tube([[18, -10], [22 + (step ? 5 : 0), -4], [26 + (step ? 6 : 0), 0]], [7, 6, 4.5]), H, { s: 3 });
  if (w === "claws") {
    weapon(k, -5 - (step ? 6 : 0), -1, 0.4, 0.25);
    muzzle = weapon(k, 27 + (step ? 6 : 0), -1, 0.45, 0.25);
  }
  return muzzle;
};

const brute: BodyPainter = (k) => {
  const { t, P, S, f } = k;
  const step = f === 1;
  const skin = mat(P, 0.1);
  const skinB = mat(shade(P, -0.18));
  const fist = mat(shade(P, -0.22), 0.2);
  const w = k.r.weapon;
  const s = 1.9;
  contact(t, 0, -4, 112, 20, 0.55);
  back(k, -48, -150, 1.7);
  const dl = step ? 6 : 0;
  fill(t, tube([[-30, -70], [-38, -34 - dl], [-34, -10 - dl]], [22, 19, 15]), skinB, { s: 8 });
  fill(t, ellipse(-30, -8 - dl, 24, 10), mat(N.leatherDark, 0.2), { s: 4 });
  fill(t, tube([[-40, -150], [-68, -100], [-60, -42]], [20, 18, 15]), skinB, { s: 8 });
  fill(t, ellipse(-60, -36, 17, 15), fist, { s: 6 });
  fill(t, "M -66 -80 C -76 -140 -40 -190 14 -190 C 66 -190 96 -150 90 -100 C 86 -62 56 -46 14 -46 C -28 -46 -62 -54 -66 -80 Z", skin, { s: 22, spec: [-30, -160, 14, 7, -0.5] });
  fill(t, "M -24 -104 C 4 -116 46 -112 70 -94 C 70 -72 50 -58 20 -56 C -6 -56 -24 -74 -24 -104 Z", mat(mix(P, N.cream, 0.55)), { s: 8, line: t.line });
  for (const y of [-92, -78]) ink(t, `M ${-18} ${y} Q 24 ${y - 8} 64 ${y + 2}`, t.line * 0.8, "rgba(40,30,22,0.45)");
  fill(t, "M -50 -172 L -36 -178 L 74 -72 L 60 -64 Z", mat(S, 0.3), { s: 3 });
  fill(t, "M -62 -70 C -20 -56 40 -54 86 -70 L 84 -56 C 40 -42 -20 -44 -60 -56 Z", mat(N.leather), { s: 4 });
  fill(t, rrect(10, -62, 18, 14, 3), mat(S, 0.6), { s: 2 });
  fill(t, tube([[30, -60], [38, -32], [36, -10]], [24, 21, 16]), skin, { s: 8 });
  fill(t, ellipse(42, -8, 26, 11), mat(N.leatherDark, 0.2), { s: 4 });
  for (const x of [56, 66]) fill(t, `M ${x - 4} -4 Q ${x + 2} -2 ${x + 7} 4 Q ${x} 2 ${x - 5} 1 Z`, mat(N.bone), { s: 0, line: t.line * 0.7 });
  head(k, 62, -166, 24);
  const hand: Pt = [86, -58];
  let muzzle: Pt = [hand[0] + 16, hand[1]];
  if (w === "rifle" || w === "cannon") muzzle = weapon(k, 78, -62, s, -0.1);
  else if (w === "blade") muzzle = weapon(k, 86, -60, s, -1.0);
  else if (w === "staff") muzzle = weapon(k, 92, -68, s, 0.12);
  fill(t, tube([[56, -150], [94, -112], hand], [22, 20, 16]), skin, { s: 8 });
  fill(t, ellipse(58, -152, 27, 17), mat(S, 0.5), { s: 6, spec: [48, -160, 6, 2.4] });
  bolts(t, [[44, -150], [60, -158], [74, -150]], 2.6);
  fill(t, ellipse(hand[0], hand[1], 18, 16), fist, { s: 6 });
  if (w === "claws") muzzle = weapon(k, hand[0] + 6, hand[1], s, -0.2);
  return muzzle;
};

const walker: BodyPainter = (k) => {
  const { t, P, S, f } = k;
  const step = f === 1;
  const w = k.r.weapon;
  contact(t, 0, -4, 100, 18, 0.55);
  back(k, -62, -168, 1.6);
  if (w === "staff") weapon(k, -30, -198, 1.3, -0.05);
  const leg = (hx: number, kx: number, fx: number, lift: number, m: ReturnType<typeof mat>) => {
    fill(t, tube([[hx, -122], [kx, -72 - lift]], [14, 11]), m, { s: 5 });
    fill(t, tube([[kx, -72 - lift], [fx, -16 - lift]], [10, 8]), m, { s: 5 });
    fill(t, ellipse(kx, -72 - lift, 12, 12), mat(N.steel, 0.6), { s: 4, spec: [kx - 4, -76 - lift, 3, 2] });
    fill(t, `M ${fx - 24} ${-2 - lift} C ${fx - 26} ${-14 - lift} ${fx - 14} ${-20 - lift} ${fx} ${-20 - lift} C ${fx + 18} ${-20 - lift} ${fx + 28} ${-12 - lift} ${fx + 26} ${-2 - lift} Z`, mat(N.gun, 0.5), { s: 4 });
    for (const dx of [10, 22]) fill(t, `M ${fx + dx} ${-6 - lift} L ${fx + dx + 10} ${-1 - lift} L ${fx + dx} ${-1 - lift} Z`, mat(N.steel, 0.6), { s: 0, line: t.line * 0.7 });
  };
  leg(-24, -2, -30, step ? 12 : 0, mat(shade(N.gun, -0.2), 0.4));
  fill(t, "M -66 -150 C -70 -184 -40 -204 0 -204 C 44 -204 76 -186 76 -150 C 76 -118 50 -104 6 -104 C -36 -104 -62 -118 -66 -150 Z", mat(P, 0.35), { s: 14, spec: [-36, -188, 14, 3, -0.2] });
  fill(t, "M -64 -140 C -30 -130 40 -130 74 -142 L 74 -130 C 40 -118 -30 -118 -64 -128 Z", mat(S, 0.4), { s: 3, line: t.line * 0.9 });
  for (let i = 0; i < 3; i++) ink(t, `M ${-44 + i * 9} -118 L ${-46 + i * 9} -110`, t.line * 1.2);
  bolts(t, [[-54, -160], [62, -162], [-50, -116], [60, -118]], 2.4);
  // cockpit: dark well, pilot, glass
  fill(t, ellipse(14, -204, 32, 27), mat(N.night, 0.2), { s: 4 });
  head(k, 14, -206, 18);
  flat(t, ellipse(14, -204, 32, 27), rgba(0xbfe8f0, 0.22));
  flat(t, "M -6 -222 C 0 -230 14 -232 24 -228 C 12 -226 2 -222 -2 -214 Z", "rgba(255,255,255,0.55)");
  ink(t, ellipse(14, -204, 32, 27), t.line * 1.1);
  fill(t, "M -20 -194 C 0 -182 30 -182 48 -194 L 48 -188 C 30 -176 0 -176 -20 -188 Z", mat(N.steel, 0.6), { s: 2, line: t.line * 0.9 });
  leg(26, 48, 38, 0, mat(N.gun, 0.5));
  fill(t, rrect(50, -152, 30, 28, 8), mat(N.gun, 0.5), { s: 4 });
  fill(t, rrect(54, -147, 8, 18, 2), mat(S, 0.4), { s: 1, line: t.line * 0.7 });
  let muzzle: Pt = [80, -138];
  if (w === "rifle" || w === "cannon") muzzle = weapon(k, 70, -138, 1.7, 0);
  else if (w === "blade") muzzle = weapon(k, 74, -132, 1.8, -0.55);
  else if (w === "claws") muzzle = weapon(k, 78, -134, 1.8, 0.25);
  return muzzle;
};

const flyer: BodyPainter = (k) => {
  const { t, P, S, f } = k;
  const w = k.r.weapon;
  contact(t, 0, -2, 60, 12, 0.3);
  glowAt(t, 0, -22, f ? 46 : 38, shade(S, 0.4), 0.55);
  back(k, -54, -56, 1);
  if (w === "staff") weapon(k, -24, -64, 0.9, -0.1);
  fill(t, "M -72 -44 C -60 -24 60 -24 72 -44 C 50 -36 -50 -36 -72 -44 Z", mat(shade(P, -0.3)), { s: 4 });
  fill(t, ellipse(0, -30, 16, 6), mat(N.gun, 0.5), { s: 2 });
  fill(t, ellipse(0, -28, 10, 3.4), mat(0xfff3c8), { s: 0, line: t.line * 0.6 });
  // cockpit well behind the hull rim
  fill(t, ellipse(6, -72, 26, 21), mat(N.night, 0.2), { s: 3 });
  head(k, 6, -80, 15);
  flat(t, ellipse(6, -72, 26, 21), rgba(0xbfe8f0, 0.22));
  flat(t, "M -12 -84 C -8 -90 2 -93 10 -91 C 2 -88 -4 -84 -8 -78 Z", "rgba(255,255,255,0.55)");
  ink(t, ellipse(6, -72, 26, 21), t.line * 1.1);
  fill(t, "M -76 -46 C -76 -58 -40 -66 0 -66 C 40 -66 78 -58 78 -46 C 78 -36 40 -30 0 -30 C -40 -30 -76 -36 -76 -46 Z", mat(P, 0.45), { s: 10, spec: [-36, -60, 18, 2.4, -0.05] });
  fill(t, "M -76 -46 C -76 -38 -40 -32 0 -32 C 40 -32 78 -38 78 -46 C 70 -42 40 -38 0 -38 C -40 -38 -70 -42 -76 -46 Z", mat(S, 0.4), { s: 1.5, line: t.line * 0.8 });
  [-50, -18, 18, 50].forEach((x, i) => {
    const lit = (i + f) % 2 === 0;
    if (lit) glowAt(t, x, -37, 9, 0xfff3b0, 0.8);
    fill(t, ellipse(x, -37, 3.6, 2.6), mat(lit ? 0xfff3b0 : shade(S, 0.15), 0.8), { s: 0.8, line: t.line * 0.6 });
  });
  let muzzle: Pt = [72, -44];
  if (w === "rifle" || w === "cannon") muzzle = weapon(k, 40, -34, 1, 0.05);
  else if (w === "blade") muzzle = weapon(k, 62, -46, 1, 0);
  else if (w === "claws") muzzle = weapon(k, 48, -34, 1, 0.6);
  return muzzle;
};

const structure: BodyPainter = (k) => {
  const { t, P, S } = k;
  const w = k.r.weapon;
  contact(t, 0, -6, 80, 18, 0.5);
  back(k, -36, -104, 1.4);
  if (w === "staff") weapon(k, -26, -122, 1.3, -0.1);
  fill(t, "M -72 -4 L -64 -34 L 64 -34 L 72 -4 Z", mat(mix(P, N.stone, 0.65)), { s: 6 });
  fill(t, rrect(-62, -42, 124, 10, 3), mat(S, 0.4), { s: 2 });
  fill(t, "M -42 -38 L -38 -126 C -38 -134 38 -134 38 -126 L 42 -38 Z", mat(P, 0.3), { s: 12, spec: [-24, -120, 5, 14, 0] });
  fill(t, rrect(-12, -76, 24, 38, 7), mat(N.night, 0.2), { s: 3 });
  flat(t, rrect(-8, -60, 16, 4, 1), rgba(shade(S, 0.4), 0.9));
  bolts(t, [[-32, -120], [32, -120], [-34, -48], [34, -48]], 2.4);
  fill(t, ellipse(0, -130, 42, 10), mat(N.steel, 0.5), { s: 3 });
  head(k, 0, -150, 26);
  let muzzle: Pt = [0, -150];
  if (w === "rifle" || w === "cannon") {
    fill(t, rrect(24, -118, 22, 26, 6), mat(N.gun, 0.5), { s: 3 });
    muzzle = weapon(k, 36, -104, 1.5, 0);
  } else if (w === "blade") muzzle = weapon(k, 34, -84, 1.6, -1.15);
  else if (w === "claws") {
    weapon(k, -54, -30, 1.4, -2.6);
    muzzle = weapon(k, 54, -30, 1.4, -0.5);
  }
  return muzzle;
};

const BODIES: Record<MiniBody, BodyPainter> = { trooper, critter, brute, walker, flyer, structure };

/** Paint a recipe figure (feet at the origin, centi-inches, facing right). Returns the muzzle. */
export function paintRecipe(t: Toon, recipe: MiniatureRecipe, factionColor: number, frame: number): Pt {
  const k: Kit = { t, r: recipe, P: lift(recipe.primary ?? factionColor), S: lift(recipe.secondary), f: frame };
  return BODIES[recipe.body](k);
}

/** A cheerful random recipe (for the forge's "Surprise me" button). */
export function randomRecipe(rnd: () => number = Math.random, base?: Partial<MiniatureRecipe>): MiniatureRecipe {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const trims = [0xffc23a, 0xe9e2d0, 0x7fe7ff, 0xf0565b, 0x56b34a, 0xb98aff, 0xff8a3d, 0x2c2f58];
  return {
    body: base?.body ?? pick(["trooper", "trooper", "critter", "brute", "walker", "flyer"] as const),
    head: pick(["face", "visor", "beast", "gem"] as const),
    headgear: pick(["none", "helmet", "hat", "goggles", "horns", "crown", "antennae"] as const),
    weapon: pick(["rifle", "cannon", "blade", "claws", "staff", "none"] as const),
    back: pick(["none", "pack", "jets", "tank", "banner"] as const),
    secondary: pick(trims),
    scale: 1,
    ...(base?.primary !== undefined ? { primary: base.primary } : {}),
  };
}
