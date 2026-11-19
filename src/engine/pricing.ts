// Points pricing: a unit's resource cost (⚙), supply (◆), upgrade costs and a support card's Fizz (✦),
// computed from its stats, weapons, keywords, abilities and effects. Pure: no DOM, no registry.
//
// The faction forge prices custom factions with this so players can't type in cheap costs. The weights
// were fitted to the hand-set costs of the built-in factions (which are balance-tuned with AI-vs-AI
// sims); tests/pricing.test.ts reports the fit. Built-in factions keep their own hand-set costs.
//
// The model, in short:
//   cost = base + body + guns + move + abilities, rounded (at least 1)
//   body      ~ effective wounds (HP and shields through saves, evade, nerve), on a shrinking curve
//   guns      ~ expected damage of the best ranged and melee weapon (and impact) against a spread of
//               reference targets, scaled by range (ranged) or by how well it reaches a fight (melee)
//   move      ~ speed, flying, jump; structures pay a penalty (they can't move or hold objectives)
//   abilities ~ the ABILITY_PRICES table below, active abilities discounted for CP and uses per game
//   supply    ~ structures 1, squads 2 (3 at 6+ models), single models from their cost (1 to 4)
//   upgrade   ~ cost(with upgrade) - cost(without), at least 1 when it helps
//   Fizz      ~ CP per round plus the value of each ability's effect, discounted for its CP cost

import { addDerivedAbilities } from "./derived";
import { BLAST_SQUAD } from "./constants";
import { ABILITIES } from "./data/abilities";
import { supportSlots, UNIT_CLASSES } from "./data/unitClasses";
import type {
  AbilityId,
  EvadeCondition,
  Keyword,
  SupportAbilityDef,
  SupportDef,
  SupportEffect,
  UnitProfile,
  UpgradeDef,
  Weapon,
} from "./types";

// ---------- fitted weights ----------

/** Global weights, fitted to the built-in factions (see tests/pricing.test.ts). */
export const PRICE_WEIGHTS = {
  base: 0.11,
  /** body = body * effectiveWounds ^ bodyExp */
  body: 0.154,
  bodyExp: 0.9,
  /** A point of shield is worth this many HP (it recharges every round). */
  shield: 2.06,
  /** The AP an average incoming attack has (armoured units take one less). */
  refAp: 0.3,
  /** Body multiplier per point of nerve above 7 (fearless counts as 10). */
  nerve: 0.072,
  flyingBody: 1.5,
  structureBody: 1.3,
  /** Big squads (BLAST_SQUAD+ models) count this share of their models for body (never fewer than BLAST_SQUAD - 1). */
  bigSquad: 0.95,
  /** guns = guns * damage ^ gunsExp */
  guns: 0.49,
  gunsExp: 0.84,
  /** Ranged weapons scale with (range / 18) ^ rangeExp. */
  rangeExp: 0.52,
  melee: 0.5,
  impact: 0.5,
  /** Each weapon after a unit's best ranged and best melee one adds this share of its value. */
  extraWeapon: 0.5,
  /** Per inch of move above 6. */
  move: 0.05,
  flying: 0.86,
  jump: 0.93,
  structure: -0.26,
  /** Scales the whole ability table. */
  abilities: 1,
  /** Single-model supply = cost - this (1 to 4). */
  supplyOffset: 2,
};

/** Fizz weights for support cards. */
export const FIZZ_WEIGHTS = {
  base: 0.6,
  /** Per CP the card adds to the pool every round. */
  cpPerRound: 0.45,
  /** Effects are worth less the more CP they cost: value * 3 / (cp + 2). */
  cpCurve: 2,
  /** Abilities that don't exhaust the card can be played again the same round. */
  noExhaust: 1.8,
  /** A second (third...) ability on the same card adds this share of its value. */
  extraAbility: 0.6,
  /** Each army slot the card gives beyond the usual one (or short of it). */
  slot: 0.3,
};

// ---------- ability prices (fill in new abilities here) ----------

/** What the pricing knows about the unit when it prices an ability. */
export interface PriceContext {
  p: UnitProfile;
  /** ⚙ of the unit's best ranged weapon (0 if none), and the same per die per model. */
  ranged: number;
  rangedPerDie: number;
  /** ⚙ of the unit's best melee weapon, and the same per die per model. */
  melee: number;
  meleePerDie: number;
  /** ⚙ of the unit's body (wounds). */
  body: number;
}

