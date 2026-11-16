// Effective unit profiles: the base profile with the unit's upgrades applied.

import { baseProfile } from "./data/factions";
import type { AbilityId, Keyword, Unit, UnitProfile } from "./types";

const cache = new Map<string, UnitProfile>();
/** Fast path: a unit's upgrade list is never edited in place, so its identity is a good cache key. */
const byList = new WeakMap<string[], { profileId: string; profile: UnitProfile }>();

export function profileFor(profileId: string, upgrades: string[]): UnitProfile {
  const quick = byList.get(upgrades);
  if (quick && quick.profileId === profileId) return quick.profile;
  const key = upgrades.length === 0 ? profileId : `${profileId}|${[...upgrades].sort().join(",")}`;
  const hit = cache.get(key);
  if (hit) {
    byList.set(upgrades, { profileId, profile: hit });
    return hit;
  }
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
    if (u.impact && p.impact) {
      p.impact = { ...p.impact, ...u.impact };
    }
  }
  cache.set(key, p);
  byList.set(upgrades, { profileId, profile: p });
  return p;
}

export const profileOf = (u: Unit): UnitProfile => profileFor(u.profileId, u.upgrades);

export const hasKeyword = (u: Unit, k: Keyword): boolean => profileOf(u).keywords.includes(k);
export const hasAbility = (u: Unit, a: AbilityId): boolean => profileOf(u).abilities.includes(a);
export const isFlying = (u: Unit): boolean => hasKeyword(u, "flying");

/** Forget cached effective profiles (call after custom factions are re-registered). */
export function clearProfileCache(): void {
  cache.clear();
}
