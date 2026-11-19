// Off-board supports: command points (CP), playing support abilities as free actions,
// summoned structures, and the round refresh. Reactions live in reactions.ts.

import { blastOn, moraleCheck, isFearless, nerveTest } from "./combat";
import { SUPPORTS, supportOf } from "./data/factions";
import { planUnitMove, reviveSpot } from "./formation";
import { dist, ngon } from "./geometry";
import { hasAbility, isFlying, profileFor, profileOf } from "./profile";
import { REACTION_TRIGGER, abilityOf } from "./reactions";
import { aliveModels, canAffordDeploy, concealment, isEngaged, onBoard, unitById, unitGap, HOME_EXCLUSION, nearEnemyHome } from "./rules";
import { lineOfSight, platformAt } from "./terrain";
import type { Command, GameEvent, GameState, PlayerId, SupportAbilityDef, SupportEffect, Unit, UnitStatus, Vec } from "./types";

import { CP_CAP } from "./constants";
import { cardBound, spendCp, syncCardCp } from "./cp";
import { rulesOf } from "./houseRules";
export { CP_CAP };
const BURROW_EXIT_RANGE = 3;

export const freshStatus = (round = 0): UnitStatus => ({
  acted: false,
  moved: false,
  disengaged: false,
  hunkered: false,
  charged: false,
  fought: false,
  hurt: false,
  slowedRounds: 0,
  deployedRound: round,
  meleeBonus: 0,
  rangedBonus: 0,
  braced: false,
  shaken: false,
  abilityUsed: false,
  reckless: false,
  spotted: false,
  hasted: 0,
  provoking: false,
});

export const cpPerRound = (ids: { id: string }[]): number => ids.reduce((sum, x) => sum + (SUPPORTS[x.id]?.cp ?? 0), 0);

/** Player support state at the start of a game. */
export function initialSupports(ids: string[]): { cp: number; supports: { id: string; exhausted: boolean }[]; armed: [] } {
  const supports = ids.filter((id) => SUPPORTS[id]).map((id) => ({ id, exhausted: false }));
  return { cp: Math.min(CP_CAP, cpPerRound(supports)), supports, armed: [] };
}

export const isStructure = (u: Unit): boolean => !!profileOf(u).structure;

/** What the support ability needs as a target. */
export function supportTarget(a: SupportAbilityDef): "none" | "friendlyUnit" | "enemyUnit" | "point" | "reservePoint" | "unitPoint" {
  switch (a.effect.kind) {
    case "heal":
    case "recharge":
    case "meleeBuff":
    case "rangedBuff":
    case "aimBuff":
    case "regrow":
    case "dugIn":
    case "smoke":
    case "overwatch":
    case "haste":
    case "resonate":
    case "overshield":
      return "friendlyUnit";
    case "teleport":
      return "unitPoint";
    case "slow":
    case "rattle":
    case "spot":
    case "blind":
    case "expose":
    case "silence":
      return "enemyUnit";
    case "airdrop":
      return "reservePoint";
    case "blast":
    case "summon":
      return "point";
    default:
      return "none";
  }
}

export const isReaction = (a: SupportAbilityDef): boolean => REACTION_TRIGGER[a.effect.kind] !== undefined;

/** Null if `player` could play this ability right now (ignoring the target), otherwise why not. */
export function canPlaySupport(s: GameState, player: PlayerId, supportId: string, abilityId: string): string | null {
  if (s.over) return "The game is over";
  if (s.activePlayer !== player) return "Not your turn";
  if (s.phase === "scoring") return "Not during scoring";
  const pl = s.players[player];
  const card = pl.supports.find((c) => c.id === supportId);
  const ability = abilityOf(supportId, abilityId);
  if (!card || !ability) return "You don't have that support";
  if (card.exhausted) return "That support is exhausted until next round";
  if (pl.cp < ability.cp) return `Needs ${ability.cp} CP (you have ${pl.cp})`;
  if (ability.timing !== "any" && ability.timing !== s.phase) return `Only in the ${ability.timing} phase`;
  const fromRound = ability.effect.kind === "airdrop" || ability.effect.kind === "summon" ? ability.effect.fromRound : undefined;
  if (fromRound && s.round < fromRound) return `Not before round ${fromRound}`;
  if (ability.effect.kind === "rattle" && !rulesOf(s).morale) return "Morale is switched off in this game";
  const trigger = REACTION_TRIGGER[ability.effect.kind];
  if (trigger && pl.armed.some((a) => a.trigger === trigger)) return "A reaction like that is already armed";
  return null;
}

