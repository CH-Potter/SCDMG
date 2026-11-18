// Trope templates for the faction forge: complete starting factions for the classic tabletop army
// types, in SCDMG's own words. They are data, not built-in factions: they never appear in the game
// until a player starts one in the forge (which gives it fresh ids) and saves it.

import type { Faction } from "../../engine/types";
import { copyFaction } from "../../ui/customFactions";
import { FANTASY } from "./fantasy";
import { GRIMDARK } from "./grimdark";
import type { FactionTemplate } from "./kit";

export { TEMPLATE_GROUPS, TEMPLATE_PREFIX, type FactionTemplate, type TemplateGroup } from "./kit";

export const TEMPLATES: readonly FactionTemplate[] = [...GRIMDARK, ...FANTASY];

export const templateByKey = (key: string): FactionTemplate | undefined => TEMPLATES.find((t) => t.key === key);

/**
 * A new custom faction from a template: fresh faction id, every profile and support id re-prefixed
 * with it, costs computed. Any notes (e.g. a starter list trimmed to fit) go in `notes`.
 */
export function startFromTemplate(t: FactionTemplate, name = t.faction.name, notes: string[] = []): Faction {
  return copyFaction(t.faction, name, notes);
}
