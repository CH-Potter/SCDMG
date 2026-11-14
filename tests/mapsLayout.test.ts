import { describe, expect, it } from "vitest";
import { MAPS } from "../src/engine/data/maps";
import { MODES } from "../src/engine/data/modes";
import { MISSIONS } from "../src/engine/data/missions";
import { mapProblems, mapWarnings, supportsFlags } from "../src/engine/data/mapValidation";
import { createGame } from "../src/engine/game";
import { pointInPolygon, pointSegmentDistance, polygonCentroid } from "../src/engine/geometry";
import { checkPlacement, planRoute } from "../src/engine/terrain";
import type { Terrain, Vec } from "../src/engine/types";

/** The largest base in the built-in factions is 1.4"; leave a little room on top of that. */
const CLEARANCE = 1.45;

const edgeDist = (p: Vec, poly: Vec[]): number => {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, pointSegmentDistance(p, poly[i]!, poly[(i + 1) % poly.length]!));
  return best;
};
/** Distance from a point to a polygon (0 inside). */
const polyDist = (p: Vec, poly: Vec[]): number => (pointInPolygon(p, poly) ? 0 : edgeDist(p, poly));

/** Pieces a non-jumping ground (level 0) or deck (level 1) model can't stand in. */
const blocksAt = (t: Terrain, level: 0 | 1): boolean =>
  t.kind === "building" || (t.kind === "platform" ? level === 0 : (t.kind === "wall" || t.kind === "barricade") && t.level === level);

const NEW_MAPS = ["rattlevane", "fizzwater", "prismwick", "brinejaw", "gutterbend"];
/** Every built-in point-symmetric map. */
const SYMMETRIC_MAPS = Object.values(MAPS)
  .filter((m) => !m.asymmetric)
  .map((m) => m.id);
/** Role-based maps: side A is player 1, side B is player 2. */
const ASYMMETRIC_MAPS: Record<string, string> = { grubstake: "siege", velvetcomet: "salvage", gemhaul: "convoy" };