/** Deployment zones for a unit: the spawn zone, plus field-deploy and burrow-exit areas. */
export function deployZones(s: GameState, unit: Unit): Vec[][] {
  const zones = [...s.spawn[unit.owner]];
  const prof = profileOf(unit);
  const friends = onBoard(s, unit.owner);
  if (prof.structure?.fieldDeploy) {
    for (const f of friends) {
      if (isStructure(f)) continue;
      const r = profileOf(f).baseRadius;
      for (const m of aliveModels(f)) zones.push(ngon(m.pos.x, m.pos.y, prof.structure.fieldDeploy + r, 12));
    }
  }
  for (const f of friends) {
    if (!hasAbility(f, "burrow-exit")) continue;
    const r = profileOf(f).baseRadius;
    for (const m of aliveModels(f)) zones.push(ngon(m.pos.x, m.pos.y, BURROW_EXIT_RANGE + r + prof.baseRadius, 12));
  }
  return zones;
}

function nearestFriendlyDistance(s: GameState, player: PlayerId, p: Vec): number {
  let best = Infinity;
  for (const u of onBoard(s, player)) for (const m of aliveModels(u)) best = Math.min(best, dist(m.pos, p));
  return best;
}

type AirdropEffect = Extract<SupportEffect, { kind: "airdrop" }>;

/**
 * Null if an airdrop could land a unit whose leader stands at `p`, otherwise why not. This checks
 * the spot only; playing the support also checks where the whole squad ends up.
 */
export function airdropSpotProblem(s: GameState, player: PlayerId, e: AirdropEffect, p: Vec): string | null {
  if (e.fromRound && s.round < e.fromRound) return `Not before round ${e.fromRound}`;
  if (p.x < 0 || p.y < 0 || p.x > s.board.width || p.y > s.board.height) return "Must land on the table";
  if (!e.anywhere && nearestFriendlyDistance(s, player, p) > e.range) return `Must be within ${e.range}" of one of your models`;
  if (nearEnemyHome(s, player, p)) return `Can't drop within ${HOME_EXCLUSION}" of the enemy's home objective`;
  for (const en of onBoard(s)) {
    if (en.owner === player) continue;
    const r = profileOf(en).baseRadius;
    if (aliveModels(en).some((m) => dist(m.pos, p) - r < e.minEnemyDistance)) return `Must land at least ${e.minEnemyDistance}" from enemies`;
  }
  return null;
}

function heal(s: GameState, t: Unit, amount: number, revive: boolean): number {
  const prof = profileOf(t);
  let left = amount;
  if (revive) {
    const dead = t.models.find((m) => !m.alive);
    const spot = dead && reviveSpot(s, t);
    if (dead && spot) {
      Object.assign(dead, { alive: true, hp: 1, shield: 0, pos: spot.pos, elevation: spot.elevation });
      left -= 1;
    }
  }
  for (; left > 0; left--) {
    const m = aliveModels(t)
      .filter((x) => x.hp < prof.hp)
      .sort((a, b) => a.hp - b.hp)[0];
    if (!m) break;
    m.hp += 1;
  }
  return amount - left;
}

/**
 * Regrowth: up to `n` lost models crawl back into `t` at 1 HP, each next to the squad. Returns how
 * many came back. Shared by the Munch's regrow support effect and the Hatchlings ability.
 */
export function regrowModels(s: GameState, t: Unit, n: number): number {
  let back = 0;
  for (; back < n; back++) {
    const dead = t.models.find((m) => !m.alive);
    const spot = dead && reviveSpot(s, t);
    if (!dead || !spot) break;
    Object.assign(dead, { alive: true, hp: 1, shield: 0, pos: spot.pos, elevation: spot.elevation });
  }
  return back;
}

