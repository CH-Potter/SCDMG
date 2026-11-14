// Lumen Concord craft and walkers: the Shimmer Saucer (a flying saucer), The Grand Strider (a war-walker
// with a smug noble in its dome cockpit) and the Jetwing Scouts (an alien on a jet-wing).

import { contact, ellipse, fill, flat, glowAt, ink, mat, type Toon, tube } from "../toon";
import { rgba, shade } from "../palette";
import { alienHead, gemCut, gilt, glassDome, K, LINE, lite, mats, type Pt, poly, rayBarrel, saucer, seam, sparkle, stud } from "./concord-kit";
import type { Design, Painter } from "./types";

/** A faint hex-cell shield bubble around a craft, centred at (cx, cy). */
function bubble(t: Toon, cx: number, cy: number, rx: number, ry: number, A: number, k: number): void {
  const { ctx } = t;
  const L = lite(A);
  const b = ellipse(cx, cy, rx, ry);
  flat(t, b, L, 0.08 * k);
  ctx.save();
  ctx.clip(new Path2D(b));
  let hex = "";
  const hs = 18;
  for (let row = -8; row < 8; row++) {
    for (let col = -9; col <= 9; col++) {
      const x = cx + col * hs * 1.5;
      const y = cy + row * hs * 0.87 * 2 + (col % 2 ? hs * 0.87 : 0);
      for (let i = 0; i < 3; i++) {
        const a0 = (i / 6) * Math.PI * 2;
        const a1 = ((i + 1) / 6) * Math.PI * 2;
        hex += `M ${x + Math.cos(a0) * hs} ${y + Math.sin(a0) * hs} L ${x + Math.cos(a1) * hs} ${y + Math.sin(a1) * hs} `;
      }
    }
  }
  ink(t, hex, 1.2, rgba(shade(L, 0.3), 0.16 * k));
  ctx.restore();
  ink(t, b, 2.4, rgba(shade(L, 0.3), 0.32 * k));
  ink(t, `M ${cx - rx * 0.8} ${cy - ry * 0.4} A ${rx * 0.9} ${ry * 0.9} 0 0 1 ${cx - rx * 0.2} ${cy - ry * 0.9}`, 3.4, "rgba(255,255,255,0.35)");
}

// ---------- Shimmer Saucer: a flying saucer with a glass dome and a pilot ----------

export const SKIFF_DESIGN: Design = { ref: 1.05, b: [-156, -214, 164, 30], top: 200 };

export const skiff: Painter = (t, s, f) => {
  const A = s.color;
  const m = mats(A);
  const L = lite(A);
  const pulse = f === 1;
  glowAt(t, 0, -26, pulse ? 100 : 86, L, 0.36);
  bubble(t, 0, -96, 152, 112, A, pulse ? 1.3 : 1);
  saucer(t, 0, -66, 124, A, 7, 0.42);
  // the pilot: a pearl-suited alien, chin up, behind the glass
  const deck = -78;
  fill(t, `M -12 ${deck} C -14 ${deck - 14} -8 ${deck - 22} 8 ${deck - 22} C 24 ${deck - 22} 30 ${deck - 14} 28 ${deck} Z`, m.pearl, { s: 4 });
  fill(t, `M 0 ${deck - 21} L 8 ${deck - 22} L 22 ${deck - 2} L 14 ${deck} Z`, m.sash, { s: 1, line: LINE * 0.7 });
  alienHead(t, A, 8, deck - 18, 1, -0.14, { helmet: false, diadem: true });
  // control yoke
  fill(t, `M 26 ${deck - 2} L 40 ${deck - 12} L 44 ${deck - 8} L 32 ${deck} Z`, m.silver, { s: 1, line: LINE * 0.7 });
  glassDome(t, 6, deck, 62, A, 1.18);
  gilt(t, ellipse(6, deck, 60, 10), 2);
  // the rim cannon: a square-cut barrel with a ring emitter, angled a touch up
  const muzzle = rayBarrel(t, 108, -70, 152, 4.2, A, [0.5], -0.08);
  if (pulse) sparkle(t, 40, -186, 5, L);
  return muzzle;
};

// ---------- The Grand Strider: a war-walker with a smug noble in its dome cockpit ----------

export const FACET_DESIGN: Design = { ref: 1.35, b: [-170, -310, 236, 16], top: 298 };

/** A limb plate between two points: a quad of half-width w, its ends squared off. */
function limb(a: Pt, b: Pt, w0: number, w1 = w0): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  return poly([[a[0] + nx * w0, a[1] + ny * w0], [b[0] + nx * w1, b[1] + ny * w1], [b[0] - nx * w1, b[1] - ny * w1], [a[0] - nx * w0, a[1] - ny * w0]]);
}

