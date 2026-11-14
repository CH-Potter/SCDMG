// Procedural miniatures in a polished cartoon style, seen from a 3/4 top-down camera, standing on
// round bases. Each unit profile maps to an archetype ("kind") from its keywords, weapons, abilities,
// base radius and faction look. Parts are authored as bezier SVG paths in centi-inches (feet at the
// origin, facing right) and painted with the `toon` kit: 2–3 cel tones from a top-left light,
// specular highlights, thin interior lines, and a heavy outer silhouette added when the sheet is
// baked. Faction colour goes on clothing and armour accents; each faction has a curated palette.
// Sheets are painted at 2–4× the on-screen resolution and scaled down for crisp edges.

import type { Faction, MiniatureRecipe, UnitProfile } from "../../engine/types";
import { artImage, coinDesign, paintCoin, whenArtImage } from "./coin";
import type { Painter as FactionPainter } from "./factions/types";
import { hash, makeCanvas } from "./ink";
import { BODY_DESIGN, paintRecipe } from "./miniBuilder";
import { luma, mix, rgba, shade } from "./palette";
import { FACTION_ART, factionFigure } from "./factions";
import { contact, ellipse, fill, flat, glowAt, ink, mat, type Mat, outlined, rrect, teethRow, type Toon, tube } from "./toon";

export type Look = Faction["look"];
export type FigureKind =
  | "trooper"
  | "critter"
  | "brute"
  | "walker"
  | "plane"
  | "skiff"
  | "bug"
  | "turret"
  | "pylon"
  | "pod"
  | "beacon"
  | "junk"
  | "hole"
  | "ward"
  | "bike"
  | "golem"
  | "mound"
  | "sylph";

export interface FigureSpec {
  kind: FigureKind;
  look: Look;
  color: number;
  r: number;
  ranged: boolean;
  melee: boolean;
  long: boolean;
  medic: boolean;
  caster: boolean;
  spitter: boolean;
  jump: boolean;
  armoured: boolean;
  heavy: boolean;
  /** The unit's profile id, so a faction's art module can paint each built-in unit its own way. */
  unit?: string;
  /** Custom art from the profile: replaces the archetype painter (kind still drives animation). */
  art?: SpecArt;
}

/** Custom art in a spec: a built miniature, or an uploaded image drawn as a coin token. */
export type SpecArt = { kind: "parts"; recipe: MiniatureRecipe } | { kind: "image"; src: string; id: string };

export interface FigureMeta {
  /** Weapon tip (inches, feet origin, facing right). */
  muzzle: { x: number; y: number };
  /** Height of the top of the figure above its feet (inches). */
  top: number;
  /** Bounds in inches relative to the feet. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Classify a profile into a figure archetype (or its custom art, if it has any). */
export function figureSpec(p: UnitProfile, look: Look, color: number): FigureSpec {
  const auto = archetypeSpec(p, look, color);
  const art = p.art;
  if (art?.kind === "parts") {
    const flying = p.keywords.includes("flying");
    const kind: FigureKind = flying ? "skiff" : RECIPE_KIND[art.recipe.body];
    return { ...auto, kind, art: { kind: "parts", recipe: art.recipe } };
  }
  if (art?.kind === "image") return { ...auto, kind: "junk", art: { kind: "image", src: art.dataUrl, id: `${hash(art.dataUrl).toString(36)}.${art.dataUrl.length}` } };
  return auto;
}

/** The animation archetype each builder body behaves like. */
const RECIPE_KIND: Record<MiniatureRecipe["body"], FigureKind> = { trooper: "trooper", critter: "critter", brute: "brute", walker: "walker", flyer: "skiff", structure: "turret" };

/** The built-in archetype for a profile, ignoring custom art. */
export function archetypeSpec(p: UnitProfile, look: Look, color: number): FigureSpec {
  const kw = new Set(p.keywords);
  const ranged = p.weapons.some((w) => !w.melee);
  const melee = !ranged || (p.weapons[0]?.melee ?? false);
  const long = p.weapons.some((w) => !w.melee && w.range >= 24);
  const ab = new Set(p.abilities);
  const structure = !!p.structure || kw.has("structure");
  let kind: FigureKind;
  if (structure) {
    const temp = p.structure?.lifetime === "round";
    if (temp) kind = look === "teeth" || kw.has("beast") ? "hole" : look === "crystal" ? "ward" : "junk";
    else if (look === "teeth" || kw.has("beast")) kind = ab.has("burrow-exit") ? "mound" : "pod";
    else if (look === "crystal") kind = "pylon";
    else kind = ranged ? "turret" : "beacon";
  } else if (kw.has("flying")) {
    kind = kw.has("beast") ? "bug" : look === "crystal" ? (kw.has("mech") || p.baseRadius >= 1 ? "skiff" : "sylph") : kw.has("mech") ? "plane" : look === "teeth" ? "bug" : "skiff";
  } else if (kw.has("monster")) kind = kw.has("mech") ? "walker" : look === "crystal" ? "golem" : "brute";
  else if (kw.has("mech")) kind = kw.has("light") ? "bike" : "walker";
  else if (kw.has("beast")) kind = p.baseRadius >= 1.1 ? "brute" : "critter";
  else kind = p.baseRadius >= 1.15 && kw.has("heavy") ? "walker" : "trooper";
  return {
    kind,
    look,
    color: luma(color) < 0.14 ? shade(color, 0.18) : color,
    r: p.baseRadius,
    ranged,
    melee,
    long,
    medic: ab.has("patch-up") || ab.has("hatch"),
    caster: ab.has("radiance") || ab.has("recall"),
    spitter: ab.has("sticky-goo") || (kw.has("beast") && ranged),
    jump: kw.has("jump"),
    armoured: kw.has("armoured"),
    heavy: kw.has("heavy"),
    unit: p.id,
  };
}

const artKey = (a: SpecArt | undefined): string => {
  if (!a) return "";
  if (a.kind === "image") return `img:${a.id}`;
  const r = a.recipe;
  return `parts:${r.body}.${r.head}.${r.headgear}.${r.weapon}.${r.back}.${r.primary ?? "f"}.${r.secondary}.${r.scale}`;
};

export const specKey = (s: FigureSpec): string =>
  [s.kind, s.look, s.color, s.r, +s.ranged, +s.melee, +s.long, +s.medic, +s.caster, +s.spitter, +s.jump, +s.armoured, +s.heavy, s.unit ?? "", artKey(s.art)].join("|");

/** Idle breathing (amplitude, period in seconds) per archetype: shared by the board and the forge. */
export const IDLE_BREATH: Record<FigureKind, [number, number]> = {
  trooper: [0.025, 1.6],
  critter: [0.05, 0.9],
  brute: [0.045, 1.9],
  walker: [0.012, 0.25],
  plane: [0, 1],
  skiff: [0, 1],
  bug: [0.04, 0.5],
  turret: [0.006, 0.3],
  pylon: [0.015, 2.4],
  pod: [0.08, 2.2],
  beacon: [0.005, 0.4],
  junk: [0, 1],
  hole: [0.03, 1.3],
  ward: [0.02, 1.8],
  bike: [0.014, 0.22],
  golem: [0.015, 2.6],
  mound: [0.045, 2.1],
  sylph: [0.02, 1.4],
};

/** Whether the renderer may mirror this archetype to face things (most structures stay put). */
export const rotates = (k: FigureKind): boolean => !["pylon", "pod", "beacon", "junk", "hole", "ward", "mound"].includes(k);

/** Design size per archetype: reference base radius (inches), bounds and height (centi-inches). */
const DESIGN: Record<FigureKind, { ref: number; b: [number, number, number, number]; top: number }> = {
  trooper: { ref: 0.5, b: [-62, -168, 96, 12], top: 142 },
  critter: { ref: 0.42, b: [-64, -86, 66, 10], top: 70 },
  brute: { ref: 1.35, b: [-150, -215, 156, 14], top: 185 },
  walker: { ref: 1.25, b: [-125, -262, 170, 14], top: 235 },
  plane: { ref: 0.9, b: [-118, -112, 124, 14], top: 92 },
  skiff: { ref: 1.05, b: [-128, -190, 146, 22], top: 165 },
  bug: { ref: 0.48, b: [-74, -120, 74, 12], top: 92 },
  turret: { ref: 0.85, b: [-108, -175, 128, 28], top: 132 },
  pylon: { ref: 0.85, b: [-88, -258, 88, 24], top: 238 },
  pod: { ref: 0.85, b: [-98, -190, 98, 20], top: 140 },
  beacon: { ref: 0.85, b: [-82, -190, 82, 24], top: 168 },
  junk: { ref: 1.25, b: [-132, -128, 132, 28], top: 100 },
  hole: { ref: 0.95, b: [-118, -98, 118, 34], top: 60 },
  ward: { ref: 0.7, b: [-88, -180, 88, 24], top: 152 },
  bike: { ref: 0.9, b: [-128, -182, 104, 12], top: 168 },
  golem: { ref: 1.35, b: [-146, -264, 176, 14], top: 252 },
  mound: { ref: 1.1, b: [-124, -158, 124, 22], top: 120 },
  sylph: { ref: 0.75, b: [-114, -222, 98, 8], top: 200 },
};

/** Outer silhouette width (inches) and interior line width (centi-inches). */
export const FIG_INK = 0.042;
const LINE = 1.5;

// ---------- palettes ----------

const C = {
  ink: 0x1c1512,
  skin: 0xd99e72,
  leather: 0x7a4f2e,
  leatherDark: 0x4e3220,
  glove: 0x8c6036,
  brass: 0xcf9f42,
  gun: 0x4c5158,
  steel: 0x9aa3a8,
  wood: 0x9a6236,
  canvas: 0xbca476,
  denim: 0x5c7389,
  red: 0xa8432e,
  lens: 0x7fd6cf,
  rubber: 0x2f2b29,
  bone: 0xf2ead2,
  gum: 0xc2475e,
  mouth: 0x3a0a16,
  tongue: 0xe46a82,
  eye: 0xffd23a,
  goo: 0xc6ea52,
  pearl: 0xebe5f2,
  navy: 0x2c2f58,
  gold: 0xdcb55a,
  stone: 0x8f88a4,
  sand: 0xb8996a,
  dirt: 0x8a6440,
};

/** Creature hide: the faction colour, desaturated and deepened, so markings in the pure colour pop. */
const hide = (c: number): number => mix(shade(c, -0.18), 0x4d5a62, 0.38);
/** Crystal tint for a faction colour. */
const gem = (c: number): number => mix(shade(c, 0.45), 0xf4f0ff, 0.25);

// ---------- shared bits ----------

function eye(t: Toon, x: number, y: number, rx: number, ry: number, browTilt = 1, color = C.eye): void {
  glowAt(t, x, y, rx * 2.6, color, 0.4);
  fill(t, ellipse(x, y, rx, ry), mat(color, 0.3), { s: rx * 0.5, line: LINE * 0.9, spec: [x - rx * 0.35, y - ry * 0.4, rx * 0.25, ry * 0.18] });
  flat(t, ellipse(x + rx * 0.15, y, rx * 0.22, ry * 0.75), C.ink);
  // angry brow
  const bw = rx * 1.5;
  fill(t, `M ${x - bw} ${y - ry * 1.5 - browTilt * ry * 0.4} Q ${x} ${y - ry * 1.9} ${x + bw} ${y - ry * 0.9 + browTilt * ry * 0.5} L ${x + bw * 0.9} ${y - ry * 0.45 + browTilt * ry * 0.5} Q ${x} ${y - ry * 1.15} ${x - bw} ${y - ry * 1.05 - browTilt * ry * 0.4} Z`, mat(C.ink), { s: 0, line: 0 });
}

function rivets(t: Toon, pts: [number, number][], r = 1.8): void {
  for (const [x, y] of pts) fill(t, ellipse(x, y, r, r), mat(C.steel, 0.5), { s: r * 0.7, line: LINE * 0.6, hi: 0.8 });
}

function stitchRect(t: Toon, x: number, y: number, w: number, h: number): void {
  t.ctx.save();
  t.ctx.setLineDash([2.2, 1.8]);
  ink(t, rrect(x + 1.6, y + 1.6, w - 3.2, h - 3.2, 1), 0.9, "rgba(255,240,210,0.85)");
  t.ctx.restore();
}

function smoke(t: Toon, x: number, y: number, r: number): void {
  for (let i = 0; i < 3; i++) {
    const k = 1 - i * 0.25;
    fill(t, ellipse(x - i * r * 0.8, y - i * r * 1.1, r * k, r * k * 0.85), mat(0x9a948c), { s: r * 0.4, alpha: 0.9 - i * 0.22, line: LINE * 0.8 });
  }
}

function hazardBand(t: Toon, d: string, x: number, y: number, w: number, h: number): void {
  const { ctx } = t;
  const p = new Path2D(d);
  ctx.save();
  ctx.clip(p);
  ctx.fillStyle = "#e8b632";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#1c1512";
  for (let s = x - h; s < x + w + h; s += h * 1.6) {
    ctx.beginPath();
    ctx.moveTo(s, y + h);
    ctx.lineTo(s + h, y);
    ctx.lineTo(s + h * 1.8, y);
    ctx.lineTo(s + h * 0.8, y + h);
    ctx.fill();
  }
  ctx.restore();
  ink(t, p);
}

/** A faceted crystal (tip up) with glow, facets and a specular glint. */
function crystal(t: Toon, cx: number, top: number, bottom: number, w: number, color: number, lean = 0): void {
  const g = gem(color);
  const mid = top + (bottom - top) * 0.3;
  glowAt(t, cx, (top + bottom) / 2, (bottom - top) * 0.9, shade(color, 0.5), 0.35);
  fill(t, `M ${cx + lean} ${top} L ${cx + w} ${mid} L ${cx + w * 0.7} ${bottom} L ${cx - w * 0.7} ${bottom} L ${cx - w} ${mid} Z`, mat(g, 0.9, 0.22), {
    s: w * 0.5,
    spec: [cx - w * 0.4, mid - (mid - top) * 0.2, w * 0.18, (bottom - top) * 0.12, -0.3],
  });
  ink(t, `M ${cx + lean} ${top} L ${cx + w * 0.15} ${mid} L ${cx} ${bottom} M ${cx - w} ${mid} L ${cx + w * 0.15} ${mid} L ${cx + w} ${mid}`, LINE * 0.6, "rgba(40,30,70,0.45)");
}

type Pt = [number, number];
const poly = (q: Pt[]): string => `M ${q.map((p) => `${p[0]} ${p[1]}`).join(" L ")} Z`;

/** A cut gem block: a polygon with a raised table and bevel facets lit from the top left. */
function gemCut(t: Toon, pts: Pt[], m: Mat, s = 8, table = 0.52): void {
  const n = pts.length;
  const cx = pts.reduce((a, p) => a + p[0], 0) / n;
  const cy = pts.reduce((a, p) => a + p[1], 0) / n;
  const span = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
  const inner = pts.map(([x, y]): Pt => [cx + (x - cx) * table - span * 0.06, cy + (y - cy) * table - span * 0.08]);
  const outer = poly(pts);
  fill(t, outer, m, { s });
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const ex = (a[0] + b[0]) / 2 - cx;
    const ey = (a[1] + b[1]) / 2 - cy;
    const lit = -(ex + ey) / (Math.SQRT2 * (Math.hypot(ex, ey) || 1));
    const quad = poly([a, b, inner[(i + 1) % n]!, inner[i]!]);
    if (lit > 0.2) flat(t, quad, 0xffffff, 0.34 * lit);
    else if (lit < -0.2) flat(t, quad, shade(m.base, -0.5), -0.32 * lit);
  }
  flat(t, poly(inner), 0xffffff, 0.16);
  ink(t, poly(inner) + pts.map((p, i) => ` M ${p[0]} ${p[1]} L ${inner[i]![0]} ${inner[i]![1]}`).join(""), LINE * 0.55, "rgba(40,30,70,0.45)");
  ink(t, outer, LINE);
  const [gx, gy] = inner[0]!;
  flat(t, ellipse(gx + span * 0.08, gy + span * 0.06, span * 0.07, span * 0.035), "rgba(255,255,255,0.85)");
}

