// The Beam Warden: a courtier in a bell robe (no legs: it glides), a peaked hood, a hex halo behind
// the head and a tall staff with a crystal floating over its cradle. Built on the courtier kit.

import collarHigh from "../../parts/concord/courtier/collar-high.svg?raw";
import collarHighTop from "../../parts/concord/courtier-top/collar-high.svg?raw";
import robe from "../../parts/concord/warden/robe.svg?raw";
import halo from "../../parts/concord/warden/halo.svg?raw";
import staff from "../../parts/concord/warden/staff.svg?raw";
import crystal from "../../parts/concord/warden/crystal.svg?raw";
import hood from "../../parts/concord/warden/hood.svg?raw";
import robeTop from "../../parts/concord/warden-top/robe.svg?raw";
import haloTop from "../../parts/concord/warden-top/halo.svg?raw";
import staffTop from "../../parts/concord/warden-top/staff.svg?raw";
import crystalTop from "../../parts/concord/warden-top/crystal.svg?raw";
import hoodTop from "../../parts/concord/warden-top/hood.svg?raw";
import type { RigDef } from "../../types";
import { courtierSide, courtierTop, glideClips } from "./kit";

export function wardenSide(): RigDef {
  return courtierSide({
    id: "concord.warden.side",
    name: "Beam Warden",
    height: 190,
    helm: hood,
    collar: collarHigh,
    legs: "none",
    weapon: { src: staff, place: { x: 34, y: 30, rot: 90 } },
    hips: [{ id: "robe", src: robe, z: 4 }],
    extra: [
      { id: "halo", src: halo, bone: "head", place: { x: 73, y: 32, rot: 0, scale: 1.25 }, z: 0.5, anim: { pulse: 0.035 } },
      { id: "crystal", src: crystal, bone: "gun", place: { x: 34, y: 18, rot: 0, scale: 1.25 }, z: 11.2, anim: { float: 3, pulse: 0.05 } },
    ],
    clips: glideClips(),
  });
}

export function wardenTop(): RigDef {
  const K = 1.4;
  return courtierTop({
    id: "concord.warden.top",
    name: "Beam Warden (from above)",
    helm: hoodTop,
    collar: collarHighTop,
    weapon: { src: staffTop, place: { x: -11, y: -12, rot: 90 } },
    under: [{ id: "robe", src: robeTop, z: 0.5 }],
    extra: [
      { id: "halo", src: haloTop, bone: "head", place: { x: 0, y: 7 * K, rot: 0, scale: K * 1.35 }, z: 5.6 },
      { id: "crystal", src: crystalTop, bone: "gun", place: { x: -11 * K, y: -13 * K, rot: 0, scale: K * 1.3 }, z: 6.5, anim: { pulse: 0.08 } },
    ],
    height: 40,
    shadow: { x: 4, y: 6, r: 19 },
    scale: K,
  });
}
