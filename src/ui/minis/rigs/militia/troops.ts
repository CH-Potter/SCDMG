// Dustline Militia soldiers and riders on the trooper kit (kit-troops.ts):
//   Patch Medic:          tall taped field pack, staple pistol, raised injector, cog-and-plus band
//   Ridgeline Marksman:   half crouch, scoped varmint rifle longer than he is, grass ghillie, brimmed hat
//   Old Guard Veterans:   the heaviest plate in the valley, brimmed pot helm and respirator,
//                         rock-salt scattergun, pick haft; Sergeant Mabel carries a pennant pole
//   Tumbleweed Outriders: an armoured dirt bike (riders.ts)

import { COLOURWAYS } from "../../slots";
import type { ArtBuilder } from "../../registry";
import type { RigDef } from "../../types";
import { placeAt, trooperKitSide, trooperKitTop } from "./kit-troops";
import { marksmanSide, marksmanTop } from "./troop-marksman";
import { veteranSide, veteranTop } from "./troop-veterans";
import { riderSide, riderTop } from "./riders";
import medicPack from "../../parts/militia/medic/pack.svg?raw";
import medicPad from "../../parts/militia/medic/pad-front.svg?raw";
import pistolSide from "../../parts/militia/medic/pistol.svg?raw";
import injectorSide from "../../parts/militia/medic/injector.svg?raw";
import medicPackTop from "../../parts/militia/medic-top/pack.svg?raw";
import pistolTop from "../../parts/militia/medic-top/pistol.svg?raw";
import injectorTop from "../../parts/militia/medic-top/injector.svg?raw";
import bandTop from "../../parts/militia/medic-top/band.svg?raw";

const DUST = COLOURWAYS.dust!;
const ASH = COLOURWAYS.ash!;

export function medicSide(): RigDef {
  return trooperKitSide({
    id: "militia.medic.side",
    name: "Patch medic",
    pack: medicPack,
    padFront: medicPad,
    // the staple pistol in the far hand, level at the hip; the injector held high in the near one
    weapon: { src: pistolSide, place: placeAt(pistolSide, "g1", { x: 43, y: 83 }, -3) },
    armB: { grip: "g1" },
    armF: { hand: injectorSide, at: { x: 29, y: 40 }, to: "torso", rot: -16 },
    height: 186,
  });
}

export function medicTop(): RigDef {
  return trooperKitTop({
    id: "militia.medic.top",
    name: "Patch medic (from above)",
    // from above the medic is the pack: drawn a size up so the tall taped pack, its blanket roll and
    // splint case dominate the outline, and the cog-and-plus band is a big pale disc on the near pad
    pack: null,
    weapon: { src: pistolTop, place: placeAt(pistolTop, "g1", { x: 9, y: -16 }, 90) },
    armR: { grip: "g1" },
    armL: { hand: injectorTop, at: { x: -18, y: -16 }, to: "torso" },
    extras: [
      { id: "pack", src: medicPackTop, bone: "torso", z: 0, place: { x: 0, y: -2.5, rot: 0, scale: 1.45 } },
      { id: "band", src: bandTop, bone: "torso", z: 5.5, place: { x: -15, y: 1, rot: 0, scale: 1.7 } },
    ],
    shadow: { x: 5, y: 10, r: 27 },
  });
}

export const TROOP_ART: Record<string, ArtBuilder> = {
  "mil-medic": () => ({ colourway: DUST, looks: [{ side: medicSide(), top: medicTop() }] }),
  "mil-squinter": () => ({ colourway: DUST, looks: [{ side: marksmanSide(), top: marksmanTop() }] }),
  // the Old Guard in grey Ash plate; model 0 is Sergeant Mabel with her pennant pole
  "mil-grannies": () => ({
    colourway: ASH,
    looks: [
      { side: veteranSide(true), top: veteranTop(true) },
      { side: veteranSide(false), top: veteranTop(false) },
    ],
    pick: (i) => (i === 0 ? 0 : 1),
  }),
  "mil-riders": () => ({ colourway: DUST, looks: [{ side: riderSide(), top: riderTop() }] }),
};
