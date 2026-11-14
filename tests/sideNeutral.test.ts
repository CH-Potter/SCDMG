import { describe, expect, it } from "vitest";
import { aiCommand, evaluate } from "../src/engine/ai";
import { MAPS } from "../src/engine/data/maps";
import { applyCommand, createGame } from "../src/engine/game";
import { pointInPolygon, pointInZone } from "../src/engine/geometry";
import type { Command, GameState, Vec } from "../src/engine/types";
import { mirrorCmd, mirrorState } from "./helpers/mirror";

const key = (c: Command) => JSON.stringify(c, (_k, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v));

describe("neither side gets an edge from the code", () => {
  it("deployment zones count their edges as inside, for a zone and its mirror image alike", () => {
    // Mesa's corner triangle: the diagonal front edge runs from (0,23) to (12,35).
    const tri: Vec[] = [
      { x: 0, y: 23 },
      { x: 12, y: 35 },
      { x: 0, y: 35 },
    ];
    const mirror = tri.map((p) => ({ x: 35 - p.x, y: 35 - p.y }));
    const onEdge = { x: 6, y: 29 };
    // Plain ray casting disagrees between the two (that was the bias); zones must not.
    expect(pointInPolygon(onEdge, tri)).not.toBe(pointInPolygon({ x: 29, y: 6 }, mirror));
    expect(pointInZone(onEdge, tri)).toBe(true);
    expect(pointInZone({ x: 29, y: 6 }, mirror)).toBe(true);
    expect(pointInZone({ x: 7, y: 29 }, tri)).toBe(false);
  });

  it("a unit can deploy on the front edge of its zone from either side of Mesa", () => {
    const s = createGame({ factions: ["militia", "militia"], seed: 1, mapId: "mesa" });
    const W = s.board.width;
    const H = s.board.height;
    for (const p of [0, 1] as const) {
      const t = structuredClone(s);
      t.activePlayer = p;
      const u = t.units.find((x) => x.owner === p && !x.onBoard && x.profileId === "mil-grunts")!;
      const to = p === 0 ? { x: 6, y: 29 } : { x: W - 6, y: H - 29 };
      const r = applyCommand(t, { type: "deploy", uid: u.uid, to });
      expect(r.ok ? "ok" : r.error).toBe("ok");
    }
  });

  it("the AI makes the mirrored choice from the other seat (Mesa, opening turns)", () => {
    let s: GameState = createGame({ orderChoice: true, factions: ["militia", "militia"], seed: 3 * 7919, missionId: "hold", mapId: "mesa" });
    let agree = 0;
    let total = 0;
    for (let n = 0; n < 24 && !s.over; n++) {
      // The evaluation itself is side-neutral...
      for (const p of [0, 1] as const) expect(evaluate(mirrorState(s), p === 0 ? 1 : 0)).toBeCloseTo(evaluate(s, p), 6);
      // ...and so are the choices built on it.
      const a = aiCommand(s);
      const b = aiCommand(mirrorState(s));
      total++;
      if (key(mirrorCmd(s, a)) === key(b)) agree++;
      const r = applyCommand(s, a);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(agree / total).toBeGreaterThanOrEqual(0.9);
  });

  it("built-in symmetric maps' deployment zones are mirror images under the zone test", () => {
    for (const map of Object.values(MAPS).filter((m) => !m.asymmetric)) {
      for (const poly of map.spawn[0]) {
        for (const q of poly) {
          const m = { x: map.width - q.x, y: map.height - q.y };
          expect(map.spawn[1].some((z) => pointInZone(m, z)), `${map.id}: corner ${q.x},${q.y}`).toBe(true);
        }
      }
    }
  });
});
