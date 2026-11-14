// Timing harness for squad movement (planUnitMove runs on every hover and in AI candidate generation).
// Skipped by default; run with FORMATION_PERF=1 npx vitest run tests/formation.perf.test.ts --silent=false

import { describe, expect, it } from "vitest";
import { planUnitMove, type UnitMovePlan } from "../src/engine/formation";
import { createGame, planCharge } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { unitById } from "../src/engine/rules";
import type { GameState, Unit, Vec } from "../src/engine/types";

function game(): GameState {
  const s = createGame({ factions: ["militia", "munch"], seed: 7 });
  s.initiative = 0;
  s.activePlayer = 0;
  return s;
}

const uidOf = (s: GameState, owner: 0 | 1, profileId: string, nth = 0): string =>
  s.units.filter((u) => u.owner === owner && u.profileId === profileId)[nth]!.uid;

function place(s: GameState, uid: string, at: Vec): Unit {
  const u = unitById(s, uid)!;
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.2), y: at.y + Math.floor(i / 3) * (2 * r + 0.2) };
    m.elevation = 0;
  });
  return u;
}

function time(label: string, reps: number, fn: () => unknown): void {
  for (let i = 0; i < 3; i++) fn();
  const runs: number[] = [];
  for (let k = 0; k < 5; k++) {
    const t0 = performance.now();
    for (let i = 0; i < reps; i++) fn();
    runs.push((performance.now() - t0) / reps);
  }
  console.log(`${label.padEnd(36)} ${Math.min(...runs).toFixed(3)} ms (best of 5)`);
}

function show(label: string, u: Unit, p: UnitMovePlan | string): void {
  const r = profileOf(u).baseRadius;
  if (typeof p === "string") return void console.log(label, "->", p);
  const pts = p.placements.map((q) => q.pos);
  const gaps = pts.map((a, i) =>
    Math.min(...pts.filter((_, j) => j !== i).map((b) => Math.hypot(a.x - b.x, a.y - b.y) - 2 * r)),
  );
  console.log(
    label,
    p.placements
      .map((q) => `${q.modelId}:(${q.pos.x.toFixed(2)},${q.pos.y.toFixed(2)})e${q.elevation}`)
      .join(" "),
    "| nn gaps",
    gaps.map((g) => g.toFixed(2)).join(","),
  );
}

describe.skipIf(
  !(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
    .FORMATION_PERF,
)("planUnitMove timing", () => {
  it("typical moves", () => {
    const s = game();
    const grunts = place(s, uidOf(s, 0, "mil-grunts", 2), { x: 26, y: 33 });
    const nib = place(s, uidOf(s, 1, "munch-nibblers"), { x: 2, y: 20 });
    const ramp = place(s, uidOf(s, 1, "munch-nibblers", 1), { x: 16.5, y: 22.8 });
    const c = game();
    const target = place(c, uidOf(c, 0, "mil-grunts", 2), { x: 24, y: 29 });
    const charger = place(c, uidOf(c, 1, "munch-nibblers", 1), { x: 20, y: 22 });

    const straight = () => planUnitMove(s, grunts, 0, { x: 26, y: 28 }, { allowance: 6 });
    const barn = () => planUnitMove(s, nib, 0, { x: 2, y: 13 }, { allowance: 8 });
    const up = () => planUnitMove(s, ramp, 0, { x: 18.5, y: 19.2 }, { allowance: 8 });
    const chg = () => planCharge(c, charger, target);
    show("straight", grunts, straight());
    show("barn", nib, barn());
    show("ramp", ramp, up());
    show("charge", charger, chg());
    time("straight move (4 grunts)", 200, straight);
    time("squeeze past barn (6 nibblers)", 200, barn);
    time("up the ramp (6 nibblers)", 100, up);
    time("charge (6 nibblers)", 50, chg);
    // Hover sweep: every destination on a 1" grid inside the move ring, near the deck and its ramp.
    const dests: Vec[] = [];
    for (let dx = -8; dx <= 8; dx++)
      for (let dy = -8; dy <= 8; dy++)
        if (Math.hypot(dx, dy) <= 8) dests.push({ x: 17 + dx, y: 23 + dy });
    let okCount = 0;
    time(`hover sweep x${dests.length} (6 nibblers)`, 2, () => {
      okCount = 0;
      for (const d of dests)
        if (typeof planUnitMove(s, ramp, 0, d, { allowance: 8 }) === "object") okCount++;
    });
    console.log(`  sweep legal destinations: ${okCount}/${dests.length}`);
    expect(true).toBe(true);
  });
});