/** Null if a teleport support could move `u` with its leader landing at `p`, otherwise why not (spot check only). */
export function teleportProblem(s: GameState, player: PlayerId, e: Extract<SupportEffect, { kind: "teleport" }>, u: Unit, p: Vec): string | null {
  if (!u.onBoard || u.owner !== player) return "Pick one of your units on the table";
  if (isStructure(u)) return "Structures can't be moved";
  if (isEngaged(s, u)) return "Can't move an engaged unit";
  const leader = aliveModels(u)[0];
  if (!leader) return "Pick one of your units on the table";
  if (p.x < 0 || p.y < 0 || p.x > s.board.width || p.y > s.board.height) return "Must land on the table";
  if (dist(leader.pos, p) > e.range) return `Too far (${e.range}")`;
  return null;
}
/** Create a summoned unit (e.g. a temporary structure) at `point`. Returns the unit or an error. */
export function summon(s: GameState, player: PlayerId, profileId: string, point: Vec): Unit | string {
  const prof = profileFor(profileId, []);
  const unit: Unit = {
    uid: `p${player}-x${s.units.length}`,
    profileId,
    upgrades: [],
    owner: player,
    models: Array.from({ length: prof.models }, (_, id) => ({ id, pos: { ...point }, elevation: 0, hp: prof.hp, shield: prof.shield, alive: true })),
    onBoard: true,
    destroyed: false,
    status: { ...freshStatus(s.round), acted: true },
    abilityUses: {},
    reactionsUsed: [],
    summoned: true,
    expiresRound: prof.structure?.lifetime === "round" ? s.round : undefined,
  };
  s.units = [...s.units, unit];
  const plan = planUnitMove(s, unit, 0, point, { allowance: 0, teleport: true });
  if (typeof plan === "string") {
    s.units = s.units.filter((u) => u !== unit);
    return plan;
  }
  for (const p of plan.placements) {
    const m = unit.models.find((x) => x.id === p.modelId)!;
    m.pos = { ...p.pos };
    m.elevation = p.elevation;
  }
  if (isEngaged(s, unit)) {
    s.units = s.units.filter((u) => u !== unit);
    return "Can't place that in base contact";
  }
  return unit;
}

