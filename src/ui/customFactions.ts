import { deleteListsForFaction } from "./lists";
// Custom factions made in the faction forge: browser storage, copying, and file import/export.
// Custom factions are registered with the engine (registerCustomFactions) after every save or delete.

import { BUILT_IN_FACTION_IDS, FACTIONS, isBuiltInFaction, registerCustomFactions } from "../engine/data/factions";
import { CUSTOM_PREFIX, EFFECT_KINDS, factionProblems, KEYWORDS, LIFETIMES, LOOKS, TARGETS, TIMINGS, TRAITS, EVADE_CONDITIONS } from "../engine/data/factionValidation";
import { ABILITIES } from "../engine/data/abilities";
import { cleanArt } from "../engine/data/unitArt";
import { factionSlots, supportSlots, UNIT_CLASSES, type Slots } from "../engine/data/unitClasses";
import { applyComputedCosts } from "../engine/pricing";
import type { AbilityId, Faction, ImpactDef, Keyword, ListEntry, StructureDef, SupportAbilityDef, SupportDef, SupportEffect, UnitProfile, UpgradeDef, Weapon, WeaponBonus, WeaponTrait, EvadeCondition } from "../engine/types";
import { fitStarterLists, fixStructures, newProfile } from "../forge/model";
import { RIG_TAG_RE, type Tagged } from "./minis/binding";
import { loadJson, newId, saveJson, slug } from "./files";

const KEY = "scdmg.customFactions.v1";
const DRAFT_KEY = "scdmg.factionDraft.v1";
export const FACTION_FORMAT = "scdmg-faction";

const builtIns = (): Faction[] => BUILT_IN_FACTION_IDS.map((id) => FACTIONS[id]!).filter(Boolean);

function storedRaw(): unknown[] {
  const v = loadJson<unknown>(KEY, []);
  return Array.isArray(v) ? v : [];
}

/** Valid custom factions in storage (anything broken or clashing is skipped). */
export function listCustomFactions(): Faction[] {
  const out: Faction[] = [];
  for (const raw of storedRaw()) {
    const f = cleanFaction(raw);
    if (isBuiltInFaction(f.id) || out.some((x) => x.id === f.id)) continue;
    const others = [...builtIns(), ...out];
    // Costs are recomputed on load (cleanFaction), so a faction saved before computed pricing may now
    // have a starter list over the mode's limit: trim it rather than lose the faction.
    if (factionProblems(f, { others }).length && (!fitStarterLists(f).length || factionProblems(f, { others }).length)) continue;
    out.push({ ...f, custom: true });
  }
  return out;
}

const register = () => registerCustomFactions(listCustomFactions());

/** Insert or replace a custom faction (by id). Returns problems instead of saving if it's invalid. */
export function saveCustomFaction(f: Faction): string[] {
  const clean = cleanFaction(f);
  if (isBuiltInFaction(clean.id)) return [`"${clean.id}" is a built-in faction and can't be changed. Copy it instead.`];
  const others = [...builtIns(), ...listCustomFactions().filter((x) => x.id !== clean.id)];
  const problems = factionProblems(clean, { others });
  if (problems.length) return problems;
  const rest = storedRaw().filter((x) => !(typeof x === "object" && x !== null && (x as { id?: unknown }).id === clean.id));
  if (!saveJson(KEY, [...rest, { ...clean, custom: true }])) return ["Couldn't save: browser storage is unavailable or full"];
  register();
  return [];
}

export function deleteCustomFaction(id: string): void {
  saveJson(
    KEY,
    storedRaw().filter((x) => !(typeof x === "object" && x !== null && (x as { id?: unknown }).id === id)),
  );
  // Lists built for the faction can't be played any more, so don't leave them behind.
  deleteListsForFaction(id);
  register();
}

// ---------- ids ----------

/** A fresh custom faction id, e.g. "custom-rust-rats-m3k2x1-ab12c". */
export const newFactionId = (name: string): string => newId(`${CUSTOM_PREFIX}${slug(name)}`);

