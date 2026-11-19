// The Militia trooper kit: the line trooper's frame (legs, boots, knee and shin plates, arms,
// gauntlets) as a builder with slots for the helm, torso, pack, shoulder pads, weapon, an off-hand
// item and extras, plus an upper-body pose (`body`: crouch, sit, lean) that every upper part and
// the hips follow. The medic, marksman and veterans are all assembled from it, and the outriders'
// rider sits on a bike with it. Parts are drawn once, in the standing trooper's frame coords; the
// kit re-seats them for the pose, so the Forge's Militia kit can swap any slot without redrawing.

import bootBack from "../../parts/militia/trooper/boot-back.svg?raw";
import bootFront from "../../parts/militia/trooper/boot-front.svg?raw";
import gauntletSide from "../../parts/militia/trooper/gauntlet.svg?raw";
import helmSide from "../../parts/militia/trooper/helm.svg?raw";
import kneeBack from "../../parts/militia/trooper/knee-back.svg?raw";
import kneeFront from "../../parts/militia/trooper/knee-front.svg?raw";
import packSide from "../../parts/militia/trooper/pack.svg?raw";
import padBack from "../../parts/militia/trooper/pad-back.svg?raw";
import padFront from "../../parts/militia/trooper/pad-front.svg?raw";
import shinBack from "../../parts/militia/trooper/shin-back.svg?raw";
import shinFront from "../../parts/militia/trooper/shin-front.svg?raw";
import torsoSide from "../../parts/militia/trooper/torso.svg?raw";
import gauntletTop from "../../parts/militia/trooper-top/gauntlet.svg?raw";
import helmTop from "../../parts/militia/trooper-top/helm.svg?raw";
import packTop from "../../parts/militia/trooper-top/pack.svg?raw";
import torsoTop from "../../parts/militia/trooper-top/torso.svg?raw";
import { solveIk } from "../../pose";
import { readPart } from "../../svg";
import type { BoneRef, Clip, ClipId, FrameType, LimbDef, PartAnim, PartUse, Place, Pt, RigDef } from "../../types";

/** Design units per board inch, shared by every army (the trooper stands about 1.55"). */
export const UPI = 105;
export const MILITIA_GROUND = "#4f4a41";

const DEG = Math.PI / 180;
const ID: Place = { x: 0, y: 0, rot: 0 };

// ---------- placement maths ----------

/** A point through a placement. */
export function through(p: Place, pt: Pt): Pt {
  const s = p.scale ?? 1;
  const c = Math.cos(p.rot * DEG);
  const n = Math.sin(p.rot * DEG);
  return { x: p.x + s * (pt.x * c - pt.y * n), y: p.y + s * (pt.x * n + pt.y * c) };
}

/** Placement `outer` after placement `inner` (inner is applied first). */
export function compose(outer: Place, inner?: Place): Place {
  const q = inner ?? ID;
  const at = through(outer, { x: q.x, y: q.y });
  const scale = (outer.scale ?? 1) * (q.scale ?? 1);
  return { x: at.x, y: at.y, rot: outer.rot + q.rot, ...(scale !== 1 ? { scale } : {}) };
}

/** The placement that turns a part `rot` degrees about its own point `from` and sets it down at `to`. */
export function reseat(from: Pt, to: Pt, rot = 0): Place {
  const r = through({ x: 0, y: 0, rot }, from);
  return { x: to.x - r.x, y: to.y - r.y, rot };
}

/** A placement that puts anchor `anchor` of part `src` at `at`, turned `rot` degrees. */
export function placeAt(src: string, anchor: string, at: Pt, rot = 0, scale = 1): Place {
  const a = readPart(src).anchors[anchor] ?? { x: 0, y: 0 };
  const r = through({ x: 0, y: 0, rot, scale }, a);
  return { x: at.x - r.x, y: at.y - r.y, rot, ...(scale !== 1 ? { scale } : {}) };
}

/** Where anchor `anchor` of a placed part lands. */
export function anchorAt(src: string, place: Place, anchor: string): Pt {
  return through(place, readPart(src).anchors[anchor] ?? { x: 0, y: 0 });
}

