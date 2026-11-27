// The Command re-roll house rule's offer: after an attack with misses, its player may pay to
// re-roll them. Shared by the local game (controller) and online play (net/session), so both offer
// a re-roll in exactly the same cases.

import { applyCommand } from "./game";
import { REROLL_CP, rulesOf } from "./houseRules";
import { commandProblem } from "./legality";
import type { Command, GameEvent, GameState } from "./types";

/**
 * How many misses this attack could re-roll (Command re-roll house rule), or 0 if it can't be.
 * Both players work it out the same way, so both know when a command stays open for FINAL.
 */
export function rerollMisses(before: GameState, cmd: Command, events: GameEvent[]): number {
  if ((cmd.type !== "shoot" && cmd.type !== "fight") || cmd.reroll || !rulesOf(before).reroll) return 0;
  if (before.players[before.activePlayer].cp < REROLL_CP) return 0;
  const a = events.find((e) => e.type === "attack" && e.report.uid === cmd.uid && e.report.target === cmd.target);
  if (a?.type !== "attack" || a.report.unitDestroyed) return 0;
  const misses = a.report.hitRolls.filter((x) => x < a.report.hitOn).length;
  if (!misses) return 0;
  return rerollProblem(before, { ...cmd, reroll: true }) ? 0 : misses;
}

/**
 * Why this re-roll can't be made, or null. The rules check misses some refusals that only the
 * engine finds (a lobbed shell can't be re-rolled), so it also tries the re-roll on a copy.
 */
export function rerollProblem(before: GameState, reroll: Command): string | null {
  const p = commandProblem(before, reroll);
  if (p) return p;
  const r = applyCommand(structuredClone(before), structuredClone(reroll));
  return r.ok ? null : r.error;
}
