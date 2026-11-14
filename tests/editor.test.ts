import { describe, expect, it } from "vitest";
import { MAPS, type MapDef } from "../src/engine/data/maps";
import { mapProblems } from "../src/engine/data/mapValidation";
import { rect } from "../src/engine/geometry";
import {
  addAccess,
  addObjective,
  addSpawn,
  addTerrain,
  asymmetricItems,
  blankMap,
  clampDelta,
  cloneMap,
  deleteItem,
  duplicateMap,
  hitTest,
  mirrorHalf,
  mirrorItem,
  mirrorVec,
  normalize,
  renameTerrain,
  ridersOf,
  samePoly,
  snapVec,
  translateItem,
} from "../src/editor/model";
import { History } from "../src/editor/history";
import { cleanMap, importMap, isEditable } from "../src/ui/customMaps";

describe("blank and duplicated maps", () => {
  it("makes valid blank maps of the right size for each mode", () => {
    const s = blankMap("skirmish");
    expect([s.width, s.height]).toEqual([35, 35]);
    expect(mapProblems(s)).toEqual([]);
    const a = blankMap("assault");
    expect([a.width, a.height]).toEqual([70, 35]);
    expect(mapProblems(a)).toEqual([]);
    expect(asymmetricItems(a)).toEqual([]);
  });

  it("duplicates a built-in map with a fresh id, leaving the original alone", () => {
    const src = MAPS.dustbowl!;
    const before = JSON.stringify(src);
    const d = duplicateMap(src);
    expect(d.id).not.toBe(src.id);
    expect(d.custom).toBe(true);
    d.terrain.pop();
    expect(JSON.stringify(src)).toBe(before);
  });
});

describe("editing", () => {
  it("snaps to the grid", () => {
    expect(snapVec({ x: 1.26, y: 3.74 }, 0.5)).toEqual({ x: 1.5, y: 3.5 });
    expect(snapVec({ x: 1.26, y: 3.74 }, null)).toEqual({ x: 1.26, y: 3.74 });
  });

  it("attaches ramps to the platform under the top end", () => {
    const m = blankMap("skirmish");
    addTerrain(m, "platform", rect(10, 10, 8, 6));
    const ref = addAccess(m, "ramp", { x: 14, y: 18.5 }, { x: 14, y: 15.5 });
    expect(typeof ref).toBe("object");
    expect(m.access[0]!.platform).toBe("platform-1");
    expect(addAccess(m, "ladder", { x: 2, y: 2 }, { x: 3, y: 2 })).toMatch(/must be on a platform/);
    expect(mapProblems(m)).toEqual([]);
  });

  it("auto-numbers objectives (neutral before home) and detects elevation", () => {
    const m = blankMap("skirmish");
    addTerrain(m, "platform", rect(2, 2, 6, 6));
    addObjective(m, { x: 30, y: 32 }, 0);
    const ref = addObjective(m, { x: 5, y: 5 }, null);
    expect(m.objectives.map((o) => [o.number, o.team])).toEqual([
      [1, null],
      [2, null],
      [3, 0],
    ]);
    const o = m.objectives.find((x) => ref.type === "objective" && x.id === ref.id)!;
    expect(o.pos).toEqual({ x: 5, y: 5 });
    expect(o.elevation).toBe(1);
    expect(m.objectives.find((x) => x.team === 0)!.id).toBe("obj-home-0");
  });

  it("moves a platform with its ramps, level-1 pieces and objectives, kept on the board", () => {
    const m = blankMap("skirmish");
    const plat = addTerrain(m, "platform", rect(10, 10, 8, 6));
    addTerrain(m, "barricade", rect(12, 12, 2, 1), 1);
    addAccess(m, "ladder", { x: 9, y: 12 }, { x: 11, y: 12 });
    addObjective(m, { x: 15, y: 13 }, null);
    const riders = ridersOf(m, plat);
    expect(riders.access).toHaveLength(1);
    expect(riders.terrain).toEqual(["barricade-1"]);
    expect(riders.objectives).toHaveLength(1);
    const d = clampDelta(m, plat, { x: 100, y: 0 }, riders);
    translateItem(m, plat, d, riders);
    normalize(m);
    expect(m.terrain[0]!.poly[1]!.x).toBe(35);
    expect(m.terrain[1]!.poly[0]!.x).toBe(12 + d.x);
    expect(m.access[0]!.low.x).toBe(9 + d.x);
    expect(mapProblems(m)).toEqual([]);
  });

  it("renames terrain and keeps ramps attached; deleting a platform removes its ramps", () => {
    const m = blankMap("skirmish");
    const plat = addTerrain(m, "platform", rect(10, 10, 8, 6));
    addAccess(m, "ramp", { x: 14, y: 18.5 }, { x: 14, y: 15.5 });
    expect(renameTerrain(m, "platform-1", "silo")).toBeNull();
    expect(m.access[0]!.platform).toBe("silo");
    expect(renameTerrain(m, "silo", m.access[0]!.id)).toMatch(/already used/);
    deleteItem(m, { type: "terrain", id: "silo" });
    void plat;
    expect(m.access).toEqual([]);
  });

  it("hit-tests objectives above platforms above spawn zones", () => {
    const m = blankMap("skirmish");
    addTerrain(m, "platform", rect(10, 10, 8, 6));
    expect(hitTest(m, { x: 17.5, y: 17.5 }, 0.2)).toEqual({ type: "objective", id: "obj-1" });
    expect(hitTest(m, { x: 11, y: 11 }, 0.2)).toEqual({ type: "terrain", id: "platform-1" });
    expect(hitTest(m, { x: 3, y: 33 }, 0.2)).toEqual({ type: "spawn", player: 0, index: 0 });
    expect(hitTest(m, { x: 3, y: 20 }, 0.2)).toBeNull();
  });
});

