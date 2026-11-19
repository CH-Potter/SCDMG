// Attack resolution: per-model range/sight, keyword bonuses, wound allocation, saves, reactions.

import { BARRAGE_RADIUS, BLAST_SQUAD, SHELL_BURST, SHELL_DRIFT, WIDE_BARRAGE_RADIUS } from "./constants";
import { MISSIONS } from "./data/missions";
import { dist } from "./geometry";
import { hasAbility, hasKeyword, isFlying, profileOf, reacts } from "./profile";
import { nextRandom, rollD6 } from "./rng";
import { aliveModels, AURA_RANGE, concealment, ENGAGE_RANGE, engagedWith, isEngaged, supplyLost, meleeCanHit, modelGap, modelsEngage, modelsInReach, onBoard, radiusOf, unitGap, unitsEngage } from "./rules";
import { rulesOf, STANDARD_RULES, type HouseRules } from "./houseRules";
import { consumeReaction } from "./reactions";
import { hasCover, lineOfSight, platformAt } from "./terrain";
import type { AttackReport, BarrageMarker, EvadeCondition, GameEvent, GameState, Model, Unit, UnitProfile, Vec, Weapon } from "./types";

export type AttackKind = AttackReport["kind"];

export interface AttackPlan {
  attackers: { model: Model; dice: number }[];
  targets: Model[];
  hitOn: number;
  damage: number;
  ap: number;
  /** Natural 6s to hit get +1 AP. */
  rending?: boolean;
  /** Move up to this many missed dice into the hits. */
  precision?: number;
  /** Cancel up to this many successful evades. */
  tracking?: number;
  /** Evade target the defender rolls per hit, or null for none. Left undefined, resolveAttack works it out from the attack kind. */
  evadeOn?: number | null;
  /**
   * A lobbed shot (indirect weapon): each attacking model fires one shell at the target that may
   * drift, then bursts on every model under it (scatterShell, burstAt). The dice counts don't apply.
   */
  indirect?: boolean;
  /** Breach dice house rule: against a matching target, roll this die with the attack; that many hits skip the save. */
  breach?: { die: 3 | 6; vs: string };
  /** Command re-roll house rule: re-roll the misses once (the CP is paid by the caller). */
  reroll?: boolean;
}

export const hasTrait = (w: Weapon, t: NonNullable<Weapon["traits"]>[number]): boolean => !!w.traits?.includes(t);

// ---------- morale ----------

/** A unit's nerve: its profile value (default 7), +1 near a friendly Steadying Presence (pass the state to count auras). */
export function nerveOf(u: Unit, s?: GameState): number {
  const base = profileOf(u).nerve ?? 7;
  if (!s) return base;
  const steadied = onBoard(s, u.owner).some((f) => hasAbility(f, "steadying") && (f.uid === u.uid || unitGap(f, u) <= AURA_RANGE));
  return base + (steadied ? 1 : 0);
}
export const isFearless = (u: Unit): boolean => !!profileOf(u).structure || profileOf(u).keywords.includes("fearless");

/** A unit at half strength or less that just took damage tests its nerve (2d6 vs nerve). */
export function moraleCheck(s: GameState, t: Unit, events: GameEvent[]): void {
  if (t.destroyed || !t.onBoard || t.status.shaken || isFearless(t)) return;
  const p = profileOf(t);
  const max = p.models * (p.hp + p.shield);
  const now = aliveModels(t).reduce((n, m) => n + m.hp + m.shield, 0);
  if (now * 2 > max) return;
  nerveTest(s, t, events);
}

/** Roll 2d6 against the unit's nerve (less `penalty`); above it, the unit is Shaken. Returns whether it was. */
export function nerveTest(s: GameState, t: Unit, events: GameEvent[], penalty = 0): boolean {
  if (!rulesOf(s).morale) return false;
  const roll: [number, number] = [rollD6(s), rollD6(s)];
  const nerve = nerveOf(t, s) - penalty;
  const shaken = roll[0] + roll[1] > nerve;
  if (shaken) t.status.shaken = true;
  events.push({ type: "morale", uid: t.uid, roll, nerve, shaken });
  return shaken;
}

/** Chance that 2d6 rolls above `nerve` (the chance of being Shaken by a nerve test). */
export function shakeChance(nerve: number): number {
  let n = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b > nerve) n += 1;
  return n / 36;
}

export function weaponBonus(w: Weapon, target: Unit): { dice: number; damage: number; ap: number } {
  const b = { dice: 0, damage: 0, ap: 0 };
  for (const x of w.bonuses ?? []) {
    if (!hasKeyword(target, x.vs)) continue;
    b.dice += x.dice ?? 0;
    b.damage += x.damage ?? 0;
    b.ap += x.ap ?? 0;
  }
  return b;
}

const NO_BONUS = { dice: 0, damage: 0, ap: 0 };

/**
 * Breach dice house rule: a weapon's keyword bonus against this target, as a breach die instead.
 * A bonus worth 1 (one die, damage or AP) is a d3; a bigger one is a d6. The best match counts.
 */
export function breachFor(w: Weapon, target: Unit): { die: 3 | 6; vs: string } | null {
  let best: { die: 3 | 6; vs: string; size: number } | null = null;
  for (const x of w.bonuses ?? []) {
    if (!hasKeyword(target, x.vs)) continue;
    const size = (x.dice ?? 0) + (x.damage ?? 0) + (x.ap ?? 0);
    if (size <= 0 || (best && best.size >= size)) continue;
    best = { die: size >= 2 ? 6 : 3, vs: x.vs, size };
  }
  return best ? { die: best.die, vs: best.vs } : null;
}

