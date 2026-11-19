// The Militia's field structures on `fieldworkRig` (structure frame: no limbs, a kick when they fire,
// a sink when destroyed), sharing one sandbag wall (side) and sandbag ring (top):
//   Scrap Turret (`mil-turret`): three rifles on a pivot behind a boiler-plate shield, the gunner on
//     a sprung tractor seat. It turns to face.
//   Pipe Mortar (`mil-mortar`): a length of mine drainpipe on a bipod, a crate of blasting charges and
//     the field telephone. It turns to face.
//   Junk Barricade (`mil-junk`, summon-only): a bedstead, an ore cart and boiler plate wired together,
//     and a very confused goat looking about. Fixed: it never turns.

import sandbagsSide from "../../parts/militia/fieldworks/sandbags.svg?raw";
import sandbagsTop from "../../parts/militia/fieldworks-top/sandbags.svg?raw";
import postSide from "../../parts/militia/turret/post.svg?raw";
import gunnerSide from "../../parts/militia/turret/gunner.svg?raw";
import guns from "../../parts/militia/turret/guns.svg?raw";
import shieldSide from "../../parts/militia/turret/shield.svg?raw";
import postTop from "../../parts/militia/turret-top/post.svg?raw";
import gunnerTop from "../../parts/militia/turret-top/gunner.svg?raw";
import shieldTop from "../../parts/militia/turret-top/shield.svg?raw";
import tube from "../../parts/militia/mortar/tube.svg?raw";
import mortarBase from "../../parts/militia/mortar/base.svg?raw";
import mortarBaseTop from "../../parts/militia/mortar-top/base.svg?raw";
import heapSide from "../../parts/militia/junk/heap.svg?raw";
import flagSide from "../../parts/militia/junk/flag.svg?raw";
import goatSide from "../../parts/militia/junk/goat.svg?raw";
import goatHeadSide from "../../parts/militia/junk/goat-head.svg?raw";
import heapTop from "../../parts/militia/junk-top/heap.svg?raw";
import goatTop from "../../parts/militia/junk-top/goat.svg?raw";
import goatHeadTop from "../../parts/militia/junk-top/goat-head.svg?raw";
import type { Clip, ClipId, PartUse, Pt, RigDef, RigView } from "../../types";

/** Design units per inch: the same scale as the line trooper. */
export const UPI = 105;
/** The Militia's dry dirt under every base. */
export const MILITIA_GROUND = "#4f4a41";

/**
 * A field structure: parts on the root, torso, head (crew) and gun bones, no limbs. Side frames
 * stand on (100, 200) unless `origin` says otherwise; top frames are centred on the base.
 */
export function fieldworkRig(o: {
  id: string;
  name: string;
  view: RigView;
  height: number;
  parts: PartUse[];
  weapon?: string;
  fixed?: boolean;
  origin?: Pt;
  head?: Pt;
  shadow?: RigDef["shadow"];
  clips?: Partial<Record<ClipId, Clip>>;
}): RigDef {
  const side = o.view === "side";
  const origin = o.origin ?? (side ? { x: 100, y: 200 } : { x: 0, y: 0 });
  return {
    id: o.id,
    name: o.name,
    view: o.view,
    frame: "structure",
    origin,
    unitsPerInch: UPI,
    height: o.height,
    pivots: { torso: origin, head: o.head ?? origin },
    parts: o.parts,
    limbs: [],
    limbInk: 2,
    weapon: o.weapon,
    fixed: o.fixed,
    clips: o.clips,
    fx: { puff: "#cfc6b4" },
    ground: MILITIA_GROUND,
    shadow: o.shadow,
  };
}

export const turretSide = (): RigDef =>
  fieldworkRig({
    id: "militia.turret.side",
    name: "Scrap Turret",
    view: "side",
    height: 124,
    head: { x: 140, y: 128 },
    parts: [
      { id: "post", src: postSide, bone: "torso", z: 2 },
      { id: "gunner", src: gunnerSide, bone: "head", z: 3 },
      { id: "guns", src: guns, bone: "gun", place: { x: 100, y: 110, rot: 0 }, z: 5 },
      { id: "shield", src: shieldSide, bone: "gun", z: 6 },
      { id: "sandbags", src: sandbagsSide, bone: "root", z: 8 },
    ],
    weapon: "guns",
  });

