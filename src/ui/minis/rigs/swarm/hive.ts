// The Swarm's structures, on the structure frame (no limbs, never walk): the Brood Spire, the Acid
// Geyser, the summon-only Egg Clutch and Tunnel Mouth. All squat (no taller than 1.4 times their
// base), all breathing: vents and pools pulse, the spire coughs spores from its mouth, leg tips
// bob in the tunnel mouth. Shared parts from the bug kit (eggs, hooks, the vent, the plate) keep
// the hive and the bugs one family.

import chimney from "../../parts/swarm/spire/chimney.svg?raw";
import holes from "../../parts/swarm/spire/holes.svg?raw";
import crown from "../../parts/swarm/spire/crown.svg?raw";
import rim from "../../parts/swarm/spire/rim.svg?raw";
import spireTop from "../../parts/swarm/spire-top/body.svg?raw";
import spireMouth from "../../parts/swarm/spire-top/mouth.svg?raw";
import crust from "../../parts/swarm/geyser/crust.svg?raw";
import pool from "../../parts/swarm/geyser/pool.svg?raw";
import crustTop from "../../parts/swarm/geyser-top/crust.svg?raw";
import poolTop from "../../parts/swarm/geyser-top/pool.svg?raw";
import vent from "../../parts/swarm/bombard/vent.svg?raw";
import eggs from "../../parts/swarm/bug/eggs.svg?raw";
import nest from "../../parts/swarm/hive/nest.svg?raw";
import clutch from "../../parts/swarm/hive-top/clutch.svg?raw";
import hole from "../../parts/swarm/hive/hole.svg?raw";
import lip from "../../parts/swarm/hive/lip.svg?raw";
import holeTop from "../../parts/swarm/hive-top/hole.svg?raw";
import type { RigDef } from "../../types";
import { placed, SHARED, structureRig } from "./kit";

const ACID = "#c8ef5a";
const SPORE = "#d8e8a0";

export const spireSide = (): RigDef =>
  structureRig({
    id: "swarm.spire.side",
    name: "Brood Spire",
    view: "side",
    height: 222,
    parts: [
      { id: "chimney", src: chimney, bone: "torso", z: 5 },
      { id: "holes", src: holes, bone: "torso", z: 6, anim: { pulse: 0.04 } },
      placed("plate", SHARED.plate, "torso", 30, -46, 6.5, 1.6, -6),
      { id: "crown", src: crown, bone: "torso", z: 7 },
      { id: "mouth", src: rim, bone: "gun", place: { x: 0, y: -186, rot: 90, scale: 1 }, z: 8 },
    ],
    weapon: "mouth",
    fx: { muzzle: SPORE, puff: SPORE },
  });

export const spireTopRig = (): RigDef =>
  structureRig({
    id: "swarm.spire.top",
    name: "Brood Spire (from above)",
    view: "top",
    height: 150,
    parts: [
      { id: "body", src: spireTop, bone: "torso", z: 5 },
      placed("plate", SHARED.plate, "torso", 0, -62, 6, 1.6, 0),
      { id: "mouth", src: spireMouth, bone: "gun", z: 7, anim: { pulse: 0.03 } },
    ],
    weapon: "mouth",
    fx: { muzzle: SPORE, puff: SPORE },
    shadow: { x: 10, y: 14, r: 74 },
  });

export const geyserSide = (): RigDef =>
  structureRig({
    id: "swarm.geyser.side",
    name: "Acid Geyser",
    view: "side",
    height: 104,
    parts: [
      { id: "crust", src: crust, bone: "torso", z: 5 },
      placed("pool", pool, "torso", 0, -69, 6, 1, 0, { pulse: 0.06 }),
      placed("plate", SHARED.plate, "torso", -50, -26, 6.5, 1.5, -24),
      { id: "vent", src: vent, bone: "gun", place: { x: 14, y: -70, rot: 76, scale: 0.9 }, z: 7 },
    ],
    weapon: "vent",
    fx: { muzzle: ACID },
  });

export const geyserTop = (): RigDef =>
  structureRig({
    id: "swarm.geyser.top",
    name: "Acid Geyser (from above)",
    view: "top",
    height: 140,
    parts: [
      { id: "crust", src: crustTop, bone: "torso", z: 5 },
      placed("pool", poolTop, "torso", 0, 0, 6, 1.1, 0, { pulse: 0.06 }),
      placed("plate", SHARED.plate, "torso", -46, 30, 6.5, 1.5, 40),
      { id: "vent", src: vent, bone: "gun", place: { x: 8, y: -4, rot: 90, scale: 0.75 }, z: 7 },
    ],
    weapon: "vent",
    fx: { muzzle: ACID },
    shadow: { x: 8, y: 12, r: 66 },
  });

export const eggsSide = (): RigDef =>
  structureRig({
    id: "swarm.eggs.side",
    name: "Egg Clutch",
    view: "side",
    height: 96,
    fixed: true,
    parts: [
      placed("eggs", eggs, "torso", 0, -28, 4, 1.55, 0, { pulse: 0.04 }),
      { id: "nest", src: nest, bone: "torso", z: 5 },
      placed("plate", SHARED.plate, "torso", 32, -14, 6, 1.5, 0),
    ],
  });

export const eggsTop = (): RigDef =>
  structureRig({
    id: "swarm.eggs.top",
    name: "Egg Clutch (from above)",
    view: "top",
    height: 116,
    fixed: true,
    parts: [
      { id: "clutch", src: clutch, bone: "torso", z: 5, anim: { pulse: 0.015 } },
      placed("plate", SHARED.plate, "torso", 40, -36, 6, 1.4, 45),
    ],
    shadow: { x: 6, y: 10, r: 56 },
  });

export const mouthSide = (): RigDef =>
  structureRig({
    id: "swarm.mouth.side",
    name: "Tunnel Mouth",
    view: "side",
    height: 62,
    fixed: true,
    parts: [
      { id: "hole", src: hole, bone: "root", z: 1 },
      placed("leg", SHARED.hook, "root", -22, -14, 2, 1.15, -100, { float: 3 }),
      placed("leg2", SHARED.hookMirror, "root", 22, -12, 2.1, 0.95, -82, { float: -2.5 }),
      { id: "lip", src: lip, bone: "root", z: 5 },
      placed("plate", SHARED.plate, "root", 46, -6, 6, 1.4, -6),
    ],
  });

export const mouthTop = (): RigDef =>
  structureRig({
    id: "swarm.mouth.top",
    name: "Tunnel Mouth (from above)",
    view: "top",
    height: 136,
    fixed: true,
    parts: [
      { id: "hole", src: holeTop, bone: "root", z: 1 },
      placed("leg", SHARED.hook, "root", -12, 10, 2, 0.95, -60, { float: 2 }),
      placed("leg2", SHARED.hookMirror, "root", 10, 14, 2.1, 0.8, -120, { float: -2 }),
      placed("plate", SHARED.plate, "root", 46, -40, 3, 1.4, 40),
    ],
    shadow: { x: 4, y: 6, r: 64 },
  });
