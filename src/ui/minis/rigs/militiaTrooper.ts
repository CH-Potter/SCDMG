// The Dustline Militia line trooper (profile `mil-grunts`): a drafted soldier in a riveted mining
// work-suit turned powered armour. Domed helm with a slit visor and headlamp, rank chevrons, unit
// stencil, compressor pack, long riveted rifle. Drawn for both views from the engine canvas.

import packSide from "../parts/militia/trooper/pack.svg?raw";
import torsoSide from "../parts/militia/trooper/torso.svg?raw";
import padFront from "../parts/militia/trooper/pad-front.svg?raw";
import padBack from "../parts/militia/trooper/pad-back.svg?raw";
import helmSide from "../parts/militia/trooper/helm.svg?raw";
import rifleSide from "../parts/militia/trooper/rifle.svg?raw";
import scatterSide from "../parts/militia/trooper/scatter.svg?raw";
import kneeFront from "../parts/militia/trooper/knee-front.svg?raw";
import kneeBack from "../parts/militia/trooper/knee-back.svg?raw";
import shinFront from "../parts/militia/trooper/shin-front.svg?raw";
import shinBack from "../parts/militia/trooper/shin-back.svg?raw";
import bootFront from "../parts/militia/trooper/boot-front.svg?raw";
import bootBack from "../parts/militia/trooper/boot-back.svg?raw";
import gauntletSide from "../parts/militia/trooper/gauntlet.svg?raw";
import packTop from "../parts/militia/trooper-top/pack.svg?raw";
import torsoTop from "../parts/militia/trooper-top/torso.svg?raw";
import helmTop from "../parts/militia/trooper-top/helm.svg?raw";
import rifleTop from "../parts/militia/trooper-top/rifle.svg?raw";
import scatterTop from "../parts/militia/trooper-top/scatter.svg?raw";
import gauntletTop from "../parts/militia/trooper-top/gauntlet.svg?raw";
import type { PartUse, RigDef } from "../types";

/** Design units per board inch: a 0.5" base radius is 34 u, and the trooper stands about 2.4". */
const UPI = 68;
const MILITIA_GROUND = "#4f4a41";

/** Weapons the line trooper's frame can carry: where each sits in the hands (frame rest coords). */
export const TROOPER_WEAPONS = {
  side: {
    rifle: { src: rifleSide, place: { x: 10, y: 20, rot: 53.13 } },
    scatter: { src: scatterSide, place: { x: 22, y: 84, rot: 19.65 } },
  },
  top: {
    rifle: { src: rifleTop, place: { x: -18, y: -40, rot: 58 } },
    scatter: { src: scatterTop, place: { x: -8, y: -30, rot: 66 } },
  },
} as const;

export type TrooperWeapon = keyof typeof TROOPER_WEAPONS.side;

