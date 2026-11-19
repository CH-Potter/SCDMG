// The Skitterswarm frame kit: a few builders that turn a handful of numbers into a whole bug rig.
// Six ink legs with a tripod walk cycle (side and top views), scythe arms that strike with the
// weapon channels, a scythe blade laid along a forearm, and the insect clips scaled to the bug's
// size. Most bugs are then just a body, a head and a back part on this one frame, which is what
// the Faction Forge's insectoid kit will reuse.
//
// Frame coordinates: origin (0, 0) at the feet (side) or base centre (top); side views face LEFT
// (-x), top views face UP (-y). Legs, gait keys and parts all use these coordinates.

import { FRAME_CLIPS } from "../../clips";
import type { SlotName } from "../../slots";
import type { Channel, Clip, ClipId, Key, LimbDef, PartUse, Pt, RigDef, RigView } from "../../types";
import eyesSrc from "../../parts/swarm/bug/eyes.svg?raw";
import plateSrc from "../../parts/swarm/bug/plate.svg?raw";
import hookSrc from "../../parts/swarm/bug/hook.svg?raw";
import hookMirrorSrc from "../../parts/swarm/bug/hook-m.svg?raw";
import knobSrc from "../../parts/swarm/bug/knob.svg?raw";

/** Design units per board inch: every Swarm figure shares the trooper's scale. */
export const UPI = 105;
/** Resin crust with egg nubs (the Hard Ink sheet's Swarm ground). */
export const SWARM_GROUND = "#4a3a48";
const DEG = 180 / Math.PI;

export const SHARED = { eyes: eyesSrc, plate: plateSrc, hook: hookSrc, hookMirror: hookMirrorSrc, knob: knobSrc };

// ---------- clips ----------

/** A copy of a clip with some channels' values multiplied by `k` (big bugs lunge further, sink deeper). */
export function scaleClip(clip: Clip, k: number, chans: Channel[]): Clip {
  const tracks: Clip["tracks"] = {};
  for (const [ch, keys] of Object.entries(clip.tracks) as [Channel, Key[]][])
    tracks[ch] = chans.includes(ch) ? keys.map(([t, v, e]) => [t, v * k, e] as Key) : keys;
  return { ...clip, tracks };
}

/** The head rides the gun bone, so its idle twitch goes on gunRot: hold, snap, hold. */
const twitch = (a: number): Key[] => [[0, 0], [540, 0], [600, -a, "out"], [900, -a], [960, a * 0.6, "out"], [1440, a * 0.6], [1500, 0, "out"], [1800, 0]];

/**
 * The insect clips for a bug of relative size `k` (1 = a 1" long bug): the lunge, the bob and the
 * collapse scale with it, the head twitches on the gun bone.
 */
export function insectClips(view: RigView, k: number, spits = false): Partial<Record<ClipId, Clip>> {
  const base = FRAME_CLIPS.insect[view];
  const recoil = scaleClip(base.recoil, k, ["gunX", "gunY", "pelvisX", "rootY"]);
  // a biter has no muzzle flash: its strike is the lunge
  if (!spits) {
    const { muzzle: _m, ...rest } = recoil.tracks;
    recoil.tracks = rest;
  }
  return {
    idle: { ...base.idle, tracks: { ...base.idle.tracks, gunRot: twitch(view === "side" ? 6 : 9) } },
    step: scaleClip(base.step, k, ["pelvisY", "gunY", "rootX"]),
    recoil,
    death: scaleClip(base.death, k, ["pelvisY", "gunY"]),
  };
}

// ---------- legs ----------

export interface SideLegs {
  /** Near-side hips, knees and feet (front, mid, rear). Feet are x on the ground (y = 0). */
  hips: [Pt, Pt, Pt];
  knees: [Pt, Pt, Pt];
  feet: [number, number, number];
  /** The far legs are the near ones shifted by this (they show behind the body). */
  far: Pt;
  /** Fill widths of the upper and lower segments (far legs are a little thinner). */
  width: [number, number];
  /** Half a stride (u) and how high a swinging foot lifts (u). */
  step: number;
  lift: number;
  /** z of the near legs (in front of the body) and the far legs (behind it). */
  z: [number, number];
}

const SEG = { near: { slot: "plate" as SlotName, stripe: "plateShade" as SlotName }, far: { slot: "suit" as SlotName, stripe: undefined } };

/**
 * Six legs seen from the side, and a tripod walk: tripod A (near front, far mid, near rear) is
 * planted while B swings, then the other way round. Planted feet slide back by equal steps.
 */
