// The rig format: a part manifest (this file's types, written as TS data in `rigs/`) plus authored
// SVG parts (`parts/**/*.svg`). Everything here is plain data, so a manifest can also be stored as
// JSON (the Forge will do that). Coordinates are design units ("u"): an infantry figure is about
// 160 u tall, and `unitsPerInch` turns units into board inches.
//
// Two views of the same unit:
//   side: Option A, the Ink Rig. Drawn side-on facing LEFT; the engine mirrors it to face right.
//   top:  Option D, the Overhead Sculpt. Drawn from straight above facing UP (-y); the engine
//         rotates it freely to face its target.

import type { SlotName } from "./slots";

export type RigView = "side" | "top";
export type Tier = "tiny" | "token" | "sheet";

export interface Pt {
  x: number;
  y: number;
}

/** Bones a part can ride. Limb bones are `<limb>.upper|lower|mid|end` (mid = the knee/elbow joint). */
export type BoneRef = "root" | "pelvis" | "torso" | "head" | "gun" | `${string}.${"upper" | "lower" | "mid" | "end"}`;

/** A placement of a part's own coordinates into the frame's rest coordinates (weapons, hands). */
export interface Place {
  x: number;
  y: number;
  /** Degrees, clockwise (SVG). */
  rot: number;
  /** Uniform scale (default 1): lets a squad share one part at two sizes. */
  scale?: number;
}

/**
 * Per-part motion that needs no bones: driven by the `pulse`, `spin` and `flap` channels and applied
 * about the part's own `pivot` anchor. Egg sacs and crystals pulse, wheels and rotors spin, wings flap.
 */
export interface PartAnim {
  /** Scale by 1 + pulse * this (a breathing sac, a throbbing crystal). Negative: out of step. */
  pulse?: number;
  /** Rise and fall by pulse * this (u): a hovering crystal, a floating halo. */
  float?: number;
  /** Turn by spin * this (degrees per degree of the spin channel): wheels, propellers, rotors. */
  spin?: number;
  /** Squash across the part's y axis by flap * this (0..1): wings beating. */
  flap?: number;
}

export interface PartUse {
  /** Unique id within the rig ("helm"). */
  id: string;
  /** The authored SVG text. */
  src: string;
  bone: BoneRef;
  /** Part coords → frame rest coords. Omitted: the part is drawn in frame coords already. */
  place?: Place;
  /** Draw order (back to front). */
  z: number;
  anim?: PartAnim;
}

/** One segment of an ink limb: a capsule the engine draws (no artwork needed). */
export interface LimbSeg {
  /** Fill width (u); the ink edge is added on both sides. */
  width: number;
  slot: SlotName;
  /** A shade stripe along the side away from the light. */
  stripe?: SlotName;
  z: number;
}

export interface LimbDef {
  id: string;
  kind: "arm" | "leg";
  /** The bone the limb hangs from, and the shoulder/hip on it (frame rest coords). */
  from: { bone: "pelvis" | "torso" | "head"; at: Pt };
  /**
   * Arms without a grip: the bone the hand follows (default: the `from` bone). "gun" makes the limb
   * strike with the weapon channels: a bug's scythes and jaws lunge when it attacks.
   */
  to?: "pelvis" | "torso" | "head" | "gun";
  /** Rest elbow/knee and hand/foot. Bone lengths and bend direction are taken from these. */
  joint: Pt;
  end: Pt;
  /** Arms: the weapon grip the hand holds ("g1", "g2"). */
  grip?: string;
  upper: LimbSeg;
  lower: LimbSeg;
}

/**
 * Frame types: which generic clip set (and status poses) drives a rig, so a Forge unit animates on
 * day one. lean: humanoids. insect: many-legged bugs (scuttle, lunge, curl up). walker: heavy legged
 * machines and monsters (slow stomp). vehicle: wheels (bounce, wheels spin). hover: flyers and
 * floating hulls (sway, propellers spin, wings beat). structure: no limbs, never walks (settle, sink).
 */
export type FrameType = "lean" | "insect" | "walker" | "vehicle" | "hover" | "structure";

