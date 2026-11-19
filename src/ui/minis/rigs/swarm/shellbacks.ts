// Shellback Brood (swarm-shellbacks): beetles under shells like upturned bathtubs, short legs
// poking out under a rolled lip, and crusher mandibles with acid in them.

import shellSide from "../../parts/swarm/shellback/shell.svg?raw";
import head from "../../parts/swarm/shellback/head.svg?raw";
import shellTop from "../../parts/swarm/shellback-top/shell.svg?raw";
import type { RigDef } from "../../types";
import { insectRig, placed, SHARED, sideLegs, topLegs } from "./kit";

export function shellbackSide(): RigDef {
  const legs = sideLegs({
    hips: [{ x: -22, y: -26 }, { x: 2, y: -24 }, { x: 24, y: -26 }],
    knees: [{ x: -50, y: -36 }, { x: -10, y: -32 }, { x: 56, y: -36 }],
    feet: [-56, -16, 60],
    far: { x: 10, y: -2 },
    width: [5.4, 4.2],
    step: 6,
    lift: 7,
    z: [4, 1],
  });
  return insectRig({
    id: "swarm.shellback.side",
    name: "Shellback",
    view: "side",
    height: 86,
    k: 0.8,
    pivots: { torso: { x: 2, y: -40 }, head: { x: -42, y: -32 } },
    parts: [
      { id: "shell", src: shellSide, bone: "torso", z: 6 },
      placed("plate", SHARED.plate, "torso", 10, -78, 7, 1.1, 4),
      { id: "head", src: head, bone: "gun", place: { x: -40, y: -32, rot: 0, scale: 1.25 }, z: 5 },
      placed("eyes", SHARED.eyes, "gun", -50, -39, 5.5, 0.9),
    ],
    limbs: legs.limbs,
    gait: legs.gait,
    weapon: "head",
  });
}

export function shellbackTop(): RigDef {
  const legs = topLegs({
    hips: [{ x: -28, y: -20 }, { x: -32, y: 4 }, { x: -28, y: 28 }],
    knees: [{ x: -44, y: -28 }, { x: -50, y: 4 }, { x: -44, y: 38 }],
    feet: [{ x: -50, y: -42 }, { x: -58, y: 5 }, { x: -50, y: 50 }],
    width: [4.6, 3.6],
    step: 4,
    z: 1,
  });
  return insectRig({
    id: "swarm.shellback.top",
    name: "Shellback (from above)",
    view: "top",
    height: 116,
    k: 0.8,
    pivots: { torso: { x: 0, y: 4 }, head: { x: 0, y: -40 } },
    parts: [
      { id: "head", src: head, bone: "gun", place: { x: 0, y: -50, rot: 90, scale: 1.3 }, z: 3 },
      placed("eyes", SHARED.eyes, "gun", 0, -61, 3.5, 0.9),
      { id: "shell", src: shellTop, bone: "torso", z: 5 },
      placed("plate", SHARED.plate, "torso", 0, 20, 6, 1.1, 90),
    ],
    limbs: legs.limbs,
    gait: legs.gait,
    weapon: "head",
    shadow: { x: 6, y: 9, r: 50 },
  });
}
