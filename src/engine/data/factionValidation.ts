import { CP_CAP } from "../constants";
// Validation for factions (built-in or made in the faction forge). Pure: no DOM, no storage.
// `factionProblems` lists everything that would make a faction unsafe or unplayable. Costs are
// computed from the faction object itself, so it works for factions that aren't registered yet.

import type { Faction, Keyword, ListEntry, UnitProfile, WeaponTrait, EvadeCondition } from "../types";
import { evadeProblem } from "./agility";
import { ABILITIES } from "./abilities";
import { BUILT_IN_FACTION_IDS, FACTIONS } from "./factions";
import { MODES, type GameModeDef, type ModeId } from "./modes";
import { artProblems, factionArtProblems } from "./unitArt";
import { CLASS_INFO, UNIT_CLASSES, type UnitClass } from "./unitClasses";

// Records (not arrays) so the compiler flags any keyword or trait added to types.ts but missing here.
const KEYWORD_SET: Record<Keyword, true> = {
  infantry: true,
  light: true,
  armoured: true,
  heavy: true,
  flying: true,
  jump: true,
  mech: true,
  beast: true,
  monster: true,
  structure: true,
  fearless: true,
};
const TRAIT_SET: Record<WeaponTrait, true> = { blast: true, torrent: true, heavy: true, rending: true, pistol: true, indirect: true };
export const KEYWORDS = Object.keys(KEYWORD_SET) as readonly Keyword[];
export const TRAITS = Object.keys(TRAIT_SET) as readonly WeaponTrait[];
export const LOOKS = ["cap", "teeth", "crystal", "plain"] as const;
export const TARGETS = ["ground", "air", "all"] as const;
export const TIMINGS = ["movement", "assault", "combat", "any"] as const;
export const LIFETIMES = ["permanent", "round"] as const;
export const EFFECT_KINDS = [
  "resources",
  "heal",
  "recharge",
  "blast",
  "summon",
  "meleeBuff",
  "rangedBuff",
  "slow",
  "ward",
  "brace",
  "retaliate",
  "airdrop",
  "rattle",
  "aimBuff",
  "regrow",
  "dugIn",
  "teleport",
  "spot",
  "smoke",
  "overwatch",
  "haste",
  "blind",
  "resonate",
  "expose",
  "silence",
  "overshield",
  "armourBuff",
  "armourBreak",
  "evadeBuff",
  "evadeDebuff",
  "damageBuff",
  "weaken",
] as const;

/** The CP pool cap (mirrors CP_CAP in engine/supports.ts): an ability costing more could never be played. */
export const MAX_CP = CP_CAP;
/** Fizz budgets used until `fizzLimit` is part of `GameModeDef`. */
export const FALLBACK_FIZZ: Record<ModeId, number> = { skirmish: 6, assault: 10 };

/** Prefix for custom faction ids. */
export const CUSTOM_PREFIX = "custom-";
/** Safe id characters: these ids end up in data attributes and storage keys. */
const ID_RE = /^[a-z0-9][a-z0-9:_-]{0,127}$/i;

/** Sanity limits for faction data (kept generous; they stop values that would break the game). */
export const EVADE_CONDITIONS: readonly EvadeCondition[] = ["pointBlank", "ranged", "melee", "blast"];

export const LIMITS = {
  nameLength: 40,
  textLength: 400,
  profiles: 40,
  supports: 12,
  weapons: 6,
  bonuses: 6,
  upgrades: 8,
  supportAbilities: 4,
  cost: [0, 30],
  supply: [0, 10],
  models: [1, 20],
  move: [0, 24],
  hp: [1, 30],
  shield: [0, 10],
  armor: [2, 7],
  nerve: [2, 12],
  baseRadius: [0.25, 3],
  range: [1, 48],
  dice: [1, 12],
  hit: [2, 7],
  damage: [1, 10],
  ap: [0, 6],
  bonus: [0, 6],
  precision: [0, 6],
  tracking: [0, 6],
  evade: [2, 6],
  upgradeCost: [0, 20],
  addModels: [0, 10],
  upgradeMove: [-6, 12],
  fieldDeploy: [0, 24],
  fizz: [0, 10],
  cp: [0, MAX_CP],
  slots: [0, 2],
} as const;

