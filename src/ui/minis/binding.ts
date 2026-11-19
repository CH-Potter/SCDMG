// Which art a unit is drawn with, worked out from its profile alone (no art code needed, so this is
// cheap and lives in the main chunk):
//   base:     a built-in faction's unit (militia, swarm, concord), bound by profile id;
//   template: a Forge template's unit, bound by template key and unit key (the template's local id),
//             so a faction started from a template, copied, renamed or re-statted keeps its art;
//   kit:      everything else (custom units): the generic kits, from the unit's recipe or stats.
//
// How a template unit is recognised, in order:
//   1. its profile id is the template's own (`custom-tpl-<key>:<unit>`: the Forge and Rig Lab previews);
//   2. its `rigTag` ("<key>/<unit>"), stamped by the template builder and kept by every copy
//      (customFactions.cleanFaction keeps it; the Forge drops it when the player rebuilds the
//      unit's miniature, so their own parts show);
//   3. (factions started before the tag existed) its local id and parts recipe match a template
//      unit's exactly.

import { isBuiltInFaction } from "../../engine/data/factions";
import type { MiniatureRecipe, UnitProfile } from "../../engine/types";

/** The profile field that binds a unit to its template's art: "<templateKey>/<unitKey>". */
export const RIG_TAG = "rigTag";
export type Tagged = { rigTag?: string };
export const RIG_TAG_RE = /^[a-z0-9-]{1,32}\/[a-z0-9-]{1,48}$/;

export type ArtBinding = { kind: "base"; faction: string; id: string } | { kind: "template"; template: string; unit: string } | { kind: "kit" };

/** Prefix of template faction ids (as forge/templates/kit.ts's TEMPLATE_PREFIX). */
const TPL = "custom-tpl-";

/** The local part of a profile id ("custom-x:grunts" → "grunts"). */
export const localId = (id: string): string => (id.includes(":") ? id.slice(id.indexOf(":") + 1) : id);

/** A unit's template tag, if it carries a valid one. */
export function rigTagOf(p: UnitProfile): string | undefined {
  const t = (p as UnitProfile & Tagged).rigTag;
  return typeof t === "string" && RIG_TAG_RE.test(t) ? t : undefined;
}

const recipeKey = (r: MiniatureRecipe) => `${r.body}.${r.head}.${r.headgear}.${r.weapon}.${r.back}.${r.primary ?? "f"}.${r.secondary}.${r.scale}`;

/** Template units' recipes, for factions started before the tag: "<unit>|<recipe>" → tag. */
let legacy: Map<string, string> | null = null;
/** Called by the registry with every template unit (key, unit, recipe), once. */
export function setTemplateUnits(units: { template: string; unit: string; recipe?: MiniatureRecipe }[]): void {
  legacy = new Map();
  for (const u of units) if (u.recipe) legacy.set(`${u.unit}|${recipeKey(u.recipe)}`, `${u.template}/${u.unit}`);
}

export function bindingOf(p: UnitProfile): ArtBinding {
  if (isBuiltInFaction(p.faction)) return { kind: "base", faction: p.faction, id: p.id };
  if (p.id.startsWith(TPL) && p.id.includes(":")) {
    const template = p.id.slice(TPL.length, p.id.indexOf(":"));
    return { kind: "template", template, unit: localId(p.id) };
  }
  let tag = rigTagOf(p);
  if (!tag && legacy && p.art?.kind === "parts") tag = legacy.get(`${localId(p.id)}|${recipeKey(p.art.recipe)}`);
  if (tag) {
    const [template, unit] = tag.split("/") as [string, string];
    return { kind: "template", template, unit };
  }
  return { kind: "kit" };
}
