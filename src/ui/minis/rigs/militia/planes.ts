// The Militia's biplanes, both on `biplaneRig` (hover frame: the engine lifts them on the flyer's
// stem, sways them, beats the propellers and turns the wheels):
//   Sky Rustler (`mil-rustler`): a crop duster refitted for ground attack. Chain gun over the cowl,
//     dust tank under the lower wing, squadron band on the fin, the pilot's long scarf streaming.
//   Haymaker Bomber (`mil-bomber`): a fat cargo biplane, twin engines on a long square wing, a belly
//     rack of ore buckets tipped through a chute, a tail gunner behind.

import rFuselage from "../../parts/militia/rustler/fuselage.svg?raw";
import rWings from "../../parts/militia/rustler/wings.svg?raw";
import rTank from "../../parts/militia/rustler/tank.svg?raw";
import rGear from "../../parts/militia/rustler/gear.svg?raw";
import wheel from "../../parts/militia/rustler/wheel.svg?raw";
import prop from "../../parts/militia/rustler/prop.svg?raw";
import chainGun from "../../parts/militia/rustler/gun.svg?raw";
import pilot from "../../parts/militia/rustler/pilot.svg?raw";
import scarf from "../../parts/militia/rustler/scarf.svg?raw";
import rTail from "../../parts/militia/rustler/tail.svg?raw";
import rBodyTop from "../../parts/militia/rustler-top/body.svg?raw";
import rWingsTop from "../../parts/militia/rustler-top/wings.svg?raw";
import pilotTop from "../../parts/militia/rustler-top/pilot.svg?raw";
import scarfTop from "../../parts/militia/rustler-top/scarf.svg?raw";
import bFuselage from "../../parts/militia/bomber/fuselage.svg?raw";
import bWings from "../../parts/militia/bomber/wings.svg?raw";
import bEngine from "../../parts/militia/bomber/engine.svg?raw";
import bRack from "../../parts/militia/bomber/rack.svg?raw";
import chute from "../../parts/militia/bomber/chute.svg?raw";
import bGunner from "../../parts/militia/bomber/gunner.svg?raw";
import bTail from "../../parts/militia/bomber/tail.svg?raw";
import bGear from "../../parts/militia/bomber/gear.svg?raw";
import bBodyTop from "../../parts/militia/bomber-top/body.svg?raw";
import bWingsTop from "../../parts/militia/bomber-top/wings.svg?raw";
import bNacellesTop from "../../parts/militia/bomber-top/nacelles.svg?raw";
import bTailTop from "../../parts/militia/bomber-top/tail.svg?raw";
import bGunnerTop from "../../parts/militia/bomber-top/gunner.svg?raw";
import type { PartAnim, PartUse, Pt, RigDef, RigView } from "../../types";
import { MILITIA_GROUND, UPI } from "./fieldworks";

/** A propeller blade seen edge-on: it squashes along its length as it turns. */
export const PROP_SPIN: PartAnim = { flap: 0.82 };
/** Wheels turn with the spin channel. */
export const WHEEL_SPIN: PartAnim = { spin: 1 };

/**
 * A flying machine with no limbs: parts on the root, torso (airframe), head (crew) and gun bones.
 * Frame "hover": a constant sway, rotors turning, a nose-down dive when shot down.
 */
export function biplaneRig(o: { id: string; name: string; view: RigView; origin: Pt; height: number; pivots: RigDef["pivots"]; parts: PartUse[]; weapon: string; shadow?: RigDef["shadow"] }): RigDef {
  return {
    id: o.id,
    name: o.name,
    view: o.view,
    frame: "hover",
    origin: o.origin,
    unitsPerInch: UPI,
    height: o.height,
    pivots: o.pivots,
    parts: o.parts,
    limbs: [],
    limbInk: 2,
    weapon: o.weapon,
    fx: { puff: "#cfc6b4" },
    ground: MILITIA_GROUND,
    shadow: o.shadow,
  };
}