/** A sly eye peeking out of the dark (lid 0 open … 1 shut; look -1 left … 1 right). */
function peek(t: Toon, x: number, y: number, r: number, lid: number, look: number): void {
  glowAt(t, x, y, r * 3, C.eye, 0.45);
  if (lid >= 1) {
    ink(t, `M ${x - r} ${y} Q ${x} ${y + r * 0.6} ${x + r} ${y}`, LINE * 1.1, rgba(C.eye, 1));
    return;
  }
  const e = ellipse(x, y, r, r * 0.86);
  fill(t, e, mat(C.eye, 0.3), { s: r * 0.4, line: LINE * 0.7 });
  flat(t, ellipse(x + look * r * 0.34, y + r * 0.08, r * 0.36, r * 0.62), C.ink);
  flat(t, ellipse(x - r * 0.3 + look * r * 0.2, y - r * 0.32, r * 0.2, r * 0.16), "rgba(255,255,255,0.9)");
  if (lid > 0) {
    const ly = y - r + lid * 2 * r;
    t.ctx.save();
    t.ctx.clip(new Path2D(e));
    flat(t, `M ${x - r * 1.2} ${y - r * 1.2} L ${x + r * 1.2} ${y - r * 1.2} L ${x + r * 1.2} ${ly} Q ${x} ${ly + r * 0.35} ${x - r * 1.2} ${ly} Z`, 0x2a1a12);
    ink(t, `M ${x - r * 1.2} ${ly} Q ${x} ${ly + r * 0.35} ${x + r * 1.2} ${ly}`, LINE * 0.8);
    t.ctx.restore();
  }
}

// ---------- archetypes ----------

type Painter = FactionPainter;

/** Dustline settler (look "cap"), generic armoured trooper ("plain"), or toothy biped ("teeth"). */
const trooper: Painter = (t, s, f) => {
  if (s.look === "crystal") return aristocrat(t, s, f);
  const { ctx } = t;
  const A = s.color;
  const settler = s.look === "cap";
  const suitC = settler ? C.denim : s.look === "teeth" ? hide(A) : 0x5a6058;
  const suit = mat(suitC);
  const suitB = mat(shade(suitC, -0.14));
  const boot = mat(C.leatherDark, 0.2);
  const step = f === 1;

  contact(t, 2, -2, 32, 9, 0.55);
  // --- gear on the back
  if (s.jump) {
    fill(t, rrect(-42, -100, 16, 40, 7), mat(C.steel, 0.6), { spec: [-38, -94, 2, 6] });
    fill(t, rrect(-32, -104, 16, 44, 7), mat(C.steel, 0.6), { spec: [-28, -98, 2, 6] });
    glowAt(t, -30, -50, 18, 0xff9a3a, 0.8);
    fill(t, `M -38 -60 Q -34 ${step ? -36 : -40} -30 ${step ? -28 : -34} Q -27 -46 -22 -60 Z`, mat(0xffb347), { s: 0, line: LINE * 0.8 });
  } else if (s.medic) {
    fill(t, `M -38 -92 C -42 -78 -40 -62 -34 -54 L -18 -56 L -18 -92 C -24 -96 -34 -96 -38 -92 Z`, mat(0xe9e2d0));
    flat(t, rrect(-33, -82, 10, 3.5, 1), C.red);
    flat(t, rrect(-29.75, -85.5, 3.5, 10, 1), C.red);
  } else {
    fill(t, `M -38 -88 C -42 -74 -40 -60 -34 -52 L -18 -54 L -18 -88 C -24 -92 -34 -92 -38 -88 Z`, mat(C.leather));
    fill(t, `M -42 -98 C -46 -98 -47 -88 -42 -88 L -20 -88 C -15 -88 -15 -98 -20 -98 Z`, mat(settler ? C.red : C.canvas), { s: 4 });
    ink(t, "M -36 -98 L -36 -88 M -26 -98 L -26 -88", LINE * 0.8);
    if (settler) {
      ink(t, "M -34 -98 Q -38 -116 -44 -134", LINE * 1.2);
      fill(t, ellipse(-44, -135, 2.6, 2.6), mat(0xe04a3a, 0.6), { s: 1 });
    }
  }
  // --- legs (back leg first)
  ctx.save();
  if (step) ctx.translate(-6, -3);
  fill(t, "M -15 -47 C -17 -33 -16 -23 -14 -13 L -2 -13 C -1 -23 -1 -35 -1 -47 Z", suitB);
  fill(t, "M -18 -16 C -20 -6 -18 0 -11 0 L 1 0 C 6 0 7 -6 3 -10 C 0 -14 -5 -17 -10 -17 Z", boot, { s: 4 });
  ctx.restore();
  ctx.save();
  if (step) ctx.translate(7, -5);
  fill(t, "M 0 -47 C 0 -34 2 -24 4 -13 L 17 -13 C 18 -25 17 -36 15 -47 Z", suit);
  if (settler) {
    fill(t, rrect(4, -33, 11, 9, 2), mat(C.canvas), { s: 3, line: LINE * 0.8 });
    stitchRect(t, 4, -33, 11, 9);
  }
  fill(t, "M 1 -16 C 0 -6 2 0 9 0 L 23 0 C 28 0 30 -6 26 -10 C 23 -14 16 -17 10 -17 Z", boot, { s: 4, spec: [20, -10, 3, 1.6] });
  ink(t, "M 3 -2 L 27 -2", LINE * 1.3);
  ctx.restore();

  // --- upper body leans forward a touch
  ctx.save();
  ctx.translate(0, -46);
  ctx.rotate(0.05);
  ctx.translate(0, 46);
  // back arm, behind the torso, reaching for the foregrip
  const twoHanded = s.ranged && !s.medic;
  if (twoHanded) fill(t, tube([[-6, -83], [8, -71], [31, -67]], [8, 7, 5.5]), suitB, { s: 5 });
  else fill(t, tube([[-8, -83], [-15, -68], [-12, -55]], [8, 7, 6]), suitB, { s: 5 });
  // torso
  fill(t, "M -21 -89 C -26 -75 -26 -59 -23 -45 C -12 -39 8 -39 19 -44 C 23 -59 22 -76 17 -89 C 6 -94 -10 -94 -21 -89 Z", suit, { s: 9 });
  if (settler) {
    // hi-vis straps and reflective band in the faction colour, patched pocket, rivets
    fill(t, "M -15 -90 L -9 -91 L -5 -47 L -11 -46 Z", mat(A, 0.2), { s: 3, line: LINE * 0.8 });
    fill(t, "M 5 -92 L 11 -91 L 12 -46 L 6 -46 Z", mat(A, 0.2), { s: 3, line: LINE * 0.8 });
    fill(t, "M -24 -66 C -10 -63 8 -63 21 -66 L 21 -60 C 8 -57 -10 -57 -24 -60 Z", mat(0xe6e2d6, 0.4), { s: 2, line: LINE * 0.8 });
    fill(t, rrect(-4, -84, 10, 9, 1.5), mat(C.canvas), { s: 3, line: LINE * 0.8 });
    stitchRect(t, -4, -84, 10, 9);
    rivets(t, [[-12, -86], [8, -87], [-7, -50], [9, -50]], 1.4);
  } else {
    // armour plates in the faction colour
    fill(t, "M -16 -88 C -6 -92 8 -92 15 -88 L 13 -64 C 4 -60 -8 -60 -16 -64 Z", mat(A, 0.4), { s: 6, spec: [-8, -84, 4, 2] });
    ink(t, "M -1 -90 L -1 -62", LINE * 0.8);
  }
  // belt, buckle, pouch
  fill(t, "M -24 -51 C -10 -47 8 -47 21 -51 L 21 -44 C 8 -41 -10 -41 -24 -45 Z", mat(C.leather), { s: 3 });
  fill(t, rrect(-2, -50, 8, 7, 1.5), mat(C.brass, 0.7), { s: 2, line: LINE * 0.8 });
  fill(t, rrect(11, -52, 9, 11, 2.5), mat(C.canvas), { s: 3, line: LINE * 0.8 });

  // --- head
  const head = () => {
    if (s.look === "teeth") {
      fill(t, "M -14 -96 C -20 -112 -12 -132 4 -132 C 20 -132 30 -118 28 -104 C 26 -94 16 -90 4 -90 C -6 -90 -12 -92 -14 -96 Z", mat(hide(A)), { s: 7 });
      fill(t, "M 6 -106 C 14 -114 28 -112 30 -104 C 30 -96 22 -92 14 -94 C 8 -96 5 -100 6 -106 Z", mat(C.mouth), { s: 0 });
      fill(t, teethRow(7, -106, 18, -112, 30, -105, 5, 6, 1), mat(C.bone), { s: 1, line: LINE * 0.6 });
      fill(t, teethRow(9, -96, 18, -92, 28, -98, 4, 5, -1), mat(C.bone), { s: 1, line: LINE * 0.6 });
      eye(t, 8, -120, 4, 3.6);
      return;
    }
    fill(t, ellipse(3, -106, 16.5, 17), mat(C.skin), { s: 6 });
    fill(t, ellipse(-11, -104, 4, 5), mat(shade(C.skin, -0.08)), { s: 2, line: LINE * 0.8 });
    if (settler || s.medic) {
      // scarf, bandana mask, goggles, hard hat in the faction colour (white for the medic)
      fill(t, "M -15 -89 C -10 -83 10 -83 15 -89 C 12 -97 -12 -97 -15 -89 Z", mat(C.red), { s: 3 });
      fill(t, "M -11 -100 C -2 -96 12 -96 19.5 -100 C 20 -92 12 -87.5 3 -87.5 C -5 -87.5 -11 -92 -11 -100 Z", mat(C.red), { s: 4 });
      ink(t, "M -4 -95 Q 4 -92 14 -94 M 0 -91 Q 6 -90 11 -91", LINE * 0.7, "rgba(40,16,10,0.6)");
      fill(t, "M 16 -107 C 22 -107 23 -101 18.5 -99.5 Z", mat(C.skin), { s: 1, line: LINE * 0.8 });
      ink(t, "M -13 -109 L 21 -110", 3.4, "#4e3220");
      fill(t, ellipse(8, -108.5, 6.4, 6), mat(C.brass, 0.7), { s: 2 });
      fill(t, ellipse(8, -108.5, 4.4, 4.1), mat(C.lens, 1), { s: 2, line: LINE * 0.6, spec: [6.5, -110, 1.4, 1] });
      fill(t, ellipse(18.5, -107.5, 4.6, 5.6), mat(C.brass, 0.7), { s: 2 });
      fill(t, ellipse(18.5, -107.5, 2.9, 3.8), mat(C.lens, 1), { s: 1.5, line: LINE * 0.6, spec: [17.5, -109, 1, 0.8] });
      const hat = mat(s.medic ? 0xece6d8 : A, 0.55);
      fill(t, "M -24 -117 C -25 -122 -10 -123 3 -123 C 16 -123 30 -122 32 -118 C 32 -113 16 -112 3 -112 C -10 -112 -24 -113 -24 -117 Z", mat(shade(s.medic ? 0xece6d8 : A, -0.12), 0.4), { s: 3 });
      fill(t, "M -18 -118 C -20 -135 -9 -146 3 -146 C 16 -146 25 -136 23 -120 C 14 -116 -10 -115 -18 -118 Z", hat, { s: 8, spec: [-6, -137, 4.5, 2.6, -0.6] });
      ink(t, "M 3 -146 Q 7 -134 6 -120", LINE * 0.9);
      if (s.medic) {
        flat(t, rrect(-6, -134, 12, 4.4, 1), C.red);
        flat(t, rrect(-2.2, -138, 4.4, 12, 1), C.red);
      } else {
        fill(t, ellipse(21, -130, 4.4, 4.4), mat(C.brass, 0.7), { s: 1.5, line: LINE * 0.8 });
        fill(t, ellipse(21.5, -130, 2.6, 2.6), mat(0xfff3c0, 0.9), { s: 0, line: 0 });
        ink(t, "M -10 -134 Q -6 -132 -4 -128", LINE * 0.7, "rgba(40,16,10,0.5)");
      }
    } else {
      // full helmet with a glowing visor
      fill(t, "M -16 -98 C -22 -114 -14 -138 4 -138 C 20 -138 28 -122 26 -104 C 22 -94 -10 -92 -16 -98 Z", mat(0x6a706c, 0.6), { s: 8, spec: [-6, -128, 4, 2.5] });
      fill(t, "M 6 -118 C 14 -120 26 -118 27 -112 C 27 -106 16 -104 6 -106 Z", mat(shade(A, 0.4), 0.9), { s: 2, line: LINE });
      glowAt(t, 16, -112, 14, shade(A, 0.5), 0.6);
      fill(t, "M -16 -104 C -8 -110 6 -110 12 -104 L 10 -98 C 2 -102 -8 -102 -14 -98 Z", mat(A, 0.4), { s: 2 });
    }
  };
  head();

  // --- weapon and hands
  let muzzle: [number, number] = [64, -70];
  if (twoHanded) {
    ctx.save();
    ctx.translate(4, -58);
    ctx.rotate(-0.1);
    const L = s.long ? 54 : 36;
    fill(t, "M -26 -6 C -29 -2 -27 6 -20 6 L -6 3 L -6 -5 Z", mat(C.wood), { s: 3 });
    fill(t, rrect(-8, -9, 32, 13, 4), mat(C.gun, 0.6), { s: 4, spec: [0, -7, 5, 1.4, 0] });
    fill(t, rrect(22, -7, L, 6, 2.5), mat(C.gun, 0.6), { s: 2, spec: [26, -6, 6, 0.8, 0] });
    for (const x of [30, 30 + L * 0.4]) fill(t, rrect(x, -8.5, 4, 9, 1.2), mat(C.steel, 0.5), { s: 1.5, line: LINE * 0.7 });
    fill(t, rrect(20 + L, -9, 8, 10, 2), mat(C.gun, 0.6), { s: 2 });
    fill(t, ellipse(6, 6, 9, 8), mat(C.brass, 0.7), { s: 4, spec: [2, 2, 2.6, 1.6] });
    rivets(t, [[0, -3], [14, -3]], 1.2);
    if (s.long) fill(t, rrect(2, -17, 22, 6, 3), mat(C.gun, 0.6), { s: 2, spec: [5, -16, 4, 0.8, 0] });
    ctx.restore();
    const a = -0.1;
    const lx = 28 + L;
    muzzle = [4 + lx * Math.cos(a) - -4 * Math.sin(a), -58 + lx * Math.sin(a) + -4 * Math.cos(a)];
    fill(t, ellipse(32, -64, 6.6, 6), mat(C.glove), { s: 3 });
  } else if (s.ranged) {
    ctx.save();
    ctx.translate(14, -60);
    ctx.rotate(-0.25);
    fill(t, rrect(-3, -2, 7, 12, 2), mat(C.wood), { s: 2 });
    fill(t, rrect(-4, -8, 24, 8, 3), mat(C.gun, 0.6), { s: 3, spec: [2, -7, 5, 1, 0] });
    ctx.restore();
    muzzle = [14 + 22 * Math.cos(-0.25) - -4 * Math.sin(-0.25), -60 + 22 * Math.sin(-0.25) + -4 * Math.cos(-0.25)];
  } else {
    // shovel held up and ready
    fill(t, tube([[-6, -46], [16, -76], [34, -104]], [2.6, 2.6, 2.6]), mat(C.wood), { s: 1.5 });
    fill(t, "M 30 -108 C 34 -122 46 -128 52 -122 C 56 -114 50 -102 40 -98 Z", mat(C.steel, 0.8), { s: 4, spec: [40, -118, 3, 1.4] });
    muzzle = [46, -114];
  }
  // front arm + glove
  if (twoHanded) fill(t, tube([[10, -83], [17, -69], [9, -59]], [8.5, 7.5, 6]), suit, { s: 6 });
  else if (s.ranged) fill(t, tube([[10, -83], [18, -72], [16, -62]], [8.5, 7.5, 6]), suit, { s: 6 });
  else fill(t, tube([[10, -83], [18, -74], [14, -70]], [8.5, 7.5, 6]), suit, { s: 6 });
  if (s.armoured || !settler) fill(t, ellipse(12, -85, 11, 7), mat(A, 0.5), { s: 4, spec: [8, -88, 3, 1.4] });
  else fill(t, ellipse(11, -86, 9.5, 6), mat(A, 0.3), { s: 3, spec: [8, -89, 2.6, 1.2] });
  const hand: [number, number] = twoHanded ? [9, -58] : s.ranged ? [15, -61] : [14, -70];
  fill(t, ellipse(hand[0], hand[1], 7, 6.5), mat(C.glove), { s: 3 });
  ctx.restore();
  return muzzle;
};