function walkerLeg(t: Toon, A: number, ox: number, dark: boolean): void {
  const m = mats(A);
  const plate = dark ? mat(shade(K.silver, -0.28), 0.5, 0.34) : m.silver;
  const shin = dark ? m.navyB : m.navy;
  const hip: Pt = [ox, -150];
  const knee: Pt = [ox + 38, -96];
  const ankle: Pt = [ox + 6, -26];
  fill(t, limb(knee, ankle, 14, 11), shin, { s: 5 });
  if (!dark) seam(t, `M ${knee[0] - 3} ${knee[1] + 8} L ${ankle[0] + 2} ${ankle[1] - 6}`, A, 1.4);
  fill(t, limb(hip, knee, 20, 15), plate, { s: 6 });
  if (!dark) flat(t, limb([hip[0] - 4, hip[1] + 2], [knee[0] - 6, knee[1] - 2], 6, 4), 0xffffff, 0.3);
  // knee joint: a gold-rimmed hex with a light
  const kp: Pt[] = [];
  for (let i = 0; i < 6; i++) kp.push([knee[0] + Math.cos((i / 6) * Math.PI * 2) * 14, knee[1] + Math.sin((i / 6) * Math.PI * 2) * 14]);
  fill(t, poly(kp), dark ? mat(shade(K.gold, -0.3), 0.6) : m.gold, { s: 3 });
  stud(t, knee[0], knee[1], 4, A, !dark);
  // a broad flat foot with split toes
  fill(t, `M ${ox - 30} 0 L ${ox + 44} 0 L ${ox + 32} -20 L ${ox - 18} -24 Z`, plate, { s: 4 });
  ink(t, `M ${ox + 8} 0 L ${ox + 8} -10 M ${ox + 24} 0 L ${ox + 22} -12`, LINE * 0.7, "rgba(40,30,70,0.5)");
  fill(t, limb([ankle[0], ankle[1] + 2], [ankle[0] + 2, -16], 9), plate, { s: 2 });
}

export const facet: Painter = (t, s, f) => {
  const { ctx } = t;
  const A = s.color;
  const m = mats(A);
  const L = lite(A);
  const step = f === 1;
  contact(t, 4, -4, 140, 20, 0.55);
  glowAt(t, 0, -176, 200, L, 0.14);
  // a royal cape hung from the hull's stern: navy, faction-colour lining, gold hem
  fill(t, `M -60 -196 C -104 -170 -128 -100 -140 ${step ? -20 : -14} C -110 -6 -82 -10 -60 -16 C -66 -80 -62 -140 -36 -192 Z`, m.navy, { s: 10 });
  fill(t, `M -140 ${step ? -20 : -14} C -110 -6 -82 -10 -60 -16 C -74 -24 -108 -26 -136 ${step ? -29 : -25} Z`, m.sash, { s: 3, line: LINE * 0.8 });
  gilt(t, `M -136 ${step ? -29 : -25} C -108 -26 -74 -24 -60 -16`, 3);
  // far leg
  ctx.save();
  if (step) ctx.translate(-8, -6);
  walkerLeg(t, A, -44, true);
  ctx.restore();
  // the back arm and its great fist, hanging at the hull's flank
  fill(t, limb([-80, -176], [-112, -130], 15, 13), mat(shade(K.silver, -0.2), 0.5), { s: 5 });
  gemCut(t, [[-146, -136], [-102, -142], [-94, -102], [-106, -82], [-146, -88], [-156, -114]], mat(shade(K.silver, -0.05), 0.6, 0.34), 7, 0.55);
  gilt(t, "M -150 -118 L -96 -122", 3);
  for (const y of [-110, -96]) stud(t, -100, y, 2.6, A);
  // the hull
  saucer(t, 0, -176, 110, A, 7, 0.4);
  // hex shield emitters on the rim
  for (const x of [-84, 84]) {
    glowAt(t, x, -176, 18, L, 0.7);
    fill(t, `M ${x - 6} -182 L ${x + 6} -182 L ${x + 9} -176 L ${x + 6} -170 L ${x - 6} -170 L ${x - 9} -176 Z`, m.gem, { s: 2, line: LINE * 0.7 });
  }
  // the noble in the cockpit: pearl coat, lavender sash, gold epaulette, crown and monocle
  const deck = -188;
  fill(t, `M -18 ${deck} C -20 ${deck - 18} -10 ${deck - 28} 10 ${deck - 28} C 30 ${deck - 28} 40 ${deck - 18} 38 ${deck} Z`, m.pearl, { s: 5 });
  fill(t, `M -2 ${deck - 27} L 8 ${deck - 28} L 30 ${deck - 2} L 20 ${deck} Z`, m.sash, { s: 1, line: LINE * 0.7 });
  fill(t, ellipse(26, deck - 24, 11, 5), m.gold, { s: 2 });
  alienHead(t, A, 10, deck - 24, 1.12, -0.12, { helmet: false, crown: true, monocle: true });
  glassDome(t, 10, deck, 66, A, 1);
  gilt(t, ellipse(10, deck, 66, 11), 2.4);
  // near leg
  ctx.save();
  if (step) ctx.translate(8, -4);
  walkerLeg(t, A, 26, false);
  ctx.restore();
  // the cannon arm: a gilded shoulder mount, a housing and a long barrel with ring emitters
  gemCut(t, [[66, -194], [100, -196], [104, -160], [70, -156]], m.silver, 6, 0.55);
  fill(t, poly([[90, -186], [134, -188], [136, -148], [92, -146]]), m.pearl, { s: 7 });
  flat(t, poly([[90, -186], [134, -188], [134, -176], [90, -174]]), 0xffffff, 0.35);
  seam(t, "M 96 -160 L 130 -161", A, 1.6);
  gilt(t, "M 90 -186 L 134 -188", 2.4);
  const muzzle = rayBarrel(t, 134, -168, 214, 7.5, A, [0.22, 0.52], -0.06);
  if (step) sparkle(t, muzzle[0] + 4, muzzle[1] - 4, 8, L);
  return muzzle;
};

