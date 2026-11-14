import { ngon, rect } from "../geometry";
import type { AccessPoint, Objective, PlayerId, Terrain, Vec } from "../types";
import type { ModeId } from "./modes";

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  mode: ModeId;
  width: number;
  height: number;
  terrain: Terrain[];
  access: AccessPoint[];
  /** Spawn zones per player (one or more polygons each). */
  spawn: [Vec[][], Vec[][]];
  objectives: Omit<Objective, "controller">[];
  /** True for maps made in the map builder. */
  custom?: boolean;
  /**
   * Built for role-based missions and deliberately not point-symmetric: player 1 is side A and
   * player 2 is side B (the blurb says who is who). Balanced by simulation instead of by mirroring.
   */
  asymmetric?: boolean;
  /** What kind of battle the map is built for, matched by missions' `mapTags` (e.g. "siege", "convoy", "salvage"). */
  tags?: string[];
}

/** Helpers for authoring point-symmetric maps (rotated 180° about the centre). */
export function mapKit(W: number, H: number) {
  const mirror = (p: Vec): Vec => ({ x: W - p.x, y: H - p.y });
  const pair = (id: string, kind: Terrain["kind"], poly: Vec[], level: 0 | 1 = 0): Terrain[] => [
    { id: `${id}-a`, kind, level, poly },
    { id: `${id}-b`, kind, level, poly: poly.map(mirror) },
  ];
  const accessPair = (id: string, kind: AccessPoint["kind"], platform: string, low: Vec, high: Vec, mirrorPlatform?: string): AccessPoint[] => [
    { id: `${id}-a`, kind, platform, low, high },
    { id: `${id}-b`, kind, platform: mirrorPlatform ?? platform, low: mirror(low), high: mirror(high) },
  ];
  /** Neutral objectives as given (list both halves yourself), then a home objective per team. */
  const objectives = (neutral: { pos: Vec; elevation?: 0 | 1 }[], home0: Vec): Omit<Objective, "controller">[] => {
    const objs: Omit<Objective, "controller">[] = neutral.map((n, i) => ({
      id: `obj-${i + 1}`,
      number: i + 1,
      pos: n.pos,
      radius: 2.5,
      elevation: n.elevation ?? 0,
      team: null,
    }));
    const homes: [PlayerId, Vec][] = [
      [0, home0],
      [1, mirror(home0)],
    ];
    for (const [team, pos] of homes) objs.push({ id: `obj-home-${team}`, number: objs.length + 1, pos, radius: 2.5, elevation: 0, team });
    return objs;
  };
  return { mirror, pair, accessPair, objectives };
}

// ---------- Skirmish: 35" × 35" ----------

const S = 35;
const sk = mapKit(S, S);

/**
 * Three lanes. Two long fence walls split the board into a left, centre and right lane, so you
 * can't shoot from one to the next at ground level. The only crossing is the middle row, where the
 * silo deck sits in the centre lane with a 3" alley down each side; from the deck you can see over
 * the fence walls into the side lanes. A fence line across the centre lane has a 3" gate. Each side
 * lane has a sandbagged objective and hay bales at each end. The board is mirror-symmetric left to
 * right as well, so neither side lane favours a side.
 */
const DUSTBOWL: MapDef = {
  id: "dustbowl",
  name: "Dustbowl Crossing",
  blurb: "Three lanes split by long fence walls, crossing only in the middle at the silo deck, which sees over the walls. Push one lane hard, or hold the crossing and swing.",
  mode: "skirmish",
  width: S,
  height: S,
  terrain: [
    { id: "deck", kind: "platform", level: 0, poly: rect(14.5, 15, 6, 5) },
    ...sk.pair("deck-crates", "barricade", rect(14.7, 15.2, 1, 0.8), 1),
    ...sk.pair("deck-crates-2", "barricade", rect(19.3, 15.2, 1, 0.8), 1),
    ...sk.pair("divider-wall", "wall", rect(10.6, 21, 0.8, 8.5)),
    ...sk.pair("divider-wall-2", "wall", rect(23.6, 21, 0.8, 8.5)),
    ...sk.pair("fence", "barricade", rect(13.5, 24.5, 2.5, 0.8)),
    ...sk.pair("fence-2", "barricade", rect(19, 24.5, 2.5, 0.8)),
    ...sk.pair("sandbags", "barricade", rect(3, 14, 4, 0.8)),
    ...sk.pair("sandbags-2", "barricade", rect(28, 14, 4, 0.8)),
    ...sk.pair("hay-bales", "barricade", rect(3, 26, 4, 1.2)),
    ...sk.pair("hay-bales-2", "barricade", rect(28, 26, 4, 1.2)),
  ],
  access: [
    ...sk.accessPair("ramp", "ramp", "deck", { x: 17.5, y: 21.6 }, { x: 17.5, y: 19.2 }),
    ...sk.accessPair("ladder", "ladder", "deck", { x: 12.9, y: 17.5 }, { x: 15.2, y: 17.5 }),
  ],
  spawn: [[rect(0, 30, S, 5)], [rect(0, 0, S, 5)]],
  objectives: sk.objectives(
    [{ pos: { x: 17.5, y: 17.5 }, elevation: 1 }, { pos: { x: 5, y: 17.5 } }, { pos: { x: 30, y: 17.5 } }],
    { x: 17.5, y: 31.5 },
  ),
};

/**
 * Mesa Ridge is laid out along its diagonal: `s` runs from player 1's corner (bottom left) to player
 * 2's (top right), `t` across it (towards the bottom-right corner). These turn (s, t) into board points.
 */
