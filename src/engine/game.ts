// The game reducer: createGame() and applyCommand(). Pure and deterministic given the seed.

import { FACTIONS, profileOf } from "./data/factions";
import { DUSTBOWL, type MapDef } from "./data/maps";
import { rollD6 } from "./rng";
import {
  ACTIONS_PER_ACTIVATION,
  canEntrench,
  checkAttack,
  checkMove,
  friendsOf,
  healTargets,
  objectiveControl,
  saveTarget,
  attackDice,
  targetInCover,
  unitById,
} from "./rules";
import type { Command, CommandResult, FactionId, GameEvent, GameState, PlayerId, Unit } from "./types";

export interface GameSetup {
  factions: [FactionId, FactionId];
  lists?: [string[], string[]];
  seed?: number;
  map?: MapDef;
  maxRounds?: number;
}

export function createGame(setup: GameSetup): GameState {
  const map = setup.map ?? DUSTBOWL;
  const lists = setup.lists ?? [FACTIONS[setup.factions[0]].defaultList, FACTIONS[setup.factions[1]].defaultList];
  const state: GameState = {
    board: { width: map.width, height: map.height },
    round: 1,
    maxRounds: setup.maxRounds ?? 5,
    activePlayer: 0,
    factions: setup.factions,
    units: [],
    terrain: map.terrain.map((t) => ({ ...t, poly: t.poly.map((p) => ({ ...p })) })),
    objectives: map.objectives.map((o) => ({ ...o, pos: { ...o.pos } })),
    score: [0, 0],
    rng: (setup.seed ?? Date.now()) >>> 0,
    activation: null,
    over: false,
    winner: null,
  };
  for (const owner of [0, 1] as const) deploy(state, owner, lists[owner], map.deploy[owner]);
  return state;
}

/** Spread a list evenly across the deployment band, nudging units off terrain. */
function deploy(state: GameState, owner: PlayerId, list: string[], band: [number, number]): void {
  const midY = (band[0] + band[1]) / 2;
  list.forEach((profileId, i) => {
    const p = profileOf(profileId);
    const unit: Unit = {
      uid: `p${owner}-${i}`,
      profileId,
      owner,
      pos: { x: 0, y: midY },
      hp: p.hp,
      shield: p.shield,
      activated: false,
      dugIn: false,
      hurtThisRound: false,
      alive: true,
    };
    const baseX = ((i + 0.5) / list.length) * state.board.width;
    const offsets = [0, 1.5, -1.5, 3, -3, 4.5, -4.5, 6, -6];
    for (const dx of offsets) {
      for (const dy of [0, -1.5, 1.5]) {
        unit.pos = { x: baseX + dx, y: Math.min(band[1], Math.max(band[0], midY + dy)) };
        // A zero-length move reuses the move checker's placement rules (board edge, terrain, overlap).
        if (checkMove(state, unit, unit.pos) === null) {
          state.units.push(unit);
          return;
        }
      }
    }
    throw new Error(`Could not deploy ${profileId}`);
  });
}

const clone = (s: GameState): GameState => structuredClone(s);

