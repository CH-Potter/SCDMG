// Pure editing helpers for the faction forge: adding and removing parts while keeping every
// internal reference (list entries, summon targets, weapon patches) consistent. No DOM.

import type { Faction, ListEntry, SupportAbilityDef, SupportDef, SupportEffect, UnitProfile, Weapon } from "../engine/types";
import { slug } from "../ui/files";
import { listCostIn } from "../engine/data/factionValidation";
import { MODES } from "../engine/data/modes";

export type ProfileKind = "unit" | "structure" | "summon";

export const kindOf = (p: UnitProfile): ProfileKind => (!p.structure ? "unit" : p.structure.summonOnly ? "summon" : "structure");

/** A local id (after the faction prefix) not used by any of `taken`. */
export function uniqueId(prefix: string, base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = `${prefix}${slug(base)}`;
  if (!used.has(root)) return root;
  for (let n = 2; ; n++) if (!used.has(`${root}-${n}`)) return `${root}-${n}`;
}

const profileId = (f: Faction, name: string) => uniqueId(`${f.id}:`, name, f.profiles.map((p) => p.id));
const supportId = (f: Faction, name: string) => uniqueId(`${f.id}:`, name, f.supports.map((s) => s.id));

export const newRanged = (): Weapon => ({ name: "Blaster", melee: false, range: 18, dice: 1, hit: 4, damage: 1, ap: 0, targets: "all" });
export const newMelee = (): Weapon => ({ name: "Bonk", melee: true, range: 0, dice: 1, hit: 4, damage: 1, ap: 0, targets: "ground" });

export function newProfile(f: Faction, kind: ProfileKind, name?: string): UnitProfile {
  const base: UnitProfile = {
    id: "",
    name: name ?? (kind === "unit" ? "New squad" : kind === "structure" ? "New turret" : "New ward"),
    faction: f.id,
    cost: kind === "summon" ? 0 : 3,
    supply: kind === "summon" ? 0 : kind === "structure" ? 1 : 2,
    models: kind === "unit" ? 3 : 1,
    move: kind === "unit" ? 6 : 0,
    hp: kind === "unit" ? 1 : 4,
    shield: 0,
    armor: 5,
    baseRadius: kind === "unit" ? 0.55 : 0.9,
    keywords: kind === "unit" ? ["infantry"] : ["structure"],
    weapons: kind === "unit" ? [newRanged(), newMelee()] : kind === "structure" ? [newRanged()] : [],
    abilities: [],
    upgrades: [],
    blurb: "",
  };
  if (kind === "structure") base.structure = { lifetime: "permanent", fieldDeploy: 6 };
  if (kind === "summon") base.structure = { lifetime: "round", summonOnly: true };
  base.id = profileId(f, base.name);
  return base;
}

export function addProfile(f: Faction, kind: ProfileKind): UnitProfile {
  const p = newProfile(f, kind);
  f.profiles.push(p);
  return p;
}

export function duplicateProfile(f: Faction, id: string): UnitProfile | null {
  const src = f.profiles.find((p) => p.id === id);
  if (!src) return null;
  const copy = structuredClone(src);
  copy.name = `${src.name} copy`.slice(0, 40);
  copy.id = profileId(f, copy.name);
  f.profiles.splice(f.profiles.indexOf(src) + 1, 0, copy);
  return copy;
}

/** Remove a profile and every list entry that uses it. Summons that pointed at it are left empty (validation flags them). */
export function removeProfile(f: Faction, id: string): void {
  f.profiles = f.profiles.filter((p) => p.id !== id);
  f.defaultList = f.defaultList.filter((e) => e.profileId !== id);
  f.assaultExtras = f.assaultExtras.filter((e) => e.profileId !== id);
  for (const s of f.supports) for (const a of s.abilities) if (a.effect.kind === "summon" && a.effect.profileId === id) a.effect.profileId = "";
}

