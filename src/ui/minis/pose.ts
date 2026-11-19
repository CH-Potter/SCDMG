// Posing: animation channels → a matrix for every drawable (part or limb segment), in rig space
// (origin at the feet / base centre, design units). Pure and deterministic, so the reference unit's
// poses can be snapshot-tested. Limbs are two-bone IK chains solved from the shoulder/hip to the
// weapon grip/foot target, so any weapon fits any frame: the arms follow its grips.

import { readPart, type PartInfo } from "./svg";
import type { BoneRef, Channels, LimbDef, Mat, PartUse, Pt, RigDef } from "./types";

export const IDENT: Mat = [1, 0, 0, 1, 0, 0];
const DEG = Math.PI / 180;

export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
export const tr = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const rot = (rad: number): Mat => [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
export const scl = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0];
export const rotAbout = (rad: number, p: Pt): Mat => (rad === 0 ? IDENT : mul(tr(p.x, p.y), mul(rot(rad), tr(-p.x, -p.y))));
export const apply = (m: Mat, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
export const angle = (a: Pt, b: Pt): number => Math.atan2(b.y - a.y, b.x - a.x);
const len = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);
export const placeMat = (p: { x: number; y: number; rot: number; scale?: number } | undefined): Mat => {
  if (!p) return IDENT;
  const m = mul(tr(p.x, p.y), rot(p.rot * DEG));
  return p.scale && p.scale !== 1 ? mul(m, scl(p.scale, p.scale)) : m;
};

export const ZERO: Readonly<Channels> = {
  rootX: 0,
  rootY: 0,
  rootRot: 0,
  rootSX: 0,
  rootSY: 0,
  pelvisX: 0,
  pelvisY: 0,
  torsoRot: 0,
  headRot: 0,
  gunX: 0,
  gunY: 0,
  gunRot: 0,
  kick: 0,
  gait: 0,
  gaitW: 0,
  lift: 0,
  yaw: 0,
  shadow: 0,
  flash: 0,
  drain: 0,
  fade: 0,
  muzzle: 0,
  pulse: 0,
  spin: 0,
  flap: 0,
};

export interface IkResult {
  joint: Pt;
  end: Pt;
}

/** Two-bone IK: the joint bends to the `bend` side (+1/-1, as in the rest pose). Out of reach: straight. */
export function solveIk(root: Pt, target: Pt, l1: number, l2: number, bend: number): IkResult {
  const d0 = len(root, target);
  const d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, d0));
  const phi = d0 < 1e-6 ? Math.PI / 2 : angle(root, target);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const up = phi + bend * a;
  const joint = { x: root.x + Math.cos(up) * l1, y: root.y + Math.sin(up) * l1 };
  const end = { x: root.x + Math.cos(phi) * d, y: root.y + Math.sin(phi) * d };
  return { joint, end };
}

/** Bone lengths, rest angles and bend side of a limb (from its authored rest pose). */
export interface LimbRest {
  l1: number;
  l2: number;
  bend: number;
  a1: number;
  a2: number;
}

const restCache = new WeakMap<LimbDef, LimbRest>();
export function limbRest(l: LimbDef): LimbRest {
  let r = restCache.get(l);
  if (!r) {
    const s = l.from.at;
    const cross = (l.end.x - s.x) * (l.joint.y - s.y) - (l.end.y - s.y) * (l.joint.x - s.x);
    r = { l1: len(s, l.joint), l2: len(l.joint, l.end), bend: cross < 0 ? -1 : 1, a1: angle(s, l.joint), a2: angle(l.joint, l.end) };
    restCache.set(l, r);
  }
  return r;
}

export interface PosedLimb {
  root: Pt;
  joint: Pt;
  end: Pt;
  a1: number;
  a2: number;
}

export interface Pose {
  /** Rig-space matrix per drawable id: parts by id, limb segments as `<limb>.upper|lower`. */
  mats: Map<string, Mat>;
  limbs: Map<string, PosedLimb>;
  /** Weapon muzzle and its direction (rig space, unit vector). */
  muzzle: Pt;
  muzzleDir: Pt;
  /** Whole-figure matrix (rig space): used for effects anchored to the figure. */
  figure: Mat;
}

/** What posing needs from a rig that never changes: looked up once per rig, not every frame. */
interface RigStatics {
  wpn: PartUse | undefined;
  wInfo: PartInfo | null;
  place: Mat;
  carry: { x: number; y: number; rot: number };
  back: Pt;
  /** Part placement matrices, and for animated parts their pivot (part coords). */
  partPlace: Mat[];
  partPivot: (Pt | null)[];
  /** Where the muzzle sits when there's no weapon: the top centre of the figure (frame coords). */
  top: Pt;
  /** Each limb's drawable and bone names, made once (no string building per frame). */
  limbKeys: { upper: string; lower: string; mid: string; end: string }[];
}

