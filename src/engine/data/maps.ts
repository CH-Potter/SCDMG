import { ngon, rect } from "../geometry";
import type { Objective, Terrain, Vec } from "../types";

export interface MapDef {
  name: string;
  width: number;
  height: number;
  terrain: Terrain[];
  objectives: Objective[];
  /** Deployment zones as [minY, maxY] bands, one per player. */
  deploy: [[number, number], [number, number]];
}

const W = 36;
const H = 36;

/** Rotate a point 180° about the board centre, so both sides get the same map. */
const mirror = (p: Vec): Vec => ({ x: W - p.x, y: H - p.y });

function pair(id: string, kind: Terrain["kind"], poly: Vec[]): Terrain[] {
  return [
    { id: `${id}-a`, kind, poly },
    { id: `${id}-b`, kind, poly: poly.map(mirror) },
  ];
}

export const DUSTBOWL: MapDef = {
  name: "Dustbowl Crossing",
  width: W,
  height: H,
  terrain: [
    ...pair("silo", "blocking", rect(7, 13, 4, 5)),
    ...pair("wall", "blocking", rect(15, 8, 6, 2)),
    ...pair("crater", "cover", ngon(12, 25, 2.5)),
    ...pair("scrub", "cover", rect(27, 25, 4, 3)),
    { id: "rocks", kind: "cover", poly: ngon(18, 18, 1.6, 6) },
  ],
  objectives: [
    { id: "obj-centre", pos: { x: 18, y: 18 }, radius: 3 },
    { id: "obj-west", pos: { x: 5, y: 22 }, radius: 3 },
    { id: "obj-east", pos: { x: 31, y: 14 }, radius: 3 },
  ],
  deploy: [
    [30, 35],
    [1, 6],
  ],
};