/** Play a support ability (a free action). Mutates `s`; returns an error string or null. */
export function playSupport(s: GameState, cmd: Extract<Command, { type: "support" }>, events: GameEvent[]): string | null {
  const why = canPlaySupport(s, cmd.player, cmd.support, cmd.ability);
  if (why) return why;
  const pl = s.players[cmd.player];
  const ability = abilityOf(cmd.support, cmd.ability)!;
  const card = supportOf(cmd.support);
  const e = ability.effect;
  const target = cmd.target ? unitById(s, cmd.target) : undefined;
  const need = supportTarget(ability);
  if (need === "friendlyUnit" && (!target || !target.onBoard || target.owner !== cmd.player)) return "Pick one of your units";
  if (need === "enemyUnit" && (!target || !target.onBoard || target.owner === cmd.player)) return "Pick an enemy unit";
  if (need === "enemyUnit" && target) {
    const concealed = concealment(s, null, target);
    if (concealed) return concealed;
  }
  if (need === "point" && !cmd.point) return "Pick a point";
  if (need === "reservePoint") {
    if (!target || target.onBoard || target.destroyed || target.owner !== cmd.player) return "Pick a unit from your reserves";
    if (!cmd.point) return "Pick where to drop it";
  }
  if (need === "unitPoint") {
    if (!target || !target.onBoard || target.owner !== cmd.player) return "Pick one of your units";
    if (!cmd.point) return "Pick where it goes";
  }
  let text = `${card.name}: ${ability.name}.`;

  switch (e.kind) {
    case "resources":
      pl.resources += e.amount;
      text = `${card.name}: ${ability.name} (+${e.amount} resources).`;
      break;
    case "heal": {
      const n = heal(s, target!, e.amount, !!e.revive);
      if (n === 0) return "Nothing to heal there";
      text = `${card.name}: ${ability.name} patches up ${profileOf(target!).name}.`;
      break;
    }
    case "recharge": {
      const max = profileOf(target!).shield;
      if (!max || aliveModels(target!).every((m) => m.shield >= max)) return "No shields to recharge";
      target!.models = target!.models.map((m) => (m.alive ? { ...m, shield: max } : m));
      text = `${card.name}: ${profileOf(target!).name}'s shields flare back up.`;
      break;
    }
    case "meleeBuff":
      target!.status.meleeBonus += e.dice;
      text = `${card.name}: ${profileOf(target!).name} gets +${e.dice} melee dice this round.`;
      break;
    case "rangedBuff":
      target!.status.rangedBonus += e.dice;
      text = `${card.name}: ${profileOf(target!).name} gets +${e.dice} ranged dice this round.`;
      break;
    case "aimBuff": {
      const st = target!.status;
      st.precisionBonus = (st.precisionBonus ?? 0) + e.precision;
      st.trackingBonus = (st.trackingBonus ?? 0) + e.tracking;
      const parts = [e.precision ? `precision +${e.precision}` : "", e.tracking ? `tracking +${e.tracking}` : ""].filter(Boolean).join(" and ");
      text = `${card.name}: ${profileOf(target!).name} gets ${parts} this round.`;
      break;
    }
    case "regrow": {
      const n = regrowModels(s, target!, e.models);
      if (n === 0) return "That unit has no lost models to regrow";
      text = `${card.name}: ${ability.name}! ${n} ${n === 1 ? "critter crawls" : "critters crawl"} back into ${profileOf(target!).name}.`;
      break;
    }
    case "dugIn": {
      const st = target!.status;
      if (st.dugIn) return "That unit is already dug in";
      if (isStructure(target!)) return "Structures can't dig in";
      st.dugIn = e.save;
      text = `${card.name}: ${profileOf(target!).name} digs in (+${e.save} save against shooting this round).`;
      break;
    }
    case "teleport": {
      const u = target!;
      const p = cmd.point!;
      const why = teleportProblem(s, cmd.player, e, u, p);
      if (why) return why;
      const plan = planUnitMove(s, u, aliveModels(u)[0]!.id, p, { allowance: 0, teleport: true });
      if (typeof plan === "string") return plan;
      const was = u.models.map((m) => ({ ...m, pos: { ...m.pos } }));
      for (const at of plan.placements) {
        const m = u.models.find((x) => x.id === at.modelId)!;
        m.pos = { ...at.pos };
        m.elevation = at.elevation;
      }
      if (isEngaged(s, u)) {
        u.models = was;
        return "Can't land in base contact";
      }
      // A carried snack or cargo stays where the unit stood.
      for (const f of s.flags) {
        if (f.carrier !== u.uid) continue;
        f.carrier = null;
        f.pos = { ...was.find((m) => m.alive)!.pos };
        events.push({ type: "flag", team: f.team, text: `${profileOf(u).name} steps through the light and drops the ${f.cargo ? "cargo" : "snack"}!` });
      }
      u.status.moved = true;
      events.push({ type: "moved", uid: u.uid, kind: "teleport" });
      text = `${card.name}: ${ability.name}! ${profileOf(u).name} steps through a gate of light.`;
      break;
    }
    case "spot":
    case "blind":
    case "silence": {
      const t = target!;
      const near = aliveModels(t).some((m) => nearestFriendlyDistance(s, cmd.player, m.pos) <= e.range);
      if (!near) return `Must be within ${e.range}" of one of your models`;
      const st = t.status;
      const name = profileOf(t).name;
      if (e.kind === "spot") {
        if (st.spotted) return "That unit is already spotted";
        st.spotted = true;
        text = `${card.name}: ${ability.name}! ${name} is spotted: your shots at it hit one better this round.`;
      } else if (e.kind === "blind") {
        if (!profileOf(t).weapons.some((w) => !w.melee)) return "That unit has no guns to put off";
        if (st.blinded) return "That unit can already barely see";
        st.blinded = true;
        text = `${card.name}: ${ability.name}! ${name}'s shooting hits one worse this round.`;
      } else {
        if (st.silenced) return "That unit is already silenced";
        st.silenced = true;
        text = `${card.name}: ${ability.name}! ${name} can't use abilities or reactions this round.`;
      }
      break;
    }
    case "expose": {
      const t = target!;
      if (t.status.exposed) return "That unit is already in the light";
      const seen = onBoard(s, cmd.player).some(
        (u) => aliveModels(u).some((m) => aliveModels(t).some((tm) => dist(m.pos, tm.pos) <= e.range && lineOfSight(s, m.pos, m.elevation, tm.pos, tm.elevation))),
      );
      if (!seen) return `None of your models within ${e.range}" can see that unit`;
      t.status.exposed = true;
      text = `${card.name}: ${ability.name}! ${profileOf(t).name} gets no help from cover, hunkering or digging in this round.`;
      break;
    }
    case "smoke": {
      const st = target!.status;
      if (st.smoked) return "That unit is already hidden in dust";
      if (isStructure(target!)) return "Structures can't hide";
      st.smoked = e.range;
      text = `${card.name}: ${ability.name}! ${profileOf(target!).name} vanishes into the dust: only shots from within ${e.range}" can find it this round.`;
      break;
    }
    case "overwatch": {
      const u = target!;
      if (hasAbility(u, "overwatch") || u.status.overwatching) return "That unit is already on overwatch";
      if (!profileOf(u).weapons.some((w) => !w.melee && !w.traits?.includes("indirect"))) return "That unit has no gun to watch with";
      u.status.overwatching = true;
      text = `${card.name}: ${ability.name}! ${profileOf(u).name} watches the approaches (Overwatch this round).`;
      break;
    }
    case "haste": {
      const u = target!;
      if (isStructure(u)) return "Structures can't move";
      if (u.status.acted || s.phase === "combat") return "That unit has nowhere left to go this phase";
      u.status.hasted = (u.status.hasted ?? 0) + e.move;
      text = `${card.name}: ${ability.name}! ${profileOf(u).name} gets +${e.move}" move this round.`;
      break;
    }
    case "resonate": {
      const centre = target!;
      let n = 0;
      for (const u of onBoard(s, cmd.player)) {
        if (u.uid !== centre.uid && unitGap(u, centre) > e.range) continue;
        const max = profileOf(u).shield;
        for (const m of aliveModels(u)) {
          if (m.shield >= max) continue;
          m.shield += 1;
          n += 1;
        }
      }
      if (!n) return "No shields to recharge there";
      text = `${card.name}: ${ability.name}! Shields hum back up on ${n} model${n === 1 ? "" : "s"}.`;
      break;
    }
    case "overshield": {
      for (const m of aliveModels(target!)) m.shield += e.amount;
      text = `${card.name}: ${ability.name}! ${profileOf(target!).name} glows with +${e.amount} shield.`;
      break;
    }
    case "slow": {
      const near = aliveModels(target!).some((m) => nearestFriendlyDistance(s, cmd.player, m.pos) <= e.range);
      if (!near) return `Must be within ${e.range}" of one of your models`;
      target!.status.slowedRounds = 2;
      text = `${card.name}: ${profileOf(target!).name} is slowed.`;
      break;
    }
    case "blast": {
      const p = cmd.point!;
      if (nearestFriendlyDistance(s, cmd.player, p) > e.range) return `Must be within ${e.range}" of one of your models`;
      if (e.needsSight) {
        const elev = platformAt(s, p) ? 1 : 0;
        const seen = onBoard(s, cmd.player).some((u) => aliveModels(u).some((m) => lineOfSight(s, m.pos, m.elevation, p, elev)));
        if (!seen) return "None of your models can see that spot";
      }
      events.push({ type: "support", player: cmd.player, support: cmd.support, ability: cmd.ability, text: `${card.name}: ${ability.name}!` });
      blast(s, cmd.player, p, e, ability.name, events);
      text = "";
      break;
    }
    case "summon": {
      const p = cmd.point!;
      if (nearestFriendlyDistance(s, cmd.player, p) > e.range) return `Must be within ${e.range}" of one of your models`;
      for (const u of onBoard(s)) {
        if (u.owner === cmd.player) continue;
        const r = profileOf(u).baseRadius;
        if (aliveModels(u).some((m) => dist(m.pos, p) - r < e.minEnemyDistance)) return `Must be at least ${e.minEnemyDistance}" from enemies`;
      }
      const sp = profileFor(e.profileId, []);
      if (sp.abilities.includes("burrow-exit") && nearEnemyHome(s, cmd.player, p)) {
        return `Can't open a Gopher Hole within ${HOME_EXCLUSION}" of the enemy's home objective`;
      }
      const made = summon(s, cmd.player, e.profileId, p);
      if (typeof made === "string") return made;
      events.push({ type: "summoned", uid: made.uid });
      text = `${card.name}: ${ability.name}! A ${sp.name} appears.`;
      break;
    }
    case "rattle": {
      const t = target!;
      const near = aliveModels(t).some((m) => nearestFriendlyDistance(s, cmd.player, m.pos) <= e.range);
      if (!near) return `Must be within ${e.range}" of one of your models`;
      if (isFearless(t)) return "That unit never takes nerve tests";
      if (t.status.shaken) return "That unit is already Shaken";
      events.push({ type: "support", player: cmd.player, support: cmd.support, ability: cmd.ability, text: `${card.name}: ${ability.name}!` });
      nerveTest(s, t, events, e.penalty);
      text = "";
      break;
    }
    case "airdrop": {
      const u = target!;
      const p = cmd.point!;
      if (isStructure(u)) return "Structures can't be dropped in";
      const spot = airdropSpotProblem(s, cmd.player, e, p);
      if (spot) return spot;
      const cant = canAffordDeploy(s, u);
      if (cant) return cant;
      const plan = planUnitMove(s, u, aliveModels(u)[0]!.id, p, { allowance: 0, teleport: true });
      if (typeof plan === "string") return plan;
      if (plan.placements.some((at) => nearEnemyHome(s, cmd.player, at.pos))) return `Can't drop within ${HOME_EXCLUSION}" of the enemy's home objective`;
      u.onBoard = true;
      for (const at of plan.placements) {
        const m = u.models.find((x) => x.id === at.modelId)!;
        m.pos = { ...at.pos };
        m.elevation = at.elevation;
      }
      if (onBoard(s).some((en) => en.owner !== cmd.player && unitGap(u, en) < e.minEnemyDistance)) return `Must land at least ${e.minEnemyDistance}" from enemies`;
      pl.resources -= profileOf(u).cost;
      Object.assign(u.status, { acted: true, moved: true, deployedRound: s.round });
      if (e.arrivalShield) for (const m of aliveModels(u)) m.shield += e.arrivalShield;
      events.push({ type: "deployed", uid: u.uid });
      text = e.anywhere
        ? `${card.name}: ${ability.name}! ${profileOf(u).name} touches down.`
        : e.arrivalShield
          ? `${card.name}: ${ability.name}! ${profileOf(u).name} steps out in a blaze of light (+${e.arrivalShield} shield).`
          : `${card.name}: ${ability.name}! ${profileOf(u).name} drops in.`;
      break;
    }
    case "ward":
    case "brace":
    case "retaliate":
      pl.armed = [...pl.armed, { support: cmd.support, ability: cmd.ability, trigger: REACTION_TRIGGER[e.kind]!, expiresRound: s.round }];
      text = `${card.name}: ${ability.name} is armed.`;
      break;
  }
  // Its CP: card-bound, the card can pay for itself (free when it exhausts anyway).
  const paid = spendCp(s, cmd.player, ability.cp, events, { pay: cmd.pay, own: { id: cmd.support, exhausts: !!ability.exhaust } });
  if (paid) return paid;
  if (ability.exhaust) pl.supports = pl.supports.map((c) => (c.id === cmd.support ? { ...c, exhausted: true } : c));
  // An exhausted card's CP is gone for the round too.
  if (cardBound(s)) syncCardCp(pl);
  if (text) events.push({ type: "support", player: cmd.player, support: cmd.support, ability: cmd.ability, text });
  return null;
}