const ang = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x);
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** A joint between `root` and `end` for bones `l1`, `l2`, bent to the side whose x is lower (`dir` -1) or higher (+1). */
export function jointFor(root: Pt, end: Pt, l1: number, l2: number, dir: -1 | 1): Pt {
  return jointBy(root, end, l1, l2, (p) => p.x * dir);
}

/** The joint (of the two IK solutions) that scores higher: elbows hang down with `p => p.y`. */
export function jointBy(root: Pt, end: Pt, l1: number, l2: number, score: (p: Pt) => number): Pt {
  const a = solveIk(root, end, l1, l2, 1).joint;
  const b = solveIk(root, end, l1, l2, -1).joint;
  return score(a) >= score(b) ? a : b;
}

// ---------- the standing trooper's frame (rest pose) ----------

/** The standing line trooper, in frame coords: what every kit part is drawn against. */
export const STAND = {
  origin: { x: 60, y: 184 },
  torso: { x: 60, y: 110 },
  neck: { x: 59, y: 57 },
  hipF: { x: 55, y: 106 },
  hipB: { x: 66, y: 106 },
  kneeF: { x: 50, y: 145 },
  kneeB: { x: 71, y: 145 },
  footF: { x: 48, y: 170 },
  footB: { x: 70, y: 170 },
  shoulderF: { x: 47, y: 70 },
  shoulderB: { x: 75, y: 72 },
  /** Arm bones (upper, lower) and leg bones (thigh, shin). */
  armF: [Math.hypot(11, 12), Math.hypot(3.16, 23.12)] as [number, number],
  armB: [Math.hypot(4, 20), Math.hypot(17, 4)] as [number, number],
  legF: [Math.hypot(5, 39), Math.hypot(2, 25)] as [number, number],
  legB: [Math.hypot(5, 39), Math.hypot(1, 25)] as [number, number],
};

export interface LegPose {
  /** Upper-body pose: the hips ride it. */
  body: Place;
  /** Feet on the ground (frame coords, y = 170 is the trooper's ground line). */
  footF: Pt;
  footB: Pt;
  /** Which way the knees bend: -1 forward (a crouch), +1 back. Default: as the trooper's. */
  knees?: -1 | 1;
}

const STAND_LEGS: LegPose = { body: ID, footF: STAND.footF, footB: STAND.footB };

/** Two ink legs with knee, shin and boot plates re-seated to the pose, and the trooper's walk cycle. */
export function trooperLegs(pose: LegPose = STAND_LEGS, ground = 170): { limbs: LimbDef[]; parts: PartUse[]; gait: Record<string, Pt>[] } {
  const legs: { id: "legF" | "legB"; hip: Pt; knee: Pt; foot: Pt; l: [number, number]; shin: string; knee_: string; boot: string; slot: "suit" | "suitShade"; z: number }[] = [
    { id: "legB", hip: STAND.hipB, knee: STAND.kneeB, foot: STAND.footB, l: STAND.legB, shin: shinBack, knee_: kneeBack, boot: bootBack, slot: "suitShade", z: 1 },
    { id: "legF", hip: STAND.hipF, knee: STAND.kneeF, foot: STAND.footF, l: STAND.legF, shin: shinFront, knee_: kneeFront, boot: bootFront, slot: "suit", z: 5 },
  ];
  const limbs: LimbDef[] = [];
  const parts: PartUse[] = [];
  const offsets: Record<string, number[]> = { legB: [14, -8, -20, -2], legF: [-12, 4, 22, 10] };
  const lifts: Record<string, number[]> = { legB: [0, -10, 0, 0], legF: [0, 0, 0, -10] };
  const gait: Record<string, Pt>[] = [{}, {}, {}, {}];
  for (const L of legs) {
    const hip = through(pose.body, L.hip);
    const foot = L.id === "legF" ? pose.footF : pose.footB;
    const same = dist(hip, L.hip) < 1e-6 && dist(foot, L.foot) < 1e-6;
    const knee = same ? L.knee : jointFor(hip, foot, L.l[0], L.l[1], pose.knees ?? -1);
    const r1 = (ang(hip, knee) - ang(L.hip, L.knee)) / DEG;
    const r2 = (ang(knee, foot) - ang(L.knee, L.foot)) / DEG;
    limbs.push({
      id: L.id,
      kind: "leg",
      from: { bone: "pelvis", at: hip },
      joint: knee,
      end: foot,
      upper: { width: 7.4, slot: L.slot, z: L.z },
      lower: { width: 7.4, slot: L.slot, z: L.z + 0.1 },
    });
    const z = L.id === "legF" ? 6 : 2;
    parts.push(
      { id: L.id === "legF" ? "shin-front" : "shin-back", src: L.shin, bone: `${L.id}.lower`, place: same ? undefined : reseat(L.knee, knee, r2), z },
      { id: L.id === "legF" ? "knee-front" : "knee-back", src: L.knee_, bone: `${L.id}.mid`, place: same ? undefined : reseat(L.knee, knee, (r1 + r2) / 2), z: z + 1 },
      { id: L.id === "legF" ? "boot-front" : "boot-back", src: L.boot, bone: `${L.id}.end`, place: same ? undefined : reseat(L.foot, foot), z: z + 2 },
    );
    for (let k = 0; k < 4; k++) gait[k]![L.id] = { x: foot.x + offsets[L.id]![k]!, y: ground + lifts[L.id]![k]! };
  }
  return { limbs, parts, gait };
}