export function trooperSide(weapon: TrooperWeapon = "rifle"): RigDef {
  const w = TROOPER_WEAPONS.side[weapon];
  // Rest hand positions (the rifle's grips at rest). Hands are drawn round their own origin.
  const armF = { x: 39.16, y: 58.88 };
  const armB = { x: 62.0, y: 88.0 };
  const parts: PartUse[] = [
    { id: "pack", src: packSide, bone: "torso", z: 0 },
    { id: "shin-back", src: shinBack, bone: "legB.lower", z: 2 },
    { id: "knee-back", src: kneeBack, bone: "legB.mid", z: 3 },
    { id: "boot-back", src: bootBack, bone: "legB.end", z: 4 },
    { id: "shin-front", src: shinFront, bone: "legF.lower", z: 6 },
    { id: "knee-front", src: kneeFront, bone: "legF.mid", z: 7 },
    { id: "boot-front", src: bootFront, bone: "legF.end", z: 8 },
    { id: "torso", src: torsoSide, bone: "torso", z: 10 },
    { id: "weapon", src: w.src, bone: "gun", place: w.place, z: 11 },
    { id: "hand-front", src: gauntletSide, bone: "armF.end", place: { ...armF, rot: 0 }, z: 16 },
    { id: "hand-back", src: gauntletSide, bone: "armB.end", place: { ...armB, rot: 0 }, z: 16.1 },
    { id: "pad-front", src: padFront, bone: "torso", z: 17 },
    { id: "pad-back", src: padBack, bone: "torso", z: 18 },
    { id: "helm", src: helmSide, bone: "head", z: 19 },
  ];
  return {
    id: `militia.trooper.side.${weapon}`,
    name: "Dustline line trooper",
    view: "side",
    frame: "lean",
    origin: { x: 60, y: 184 },
    unitsPerInch: UPI,
    height: 162,
    pivots: { torso: { x: 60, y: 110 }, head: { x: 59, y: 57 } },
    parts,
    limbInk: 2.2,
    limbs: [
      {
        id: "legB",
        kind: "leg",
        from: { bone: "pelvis", at: { x: 66, y: 106 } },
        joint: { x: 71, y: 145 },
        end: { x: 70, y: 170 },
        upper: { width: 7.4, slot: "suitShade", z: 1 },
        lower: { width: 7.4, slot: "suitShade", z: 1.1 },
      },
      {
        id: "legF",
        kind: "leg",
        from: { bone: "pelvis", at: { x: 55, y: 106 } },
        joint: { x: 50, y: 145 },
        end: { x: 48, y: 170 },
        upper: { width: 7.4, slot: "suit", z: 5 },
        lower: { width: 7.4, slot: "suit", z: 5.1 },
      },
      {
        id: "armF",
        kind: "arm",
        from: { bone: "torso", at: { x: 47, y: 70 } },
        joint: { x: 36, y: 82 },
        end: armF,
        grip: "g1",
        upper: { width: 6.6, slot: "suit", z: 12 },
        lower: { width: 9, slot: "plate", stripe: "plateShade", z: 13 },
      },
      {
        id: "armB",
        kind: "arm",
        from: { bone: "torso", at: { x: 75, y: 72 } },
        joint: { x: 79, y: 92 },
        end: armB,
        grip: "g2",
        upper: { width: 6.6, slot: "suitShade", z: 14 },
        lower: { width: 9, slot: "plate", stripe: "plateShade", z: 15 },
      },
    ],
    weapon: "weapon",
    // Walk cycle, 140 ms a beat: stride, back foot passes, stride on the other foot, front foot passes.
    gait: [
      { legB: { x: 84, y: 170 }, legF: { x: 36, y: 170 } },
      { legB: { x: 62, y: 160 }, legF: { x: 52, y: 170 } },
      { legB: { x: 50, y: 170 }, legF: { x: 70, y: 170 } },
      { legB: { x: 68, y: 170 }, legF: { x: 58, y: 160 } },
    ],
    ground: MILITIA_GROUND,
  };
}

export function trooperTop(weapon: TrooperWeapon = "rifle"): RigDef {
  const w = TROOPER_WEAPONS.top[weapon];
  const handL = { x: -9.02, y: -24.5 };
  const handR = { x: -0.51, y: -12.02 };
  return {
    id: `militia.trooper.top.${weapon}`,
    name: "Dustline line trooper (from above)",
    view: "top",
    frame: "lean",
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: 52,
    pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: -2 } },
    parts: [
      { id: "pack", src: packTop, bone: "torso", z: 0 },
      { id: "weapon", src: w.src, bone: "gun", place: w.place, z: 1 },
      { id: "hand-left", src: gauntletTop, bone: "armL.end", place: { ...handL, rot: 0 }, z: 4 },
      { id: "hand-right", src: gauntletTop, bone: "armR.end", place: { ...handR, rot: 0 }, z: 4.1 },
      { id: "torso", src: torsoTop, bone: "torso", z: 5 },
      { id: "helm", src: helmTop, bone: "head", z: 6 },
    ],
    limbInk: 1.6,
    limbs: [
      {
        id: "armL",
        kind: "arm",
        from: { bone: "torso", at: { x: -14, y: -1 } },
        joint: { x: -18, y: -14 },
        end: handL,
        grip: "g1",
        upper: { width: 6, slot: "suit", z: 2 },
        lower: { width: 7, slot: "plate", z: 2.1 },
      },
      {
        id: "armR",
        kind: "arm",
        from: { bone: "torso", at: { x: 14, y: -1 } },
        joint: { x: 11, y: -14 },
        end: handR,
        grip: "g2",
        upper: { width: 6, slot: "suitShade", z: 2.2 },
        lower: { width: 7, slot: "plate", z: 2.3 },
      },
    ],
    weapon: "weapon",
    ground: MILITIA_GROUND,
    shadow: { x: 5, y: 7, r: 21.5 },
  };
}
