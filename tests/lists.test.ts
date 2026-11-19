import { describe, expect, it, vi } from "vitest";
import { FACTIONS, listCost } from "../src/engine/data/factions";
import { MODES } from "../src/engine/data/modes";
import { exportable, findList, fromImport, listProblems, listSavedLists, starterList, type SavedList } from "../src/ui/lists";
import type { FactionId } from "../src/engine/types";

describe("army lists", () => {
  it("starter rosters are legal in both modes", () => {
    for (const f of Object.keys(FACTIONS) as FactionId[]) {
      for (const mode of ["skirmish", "assault"] as const) {
        const l = starterList(f, mode);
        expect(listProblems(l), `${f} ${mode}`).toEqual([]);
        expect(listCost(l.entries)).toBeLessThanOrEqual(MODES[mode].rosterLimit);
      }
    }
  });

  it("flags rosters over the limit, with too many copies, or with foreign units", () => {
    const l: SavedList = { ...starterList("militia", "skirmish"), name: "Big" };
    l.entries = Array.from({ length: 6 }, () => ({ profileId: "mil-bertha", upgrades: ["barrage"] }));
    const problems = listProblems(l);
    expect(problems.some((p) => p.includes("limit"))).toBe(true);
    expect(problems.some((p) => p.includes("At most"))).toBe(true);
    const foreign = { ...l, entries: [{ profileId: "swarm-mother", upgrades: [] }] };
    expect(listProblems(foreign).some((p) => p.includes("isn't in"))).toBe(true);
  });

  it("skips saved lists for a faction that's gone (the Munch), and keeps the rest", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    try {
      const bugs: SavedList = { ...starterList("swarm", "skirmish"), id: "list-bugs", name: "Bugs" };
      const old = { id: "list-old", name: "Old Munch", faction: "munch", mode: "skirmish", entries: [{ profileId: "munch-nibblers", upgrades: [] }], supports: ["munch-nest"], updated: 1 };
      store.set("scdmg.lists.v1", JSON.stringify([old, bugs]));
      expect(listSavedLists().map((l) => l.id)).toEqual(["list-bugs"]);
      expect(findList("list-old")).toBeUndefined();
      expect(findList("starter-munch-skirmish")).toBeUndefined();
      expect(findList("list-bugs")?.faction).toBe("swarm");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("round-trips through export and import with a fresh id", () => {
    const l: SavedList = { ...starterList("concord", "assault"), id: "list-1", name: "Shiny" };
    const back = fromImport(JSON.parse(JSON.stringify(exportable(l))));
    expect(Array.isArray(back)).toBe(false);
    if (Array.isArray(back)) return;
    expect(back.id).not.toBe("list-1");
    expect(back.entries).toEqual(l.entries);
    expect(back.mode).toBe("assault");
  });

  it("rejects files that aren't lists", () => {
    expect(fromImport({ hello: "world" })).toEqual(["That file isn't an SCDMG army list"]);
  });
});