const DIAG = Math.SQRT1_2;
const diagPt = (s: number, t: number): Vec => ({ x: 17.5 + (s + t) * DIAG, y: 17.5 + (t - s) * DIAG });
const diagQuad = (s0: number, s1: number, t0: number, t1: number): Vec[] => [diagPt(s0, t0), diagPt(s1, t0), diagPt(s1, t1), diagPt(s0, t1)];

/**
 * Canyon maze, diagonal corner deployment. Two broken rock ridges carve the board into a middle
 * canyon and two side canyons. The middle canyon zig-zags through the Narrows: a boulder pinches it
 * to a 3.75" gap on each side of the centre. The side canyons are the long way round, past the two
 * mesas, whose ramps come down at the windows in the ridges and look over the middle canyon.
 */
const MESA: MapDef = {
  id: "mesa",
  name: "Mesa Ridge",
  blurb: "A canyon maze: two broken ridges, a zig-zag middle canyon through the Narrows, and side canyons that loop past twin mesas looking down on it all.",
  mode: "skirmish",
  width: S,
  height: S,
  terrain: [
    ...sk.pair("mesa", "platform", diagQuad(-4, 4, -16, -10)),
    ...sk.pair("mesa-rocks", "barricade", diagQuad(1.5, 3, -15.2, -14), 1),
    ...sk.pair("ridge-1", "wall", diagQuad(-12, -2, -6.7, -5.5)),
    ...sk.pair("ridge-2", "wall", diagQuad(2.5, 11, -6.7, -5.5)),
    ...sk.pair("narrows", "building", diagQuad(-6, -4, -1.75, 5.5)),
    ...sk.pair("scree", "cover", diagQuad(-10, -7.5, -4.8, -2.3)),
    ...sk.pair("canyon-scrub", "cover", diagQuad(-9, -6, -11.5, -8.5)),
    ...sk.pair("boulders", "wall", ngon(30, 20, 1.2, 6)),
    { id: "pond", kind: "cover", level: 0, poly: ngon(17.5, 17.5, 1.8) },
  ],
  access: [
    ...sk.accessPair("mesa-ramp", "ramp", "mesa-a", diagPt(0, -8.1), diagPt(0, -10.7), "mesa-b"),
    ...sk.accessPair("mesa-ladder", "ladder", "mesa-a", diagPt(-5.6, -13), diagPt(-3.4, -13), "mesa-b"),
  ],
  spawn: [
    [
      [
        { x: 0, y: 23 },
        { x: 12, y: 35 },
        { x: 0, y: 35 },
      ],
    ],
    [
      [
        { x: 35, y: 12 },
        { x: 23, y: 0 },
        { x: 35, y: 0 },
      ],
    ],
  ],
  objectives: sk.objectives(
    [{ pos: { x: 17.5, y: 17.5 } }, { pos: diagPt(0, -13), elevation: 1 }, { pos: sk.mirror(diagPt(0, -13)), elevation: 1 }],
    { x: 4, y: 31 },
  ),
};

/**
 * Two lanes and a catwalk; deploy on the left and right edges. A pipe rack runs down the middle of
 * the board, splitting it into a north and a south lane. Over the middle of it is a raised catwalk
 * that sees into both lanes. Each side has one crossing in its own half: a 3.5" gap in the pipes
 * with the catwalk ramp's foot in it, so whoever stands there holds both the crossing and the climb.
 * The two lanes are mirror images of each other, so neither side has a better lane to pick.
 */
const REFINERY: MapDef = {
  id: "refinery",
  name: "Old Refinery",
  blurb: "A pipe rack splits the yard into two lanes, with a catwalk over the middle that sees into both. Each side owns one gap in the pipes, and the catwalk ramp starts right in it.",
  mode: "skirmish",
  width: S,
  height: S,
  terrain: [
    { id: "catwalk", kind: "platform", level: 0, poly: rect(13, 15.5, 9, 4) },
    ...sk.pair("pipes", "wall", rect(6, 17.1, 3.5, 0.8)),
    ...sk.pair("shed", "building", rect(14.5, 28.5, 6, 3.5)),
    ...sk.pair("tank", "building", ngon(9, 25, 2)),
    ...sk.pair("tank-2", "building", ngon(26, 25, 2)),
    ...sk.pair("drums", "barricade", rect(22.5, 22, 0.8, 3.5)),
    ...sk.pair("drums-2", "barricade", rect(11.7, 22, 0.8, 3.5)),
    ...sk.pair("rubble", "cover", ngon(12.5, 30.5, 1.6)),
    ...sk.pair("rubble-2", "cover", ngon(22.5, 30.5, 1.6)),
  ],
  access: [
    ...sk.accessPair("cw-ramp", "ramp", "catwalk", { x: 11.25, y: 17.5 }, { x: 13.8, y: 17.5 }),
    ...sk.accessPair("cw-ladder", "ladder", "catwalk", { x: 17.5, y: 21.1 }, { x: 17.5, y: 18.9 }),
  ],
  spawn: [[rect(0, 0, 5, S)], [rect(S - 5, 0, 5, S)]],
  objectives: sk.objectives(
    [{ pos: { x: 17.5, y: 17.5 }, elevation: 1 }, { pos: { x: 17.5, y: 25.5 } }, { pos: { x: 17.5, y: 9.5 } }],
    { x: 2.5, y: 17.5 },
  ),
};

// ---------- Assault: 70" × 35" ----------

const AW = 70;
const AH = 35;
const as = mapKit(AW, AH);

