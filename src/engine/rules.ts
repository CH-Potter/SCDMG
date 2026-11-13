// Read-only rule queries shared by the game reducer, the AI and the UI.

import { profileOf } from "./data/factions";
import {
  circleOverlapsPolygon,
  dist,
  pointInPolygon,
  pointSegmentDistance,
  segmentIntersectsPolygon,
  segmentPolygonDistance,
} from "./geometry";
import type { GameState, PlayerId, Unit, Vec, Weapon } from "./types";

export const ACTIONS_PER_ACTIVATION = 2;
export const ENGAGE_RANGE = 1;
export const SUPPORT_RANGE = 3;
export const MAX_SWARM_BONUS = 2;

const EPS = 1e-6;

export const unitById = (s: GameState, uid: string): Unit | undefined => s.units.find((u) => u.uid === uid);

export const radiusOf = (u: Unit): number => profileOf(u.profileId).baseRadius;

/** Edge-to-edge distance between two bases. */
export const edgeDist = (a: Unit, b: Unit): number => dist(a.pos, b.pos) - radiusOf(a) - radiusOf(b);

export const enemiesOf = (s: GameState, owner: PlayerId): Unit[] => s.units.filter((u) => u.alive && u.owner !== owner);
export const friendsOf = (s: GameState, owner: PlayerId): Unit[] => s.units.filter((u) => u.alive && u.owner === owner);

export const hasAbility = (u: Unit, a: string): boolean => profileOf(u.profileId).abilities.includes(a as never);

export const isEngaged = (s: GameState, u: Unit): boolean =>
  enemiesOf(s, u.owner).some((e) => edgeDist(u, e) <= ENGAGE_RANGE + EPS);

export function hasLineOfSight(s: GameState, from: Vec, to: Vec): boolean {
  return !s.terrain.some((t) => t.kind === "blocking" && segmentIntersectsPolygon(from, to, t.poly));
}

/** Cover applies if the shot passes through cover terrain the shooter isn't standing in, or the target is in cover. */
export function targetInCover(s: GameState, attacker: Unit, target: Unit): boolean {
  return s.terrain.some((t) => {
    if (t.kind !== "cover") return false;
    if (pointInPolygon(target.pos, t.poly)) return true;
    if (pointInPolygon(attacker.pos, t.poly)) return false;
    return segmentIntersectsPolygon(attacker.pos, target.pos, t.poly);
  });
}

/** Returns null if the move is legal, otherwise a human-readable reason. */
export function checkMove(s: GameState, unit: Unit, to: Vec): string | null {
  const p = profileOf(unit.profileId);
  const r = p.baseRadius;
  if (dist(unit.pos, to) > p.move + EPS) return `Too far (max ${p.move}")`;
  if (to.x - r < -EPS || to.y - r < -EPS || to.x + r > s.board.width + EPS || to.y + r > s.board.height + EPS) {
    return "Off the board";
  }
  for (const t of s.terrain) {
    if (t.kind === "blocking" && circleOverlapsPolygon(to, r, t.poly)) return "Can't stand in impassable terrain";
  }
  for (const o of s.units) {
    if (!o.alive || o.uid === unit.uid) continue;
    if (dist(to, o.pos) < r + radiusOf(o) - EPS) return "Overlaps another unit";
  }
  if (!hasAbility(unit, "phase")) {
    for (const t of s.terrain) {
      if (t.kind === "blocking" && segmentPolygonDistance(unit.pos, to, t.poly) < r - EPS) {
        return "Path blocked by terrain";
      }
    }
    for (const e of enemiesOf(s, unit.owner)) {
      if (pointSegmentDistance(e.pos, unit.pos, to) < r + radiusOf(e) - EPS) return "Path blocked by an enemy";
    }
  }
  return null;
}

/** Returns null if the attack is legal, otherwise a human-readable reason. */
export function checkAttack(s: GameState, attacker: Unit, target: Unit, weapon: Weapon): string | null {
  if (!target.alive) return "Target is already gone";
  if (target.owner === attacker.owner) return "Can't attack your own side";
  const d = edgeDist(attacker, target);
  if (weapon.melee) {
    if (d > ENGAGE_RANGE + EPS) return `Melee needs base contact (within ${ENGAGE_RANGE}")`;
    return null;
  }
  if (isEngaged(s, attacker)) return "Can't shoot while engaged in melee";
  if (d > weapon.range + EPS) return `Out of range (${weapon.range}")`;
  if (!hasLineOfSight(s, attacker.pos, target.pos)) return "No line of sight";
  return null;
}

export function attackDice(s: GameState, attacker: Unit, target: Unit, weapon: Weapon): number {
  let dice = weapon.dice;
  if (weapon.melee && hasAbility(attacker, "swarm")) {
    const helpers = friendsOf(s, attacker.owner).filter(
      (f) => f.uid !== attacker.uid && edgeDist(f, target) <= SUPPORT_RANGE + EPS,
    ).length;
    dice += Math.min(MAX_SWARM_BONUS, helpers);
  }
  return dice;
}

/** The d6 roll needed to save, or null if no save is possible. */
export function saveTarget(s: GameState, attacker: Unit, target: Unit, weapon: Weapon): number | null {
  let t = profileOf(target.profileId).armor + weapon.ap;
  if (!weapon.melee && targetInCover(s, attacker, target)) t -= 1;
  if (target.dugIn) t -= 1;
  t = Math.max(2, t);
  return t > 6 ? null : t;
}

const pAtLeast = (n: number): number => Math.max(0, Math.min(1, (7 - n) / 6));

/** Expected damage of an attack, before capping at the target's remaining wounds. */
export function expectedDamage(s: GameState, attacker: Unit, target: Unit, weapon: Weapon): number {
  const hits = attackDice(s, attacker, target, weapon) * pAtLeast(weapon.hit);
  const st = saveTarget(s, attacker, target, weapon);
  const pFail = st === null ? 1 : 1 - pAtLeast(st);
  return hits * pFail * weapon.damage;
}

export const woundsLeft = (u: Unit): number => u.hp + u.shield;

export function canEntrench(s: GameState, u: Unit): boolean {
  return hasAbility(u, "entrench") && !(s.activation?.uid === u.uid && s.activation.usedSpecial);
}

export function healTargets(s: GameState, medic: Unit): Unit[] {
  if (!hasAbility(medic, "medic")) return [];
  if (s.activation?.uid === medic.uid && s.activation.usedSpecial) return [];
  return friendsOf(s, medic.owner).filter(
    (f) => f.hp < profileOf(f.profileId).hp && (f.uid === medic.uid || edgeDist(f, medic) <= SUPPORT_RANGE + EPS),
  );
}

/** Which player controls each objective: more units in range wins; ties are uncontrolled. */
export function objectiveControl(s: GameState): (PlayerId | null)[] {
  return s.objectives.map((o) => {
    const counts = [0, 0];
    for (const u of s.units) {
      if (u.alive && dist(u.pos, o.pos) <= o.radius + radiusOf(u) + EPS) counts[u.owner]! += 1;
    }
    if (counts[0]! > counts[1]!) return 0;
    if (counts[1]! > counts[0]!) return 1;
    return null;
  });
}

export const canActivate = (s: GameState, u: Unit): boolean =>
  !s.over && u.alive && !u.activated && u.owner === s.activePlayer && (s.activation === null || s.activation.uid === u.uid);