/** The part of an id after its faction prefix ("custom-x:grunts" → "grunts"). */
const localPart = (id: string): string => slug(id.includes(":") ? id.slice(id.indexOf(":") + 1) : id);

/**
 * Give a faction a new id and prefix every profile and support id with it, fixing internal references
 * (summon targets, starter lists and starter supports). Returns a new object; the input is untouched.
 */
export function rekeyFaction(src: Faction, factionId: string): Faction {
  const f = structuredClone(src);
  f.id = factionId;
  const rename = <T extends { id: string; faction: string }>(items: T[]): Map<string, string> => {
    const map = new Map<string, string>();
    const used = new Set<string>();
    for (const item of items) {
      const base = `${factionId}:${localPart(item.id)}`;
      let id = base;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      used.add(id);
      if (!map.has(item.id)) map.set(item.id, id);
      item.id = id;
      item.faction = factionId;
    }
    return map;
  };
  const profiles = rename(f.profiles);
  const supports = rename(f.supports);
  for (const s of f.supports)
    for (const a of s.abilities) if (a.effect.kind === "summon") a.effect.profileId = profiles.get(a.effect.profileId) ?? a.effect.profileId;
  const fixEntry = (e: ListEntry) => ({ ...e, profileId: profiles.get(e.profileId) ?? e.profileId });
  f.defaultList = f.defaultList.map(fixEntry);
  f.assaultExtras = f.assaultExtras.map(fixEntry);
  f.defaultSupports = f.defaultSupports.map((id) => supports.get(id) ?? id);
  f.assaultSupports = f.assaultSupports.map((id) => supports.get(id) ?? id);
  return f;
}

/** Fit the starter lists to the mode limits after costs were recomputed, noting any units dropped. */
function trimNote(f: Faction, notes: string[]): void {
  const dropped = fitStarterLists(f);
  if (dropped.length) notes.push(`Starter lists trimmed to fit their limits at the computed costs: dropped ${dropped.join(", ")}`);
}

/**
 * A custom copy of any faction (built-in or custom), with fresh ids throughout and computed costs.
 * If the computed costs push a starter list over its limit, units are dropped from it (listed in `notes`).
 */
export function copyFaction(src: Faction, name = `${src.name} copy`, notes: string[] = []): Faction {
  const clean = cleanFaction(src);
  // Built-ins take their army slots from tables; a copy keeps them as its own editable values.
  clean.slots = { ...factionSlots(src) };
  for (const s of clean.supports) s.slots = { ...supportSlots(s) };
  clean.name = name.slice(0, 40);
  delete clean.custom;
  // Copies use the plain "Skirmish set plus Assault extras" starter supports, which the forge edits.
  delete clean.assaultStarter;
  const out = applyComputedCosts(rekeyFaction(clean, newFactionId(clean.name)));
  trimNote(out, notes);
  return out;
}

/** A new faction with one simple squad to start from. */
export function blankFaction(name = "New faction"): Faction {
  const f: Faction = {
    id: newFactionId(name),
    name,
    blurb: "",
    color: 0x2fb5c8,
    look: "plain",
    profiles: [],
    defaultList: [],
    assaultExtras: [],
    supports: [],
    defaultSupports: [],
    assaultSupports: [],
    slots: {},
  };
  const squad = newProfile(f, "unit", "Basic squad");
  f.profiles.push(squad);
  f.defaultList.push({ profileId: squad.id, upgrades: [] });
  return applyComputedCosts(f);
}

// ---------- coercion ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
/** Numbers stay numbers, numeric strings become numbers, anything else becomes NaN (which validation rejects). */
const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
const bool = (v: unknown): boolean => v === true || v === "true";
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const optNum = (v: unknown): number | undefined => (v === undefined || v === null ? undefined : num(v));

