// The game reducer: createGame() and applyCommand(). Pure and deterministic given the seed.
//
// A round has four phases. In the first three, players alternate activating one unit at a time
// (starting with the player who has initiative); a player with nothing left to do is skipped.
//   movement: deploy from reserves, move, disengage, hunker, hold, movement abilities
//   assault:  shoot, charge, advance, hunker, hold, assault abilities
//   combat:   engaged units fight (units that charged fight first)
//   scoring:  mission scoring and clean-up, then the next round begins

import { ABILITIES } from "./data/abilities";
import { defaultListFor, defaultSupportsFor } from "./data/factions";
import { CP_CAP, MERCY_LEAD } from "./constants";
import { consumeReaction } from "./reactions";
import { canStillRecruit, defaultOpenCap, setupOpenRoster, syncOpenRoster, type ArmyRule } from "./openRoster";
import { deployZones, freshStatus, initialSupports, isStructure, playSupport, refreshSupports, regrowModels } from "./supports";
import { MAPS, type MapDef } from "./data/maps";
import { MISSIONS } from "./data/missions";
import { applyDamage, burstAt, planMelee, planShooting, resolveAttack, planImpact, scatterShell, shellAim, type AttackPlan } from "./combat";
import { planUnitMove, reviveSpot, type UnitMovePlan } from "./formation";
import { dist, segmentNearPolygon } from "./geometry";
import { hasAbility, hasKeyword, isFlying, profileFor, profileOf } from "./profile";
import { rollD6 } from "./rng";
import {
  aliveModels,
  canAffordDeploy,
  effectiveMove,
  eligibleUnits,
  engagedWith,
  ENGAGE_RANGE,
  disengageOdds,
  isEngaged,
  meleeCanHit,
  modelGap,
  onBoard,
  playerHasOptions,
  reserves,
  unitById,
  unitGap,
  unitsEngage,
  HOME_EXCLUSION,
  nearEnemyHome,
} from "./rules";
import { cleanupRound, dropCarriedFlag, economyState, scoreRound, setupMission, updateFlags } from "./scoring";
import { allPlaced, checkPlacement, elevationFor, lineOfSight, type Placed } from "./terrain";
import type {
  AbilityId,
  AttackReport,
  Command,
  CommandResult,
  Elevation,
  FactionId,
  GameEvent,
  GameState,
  ListEntry,
  Model,
  Phase,
  PlayerId,
  Unit,
  Vec,
  Weapon,
} from "./types";

export interface GameSetup {
  factions: [FactionId, FactionId];
  lists?: [ListEntry[], ListEntry[]];
  seed?: number;
  mapId?: string;
  /** Pass a full map (e.g. a custom one from the map builder) instead of a built-in id. */
  map?: MapDef;
  /** Off-board supports for each side (defaults to the faction's starter supports for the mode). */
  supports?: [string[], string[]];
  /**
   * Let the roll-off winner (and later, the trailing player) choose who goes first. The real game
   * and the simulator turn this on; hand-built test scenarios leave it off ("winner goes first").
   */
  orderChoice?: boolean;
  missionId?: string;
  /**
   * "open": an open roster (RTS-style) game. No lists: each side can recruit any buyable unit of
   * its faction, again and again, paying resources and supply as usual. Lists are ignored and each
   * side gets its faction's starter supports for the mode unless `supports` is given. See openRoster.ts.
   */
  armyRule?: ArmyRule;
  /** Open roster: most copies of one unit on the table at once. Default: the mode's max copies; null = no limit. */
  openCap?: number | null;
  /**
   * A small head start for either side (the campaign's place perks): extra starting resources and
   * CP, added on top of the mission's economy. CP stays within the usual cap. Leave it out for a
   * normal game.
   */
  startBonus?: [StartBonus | undefined, StartBonus | undefined];
}

/** Extra starting resources and CP for one side (see `GameSetup.startBonus`). */
export interface StartBonus {
  resources?: number;
  cp?: number;
}

/** A bonus amount as a whole, non-negative number (anything odd counts as nothing). */
const bonusAmount = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/**
 * Resolve an attack and log it ahead of the events it caused (morale tests, abilities such as
 * Refraction), so the dice tray and log show the attack first and its consequences after.
 */
function pushAttack(events: GameEvent[], resolve: (events: GameEvent[]) => AttackReport): void {
  const at = events.length;
  const report = resolve(events);
  events.splice(at, 0, { type: "attack", report });
}