/** A flat ⚙ value, or one worked out from the unit. */
export type AbilityPrice = number | ((c: PriceContext) => number);

/**
 * ⚙ each unit ability adds, for an always-on ability or an active one that's free and unlimited.
 * Active abilities are then discounted for their CP cost and uses per game (see `abilityValue`).
 *
 * NEW ABILITIES GO HERE. Anything missing is priced at DEFAULT_ABILITY_PRICE for its kind, and
 * tests/pricing.test.ts lists every ability without an entry.
 */
export const ABILITY_PRICES: Partial<Record<AbilityId, AbilityPrice>> = {
  // passive
  entrenched: (c) => 0.15 + 0.12 * c.body,
  regen: (c) => 0.2 + 0.05 * c.p.hp,
  regrow: (c) => (c.p.models > 1 ? Math.min(0.8, 0.045 * c.p.models) : 0.2),
  "brood-call": 0.35,
  radiance: 0.6,
  "steady-aim": (c) => 1.0 * c.rangedPerDie * c.p.models,
  steadying: 0.35,
  "mending-aura": 0.45,
  // reactive
  overwatch: (c) => 0.15 + 0.3 * c.ranged,
  "sticky-goo": 0.3,
  pop: (c) => 0.06 * c.p.models,
  refraction: (c) => 0.35 + 0.06 * c.p.models * (c.p.hp + c.p.shield),
  lurk: (c) => 0.3 + 0.1 * c.p.models,
  // active (before the CP and uses discount)
  "patch-up": 0.5,
  hatch: 0.7,
  // A lobbed gun comes with its barrage (profile.ts), so only a unit given one some other way pays for it.
  barrage: (c) => (lobs(c.p) ? 0 : 0.4 * c.ranged),
  // Barrage Shells: the 2" marker (4x the area), and the barrage itself for a unit without a lobbed gun.
  "wide-barrage": (c) => (lobs(c.p) ? 1.7 : 0.4 + 0.4 * c.ranged),
  tunnel: (c) => 1.5 + 0.6 * c.body,
  blink: 1.4,
  recall: 1.2,
  grapple: 0.9,
  "bombs-away": (c) => 0.25 * c.p.models,
  "rocket-hop": 0.48, // every round since the CP ability pass (was 0.6 at twice a game): the same ⚙, since CP is the limit
  rampage: (c) => 0.3 * c.meleePerDie * c.p.models, // saves one worse, too
  spotter: 1.1,
  "bubble-shield": 0.72, // every round (was 0.9 at twice a game): the same ⚙
  "sugar-rush": 0.35,
  provoke: 0.64, // every round (was 0.8 at twice a game): the same ⚙
  "demo-charge": 1.6,
  // structures
  "burrow-exit": 1.0,
  "ward-aura": 0.8,
  // the ability pass (v0.11): first estimates, for the balance pass to check
  "return-fire": (c) => 0.15 + 0.35 * c.ranged, // like overwatch, but only after being hit
  "crop-dust": 1.0,
  "bale-out": 0.6,
  "scrap-cover": 0.6,
  "radio-spotting": 0.3,
  // Hidden: safe from long-range fire until it attacks; worth more on a gun that sits back and shoots.
  hidden: (c) => 0.5 + 0.3 * c.ranged,
  // Keen Eyes: answers the other side's hidden and burrowed units; most games it has none to find.
  detector: 0.15,
  // Burrow: a free hiding place for the body, and an ambush; it gives up a turn going under.
  burrow: (c) => 0.2 + 0.06 * c.body,
  "eye-peck": 0.3,
  overcharge: (c) => 0.4 * c.ranged, // +1 damage for a round, paid for with shields
  spotlight: 0.9,
  riposte: (c) => 0.1 + 0.1 * c.p.models,
  pirouette: 0.5,
  "phase-out": 0.5,
  "twirl-away": 0.4,
  // the Skitterswarm: first estimates
  corrode: (c) => 0.2 + 0.25 * (c.ranged + c.melee), // every hit that lands softens the target for the rest
  "brood-bond": 1.5, // a refill for every hurt squad around her, every round
  // the CP ability pass: priced low, since every use costs CP (an exhausted card, once CP is card-bound)
  "stand-to": (c) => 0.05 + 0.1 * c.ranged, // one full-strength shot, only when charged
  "hold-the-line": 0.15, // double weight on an objective, for a turn standing still
  "smoke-shells": 0.3,
  "steel-core": (c) => 0.12 * c.ranged,
  "mad-scramble": (c) => 0.05 + 0.1 * c.melee,
  "eat-through": 0.3,
  "brood-frenzy": 0.15, // +1 melee die per model on every brood round her
  "lay-eggs": 0.15,
  "phase-shift": (c) => 0.05 + 0.08 * c.body,
  triangulate: 0.15,
  "bow-out": 0.2,
  "lend-shields": (c) => 0.05 + 0.05 * c.p.models * c.p.shield,
  // disruption: burn the enemy's best card for the round
  "snipe-runner": 0.4,
  "chew-wires": 0.4,
  "cutting-remark": 0.4,
  // dice buffs and debuffs on support units
  "rivet-plates": 0.3,
  "star-shell": 0.25,
  "slime-coat": 0.15,
  "numbing-sting": 0.3,
  "exacting-standards": 0.4,
};

