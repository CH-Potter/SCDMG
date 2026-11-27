// Fingerprints of game states and setups, so two copies of a game can check they agree:
// - the simulator's golden check (sim/golden.ts) compares stateFingerprint after whole games;
// - online play (lockstep: both players run the engine) compares syncHash after every command, and
//   sameSetup before the first, to catch a desync the moment it happens.
// Plus withSalt, which stirs a shared random value into a game's dice for commit-reveal rolls.

import type { GameSetup } from "./game";
import type { GameState } from "./types";

/** 32-bit FNV-1a over a string's UTF-16 code units, continued from `h`. */
export function fnv(str: string, h = 0x811c9dc5): number {
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export const hex8 = (h: number): string => (h >>> 0).toString(16).padStart(8, "0");

/**
 * The simulator's fingerprint: the parts of a state the game plays out on (not the static terrain).
 * Its output is stored in sim/golden.json, so leave the field list alone.
 */
export function stateFingerprint(s: GameState): string {
  const { units, players, objectives, flags, missionState, rng, round, phase, over, winner } = s;
  return hex8(fnv(JSON.stringify({ units, players, objectives, flags, missionState, rng, round, phase, over, winner })));
}

/** A 64-bit hash (two independent 32-bit FNV-1a passes) of a string, as 16 hex digits. */
export function hash64(str: string): string {
  return hex8(fnv(str)) + hex8(fnv(str, 0x9e3779b9));
}

/**
 * Online play's check after every command: a hash of the whole state, every field included, so any
 * drift between the two players' engines shows up at once. Both sides build their state from the
 * same setup with the same code, so key order matches and plain JSON is canonical enough.
 */
export function syncHash(s: GameState): string {
  return hash64(JSON.stringify(s));
}

/** JSON with object keys sorted at every level, so two setups built in a different order compare equal. */
export function canonicalJson(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return x;
    const o = x as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  });
}

/** A fingerprint of a game setup (factions, lists, map, mission, rules, seed...). */
export function setupFingerprint(setup: GameSetup): string {
  return hash64(canonicalJson(setup));
}

/** Whether two setups would start the same game. */
export function sameSetup(a: GameSetup, b: GameSetup): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * Stir a shared random value into the game's dice (commit-reveal: both players' secrets combine
 * into `salt`, so neither could predict or steer the next roll). Mutates and returns the state, like
 * entropy.reseed; both players apply it at the same point, so their games stay in step.
 */
export function withSalt<T extends { rng: number }>(s: T, salt: number): T {
  let h = fnv(hex8(s.rng));
  h = fnv(hex8(salt), h);
  s.rng = h >>> 0;
  return s;
}