function blast(
  s: GameState,
  player: PlayerId,
  p: Vec,
  e: { radius: number; hit: number; damage: number; ap: number },
  name: string,
  events: GameEvent[],
): void {
  const source = onBoard(s, player)[0];
  for (const t of onBoard(s)) {
    if (t.owner === player || isFlying(t)) continue;
    const r = profileOf(t).baseRadius;
    const caught = aliveModels(t).filter((m) => dist(m.pos, p) <= e.radius + r);
    if (!caught.length) continue;
    const at = events.length; // the attack is logged ahead of the damage and morale it causes
    // The target always gets its save (and blast evade), whether or not the caster has a unit on the table.
    const rolled = blastOn(s, t, caught, e, events);
    if (rolled.damage > 0) moraleCheck(s, t, events);
    events.splice(at, 0, {
      type: "attack",
      report: { uid: source?.uid ?? t.uid, target: t.uid, weapon: name, kind: "barrage", attackers: 1, hitOn: e.hit, ...rolled, unitDestroyed: t.destroyed },
    });
  }
}

/** End of round: gain CP, refresh cards, drop unused reactions, remove temporary structures. */
export function refreshSupports(s: GameState, events: GameEvent[]): void {
  // Card-bound CP doesn't bank: the refreshed cards are the CP. The classic pool adds their CP to the bank.
  const bound = cardBound(s);
  const refresh = (pl: GameState["players"][number]): GameState["players"][number] => {
    const next = { ...pl, cp: Math.min(CP_CAP, pl.cp + cpPerRound(pl.supports)), supports: pl.supports.map((c) => ({ ...c, exhausted: false })), armed: [] };
    if (bound) syncCardCp(next);
    return next;
  };
  s.players = [refresh(s.players[0]), refresh(s.players[1])];
  for (const u of s.units) {
    if (u.onBoard && u.expiresRound !== undefined && u.expiresRound <= s.round) {
      u.onBoard = false;
      u.destroyed = true;
      events.push({ type: "expired", uid: u.uid });
    }
  }
}

/** Is this unit protected by a friendly ward-aura structure? */
export function warded(s: GameState, t: Unit): boolean {
  return onBoard(s, t.owner).some((w) => w.uid !== t.uid && hasAbility(w, "ward-aura") && unitGap(w, t) <= 4);
}