/** Price of an ability the table doesn't know, by kind (unknown ids count as passive). */
export const DEFAULT_ABILITY_PRICE: Record<"passive" | "reactive" | "active", number> = {
  passive: 0.5,
  reactive: 0.5,
  active: 1,
};

/**
 * Fizz value of each support effect, before the CP discount. NEW EFFECT KINDS GO HERE: anything missing
 * is priced at DEFAULT_EFFECT_PRICE, and tests/pricing.test.ts lists every effect kind without an entry.
 * `summon` gets the summoned structure's profile when it can be found.
 */
export const EFFECT_PRICES: Partial<
  Record<SupportEffect["kind"], (e: never, summoned?: UnitProfile) => number>
> = {
  resources: (e: { amount: number }) => 0.3 * e.amount,
  heal: (e: { amount: number; revive?: boolean }) => 0.3 * e.amount + (e.revive ? 0.6 : 0),
  recharge: () => 0.9,
  blast: (e: {
    radius: number;
    hit: number;
    damage: number;
    ap: number;
    range: number;
    needsSight: boolean;
  }) =>
    pAtLeast(e.hit) *
    Math.min(e.damage, 3) *
    (0.7 + 0.15 * e.ap) *
    (1 + e.radius) *
    Math.sqrt(e.range / 18) *
    (e.needsSight ? 1 : 1.2) *
    0.9,
  summon: (e: { range: number; fromRound?: number }, summoned?: UnitProfile) =>
    (summoned
      ? 0.6 * rawUnitValue(summoned).total * (summoned.structure?.lifetime === "round" ? 0.6 : 1)
      : 1) +
    0.02 * e.range -
    0.15 * Math.max(0, (e.fromRound ?? 1) - 1),
  meleeBuff: (e: { dice: number }) => 1.2 * e.dice,
  rangedBuff: (e: { dice: number }) => 1.0 * e.dice,
  slow: (e: { range: number }) => 0.4 + 0.01 * e.range,
  airdrop: (e: {
    range: number;
    minEnemyDistance: number;
    anywhere?: boolean;
    fromRound?: number;
    arrivalShield?: number;
  }) =>
    (e.anywhere ? 2.4 : 2.2 + 0.04 * Math.min(e.range, 24)) -
    0.03 * e.minEnemyDistance -
    0.15 * Math.max(0, (e.fromRound ?? 1) - 1) +
    0.3 * (e.arrivalShield ?? 0),
  rattle: (e: { range: number; penalty: number }) => 0.4 + 0.02 * e.range + 0.15 * e.penalty,
  aimBuff: (e: { precision: number; tracking: number }) => 0.4 * (e.precision + e.tracking),
  regrow: (e: { models: number }) => 0.6 * e.models,
  dugIn: (e: { save: number }) => 0.8 * e.save,
  teleport: (e: { range: number }) => 0.25 * e.range + 0.8,
  ward: () => 0.8,
  brace: () => 0.6,
  retaliate: (e: { hit: number; damage: number }) => 0.7 * pAtLeast(e.hit) * e.damage + 0.25,
  // the ability pass (v0.11): first estimates, for the balance pass to check
  spot: (e: { range: number }) => 0.6 + 0.01 * e.range,
  smoke: () => 0.7,
  overwatch: () => 0.8,
  haste: (e: { move: number }) => 0.3 * e.move,
  blind: (e: { range: number }) => 0.5 + 0.01 * e.range,
  resonate: () => 0.6,
  expose: (e: { range: number }) => 0.6 + 0.01 * e.range,
  silence: (e: { range: number }) => 0.8 + 0.01 * e.range,
  overshield: (e: { amount: number }) => 0.6 * e.amount,
  // dice buffs and debuffs (the CP ability pass): first estimates
  armourBuff: (e: { save: number }) => 0.9 * e.save, // like digging in, but against blows too
  armourBreak: (e: { save: number; range: number }) => 0.8 * e.save + 0.01 * e.range,
  evadeBuff: (e: { amount: number; grant: number }) => 0.4 * e.amount + 0.1 * (7 - e.grant),
  evadeDebuff: (e: { amount: number; range: number }) => 0.4 * e.amount + 0.01 * e.range,
  damageBuff: (e: { amount: number }) => 1.0 * e.amount,
  weaken: (e: { dice: number; range: number }) => 0.8 * e.dice + 0.01 * e.range,
};

