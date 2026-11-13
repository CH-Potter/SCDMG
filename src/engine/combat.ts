// Attack resolution: per-model range/sight, keyword bonuses, wound allocation, saves, reactions.

import { MISSIONS } from "./data/missions";
import { dist } from "./geometry";
import { hasAbility, hasKeyword, isFlying, profileOf } from "./profile";
import { rollD6 } from "./rng";
import { aliveModels, ENGAGE_RANGE, meleeCanHit, modelGap, modelsEngage, onBoard, radiusOf } from "./rules";
import { hasCover, lineOfSight } from "./terrain";
import type { AttackReport, GameEvent, GameState, Model, Unit, Weapon } from "./types";

export type AttackKind = AttackReport["kind"];

export interface AttackPlan {
  attackers: { model: Model; dice: number }[];
  targets: Model[];
  hitOn: number;
  damage: number;
  ap: number;
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

export function rangedCanHit(w: Weapon, target: Unit): boolean {
  return isFlying(target) ? w.targets !== "ground" : w.targets !== "air";
}

/** Work out which models can shoot which, or why nobody can. */
export function planShooting(s: GameState, a: Unit, t: Unit, w: Weapon, kind: AttackKind = "shoot"): AttackPlan | string {
  if (w.melee) return "That's a melee weapon";
  if (!rangedCanHit(w, t)) return isFlying(t) ? `${w.name} can't hit flyers` : `${w.name} only hits flyers`;
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
      let dice = w.dice + bonus.dice;
      if (hasAbility(a, "steady-aim") && !a.status.moved) dice += 1;
      attackers.push({ model: am, dice: Math.max(1, dice) });
    }
  }
  if (!attackers.length) return inRange ? "No line of sight" : `Out of range (${w.range}")`;
  return {
    attackers,
    targets: [...targets],
    hitOn: Math.min(6, w.hit + (kind === "overwatch" ? 1 : 0)),
    damage: w.damage + bonus.damage,
    ap: effectiveAp(w, t, bonus.ap),
  };
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
    attackers.push({ model: am, dice: Math.max(1, w.dice + bonus.dice + (a.status.charged ? 1 : 0)) });
  }
  if (!attackers.length) return "Not in base contact with that unit";
  return { attackers, targets: [...targets], hitOn: w.hit, damage: w.damage + bonus.damage, ap: effectiveAp(w, t, bonus.ap) };
}

/** The save roll a model needs (null = no save). */
export function saveNeeded(s: GameState, a: Unit, t: Unit, tm: Model, ap: number, melee: boolean, from?: Model): number | null {
  let save = profileOf(t).armor + ap;
  if (!melee) {
    if (from && hasCover(s, from.pos, from.elevation, t, tm)) save -= 1;
    if (t.status.hunkered) save -= hasAbility(t, "entrenched") ? 2 : 1;
  }
  save = Math.max(2, save);
  void a;
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
  return Math.min(cap, dice * pAtLeast(plan.hitOn) * pFail * perHit);
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
  const melee = kind === "fight";
  const dice = plan.attackers.reduce((sum, x) => sum + x.dice, 0);
  const hitRolls = Array.from({ length: dice }, () => rollD6(s));
  const hits = hitRolls.filter((r) => r >= plan.hitOn).length;
  const report: AttackReport = {
    uid: a.uid,
    target: t.uid,
    weapon: weaponName,
    kind,
    attackers: plan.attackers.length,
    hitRolls,
    hitOn: plan.hitOn,
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
    const st = saveNeeded(s, a, t, tm, plan.ap, melee, nearestAttacker(plan, tm));
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
  for (const f of s.flags) {
    if (f.carrier === t.uid) {
      f.carrier = null;
      f.pos = { ...last.pos };
      events.push({ type: "flag", team: f.team, text: `${profileOf(t).name} drops the snack!` });
    }
  }
  const mission = MISSIONS[s.missionId]!;
  for (const rule of mission.scoring) {
    if (rule.kind === "eliminate") {
      const enemy = t.owner === 0 ? 1 : 0;
      const vp = profileOf(t).supply * rule.vpPerSupply;
      s.players[enemy].vp += vp;
      events.push({ type: "scored", player: enemy, vp, reason: `destroying ${profileOf(t).name}` });
    }
  }
}