function color(v: unknown): number {
  if (typeof v === "string") {
    const m = /^(?:#|0x)?([0-9a-f]{6})$/i.exec(v.trim());
    if (m) return parseInt(m[1]!, 16);
  }
  return num(v);
}

/**
 * A copy of `raw` shaped like a Faction: only known fields, every field coerced to its type, unknown
 * enum values dropped or replaced by a default (each change is described in `notes`). Bad numbers become
 * NaN so `factionProblems` reports them. The result is always safe to open in the forge.
 */
export function cleanFaction(raw: unknown, notes: string[] = []): Faction {
  const r = isObj(raw) ? raw : {};
  const enumOr = <T extends string>(v: unknown, allowed: readonly T[], fallback: T, where: string): T => {
    if (allowed.includes(v as T)) return v as T;
    notes.push(`${where}: "${str(v)}" isn't a known value, so it was set to "${fallback}"`);
    return fallback;
  };
  const keywords = (v: unknown, where: string): Keyword[] =>
    list(v).filter((k): k is Keyword => {
      const ok = KEYWORDS.includes(k as Keyword);
      if (!ok) notes.push(`${where}: dropped unknown keyword "${str(k)}"`);
      return ok;
    });
  const abilities = (v: unknown, where: string): AbilityId[] =>
    list(v).filter((a): a is AbilityId => {
      const ok = typeof a === "string" && Object.prototype.hasOwnProperty.call(ABILITIES, a);
      if (!ok) notes.push(`${where}: dropped unknown ability "${str(a)}"`);
      return ok;
    });
  const traits = (v: unknown, where: string): WeaponTrait[] =>
    list(v).filter((t): t is WeaponTrait => {
      const ok = TRAITS.includes(t as WeaponTrait);
      if (!ok) notes.push(`${where}: dropped unknown weapon trait "${str(t)}"`);
      return ok;
    });
  /** Extra army slots by unit class: known classes only, numbers coerced (validation checks the range). */
  const slots = (v: unknown, where: string): Slots | undefined => {
    if (v === undefined || v === null) return undefined;
    const out: Slots = {};
    if (!isObj(v)) {
      notes.push(`${where}: dropped army slots that weren't valid`);
      return out;
    }
    for (const [k, n] of Object.entries(v)) {
      if (!(UNIT_CLASSES as readonly string[]).includes(k)) notes.push(`${where}: dropped slots for unknown unit class "${k}"`);
      else if (n !== undefined && n !== null) out[k as keyof Slots] = num(n);
    }
    return out;
  };
  const objects = (v: unknown, where: string): Obj[] =>
    list(v).filter((x): x is Obj => {
      if (!isObj(x)) notes.push(`${where}: dropped an entry that wasn't an object`);
      return isObj(x);
    });

  const bonus = (b: Obj, where: string): WeaponBonus => {
    const out: WeaponBonus = { vs: enumOr(b.vs, KEYWORDS, "infantry", `${where} bonus`) };
    for (const k of ["dice", "damage", "ap"] as const) {
      const n = optNum(b[k]);
      if (n !== undefined) out[k] = n;
    }
    return out;
  };
  const weapon = (w: Obj, where: string): Weapon => {
    const melee = bool(w.melee);
    const out: Weapon = {
      name: str(w.name),
      melee,
      range: melee ? 0 : num(w.range),
      dice: num(w.dice),
      hit: num(w.hit),
      damage: num(w.damage),
      ap: num(w.ap),
      targets: enumOr(w.targets, TARGETS, melee ? "ground" : "all", `${where} targets`),
    };
    if (w.bonuses !== undefined) out.bonuses = objects(w.bonuses, where).map((b) => bonus(b, where));
    if (w.traits !== undefined) out.traits = traits(w.traits, where);
    if (w.precision !== undefined) out.precision = num(w.precision);
    if (w.tracking !== undefined) out.tracking = num(w.tracking);
    return out;
  };
  const patch = (p: Obj, where: string): Partial<Weapon> => {
    const out: Partial<Weapon> = {};
    if (p.name !== undefined) out.name = str(p.name);
    if (p.melee !== undefined) out.melee = bool(p.melee);
    for (const k of ["range", "dice", "hit", "damage", "ap", "precision", "tracking"] as const) if (p[k] !== undefined) out[k] = num(p[k]);
    if (p.targets !== undefined) out.targets = enumOr(p.targets, TARGETS, "all", `${where} targets`);
    if (p.bonuses !== undefined) out.bonuses = objects(p.bonuses, where).map((b) => bonus(b, where));
    if (p.traits !== undefined) out.traits = traits(p.traits, where);
    return out;
  };
  const upgrade = (u: Obj, where: string): UpgradeDef => {
    const w = `${where}, upgrade "${str(u.name)}"`;
    const out: UpgradeDef = { id: str(u.id), name: str(u.name), cost: num(u.cost), text: str(u.text) };
    const addModels = optNum(u.addModels);
    if (addModels !== undefined) out.addModels = addModels;
    const move = optNum(u.move);
    if (move !== undefined) out.move = move;
    if (u.addKeywords !== undefined) out.addKeywords = keywords(u.addKeywords, w);
    if (u.addAbilities !== undefined) out.addAbilities = abilities(u.addAbilities, w);
    if (isObj(u.weapon) && isObj(u.weapon.patch)) out.weapon = { index: num(u.weapon.index), patch: patch(u.weapon.patch, w) };
    if (isObj(u.impact)) {
      const imp: Partial<ImpactDef> = {};
      for (const k of ["dice", "hit", "damage", "ap"] as const) {
        const v = optNum(u.impact[k]);
        if (v !== undefined) imp[k] = v;
      }
      out.impact = imp;
    }
    return out;
  };
  const structure = (s: Obj, where: string): StructureDef => {
    const out: StructureDef = { lifetime: enumOr(s.lifetime, LIFETIMES, "permanent", `${where} lifetime`) };
    if (s.summonOnly !== undefined) out.summonOnly = bool(s.summonOnly);
    const fd = optNum(s.fieldDeploy);
    if (fd !== undefined) out.fieldDeploy = fd;
    return out;
  };
  const profile = (p: Obj, i: number): UnitProfile => {
    const where = str(p.name) || `Unit #${i + 1}`;
    const out: UnitProfile = {
      id: str(p.id),
      name: str(p.name),
      faction: str(p.faction),
      cost: num(p.cost),
      supply: num(p.supply),
      models: num(p.models),
      move: num(p.move),
      hp: num(p.hp),
      shield: num(p.shield),
      armor: num(p.armor),
      baseRadius: num(p.baseRadius),
      keywords: keywords(p.keywords, where),
      weapons: objects(p.weapons, where).map((w) => weapon(w, where)),
      abilities: abilities(p.abilities, where),
      upgrades: objects(p.upgrades, where).map((u) => upgrade(u, where)),
      blurb: str(p.blurb),
    };
    if (isObj(p.structure)) out.structure = structure(p.structure, where);
    const nerve = optNum(p.nerve);
    if (nerve !== undefined) out.nerve = nerve;
    if (isObj(p.evade)) {
      const against = Array.isArray(p.evade.against)
        ? p.evade.against.filter((c): c is EvadeCondition => typeof c === "string" && (EVADE_CONDITIONS as readonly string[]).includes(c))
        : [];
      out.evade = { target: num(p.evade.target), against: [...new Set(against)] };
    }
    if (isObj(p.impact)) out.impact = { dice: num(p.impact.dice), hit: num(p.impact.hit), damage: num(p.impact.damage), ap: num(p.impact.ap) };
    const art = cleanArt(p.art, notes, where);
    if (art) out.art = art;
    // the template a unit's miniature art comes from ("bulwark/brothers", ui/minis/binding.ts): cosmetic, kept by copies
    if (typeof p.rigTag === "string" && RIG_TAG_RE.test(p.rigTag)) (out as UnitProfile & Tagged).rigTag = p.rigTag;
    return out;
  };
  const effect = (e: unknown, where: string): SupportEffect => {
    const o = isObj(e) ? e : {};
    const kind = enumOr(o.kind, EFFECT_KINDS, "resources", `${where} effect`);
    switch (kind) {
      case "resources":
        return { kind, amount: o.kind === kind ? num(o.amount) : 1 };
      case "heal":
        return { kind, amount: num(o.amount), revive: bool(o.revive) };
      case "blast":
        return { kind, radius: num(o.radius), hit: num(o.hit), damage: num(o.damage), ap: num(o.ap), range: num(o.range), needsSight: bool(o.needsSight) };
      case "summon":
        return { kind, profileId: str(o.profileId), range: num(o.range), minEnemyDistance: num(o.minEnemyDistance), ...(optNum(o.fromRound) !== undefined ? { fromRound: optNum(o.fromRound) } : {}) };
      case "meleeBuff":
      case "rangedBuff":
        return { kind, dice: num(o.dice) };
      case "slow":
        return { kind, range: num(o.range) };
      case "retaliate":
        return { kind, hit: num(o.hit), damage: num(o.damage) };
      case "airdrop": {
        const fromRound = optNum(o.fromRound);
        const arrivalShield = optNum(o.arrivalShield);
        return {
          kind,
          range: num(o.range),
          minEnemyDistance: num(o.minEnemyDistance),
          ...(bool(o.anywhere) ? { anywhere: true } : {}),
          ...(fromRound !== undefined ? { fromRound } : {}),
          ...(arrivalShield ? { arrivalShield } : {}),
        };
      }
      case "rattle":
        return { kind, range: num(o.range), penalty: num(o.penalty) };
      case "aimBuff":
        return { kind, precision: num(o.precision), tracking: num(o.tracking) };
      case "regrow":
        return { kind, models: num(o.models) };
      case "dugIn":
        return { kind, save: num(o.save) };
      case "teleport":
      case "spot":
      case "smoke":
      case "blind":
      case "resonate":
      case "expose":
      case "silence":
        return { kind, range: num(o.range) };
      case "haste":
        return { kind, move: num(o.move) };
      case "overshield":
        return { kind, amount: num(o.amount) };
      case "armourBuff":
        return { kind, save: num(o.save) };
      case "armourBreak":
        return { kind, save: num(o.save), range: num(o.range) };
      case "evadeBuff":
        return { kind, amount: num(o.amount), grant: num(o.grant) };
      case "evadeDebuff":
        return { kind, amount: num(o.amount), range: num(o.range) };
      case "damageBuff":
        return { kind, amount: num(o.amount) };
      case "weaken":
        return { kind, dice: num(o.dice), range: num(o.range) };
      default:
        return { kind: kind as "recharge" | "overwatch" | "ward" | "brace" };
    }
  };
  const ability = (a: Obj, where: string): SupportAbilityDef => {
    const w = `${where}, "${str(a.name)}"`;
    return {
      id: str(a.id),
      name: str(a.name),
      text: str(a.text),
      cp: num(a.cp),
      exhaust: bool(a.exhaust),
      timing: enumOr(a.timing, TIMINGS, "any", `${w} timing`),
      effect: effect(a.effect, w),
    };
  };
  const support = (s: Obj, i: number): SupportDef => {
    const where = str(s.name) || `Support #${i + 1}`;
    const out: SupportDef = {
      id: str(s.id),
      name: str(s.name),
      faction: str(s.faction),
      fizz: num(s.fizz),
      cp: num(s.cp),
      blurb: str(s.blurb),
      abilities: objects(s.abilities, where).map((a) => ability(a, where)),
    };
    const sl = slots(s.slots, `${where} slots`) ?? (custom ? {} : undefined);
    if (sl) out.slots = sl;
    return out;
  };
  const entries = (v: unknown, where: string): ListEntry[] =>
    objects(v, where).map((e) => ({ profileId: str(e.profileId), upgrades: list(e.upgrades).map(str) }));

  // Custom factions keep their own slots (and computed costs); built-ins use the tables in unitClasses.ts.
  const custom = !isBuiltInFaction(str(r.id));
  const out: Faction = {
    id: str(r.id),
    name: str(r.name),
    blurb: str(r.blurb),
    color: color(r.color),
    look: enumOr(r.look, LOOKS, "plain", "Token look"),
    profiles: objects(r.profiles, "Units").map(profile),
    defaultList: entries(r.defaultList, "Skirmish starter list"),
    assaultExtras: entries(r.assaultExtras, "Assault extras"),
    supports: objects(r.supports, "Supports").map(support),
    defaultSupports: list(r.defaultSupports).map(str),
    assaultSupports: list(r.assaultSupports).map(str),
  };
  if (Array.isArray(r.assaultStarter)) out.assaultStarter = list(r.assaultStarter).map(str);
  if (r.custom === true) out.custom = true;
  const fs = slots(r.slots, "Faction slots") ?? (custom ? {} : undefined);
  if (fs) out.slots = fs;
  // Costs, supply, upgrade costs and Fizz are worked out from the stats (engine/pricing.ts), so stored
  // or imported values never fight the computed ones. Built-ins keep their hand-tuned costs.
  return custom ? applyComputedCosts(out) : out;
}

// ---------- files ----------

/** The JSON written by Export. */
export function exportable(f: Faction): unknown {
  const clean = cleanFaction(f);
  delete clean.custom;
  return { format: FACTION_FORMAT, version: 1, faction: clean };
}

export interface FactionImport {
  /** The cleaned faction, ready to open in the forge, or null if the file isn't a faction at all. */
  faction: Faction | null;
  /** Problems from `factionProblems` (empty means it's ready to save and play). */
  problems: string[];
  /** Things that were changed to make the data fit (dropped unknown values, auto-fixed structures...). */
  notes: string[];
  /** True if the faction was given a fresh id (missing, not custom-, built-in, or already taken). */
  renamed: boolean;
}

/**
 * Prepare a faction read from a JSON file (either an Export file or a bare faction object): keep only known
 * fields, coerce types, give it a fresh id if its id clashes with a built-in or one of `takenIds` (defaults to
 * the saved custom factions), prefix all profile/support ids with the faction id, and validate it.
 */
export function importFaction(raw: unknown, takenIds?: Iterable<string>): FactionImport {
  const body = isObj(raw) && raw.format === FACTION_FORMAT ? raw.faction : raw;
  if (!isObj(body) || !Array.isArray(body.profiles)) return { faction: null, problems: ["That file isn't an SCDMG faction"], notes: [], renamed: false };
  const notes: string[] = [];
  const f = cleanFaction(body, notes);
  delete f.custom;
  if (!f.name.trim()) f.name = "Imported faction";
  f.name = f.name.slice(0, 40);
  const saved = listCustomFactions();
  const taken = new Set(takenIds ?? saved.map((x) => x.id));
  let renamed = false;
  let fid = f.id;
  if (!/^custom-[a-z0-9_-]{1,100}$/i.test(fid) || isBuiltInFaction(fid) || taken.has(fid)) {
    fid = newFactionId(f.name);
    renamed = true;
  }
  const out = rekeyFaction(f, fid);
  const fixed = fixStructures(out);
  if (fixed.length) notes.push(`Structures fixed (move 0, structure keyword): ${fixed.join(", ")}`);
  applyComputedCosts(out);
  trimNote(out, notes);
  const problems = factionProblems(out, { others: [...builtIns(), ...saved.filter((x) => x.id !== fid)] });
  return { faction: out, problems, notes, renamed };
}

// ---------- work-in-progress draft ----------

/** Keep the faction being edited (valid or not) so it survives closing the forge or a reload. */
export function saveFactionDraft(f: Faction): boolean {
  return saveJson(DRAFT_KEY, f);
}

export function loadFactionDraft(): Faction | null {
  const raw = loadJson<unknown>(DRAFT_KEY, null);
  if (!isObj(raw)) return null;
  const f = cleanFaction(raw);
  return f.id.startsWith(CUSTOM_PREFIX) ? f : null;
}

export function clearFactionDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // storage blocked: nothing to clear
  }
}
