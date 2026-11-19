// Acid Spitters (swarm-spitters): the skitterling's body grown a size, a swollen lime acid sac
// strapped to its back and a ringed spout for a mouth. They gargle, they aim, they spit.

import sac from "../../parts/swarm/spitter/sac.svg?raw";
import spoutHead from "../../parts/swarm/spitter/head.svg?raw";
import bodySide from "../../parts/swarm/skitter/body.svg?raw";
import bodyTop from "../../parts/swarm/skitter-top/body.svg?raw";
import type { RigDef } from "../../types";
import { about, insectRig, placed, SHARED, sideLegs, topLegs } from "./kit";

const ACID = "#c8ef5a";

export function spitterSide(): RigDef {
  const legs = sideLegs({
    hips: [{ x: -6, y: -30 }, { x: 4, y: -29 }, { x: 15, y: -30 }],
    knees: [{ x: -26, y: -47 }, { x: 5, y: -51 }, { x: 36, y: -48 }],
    feet: [-44, 9, 46],
    far: { x: 11, y: -3 },
    width: [3.6, 2.8],
    step: 6,
    lift: 8,
    z: [8, 1],
  });
  return insectRig({
    id: "swarm.spitter.side",
    name: "Acid Spitter",
    view: "side",
    height: 96,
    k: 0.7,
    spits: true,
    limbInk: 1.4,
    pivots: { torso: { x: 2, y: -38 }, head: { x: -11, y: -38 } },
    parts: [
      { id: "body", src: bodySide, bone: "torso", place: about({ x: 2, y: -31 }, { x: 2, y: -38 }, 1.45), z: 5 },
      placed("plate", SHARED.plate, "torso", 51, -49, 6, 1, 40),
      placed("sac", sac, "torso", 22, -70, 7, 1.15, 0, { pulse: 0.06 }),
      { id: "head", src: spoutHead, bone: "gun", place: { x: -11, y: -38, rot: 0, scale: 1.15 }, z: 9 },
      placed("eyes", SHARED.eyes, "gun", -20, -44, 10, 1),
    ],
    limbs: legs.limbs,
    gait: legs.gait,
    weapon: "head",
    fx: { muzzle: ACID },
  });
}

export function spitterTop(): RigDef {
  const legs = topLegs({
    hips: [{ x: -9, y: -6 }, { x: -10, y: 0 }, { x: -9, y: 6 }],
    knees: [{ x: -22, y: -16 }, { x: -26, y: 0 }, { x: -22, y: 15 }],
    feet: [{ x: -31, y: -30 }, { x: -37, y: 1 }, { x: -31, y: 32 }],
    width: [3, 2.4],
    step: 4,
    z: 1,
  });
  return insectRig({
    id: "swarm.spitter.top",
    name: "Acid Spitter (from above)",
    view: "top",
    height: 80,
    k: 0.7,
    spits: true,
    limbInk: 1.4,
    pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: -11 } },
    parts: [
      { id: "body", src: bodyTop, bone: "torso", place: { x: 0, y: 0, rot: 0, scale: 1.55 }, z: 5 },
      placed("sac", sac, "torso", 0, 18, 6, 1.2, 0, { pulse: 0.06 }),
      placed("plate", SHARED.plate, "torso", 0, 44, 6.5, 0.9, 90),
      { id: "head", src: spoutHead, bone: "gun", place: { x: 0, y: -11, rot: 90, scale: 1.15 }, z: 7 },
      placed("eyes", SHARED.eyes, "gun", 0, -18, 8, 0.9),
    ],
    limbs: legs.limbs,
    gait: legs.gait,
    weapon: "head",
    fx: { muzzle: ACID },
    shadow: { x: 5, y: 7, r: 32 },
  });
}