/** Lumen Concord: haughty alien noble (fallback for custom units). */
const aristocrat: Painter = (t, s, f) => {
  const { ctx } = t;
  const A = s.color;
  const step = f === 1;
  const coat = mat(C.pearl, 0.15, 0.42);
  const coatB = mat(shade(C.pearl, -0.12), 0, 0.42);
  const navy = mat(C.navy, 0.3);
  const gold = mat(C.gold, 0.7);
  const glove = mat(0xf6f2ea);
  contact(t, 2, -2, 28, 8, 0.55);
  // cape: navy outside, faction-colour lining
  fill(t, `M -10 -100 C -24 -86 -32 -52 -38 ${step ? -14 : -10} C -28 -6 -16 -8 -8 -12 C -10 -44 -6 -76 0 -100 Z`, navy, { s: 7 });
  fill(t, `M -38 ${step ? -14 : -10} C -28 -6 -16 -8 -8 -12 C -16 -17 -28 -17 -36 ${step ? -19 : -16} Z`, mat(A, 0.3), { s: 2, line: LINE * 0.8 });
  // coat tails flaring behind the legs
  fill(t, "M -14 -56 C -22 -42 -30 -26 -32 -16 C -20 -16 -10 -24 -4 -34 Z", coatB, { s: 4 });
  // legs: slim navy trousers, pointed shoes
  ctx.save();
  if (step) ctx.translate(-5, -2);
  fill(t, "M -9 -52 C -10 -36 -9 -21 -8 -8 L 1 -8 C 1 -22 1 -37 2 -52 Z", mat(shade(C.navy, -0.12)));
  fill(t, "M -11 -9 C -11 -3 -8 0 -2 0 L 11 0 C 9 -4 4 -8 -1 -10 Z", mat(0x1e1f3a, 0.6), { s: 2 });
  ctx.restore();
  ctx.save();
  if (step) ctx.translate(6, -4);
  fill(t, "M 3 -52 C 4 -36 6 -21 7 -8 L 15 -8 C 15 -22 14 -37 13 -52 Z", navy);
  fill(t, "M 5 -9 C 5 -3 8 0 14 0 L 30 -1 C 27 -5 20 -9 14 -10 Z", mat(0x1e1f3a, 0.6), { s: 2, spec: [19, -4, 3, 1] });
  ctx.restore();
  // chest out, chin up
  ctx.save();
  ctx.translate(0, -50);
  ctx.rotate(-0.07);
  ctx.translate(0, 50);
  // back arm: elbow out, hand on hip
  if (!s.long) {
    fill(t, tube([[-10, -98], [-25, -80], [-14, -66]], [6.5, 5.5, 4.5]), coatB, { s: 4 });
    fill(t, ellipse(-13, -65, 5, 4.6), glove, { s: 2 });
  }
  // fitted coat body + front skirt panels
  fill(t, "M -16 -54 C -20 -42 -22 -32 -20 -26 C -10 -27 0 -31 6 -36 L 5 -52 Z", coat, { s: 5 });
  ink(t, "M -8 -50 Q -10 -40 -12 -30 M -2 -50 Q -2 -42 -3 -33", LINE * 0.7, "rgba(60,50,90,0.5)");
  fill(t, "M 5 -52 L 8 -36 C 12 -33 17 -35 19 -40 C 19 -45 18 -49 16 -52 Z", coat, { s: 3 });
  fill(t, "M -15 -102 C -21 -92 -19 -76 -13 -67 C -15 -61 -17 -56 -15 -51 C -3 -47 8 -47 16 -51 C 16 -58 14 -63 13 -67 C 18 -80 18 -94 12 -103 C 3 -108 -7 -107 -15 -102 Z", coat, { s: 8, spec: [-8, -96, 3, 6, -0.2] });
  // waistcoat opening, sash in the faction colour, gold buttons and belt
  fill(t, "M 3 -103 C 9 -94 12 -80 12 -68 L 15 -52 L 8 -51 C 8 -66 7 -88 3 -103 Z", navy, { s: 2, line: LINE * 0.8 });
  fill(t, "M -14 -99 L -8 -102 L 15 -60 L 9 -56 Z", mat(A, 0.45), { s: 3, line: LINE * 0.8 });
  for (const y of [-93, -84, -75]) fill(t, ellipse(9 + (y + 93) * 0.06, y, 1.7, 1.7), gold, { s: 0.6, line: LINE * 0.5 });
  ink(t, "M -15 -56 C -4 -52 8 -52 16 -55", 2, "#b89238");
  // epaulettes (crystal-studded when armoured)
  fill(t, ellipse(9, -101, 9.5, 4.8), gold, { s: 2.5, spec: [5.5, -103, 2.6, 0.9] });
  for (let i = 0; i < 4; i++) ink(t, `M ${3 + i * 4} -97 L ${2.5 + i * 4} -92`, 1.4, "#b89238");
  if (s.armoured) crystal(t, 9, -116, -101, 4.2, A, 1);
  // ruffled cravat
  fill(t, "M -3 -105 C 1 -101 7 -101 10 -105 C 11 -99 7 -94 3 -95 C -1 -96 -3 -100 -3 -105 Z", mat(shade(A, 0.35), 0.2), { s: 2, line: LINE * 0.8 });
  // high crystal collar
  crystal(t, -12, -124, -103, 3.6, A, -3);
  crystal(t, 15, -126, -104, 3.6, A, 3);
  // faceted gem head, chin up, a thin glowing slit for eyes, a crown of shards
  ctx.save();
  ctx.translate(3, -104);
  ctx.rotate(-0.14);
  const gm = gem(A);
  glowAt(t, 1, -18, 22, shade(A, 0.55), 0.4);
  for (const [x, top, w, lean] of [[-6, -49, 2.4, -2], [1, -54, 3, 0], [8, -48, 2.4, 2]] as const) crystal(t, x, top, -34, w, A, lean);
  const head = "M 1 -40 L 11 -34 L 14 -20 L 10 -6 L 1 -1 L -8 -6 L -11 -21 L -7 -34 Z";
  fill(t, head, mat(gm, 0.95, 0.24), { s: 5 });
  flat(t, "M 1 -40 L -7 -34 L -11 -21 L 0 -22 Z", rgba(0xffffff, 0.45));
  flat(t, "M 14 -20 L 10 -6 L 1 -1 L 2 -14 Z", rgba(shade(A, -0.4), 0.35));
  ink(t, "M 1 -40 L 0 -22 L -11 -21 M 0 -22 L 14 -20 M 0 -22 L 2 -14 L 1 -1 M 2 -14 L -8 -6", LINE * 0.55, "rgba(40,30,70,0.5)");
  ink(t, head, LINE * 0.9);
  fill(t, "M 3 -22 L 12.5 -23 L 12 -20 L 4 -19.5 Z", mat(0xffffff), { s: 0, line: LINE * 0.4 });
  glowAt(t, 8, -21, 8, 0xffffff, 0.85);
  flat(t, ellipse(-5, -31, 1.6, 3.2), "rgba(255,255,255,0.9)");
  if (s.caster) {
    ink(t, "M -10 -36 Q 1 -44 12 -36", 2.4, "#dcb55a");
    for (const x of [-6, 1, 8]) fill(t, ellipse(x, -40 + Math.abs(x - 1) * 0.3, 1.8, 1.8), mat(gem(C.gold), 0.8), { s: 0.6, line: LINE * 0.5 });
  }
  ctx.restore();
  // weapon + front arm
  let muzzle: [number, number] = [64, -114];
  if (s.caster) {
    fill(t, tube([[30, -4], [31, -80], [32, -142]], [2.4, 2.4, 2.4]), gold, { s: 1.5 });
    glowAt(t, 32, -150, 26, shade(A, 0.6), 0.9);
    fill(t, ellipse(32, -150, 8, 8), mat(gem(A), 1), { s: 3, spec: [29.5, -153, 2.4, 1.6] });
    fill(t, "M 24 -142 Q 32 -136 40 -142 L 38 -138 Q 32 -134 26 -138 Z", gold, { s: 1, line: LINE * 0.7 });
    fill(t, tube([[8, -98], [22, -84], [30, -78]], [6.5, 5.5, 4.5]), coat, { s: 4 });
    fill(t, ellipse(30, -78, 5, 4.6), glove, { s: 2 });
    muzzle = [32, -150];
  } else if (s.long) {
    fill(t, tube([[-8, -96], [6, -80], [32, -77]], [6.5, 5.5, 4.5]), coatB, { s: 4 });
    glowAt(t, 84, -80, 16, shade(A, 0.6), 0.9);
    fill(t, "M -14 -72 L 70 -82 L 86 -80 L 70 -77 L -14 -66 Z", mat(gem(A), 0.9, 0.2), { s: 3, spec: [10, -75, 10, 1, -0.1] });
    fill(t, rrect(-2, -76, 10, 9, 2), gold, { s: 2 });
    fill(t, rrect(40, -84, 6, 8, 2), gold, { s: 1.5 });
    fill(t, ellipse(33, -77, 5, 4.6), glove, { s: 2 });
    fill(t, tube([[8, -98], [16, -82], [6, -70]], [6.5, 5.5, 4.5]), coat, { s: 4 });
    fill(t, ellipse(6, -69, 5, 4.6), glove, { s: 2 });
    muzzle = [86, -80];
  } else if (s.melee) {
    fill(t, tube([[8, -98], [20, -84], [25, -73]], [6.5, 5.5, 4.5]), coat, { s: 4 });
    glowAt(t, 46, -94, 30, shade(A, 0.55), 0.35);
    fill(t, "M 24 -75 L 64 -118 L 68 -116 L 29 -70 Z", mat(gem(A), 0.95, 0.2), { s: 2, spec: [40, -94, 8, 0.8, -0.8] });
    fill(t, "M 17 -68 C 22 -70 28 -76 31 -80 L 34 -77 C 30 -72 24 -66 20 -64 Z", gold, { s: 1.5 });
    fill(t, ellipse(19, -64, 2.4, 2.4), gold, { s: 1 });
    fill(t, ellipse(25, -72, 5, 4.6), glove, { s: 2 });
    muzzle = [65, -116];
  } else {
    fill(t, tube([[8, -98], [22, -86], [30, -80]], [6.5, 5.5, 4.5]), coat, { s: 4 });
    glowAt(t, 36, -82, 14, shade(A, 0.6), 0.9);
    fill(t, ellipse(36, -82, 5, 5), mat(gem(A), 1), { s: 2, spec: [34.5, -83.5, 1.6, 1.1] });
    fill(t, ellipse(30, -80, 5, 4.6), glove, { s: 2 });
    muzzle = [38, -82];
  }
  ctx.restore();
  return muzzle;
};

