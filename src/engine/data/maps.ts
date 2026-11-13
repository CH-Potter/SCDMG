import { ngon, rect } from "../geometry";
import type { AccessPoint, Objective, PlayerId, Terrain, Vec } from "../types";

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  width: number;
  height: number;
  terrain: Terrain[];
  access: AccessPoint[];
  /** Spawn zones per player (one or more polygons each). */
  spawn: [Vec[][], Vec[][]];
  objectives: Omit<Objective, "controller">[];
}

const W = 36;
const H = 36;

/** Rotate 180° about the board centre so both sides get the same map. */
const mirror = (p: Vec): Vec => ({ x: W - p.x, y: H - p.y });

function pair(id: string, kind: Terrain["kind"], poly: Vec[], level: 0 | 1 = 0): Terrain[] {
  return [
    { id: `${id}-a`, kind, level, poly },
    { id: `${id}-b`, kind, level, poly: poly.map(mirror) },
  ];
}

function accessPair(id: string, kind: AccessPoint["kind"], platform: string, low: Vec, high: Vec, mirrorPlatform?: string): AccessPoint[] {
  return [
    { id: `${id}-a`, kind, platform, low, high },
    { id: `${id}-b`, kind, platform: mirrorPlatform ?? platform, low: mirror(low), high: mirror(high) },
  ];
}

function objectivesFor(neutral: Vec[], home0: Vec, elevations: (0 | 1)[] = []): Omit<Objective, "controller">[] {
  const objs: Omit<Objective, "controller">[] = neutral.map((pos, i) => ({
    id: `obj-${i + 1}`,
    number: i + 1,
    pos,
    radius: 2.5,
    elevation: elevations[i] ?? 0,
    team: null,
  }));
  const homes: [PlayerId, Vec][] = [
    [0, home0],
    [1, mirror(home0)],
  ];
  for (const [team, pos] of homes) {
    objs.push({ id: `obj-home-${team}`, number: objs.length + 1, pos, radius: 2.5, elevation: 0, team });
  }
  return objs;
}

/** Central raised silo deck with two ramps and two ladders; deploy on opposite edges. */
const DUSTBOWL: MapDef = {
  id: "dustbowl",
  name: "Dustbowl Crossing",
  blurb: "A raised silo deck dominates the middle. Two ramps, two ladders, and everyone wants the top.",
  width: W,
  height: H,
  terrain: [
    { id: "deck", kind: "platform", level: 0, poly: rect(13, 15, 10, 6) },
    { id: "deck-crates", kind: "barricade", level: 1, poly: rect(17, 17.4, 2, 1.2) },
    ...pair("barn", "building", rect(4, 11, 5, 5)),
    ...pair("fence", "barricade", rect(14, 9, 7, 0.8)),
    ...pair("crater", "cover", ngon(9, 25, 2.4)),
    ...pair("scrub", "cover", rect(26, 27, 4, 2.5)),
    ...pair("wall", "wall", rect(29.5, 14.5, 0.8, 5)),
  ],
  access: [
    ...accessPair("ramp", "ramp", "deck", { x: 18, y: 22.6 }, { x: 18, y: 20.2 }),
    ...accessPair("ladder", "ladder", "deck", { x: 11.6, y: 18 }, { x: 13.7, y: 18 }),
  ],
  spawn: [[rect(0, 31, W, 5)], [rect(0, 0, W, 5)]],
  objectives: objectivesFor(
    [
      { x: 18, y: 18 },
      { x: 5, y: 21 },
      { x: 31, y: 15 },
    ],
    { x: 26, y: 31.5 },
    [1, 0, 0],
  ),
};

/** Two flanking mesas and a canyon floor; diagonal corner deployment. */
const MESA: MapDef = {
  id: "mesa",
  name: "Mesa Ridge",
  blurb: "Twin mesas overlook a scrubby canyon. Each has one ramp and one ladder: perfect chokepoints.",
  width: W,
  height: H,
  terrain: [
    { id: "mesa-a", kind: "platform", level: 0, poly: rect(3, 4, 8, 12) },
    { id: "mesa-b", kind: "platform", level: 0, poly: rect(25, 20, 8, 12) },
    ...pair("mesa-rocks", "barricade", rect(6, 8, 2, 1), 1),
    ...pair("canyon-scrub", "cover", rect(15, 13, 6, 3)),
    ...pair("boulders", "wall", ngon(9, 22, 1.6, 6)),
    ...pair("hut", "building", rect(21, 6, 4, 4)),
    { id: "pond", kind: "cover", level: 0, poly: ngon(18, 18, 2.2) },
  ],
  access: [
    ...accessPair("mesa-ramp", "ramp", "mesa-a", { x: 7, y: 17.6 }, { x: 7, y: 15.2 }, "mesa-b"),
    ...accessPair("mesa-ladder", "ladder", "mesa-a", { x: 12.6, y: 6 }, { x: 10.4, y: 6 }, "mesa-b"),
  ],
  spawn: [
    [
      [
        { x: 0, y: 24 },
        { x: 12, y: 36 },
        { x: 0, y: 36 },
      ],
    ],
    [
      [
        { x: 36, y: 12 },
        { x: 24, y: 0 },
        { x: 36, y: 0 },
      ],
    ],
  ],
  objectives: objectivesFor(
    [
      { x: 18, y: 18 },
      { x: 7, y: 10 },
      { x: 29, y: 26 },
    ],
    { x: 4, y: 32 },
    [0, 1, 1],
  ),
};

/** Catwalks, pipes and sheds; deploy on the left and right edges. */
const REFINERY: MapDef = {
  id: "refinery",
  name: "Old Refinery",
  blurb: "Rusty catwalks over a cluttered yard. Tight lanes, lots of cover, sneaky ladders.",
  width: W,
  height: H,
  terrain: [
    { id: "catwalk-a", kind: "platform", level: 0, poly: rect(8, 5, 4, 14) },
    { id: "catwalk-b", kind: "platform", level: 0, poly: rect(24, 17, 4, 14) },
    ...pair("tank", "building", ngon(13, 22, 2)),
    ...pair("shed", "building", rect(14, 26, 5, 4)),
    ...pair("pipes", "wall", rect(28.5, 8, 0.8, 5)),
    ...pair("drums", "barricade", rect(14, 12, 3, 1)),
    ...pair("rubble", "cover", ngon(4, 26, 2.2)),
    ...pair("tarp", "cover", rect(3, 8, 3, 3)),
  ],
  access: [
    ...accessPair("cw-ladder-n", "ladder", "catwalk-a", { x: 12.6, y: 7 }, { x: 11.4, y: 7 }, "catwalk-b"),
    ...accessPair("cw-ramp", "ramp", "catwalk-a", { x: 10, y: 20.6 }, { x: 10, y: 18.2 }, "catwalk-b"),
  ],
  spawn: [[rect(0, 0, 5, H)], [rect(W - 5, 0, 5, H)]],
  objectives: objectivesFor(
    [
      { x: 18, y: 18 },
      { x: 10, y: 12 },
      { x: 26, y: 24 },
    ],
    { x: 2.5, y: 18 },
    [0, 1, 1],
  ),
};

export const MAPS: Record<string, MapDef> = { dustbowl: DUSTBOWL, mesa: MESA, refinery: REFINERY };
