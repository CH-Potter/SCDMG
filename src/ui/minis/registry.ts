// Which units have new-engine art. Bound to profile ids (not names, which may change). A unit not
// listed here keeps its Classic miniature whatever the setting says. Each faction keeps its own
// table (rigs/<faction>/index.ts), so the factions' art can grow without touching each other.

import { CONCORD_ART } from "./rigs/concord";
import { MILITIA_ART } from "./rigs/militia";
import { SWARM_ART } from "./rigs/swarm";
import type { Colourway } from "./slots";
import type { RigDef } from "./types";

/** What one model is drawn with: its two views and the colourway they're painted in. */
export interface UnitRigs {
  side: RigDef;
  top: RigDef;
  colourway: Colourway;
}

/**
 * A unit's art: one rig pair per model look. Squads vary cheaply: model 0 can be a sergeant, every
 * third model can carry the other weapon. Each look is one more baked page, so keep them few.
 */
export interface UnitArt {
  colourway: Colourway;
  looks: { side: RigDef; top: RigDef }[];
  /** Which look model `i` wears (default: the looks in turn). */
  pick?: (i: number) => number;
}

export type ArtBuilder = () => UnitArt;

const BUILDERS: Record<string, ArtBuilder> = { ...MILITIA_ART, ...SWARM_ART, ...CONCORD_ART };

export const RIGGED_PROFILES = Object.keys(BUILDERS);

const cache = new Map<string, UnitArt>();

/** All of a unit's looks, or null if it has no new-engine art. */
export function artFor(profileId: string): UnitArt | null {
  const b = BUILDERS[profileId];
  if (!b) return null;
  let a = cache.get(profileId);
  if (!a) cache.set(profileId, (a = b()));
  return a;
}

/** The rigs model `model` (its index in the unit) is drawn with. */
export function rigsFor(profileId: string, model = 0): UnitRigs | null {
  const a = artFor(profileId);
  if (!a) return null;
  const n = a.looks.length;
  const i = Math.max(0, Math.min(n - 1, a.pick ? a.pick(model) : model % n));
  const look = a.looks[i]!;
  return { side: look.side, top: look.top, colourway: a.colourway };
}