/** The Munch: hungry toothy critter (spitters carry a glowing goo sac). */
const critter: Painter = (t, s, f) => {
  const { ctx } = t;
  const A = s.color;
  const H = mat(hide(A));
  const HB = mat(shade(hide(A), -0.15));
  const step = f === 1;
  contact(t, 2, -2, 36, 9, 0.55);
  // far legs + tail
  fill(t, tube([[-16, -16], [-20 + (step ? 5 : 0), -5], [-22 + (step ? 6 : 0), 0]], [6, 5, 4]), HB, { s: 3 });
  fill(t, tube([[10, -14], [14 - (step ? 5 : 0), -5], [17 - (step ? 6 : 0), 0]], [6, 5, 4]), HB, { s: 3 });
  fill(t, tube([[-28, -30], [-44, -38 + (step ? 4 : 0)], [-58, -30 + (step ? 4 : 0)]], [9, 5.5, 2]), H, { s: 4 });
  if (s.spitter) glowAt(t, -10, -62, 30, C.goo, 0.45);
  // spines
  if (s.look === "crystal") {
    for (const [x, y] of [[-22, -58], [-8, -66], [6, -68]] as const) crystal(t, x, y - 14, y + 2, 4.5, A, -3);
  } else if (!s.spitter) {
    for (const [x, y, h] of [[-25, -55, 14], [-12, -64, 16], [3, -67, 13]] as const) fill(t, `M ${x - 5} ${y + 2} Q ${x - 6} ${y - h * 0.6} ${x - 9} ${y - h} Q ${x + 1} ${y - h * 0.5} ${x + 6} ${y + 1} Z`, mat(C.bone), { s: 2, line: LINE * 0.8 });
  }
  // the body: almost all head
  fill(t, "M -32 -30 C -34 -52 -20 -68 0 -68 C 22 -68 39 -54 41 -36 C 42 -19 35 -7 19 -4 C 1 -2 -20 -6 -28 -14 C -32 -18 -32 -24 -32 -30 Z", H, { s: 8, spec: [-10, -58, 6, 3, -0.5] });
  fill(t, "M -24 -12 C -10 -4 12 -4 26 -9 C 18 -16 -10 -18 -24 -12 Z", mat(0xe9d6a8), { s: 2, line: LINE * 0.8 });
  for (const [x0, y0] of [[-24, -48], [-16, -58], [-6, -64]] as const) fill(t, `M ${x0} ${y0} Q ${x0 + 5} ${y0 + 8} ${x0 + 3} ${y0 + 16} L ${x0 + 7} ${y0 + 15} Q ${x0 + 9} ${y0 + 7} ${x0 + 4} ${y0 - 1} Z`, mat(A, 0.2), { s: 1.5, line: LINE * 0.6 });
  if (s.look === "cap") {
    fill(t, "M -18 -44 C -10 -40 -4 -40 0 -42 L 0 -36 C -6 -34 -12 -34 -18 -38 Z", mat(C.leather), { s: 2, line: LINE * 0.8 });
    rivets(t, [[-12, -38], [-5, -38]], 1.3);
  }
  let muzzle: [number, number] = [30, -34];
  if (s.spitter) {
    // glowing goo sac, bubbles, spout
    fill(t, "M -30 -58 C -34 -74 -20 -86 -6 -84 C 8 -82 12 -70 8 -60 C 4 -52 -22 -50 -30 -58 Z", mat(C.goo, 0.8, 0.22), { s: 6, spec: [-18, -76, 4, 2.4, -0.4], alpha: 0.95 });
    for (const [x, y, r] of [[-16, -66, 2.4], [-6, -72, 1.6], [-22, -62, 1.4]] as const) flat(t, ellipse(x, y, r, r), "rgba(255,255,230,0.9)");
    fill(t, tube([[22, -50], [36, -60], [48, -62]], [6, 5, 4.5]), H, { s: 3 });
    fill(t, ellipse(49, -62, 3.4, 4.6), mat(C.mouth), { s: 0, line: LINE });
    flat(t, ellipse(50, -55, 2, 3), C.goo);
    // a smaller toothy mouth
    fill(t, "M 14 -34 C 20 -42 34 -42 40 -34 C 40 -24 32 -18 24 -18 C 18 -18 14 -24 14 -34 Z", mat(C.gum), { s: 2 });
    fill(t, "M 17 -33 C 22 -38 32 -38 37 -33 C 37 -26 30 -21 25 -21 C 20 -21 17 -26 17 -33 Z", mat(C.mouth), { s: 0, line: 0 });
    fill(t, teethRow(17, -34, 27, -40, 37, -34, 4, 5, 1), mat(C.bone), { s: 1, line: LINE * 0.6 });
    muzzle = [50, -62];
  } else {
    // the maw: wide open, ragged teeth top and bottom, tongue
    fill(t, "M 6 -40 C 14 -56 36 -58 44 -42 C 47 -28 40 -13 26 -11 C 15 -11 6 -22 6 -40 Z", mat(C.gum), { s: 3 });
    fill(t, "M 9 -39 C 16 -52 34 -53 41 -41 C 43 -29 37 -16 26 -14.5 C 17 -14.5 9 -24 9 -39 Z", mat(C.mouth), { s: 0, line: 0 });
    fill(t, ellipse(25, -21, 9, 4), mat(C.tongue), { s: 2, line: LINE * 0.7 });
    fill(t, teethRow(9, -40, 26, -55, 42, -41, 6, 9, 1), mat(C.bone), { s: 1.5, line: LINE * 0.6 });
    fill(t, teethRow(11, -26, 26, -10, 41, -30, 5, 7, -1), mat(C.bone), { s: 1.5, line: LINE * 0.6 });
    ink(t, "M 30 -14 Q 31 -8 30 -4", LINE, rgba(C.goo, 0.95));
    flat(t, ellipse(30, -3.5, 1.8, 2.2), C.goo);
  }
  eye(t, 12, -57, 5.5, 4.8, 1);
  eye(t, 27, -58, 3.6, 3.4, 1);
  // near legs with claws
  fill(t, tube([[-6, -12], [-8 - (step ? 5 : 0), -4], [-6 - (step ? 6 : 0), 0]], [7, 6, 4.5]), H, { s: 3 });
  fill(t, tube([[20, -12], [24 + (step ? 5 : 0), -4], [28 + (step ? 6 : 0), 0]], [7, 6, 4.5]), H, { s: 3 });
  for (const [x, o] of [[-6 - (step ? 6 : 0), 0], [28 + (step ? 6 : 0), 0]] as const) {
    fill(t, `M ${x + 2} ${-3 + o} L ${x + 8} ${-1} L ${x + 2} ${0} Z M ${x - 2} ${-3} L ${x + 3} ${1} L ${x - 3} ${0} Z`, mat(C.bone), { s: 0, line: LINE * 0.6 });
  }
  void ctx;
  return muzzle;
};

/** The Munch: Big Mama, a mountain of hungry mouth. */
const brute: Painter = (t, s, f) => {
  const A = s.color;
  const H = mat(hide(A));
  const HB = mat(shade(hide(A), -0.15));
  const step = f === 1;
  contact(t, 0, -4, 140, 22, 0.55);
  fill(t, tube([[-96, -40], [-104, -16 - (step ? 6 : 0)], [-100, 0 - (step ? 6 : 0)]], [22, 20, 16]), HB, { s: 8 });
  fill(t, tube([[70, -40], [78, -16], [84, 0]], [22, 20, 16]), HB, { s: 8 });
  // spines
  for (const [x, y, h] of [[-112, -112, 40], [-92, -148, 46], [-58, -172, 44], [-20, -184, 36]] as const) {
    if (s.look === "crystal") crystal(t, x, y - h, y + 10, 12, A, -8);
    else fill(t, `M ${x - 14} ${y + 6} Q ${x - 14} ${y - h * 0.6} ${x - 22} ${y - h} Q ${x + 2} ${y - h * 0.5} ${x + 14} ${y + 4} Z`, mat(C.bone), { s: 5 });
  }
  fill(t, "M -122 -62 C -132 -132 -72 -186 10 -186 C 92 -186 142 -134 140 -72 C 138 -22 102 -6 40 -4 C -30 -2 -102 -8 -120 -32 Z", H, { s: 22, spec: [-70, -150, 16, 8, -0.5] });
  for (const [x0, y0] of [[-104, -100], [-90, -126], [-70, -146]] as const) fill(t, `M ${x0} ${y0} Q ${x0 + 14} ${y0 + 20} ${x0 + 8} ${y0 + 46} L ${x0 + 18} ${y0 + 44} Q ${x0 + 24} ${y0 + 18} ${x0 + 12} ${y0 - 4} Z`, mat(A, 0.2), { s: 3, line: LINE });
  fill(t, "M -96 -18 C -60 -6 0 -4 40 -8 C 20 -22 -60 -26 -96 -18 Z", mat(0xe9d6a8), { s: 4 });
  for (const [x, y, r] of [[-60, -110, 4], [-82, -70, 5], [-40, -150, 3.5], [-100, -88, 3]] as const) fill(t, ellipse(x, y, r, r * 0.8), mat(shade(hide(A), -0.25)), { s: 1.5, line: LINE * 0.7 });
  if (s.look === "cap") {
    fill(t, rrect(-96, -116, 44, 30, 6), mat(C.steel, 0.6), { s: 5 });
    rivets(t, [[-90, -110], [-58, -110], [-90, -92], [-58, -92]], 2.2);
  }
  // the maw
  fill(t, "M -8 -100 C 8 -152 108 -168 142 -112 C 152 -70 122 -28 70 -26 C 18 -26 -12 -58 -8 -100 Z", mat(C.gum), { s: 6 });
  fill(t, "M 0 -98 C 16 -142 104 -156 134 -110 C 142 -74 116 -36 70 -34 C 24 -34 -4 -62 0 -98 Z", mat(C.mouth), { s: 0, line: 0 });
  glowAt(t, 70, -92, 40, 0x7a1020, 0.3);
  fill(t, "M 28 -48 C 50 -62 92 -62 112 -44 C 120 -28 102 -12 86 -22 C 70 -30 50 -32 28 -48 Z", mat(C.tongue), { s: 5 });
  fill(t, teethRow(0, -100, 64, -168, 136, -110, 9, 26, 1), mat(C.bone, 0.2), { s: 3, line: LINE * 0.8 });
  fill(t, teethRow(8, -68, 66, -18, 126, -64, 8, 20, -1), mat(C.bone, 0.2), { s: 3, line: LINE * 0.8 });
  for (const [x, l] of [[30, 30], [72, 40], [104, 24]] as const) {
    ink(t, `M ${x} -120 Q ${x + 3} ${-120 + l * 0.6} ${x + 1} ${-120 + l}`, 2.6, rgba(C.goo, 0.9));
    flat(t, ellipse(x + 1, -118 + l, 3.4, 4.2), C.goo);
  }
  eye(t, -34, -142, 12, 10.5, 1);
  eye(t, -6, -160, 9, 8, 1);
  eye(t, -58, -120, 7, 6.2, 1);
  // front legs with claws
  fill(t, tube([[-66, -30], [-72, -12 - (step ? 0 : 0)], [-70, 0]], [21, 19, 16]), H, { s: 8 });
  fill(t, tube([[100, -30], [108, -12 - (step ? 6 : 0)], [112, 0 - (step ? 6 : 0)]], [21, 19, 16]), H, { s: 8 });
  for (const x of [-82, -70, -58, 100, 112, 124]) fill(t, `M ${x - 4} -4 Q ${x + 2} -2 ${x + 6} 4 Q ${x} 2 ${x - 5} 1 Z`, mat(C.bone), { s: 0, line: LINE * 0.7 });
  return [80, -90];
};

