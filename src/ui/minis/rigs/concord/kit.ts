// The Lumen Concord kit: shared helpers and the courtier (humanoid) builder that the Phase Guard,
// Ray Lancer, Blink Dancers, Jetwing Scouts and Beam Warden are all assembled from. One frame, one
// set of legs, arms solved to whatever the weapon's grips are, and slots for the helm, the collar
// (which carries the team gem), the weapon, an off-hand item and things worn on the hips or back.
// Parts swap without redrawing, which is what the Forge's Concord kit will build on.
//
// The Concord are drawn taller and slimmer than the Militia and stand perfectly upright, chin up:
// their clips are the lean frame's with the forward lean taken out.

import torsoSide from "../../parts/concord/courtier/torso.svg?raw";
import pauldron from "../../parts/concord/courtier/pauldron.svg?raw";
import handSide from "../../parts/concord/courtier/hand.svg?raw";
import sabaton from "../../parts/concord/courtier/sabaton.svg?raw";
import pointe from "../../parts/concord/courtier/pointe.svg?raw";
import knee from "../../parts/concord/courtier/knee.svg?raw";
import torsoTop from "../../parts/concord/courtier-top/torso.svg?raw";
import handTop from "../../parts/concord/courtier-top/hand.svg?raw";
import { FRAME_CLIPS } from "../../clips";
import { solveIk } from "../../pose";
import { readPart } from "../../svg";
import type { Clip, ClipId, Key, LimbDef, LimbSeg, PartUse, Place, Pt, RigDef } from "../../types";

/** Design units per inch, shared with the Militia trooper so every army stands at one scale. */
export const UPI = 105;
/** The Concord's polished hex-tile ground. */
export const CONCORD_GROUND = "#5a5670";
/** Lavender light: beams, muzzle flashes, thruster puffs. */
export const LAVENDER = "#b48cf2";
export const CRYSTAL = "#d9ccff";

const DEG = Math.PI / 180;

/** Where anchor `anchor` of part `src` lands in frame coords once the part is placed. */
export function anchorAt(src: string, place: Place, anchor: string): Pt {
  const a = readPart(src).anchors[anchor] ?? { x: 0, y: 0 };
  const s = place.scale ?? 1;
  const c = Math.cos(place.rot * DEG);
  const n = Math.sin(place.rot * DEG);
  return { x: place.x + s * (a.x * c - a.y * n), y: place.y + s * (a.x * n + a.y * c) };
}

/** A placement that puts anchor `anchor` of part `src` at `at`, turned `rot` degrees. */
export function placeAt(src: string, anchor: string, at: Pt, rot: number, scale = 1): Place {
  const a = readPart(src).anchors[anchor] ?? { x: 0, y: 0 };
  const c = Math.cos(rot * DEG);
  const n = Math.sin(rot * DEG);
  return { x: at.x - scale * (a.x * c - a.y * n), y: at.y - scale * (a.x * n + a.y * c), rot, scale: scale === 1 ? undefined : scale };
}

/**
 * An arm from a shoulder to a hand with fixed bone lengths; the elbow is solved at rest and goes
 * whichever way reads as "down and back" (or an explicit elbow point when given).
 */
export function arm(
  id: string,
  from: LimbDef["from"],
  hand: Pt,
  l: [number, number],
  upper: LimbSeg,
  lower: LimbSeg,
  extra: Partial<Pick<LimbDef, "grip" | "to">> & { elbow?: Pt; prefer?: (p: Pt) => number } = {},
): LimbDef {
  const { elbow, prefer, ...rest } = extra;
  if (elbow) return { id, kind: "arm", from, joint: elbow, end: hand, upper, lower, ...rest };
  const score = prefer ?? ((p: Pt) => p.x * 0.6 + p.y);
  const a = solveIk(from.at, hand, l[0], l[1], 1);
  const b = solveIk(from.at, hand, l[0], l[1], -1);
  const ik = score(a.joint) >= score(b.joint) ? a : b;
  return { id, kind: "arm", from, joint: ik.joint, end: ik.end, upper, lower, ...rest };
}