/** Fizz budget for a mode (uses `fizzLimit` once modes.ts has it). */
export function fizzLimitOf(mode: ModeId): number {
  const m = MODES[mode] as GameModeDef & { fizzLimit?: unknown };
  return typeof m.fizzLimit === "number" ? m.fizzLimit : FALLBACK_FIZZ[mode];
}

// ---------- costs computed from the faction itself ----------

const profileIn = (f: Faction, id: string): UnitProfile | undefined => f.profiles.find((p) => p.id === id);

/** Resource cost of a list entry, using this faction's own profiles (0 for unknown profiles). */
export function entryCostIn(f: Faction, e: ListEntry): number {
  const p = profileIn(f, e.profileId);
  if (!p) return 0;
  return p.cost + e.upgrades.reduce((s, id) => s + (p.upgrades.find((u) => u.id === id)?.cost ?? 0), 0);
}

export const listCostIn = (f: Faction, list: ListEntry[]): number => list.reduce((s, e) => s + entryCostIn(f, e), 0);

export const supportsCostIn = (f: Faction, ids: string[]): number =>
  ids.reduce((s, id) => s + (f.supports.find((x) => x.id === id)?.fizz ?? 0), 0);

/** The starter roster and supports for a mode: Skirmish uses the defaults, Assault adds the extras. */
export function starterFor(f: Faction, mode: ModeId): { entries: ListEntry[]; supports: string[] } {
  return mode === "assault"
    ? { entries: [...f.defaultList, ...f.assaultExtras], supports: f.assaultStarter ? [...f.assaultStarter] : [...f.defaultSupports, ...f.assaultSupports] }
    : { entries: [...f.defaultList], supports: [...f.defaultSupports] };
}

export interface StarterStats {
  mode: GameModeDef;
  cost: number;
  units: number;
  /** Highest number of copies of one profile, and which profile. */
  maxCopies: { profileId: string; count: number } | null;
  fizz: number;
  fizzLimit: number;
  cpPerRound: number;
}

export function starterStats(f: Faction, mode: ModeId): StarterStats {
  const { entries, supports } = starterFor(f, mode);
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.profileId, (counts.get(e.profileId) ?? 0) + 1);
  let maxCopies: StarterStats["maxCopies"] = null;
  for (const [profileId, count] of counts) if (!maxCopies || count > maxCopies.count) maxCopies = { profileId, count };
  return {
    mode: MODES[mode],
    cost: listCostIn(f, entries),
    units: entries.length,
    maxCopies,
    fizz: supportsCostIn(f, supports),
    fizzLimit: fizzLimitOf(mode),
    cpPerRound: supports.reduce((s, id) => s + (f.supports.find((x) => x.id === id)?.cp ?? 0), 0),
  };
}

// ---------- validation ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isKeyword = (v: unknown): v is Keyword => KEYWORDS.includes(v as Keyword);
const isAbility = (v: unknown): boolean => isStr(v) && has(ABILITIES, v);

export interface FactionProblemOptions {
  /** Factions whose profile/support ids must not be reused. Defaults to every registered faction except this one. */
  others?: Faction[];
}

/**
 * Everything wrong with a faction, as short readable sentences. An empty list means it's safe to register
 * and play. Accepts anything (e.g. parsed JSON) and never throws.
 */