// ---------- arms ----------

/** An arm holding a weapon grip, or a free hand holding something (an injector, a wrench). */
export type ArmUse =
  | { grip: "g1" | "g2" }
  | {
      /** The thing in the hand (drawn round its own `pivot`, which goes in the palm). */
      hand: string;
      /** Rest hand position (frame coords) and the bone it follows. */
      at: Pt;
      to: "torso" | "head" | "pelvis";
      rot?: number;
      /** Elbow side: -1 forward, +1 back (default: hanging down). */
      elbow?: -1 | 0 | 1;
    };

function armLimb(
  id: "armF" | "armB",
  shoulder: Pt,
  hand: Pt,
  l: [number, number],
  elbow: -1 | 0 | 1,
  grip: string | undefined,
  to: LimbDef["to"],
): LimbDef {
  // keep the bones' lengths when the hand is in reach; stretch the forearm a little when it isn't
  const d = dist(shoulder, hand);
  const lower = Math.max(l[1], d - l[0] + 0.5);
  // elbows hang down unless told to point forward (-1) or back (+1)
  const joint = jointBy(shoulder, hand, l[0], lower, elbow ? (p) => p.x * elbow : (p) => p.y);
  const near = id === "armF";
  return {
    id,
    kind: "arm",
    from: { bone: "torso", at: shoulder },
    joint,
    end: hand,
    ...(grip ? { grip } : { to }),
    upper: { width: 6.6, slot: near ? "suit" : "suitShade", z: near ? 12 : 14 },
    lower: { width: 9, slot: "plate", stripe: "plateShade", z: near ? 13 : 15 },
  };
}

// ---------- the side-view builder ----------

export interface ExtraPart {
  id: string;
  src: string;
  /** torso, head and pelvis parts follow the upper-body pose; root parts stay where they're drawn. */
  bone: BoneRef;
  z: number;
  /** Extra placement in the standing frame (before the body pose). */
  place?: Place;
  anim?: PartAnim;
  /** Drawn in final frame coords already (don't apply the body pose). */
  absolute?: boolean;
}

export interface TrooperKitSide {
  id: string;
  name: string;
  frame?: FrameType;
  /** Upper-body pose from the standing frame: a crouch, a seat, a lean. */
  body?: Place;
  /** Feet (frame coords) and knee direction; default: standing. Null: no legs (the rider's are added separately). */
  legs?: Omit<LegPose, "body"> | null;
  helm?: string;
  torso?: string;
  pack?: string | null;
  padFront?: string | null;
  padBack?: string | null;
  extras?: ExtraPart[];
  /** The weapon and its placement in FINAL frame coords (the hands go to its grips). */
  weapon: { src: string; place: Place };
  armF?: ArmUse;
  armB?: ArmUse;
  height: number;
  origin?: Pt;
  gait?: Record<string, Pt>[];
  stride?: number;
  clips?: Partial<Record<ClipId, Clip>>;
  fx?: RigDef["fx"];
  ground?: string;
  /** Additional limbs and parts in final frame coords (a bike, the rider's own legs). */
  more?: { limbs?: LimbDef[]; parts?: PartUse[] };
}

