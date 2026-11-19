// Trapjaw Lurker (swarm-lurker): that isn't a rock. A stone-crusted hump crouched on folded legs,
// and a pair of enormous jaws held wide open that snap shut when it strikes. The upper (right)
// jaw rides the gun bone and the lower (left) one the head bone, both hinged at the jaw joint, so
// the strike clip snaps them together with gunRot and headRot.

import humpSide from "../../parts/swarm/lurker/hump.svg?raw";
import jawUp from "../../parts/swarm/lurker/jaw-up.svg?raw";
import jawLow from "../../parts/swarm/lurker/jaw-low.svg?raw";
import humpTop from "../../parts/swarm/lurker-top/hump.svg?raw";
import type { Clip, Key, RigDef } from "../../types";
import { insectRig, placed, SHARED, sideLegs, topLegs } from "./kit";

/** The snap: gape a beat wider, slam shut, hold, ease open. */
const snap = (lunge: Key[]): Clip => ({
  id: "recoil",
  dur: 520,
  loop: false,
  tracks: {
    headRot: [[0, 0], [90, -8, "out"], [150, 30, "out"], [320, 30], [520, 0, "inOut"]],
    gunRot: [[0, 0], [90, 8, "out"], [150, -28, "out"], [320, -28], [520, 0, "inOut"]],
    ...(lunge.length ? { pelvisX: lunge } : {}),
    torsoRot: [[0, 0], [150, -3, "out"], [520, 0, "inOut"]],
  },
});

export function lurkerSide(): RigDef {
  const legs = sideLegs({
    hips: [{ x: -4, y: -32 }, { x: 16, y: -30 }, { x: 36, y: -32 }],
    knees: [{ x: -16, y: -46 }, { x: 18, y: -50 }, { x: 50, y: -46 }],
    feet: [-28, 16, 60],
    far: { x: 8, y: -2 },
    width: [4.4, 3.6],
    step: 5,
    lift: 6,
    z: [4, 1],
  });
  const hinge = { x: -12, y: -40 };
  return insectRig({
    id: "swarm.lurker.side",
    name: "Trapjaw Lurker",
    view: "side",
    height: 94,
    k: 0.8,
    pivots: { torso: { x: 20, y: -50 }, head: hinge },
    parts: [
      { id: "hump", src: humpSide, bone: "torso", place: { x: 0, y: -4, rot: 0, scale: 1.08 }, z: 5 },
      placed("plate", SHARED.plate, "torso", 50, -40, 6, 1, 64),
      { id: "jaw-low", src: jawLow, bone: "head", place: { x: hinge.x, y: hinge.y + 4, rot: -6, scale: 1.15 }, z: 7 },
      placed("knob", SHARED.knob, "torso", -12, -42, 8, 1),
      { id: "jaw", src: jawUp, bone: "gun", place: { x: hinge.x, y: hinge.y - 3, rot: 16, scale: 1.15 }, z: 9 },
      placed("eyes", SHARED.eyes, "torso", -16, -45, 10, 1),
    ],
    limbs: legs.limbs,
    gait: legs.gait,
    weapon: "jaw",
    clips: { recoil: snap([[0, 0], [90, 3, "out"], [150, -8, "out"], [320, -8], [520, 0, "inOut"]]) },
  });
}

export function lurkerTop(): RigDef {
  const legs = topLegs({
    hips: [{ x: -18, y: -14 }, { x: -22, y: 6 }, { x: -18, y: 24 }],
    knees: [{ x: -34, y: -22 }, { x: -40, y: 6 }, { x: -34, y: 34 }],
    feet: [{ x: -40, y: -34 }, { x: -50, y: 7 }, { x: -40, y: 46 }],
    width: [4.2, 3.4],
    step: 4,
    z: 1,
  });
  return insectRig({
    id: "swarm.lurker.top",
    name: "Trapjaw Lurker (from above)",
    view: "top",
    height: 118,
    k: 0.8,
    pivots: { torso: { x: 0, y: 4 }, head: { x: -7, y: -32 } },
    parts: [
      { id: "jaw-low", src: jawLow, bone: "head", place: { x: -7, y: -32, rot: 62, scale: 1.1 }, z: 3 },
      { id: "jaw", src: jawUp, bone: "gun", place: { x: 7, y: -32, rot: 118, scale: 1.1 }, z: 3.1 },
      placed("knob", SHARED.knob, "torso", 0, -32, 4, 1.1),
      placed("eyes", SHARED.eyes, "torso", 0, -36, 4.5, 0.95),
      { id: "hump", src: humpTop, bone: "torso", place: { x: 0, y: 4, rot: 0, scale: 1.1 }, z: 5 },
      placed("plate", SHARED.plate, "torso", 0, 40, 6, 1, 90),
    ],
    limbs: legs.limbs,
    gait: legs.gait,
    weapon: "jaw",
    clips: { recoil: { ...snap([]), tracks: { ...snap([]).tracks, rootY: [[0, 0], [90, 2, "out"], [150, -7, "out"], [320, -7], [520, 0, "inOut"]] } } },
    shadow: { x: 6, y: 8, r: 44 },
  });
}
