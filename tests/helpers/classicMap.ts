// Test fixture: the original Dustbowl Crossing layout (a big central silo deck, two ramps, two
// ladders, a barn, a fence and a crater on each side). Many engine tests place models at fixed
// spots on this board and refer to its pieces by id, so they play on this frozen copy rather than
// on the built-in Dustbowl, whose layout changes as the maps are reworked.

import { ngon, rect } from "../../src/engine/geometry";
import { mapKit, type MapDef } from "../../src/engine/data/maps";

const S = 35;
const sk = mapKit(S, S);

export const CLASSIC_DUSTBOWL: MapDef = {
  id: "test-classic-dustbowl",
  name: "Classic Dustbowl (test board)",
  blurb: "The original Dustbowl Crossing layout, frozen for engine tests.",
  mode: "skirmish",
  width: S,
  height: S,
  terrain: [
    { id: "deck", kind: "platform", level: 0, poly: rect(12.5, 14.5, 10, 6) },
    { id: "deck-crates", kind: "barricade", level: 1, poly: rect(16.5, 16.9, 2, 1.2) },
    ...sk.pair("barn", "building", rect(4, 11, 5, 5)),
    ...sk.pair("fence", "barricade", rect(14, 9, 7, 0.8)),
    ...sk.pair("crater", "cover", ngon(9, 25, 2.4)),
    ...sk.pair("scrub", "cover", rect(26, 27, 4, 2.5)),
    ...sk.pair("wall", "wall", rect(29.5, 14.5, 0.8, 5)),
  ],
  access: [
    ...sk.accessPair("ramp", "ramp", "deck", { x: 17.5, y: 22.1 }, { x: 17.5, y: 19.7 }),
    ...sk.accessPair("ladder", "ladder", "deck", { x: 11.1, y: 17.5 }, { x: 13.2, y: 17.5 }),
  ],
  spawn: [[rect(0, 30, S, 5)], [rect(0, 0, S, 5)]],
  objectives: sk.objectives(
    [{ pos: { x: 17.5, y: 17.5 }, elevation: 1 }, { pos: { x: 5, y: 21 } }, { pos: { x: 30, y: 14 } }],
    { x: 26, y: 31.5 },
  ),
};
