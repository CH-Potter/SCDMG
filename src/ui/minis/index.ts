// The miniature engine (Ink Rig + Overhead Sculpt). The board renderer only talks to this file:
//   createRigMini(profile, ...) → a RigMini, or null when the unit keeps its Classic miniature
//   (the setting is Classic) or its art is still loading (`artPending`; load it with `loadArt`).
// Layout:
//   types.ts      the rig format (part manifest types)          rigs/       base-faction and template art
//   parts/        authored SVG parts (slot colours, anchors)    kits/       the generic kits (any unit)
//   binding.ts    which art a unit gets (base, template, kit)   registry.ts lazy loading and lookup
//   slots.ts      colour slots + colourways                     color.ts    OKLCH shades
//   svg.ts        part reader / tier filter                     lint.ts     rig-lint (validator)
//   pose.ts       bones, IK, matrices                           clips.ts    the six clips + status poses
//   atlas.ts      bake plan, zoom tiers                         bake.ts     SVG → texture page, cached
//   footprint.ts  the flat base layer                           mini.ts     RigMini: footprint, figure, effects
//   settings.ts   the Miniatures setting
// See docs/minis.md for adding art.

import type { UnitProfile } from "../../engine/types";
import { modelPhase, RigMini } from "./mini";
import { rigsFor } from "./registry";
import { miniStyle, type MiniStyle } from "./settings";

export { RigMini, modelPhase, type MiniDrive } from "./mini";
export { MINI_STYLE_LABEL, miniStyle, nextMiniStyle, setMiniStyle, type MiniStyle } from "./settings";
export { artPending, loadAllArt, loadArt, rigsFor } from "./registry";

/**
 * A new-engine miniature for this unit in the current style, or null to keep the Classic one
 * (the Classic style, or art that hasn't loaded yet: see `artPending`).
 * `model`: the model's index in its unit (squads vary their looks and loop phases by it).
 */
export function createRigMini(profile: UnitProfile, team: number, style: MiniStyle = miniStyle(), model = 0): RigMini | null {
  if (style === "classic") return null;
  const rigs = rigsFor(profile, model);
  if (!rigs) return null;
  return new RigMini(rigs, style === "overhead" ? "top" : "side", team, profile.baseRadius, modelPhase(model));
}