export function createGame(setup: GameSetup): GameState {
  const map = setup.map ?? MAPS[setup.mapId ?? "dustbowl"];
  const mission = MISSIONS[setup.missionId ?? (map?.mode === "assault" ? "frontline" : "hold")];
  if (!map || !mission) throw new Error("Unknown map or mission");
  const open = setup.armyRule === "open";
  const lists: [ListEntry[], ListEntry[]] = open
    ? [[], []]
    : (setup.lists ?? [defaultListFor(setup.factions[0], map.mode), defaultListFor(setup.factions[1], map.mode)]);
  const supportIds = setup.supports ?? [defaultSupportsFor(setup.factions[0], map.mode), defaultSupportsFor(setup.factions[1], map.mode)];
  const startingPlayer = (p: PlayerId): GameState["players"][number] => ({
    ...initialSupports(supportIds[p]),
    resources: mission.startResources,
    supplyCap: mission.startSupply,
    vp: 0,
    passed: false,
  });
  const units: Unit[] = [];
  for (const owner of [0, 1] as const) {
    lists[owner].forEach((entry, i) => {
      const p = profileFor(entry.profileId, entry.upgrades);
      units.push({
        uid: `p${owner}-${i}`,
        profileId: entry.profileId,
        upgrades: [...entry.upgrades],
        owner,
        models: Array.from({ length: p.models }, (_, id) => ({
          id,
          pos: { x: 0, y: 0 },
          elevation: 0,
          hp: p.hp,
          shield: p.shield,
          alive: true,
        })),
        onBoard: false,
        destroyed: false,
        status: freshStatus(0),
        abilityUses: {},
        reactionsUsed: [],
      });
    });
  }
  const objectives = map.objectives.map((o) => ({ ...o, pos: { ...o.pos }, controller: null }));
  const hasFlags = mission.scoring.some((r) => r.kind === "flag");
  const state: GameState = {
    board: { width: map.width, height: map.height },
    mapId: map.id,
    missionId: mission.id,
    round: 1,
    maxRounds: mission.rounds,
    phase: "movement",
    initiative: 0,
    activePlayer: 0,
    factions: setup.factions,
    players: [startingPlayer(0), startingPlayer(1)],
    units,
    terrain: structuredClone(map.terrain),
    access: structuredClone(map.access),
    spawn: structuredClone(map.spawn),
    objectives,
    flags: hasFlags
      ? objectives
          .filter((o) => o.team !== null)
          .map((o) => ({ team: o.team!, home: { ...o.pos }, pos: { ...o.pos }, carrier: null }))
      : [],
    rng: (setup.seed ?? Date.now()) >>> 0,
    over: false,
    winner: null,
  };
  // Initiative roll-off: each side rolls a d6, re-rolling ties. The winner chooses who goes first.
  const { rolls, winner } = rollOff(state);
  state.initiative = winner;
  state.initiativeRolls = rolls;
  state.activePlayer = winner;
  state.orderChoiceRule = setup.orderChoice === true;
  state.orderChoice = setup.orderChoice === true ? { player: winner, reason: "rolloff" } : null;
  state.initiativeClaim = null;
  // Per-role economy, garrisons, live objectives, salvage loads and convoy cargo (scoring.ts).
  setupMission(state);
  setup.startBonus?.forEach((b, p) => {
    if (!b) return;
    const pl = state.players[p as PlayerId];
    pl.resources += bonusAmount(b.resources);
    pl.cp = Math.min(CP_CAP, pl.cp + bonusAmount(b.cp));
  });
  if (open) setupOpenRoster(state, setup.openCap === null ? undefined : (setup.openCap ?? defaultOpenCap(map.mode)));
  return state;
}

const fail = (error: string): CommandResult => ({ ok: false, error });

/** CP cost of the Rally command every army has. */
export const RALLY_CP = 1;

/**
 * Copy a game state for the next step. Everything the reducer can change is copied; the static map
 * (terrain, ramps, spawn zones, board size) and immutable values (positions, which are always
 * replaced rather than edited, and upgrade lists) are shared. Much faster than structuredClone,
 * which matters because the AI simulates hundreds of commands per decision.
 */
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    players: [{ ...s.players[0] }, { ...s.players[1] }],
    units: s.units.map((u) => ({
      ...u,
      models: u.models.map((m) => ({ ...m })),
      status: { ...u.status },
      abilityUses: { ...u.abilityUses },
      reactionsUsed: [...u.reactionsUsed],
    })),
    objectives: s.objectives.map((o) => ({ ...o })),
    flags: s.flags.map((f) => ({ ...f })),
  };
}

export function applyCommand(prev: GameState, cmd: Command): CommandResult {
  if (prev.over) return fail("The game is over");
  const s = cloneState(prev);
  const events: GameEvent[] = [];

  if (s.orderChoice && cmd.type !== "chooseOrder") {
    return fail(s.orderChoice.player === s.activePlayer ? "First choose whether to go first or second" : "Waiting for the order choice");
  }
  if (cmd.type === "chooseOrder") {
    const c = s.orderChoice;
    if (!c) return fail("There's no order to choose right now");
    if (cmd.player !== c.player) return fail("It's not your choice");
    s.initiative = cmd.goFirst ? cmd.player : other(cmd.player);
    s.activePlayer = s.initiative;
    s.orderChoice = null;
    events.push({ type: "orderChosen", player: cmd.player, goFirst: cmd.goFirst, round: s.round });
    if (!playerHasOptions(s, s.activePlayer)) advanceTurn(s, events);
    return { ok: true, state: s, events };
  }

  if (cmd.type === "pass") {
    if (cmd.player !== s.activePlayer) return fail("Not your turn");
    // Passing early (while you could still act) in the movement or combat phase claims the
    // initiative for the next phase, if nobody has claimed it yet.
    if (
      (s.phase === "movement" || s.phase === "combat") &&
      (s.initiativeClaim ?? null) === null &&
      playerHasOptions(s, cmd.player)
    ) {
      s.initiativeClaim = cmd.player;
      events.push({ type: "initiativeClaimed", player: cmd.player, nextPhase: s.phase === "movement" ? "assault" : "movement" });
    }
    s.players[cmd.player].passed = true;
    events.push({ type: "passed", player: cmd.player });
    advanceTurn(s, events);
    return { ok: true, state: s, events };
  }

  if (cmd.type === "rally") {
    if (cmd.player !== s.activePlayer) return fail("Not your turn");
    const t = unitById(s, cmd.target);
    if (!t || !t.onBoard || t.owner !== cmd.player) return fail("Pick one of your units");
    if (!t.status.shaken) return fail("That unit isn't shaken");
    if (s.players[cmd.player].cp < RALLY_CP) return fail(`Rallying costs ${RALLY_CP} CP`);
    s.players[cmd.player].cp -= RALLY_CP;
    t.status.shaken = false;
    events.push({ type: "rallied", uid: t.uid, how: "cp" });
    return { ok: true, state: s, events };
  }

  if (cmd.type === "support") {
    const err = playSupport(s, cmd, events);
    if (err) return fail(err);
    // Units dropped in (or teleported) by a support arrive like any deployment: enemy overwatch and lurkers react.
    const arrived = events.flatMap((e) => (e.type === "deployed" || (e.type === "moved" && e.kind === "teleport") ? [e.uid] : []));
    for (const uid of arrived) {
      const u = unitById(s, uid);
      if (u) react(s, u, events);
    }
    updateFlags(s, events);
    syncOpenRoster(s); // an airdropped recruit is replaced in reserve at once
    checkWipeout(s, events);
    // A free action: the turn only moves on if the player has nothing left to do.
    if (!s.over && !playerHasOptions(s, s.activePlayer)) advanceTurn(s, events);
    return { ok: true, state: s, events };
  }

  const unit = unitById(s, cmd.uid);
  if (!unit || unit.destroyed) return fail("No such unit");
  if (unit.owner !== s.activePlayer) return fail("Not your turn");
  if (s.players[unit.owner].passed) return fail("You've passed this phase");

  const err = perform(s, unit, cmd, events);
  if (err) return fail(err);

  updateFlags(s, events);
  syncOpenRoster(s); // open roster: a deployed recruit is replaced in reserve before the turn moves on
  checkWipeout(s, events);
  // Abilities are free actions inside the unit's activation: the unit still acts, and the turn stays put.
  if (!s.over && cmd.type !== "ability") advanceTurn(s, events);
  return { ok: true, state: s, events };
}

