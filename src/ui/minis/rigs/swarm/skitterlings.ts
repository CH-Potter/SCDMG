// Skitterlings (swarm-skitterlings): cat-sized, all legs and all mouth. Six splayed legs, a tail-up
// abdomen and two raised scythe hooks: the swarm's line bug and the template for the insect kit.

import bodySide from "../../parts/swarm/skitter/body.svg?raw";
import headSide from "../../parts/swarm/skitter/head.svg?raw";
import bodyTop from "../../parts/swarm/skitter-top/body.svg?raw";
import headTop from "../../parts/swarm/skitter-top/head.svg?raw";
import type { RigDef } from "../../types";
import { about, bladeOn, insectRig, placed, scytheArm, SHARED, sideLegs, topLegs } from "./kit";

/** The body parts are drawn small; the figure wears them a size up. */
const S = 1.3;
const THORAX = { x: 2, y: -31 };

/** `raised`: hooks up and ready (the default) or folded low (a second look for a squad). */
export function skitterSide(raised = true): RigDef {
  const legs = sideLegs({
    hips: [{ x: -4, y: -24 }, { x: 3, y: -23 }, { x: 11, y: -24 }],
    knees: [{ x: -22, y: -40 }, { x: 4, y: -43 }, { x: 28, y: -41 }],
    feet: [-38, 8, 38],
    far: { x: 9, y: -3 },
    width: [3.2, 2.4],
    step: 5,
    lift: 7,
    z: [8, 1],
  });
  const near = raised
    ? scytheArm("armN", { x: -7, y: -38 }, { x: -9, y: -64 }, { x: -23, y: -59 }, { z: 11, width: [3.6, 3] })
    : scytheArm("armN", { x: -7, y: -38 }, { x: -18, y: -51 }, { x: -29, y: -41 }, { z: 11, width: [3.6, 3] });
  const far = raised
    ? scytheArm("armF", { x: -2, y: -39 }, { x: -2, y: -62 }, { x: -16, y: -58 }, { z: 2, slot: "suit", width: [3.2, 2.6] })
    : scytheArm("armF", { x: -2, y: -39 }, { x: -12, y: -52 }, { x: -23, y: -43 }, { z: 2, slot: "suit", width: [3.2, 2.6] });
  return insectRig({
    id: `swarm.skitter.side${raised ? "" : ".low"}`,
    name: raised ? "Skitterling, hooks raised" : "Skitterling, hooks low",
    view: "side",
    height: raised ? 70 : 56,
    k: 0.55,
    limbInk: 1.4,
    pivots: { torso: { x: 2, y: -30 }, head: { x: -8, y: -30 } },
    parts: [
      bladeOn(far, { z: 2.5, reach: 1.7 }),
      { id: "body", src: bodySide, bone: "torso", place: about(THORAX, { x: 2, y: -30 }, S), z: 5 },
      placed("plate", SHARED.plate, "torso", 30, -48, 6, 0.9, -16),
      { id: "head", src: headSide, bone: "gun", place: { x: -8, y: -30, rot: 0, scale: S }, z: 9 },
      placed("eyes", SHARED.eyes, "gun", -17, -34, 10, 0.95),
      bladeOn(near, { z: 12, reach: 1.7 }),
    ],
    limbs: [...legs.limbs, far, near],
    gait: legs.gait,
    weapon: "head",
  });
}

export function skitterTop(raised = true): RigDef {
  const legs = topLegs({
    hips: [{ x: -7.5, y: -5 }, { x: -8.5, y: 0 }, { x: -7.5, y: 5 }],
    knees: [{ x: -19, y: -14 }, { x: -22, y: 0 }, { x: -19, y: 13 }],
    feet: [{ x: -27, y: -26 }, { x: -33, y: 1 }, { x: -27, y: 28 }],
    width: [2.8, 2.2],
    step: 4,
    z: 1,
  });
  const reach = raised ? 1 : 0.7;
  const left = scytheArm("armL", { x: -6, y: -8 }, { x: -14, y: -19 }, { x: -8, y: -19 - 11 * reach }, { z: 7, width: [3.2, 2.8] });
  const right = scytheArm("armR", { x: 6, y: -8 }, { x: 14, y: -19 }, { x: 8, y: -19 - 11 * reach }, { z: 7, width: [3.2, 2.8] });
  return insectRig({
    id: `swarm.skitter.top${raised ? "" : ".low"}`,
    name: "Skitterling (from above)",
    view: "top",
    height: 66,
    k: 0.55,
    limbInk: 1.4,
    pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: -9 } },
    parts: [
      { id: "body", src: bodyTop, bone: "torso", place: { x: 0, y: 0, rot: 0, scale: 1.25 }, z: 5 },
      placed("plate", SHARED.plate, "torso", 0, 24, 6, 0.9, 90),
      { id: "head", src: headTop, bone: "gun", place: { x: 0, y: -9, rot: 0, scale: 1.25 }, z: 6 },
      placed("eyes", SHARED.eyes, "gun", 0, -17, 6.5, 0.85),
      bladeOn(left, { z: 7.5, reach: 1.7, mirror: true }),
      bladeOn(right, { z: 7.5, reach: 1.7 }),
    ],
    limbs: [...legs.limbs, left, right],
    gait: legs.gait,
    weapon: "head",
    shadow: { x: 4, y: 6, r: 28 },
  });
}
