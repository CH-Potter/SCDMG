// Bile Bombard (swarm-bombard): a beetle the size of a hay cart with a belly full of acid and a very
// strong cough. A high split carapace, a sagging lime belly that breathes, and a ringed vent on its
// back (the weapon) that heaves and lobs. Its head is the shellback's, worn a size up.

import bodySide from "../../parts/swarm/bombard/body.svg?raw";
import belly from "../../parts/swarm/bombard/belly.svg?raw";
import vent from "../../parts/swarm/bombard/vent.svg?raw";
import bodyTop from "../../parts/swarm/bombard-top/body.svg?raw";
import head from "../../parts/swarm/shellback/head.svg?raw";
import type { Clip, RigDef } from "../../types";
import { insectRig, placed, SHARED, sideLegs, topLegs } from "./kit";

const ACID = "#c8ef5a";

/** The cough: the vent kicks, the whole beetle squats and heaves. */
const lob = (view: "side" | "top"): Clip => ({
  id: "recoil",
  dur: 420,
  loop: false,
  tracks: {
    kick: [[0, 0], [70, 1, "out"], [320, 0, "inOut"]],
    muzzle: [[0, 1], [80, 1], [81, 0, "linear"]],
    ...(view === "side"
      ? { pelvisY: [[0, 0], [70, 5, "out"], [200, -1.5, "inOut"], [420, 0, "inOut"]], torsoRot: [[0, 0], [70, -3, "out"], [420, 0, "inOut"]] }
      : { rootSX: [[0, 0], [70, 0.05, "out"], [420, 0, "inOut"]], rootSY: [[0, 0], [70, -0.04, "out"], [420, 0, "inOut"]] }),
  },
});

export function bombardSide(): RigDef {
  const legs = sideLegs({
    hips: [{ x: -30, y: -58 }, { x: 4, y: -56 }, { x: 38, y: -58 }],
    knees: [{ x: -70, y: -72 }, { x: -6, y: -74 }, { x: 78, y: -72 }],
    feet: [-84, -8, 96],
    far: { x: 16, y: -4 },
    width: [7.4, 6],
    step: 10,
    lift: 10,
    z: [4, 1],
  });
  return insectRig({
    id: "swarm.bombard.side",
    name: "Bile Bombard",
    view: "side",
    height: 166,
    k: 1.2,
    spits: true,
    limbInk: 1.8,
    pivots: { torso: { x: 4, y: -84 }, head: { x: -60, y: -72 } },
    parts: [
      placed("belly", belly, "torso", 6, -50, 3, 1, 0, { pulse: 0.045 }),
      { id: "body", src: bodySide, bone: "torso", z: 5 },
      placed("plate", SHARED.plate, "torso", -14, -112, 6, 1.5, -18),
      { id: "head", src: head, bone: "head", place: { x: -58, y: -72, rot: 0, scale: 1.45 }, z: 6 },
      placed("eyes", SHARED.eyes, "head", -72, -80, 7, 1.3),
      { id: "vent", src: vent, bone: "gun", place: { x: 30, y: -108, rot: 66, scale: 1.65 }, z: 4.5 },
    ],
    limbs: legs.limbs,
    gait: legs.gait,
    weapon: "vent",
    fx: { muzzle: ACID },
    clips: { recoil: lob("side") },
  });
}

export function bombardTop(): RigDef {
  const legs = topLegs({
    hips: [{ x: -40, y: -30 }, { x: -46, y: 0 }, { x: -40, y: 30 }],
    knees: [{ x: -64, y: -44 }, { x: -72, y: 0 }, { x: -64, y: 46 }],
    feet: [{ x: -78, y: -66 }, { x: -90, y: 2 }, { x: -78, y: 72 }],
    width: [6.4, 5.2],
    step: 8,
    z: 1,
  });
  return insectRig({
    id: "swarm.bombard.top",
    name: "Bile Bombard (from above)",
    view: "top",
    height: 180,
    k: 1.2,
    spits: true,
    limbInk: 1.8,
    pivots: { torso: { x: 0, y: 4 }, head: { x: 0, y: -58 } },
    parts: [
      { id: "head", src: head, bone: "head", place: { x: 0, y: -58, rot: 90, scale: 1.45 }, z: 3 },
      placed("eyes", SHARED.eyes, "head", 0, -74, 3.5, 1.2),
      { id: "body", src: bodyTop, bone: "torso", place: { x: 0, y: 6, rot: 0 }, z: 5 },
      placed("plate", SHARED.plate, "torso", -22, 30, 6, 1.4, 70),
      { id: "vent", src: vent, bone: "gun", place: { x: 0, y: 34, rot: 90, scale: 1.1 }, z: 7 },
    ],
    limbs: legs.limbs,
    gait: legs.gait,
    weapon: "vent",
    fx: { muzzle: ACID },
    clips: { recoil: lob("top") },
    shadow: { x: 8, y: 12, r: 70 },
  });
}