/** The courtly clips: the lean frame's, upright and chin up (Concord never lean forward). */
function courtly(view: "side" | "top"): Partial<Record<ClipId, Clip>> | undefined {
  if (view === "top") return undefined;
  const L = FRAME_CLIPS.lean.side;
  const loop = (period: number, a: number, b: number): Key[] => [[0, a], [period / 2, b], [period, a]];
  // two beats per 560 ms walk cycle (one per step)
  const twice = (a: number, b: number): Key[] => [[0, a], [140, b], [280, a], [420, b], [560, a]];
  return {
    idle: { ...L.idle, tracks: { ...L.idle.tracks, torsoRot: loop(2400, 0.6, 1.3), headRot: loop(2400, 2, 3.2) } },
    step: { ...L.step, tracks: { ...L.step.tracks, torsoRot: twice(1, 0.4), headRot: twice(2.6, 1.8), pelvisY: twice(1.2, -1.2) } },
  };
}

/** A gliding step for figures with no legs to walk on (the Beam Warden's robe): no gait, no bob. */
export function glideClips(): Partial<Record<ClipId, Clip>> {
  const L = FRAME_CLIPS.lean.side;
  const loop = (period: number, a: number, b: number): Key[] => [[0, a], [period / 2, b], [period, a]];
  return {
    idle: { ...L.idle, tracks: { ...L.idle.tracks, torsoRot: loop(2400, 0.4, 1), headRot: loop(2400, 2, 3), pelvisY: loop(2400, 0, -1.4) } },
    step: { id: "step", dur: 900, loop: true, tracks: { pelvisY: loop(900, -1, 1), torsoRot: loop(900, 1, 0.4), headRot: loop(900, 2.4, 2), gunY: loop(900, 0, 1) } },
  };
}

// ---------- side: the courtier frame ----------
// Frame coords: feet at (60, 190), hips at y 108, waist y 95, shoulders y 68, head pivot (60, 57).

const SHOULDER_F = { x: 50, y: 68 };
const SHOULDER_B = { x: 70, y: 68 };
const ARM: [number, number] = [25, 25];
const seg = (width: number, slot: LimbSeg["slot"], z: number, stripe?: LimbSeg["slot"]): LimbSeg => ({ width, slot, z, ...(stripe ? { stripe } : {}) });

export interface CourtierSide {
  id: string;
  name: string;
  /** Side height, feet to the highest point (u). */
  height: number;
  helm: string;
  collar: string;
  weapon: { src: string; place: Place };
  /** What the free (far) hand holds: a part, by its grip anchor, at a rest hand position. */
  offHand?: { src: string; anchor: string; at: Pt; rot: number; elbow?: Pt };
  legs?: "stand" | "pointe" | "none";
  /** Worn on the hips (coat tails, a fan skirt, a robe): rides the pelvis. */
  hips?: { id: string; src: string; z: number }[];
  /** Extra parts (a pack and wings on the torso, a halo on the head...). */
  extra?: PartUse[];
  clips?: Partial<Record<ClipId, Clip>>;
  fx?: RigDef["fx"];
}

