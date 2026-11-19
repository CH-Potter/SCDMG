// Dustline Militia art, by profile id. Every unit is painted in the Dust colourway.
//   troops.ts:   the trooper kit's soldiers and riders (medic, marksman, veterans, outriders)
//   machines.ts: Big Bertha, the two biplanes and the field structures

import type { ArtBuilder } from "../../registry";
import { COLOURWAYS } from "../../slots";
import { trooperSide, trooperTop } from "../militiaTrooper";
import { MACHINE_ART } from "./machines";
import { TROOP_ART } from "./troops";

const DUST = COLOURWAYS.dust!;

export const MILITIA_ART: Record<string, ArtBuilder> = {
  "mil-grunts": () => ({ colourway: DUST, looks: [{ side: trooperSide("rifle"), top: trooperTop("rifle") }] }),
  ...TROOP_ART,
  ...MACHINE_ART,
};