/** Switch a profile between unit, permanent structure and summon-only structure, fixing the fields that go with it. */
export function setProfileKind(f: Faction, p: UnitProfile, kind: ProfileKind): void {
  if (kind === "unit") {
    delete p.structure;
    p.keywords = p.keywords.filter((k) => k !== "structure");
    if (p.move <= 0) p.move = 6;
    if (p.supply <= 0) p.supply = 1;
    return;
  }
  p.structure = kind === "summon" ? { lifetime: "round", summonOnly: true } : { lifetime: p.structure?.lifetime ?? "permanent", fieldDeploy: p.structure?.fieldDeploy ?? 6 };
  if (kind === "structure" && p.structure.lifetime === "round") p.structure.lifetime = "permanent";
  fixStructure(p);
  if (kind === "summon") {
    p.upgrades = [];
    p.cost = 0;
    p.supply = 0;
    // Summon-only structures can't be bought, so take them out of the starter lists.
    f.defaultList = f.defaultList.filter((e) => e.profileId !== p.id);
    f.assaultExtras = f.assaultExtras.filter((e) => e.profileId !== p.id);
  }
}

/** Make a structure consistent: move 0, the structure keyword, never flying or jump, no move upgrades. Returns true if anything changed. */
export function fixStructure(p: UnitProfile): boolean {
  let changed = false;
  if (!p.structure && p.keywords.includes("structure")) {
    p.structure = { lifetime: "permanent" };
    changed = true;
  }
  if (!p.structure) return false;
  if (p.impact) {
    delete p.impact; // structures never charge
    changed = true;
  }
  if (p.move !== 0) {
    p.move = 0;
    changed = true;
  }
  if (!p.keywords.includes("structure")) {
    p.keywords = [...p.keywords, "structure"];
    changed = true;
  }
  const bad = p.keywords.filter((k) => k === "flying" || k === "jump");
  if (bad.length) {
    p.keywords = p.keywords.filter((k) => k !== "flying" && k !== "jump");
    changed = true;
  }
  for (const u of p.upgrades) {
    if (u.move) {
      delete u.move;
      changed = true;
    }
    if (u.addKeywords?.some((k) => k === "flying" || k === "jump" || k === "structure")) {
      u.addKeywords = u.addKeywords.filter((k) => k !== "flying" && k !== "jump" && k !== "structure");
      changed = true;
    }
  }
  return changed;
}

/** Auto-fix every structure in a faction. Returns the names of the profiles that changed. */
export function fixStructures(f: Faction): string[] {
  return f.profiles.filter((p) => fixStructure(p)).map((p) => p.name);
}

/** Remove a weapon, keeping upgrade weapon patches pointing at the right weapon. */
/** Turn impact on charge on (with modest defaults) or off. */
export function setImpact(p: UnitProfile, on: boolean): void {
  if (on) p.impact ??= { dice: 1, hit: 5, damage: 1, ap: 0 };
  else delete p.impact;
}

export function removeWeapon(p: UnitProfile, index: number): void {
  p.weapons.splice(index, 1);
  for (const u of p.upgrades) {
    if (!u.weapon) continue;
    if (u.weapon.index === index) delete u.weapon;
    else if (u.weapon.index > index) u.weapon.index -= 1;
  }
}

export function addUpgrade(p: UnitProfile): void {
  const id = uniqueId("", "upgrade", p.upgrades.map((u) => u.id));
  p.upgrades.push({ id, name: "New upgrade", cost: 1, text: "" });
}

/** Remove an upgrade and strip it from the starter lists. */
export function removeUpgrade(f: Faction, p: UnitProfile, upgradeId: string): void {
  p.upgrades = p.upgrades.filter((u) => u.id !== upgradeId);
  const strip = (e: ListEntry) => {
    if (e.profileId === p.id) e.upgrades = e.upgrades.filter((u) => u !== upgradeId);
  };
  f.defaultList.forEach(strip);
  f.assaultExtras.forEach(strip);
}

/**
 * Drop starter-list entries (Assault extras first, then the Skirmish list's last units, always keeping one)
 * until both modes' rosters fit their resource limit. For factions saved before costs were computed,
 * whose recomputed costs may no longer fit. Returns the names of the units dropped.
 */