/** Apply one unit activation. Returns an error string, or null on success. Mutates `s`. */
function perform(s: GameState, unit: Unit, cmd: Exclude<Command, { type: "pass" }>, events: GameEvent[]): string | null {
  const phase = s.phase;
  const allowed: Record<Phase, Command["type"][]> = {
    movement: ["deploy", "move", "disengage", "hunker", "hold", "ability"],
    assault: ["shoot", "charge", "advance", "hunker", "hold", "ability"],
    combat: ["fight", "hold"],
    scoring: [],
  };
  if (!allowed[phase].includes(cmd.type)) return `You can't ${cmd.type} in the ${phase} phase`;

  if (cmd.type === "deploy") return deploy(s, unit, cmd.to, events);
  if (!unit.onBoard) return "That unit is still in reserve";
  if (!eligibleUnits(s, unit.owner).includes(unit)) {
    if (unit.status.acted) return "That unit has already acted this phase";
    if (phase === "assault" && isEngaged(s, unit)) return "Engaged units wait for the combat phase";
    if (phase === "assault" && unit.status.hunkered) return "Hunkered units stay put this round";
    if (phase === "assault" && unit.status.disengaged) return "Exhausted from disengaging: it sits out this phase";
    if (phase === "combat") return "That unit can't fight right now";
    return "That unit can't act right now";
  }

  if ((cmd.type === "move" || cmd.type === "advance" || cmd.type === "disengage" || cmd.type === "charge") && isStructure(unit)) {
    return "Structures can't move";
  }

  switch (cmd.type) {
    case "move":
    case "advance": {
      if (isEngaged(s, unit)) return "Engaged units must disengage instead";
      const e = moveUnit(s, unit, cmd.leader, cmd.to, effectiveMove(s, unit), false);
      if (e) return e;
      if (endsEngaged(s, unit)) return "Only a charge can move into base contact";
      events.push({ type: "moved", uid: unit.uid, kind: cmd.type });
      break;
    }
    case "disengage": {
      if (!isEngaged(s, unit)) return "That unit isn't engaged";
      // Outnumbering the enemies in supply means a clean break; otherwise the unit is exhausted.
      const { clean } = disengageOdds(s, unit);
      const e = moveUnit(s, unit, cmd.leader, cmd.to, effectiveMove(s, unit), false);
      if (e) return e;
      if (endsEngaged(s, unit)) return "Must end the move out of base contact";
      unit.status.disengaged = !clean;
      events.push({ type: "moved", uid: unit.uid, kind: "disengage", exhausted: !clean });
      break;
    }
    case "hunker":
      unit.status.hunkered = true;
      events.push({ type: "hunkered", uid: unit.uid });
      break;
    case "hold":
      if (phase === "combat") unit.status.fought = true;
      events.push({ type: "held", uid: unit.uid });
      break;
    case "charge": {
      const e = charge(s, unit, cmd.target, events);
      if (e) return e;
      events.push({ type: "moved", uid: unit.uid, kind: "charge" });
      break;
    }
    case "shoot": {
      const target = unitById(s, cmd.target);
      const w = profileOf(unit).weapons[cmd.weapon];
      if (!target || !target.onBoard || target.owner === unit.owner) return "Pick an enemy unit";
      if (!w) return "No such weapon";
      if (unit.status.disengaged && !hasKeyword(unit, "light")) return "Exhausted from disengaging: only light units can still shoot";
      const plan = planShooting(s, unit, target, w);
      if (typeof plan === "string") return plan;
      const decoy = isEngaged(s, unit) ? undefined : provokedBy(s, unit, w, target);
      if (decoy) return `${profileOf(decoy).name} is provoking this unit: it must shoot that one`;
      if (consumeReaction(s, target.owner, "enemyShoots", events)) plan.hitOn = Math.min(6, plan.hitOn + 1);
      if (plan.indirect) {
        // Lobbed: one shell per firing model, aimed at the target; it may drift, then bursts on everyone under it.
        for (const _ of plan.attackers) {
          const landed = scatterShell(s, unit, w.name, shellAim(target), plan.hitOn, events);
          burstAt(s, unit, w.name, landed, { hit: plan.hitOn, damage: plan.damage, ap: plan.ap }, events);
        }
        break;
      }
      pushAttack(events, (ev) => resolveAttack(s, unit, target, w.name, plan, "shoot", ev));
      break;
    }
    case "fight": {
      const target = unitById(s, cmd.target);
      const w = profileOf(unit).weapons[cmd.weapon];
      if (!target || !target.onBoard || !unitsEngage(unit, target)) return "Not engaged with that unit";
      if (!w) return "No such weapon";
      const plan = planMelee(unit, target, w);
      if (typeof plan === "string") return plan;
      unit.status.fought = true;
      pushAttack(events, (ev) => resolveAttack(s, unit, target, w.name, plan, "fight", ev));
      break;
    }
    case "ability": {
      const e = useAbility(s, unit, cmd.ability, cmd.target, cmd.point, events);
      if (e) return e;
      break;
    }
  }
  if (cmd.type !== "ability") unit.status.acted = true;
  if (cmd.type === "move" || cmd.type === "advance" || cmd.type === "charge" || cmd.type === "disengage") {
    react(s, unit, events);
  }
  return null;
}

