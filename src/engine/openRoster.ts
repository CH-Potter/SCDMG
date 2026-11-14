// Open roster ("RTS") games: no army lists. Each side can field any buyable unit of its faction,
// as many times as it can pay for: resources and supply are the limits, plus an optional cap on
// how many copies of one unit can be on the table at once (the mode's list limit by default).
//
// How it works: each side always has exactly one reserve unit of every buyable profile, a
// "recruit". Deploying one (normally, or by an airdrop support) puts it on the table as a real
// unit, and a fresh recruit of that profile takes its place in reserve straight away. So the
// existing deploy rules (zones, costs, supply, burrow exits, field deploy, overwatch and lurk
// reactions), the deploy menu and the AI all work unchanged. Dead units stay dead; the next one
// of that profile is a new unit.

import { factionOf } from "./data/factions";
import { MODES, type ModeId } from "./data/modes";
import { profileFor, profileOf } from "./profile";
import { onBoard, reserves } from "./rules";
import { economyState } from "./scoring";
import { freshStatus } from "./supports";
import type { FactionId, GameState, PlayerId, Unit, UnitProfile } from "./types";

/** How a side's army is chosen: a list, or the open roster. */
export type ArmyRule = "list" | "open";

/** Profiles a side can recruit: everything in the faction except summon-only structures. */
export function recruitableProfiles(faction: FactionId): UnitProfile[] {
  try {
    return factionOf(faction).profiles.filter((p) => !p.structure?.summonOnly);
  } catch {
    return [];
  }
}

/** The default per-profile cap for a mode: the list builder's "max copies of one unit". */
export const defaultOpenCap = (mode: ModeId): number | undefined => MODES[mode]?.maxCopies;

/** Copies of `profileId` that `p` has on the table right now. */
export const fieldedCopies = (s: GameState, p: PlayerId, profileId: string): number =>
  onBoard(s, p).filter((u) => u.profileId === profileId).length;

function recruitUnit(owner: PlayerId, profileId: string, seq: number): Unit {
  const prof = profileFor(profileId, []);
  return {
    uid: `p${owner}-r${seq}`,
    profileId,
    upgrades: [],
    owner,
    models: Array.from({ length: prof.models }, (_, id) => ({
      id,
      pos: { x: 0, y: 0 },
      elevation: 0 as const,
      hp: prof.hp,
      shield: prof.shield,
      alive: true,
    })),
    onBoard: false,
    destroyed: false,
    status: freshStatus(0),
    abilityUses: {},
    reactionsUsed: [],
  };
}

/**
 * Make sure each side has one reserve recruit of every buyable profile. Call after anything that
 * can deploy a unit, before the turn moves on. Mutates `s` (replaces `s.units`, never edits it).
 */
export function syncOpenRoster(s: GameState): void {
  if (!s.openRoster) return;
  let seq = s.openRoster.seq;
  const add: Unit[] = [];
  for (const p of [0, 1] as const) {
    const have = new Set(reserves(s, p).map((u) => u.profileId));
    for (const prof of recruitableProfiles(s.factions[p])) if (!have.has(prof.id)) add.push(recruitUnit(p, prof.id, seq++));
  }
  if (!add.length) return;
  s.units = [...s.units, ...add];
  s.openRoster = { ...s.openRoster, seq };
}

/** Turn a freshly created game into an open-roster one (no list units; recruits for everything). */
export function setupOpenRoster(s: GameState, cap: number | undefined): void {
  s.units = s.units.filter((u) => u.onBoard); // keep mission garrisons, drop any list reserves
  s.openRoster = cap === undefined ? { seq: 0 } : { cap, seq: 0 };
  syncOpenRoster(s);
}

/**
 * Can `p` still get a unit onto the table: something it can pay for now, or with next round's
 * income? An open-roster army is only wiped out when it has nothing on the table and this is false.
 */
export function canStillRecruit(s: GameState, p: PlayerId): boolean {
  const budget = s.players[p].resources + (s.round < s.maxRounds ? economyState(s, p).income : 0);
  return reserves(s, p).some((u) => profileOf(u).cost <= budget);
}

/** A side's reserve recruits in the faction's roster order (stable as recruits are replaced). */
export function rosterOrder(s: GameState, p: PlayerId, units: Unit[] = reserves(s, p)): Unit[] {
  const order = new Map(recruitableProfiles(s.factions[p]).map((x, i) => [x.id, i]));
  return [...units].sort((a, b) => (order.get(a.profileId) ?? 99) - (order.get(b.profileId) ?? 99));
}
