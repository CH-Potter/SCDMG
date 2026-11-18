// Evade is for small, agile units: they dodge. Big or slow units can't (flyers dodge by flying).
// Validation stops a big or slow unit having an evade; units that are small and quick enough get a
// basic one by default when their card doesn't set its own (Faction Forge templates use this).

import type { EvadeDef, UnitProfile } from "../types";

/** Over this base radius a ground unit is too big to dodge. */
export const EVADE_MAX_BASE = 1.0;
/** A unit this slow (move) can't dodge. */
export const EVADE_MIN_MOVE = 5;
/** The default evade only goes to bases this small or smaller. */
export const DEFAULT_EVADE_MAX_BASE = 0.75;

type Body = Pick<UnitProfile, "structure" | "keywords" | "baseRadius" | "move">;

/** Why this unit can't have an evade, or null if it may. */
export function evadeProblem(p: Body): string | null {
  if (p.structure) return "structures can't evade";
  if (p.keywords.includes("flying")) return null; // flyers dodge by flying, whatever their size
  if (p.keywords.includes("heavy") || p.keywords.includes("monster")) return "heavy units and monsters are too big and slow to evade";
  if (p.baseRadius > EVADE_MAX_BASE + 1e-9) return `units on bases over ${EVADE_MAX_BASE}" are too big to evade`;
  if (p.move < EVADE_MIN_MOVE) return `units that move under ${EVADE_MIN_MOVE}" are too slow to evade`;
  return null;
}

/**
 * The basic evade a small, quick, unarmoured ground unit gets when its card doesn't set one: 6+
 * against point-blank shots, 5+ if it's light or can jump. Undefined for anything else.
 */
export function defaultEvade(p: Body): EvadeDef | undefined {
  if (evadeProblem(p) || p.keywords.includes("flying") || p.keywords.includes("armoured")) return undefined;
  if (p.baseRadius > DEFAULT_EVADE_MAX_BASE + 1e-9) return undefined;
  const agile = p.keywords.includes("light") || p.keywords.includes("jump");
  return { target: agile ? 5 : 6, against: ["pointBlank"] };
}
