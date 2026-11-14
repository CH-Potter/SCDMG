import { describe, expect, it } from "vitest";
import { rect } from "../src/engine/geometry";
import { MAPS, type MapDef } from "../src/engine/data/maps";
import { mapProblems, mapWarnings, polygonsOverlap } from "../src/engine/data/mapValidation";

const clone = (m: MapDef): MapDef => JSON.parse(JSON.stringify(m)) as MapDef;

/** A small valid skirmish map to break in different ways. */
function base(): MapDef {
  return {
    id: "t",
    name: "Test",
    blurb: "",
    mode: "skirmish",
    width: 35,
    height: 35,
    terrain: [
      { id: "deck", kind: "platform", level: 0, poly: rect(12.5, 14.5, 10, 6) },
      { id: "hut", kind: "building", level: 0, poly: rect(2, 10, 4, 4) },
      { id: "crate", kind: "barricade", level: 1, poly: rect(16, 16, 2, 1) },
    ],
    access: [{ id: "ramp", kind: "ramp", platform: "deck", low: { x: 17.5, y: 22.1 }, high: { x: 17.5, y: 19.7 } }],
    spawn: [[rect(0, 30, 35, 5)], [rect(0, 0, 35, 5)]],
    objectives: [
      { id: "obj-1", number: 1, pos: { x: 17.5, y: 17.5 }, radius: 2.5, elevation: 1, team: null },
      { id: "obj-home-0", number: 2, pos: { x: 26, y: 31.5 }, radius: 2.5, elevation: 0, team: 0 },
      { id: "obj-home-1", number: 3, pos: { x: 9, y: 3.5 }, radius: 2.5, elevation: 0, team: 1 },
    ],
  };
}

describe("mapProblems", () => {
  it("accepts every built-in map, with no warnings", () => {
    for (const m of Object.values(MAPS)) {
      expect(mapProblems(m), m.id).toEqual([]);
      expect(mapWarnings(m), m.id).toEqual([]);
    }
  });

  it("keeps the original structural checks", () => {
    expect(mapProblems(null)).toEqual(["Not a map object"]);
    const m = base();
    m.width = 70;
    expect(mapProblems(m)).toContain('Skirmish maps must be 35" × 35"');
    const n = base();
    n.terrain[0]!.poly = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 2 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(mapProblems(n)).toContain("deck: platforms must be convex");
  });

  it("accepts the test base map", () => {
    expect(mapProblems(base())).toEqual([]);
    expect(mapWarnings(base())).toEqual([]);
  });

  it("flags objectives covered by buildings and on the wrong level", () => {
    const m = base();
    m.terrain.push({ id: "barn", kind: "building", level: 0, poly: rect(20, 26, 10, 9) });
    expect(mapProblems(m)).toContain("Objective 2: is completely covered by barn");
    const k = base();
    k.objectives[1]!.pos = { x: 4, y: 12 };
    expect(mapProblems(k)).toEqual([]);
    expect(mapWarnings(k)).toContain("Objective 2: centre is inside hut");
    const n = base();
    n.objectives[0]!.elevation = 0;
    expect(mapProblems(n)).toContain("Objective 1: is on deck, so its elevation must be 1");
    const o = base();
    o.objectives[1]!.elevation = 1;
    expect(mapProblems(o)).toContain("Objective 2: elevation 1 but not on a platform");
  });

  it("flags objectives off the board and duplicate numbers", () => {
    const m = base();
    m.objectives[1]!.pos = { x: 40, y: 10 };
    m.objectives[2]!.number = 1;
    const p = mapProblems(m);
    expect(p).toContain("Objective 2: must be on the board");
    expect(p).toContain("Two objectives are numbered 1");
  });

  it("flags a blocked ramp foot or top", () => {
    const m = base();
    m.terrain.push({ id: "pipe", kind: "wall", level: 0, poly: rect(16.5, 21.5, 2, 1) });
    expect(mapProblems(m)).toContain("ramp: bottom end is blocked by pipe");
    const n = base();
    n.terrain.push({ id: "rail", kind: "wall", level: 1, poly: rect(16.5, 19.2, 2, 1) });
    expect(mapProblems(n)).toContain("ramp: top end is blocked by rail");
  });

  it("flags duplicate ramp/ladder ids", () => {
    const m = base();
    m.access.push({ ...m.access[0]! });
    expect(mapProblems(m)).toContain("Duplicate ramp/ladder id ramp");
  });
});

describe("mapWarnings", () => {
  it("warns about overlapping impassable pieces but not touching ones", () => {
    const m = base();
    m.terrain.push({ id: "shed", kind: "building", level: 0, poly: rect(5, 12, 3, 3) });
    expect(mapWarnings(m)).toContain("hut overlaps shed");
    const n = base();
    n.terrain.push({ id: "shed", kind: "building", level: 0, poly: rect(6, 10, 3, 3) }); // shares an edge
    expect(mapWarnings(n)).toEqual([]);
  });

  it("warns about spawn zones on blocking terrain and overlapping each other", () => {
    const m = base();
    m.terrain.push({ id: "barn", kind: "building", level: 0, poly: rect(10, 29, 4, 4) });
    expect(mapWarnings(m)).toContain("Player 1 spawn zone overlaps barn");
    const n = base();
    n.spawn[1].push(rect(0, 28, 5, 5));
    expect(mapWarnings(n)).toContain("The two players' spawn zones overlap");
  });

  it("warns about floating level-1 pieces, unreachable platforms and missing home objectives", () => {
    const m = base();
    m.terrain.push({ id: "float", kind: "wall", level: 1, poly: rect(28, 10, 1, 3) });
    m.terrain.push({ id: "mesa", kind: "platform", level: 0, poly: rect(26, 18, 5, 5) });
    m.objectives = m.objectives.filter((o) => o.team === null);
    const w = mapWarnings(m);
    expect(w).toContain("float: is on level 1 but not on a platform");
    expect(w).toContain("mesa: has no ramp or ladder (only jumpers and flyers can get up)");
    expect(w.some((x) => x.startsWith("No home objective"))).toBe(true);
  });

  it("returns nothing for a map that has problems", () => {
    const m = clone(base());
    m.objectives = [];
    expect(mapWarnings(m)).toEqual([]);
  });
});

describe("polygonsOverlap", () => {
  it("detects containment, crossing and touching", () => {
    expect(polygonsOverlap(rect(0, 0, 10, 10), rect(2, 2, 2, 2))).toBe(true);
    expect(polygonsOverlap(rect(0, 0, 10, 2), rect(4, -4, 2, 10))).toBe(true);
    expect(polygonsOverlap(rect(0, 0, 2, 2), rect(2, 0, 2, 2))).toBe(false);
    expect(polygonsOverlap(rect(0, 0, 2, 2), rect(0, 0, 2, 2))).toBe(true);
    expect(polygonsOverlap(rect(0, 0, 2, 2), rect(5, 5, 2, 2))).toBe(false);
  });
});
