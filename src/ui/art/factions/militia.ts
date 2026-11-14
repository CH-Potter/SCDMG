// Dustline Militia miniatures. Owned by the Militia art pass: see STYLE.md for the house style.
// Frontier settlers fighting with junk-tech: boxy, riveted, patched and practical. Denim, canvas,
// leather, brass, tin and hay around the faction orange. Painters live in militia-folk (infantry),
// militia-machines (Bertha, flyers, bikes) and militia-works (structures and the base ground).

import { grunt, granny, medic, squinter, SQUINTER_DESIGN, trooperKind } from "./militia-folk";
import { bertha, BOMBER_DESIGN, bomber, rider, RUSTLER_DESIGN, rustler } from "./militia-machines";
import { dustTop, junkPile, radioShack, scrapTurret, spudMortar } from "./militia-works";
import type { FactionArt } from "./types";

export const MILITIA_ART: FactionArt = {
  look: "cap",
  units: {
    "mil-grunts": { paint: grunt },
    "mil-medic": { paint: medic },
    "mil-bertha": { paint: bertha },
    "mil-rustler": { paint: rustler, design: RUSTLER_DESIGN },
    "mil-turret": { paint: scrapTurret },
    "mil-junk": { paint: junkPile },
    "mil-squinter": { paint: squinter, design: SQUINTER_DESIGN },
    "mil-riders": { paint: rider },
    "mil-grannies": { paint: granny },
    "mil-bomber": { paint: bomber, design: BOMBER_DESIGN },
    "mil-mortar": { paint: spudMortar },
  },
  kinds: {
    trooper: { paint: trooperKind },
    walker: { paint: bertha },
    plane: { paint: rustler, design: RUSTLER_DESIGN },
    turret: { paint: scrapTurret },
    junk: { paint: junkPile },
    bike: { paint: rider },
    beacon: { paint: radioShack },
  },
  baseTop: dustTop,
};
