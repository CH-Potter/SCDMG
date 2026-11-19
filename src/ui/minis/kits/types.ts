// Types shared by the registry (main chunk) and the lazily loaded kits and template art. Types only:
// importing this module costs nothing at runtime.

import type { UnitProfile } from "../../../engine/types";
import type { Colourway } from "../slots";
import type { RigDef } from "../types";
import type { FactionLook, KitSpec } from "./spec";

/** What one model is drawn with: its two views and the colourway they're painted in. */
export interface UnitRigs {
  side: RigDef;
  top: RigDef;
  colourway: Colourway;
}

/**
 * A unit's art: one rig pair per model look. Squads vary cheaply: model 0 can be a sergeant, every
 * third model can carry the other weapon. Each look is one more baked page, so keep them few (3 at most).
 */
export interface UnitArt {
  colourway: Colourway;
  looks: { side: RigDef; top: RigDef }[];
  /** Which look model `i` wears (default: the looks in turn). */
  pick?: (i: number) => number;
}

export type ArtBuilder = () => UnitArt;

/** Everything a kit or a template's art builder gets for one unit. */
export interface ArtContext {
  profile: UnitProfile;
  /** The unit's faction: its colour and token look. */
  faction: FactionLook;
  /** The unit classified for the kits: frame, parts, colours, size (see kits/spec.ts). */
  spec: KitSpec;
  /** The colourway to paint it in (the template's, from the faction colour, or the kit's). */
  colourway: Colourway;
}

/**
 * A Forge template's own art (`src/ui/minis/rigs/forge/<key>/index.ts`, default export). The
 * registry finds the file by its folder name: no shared list to edit.
 */
export interface TemplateArt {
  /** The template key; must match the folder name and the template's `key`. */
  key: string;
  /** The template's colourway from the faction's colour (omit: the generic kit's). */
  colourway?: (faction: FactionLook, spec: KitSpec) => Colourway;
  /** Bespoke art by unit key (the template's local unit id, "brothers"). Others get the generic kit in this colourway. */
  units: Record<string, (ctx: ArtContext) => UnitArt>;
}

/** One look of a squad: what changes from model to model (see kits/index.ts squadLooks). */
export interface LookVariant {
  /** Rig id suffix ("lead", "a", "b"). */
  tag: string;
  /** Model 0 leads: a little bigger, and a banner if its back is free. */
  leader: boolean;
  /** Upper-body lean and weapon aim (degrees). */
  lean: number;
  aim: number;
}
