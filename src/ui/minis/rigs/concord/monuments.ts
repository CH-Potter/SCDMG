// The Concord's structures: the Shield Pylon (a slim crystal obelisk in a floating hex ring, a beam
// head on top), the Sunray Tower (a stepped deco ziggurat under a turning gold sunburst with a lens
// eye) and the summoned Glimmer Dome (hex cells of crystal light). No limbs; structure frame.

import pylonPlinth from "../../parts/concord/monument/pylon-plinth.svg?raw";
import pylonShaft from "../../parts/concord/monument/pylon-shaft.svg?raw";
import pylonRing from "../../parts/concord/monument/pylon-ring.svg?raw";
import beamHead from "../../parts/concord/monument/beam-head.svg?raw";
import sunrayTower from "../../parts/concord/monument/sunray-tower.svg?raw";
import sunburst from "../../parts/concord/monument/sunburst.svg?raw";
import sunLens from "../../parts/concord/monument/sun-lens.svg?raw";
import glimmerDome from "../../parts/concord/monument/glimmer-dome.svg?raw";
import pylonPlinthTop from "../../parts/concord/monument-top/pylon-plinth.svg?raw";
import pylonShaftTop from "../../parts/concord/monument-top/pylon-shaft.svg?raw";
import pylonRingTop from "../../parts/concord/monument-top/pylon-ring.svg?raw";
import sunrayTowerTop from "../../parts/concord/monument-top/sunray-tower.svg?raw";
import sunburstTop from "../../parts/concord/monument-top/sunburst.svg?raw";
import glimmerDomeTop from "../../parts/concord/monument-top/glimmer-dome.svg?raw";
import type { PartUse, RigDef, RigView } from "../../types";
import { CONCORD_GROUND, CRYSTAL, LAVENDER, UPI } from "./kit";

/** A structure rig: parts on the root (or gun) bones, no limbs. Side frames stand on (100, 200). */
export function structureRig(o: { id: string; name: string; view: RigView; height: number; parts: PartUse[]; weapon?: string; fixed?: boolean; shadow?: RigDef["shadow"] }): RigDef {
  const side = o.view === "side";
  const origin = side ? { x: 100, y: 200 } : { x: 0, y: 0 };
  return {
    id: o.id,
    name: o.name,
    view: o.view,
    frame: "structure",
    origin,
    unitsPerInch: UPI,
    height: o.height,
    pivots: { torso: origin, head: side ? { x: 100, y: 100 } : origin },
    parts: o.parts,
    limbs: [],
    limbInk: 2,
    weapon: o.weapon,
    fixed: o.fixed,
    fx: { muzzle: LAVENDER, puff: CRYSTAL },
    ground: CONCORD_GROUND,
    shadow: o.shadow,
  };
}

export const pylonSide = (): RigDef =>
  structureRig({
    id: "concord.pylon.side",
    name: "Shield Pylon",
    view: "side",
    height: 170,
    parts: [
      { id: "plinth", src: pylonPlinth, bone: "root", z: 1 },
      { id: "shaft", src: pylonShaft, bone: "root", z: 2 },
      { id: "ring", src: pylonRing, bone: "root", z: 3, anim: { pulse: 0.04, float: 3 } },
      { id: "weapon", src: beamHead, bone: "gun", place: { x: 100, y: 44, rot: 0 }, z: 4 },
    ],
    weapon: "weapon",
  });

export const pylonTop = (): RigDef =>
  structureRig({
    id: "concord.pylon.top",
    name: "Shield Pylon (from above)",
    view: "top",
    height: 112,
    parts: [
      { id: "plinth", src: pylonPlinthTop, bone: "root", z: 1 },
      { id: "ring", src: pylonRingTop, bone: "root", z: 2, anim: { pulse: 0.05 } },
      { id: "shaft", src: pylonShaftTop, bone: "root", z: 3 },
      { id: "weapon", src: beamHead, bone: "gun", place: { x: 0, y: -2, rot: 90 }, z: 4 },
    ],
    weapon: "weapon",
    shadow: { x: 8, y: 10, r: 50 },
  });

export const sunraySide = (): RigDef =>
  structureRig({
    id: "concord.sunray.side",
    name: "Sunray Tower",
    view: "side",
    height: 156,
    parts: [
      { id: "tower", src: sunrayTower, bone: "root", z: 1 },
      { id: "sunburst", src: sunburst, bone: "root", place: { x: 100, y: 84, rot: 0 }, z: 2, anim: { spin: 0.12 } },
      { id: "weapon", src: sunLens, bone: "gun", place: { x: 100, y: 84, rot: 0 }, z: 3 },
    ],
    weapon: "weapon",
  });

export const sunrayTop = (): RigDef =>
  structureRig({
    id: "concord.sunray.top",
    name: "Sunray Tower (from above)",
    view: "top",
    height: 96,
    parts: [
      { id: "tower", src: sunrayTowerTop, bone: "root", z: 1 },
      { id: "sunburst", src: sunburstTop, bone: "root", place: { x: 0, y: 2, rot: 0 }, z: 2, anim: { pulse: 0.04 } },
      { id: "weapon", src: sunLens, bone: "gun", place: { x: 0, y: -8, rot: 90, scale: 0.8 }, z: 3 },
    ],
    weapon: "weapon",
    shadow: { x: 8, y: 10, r: 44 },
  });

export const domeSide = (): RigDef =>
  structureRig({
    id: "concord.dome.side",
    name: "Glimmer Dome",
    view: "side",
    height: 68,
    parts: [{ id: "dome", src: glimmerDome, bone: "root", z: 1, anim: { pulse: 0.015 } }],
    fixed: true,
  });

export const domeTop = (): RigDef =>
  structureRig({
    id: "concord.dome.top",
    name: "Glimmer Dome (from above)",
    view: "top",
    height: 130,
    // (drawn at 0.85 so the team ring round it stays in sight)
    parts: [{ id: "dome", src: glimmerDomeTop, bone: "root", place: { x: 0, y: 0, rot: 0, scale: 0.85 }, z: 1, anim: { pulse: 0.015 } }],
    fixed: true,
    shadow: { x: 6, y: 8, r: 54 },
  });