export function factionProblems(input: unknown, opts: FactionProblemOptions = {}): string[] {
  const errs: string[] = [];
  if (!isObj(input)) return ["Not a faction"];
  const f = input;

  // ----- small helpers that push readable messages -----
  const int = (where: string, field: string, v: unknown, [lo, hi]: readonly [number, number]) => {
    if (!isInt(v) || v < lo || v > hi) errs.push(`${where}: ${field} must be a whole number from ${lo} to ${hi}`);
  };
  const real = (where: string, field: string, v: unknown, [lo, hi]: readonly [number, number]) => {
    if (!isNum(v) || v < lo || v > hi) errs.push(`${where}: ${field} must be a number from ${lo} to ${hi}`);
  };
  const name = (where: string, v: unknown) => {
    if (!isStr(v) || !v.trim()) errs.push(`${where}: needs a name`);
    else if (v.length > LIMITS.nameLength) errs.push(`${where}: name is longer than ${LIMITS.nameLength} characters`);
  };
  const text = (where: string, field: string, v: unknown) => {
    if (!isStr(v)) errs.push(`${where}: ${field} must be text`);
    else if (v.length > LIMITS.textLength) errs.push(`${where}: ${field} is longer than ${LIMITS.textLength} characters`);
  };
  const id = (where: string, v: unknown): v is string => {
    if (!isStr(v) || !v) {
      errs.push(`${where}: missing id`);
      return false;
    }
    if (!ID_RE.test(v)) {
      errs.push(`${where}: id "${v}" may only use letters, numbers, ":", "_" and "-"`);
      return false;
    }
    return true;
  };
  const array = (where: string, field: string, v: unknown, max?: number): v is unknown[] => {
    if (!Array.isArray(v)) {
      errs.push(`${where}: ${field} must be a list`);
      return false;
    }
    if (max !== undefined && v.length > max) errs.push(`${where}: at most ${max} ${field}`);
    return true;
  };
  const keywords = (where: string, v: unknown) => {
    if (!array(where, "keywords", v)) return;
    for (const k of v) if (!isKeyword(k)) errs.push(`${where}: unknown keyword "${String(k)}"`);
    if (new Set(v).size !== v.length) errs.push(`${where}: a keyword is listed twice`);
  };
  /** Extra army slots by unit class (optional): known classes, whole numbers in LIMITS.slots. */
  const slotProblems = (where: string, v: unknown) => {
    if (v === undefined) return;
    if (!isObj(v)) return void errs.push(`${where}: army slots must be a set of numbers by unit class`);
    for (const [k, n] of Object.entries(v)) {
      if (!(UNIT_CLASSES as readonly string[]).includes(k)) errs.push(`${where}: unknown unit class "${k}" in army slots`);
      else if (n !== undefined) int(where, `${CLASS_INFO[k as UnitClass].name} slots`, n, LIMITS.slots);
    }
  };
  const abilities = (where: string, v: unknown) => {
    if (!array(where, "abilities", v)) return;
    for (const a of v) if (!isAbility(a)) errs.push(`${where}: unknown ability "${String(a)}"`);
    if (new Set(v).size !== v.length) errs.push(`${where}: an ability is listed twice`);
  };

  // ----- faction -----
  const fid = f.id;
  const fidOk = id("Faction", fid);
  const builtIn = fidOk && (BUILT_IN_FACTION_IDS as readonly string[]).includes(fid);
  if (fidOk && !builtIn && !fid.startsWith(CUSTOM_PREFIX)) errs.push(`Faction: custom faction ids must start with "${CUSTOM_PREFIX}"`);
  if (fidOk && fid.includes(":")) errs.push(`Faction: the id can't contain ":"`);
  if (builtIn && f.custom === true) errs.push(`Faction: "${fid}" is a built-in faction id`);
  name("Faction", f.name);
  text("Faction", "blurb", f.blurb);
  if (!isInt(f.color) || f.color < 0 || f.color > 0xffffff) errs.push("Faction: colour must be an RGB number (0 to 0xffffff)");
  if (!LOOKS.includes(f.look as (typeof LOOKS)[number])) errs.push(`Faction: token look must be one of ${LOOKS.join(", ")}`);
  slotProblems("Faction", f.slots);

  const others = (opts.others ?? Object.values(FACTIONS)).filter((o) => o.id !== fid);
  const takenProfiles = new Map<string, string>();
  const takenSupports = new Map<string, string>();
  for (const o of others) {
    for (const p of o.profiles) takenProfiles.set(p.id, o.name);
    for (const s of o.supports) takenSupports.set(s.id, o.name);
  }
  const prefix = fidOk && !builtIn ? `${fid}:` : null;

  // ----- profiles -----
  const profiles: Obj[] = [];
  if (array("Faction", "unit profiles", f.profiles, LIMITS.profiles)) {
    if (!f.profiles.length) errs.push("Faction: add at least one unit");
    const seen = new Set<string>();
    f.profiles.forEach((raw, i) => {
      if (!isObj(raw)) return errs.push(`Unit #${i + 1}: not a unit profile`);
      profiles.push(raw);
      const where = isStr(raw.name) && raw.name.trim() ? raw.name : `Unit #${i + 1}`;
      if (id(where, raw.id)) {
        if (seen.has(raw.id)) errs.push(`${where}: duplicate id "${raw.id}"`);
        seen.add(raw.id);
        const clash = takenProfiles.get(raw.id);
        if (clash) errs.push(`${where}: id "${raw.id}" is already used by ${clash}`);
        if (prefix && !raw.id.startsWith(prefix)) errs.push(`${where}: id must start with "${prefix}"`);
      }
      profileProblems(raw, where);
      errs.push(...artProblems(raw.art, where));
    });
    errs.push(...factionArtProblems(f.profiles));
  }

  function weaponProblems(w: unknown, where: string) {
    if (!isObj(w)) return errs.push(`${where}: not a weapon`);
    name(where, w.name);
    if (typeof w.melee !== "boolean") errs.push(`${where}: must be melee or ranged`);
    if (w.melee === false) real(where, "range", w.range, LIMITS.range);
    else if (!isNum(w.range) || w.range < 0) errs.push(`${where}: range must be a number`);
    int(where, "dice", w.dice, LIMITS.dice);
    int(where, "hit", w.hit, LIMITS.hit);
    int(where, "damage", w.damage, LIMITS.damage);
    int(where, "AP", w.ap, LIMITS.ap);
    if (!TARGETS.includes(w.targets as (typeof TARGETS)[number])) errs.push(`${where}: targets must be ground, air or all`);
    if (w.precision !== undefined) int(where, "precision", w.precision, LIMITS.precision);
    if (w.tracking !== undefined) int(where, "tracking", w.tracking, LIMITS.tracking);
    if (w.traits !== undefined && array(where, "traits", w.traits)) {
      for (const t of w.traits) if (!TRAITS.includes(t as WeaponTrait)) errs.push(`${where}: unknown trait "${String(t)}"`);
      if (new Set(w.traits).size !== w.traits.length) errs.push(`${where}: a trait is listed twice`);
    }
    if (w.bonuses !== undefined && array(where, "bonuses", w.bonuses, LIMITS.bonuses)) {
      for (const b of w.bonuses) {
        if (!isObj(b)) {
          errs.push(`${where}: a bonus isn't valid`);
          continue;
        }
        const bw = `${where} bonus vs ${String(b.vs)}`;
        if (!isKeyword(b.vs)) errs.push(`${where}: bonus against unknown keyword "${String(b.vs)}"`);
        for (const k of ["dice", "damage", "ap"] as const) if (b[k] !== undefined) int(bw, k, b[k], LIMITS.bonus);
        if (!b.dice && !b.damage && !b.ap) errs.push(`${bw}: the bonus does nothing`);
      }
    }
  }

  function profileProblems(p: Obj, where: string) {
    name(where, p.name);
    if (fidOk && p.faction !== fid) errs.push(`${where}: belongs to faction "${String(p.faction)}", not "${fid}"`);
    text(where, "blurb", p.blurb);
    int(where, "cost", p.cost, LIMITS.cost);
    int(where, "supply", p.supply, LIMITS.supply);
    int(where, "models", p.models, LIMITS.models);
    real(where, "move", p.move, LIMITS.move);
    int(where, "HP", p.hp, LIMITS.hp);
    int(where, "shield", p.shield, LIMITS.shield);
    int(where, "armour save", p.armor, LIMITS.armor);
    real(where, "base radius", p.baseRadius, LIMITS.baseRadius);
    if (p.nerve !== undefined) int(where, "nerve", p.nerve, LIMITS.nerve);
    keywords(where, p.keywords);
    abilities(where, p.abilities);
    const kws = Array.isArray(p.keywords) ? p.keywords : [];
    const weapons = array(where, "weapons", p.weapons, LIMITS.weapons) ? p.weapons : [];
    weapons.forEach((w, i) => weaponProblems(w, `${where}, weapon ${isObj(w) && isStr(w.name) && w.name ? `"${w.name}"` : `#${i + 1}`}`));

    // structures
    const isStructure = kws.includes("structure");
    const s = p.structure;
    if (s !== undefined) {
      if (!isObj(s)) errs.push(`${where}: the structure settings aren't valid`);
      else {
        if (!LIFETIMES.includes(s.lifetime as (typeof LIFETIMES)[number])) errs.push(`${where}: structure lifetime must be permanent or round`);
        if (s.summonOnly !== undefined && typeof s.summonOnly !== "boolean") errs.push(`${where}: summon-only must be yes or no`);
        if (s.fieldDeploy !== undefined) real(where, "field deploy range", s.fieldDeploy, LIMITS.fieldDeploy);
        if (s.summonOnly === true && s.fieldDeploy) errs.push(`${where}: summon-only structures are never deployed, so field deploy does nothing`);
        if (s.lifetime === "round" && s.summonOnly !== true) errs.push(`${where}: structures that vanish at the end of the round must be summon-only`);
      }
      if (!isStructure) errs.push(`${where}: structures need the "structure" keyword`);
      if (p.move !== 0) errs.push(`${where}: structures can't move (set move to 0)`);
      if (kws.includes("flying") || kws.includes("jump")) errs.push(`${where}: structures can't be flying or jump`);
    } else {
      if (isStructure) errs.push(`${where}: has the "structure" keyword but no structure settings`);
      else if (isNum(p.move) && p.move <= 0) errs.push(`${where}: can't move. Give it some move or make it a structure`);
    }
    const summonOnly = isObj(s) && s.summonOnly === true;

    // evade: only small, agile units can dodge (data/agility.ts)
    if (p.evade !== undefined) {
      const ev = p.evade;
      if (!isObj(ev)) errs.push(`${where}: the evade settings aren't valid`);
      else {
        const body = { structure: p.structure as UnitProfile["structure"], keywords: Array.isArray(p.keywords) ? (p.keywords as UnitProfile["keywords"]) : [], baseRadius: Number(p.baseRadius), move: Number(p.move) };
        const why = evadeProblem(body);
        if (why) errs.push(`${where}: can't have an evade (${why})`);
        int(where, "evade", ev.target, LIMITS.evade);
        if (array(where, "evade conditions", ev.against)) {
          if (!ev.against.length) errs.push(`${where}: evade needs at least one situation it applies in`);
          for (const c of ev.against) if (!EVADE_CONDITIONS.includes(c as EvadeCondition)) errs.push(`${where}: unknown evade situation "${String(c)}"`);
          if (new Set(ev.against).size !== ev.against.length) errs.push(`${where}: an evade situation is listed twice`);
        }
      }
    }

    // burrow: something has to dig, and it has to be able to walk out again
    const abilityList = Array.isArray(p.abilities) ? p.abilities : [];
    const upgradeAbilities = Array.isArray(p.upgrades) ? p.upgrades.flatMap((u) => (isObj(u) && Array.isArray(u.addAbilities) ? u.addAbilities : [])) : [];
    if ([...abilityList, ...upgradeAbilities].includes("burrow")) {
      if (isObj(s)) errs.push(`${where}: structures can't burrow`);
      if (Array.isArray(p.keywords) && p.keywords.includes("flying")) errs.push(`${where}: flyers can't burrow`);
    }

    // impact on charge
    if (p.impact !== undefined) {
      const im = p.impact;
      if (!isObj(im)) errs.push(`${where}: the impact settings aren't valid`);
      else {
        int(where, "impact dice", im.dice, LIMITS.dice);
        int(where, "impact hit", im.hit, [2, 6]);
        int(where, "impact damage", im.damage, LIMITS.damage);
        int(where, "impact AP", im.ap, LIMITS.ap);
      }
      if (s !== undefined) errs.push(`${where}: structures can't charge, so impact does nothing`);
    }

    // upgrades
    if (!array(where, "upgrades", p.upgrades, LIMITS.upgrades)) return;
    if (summonOnly && p.upgrades.length) errs.push(`${where}: summon-only structures are never bought, so they can't have upgrades`);
    const seen = new Set<string>();
    p.upgrades.forEach((u, i) => {
      if (!isObj(u)) return errs.push(`${where}: upgrade #${i + 1} isn't valid`);
      const uw = `${where}, upgrade ${isStr(u.name) && u.name ? `"${u.name}"` : `#${i + 1}`}`;
      if (id(uw, u.id)) {
        if (seen.has(u.id)) errs.push(`${uw}: duplicate id "${u.id}"`);
        seen.add(u.id);
      }
      name(uw, u.name);
      text(uw, "text", u.text);
      int(uw, "cost", u.cost, LIMITS.upgradeCost);
      if (u.addModels !== undefined) int(uw, "extra models", u.addModels, LIMITS.addModels);
      if (u.move !== undefined) {
        real(uw, "move change", u.move, LIMITS.upgradeMove);
        if (isNum(u.move) && isNum(p.move) && p.move + u.move < 0) errs.push(`${uw}: would leave negative move`);
        if (isNum(u.move) && u.move !== 0 && s !== undefined) errs.push(`${uw}: structures can't gain move`);
      }
      if (u.addKeywords !== undefined) {
        keywords(uw, u.addKeywords);
        if (Array.isArray(u.addKeywords)) {
          if (u.addKeywords.includes("structure")) errs.push(`${uw}: can't add the "structure" keyword`);
          if (s !== undefined && (u.addKeywords.includes("flying") || u.addKeywords.includes("jump")))
            errs.push(`${uw}: structures can't be flying or jump`);
        }
      }
      if (u.addAbilities !== undefined) abilities(uw, u.addAbilities);
      if (isNum(p.models) && isInt(u.addModels) && p.models + u.addModels > LIMITS.models[1])
        errs.push(`${uw}: more than ${LIMITS.models[1]} models`);
      if (u.weapon !== undefined) {
        const wp = u.weapon;
        if (!isObj(wp) || !isObj(wp.patch)) errs.push(`${uw}: the weapon change isn't valid`);
        else if (!isInt(wp.index) || !isObj(weapons[wp.index])) errs.push(`${uw}: changes a weapon that doesn't exist`);
        else {
          const unknown = Object.keys(wp.patch).filter((k) => !["name", "melee", "range", "dice", "hit", "damage", "ap", "targets", "bonuses", "traits", "precision", "tracking"].includes(k));
          if (unknown.length) errs.push(`${uw}: unknown weapon fields ${unknown.join(", ")}`);
          weaponProblems({ ...(weapons[wp.index] as Obj), ...wp.patch }, `${uw} (changed weapon)`);
        }
      }
    });
  }

  // ----- supports -----
  const supports: Obj[] = [];
  if (array("Faction", "supports", f.supports, LIMITS.supports)) {
    const seen = new Set<string>();
    f.supports.forEach((raw, i) => {
      if (!isObj(raw)) return errs.push(`Support #${i + 1}: not a support`);
      supports.push(raw);
      const where = isStr(raw.name) && raw.name.trim() ? raw.name : `Support #${i + 1}`;
      if (id(where, raw.id)) {
        if (seen.has(raw.id)) errs.push(`${where}: duplicate id "${raw.id}"`);
        seen.add(raw.id);
        const clash = takenSupports.get(raw.id);
        if (clash) errs.push(`${where}: id "${raw.id}" is already used by ${clash}`);
        if (prefix && !raw.id.startsWith(prefix)) errs.push(`${where}: id must start with "${prefix}"`);
      }
      name(where, raw.name);
      if (fidOk && raw.faction !== fid) errs.push(`${where}: belongs to faction "${String(raw.faction)}", not "${fid}"`);
      text(where, "blurb", raw.blurb);
      int(where, "Fizz cost", raw.fizz, LIMITS.fizz);
      int(where, "CP per round", raw.cp, LIMITS.cp);
      slotProblems(where, raw.slots);
      if (!array(where, "abilities", raw.abilities, LIMITS.supportAbilities)) return;
      if (!raw.abilities.length) errs.push(`${where}: add at least one ability`);
      const seenA = new Set<string>();
      raw.abilities.forEach((a, j) => {
        if (!isObj(a)) return errs.push(`${where}: ability #${j + 1} isn't valid`);
        const aw = `${where}, ${isStr(a.name) && a.name ? `"${a.name}"` : `ability #${j + 1}`}`;
        if (id(aw, a.id)) {
          if (seenA.has(a.id)) errs.push(`${aw}: duplicate id "${a.id}"`);
          seenA.add(a.id);
        }
        name(aw, a.name);
        text(aw, "text", a.text);
        int(aw, "CP cost", a.cp, LIMITS.cp);
        if (typeof a.exhaust !== "boolean") errs.push(`${aw}: exhaust must be yes or no`);
        if (!TIMINGS.includes(a.timing as (typeof TIMINGS)[number])) errs.push(`${aw}: timing must be ${TIMINGS.join(", ")}`);
        effectProblems(a.effect, aw);
      });
    });
  }

  function effectProblems(e: unknown, where: string) {
    if (!isObj(e) || !EFFECT_KINDS.includes(e.kind as (typeof EFFECT_KINDS)[number])) return errs.push(`${where}: unknown effect`);
    switch (e.kind) {
      case "resources":
        return int(where, "resources", e.amount, [1, 10]);
      case "heal":
        int(where, "heal amount", e.amount, [1, 10]);
        if (e.revive !== undefined && typeof e.revive !== "boolean") errs.push(`${where}: revive must be yes or no`);
        return;
      case "blast":
        real(where, "blast radius", e.radius, [0.5, 6]);
        int(where, "blast hit", e.hit, [2, 6]);
        int(where, "blast damage", e.damage, LIMITS.damage);
        int(where, "blast AP", e.ap, LIMITS.ap);
        real(where, "blast range", e.range, LIMITS.range);
        if (typeof e.needsSight !== "boolean") errs.push(`${where}: "needs sight" must be yes or no`);
        return;
      case "summon": {
        real(where, "summon range", e.range, LIMITS.range);
        real(where, "distance from enemies", e.minEnemyDistance, [0, 24]);
        if (e.fromRound !== undefined) int(where, "first round", e.fromRound, [1, 10]);
        const target = profiles.find((p) => p.id === e.profileId);
        if (!isStr(e.profileId) || !e.profileId) errs.push(`${where}: pick a structure to summon`);
        else if (!target) errs.push(`${where}: summons "${e.profileId}", which isn't a unit in this faction`);
        else if (!isObj(target.structure) || target.structure.summonOnly !== true)
          errs.push(`${where}: can only summon summon-only structures, and ${String(target.name)} isn't one`);
        return;
      }
      case "meleeBuff":
      case "rangedBuff":
        return int(where, "extra dice", e.dice, [1, 4]);
      case "slow":
        return real(where, "slow range", e.range, LIMITS.range);
      case "airdrop":
        if (e.anywhere !== undefined && typeof e.anywhere !== "boolean") errs.push(`${where}: "anywhere on the table" must be yes or no`);
        // Landing anywhere ignores the range, so 0 is fine there.
        real(where, "drop range", e.range, e.anywhere === true ? [0, LIMITS.range[1]] : LIMITS.range);
        if (e.fromRound !== undefined) int(where, "first round", e.fromRound, [1, 10]);
        if (e.arrivalShield !== undefined) int(where, "arrival shield", e.arrivalShield, [0, 3]);
        return real(where, "distance from enemies", e.minEnemyDistance, [0, 24]);
      case "rattle":
        real(where, "rattle range", e.range, LIMITS.range);
        return int(where, "nerve penalty", e.penalty, [0, 6]);
      case "retaliate":
        int(where, "retaliate hit", e.hit, [2, 6]);
        return int(where, "retaliate damage", e.damage, LIMITS.damage);
      case "aimBuff":
        int(where, "precision", e.precision, [0, 3]);
        int(where, "tracking", e.tracking, [0, 3]);
        if (e.precision === 0 && e.tracking === 0) errs.push(`${where}: an aim buff needs some precision or tracking`);
        return;
      case "regrow":
        return int(where, "models regrown", e.models, [1, 6]);
      case "dugIn":
        return int(where, "save bonus", e.save, [1, 2]);
      case "teleport":
        return real(where, "teleport range", e.range, [1, 24]);
      case "spot":
      case "blind":
      case "silence":
      case "expose":
        return real(where, `${e.kind} range`, e.range, LIMITS.range);
      case "smoke":
        return real(where, "smoke range", e.range, [1, 24]);
      case "resonate":
        return real(where, "resonance range", e.range, [0, 24]);
      case "haste":
        return int(where, "extra move", e.move, [1, 6]);
      case "overshield":
        return int(where, "shield per model", e.amount, [1, 3]);
      case "armourBuff":
        return int(where, "save bonus", e.save, [1, 2]);
      case "armourBreak":
        int(where, "save penalty", e.save, [1, 2]);
        return real(where, "armour break range", e.range, LIMITS.range);
      case "evadeBuff":
        int(where, "evade bonus", e.amount, [1, 2]);
        return int(where, "granted evade", e.grant, [3, 6]);
      case "evadeDebuff":
        int(where, "evade penalty", e.amount, [1, 2]);
        return real(where, "evade penalty range", e.range, LIMITS.range);
      case "damageBuff":
        return int(where, "extra damage", e.amount, [1, 2]);
      case "weaken":
        int(where, "fewer dice", e.dice, [1, 2]);
        return real(where, "weaken range", e.range, LIMITS.range);
      default:
        return; // recharge, overwatch, ward, brace: no parameters
    }
  }

  // ----- starter lists -----
  const listOk = (field: string, label: string): ListEntry[] | null => {
    const v = f[field];
    if (!array("Starter lists", label, v)) return null;
    let ok = true;
    for (const e of v) {
      if (!isObj(e) || !isStr(e.profileId) || !Array.isArray(e.upgrades)) {
        errs.push(`${label}: an entry isn't valid`);
        ok = false;
        continue;
      }
      const p = profiles.find((x) => x.id === e.profileId);
      if (!p) {
        errs.push(`${label}: unknown unit "${e.profileId}"`);
        ok = false;
        continue;
      }
      const pname = String(p.name);
      if (isObj(p.structure) && p.structure.summonOnly === true) errs.push(`${label}: ${pname} is summon-only and can't be in a list`);
      const ups = Array.isArray(p.upgrades) ? p.upgrades : [];
      for (const u of e.upgrades) {
        if (!ups.some((x) => isObj(x) && x.id === u)) {
          errs.push(`${label}: ${pname} has no upgrade "${String(u)}"`);
          ok = false;
        }
      }
      if (new Set(e.upgrades).size !== e.upgrades.length) errs.push(`${label}: ${pname} lists an upgrade twice`);
    }
    return ok ? (v as ListEntry[]) : null;
  };
  const supportListOk = (field: string, label: string): string[] | null => {
    const v = f[field];
    if (!array("Starter lists", label, v)) return null;
    let ok = true;
    for (const sid of v) {
      if (!supports.some((s) => s.id === sid)) {
        errs.push(`${label}: unknown support "${String(sid)}"`);
        ok = false;
      }
    }
    return ok ? (v as string[]) : null;
  };
  const skirmishUnits = listOk("defaultList", "Skirmish starter list");
  const assaultUnits = listOk("assaultExtras", "Assault extras");
  const skirmishSupports = supportListOk("defaultSupports", "Skirmish starter supports");
  const assaultSupports = supportListOk("assaultSupports", "Assault extra supports");
  if (skirmishUnits && !skirmishUnits.length) errs.push("Skirmish starter list: add at least one unit");

  // Mode limits need well-formed numbers, so only check them when everything they rely on is valid.
  const costsValid = profiles.every(
    (p) => isInt(p.cost) && Array.isArray(p.upgrades) && p.upgrades.every((u) => isObj(u) && isInt(u.cost)),
  );
  if (skirmishUnits && assaultUnits && costsValid) {
    const shape = { profiles, supports } as unknown as Faction;
    for (const mode of Object.keys(MODES) as ModeId[]) {
      const m = MODES[mode];
      const entries = mode === "assault" ? [...skirmishUnits, ...assaultUnits] : skirmishUnits;
      const label = `${m.name} starter list`;
      const cost = listCostIn(shape, entries);
      if (cost > m.rosterLimit) errs.push(`${label}: costs ⚙${cost}, over the limit of ${m.rosterLimit}`);
      if (entries.length > m.maxUnits) errs.push(`${label}: ${entries.length} units, over the limit of ${m.maxUnits}`);
      const counts = new Map<string, number>();
      for (const e of entries) counts.set(e.profileId, (counts.get(e.profileId) ?? 0) + 1);
      for (const [pid, n] of counts)
        if (n > m.maxCopies) errs.push(`${label}: ${n} × ${String(profiles.find((p) => p.id === pid)?.name)}, over the limit of ${m.maxCopies}`);
    }
  }
  if (skirmishSupports && assaultSupports && supports.every((s) => isInt(s.fizz))) {
    const shape = { profiles, supports } as unknown as Faction;
    for (const mode of Object.keys(MODES) as ModeId[]) {
      const ids = mode === "assault" ? [...skirmishSupports, ...assaultSupports] : skirmishSupports;
      const label = `${MODES[mode].name} starter supports`;
      if (new Set(ids).size !== ids.length) errs.push(`${label}: a support is listed twice`);
      const fizz = supportsCostIn(shape, ids);
      const limit = fizzLimitOf(mode);
      if (fizz > limit) errs.push(`${label}: cost ✦${fizz} Fizz, over the limit of ${limit}`);
    }
  }

  return errs;
}

/** True if this is a well-formed faction that can be registered with the engine. */
export const isValidFaction = (f: unknown, opts?: FactionProblemOptions): f is Faction => factionProblems(f, opts).length === 0;