/**
 * Two lanes and a broken bridge; deploy on the short edges. A raised highway runs down the middle in
 * two spans, so the north and south lanes can't see each other. The lanes meet only at the far ends
 * and at the broken middle, a 6" gap where both spans have a ramp down. In each lane a garage leaves
 * a choice: the exposed road under the highway or the sheltered verge along the edge.
 */
const HIGHWAY: MapDef = {
  id: "highway",
  name: "Long Ridge Highway",
  blurb: "A raised highway splits the field into two lanes that can't see each other. Cross at the ends or at the broken span in the middle, where both ramps come down.",
  mode: "assault",
  width: AW,
  height: AH,
  terrain: [
    ...as.pair("highway", "platform", rect(12, 15.5, 20, 4)),
    ...as.pair("jersey", "barricade", rect(27.5, 18.3, 1.6, 0.8), 1),
    ...as.pair("garage", "building", rect(26, 24, 6, 6)),
    ...as.pair("depot", "building", rect(12, 4, 6, 5)),
    ...as.pair("wall", "wall", rect(8, 22, 0.8, 6)),
    ...as.pair("barrier", "barricade", rect(44, 23.5, 5, 0.8)),
    ...as.pair("crater", "cover", ngon(19, 27, 2.5)),
    ...as.pair("scrub", "cover", rect(45, 28, 4, 3)),
  ],
  access: [
    ...as.accessPair("hw-ramp", "ramp", "highway-a", { x: 9.6, y: 17.5 }, { x: 12.8, y: 17.5 }, "highway-b"),
    ...as.accessPair("hw-gap-ramp", "ramp", "highway-a", { x: 34.2, y: 17.5 }, { x: 31.4, y: 17.5 }, "highway-b"),
    ...as.accessPair("hw-mid-ramp", "ramp", "highway-a", { x: 22, y: 22.4 }, { x: 22, y: 19 }, "highway-b"),
    ...as.accessPair("hw-ladder-n", "ladder", "highway-a", { x: 26, y: 13.9 }, { x: 26, y: 16.1 }, "highway-b"),
  ],
  spawn: [[rect(0, 0, 6, AH)], [rect(AW - 6, 0, 6, AH)]],
  objectives: as.objectives(
    [
      { pos: { x: 35, y: 17.5 } },
      { pos: { x: 24, y: 17.5 }, elevation: 1 },
      { pos: { x: 46, y: 17.5 }, elevation: 1 },
      { pos: { x: 35, y: 27 } },
      { pos: { x: 35, y: 8 } },
    ],
    { x: 3, y: 17.5 },
  ),
};

/**
 * Street grid; deploy on the short edges. Junk stacks stand in blocks, so the board is a grid of 4"
 * streets: long sight lines down the avenues, none across the blocks. One block on each side is a
 * climbable scrap heap and one a crane deck over the avenue. The smelter fills the central plaza.
 */
const SPRAWL: MapDef = {
  id: "sprawl",
  name: "Scrapyard Sprawl",
  blurb: "Junk stacks stand in city blocks round a central smelter. Avenues are shooting galleries, alleys are safe, and the scrap heaps and crane decks look down the streets.",
  mode: "assault",
  width: AW,
  height: AH,
  terrain: [
    ...as.pair("stack-1", "building", rect(14, 3.5, 6, 5.5)),
    ...as.pair("heap", "platform", rect(14, 13, 6, 9)),
    ...as.pair("stack-2", "building", rect(14, 26, 6, 5.5)),
    ...as.pair("deck", "platform", rect(24, 3.5, 6, 5.5)),
    ...as.pair("stack-3", "building", rect(24, 13, 6, 9)),
    ...as.pair("stack-4", "building", rect(24, 26, 6, 5.5)),
    { id: "smelter", kind: "building", level: 0, poly: ngon(35, 17.5, 3) },
    ...as.pair("barrier", "barricade", rect(8, 10, 4, 0.8)),
    ...as.pair("crater", "cover", ngon(35, 29, 2)),
    ...as.pair("scrub", "cover", rect(7, 24, 4, 4)),
  ],
  access: [
    ...as.accessPair("heap-ramp", "ramp", "heap-a", { x: 12.4, y: 17.5 }, { x: 14.8, y: 17.5 }, "heap-b"),
    ...as.accessPair("heap-ladder", "ladder", "heap-a", { x: 21.6, y: 15 }, { x: 19.2, y: 15 }, "heap-b"),
    ...as.accessPair("deck-ramp", "ramp", "deck-a", { x: 27, y: 10.6 }, { x: 27, y: 8.2 }, "deck-b"),
  ],
  spawn: [[rect(0, 0, 6, AH)], [rect(AW - 6, 0, 6, AH)]],
  objectives: as.objectives(
    [
      { pos: { x: 35, y: 11 } },
      { pos: { x: 35, y: 24 } },
      { pos: { x: 17, y: 17.5 }, elevation: 1 },
      { pos: { x: 53, y: 17.5 }, elevation: 1 },
      { pos: { x: 22, y: 24 } },
      { pos: { x: 48, y: 11 } },
    ],
    { x: 3, y: 17.5 },
  ),
};

// ---------- More Skirmish maps ----------

/**
 * Central fortress with gates. The windpump yard in the middle is walled in, with one 3.6" gate in
 * each wall: the south and west gates face player 1's corner, the north and east gates player 2's.
 * Inside, toppled vane arms give the holders cover. Staggered lines: each side holds half of its
 * own edge. Each flank has a signal tower: the near side climbs it by ladder, the far side by ramp.
 */