// ---------- Jetwing Scouts: an alien on a jet-wing, gliding in with a ray pistol ----------

export const SYLPH_DESIGN: Design = { ref: 0.75, b: [-150, -236, 112, 8], top: 222 };

export const sylph: Painter = (t, s, f) => {
  const A = s.color;
  const m = mats(A);
  const L = lite(A);
  const flick = f === 1;
  glowAt(t, -20, -124, 100, L, 0.28);
  const wing = (dy: number, dark: boolean) => {
    const pts: Pt[] = [[-6, -128 + dy], [-82, -170 + dy], [-132, -168 + dy], [-60, -132 + dy], [-24, -112 + dy]];
    fill(t, poly(pts), dark ? mat(shade(K.pearl, -0.25), 0.4) : m.pearl, { s: 6 });
    // navy trailing band, a glowing leading-edge seam, gold stripe
    fill(t, poly([[-132, -168 + dy], [-60, -132 + dy], [-24, -112 + dy], [-36, -110 + dy], [-70, -130 + dy], [-128, -160 + dy]]), dark ? m.navyB : m.navy, { s: 2, line: LINE * 0.8 });
    if (!dark) {
      seam(t, `M -8 ${-128 + dy} L -80 ${-168 + dy} L -126 ${-167 + dy}`, A, 1.6);
      gilt(t, `M -20 ${-122 + dy} L -86 ${-156 + dy}`, 2);
      flat(t, poly([[-14, -126 + dy], [-70, -158 + dy], [-60, -150 + dy]]), 0xffffff, 0.45);
    }
  };
  // far wing
  wing(-8, true);
  // the jet pack and its square nozzles, flames flickering
  for (const [x, y] of [[-30, -104], [-18, -100]] as const) {
    const fl = flick ? 26 : 18;
    glowAt(t, x - 10, y + 14, fl, L, 0.9);
    fill(t, `M ${x - 4} ${y + 8} L ${x - 14 - fl * 0.5} ${y + 22 + fl * 0.3} L ${x + 4} ${y + 12} Z`, mat(shade(L, 0.4), 0.8), { s: 0, line: 0, alpha: 0.85 });
  }
  fill(t, "M -40 -118 L -14 -128 L -4 -104 L -30 -94 Z", m.silver, { s: 4 });
  fill(t, "M -38 -98 L -28 -102 L -24 -92 L -34 -88 Z", m.navy, { s: 1, line: LINE * 0.8 });
  fill(t, "M -26 -94 L -16 -98 L -12 -88 L -22 -84 Z", m.navy, { s: 1, line: LINE * 0.8 });
  // legs trailing back, boots together
  fill(t, tube([[-8, -94], [-26, -76], [-44, -64]], [6.4, 5.2, 4]), m.navyB, { s: 3 });
  fill(t, tube([[-2, -92], [-16, -70], [-34, -56]], [7.2, 6, 4.4]), m.navy, { s: 3 });
  fill(t, "M -36 -62 L -50 -58 L -48 -50 L -32 -52 Z", m.boot, { s: 1.5 });
  fill(t, "M -46 -70 L -60 -66 L -58 -58 L -42 -60 Z", mat(shade(K.silver, -0.2), 0.5), { s: 1.5 });
  // the torso, leaning into the glide
  fill(t, "M -16 -96 C -14 -112 -2 -130 14 -134 C 26 -134 32 -124 28 -112 C 22 -98 8 -88 -6 -84 C -14 -84 -18 -88 -16 -96 Z", m.pearl, { s: 6, spec: [4, -126, 3, 5, -0.4] });
  seam(t, "M 2 -128 L -10 -90", A, 1.3);
  gilt(t, "M -14 -94 C -4 -92 6 -96 12 -100", 2);
  alienHead(t, A, 18, -132, 0.98, -0.26);
  // pointing arm with a ray pistol at chest height
  fill(t, tube([[12, -124], [32, -122], [46, -124]], [6.2, 5.2, 4.4]), m.navy, { s: 3 });
  fill(t, "M 44 -130 L 58 -130 L 58 -120 L 50 -120 L 48 -114 L 43 -114 Z", m.pearl, { s: 2 });
  const muzzle = rayBarrel(t, 58, -126, 80, 3, A, [0.45], -0.04);
  fill(t, ellipse(47, -123, 5, 4.6), m.glove, { s: 2 });
  // near wing over everything
  wing(4, false);
  return muzzle;
};
