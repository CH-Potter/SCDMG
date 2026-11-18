// Brood Tenders (swarm-tenders): fussy nursemaids with backs full of eggs. The skitterling's body
// and head a size up (the kit at work), a glowing egg pile on the back that breathes, and two long
// dainty ivory forelegs held out in front, pincers ready, where a skitterling has scythes.

import bodySide from "../../parts/swarm/skitter/body.svg?raw";
import headSide from "../../parts/swarm/skitter/head.svg?raw";
import bodyTop from "../../parts/swarm/skitter-top/body.svg?raw";
import headTop from "../../parts/swarm/skitter-top/head.svg?raw";
import eggs from "../../parts/swarm/bug/eggs.svg?raw";
import type { RigDef } from "../../types";
import { about, bladeOn, insectRig, placed, scytheArm, SHARED, sideLegs, topLegs } from "./kit";

export function tenderSide(): RigDef {
  const legs = sideLegs({
    hips: [{ x: -6, y: -30 }, { x: 4, y: -29 }, { x: 16, y: -30 }],
    knees: [{ x: -24, y: -46 }, { x: 6, y: -50 }, { x: 38, y: -47 }],
    feet: [-40, 10, 50],
    far: { x: 11, y: -3 },
    width: [3.2, 2.4],
    step: 6,
    lift: 8,
    z: [8, 1],
  });
  const near = scytheArm("armN", { x: -10, y: -42 }, { x: -24, y: -70 }, { x: -48, y: -60 }, { z: 11, slot: "leather", width: [2.8, 2.4] });
  const far = scytheArm("armF", { x: -6, y: -44 }, { x: -16, y: -72 }, { x: -40, y: -64 }, { z: 2, slot: "suit", width: [2.6, 2.2] });
  return insectRig({
    id: "swarm.tender.side",
    name: "Brood Tender",
    view: "side",
    height: 100,
    k: 0.7,
    limbInk: 1.4,
    pivots: { torso: { x: 2, y: -37 }, head: { x: -11, y: -37 } },
    parts: [
      bladeOn(far, { z: 2.5, reach: 1, id: "pincer-far" }),
      { id: "body", src: bodySide, bone: "torso", place: about({ x: 2, y: -31 }, { x: 2, y: -37 }, 1.5), z: 5 },
      placed("plate", SHARED.plate, "torso", 53, -47, 6, 1, 50),
      placed("eggs", eggs, "torso", 26, -57, 7, 1.15, -6, { pulse: 0.04 }),
      { id: "head", src: headSide, bone: "gun", place: { x: -11, y: -37, rot: 0, scale: 1.4 }, z: 9 },
      placed("eyes", SHARED.eyes, "gun", -22, -41, 10, 1),
      bladeOn(near, { z: 12, reach: 1, id: "pincer" }),
    ],
    limbs: [...legs.limbs, far, near],
    gait: legs.gait,
    weapon: "head",
  });
}

export function tenderTop(): RigDef {
  const legs = topLegs({
    hips: [{ x: -9, y: -6 }, { x: -10, y: 0 }, { x: -9, y: 6 }],
    knees: [{ x: -22, y: -16 }, { x: -26, y: 0 }, { x: -22, y: 15 }],
    feet: [{ x: -31, y: -30 }, { x: -37, y: 1 }, { x: -31, y: 32 }],
    width: [2.8, 2.2],
    step: 4,
    z: 1,
  });
  const left = scytheArm("armL", { x: -7, y: -10 }, { x: -20, y: -26 }, { x: -11, y: -46 }, { z: 7, slot: "leather", width: [2.6, 2.2] });
  const right = scytheArm("armR", { x: 7, y: -10 }, { x: 20, y: -26 }, { x: 11, y: -46 }, { z: 7, slot: "leather", width: [2.6, 2.2] });
  return insectRig({
    id: "swarm.tender.top",
    name: "Brood Tender (from above)",
    view: "top",
    height: 86,
    k: 0.7,
    limbInk: 1.4,
    pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: -11 } },
    parts: [
      { id: "body", src: bodyTop, bone: "torso", place: { x: 0, y: 0, rot: 0, scale: 1.55 }, z: 5 },
      placed("plate", SHARED.plate, "torso", 0, 42, 6, 0.9, 90),
      placed("eggs", eggs, "torso", 0, 34, 7, 1.15, 0, { pulse: 0.04 }),
      { id: "head", src: headTop, bone: "gun", place: { x: 0, y: -11, rot: 0, scale: 1.4 }, z: 6 },
      placed("eyes", SHARED.eyes, "gun", 0, -21, 6.5, 0.9),
      bladeOn(left, { z: 7.5, reach: 1, mirror: true, id: "pincer-l" }),
      bladeOn(right, { z: 7.5, reach: 1, id: "pincer-r" }),
    ],
    limbs: [...legs.limbs, left, right],
    gait: legs.gait,
    weapon: "head",
    shadow: { x: 5, y: 7, r: 32 },
  });
}
