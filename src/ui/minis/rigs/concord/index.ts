// Lumen Concord art, by profile id. Every unit is painted in the Pearl court colourway: pearl armour,
// deep navy, deco gold and lavender crystal light.
//   courtier kit (kit.ts):  Phase Guard, Ray Lancer, Blink Dancers, Jetwing Scouts, Beam Warden
//   bespoke:                Shimmer Saucer (hover), the Grand Strider (walker, three stilts)
//   structures:             Shield Pylon, Sunray Tower, Glimmer Dome (summon-only)

import type { ArtBuilder } from "../../registry";
import { COLOURWAYS } from "../../slots";
import { dancerSide, dancerTop, guardSide, guardTop, lancerSide, lancerTop, sylphSide, sylphTop } from "./courtiers";
import { domeSide, domeTop, pylonSide, pylonTop, sunraySide, sunrayTop } from "./monuments";
import { saucerSide, saucerTop } from "./saucer";
import { striderSide, striderTop } from "./strider";
import { wardenSide, wardenTop } from "./warden";

const PEARL = COLOURWAYS.pearl!;

export const CONCORD_ART: Record<string, ArtBuilder> = {
  // the first guard is the captain (taller crest with a crystal tip); the rest are line guards
  "con-guard": () => ({
    colourway: PEARL,
    looks: [
      { side: guardSide(true), top: guardTop(true) },
      { side: guardSide(), top: guardTop() },
    ],
    pick: (i) => (i === 0 ? 0 : 1),
  }),
  "con-lancer": () => ({ colourway: PEARL, looks: [{ side: lancerSide(), top: lancerTop() }] }),
  "con-skiff": () => ({ colourway: PEARL, looks: [{ side: saucerSide(), top: saucerTop() }] }),
  "con-warden": () => ({ colourway: PEARL, looks: [{ side: wardenSide(), top: wardenTop() }] }),
  "con-pylon": () => ({ colourway: PEARL, looks: [{ side: pylonSide(), top: pylonTop() }] }),
  "con-ward": () => ({ colourway: PEARL, looks: [{ side: domeSide(), top: domeTop() }] }),
  "con-facet": () => ({ colourway: PEARL, looks: [{ side: striderSide(), top: striderTop() }] }),
  "con-dancers": () => ({ colourway: PEARL, looks: [{ side: dancerSide(), top: dancerTop() }] }),
  "con-sylph": () => ({ colourway: PEARL, looks: [{ side: sylphSide(), top: sylphTop() }] }),
  "con-obelisk": () => ({ colourway: PEARL, looks: [{ side: sunraySide(), top: sunrayTop() }] }),
};