function applyPlan(unit: Unit, plan: UnitMovePlan): void {
  for (const p of plan.placements) {
    const m = unit.models.find((x) => x.id === p.modelId)!;
    m.pos = { ...p.pos };
    m.elevation = p.elevation;
  }
  unit.status.moved = true;
}

function moveUnit(s: GameState, unit: Unit, leader: number, to: Vec, allowance: number, teleport: boolean): string | null {
  const plan = planUnitMove(s, unit, leader, to, { allowance, teleport });
  if (typeof plan === "string") return plan;
  applyPlan(unit, plan);
  return null;
}

const endsEngaged = (s: GameState, unit: Unit): boolean => isEngaged(s, unit);

function deploy(s: GameState, unit: Unit, to: Vec, events: GameEvent[]): string | null {
  if (unit.onBoard) return "That unit is already deployed";
  const cant = canAffordDeploy(s, unit);
  if (cant) return cant;
  const leader = unit.models[0]!;
  const plan = planUnitMove(s, unit, leader.id, to, { allowance: 0, teleport: true, zone: deployZones(s, unit) });
  if (typeof plan === "string") return plan;
  unit.onBoard = true;
  applyPlan(unit, plan);
  if (endsEngaged(s, unit)) return "Can't deploy into base contact";
  s.players[unit.owner].resources -= profileOf(unit).cost;
  unit.status.acted = true;
  unit.status.deployedRound = s.round;
  events.push({ type: "deployed", uid: unit.uid });
  react(s, unit, events);
  return null;
}

/** Charge: auto-route the closest model into base contact with the target; the rest pile in. */
function charge(s: GameState, unit: Unit, targetUid: string, events: GameEvent[]): string | null {
  const target = unitById(s, targetUid);
  if (!target || !target.onBoard || target.owner === unit.owner) return "Pick an enemy unit to charge";
  if (unit.status.disengaged) return "Exhausted from disengaging: it can't charge";
  if (unit.status.shaken) return "Shaken units won't charge";
  if (isEngaged(s, unit)) return "Already engaged";
  const melee = profileOf(unit).weapons.filter((w) => w.melee);
  if (!melee.some((w) => meleeCanHit(unit, target, w.targets))) {
    return isFlying(target) ? "Nothing in this unit can reach flyers" : "This unit has no melee weapon";
  }
  const plan = planCharge(s, unit, target);
  if (typeof plan === "string") return plan;
  applyPlan(unit, plan);
  if (!unitsEngage(unit, target)) return "Couldn't reach base contact";
  unit.status.charged = true;
  if (consumeReaction(s, target.owner, "enemyCharges", events)) target.status.braced = true;
  // Impact on charge: slam into the target before the combat phase.
  const impact = planImpact(unit, target);
  if (impact) pushAttack(events, (ev) => resolveAttack(s, unit, target, "Impact", impact, "impact", ev));
  return null;
}

export function planCharge(s: GameState, unit: Unit, target: Unit): UnitMovePlan | string {
  const ra = profileOf(unit).baseRadius;
  const rt = profileOf(target).baseRadius;
  const allowance = effectiveMove(s, unit);
  const flying = isFlying(unit);
  const pairs = aliveModels(unit)
    .flatMap((am) => aliveModels(target).map((tm) => ({ am, tm, d: dist(am.pos, tm.pos) })))
    .filter((p) => flying || isFlying(target) || p.tm.elevation !== 2)
    .sort((a, b) => a.d - b.d)
    .slice(0, 4);
  if (pairs.length && pairs[0]!.d - ra - rt > allowance + ENGAGE_RANGE + 0.01) return `Out of charge range (${allowance}")`;
  const contact = ra + rt + 0.4;
  const pileIn = [{ points: aliveModels(target).map((m) => m.pos), radius: ra + rt + ENGAGE_RANGE - 0.05 }];
  let best: UnitMovePlan | null = null;
  let lastErr = "Can't find a path into base contact";
  for (const { am, tm } of pairs) {
    const base = Math.atan2(am.pos.y - tm.pos.y, am.pos.x - tm.pos.x);
    for (let i = 0; i < 12; i++) {
      const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 6);
      const dest = { x: tm.pos.x + Math.cos(a) * contact, y: tm.pos.y + Math.sin(a) * contact };
      if (!flying && !isFlying(target) && elevationFor(s, unit, dest) !== tm.elevation) continue;
      const plan = planUnitMove(s, unit, am.id, dest, { allowance, pileIn });
      if (typeof plan === "string") {
        lastErr = plan;
        continue;
      }
      if (!best || plan.leaderDistance < best.leaderDistance) best = plan;
      break;
    }
  }
  return best ?? lastErr;
}

// ---------- abilities ----------

