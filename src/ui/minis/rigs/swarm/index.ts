// The Skitterswarm's art, by profile id. Every bug is painted in the Brood violet colourway.
// Bugs are built on the insect kit (kit.ts: six ink legs and a tripod walk, scythe arms, blades,
// size-scaled clips); the hive's structures on its structure helper.

import type { ArtBuilder } from "../../registry";
import { COLOURWAYS } from "../../slots";
import type { RigDef } from "../../types";
import { bombardSide, bombardTop } from "./bombard";
import { borerSide, borerTop } from "./borer";
import { eggsSide, eggsTop, geyserSide, geyserTop, mouthSide, mouthTop, spireSide, spireTopRig } from "./hive";
import { lurkerSide, lurkerTop } from "./lurker";
import { motherSide, motherTop } from "./mother";
import { shellbackSide, shellbackTop } from "./shellbacks";
import { skitterSide, skitterTop } from "./skitterlings";
import { spitterSide, spitterTop } from "./spitters";
import { stingerSide, stingerTop } from "./stingers";
import { tenderSide, tenderTop } from "./tenders";

const BROOD = COLOURWAYS.brood!;
const one = (side: () => RigDef, top: () => RigDef): ArtBuilder => () => ({ colourway: BROOD, looks: [{ side: side(), top: top() }] });

export const SWARM_ART: Record<string, ArtBuilder> = {
  // ten to a brood: most with hooks raised, every third with them folded low
  "swarm-skitterlings": () => ({
    colourway: BROOD,
    looks: [
      { side: skitterSide(true), top: skitterTop(true) },
      { side: skitterSide(false), top: skitterTop(false) },
    ],
    pick: (i) => (i % 3 === 2 ? 1 : 0),
  }),
  "swarm-spitters": one(spitterSide, spitterTop),
  "swarm-shellbacks": one(shellbackSide, shellbackTop),
  "swarm-lurker": one(lurkerSide, lurkerTop),
  "swarm-mother": one(motherSide, motherTop),
  "swarm-borer": one(borerSide, borerTop),
  "swarm-stingers": one(stingerSide, stingerTop),
  "swarm-bombard": one(bombardSide, bombardTop),
  "swarm-tenders": one(tenderSide, tenderTop),
  "swarm-spire": one(spireSide, spireTopRig),
  "swarm-geyser": one(geyserSide, geyserTop),
  "swarm-eggs": one(eggsSide, eggsTop),
  "swarm-mouth": one(mouthSide, mouthTop),
};