const RATTLEVANE_SPAWN = rect(0, 30, 21, 5);
const RATTLEVANE: MapDef = {
  id: "rattlevane",
  name: "Rattlevane Junction",
  blurb: "A walled windpump yard sits in the middle with a narrow gate in each wall. Storm a gate, hold the yard, or work the signal towers round the outside.",
  mode: "skirmish",
  width: S,
  height: S,
  terrain: [
    ...sk.pair("yard-wall-s1", "wall", rect(11.5, 22.7, 2, 0.8)),
    ...sk.pair("yard-wall-s2", "wall", rect(17.1, 22.7, 6.4, 0.8)),
    ...sk.pair("yard-wall-w1", "wall", rect(11.5, 12.3, 0.8, 5.6)),
    ...sk.pair("yard-wall-w2", "wall", rect(11.5, 21.5, 0.8, 1.2)),
    ...sk.pair("vane-arm", "barricade", rect(14, 14.6, 2.4, 0.8)),
    ...sk.pair("tower", "platform", rect(2, 8.5, 6, 6)),
    ...sk.pair("tower-crates", "barricade", rect(2.4, 11, 0.9, 2), 1),
    ...sk.pair("shack", "building", rect(25, 29, 5, 4)),
    ...sk.pair("scrub", "cover", rect(4, 23, 4, 3)),
    ...sk.pair("rubble", "cover", ngon(17.5, 27.5, 1.8)),
    ...sk.pair("fence", "barricade", rect(25.5, 13.5, 0.8, 4)),
  ],
  access: [
    ...sk.accessPair("tower-ramp", "ramp", "tower-a", { x: 9.6, y: 13 }, { x: 7.2, y: 13 }, "tower-b"),
    ...sk.accessPair("tower-ladder", "ladder", "tower-a", { x: 3.5, y: 7 }, { x: 3.5, y: 9.2 }, "tower-b"),
  ],
  spawn: [[RATTLEVANE_SPAWN], [RATTLEVANE_SPAWN.map(sk.mirror)]],
  // The AI breaks ties between equal objectives by list order, so this order can matter for side bias.
  objectives: sk.objectives(
    [{ pos: { x: 17.5, y: 17.5 } }, { pos: { x: 30, y: 23.5 }, elevation: 1 }, { pos: { x: 5, y: 11.5 }, elevation: 1 }],
    { x: 4, y: 32.5 },
  ),
};

/**
 * River and two bridges. A deep sludge creek (impassable) runs across the middle. You can see and
 * shoot over its outer stretches, but sluice houses stand on the middle ones. Cross at one of two
 * 3.5" bridges or wade the slow ford in the middle. Each bridge has a mill tower on each bank (one
 * ramp, round the back). The board is mirror-symmetric left to right too, so neither bridge favours
 * a side. Each side deploys in twin pockets on its own edge, with the snack shack walled in between.
 */
const FIZZWATER_SPAWN = [rect(0, 29, 11, 6), rect(24, 29, 11, 6)];
const FIZZWATER: MapDef = {
  id: "fizzwater",
  name: "Fizzwater Ford",
  blurb: "A deep fizzing creek with two narrow bridges and a slow ford in the middle. Mill towers on both banks watch each bridge, and sluice houses block the view across the middle.",
  mode: "skirmish",
  width: S,
  height: S,
  terrain: [
    ...sk.pair("creek-bank", "barricade", rect(0, 16, 7.5, 3)),
    ...sk.pair("sluice-house", "building", rect(11, 16, 4.5, 3)),
    { id: "ford", kind: "cover", level: 0, poly: rect(15.5, 16, 4, 3) },
    ...sk.pair("mill", "platform", rect(1.5, 21, 4.5, 4)),
    ...sk.pair("mill-2", "platform", rect(29, 21, 4.5, 4)),
    ...sk.pair("mill-sacks", "barricade", rect(4.2, 21.3, 1.4, 0.9), 1),
    ...sk.pair("mill-2-sacks", "barricade", rect(29.4, 21.3, 1.4, 0.9), 1),
    ...sk.pair("pumphouse", "building", rect(15, 22, 5, 3.5)),
    ...sk.pair("yard-wall-w", "wall", rect(13, 28, 0.8, 4)),
    ...sk.pair("yard-wall-e", "wall", rect(21.2, 28, 0.8, 4)),
    ...sk.pair("reeds", "cover", rect(11, 20.5, 3.5, 2.5)),
    ...sk.pair("reeds-2", "cover", rect(20.5, 20.5, 3.5, 2.5)),
  ],
  access: [
    ...sk.accessPair("mill-ramp", "ramp", "mill-a", { x: 3.75, y: 26.6 }, { x: 3.75, y: 24.2 }, "mill-b"),
    ...sk.accessPair("mill-2-ramp", "ramp", "mill-2-a", { x: 31.25, y: 26.6 }, { x: 31.25, y: 24.2 }, "mill-2-b"),
  ],
  spawn: [FIZZWATER_SPAWN, FIZZWATER_SPAWN.map((z) => z.map(sk.mirror))],
  objectives: sk.objectives(
    [{ pos: { x: 17.5, y: 17.5 } }, { pos: { x: 9.25, y: 17.5 } }, { pos: { x: 25.75, y: 17.5 } }],
    { x: 17.5, y: 31.5 },
  ),
};

/**
 * Open centre, hedged flanks. A crystal duchess's lawn: each side deploys in an L wrapped round its
 * corner. The middle is a wide-open croquet lawn (a deliberate shooting gallery) boxed in by tall
 * hedges, with a wide gap at each army's corner. Outside the hedges run the hedge walks: slower,
 * screened routes to the glass gazebos in the other two corners. Each gazebo has a grand stair down
 * to the lawn and a back ramp at the end of each hedge walk. Topiary on the lawn gives a little
 * cover on the way in from each army's corner. Where a hedge meets a gazebo there's a 2" squeeze
 * only infantry fit through.
 * The board is mirror-symmetric about the diagonal through the armies' corners.
 */
