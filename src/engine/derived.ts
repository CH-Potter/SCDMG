// Abilities a unit has without its card listing them. Dependency-free, so pricing and the engine agree.

import type { UnitProfile } from "./types";

/** Every unit with a lobbed gun can lay a barrage marker; Barrage Shells let any gun lay one. Edits `p`. */
export function addDerivedAbilities(p: UnitProfile): UnitProfile {
  if (p.abilities.includes("barrage")) return p;
  if (p.abilities.includes("wide-barrage") || p.weapons.some((w) => !w.melee && w.traits?.includes("indirect"))) p.abilities.push("barrage");
  return p;
}