export function trooperKitSide(o: TrooperKitSide): RigDef {
  const body = o.body ?? ID;
  const up = (src: string, id: string, bone: BoneRef, z: number, place?: Place, anim?: PartAnim): PartUse => ({
    id,
    src,
    bone,
    place: body === ID && !place ? undefined : compose(body, place),
    z,
    ...(anim ? { anim } : {}),
  });
  const parts: PartUse[] = [];
  if (o.pack !== null) parts.push(up(o.pack ?? packSide, "pack", "torso", 0));
  parts.push(up(o.torso ?? torsoSide, "torso", "torso", 10));
  if (o.padFront !== null) parts.push(up(o.padFront ?? padFront, "pad-front", "torso", 17));
  if (o.padBack !== null) parts.push(up(o.padBack ?? padBack, "pad-back", "torso", 18));
  parts.push(up(o.helm ?? helmSide, "helm", "head", 19));
  for (const e of o.extras ?? []) {
    if (e.absolute || e.bone === "root") parts.push({ id: e.id, src: e.src, bone: e.bone, place: e.place, z: e.z, ...(e.anim ? { anim: e.anim } : {}) });
    else parts.push(up(e.src, e.id, e.bone, e.z, e.place, e.anim));
  }
  parts.push({ id: "weapon", src: o.weapon.src, bone: "gun", place: o.weapon.place, z: 11 });

  const limbs: LimbDef[] = [];
  if (o.legs !== null) {
    const legs = trooperLegs({ body, ...(o.legs ?? { footF: STAND.footF, footB: STAND.footB }) });
    limbs.push(...legs.limbs);
    parts.push(...legs.parts);
    o = { ...o, gait: o.gait ?? legs.gait };
  }
  const arms: ["armF" | "armB", ArmUse, Pt, [number, number], "hand-front" | "hand-back", number][] = [
    ["armF", o.armF ?? { grip: "g1" }, through(body, STAND.shoulderF), STAND.armF, "hand-front", 16],
    ["armB", o.armB ?? { grip: "g2" }, through(body, STAND.shoulderB), STAND.armB, "hand-back", 16.1],
  ];
  for (const [id, use, shoulder, l, handId, z] of arms) {
    if ("grip" in use) {
      const hand = anchorAt(o.weapon.src, o.weapon.place, use.grip);
      limbs.push(armLimb(id, shoulder, hand, l, 0, use.grip, undefined));
      parts.push({ id: handId, src: gauntletSide, bone: `${id}.end`, place: { x: hand.x, y: hand.y, rot: 0 }, z });
    } else {
      limbs.push(armLimb(id, shoulder, use.at, l, use.elbow ?? 0, undefined, use.to));
      parts.push({ id: handId, src: use.hand, bone: `${id}.end`, place: placeAt(use.hand, "pivot", use.at, use.rot ?? 0), z });
    }
  }
  limbs.push(...(o.more?.limbs ?? []));
  parts.push(...(o.more?.parts ?? []));
  return {
    id: o.id,
    name: o.name,
    view: "side",
    frame: o.frame ?? "lean",
    origin: o.origin ?? STAND.origin,
    unitsPerInch: UPI,
    height: o.height,
    pivots: { torso: through(body, STAND.torso), head: through(body, STAND.neck) },
    parts,
    limbs,
    limbInk: 2.2,
    weapon: "weapon",
    gait: o.gait,
    ...(o.stride ? { stride: o.stride } : {}),
    ...(o.clips ? { clips: o.clips } : {}),
    ...(o.fx ? { fx: o.fx } : {}),
    ground: o.ground ?? MILITIA_GROUND,
  };
}

// ---------- the top-view builder ----------

