import { describe, expect, it } from "vitest";
import { playAiActivation } from "../src/engine/ai";
import { FACTIONS, listCost } from "../src/engine/data/factions";
import { applyCommand, createGame } from "../src/engine/game";
import { pointInPolygon, rect, segmentsIntersect } from "../src/engine/geometry";
import { checkMove, hasLineOfSight, objectiveControl, unitById } from "../src/engine/rules";
import type { FactionId, GameState } from "../src/engine/types";

const ok = (r: ReturnType<typeof applyCommand>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe("geometry", () => {
  it("detects crossing segments and points in polygons", () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBe(false);
    expect(pointInPolygon({ x: 1, y: 1 }, rect(0, 0, 2, 2))).toBe(true);
    expect(pointInPolygon({ x: 3, y: 1 }, rect(0, 0, 2, 2))).toBe(false);
  });
});

describe("setup", () => {
  it("deploys every unit legally and default lists are roughly balanced", () => {
    const s = createGame({ factions: ["militia", "munch"], seed: 1 });
    expect(s.units).toHaveLength(FACTIONS.militia.defaultList.length + FACTIONS.munch.defaultList.length);
    for (const u of s.units) expect(checkMove(s, u, u.pos)).toBeNull();
    const costs = Object.values(FACTIONS).map((f) => listCost(f.defaultList));
    expect(Math.max(...costs) - Math.min(...costs)).toBeLessThanOrEqual(2);
  });
});

describe("rules", () => {
  it("blocks line of sight through the silo but not across open ground", () => {
    const s = createGame({ factions: ["militia", "concord"], seed: 1 });
    expect(hasLineOfSight(s, { x: 5, y: 15.5 }, { x: 13, y: 15.5 })).toBe(false);
    expect(hasLineOfSight(s, { x: 2, y: 2 }, { x: 2, y: 10 })).toBe(true);
  });

  it("rejects moves that are too long or end inside impassable terrain", () => {
    const s = createGame({ factions: ["militia", "concord"], seed: 1 });
    const u = s.units.find((x) => x.owner === 0)!;
    expect(checkMove(s, u, { x: u.pos.x, y: u.pos.y - 20 })).toMatch(/Too far/);
    const near = { ...u, pos: { x: 9, y: 21 } };
    expect(checkMove(s, near, { x: 9, y: 16 })).toMatch(/impassable|blocked/);
  });

  it("alternates activations between players", () => {
    let s = createGame({ factions: ["militia", "munch"], seed: 7 });
    const mine = s.units.find((u) => u.owner === 0)!;
    s = ok(applyCommand(s, { type: "end", uid: mine.uid }));
    expect(s.activePlayer).toBe(1);
    expect(unitById(s, mine.uid)!.activated).toBe(true);
    const r = applyCommand(s, { type: "end", uid: mine.uid });
    expect(r.ok).toBe(false);
  });

  it("is deterministic for a given seed", () => {
    const play = (seed: number) => {
      let s = createGame({ factions: ["concord", "militia"], seed });
      for (let i = 0; i < 12 && !s.over; i++) s = playAiActivation(s);
      return JSON.stringify(s);
    };
    expect(play(42)).toBe(play(42));
  });

  it("scores objectives for the side with more units nearby", () => {
    const s = createGame({ factions: ["militia", "munch"], seed: 3 });
    const a = s.units.find((u) => u.owner === 0)!;
    a.pos = { ...s.objectives[1]!.pos };
    expect(objectiveControl(s)[1]).toBe(0);
  });
});

describe("AI", () => {
  const ids = Object.keys(FACTIONS) as FactionId[];
  for (const a of ids) {
    for (const b of ids) {
      it(`plays a full legal game: ${a} vs ${b}`, () => {
        let s = createGame({ factions: [a, b], seed: 1234 });
        let guard = 0;
        while (!s.over && guard++ < 200) s = playAiActivation(s);
        expect(s.over).toBe(true);
        expect(s.winner).not.toBeNull();
      });
    }
  }
});
