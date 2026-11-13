// The game reducer: createGame() and applyCommand(). Pure and deterministic given the seed.
//
// A round has four phases. In the first three, players alternate activating one unit at a time
// (starting with the player who has initiative); a player with nothing left to do is skipped.
//   movement: deploy from reserves, move, disengage, hunker, hold, movement abilities
//   assault:  shoot, charge, advance, hunker, hold, assault abilities
//   combat:   engaged units fight (units that charged fight first)
//   scoring:  mission scoring and clean-up, then the next round begins

import { ABILITIES } from "./data/abilities";
import { FACTIONS } from "./data/factions";
import { MAPS } from "./data/maps";
import { MISSIONS } from "./data/missions";
import { applyDamage, planMelee, planShooting, resolveAttack, saveNeeded } from "./combat";
import { planUnitMove, reviveSpot, type UnitMovePlan } from "./formation";
import { dist } from "./geometry";
import { hasAbility, hasKeyword, isFlying, profileFor, profileOf } from "./profile";
import { rollD6 } from "./rng";
import {
  aliveModels,
  canAffordDeploy,
  effectiveMove,
  eligibleUnits,
  ENGAGE_RANGE,
  isEngaged,
  meleeCanHit,
  onBoard,
  playerHasOptions,
  reserves,
  unitById,
  unitGap,
  unitsEngage,
} from "./rules";
import { cleanupRound, scoreRound, updateFlags } from "./scoring";
import { elevationFor } from "./terrain";
import type {
  AbilityId,
  Command,
  CommandResult,
  FactionId,
  GameEvent,
  GameState,
  ListEntry,
  Phase,
  PlayerId,
  Unit,
  Vec,
} from "./types";

export interface GameSetup {
  factions: [FactionId, FactionId];
  lists?: [ListEntry[], ListEntry[]];
  seed?: number;
  mapId?: string;
  missionId?: string;
}

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export function createGame(setup: GameSetup): GameState {
  const map = MAPS[setup.mapId ?? "dustbowl"];
  const mission = MISSIONS[setup.missionId ?? "hold"];
  if (!map || !mission) throw new Error("Unknown map or mission");
  const lists = setup.lists ?? [FACTIONS[setup.factions[0]].defaultList, FACTIONS[setup.factions[1]].defaultList];
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
        status: {
          acted: false,
          moved: false,
          disengaged: false,
          hunkered: false,
          charged: false,
          fought: false,
          hurt: false,
          slowedRounds: 0,
          deployedRound: 0,
        },
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
    players: [0, 1].map(() => ({
      resources: mission.startResources,
      supplyCap: mission.startSupply,
      vp: 0,
      passed: false,
    })) as GameState["players"],
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
  state.initiative = rollD6(state) % 2 === 0 ? 0 : 1;
  state.activePlayer = state.initiative;
  return state;
}

const fail = (error: string): CommandResult => ({ ok: false, error });