export function fitStarterLists(f: Faction): string[] {
  const dropped: string[] = [];
  const nameOf = (e: ListEntry | undefined) => (e ? (f.profiles.find((p) => p.id === e.profileId)?.name ?? e.profileId) : "");
  const over = (mode: "skirmish" | "assault") =>
    listCostIn(f, mode === "assault" ? [...f.defaultList, ...f.assaultExtras] : f.defaultList) > MODES[mode].rosterLimit;
  while (over("skirmish") && f.defaultList.length > 1) dropped.push(nameOf(f.defaultList.pop()));
  while (over("assault") && f.assaultExtras.length) dropped.push(nameOf(f.assaultExtras.pop()));
  while (over("assault") && f.defaultList.length > 1) dropped.push(nameOf(f.defaultList.pop()));
  return dropped;
}

export function defaultEffect(kind: SupportEffect["kind"], f: Faction): SupportEffect {
  switch (kind) {
    case "resources":
      return { kind, amount: 2 };
    case "heal":
      return { kind, amount: 2, revive: false };
    case "recharge":
    case "ward":
    case "brace":
      return { kind };
    case "blast":
      return { kind, radius: 2, hit: 4, damage: 1, ap: 0, range: 18, needsSight: true };
    case "summon":
      return { kind, profileId: f.profiles.find((p) => p.structure?.summonOnly)?.id ?? "", range: 8, minEnemyDistance: 2 };
    case "meleeBuff":
    case "rangedBuff":
      return { kind, dice: 1 };
    case "slow":
      return { kind, range: 12 };
    case "airdrop":
      return { kind, range: 8, minEnemyDistance: 4 };
    case "rattle":
      return { kind, range: 12, penalty: 1 };
    case "retaliate":
      return { kind, hit: 4, damage: 1 };
    case "aimBuff":
      return { kind, precision: 1, tracking: 1 };
    case "regrow":
      return { kind, models: 2 };
    case "dugIn":
      return { kind, save: 1 };
    case "teleport":
      return { kind, range: 8 };
  }
}

export function newSupportAbility(s: SupportDef, f: Faction): SupportAbilityDef {
  const id = uniqueId("", "ability", s.abilities.map((a) => a.id));
  return { id, name: "New ability", text: "", cp: 1, exhaust: true, timing: "any", effect: defaultEffect("resources", f) };
}

export function addSupport(f: Faction): SupportDef {
  const s: SupportDef = { id: supportId(f, "New support"), name: "New support", faction: f.id, fizz: 2, cp: 1, blurb: "", abilities: [], slots: {} };
  s.abilities.push(newSupportAbility(s, f));
  f.supports.push(s);
  return s;
}

export function removeSupport(f: Faction, id: string): void {
  f.supports = f.supports.filter((s) => s.id !== id);
  f.defaultSupports = f.defaultSupports.filter((x) => x !== id);
  f.assaultSupports = f.assaultSupports.filter((x) => x !== id);
}

export const EFFECT_INFO: Record<SupportEffect["kind"], { label: string; reaction: boolean; help: string }> = {
  resources: { label: "Resources", reaction: false, help: "Gain resources straight away." },
  heal: { label: "Heal", reaction: false, help: "A friendly unit heals, optionally reviving a lost model first." },
  recharge: { label: "Recharge", reaction: false, help: "A friendly unit's shields recharge to full." },
  blast: { label: "Blast", reaction: false, help: "Hit every model near a point." },
  summon: { label: "Summon", reaction: false, help: "Place one of this faction's summon-only structures near a friendly model." },
  meleeBuff: { label: "Melee buff", reaction: false, help: "A friendly unit gets extra melee dice per model this round." },
  rangedBuff: { label: "Ranged buff", reaction: false, help: "A friendly unit gets extra ranged dice per model this round." },
  slow: { label: "Slow", reaction: false, help: "An enemy unit is slowed (-2 move) next round." },
  airdrop: {
    label: "Airdrop",
    reaction: false,
    help: "Deploy a unit from reserve (paying its cost and supply) at a point near one of your models, or anywhere on the table for a drop-ship. Never next to the enemy's home objective.",
  },
  rattle: { label: "Rattle", reaction: false, help: "An enemy unit near your models takes a nerve test, at any strength, with a nerve penalty." },
  aimBuff: { label: "Aim buff", reaction: false, help: "A friendly unit's attacks get extra precision and tracking this round (precision also keeps its shots into a melee off friends)." },
  regrow: { label: "Regrow", reaction: false, help: "A friendly unit regrows some of its lost models, at 1 HP each." },
  dugIn: { label: "Dig in", reaction: false, help: "A friendly unit gets better saves against shooting and barrages this round (stacks with cover and hunkering)." },
  teleport: { label: "Teleport", reaction: false, help: "Move a friendly, unengaged unit up to the range, ignoring terrain. It can still act afterwards." },
  ward: { label: "Ward (reaction)", reaction: true, help: "Armed in advance: the next enemy ranged attack on one of your units this round hits one worse." },
  brace: { label: "Brace (reaction)", reaction: true, help: "Armed in advance: the next friendly unit charged this round gets +1 to saves in that combat." },
  retaliate: { label: "Retaliate (reaction)", reaction: true, help: "Armed in advance: when one of your units is destroyed, each enemy model touching it is hit." },
};