describe("mirroring", () => {
  it("rotates points 180° about the board centre", () => {
    expect(mirrorVec({ x: 10, y: 5 }, 70, 35)).toEqual({ x: 60, y: 30 });
  });

  it("mirrors a platform together with its ramp, swapping objective teams", () => {
    const m = blankMap("skirmish");
    const plat = addTerrain(m, "platform", rect(3, 4, 8, 12));
    addAccess(m, "ramp", { x: 7, y: 17.6 }, { x: 7, y: 15.2 });
    addObjective(m, { x: 7, y: 10 }, null);
    const r = mirrorItem(m, plat);
    expect(r.ref).toEqual({ type: "terrain", id: "platform-1-b" });
    expect(m.access).toHaveLength(2);
    expect(m.access[1]!.platform).toBe("platform-1-b");
    expect(m.access[1]!.low).toEqual({ x: 28, y: 17.4 });
    const home = addObjective(m, { x: 4, y: 31 }, 0);
    const h = mirrorItem(m, home);
    const copy = m.objectives.find((o) => h.ref?.type === "objective" && o.id === h.ref.id)!;
    expect(copy.team).toBe(1);
    expect(copy.pos).toEqual({ x: 31, y: 4 });
    expect(mapProblems(m)).toEqual([]);
    expect(asymmetricItems(m)).toEqual([]);
  });

  it("won't duplicate a piece that is already symmetric", () => {
    const m = blankMap("skirmish");
    const deck = addTerrain(m, "platform", rect(12.5, 14.5, 10, 6));
    const r = mirrorItem(m, deck);
    expect(r.ref).toBeNull();
    expect(m.terrain).toHaveLength(1);
  });

  it("mirrors a spawn zone to the other player", () => {
    const m = blankMap("skirmish");
    m.spawn = [[], []];
    const z = addSpawn(m, 0, rect(0, 23, 6, 12));
    mirrorItem(m, z);
    expect(m.spawn[1]).toHaveLength(1);
    expect(samePoly(m.spawn[1][0]!, rect(29, 0, 6, 12))).toBe(true);
  });

  it("rebuilds a built-in map exactly from either half", () => {
    // Asymmetric maps (built for role-based missions) can't be rebuilt from one half by design.
    for (const id of Object.keys(MAPS).filter((k) => !(MAPS[k] as { asymmetric?: boolean }).asymmetric)) {
      const src = cloneMap(MAPS[id]!);
      for (const keep of ["top", "bottom", "left", "right"] as const) {
        const { map, notes } = mirrorHalf(src, keep);
        expect(notes, `${id}/${keep}`).toEqual([]);
        expect(mapProblems(map), `${id}/${keep}`).toEqual([]);
        expect(asymmetricItems(map), `${id}/${keep}`).toEqual([]);
        expect(map.terrain).toHaveLength(src.terrain.length);
        expect(map.access).toHaveLength(src.access.length);
        expect(map.objectives).toHaveLength(src.objectives.length);
      }
    }
  });

  it("makes a lopsided map symmetric", () => {
    const m = blankMap("assault");
    addTerrain(m, "building", rect(10, 5, 5, 5));
    addTerrain(m, "building", rect(50, 5, 5, 5)); // on the dropped side, no partner
    addObjective(m, { x: 3, y: 17.5 }, 0);
    expect(asymmetricItems(m).length).toBeGreaterThan(0);
    const { map } = mirrorHalf(m, "left");
    expect(asymmetricItems(map)).toEqual([]);
    expect(map.terrain.map((t) => t.poly[0])).toEqual([
      { x: 10, y: 5 },
      { x: 60, y: 30 },
    ]);
    expect(map.objectives.filter((o) => o.team !== null).map((o) => o.team)).toEqual([0, 1]);
  });
});