export type TopArmUse = { grip: "g1" | "g2" } | { hand: string; at: Pt; to: "torso" | "head" | "pelvis"; rot?: number };

export interface TrooperKitTop {
  id: string;
  name: string;
  frame?: FrameType;
  helm?: string;
  torso?: string;
  pack?: string | null;
  extras?: ExtraPart[];
  weapon: { src: string; place: Place };
  armL?: TopArmUse;
  armR?: TopArmUse;
  /** The whole figure's scale (a heavier veteran is a touch broader). */
  scale?: number;
  height?: number;
  shadow?: RigDef["shadow"];
  clips?: Partial<Record<ClipId, Clip>>;
  fx?: RigDef["fx"];
  ground?: string;
}

export function trooperKitTop(o: TrooperKitTop): RigDef {
  const s = o.scale ?? 1;
  const S: Place = { x: 0, y: 0, rot: 0, ...(s !== 1 ? { scale: s } : {}) };
  const up = (src: string, id: string, bone: BoneRef, z: number, place?: Place, anim?: PartAnim): PartUse => ({
    id,
    src,
    bone,
    place: s === 1 && !place ? undefined : compose(S, place),
    z,
    ...(anim ? { anim } : {}),
  });
  const parts: PartUse[] = [];
  if (o.pack !== null) parts.push(up(o.pack ?? packTop, "pack", "torso", 0));
  parts.push(up(o.torso ?? torsoTop, "torso", "torso", 5));
  parts.push(up(o.helm ?? helmTop, "helm", "head", 6));
  for (const e of o.extras ?? []) parts.push(up(e.src, e.id, e.bone, e.z, e.place, e.anim));
  const wp = compose(S, o.weapon.place);
  parts.push({ id: "weapon", src: o.weapon.src, bone: "gun", place: wp, z: 1 });
  const limbs: LimbDef[] = [];
  const arms: ["armL" | "armR", TopArmUse, Pt, Pt, "hand-left" | "hand-right", number][] = [
    ["armL", o.armL ?? { grip: "g1" }, { x: -14 * s, y: -1 * s }, { x: -18 * s, y: -14 * s }, "hand-left", 4],
    ["armR", o.armR ?? { grip: "g2" }, { x: 14 * s, y: -1 * s }, { x: 11 * s, y: -14 * s }, "hand-right", 4.1],
  ];
  for (const [id, use, shoulder, elbowHint, handId, z] of arms) {
    const hand = "grip" in use ? anchorAt(o.weapon.src, wp, use.grip) : use.at;
    // the elbow sits out to the side, between the shoulder and the hand
    const l1 = 13.6 * s;
    const l2 = Math.max(12 * s, dist(shoulder, hand) - l1 + 0.5);
    const joint = jointFor(shoulder, hand, l1, l2, elbowHint.x < 0 ? -1 : 1);
    limbs.push({
      id,
      kind: "arm",
      from: { bone: "torso", at: shoulder },
      joint,
      end: hand,
      ...("grip" in use ? { grip: use.grip } : { to: use.to }),
      upper: { width: 6 * s, slot: id === "armL" ? "suit" : "suitShade", z: id === "armL" ? 2 : 2.2 },
      lower: { width: 7 * s, slot: "plate", z: id === "armL" ? 2.1 : 2.3 },
    });
    const src = "grip" in use ? gauntletTop : use.hand;
    parts.push({ id: handId, src, bone: `${id}.end`, place: "grip" in use ? { x: hand.x, y: hand.y, rot: 0, ...(s !== 1 ? { scale: s } : {}) } : placeAt(src, "pivot", hand, use.rot ?? 0, s), z });
  }
  return {
    id: o.id,
    name: o.name,
    view: "top",
    frame: o.frame ?? "lean",
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: o.height ?? 52 * s,
    pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: -2 * s } },
    parts,
    limbs,
    limbInk: 1.6,
    weapon: "weapon",
    ...(o.clips ? { clips: o.clips } : {}),
    ...(o.fx ? { fx: o.fx } : {}),
    ground: o.ground ?? MILITIA_GROUND,
    shadow: o.shadow ?? { x: 5 * s, y: 7 * s, r: 21.5 * s },
  };
}