/** The keyword bonus (or, with breach dice, no bonus and a breach die) a weapon gets against a target. */
function bonusUnder(rules: Readonly<HouseRules>, w: Weapon, t: Unit): { bonus: { dice: number; damage: number; ap: number }; breach: { die: 3 | 6; vs: string } | null } {
  return rules.breach ? { bonus: NO_BONUS, breach: breachFor(w, t) } : { bonus: weaponBonus(w, t), breach: null };
}

/** Armour shrugs off 1 AP unless the weapon is specifically built to crack armour. */
function effectiveAp(w: Weapon, target: Unit, bonusAp: number): number {
  const ap = w.ap + bonusAp;
  const antiArmour = (w.bonuses ?? []).some((b) => b.vs === "armoured");
  return hasKeyword(target, "armoured") && !antiArmour ? Math.max(0, ap - 1) : ap;
}

// ---------- precision, tracking, evade, engagement ----------

export const precisionOf = (a: Unit, w: Weapon): number => Math.max(0, (w.precision ?? 0) + (a.status.precisionBonus ?? 0));
export const trackingOf = (a: Unit, w: Weapon): number => Math.max(0, (w.tracking ?? 0) + (a.status.trackingBonus ?? 0));

/**
 * Melee limits shooting: engaged units only shoot what they're fighting. Anyone may shoot into a
 * melee, but without precision their misses may hit their own side (see strayShots).
 */
export function engagementBlock(s: GameState, a: Unit, t: Unit): string | null {
  if (isEngaged(s, a)) return unitsEngage(a, t) ? null : "Engaged units can only shoot a unit they're fighting";
  return null;
}

/** The evade target the defender rolls against attacks that count as any of `conditions`, or null if none apply. */
export function evadeTarget(t: Unit, conditions: EvadeCondition[]): number | null {
  const ev = profileOf(t).evade;
  if (!ev || !ev.against.some((c) => conditions.includes(c))) return null;
  return Math.max(2, Math.min(6, ev.target - (t.status.evadeBonus ?? 0)));
}

/** A unit's own evade number (with buffs), in any situation, or null if its card has no evade. */
export function ownEvade(t: Unit): number | null {
  const ev = profileOf(t).evade;
  return ev ? Math.max(2, Math.min(6, ev.target - (t.status.evadeBonus ?? 0))) : null;
}

/**
 * The evade a shot's target rolls. With the "Evade in the scrum" house rule, a unit in a melee rolls
 * its own evade against any shot (blasts and barrages still go by its card's situations).
 */
export function evadeVsShot(s: GameState, t: Unit, conditions: EvadeCondition[], kind: AttackKind = "shoot"): number | null {
  if (rulesOf(s).engagedEvade && kind !== "barrage" && isEngaged(s, t)) return ownEvade(t);
  return evadeTarget(t, conditions);
}

/** The situations a shot counts as for evade, or null when it allows none (point-blank pistol shots). */
export function shotConditions(s: GameState, a: Unit, t: Unit, w: Weapon, kind: AttackKind): EvadeCondition[] | null {
  const pointBlank = kind !== "barrage" && isEngaged(s, a) && unitsEngage(a, t);
  if (pointBlank && hasTrait(w, "pistol")) return null;
  const c: EvadeCondition[] = ["ranged"];
  if (pointBlank) c.push("pointBlank");
  if (hasTrait(w, "blast") || kind === "barrage") c.push("blast");
  return c;
}

/** Evade conditions for attacks built without a weapon plan (barrages, impacts, lurks). */
function defaultConditions(kind: AttackKind): EvadeCondition[] {
  if (kind === "fight" || kind === "impact") return ["melee"];
  if (kind === "barrage") return ["ranged", "blast"];
  return ["ranged"];
}

export function rangedCanHit(w: Weapon, target: Unit): boolean {
  return isFlying(target) ? w.targets !== "ground" : w.targets !== "air";
}

/** Work out which models can shoot which, or why nobody can. */
/** Is the target shielded by a friendly ward-aura structure within 4"? */
function wardedAgainst(s: GameState, t: Unit): boolean {
  return onBoard(s, t.owner).some((w) => w.uid !== t.uid && hasAbility(w, "ward-aura") && unitGap(w, t) <= 4);
}

