// Impact on the charge is how melee units make their charges count: every ground unit built to fight
// in melee (its melee hits harder than its guns) has impact dice. Units whose card doesn't set them get
// a basic set by default (Faction Forge templates use this; the built-ins list theirs).

import type { ImpactDef, UnitProfile } from "../types";

type Body = Pick<UnitProfile, "structure" | "keywords" | "weapons" | "impact">;

const punch = (p: Body, melee: boolean): number => Math.max(0, ...p.weapons.filter((w) => w.melee === melee).map((w) => w.dice * w.damage));

/** A ground unit built to fight in melee: its best melee weapon outhits its best gun. */
export function isMeleeBased(p: Body): boolean {
  if (p.structure || p.keywords.includes("flying")) return false;
  return punch(p, true) > punch(p, false);
}

/** The basic impact a melee unit gets when its card sets none: 1 die per model on a 4+ (monsters: 2 dice, AP1). */
export function defaultImpact(p: Body): ImpactDef | undefined {
  if (p.impact || !isMeleeBased(p)) return undefined;
  return p.keywords.includes("monster") ? { dice: 2, hit: 4, damage: 1, ap: 1 } : { dice: 1, hit: 4, damage: 1, ap: 0 };
}
