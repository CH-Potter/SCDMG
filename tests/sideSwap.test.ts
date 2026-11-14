import { describe, expect, it } from "vitest";
import { MAPS } from "../src/engine/data/maps";
import { economyOf, missionFitsMap, MISSIONS, rulesFor, swapMapSides, swapMissionSides } from "../src/engine/data/missions";
import { createGame } from "../src/engine/game";

describe("playing side B of a role mission", () => {
  const siege = MISSIONS.siege!;
  const map = Object.values(MAPS).find((m) => missionFitsMap(siege, m))!;

  it("swaps the roles and registers the copy without listing it", () => {
    const b = swapMissionSides(siege);
    expect(b.id).toBe("siege~b");
    expect(b.roles![0].id).toBe(siege.roles![1].id);
    expect(b.roles![1].id).toBe(siege.roles![0].id);
    expect(MISSIONS["siege~b"]).toBe(b);
    expect(Object.values(MISSIONS).some((m) => m.id === "siege~b")).toBe(false);
    expect(swapMissionSides(siege)).toBe(b); // cached
    // Player 1 (index 0) now has side B's economy and scoring.
    expect(economyOf(b, 0)).toEqual(economyOf(siege, 1));
    expect(rulesFor(b, 0)).toEqual(rulesFor(siege, 1));
    // Symmetric missions are left alone.
    expect(swapMissionSides(MISSIONS.hold!)).toBe(MISSIONS.hold);
  });

  it("swaps deployment zones and home objectives, and the swapped pair still fits", () => {
    const m = swapMapSides(map);
    expect(m.spawn[0]).toEqual(map.spawn[1]);
    expect(m.spawn[1]).toEqual(map.spawn[0]);
    for (const o of m.objectives) {
      const orig = map.objectives.find((x) => x.id === o.id)!;
      expect(o.team).toBe(orig.team === null ? null : 1 - orig.team);
    }
    expect(missionFitsMap(swapMissionSides(siege), m)).toBe(true);
  });

  it("a game started as side B gives the human side B's setup", () => {
    const a = createGame({ factions: ["militia", "munch"], seed: 7, map, missionId: "siege" });
    const b = createGame({ factions: ["militia", "munch"], seed: 7, map: swapMapSides(map), missionId: swapMissionSides(siege).id });
    // Side A (the holdouts) get a free garrison structure; as side B, the AI (player 2) gets it.
    const garrison = (s: typeof a, p: 0 | 1) => s.units.filter((u) => u.owner === p && u.onBoard).length;
    expect(garrison(a, 0)).toBeGreaterThan(garrison(a, 1));
    expect(garrison(b, 1)).toBeGreaterThan(garrison(b, 0));
    expect(b.players[0].resources).toBe(a.players[1].resources);
    expect(b.players[1].resources).toBe(a.players[0].resources);
  });
});