const PRISMWICK_SPAWN = [rect(0, 31, 20, 4), rect(0, 15, 4, 16)];
const PRISMWICK: MapDef = {
  id: "prismwick",
  name: "Lady Prismwick's Lawn",
  blurb: "A wide-open croquet lawn boxed in by tall hedges. Dash across past the topiary, or creep round the screened hedge walks to the glass gazebos.",
  mode: "skirmish",
  width: S,
  height: S,
  terrain: [
    { id: "pond-fountain", kind: "cover", level: 0, poly: ngon(17.5, 17.5, 2.4) },
    ...sk.pair("gazebo", "platform", rect(4, 4, 7, 7)),
    ...sk.pair("planter", "barricade", rect(4.6, 4.6, 1.6, 1.6), 1),
    ...sk.pair("hedge-w", "wall", rect(9.5, 13, 0.8, 8.5)),
    ...sk.pair("hedge-s", "wall", rect(13.5, 24.7, 8.5, 0.8)),
    ...sk.pair("hedge", "cover", rect(15.5, 27, 4, 1.6)),
    ...sk.pair("rosebed", "cover", rect(6.4, 15.5, 1.6, 4)),
    ...sk.pair("topiary", "cover", ngon(14.5, 20.5, 1.5)),
  ],
  access: [
    ...sk.accessPair("gazebo-stair", "ramp", "gazebo-a", { x: 13, y: 13 }, { x: 10.3, y: 10.3 }, "gazebo-b"),
    ...sk.accessPair("gazebo-ramp-s", "ramp", "gazebo-a", { x: 7.5, y: 12.6 }, { x: 7.5, y: 10.2 }, "gazebo-b"),
    ...sk.accessPair("gazebo-ramp-e", "ramp", "gazebo-a", { x: 12.6, y: 7.5 }, { x: 10.2, y: 7.5 }, "gazebo-b"),
  ],
  spawn: [PRISMWICK_SPAWN, PRISMWICK_SPAWN.map((z) => z.map(sk.mirror))],
  objectives: sk.objectives(
    [
      { pos: { x: 17.5, y: 17.5 } },
      { pos: { x: 7.5, y: 7.5 }, elevation: 1 },
      { pos: { x: 27.5, y: 27.5 }, elevation: 1 },
    ],
    { x: 2.5, y: 32.5 },
  ),
};

// ---------- More Assault maps ----------

/**
 * Long-edge deployment: only 25" between the lines. The middle third is a junk-stack maze round a
 * crane deck (close quarters); the wings are open salt flats (long sight lines). Home objectives sit
 * on opposite wings, so each side raids down a different flank.
 */
const BRINEJAW: MapDef = {
  id: "brinejaw",
  name: "Brinejaw Flats",
  blurb: "A junk-stack maze in the middle, bone-dry salt flats on the wings. Knife fight or shooting gallery: pick one.",
  mode: "assault",
  width: AW,
  height: AH,
  terrain: [
    { id: "crane-deck", kind: "platform", level: 0, poly: rect(31, 14.5, 8, 6) },
    ...as.pair("junk-stack", "building", rect(23, 8, 5, 4)),
    ...as.pair("junk-tower", "building", rect(24, 21, 4, 5)),
    ...as.pair("slab", "wall", rect(30, 8, 6, 0.8)),
    ...as.pair("scrap-wall", "wall", rect(20.5, 14, 0.8, 7)),
    ...as.pair("tarp", "cover", rect(48, 6, 3, 3)),
    ...as.pair("rubble", "cover", ngon(40, 10.5, 1.6)),
    ...as.pair("crater", "cover", ngon(10, 11, 2)),
    ...as.pair("puddle", "cover", ngon(14, 25, 2.2)),
    ...as.pair("billboard", "wall", rect(6, 20, 4, 0.8)),
    ...as.pair("brine-shed", "building", rect(3, 11, 4, 3.5)),
    ...as.pair("pylon-wall", "wall", rect(15.5, 13.5, 0.8, 4.5)),
    ...as.pair("fence", "barricade", rect(56, 27, 5, 0.8)),
  ],
  access: [
    ...as.accessPair("deck-ramp", "ramp", "crane-deck", { x: 33, y: 12.5 }, { x: 33, y: 15.3 }),
    ...as.accessPair("deck-ladder", "ladder", "crane-deck", { x: 29.4, y: 19 }, { x: 31.8, y: 19 }),
  ],
  spawn: [[rect(0, 30, AW, 5)], [rect(0, 0, AW, 5)]],
  objectives: as.objectives(
    [
      { pos: { x: 35, y: 17.5 }, elevation: 1 },
      { pos: { x: 11, y: 17.5 } },
      { pos: { x: 59, y: 17.5 } },
      { pos: { x: 25.5, y: 17.5 } },
      { pos: { x: 44.5, y: 17.5 } },
    ],
    { x: 56, y: 32.5 },
  ),
};

/**
 * Wall of wrecks. Hammer and anvil: each side has a main line on its short edge and a forward pocket
 * on a long edge, near the middle. A derailed ore train lies across the field from north to south,
 * slightly askew, and splits it in two: squeeze through the 3.6" gaps between the cars, climb over
 * the ore car or a boxcar, or go round the open ends, each of which sits next to one side's pocket.
 */