function useAbility(
  s: GameState,
  unit: Unit,
  id: AbilityId,
  targetUid: string | undefined,
  point: Vec | undefined,
  events: GameEvent[],
): string | null {
  const def = ABILITIES[id];
  if (!hasAbility(unit, id) || def.kind !== "active") return "This unit doesn't have that ability";
  if (def.phase !== s.phase) return `${def.name} is used in the ${def.phase} phase`;
  const used = unit.abilityUses[id] ?? 0;
  if (def.usesPerGame !== undefined && used >= def.usesPerGame) return `${def.name} is used up`;
  if (unit.status.abilityUsed) return "This unit has already used an ability this phase";
  const cpCost = def.cp ?? 0;
  if (s.players[unit.owner].cp < cpCost) return `${def.name} needs ${cpCost} CP (you have ${s.players[unit.owner].cp})`;
  if (isEngaged(s, unit) && id !== "patch-up") return "Can't do that while engaged";
  const name = profileOf(unit).name;
  const say = (text: string) => events.push({ type: "ability", uid: unit.uid, ability: id, text });

  switch (id) {
    case "patch-up": {
      const t = targetUid ? unitById(s, targetUid) : undefined;
      if (!t || !t.onBoard || t.owner !== unit.owner) return "Pick a friendly unit";
      if (t.uid !== unit.uid && unitGap(unit, t) > (def.range ?? 3)) return `Must be within ${def.range}"`;
      const prof = profileOf(t);
      let heal = 2;
      const dead = t.models.find((m) => !m.alive);
      const spot = dead && reviveSpot(s, t);
      if (dead && spot) {
        Object.assign(dead, { alive: true, hp: 1, shield: 0, pos: spot.pos, elevation: spot.elevation });
        heal -= 1;
      }
      let healed = 2 - heal;
      for (; heal > 0; heal--) {
        const m = aliveModels(t).filter((x) => x.hp < prof.hp).sort((a, b) => a.hp - b.hp)[0];
        if (!m) break;
        m.hp += 1;
        healed += 1;
      }
      if (healed === 0) return "Nothing to patch up";
      say(`${name} patches up ${prof.name}${dead && spot ? " and gets someone back on their feet" : ""}.`);
      break;
    }
    case "hatch": {
      const t = targetUid ? unitById(s, targetUid) : undefined;
      if (!t || !t.onBoard || t.owner !== unit.owner) return "Pick a friendly unit";
      if (t.uid !== unit.uid && unitGap(unit, t) > (def.range ?? 3)) return `Must be within ${def.range}"`;
      const n = regrowModels(s, t, HATCH_MODELS);
      if (n === 0) return "That unit has no lost models to regrow";
      say(`${name} hatches ${n} fresh ${n === 1 ? "critter" : "critters"} into ${profileOf(t).name}.`);
      break;
    }
    case "barrage": {
      if (!point) return "Pick a point";
      const reach = aliveModels(unit).some((m) => dist(m.pos, point) <= (def.range ?? 24));
      if (!reach) return `Out of range (${def.range}")`;
      say(`${name} lobs a barrage!`);
      // Shells can drift (see scatterShell), and burst on everyone under them.
      const landed = scatterShell(s, unit, "Barrage", point, 4, events);
      burstAt(s, unit, "Barrage", landed, { hit: 4, damage: 1, ap: 1 }, events);
      break;
    }
    case "tunnel": {
      if (!point) return "Pick a point";
      if (s.round === 1) return "Tunnelling can't start until round 2";
      if (elevationFor(s, unit, point) !== 0) return "Must pop up on the ground";
      if (nearEnemyHome(s, unit.owner, point)) return `Can't pop up within ${HOME_EXCLUSION}" of the enemy's home objective`;
      dropCarriedFlag(s, unit, events, "burrows away");
      const e = moveUnit(s, unit, aliveModels(unit)[0]!.id, point, 0, true);
      if (e) return e;
      const tooClose = onBoard(s).some((en) => en.owner !== unit.owner && unitGap(unit, en) < 6);
      if (tooClose) return 'Must pop up at least 6" from enemies';
      say(`${name} burrows away and bursts out of the ground!`);
      events.push({ type: "moved", uid: unit.uid, kind: "teleport" });
      react(s, unit, events);
      break;
    }
    case "blink": {
      if (!point) return "Pick a point";
      const leader = aliveModels(unit)[0]!;
      if (dist(leader.pos, point) > (def.range ?? 10)) return `Too far (${def.range}")`;
      dropCarriedFlag(s, unit, events, "blinks away");
      const e = moveUnit(s, unit, leader.id, point, 0, true);
      if (e) return e;
      if (isEngaged(s, unit)) return "Can't blink into base contact";
      say(`${name} blinks across the field!`);
      events.push({ type: "moved", uid: unit.uid, kind: "teleport" });
      react(s, unit, events);
      break;
    }
    case "recall": {
      const t = targetUid ? unitById(s, targetUid) : undefined;
      if (!t || !t.onBoard || t.owner !== unit.owner || t.uid === unit.uid) return "Pick another friendly unit";
      if (unitGap(unit, t) > (def.range ?? 12)) return `Must be within ${def.range}"`;
      if (isEngaged(s, t)) return "Can't recall an engaged unit";
      if (!point) return "Pick where to bring them";
      const near = aliveModels(unit).some((m) => dist(m.pos, point) <= 4 + profileOf(unit).baseRadius);
      if (!near) return 'Must be within 4" of the Warden';
      dropCarriedFlag(s, t, events, "is beamed away");
      const e = moveUnit(s, t, aliveModels(t)[0]!.id, point, 0, true);
      if (e) return e;
      if (isEngaged(s, t)) return "Can't recall into base contact";
      say(`${name} beams ${profileOf(t).name} over!`);
      events.push({ type: "moved", uid: t.uid, kind: "teleport" });
      react(s, t, events);
      break;
    }
    case "grapple": {
      const t = targetUid ? unitById(s, targetUid) : undefined;
      if (!t || !t.onBoard || t.owner === unit.owner) return "Pick an enemy unit";
      if (isStructure(t)) return "Structures can't be reeled in";
      if (hasKeyword(t, "heavy")) return "That unit is too heavy to reel in";
      if (isFlying(t)) return "Can't hook a flyer";
      if (isEngaged(s, t)) return "Can't reel in an engaged unit";
      if (unitGap(unit, t) > (def.range ?? 10)) return `Must be within ${def.range}"`;
      if (!canSee(s, unit, t)) return "This unit can't see that one";
      const pulled = dragToward(s, t, unit, GRAPPLE_PULL);
      if (pulled === 0) return "No room to drag it any closer";
      say(`${name} reels in ${profileOf(t).name} (${pulled}").`);
      events.push({ type: "moved", uid: t.uid, kind: "advance" });
      break;
    }
    case "rocket-hop": {
      if (!point) return "Pick a point";
      const leader = aliveModels(unit)[0]!;
      if (dist(leader.pos, point) > (def.range ?? 6)) return `Too far (${def.range}")`;
      const e = moveUnit(s, unit, leader.id, point, 0, true);
      if (e) return e;
      if (isEngaged(s, unit)) return "Can't land in base contact";
      say(`${name} rocket-hops across the field!`);
      events.push({ type: "moved", uid: unit.uid, kind: "advance" });
      react(s, unit, events);
      break;
    }
    case "rampage": {
      if (!profileOf(unit).weapons.some((w) => w.melee)) return "This unit has no melee weapon";
      if (unit.status.reckless) return "Already rampaging";
      unit.status.meleeBonus += 1;
      unit.status.reckless = true;
      say(`${name} works itself into a rampage!`);
      break;
    }
    case "spotter": {
      const t = targetUid ? unitById(s, targetUid) : undefined;
      if (!t || !t.onBoard || t.owner === unit.owner) return "Pick an enemy unit";
      if (t.status.spotted) return "That unit is already spotted";
      if (unitGap(unit, t) > (def.range ?? 18)) return `Must be within ${def.range}"`;
      if (!canSee(s, unit, t)) return "This unit can't see that one";
      t.status.spotted = true;
      say(`${name} spots ${profileOf(t).name}: shots at it hit one better this round.`);
      break;
    }
    case "bubble-shield": {
      const t = targetUid ? unitById(s, targetUid) : undefined;
      if (!t || !t.onBoard || t.owner !== unit.owner) return "Pick a friendly unit";
      if (t.uid !== unit.uid && unitGap(unit, t) > (def.range ?? 6)) return `Must be within ${def.range}"`;
      for (const m of aliveModels(t)) m.shield += 1;
      say(`${name} wraps ${profileOf(t).name} in a bubble shield.`);
      break;
    }
    case "sugar-rush": {
      const m = [...aliveModels(unit)].sort((a, b) => b.hp + b.shield - (a.hp + a.shield))[0]!;
      if (aliveModels(unit).length === 1 && m.hp + m.shield <= 1) return "That would finish this unit off";
      unit.status.hasted = (unit.status.hasted ?? 0) + SUGAR_RUSH_MOVE;
      applyDamage(s, unit, m, 1, events);
      say(`${name} gets a sugar rush: +${SUGAR_RUSH_MOVE}" move this round.`);
      break;
    }
    case "provoke": {
      if (unit.status.provoking) return "Already provoking";
      unit.status.provoking = true;
      say(`${name} makes a big, rude spectacle of itself!`);
      break;
    }
    case "demo-charge": {
      const t = targetUid ? unitById(s, targetUid) : undefined;
      if (!t || !t.onBoard || t.owner === unit.owner) return "Pick an enemy unit";
      if (isFlying(t)) return "Can't lob a charge at a flyer";
      if (unitGap(unit, t) > (def.range ?? 4)) return `Must be within ${def.range}"`;
      const plan = planDemoCharge(unit, t);
      if (!plan) return "No target in reach";
      say(`${name} lobs a demo charge!`);
      pushAttack(events, (ev) => resolveAttack(s, unit, t, def.name, plan, "shoot", ev));
      break;
    }
    default:
      return "That ability can't be activated";
  }
  unit.abilityUses[id] = used + 1;
  unit.status.abilityUsed = true;
  s.players[unit.owner].cp -= cpCost;
  return null;
}