const staticCache = new WeakMap<RigDef, RigStatics>();
function statics(rig: RigDef): RigStatics {
  let s = staticCache.get(rig);
  if (s) return s;
  const wpn = rig.weapon ? rig.parts.find((p) => p.id === rig.weapon) : undefined;
  const wInfo = wpn ? readPart(wpn.src) : null;
  const carry = wpn?.place ?? { x: 0, y: 0, rot: 0 };
  s = {
    wpn,
    wInfo,
    place: placeMat(wpn?.place),
    carry,
    back: { x: Math.cos(carry.rot * DEG), y: Math.sin(carry.rot * DEG) },
    partPlace: rig.parts.map((p) => placeMat(p.place)),
    partPivot: rig.parts.map((p) => (p.anim ? (readPart(p.src).anchors.pivot ?? { x: 0, y: 0 }) : null)),
    top: rig.view === "side" ? { x: rig.origin.x, y: rig.origin.y - rig.height * 0.8 } : { x: rig.origin.x, y: rig.origin.y - rig.height * 0.3 },
    limbKeys: rig.limbs.map((l) => ({ upper: `${l.id}.upper`, lower: `${l.id}.lower`, mid: `${l.id}.mid`, end: `${l.id}.end` })),
  };
  staticCache.set(rig, s);
  return s;
}

/** Ground one walk cycle covers (u): the rig's own, or twice the stance sweep of its first leg. */
export function strideOf(rig: RigDef): number {
  if (rig.stride) return rig.stride;
  const keys = rig.gait;
  if (!keys?.length) return 60;
  const leg = Object.keys(keys[0]!)[0]!;
  const vals = keys.map((k) => (rig.view === "side" ? k[leg]?.x : k[leg]?.y) ?? 0);
  return Math.max(8, (Math.max(...vals) - Math.min(...vals)) * 2);
}

const smooth = (t: number) => t * t * (3 - 2 * t);
/** A bone that carries rest point `restP` to `p`, turned by `a - restA`. */
const seg = (p: Pt, a: number, restP: Pt, restA: number): Mat => mul(tr(p.x, p.y), mul(rot(a - restA), tr(-restP.x, -restP.y)));

/** Foot target of a leg for gait position `g` (wraps), blended with the stand pose by `w`. */
function footTarget(rig: RigDef, limb: LimbDef, g: number, w: number): Pt {
  const keys = rig.gait;
  if (!keys?.length || w <= 0) return limb.end;
  const n = keys.length;
  const gg = ((g % n) + n) % n;
  const i = Math.floor(gg);
  const a = keys[i]![limb.id] ?? limb.end;
  const b = keys[(i + 1) % n]![limb.id] ?? limb.end;
  // a planted foot slides back at a steady rate (the body's walking speed); a swinging one eases
  const planted = rig.view === "top" || (a.y >= limb.end.y - 0.5 && b.y >= limb.end.y - 0.5);
  const t = planted ? gg - i : smooth(gg - i);
  const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  const k = Math.min(1, w);
  return { x: limb.end.x + (p.x - limb.end.x) * k, y: limb.end.y + (p.y - limb.end.y) * k };
}

/** The part-motion channels (pulse, spin, flap) at a phase offset: see `PartAnim.phase`. */
export type PartChannels = Pick<Channels, "pulse" | "spin" | "flap">;
/** Part-motion channels for a phase offset (0..1 of the loops). The mini supplies it; tests may omit it. */
export type PhaseSampler = (phase: number) => PartChannels;

/** A part's own motion (PartAnim) about its pivot, in part coords. */
function animMat(p: PartUse, pivot: Pt, c: PartChannels): Mat {
  const a = p.anim!;
  const pulse = c.pulse;
  let m: Mat = IDENT;
  const sx = 1 + (a.pulse ?? 0) * pulse;
  const sy = sx * (1 - (a.flap ?? 0) * c.flap);
  if (sx !== 1 || sy !== 1) m = mul(tr(pivot.x, pivot.y), mul(scl(sx, sy), tr(-pivot.x, -pivot.y)));
  if (a.spin) m = mul(rotAbout(c.spin * a.spin * DEG, pivot), m);
  if (a.float) m = mul(tr(0, pulse * a.float), m);
  return m;
}

/**
 * Pose a rig. All angles in channels are degrees, clockwise. Pass `out` to reuse its maps, and
 * `phased` to give parts with a `PartAnim.phase` their own offset pulse, spin and flap.
 */