export function applyCommand(prev: GameState, cmd: Command): CommandResult {
  if (prev.over) return { ok: false, error: "The game is over" };
  const s = clone(prev);
  const events: GameEvent[] = [];
  const unit = unitById(s, cmd.uid);
  if (!unit || !unit.alive) return { ok: false, error: "No such unit" };
  if (unit.owner !== s.activePlayer) return { ok: false, error: "Not your turn" };
  if (s.activation && s.activation.uid !== unit.uid) return { ok: false, error: "Finish the current activation first" };
  if (!s.activation && unit.activated) return { ok: false, error: "That unit has already activated this round" };

  if (cmd.type === "end") {
    // Ending without having activated is a "hold": the unit passes this round.
    endActivation(s, unit, events);
    return { ok: true, state: s, events };
  }

  if (!s.activation) {
    s.activation = { uid: unit.uid, actionsLeft: ACTIONS_PER_ACTIVATION, attacked: false, usedSpecial: false };
    unit.dugIn = false; // Entrenchment lasts until the unit's next activation.
  }
  const act = s.activation;

  switch (cmd.type) {
    case "move": {
      const err = checkMove(s, unit, cmd.to);
      if (err) return { ok: false, error: err };
      events.push({ type: "moved", uid: unit.uid, from: { ...unit.pos }, to: { ...cmd.to } });
      unit.pos = { ...cmd.to };
      break;
    }
    case "attack": {
      if (act.attacked) return { ok: false, error: "Only one attack per activation" };
      const target = unitById(s, cmd.target);
      const weapon = profileOf(unit.profileId).weapons[cmd.weapon];
      if (!target || !weapon) return { ok: false, error: "Bad attack" };
      const err = checkAttack(s, unit, target, weapon);
      if (err) return { ok: false, error: err };

      const dice = attackDice(s, unit, target, weapon);
      const st = saveTarget(s, unit, target, weapon);
      const cover = !weapon.melee && targetInCover(s, unit, target);
      const hitRolls = Array.from({ length: dice }, () => rollD6(s));
      const hits = hitRolls.filter((r) => r >= weapon.hit).length;
      const saveRolls = st === null ? [] : Array.from({ length: hits }, () => rollD6(s));
      const fails = st === null ? hits : saveRolls.filter((r) => r < st).length;
      let damage = fails * weapon.damage;
      const dealt = Math.min(damage, target.hp + target.shield);
      const toShield = Math.min(target.shield, dealt);
      target.shield -= toShield;
      target.hp -= dealt - toShield;
      damage = dealt;
      if (damage > 0) target.hurtThisRound = true;
      const killed = target.hp <= 0;
      if (killed) target.alive = false;
      act.attacked = true;
      events.push({
        type: "attacked",
        uid: unit.uid,
        target: target.uid,
        weapon: weapon.name,
        hitRolls,
        hits,
        saveTarget: st,
        saveRolls,
        damage,
        cover,
        killed,
      });
      break;
    }
    case "entrench": {
      if (!canEntrench(s, unit)) return { ok: false, error: "This unit can't entrench now" };
      unit.dugIn = true;
      act.usedSpecial = true;
      events.push({ type: "entrenched", uid: unit.uid });
      break;
    }
    case "heal": {
      const target = healTargets(s, unit).find((t) => t.uid === cmd.target);
      if (!target) return { ok: false, error: "Can't heal that unit" };
      target.hp += 1;
      act.usedSpecial = true;
      events.push({ type: "healed", uid: unit.uid, target: target.uid, amount: 1 });
      break;
    }
  }

  act.actionsLeft -= 1;
  if (checkElimination(s, events)) return { ok: true, state: s, events };
  if (act.actionsLeft <= 0) endActivation(s, unit, events);
  return { ok: true, state: s, events };
}

function checkElimination(s: GameState, events: GameEvent[]): boolean {
  for (const p of [0, 1] as const) {
    if (friendsOf(s, p).length === 0) {
      const winner = (1 - p) as PlayerId;
      s.over = true;
      s.winner = winner;
      s.activation = null;
      events.push({ type: "gameOver", winner, reason: "Wiped out the opposition" });
      return true;
    }
  }
  return false;
}

function endActivation(s: GameState, unit: Unit, events: GameEvent[]): void {
  unit.activated = true;
  s.activation = null;
  events.push({ type: "activationEnded", uid: unit.uid });
  const ready = (p: PlayerId) => friendsOf(s, p).some((u) => !u.activated);
  const other = (1 - s.activePlayer) as PlayerId;
  if (ready(other)) s.activePlayer = other;
  else if (!ready(s.activePlayer)) endRound(s, events);
}

function endRound(s: GameState, events: GameEvent[]): void {
  const scored: [number, number] = [0, 0];
  for (const c of objectiveControl(s)) if (c !== null) scored[c] += 1;
  s.score[0] += scored[0];
  s.score[1] += scored[1];

  const healed: string[] = [];
  for (const u of s.units) {
    if (!u.alive) continue;
    const p = profileOf(u.profileId);
    if (p.abilities.includes("regen") && !u.hurtThisRound && u.hp < p.hp) {
      u.hp += 1;
      healed.push(u.uid);
    }
    if (u.shield < p.shield) u.shield += 1;
    u.activated = false;
    u.hurtThisRound = false;
  }
  events.push({ type: "roundEnded", round: s.round, scored, healed });

  if (s.round >= s.maxRounds) {
    s.over = true;
    s.winner = s.score[0] === s.score[1] ? "draw" : s.score[0] > s.score[1] ? 0 : 1;
    events.push({ type: "gameOver", winner: s.winner, reason: "Final round complete" });
    return;
  }
  s.round += 1;
  // The player trailing on points goes first next round; ties alternate.
  s.activePlayer =
    s.score[0] < s.score[1] ? 0 : s.score[1] < s.score[0] ? 1 : (((s.round - 1) % 2) as PlayerId);
}