export function planShooting(s: GameState, a: Unit, t: Unit, w: Weapon, kind: AttackKind = "shoot"): AttackPlan | string {
  if (w.melee) return "That's a melee weapon";
  const concealed = concealment(s, a, t);
  if (concealed) return concealed;
  if (!rangedCanHit(w, t)) return isFlying(t) ? `${w.name} can't hit flyers` : `${w.name} only hits flyers`;
  const indirect = hasTrait(w, "indirect");
  if (indirect && kind !== "shoot") return `${w.name} is lobbed: it can only be fired as a normal shot`;
  if (indirect && isEngaged(s, a)) return "Too close to lob a shell: this unit is in a melee";
  if (kind !== "barrage") {
    const blocked = engagementBlock(s, a, t);
    if (blocked) return blocked;
  }
  const rules = rulesOf(s);
  const { bonus, breach } = bonusUnder(rules, w, t);
  const ra = radiusOf(a);
  const rt = radiusOf(t);
  const attackers: AttackPlan["attackers"] = [];
  const targets = new Set<Model>();
  let inRange = false;
  let hidden = false;
  // Dust Cloud: only shots from close by find a unit hidden in the dust.
  const reach = t.status.smoked ? Math.min(w.range, t.status.smoked) : w.range;
  for (const am of aliveModels(a)) {
    let any = false;
    for (const tm of aliveModels(t)) {
      const gap = dist(am.pos, tm.pos) - ra - rt;
      if (gap > w.range + 1e-6) continue;
      if (gap > reach + 1e-6) {
        hidden = true;
        continue;
      }
      inRange = true;
      // Lobbed shells need no line of sight.
      if (!indirect && !lineOfSight(s, am.pos, am.elevation, tm.pos, tm.elevation)) continue;
      targets.add(tm);
      any = true;
    }
    if (any) {
      let dice = w.dice + bonus.dice + a.status.rangedBonus;
      if (hasTrait(w, "blast") && aliveModels(t).length >= BLAST_SQUAD) dice += 1;
      if (hasAbility(a, "steady-aim") && !a.status.moved) dice += 1;
      attackers.push({ model: am, dice: Math.max(1, dice) });
    }
  }
  if (!attackers.length) return inRange ? "No line of sight" : hidden ? `Hidden in dust: only shots from within ${t.status.smoked}" find it` : `Out of range (${w.range}")`;
  // Overwatch fires hastily; a friendly Glimmer-style ward near the target makes shots one worse.
  // Torrent weapons hit automatically (shaken, hasty or warded shooters still lose the easy hits).
  let hitOn = Math.min(
    6,
    (hasTrait(w, "torrent") ? 1 : w.hit) +
      (kind === "overwatch" ? 1 : 0) +
      (wardedAgainst(s, t) ? 1 : 0) +
      (hasTrait(w, "heavy") && a.status.moved ? 1 : 0) +
      (a.status.shaken ? 1 : 0) +
      (a.status.blinded ? 1 : 0),
  );
  // A spotted target is easier to hit, but never better than 2+.
  if (t.status.spotted && hitOn > 2) hitOn -= 1;
  const conditions = shotConditions(s, a, t, w, kind);
  return {
    attackers,
    targets: [...targets],
    hitOn,
    damage: w.damage + bonus.damage + (a.status.overcharged ? 1 : 0),
    ap: effectiveAp(w, t, bonus.ap),
    rending: hasTrait(w, "rending"),
    precision: precisionOf(a, w),
    tracking: trackingOf(a, w),
    evadeOn: conditions && rules.evade ? evadeVsShot(s, t, conditions, kind) : null,
    ...(indirect ? { indirect: true } : {}),
    ...(breach && !indirect ? { breach } : {}),
  };
}

/**
 * Impact on charge: every charging model in base contact rolls the unit's impact dice.
 * Ground units can't impact flyers. Returns null if there's no impact to roll.
 */
export function planImpact(a: Unit, t: Unit, rules: Readonly<HouseRules> = STANDARD_RULES): AttackPlan | null {
  const imp = profileOf(a).impact;
  if (!imp || !meleeCanHit(a, t, "ground")) return null;
  const attackers: AttackPlan["attackers"] = [];
  const targets = new Set<Model>();
  for (const am of aliveModels(a)) {
    const touching = aliveModels(t).filter((tm) => modelsInReach(a, am, t, tm));
    if (!touching.length) continue;
    touching.forEach((tm) => targets.add(tm));
    attackers.push({ model: am, dice: Math.max(1, imp.dice) });
  }
  if (!attackers.length) return null;
  const asWeapon: Weapon = { name: "Impact", melee: true, range: 0, dice: imp.dice, hit: imp.hit, damage: imp.damage, ap: imp.ap, targets: "ground" };
  return { attackers, targets: [...targets], hitOn: imp.hit, damage: imp.damage, ap: effectiveAp(asWeapon, t, 0), evadeOn: rules.evade ? evadeTarget(t, ["melee"]) : null };
}

export function planMelee(a: Unit, t: Unit, w: Weapon, rules: Readonly<HouseRules> = STANDARD_RULES): AttackPlan | string {
  if (!w.melee) return "That's not a melee weapon";
  if (!meleeCanHit(a, t, w.targets)) return `${w.name} can't reach flyers`;
  const { bonus, breach } = bonusUnder(rules, w, t);
  const attackers: AttackPlan["attackers"] = [];
  const targets = new Set<Model>();
  const mine = aliveModels(a);
  const front = new Map(mine.map((am) => [am, aliveModels(t).filter((tm) => modelsEngage(a, am, t, tm))]));
  for (const am of mine) {
    let touching = front.get(am)!;
    // Supporting rank: in base contact with a squad-mate who's in base contact with the enemy.
    if (!touching.length && rules.supportingRank) {
      const backed = mine.filter((fm) => fm !== am && fm.elevation === am.elevation && front.get(fm)!.length && dist(fm.pos, am.pos) - 2 * radiusOf(a) <= ENGAGE_RANGE + 1e-6);
      touching = [...new Set(backed.flatMap((fm) => front.get(fm)!))];
    }
    if (!touching.length) continue;
    touching.forEach((tm) => targets.add(tm));
    attackers.push({ model: am, dice: Math.max(1, w.dice + bonus.dice + (a.status.charged ? 1 : 0) + a.status.meleeBonus) });
  }
  if (!attackers.length) return "Not in base contact with that unit";
  return {
    attackers,
    targets: [...targets],
    hitOn: Math.min(6, w.hit + (a.status.shaken ? 1 : 0)),
    damage: w.damage + bonus.damage,
    ap: effectiveAp(w, t, bonus.ap),
    rending: hasTrait(w, "rending"),
    precision: precisionOf(a, w),
    tracking: trackingOf(a, w),
    evadeOn: rules.evade ? evadeTarget(t, ["melee"]) : null,
    ...(breach ? { breach } : {}),
  };
}