/** Dustline tractor-cannon walker (generic mech walker for other looks). */
const walker: Painter = (t, s, f) => {
  const A = s.color;
  const body = mat(s.look === "cap" ? 0x5f7a6e : s.look === "crystal" ? C.pearl : 0x63686a, 0.3);
  const accent = mat(A, 0.4);
  const metal = mat(C.gun, 0.6);
  const step = f === 1;
  contact(t, 0, -4, 110, 18, 0.55);
  const leg = (hx: number, kx: number, fx: number, lift: number, m: Mat) => {
    fill(t, tube([[hx, -104], [kx, -58 - lift]], [13, 11]), m, { s: 5 });
    fill(t, tube([[kx, -58 - lift], [fx, -14 - lift]], [11, 9]), m, { s: 5 });
    fill(t, ellipse(kx, -58 - lift, 11, 11), mat(C.steel, 0.6), { s: 4, spec: [kx - 4, -62 - lift, 3, 2] });
    fill(t, `M ${fx - 28} ${-2 - lift} C ${fx - 30} ${-14 - lift} ${fx - 20} ${-20 - lift} ${fx} ${-20 - lift} C ${fx + 22} ${-20 - lift} ${fx + 30} ${-12 - lift} ${fx + 28} ${-2 - lift} Z`, mat(C.gun, 0.5), { s: 4 });
  };
  leg(-40, -64, -50, step ? 14 : 0, mat(shade(C.gun, -0.2), 0.4));
  // rear tractor tyre with hub in the faction colour
  fill(t, ellipse(-64, -124, 46, 46), mat(C.rubber, 0.2), { s: 12 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ink(t, `M ${-64 + Math.cos(a) * 36} ${-124 + Math.sin(a) * 36} L ${-64 + Math.cos(a) * 46} ${-124 + Math.sin(a) * 46}`, 3.2, "#57504c");
  }
  fill(t, ellipse(-64, -124, 20, 20), accent, { s: 6, spec: [-70, -130, 4, 3] });
  rivets(t, [[-64, -124]], 4);
  // chassis
  fill(t, rrect(-82, -154, 136, 64, 14), body, { s: 14, spec: [-60, -148, 18, 3, 0] });
  hazardBand(t, rrect(-80, -104, 132, 10, 3), -80, -104, 132, 10);
  fill(t, rrect(-36, -142, 30, 24, 3), mat(mix(A, C.steel, 0.5)), { s: 3, line: LINE * 0.8 });
  stitchRect(t, -36, -142, 30, 24);
  rivets(t, [[-74, -146], [-50, -146], [24, -146], [44, -146]], 2.4);
  // engine hood in the faction colour, grille, headlamp
  fill(t, "M 40 -150 C 72 -152 94 -144 98 -122 L 98 -96 L 40 -94 Z", accent, { s: 10, spec: [52, -144, 10, 2, 0] });
  if (s.look === "teeth") fill(t, teethRow(48, -98, 72, -100, 96, -98, 5, 12, -1), mat(C.bone), { s: 2 });
  else for (let i = 0; i < 4; i++) ink(t, `M ${60 + i * 9} -132 L ${60 + i * 9} -100`, 2.2);
  fill(t, ellipse(96, -124, 6, 6), mat(C.brass, 0.7), { s: 2 });
  fill(t, ellipse(96.5, -124, 3.6, 3.6), mat(0xfff3c0, 0.9), { s: 0, line: 0 });
  // exhaust + smoke
  fill(t, rrect(62, -200, 11, 54, 4), mat(C.steel, 0.6), { s: 3, spec: [64, -196, 1.5, 10, 0] });
  smoke(t, 66, -212 - (step ? 4 : 0), 11);
  // cab with driver
  fill(t, rrect(-60, -214, 74, 66, 12), mat(shade(body.base, 0.1), 0.3), { s: 10 });
  fill(t, rrect(-50, -206, 54, 34, 7), mat(C.lens, 0.9, 0.2), { s: 5, spec: [-42, -200, 6, 2.5, 0] });
  fill(t, ellipse(-20, -186, 11, 11), mat(C.skin), { s: 4, line: LINE * 0.8 });
  fill(t, "M -31 -190 C -32 -202 -8 -202 -9 -190 Z", mat(C.leather), { s: 2, line: LINE * 0.8 });
  for (const x of [-25, -14]) fill(t, ellipse(x, -186, 3.6, 3.4), mat(C.lens, 1), { s: 0, line: LINE * 0.6 });
  // cannon
  const glowy = s.look === "crystal";
  fill(t, ellipse(-8, -222, 18, 13), mat(C.steel, 0.6), { s: 4 });
  fill(t, rrect(-12, -236, 134, 24, 9), glowy ? mat(gem(A), 0.9) : metal, { s: 7, spec: [10, -232, 30, 2, 0] });
  for (const x of [30, 72]) fill(t, rrect(x, -239, 8, 30, 2), mat(C.steel, 0.5), { s: 2 });
  fill(t, rrect(116, -241, 22, 34, 6), mat(shade(C.gun, -0.15), 0.5), { s: 4 });
  if (glowy) glowAt(t, 136, -224, 30, shade(A, 0.6), 0.8);
  leg(30, 52, 42, 0, metal);
  return [140, -224];
};

/** Dustline crop-duster biplane (generic flyer for other looks). */
const plane: Painter = (t, s, f) => {
  const A = s.color;
  const cream = mat(0xe2d3a8, 0.3);
  const accent = mat(A, 0.4);
  // lower wing
  fill(t, "M -72 -30 L 82 -30 C 92 -30 94 -16 84 -14 L -74 -14 C -84 -14 -82 -30 -72 -30 Z", mat(shade(0xe2d3a8, -0.1), 0.3), { s: 4 });
  fill(t, "M 64 -30 L 82 -30 C 92 -30 94 -16 84 -14 L 64 -14 Z", accent, { s: 2, line: LINE * 0.8 });
  ink(t, "M -60 -8 L 70 -8", 2.4, "#4c5158");
  for (const x of [-40, 0, 40]) flat(t, ellipse(x, -7, 2.4, 2.4), "#4c5158");
  // fuselage
  fill(t, "M -102 -52 C -72 -62 30 -66 70 -60 C 86 -56 93 -46 91 -38 C 87 -28 60 -26 20 -26 C -40 -28 -82 -36 -102 -46 Z", cream, { s: 8, spec: [-20, -58, 24, 2.4, 0] });
  fill(t, "M -60 -48 C -20 -52 40 -54 88 -48 L 90 -40 C 40 -44 -20 -42 -60 -40 Z", accent, { s: 2, line: LINE * 0.8 });
  fill(t, "M -102 -50 L -98 -92 C -94 -95 -85 -95 -82 -88 L -74 -54 Z", accent, { s: 4 });
  fill(t, rrect(-36, -46, 20, 12, 2), mat(mix(A, 0x5c7389, 0.6)), { s: 2, line: LINE * 0.7 });
  stitchRect(t, -36, -46, 20, 12);
  // pilot
  fill(t, ellipse(-6, -68, 11, 10.5), mat(C.skin), { s: 4 });
  fill(t, "M -17 -70 C -18 -82 6 -82 5 -70 Z", mat(C.leather), { s: 2, line: LINE * 0.8 });
  for (const x of [-1, 7]) fill(t, ellipse(x, -70, 3.8, 3.6), mat(C.lens, 1), { s: 0, line: LINE * 0.6 });
  fill(t, `M -14 -60 C -30 -62 -44 ${f ? -54 : -60} -56 ${f ? -52 : -58} C -46 -52 -30 -56 -14 -56 Z`, mat(C.red), { s: 2, line: LINE * 0.7 });
  // upper wing, struts, guns
  for (const x of [-62, 60]) ink(t, `M ${x} -30 L ${x + 4} -78`, 3, "#7a4f2e");
  fill(t, "M -86 -92 L 94 -92 C 103 -92 103 -76 94 -76 L -86 -76 C -95 -76 -95 -92 -86 -92 Z", cream, { s: 5, spec: [-50, -90, 30, 1.6, 0] });
  fill(t, "M 74 -92 L 94 -92 C 103 -92 103 -76 94 -76 L 74 -76 Z", accent, { s: 2, line: LINE * 0.8 });
  fill(t, "M -86 -92 L -70 -92 L -70 -76 L -86 -76 C -95 -76 -95 -92 -86 -92 Z", accent, { s: 2, line: LINE * 0.8 });
  rivets(t, [[-40, -84], [0, -84], [40, -84]], 1.6);
  fill(t, rrect(56, -100, 40, 6, 2.5), mat(C.gun, 0.6), { s: 2 });
  // nose + propeller
  fill(t, ellipse(90, -44, 10, 16), mat(C.steel, 0.7), { s: 3, spec: [87, -52, 2, 4] });
  if (f === 1) {
    fill(t, "M 96 -48 L 102 -88 L 107 -86 L 100 -46 Z M 96 -40 L 103 0 L 98 2 L 94 -40 Z", mat(0x5c3a1c, 0.4), { s: 1, line: LINE * 0.8 });
  } else {
    flat(t, ellipse(99, -44, 6, 42), "rgba(250,245,235,0.5)");
    ink(t, ellipse(99, -44, 6, 42), LINE * 0.6, "rgba(28,21,18,0.45)");
  }
  return [98, -97];
};

/** Lumen Concord floating skiff. */
const skiff: Painter = (t, s, f) => {
  const A = s.color;
  glowAt(t, 0, -10, f ? 90 : 76, shade(A, 0.55), 0.4);
  crystal(t, 4, -182, -70, 32, A, 10);
  // aristocrat pilot at the stern
  fill(t, "M -90 -70 C -96 -96 -90 -110 -78 -112 C -66 -112 -62 -96 -66 -70 Z", mat(C.pearl, 0.2), { s: 5 });
  fill(t, "M -86 -104 L -70 -106 L -60 -80 L -68 -78 Z", mat(A, 0.4), { s: 2, line: LINE * 0.7 });
  const g = gem(A);
  fill(t, "M -78 -138 C -70 -134 -66 -126 -67 -118 C -69 -110 -74 -108 -79 -108 C -86 -109 -90 -114 -90 -121 C -90 -130 -85 -136 -78 -138 Z", mat(g, 0.95, 0.2), { s: 4, spec: [-84, -128, 2, 3.4] });
  fill(t, "M -78 -121 L -69 -122 L -69.5 -119.5 L -77 -119 Z", mat(0xffffff), { s: 0, line: LINE * 0.5 });
  // hull
  fill(t, "M -120 -60 C -60 -70 50 -72 108 -66 C 124 -64 136 -76 140 -86 C 146 -70 132 -36 104 -28 C 40 -16 -60 -18 -110 -30 C -124 -36 -128 -52 -120 -60 Z", mat(C.navy, 0.4), { s: 14, spec: [-40, -64, 40, 2.4, 0] });
  fill(t, "M -116 -58 C -60 -66 50 -68 106 -62 C 120 -60 132 -70 138 -80", mat(C.navy), { s: 0, line: 0 });
  ink(t, "M -116 -56 C -60 -64 50 -66 106 -60 C 120 -58 132 -68 138 -80", 2.8, "#dcb55a");
  for (const x of [-70, -20, 30, 80]) {
    glowAt(t, x, -42, 10, shade(A, 0.6), 0.9);
    fill(t, ellipse(x, -42, 4, 4), mat(g, 1), { s: 1, line: LINE * 0.6 });
  }
  // prow cannon
  glowAt(t, 146, -88, 18, shade(A, 0.6), 0.9);
  fill(t, "M 124 -84 L 146 -90 L 128 -76 Z", mat(g, 0.95), { s: 2 });
  return [146, -89];
};

/** The Munch: buzzing toothy flyers. */
const bug: Painter = (t, s, f) => {
  const A = s.color;
  const H = mat(hide(A), 0.2);
  const wings = (cx: number, cy: number, k: number) => {
    const up = f === 0;
    for (const [dx, rot] of (up ? [[-4, -0.9], [6, -1.25]] : [[-10, -0.25], [0, -0.05]]) as [number, number][]) {
      t.ctx.save();
      t.ctx.translate(cx + dx * k, cy - 10 * k);
      t.ctx.rotate(rot as number);
      fill(t, ellipse(-14 * k, 0, 18 * k, 7 * k), mat(0xe8f2f0, 0.6), { s: 2, alpha: 0.7, line: LINE * 0.7 });
      ink(t, `M ${-28 * k} 0 L ${-2 * k} 0 M ${-20 * k} ${-3 * k} L ${-8 * k} ${2 * k}`, LINE * 0.5, "rgba(28,21,18,0.4)");
      t.ctx.restore();
    }
  };
  const one = (cx: number, cy: number, k: number, main: boolean) => {
    wings(cx, cy, k);
    fill(t, `M ${cx - 22 * k} ${cy + 2 * k} Q ${cx - 36 * k} ${cy + 8 * k} ${cx - 40 * k} ${cy + 14 * k} Q ${cx - 30 * k} ${cy + 10 * k} ${cx - 20 * k} ${cy + 8 * k} Z`, mat(C.bone), { s: 1, line: LINE * 0.7 });
    const body = `M ${cx - 26 * k} ${cy} C ${cx - 26 * k} ${cy - 14 * k} ${cx - 8 * k} ${cy - 18 * k} ${cx + 4 * k} ${cy - 14 * k} C ${cx + 14 * k} ${cy - 10 * k} ${cx + 14 * k} ${cy + 8 * k} ${cx + 2 * k} ${cy + 12 * k} C ${cx - 10 * k} ${cy + 15 * k} ${cx - 26 * k} ${cy + 12 * k} ${cx - 26 * k} ${cy} Z`;
    fill(t, body, H, { s: 5 * k, spec: [cx - 14 * k, cy - 10 * k, 4 * k, 2 * k] });
    t.ctx.save();
    t.ctx.clip(new Path2D(body));
    for (let i = 0; i < 3; i++) flat(t, `M ${cx - 20 * k + i * 9 * k} ${cy - 20 * k} l ${4 * k} 0 l ${-3 * k} ${40 * k} l ${-4 * k} 0 Z`, rgba(A, 0.9));
    t.ctx.restore();
    ink(t, body, LINE);
    fill(t, ellipse(cx + 14 * k, cy - 2 * k, 11 * k, 10 * k), mat(shade(hide(A), -0.1), 0.2), { s: 4 * k });
    fill(t, ellipse(cx + 17 * k, cy - 7 * k, 6 * k, 5.4 * k), mat(0xd8452a, 0.9), { s: 2 * k, spec: [cx + 15 * k, cy - 9 * k, 1.6 * k, 1.1 * k] });
    if (main) {
      fill(t, `M ${cx + 18 * k} ${cy + 2 * k} C ${cx + 24 * k} ${cy - 2 * k} ${cx + 28 * k} ${cy + 4 * k} ${cx + 24 * k} ${cy + 8 * k} C ${cx + 20 * k} ${cy + 9 * k} ${cx + 17 * k} ${cy + 6 * k} ${cx + 18 * k} ${cy + 2 * k} Z`, mat(C.mouth), { s: 0 });
      fill(t, teethRow(cx + 18 * k, cy + 2 * k, cx + 23 * k, cy - 1 * k, cx + 27 * k, cy + 4 * k, 3, 3 * k, 1), mat(C.bone), { s: 0, line: LINE * 0.5 });
    }
  };
  contact(t, 0, -2, 30, 7, 0.3);
  one(-34, -84, 0.5, false);
  one(32, -96, 0.45, false);
  one(2, -56, 1, true);
  return [30, -54];
};

const sandbags = (t: Toon, front: boolean, rx: number, ry: number, n: number, cy = -10) => {
  const a0 = front ? 0.08 : 1.05;
  const a1 = front ? 0.92 : 1.95;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (a0 + ((a1 - a0) * (i + 0.5)) / n);
    const x = Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    fill(t, `M ${x - 16} ${y} C ${x - 16} ${y - 10} ${x + 16} ${y - 10} ${x + 16} ${y} C ${x + 16} ${y + 9} ${x - 16} ${y + 9} ${x - 16} ${y} Z`, mat(0xb89a68), { s: 4 });
    ink(t, `M ${x - 6} ${y - 6} L ${x - 4} ${y + 6}`, LINE * 0.6, "rgba(40,30,22,0.5)");
  }
};

const turret: Painter = (t, s, f) => {
  const A = s.color;
  contact(t, 0, -6, 80, 18, 0.5);
  sandbags(t, false, 74, 34, 6);
  ink(t, "M -30 -108 L -44 -166", 2.4);
  fill(t, `M -44 -166 C -60 -162 -70 ${f ? -150 : -156} -76 ${f ? -146 : -152} C -66 -144 -54 -150 -43 -150 Z`, mat(C.red), { s: 2, line: LINE * 0.8 });
  fill(t, rrect(-36, -78, 72, 66, 10), mat(C.gun, 0.4), { s: 8 });
  fill(t, rrect(-46, -124, 82, 52, 10), mat(0x5f7a6e, 0.3), { s: 10 });
  fill(t, "M -40 -122 L 30 -124 L 34 -96 L -40 -94 Z", mat(A, 0.5), { s: 5, spec: [-24, -118, 10, 2, 0] });
  rivets(t, [[-38, -116], [26, -118], [-38, -82], [26, -82]], 2.4);
  for (const y of [-112, -98]) fill(t, rrect(30, y - 4, 78, 9, 3.5), mat(C.gun, 0.6), { s: 2, spec: [40, y - 3, 12, 1, 0] });
  fill(t, rrect(28, -122, 18, 34, 4), mat(C.steel, 0.6), { s: 3 });
  for (let i = 0; i < 6; i++) fill(t, rrect(-10 + i * 7, -72 + i * 3, 5, 10, 1.5), mat(C.brass, 0.7), { s: 1, line: LINE * 0.6 });
  sandbags(t, true, 78, 36, 5);
  return [110, -104];
};

const pylon: Painter = (t, s) => {
  const A = s.color;
  contact(t, 0, -6, 70, 16, 0.5);
  fill(t, "M -66 -6 L -60 -40 L 60 -40 L 66 -6 Z", mat(shade(C.stone, -0.1)), { s: 6 });
  fill(t, "M -44 -40 L -40 -66 L 40 -66 L 44 -40 Z", mat(C.stone), { s: 5 });
  for (const x of [-34, 0, 34]) {
    glowAt(t, x, -22, 10, shade(A, 0.6), 0.9);
    ink(t, `M ${x - 5} -27 L ${x} -17 L ${x + 5} -27`, 2.2, rgba(shade(A, 0.6), 1));
  }
  crystal(t, 0, -214, -60, 24, A, 3);
  crystal(t, 0, -252, -226, 8, A);
  glowAt(t, 0, -150, 40, shade(A, 0.55), 0.5);
  return [4, -200];
};

const pod: Painter = (t, s, f) => {
  const A = s.color;
  const H = mat(hide(A));
  contact(t, 0, -6, 72, 16, 0.5);
  for (const [x, y] of [[-70, 2], [-44, 6], [40, 6], [70, 2]] as const) fill(t, tube([[x * 0.4, -30], [x * 0.8, -10], [x, y]], [8, 6, 3]), mat(shade(hide(A), -0.2)), { s: 3 });
  fill(t, "M -62 -60 C -66 -110 -30 -132 4 -132 C 40 -132 66 -108 62 -64 C 58 -20 30 -8 0 -8 C -30 -8 -58 -22 -62 -60 Z", H, { s: 14, spec: [-28, -112, 8, 5, -0.5] });
  for (const x of [-40, -16, 12, 36]) ink(t, `M ${x} -14 Q ${x + 8} -60 ${x * 0.6} -118`, 2, rgba(A, 0.9));
  glowAt(t, 4, -126, 40, C.goo, 0.45);
  fill(t, ellipse(4, -124, 30, 11), mat(C.gum), { s: 3 });
  fill(t, ellipse(4, -123, 24, 7.5), mat(C.mouth), { s: 0, line: 0 });
  fill(t, teethRow(-20, -124, 4, -136, 28, -124, 6, 6, 1), mat(C.bone), { s: 1, line: LINE * 0.6 });
  for (const [x, y, r] of [[10, -150, 6], [-12, -166, 4.5], [22, -172, 4]] as const) fill(t, ellipse(x + (f ? 4 : 0), y - (f ? 6 : 0), r, r), mat(C.goo, 0.6), { s: r * 0.4, line: LINE * 0.7, alpha: 0.9 });
  eye(t, -30, -84, 6, 5.4, 1);
  eye(t, 34, -80, 5, 4.6, -1);
  return [4, -128];
};

const beacon: Painter = (t, s) => {
  const A = s.color;
  contact(t, 0, -6, 64, 15, 0.5);
  ink(t, "M 24 -104 L 30 -170", 2.6);
  glowAt(t, 30, -172, 24, 0xffd24a, 0.9);
  fill(t, ellipse(30, -172, 6, 6), mat(0xffd24a, 0.8), { s: 2 });
  fill(t, rrect(-54, -106, 108, 96, 10), mat(0x63686a, 0.3), { s: 12 });
  fill(t, rrect(-48, -100, 96, 26, 6), mat(A, 0.5), { s: 4 });
  hazardBand(t, rrect(-52, -34, 104, 12, 3), -52, -34, 104, 12);
  rivets(t, [[-44, -60], [44, -60], [-44, -44], [44, -44]], 2.6);
  fill(t, rrect(-20, -66, 40, 24, 4), mat(C.lens, 0.9, 0.2), { s: 3, spec: [-14, -62, 5, 2, 0] });
  return [30, -172];
};

