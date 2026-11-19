// The Ridgeline Marksman (profile `mil-squinter`): a half-crouched sharpshooter under a grass
// ghillie and a wide-brimmed field hat, cheek to the scope of a varmint rifle longer than he is.
// The trooper kit's legs re-seat to the crouch, so he walks bent-kneed, stalking.

import hat from "../../parts/militia/marksman/hat.svg?raw";
import ghillie from "../../parts/militia/marksman/ghillie.svg?raw";
import rifle from "../../parts/militia/marksman/rifle.svg?raw";
import hatTop from "../../parts/militia/marksman-top/hat.svg?raw";
import ghillieTop from "../../parts/militia/marksman-top/ghillie.svg?raw";
import rifleTop from "../../parts/militia/marksman-top/rifle.svg?raw";
import type { RigDef } from "../../types";
import { placeAt, reseat, trooperKitSide, trooperKitTop } from "./kit-troops";

/** The crouch: the upper body drops 14 u and leans 6 degrees into the aim. */
const CROUCH = reseat({ x: 60, y: 106 }, { x: 58, y: 120 }, -6);

export function marksmanSide(): RigDef {
  return trooperKitSide({
    id: "militia.marksman.side",
    name: "Ridgeline marksman",
    body: CROUCH,
    legs: { footF: { x: 40, y: 170 }, footB: { x: 79, y: 170 }, knees: -1 },
    helm: hat,
    pack: ghillie,
    padBack: null,
    // level at the cheek: the butt in the shoulder, the scope at the eye
    weapon: { src: rifle, place: placeAt(rifle, "g2", { x: 44, y: 79 }, 0) },
    height: 156,
  });
}

export function marksmanTop(): RigDef {
  return trooperKitTop({
    id: "militia.marksman.top",
    name: "Ridgeline marksman (from above)",
    helm: hatTop,
    pack: ghillieTop,
    weapon: { src: rifleTop, place: placeAt(rifleTop, "g2", { x: 7, y: -4 }, 90) },
    shadow: { x: 5, y: 9, r: 24 },
  });
}