export function sideLegs(s: SideLegs): { limbs: LimbDef[]; gait: Record<string, Pt>[] } {
  const names = ["F", "M", "R"];
  const limbs: LimbDef[] = [];
  const neutral: Record<string, Pt> = {};
  for (const side of ["n", "f"] as const) {
    const d = side === "n" ? { x: 0, y: 0 } : s.far;
    const seg = SEG[side === "n" ? "near" : "far"];
    const k = side === "n" ? 1 : 0.85;
    for (let i = 0; i < 3; i++) {
      const id = `${side}${names[i]}`;
      const end = { x: s.feet[i]! + d.x, y: 0 };
      neutral[id] = end;
      limbs.push({
        id,
        kind: "leg",
        from: { bone: "pelvis", at: { x: s.hips[i]!.x + d.x, y: s.hips[i]!.y + d.y } },
        joint: { x: s.knees[i]!.x + d.x, y: s.knees[i]!.y + d.y },
        end,
        upper: { width: s.width[0] * k, slot: seg.slot, stripe: seg.stripe, z: (side === "n" ? s.z[0] : s.z[1]) + i * 0.01 },
        lower: { width: s.width[1] * k, slot: seg.slot, stripe: seg.stripe, z: (side === "n" ? s.z[0] : s.z[1]) + 0.005 + i * 0.01 },
      });
    }
  }
  const A = ["nF", "fM", "nR"];
  const gait = [0, 1, 2, 3].map((key) => {
    const out: Record<string, Pt> = {};
    for (const [id, p] of Object.entries(neutral)) {
      // A: front at key 0, back at key 2, swings through key 3; B: half a cycle later
      const ph = A.includes(id) ? key : (key + 2) % 4;
      out[id] = ph === 0 ? { x: p.x - s.step, y: 0 } : ph === 1 ? { x: p.x, y: 0 } : ph === 2 ? { x: p.x + s.step, y: 0 } : { x: p.x, y: -s.lift };
    }
    return out;
  });
  // the first leg in the keys sets the stride: put a near leg first
  return { limbs, gait };
}

export interface TopLegs {
  /** Left-side hips, knees and feet (front, mid, rear); the right side mirrors them. */
  hips: [Pt, Pt, Pt];
  knees: [Pt, Pt, Pt];
  feet: [Pt, Pt, Pt];
  width: [number, number];
  /** Half a stride (u), along the facing. */
  step: number;
  z: number;
}

/** Six legs from above, and the same tripod walk: planted feet slide back (+y), swinging ones tuck in. */
export function topLegs(s: TopLegs): { limbs: LimbDef[]; gait: Record<string, Pt>[] } {
  const names = ["F", "M", "R"];
  const limbs: LimbDef[] = [];
  const neutral: Record<string, Pt> = {};
  for (const side of ["l", "r"] as const) {
    const m = side === "l" ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      const id = `${side}${names[i]}`;
      const end = { x: s.feet[i]!.x * m, y: s.feet[i]!.y };
      neutral[id] = end;
      limbs.push({
        id,
        kind: "leg",
        from: { bone: "pelvis", at: { x: s.hips[i]!.x * m, y: s.hips[i]!.y } },
        joint: { x: s.knees[i]!.x * m, y: s.knees[i]!.y },
        end,
        upper: { width: s.width[0], slot: "plate", stripe: "plateShade", z: s.z + i * 0.01 },
        lower: { width: s.width[1], slot: "plate", stripe: "plateShade", z: s.z + 0.005 + i * 0.01 },
      });
    }
  }
  const A = ["lF", "rM", "lR"];
  const gait = [0, 1, 2, 3].map((key) => {
    const out: Record<string, Pt> = {};
    for (const [id, p] of Object.entries(neutral)) {
      const ph = A.includes(id) ? key : (key + 2) % 4;
      const tuck = Math.sign(p.x) * 3;
      out[id] = ph === 0 ? { x: p.x, y: p.y - s.step } : ph === 1 ? { x: p.x, y: p.y } : ph === 2 ? { x: p.x, y: p.y + s.step } : { x: p.x - tuck, y: p.y };
    }
    return out;
  });
  return { limbs, gait };
}

// ---------- scythes and blades ----------

