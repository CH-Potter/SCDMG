// Posing: animation channels → a matrix for every drawable (part or limb segment), in rig space
// (origin at the feet / base centre, design units). Pure and deterministic, so the reference unit's
// poses can be snapshot-tested. Limbs are two-bone IK chains solved from the shoulder/hip to the
// weapon grip/foot target, so any weapon fits any frame: the arms follow its grips.

import { readPart } from "./svg";
import type { BoneRef, Channels, LimbDef, Mat, Pt, RigDef } from "./types";

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
export const placeMat = (p: { x: number; y: number; rot: number } | undefined): Mat => (p ? mul(tr(p.x, p.y), rot(p.rot * DEG)) : IDENT);

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

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Foot target of a leg for gait position `g` (wraps), blended with the stand pose by `w`. */
function footTarget(rig: RigDef, limb: LimbDef, g: number, w: number): Pt {
  const keys = rig.gait;
  if (!keys?.length || w <= 0) return limb.end;
  const n = keys.length;
  const gg = ((g % n) + n) % n;
  const i = Math.floor(gg);
  const t = smooth(gg - i);
  const a = keys[i]![limb.id] ?? limb.end;
  const b = keys[(i + 1) % n]![limb.id] ?? limb.end;
  const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  const k = Math.min(1, w);
  return { x: limb.end.x + (p.x - limb.end.x) * k, y: limb.end.y + (p.y - limb.end.y) * k };
}

/** Pose a rig. All angles in channels are degrees, clockwise. */
export function poseRig(rig: RigDef, c: Channels): Pose {
  const o = rig.origin;
  const pelvis = tr(c.pelvisX, c.pelvisY);
  const torso = mul(pelvis, rotAbout(c.torsoRot * DEG, rig.pivots.torso));
  const head = mul(torso, rotAbout(c.headRot * DEG, rig.pivots.head));
  const wpn = rig.parts.find((p) => p.id === rig.weapon);
  const wInfo = wpn ? readPart(wpn.src) : null;
  const place = placeMat(wpn?.place);
  const carry = wpn?.place ?? { x: 0, y: 0, rot: 0 };
  // recoil pushes the weapon back along its barrel (part +x runs from the muzzle to the stock)
  const back = { x: Math.cos(carry.rot * DEG), y: Math.sin(carry.rot * DEG) };
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

  const mats = new Map<string, Mat>();
  const limbs = new Map<string, PosedLimb>();
  for (const l of rig.limbs) {
    const rest = limbRest(l);
    const from = bones[l.from.bone]!;
    const root = apply(from, l.from.at);
    let target: Pt;
    if (l.kind === "arm" && l.grip && wInfo?.anchors[l.grip]) target = apply(gun, wInfo.anchors[l.grip]!);
    else if (l.kind === "leg") {
      // Flyers' legs hang from the hips; walkers' feet go to the gait targets on the ground.
      target = c.lift > 0.5 ? apply(pelvis, { x: l.end.x - 3, y: l.end.y - 4 }) : footTarget(rig, l, c.gait, c.gaitW);
    } else target = apply(from, l.end);
    const ik = solveIk(root, target, rest.l1, rest.l2, rest.bend);
    const a1 = angle(root, ik.joint);
    const a2 = angle(ik.joint, ik.end);
    limbs.set(l.id, { root, joint: ik.joint, end: ik.end, a1, a2 });
    mats.set(`${l.id}.upper`, mul(figure, mul(tr(root.x, root.y), rot(a1))));
    mats.set(`${l.id}.lower`, mul(figure, mul(tr(ik.joint.x, ik.joint.y), rot(a2))));
    const seg = (p: Pt, a: number, restP: Pt, restA: number): Mat => mul(tr(p.x, p.y), mul(rot(a - restA), tr(-restP.x, -restP.y)));
    bones[`${l.id}.upper`] = seg(root, a1, l.from.at, rest.a1);
    bones[`${l.id}.lower`] = seg(ik.joint, a2, l.joint, rest.a2);
    bones[`${l.id}.mid`] = seg(ik.joint, (a1 - rest.a1 + a2 - rest.a2) / 2, l.joint, 0);
    // feet stay flat on the ground and only tip when lifted; hands don't turn
    const lifted = l.kind === "leg" ? Math.max(0, Math.min(1, (l.end.y - ik.end.y) / 6)) : 0;
    bones[`${l.id}.end`] = seg(ik.end, l.kind === "leg" ? (a2 - rest.a2) * 0.6 * lifted : 0, l.end, 0);
  }

  for (const p of rig.parts) {
    const b = bones[p.bone as BoneRef] ?? IDENT;
    mats.set(p.id, mul(figure, mul(b, placeMat(p.place))));
  }

  const muzzleLocal = wInfo?.anchors.muzzle ?? { x: 0, y: 0 };
  const gunFig = mul(figure, gun);
  const muzzle = apply(gunFig, muzzleLocal);
  const ahead = apply(gunFig, { x: muzzleLocal.x - 10, y: muzzleLocal.y });
  const L = Math.hypot(ahead.x - muzzle.x, ahead.y - muzzle.y) || 1;
  return { mats, limbs, muzzle, muzzleDir: { x: (ahead.x - muzzle.x) / L, y: (ahead.y - muzzle.y) / L }, figure };
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
