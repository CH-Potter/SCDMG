// Effective unit profiles: the base profile with the unit's upgrades applied.

import { baseProfile } from "./data/factions";
import type { AbilityId, Keyword, Unit, UnitProfile } from "./types";

const cache = new Map<string, UnitProfile>();

export function profileFor(profileId: string, upgrades: string[]): UnitProfile {
  const key = `${profileId}|${[...upgrades].sort().join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = baseProfile(profileId);
  const p: UnitProfile = structuredClone(base);
  for (const id of upgrades) {
    const u = base.upgrades.find((x) => x.id === id);
    if (!u) throw new Error(`Unknown upgrade ${id} for ${profileId}`);
    p.cost += u.cost;
    p.models += u.addModels ?? 0;
    p.move += u.move ?? 0;
    for (const k of u.addKeywords ?? []) if (!p.keywords.includes(k)) p.keywords.push(k);
    for (const a of u.addAbilities ?? []) if (!p.abilities.includes(a)) p.abilities.push(a);
    if (u.weapon) {
      const w = p.weapons[u.weapon.index];
      if (w) p.weapons[u.weapon.index] = { ...w, ...u.weapon.patch };
    }
  }
  cache.set(key, p);
  return p;
}

export const profileOf = (u: Unit): UnitProfile => profileFor(u.profileId, u.upgrades);

export const hasKeyword = (u: Unit, k: Keyword): boolean => profileOf(u).keywords.includes(k);
export const hasAbility = (u: Unit, a: AbilityId): boolean => profileOf(u).abilities.includes(a);
export const isFlying = (u: Unit): boolean => hasKeyword(u, "flying");
