// Which units have new-engine art. Bound to profile ids (not names, which may change). A unit not
// listed here keeps its Classic miniature whatever the setting says.

import { trooperSide, trooperTop } from "./rigs/militiaTrooper";
import { COLOURWAYS, type Colourway } from "./slots";
import type { RigDef } from "./types";

export interface UnitRigs {
  side: RigDef;
  top: RigDef;
  colourway: Colourway;
}

const BUILDERS: Record<string, () => UnitRigs> = {
  "mil-grunts": () => ({ side: trooperSide("rifle"), top: trooperTop("rifle"), colourway: COLOURWAYS.dust! }),
};

export const RIGGED_PROFILES = Object.keys(BUILDERS);

const cache = new Map<string, UnitRigs>();

export function rigsFor(profileId: string): UnitRigs | null {
  const b = BUILDERS[profileId];
  if (!b) return null;
  let r = cache.get(profileId);
  if (!r) cache.set(profileId, (r = b()));
  return r;
}