const junk: Painter = (t, s) => {
  const A = s.color;
  contact(t, 0, -4, 120, 20, 0.5);
  fill(t, "M -112 -10 C -100 -60 -40 -96 20 -98 C 70 -96 108 -60 114 -10 Z", mat(0x9a5a34, 0.2), { s: 12 });
  for (let i = 0; i < 7; i++) ink(t, `M ${-92 + i * 30} -12 L ${-74 + i * 28} ${-64 - Math.sin(i) * 10}`, LINE, "rgba(28,21,18,0.4)");
  fill(t, "M -36 -6 L -22 -86 L 44 -82 L 50 -6 Z", mat(A, 0.4), { s: 8, spec: [-12, -78, 8, 2, 0] });
  fill(t, "M -18 -76 L 38 -73 L 36 -50 L -13 -51 Z", mat(C.lens, 0.9, 0.2), { s: 4, spec: [-6, -70, 6, 1.6, 0] });
  fill(t, rrect(26, -42, 14, 5, 2), mat(C.steel, 0.6), { s: 1 });
  fill(t, ellipse(-72, -30, 32, 25), mat(C.rubber, 0.2), { s: 8 });
  fill(t, ellipse(-72, -30, 13, 10), mat(C.dirt), { s: 3 });
  fill(t, "M 46 -4 L 60 -100 L 76 -98 L 62 -2 Z", mat(C.wood), { s: 4 });
  fill(t, "M 66 -10 L 116 -64 L 124 -54 L 76 -4 Z", mat(C.wood), { s: 4 });
  return [20, -90];
};

const hole: Painter = (t, s, f) => {
  const A = s.color;
  fill(t, "M -112 -8 C -108 -46 -60 -70 0 -70 C 60 -70 110 -46 114 -8 C 100 18 -100 18 -112 -8 Z", mat(C.sand), { s: 10, spec: [-50, -56, 16, 3, 0] });
  fill(t, ellipse(0, -18, 58, 24), mat(0x1a0d0a), { s: 0 });
  fill(t, teethRow(-56, -20, 0, -46, 56, -20, 9, 10, 1), mat(C.bone), { s: 1, line: LINE * 0.6 });
  fill(t, teethRow(-50, -10, 0, 10, 50, -10, 7, 8, -1), mat(C.bone), { s: 1, line: LINE * 0.6 });
  eye(t, -14 + (f ? 3 : 0), -20, 5, 4.4, 1);
  eye(t, 14 + (f ? 3 : 0), -20, 5.4, 4.8, -1);
  for (const [x, h] of [[-48, 30], [48, 26]] as const) fill(t, `M ${x - 7} -30 Q ${x - 4} ${-30 - h} ${x + (f ? 6 : 2)} ${-36 - h} Q ${x + 2} ${-28 - h * 0.5} ${x + 7} -30 Z`, mat(hide(A)), { s: 3, line: LINE * 0.8 });
  return [0, -24];
};

const ward: Painter = (t, s, f) => {
  const A = s.color;
  const lite = shade(A, 0.6);
  t.ctx.save();
  t.ctx.globalAlpha = 0.6;
  ink(t, "M -80 -10 A 80 80 0 0 1 80 -10", 2.4, rgba(lite, 1));
  for (let i = 1; i < 6; i++) {
    const a = Math.PI * (1 + i / 6);
    ink(t, `M 0 -10 L ${Math.cos(a) * 80} ${-10 + Math.sin(a) * 80}`, 1, rgba(lite, 0.7));
  }
  t.ctx.restore();
  for (const r of [34, 48]) ink(t, ellipse(0, -8, r, r * 0.3), 1.8, rgba(lite, 0.7));
  crystal(t, 0, -150 - (f ? 4 : 0), -58 - (f ? 4 : 0), 26, A);
  glowAt(t, 0, -100, 50, lite, 0.45);
  return [0, -100];
};

/** Dustline Tumbleweed Rider: a settler hunched over a rickety, wire-bound dirt bike (a plain rider for other looks). */
const bike: Painter = (t, s, f) => {
  const { ctx } = t;
  const A = s.color;
  const go = f === 1;
  const settler = s.look === "cap";
  const suitC = settler ? C.denim : s.look === "teeth" ? hide(A) : 0x5a6058;
  const suit = mat(suitC);
  const suitB = mat(shade(suitC, -0.14));
  const metal = mat(C.gun, 0.5);
  const steel = mat(C.steel, 0.6);
  const rust = mat(C.red, 0.3);
  const wire = "#cfc7b2";
  contact(t, 4, -2, 96, 13, 0.5);
  if (go) for (let i = 0; i < 3; i++) fill(t, ellipse(-92 - i * 12, -12 - i * 7, 11 - i * 2.5, 8 - i * 1.8), mat(C.sand), { s: 3, alpha: 0.85 - i * 0.2, line: LINE * 0.7 });
  // the whole bike pops a little wheelie when it moves
  const pivot: Pt = [-60, -28];
  const tilt = go ? -0.07 : 0;
  ctx.save();
  ctx.translate(pivot[0], pivot[1]);
  ctx.rotate(tilt);
  ctx.translate(-pivot[0], -pivot[1]);

  const wheel = (cx: number, cy: number, r: number, cap: boolean) => {
    const spin = go ? Math.PI / 9 : 0;
    fill(t, ellipse(cx, cy, r, r), mat(C.rubber, 0.2), { s: r * 0.22 });
    for (let i = 0; i < 16; i++) {
      const a = spin + (i / 16) * Math.PI * 2;
      ink(t, `M ${cx + Math.cos(a) * r * 0.8} ${cy + Math.sin(a) * r * 0.8} L ${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`, 2.4, "#57504c");
    }
    fill(t, ellipse(cx, cy, r * 0.66, r * 0.66), mat(shade(C.steel, -0.3), 0.4), { s: 2, line: LINE * 0.8 });
    if (cap) {
      // the hubcap: shiny, dented, and in a pinch a weapon
      fill(t, ellipse(cx, cy, r * 0.58, r * 0.58), mat(C.steel, 0.95), { s: r * 0.16, spec: [cx - r * 0.22, cy - r * 0.24, r * 0.16, r * 0.08] });
      ink(t, ellipse(cx, cy, r * 0.32, r * 0.32), LINE * 0.7, "rgba(40,30,30,0.5)");
      ink(t, `M ${cx + r * 0.12} ${cy - r * 0.52} l ${r * 0.08} ${r * 0.16} l ${-r * 0.1} ${r * 0.06}`, LINE * 0.7, "rgba(40,30,30,0.6)");
      fill(t, ellipse(cx, cy, r * 0.13, r * 0.13), mat(A, 0.5), { s: 1, line: LINE * 0.6 });
    } else {
      for (let i = 0; i < 8; i++) {
        if (i === 3) continue; // that spoke went missing years ago
        const a = spin + (i / 8) * Math.PI * 2;
        ink(t, `M ${cx} ${cy} L ${cx + Math.cos(a) * r * 0.64} ${cy + Math.sin(a) * r * 0.64}`, 1.4, "#d8dcdc");
      }
      fill(t, ellipse(cx, cy, r * 0.2, r * 0.2), mat(A, 0.5), { s: 1.5, line: LINE * 0.7 });
    }
  };

  // rear rack with the namesake tumbleweed lashed on
  fill(t, tube([[-34, -62], [-86, -64]], [2.4, 2.4]), steel, { s: 1, line: LINE * 0.8 });
  fill(t, tube([[-80, -64], [-62, -30]], [2, 2]), steel, { s: 1, line: LINE * 0.8 });
  fill(t, ellipse(-82, -84, 22, 19), mat(C.sand), { s: 6 });
  for (let i = 0; i < 8; i++) {
    const a = i * 0.83;
    ink(t, `M ${-82 + Math.cos(a) * 19} ${-84 + Math.sin(a) * 16} Q ${-82 + Math.cos(a + 2) * 6} ${-84 + Math.sin(a + 2) * 5} ${-82 + Math.cos(a + 3.4) * 18} ${-84 + Math.sin(a + 3.4) * 15}`, 1.3, "rgba(96,64,30,0.8)");
  }
  ink(t, "M -102 -78 Q -82 -66 -62 -80 M -96 -96 Q -84 -84 -70 -66", 1.8, wire);
  // exhaust and a cough of smoke
  fill(t, tube([[-6, -38], [-46, -46], [-88, -50]], [4, 4, 4.5]), steel, { s: 2, spec: [-50, -48, 8, 1, 0] });
  fill(t, rrect(-96, -56, 10, 12, 3), metal, { s: 2 });
  smoke(t, -100, -62 - (go ? 4 : 0), go ? 9 : 7);
  // rear wheel, swingarm, the one working shock
  wheel(-60, -28, 28, false);
  fill(t, tube([[-60, -28], [-14, -40]], [5, 4]), metal, { s: 2 });
  ink(t, "M -40 -36 L -35 -40 L -43 -44 L -35 -48 L -43 -52 L -35 -56 L -40 -60", 2, "#cfd4d4");
  // frame, engine, crankcase
  fill(t, tube([[-30, -62], [8, -40], [52, -80]], [4.5, 4.5, 4]), rust, { s: 2 });
  fill(t, rrect(-16, -58, 34, 26, 5), steel, { s: 5, spec: [-10, -54, 5, 1.6, 0] });
  for (const y of [-52, -46, -40]) ink(t, `M -12 ${y} L 14 ${y}`, 1.4, "rgba(40,36,40,0.6)");
  fill(t, ellipse(2, -31, 11, 8), metal, { s: 3 });
  rivets(t, [[-12, -36], [14, -55]], 1.4);
  // front wheel with its hubcap, fender, fork and headlamp
  wheel(70, -22, 22, true);
  fill(t, "M 48 -32 C 52 -50 88 -52 94 -32 L 89 -31 C 85 -44 58 -45 53 -31 Z", rust, { s: 2, line: LINE * 0.8 });
  fill(t, tube([[70, -22], [52, -84]], [3.6, 4]), steel, { s: 1.5, spec: [60, -56, 1, 8, -0.3] });
  glowAt(t, 68, -78, 22, 0xffe2a0, 0.5);
  fill(t, ellipse(60, -78, 7, 7.5), mat(C.brass, 0.7), { s: 2 });
  fill(t, ellipse(61.5, -78, 4.4, 5), mat(0xfff3c0, 0.9), { s: 0, line: LINE * 0.6 });
  // fuel tank in the faction colour: patched, riveted, baling-wired
  fill(t, "M -4 -74 C 6 -86 36 -86 46 -78 L 42 -62 C 28 -58 6 -58 -4 -62 Z", mat(A, 0.5), { s: 5, spec: [8, -80, 6, 1.6, -0.1] });
  fill(t, rrect(16, -76, 12, 10, 1.5), mat(mix(A, C.steel, 0.5)), { s: 2, line: LINE * 0.7 });
  rivets(t, [[18, -74], [26, -74], [18, -68], [26, -68]], 1);
  for (const x of [4, 36]) ink(t, `M ${x} -83 L ${x + 2} -59 M ${x + 3} -83 L ${x + 5} -59`, 1.5, wire);
  // seat, with a strip of tape where the stuffing escaped
  fill(t, "M -46 -66 C -44 -74 -10 -76 -2 -70 L -4 -62 L -44 -60 Z", mat(C.leather), { s: 3 });
  fill(t, rrect(-30, -74, 8, 13, 1), mat(0x9aa0a0, 0.3), { s: 1, line: LINE * 0.6 });

  // --- the rider, hunched forward
  fill(t, `M -26 -92 C -42 -86 -58 ${go ? -84 : -76} -76 ${go ? -84 : -72} C -62 -64 -42 -64 -24 -70 Z`, mat(shade(C.canvas, -0.12)), { s: 3 });
  fill(t, tube([[0, -112], [26, -102], [38, -94]], [6.5, 5.5, 4.5]), suitB, { s: 4 });
  fill(t, "M -30 -94 C -28 -110 -8 -124 10 -120 C 22 -116 24 -100 16 -88 C 6 -76 -12 -68 -24 -70 C -32 -74 -33 -86 -30 -94 Z", suit, { s: 7 });
  if (settler) {
    fill(t, "M -16 -108 L -10 -112 L 6 -78 L -1 -75 Z", mat(A, 0.2), { s: 2, line: LINE * 0.8 });
    fill(t, "M -31 -86 C -18 -84 0 -88 18 -96 L 20 -90 C 2 -82 -18 -78 -31 -80 Z", mat(0xe6e2d6, 0.4), { s: 2, line: LINE * 0.8 });
  } else fill(t, "M -22 -104 C -12 -116 4 -120 12 -116 L 10 -96 C 0 -92 -14 -92 -22 -96 Z", mat(A, 0.4), { s: 4 });
  // near leg, knee patch, boot on the peg
  fill(t, rrect(-2, -36, 22, 3.4, 1.5), steel, { s: 1, line: LINE * 0.7 });
  fill(t, tube([[-16, -74], [14, -68]], [10, 8.5]), suit, { s: 4 });
  fill(t, tube([[14, -68], [8, -44]], [8.5, 6.5]), suit, { s: 4 });
  if (settler) {
    fill(t, rrect(8, -74, 11, 9, 2), mat(C.canvas), { s: 2, line: LINE * 0.8 });
    stitchRect(t, 8, -74, 11, 9);
  }
  fill(t, "M -2 -46 C -4 -38 0 -34 8 -34 L 22 -34 C 26 -34 26 -40 22 -42 C 18 -46 10 -48 4 -48 Z", mat(C.leatherDark, 0.2), { s: 3, spec: [16, -41, 2.4, 1.2] });
  // scarf streaming back, head, goggles, hard hat
  fill(t, `M 8 -120 C -8 -122 -24 ${go ? -114 : -122} -44 ${go ? -110 : -120} C -30 -110 -12 -112 8 -114 Z`, mat(C.red), { s: 2, line: LINE * 0.8 });
  fill(t, ellipse(18, -132, 14, 14.5), mat(C.skin), { s: 5 });
  if (settler) {
    fill(t, "M 7 -128 C 15 -124 28 -124 33 -128 C 33 -120 26 -116 19 -116 C 12 -116 7 -120 7 -128 Z", mat(C.red), { s: 3 });
    ink(t, "M 12 -122 Q 20 -119 28 -121", LINE * 0.6, "rgba(40,16,10,0.6)");
    ink(t, "M 4 -136 L 34 -137", 3.2, "#4e3220");
    fill(t, ellipse(23, -135.5, 5.6, 5.2), mat(C.brass, 0.7), { s: 1.5 });
    fill(t, ellipse(23, -135.5, 3.8, 3.5), mat(C.lens, 1), { s: 1.5, line: LINE * 0.6, spec: [21.8, -137, 1.2, 0.9] });
    fill(t, ellipse(32, -135, 3.8, 4.8), mat(C.brass, 0.7), { s: 1.5 });
    fill(t, ellipse(32, -135, 2.4, 3.2), mat(C.lens, 1), { s: 1, line: LINE * 0.6 });
    fill(t, "M -4 -143 C -4 -148 10 -149 20 -149 C 30 -149 42 -147 42 -143 C 42 -139 30 -139 20 -139 C 8 -139 -4 -139 -4 -143 Z", mat(shade(A, -0.12), 0.4), { s: 3 });
    fill(t, "M 1 -144 C -1 -159 9 -167 19 -167 C 30 -167 37 -158 35 -144 C 27 -141 9 -141 1 -144 Z", mat(A, 0.55), { s: 6, spec: [10, -160, 3.6, 2, -0.6] });
    ink(t, "M 19 -167 Q 23 -156 22 -144", LINE * 0.9);
  } else {
    fill(t, "M 2 -128 C -2 -142 6 -152 18 -152 C 30 -152 36 -142 34 -128 C 28 -122 8 -122 2 -128 Z", mat(0x6a706c, 0.6), { s: 5, spec: [10, -146, 3, 2] });
    fill(t, "M 18 -140 C 26 -142 34 -140 35 -135 C 35 -131 26 -130 18 -131 Z", mat(shade(A, 0.4), 0.9), { s: 2, line: LINE });
    glowAt(t, 28, -136, 10, shade(A, 0.5), 0.6);
  }
  // handlebars and the sawn-off scattergun wired to them
  fill(t, tube([[52, -84], [44, -96], [34, -98]], [2.6, 2.6, 2.6]), steel, { s: 1 });
  fill(t, rrect(34, -112, 16, 9, 3), mat(C.wood), { s: 2 });
  fill(t, rrect(46, -114, 36, 5, 2), metal, { s: 1.5, spec: [52, -113, 6, 0.8, 0] });
  fill(t, rrect(46, -109, 36, 5, 2), metal, { s: 1.5 });
  ink(t, "M 56 -116 L 52 -96 M 59 -116 L 55 -96", 1.4, wire);
  // near arm and glove
  fill(t, tube([[4, -114], [24, -104], [36, -98]], [7, 6, 5]), suit, { s: 4 });
  fill(t, ellipse(6, -114, 9, 6), mat(A, 0.3), { s: 3, spec: [3, -117, 2.4, 1.1] });
  fill(t, ellipse(37, -97, 6, 5.5), mat(C.glove), { s: 3 });
  ctx.restore();
  const [mx, my] = [84, -110];
  const c = Math.cos(tilt);
  const sn = Math.sin(tilt);
  return [pivot[0] + (mx - pivot[0]) * c - (my - pivot[1]) * sn, pivot[1] + (mx - pivot[0]) * sn + (my - pivot[1]) * c];
};

