// The Broodmother (swarm-mother): mostly abdomen, entirely in charge. A bespoke rig on the insect
// frame: an egg-heavy abdomen whose lime sac breathes (PartAnim pulse) under three violet scutes,
// a crown of hooks, two scythes raised high and six long legs, all scaled up from the kit.

import sacSide from "../../parts/swarm/mother/sac.svg?raw";
import abdomenSide from "../../parts/swarm/mother/abdomen.svg?raw";
import thoraxSide from "../../parts/swarm/mother/thorax.svg?raw";
import headSide from "../../parts/swarm/mother/head.svg?raw";
import sacTop from "../../parts/swarm/mother-top/sac.svg?raw";
import platesTop from "../../parts/swarm/mother-top/plates.svg?raw";
import thoraxTop from "../../parts/swarm/mother-top/thorax.svg?raw";
import headTop from "../../parts/swarm/mother-top/head.svg?raw";
import type { RigDef } from "../../types";
import { bladeOn, insectRig, placed, scytheArm, SHARED, sideLegs, topLegs } from "./kit";

const ACID = "#c8ef5a";

export function motherSide(): RigDef {
  const legs = sideLegs({
    hips: [{ x: -32, y: -90 }, { x: -10, y: -86 }, { x: 12, y: -90 }],
    knees: [{ x: -84, y: -148 }, { x: -20, y: -160 }, { x: 62, y: -154 }],
    feet: [-134, -40, 120],
    far: { x: 30, y: -8 },
    width: [10.4, 8],
    step: 14,
    lift: 18,
    z: [8, 1],
  });
  const near = scytheArm("armN", { x: -26, y: -126 }, { x: -54, y: -200 }, { x: -104, y: -186 }, { z: 11, width: [8.6, 7.6] });
  const far = scytheArm("armF", { x: -14, y: -128 }, { x: -34, y: -196 }, { x: -84, y: -184 }, { z: 2, slot: "suit", width: [7.6, 6.6] });
  return insectRig({
    id: "swarm.mother.side",
    name: "The Broodmother",
    view: "side",
    height: 206,
    k: 1.6,
    spits: true,
    limbInk: 2,
    pivots: { torso: { x: -8, y: -108 }, head: { x: -40, y: -112 } },
    parts: [
      bladeOn(far, { z: 2.5, reach: 1.45 }),
      { id: "sac", src: sacSide, bone: "torso", z: 4, anim: { pulse: 0.025 } },
      { id: "abdomen", src: abdomenSide, bone: "torso", z: 5 },
      placed("plate", SHARED.plate, "torso", 64, -160, 5.5, 1.9, -22),
      { id: "thorax", src: thoraxSide, bone: "torso", z: 6 },
      { id: "head", src: headSide, bone: "gun", place: { x: -36, y: -112, rot: 0, scale: 1.4 }, z: 9 },
      placed("eyes", SHARED.eyes, "gun", -66, -120, 10, 2.3),
      bladeOn(near, { z: 12, reach: 1.45 }),
    ],
    limbs: [...legs.limbs, far, near],
    gait: legs.gait,
    weapon: "head",
    fx: { muzzle: ACID },
  });
}

export function motherTop(): RigDef {
  const legs = topLegs({
    hips: [{ x: -28, y: -60 }, { x: -34, y: -46 }, { x: -28, y: -32 }],
    knees: [{ x: -80, y: -98 }, { x: -98, y: -48 }, { x: -80, y: 6 }],
    feet: [{ x: -118, y: -128 }, { x: -140, y: -46 }, { x: -120, y: 66 }],
    width: [7.4, 5.8],
    step: 12,
    z: 1,
  });
  const left = scytheArm("armL", { x: -24, y: -68 }, { x: -58, y: -100 }, { x: -36, y: -136 }, { z: 9, width: [8, 7] });
  const right = scytheArm("armR", { x: 24, y: -68 }, { x: 58, y: -100 }, { x: 36, y: -136 }, { z: 9, width: [8, 7] });
  return insectRig({
    id: "swarm.mother.top",
    name: "The Broodmother (from above)",
    view: "top",
    height: 270,
    k: 1.6,
    spits: true,
    limbInk: 2,
    pivots: { torso: { x: 0, y: -48 }, head: { x: 0, y: -76 } },
    parts: [
      { id: "sac", src: sacTop, bone: "torso", place: { x: 0, y: -28, rot: 0 }, z: 4, anim: { pulse: 0.02 } },
      { id: "plates", src: platesTop, bone: "torso", place: { x: 0, y: -28, rot: 0 }, z: 5 },
      placed("plate", SHARED.plate, "torso", 0, 20, 5.5, 2, 90),
      { id: "thorax", src: thoraxTop, bone: "torso", place: { x: 0, y: -50, rot: 0 }, z: 6 },
      { id: "head", src: headTop, bone: "gun", place: { x: 0, y: -76, rot: 90, scale: 1.1 }, z: 7 },
      placed("eyes", SHARED.eyes, "gun", 0, -104, 8, 1.6),
      bladeOn(left, { z: 9.5, reach: 1.45, mirror: true }),
      bladeOn(right, { z: 9.5, reach: 1.45 }),
    ],
    limbs: [...legs.limbs, left, right],
    gait: legs.gait,
    weapon: "head",
    fx: { muzzle: ACID },
    shadow: { x: 10, y: 14, r: 120 },
  });
}