export function courtierSide(o: CourtierSide): RigDef {
  const wpn = readPart(o.weapon.src);
  const g1 = anchorAt(o.weapon.src, o.weapon.place, "g1");
  const twoHanded = !!wpn.anchors.g2;
  const front = arm("armF", { bone: "torso", at: SHOULDER_F }, g1, ARM, seg(5.4, "suit", 12), seg(6.4, "plate", 13, "plateShade"), { grip: "g1" });
  let back: LimbDef;
  const parts: PartUse[] = [
    { id: "torso", src: torsoSide, bone: "torso", z: 10 },
    { id: "weapon", src: o.weapon.src, bone: "gun", place: o.weapon.place, z: 11 },
    { id: "hand-front", src: handSide, bone: "armF.end", place: { ...front.end, rot: 0 }, z: 14 },
    { id: "pauldron-front", src: pauldron, bone: "torso", place: { x: 51, y: 71, rot: -6 }, z: 15 },
    { id: "pauldron-back", src: pauldron, bone: "torso", place: { x: 70, y: 70, rot: 8 }, z: 8.6 },
    { id: "collar", src: o.collar, bone: "torso", z: 16 },
    { id: "helm", src: o.helm, bone: "head", z: 19 },
  ];
  if (twoHanded) {
    back = arm("armB", { bone: "torso", at: SHOULDER_B }, anchorAt(o.weapon.src, o.weapon.place, "g2"), ARM, seg(5.4, "suitShade", 11.4), seg(6.4, "plateShade", 11.5), { grip: "g2" });
    parts.push({ id: "hand-back", src: handSide, bone: "armB.end", place: { ...back.end, rot: 0 }, z: 11.6 });
  } else if (o.offHand) {
    const h = o.offHand;
    back = arm("armB", { bone: "torso", at: SHOULDER_B }, h.at, ARM, seg(5.4, "suitShade", 8), seg(6.4, "plateShade", 8.1), { elbow: h.elbow });
    parts.push({ id: "off-hand", src: h.src, bone: "armB.end", place: placeAt(h.src, h.anchor, back.end, h.rot), z: 8.2 });
    parts.push({ id: "hand-back", src: handSide, bone: "armB.end", place: { ...back.end, rot: 0 }, z: 8.3 });
  } else {
    // the free hand on the hip, elbow out behind: the Concord's resting smugness
    back = arm("armB", { bone: "torso", at: SHOULDER_B }, { x: 70, y: 98 }, ARM, seg(5.4, "suitShade", 8), seg(6.4, "plateShade", 8.1), { elbow: { x: 85, y: 84 } });
    parts.push({ id: "hand-back", src: handSide, bone: "armB.end", place: { x: 70, y: 98, rot: 0 }, z: 8.2 });
  }
  for (const h of o.hips ?? []) parts.push({ id: h.id, src: h.src, bone: "pelvis", z: h.z });
  parts.push(...(o.extra ?? []));

  const legs: LimbDef[] = [];
  let gait: RigDef["gait"];
  const kind = o.legs ?? "stand";
  if (kind !== "none") {
    const pointe_ = kind === "pointe";
    const foot = pointe_ ? pointe : sabaton;
    const fF = pointe_ ? { x: 55, y: 182 } : { x: 54, y: 186 };
    // the dancer's far leg is raised straight out behind her (arabesque); walking brings it down
    const fB = pointe_ ? { x: 104, y: 98 } : { x: 67, y: 186 };
    const kB = pointe_ ? { x: 83, y: 106 } : { x: 64.5, y: 147 };
    legs.push(
      { id: "legB", kind: "leg", from: { bone: "pelvis", at: { x: 64, y: 108 } }, joint: kB, end: fB, upper: seg(6.4, "suitShade", 1), lower: seg(6.8, "plateShade", 1.1) },
      { id: "legF", kind: "leg", from: { bone: "pelvis", at: { x: 57, y: 108 } }, joint: { x: 55, y: 147 }, end: fF, upper: seg(6.4, "suit", 5), lower: seg(6.8, "plate", 5.1, "plateShade") },
    );
    parts.push(
      { id: "knee-back", src: knee, bone: "legB.mid", place: { ...kB, rot: 0 }, z: 2 },
      { id: "foot-back", src: foot, bone: "legB.end", place: { ...fB, rot: pointe_ ? -70 : 0 }, z: 3 },
      { id: "knee-front", src: knee, bone: "legF.mid", place: { x: 55, y: 147, rot: 0 }, z: 6 },
      { id: "foot-front", src: foot, bone: "legF.end", place: { ...fF, rot: 0 }, z: 7 },
    );
    // a stately walk: short strides, 140 ms beats (stance feet move back at a steady rate)
    const y = fF.y;
    const up = y - 8;
    gait = [
      { legF: { x: 44, y }, legB: { x: 66, y } },
      { legF: { x: 55, y }, legB: { x: 55, y: up } },
      { legF: { x: 66, y }, legB: { x: 44, y } },
      { legF: { x: 55, y: up }, legB: { x: 55, y } },
    ];
  }
  return {
    id: o.id,
    name: o.name,
    view: "side",
    frame: "lean",
    origin: { x: 60, y: 190 },
    unitsPerInch: UPI,
    height: o.height,
    pivots: { torso: { x: 60, y: 104 }, head: { x: 60, y: 57 } },
    parts,
    limbInk: 2,
    limbs: [...legs, front, back],
    weapon: "weapon",
    gait,
    stride: kind === "none" ? undefined : 44,
    clips: { ...courtly("side"), ...o.clips },
    fx: { muzzle: LAVENDER, puff: CRYSTAL, ...o.fx },
    ground: CONCORD_GROUND,
  };
}

// ---------- top: the courtier from above ----------
// Origin at the base centre, facing up (-y). Shoulders at (+-12, -1).

export interface CourtierTop {
  id: string;
  name: string;
  helm: string;
  collar: string;
  weapon: { src: string; place: Place };
  offHand?: { src: string; anchor: string; at: Pt; rot: number; elbow?: Pt };
  /** Under the torso (coat tails, skirt, wings, robe), with their z (below 5). */
  under?: { id: string; src: string; z: number; anim?: PartUse["anim"] }[];
  extra?: PartUse[];
  height?: number;
  shadow?: RigDef["shadow"];
  fx?: RigDef["fx"];
}