describe("new built-in maps", () => {
  it("are registered with the right mode and size", () => {
    expect(NEW_MAPS.filter((id) => MAPS[id]?.mode === "skirmish")).toHaveLength(3);
    expect(NEW_MAPS.filter((id) => MAPS[id]?.mode === "assault")).toHaveLength(2);
    for (const id of NEW_MAPS) {
      const m = MAPS[id]!;
      expect(m.id).toBe(id);
      expect([m.width, m.height]).toEqual([MODES[m.mode].width, MODES[m.mode].height]);
      expect(m.name.length).toBeGreaterThan(3);
      expect(m.blurb.length).toBeGreaterThan(20);
    }
  });

  it("have unique names", () => {
    const names = Object.values(MAPS).map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("support every mission of their mode, snack missions included", () => {
    for (const id of SYMMETRIC_MAPS) {
      const m = MAPS[id]!;
      expect(supportsFlags(m), id).toBe(true);
      expect(m.objectives.filter((o) => o.team === null).length, id).toBeGreaterThanOrEqual(3);
      expect(Object.values(MISSIONS).some((x) => x.mode === m.mode)).toBe(true);
      // Home objectives sit on the ground, close behind their own team's lines.
      for (const o of m.objectives.filter((x) => x.team !== null)) {
        expect(o.elevation).toBe(0);
        const near = (team: 0 | 1) => Math.min(...m.spawn[team].map((z) => polyDist(o.pos, z)));
        expect(near(o.team!), `${id} home ${o.team}`).toBeLessThanOrEqual(8);
        expect(near(o.team!), `${id} home ${o.team}`).toBeLessThan(near(o.team === 0 ? 1 : 0));
      }
    }
  });
});

describe("asymmetric maps", () => {
  it("are flagged, tagged and cover both modes", () => {
    const asym = Object.values(MAPS).filter((m) => m.asymmetric);
    expect(asym.map((m) => m.id).sort()).toEqual(Object.keys(ASYMMETRIC_MAPS).sort());
    expect(asym.some((m) => m.mode === "skirmish")).toBe(true);
    expect(asym.some((m) => m.mode === "assault")).toBe(true);
    for (const m of asym) {
      expect(m.tags, m.id).toContain(ASYMMETRIC_MAPS[m.id]);
      expect(m.blurb, m.id).toMatch(/A: .*B: /);
    }
    // Symmetric built-ins don't carry the flag.
    for (const id of NEW_MAPS) expect(MAPS[id]!.asymmetric).toBeFalsy();
  });

  it("are valid, warning-free and keep generic missions playable", () => {
    for (const id of Object.keys(ASYMMETRIC_MAPS)) {
      const m = MAPS[id]!;
      expect(mapProblems(m), id).toEqual([]);
      expect(mapWarnings(m), id).toEqual([]);
      expect(supportsFlags(m), id).toBe(true);
      expect(m.objectives.filter((o) => o.team === null).length, id).toBeGreaterThanOrEqual(3);
      for (const o of m.objectives.filter((x) => x.team !== null)) {
        expect(o.elevation).toBe(0);
        const near = (team: 0 | 1) => Math.min(...m.spawn[team].map((z) => polyDist(o.pos, z)));
        expect(near(o.team!), `${id} home ${o.team}`).toBeLessThan(near(o.team === 0 ? 1 : 0));
      }
    }
  });
});

describe("map access points", () => {
  for (const m of Object.values(MAPS)) {
    it(`${m.name}: ramps and ladders are usable by every base size`, () => {
      for (const a of m.access) {
        // The foot stands clear of the cliff and anything impassable at ground level.
        for (const t of m.terrain.filter((x) => blocksAt(x, 0))) {
          expect(polyDist(a.low, t.poly), `${a.id} foot vs ${t.id}`).toBeGreaterThanOrEqual(CLEARANCE);
        }
        // The top has room on the deck: no level-1 wall or barricade crowding it.
        for (const t of m.terrain.filter((x) => x.kind !== "platform" && blocksAt(x, 1))) {
          expect(polyDist(a.high, t.poly), `${a.id} top vs ${t.id}`).toBeGreaterThanOrEqual(CLEARANCE);
        }
      }
    });

    it(`${m.name}: every raised objective can be reached by a ramp (heavy units can't use ladders)`, () => {
      for (const o of m.objectives.filter((x) => x.elevation === 1)) {
        const plat = m.terrain.find((t) => t.kind === "platform" && pointInPolygon(o.pos, t.poly))!;
        expect(m.access.some((a) => a.platform === plat.id && a.kind === "ramp"), `objective ${o.number}`).toBe(true);
      }
    });
  }
});

/**
 * Channels and choke points must not seal anyone in: the biggest heavy base (Dr. Graft and Big Mama, 1.4",
 * can't climb ladders) can walk from every spawn zone to every objective, up a ramp where needed.
 */
describe("main routes fit the biggest base", () => {
  for (const m of Object.values(MAPS)) {
    it(`${m.name}: Big Mama reaches every objective from every spawn zone`, () => {
      const s = createGame({ factions: ["munch", "munch"], map: m, lists: [[{ profileId: "munch-mama", upgrades: [] }], [{ profileId: "munch-mama", upgrades: [] }]] });
      for (const p of [0, 1] as const) {
        const u = s.units.find((x) => x.owner === p)!;
        for (const zone of m.spawn[p]) {
          // The standable point nearest the zone's centre.
          const c = polygonCentroid(zone);
          let start: Vec | null = null;
          for (let r = 0; r < 12 && !start; r += 0.5)
            for (let a = 0; a < 16 && !start; a++) {
              const q = { x: c.x + Math.cos((a / 16) * Math.PI * 2) * r, y: c.y + Math.sin((a / 16) * Math.PI * 2) * r };
              if (pointInPolygon(q, zone) && checkPlacement(s, u, q, 0, []) === null) start = q;
            }
          expect(start, `${m.id} player ${p + 1} zone`).not.toBeNull();
          for (const o of m.objectives) {
            // Symmetric maps keep every objective's centre clear (the AI heads for the centre);
            // otherwise any spot touching the objective will do.
            const clear = checkPlacement(s, u, o.pos, o.elevation, []) === null;
            if (!m.asymmetric) expect(clear, `${m.id}: objective ${o.number}'s centre fits a 1.4" base`).toBe(true);
            let target: Vec | null = clear ? o.pos : null;
            for (let r = 0.5; r <= o.radius && !target; r += 0.5)
              for (let a = 0; a < 16 && !target; a++) {
                const q = { x: o.pos.x + Math.cos((a / 16) * Math.PI * 2) * r, y: o.pos.y + Math.sin((a / 16) * Math.PI * 2) * r };
                if (checkPlacement(s, u, q, o.elevation, []) === null) target = q;
              }
            expect(target, `${m.id}: objective ${o.number} has room for a 1.4" base`).not.toBeNull();
            const route = planRoute(s, u, start!, 0, target!, []);
            expect(typeof route === "string" ? route : "ok", `${m.id}: player ${p + 1} to objective ${o.number}`).toBe("ok");
          }
        }
      }
    }, 60_000);
  }
});
