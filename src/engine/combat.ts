// Attack resolution: per-model range/sight, keyword bonuses, wound allocation, saves, reactions.

import { BLAST_SQUAD } from "./constants";
import { MISSIONS } from "./data/missions";
import { dist } from "./geometry";
import { hasAbility, hasKeyword, isFlying, profileOf } from "./profile";
import { rollD6 } from "./rng";
import { aliveModels, AURA_RANGE, ENGAGE_RANGE, isEngaged, supplyLost, meleeCanHit, modelGap, modelsEngage, onBoard, radiusOf, unitGap, unitsEngage } from "./rules";
import { consumeReaction } from "./reactions";
import { hasCover, lineOfSight } from "./terrain";
import type { AttackReport, EvadeCondition, GameEvent, GameState, Model, Unit, Weapon } from "./types";

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

/** Armour shrugs off 1 AP unless the weapon is specifically built to crack armour. */
function effectiveAp(w: Weapon, target: Unit, bonusAp: number): number {
  const ap = w.ap + bonusAp;
  const antiArmour = (w.bonuses ?? []).some((b) => b.vs === "armoured");
  return hasKeyword(target, "armoured") && !antiArmour ? Math.max(0, ap - 1) : ap;
}

// ---------- precision, tracking, evade, engagement ----------

export const precisionOf = (a: Unit, w: Weapon): number => Math.max(0, (w.precision ?? 0) + (a.status.precisionBonus ?? 0));
export const trackingOf = (a: Unit, w: Weapon): number => Math.max(0, (w.tracking ?? 0) + (a.status.trackingBonus ?? 0));

/** Melee blocks shooting: engaged units only shoot what they're fighting; only precise weapons shoot into a melee. */
export function engagementBlock(s: GameState, a: Unit, t: Unit, w: Weapon): string | null {
  if (isEngaged(s, a)) return unitsEngage(a, t) ? null : "Engaged units can only shoot a unit they're fighting";
  if (isEngaged(s, t) && precisionOf(a, w) < 1) return "That unit is in a melee: only a weapon with precision can pick it out";
  return null;
}

