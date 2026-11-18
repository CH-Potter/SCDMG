// Unit classes and army slots. Every unit falls into one class, worked out from its stats (so
// Faction Forge units get one too). An army list has a number of slots per class for its game mode;
// the faction and each support card it takes add more. The "Unit class limits" house rule (on by
// default) makes lists fit their slots.

import type { ModeId } from "./modes";
import type { Faction, ListEntry, SupportDef, UnitProfile } from "../types";

export type UnitClass = "base" | "support" | "elite" | "flyer" | "static";

export const UNIT_CLASSES: readonly UnitClass[] = ["base", "support", "elite", "flyer", "static"];

export const CLASS_INFO: Record<UnitClass, { name: string; icon: string; text: string }> = {
  base: { name: "Base", icon: "🛡", text: "Squads of several models: the backbone of the army." },
  support: { name: "Support", icon: "🔧", text: "Single models, and teams of up to 3 with a support ability (healing, steadying, regrowing, recalling...): medics, snipers, gunners, specialists." },
  elite: { name: "Elite", icon: "⭐", text: "Monsters, and heavy units with 6 or more wounds." },
  flyer: { name: "Flyer", icon: "🪽", text: "Anything with the flying keyword." },
  static: { name: "Static", icon: "🏰", text: "Structures: turrets, pylons, pods and other emplacements." },
};

export type Slots = Partial<Record<UnitClass, number>>;

/** Abilities that make a small team a Support unit: they look after other units rather than fight. */
export const SUPPORT_ABILITIES: readonly string[] = ["patch-up", "hatch", "mending-aura", "steadying", "radiance", "recall", "bubble-shield", "spotter", "brood-call"];

/** Most models a team with a support ability can have and still count as Support. */
export const SUPPORT_TEAM_MAX = 3;

/**
 * A unit's class, from its stats: structure, then flying, then monster or big heavy, then a single
 * model or a small team with a support ability, else a squad.
 */
export function unitClassOf(p: Pick<UnitProfile, "structure" | "keywords" | "models" | "hp"> & { abilities?: readonly string[] }): UnitClass {
  if (p.structure) return "static";
  if (p.keywords.includes("flying")) return "flyer";
  if (p.keywords.includes("monster") || (p.keywords.includes("heavy") && p.hp * p.models >= 6)) return "elite";
  if (p.models <= 1) return "support";
  if (p.models <= SUPPORT_TEAM_MAX && (p.abilities ?? []).some((a) => SUPPORT_ABILITIES.includes(a))) return "support";
  return "base";
}

/** Slots every army gets in each mode, and the fewest Base units a list must have. */
export const MODE_SLOTS: Record<ModeId, { max: Record<UnitClass, number>; minBase: number }> = {
  skirmish: { max: { base: 6, support: 2, elite: 1, flyer: 1, static: 1 }, minBase: 2 },
  assault: { max: { base: 10, support: 3, elite: 2, flyer: 2, static: 2 }, minBase: 3 },
};

/** Built-in factions' extra slots (custom factions set `Faction.slots` in the forge). */
const FACTION_SLOTS: Record<string, Slots> = {
  militia: { static: 1 }, // they dig in
  munch: { base: 1 }, // there are always more of them
  concord: { elite: 1 }, // few, but fabulous
};

/** Built-in support cards' extra slots (custom cards set `SupportDef.slots` in the forge). */
const SUPPORT_SLOTS: Record<string, Slots> = {
  "mil-radio": { support: 1 },
  "mil-depot": { static: 1 },
  "mil-vane": { support: 1 },
  "mil-airstrip": { flyer: 1 },
  "mil-dropship": { base: 1 },
  "mil-wagon": { support: 1 },
  "munch-nest": { flyer: 1 },
  "munch-tunnels": { elite: 1 },
  "munch-stash": { support: 1 },
  "munch-stink": { base: 1 },
  "munch-burrows": { static: 1 },
  "con-spire": { static: 1 },
  "con-choir": { base: 1 },
  "con-lens": { flyer: 1 },
  "con-court": { support: 1 },
  "con-gate": { elite: 1 },
  "con-portal": { support: 1 },
};

export const factionSlots = (f: Pick<Faction, "id" | "slots">): Slots => f.slots ?? FACTION_SLOTS[f.id] ?? {};
export const supportSlots = (s: Pick<SupportDef, "id" | "slots">): Slots => s.slots ?? SUPPORT_SLOTS[s.id] ?? {};

/** "+1 Flyer, +1 Static" for a set of extra slots ("" for none). */
export function slotsText(s: Slots): string {
  return UNIT_CLASSES.filter((c) => (s[c] ?? 0) > 0)
    .map((c) => `+${s[c]} ${CLASS_INFO[c].name}`)
    .join(", ");
}

export interface SlotCount {
  cls: UnitClass;
  used: number;
  max: number;
  /** The fewest this list must have (Base only). */
  min: number;
}

/** How many of each class a list uses and may have: the mode's slots plus the faction's and its support cards'. */
export function slotCounts(
  mode: ModeId,
  faction: Pick<Faction, "id" | "slots">,
  entries: readonly ListEntry[],
  supports: readonly Pick<SupportDef, "id" | "slots">[],
  profileOf: (id: string) => (Pick<UnitProfile, "structure" | "keywords" | "models" | "hp"> & { abilities?: readonly string[] }) | undefined,
): SlotCount[] {
  const base = MODE_SLOTS[mode];
  const extra: Slots[] = [factionSlots(faction), ...supports.map(supportSlots)];
  const used = new Map<UnitClass, number>();
  for (const e of entries) {
    const p = profileOf(e.profileId);
    if (!p) continue;
    const c = unitClassOf(p);
    used.set(c, (used.get(c) ?? 0) + 1);
  }
  return UNIT_CLASSES.map((cls) => ({
    cls,
    used: used.get(cls) ?? 0,
    max: base.max[cls] + extra.reduce((n, s) => n + (s[cls] ?? 0), 0),
    min: cls === "base" ? base.minBase : 0,
  }));
}

/** Slot problems for a list, as messages ("Too many Elite: 2/1", "Needs at least 2 Base: has 1"). */
export function slotProblems(counts: readonly SlotCount[]): string[] {
  const errs: string[] = [];
  for (const c of counts) {
    const name = CLASS_INFO[c.cls].name;
    if (c.used > c.max) errs.push(`Too many ${name} units: ${c.used}/${c.max}`);
    if (c.used < c.min) errs.push(`Needs at least ${c.min} ${name} units: has ${c.used}`);
  }
  return errs;
}
