// The Shimmer Saucer (bespoke flyer, hover frame): a wide pearl lens hull, a faceted crystal dome
// with a smug pilot inside, a gold spire and a swept tail fin that carries the team stripe. The
// engine adds the flight stem, the glow and the shadow on the base. From above, the gold rim with
// its studs turns slowly while it hovers.

import hull from "../../parts/concord/saucer/hull.svg?raw";
import dome from "../../parts/concord/saucer/dome.svg?raw";
import spire from "../../parts/concord/saucer/spire.svg?raw";
import fin from "../../parts/concord/saucer/fin.svg?raw";
import emitter from "../../parts/concord/saucer/emitter.svg?raw";
import hullTop from "../../parts/concord/saucer-top/hull.svg?raw";
import rimTop from "../../parts/concord/saucer-top/rim.svg?raw";
import domeTop from "../../parts/concord/saucer-top/dome.svg?raw";
import finTop from "../../parts/concord/saucer-top/fin.svg?raw";
import emitterTop from "../../parts/concord/saucer-top/emitter.svg?raw";
import type { RigDef } from "../../types";
import { CONCORD_GROUND, CRYSTAL, LAVENDER, UPI } from "./kit";

export function saucerSide(): RigDef {
  return {
    id: "concord.saucer.side",
    name: "Shimmer Saucer",
    view: "side",
    frame: "hover",
    origin: { x: 100, y: 98 },
    unitsPerInch: UPI,
    height: 96,
    pivots: { torso: { x: 100, y: 72 }, head: { x: 100, y: 60 } },
    parts: [
      { id: "fin", src: fin, bone: "pelvis", z: 1 },
      { id: "hull", src: hull, bone: "pelvis", z: 2 },
      { id: "weapon", src: emitter, bone: "gun", place: { x: 8, y: 90, rot: -4 }, z: 3 },
      { id: "spire", src: spire, bone: "torso", z: 3.5 },
      { id: "dome", src: dome, bone: "torso", z: 4 },
    ],
    limbs: [],
    limbInk: 2,
    weapon: "weapon",
    fx: { muzzle: LAVENDER, puff: CRYSTAL },
    ground: CONCORD_GROUND,
  };
}

export function saucerTop(): RigDef {
  return {
    id: "concord.saucer.top",
    name: "Shimmer Saucer (from above)",
    view: "top",
    frame: "hover",
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: 190,
    pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: 0 } },
    parts: [
      { id: "hull", src: hullTop, bone: "pelvis", z: 1 },
      { id: "rim", src: rimTop, bone: "pelvis", z: 2, anim: { spin: 0.02 } },
      { id: "fin", src: finTop, bone: "pelvis", z: 2.5 },
      { id: "weapon", src: emitterTop, bone: "gun", place: { x: 0, y: -112, rot: 90, scale: 1.3 }, z: 2.6 },
      { id: "dome", src: domeTop, bone: "torso", z: 3 },
    ],
    limbs: [],
    limbInk: 2,
    weapon: "weapon",
    fx: { muzzle: LAVENDER, puff: CRYSTAL },
    ground: CONCORD_GROUND,
    shadow: { x: 10, y: 14, r: 90 },
  };
}
