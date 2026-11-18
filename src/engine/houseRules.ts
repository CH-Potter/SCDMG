// House rules: switch mechanics on or off to play closer to the tabletop game you know. Chosen
// before a game and kept in its state (GameState.rules), so the engine, the AI and saves all agree.
// A state without rules plays the standard game (STANDARD_RULES).

import type { GameState } from "./types";

export interface HouseRules {
  /** Army lists must fit their class slots (Base, Support, Elite, Flyer, Static; see data/unitClasses.ts). On by default. */
  classLimits: boolean;
  /** Nerve tests and Shaken (and Rally). Off by default. */
  morale: boolean;
  /** Evade rolls. */
  evade: boolean;
  /** Shooting into a melee without precision: misses roll again at your own unit in the fight. */
  strays: boolean;
  /** Impact dice when a ground unit's charge lands (a flyer's dive is its whole attack, so it stays). */
  impact: boolean;
  /** Area cover costs double movement. */
  difficultTerrain: boolean;
  /** Other units' models in the line of fire give the target cover. */
  obscuring: boolean;
  /** Indirect shells and barrages can drift off target. */
  scatter: boolean;
  /** Charge distance is 2d6", rolled after the charge is declared; a short roll fails. On by default. */
  rolledCharges: boolean;
  /** A fighting unit's models each move up to 3" into the fight before it attacks. */
  closeRanks: boolean;
  /** Models in base contact with a squad-mate who is in base contact with the enemy fight too. */
  supportingRank: boolean;
  /** Keyword bonuses become breach dice: a d3 or d6 per attack, that many hits skip the save. */
  breach: boolean;
  /** A unit being charged shoots the charger first, hitting only on 6s. */
  overwatch: boolean;
  /** Spend 1 CP to re-roll an attack's misses. */
  reroll: boolean;
  /** Every unit that charged fights before anyone else (instead of each side's chargers going first in alternation). */
  chargersFirst: boolean;
  /** Each player activates their whole army in a phase before the other player goes. */
  wholeArmy: boolean;
  /** Who activates next is drawn at random, weighted by the units each side has left to act. */
  randomOrder: boolean;
}

export type HouseRuleId = keyof HouseRules;

/** The standard game: what a new game plays unless the players change it. */
export const STANDARD_RULES: Readonly<HouseRules> = Object.freeze({
  classLimits: true,
  morale: false,
  evade: true,
  strays: true,
  impact: true,
  difficultTerrain: true,
  obscuring: true,
  scatter: true,
  rolledCharges: true,
  closeRanks: true,
  supportingRank: true,
  breach: false,
  overwatch: false,
  reroll: false,
  chargersFirst: false,
  wholeArmy: false,
  randomOrder: false,
});

/**
 * The rules from before house rules existed (morale on, fixed charges, no close ranks or supporting
 * rank, chargers first). Tests that pin those mechanics use it.
 */
export const CLASSIC_RULES: Readonly<HouseRules> = Object.freeze({
  ...STANDARD_RULES,
  classLimits: false,
  morale: true,
  rolledCharges: false,
  closeRanks: false,
  supportingRank: false,
  chargersFirst: true,
});

export interface HouseRuleInfo {
  id: HouseRuleId;
  name: string;
  text: string;
  /** Rules that can't both be on: ticking this one unticks these. */
  excludes?: HouseRuleId[];
}

