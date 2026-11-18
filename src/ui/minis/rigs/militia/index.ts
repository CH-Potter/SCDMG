// Dustline Militia art, by profile id.

import type { ArtBuilder } from "../../registry";
import { COLOURWAYS } from "../../slots";
import { trooperSide, trooperTop } from "../militiaTrooper";

const DUST = COLOURWAYS.dust!;

export const MILITIA_ART: Record<string, ArtBuilder> = {
  "mil-grunts": () => ({ colourway: DUST, looks: [{ side: trooperSide("rifle"), top: trooperTop("rifle") }] }),
};