export const rustlerSide = (): RigDef =>
  biplaneRig({
    id: "militia.rustler.side",
    name: "Sky Rustler",
    view: "side",
    origin: { x: 100, y: 110 },
    height: 92,
    pivots: { torso: { x: 100, y: 60 }, head: { x: 101, y: 42 } },
    parts: [
      { id: "gear", src: rGear, bone: "torso", z: 1 },
      { id: "wheel", src: wheel, bone: "torso", place: { x: 90, y: 100, rot: 0 }, z: 1.5, anim: WHEEL_SPIN },
      { id: "tank", src: rTank, bone: "torso", z: 2 },
      { id: "pilot", src: pilot, bone: "head", z: 3.5 },
      { id: "scarf", src: scarf, bone: "head", z: 3.6, anim: { flap: 0.35 } },
      { id: "fuselage", src: rFuselage, bone: "torso", z: 4 },
      { id: "tail", src: rTail, bone: "torso", z: 4.5 },
      { id: "gun", src: chainGun, bone: "gun", place: { x: 66, y: 41, rot: 0 }, z: 5 },
      { id: "wings", src: rWings, bone: "torso", z: 6 },
      { id: "prop", src: prop, bone: "torso", place: { x: 29, y: 58, rot: 0 }, z: 7, anim: PROP_SPIN },
    ],
    weapon: "gun",
  });

export const rustlerTop = (): RigDef =>
  biplaneRig({
    id: "militia.rustler.top",
    name: "Sky Rustler (from above)",
    view: "top",
    origin: { x: 0, y: 0 },
    height: 190,
    pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: 2 } },
    parts: [
      { id: "body", src: rBodyTop, bone: "torso", z: 2 },
      { id: "gun", src: chainGun, bone: "gun", place: { x: 0, y: -48, rot: 90 }, z: 3 },
      { id: "wings", src: rWingsTop, bone: "torso", z: 4 },
      { id: "scarf", src: scarfTop, bone: "head", place: { x: 0, y: 4, rot: 0 }, z: 4.8, anim: { pulse: 0.12 } },
      { id: "pilot", src: pilotTop, bone: "head", place: { x: 0, y: 2, rot: 0 }, z: 5 },
      { id: "prop", src: prop, bone: "torso", place: { x: 0, y: -87, rot: 90 }, z: 6, anim: PROP_SPIN },
    ],
    weapon: "gun",
    shadow: { x: 10, y: 14, r: 58 },
  });

export const bomberSide = (): RigDef =>
  biplaneRig({
    id: "militia.bomber.side",
    name: "Haymaker Bomber",
    view: "side",
    origin: { x: 120, y: 132 },
    height: 120,
    pivots: { torso: { x: 130, y: 70 }, head: { x: 192, y: 46 } },
    parts: [
      { id: "gear", src: bGear, bone: "torso", z: 1 },
      { id: "wheel", src: wheel, bone: "torso", place: { x: 92, y: 120, rot: 0, scale: 1.2 }, z: 1.5, anim: WHEEL_SPIN },
      { id: "rack", src: bRack, bone: "torso", z: 2 },
      { id: "chute", src: chute, bone: "gun", place: { x: 141, y: 104, rot: -90 }, z: 2.5 },
      { id: "gunner", src: bGunner, bone: "head", z: 3.5 },
      { id: "fuselage", src: bFuselage, bone: "torso", z: 4 },
      { id: "tail", src: bTail, bone: "torso", z: 4.5 },
      { id: "wings", src: bWings, bone: "torso", z: 6 },
      { id: "engine", src: bEngine, bone: "torso", z: 7 },
      { id: "prop", src: prop, bone: "torso", place: { x: 51, y: 66, rot: 0, scale: 0.9 }, z: 8, anim: PROP_SPIN },
    ],
    weapon: "chute",
  });

export const bomberTop = (): RigDef =>
  biplaneRig({
    id: "militia.bomber.top",
    name: "Haymaker Bomber (from above)",
    view: "top",
    origin: { x: 0, y: 0 },
    height: 240,
    pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: 84 } },
    parts: [
      { id: "body", src: bBodyTop, bone: "torso", z: 2 },
      { id: "tail", src: bTailTop, bone: "torso", z: 2.5 },
      { id: "gunner", src: bGunnerTop, bone: "head", place: { x: 0, y: 82, rot: 0 }, z: 3 },
      { id: "chute", src: chute, bone: "gun", place: { x: 0, y: 26, rot: 90 }, z: 3.2 },
      { id: "wings", src: bWingsTop, bone: "torso", z: 4 },
      { id: "nacelles", src: bNacellesTop, bone: "torso", z: 5 },
      { id: "propL", src: prop, bone: "torso", place: { x: -50, y: -70, rot: 90, scale: 0.9 }, z: 6, anim: PROP_SPIN },
      { id: "propR", src: prop, bone: "torso", place: { x: 50, y: -70, rot: 90, scale: 0.9 }, z: 6.1, anim: PROP_SPIN },
    ],
    weapon: "chute",
    shadow: { x: 12, y: 16, r: 66 },
  });