/** The evade target the defender rolls against attacks that count as any of `conditions`, or null if none apply. */
export function evadeTarget(t: Unit, conditions: EvadeCondition[]): number | null {
  const ev = profileOf(t).evade;
  if (!ev || !ev.against.some((c) => conditions.includes(c))) return null;
  return Math.max(2, Math.min(6, ev.target - (t.status.evadeBonus ?? 0)));
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
  if (!rangedCanHit(w, t)) return isFlying(t) ? `${w.name} can't hit flyers` : `${w.name} only hits flyers`;
  if (kind !== "barrage") {
    const blocked = engagementBlock(s, a, t, w);
    if (blocked) return blocked;
  }
  const bonus = weaponBonus(w, t);
  const ra = radiusOf(a);
  const rt = radiusOf(t);
  const attackers: AttackPlan["attackers"] = [];
  const targets = new Set<Model>();
  let inRange = false;
  for (const am of aliveModels(a)) {
    let any = false;
    for (const tm of aliveModels(t)) {
      if (dist(am.pos, tm.pos) - ra - rt > w.range + 1e-6) continue;
      inRange = true;
      if (!lineOfSight(s, am.pos, am.elevation, tm.pos, tm.elevation)) continue;
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
  if (!attackers.length) return inRange ? "No line of sight" : `Out of range (${w.range}")`;
  // Overwatch fires hastily; a friendly Glimmer-style ward near the target makes shots one worse.
  // Torrent weapons hit automatically (shaken, hasty or warded shooters still lose the easy hits).
  let hitOn = Math.min(
    6,
    (hasTrait(w, "torrent") ? 1 : w.hit) +
      (kind === "overwatch" ? 1 : 0) +
      (wardedAgainst(s, t) ? 1 : 0) +
      (hasTrait(w, "heavy") && a.status.moved ? 1 : 0) +
      (a.status.shaken ? 1 : 0),
  );
  // A spotted target is easier to hit, but never better than 2+.
  if (t.status.spotted && hitOn > 2) hitOn -= 1;
  const conditions = shotConditions(s, a, t, w, kind);
  return {
    attackers,
    targets: [...targets],
    hitOn,
    damage: w.damage + bonus.damage,
    ap: effectiveAp(w, t, bonus.ap),
    rending: hasTrait(w, "rending"),
    precision: precisionOf(a, w),
    tracking: trackingOf(a, w),
    evadeOn: conditions ? evadeTarget(t, conditions) : null,
  };
}

/**
 * Impact on charge: every charging model in base contact rolls the unit's impact dice.
 * Ground units can't impact flyers. Returns null if there's no impact to roll.
 */
export function planImpact(a: Unit, t: Unit): AttackPlan | null {
  const imp = profileOf(a).impact;
  if (!imp || !meleeCanHit(a, t, "ground")) return null;
  const attackers: AttackPlan["attackers"] = [];
  const targets = new Set<Model>();
  for (const am of aliveModels(a)) {
    const touching = aliveModels(t).filter((tm) => modelsEngage(a, am, t, tm));
    if (!touching.length) continue;
    touching.forEach((tm) => targets.add(tm));
    attackers.push({ model: am, dice: Math.max(1, imp.dice) });
  }
  if (!attackers.length) return null;
  const asWeapon: Weapon = { name: "Impact", melee: true, range: 0, dice: imp.dice, hit: imp.hit, damage: imp.damage, ap: imp.ap, targets: "ground" };
  return { attackers, targets: [...targets], hitOn: imp.hit, damage: imp.damage, ap: effectiveAp(asWeapon, t, 0), evadeOn: evadeTarget(t, ["melee"]) };
}

export function planMelee(a: Unit, t: Unit, w: Weapon): AttackPlan | string {
  if (!w.melee) return "That's not a melee weapon";
  if (!meleeCanHit(a, t, w.targets)) return `${w.name} can't reach flyers`;
  const bonus = weaponBonus(w, t);
  const attackers: AttackPlan["attackers"] = [];
  const targets = new Set<Model>();
  for (const am of aliveModels(a)) {
    const touching = aliveModels(t).filter((tm) => modelsEngage(a, am, t, tm));
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
    evadeOn: evadeTarget(t, ["melee"]),
  };
}

/** The save roll a model needs (null = no save). */
export function saveNeeded(s: GameState, a: Unit, t: Unit, tm: Model, ap: number, melee: boolean, from?: Model): number | null {
  let save = profileOf(t).armor + ap + (t.status.reckless ? 1 : 0);
  if (!melee) {
    if (from && hasCover(s, from.pos, from.elevation, t, tm, a.uid)) save -= 1;
    if (t.status.hunkered) save -= hasAbility(t, "entrenched") ? 2 : 1;
    save -= t.status.dugIn ?? 0;
  } else if (t.status.braced) {
    save -= 1;
  }
  save = Math.max(2, save);
  return save > 6 ? null : save;
}

const pAtLeast = (n: number): number => Math.max(0, Math.min(1, (7 - n) / 6));

function nearestAttacker(plan: AttackPlan, tm: Model): Model | undefined {
  let best: Model | undefined;
  for (const { model } of plan.attackers) if (!best || dist(model.pos, tm.pos) < dist(best.pos, tm.pos)) best = model;
  return best;
}

/** Expected damage (for the AI and the UI preview), capped at the targetable wounds. */
export function expectedDamage(s: GameState, a: Unit, t: Unit, plan: AttackPlan, melee: boolean): number {
  const dice = plan.attackers.reduce((sum, x) => sum + x.dice, 0);
  const tm = plan.targets[0]!;
  const st = saveNeeded(s, a, t, tm, plan.ap, melee, nearestAttacker(plan, tm));
  const pFail = st === null ? 1 : 1 - pAtLeast(st);
  const perHit = Math.min(plan.damage, profileOf(t).hp + profileOf(t).shield);
  const cap = plan.targets.reduce((sum, m) => sum + m.hp + m.shield, 0);
  const pHit = pAtLeast(plan.hitOn);
  let hits = dice * pHit + Math.min(plan.precision ?? 0, dice * (1 - pHit));
  const evadeOn = plan.evadeOn === undefined ? evadeTarget(t, melee ? ["melee"] : ["ranged"]) : plan.evadeOn;
  if (evadeOn !== null) hits -= Math.max(0, hits * pAtLeast(evadeOn) - (plan.tracking ?? 0));
  return Math.min(cap, hits * pFail * perHit);
}

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
  let hits = hitRolls.filter((r) => r >= plan.hitOn).length;
  // Precision: move missed dice into the hits.
  const precisionMoved = Math.min(plan.precision ?? 0, dice - hits);
  hits += precisionMoved;
  // Evade: the defender rolls one die per hit; tracking cancels successful evades.
  const evadeOn = plan.evadeOn === undefined ? evadeTarget(t, defaultConditions(kind)) : plan.evadeOn;
  let evadeRolls: number[] | undefined;
  let evadesCancelled = 0;
  if (evadeOn !== null && hits > 0) {
    evadeRolls = Array.from({ length: hits }, () => rollD6(s));
    const evaded = evadeRolls.filter((r) => r >= evadeOn).length;
    evadesCancelled = Math.min(plan.tracking ?? 0, evaded);
    hits -= evaded - evadesCancelled;
  }
  let crits = plan.rending ? Math.min(hits, hitRolls.filter((r) => r === 6).length) : 0;
  const report: AttackReport = {
    uid: a.uid,
    target: t.uid,
    weapon: weaponName,
    kind,
    attackers: plan.attackers.length,
    hitRolls,
    hitOn: plan.hitOn,
    ...(precisionMoved ? { precisionMoved } : {}),
    ...(evadeRolls ? { evadeRolls, evadeOn: evadeOn!, evadesCancelled } : {}),
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
    const st = saveNeeded(s, a, t, tm, ap, melee, nearestAttacker(plan, tm));
    report.saveOn.push(st);
    if (st !== null) {
      const roll = rollD6(s);
      report.saveRolls.push(roll);
      if (roll >= st) continue;
    } else {
      report.saveRolls.push(0);
    }
    let dmg = plan.damage;
    if (!melee && !refracted && hasAbility(t, "refraction") && !t.reactionsUsed.includes("refraction")) {
      t.reactionsUsed.push("refraction");
      refracted = true;
      dmg = Math.max(0, dmg - 1);
    }
    const dealt = applyDamage(s, t, tm, dmg, events);
    report.damage += dealt;
    if (!tm.alive) report.modelsKilled += 1;
    if (t.destroyed) break;
  }
  if (report.damage > 0 && !melee && hasAbility(a, "sticky-goo") && !t.destroyed) t.status.slowedRounds = 2;
  if (report.damage > 0) moraleCheck(s, t, events);
  report.unitDestroyed = t.destroyed;
  return report;
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
  if (hasAbility(t, "pop") && !fromPop) {
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
