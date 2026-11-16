// Touch play: a finger can't hover, so a tap that would give an order first shows the same preview a
// mouse pointer gets (ghosts, path, odds, the green/red tip), and a second tap on the same spot or
// unit carries it out. Selecting units, opening menus and inspecting things stay one tap.
// No DOM in here, so it's unit-tested (tests/touch.test.ts).

import type { Command, Vec } from "../engine/types";

/** How close (in screen pixels) a second tap must land to confirm the first. Roughly a fingertip. */
export const CONFIRM_SLOP_PX = 28;

/** How far (in screen pixels) a finger may wander before a press becomes a pan instead of a tap. */
export const TAP_SLOP_PX = { mouse: 6, touch: 12 } as const;

const near = (a: Vec | undefined, b: Vec | undefined, tol: number): boolean =>
  !a || !b ? a === b : Math.hypot(a.x - b.x, a.y - b.y) <= tol;

/**
 * Is `next` the same order as `pending`, give or take where the finger landed? Spots (`to`, `point`)
 * may differ by up to `tol` inches; everything else (unit, target, weapon, ability...) must match.
 */
export function sameOrder(pending: Command, next: Command, tol: number): boolean {
  if (pending.type !== next.type) return false;
  const a = pending as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === "to" || k === "point") {
      if (!near(a[k] as Vec | undefined, b[k] as Vec | undefined, tol)) return false;
    } else if (a[k] !== b[k]) return false;
  }
  return true;
}

/** Board inches covered by `px` screen pixels at `ppi` pixels per inch. */
export const pxToInches = (px: number, ppi: number): number => px / Math.max(1e-6, ppi);