export const DEFAULT_EFFECT_PRICE = 0.8;

// ---------- dice helpers ----------

/** Chance a d6 rolls `n` or more. */
const pAtLeast = (n: number): number => Math.max(0, Math.min(1, (7 - n) / 6));
/** Chance a save on `armor`+ fails against `ap`. */
const saveFails = (armor: number, ap: number): number =>
  armor >= 7 ? 1 : Math.max(0, Math.min(1, (armor + ap - 1) / 6));
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const r1 = (n: number): number => Math.round(n * 10) / 10;

// ---------- reference targets ----------

interface RefTarget {
  models: number;
  hp: number;
  shield: number;
  armor: number;
  keywords: Keyword[];
  evade?: { target: number; against: EvadeCondition[] };
  weight: number;
}

/** A spread of generic enemies a weapon is priced against: a swarm, a line squad, elites, a walker, a monster, a flyer. */
const TARGETS: RefTarget[] = [
  {
    models: 9,
    hp: 1,
    shield: 0,
    armor: 6,
    keywords: ["infantry", "light", "beast"],
    evade: { target: 5, against: ["pointBlank", "blast"] },
    weight: 1,
  },
  { models: 7, hp: 1, shield: 0, armor: 5, keywords: ["infantry", "light"], weight: 1 },
  { models: 3, hp: 1, shield: 1, armor: 4, keywords: ["infantry", "armoured"], weight: 1 },
  { models: 1, hp: 8, shield: 0, armor: 3, keywords: ["armoured", "heavy", "mech"], weight: 0.8 },
  {
    models: 1,
    hp: 12,
    shield: 0,
    armor: 4,
    keywords: ["armoured", "heavy", "beast", "monster"],
    weight: 0.6,
  },
  {
    models: 1,
    hp: 4,
    shield: 1,
    armor: 5,
    keywords: ["flying", "light", "mech"],
    evade: { target: 6, against: ["ranged"] },
    weight: 0.6,
  },
];
const TARGET_WEIGHT = TARGETS.reduce((s, t) => s + t.weight, 0);

/** How often each situation comes up for an evade roll. */
const EVADE_SHARE: Record<EvadeCondition, number> = {
  pointBlank: 0.12,
  ranged: 0.55,
  melee: 0.3,
  blast: 0.15,
};