/** Lumen Concord: The Grand Strider, a walking cathedral of cut crystal with a glowing heart and impeccable manners. */
const golem: Painter = (t, s, f) => {
  const { ctx } = t;
  const A = s.color;
  const g = gem(A);
  const body = mix(g, A, 0.4);
  const G = mat(body, 0.95, 0.24);
  const GB = mat(shade(body, -0.18), 0.9, 0.26);
  const gold = mat(C.gold, 0.7);
  const lite = shade(A, 0.55);
  const step = f === 1;
  contact(t, 2, -4, 132, 20, 0.55);
  glowAt(t, 0, -120, 180, lite, 0.2);
  // cape: navy outside, faction-colour lining
  fill(t, `M -46 -184 C -92 -160 -122 -90 -136 ${step ? -16 : -10} C -104 -2 -74 -6 -52 -12 C -60 -70 -54 -134 -22 -186 Z`, mat(C.navy, 0.3), { s: 10 });
  fill(t, `M -136 ${step ? -16 : -10} C -104 -2 -74 -6 -52 -12 C -66 -20 -104 -22 -132 ${step ? -24 : -20} Z`, mat(A, 0.3), { s: 3, line: LINE * 0.8 });
  // back leg, back arm and its great gem fist
  ctx.save();
  if (step) ctx.translate(-8, -6);
  gemCut(t, [[-62, -80], [-22, -84], [-12, -44], [-22, -4], [-70, -4], [-78, -44]], GB, 8);
  ctx.restore();
  gemCut(t, [[-86, -176], [-50, -170], [-56, -122], [-94, -118]], GB, 6);
  gemCut(t, [[-118, -126], [-70, -130], [-58, -94], [-74, -60], [-116, -62], [-130, -94]], GB, 8);
  // the torso
  gemCut(t, [[-80, -152], [-42, -196], [38, -200], [88, -162], [82, -98], [44, -62], [-40, -60], [-86, -98]], G, 14, 0.5);
  // the glowing core, framed in gold filigree
  glowAt(t, 4, -130, step ? 84 : 70, lite, 0.95);
  ink(t, "M -22 -160 C -40 -140 -40 -118 -22 -100 M 30 -160 C 48 -140 48 -118 30 -100", 3.2, "#dcb55a");
  for (const [x, y] of [[-22, -160], [-22, -100], [30, -160], [30, -100]] as const) fill(t, ellipse(x, y, 3.4, 3.4), gold, { s: 1, line: LINE * 0.6 });
  fill(t, "M 4 -162 L 26 -130 L 4 -98 L -18 -130 Z", mat(shade(A, 0.65), 1, 0.2), { s: 6, spec: [-2, -146, 3, 6, -0.6] });
  flat(t, "M 4 -150 L 14 -130 L 4 -110 L -6 -130 Z", 0xffffff, 0.75);
  glowAt(t, 4, -130, 22, 0xffffff, 0.8);
  // gold belt with a gem buckle
  fill(t, "M -84 -96 L 82 -100 L 78 -86 L -80 -82 Z", gold, { s: 3, spec: [-50, -94, 10, 1, 0] });
  fill(t, ellipse(4, -91, 7, 6), mat(g, 0.9), { s: 2, line: LINE * 0.8 });
  // front leg
  ctx.save();
  if (step) ctx.translate(8, -4);
  gemCut(t, [[8, -84], [50, -86], [60, -44], [54, -4], [4, -4], [-2, -44]], G, 8);
  ctx.restore();
  // a small, smug head sunk between the shoulders: crown of shards, glowing eye slit, monocle
  for (const [x, top, w, lean] of [[16, -248, 4, -3], [28, -258, 5, 0], [40, -248, 4, 3]] as const) crystal(t, x, top, -222, w, A, lean);
  gemCut(t, [[12, -224], [40, -228], [52, -208], [44, -188], [16, -186], [6, -204]], G, 5, 0.55);
  ink(t, "M 10 -222 L 44 -226", 3, "#dcb55a");
  fill(t, "M 30 -210 L 50 -212 L 49.5 -207.5 L 31 -206.5 Z", mat(0xffffff), { s: 0, line: LINE * 0.5 });
  glowAt(t, 42, -209, 12, 0xffffff, 0.85);
  ink(t, ellipse(44, -209, 6.5, 6.5), 2.2, "#dcb55a");
  flat(t, ellipse(44, -209, 5.5, 5.5), 0xffffff, 0.22);
  ctx.save();
  ctx.setLineDash([2, 2]);
  ink(t, "M 48 -203 C 56 -192 60 -180 54 -168", 1.4, "#dcb55a");
  ctx.restore();
  fill(t, "M 18 -190 C 24 -184 36 -184 42 -190 C 44 -180 36 -172 30 -172 C 22 -172 16 -180 18 -190 Z", mat(shade(A, 0.35), 0.2), { s: 3, line: LINE * 0.8 });
  // front arm: a prism-cannon gauntlet bound in gold
  gemCut(t, [[56, -176], [92, -168], [100, -126], [66, -118]], G, 6);
  glowAt(t, 162, -124, 36, lite, 0.95);
  fill(t, "M 78 -140 L 150 -132 L 168 -124 L 150 -114 L 78 -108 Z", mat(g, 0.95, 0.2), { s: 5, spec: [96, -134, 16, 1.4, 0.05] });
  flat(t, "M 78 -140 L 150 -132 L 168 -124 L 78 -124 Z", 0xffffff, 0.22);
  ink(t, "M 78 -124 L 168 -124", LINE * 0.6, "rgba(40,30,70,0.45)");
  fill(t, rrect(92, -141, 8, 34, 2), gold, { s: 2, line: LINE * 0.8 });
  fill(t, rrect(124, -137, 8, 28, 2), gold, { s: 2, line: LINE * 0.8 });
  gemCut(t, [[64, -148], [92, -150], [96, -104], [68, -100], [58, -124]], G, 5);
  // gold epaulette with a crystal stud and a fringe
  fill(t, ellipse(70, -172, 22, 10), gold, { s: 3, spec: [62, -176, 5, 1.6] });
  for (let i = 0; i < 6; i++) ink(t, `M ${54 + i * 6.4} -164 L ${53 + i * 6.4} -154`, 2, "#b89238");
  crystal(t, 70, -192, -174, 5, A, 2);
  return [168, -124];
};

/** The Munch: a warren mound, a lumpy dirt pile whose toothy front door looks back at you. */
const mound: Painter = (t, s, f) => {
  const { ctx } = t;
  const A = s.color;
  const alt = f === 1;
  contact(t, 0, -4, 118, 20, 0.5);
  // a crude sign stuck in the dirt, painted in the faction colour, with a bite out of it
  fill(t, tube([[-76, -60], [-80, -136]], [2.6, 2.6]), mat(C.wood), { s: 1.5 });
  fill(t, "M -104 -152 L -56 -148 Q -63 -144 -57 -140 Q -63 -136 -57 -132 L -57 -120 L -104 -124 Z", mat(A, 0.3), { s: 3, spec: [-96, -147, 6, 1.2, 0.05] });
  ink(t, "M -97 -140 L -91 -132 L -85 -140 L -79 -132 L -73 -140 L -67 -132", 2, "rgba(28,21,18,0.8)");
  // the mound: layered soil, pebbles, tufts, claw marks
  const hill = "M -116 -4 C -118 -44 -92 -80 -54 -92 C -36 -106 2 -110 26 -100 C 68 -92 108 -58 116 -4 C 82 14 -82 14 -116 -4 Z";
  fill(t, hill, mat(C.dirt), { s: 16, spec: [-44, -88, 14, 3, -0.3] });
  ctx.save();
  ctx.clip(new Path2D(hill));
  for (const [y, k] of [[-30, 1], [-56, -1], [-80, 1]] as const) ink(t, `M -120 ${y} Q -60 ${y - 10 * k} 0 ${y - 2} T 120 ${y - 6 * k}`, 1.6, "rgba(60,36,20,0.35)");
  ctx.restore();
  for (const [x, y, r] of [[-88, -24, 6], [-62, -70, 4.5], [76, -28, 5.5], [92, -12, 4], [30, -86, 4]] as const) fill(t, ellipse(x, y, r, r * 0.75), mat(r > 5 ? C.stone : shade(C.dirt, 0.18)), { s: r * 0.4, line: LINE * 0.7 });
  for (const [x, y] of [[-40, -96], [8, -104], [96, -38]] as const) fill(t, `M ${x - 6} ${y + 2} L ${x - 8} ${y - 10} L ${x - 2} ${y - 2} L ${x} ${y - 14} L ${x + 3} ${y - 2} L ${x + 9} ${y - 9} L ${x + 6} ${y + 2} Z`, mat(0x8f9a46), { s: 2, line: LINE * 0.6 });
  for (let i = 0; i < 3; i++) fill(t, `M ${-94 + i * 9} ${-58 + i * 2} Q ${-86 + i * 9} -46 ${-82 + i * 9} ${-32 + i * 2} L ${-78 + i * 9} ${-33 + i * 2} Q ${-81 + i * 9} -48 ${-89 + i * 9} ${-59 + i * 2} Z`, mat(A, 0.2), { s: 1, line: LINE * 0.6 });
  // a side peep-hole with a nosy lodger
  fill(t, ellipse(64, -64, 15, 10), mat(shade(C.dirt, -0.3)), { s: 2, line: LINE * 0.8 });
  flat(t, ellipse(64, -63, 11, 7), 0x1a0d0a);
  peek(t, 59, -63, 3.4, alt ? 1 : 0.35, 1);
  peek(t, 69, -63, 3.4, alt ? 1 : 0.35, 1);
  // the front door, which has teeth
  fill(t, "M -54 -2 C -58 -46 -32 -72 0 -72 C 32 -72 58 -46 54 -2 Z", mat(shade(C.dirt, -0.22)), { s: 5 });
  fill(t, "M -44 -4 C -48 -40 -26 -62 0 -62 C 26 -62 48 -40 44 -4 Z", mat(0x1a0d0a), { s: 0 });
  flat(t, ellipse(0, -22, 30, 22), 0x0c0605);
  fill(t, teethRow(-42, -24, 0, -96, 42, -24, 8, 10, 1), mat(C.bone), { s: 1.5, line: LINE * 0.6 });
  fill(t, teethRow(-38, -5, 0, -12, 38, -5, 6, 8, -1), mat(C.bone), { s: 1.5, line: LINE * 0.6 });
  // ...and somebody is home
  peek(t, 20, -42, 3.4, alt ? 0.6 : 1, 0);
  peek(t, 29, -43, 3.4, alt ? 0.6 : 1, 0);
  peek(t, -13, -28, 6.5, alt ? 0.1 : 0.38, alt ? -1 : 1);
  peek(t, 7, -29, 7, alt ? 0.1 : 0.38, alt ? -1 : 1);
  // a gnawed bone on the doorstep
  fill(t, tube([[52, -8], [78, -13]], [2.4, 2.4]), mat(C.bone), { s: 1, line: LINE * 0.7 });
  for (const [x, y] of [[51, -11], [52, -5], [78, -16], [80, -10]] as const) fill(t, ellipse(x, y, 3.2, 3), mat(C.bone), { s: 1, line: LINE * 0.7 });
  return [0, -30];
};