/** A one-line plain-text description of an effect, for hints and default ability text. */
export function effectSummary(e: SupportEffect, f: Faction): string {
  switch (e.kind) {
    case "resources":
      return `Gain ${e.amount} resources.`;
    case "heal":
      return `A friendly unit heals ${e.amount} HP${e.revive ? ", reviving a lost model first" : ""}.`;
    case "recharge":
      return "A friendly unit's shields recharge to full.";
    case "blast":
      return `A ${e.radius}" blast at a point within ${e.range}"${e.needsSight ? " that one of your models can see" : ""}. Each model under it is hit on a ${e.hit}+ for ${e.damage} damage${e.ap ? `, AP${e.ap}` : ""}.`;
    case "summon": {
      const p = f.profiles.find((x) => x.id === e.profileId);
      return `Place ${p ? `a ${p.name}` : "a structure"} within ${e.range}" of one of your models, at least ${e.minEnemyDistance}" from enemies.`;
    }
    case "meleeBuff":
      return `A friendly unit gets +${e.dice} melee ${e.dice === 1 ? "die" : "dice"} per model this round.`;
    case "rangedBuff":
      return `A friendly unit gets +${e.dice} ranged ${e.dice === 1 ? "die" : "dice"} per model this round.`;
    case "slow":
      return `Slow an enemy unit within ${e.range}" of your models: -2 move next round.`;
    case "airdrop": {
      const when = e.fromRound && e.fromRound > 1 ? `From round ${e.fromRound}: d` : "D";
      const where = e.anywhere ? "anywhere on the table" : `at a point within ${e.range}" of one of your models`;
      const shield = e.arrivalShield ? ` It arrives with +${e.arrivalShield} shield per model until the end of the round.` : "";
      return `${when}eploy a unit from reserve, paying its cost and supply, ${where} and at least ${e.minEnemyDistance}" from enemies.${shield}`;
    }
    case "rattle":
      return `An enemy unit within ${e.range}" of your models takes a nerve test at any strength${e.penalty ? `, with -${e.penalty} nerve` : ""}.`;
    case "aimBuff": {
      const parts = [e.precision ? `precision +${e.precision}` : "", e.tracking ? `tracking +${e.tracking}` : ""].filter(Boolean).join(" and ");
      return `A friendly unit's attacks get ${parts || "nothing extra"} this round.`;
    }
    case "regrow":
      return `A friendly unit regrows up to ${e.models} lost ${e.models === 1 ? "model" : "models"} (1 HP each).`;
    case "dugIn":
      return `A friendly unit gets +${e.save} to saves against shooting and barrages this round.`;
    case "teleport":
      return `Move a friendly, unengaged unit up to ${e.range}", ignoring terrain (not into base contact). It can still act afterwards.`;
    case "ward":
      return "Reaction: the next enemy ranged attack on one of your units this round hits one worse.";
    case "brace":
      return "Reaction: the next friendly unit charged this round gets +1 to saves in that combat.";
    case "retaliate":
      return `Reaction: when one of your units is destroyed this round, every enemy model touching it is hit on a ${e.hit}+ for ${e.damage} damage.`;
  }
}
