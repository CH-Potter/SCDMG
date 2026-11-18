// The Concord's foot courtiers, all built on the courtier kit: Phase Guard, Ray Lancer, Blink
// Dancers and Jetwing Scouts. Each is a helm, a collar, a weapon and one or two worn pieces.

import helmCrest from "../../parts/concord/courtier/helm-crest.svg?raw";
import helmCaptain from "../../parts/concord/courtier/helm-captain.svg?raw";
import helmCone from "../../parts/concord/courtier/helm-cone.svg?raw";
import helmTiara from "../../parts/concord/courtier/helm-tiara.svg?raw";
import helmAviator from "../../parts/concord/courtier/helm-aviator.svg?raw";
import collarFan from "../../parts/concord/courtier/collar-fan.svg?raw";
import collarRuff from "../../parts/concord/courtier/collar-ruff.svg?raw";
import collarHigh from "../../parts/concord/courtier/collar-high.svg?raw";
import gorget from "../../parts/concord/courtier/gorget.svg?raw";
import phaseBlade from "../../parts/concord/courtier/phase-blade.svg?raw";
import needleRifle from "../../parts/concord/courtier/needle-rifle.svg?raw";
import stiletto from "../../parts/concord/courtier/stiletto.svg?raw";
import pistol from "../../parts/concord/courtier/pistol.svg?raw";
import coatTails from "../../parts/concord/courtier/coat-tails.svg?raw";
import fanSkirt from "../../parts/concord/courtier/fan-skirt.svg?raw";
import jetpack from "../../parts/concord/courtier/jetpack.svg?raw";
import jetWing from "../../parts/concord/courtier/jet-wing.svg?raw";
import helmCrestTop from "../../parts/concord/courtier-top/helm-crest.svg?raw";
import helmCaptainTop from "../../parts/concord/courtier-top/helm-captain.svg?raw";
import helmConeTop from "../../parts/concord/courtier-top/helm-cone.svg?raw";
import helmTiaraTop from "../../parts/concord/courtier-top/helm-tiara.svg?raw";
import helmAviatorTop from "../../parts/concord/courtier-top/helm-aviator.svg?raw";
import collarFanTop from "../../parts/concord/courtier-top/collar-fan.svg?raw";
import collarRuffTop from "../../parts/concord/courtier-top/collar-ruff.svg?raw";
import collarHighTop from "../../parts/concord/courtier-top/collar-high.svg?raw";
import phaseBladeTop from "../../parts/concord/courtier-top/phase-blade.svg?raw";
import needleRifleTop from "../../parts/concord/courtier-top/needle-rifle.svg?raw";
import stilettoTop from "../../parts/concord/courtier-top/stiletto.svg?raw";
import pistolTop from "../../parts/concord/courtier-top/pistol.svg?raw";
import coatTailsTop from "../../parts/concord/courtier-top/coat-tails.svg?raw";
import fanSkirtTop from "../../parts/concord/courtier-top/fan-skirt.svg?raw";
import jetWingsTop from "../../parts/concord/courtier-top/jet-wings.svg?raw";
import type { RigDef } from "../../types";
import { courtierSide, courtierTop } from "./kit";

/** Phase Guard: fan collar and a long crystal blade held low across the body. Model 0 is the captain. */
export function guardSide(captain = false): RigDef {
  return courtierSide({
    id: `concord.guard.side${captain ? ".captain" : ""}`,
    name: captain ? "Phase Guard captain" : "Phase Guard",
    height: captain ? 187 : 178,
    helm: captain ? helmCaptain : helmCrest,
    collar: collarFan,
    weapon: { src: phaseBlade, place: { x: -12, y: 150, rot: -35 } },
  });
}

export function guardTop(captain = false): RigDef {
  return courtierTop({
    id: `concord.guard.top${captain ? ".captain" : ""}`,
    name: captain ? "Phase Guard captain (from above)" : "Phase Guard (from above)",
    helm: captain ? helmCaptainTop : helmCrestTop,
    collar: collarFanTop,
    weapon: { src: phaseBladeTop, place: { x: -20, y: -54, rot: 70 } },
    height: 56,
  });
}

/** Ray Lancer: cone helm, standing collar, coat tails and a needle rifle longer than he is. */
export function lancerSide(): RigDef {
  return courtierSide({
    id: "concord.lancer.side",
    name: "Ray Lancer",
    height: 186,
    helm: helmCone,
    collar: collarHigh,
    weapon: { src: needleRifle, place: { x: -52, y: 74, rot: -3 } },
    hips: [{ id: "coat", src: coatTails, z: 0 }],
  });
}

export function lancerTop(): RigDef {
  return courtierTop({
    id: "concord.lancer.top",
    name: "Ray Lancer (from above)",
    helm: helmConeTop,
    collar: collarHighTop,
    weapon: { src: needleRifleTop, place: { x: -5, y: -62, rot: 90 } },
    under: [{ id: "coat", src: coatTailsTop, z: 0 }],
    height: 60,
  });
}

/** Blink Dancers: en pointe, the far leg raised behind, a stiletto forward and one held high. */
export function dancerSide(): RigDef {
  return courtierSide({
    id: "concord.dancer.side",
    name: "Blink Dancer",
    height: 170,
    helm: helmTiara,
    collar: collarRuff,
    legs: "pointe",
    weapon: { src: stiletto, place: { x: -15, y: 78, rot: 0 } },
    offHand: { src: stiletto, anchor: "g1", at: { x: 86, y: 46 }, rot: 70, elbow: { x: 86, y: 66 } },
    hips: [{ id: "skirt", src: fanSkirt, z: 9 }],
  });
}

export function dancerTop(): RigDef {
  return courtierTop({
    id: "concord.dancer.top",
    name: "Blink Dancer (from above)",
    helm: helmTiaraTop,
    collar: collarRuffTop,
    weapon: { src: stilettoTop, place: { x: -10, y: -38, rot: 90 } },
    offHand: { src: stilettoTop, anchor: "g1", at: { x: 20, y: 6 }, rot: -60 },
    under: [{ id: "skirt", src: fanSkirtTop, z: 0.5 }],
    height: 44,
    shadow: { x: 4, y: 6, r: 17 },
  });
}

/** Jetwing Scouts: aviator fin, a jet pack with two mirror fan wings, a ray pistol. */
export function sylphSide(): RigDef {
  return courtierSide({
    id: "concord.sylph.side",
    name: "Jetwing Scout",
    height: 172,
    helm: helmAviator,
    collar: gorget,
    weapon: { src: pistol, place: { x: 14, y: 76, rot: 0 } },
    extra: [
      { id: "wing-far", src: jetWing, bone: "torso", place: { x: 80, y: 66, rot: -16 }, z: 0.1, anim: { flap: 0.22 } },
      { id: "pack", src: jetpack, bone: "torso", z: 0.6 },
      { id: "wing-near", src: jetWing, bone: "torso", place: { x: 77, y: 70, rot: 4 }, z: 0.8, anim: { flap: 0.3 } },
    ],
  });
}

export function sylphTop(): RigDef {
  return courtierTop({
    id: "concord.sylph.top",
    name: "Jetwing Scout (from above)",
    helm: helmAviatorTop,
    collar: collarRuffTop,
    weapon: { src: pistolTop, place: { x: -7, y: -30, rot: 90 } },
    under: [{ id: "wings", src: jetWingsTop, z: 0.5, anim: { flap: 0.2 } }],
    height: 66,
    shadow: { x: 4, y: 8, r: 24 },
  });
}