/** Expected damage per round of one weapon fired by `models` models, averaged over the reference targets. */
export function weaponDamage(
  w: Weapon,
  models: number,
  opts: { structure?: boolean; flying?: boolean } = {},
): number {
  const traits = new Set(w.traits ?? []);
  const melee = !!w.melee;
  const antiArmour = (w.bonuses ?? []).some((b) => b.vs === "armoured");
  let total = 0;
  for (const t of TARGETS) {
    const flyer = t.keywords.includes("flying");
    // Melee from ground units never reaches flyers; otherwise the weapon's targets decide.
    const reach = melee
      ? !flyer || (!!opts.flying && w.targets !== "ground")
      : w.targets === "all" || (w.targets === "air") === flyer;
    if (!reach) continue;
    const bonus = (w.bonuses ?? []).filter((b) => t.keywords.includes(b.vs));
    const plusDice = bonus.reduce((s, b) => s + num(b.dice), 0);
    const plusDamage = bonus.reduce((s, b) => s + num(b.damage), 0);
    const plusAp = bonus.reduce((s, b) => s + num(b.ap), 0);
    let ap = num(w.ap) + plusAp;
    if (t.keywords.includes("armoured") && !antiArmour) ap = Math.max(0, ap - 1);
    const perHit = Math.min(num(w.damage, 1) + plusDamage, t.hp + t.shield);
    const hit = num(w.hit, 4);
    let pHit = traits.has("torrent") ? 1 : pAtLeast(hit);
    if (traits.has("heavy") && !opts.structure) pHit = (pHit + pAtLeast(hit + 1)) / 2; // moved about half the time
    let hits: number;
    let rolled = 0; // dice rolled to hit (for rending)
    if (traits.has("indirect")) {
      // One shell per model; it lands on target on a hit roll, then every model under the burst is rolled for.
      const under = Math.min(t.models, 4);
      hits = models * (pHit + (1 - pHit) * 0.25) * under * pHit * 2; // no sight needed, no cover
    } else {
      const dice =
        models * (num(w.dice, 1) + plusDice + (traits.has("blast") && t.models >= 7 ? 1 : 0));
      rolled = dice;
      hits = dice * pHit + Math.min(num(w.precision), dice * (1 - pHit));
    }
    // Evade: the target dodges hits in the situations its evade covers; tracking cancels some.
    let evadeShare = 0;
    if (t.evade) {
      const cover = (c: EvadeCondition) => (t.evade!.against.includes(c) ? EVADE_SHARE[c] : 0);
      evadeShare = melee
        ? cover("melee")
        : traits.has("indirect") || traits.has("blast")
          ? cover("blast") + cover("ranged")
          : cover("ranged") + (traits.has("pistol") ? 0 : cover("pointBlank"));
      evadeShare = Math.min(1, evadeShare) * pAtLeast(t.evade.target);
    }
    const evaded = Math.max(0, hits * evadeShare - num(w.tracking));
    const through = hits - evaded;
    // Rending: natural 6s get +1 AP. That is a sixth of the dice rolled, however many hits there are.
    const rendShare =
      traits.has("rending") && !traits.has("torrent") && hits > 0
        ? Math.min(1, (rolled * pAtLeast(6)) / hits)
        : 0;
    const fail = (1 - rendShare) * saveFails(t.armor, ap) + rendShare * saveFails(t.armor, ap + 1);
    total += t.weight * through * fail * perHit;
  }
  let dmg = total / TARGET_WEIGHT;
  if (traits.has("pistol") && !melee) dmg *= 1.1; // also fires point-blank in a melee
  if (!melee && !traits.has("indirect")) dmg *= 1 + 0.05 * Math.min(num(w.precision), 2); // shoots into a melee safely
  return dmg;
}

// ---------- unit pricing ----------

export interface UnitParts {
  base: number;
  body: number;
  guns: number;
  move: number;
  abilities: number;
  /** Sum of the parts, before rounding. */
  total: number;
  /** Context the ability prices used. */
  ctx: PriceContext;
}

const isStructure = (p: UnitProfile): boolean =>
  !!p.structure || (p.keywords ?? []).includes("structure");

