import { describe, expect, it } from "vitest";
import { createGame } from "../src/engine/game";
import { rect, segmentEntry } from "../src/engine/geometry";
import { profileOf } from "../src/engine/profile";
import { hasCover, lineOfSight, shotLine } from "../src/engine/terrain";
import type { GameState, Terrain, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

function setup(terrain: Terrain[]): { s: GameState; a: Unit; t: Unit } {
  const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "concord"], seed: 3, missionId: "brawl" });
  s.terrain = terrain;
  const a = s.units.find((u) => u.owner === 0 && profileOf(u).models > 1)!;
  const t = s.units.find((u) => u.owner === 1 && !profileOf(u).keywords?.includes("heavy") && !profileOf(u).keywords?.includes("flying"))!;
  const put = (u: Unit, at: Vec) => {
    u.onBoard = true;
    u.models.forEach((m, i) => {
      m.pos = { x: at.x, y: at.y + i * 1.5 };
      m.elevation = 0;
    });
  };
  put(a, { x: 2, y: 10 });
  put(t, { x: 20, y: 10 });
  return { s, a, t };
}

describe("segmentEntry", () => {
  it("finds where a segment first enters a polygon", () => {
    const sq = rect(5, -1, 2, 2); // x 5..7
    expect(segmentEntry({ x: 0, y: 0 }, { x: 10, y: 0 }, sq)).toBeCloseTo(0.5);
    expect(segmentEntry({ x: 6, y: 0 }, { x: 10, y: 0 }, sq)).toBe(0);
    expect(segmentEntry({ x: 0, y: 5 }, { x: 10, y: 5 }, sq)).toBeNull();
  });
});

describe("shotLine explains the aim line with the same rules as the dice", () => {
  it("marks a building that blocks sight where the shot meets it", () => {
    const { s, a, t } = setup([{ id: "b", kind: "building", level: 0, poly: rect(10, 5, 2, 10) }]);
    const am = a.models[0]!;
    const tm = t.models[0]!;
    const line = shotLine(s, am.pos, 0, t, tm, a.uid);
    expect(line.sight).toBe(false);
    expect(line.sight).toBe(lineOfSight(s, am.pos, 0, tm.pos, 0));
    const block = line.marks.find((m) => m.kind === "blocks")!;
    expect(block.t).toBeCloseTo((10 - 2) / (20 - 2), 5);
  });

  it("marks a barricade in front of the target as cover, matching hasCover", () => {
    const { s, a, t } = setup([{ id: "c", kind: "barricade", level: 0, poly: rect(18, 5, 0.5, 10) }]);
    const am = a.models[0]!;
    const tm = t.models[0]!;
    const line = shotLine(s, am.pos, 0, t, tm, a.uid);
    expect(line.sight).toBe(true);
    expect(line.cover).toBe(true);
    expect(line.cover).toBe(hasCover(s, am.pos, 0, t, tm, a.uid));
    expect(line.marks.map((m) => m.kind)).toEqual(["cover"]);
  });

  it("shows cover as ignored, with plunging fire, when shooting down from a platform", () => {
    const { s, a, t } = setup([{ id: "c", kind: "barricade", level: 0, poly: rect(18, 5, 0.5, 10) }]);
    const am = a.models[0]!;
    const tm = t.models[0]!;
    const line = shotLine(s, am.pos, 1, t, tm, a.uid);
    expect(line.cover).toBe(false);
    expect(line.cover).toBe(hasCover(s, am.pos, 1, t, tm, a.uid));
    expect(line.marks.map((m) => m.kind)).toEqual(["plunge", "cover-ignored"]);
  });

  it("an open shot has no marks", () => {
    const { s, a, t } = setup([]);
    const line = shotLine(s, a.models[0]!.pos, 0, t, t.models[0]!, a.uid);
    expect(line).toEqual({ sight: true, cover: false, marks: [] });
  });
});
