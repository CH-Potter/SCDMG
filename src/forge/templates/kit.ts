// Building blocks for the faction forge's trope templates: short helpers that turn compact unit and
// support specs into a complete custom-format Faction. Costs, supply, upgrade costs and Fizz are left
// at 0 here and computed by engine/pricing.ts (the forge recomputes them whenever a faction is opened).

import { applyComputedCosts } from "../../engine/pricing";
import { defaultEvade } from "../../engine/data/agility";
import type {
  AbilityId,
  EvadeDef,
  Faction,
  ImpactDef,
  Keyword,
  ListEntry,
  MiniBack,
  MiniBody,
  MiniHead,
  MiniHeadgear,
  MiniWeapon,
  StructureDef,
  SupportAbilityDef,
  SupportDef,
  SupportEffect,
  UnitProfile,
  UpgradeDef,
  Weapon,
  WeaponBonus,
  WeaponTrait,
} from "../../engine/types";

export type TemplateGroup = "grimdark" | "fantasy" | "dustline";

export const TEMPLATE_GROUPS: Record<TemplateGroup, { name: string; blurb: string }> = {
  grimdark: { name: "Grimdark sci-fi", blurb: "Very serious armies of the very far future, played for laughs." },
  fantasy: { name: "Fantasy", blurb: "Swords, bows, spells and siege engines, given a cartoon polish." },
  dustline: { name: "Dustline veterans", blurb: "Armies that once fought for the Dustline. They've left the main game, but every unit, card and grudge is here." },
};

/** A starting faction for a classic tabletop trope. The faction is a template: start one to edit it. */
export interface FactionTemplate {
  /** Short stable key, e.g. "hive". */
  key: string;
  group: TemplateGroup;
  /** The trope it plays, in plain words ("Insectoid hive swarm"). */
  trope: string;
  /** A complete faction with template ids (`custom-tpl-<key>`), computed costs, and starter lists. */
  faction: Faction;
}

/** Prefix of template faction ids. Starting a template gives the copy a fresh id. */
export const TEMPLATE_PREFIX = "custom-tpl-";

// ---------- weapons ----------

type WeaponOpts = {
  damage?: number;
  ap?: number;
  targets?: Weapon["targets"];
  bonuses?: WeaponBonus[];
  traits?: WeaponTrait[];
  precision?: number;
  tracking?: number;
};

function weaponOf(name: string, melee: boolean, range: number, dice: number, hit: number, o: WeaponOpts): Weapon {
  const w: Weapon = { name, melee, range, dice, hit, damage: o.damage ?? 1, ap: o.ap ?? 0, targets: o.targets ?? (melee ? "ground" : "all") };
  if (o.bonuses?.length) w.bonuses = o.bonuses;
  if (o.traits?.length) w.traits = o.traits;
  if (o.precision) w.precision = o.precision;
  if (o.tracking) w.tracking = o.tracking;
  return w;
}

/** A ranged weapon. */
export const gun = (name: string, range: number, dice: number, hit: number, o: WeaponOpts = {}): Weapon => weaponOf(name, false, range, dice, hit, o);
/** A melee weapon. */
export const blade = (name: string, dice: number, hit: number, o: WeaponOpts = {}): Weapon => weaponOf(name, true, 0, dice, hit, o);

// ---------- units ----------

/** Miniature recipe in short: body, head, headgear, held weapon, back gear, trim colour, size, main colour (else the faction's). */
export type ArtSpec = [MiniBody, MiniHead, MiniHeadgear, MiniWeapon, MiniBack, number, number?, number?];

export interface UnitSpec {
  /** Local id (the faction prefix is added). */
  id: string;
  name: string;
  models: number;
  move: number;
  hp: number;
  shield?: number;
  armor: number;
  /** Base radius, inches. */
  base: number;
  kw: Keyword[];
  weapons: Weapon[];
  abilities: AbilityId[];
  upgrades?: UpgradeDef[];
  nerve?: number;
  evade?: EvadeDef;
  impact?: ImpactDef;
  structure?: StructureDef;
  blurb: string;
  /** The miniature. Leave it out to draw the unit with the faction look's own painters (the Munch's critters, say). */
  art?: ArtSpec;
}

/** An upgrade (its cost is computed). */
export const up = (id: string, name: string, text: string, o: Omit<UpgradeDef, "id" | "name" | "text" | "cost"> = {}): UpgradeDef => ({ id, name, cost: 0, text, ...o });

