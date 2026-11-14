// Registry of per-faction miniature art, keyed by faction look.

import type { FigureKind, Look } from "../figures";
import { CONCORD_ART } from "./concord";
import { MILITIA_ART } from "./militia";
import { MUNCH_ART } from "./munch";
import type { FactionArt, FigureArt } from "./types";

export const FACTION_ART: Partial<Record<Look, FactionArt>> = {
  cap: MILITIA_ART,
  teeth: MUNCH_ART,
  crystal: CONCORD_ART,
};

/** The faction painter for a unit (by profile id, then by archetype), or undefined to use the shared one. */
export function factionFigure(look: Look, unit: string | undefined, kind: FigureKind): FigureArt | undefined {
  const fa = FACTION_ART[look];
  if (!fa) return undefined;
  return (unit !== undefined ? fa.units?.[unit] : undefined) ?? fa.kinds?.[kind];
}