/** Lumen Concord: a slender crystal noble gliding on glass wings, pointing a needle of light. */
const sylph: Painter = (t, s, f) => {
  const { ctx } = t;
  const A = s.color;
  const g = gem(A);
  const lite = shade(A, 0.55);
  const navy = mat(C.navy, 0.3);
  const coat = mat(C.pearl, 0.15, 0.42);
  const gold = mat(C.gold, 0.7);
  const up = f === 0;
  const wing = (x: number, y: number, rot: number, k: number, alpha: number, tint: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const d = `M 0 0 C ${-24 * k} ${-16 * k} ${-74 * k} ${-30 * k} ${-112 * k} ${-24 * k} L ${-92 * k} ${-8 * k} L ${-108 * k} ${4 * k} L ${-74 * k} ${8 * k} L ${-84 * k} ${18 * k} C ${-50 * k} ${18 * k} ${-18 * k} ${10 * k} 0 0 Z`;
    fill(t, d, mat(tint, 0.9, 0.2), { s: 4 * k, alpha, line: LINE * 0.8, spec: [-46 * k, -16 * k, 12 * k, 1.8 * k, -0.12] });
    ink(t, `M 0 0 L ${-104 * k} ${-20 * k} M ${-8 * k} ${2 * k} L ${-92 * k} ${-8 * k} M ${-14 * k} ${4 * k} L ${-74 * k} ${8 * k} M ${-20 * k} ${6 * k} L ${-80 * k} ${16 * k}`, LINE * 0.5, "rgba(40,30,70,0.35)");
    ink(t, `M 0 0 C ${-24 * k} ${-16 * k} ${-74 * k} ${-30 * k} ${-112 * k} ${-24 * k}`, 2, "#dcb55a");
    ctx.restore();
  };
  glowAt(t, -10, -120, 96, lite, 0.32);
  // far wing
  wing(-4, -122, up ? 0.9 : 0.42, 0.86, 0.5, shade(g, -0.12));
  // coat tails streaming behind
  fill(t, `M -14 -96 C -36 -88 -60 ${up ? -86 : -78} -86 ${up ? -86 : -76} C -66 -70 -40 -72 -10 -84 Z`, navy, { s: 4 });
  fill(t, `M -86 ${up ? -86 : -76} C -66 -70 -40 -72 -10 -84 C -34 -78 -60 -78 -80 ${up ? -80 : -72} Z`, mat(A, 0.3), { s: 1, line: LINE * 0.7 });
  // legs trailing, toes pointed
  fill(t, tube([[-8, -88], [-30, -72], [-50, -60]], [6, 5, 3.4]), mat(shade(C.navy, -0.12)), { s: 3 });
  fill(t, "M -48 -64 C -56 -62 -64 -58 -74 -54 C -64 -53 -54 -54 -46 -57 Z", mat(0x1e1f3a, 0.6), { s: 1.5 });
  fill(t, tube([[-2, -86], [-18, -64], [-40, -50]], [7, 6, 4]), navy, { s: 3 });
  fill(t, "M -38 -54 C -46 -52 -56 -48 -66 -43 C -55 -42 -44 -43 -36 -47 Z", mat(0x1e1f3a, 0.6), { s: 1.5, spec: [-50, -48, 2.4, 0.8] });
  ink(t, "M -36 -50 L -40 -55", 2, "#dcb55a");
  // the torso, leaning into the glide: pearl coat, sash, gold buttons, crystal collar
  fill(t, "M -16 -92 C -14 -110 -2 -128 14 -132 C 26 -132 32 -122 28 -110 C 22 -96 8 -86 -6 -82 C -14 -82 -18 -86 -16 -92 Z", coat, { s: 6, spec: [4, -124, 3, 5, -0.4] });
  fill(t, "M 4 -132 L 12 -128 L -6 -84 L -14 -88 Z", mat(A, 0.45), { s: 2, line: LINE * 0.8 });
  for (const [x, y] of [[24, -120], [18, -110], [12, -100]] as const) fill(t, ellipse(x, y, 1.6, 1.6), gold, { s: 0.6, line: LINE * 0.5 });
  crystal(t, 6, -146, -128, 2.8, A, -3);
  crystal(t, 26, -146, -128, 2.8, A, 3);
  // faceted gem head, chin up, crown of shards, eye slit
  ctx.save();
  ctx.translate(20, -130);
  ctx.rotate(-0.2);
  ctx.scale(1.4, 1.4);
  glowAt(t, 0, -14, 18, lite, 0.4);
  for (const [x, top, w, lean] of [[-4, -40, 1.8, -2], [1, -44, 2.4, 0], [6, -40, 1.8, 2]] as const) crystal(t, x, top, -26, w, A, lean);
  const head = "M 1 -31 L 9 -26 L 11 -15 L 8 -5 L 1 -1 L -6 -5 L -9 -16 L -6 -26 Z";
  fill(t, head, mat(g, 0.95, 0.24), { s: 4 });
  flat(t, "M 1 -31 L -6 -26 L -9 -16 L 0 -17 Z", "rgba(255,255,255,0.45)");
  flat(t, "M 11 -15 L 8 -5 L 1 -1 L 2 -11 Z", rgba(shade(A, -0.4), 0.35));
  ink(t, "M 1 -31 L 0 -17 L -9 -16 M 0 -17 L 11 -15 M 0 -17 L 2 -11 L 1 -1", LINE * 0.5, "rgba(40,30,70,0.5)");
  ink(t, head, LINE * 0.9);
  fill(t, "M 2.5 -17 L 10 -18 L 9.6 -15.6 L 3.2 -15.2 Z", mat(0xffffff), { s: 0, line: LINE * 0.4 });
  glowAt(t, 7, -16.5, 7, 0xffffff, 0.85);
  ctx.restore();
  // pointing arm: the Needle Glare, a fan of light needles from the fingertip
  fill(t, tube([[14, -124], [40, -122], [60, -124]], [6.4, 5.4, 4.4]), coat, { s: 3 });
  fill(t, ellipse(14, -126, 8, 5), gold, { s: 2, spec: [11, -128, 2.2, 0.8] });
  glowAt(t, 72, -125, 20, lite, 0.95);
  for (const [dy, l] of [[-6, 14], [0, 22], [6, 14]] as const) fill(t, `M 64 ${-125 + dy * 0.2} L ${64 + l} ${-125 + dy} L 64 ${-123 + dy * 0.2} Z`, mat(shade(A, 0.75), 0.9), { s: 0, line: LINE * 0.5 });
  fill(t, ellipse(62, -124, 5.6, 5), mat(0xf6f2ea), { s: 2 });
  // near wings over everything
  wing(4, -124, up ? 0.7 : 0.25, 1, 0.58, g);
  wing(0, -118, up ? 0.2 : -0.12, 0.66, 0.55, g);
  return [86, -125];
};

const PAINTERS: Record<FigureKind, Painter> = { trooper, critter, brute, walker, plane, skiff, bug, turret, pylon, pod, beacon, junk, hole, ward, bike, golem, mound, sylph };

/** Inches per design unit (centi-inches scaled to this spec's base radius). */
export const figureScale = (s: FigureSpec): number => {
  if (s.art?.kind === "image") return 0.01;
  if (s.art?.kind === "parts") return (s.r / BODY_DESIGN[s.art.recipe.body].ref) * 0.01 * s.art.recipe.scale;
  return (s.r / archetypeDesign(s).ref) * 0.01;
};

/** The faction art module's painter for this spec, if it has one (custom art always wins). */
const factionArt = (s: FigureSpec) => (s.art ? undefined : factionFigure(s.look, s.unit, s.kind));

/** Design bounds of the built-in painter this spec uses: the faction module's, else the shared archetype's. */
const archetypeDesign = (s: FigureSpec) => factionArt(s)?.design ?? DESIGN[s.kind];

function design(s: FigureSpec): { b: [number, number, number, number]; top: number } {
  if (s.art?.kind === "image") return coinDesign(s.r);
  if (s.art?.kind === "parts") return BODY_DESIGN[s.art.recipe.body];
  return archetypeDesign(s);
}

export function figureMeta(s: FigureSpec): Omit<FigureMeta, "muzzle"> {
  const k = figureScale(s);
  const d = design(s);
  const [x0, y0, x1, y1] = d.b;
  return { x0: x0 * k, y0: y0 * k, x1: x1 * k, y1: y1 * k, top: d.top * k };
}

/** True while this spec's art is an image that hasn't decoded yet (it paints a placeholder meanwhile). */
export const figurePending = (s: FigureSpec): boolean => s.art?.kind === "image" && !artImage(s.art.src);

/** Resolves once everything the spec needs for painting is loaded. */
export const figureReady = (s: FigureSpec): Promise<unknown> => (s.art?.kind === "image" ? whenArtImage(s.art.src) : Promise.resolve());

/** Paint one frame of a figure (no outer silhouette) at the context's origin (feet), in inches. */
export function paintFigure(ctx: CanvasRenderingContext2D, s: FigureSpec, frame: number): FigureMeta {
  const k = figureScale(s);
  ctx.save();
  ctx.scale(k, k);
  const t: Toon = { ctx, line: LINE };
  const m =
    s.art?.kind === "parts"
      ? paintRecipe(t, s.art.recipe, s.color, frame)
      : s.art?.kind === "image"
        ? paintCoin(t, s.r, s.color, artImage(s.art.src), frame)
        : (factionArt(s)?.paint ?? PAINTERS[s.kind])(t, s, frame);
  ctx.restore();
  return { ...figureMeta(s), muzzle: { x: m[0] * k, y: m[1] * k } };
}

export interface FigureSheet {
  canvas: HTMLCanvasElement;
  /** Pixels per inch the sheet was painted at. */
  ppi: number;
  frameW: number;
  frameH: number;
  /** Feet position inside a frame, in pixels. */
  ax: number;
  ay: number;
  meta: FigureMeta;
  frames: number;
}

/** Paint a sheet: [idle, step, white idle, white step], side by side, each with its ink silhouette. */
export function paintSheet(s: FigureSpec, ppi: number): FigureSheet {
  const b = figureMeta(s);
  const pad = FIG_INK * 2 + 0.06;
  const fw = Math.ceil((b.x1 - b.x0 + pad * 2) * ppi);
  const fh = Math.ceil((b.y1 - b.y0 + pad * 2) * ppi);
  const ax = (-b.x0 + pad) * ppi;
  const ay = (-b.y0 + pad) * ppi;
  const frames = 2;
  const canvas = makeCanvas(fw * frames * 2, fh);
  const ctx = canvas.getContext("2d")!;
  let meta: FigureMeta | null = null;
  for (let fr = 0; fr < frames; fr++) {
    outlined(ctx, fr * fw, 0, fw, fh, FIG_INK * ppi, (c) => {
      c.setTransform(ppi, 0, 0, ppi, ax, ay);
      const m = paintFigure(c, s, fr);
      meta ??= m;
    });
  }
  // white silhouettes for hit flashes and cast shadows
  ctx.save();
  ctx.drawImage(canvas, 0, 0, fw * frames, fh, fw * frames, 0, fw * frames, fh);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(fw * frames, 0, fw * frames, fh);
  ctx.restore();
  return { canvas, ppi, frameW: fw, frameH: fh, ax, ay, meta: meta!, frames };
}

// ---------- bases ----------

export type BaseShape = "round" | "plate" | "holo";

/** A miniature's base: bevelled ring in the player's colour, earthy flocked top, visible thickness. */
export function paintBase(ctx: CanvasRenderingContext2D, r: number, team: number, shape: BaseShape, look?: Look): void {
  const t: Toon = { ctx, line: 1.4 };
  ctx.save();
  ctx.scale(0.01, 0.01);
  const R = r * 100;
  const RY = R * 0.92;
  const thick = 9 + R * 0.04;
  if (shape === "holo") {
    ctx.save();
    ctx.setLineDash([14, 9]);
    ink(t, ellipse(0, 0, R + 4, RY + 4), 7, rgba(team, 0.95));
    ctx.restore();
    flat(t, ellipse(0, 0, R, RY), rgba(team, 0.16));
    ink(t, ellipse(0, 0, R * 0.7, RY * 0.7), 2, rgba(shade(team, 0.5), 0.6));
    ctx.restore();
    return;
  }
  const plate = shape === "plate";
  const outer = (dy: number, grow: number) =>
    plate ? rrect(-R - grow, -RY * 0.82 - grow + dy, (R + grow) * 2, RY * 1.64 + grow * 2, 22) : ellipse(0, dy, R + grow, RY + grow);
  // thickness, then a hard ink outline around the whole base
  fill(t, outer(thick, 5), mat(shade(team, -0.5)), { s: 0, line: 4.5 });
  fill(t, outer(0, 5), mat(team, 0.5), { s: 6, line: 4.5, spec: [-R * 0.5, -RY * 0.75, R * 0.22, 2.4, -0.15] });
  // flocked earth top
  const top = plate ? rrect(-R + 6, -RY * 0.82 + 6, R * 2 - 12, RY * 1.64 - 12, 14) : ellipse(0, 0, R - 7, RY - 7);
  const baseTop = look ? FACTION_ART[look]?.baseTop : undefined;
  if (baseTop) {
    // the faction's own ground, clipped to the top, then the top's rim line over it
    ctx.save();
    ctx.clip(new Path2D(top));
    baseTop(t, R - 7, RY - 7, Math.round(r * 997 + team));
    ctx.restore();
    ink(t, top, 1.6);
    ctx.restore();
    return;
  }
  fill(t, top, mat(0x6a5440), { s: 8, line: 1.6, hi: 0.4 });
  ctx.save();
  ctx.clip(new Path2D(top));
  let seed = Math.round(r * 997 + team);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < Math.round(8 + r * 20); i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * R * 0.9;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d * 0.92;
    const pr = 1.6 + rnd() * 2.4;
    fill(t, ellipse(x, y, pr, pr * 0.8), mat(rnd() < 0.5 ? 0x9a8670 : 0x7e6a54), { s: pr * 0.5, line: 0.8, hi: 0.6 });
  }
  for (let i = 0; i < Math.round(1 + r * 2); i++) {
    const x = (rnd() - 0.5) * R * 1.3;
    const y = (rnd() - 0.1) * R * 0.7;
    ink(t, `M ${x} ${y} L ${x - 4} ${y - 9} M ${x} ${y} L ${x + 1} ${y - 11} M ${x} ${y} L ${x + 5} ${y - 8}`, 1.4, "#8f9a46");
  }
  ctx.restore();
  ctx.restore();
}

/** How `figureDataUrl` frames a figure: square side (inches), space below the feet, and where the feet sit (0..1 down). */
export function miniFraming(s: FigureSpec): { size: number; bottom: number; feet: number } {
  const b = figureMeta(s);
  const ext = Math.max(-b.x0, b.x1, s.r + 0.1) + FIG_INK * 2;
  const top = -b.y0 + FIG_INK * 2;
  const bottom = s.r * 0.92 + 0.25;
  const size = Math.max(ext * 2, top + bottom);
  return { size, bottom, feet: (size - bottom) / size };
}

/** A standalone figure on its base, as a data URL (forge tokens, emblems), cached (most recent few hundred). */
const urlCache = new Map<string, string>();
const URL_CACHE_MAX = 300;

export type MiniLayer = "all" | "base" | "figure";

/**
 * A figure standing on its base as a PNG data URL `px` CSS pixels square. `layer` paints just the base or
 * just the figure (with the same framing, so the two stack exactly; the forge animates the figure layer).
 */
export function figureDataUrl(s: FigureSpec, team: number | null, px: number, layer: MiniLayer = "all"): string {
  const key = `${specKey(s)}|${team}|${px}|${layer}`;
  const hit = urlCache.get(key);
  if (hit) {
    urlCache.delete(key);
    urlCache.set(key, hit);
    return hit;
  }
  const { size, bottom } = miniFraming(s);
  const ppi = (px * Math.min(2, window.devicePixelRatio || 1) * 2) / size;
  const W = Math.ceil(size * ppi);
  const c = makeCanvas(W, W);
  const ctx = c.getContext("2d")!;
  const ox = (size / 2) * ppi;
  const oy = (size - bottom) * ppi;
  if (team !== null && layer !== "figure") {
    ctx.setTransform(ppi, 0, 0, ppi, ox, oy);
    paintBase(ctx, s.r, team, "round", s.art ? undefined : s.look);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (layer !== "base") {
    outlined(ctx, 0, 0, W, W, FIG_INK * ppi, (fc) => {
      fc.setTransform(ppi, 0, 0, ppi, ox, oy);
      paintFigure(fc, s, 0);
    });
  }
  const url = c.toDataURL("image/png");
  // An image still decoding painted a placeholder: don't keep that.
  if (!figurePending(s)) {
    urlCache.set(key, url);
    if (urlCache.size > URL_CACHE_MAX) urlCache.delete(urlCache.keys().next().value!);
  }
  return url;
}

/** Like `figureDataUrl`, but waits for uploaded images to decode first. */
export async function figureDataUrlAsync(s: FigureSpec, team: number | null, px: number, layer: MiniLayer = "all"): Promise<string> {
  await figureReady(s);
  return figureDataUrl(s, team, px, layer);
}

/** Muzzle flash (for the renderer to stamp onto a texture). */
export function paintMuzzle(ctx: CanvasRenderingContext2D, r: number): void {
  const t: Toon = { ctx, line: r * 0.06 };
  glowAt(t, 0, 0, r * 1.3, 0xffb030, 0.8);
  let d = "";
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const rr = i % 2 ? r * 0.32 : i === 0 ? r : r * (0.55 + (i % 4) * 0.08);
    d += `${i ? "L" : "M"} ${Math.cos(a) * rr} ${Math.sin(a) * rr} `;
  }
  fill(t, d + "Z", mat(0xffb02e), { s: 0, line: r * 0.07 });
  flat(t, ellipse(0, 0, r * 0.26, r * 0.26), "#fff6d0");
}