export const HOUSE_RULES: readonly HouseRuleInfo[] = [
  { id: "classLimits", name: "Unit class limits", text: "Army lists fill class slots: Base, Support, Elite, Flyer and Static. Your faction and each support card add slots. Off: any mix within the mode's unit and cost limits." },
  { id: "rolledCharges", name: "Rolled charges", text: "Declare a charge at a unit within 12\", then roll 2d6\" for the distance. Too short, and the charge fails where it stands. Off: charge up to the unit's move." },
  { id: "closeRanks", name: "Close ranks", text: "When a unit fights, each of its models first moves up to 3\" into base contact (or behind a squad-mate who is). Off: models fight from where they stand." },
  { id: "supportingRank", name: "Supporting rank", text: "A model in base contact with a squad-mate who's in base contact with the enemy fights too. Off: only models in base contact fight." },
  { id: "evade", name: "Evade rolls", text: "Nimble units dodge hits in the situations their evade lists. Off: every hit goes to a save." },
  { id: "strays", name: "Stray shots into melee", text: "Without precision, misses fired into a melee roll again at your own unit in it. Off: shoot into melees freely." },
  { id: "impact", name: "Impact on charge", text: "Ground units with impact dice roll them when a charge lands. Off: no impact hits (a flyer's dive still strikes)." },
  { id: "difficultTerrain", name: "Difficult terrain", text: "Area cover costs double movement. Off: it costs normal movement (it still gives cover)." },
  { id: "obscuring", name: "Units block shots", text: "Other units' models in the line of fire give the target cover. Off: only terrain gives cover." },
  { id: "scatter", name: "Shell scatter", text: "Lobbed shells and barrages can drift off target. Off: they always land where aimed." },
  { id: "morale", name: "Morale and Shaken", text: "Units at half strength test their nerve when hurt; Shaken units hit worse, won't charge and can't hold objectives. Rally for 1 CP." },
  { id: "breach", name: "Breach dice", text: "Keyword bonuses become breach dice: against a matching target, roll a d3 (or a d6 for big bonuses) with the attack; that many hits skip the save." },
  { id: "overwatch", name: "Overwatch", text: "A unit being charged shoots the charger first with its best gun, hitting only on 6s." },
  { id: "reroll", name: "Command re-roll", text: "After an attack, spend 1 CP to re-roll its misses." },
  { id: "chargersFirst", name: "Chargers strike first", text: "In the combat phase every unit that charged fights before anyone else. Off: players alternate, each fighting with their own chargers first." },
  { id: "randomOrder", name: "Random activation order", text: "Each activation, draw who goes next, weighted by how many units each side has left to act (the player with the initiative starts each phase).", excludes: ["wholeArmy"] },
  { id: "wholeArmy", name: "Whole-army turns", text: "In each phase, one player activates all their units, then the other player goes, instead of alternating one unit at a time.", excludes: ["randomOrder"] },
];

/** On in the standard game ("switch off" rules) or off in it ("switch on" rules). */
export const isCoreRule = (id: HouseRuleId): boolean => STANDARD_RULES[id];

/** The rules this game is played with. */
export const rulesOf = (s: Pick<GameState, "rules">): Readonly<HouseRules> => s.rules ?? STANDARD_RULES;

/** Rules from untrusted input (storage, a save): unknown keys dropped, missing ones standard, clashes resolved. */
export function cleanRules(x: unknown): HouseRules {
  const out: HouseRules = { ...STANDARD_RULES };
  if (typeof x !== "object" || x === null) return out;
  for (const info of HOUSE_RULES) {
    const v = (x as Record<string, unknown>)[info.id];
    if (typeof v === "boolean") out[info.id] = v;
  }
  if (out.wholeArmy && out.randomOrder) out.randomOrder = false;
  return out;
}

/** Is this the standard game? */
export const isStandard = (r: Readonly<HouseRules>): boolean => HOUSE_RULES.every((i) => r[i.id] === STANDARD_RULES[i.id]);

/** The house rules that differ from the standard game, as names ("Evade rolls off", "Overwatch"). */
export function rulesSummary(r: Readonly<HouseRules>): string[] {
  return HOUSE_RULES.filter((i) => r[i.id] !== STANDARD_RULES[i.id]).map((i) => (isCoreRule(i.id) ? `${i.name} off` : i.name));
}

// ---- numbers the rules use ----

/** Overwatch against a charge hits on this. */
export const OVERWATCH_HIT = 6;
/** Rolled charges: the most a charge can be declared at (the best 2d6 roll). */
export const ROLLED_CHARGE_MAX = 12;
/** Command re-roll: its CP cost. */
export const REROLL_CP = 1;
/** Close ranks: how far each model may move before its unit fights. */
export const CLOSE_RANKS_MOVE = 3;
