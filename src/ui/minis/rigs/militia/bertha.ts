// Big Bertha (profile `mil-bertha`): the Haybright combine, walking now. A riveted combine hull with
// a lamp-lit cab, a roof-mounted Thumper cannon, the harvester reel (it turns as she walks), the
// grain auger swung up behind, an exhaust stack and the crew pennant, on two heavy legs with flat
// cleated feet. Built on `walkerRig`, the two-legged machine frame the Forge can reuse.

import hullSide from "../../parts/militia/bertha/hull.svg?raw";
import cabSide from "../../parts/militia/bertha/cab.svg?raw";
import turretSide from "../../parts/militia/bertha/turret.svg?raw";
import cannon from "../../parts/militia/bertha/cannon.svg?raw";
import headerSide from "../../parts/militia/bertha/header.svg?raw";
import reel from "../../parts/militia/bertha/reel.svg?raw";
import augerSide from "../../parts/militia/bertha/auger.svg?raw";
import stackSide from "../../parts/militia/bertha/stack.svg?raw";
import pennantSide from "../../parts/militia/bertha/pennant.svg?raw";
import hip from "../../parts/militia/bertha/hip.svg?raw";
import knee from "../../parts/militia/bertha/knee.svg?raw";
import foot from "../../parts/militia/bertha/foot.svg?raw";
import hullTop from "../../parts/militia/bertha-top/hull.svg?raw";
import headerTop from "../../parts/militia/bertha-top/header.svg?raw";
import footTop from "../../parts/militia/bertha-top/foot.svg?raw";
import type { LimbDef, PartUse, Pt, RigDef, RigView } from "../../types";
import { MILITIA_GROUND, UPI } from "./fieldworks";

/** One leg of a walking machine: hip, knee and ankle in frame rest coords. */
export interface WalkerLeg {
  id: string;
  hip: Pt;
  knee: Pt;
  foot: Pt;
  /** Near legs are lit (metal thigh, armour-plate shin); far ones sit in shade behind the hull. */
  near: boolean;
  /** Draw order of the thigh; the shin, knee cap and foot stack just above it. */
  z: number;
  width?: { upper: number; lower: number };
  /** Parts riding the knee and the ankle, drawn round their own origin (0, 0). */
  kneePart?: string;
  footPart?: string;
}

/** A two-legged stride over four keys: plant, pass, plant, pass. `axis` is the travel axis. */
export function twoLegGait(a: WalkerLeg, b: WalkerLeg, sweep: number, lift: number, axis: "x" | "y"): Record<string, Pt>[] {
  const at = (l: WalkerLeg, d: number, up = 0): Pt =>
    axis === "x" ? { x: l.foot.x + d, y: l.foot.y - up } : { x: l.foot.x + Math.sign(l.foot.x) * up, y: l.foot.y + d };
  return [
    { [a.id]: at(a, -sweep), [b.id]: at(b, sweep) },
    { [a.id]: at(a, 0), [b.id]: at(b, 0, lift) },
    { [a.id]: at(a, sweep), [b.id]: at(b, -sweep) },
    { [a.id]: at(a, 0, lift), [b.id]: at(b, 0) },
  ];
}

/**
 * A walking machine: a hull on the torso bone, legs as thick ink limbs hanging from the pelvis with
 * knee caps and foot plates on the joints, and a planted-foot gait. Frame "walker" (slow stomp).
 */