/** The unpriced parts of a unit (fractional ⚙). Works for any profile, including summon-only structures. */
export function rawUnitValue(p: UnitProfile): UnitParts {
  const W = PRICE_WEIGHTS;
  const kw = new Set(p.keywords ?? []);
  const structure = isStructure(p);
  const models = Math.max(1, num(p.models, 1));
  const hp = Math.max(1, num(p.hp, 1));
  const shield = Math.max(0, num(p.shield));
  const armor = num(p.armor, 7);
  const move = structure ? 0 : Math.max(0, num(p.move));

  // ----- body -----
  const refAp = kw.has("armoured") ? Math.max(0, W.refAp - 0.5) : W.refAp;
  const fail =
    saveFails(armor, Math.floor(refAp)) * (1 - (refAp % 1)) +
      saveFails(armor, Math.ceil(refAp)) * (refAp % 1) || 1 / 6;
  let evade = 0;
  if (p.evade) {
    const share = Math.min(
      1,
      (p.evade.against ?? []).reduce((s, c) => s + (EVADE_SHARE[c] ?? 0), 0),
    );
    evade = share * pAtLeast(num(p.evade.target, 7));
  }
  // Big squads take an extra blast die per model, so their models count for less (never below a squad one smaller).
  const bodies = models >= BLAST_SQUAD ? Math.max(BLAST_SQUAD - 1, models * W.bigSquad) : models;
  const wounds = (bodies * (hp + W.shield * shield)) / (fail * (1 - evade));
  const nerve = kw.has("fearless") || structure ? 10 : num(p.nerve, 7);
  let bodyMult = 1 + W.nerve * (nerve - 7);
  if (kw.has("flying")) bodyMult *= W.flyingBody;
  if (structure) bodyMult *= W.structureBody;
  if (kw.has("heavy")) bodyMult *= 0.95; // never in cover
  const body = W.body * Math.pow(wounds, W.bodyExp) * bodyMult;

  // ----- guns -----
  const flying = kw.has("flying");
  const priced = (p.weapons ?? []).map((w) => ({
    w,
    d: weaponDamage(w, models, { structure, flying }),
  }));
  const rangedList = priced
    .filter((x) => !x.w.melee)
    .map((x) => ({ ...x, d: x.d * Math.pow(Math.max(1, num(x.w.range, 1)) / 18, W.rangeExp) }));
  const meleeList = priced.filter((x) => x.w.melee);
  // Melee only pays off if the unit reaches a fight: faster units charge more often, structures wait for it.
  const reach = structure
    ? 0.35
    : Math.min(1.3, (move + (kw.has("jump") ? 2 : 0) + (flying ? 2 : 0) + 6) / 12);
  const best = (xs: { d: number }[]) => xs.reduce((m, x) => Math.max(m, x.d), 0);
  const rest = (xs: { d: number }[]) => xs.reduce((s, x) => s + x.d, 0) - best(xs);
  const rangedDmg = best(rangedList) + W.extraWeapon * rest(rangedList);
  const meleeDmg = (best(meleeList) + W.extraWeapon * rest(meleeList)) * W.melee * reach;
  let impactDmg = 0;
  if (p.impact && !structure) {
    const imp: Weapon = {
      name: "impact",
      melee: true,
      range: 0,
      dice: num(p.impact.dice, 1),
      hit: num(p.impact.hit, 4),
      damage: num(p.impact.damage, 1),
      ap: num(p.impact.ap),
      targets: flying ? "all" : "ground",
    };
    impactDmg = weaponDamage(imp, models, { flying }) * W.impact * reach;
  }
  const dmg = rangedDmg + meleeDmg + impactDmg;
  const guns = dmg > 0 ? W.guns * Math.pow(dmg, W.gunsExp) : 0;
  // Share the guns ⚙ out between ranged and melee for the ability context.
  const share = (d: number) => (dmg > 0 ? (guns * d) / dmg : 0);
  const bestRanged = rangedList.reduce<(typeof rangedList)[number] | null>(
    (m, x) => (!m || x.d > m.d ? x : m),
    null,
  );
  const bestMelee = meleeList.reduce<(typeof meleeList)[number] | null>(
    (m, x) => (!m || x.d > m.d ? x : m),
    null,
  );
  const ranged = share(rangedDmg);
  const meleeV = share(meleeDmg + impactDmg);
  const perDie = (v: number, w: Weapon | undefined) =>
    w && !(w.traits ?? []).includes("indirect")
      ? v / Math.max(1, models * Math.max(1, num(w.dice, 1)))
      : 0;

  // ----- move -----
  let moveV = W.move * (move - 6);
  if (flying) moveV += W.flying;
  if (kw.has("jump")) moveV += W.jump;
  if (structure) moveV = W.structure + (p.structure?.fieldDeploy ? 0.15 : 0);

  const ctx: PriceContext = {
    p,
    ranged,
    rangedPerDie: perDie(ranged, bestRanged?.w),
    melee: meleeV,
    meleePerDie: perDie(meleeV, bestMelee?.w),
    body,
  };
  const abilities = (p.abilities ?? []).reduce((s, a) => s + abilityValue(a, ctx), 0);
  const total = W.base + body + guns + moveV + abilities;
  return { base: W.base, body, guns, move: moveV, abilities, total, ctx };
}

/** Has a lobbed (indirect) gun. */
function lobs(p: UnitProfile): boolean {
  return p.weapons.some((w) => !w.melee && (w.traits ?? []).includes("indirect"));
}

/** Uses per game: once is worth about half of always. */
const usesFactor = (uses: number | undefined): number =>
  !uses ? 1 : uses === 1 ? 0.55 : uses === 2 ? 0.8 : 0.9;