// ---------- reactions ----------

/** Enemy overwatch against a unit that just moved/charged/deployed/teleported. */
function react(s: GameState, mover: Unit, events: GameEvent[]): void {
  if (mover.destroyed) return;
  for (const w of onBoard(s, other(mover.owner))) {
    if (!hasAbility(w, "overwatch") || w.reactionsUsed.includes("overwatch")) continue;
    if (isEngaged(s, w) || unitGap(w, mover) > 10) continue;
    const idx = profileOf(w).weapons.findIndex((x) => !x.melee);
    const weapon = profileOf(w).weapons[idx];
    if (!weapon) continue;
    const plan = planShooting(s, w, mover, weapon, "overwatch");
    if (typeof plan === "string") continue;
    if (consumeReaction(s, mover.owner, "enemyShoots", events)) plan.hitOn = Math.min(6, plan.hitOn + 1);
    w.reactionsUsed.push("overwatch");
    events.push({ type: "ability", uid: w.uid, ability: "overwatch", text: `${profileOf(w).name} opens fire on overwatch!` });
    pushAttack(events, (ev) => resolveAttack(s, w, mover, weapon.name, plan, "overwatch", ev));
    if (mover.destroyed) return;
  }
  if (isFlying(mover)) return;
  for (const w of onBoard(s, other(mover.owner))) {
    if (!hasAbility(w, "lurk") || w.reactionsUsed.includes("lurk")) continue;
    if (engagedWith(s, w).some((e) => e.uid !== mover.uid)) continue;
    const plan = planLurk(w, mover);
    if (!plan) continue;
    w.reactionsUsed.push("lurk");
    events.push({ type: "ability", uid: w.uid, ability: "lurk", text: `${profileOf(w).name} lashes out from hiding!` });
    pushAttack(events, (ev) => resolveAttack(s, w, mover, ABILITIES.lurk.name, plan, "impact", ev));
    if (mover.destroyed) return;
  }
}

// ---------- ability helpers ----------

/** How far Reel In drags its target. */
export const GRAPPLE_PULL = 4;
/** Sugar Rush's extra move. */
export const SUGAR_RUSH_MOVE = 2;
/** Hatchlings: lost models a Hatchlings use brings back. */
export const HATCH_MODELS = 2;
/** Lurk: dice per model, hit, damage and AP. */
export const LURK = { dice: 2, hit: 4, damage: 1, ap: 1 };
/** Demo Charge: dice, hit, damage and AP, and the damage against structures and mechs. */
export const DEMO = { dice: 3, hit: 3, damage: 2, ap: 1, vsHard: 3 };