const TRAIN_U = { x: 10 / Math.hypot(10, 31), y: 31 / Math.hypot(10, 31) };
/** A point in the train's frame: `u` along the track from the centre (south is positive), `v` across it (east is positive). */
const trainPt = (u: number, v: number): Vec => ({ x: 35 + u * TRAIN_U.x + v * TRAIN_U.y, y: 17.5 + u * TRAIN_U.y - v * TRAIN_U.x });
const trainQuad = (u0: number, u1: number, v0: number, v1: number): Vec[] => [trainPt(u0, v0), trainPt(u1, v0), trainPt(u1, v1), trainPt(u0, v1)];
const GUTTERBEND_SPAWN = [rect(0, 0, 6, AH), rect(24, 30, 12, 5)];
const GUTTERBEND: MapDef = {
  id: "gutterbend",
  name: "Gutterbend Derailment",
  blurb: "A derailed ore train walls off the middle. Squeeze between the cars, climb over them, or slip round the ends, and mind the pocket on your flank.",
  mode: "assault",
  width: AW,
  height: AH,
  terrain: [
    { id: "ore-car", kind: "platform", level: 0, poly: trainQuad(-3, 3, -2, 2) },
    ...as.pair("boxcar", "platform", trainQuad(6.6, 12, -2, 2)),
    ...as.pair("loco", "building", rect(42, 8, 7, 3.5)),
    ...as.pair("station", "building", rect(9, 2, 5, 4)),
    ...as.pair("signal-wall", "wall", rect(51, 5, 0.8, 7)),
    ...as.pair("crates", "barricade", rect(8, 9, 3, 1)),
    ...as.pair("rubble", "cover", ngon(25, 13, 2)),
    ...as.pair("warehouse", "building", rect(14, 15.5, 9, 4)),
    ...as.pair("water-tower", "building", ngon(24, 7, 2)),
    ...as.pair("rubble-ore", "cover", ngon(16, 23, 2)),
    ...as.pair("crater", "cover", ngon(10, 27, 2.3)),
    ...as.pair("scrub", "cover", rect(50, 29, 5, 3)),
  ],
  access: [
    ...as.accessPair("car-ramp", "ramp", "ore-car", trainPt(-1, -4.1), trainPt(-1, -1.4)),
    ...as.accessPair("boxcar-ramp", "ramp", "boxcar-a", trainPt(9.3, -4.1), trainPt(9.3, -1.4), "boxcar-b"),
    ...as.accessPair("boxcar-ladder", "ladder", "boxcar-a", trainPt(9.3, 4), trainPt(9.3, 1.6), "boxcar-b"),
  ],
  spawn: [GUTTERBEND_SPAWN, GUTTERBEND_SPAWN.map((z) => z.map(as.mirror))],
  objectives: as.objectives(
    [
      { pos: { x: 35, y: 17.5 }, elevation: 1 },
      { pos: trainPt(-9.3, 0), elevation: 1 },
      { pos: as.mirror(trainPt(-9.3, 0)), elevation: 1 },
      { pos: { x: 12, y: 30 } },
      { pos: { x: 58, y: 5 } },
    ],
    { x: 3, y: 17.5 },
  ),
};

// ---------- Asymmetric maps (role-based missions) ----------

/** Neutral objectives as given, then a home objective for side A (player 1) and side B (player 2). */
function asymObjectives(neutral: { pos: Vec; elevation?: 0 | 1 }[], homeA: Vec, homeB: Vec): Omit<Objective, "controller">[] {
  const objs: Omit<Objective, "controller">[] = neutral.map((n, i) => ({
    id: `obj-${i + 1}`,
    number: i + 1,
    pos: n.pos,
    radius: 2.5,
    elevation: n.elevation ?? 0,
    team: null,
  }));
  const homes: [PlayerId, Vec][] = [
    [0, homeA],
    [1, homeB],
  ];
  for (const [team, pos] of homes) objs.push({ id: `obj-home-${team}`, number: objs.length + 1, pos, radius: 2.5, elevation: 0, team });
  return objs;
}

/**
 * Siege. Side A holds a raised redoubt just ahead of a narrow deployment zone: ramps at the back,
 * only ladders and one breach ramp from the front, parapets on the deck and a sandbag choke below.
 * Side A's home objective (the claim stake) is at the foot of the breach ramp. Side B gets the
 * whole far edge, scrub lanes and the open flanks.
 */
