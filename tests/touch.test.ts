// Touch play: a tapped order is previewed first and confirmed by a second tap on the same spot or
// unit (see src/ui/touch.ts).

import { describe, expect, it } from "vitest";
import type { Command } from "../src/engine/types";
import { CONFIRM_SLOP_PX, pxToInches, sameOrder, TAP_SLOP_PX } from "../src/ui/touch";

describe("confirming a tapped order", () => {
  const move: Command = { type: "move", uid: "p0-1", leader: 0, to: { x: 10, y: 20 } };

  it("accepts a second tap a fingertip away from the first", () => {
    expect(sameOrder(move, { ...move, to: { x: 10.4, y: 19.8 } }, 0.5)).toBe(true);
    expect(sameOrder(move, move, 0)).toBe(true);
  });

  it("treats a tap further away as a new spot to preview", () => {
    expect(sameOrder(move, { ...move, to: { x: 11, y: 20 } }, 0.5)).toBe(false);
  });

  it("needs the same unit, leader, kind of order, target and weapon", () => {
    expect(sameOrder(move, { ...move, uid: "p0-2" }, 1)).toBe(false);
    expect(sameOrder(move, { ...move, leader: 3 }, 1)).toBe(false);
    expect(sameOrder(move, { type: "advance", uid: "p0-1", leader: 0, to: { x: 10, y: 20 } }, 1)).toBe(false);
    const shoot: Command = { type: "shoot", uid: "p0-1", target: "p1-0", weapon: 0 };
    expect(sameOrder(shoot, { ...shoot }, 0)).toBe(true);
    expect(sameOrder(shoot, { ...shoot, target: "p1-1" }, 5)).toBe(false);
    expect(sameOrder(shoot, { ...shoot, weapon: 1 }, 5)).toBe(false);
  });

  it("compares support and ability spots, and a missing spot only matches a missing spot", () => {
    const blast: Command = { type: "support", player: 0, support: "s", ability: "a", point: { x: 5, y: 5 } };
    expect(sameOrder(blast, { ...blast, point: { x: 5.2, y: 5 } }, 0.3)).toBe(true);
    expect(sameOrder(blast, { type: "support", player: 0, support: "s", ability: "a" }, 10)).toBe(false);
    const hop: Command = { type: "ability", uid: "p0-1", ability: "blink", point: { x: 1, y: 1 } };
    expect(sameOrder(hop, { ...hop, target: "p0-2" }, 10)).toBe(false);
  });

  it("sizes the allowances for fingers", () => {
    expect(TAP_SLOP_PX.touch).toBeGreaterThan(TAP_SLOP_PX.mouse);
    // 28px at 20 pixels per inch is 1.4": tighter when zoomed in, looser zoomed out
    expect(pxToInches(CONFIRM_SLOP_PX, 20)).toBeCloseTo(1.4);
    expect(pxToInches(CONFIRM_SLOP_PX, 40)).toBeCloseTo(0.7);
    expect(Number.isFinite(pxToInches(10, 0))).toBe(true);
  });
});
