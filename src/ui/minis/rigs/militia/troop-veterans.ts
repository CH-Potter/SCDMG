// Old Guard Veterans (profile `mil-grannies`): recalled to the colours in the heaviest plate in the
// valley. Boiler-plate cuirass, two-tier pauldrons, a brimmed pot helm with a canister respirator,
// the rock-salt scattergun at the hip and a mine pick slung across the back. Sergeant Mabel (model
// 0) breaks the squad's outline with a brass-crested helm and a pennant pole on her pack.

import torso from "../../parts/militia/veteran/torso.svg?raw";
import padFront from "../../parts/militia/veteran/pad-front.svg?raw";
import padBack from "../../parts/militia/veteran/pad-back.svg?raw";
import helm from "../../parts/militia/veteran/helm.svg?raw";
import helmSergeant from "../../parts/militia/veteran/helm-sergeant.svg?raw";
import pennant from "../../parts/militia/veteran/pennant.svg?raw";
import pick from "../../parts/militia/veteran/pick.svg?raw";
import torsoTop from "../../parts/militia/veteran-top/torso.svg?raw";
import helmTop from "../../parts/militia/veteran-top/helm.svg?raw";
import helmSergeantTop from "../../parts/militia/veteran-top/helm-sergeant.svg?raw";
import gearTop from "../../parts/militia/veteran-top/gear.svg?raw";
import pennantTop from "../../parts/militia/veteran-top/pennant.svg?raw";
import type { RigDef } from "../../types";
import { TROOPER_WEAPONS } from "../militiaTrooper";
import type { ExtraPart } from "./kit-troops";
import { trooperKitSide, trooperKitTop } from "./kit-troops";

export function veteranSide(sergeant = false): RigDef {
  const extras: ExtraPart[] = [{ id: "pick", src: pick, bone: "torso", z: -1 }];
  if (sergeant) extras.push({ id: "pennant", src: pennant, bone: "torso", z: -0.5 });
  return trooperKitSide({
    id: `militia.veteran.side${sergeant ? ".sergeant" : ""}`,
    name: sergeant ? "Sergeant Mabel" : "Old Guard veteran",
    torso,
    padFront,
    padBack,
    helm: sergeant ? helmSergeant : helm,
    extras,
    weapon: { src: TROOPER_WEAPONS.side.scatter.src, place: TROOPER_WEAPONS.side.scatter.place },
    height: sergeant ? 182 : 162,
  });
}

export function veteranTop(sergeant = false): RigDef {
  const extras: ExtraPart[] = sergeant ? [{ id: "pennant", src: pennantTop, bone: "torso", z: 6.5, place: { x: 14, y: 8, rot: 55, scale: 1.7 } }] : [];
  return trooperKitTop({
    id: `militia.veteran.top${sergeant ? ".sergeant" : ""}`,
    name: sergeant ? "Sergeant Mabel (from above)" : "Old Guard veteran (from above)",
    torso: torsoTop,
    helm: sergeant ? helmSergeantTop : helmTop,
    pack: gearTop,
    extras,
    weapon: { src: TROOPER_WEAPONS.top.scatter.src, place: TROOPER_WEAPONS.top.scatter.place },
    scale: 1.06,
    shadow: { x: 5, y: 8, r: 24 },
  });
}