export function applyCommand(prev: GameState, cmd: Command): CommandResult {
  if (prev.over) return fail("The game is over");
  const s = structuredClone(prev);
  const events: GameEvent[] = [];

  if (cmd.type === "pass") {
    if (cmd.player !== s.activePlayer) return fail("Not your turn");
    s.players[cmd.player].passed = true;
    events.push({ type: "passed", player: cmd.player });
    advanceTurn(s, events);
    return { ok: true, state: s, events };
  }

  const unit = unitById(s, cmd.uid);
  if (!unit || unit.destroyed) return fail("No such unit");
  if (unit.owner !== s.activePlayer) return fail("Not your turn");
  if (s.players[unit.owner].passed) return fail("You've passed this phase");

  const err = perform(s, unit, cmd, events);
  if (err) return fail(err);

  updateFlags(s, events);
  checkWipeout(s, events);
  if (!s.over) advanceTurn(s, events);
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
    if (phase === "assault" && unit.status.disengaged) return "Units that disengaged can't act again this round";
    if (phase === "combat") return "That unit can't fight right now";
    return "That unit can't act right now";
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
      const e = moveUnit(s, unit, cmd.leader, cmd.to, effectiveMove(s, unit), false);
      if (e) return e;
      if (endsEngaged(s, unit)) return "Must end the move out of base contact";
      unit.status.disengaged = true;
      events.push({ type: "moved", uid: unit.uid, kind: "disengage" });
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
      const e = charge(s, unit, cmd.target);
      if (e) return e;
      events.push({ type: "moved", uid: unit.uid, kind: "charge" });
      break;
    }
    case "shoot": {
      const target = unitById(s, cmd.target);
      const w = profileOf(unit).weapons[cmd.weapon];
      if (!target || !target.onBoard || target.owner === unit.owner) return "Pick an enemy unit";
      if (!w) return "No such weapon";
      if (unit.status.disengaged && !hasKeyword(unit, "light")) return "Only light units can shoot after disengaging";
      const plan = planShooting(s, unit, target, w);
      if (typeof plan === "string") return plan;
      events.push({ type: "attack", report: resolveAttack(s, unit, target, w.name, plan, "shoot", events) });
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
      events.push({ type: "attack", report: resolveAttack(s, unit, target, w.name, plan, "fight", events) });
      break;
    }
    case "ability": {
      const e = useAbility(s, unit, cmd.ability, cmd.target, cmd.point, events);
      if (e) return e;
      break;
    }
  }
  unit.status.acted = true;
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
  const plan = planUnitMove(s, unit, leader.id, to, { allowance: 0, teleport: true, zone: s.spawn[unit.owner] });
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
function charge(s: GameState, unit: Unit, targetUid: string): string | null {
  const target = unitById(s, targetUid);
  if (!target || !target.onBoard || target.owner === unit.owner) return "Pick an enemy unit to charge";
  if (unit.status.disengaged) return "Units that disengaged can't charge";
  const melee = profileOf(unit).weapons.filter((w) => w.melee);
  if (!melee.some((w) => meleeCanHit(unit, target, w.targets))) {
    return isFlying(target) ? "Nothing in this unit can reach flyers" : "This unit has no melee weapon";
  }
  const plan = planCharge(s, unit, target);
  if (typeof plan === "string") return plan;
  applyPlan(unit, plan);
  if (!unitsEngage(unit, target)) return "Couldn't reach base contact";
  unit.status.charged = true;
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
    case "barrage": {
      if (!point) return "Pick a point";
      const reach = aliveModels(unit).some((m) => dist(m.pos, point) <= (def.range ?? 24));
      if (!reach) return `Out of range (${def.range}")`;
      say(`${name} lobs a barrage!`);
      for (const t of onBoard(s)) {
        if (isFlying(t)) continue;
        const r = profileOf(t).baseRadius;
        const caught = aliveModels(t).filter((m) => dist(m.pos, point) <= 2 + r);
        if (!caught.length) continue;
        const hitRolls: number[] = [];
        const saveRolls: number[] = [];
        const saveOn: (number | null)[] = [];
        let damage = 0;
        let killed = 0;
        for (const m of caught) {
          const roll = rollD6(s);
          hitRolls.push(roll);
          if (roll < 4) continue;
          const st = saveNeeded(s, unit, t, m, 1, false);
          saveOn.push(st);
          const sv = st === null ? 0 : rollD6(s);
          saveRolls.push(sv);
          if (st !== null && sv >= st) continue;
          damage += applyDamage(s, t, m, 1, events);
          if (!m.alive) killed += 1;
        }
        events.push({
          type: "attack",
          report: {
            uid: unit.uid,
            target: t.uid,
            weapon: "Barrage",
            kind: "barrage",
            attackers: 1,
            hitRolls,
            hitOn: 4,
            saveRolls,
            saveOn,
            damage,
            modelsKilled: killed,
            unitDestroyed: t.destroyed,
          },
        });
      }
      break;
    }
    case "tunnel": {
      if (!point) return "Pick a point";
      if (elevationFor(s, unit, point) !== 0) return "Must pop up on the ground";
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
      const e = moveUnit(s, t, aliveModels(t)[0]!.id, point, 0, true);
      if (e) return e;
      if (isEngaged(s, t)) return "Can't recall into base contact";
      say(`${name} beams ${profileOf(t).name} over!`);
      events.push({ type: "moved", uid: t.uid, kind: "teleport" });
      react(s, t, events);
      break;
    }
    default:
      return "That ability can't be activated";
  }
  unit.abilityUses[id] = used + 1;
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
    w.reactionsUsed.push("overwatch");
    events.push({ type: "ability", uid: w.uid, ability: "overwatch", text: `${profileOf(w).name} opens fire on overwatch!` });
    events.push({ type: "attack", report: resolveAttack(s, w, mover, weapon.name, plan, "overwatch", events) });
    if (mover.destroyed) return;
  }
}

// ---------- turn & phase flow ----------

function checkWipeout(s: GameState, events: GameEvent[]): void {
  const out = (p: PlayerId) => onBoard(s, p).length === 0 && reserves(s, p).length === 0;
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
  for (let guard = 0; guard < 8 && !s.over; guard++) {
    for (const u of s.units) u.status.acted = false;
    s.players.forEach((p) => (p.passed = false));
    s.phase = NEXT[s.phase];
    if (s.phase === "scoring") {
      runScoring(s, events);
      if (s.over) return;
      continue;
    }
    s.activePlayer = s.initiative;
    events.push({ type: "phase", phase: s.phase, round: s.round });
    if (playerHasOptions(s, 0) || playerHasOptions(s, 1)) {
      if (!playerHasOptions(s, s.activePlayer)) s.activePlayer = other(s.activePlayer);
      return;
    }
  }
}

function runScoring(s: GameState, events: GameEvent[]): void {
  events.push({ type: "phase", phase: "scoring", round: s.round });
  scoreRound(s, events);
  cleanupRound(s, events);
  events.push({ type: "roundEnded", round: s.round });
  if (s.round >= s.maxRounds) {
    s.over = true;
    const [a, b] = [s.players[0].vp, s.players[1].vp];
    s.winner = a === b ? "draw" : a > b ? 0 : 1;
    events.push({ type: "gameOver", winner: s.winner, reason: "Final round complete" });
    return;
  }
  const mission = MISSIONS[s.missionId]!;
  s.round += 1;
  for (const p of s.players) {
    p.resources += mission.income;
    p.supplyCap = Math.min(mission.maxSupply, p.supplyCap + mission.supplyPerRound);
  }
  const [a, b] = [s.players[0].vp, s.players[1].vp];
  s.initiative = a < b ? 0 : b < a ? 1 : other(s.initiative);
}

/** Is the given model in a spot where it would be engaged with any enemy? (UI helper) */
export function wouldEngage(s: GameState, unit: Unit, pos: Vec): boolean {
  const r = profileOf(unit).baseRadius;
  return onBoard(s).some(
    (e) => e.owner !== unit.owner && aliveModels(e).some((m) => dist(m.pos, pos) - r - profileOf(e).baseRadius <= ENGAGE_RANGE),
  );
}