/** Scrap Cover: is this model within reach of a friendly structure that gives cover? (Flyers and heavy units never take cover.) */
export function scrapCovered(s: GameState, t: Unit, tm: Model): boolean {
  if (isFlying(t) || hasKeyword(t, "heavy")) return false;
  const reach = SCRAP_COVER_RANGE;
  return onBoard(s, t.owner).some(
    (w) => w.uid !== t.uid && hasAbility(w, "scrap-cover") && aliveModels(w).some((wm) => wm.elevation === tm.elevation && modelGap(w, wm, t, tm) <= reach + 1e-6),
  );
}
/** Scrap Cover's reach. */
export const SCRAP_COVER_RANGE = 2;

/** The save roll a model needs (null = no save). */
export function saveNeeded(s: GameState, a: Unit, t: Unit, tm: Model, ap: number, melee: boolean, from?: Model): number | null {
  let save = profileOf(t).armor + ap + (t.status.reckless ? 1 : 0) + (t.status.corroded ? 1 : 0);
  if (!melee) {
    // Spotlit (exposed) units get nothing from cover, hunkering or digging in. A friendly Scrap Cover
    // structure gives cover like terrain does.
    if (!t.status.exposed) {
      if (from && (hasCover(s, from.pos, from.elevation, t, tm, a.uid) || scrapCovered(s, t, tm))) save -= 1;
      if (t.status.hunkered) save -= hasAbility(t, "entrenched") ? 2 : 1;
      save -= t.status.dugIn ?? 0;
    }
  } else if (t.status.braced) {
    save -= 1;
  }
  save = Math.max(2, save);
  return save > 6 ? null : save;
}

/**
 * A blast landing on the models of `t` it catches (a unit's barrage or a support card's strike):
 * one hit die per caught model, then the target's blast evade, then a save (no cover from a blast
 * dropping out of the sky). Damage is applied as it goes; the caller logs the attack and the morale.
 */
export function blastOn(
  s: GameState,
  t: Unit,
  caught: Model[],
  e: { hit: number; damage: number; ap: number; noEvade?: boolean; /** A lobbed shell: could a firing model see the unit it caught? */ seen?: boolean },
  events: GameEvent[],
): Pick<AttackReport, "hitRolls" | "evadeRolls" | "evadeOn" | "saveRolls" | "saveOn" | "damage" | "modelsKilled"> {
  const evadeOn = rulesOf(s).evade && !e.noEvade ? shellEvade(s, t, e.seen ?? true) : null;
  const hitRolls: number[] = [];
  const evadeRolls: number[] = [];
  const saveRolls: number[] = [];
  const saveOn: (number | null)[] = [];
  let damage = 0;
  let modelsKilled = 0;
  for (const m of caught) {
    const roll = rollD6(s);
    hitRolls.push(roll);
    if (roll < e.hit) continue;
    if (evadeOn !== null) {
      const ev = rollD6(s);
      evadeRolls.push(ev);
      if (ev >= evadeOn) continue;
    }
    const st = saveNeeded(s, t, t, m, e.ap, false);
    saveOn.push(st);
    const sv = st === null ? 0 : rollD6(s);
    saveRolls.push(sv);
    if (st !== null && sv >= st) continue;
    damage += applyDamage(s, t, m, e.damage, events);
    if (!m.alive) modelsKilled += 1;
  }
  return { hitRolls, ...(evadeOn !== null && evadeRolls.length ? { evadeRolls, evadeOn } : {}), saveRolls, saveOn, damage, modelsKilled };
}

const pAtLeast = (n: number): number => Math.max(0, Math.min(1, (7 - n) / 6));

function nearestAttacker(plan: AttackPlan, tm: Model): Model | undefined {
  let best: Model | undefined;
  for (const { model } of plan.attackers) if (!best || dist(model.pos, tm.pos) < dist(best.pos, tm.pos)) best = model;
  return best;
}

/** Expected damage (for the AI and the UI preview), capped at the targetable wounds. */
export function expectedDamage(s: GameState, a: Unit, t: Unit, plan: AttackPlan, melee: boolean): number {
  if (plan.indirect) return expectedShells(s, a, t, plan);
  const dice = plan.attackers.reduce((sum, x) => sum + x.dice, 0);
  const tm = plan.targets[0]!;
  const st = saveNeeded(s, a, t, tm, plan.ap, melee, nearestAttacker(plan, tm));
  const pFail = st === null ? 1 : 1 - pAtLeast(st);
  const perHit = Math.min(plan.damage, profileOf(t).hp + profileOf(t).shield);
  const cap = plan.targets.reduce((sum, m) => sum + m.hp + m.shield, 0);
  const pHit = pAtLeast(plan.hitOn);
  let hits = dice * pHit + Math.min(plan.precision ?? 0, dice * (1 - pHit));
  const evadeOn = !rulesOf(s).evade ? null : plan.evadeOn === undefined ? evadeTarget(t, melee ? ["melee"] : ["ranged"]) : plan.evadeOn;
  if (evadeOn !== null) hits -= Math.max(0, hits * pAtLeast(evadeOn) - (plan.tracking ?? 0));
  // Breach dice: on average min(die, hits) hits skip the save.
  const skipped = plan.breach ? expectedBreach(plan.breach.die, hits) : 0;
  const unsaved = (hits - skipped) * pFail + skipped;
  let total = unsaved * perHit;
  // Refraction (unused this round) takes 1 off the first unsaved ranged wound: a whole wound for a 1-damage weapon.
  if (!melee && dice > 0 && reacts(t, "refraction") && !t.reactionsUsed.includes("refraction")) {
    const perDie = Math.min(1, unsaved / dice);
    total -= 1 - (1 - perDie) ** dice;
  }
  return Math.max(0, Math.min(cap, total));
}