// ---------- supports ----------

export interface SupportSpec {
  id: string;
  name: string;
  /** CP the card adds each round. */
  cp: number;
  blurb: string;
  slots?: SupportDef["slots"];
  abilities: SupportAbilityDef[];
}

/** A support ability. Abilities exhaust the card unless `exhaust` is false. */
export const ab = (id: string, name: string, cp: number, timing: SupportAbilityDef["timing"], effect: SupportEffect, text: string, exhaust = true): SupportAbilityDef => ({
  id,
  name,
  text,
  cp,
  exhaust,
  timing,
  effect,
});

// ---------- whole templates ----------

/** A starter list entry: a unit's local id, or [id, ...upgrade ids]. */
export type Entry = string | [string, ...string[]];

export interface TemplateSpec {
  key: string;
  group: TemplateGroup;
  trope: string;
  name: string;
  blurb: string;
  color: number;
  look: Faction["look"];
  slots?: Faction["slots"];
  units: UnitSpec[];
  supports: SupportSpec[];
  skirmish: Entry[];
  /** Added to the Skirmish list for Assault. */
  assault: Entry[];
  skirmishSupports: string[];
  /** Added to the Skirmish supports for Assault. */
  assaultSupports: string[];
}

/** Build a template's faction: prefixed ids, internal references fixed, costs computed. */
export function template(s: TemplateSpec): FactionTemplate {
  const fid = `${TEMPLATE_PREFIX}${s.key}`;
  const pid = (local: string) => `${fid}:${local}`;
  const profiles: UnitProfile[] = s.units.map((u) => {
    const p: UnitProfile = {
      id: pid(u.id),
      name: u.name,
      faction: fid,
      cost: 0,
      supply: 0,
      models: u.models,
      move: u.structure ? 0 : u.move,
      hp: u.hp,
      shield: u.shield ?? 0,
      armor: u.armor,
      baseRadius: u.base,
      keywords: [...u.kw],
      weapons: u.weapons.map((w) => structuredClone(w)),
      abilities: [...u.abilities],
      upgrades: (u.upgrades ?? []).map((x) => structuredClone(x)),
      blurb: u.blurb,
    };
    if (u.art) {
      const [body, head, headgear, weapon, back, secondary, scale, primary] = u.art;
      p.art = { kind: "parts", recipe: { body, head, headgear, weapon, back, secondary, scale: scale ?? 1, ...(primary !== undefined ? { primary } : {}) } };
    }
    if (u.nerve !== undefined) p.nerve = u.nerve;
    // Evade is for small, agile units: one without its own gets the basic one (see data/agility.ts).
    if (u.evade) p.evade = structuredClone(u.evade);
    else {
      const ev = defaultEvade(p);
      if (ev) p.evade = ev;
    }
    if (u.impact) p.impact = { ...u.impact };
    if (u.structure) p.structure = { ...u.structure };
    return p;
  });
  const supports: SupportDef[] = s.supports.map((x) => ({
    id: pid(x.id),
    name: x.name,
    faction: fid,
    fizz: 0,
    cp: x.cp,
    blurb: x.blurb,
    slots: { ...(x.slots ?? {}) },
    abilities: x.abilities.map((a) => {
      const c = structuredClone(a);
      if (c.effect.kind === "summon") c.effect.profileId = pid(c.effect.profileId);
      if (c.effect.kind === "heal") c.effect.revive = !!c.effect.revive; // the stored shape cleanFaction makes
      return c;
    }),
  }));
  const entry = (e: Entry): ListEntry => (typeof e === "string" ? { profileId: pid(e), upgrades: [] } : { profileId: pid(e[0]), upgrades: e.slice(1) });
  const faction: Faction = {
    id: fid,
    name: s.name,
    blurb: s.blurb,
    color: s.color,
    look: s.look,
    profiles,
    defaultList: s.skirmish.map(entry),
    assaultExtras: s.assault.map(entry),
    supports,
    defaultSupports: s.skirmishSupports.map(pid),
    assaultSupports: s.assaultSupports.map(pid),
    slots: { ...(s.slots ?? {}) },
  };
  return { key: s.key, group: s.group, trope: s.trope, faction: applyComputedCosts(faction) };
}
