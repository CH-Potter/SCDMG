// The structure kit: towers on a stepped plinth (a bunker for plain and cap factions, a crystal pylon
// for crystal ones, an organic pod for teeth ones) with the recipe's gun as a turret or a beacon on
// top, and summoned wards (a standing stone). Frame "structure": no limbs, never walks.

import { placeAt } from "../rigs/militia/kit-troops";
import { readPart } from "../svg";
import type { PartUse, RigDef, RigView } from "../types";
import { KIT_GROUND, UPI } from "./beast";
import { kitPart } from "./catalogue";
import { kitWeapon, sideWeapon, topWeapon } from "./humanoid";
import type { KitSpec } from "./spec";
import { fitHeight, scaleRig } from "./util";

export interface StructureKitOpts {
  id: string;
  name: string;
  spec: KitSpec;
  /** Template override: the tower body ("bunker", "pylon", "pod" or a part source). */
  body?: string;
  // Template overrides below are optional; leaving them out draws exactly what the kit always drew.
  /** The footing under a permanent structure: a part source, or null for none (default: the kit plinth). */
  plinth?: string | null;
  /** The gun, in frame coords: a part and its placement; null for no gun and no beacon (default: the recipe's). */
  gun?: { src: string; place: PartUse["place"] } | null;
  /** More parts in frame coords (sandbags, flags, a crown of spikes). */
  extras?: PartUse[];
  /** A summoned (temp) structure's body, instead of the kit's standing stone. */
  ward?: string;
}

const BODY: Record<KitSpec["look"], string> = { plain: "bunker", cap: "bunker", crystal: "pylon", teeth: "pod" };

function build(o: StructureKitOpts, view: RigView): RigDef {
  const s = o.spec;
  const parts: PartUse[] = [];
  let weapon: string | undefined;
  if (s.temp) parts.push({ id: "ward", src: o.ward ?? kitPart("structure", view, "ward"), bone: "torso", z: 5 });
  else {
    const name = o.body && !o.body.startsWith("<") ? o.body : BODY[s.look] ?? "bunker";
    const body = o.body?.startsWith("<") ? o.body : kitPart("structure", view, name);
    const plinth = o.plinth === undefined ? kitPart("structure", view, "plinth") : o.plinth;
    if (plinth) parts.push({ id: "plinth", src: plinth, bone: "root", z: 1 });
    parts.push({ id: "body", src: body, bone: "torso", z: 5 });
    const mount = view === "side" ? (readPart(body).anchors.mount ?? { x: 0, y: -90 }) : { x: 0, y: 0 };
    if (o.gun) {
      parts.push({ id: "gun", src: o.gun.src, bone: "gun", place: o.gun.place, z: 6 });
      weapon = "gun";
    } else if (o.gun === null) {
      // the template draws its own crown, or nothing
    } else if (s.ranged) {
      const w = kitWeapon(s.weapon === "bow" || s.weapon === "claws" || s.weapon === "none" || s.weapon === "shield" ? "cannon" : s.weapon);
      const h = view === "side" ? sideWeapon(w) : topWeapon(w);
      const at = view === "side" ? { x: mount.x + 2, y: mount.y - 6 } : { x: 0, y: 0 };
      parts.push({ id: "gun", src: h.src, bone: "gun", place: placeAt(h.src, "g1", at, view === "side" ? -6 : 90, view === "side" ? 1.1 : 1.15), z: 6 });
      weapon = "gun";
    } else {
      const b = kitPart("structure", view, "beacon");
      parts.push({ id: "beacon", src: b, bone: "head", place: view === "side" ? placeAt(b, "pivot", { x: mount.x, y: mount.y - 10 }) : undefined, z: 6, anim: { pulse: 0.08 } });
    }
  }
  parts.push(...(o.extras ?? []));
  let rig: RigDef = {
    id: `${o.id}.${view}`,
    name: view === "side" ? o.name : `${o.name} (from above)`,
    view,
    frame: "structure",
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: 100,
    pivots: { torso: { x: 0, y: view === "side" ? -50 : 0 }, head: { x: 0, y: view === "side" ? -90 : 0 } },
    parts,
    limbs: [],
    limbInk: 1.8,
    weapon,
    ground: KIT_GROUND,
    ...(view === "top" ? { shadow: { x: 10, y: 12, r: 40 } } : {}),
  };
  rig = fitHeight(rig);
  return scaleRig(rig, s.scale);
}

export const structureSide = (o: StructureKitOpts): RigDef => build(o, "side");
export const structureTop = (o: StructureKitOpts): RigDef => build(o, "top");