/** ⚙ one ability adds to a unit, after the CP and uses discount for active abilities. */
export function abilityValue(id: string, ctx: PriceContext): number {
  const def = (ABILITIES as Record<string, (typeof ABILITIES)[AbilityId] | undefined>)[id];
  const kind = def?.kind ?? "passive";
  const price = (ABILITY_PRICES as Record<string, AbilityPrice | undefined>)[id];
  let v =
    price === undefined
      ? DEFAULT_ABILITY_PRICE[kind]
      : typeof price === "number"
        ? price
        : price(ctx);
  if (kind === "active") v *= usesFactor(def?.usesPerGame) / (1 + 0.15 * num(def?.cp));
  return Math.max(0, v * PRICE_WEIGHTS.abilities);
}

/** Abilities used by a profile (or its upgrades) that the price table doesn't know. */
export const unpricedAbilities = (ids: Iterable<string>): string[] =>
  [...new Set(ids)].filter((id) => !(id in ABILITY_PRICES));

export interface UnitPrice {
  cost: number;
  supply: number;
  parts: UnitParts;
  /** e.g. "⚙7 = body 3 + guns 3 + abilities 1" */
  breakdown: string;
}

/** Cost, supply and a readable breakdown for a profile (its base, without upgrades). */
export function priceUnit(p: UnitProfile): UnitPrice {
  const parts = rawUnitValue(p);
  const summonOnly = !!p.structure?.summonOnly;
  const cost = summonOnly ? 0 : Math.max(1, Math.round(parts.total));
  const supply = summonOnly ? 0 : supplyFor(p, cost);
  return { cost, supply, parts, breakdown: breakdownText(cost, parts) };
}

/** Resource cost of a profile (its base, without upgrades). Summon-only structures are free. */
export const unitCost = (p: UnitProfile): number => priceUnit(p).cost;

/** Supply: structures 1, squads 2 (3 with 6+ models), single models from their cost (1 to 4). Summon-only: 0. */
export function supplyFor(p: UnitProfile, cost = unitCost(p)): number {
  if (p.structure?.summonOnly) return 0;
  if (isStructure(p)) return 1;
  const models = num(p.models, 1);
  if (models >= 6) return 3;
  if (models >= 2) return 2;
  return Math.max(1, Math.min(4, cost - PRICE_WEIGHTS.supplyOffset));
}

function breakdownText(cost: number, parts: UnitParts): string {
  const bits: string[] = [];
  const add = (label: string, v: number) => {
    const n = r1(v);
    if (n !== 0)
      bits.push(`${bits.length ? (n < 0 ? "- " : "+ ") : n < 0 ? "-" : ""}${label} ${Math.abs(n)}`);
  };
  add("body", parts.body + parts.base);
  add("guns", parts.guns);
  add(parts.move < 0 ? "static" : "speed", parts.move);
  add("abilities", parts.abilities);
  return `⚙${cost} = ${bits.join(" ") || "0"}`;
}

// ---------- upgrades ----------

/** A profile with one upgrade applied (as the engine applies it, see profile.ts). */
export function withUpgrade(p: UnitProfile, u: UpgradeDef): UnitProfile {
  const out: UnitProfile = structuredClone(p);
  out.models += num(u.addModels);
  out.move += num(u.move);
  for (const k of u.addKeywords ?? []) if (!out.keywords.includes(k)) out.keywords.push(k);
  for (const a of u.addAbilities ?? []) if (!out.abilities.includes(a)) out.abilities.push(a);
  if (u.weapon) {
    const w = out.weapons[u.weapon.index];
    if (w) out.weapons[u.weapon.index] = { ...w, ...u.weapon.patch };
  }
  if (u.impact && out.impact) out.impact = { ...out.impact, ...u.impact };
  return addDerivedAbilities(out);
}

/** ⚙ the upgrade adds: what the unit is worth with it minus without it. At least 1 if it helps at all. */
export function upgradeCost(p: UnitProfile, u: UpgradeDef): number {
  const diff = rawUnitValue(withUpgrade(p, u)).total - rawUnitValue(p).total;
  if (diff <= 0.001) return 0;
  return Math.max(1, Math.round(diff));
}

/** Short breakdown for an upgrade, e.g. "+⚙2 (worth 1.6)". */
export function upgradeBreakdown(p: UnitProfile, u: UpgradeDef): string {
  const before = rawUnitValue(p);
  const after = rawUnitValue(withUpgrade(p, u));
  const parts: string[] = [];
  for (const k of ["body", "guns", "move", "abilities"] as const) {
    const d = r1(after[k] - before[k]);
    if (d !== 0) parts.push(`${k === "move" ? "speed" : k} ${d > 0 ? "+" : ""}${d}`);
  }
  return `+⚙${upgradeCost(p, u)}${parts.length ? ` = ${parts.join(", ")}` : ""}`;
}