export interface RigDef {
  id: string;
  name: string;
  view: RigView;
  /** Frame type: which generic clip set drives it. */
  frame: FrameType;
  /** Frame coords of the feet (side) or base centre (top). */
  origin: Pt;
  unitsPerInch: number;
  /** Figure height (u), feet to crown (side) or footprint size (top): picks the zoom tier. */
  height: number;
  /** Rotation pivots (frame rest coords). */
  pivots: { torso: Pt; head: Pt };
  parts: PartUse[];
  limbs: LimbDef[];
  /** Ink edge on each side of a limb capsule (u). */
  limbInk: number;
  /**
   * Part id of the weapon: it declares grips g1/g2, a muzzle and a recoil length. None: the unit has
   * nothing to aim (eggs, a barricade), and effects use the figure's top.
   */
  weapon?: string;
  /**
   * Foot targets (frame coords) for each key pose of the walk cycle, either view. The feet are
   * planted: the cycle advances with the distance walked, one cycle per `stride` units.
   */
  gait?: Record<string, Pt>[];
  /** Ground covered by one walk cycle (u). Default: worked out from the gait keys. */
  stride?: number;
  /** Clip overrides for this rig (the brood mother's strike, the saucer's tilt). */
  clips?: Partial<Record<ClipId, Clip>>;
  /** Never mirrors or turns to face (symmetric structures: eggs, a hole, a barricade). */
  fixed?: boolean;
  /** Effect colours (#rrggbb): muzzle flash (default lamp yellow), puffs from `exhaust*` anchors. */
  fx?: { muzzle?: string; puff?: string };
  /** Base ground colour (the faction's dirt). */
  ground: string;
  /** Top view: the figure's own drop shadow on its base (u, from the base centre). */
  shadow?: { x: number; y: number; r: number };
}

/** A 2D affine matrix [a, b, c, d, tx, ty]: x' = a x + c y + tx, y' = b x + d y + ty (Pixi order). */
export type Mat = [number, number, number, number, number, number];

/** Animation channels. Additive deltas from the rest pose (scales are deltas from 1). */
export interface Channels {
  rootX: number;
  rootY: number;
  rootRot: number;
  rootSX: number;
  rootSY: number;
  pelvisX: number;
  pelvisY: number;
  torsoRot: number;
  headRot: number;
  gunX: number;
  gunY: number;
  gunRot: number;
  /** 0..1 of the weapon's recoil length, pushed back along the barrel. */
  kick: number;
  /** Walk cycle position (gait key index, fractional, wraps) and how much of it applies. */
  gait: number;
  gaitW: number;
  /** Height above the ground (u). */
  lift: number;
  /** Top view: turn away from the facing (degrees). */
  yaw: number;
  /** Top view: how far the shadow slides off (0..1). */
  shadow: number;
  /** White hit flash, colour drain (shaken), ink fade to nothing (death), muzzle flash on. */
  flash: number;
  drain: number;
  fade: number;
  muzzle: number;
  /** Part motion (see PartAnim): a -1..1 breath, a spin angle (degrees), a 0..1 wing beat. */
  pulse: number;
  spin: number;
  flap: number;
}

export type Channel = keyof Channels;

export type Ease = "linear" | "in" | "out" | "inOut" | "back";
/** [time ms, value, ease into this key]. */
export type Key = [number, number, Ease?];

export interface Clip {
  id: ClipId;
  dur: number;
  loop: boolean;
  tracks: Partial<Record<Channel, Key[]>>;
}

export type ClipId = "idle" | "step" | "recoil" | "flinch" | "death" | "bob";

export interface Status {
  selected: boolean;
  /** Wounds left / max, and shield pips (pips are drawn when the total is over 1). */
  hp: number;
  hpMax: number;
  shield: number;
  shieldMax: number;
  engaged: boolean;
  shaken: boolean;
  flying: boolean;
  spent: boolean;
}

export const NO_STATUS: Readonly<Status> = {
  selected: false,
  hp: 1,
  hpMax: 1,
  shield: 0,
  shieldMax: 0,
  engaged: false,
  shaken: false,
  flying: false,
  spent: false,
};