/** A scythe (or dainty foreleg) arm: hangs from the thorax and strikes with the weapon channels. */
export function scytheArm(id: string, from: Pt, joint: Pt, end: Pt, o: { width?: [number, number]; z: number; slot?: SlotName; bone?: "torso" | "pelvis" | "head"; to?: LimbDef["to"] }): LimbDef {
  const w = o.width ?? [4, 3.4];
  const slot = o.slot ?? "plate";
  return {
    id,
    kind: "arm",
    from: { bone: o.bone ?? "torso", at: from },
    to: o.to ?? "gun",
    joint,
    end,
    upper: { width: w[0], slot, stripe: slot === "plate" ? "plateShade" : undefined, z: o.z },
    lower: { width: w[1], slot, stripe: slot === "plate" ? "plateShade" : undefined, z: o.z + 0.01 },
  };
}

/** The hook parts are 40 u long from their base at (0, 0) to the tip along +x. */
const HOOK_LEN = 40;

/**
 * A blade laid along an arm's forearm (it rides `<arm>.lower`): from the elbow out past the hand
 * by `reach` (1 = exactly to the hand). `mirror`: the blade curls the other way.
 */
export function bladeOn(arm: LimbDef, o: { id?: string; z: number; reach?: number; mirror?: boolean; src?: string }): PartUse {
  const L = Math.hypot(arm.end.x - arm.joint.x, arm.end.y - arm.joint.y) * (o.reach ?? 1.5);
  return {
    id: o.id ?? `${arm.id}-blade`,
    src: o.src ?? (o.mirror ? hookMirrorSrc : hookSrc),
    bone: `${arm.id}.lower`,
    place: { x: arm.joint.x, y: arm.joint.y, rot: Math.atan2(arm.end.y - arm.joint.y, arm.end.x - arm.joint.x) * DEG, scale: L / HOOK_LEN },
    z: o.z,
  };
}

// ---------- whole rigs ----------

export interface InsectOpts {
  id: string;
  name: string;
  view: RigView;
  /** Side: feet to the top of the figure (u). Top: the footprint's size. */
  height: number;
  parts: PartUse[];
  limbs: LimbDef[];
  gait?: Record<string, Pt>[];
  weapon?: string;
  /** Relative size for the clips (1 = a 1" long bug). */
  k: number;
  /** It shoots (spit, lob): keep the muzzle flash on its strike. */
  spits?: boolean;
  pivots: { torso: Pt; head: Pt };
  shadow?: RigDef["shadow"];
  fx?: RigDef["fx"];
  clips?: RigDef["clips"];
  limbInk?: number;
  stride?: number;
  frame?: RigDef["frame"];
}

export function insectRig(o: InsectOpts): RigDef {
  return {
    id: o.id,
    name: o.name,
    view: o.view,
    frame: o.frame ?? "insect",
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: o.height,
    pivots: o.pivots,
    parts: o.parts,
    limbs: o.limbs,
    limbInk: o.limbInk ?? 1.6,
    weapon: o.weapon,
    gait: o.gait,
    stride: o.stride,
    clips: { ...(o.frame && o.frame !== "insect" ? {} : insectClips(o.view, o.k, o.spits)), ...o.clips },
    fx: o.fx,
    ground: SWARM_GROUND,
    shadow: o.shadow,
  };
}

export interface StructureOpts {
  id: string;
  name: string;
  view: RigView;
  height: number;
  parts: PartUse[];
  weapon?: string;
  fixed?: boolean;
  fx?: RigDef["fx"];
  shadow?: RigDef["shadow"];
  clips?: RigDef["clips"];
}

/** A hive structure: no limbs, never walks; its weapon (a vent, a spout) kicks when it fires. */
export function structureRig(o: StructureOpts): RigDef {
  return {
    id: o.id,
    name: o.name,
    view: o.view,
    frame: "structure",
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: o.height,
    pivots: { torso: { x: 0, y: o.view === "side" ? -o.height / 2 : 0 }, head: { x: 0, y: o.view === "side" ? -o.height : 0 } },
    parts: o.parts,
    limbs: [],
    limbInk: 1.6,
    weapon: o.weapon,
    fixed: o.fixed,
    fx: o.fx,
    clips: o.clips,
    ground: SWARM_GROUND,
    shadow: o.shadow,
  };
}

/** A placement that scales a part drawn in frame coordinates by `s` about its point `p`, moving that point to `q`. */
export const about = (p: Pt, q: Pt, s: number): { x: number; y: number; rot: number; scale: number } => ({ x: q.x - s * p.x, y: q.y - s * p.y, rot: 0, scale: s });

/** A shared part placed into frame coordinates (eyes, the pheromone plate). */
export const placed = (id: string, src: string, bone: PartUse["bone"], x: number, y: number, z: number, scale = 1, rot = 0, anim?: PartUse["anim"]): PartUse => ({
  id,
  src,
  bone,
  place: { x, y, rot, scale },
  z,
  ...(anim ? { anim } : {}),
});