/** The average number of hits a breach die lets skip the save, out of `hits` (which may be fractional). */
export function expectedBreach(die: 3 | 6, hits: number): number {
  let n = 0;
  for (let f = 1; f <= die; f++) n += Math.min(f, hits);
  return n / die;
}

/** Roll a breach die: a d6, or a d3 (a d6 halved, rounding up). */
const rollBreach = (s: GameState, die: 3 | 6): number => (die === 6 ? rollD6(s) : Math.ceil(rollD6(s) / 2));

/** Pick which model takes the next hit: finish off wounded models first, then the closest. */
function allocate(plan: AttackPlan, t: Unit): Model | undefined {
  const prof = profileOf(t);
  const alive = plan.targets.filter((m) => m.alive);
  const wounded = alive.filter((m) => m.hp + m.shield < prof.hp + prof.shield);
  const pool = wounded.length ? wounded : alive;
  const near = (m: Model) => Math.min(...plan.attackers.map((x) => dist(x.model.pos, m.pos)));
  return pool.sort((x, y) => near(x) - near(y))[0];
}

export function resolveAttack(
  s: GameState,
  a: Unit,
  t: Unit,
  weaponName: string,
  plan: AttackPlan,
  kind: AttackKind,
  events: GameEvent[],
): AttackReport {
  const melee = kind === "fight" || kind === "impact";
  const dice = plan.attackers.reduce((sum, x) => sum + x.dice, 0);
  const hitRolls = Array.from({ length: dice }, () => rollD6(s));
  // Command re-roll: every miss rolls again, once.
  let rerolledFrom: number[] | undefined;
  if (plan.reroll) {
    rerolledFrom = hitRolls.filter((r) => r < plan.hitOn);
    for (let i = 0; i < hitRolls.length; i++) if (hitRolls[i]! < plan.hitOn) hitRolls[i] = rollD6(s);
  }
  let hits = hitRolls.filter((r) => r >= plan.hitOn).length;
  // Precision: move missed dice into the hits.
  const precisionMoved = Math.min(plan.precision ?? 0, dice - hits);
  hits += precisionMoved;
  // Evade: the defender rolls one die per hit; tracking cancels successful evades.
  const evadeOn = !rulesOf(s).evade ? null : plan.evadeOn === undefined ? evadeTarget(t, defaultConditions(kind)) : plan.evadeOn;
  let evadeRolls: number[] | undefined;
  let evadesCancelled = 0;
  if (evadeOn !== null && hits > 0) {
    evadeRolls = Array.from({ length: hits }, () => rollD6(s));
    const evaded = evadeRolls.filter((r) => r >= evadeOn).length;
    evadesCancelled = Math.min(plan.tracking ?? 0, evaded);
    hits -= evaded - evadesCancelled;
  }
  let crits = plan.rending ? Math.min(hits, hitRolls.filter((r) => r === 6).length) : 0;
  // Breach dice: rolled with the attack; that many of the hits that got through skip the save (the last ones, so rending AP isn't wasted).
  const breachRoll = plan.breach && hits > 0 ? rollBreach(s, plan.breach.die) : 0;
  const skipped = Math.min(breachRoll, hits);
  const report: AttackReport = {
    uid: a.uid,
    target: t.uid,
    weapon: weaponName,
    kind,
    attackers: plan.attackers.length,
    hitRolls,
    hitOn: plan.hitOn,
    ...(rerolledFrom?.length ? { rerolledFrom } : {}),
    ...(precisionMoved ? { precisionMoved } : {}),
    ...(evadeRolls ? { evadeRolls, evadeOn: evadeOn!, evadesCancelled } : {}),
    ...(plan.breach && hits > 0 ? { breach: { die: plan.breach.die, roll: breachRoll, vs: plan.breach.vs, skipped } } : {}),
    saveRolls: [],
    saveOn: [],
    damage: 0,
    modelsKilled: 0,
    unitDestroyed: false,
  };
  let refracted = false;
  for (let i = 0; i < hits; i++) {
    const tm = allocate(plan, t);
    if (!tm) break;
    const ap = plan.ap + (crits > 0 ? 1 : 0);
    if (crits > 0) crits -= 1;
    const st = i >= hits - skipped ? null : saveNeeded(s, a, t, tm, ap, melee, nearestAttacker(plan, tm));
    report.saveOn.push(st);
    if (st !== null) {
      const roll = rollD6(s);
      report.saveRolls.push(roll);
      if (roll >= st) continue;
    } else {
      report.saveRolls.push(0);
    }
    let dmg = plan.damage;
    if (!melee && !refracted && reacts(t, "refraction") && !t.reactionsUsed.includes("refraction")) {
      t.reactionsUsed.push("refraction");
      refracted = true;
      dmg = Math.max(0, dmg - 1);
    }
    const dealt = applyDamage(s, t, tm, dmg, events);
    report.damage += dealt;
    if (!tm.alive) report.modelsKilled += 1;
    if (t.destroyed) break;
  }
  if (report.damage > 0 && !melee && reacts(a, "sticky-goo") && !t.destroyed) t.status.slowedRounds = 2;
  if (report.damage > 0) corrode(a, t, events);
  if (report.damage > 0) moraleCheck(s, t, events);
  report.unitDestroyed = t.destroyed;
  return report;
}

/** Corrode: an attack from a unit with acid that dealt damage leaves the target's saves one worse this round (no stacking). */
export function corrode(a: Unit, t: Unit, events: GameEvent[]): void {
  if (t.destroyed || t.status.corroded || a.owner === t.owner || !hasAbility(a, "corrode")) return;
  t.status.corroded = true;
  events.push({ type: "ability", uid: a.uid, ability: "corrode", text: `${profileOf(a).name}'s acid eats into ${profileOf(t).name}: its saves are one worse this round.` });
}

