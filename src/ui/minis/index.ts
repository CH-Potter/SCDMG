// The miniature engine (Ink Rig + Overhead Sculpt). The board renderer only talks to this file:
//   createRigMini(profileId, ...) → a RigMini, or null when the unit keeps its Classic miniature
//   (the setting is Classic, or the unit has no new-engine art yet).
// Layout:
//   types.ts      the rig format (part manifest types)          rigs/       manifests (TS data)
//   parts/        authored SVG parts (slot colours, anchors)    slots.ts    colour slots + colourways
//   color.ts      OKLCH shades                                   svg.ts      part reader / tier filter
//   lint.ts       rig-lint (validator)                           pose.ts     bones, IK, matrices
//   clips.ts      the six clips + status poses                   atlas.ts    bake plan, zoom tiers
//   bake.ts       SVG → texture page + ink silhouette, cached    footprint.ts the flat base layer
//   mini.ts       RigMini: footprint, figure and effects layers  settings.ts the Miniatures setting

import { RigMini } from "./mini";
import { rigsFor } from "./registry";
import { miniStyle, type MiniStyle } from "./settings";

export { RigMini, type MiniDrive } from "./mini";
export { MINI_STYLE_LABEL, miniStyle, nextMiniStyle, setMiniStyle, type MiniStyle } from "./settings";
export { rigsFor } from "./registry";

/**
 * A new-engine miniature for this unit in the current style, or null to keep the Classic one.
 * `model`: the model's index in its unit (squads vary their looks by it).
 */
export function createRigMini(profileId: string, team: number, baseRadius: number, style: MiniStyle = miniStyle(), model = 0): RigMini | null {
  if (style === "classic") return null;
  const rigs = rigsFor(profileId, model);
  if (!rigs) return null;
  return new RigMini(rigs, style === "overhead" ? "top" : "side", team, baseRadius);
}