export const turretTop = (): RigDef =>
  fieldworkRig({
    id: "militia.turret.top",
    name: "Scrap Turret (from above)",
    view: "top",
    height: 170,
    head: { x: 0, y: 30 },
    parts: [
      { id: "sandbags", src: sandbagsTop, bone: "root", z: 1 },
      { id: "post", src: postTop, bone: "torso", z: 2 },
      { id: "gunner", src: gunnerTop, bone: "head", place: { x: 0, y: 30, rot: 0 }, z: 3 },
      { id: "guns", src: guns, bone: "gun", place: { x: 0, y: 0, rot: 90 }, z: 4 },
      { id: "shield", src: shieldTop, bone: "gun", z: 5 },
    ],
    weapon: "guns",
    shadow: { x: 8, y: 10, r: 84 },
  });

export const mortarSide = (): RigDef =>
  fieldworkRig({
    id: "militia.mortar.side",
    name: "Pipe Mortar",
    view: "side",
    height: 130,
    parts: [
      { id: "base", src: mortarBase, bone: "torso", z: 2 },
      { id: "tube", src: tube, bone: "gun", place: { x: 124, y: 158, rot: 53 }, z: 3 },
      { id: "sandbags", src: sandbagsSide, bone: "root", z: 8 },
    ],
    weapon: "tube",
  });

export const mortarTop = (): RigDef =>
  fieldworkRig({
    id: "militia.mortar.top",
    name: "Pipe Mortar (from above)",
    view: "top",
    height: 170,
    parts: [
      { id: "sandbags", src: sandbagsTop, bone: "root", z: 1 },
      { id: "base", src: mortarBaseTop, bone: "torso", z: 2 },
      { id: "tube", src: tube, bone: "gun", place: { x: 0, y: 25, rot: 90, scale: 0.65 }, z: 3 },
    ],
    weapon: "tube",
    shadow: { x: 8, y: 10, r: 84 },
  });

/** The goat looks about: holds, snaps round, stares, snaps back. Everything else stays put. */
const goatIdle = (view: RigView): Clip => ({
  id: "idle",
  dur: 3600,
  loop: true,
  tracks: {
    headRot:
      view === "side"
        ? [[0, 0], [700, 0], [780, -14, "out"], [1600, -14], [1680, 8, "out"], [2600, 8], [2680, 0, "out"], [3600, 0]]
        : [[0, 0], [700, 0], [780, -35, "out"], [1600, -35], [1680, 30, "out"], [2600, 30], [2680, 0, "out"], [3600, 0]],
  },
});

export const junkSide = (): RigDef =>
  fieldworkRig({
    id: "militia.junk.side",
    name: "Junk Barricade",
    view: "side",
    height: 126,
    origin: { x: 135, y: 200 },
    head: { x: 118, y: 106 },
    parts: [
      { id: "flag", src: flagSide, bone: "root", z: 0.5 },
      { id: "heap", src: heapSide, bone: "root", z: 1 },
      { id: "goat", src: goatSide, bone: "root", z: 2 },
      { id: "goat-head", src: goatHeadSide, bone: "head", z: 3 },
    ],
    fixed: true,
    clips: { idle: goatIdle("side") },
  });

export const junkTop = (): RigDef =>
  fieldworkRig({
    id: "militia.junk.top",
    name: "Junk Barricade (from above)",
    view: "top",
    height: 260,
    head: { x: -30, y: -2 },
    parts: [
      { id: "heap", src: heapTop, bone: "root", z: 1 },
      { id: "goat", src: goatTop, bone: "root", place: { x: -30, y: -2, rot: 0 }, z: 2 },
      { id: "goat-head", src: goatHeadTop, bone: "head", place: { x: -30, y: -2, rot: 0 }, z: 3 },
    ],
    fixed: true,
    clips: { idle: goatIdle("top") },
    shadow: { x: 10, y: 12, r: 110 },
  });
