import { describe, expect, it } from "vitest";
import { MAPS } from "../src/engine/data/maps";
import type { Vec } from "../src/engine/types";

/** Built-in maps must be point-symmetric (rotated 180° about the centre) so neither side gets a better board. */
describe("built-in maps are symmetric", () => {
  // Maps marked `asymmetric` (built for role-based missions) are balanced by simulation instead.
  for (const map of Object.values(MAPS).filter((m) => !(m as { asymmetric?: boolean }).asymmetric)) {
    it(map.name, () => {
      const mirror = (p: Vec): Vec => ({ x: map.width - p.x, y: map.height - p.y });
      const key = (p: Vec) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      const polyKey = (poly: Vec[]) => poly.map(key).sort().join("|");

      // Terrain: every piece has a mirrored twin of the same kind and level (or is its own twin).
      const pieces = new Set(map.terrain.map((t) => `${t.kind}/${t.level}/${polyKey(t.poly)}`));
      for (const t of map.terrain) {
        expect(pieces.has(`${t.kind}/${t.level}/${polyKey(t.poly.map(mirror))}`), `${t.id} has no mirrored twin`).toBe(true);
      }

      // Ramps and ladders.
      const access = new Set(map.access.map((a) => `${a.kind}/${key(a.low)}/${key(a.high)}`));
      for (const a of map.access) {
        expect(access.has(`${a.kind}/${key(mirror(a.low))}/${key(mirror(a.high))}`), `${a.id} has no mirrored twin`).toBe(true);
      }

      // Spawn zones: player 2's are player 1's, rotated.
      const zones1 = new Set(map.spawn[1].map(polyKey));
      for (const z of map.spawn[0]) expect(zones1.has(polyKey(z.map(mirror)))).toBe(true);
      expect(map.spawn[0].length).toBe(map.spawn[1].length);

      // Objectives: neutral ones mirror onto neutral ones; home objectives swap teams.
      const objs = new Set(map.objectives.map((o) => `${o.team}/${o.elevation}/${key(o.pos)}`));
      for (const o of map.objectives) {
        const team = o.team === null ? null : 1 - o.team;
        expect(objs.has(`${team}/${o.elevation}/${key(mirror(o.pos))}`), `objective ${o.number} has no mirrored twin`).toBe(true);
      }
    });
  }
});