/** Apply damage to one model (shields first). Returns damage dealt. Handles deaths and reactions. */
export function applyDamage(s: GameState, t: Unit, tm: Model, dmg: number, events: GameEvent[], fromPop = false): number {
  const dealt = Math.min(dmg, tm.hp + tm.shield);
  if (dealt <= 0) return 0;
  const toShield = Math.min(tm.shield, dealt);
  tm.shield -= toShield;
  tm.hp -= dealt - toShield;
  t.status.hurt = true;
  if (tm.hp <= 0) killModel(s, t, tm, events, fromPop);
  return dealt;
}

function killModel(s: GameState, t: Unit, tm: Model, events: GameEvent[], fromPop: boolean): void {
  tm.alive = false;
  tm.hp = 0;
  tm.shield = 0;
  concedeSupply(s, t, events);
  if (reacts(t, "pop") && !fromPop) {
    for (const e of onBoard(s)) {
      if (e.owner === t.owner) continue;
      for (const em of aliveModels(e)) {
        if (modelGap(t, tm, e, em) > ENGAGE_RANGE) continue;
        if (rollD6(s) >= 5) {
          applyDamage(s, e, em, 1, events, true);
          events.push({ type: "ability", uid: t.uid, ability: "pop", text: `Pop! A ${profileOf(t).name} bursts on ${profileOf(e).name}.` });
        }
      }
    }
  }
  if (!aliveModels(t).length) destroyUnit(s, t, tm, events);
}

/**
 * A unit spends itself (a suicide attack): every model is gone at once. The enemy scores no kill VP
 * for it (they didn't do it), but it still counts as destroyed for "destroyed supply" scoring.
 */
export function sacrifice(s: GameState, t: Unit, events: GameEvent[]): void {
  t.supplyPaid = profileOf(t).supply;
  const ms = aliveModels(t);
  for (const m of ms) {
    m.alive = false;
    m.hp = 0;
    m.shield = 0;
  }
  if (ms.length) destroyUnit(s, t, ms[ms.length - 1]!, events);
}

function destroyUnit(s: GameState, t: Unit, last: Model, events: GameEvent[]): void {
  t.destroyed = true;
  t.onBoard = false;
  const payback = consumeReaction(s, t.owner, "friendlyDestroyed", events);
  if (payback?.kind === "retaliate") {
    for (const e of onBoard(s)) {
      if (e.owner === t.owner) continue;
      for (const em of aliveModels(e)) {
        if (!t.models.some((m) => modelGap(t, m, e, em) <= ENGAGE_RANGE)) continue;
        if (rollD6(s) >= payback.hit) applyDamage(s, e, em, payback.damage, events, true);
      }
    }
  }
  for (const f of s.flags) {
    if (f.carrier === t.uid) {
      f.carrier = null;
      f.pos = { ...last.pos };
      events.push({ type: "flag", team: f.team, text: `${profileOf(t).name} drops the snack!` });
    }
  }
}

/**
 * Record the supply a unit has just lost and, in missions that pay for kills, give the enemy its VP
 * at once: a squad pays out bit by bit as its supply drops, not only when its last model dies.
 */
function concedeSupply(s: GameState, t: Unit, events: GameEvent[]): void {
  const lost = supplyLost(t);
  const paid = t.supplyPaid ?? 0;
  if (lost <= paid) return;
  // the side's running total, so fractional rates (1 VP per 2 supply) pay out as the total crosses each step
  const before = s.units.reduce((n, u) => n + (u.owner === t.owner ? (u.supplyPaid ?? 0) : 0), 0);
  t.supplyPaid = lost;
  const after = before + lost - paid;
  const enemy = t.owner === 0 ? 1 : 0;
  const gone = !aliveModels(t).length;
  for (const rule of MISSIONS[s.missionId]!.scoring) {
    if (rule.kind !== "eliminate") continue;
    const vp = Math.floor(after * rule.vpPerSupply + 1e-9) - Math.floor(before * rule.vpPerSupply + 1e-9);
    if (vp <= 0) continue;
    s.players[enemy].vp += vp;
    events.push({ type: "scored", player: enemy, vp, reason: `${gone ? "destroying" : "cutting down"} ${profileOf(t).name}` });
  }
}

// ---------- indirect fire (mortars, Barrage) ----------

/** Where an indirect shot at a unit is aimed: the target model nearest the middle of the unit. */
export function shellAim(t: Unit): Vec {
  const ms = aliveModels(t);
  const c = { x: ms.reduce((n, m) => n + m.pos.x, 0) / ms.length, y: ms.reduce((n, m) => n + m.pos.y, 0) / ms.length };
  return ms.reduce((best, m) => (dist(m.pos, c) < dist(best.pos, c) ? m : best)).pos;
}

/**
 * Can any of the firing unit's models see the spot? Then a miss drifts only half as far. With Radio
 * Spotter, any friendly unit's eyes on the spot count.
 */
export function shellSpotted(s: GameState, a: Unit, aim: Vec): boolean {
  const elev = platformAt(s, aim) ? 1 : 0;
  const lookers = hasAbility(a, "radio-spotting") ? onBoard(s, a.owner) : [a];
  return lookers.some((u) => aliveModels(u).some((m) => lineOfSight(s, m.pos, m.elevation, aim, elev)));
}

/** The odds for one shell: the chance it lands on target, and the furthest it can drift if it doesn't. */
export function shellOdds(need: number, spotted: boolean, scatter = true): { onTarget: number; maxDrift: number } {
  if (!scatter) return { onTarget: 1, maxDrift: 0 };
  return { onTarget: Math.max(0, Math.min(1, (7 - need) / 6)), maxDrift: spotted ? Math.ceil(SHELL_DRIFT / 2) : SHELL_DRIFT };
}

