// Deep Borer (swarm-borer): a tunnelling bug as long as an ore train, rearing out of its own mound.
// No legs: the body is one wide ink limb (the spine) from the hole up to the head, which rides the
// gun bone, so the head's sway and strike bend the whole body. Chitin rings ride the spine's bones,
// scythes hang from under the head, and the mouth is a ring of grinding teeth.

import mound from "../../parts/swarm/borer/mound.svg?raw";
import head from "../../parts/swarm/borer/head.svg?raw";
import moundTop from "../../parts/swarm/borer-top/mound.svg?raw";
import segment from "../../parts/swarm/bug/segment.svg?raw";
import type { LimbDef, PartUse, Pt, RigDef } from "../../types";
import { bladeOn, insectRig, placed, scytheArm, SHARED } from "./kit";

const DEG = 180 / Math.PI;

/** The body: a fat soft limb from the mound to the neck that follows the head (gun bone). */
function spine(from: Pt, joint: Pt, end: Pt, width: number): LimbDef {
  return {
    id: "spine",
    kind: "arm",
    from: { bone: "pelvis", at: from },
    to: "gun",
    joint,
    end,
    upper: { width, slot: "suit", z: 2 },
    lower: { width: width * 0.86, slot: "suit", z: 2.01 },
  };
}

/** Chitin rings along the spine: `ts` are positions 0..1 along a segment, sizes taper towards the head. */
function rings(s: LimbDef, seg: "upper" | "lower", ts: number[], scale: [number, number], z0: number): PartUse[] {
  const a = seg === "upper" ? s.from.at : s.joint;
  const b = seg === "upper" ? s.joint : s.end;
  const rot = Math.atan2(b.y - a.y, b.x - a.x) * DEG;
  return ts.map((t, i) => ({
    id: `ring-${seg}-${i}`,
    src: segment,
    bone: `spine.${seg}` as const,
    place: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, rot, scale: scale[0] + (scale[1] - scale[0]) * (ts.length > 1 ? i / (ts.length - 1) : 0) },
    z: z0 + i * 0.1,
  }));
}

export function borerSide(): RigDef {
  const body = spine({ x: 14, y: -30 }, { x: 40, y: -128 }, { x: -4, y: -194 }, 30);
  const near = scytheArm("armN", { x: 26, y: -156 }, { x: -6, y: -188 }, { x: -38, y: -164 }, { z: 11, width: [6.4, 5.6] });
  const far = scytheArm("armF", { x: 34, y: -158 }, { x: 8, y: -192 }, { x: -24, y: -170 }, { z: 1, slot: "suit", width: [5.6, 4.8] });
  const midRot = (Math.atan2(-98, 26) + Math.atan2(-66, -44)) / 2;
  return insectRig({
    id: "swarm.borer.side",
    name: "Deep Borer",
    view: "side",
    height: 232,
    k: 1.4,
    limbInk: 2,
    pivots: { torso: { x: 20, y: -50 }, head: { x: -4, y: -194 } },
    parts: [
      bladeOn(far, { z: 1.5, reach: 1.5 }),
      ...rings(body, "upper", [0.12, 0.42, 0.72], [1.55, 1.42], 3),
      { id: "ring-mid", src: segment, bone: "spine.mid", place: { x: 40, y: -128, rot: midRot * DEG, scale: 1.36 }, z: 5 },
      placed("plate", SHARED.plate, "spine.mid", 52, -132, 5.5, 1.5, -100),
      ...rings(body, "lower", [0.32, 0.66], [1.3, 1.22], 6),
      { id: "mound", src: mound, bone: "root", z: 4 },
      { id: "head", src: head, bone: "gun", place: { x: -4, y: -194, rot: 0, scale: 1.3 }, z: 9 },
      placed("eyes", SHARED.eyes, "gun", -24, -218, 10, 1.4),
      bladeOn(near, { z: 12, reach: 1.5 }),
    ],
    limbs: [body, far, near],
    weapon: "head",
  });
}

export function borerTop(): RigDef {
  const body = spine({ x: 0, y: 30 }, { x: 6, y: -10 }, { x: 0, y: -50 }, 30);
  const left = scytheArm("armL", { x: -14, y: -24 }, { x: -40, y: -48 }, { x: -24, y: -80 }, { z: 9, width: [6.4, 5.6] });
  const right = scytheArm("armR", { x: 14, y: -24 }, { x: 40, y: -48 }, { x: 24, y: -80 }, { z: 9, width: [6.4, 5.6] });
  return insectRig({
    id: "swarm.borer.top",
    name: "Deep Borer (from above)",
    view: "top",
    height: 200,
    k: 1.4,
    limbInk: 2,
    pivots: { torso: { x: 0, y: 30 }, head: { x: 0, y: -50 } },
    parts: [
      { id: "mound", src: moundTop, bone: "root", place: { x: 0, y: 30, rot: 0, scale: 1.05 }, z: 1 },
      ...rings(body, "upper", [0.15, 0.6], [1.5, 1.4], 3),
      { id: "ring-mid", src: segment, bone: "spine.mid", place: { x: 6, y: -10, rot: -90, scale: 1.35 }, z: 4 },
      placed("plate", SHARED.plate, "spine.mid", 6, -10, 4.5, 1.4, 0),
      ...rings(body, "lower", [0.5], [1.25, 1.25], 5),
      { id: "head", src: head, bone: "gun", place: { x: 0, y: -50, rot: 90, scale: 1.2 }, z: 7 },
      placed("eyes", SHARED.eyes, "gun", 0, -70, 8, 1.3),
      bladeOn(left, { z: 9.5, reach: 1.5, mirror: true }),
      bladeOn(right, { z: 9.5, reach: 1.5 }),
    ],
    limbs: [body, left, right],
    weapon: "head",
    shadow: { x: 10, y: 14, r: 60 },
  });
}