const GRUBSTAKE: MapDef = {
  id: "grubstake",
  name: "Grubstake Redoubt",
  blurb: "A: prospectors dug into a raised redoubt, with their claim stake at the foot of the breach ramp. B: claim-jumpers with a wide edge, scrub lanes and open flanks.",
  mode: "skirmish",
  width: S,
  height: S,
  asymmetric: true,
  tags: ["siege"],
  terrain: [
    { id: "redoubt", kind: "platform", level: 0, poly: rect(10.5, 20, 14, 6.5) },
    { id: "parapet", kind: "barricade", level: 1, poly: rect(15.5, 20.5, 4, 0.8) },
    { id: "redoubt-crates", kind: "barricade", level: 1, poly: rect(19.5, 22.6, 1.4, 1.4) },
    { id: "sandbags-w", kind: "barricade", level: 0, poly: rect(7.5, 15.5, 6, 0.8) },
    { id: "sandbags-e", kind: "barricade", level: 0, poly: rect(21.5, 15.5, 6, 0.8) },
    { id: "bunkhouse", kind: "building", level: 0, poly: rect(28, 21, 5, 5) },
    { id: "stockade", kind: "wall", level: 0, poly: rect(4, 23, 0.8, 6) },
    { id: "ore-shed", kind: "building", level: 0, poly: rect(1.5, 13, 4, 3.5) },
    { id: "scrub-w", kind: "cover", level: 0, poly: rect(3, 6.5, 4, 4.5) },
    { id: "scrub-e", kind: "cover", level: 0, poly: rect(28, 6.5, 4, 4.5) },
    { id: "crater-w", kind: "cover", level: 0, poly: ngon(12, 10.5, 2) },
    { id: "crater-e", kind: "cover", level: 0, poly: ngon(23, 10.5, 2) },
    { id: "tarp", kind: "cover", level: 0, poly: rect(16, 6.5, 3, 3) },
    { id: "rubble", kind: "cover", level: 0, poly: ngon(31, 16, 1.6) },
  ],
  access: [
    { id: "redoubt-ramp-w", kind: "ramp", platform: "redoubt", low: { x: 12.5, y: 28.6 }, high: { x: 12.5, y: 25.7 } },
    { id: "redoubt-ramp-e", kind: "ramp", platform: "redoubt", low: { x: 22.5, y: 28.6 }, high: { x: 22.5, y: 25.7 } },
    { id: "breach-ramp", kind: "ramp", platform: "redoubt", low: { x: 7.6, y: 22.5 }, high: { x: 11.3, y: 22.5 } },
    { id: "redoubt-ladder-w", kind: "ladder", platform: "redoubt", low: { x: 13.5, y: 18.3 }, high: { x: 13.5, y: 20.8 } },
    { id: "redoubt-ladder-e", kind: "ladder", platform: "redoubt", low: { x: 21.5, y: 18.3 }, high: { x: 21.5, y: 20.8 } },
  ],
  spawn: [[rect(7, 30, 21, 5)], [rect(0, 0, S, 5)]],
  objectives: asymObjectives(
    [{ pos: { x: 17.5, y: 23.5 }, elevation: 1 }, { pos: { x: 17.5, y: 12 } }, { pos: { x: 5, y: 19.5 } }, { pos: { x: 31.5, y: 12.5 } }],
    // Side A's home sits outside the walls by the breach ramp: tucked further back (behind the
    // redoubt or on the flanks) the siege is a walkover for A, at the gate a walkover for B.
    { x: 8, y: 20.5 },
    { x: 17.5, y: 2.5 },
  ),
};

/**
 * Convoy. A crystal caravan has stalled on the road through the middle. Side A's escorts hold the
 * west edge and a pocket beside the lead wagon (where the convoy mission's strongbox starts, on the
 * neutral objective furthest from A's home); side B's raiders come down from the hills on the north
 * and south edges and hold a deep camp in the east, close to the lead wagon too.
 */
const GEMHAUL_WAGONS = [18, 33, 48];
const GEMHAUL: MapDef = {
  id: "gemhaul",
  name: "Gemhaul Ambush",
  blurb: "A: escorts guarding a stalled crystal caravan, with a squad posted at the lead wagon. B: raiders pouring down from the hills on three sides.",
  mode: "assault",
  width: AW,
  height: AH,
  asymmetric: true,
  tags: ["convoy"],
  terrain: [
    ...GEMHAUL_WAGONS.map((x, i): Terrain => ({ id: `wagon-${i + 1}`, kind: "platform", level: 0, poly: rect(x, 15.5, 7, 4) })),
    { id: "waystation", kind: "building", level: 0, poly: rect(9, 3, 6, 4) },
    { id: "water-tower", kind: "building", level: 0, poly: ngon(12, 29, 2.2) },
    { id: "fence-w", kind: "barricade", level: 0, poly: rect(10, 12.5, 0.8, 4) },
    { id: "fence-w2", kind: "barricade", level: 0, poly: rect(10, 19, 0.8, 4) },
    { id: "boulders-n", kind: "wall", level: 0, poly: ngon(30, 8, 1.8, 6) },
    { id: "boulders-s", kind: "wall", level: 0, poly: ngon(42, 27, 1.8, 6) },
    { id: "ridge-n", kind: "wall", level: 0, poly: rect(50, 7, 6, 0.8) },
    { id: "ridge-s", kind: "wall", level: 0, poly: rect(24, 27.2, 6, 0.8) },
    { id: "scrub-n", kind: "cover", level: 0, poly: rect(38, 6, 6, 3.5) },
    { id: "scrub-s", kind: "cover", level: 0, poly: rect(50, 25.5, 6, 3.5) },
    { id: "scrub-ne", kind: "cover", level: 0, poly: rect(58, 11, 3.5, 5) },
    { id: "rubble-se", kind: "cover", level: 0, poly: ngon(60, 23, 2) },
    { id: "crater-w", kind: "cover", level: 0, poly: ngon(22, 9, 2) },
    { id: "crater-sw", kind: "cover", level: 0, poly: ngon(20, 26, 2) },
    { id: "tarp-camp", kind: "cover", level: 0, poly: rect(2, 26, 4, 3) },
  ],
  access: GEMHAUL_WAGONS.flatMap((x, i): AccessPoint[] => [
    { id: `wagon-${i + 1}-ramp`, kind: "ramp", platform: `wagon-${i + 1}`, low: { x: x - 2.4, y: 17.5 }, high: { x: x + 0.8, y: 17.5 } },
    { id: `wagon-${i + 1}-ladder-n`, kind: "ladder", platform: `wagon-${i + 1}`, low: { x: x + 4.5, y: 13.8 }, high: { x: x + 4.5, y: 16.2 } },
    { id: `wagon-${i + 1}-ladder-s`, kind: "ladder", platform: `wagon-${i + 1}`, low: { x: x + 4.5, y: 21.2 }, high: { x: x + 4.5, y: 18.8 } },
  ]),
  spawn: [
    [rect(0, 9, 7, 17), rect(41, 14.5, 4, 6)],
    [rect(34, 0, 36, 4), rect(34, 31, 36, 4), rect(60, 4, 10, 27)],
  ],
  objectives: asymObjectives(
    [
      { pos: { x: 21.5, y: 17.5 }, elevation: 1 },
      { pos: { x: 36.5, y: 17.5 }, elevation: 1 },
      { pos: { x: 51.5, y: 17.5 }, elevation: 1 },
      { pos: { x: 30, y: 4 } },
      { pos: { x: 30, y: 31 } },
    ],
    { x: 3, y: 17.5 },
    { x: 67, y: 17.5 },
  ),
};