// ---------- supports ----------

export interface SupportPrice {
  fizz: number;
  /** Value of each ability after its CP discount, in order. */
  abilities: number[];
  cp: number;
  /** Fizz before rounding. */
  raw: number;
  breakdown: string;
}

/** Fizz value of one support ability (before the card's base and CP-per-round). */
export function supportAbilityValue(
  a: SupportAbilityDef,
  summonLookup?: (id: string) => UnitProfile | undefined,
): number {
  const F = FIZZ_WEIGHTS;
  const e = a.effect as SupportEffect & { profileId?: string };
  const price = (
    EFFECT_PRICES as Record<string, ((e: unknown, s?: UnitProfile) => number) | undefined>
  )[e?.kind];
  const summoned = e?.kind === "summon" && e.profileId ? summonLookup?.(e.profileId) : undefined;
  let v = price ? price(e, summoned) : DEFAULT_EFFECT_PRICE;
  if (!Number.isFinite(v)) v = DEFAULT_EFFECT_PRICE;
  v *= 3 / (Math.max(0, num(a.cp)) + F.cpCurve);
  if (!a.exhaust) v *= F.noExhaust;
  return Math.max(0, v);
}

/** Fizz cost, the value of each ability, and a readable breakdown for a support card. */
export function priceSupport(
  s: SupportDef,
  summonLookup?: (id: string) => UnitProfile | undefined,
): SupportPrice {
  const F = FIZZ_WEIGHTS;
  const values = (s.abilities ?? []).map((a) => supportAbilityValue(a, summonLookup));
  const sorted = [...values].sort((a, b) => b - a);
  const abil = sorted.reduce((sum, v, i) => sum + (i === 0 ? v : F.extraAbility * v), 0);
  // Card-bound CP: a card's CP up to its dearest ability is what burning it pays for that ability (its
  // value is in the abilities); only the first CP and any CP beyond that are spare CP worth Fizz.
  const dearest = Math.max(0, ...(s.abilities ?? []).map((a) => num(a.cp)));
  const spare = Math.max(0, num(s.cp)) <= 0 ? 0 : 1 + Math.max(0, num(s.cp) - Math.max(1, dearest));
  const cp = F.cpPerRound * spare;
  const slotCount = UNIT_CLASSES.reduce((n, c) => n + Math.max(0, num(supportSlots(s)[c])), 0);
  const slots = F.slot * (slotCount - 1);
  const raw = F.base + cp + abil + slots;
  const fizz = Math.max(1, Math.min(10, Math.round(raw)));
  return {
    fizz,
    raw,
    abilities: values,
    cp,
    breakdown: `✦${fizz} = card ${r1(F.base)} + CP ${r1(cp)} + abilities ${r1(abil)}${slots ? ` ${slots < 0 ? "-" : "+"} slots ${r1(Math.abs(slots))}` : ""}`,
  };
}

/** Fizz cost of a support card. Pass a lookup so summons are priced from the structure they make. */
export const supportFizz = (
  s: SupportDef,
  summonLookup?: (id: string) => UnitProfile | undefined,
): number => priceSupport(s, summonLookup).fizz;

/** Unit ability ids and support effect kinds without an explicit price (they use the defaults). */
export function unpricedEffects(kinds: Iterable<string>): string[] {
  return [...new Set(kinds)].filter((k) => !(k in EFFECT_PRICES));
}

// ---------- whole factions ----------

interface PriceableFaction {
  profiles: UnitProfile[];
  supports: SupportDef[];
}

/**
 * Overwrite every cost in a faction with the computed one: unit cost and supply, upgrade costs and
 * support Fizz. Mutates and returns `f`. Used for custom factions (never the built-ins).
 */
export function applyComputedCosts<T extends PriceableFaction>(f: T): T {
  for (const p of f.profiles ?? []) {
    const price = priceUnit(p);
    p.cost = price.cost;
    p.supply = price.supply;
    for (const u of p.upgrades ?? []) u.cost = upgradeCost(p, u);
  }
  const lookup = (id: string) => (f.profiles ?? []).find((p) => p.id === id);
  for (const s of f.supports ?? []) s.fizz = supportFizz(s, lookup);
  return f;
}