export function poseRig(rig: RigDef, c: Channels, out?: Pose, phased?: PhaseSampler): Pose {
  const st = statics(rig);
  const o = rig.origin;
  const pelvis = tr(c.pelvisX, c.pelvisY);
  const torso = mul(pelvis, rotAbout(c.torsoRot * DEG, rig.pivots.torso));
  const head = mul(torso, rotAbout(c.headRot * DEG, rig.pivots.head));
  const wInfo = st.wInfo;
  const place = st.place;
  const carry = st.carry;
  // recoil pushes the weapon back along its barrel (part +x runs from the muzzle to the stock)
  const back = st.back;
  const kick = c.kick * (wInfo?.recoil ?? 0);
  // the gun bone moves the weapon; `gun` (bone · placement) maps the weapon's own coords
  const gunBone = mul(torso, mul(tr(c.gunX + back.x * kick, c.gunY + back.y * kick), rotAbout(c.gunRot * DEG, carry)));
  const gun = mul(gunBone, place);
  const bones: Record<string, Mat> = { root: IDENT, pelvis, torso, head, gun: gunBone };

  // Figure transform: root offset, then rotate/scale about the feet, into rig space.
  const figure = mul(
    tr(c.rootX, c.rootY - c.lift),
    mul(rot(c.rootRot * DEG), mul(scl(1 + c.rootSX, 1 + c.rootSY), tr(-o.x, -o.y))),
  );

  const mats = out?.mats ?? new Map<string, Mat>();
  const limbs = out?.limbs ?? new Map<string, PosedLimb>();
  for (let li = 0; li < rig.limbs.length; li++) {
    const l = rig.limbs[li]!;
    const key = st.limbKeys[li]!;
    const rest = limbRest(l);
    const from = bones[l.from.bone]!;
    const root = apply(from, l.from.at);
    let target: Pt;
    if (l.kind === "arm" && l.grip && wInfo?.anchors[l.grip]) target = apply(gun, wInfo.anchors[l.grip]!);
    else if (l.kind === "leg") {
      // Flyers' legs hang from the hips; walkers' feet go to the gait targets on the ground.
      target = c.lift > 0.5 ? apply(pelvis, { x: l.end.x - 3, y: l.end.y - 4 }) : footTarget(rig, l, c.gait, c.gaitW);
    } else target = apply(l.to ? bones[l.to]! : from, l.end);
    const ik = solveIk(root, target, rest.l1, rest.l2, rest.bend);
    const a1 = angle(root, ik.joint);
    const a2 = angle(ik.joint, ik.end);
    limbs.set(l.id, { root, joint: ik.joint, end: ik.end, a1, a2 });
    mats.set(key.upper, mul(figure, mul(tr(root.x, root.y), rot(a1))));
    mats.set(key.lower, mul(figure, mul(tr(ik.joint.x, ik.joint.y), rot(a2))));
    bones[key.upper] = seg(root, a1, l.from.at, rest.a1);
    bones[key.lower] = seg(ik.joint, a2, l.joint, rest.a2);
    bones[key.mid] = seg(ik.joint, (a1 - rest.a1 + a2 - rest.a2) / 2, l.joint, 0);
    // feet stay flat on the ground and only tip when lifted; hands don't turn
    const lifted = l.kind === "leg" && rig.view === "side" ? Math.max(0, Math.min(1, (l.end.y - ik.end.y) / 6)) : 0;
    bones[key.end] = seg(ik.end, l.kind === "leg" ? (a2 - rest.a2) * 0.6 * lifted : 0, l.end, 0);
  }

  for (let i = 0; i < rig.parts.length; i++) {
    const p = rig.parts[i]!;
    const b = bones[p.bone as BoneRef] ?? IDENT;
    const pv = st.partPivot[i];
    const ph = p.anim?.phase;
    const local = pv ? mul(st.partPlace[i]!, animMat(p, pv, ph && phased ? phased(ph) : c)) : st.partPlace[i]!;
    mats.set(p.id, mul(figure, mul(b, local)));
  }

  let muzzle: Pt;
  let muzzleDir: Pt;
  if (wInfo) {
    const muzzleLocal = wInfo.anchors.muzzle ?? { x: 0, y: 0 };
    const gunFig = mul(figure, gun);
    muzzle = apply(gunFig, muzzleLocal);
    const ahead = apply(gunFig, { x: muzzleLocal.x - 10, y: muzzleLocal.y });
    const L = Math.hypot(ahead.x - muzzle.x, ahead.y - muzzle.y) || 1;
    muzzleDir = { x: (ahead.x - muzzle.x) / L, y: (ahead.y - muzzle.y) / L };
  } else {
    muzzle = apply(figure, st.top);
    muzzleDir = rig.view === "side" ? { x: -1, y: 0 } : { x: 0, y: -1 };
  }
  if (out) {
    out.muzzle = muzzle;
    out.muzzleDir = muzzleDir;
    out.figure = figure;
    return out;
  }
  return { mats, limbs, muzzle, muzzleDir, figure };
}

/** Draw order: parts and limb segments sorted by z (ties: manifest order). */
export function drawOrder(rig: RigDef): { id: string; z: number; limb?: { def: LimbDef; seg: "upper" | "lower" } }[] {
  const out: { id: string; z: number; limb?: { def: LimbDef; seg: "upper" | "lower" }; n: number }[] = [];
  let n = 0;
  for (const p of rig.parts) out.push({ id: p.id, z: p.z, n: n++ });
  for (const l of rig.limbs) {
    out.push({ id: `${l.id}.upper`, z: l.upper.z, limb: { def: l, seg: "upper" }, n: n++ });
    out.push({ id: `${l.id}.lower`, z: l.lower.z, limb: { def: l, seg: "lower" }, n: n++ });
  }
  return out.sort((a, b) => a.z - b.z || a.n - b.n).map(({ id, z, limb }) => (limb ? { id, z, limb } : { id, z }));
}