export function walkerRig(o: {
  id: string;
  name: string;
  view: RigView;
  origin: Pt;
  height: number;
  pivots: RigDef["pivots"];
  parts: PartUse[];
  legs: WalkerLeg[];
  gait: Record<string, Pt>[];
  weapon?: string;
  shadow?: RigDef["shadow"];
}): RigDef {
  const parts = [...o.parts];
  const limbs: LimbDef[] = o.legs.map((l) => {
    const w = l.width ?? { upper: 15, lower: 17 };
    if (l.kneePart) parts.push({ id: `${l.id}-knee`, src: l.kneePart, bone: `${l.id}.mid`, place: { x: l.knee.x, y: l.knee.y, rot: 0 }, z: l.z + 0.3 });
    if (l.footPart) parts.push({ id: `${l.id}-foot`, src: l.footPart, bone: `${l.id}.end`, place: { x: l.foot.x, y: l.foot.y, rot: 0 }, z: l.z + 0.2 });
    return {
      id: l.id,
      kind: "leg",
      from: { bone: "pelvis", at: l.hip },
      joint: l.knee,
      end: l.foot,
      upper: { width: w.upper, slot: l.near ? "metal" : "metalShade", stripe: l.near ? "metalShade" : undefined, z: l.z },
      lower: { width: w.lower, slot: l.near ? "plate" : "plateShade", stripe: l.near ? "plateShade" : undefined, z: l.z + 0.1 },
    };
  });
  return {
    id: o.id,
    name: o.name,
    view: o.view,
    frame: "walker",
    origin: o.origin,
    unitsPerInch: UPI,
    height: o.height,
    pivots: o.pivots,
    parts,
    limbs,
    limbInk: 2.4,
    weapon: o.weapon,
    gait: o.gait,
    fx: { puff: "#cfc6b4" },
    ground: MILITIA_GROUND,
    shadow: o.shadow,
  };
}

export function berthaSide(): RigDef {
  const w = { upper: 20, lower: 22 };
  const legN: WalkerLeg = { id: "legN", hip: { x: 140, y: 190 }, knee: { x: 122, y: 240 }, foot: { x: 140, y: 286 }, near: true, z: 16, width: w, kneePart: knee, footPart: foot };
  const legF: WalkerLeg = { id: "legF", hip: { x: 168, y: 188 }, knee: { x: 150, y: 238 }, foot: { x: 168, y: 286 }, near: false, z: 1, width: w, kneePart: knee, footPart: foot };
  return walkerRig({
    id: "militia.bertha.side",
    name: "Big Bertha",
    view: "side",
    origin: { x: 153, y: 300 },
    height: 266,
    pivots: { torso: { x: 150, y: 150 }, head: { x: 112, y: 100 } },
    parts: [
      { id: "stack", src: stackSide, bone: "torso", z: 4 },
      { id: "pennant", src: pennantSide, bone: "torso", z: 4.5 },
      { id: "auger", src: augerSide, bone: "torso", z: 5 },
      { id: "hull", src: hullSide, bone: "torso", z: 10 },
      { id: "cab", src: cabSide, bone: "head", z: 11 },
      { id: "turret", src: turretSide, bone: "torso", z: 12 },
      { id: "cannon", src: cannon, bone: "gun", place: { x: 185, y: 66, rot: 6 }, z: 13 },
      { id: "header", src: headerSide, bone: "torso", z: 14 },
      { id: "reel", src: reel, bone: "torso", place: { x: 44, y: 150, rot: 0 }, z: 15, anim: { spin: 1 } },
      { id: "hip", src: hip, bone: "pelvis", place: { x: 140, y: 190, rot: 0, scale: 1.2 }, z: 17 },
    ],
    legs: [legF, legN],
    gait: twoLegGait(legN, legF, 25, 18, "x"),
    weapon: "cannon",
  });
}

export function berthaTop(): RigDef {
  const legL: WalkerLeg = { id: "legL", hip: { x: -42, y: 8 }, knee: { x: -62, y: -2 }, foot: { x: -60, y: 20 }, near: true, z: 2, width: { upper: 14, lower: 14 }, footPart: footTop };
  const legR: WalkerLeg = { id: "legR", hip: { x: 42, y: 8 }, knee: { x: 62, y: -2 }, foot: { x: 60, y: 20 }, near: true, z: 2.5, width: { upper: 14, lower: 14 }, footPart: footTop };
  return walkerRig({
    id: "militia.bertha.top",
    name: "Big Bertha (from above)",
    view: "top",
    origin: { x: 0, y: 0 },
    height: 190,
    pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: 0 } },
    parts: [
      { id: "hull", src: hullTop, bone: "torso", z: 5 },
      { id: "header", src: headerTop, bone: "torso", z: 6 },
      { id: "cannon", src: cannon, bone: "gun", place: { x: 10, y: 10, rot: 90 }, z: 7 },
    ],
    legs: [legL, legR],
    gait: twoLegGait(legL, legR, 25, 4, "y"),
    weapon: "cannon",
    shadow: { x: 12, y: 16, r: 78 },
  });
}