/** Can any model of `a` see any model of `t`? */
export function canSee(s: GameState, a: Unit, t: Unit): boolean {
  return aliveModels(a).some((am) => aliveModels(t).some((tm) => lineOfSight(s, am.pos, am.elevation, tm.pos, tm.elevation)));
}

/** A provoking unit the shooter must aim at instead of `target` with this weapon, if any. */
export function provokedBy(s: GameState, shooter: Unit, w: Weapon, target: Unit): Unit | undefined {
  if (target.status.provoking) return undefined;
  const range = ABILITIES.provoke.range ?? 18;
  for (const d of onBoard(s, target.owner)) {
    if (d.uid === target.uid || !d.status.provoking || unitGap(shooter, d) > range) continue;
    if (typeof planShooting(s, shooter, d, w) !== "string") return d;
  }
  return undefined;
}

/** Lurk's lash-out at an enemy that just arrived: models within 3" on the same level each roll the dice. */
export function planLurk(w: Unit, mover: Unit): AttackPlan | null {
  const reach = ABILITIES.lurk.range ?? 3;
  const attackers: AttackPlan["attackers"] = [];
  const targets = new Set<Model>();
  for (const am of aliveModels(w)) {
    const near = aliveModels(mover).filter((tm) => tm.elevation === am.elevation && modelGap(w, am, mover, tm) <= reach + 1e-6);
    if (!near.length) continue;
    near.forEach((tm) => targets.add(tm));
    attackers.push({ model: am, dice: LURK.dice });
  }
  if (!attackers.length) return null;
  const ap = hasKeyword(mover, "armoured") ? Math.max(0, LURK.ap - 1) : LURK.ap;
  return { attackers, targets: [...targets], hitOn: LURK.hit, damage: LURK.damage, ap };
}

/** Demo Charge, thrown by the model nearest the target. */
export function planDemoCharge(a: Unit, t: Unit): AttackPlan | null {
  const tms = aliveModels(t);
  let best: { model: Model; d: number } | null = null;
  for (const am of aliveModels(a)) {
    for (const tm of tms) {
      const d = modelGap(a, am, t, tm);
      if (!best || d < best.d) best = { model: am, d };
    }
  }
  if (!best) return null;
  const hard = isStructure(t) || hasKeyword(t, "mech");
  const ap = hasKeyword(t, "armoured") ? Math.max(0, DEMO.ap - 1) : DEMO.ap;
  return { attackers: [{ model: best.model, dice: DEMO.dice }], targets: tms, hitOn: DEMO.hit, damage: hard ? DEMO.vsHard : DEMO.damage, ap };
}

/**
 * Slide every model of `t` straight toward `toward` by up to `max` inches, keeping its level and
 * never ending in base contact. Tries shorter pulls if the full one is blocked. Returns the distance moved.
 */
function dragToward(s: GameState, t: Unit, toward: Unit, max: number): number {
  const ms = aliveModels(t);
  const c = { x: ms.reduce((n, m) => n + m.pos.x, 0) / ms.length, y: ms.reduce((n, m) => n + m.pos.y, 0) / ms.length };
  const anchor = aliveModels(toward).reduce((a, b) => (dist(a.pos, c) < dist(b.pos, c) ? a : b));
  const len = dist(c, anchor.pos);
  if (len < 1e-6) return 0;
  const dir = { x: (anchor.pos.x - c.x) / len, y: (anchor.pos.y - c.y) / len };
  const r = profileOf(t).baseRadius;
  const others = allPlaced(s).filter((p) => p.uid !== t.uid);
  const blocked = (from: Vec, to: Vec, elev: Elevation): boolean =>
    s.terrain.some((x) => {
      const solid = x.kind === "building" || ((x.kind === "wall" || x.kind === "barricade") && x.level === elev) || (x.kind === "platform" && elev === 0);
      return solid && segmentNearPolygon(from, to, x.poly, r - 1e-6);
    });
  for (let k = max; k >= 0.5; k -= 0.5) {
    const placed: Placed[] = [...others];
    const moves: { m: Model; to: Vec }[] = [];
    let ok = true;
    for (const m of ms) {
      const to = { x: m.pos.x + dir.x * k, y: m.pos.y + dir.y * k };
      if (elevationFor(s, t, to) !== m.elevation || blocked(m.pos, to, m.elevation) || checkPlacement(s, t, to, m.elevation, placed)) {
        ok = false;
        break;
      }
      placed.push({ key: `${t.uid}:${m.id}`, uid: t.uid, owner: t.owner, pos: to, elevation: m.elevation, radius: r });
      moves.push({ m, to });
    }
    if (!ok) continue;
    const before = ms.map((m) => m.pos);
    for (const x of moves) x.m.pos = x.to;
    if (!isEngaged(s, t)) return k;
    ms.forEach((m, i) => (m.pos = before[i]!));
  }
  return 0;
}

// ---------- turn & phase flow ----------

/** The lead (in VP) this game's mission ends on: more than this wins at once. */
export const mercyLead = (s: GameState): number => MISSIONS[s.missionId]?.mercyLead ?? MERCY_LEAD;

/** A lead of more than the mission's limit ends the game at once, whenever it happens. */
function checkLead(s: GameState, events: GameEvent[]): void {
  if (s.over) return;
  const limit = mercyLead(s);
  const lead = s.players[0].vp - s.players[1].vp;
  if (Math.abs(lead) <= limit) return;
  s.over = true;
  s.winner = lead > 0 ? 0 : 1;
  events.push({ type: "gameOver", winner: s.winner, reason: `A lead of more than ${limit} VP` });
}

