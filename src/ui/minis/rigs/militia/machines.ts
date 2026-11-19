// Dustline Militia machines: Big Bertha (walker), the two biplanes (hover) and the field structures.
//   bertha.ts:     walkerRig, twoLegGait and Big Bertha
//   planes.ts:     biplaneRig, the Sky Rustler and the Haymaker Bomber
//   fieldworks.ts: fieldworkRig, the sandbag wall and ring, the Scrap Turret, Pipe Mortar and Junk Barricade

import type { ArtBuilder } from "../../registry";
import { COLOURWAYS } from "../../slots";
import type { RigDef } from "../../types";
import { berthaSide, berthaTop } from "./bertha";
import { junkSide, junkTop, mortarSide, mortarTop, turretSide, turretTop } from "./fieldworks";
import { bomberSide, bomberTop, rustlerSide, rustlerTop } from "./planes";

const DUST = COLOURWAYS.dust!;
const one = (side: () => RigDef, top: () => RigDef): ArtBuilder => () => ({ colourway: DUST, looks: [{ side: side(), top: top() }] });

export const MACHINE_ART: Record<string, ArtBuilder> = {
  "mil-bertha": one(berthaSide, berthaTop),
  "mil-rustler": one(rustlerSide, rustlerTop),
  "mil-bomber": one(bomberSide, bomberTop),
  "mil-turret": one(turretSide, turretTop),
  "mil-junk": one(junkSide, junkTop),
  "mil-mortar": one(mortarSide, mortarTop),
};
