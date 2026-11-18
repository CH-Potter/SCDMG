// The Munch for tests. They left the built-in factions when the Skitterswarm took their place, and live
// on as a Faction Forge trope template (src/forge/templates/munch.ts). Tests that check one of their
// mechanics (impact on the charge, regrowth, tunnels, Pop!, goo...) register this test-local copy of the
// template under the old ids ("munch", "munch-nibblers", "munch-nest"...), so they keep reading as before.

import { registerCustomFactions } from "../../src/engine/data/factions";
import type { Faction, ListEntry } from "../../src/engine/types";
import { templateByKey } from "../../src/forge/templates";

const PREFIX = "custom-tpl-munch:";
const legacy = (id: string) => (id.startsWith(PREFIX) ? `munch-${id.slice(PREFIX.length)}` : id);
const entry = (e: ListEntry): ListEntry => ({ profileId: legacy(e.profileId), upgrades: [...e.upgrades] });

/** The Munch template as a faction with the old built-in ids. */
export function munchFaction(): Faction {
  const t = structuredClone(templateByKey("munch")!.faction);
  return {
    ...t,
    id: "munch",
    profiles: t.profiles.map((p) => ({ ...p, id: legacy(p.id), faction: "munch" })),
    supports: t.supports.map((s) => ({
      ...s,
      id: legacy(s.id),
      faction: "munch",
      abilities: s.abilities.map((a) => (a.effect.kind === "summon" ? { ...a, effect: { ...a.effect, profileId: legacy(a.effect.profileId) } } : a)),
    })),
    defaultList: t.defaultList.map(entry),
    assaultExtras: t.assaultExtras.map(entry),
    defaultSupports: t.defaultSupports.map(legacy),
    assaultSupports: t.assaultSupports.map(legacy),
  };
}

/** Register the test Munch (alongside any other custom factions passed in). Call again after anything that resets custom factions. */
export function registerMunch(others: Faction[] = []): Faction {
  const f = munchFaction();
  registerCustomFactions([f, ...others]);
  return f;
}