/**
 * Lob one shell at `aim`: on a d6 of `need`+ it lands there; otherwise it drifts d6" (halved, rounding
 * up, when a firing model can see the spot) in a random direction, staying on the table.
 */
export function scatterShell(s: GameState, a: Unit, weapon: string, aim: Vec, need: number, events: GameEvent[]): Vec {
  if (!rulesOf(s).scatter) return aim; // house rule: shells always land where aimed
  const spotted = shellSpotted(s, a, aim);
  const roll = rollD6(s);
  let landed = aim;
  let drift = 0;
  if (roll < need) {
    const d = rollD6(s);
    drift = spotted ? Math.ceil(d / 2) : d;
    const [v, next] = nextRandom(s.rng);
    s.rng = next;
    const angle = v * Math.PI * 2;
    landed = {
      x: Math.max(0, Math.min(s.board.width, aim.x + Math.cos(angle) * drift)),
      y: Math.max(0, Math.min(s.board.height, aim.y + Math.sin(angle) * drift)),
    };
  }
  events.push({ type: "scatter", uid: a.uid, weapon, aim, landed, roll, need, drift, spotted });
  return landed;
}

/**
 * The evade a lobbed shell's target rolls: its card's blast situations, or (Dodge unseen shells house
 * rule) its own evade when none of the firing models could see it.
 */
export function shellEvade(s: GameState, t: Unit, seen: boolean): number | null {
  if (!seen && rulesOf(s).unseenEvade) return ownEvade(t);
  return evadeTarget(t, defaultConditions("barrage"));
}

/** Can the shell's spotters (the firing unit, or with Radio Spotter every friendly unit) see any of these models? */
export function shellSeen(s: GameState, a: Unit | undefined, models: Model[]): boolean {
  if (!a) return false;
  const lookers = hasAbility(a, "radio-spotting") ? onBoard(s, a.owner) : a.onBoard && !a.destroyed ? [a] : [];
  return lookers.some((u) => aliveModels(u).some((m) => models.some((tm) => lineOfSight(s, m.pos, m.elevation, tm.pos, tm.elevation))));
}

/** A shell bursting at `p`: every model of every ground unit under it is rolled for, friend or foe. */
export function burstAt(s: GameState, a: Unit, weapon: string, p: Vec, e: { hit: number; damage: number; ap: number }, events: GameEvent[]): void {
  for (const t of onBoard(s)) {
    if (isFlying(t)) continue;
    const r = profileOf(t).baseRadius;
    const caught = aliveModels(t).filter((m) => dist(m.pos, p) <= SHELL_BURST + r);
    if (!caught.length) continue;
    const at = events.length; // the attack is logged ahead of the damage and morale it causes
    const rolled = blastOn(s, t, caught, { ...e, seen: shellSeen(s, a, caught) }, events);
    if (rolled.damage > 0) moraleCheck(s, t, events);
    // Sticky Goo slows whoever the burst hurt, friend or foe.
    if (rolled.damage > 0 && reacts(a, "sticky-goo") && !t.destroyed) t.status.slowedRounds = 2;
    if (rolled.damage > 0) corrode(a, t, events);
    events.splice(at, 0, {
      type: "attack",
      report: { uid: a.uid, target: t.uid, weapon, kind: "barrage", attackers: 1, hitOn: e.hit, ...rolled, unitDestroyed: t.destroyed },
    });
  }
}

/** Expected damage to `t` from an indirect plan (previews and the AI): a burst on target, discounted for drift. */
function expectedShells(s: GameState, a: Unit, t: Unit, plan: AttackPlan): number {
  const aim = shellAim(t);
  const spotted = shellSpotted(s, a, aim);
  const { onTarget } = shellOdds(plan.hitOn, spotted, rulesOf(s).scatter);
  const r = radiusOf(t);
  const evadeOn = rulesOf(s).evade ? shellEvade(s, t, shellSeen(s, a, aliveModels(t))) : null;
  let burst = 0;
  for (const m of aliveModels(t)) {
    if (dist(m.pos, aim) > SHELL_BURST + r) continue;
    const save = saveNeeded(s, t, t, m, plan.ap, false);
    const through = pAtLeast(plan.hitOn) * (evadeOn === null ? 1 : 1 - pAtLeast(evadeOn)) * (save === null ? 1 : 1 - pAtLeast(save));
    burst += through * Math.min(plan.damage, m.hp + m.shield);
  }
  // A shell that drifts still catches the edge of the unit now and then.
  const drifted = spotted ? 0.35 : 0.15;
  return plan.attackers.length * burst * (onTarget + (1 - onTarget) * drifted);
}

// ---------- barrage markers ----------

/** The gun a unit lays its barrage with: its lobbed gun, or (Barrage Shells) its hardest-hitting gun that can hit the ground. */
export function barrageGun(p: UnitProfile): Weapon | undefined {
  const ranged = p.weapons.filter((w) => !w.melee && w.targets !== "air");
  return ranged.find((w) => w.traits?.includes("indirect")) ?? [...ranged].sort((a, b) => b.dice * b.damage - a.dice * a.damage)[0];
}

/** How far from its marker a barrage reaches. */
export const barrageRadius = (u: Unit): number => (hasAbility(u, "wide-barrage") ? WIDE_BARRAGE_RADIUS : BARRAGE_RADIUS);

