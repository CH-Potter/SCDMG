// The standee: a unit with an uploaded picture (custom unit art) is drawn as a coin token with the
// picture on its face, upright on a peg (side view) or lying flat (top view). The picture is drawn
// into the baked page by the baker (PartUse.image), never parsed as SVG, so it stays a validated
// raster (data/unitArt.ts: PNG, JPEG or WebP only).

import type { RigDef, RigView } from "../types";
import { KIT_GROUND, UPI } from "./beast";
import { kitPart } from "./catalogue";
import { scaleRig } from "./util";

export interface StandeeOpts {
  id: string;
  name: string;
  /** The picture: a validated image data URL. */
  image: string;
  scale: number;
  flying?: boolean;
}

function build(o: StandeeOpts, view: RigView): RigDef {
  const side = view === "side";
  const rig: RigDef = {
    id: `${o.id}.${view}`,
    name: side ? o.name : `${o.name} (from above)`,
    view,
    frame: o.flying ? "hover" : "structure",
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: side ? 96 : 88,
    pivots: { torso: { x: 0, y: side ? -56 : 0 }, head: { x: 0, y: side ? -90 : 0 } },
    parts: [{ id: "coin", src: kitPart("structure", view, "coin"), bone: "torso", z: 1, image: { href: o.image, cx: 0, cy: side ? -56 : 0, r: 33 } }],
    limbs: [],
    limbInk: 1.8,
    // the picture never mirrors or turns: it would read backwards
    fixed: true,
    ground: KIT_GROUND,
    ...(side ? {} : { shadow: { x: 8, y: 10, r: 40 } }),
  };
  return scaleRig(rig, Math.min(1.3, Math.max(0.7, o.scale)));
}

export const standeeSide = (o: StandeeOpts): RigDef => build(o, "side");
export const standeeTop = (o: StandeeOpts): RigDef => build(o, "top");
