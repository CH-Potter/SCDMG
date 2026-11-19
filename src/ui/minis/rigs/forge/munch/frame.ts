// The Munch frame helpers: any number of legs with a two-group walk (four for the mammals, six for
// the beetle, eight for the spiders and the scorpion), and the rig shells for critters, flyers and
// burrows. The clips are the insect frame's, scaled to the critter (the beast kit does the same).
//
// Frame coordinates as everywhere: origin at the feet (side, facing LEFT) or the base centre (top,
// facing UP).

import { insectClips } from "../../swarm/kit";
import type { SlotName } from "../../../slots";
import type { LimbDef, PartUse, Pt, RigDef, RigView } from "../../../types";
import { fitHeight } from "../../../kits";

export const UPI = 105;
/** Ploughed field dirt with a lick of spilled mutagen: the Munch's base ground. */
export const MUNCH_GROUND = "#5c4630";

export interface Leg {
  id: string;
  hip: Pt;
  knee: Pt;
  foot: Pt;
  /** Side view: near (in front of the body) or far (behind it). Top view: all near. */
  near: boolean;
  /** Walk group: A legs plant while B legs swing, then the other way round. */
  a: boolean;
}

export interface LegSet {
  width: [number, number];
  /** Half a stride (u) and how high a swinging foot lifts (side, u). */
  step: number;
  lift: number;
  /** z of the near legs and the far legs. */
  z: [number, number];
  /** Fill of the near legs (default the coat, plate) and the far ones (default suit). */
  slot?: SlotName;
  farSlot?: SlotName;
}

const SHADE: Partial<Record<SlotName, SlotName>> = { plate: "plateShade", suit: "suitShade", metal: "metalShade", leather: "leatherShade" };

/** Legs and their walk: planted feet slide back by equal steps, swinging ones lift (side) or tuck (top). */
export function legs(view: RigView, list: Leg[], o: LegSet): { limbs: LimbDef[]; gait: Record<string, Pt>[] } {
  const near = o.slot ?? "plate";
  const far = o.farSlot ?? "suit";
  const limbs: LimbDef[] = list.map((l, i) => {
    const slot = l.near ? near : far;
    const k = l.near ? 1 : 0.85;
    const seg = (w: number, dz: number) => ({ width: w * k, slot, stripe: l.near ? SHADE[slot] : undefined, z: (l.near ? o.z[0] : o.z[1]) + dz + i * 0.01 });
    return { id: l.id, kind: "leg", from: { bone: "pelvis", at: l.hip }, joint: l.knee, end: l.foot, upper: seg(o.width[0], 0), lower: seg(o.width[1], 0.005) };
  });
  const gait = [0, 1, 2, 3].map((key) => {
    const out: Record<string, Pt> = {};
    for (const l of list) {
      const ph = l.a ? key : (key + 2) % 4;
      const p = l.foot;
      if (view === "side") out[l.id] = ph === 0 ? { x: p.x - o.step, y: p.y } : ph === 1 ? p : ph === 2 ? { x: p.x + o.step, y: p.y } : { x: p.x, y: p.y - o.lift };
      else out[l.id] = ph === 0 ? { x: p.x, y: p.y - o.step } : ph === 1 ? p : ph === 2 ? { x: p.x, y: p.y + o.step } : { x: p.x - Math.sign(p.x) * 3, y: p.y };
    }
    return out;
  });
  return { limbs, gait };
}

/** Mirror left-side top-view legs to the right (ids l* → r*), alternating the walk groups. */
export function bothSides(left: Omit<Leg, "near">[]): Leg[] {
  return left.flatMap((l, i) => [
    { ...l, near: true, a: i % 2 === 0 },
    { ...l, id: l.id.replace(/^l/, "r"), hip: { x: -l.hip.x, y: l.hip.y }, knee: { x: -l.knee.x, y: l.knee.y }, foot: { x: -l.foot.x, y: l.foot.y }, near: true, a: i % 2 === 1 },
  ]);
}

export interface CritterOpts {
  id: string;
  name: string;
  view: RigView;
  frame?: RigDef["frame"];
  /** Relative size for the clips (1 = a 1" long critter). */
  k: number;
  /** It shoots (the web cannon, the mortar): keep the muzzle flash on its strike. */
  spits?: boolean;
  pivots: { torso: Pt; head: Pt };
  parts: PartUse[];
  limbs?: LimbDef[];
  gait?: Record<string, Pt>[];
  weapon?: string;
  limbInk?: number;
  fx?: RigDef["fx"];
  shadow?: RigDef["shadow"];
  clips?: RigDef["clips"];
  fixed?: boolean;
}

/** A Munch rig: insect clips for critters, the frame's own for flyers and burrows; height fitted to the drawing. */
export function munchRig(o: CritterOpts): RigDef {
  const frame = o.frame ?? "insect";
  const rig: RigDef = {
    id: `${o.id}.${o.view}`,
    name: o.view === "side" ? o.name : `${o.name} (from above)`,
    view: o.view,
    frame,
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: 100,
    pivots: o.pivots,
    parts: o.parts,
    limbs: o.limbs ?? [],
    limbInk: o.limbInk ?? 1.6,
    weapon: o.weapon,
    gait: o.gait,
    clips: { ...(frame === "insect" ? insectClips(o.view, o.k, o.spits) : {}), ...o.clips },
    fx: o.fx,
    ground: MUNCH_GROUND,
    ...(o.shadow ? { shadow: o.shadow } : {}),
    ...(o.fixed ? { fixed: true } : {}),
  };
  return fitHeight(rig);
}