/** The marker `u` would lay at `pos` (before any scatter), or null if it has no gun to lay one with. */
export function barrageMarkerFor(u: Unit, pos: Vec): BarrageMarker | null {
  const w = barrageGun(profileOf(u));
  if (!w) return null;
  // Dice are per model, like a shot: a three-tube battery lays three times the shells.
  return { uid: u.uid, owner: u.owner, weapon: w.name, pos, radius: barrageRadius(u), dice: w.dice * Math.max(1, aliveModels(u).length), damage: w.damage, ap: w.ap ?? 0 };
}

/** The models of `t` a marker catches (ground units only: base edge within the radius). */
export function markerCatches(mk: BarrageMarker, t: Unit): Model[] {
  if (isFlying(t)) return [];
  const r = profileOf(t).baseRadius;
  return aliveModels(t).filter((m) => dist(m.pos, mk.pos) <= mk.radius + r + 1e-9);
}

/**
 * A barrage coming down on a unit it caught: the gun's dice are all hits, spread over the caught
 * models in turn; each may be evaded (blast situations, or its own evade if unseen), then saved.
 */
export function barrageOn(
  s: GameState,
  a: Unit | undefined,
  mk: BarrageMarker,
  t: Unit,
  caught: Model[],
  events: GameEvent[],
): Pick<AttackReport, "hitRolls" | "evadeRolls" | "evadeOn" | "saveRolls" | "saveOn" | "damage" | "modelsKilled"> {
  const evadeOn = rulesOf(s).evade ? shellEvade(s, t, shellSeen(s, a, caught)) : null;
  const evadeRolls: number[] = [];
  const saveRolls: number[] = [];
  const saveOn: (number | null)[] = [];
  let damage = 0;
  let modelsKilled = 0;
  let i = 0;
  for (let d = 0; d < mk.dice; d++) {
    const live = caught.filter((m) => m.alive);
    if (!live.length) break;
    const m = live[i++ % live.length]!;
    if (evadeOn !== null) {
      const ev = rollD6(s);
      evadeRolls.push(ev);
      if (ev >= evadeOn) continue;
    }
    const st = saveNeeded(s, t, t, m, mk.ap, false);
    saveOn.push(st);
    const sv = st === null ? 0 : rollD6(s);
    saveRolls.push(sv);
    if (st !== null && sv >= st) continue;
    damage += applyDamage(s, t, m, mk.damage, events);
    if (!m.alive) modelsKilled += 1;
  }
  const hitRolls = Array.from({ length: mk.dice }, () => 6); // every die is a hit: shown as sixes
  return { hitRolls, ...(evadeOn !== null && evadeRolls.length ? { evadeRolls, evadeOn } : {}), saveRolls, saveOn, damage, modelsKilled };
}

/** Expected damage a marker does to `t` if it's still there at the end of the assault phase (for the AI and previews). */
export function expectedBarrage(s: GameState, mk: BarrageMarker, t: Unit): number {
  const caught = markerCatches(mk, t);
  if (!caught.length) return 0;
  const a = s.units.find((u) => u.uid === mk.uid);
  const evadeOn = rulesOf(s).evade ? shellEvade(s, t, shellSeen(s, a, caught)) : null;
  const pass = evadeOn === null ? 1 : 1 - pAtLeast(evadeOn);
  let total = 0;
  for (let d = 0; d < mk.dice; d++) {
    const m = caught[d % caught.length]!;
    const save = saveNeeded(s, t, t, m, mk.ap, false);
    total += pass * (save === null ? 1 : 1 - pAtLeast(save)) * Math.min(mk.damage, m.hp + m.shield);
  }
  return Math.min(total, caught.reduce((n, m) => n + m.hp + m.shield, 0));
}

// ---------- shooting into a melee ----------

/**
 * Shooting into a melee without precision: the shooter's own unit fighting the target that the
 * misses go at (the nearest to the shooter), or null if the shot can't stray (precision, or no
 * friends in the melee).
 */
export function strayTarget(s: GameState, a: Unit, t: Unit, w: Weapon): Unit | null {
  if (!rulesOf(s).strays || w.melee || precisionOf(a, w) >= 1 || hasTrait(w, "indirect")) return null;
  const friends = engagedWith(s, t).filter((u) => u.owner === a.owner && u.uid !== a.uid);
  if (!friends.length) return null;
  return friends.reduce((x, y) => (unitGap(a, y) < unitGap(a, x) ? y : x));
}

/** Every missed die rolls again at the friend in the melee, as the same shot. */
export function strayPlan(s: GameState, friend: Unit, plan: AttackPlan, misses: number): AttackPlan {
  return {
    attackers: [{ model: plan.attackers[0]!.model, dice: misses }],
    targets: aliveModels(friend),
    hitOn: plan.hitOn,
    damage: plan.damage,
    ap: plan.ap,
    evadeOn: rulesOf(s).evade ? evadeVsShot(s, friend, ["ranged"]) : null,
  };
}

/** Misses in an attack report (dice below the hit number that precision didn't rescue). */
export const reportMisses = (r: AttackReport): number => Math.max(0, r.hitRolls.filter((x) => x < r.hitOn).length - (r.precisionMoved ?? 0));

/** Expected damage a shot into a melee does to the shooter's own side (for previews and the AI). */
export function expectedStray(s: GameState, a: Unit, t: Unit, w: Weapon, plan: AttackPlan): { friend: Unit; damage: number } | null {
  const friend = strayTarget(s, a, t, w);
  if (!friend) return null;
  const dice = plan.attackers.reduce((n, x) => n + x.dice, 0);
  const misses = dice * (1 - pAtLeast(plan.hitOn));
  const fp = strayPlan(s, friend, plan, Math.max(1, Math.round(misses)));
  const perDie = expectedDamage(s, a, friend, fp, false) / Math.max(1, Math.round(misses));
  return { friend, damage: perDie * misses };
}
