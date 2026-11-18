// Stinger Swarm (swarm-stingers): a buzzing cloud of acid-tailed flyers, three wasps to a model,
// tails down. Hover frame: the renderer flies them on the stem; each wasp rides its own bone (the
// gun, the head and the pelvis) so the three bob out of step, and every wing beats (PartAnim flap).

import waspSide from "../../parts/swarm/stinger/wasp.svg?raw";
import wingsSide from "../../parts/swarm/stinger/wings.svg?raw";
import waspTop from "../../parts/swarm/stinger-top/wasp.svg?raw";
import wingsTop from "../../parts/swarm/stinger-top/wings.svg?raw";
import { FRAME_CLIPS } from "../../clips";
import type { BoneRef, Clip, ClipId, Key, PartUse, RigDef, RigView } from "../../types";
import { placed, SHARED, UPI, SWARM_GROUND } from "./kit";

const ACID = "#c8ef5a";
/** A smooth -amp..amp wave, `cycles` times over `period` ms, started `shift` quarter-turns along. */
const loop = (period: number, amp: number, shift = 0, cycles = 1): Key[] => {
  const wave = [0, 1, 0, -1];
  const n = cycles * 4;
  return Array.from({ length: n + 1 }, (_, i) => [(i / n) * period, amp * wave[(i + shift) % 4]!, "inOut"] as Key);
};

/** Hover clips with the three wasps drifting out of step (gun = wasp A, head = B, pelvis = C). */
function cloudClips(view: RigView): Partial<Record<ClipId, Clip>> {
  const h = FRAME_CLIPS.hover[view];
  const drift = (p: number) =>
    view === "side"
      ? { gunY: loop(p, 3, 0, 2), pelvisY: loop(p, 2.6, 2, 1), headRot: loop(p, 7, 1, 3) }
      : { gunX: loop(p, 2, 0, 2), pelvisX: loop(p, 2.4, 2, 1), headRot: loop(p, 9, 1, 3) };
  const add = (c: Clip): Clip => ({ ...c, tracks: { ...c.tracks, ...drift(c.dur) } });
  return { idle: add(h.idle), bob: add(h.bob) };
}

interface Wasp {
  bone: BoneRef;
  x: number;
  y: number;
  s: number;
}

function cloud(view: RigView, wasps: [Wasp, Wasp, Wasp]): PartUse[] {
  const body = view === "side" ? waspSide : waspTop;
  const wings = view === "side" ? wingsSide : wingsTop;
  const out: PartUse[] = [];
  wasps.forEach((w, i) => {
    const id = ["a", "b", "c"][i]!;
    out.push({ id: `wasp-${id}`, src: body, bone: w.bone, place: { x: w.x, y: w.y, rot: 0, scale: w.s }, z: 5 + i });
    const root = view === "side" ? { x: w.x - 1 * w.s, y: w.y - 6 * w.s } : { x: w.x, y: w.y - 4 * w.s };
    out.push({ id: `wings-${id}`, src: wings, bone: w.bone, place: { ...root, rot: view === "side" ? 0 : 90, scale: w.s * (view === "side" ? 1.3 : 1.25) }, z: 5.5 + i, anim: { flap: 0.42 } });
  });
  return out;
}

function stingerRig(view: RigView, wasps: [Wasp, Wasp, Wasp], o: { height: number; head: { x: number; y: number }; plate: { x: number; y: number } }): RigDef {
  return {
    id: `swarm.stinger.${view}`,
    name: view === "side" ? "Stinger Swarm" : "Stinger Swarm (from above)",
    view,
    frame: "hover",
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: o.height,
    pivots: { torso: { x: 0, y: view === "side" ? -45 : 0 }, head: o.head },
    parts: [...cloud(view, wasps), placed("plate", SHARED.plate, wasps[0].bone, o.plate.x, o.plate.y, 5.2, 0.85, view === "side" ? 0 : 90)],
    limbs: [],
    limbInk: 1.4,
    weapon: "wasp-a",
    clips: cloudClips(view),
    fx: { muzzle: ACID },
    ground: SWARM_GROUND,
    ...(view === "top" ? { shadow: { x: 4, y: 6, r: 30 } } : {}),
  };
}

export const stingerSide = (): RigDef =>
  stingerRig(
    "side",
    [
      { bone: "gun", x: -16, y: -50, s: 1.45 },
      { bone: "head", x: 14, y: -80, s: 1.25 },
      { bone: "pelvis", x: 20, y: -36, s: 1.3 },
    ],
    { height: 118, head: { x: 14, y: -80 }, plate: { x: -17, y: -51 } },
  );

export const stingerTop = (): RigDef =>
  stingerRig(
    "top",
    [
      { bone: "gun", x: -14, y: -10, s: 1.45 },
      { bone: "head", x: 17, y: -18, s: 1.25 },
      { bone: "pelvis", x: 2, y: 20, s: 1.3 },
    ],
    { height: 80, head: { x: 17, y: -18 }, plate: { x: -14, y: -4 } },
  );