/**
 * Salvage. A crystal yacht has ploughed into the west half of the board. Side A's scrappers are
 * camped right beside the wreck, but the crash site is a cramped debris field. Side B arrives from
 * the far edge with two rocky ridges to shoot down from.
 */
const VELVET_COMET: MapDef = {
  id: "velvetcomet",
  name: "Wreck of the Velvet Comet",
  blurb: "A: scrappers camped beside a crashed crystal yacht, deep in the debris. B: rival salvagers coming in late, with two rocky ridges to shoot from.",
  mode: "skirmish",
  width: S,
  height: S,
  asymmetric: true,
  tags: ["salvage"],
  terrain: [
    { id: "hull-deck", kind: "platform", level: 0, poly: rect(10, 15, 8, 5) },
    { id: "hull-fore", kind: "building", level: 0, poly: rect(18.5, 15.5, 3.5, 4) },
    { id: "hull-fin", kind: "wall", level: 0, poly: rect(8, 11, 4, 0.8) },
    { id: "engine-pod", kind: "building", level: 0, poly: ngon(9.5, 25, 2) },
    { id: "shard-n", kind: "wall", level: 0, poly: ngon(19, 10, 1.1, 6) },
    { id: "shard-s", kind: "wall", level: 0, poly: ngon(19, 25, 1.1, 6) },
    { id: "rubble-n", kind: "cover", level: 0, poly: ngon(13, 7.5, 2.2) },
    { id: "rubble-s", kind: "cover", level: 0, poly: ngon(14.5, 29, 2.2) },
    { id: "rubble-mid", kind: "cover", level: 0, poly: rect(6, 19.5, 3, 3) },
    { id: "crater", kind: "cover", level: 0, poly: ngon(24, 17.5, 2.2) },
    { id: "ridge-n", kind: "platform", level: 0, poly: rect(23, 3, 6, 6) },
    { id: "ridge-s", kind: "platform", level: 0, poly: rect(23, 26, 6, 6) },
    { id: "ridge-n-rocks", kind: "barricade", level: 1, poly: rect(23.6, 3.6, 1.2, 2.5) },
    { id: "ridge-s-rocks", kind: "barricade", level: 1, poly: rect(23.6, 28.9, 1.2, 2.5) },
    { id: "scrub-ne", kind: "cover", level: 0, poly: rect(26, 11.5, 3, 3) },
    { id: "scrub-se", kind: "cover", level: 0, poly: rect(26, 20.5, 3, 3) },
    { id: "tarp-camp", kind: "cover", level: 0, poly: rect(1, 3, 3, 3) },
  ],
  access: [
    { id: "hull-ramp", kind: "ramp", platform: "hull-deck", low: { x: 7.6, y: 17.5 }, high: { x: 10.8, y: 17.5 } },
    { id: "hull-ladder-n", kind: "ladder", platform: "hull-deck", low: { x: 14, y: 13.2 }, high: { x: 14, y: 15.8 } },
    { id: "hull-ladder-s", kind: "ladder", platform: "hull-deck", low: { x: 14, y: 21.8 }, high: { x: 14, y: 19.2 } },
    { id: "ridge-n-ramp", kind: "ramp", platform: "ridge-n", low: { x: 31, y: 6 }, high: { x: 28.2, y: 6 } },
    { id: "ridge-n-ladder", kind: "ladder", platform: "ridge-n", low: { x: 26, y: 10.6 }, high: { x: 26, y: 8.2 } },
    { id: "ridge-s-ramp", kind: "ramp", platform: "ridge-s", low: { x: 31, y: 29 }, high: { x: 28.2, y: 29 } },
    { id: "ridge-s-ladder", kind: "ladder", platform: "ridge-s", low: { x: 26, y: 24.4 }, high: { x: 26, y: 26.8 } },
  ],
  spawn: [[rect(0, 9, 5, 17)], [rect(31.5, 0, 3.5, S)]],
  objectives: asymObjectives(
    [
      { pos: { x: 14, y: 17.5 }, elevation: 1 },
      { pos: { x: 15, y: 11 } },
      { pos: { x: 15, y: 24 } },
      { pos: { x: 25, y: 6 }, elevation: 1 },
      { pos: { x: 25, y: 29 }, elevation: 1 },
    ],
    { x: 2.5, y: 17.5 },
    { x: 33, y: 17.5 },
  ),
};

export const MAPS: Record<string, MapDef> = {
  dustbowl: DUSTBOWL,
  mesa: MESA,
  refinery: REFINERY,
  highway: HIGHWAY,
  sprawl: SPRAWL,
  rattlevane: RATTLEVANE,
  fizzwater: FIZZWATER,
  prismwick: PRISMWICK,
  brinejaw: BRINEJAW,
  gutterbend: GUTTERBEND,
  grubstake: GRUBSTAKE,
  gemhaul: GEMHAUL,
  velvetcomet: VELVET_COMET,
};
