import { rulesOf } from "../../src/engine/houseRules";
import type { GameState, PlayerId } from "../../src/engine/types";

/**
 * Give a player exactly `n` CP the old way: a banked pool (the Card-bound CP house rule off). For
 * tests about abilities and supports, not about where CP comes from (tests/cardCp.test.ts covers that).
 */
export function bankCp(s: GameState, p: PlayerId, n: number): void {
  s.rules = { ...rulesOf(s), cardCp: false };
  s.players[p].cp = n;
}