function checkWipeout(s: GameState, events: GameEvent[]): void {
  checkLead(s, events);
  if (s.over) return;
  // Open roster: reserves never run out, so a side is only out if it also can't pay for anyone (now or next round).
  const out = (p: PlayerId) => onBoard(s, p).length === 0 && (s.openRoster ? !canStillRecruit(s, p) : reserves(s, p).length === 0);
  const a = out(0);
  const b = out(1);
  if (!a && !b) return;
  s.over = true;
  s.winner = a && b ? "draw" : a ? 1 : 0;
  events.push({ type: "gameOver", winner: s.winner, reason: "An army was wiped out" });
}

function advanceTurn(s: GameState, events: GameEvent[]): void {
  const o = other(s.activePlayer);
  if (playerHasOptions(s, o)) {
    s.activePlayer = o;
    return;
  }
  if (playerHasOptions(s, s.activePlayer)) return;
  endPhase(s, events);
}

const NEXT: Record<Phase, Phase> = { movement: "assault", assault: "combat", combat: "scoring", scoring: "movement" };

function endPhase(s: GameState, events: GameEvent[]): void {
  // Skip phases nobody can act in. Rounds are finite, so this always ends: either somebody has
  // something to do, or the final scoring phase ends the game. (A fixed small guard used to leave
  // the game parked in a phase where neither player could act.)
  const maxSteps = (s.maxRounds - s.round + 2) * 4;
  // An early pass in the phase that just ended decides who leads the next one.
  let claim: PlayerId | null = s.initiativeClaim ?? null;
  s.initiativeClaim = null;
  for (let guard = 0; guard < maxSteps && !s.over; guard++) {
    const from = s.phase;
    for (const u of s.units) {
      u.status.acted = false;
      u.status.abilityUsed = false;
    }
    s.players.forEach((p) => (p.passed = false));
    s.phase = NEXT[s.phase];
    if (s.phase === "scoring") {
      runScoring(s, events, from === "combat" ? claim : null);
      claim = null;
      if (s.over) return;
      continue;
    }
    s.activePlayer = from === "movement" && claim !== null ? claim : s.initiative;
    claim = null;
    // While someone is choosing the order for a new round, they hold the turn.
    if (s.orderChoice) s.activePlayer = s.orderChoice.player;
    // Phases nobody can act in are skipped without being announced (no melee: straight to scoring).
    if (s.orderChoice || playerHasOptions(s, 0) || playerHasOptions(s, 1)) {
      events.push({ type: "phase", phase: s.phase, round: s.round });
      if (!s.orderChoice && !playerHasOptions(s, s.activePlayer)) s.activePlayer = other(s.activePlayer);
      return;
    }
  }
}

function runScoring(s: GameState, events: GameEvent[], combatClaim: PlayerId | null = null): void {
  events.push({ type: "phase", phase: "scoring", round: s.round });
  scoreRound(s, events);
  checkLead(s, events);
  if (s.over) return;
  cleanupRound(s, events);
  const cpBefore = [s.players[0].cp, s.players[1].cp];
  refreshSupports(s, events);
  events.push({ type: "roundEnded", round: s.round });
  if (s.round >= s.maxRounds) {
    s.over = true;
    const [a, b] = [s.players[0].vp, s.players[1].vp];
    s.winner = a === b ? "draw" : a > b ? 0 : 1;
    events.push({ type: "gameOver", winner: s.winner, reason: "Final round complete" });
    return;
  }
  s.round += 1;
  for (const pid of [0, 1] as const) {
    // Each side's economy (role missions give the sides different numbers).
    const p = s.players[pid];
    const eco = economyState(s, pid);
    const cap = p.supplyCap;
    p.resources += eco.income;
    p.supplyCap = Math.min(eco.maxSupply, p.supplyCap + eco.supplyPerRound);
    events.push({ type: "upkeep", player: pid, resources: eco.income, supply: p.supplyCap - cap, cp: p.cp - cpBefore[pid]! });
  }
  // Who goes first next round: an early pass in combat claims it outright; otherwise the player
  // behind on VP chooses, and a VP tie is settled by a fresh roll-off whose winner chooses.
  const [a, b] = [s.players[0].vp, s.players[1].vp];
  if (combatClaim !== null) {
    s.initiative = combatClaim;
    return;
  }
  if (!choiceEnabled(s) && a !== b) {
    s.initiative = a < b ? 0 : 1;
    return;
  }
  if (a === b) {
    const { rolls, winner } = rollOff(s);
    s.initiativeRolls = rolls;
    events.push({ type: "rolloff", rolls, winner, reason: "tie" });
    s.initiative = winner;
    s.orderChoice = choiceEnabled(s) ? { player: winner, reason: "tie" } : null;
    return;
  }
  const behind: PlayerId = a < b ? 0 : 1;
  s.initiative = behind;
  s.orderChoice = choiceEnabled(s) ? { player: behind, reason: "behind" } : null;
}

/** Each side rolls a d6; ties re-roll. */
function rollOff(s: GameState): { rolls: [number, number][]; winner: PlayerId } {
  const rolls: [number, number][] = [];
  for (let guard = 0; guard < 20; guard++) {
    const pair: [number, number] = [rollD6(s), rollD6(s)];
    rolls.push(pair);
    if (pair[0] !== pair[1]) break;
  }
  const last = rolls[rolls.length - 1]!;
  return { rolls, winner: last[0] > last[1] ? 0 : 1 };
}

/** Order choices are on unless the game was created with `orderChoice: false` (kept in the state). */
function choiceEnabled(s: GameState): boolean {
  return s.orderChoiceRule === true;
}

/** Is the given model in a spot where it would be engaged with any enemy? (UI helper; level-aware.) */
export function wouldEngage(s: GameState, unit: Unit, pos: Vec, elevation: Elevation = elevationFor(s, unit, pos)): boolean {
  const r = profileOf(unit).baseRadius;
  return onBoard(s).some(
    (e) =>
      e.owner !== unit.owner &&
      aliveModels(e).some(
        (m) =>
          dist(m.pos, pos) - r - profileOf(e).baseRadius <= ENGAGE_RANGE &&
          (m.elevation === elevation || m.elevation === 2 || elevation === 2),
      ),
  );
}