/**
 * The top parts are drawn small (a 36 u shoulder span); `scale` (default 1.4) grows the whole figure
 * about the base centre so it fills its base like the Militia trooper does. Coordinates given in
 * the options (weapon placements, hand positions) are in the parts' own drawn units.
 */
export function courtierTop(o: CourtierTop & { scale?: number }): RigDef {
  const K = o.scale ?? 1.75;
  const k = (p: Pt): Pt => ({ x: p.x * K, y: p.y * K });
  const kp = (p: Place): Place => ({ x: p.x * K, y: p.y * K, rot: p.rot, scale: (p.scale ?? 1) * K });
  const wpn = readPart(o.weapon.src);
  const L = k({ x: -12, y: -1 });
  const R = k({ x: 12, y: -1 });
  const tl: [number, number] = [11 * K, 11 * K];
  const wPlace = kp(o.weapon.place);
  const g1 = anchorAt(o.weapon.src, wPlace, "g1");
  // from above the elbows go out to the side
  const outL = (p: Pt) => -p.x;
  const outR = (p: Pt) => p.x;
  const up = seg(4.6 * K, "suit", 2);
  const lo = seg(5.4 * K, "plate", 2.1);
  const upB = seg(4.6 * K, "suitShade", 2.2);
  const loB = seg(5.4 * K, "plateShade", 2.3);
  const at = (p: Pt): Place => ({ ...p, rot: 0, scale: K });
  const O: Place = { x: 0, y: 0, rot: 0, scale: K };
  const left = arm("armL", { bone: "torso", at: L }, g1, tl, up, lo, { grip: "g1", prefer: outL });
  const parts: PartUse[] = [
    { id: "weapon", src: o.weapon.src, bone: "gun", place: wPlace, z: 1 },
    { id: "hand-left", src: handTop, bone: "armL.end", place: at(left.end), z: 4 },
    { id: "torso", src: torsoTop, bone: "torso", place: O, z: 5 },
    { id: "collar", src: o.collar, bone: "torso", place: O, z: 5.5 },
    { id: "helm", src: o.helm, bone: "head", place: O, z: 6 },
  ];
  let right: LimbDef;
  if (wpn.anchors.g2) {
    right = arm("armR", { bone: "torso", at: R }, anchorAt(o.weapon.src, wPlace, "g2"), tl, upB, loB, { grip: "g2", prefer: outR });
    parts.push({ id: "hand-right", src: handTop, bone: "armR.end", place: at(right.end), z: 4.1 });
  } else if (o.offHand) {
    const h = o.offHand;
    right = arm("armR", { bone: "torso", at: R }, k(h.at), tl, upB, loB, { elbow: h.elbow ? k(h.elbow) : undefined, prefer: outR });
    parts.push({ id: "off-hand", src: h.src, bone: "armR.end", place: placeAt(h.src, h.anchor, right.end, h.rot, K), z: 2.4 });
    parts.push({ id: "hand-right", src: handTop, bone: "armR.end", place: at(right.end), z: 4.1 });
  } else {
    right = arm("armR", { bone: "torso", at: R }, k({ x: 9, y: 6 }), tl, upB, loB, { elbow: k({ x: 19, y: 4 }) });
    parts.push({ id: "hand-right", src: handTop, bone: "armR.end", place: at(k({ x: 9, y: 6 })), z: 4.1 });
  }
  for (const u of o.under ?? []) parts.push({ id: u.id, src: u.src, bone: "torso", place: O, z: u.z, ...(u.anim ? { anim: u.anim } : {}) });
  parts.push(...(o.extra ?? []));
  const sh = o.shadow ?? { x: 4, y: 6, r: 17 };
  return {
    id: o.id,
    name: o.name,
    view: "top",
    frame: "lean",
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: Math.round((o.height ?? 50) * K),
    pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: -1 * K } },
    parts,
    limbInk: 1.6,
    limbs: [left, right],
    weapon: "weapon",
    fx: { muzzle: LAVENDER, puff: CRYSTAL, ...o.fx },
    ground: CONCORD_GROUND,
    shadow: { x: sh.x * K, y: sh.y * K, r: sh.r * K },
  };
}