describe("serialization and import", () => {
  it("strips unknown fields and the custom flag", () => {
    const m = { ...cloneMap(MAPS.mesa!), custom: true, extra: 1 } as MapDef & { extra: number };
    (m.terrain[0] as unknown as Record<string, unknown>).colour = "red";
    const c = cleanMap(m);
    expect("extra" in c).toBe(false);
    expect("custom" in c).toBe(false);
    expect("colour" in c.terrain[0]!).toBe(false);
    expect(JSON.parse(JSON.stringify(c))).toEqual(JSON.parse(JSON.stringify(MAPS.mesa)));
  });

  it("round-trips through JSON", () => {
    const m = duplicateMap(MAPS.sprawl!);
    const back = importMap(JSON.parse(JSON.stringify(cleanMap(m))));
    expect(back.problems).toEqual([]);
    expect(back.renamed).toBe(false);
    expect(back.map!.id).toBe(m.id);
    expect(back.map!.terrain).toEqual(m.terrain);
  });

  it("gives a fresh id when the id clashes with a built-in or taken map", () => {
    const r = importMap(JSON.parse(JSON.stringify(MAPS.dustbowl)));
    expect(r.renamed).toBe(true);
    expect(r.map!.id).not.toBe("dustbowl");
    expect(r.map!.id in MAPS).toBe(false);
    expect(r.problems).toEqual([]);
    const own = { ...cleanMap(duplicateMap(MAPS.mesa!)), id: "mine" };
    expect(importMap(own, ["mine"]).map!.id).not.toBe("mine");
    expect(importMap(own, ["other"]).map!.id).toBe("mine");
  });

  it("reports problems and refuses broken files", () => {
    expect(importMap("nope").map).toBeNull();
    expect(importMap([1, 2]).map).toBeNull();
    const broken = importMap({ id: "x", name: "X", mode: "skirmish", width: 35, height: 35, terrain: [{ id: "a", poly: "?" }], access: [], spawn: [[], []], objectives: [] });
    expect(broken.map).toBeNull();
    expect(broken.problems.length).toBeGreaterThan(0);
    const fixable = cleanMap(duplicateMap(MAPS.mesa!));
    fixable.objectives = [];
    const r = importMap(fixable);
    expect(r.map).not.toBeNull();
    expect(r.problems).toContain("Needs at least one objective");
    expect(isEditable(r.map)).toBe(true);
  });
});

describe("history", () => {
  it("undoes and redoes snapshots", () => {
    const h = new History<string>(3);
    h.push("a");
    h.push("b");
    expect(h.undo("c")).toBe("b");
    expect(h.undo("b")).toBe("a");
    expect(h.undo("a")).toBeNull();
    expect(h.redo("a")).toBe("b");
    expect(h.redo("b")).toBe("c");
    expect(h.redo("c")).toBeNull();
    h.push("x");
    h.push("y");
    h.push("z");
    h.push("w");
    expect(h.canUndo).toBe(true);
    expect([h.undo("v"), h.undo("w"), h.undo("z"), h.undo("y")]).toEqual(["w", "z", "y", null]);
  });
});
