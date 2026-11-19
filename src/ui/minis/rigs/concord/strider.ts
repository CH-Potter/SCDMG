// His Radiance, the Grand Strider (bespoke walker): a courtier, scaled up and crowned, standing in a
// cut-gem throne pod on three tall gold stilts, a giant fan collar behind him and a radiant scepter
// pointed at whoever has disappointed him. Walker frame; the three stilts walk a six-key gait,
// one leg lifting at a time, so it always stands on two.

import torsoSide from "../../parts/concord/courtier/torso.svg?raw";
import pauldron from "../../parts/concord/courtier/pauldron.svg?raw";
import handSide from "../../parts/concord/courtier/hand.svg?raw";
import torsoTop from "../../parts/concord/courtier-top/torso.svg?raw";
import handTop from "../../parts/concord/courtier-top/hand.svg?raw";
import grandCollar from "../../parts/concord/strider/grand-collar.svg?raw";
import crown from "../../parts/concord/strider/crown.svg?raw";
import scepter from "../../parts/concord/strider/scepter.svg?raw";
import pod from "../../parts/concord/strider/pod.svg?raw";
import joint from "../../parts/concord/strider/joint.svg?raw";
import stiltFoot from "../../parts/concord/strider/stilt-foot.svg?raw";
import podTop from "../../parts/concord/strider-top/pod.svg?raw";
import grandCollarTop from "../../parts/concord/strider-top/grand-collar.svg?raw";
import crownTop from "../../parts/concord/strider-top/crown.svg?raw";
import scepterTop from "../../parts/concord/strider-top/scepter.svg?raw";
import { FRAME_CLIPS } from "../../clips";
import type { Clip, LimbDef, LimbSeg, Place, Pt, RigDef } from "../../types";
import { anchorAt, arm, CONCORD_GROUND, CRYSTAL, LAVENDER, UPI } from "./kit";

const seg = (width: number, slot: LimbSeg["slot"], z: number, stripe?: LimbSeg["slot"]): LimbSeg => ({ width, slot, z, ...(stripe ? { stripe } : {}) });

/** One leg's foot offsets over the six keys: four planted (sliding back) and a lift in between. */
const STANCE = [-16, -8, 0, 8, 16, 0];
const LIFTED = 5;

/** Six-key gait for three legs, each two keys behind the last (so one foot is up at a time). */
function tripod(feet: Record<string, Pt>, phase: Record<string, number>, view: "side" | "top", lift: number): Record<string, Pt>[] {
  const keys: Record<string, Pt>[] = [];
  for (let k = 0; k < 6; k++) {
    const key: Record<string, Pt> = {};
    for (const [id, f] of Object.entries(feet)) {
      const i = (k - phase[id]! + 6) % 6;
      const o = STANCE[i]!;
      key[id] = view === "side" ? { x: f.x + o, y: f.y - (i === LIFTED ? lift : 0) } : { x: f.x, y: f.y + o };
    }
    keys.push(key);
  }
  return keys;
}

/** The walker's step, with the gait run over six keys instead of four. */
function sixKeyStep(view: "side" | "top"): { step: Clip } {
  const s = FRAME_CLIPS.walker[view].step;
  return { step: { ...s, tracks: { ...s.tracks, gait: [[0, 0], [s.dur, 6, "linear"]] } } };
}

// ---------- side ----------

/** The courtier parts are reused 1.2 times larger: their (60, 100) waist lands in the pod. */
const K = 1.2;
const AT: Place = { x: 78, y: 4, rot: 0, scale: K };
const fr = (p: Pt): Pt => ({ x: AT.x + p.x * K, y: AT.y + p.y * K });

export function striderSide(): RigDef {
  const wPlace: Place = { x: 80, y: 92, rot: 10 };
  const shF = fr({ x: 50, y: 68 });
  const shB = fr({ x: 70, y: 68 });
  const front = arm("armF", { bone: "torso", at: shF }, anchorAt(scepter, wPlace, "g1"), [30, 30], seg(6.5, "suit", 12.2), seg(7.6, "plate", 12.3, "plateShade"), { grip: "g1" });
  const hip = fr({ x: 70, y: 98 });
  const back = arm("armB", { bone: "torso", at: shB }, hip, [30, 30], seg(6.5, "suitShade", 8), seg(7.6, "plateShade", 8.1), { elbow: fr({ x: 85, y: 84 }) });
  const feet = { legF: { x: 66, y: 276 }, legC: { x: 160, y: 276 }, legB: { x: 234, y: 276 } };
  const legs: LimbDef[] = [
    { id: "legC", kind: "leg", from: { bone: "pelvis", at: { x: 150, y: 140 } }, joint: { x: 178, y: 102 }, end: feet.legC, upper: seg(8, "leatherShade", 1.1), lower: seg(6, "leatherShade", 1) },
    { id: "legB", kind: "leg", from: { bone: "pelvis", at: { x: 188, y: 132 } }, joint: { x: 220, y: 94 }, end: feet.legB, upper: seg(8.6, "leather", 4.1), lower: seg(6.4, "leather", 4, "leatherShade") },
    { id: "legF", kind: "leg", from: { bone: "pelvis", at: { x: 112, y: 132 } }, joint: { x: 80, y: 94 }, end: feet.legF, upper: seg(8.6, "leather", 6.1), lower: seg(6.4, "leather", 6, "leatherShade") },
  ];
  return {
    id: "concord.strider.side",
    name: "His Radiance, the Grand Strider",
    view: "side",
    frame: "walker",
    origin: { x: 150, y: 280 },
    unitsPerInch: UPI,
    height: 267,
    pivots: { torso: { x: 150, y: 124 }, head: fr({ x: 60, y: 57 }) },
    parts: [
      { id: "joint-c", src: joint, bone: "legC.mid", place: { x: 178, y: 102, rot: 0 }, z: 1.2 },
      { id: "foot-c", src: stiltFoot, bone: "legC.end", place: { ...feet.legC, rot: 0 }, z: 1.3 },
      { id: "joint-b", src: joint, bone: "legB.mid", place: { x: 220, y: 94, rot: 0 }, z: 4.2 },
      { id: "foot-b", src: stiltFoot, bone: "legB.end", place: { ...feet.legB, rot: 0 }, z: 4.3 },
      { id: "joint-f", src: joint, bone: "legF.mid", place: { x: 80, y: 94, rot: 0 }, z: 6.2 },
      { id: "foot-f", src: stiltFoot, bone: "legF.end", place: { ...feet.legF, rot: 0 }, z: 6.3 },
      { id: "hand-back", src: handSide, bone: "armB.end", place: { ...hip, rot: 0, scale: K }, z: 8.2 },
      { id: "pauldron-back", src: pauldron, bone: "torso", place: { ...fr({ x: 70, y: 70 }), rot: 8, scale: K }, z: 8.6 },
      { id: "collar", src: grandCollar, bone: "torso", place: AT, z: 9 },
      { id: "torso", src: torsoSide, bone: "torso", place: AT, z: 10 },
      { id: "pod", src: pod, bone: "pelvis", z: 11 },
      { id: "weapon", src: scepter, bone: "gun", place: wPlace, z: 12 },
      { id: "hand-front", src: handSide, bone: "armF.end", place: { ...front.end, rot: 0, scale: K }, z: 12.4 },
      { id: "pauldron-front", src: pauldron, bone: "torso", place: { ...fr({ x: 51, y: 71 }), rot: -6, scale: K }, z: 12.6 },
      { id: "helm", src: crown, bone: "head", place: AT, z: 13 },
    ],
    limbs: [...legs, front, back],
    limbInk: 2.2,
    weapon: "weapon",
    gait: tripod(feet, { legF: 0, legC: 2, legB: 4 }, "side", 20),
    stride: 48,
    clips: sixKeyStep("side"),
    fx: { muzzle: LAVENDER, puff: CRYSTAL },
    ground: CONCORD_GROUND,
  };
}

// ---------- top ----------

const polar = (r: number, deg: number): Pt => ({ x: Math.round(r * Math.cos((deg * Math.PI) / 180) * 10) / 10, y: Math.round(r * Math.sin((deg * Math.PI) / 180) * 10) / 10 });

export function striderTop(): RigDef {
  // the whole figure is drawn 1.25 times the pod part's size, so the stilts reach the base's rim
  const S = 1.25;
  const KT = 1.6 * S;
  const O: Place = { x: 0, y: 4, rot: 0, scale: KT };
  const shL = { x: -12 * KT, y: -1 * KT + 4 };
  const shR = { x: 12 * KT, y: -1 * KT + 4 };
  const wPlace: Place = { x: -30, y: -58, rot: 80, scale: S };
  const left = arm("armL", { bone: "torso", at: shL }, anchorAt(scepterTop, wPlace, "g1"), [19, 19], seg(9, "suit", 4.2), seg(10.4, "plate", 4.3), { grip: "g1", prefer: (p) => -p.x });
  const right = arm("armR", { bone: "torso", at: shR }, { x: 18, y: 18 }, [19, 19], seg(9, "suitShade", 4.2), seg(10.4, "plateShade", 4.3), { elbow: { x: 35, y: 12 } });
  const legDef = (id: string, a: number, z: number, slot: LimbSeg["slot"]): LimbDef => ({
    id,
    kind: "leg",
    from: { bone: "pelvis", at: polar(40 * S, a) },
    joint: polar(76 * S, a + 8),
    end: polar(98 * S, a),
    upper: seg(11, slot, z),
    lower: seg(8, slot, z + 0.01),
  });
  const legs = [legDef("legL", -150, 0.5, "leather"), legDef("legR", -30, 0.5, "leatherShade"), legDef("legB", 90, 0.4, "leatherShade")];
  const feet = Object.fromEntries(legs.map((l) => [l.id, l.end]));
  const parts = legs.flatMap((l) => [
    { id: `joint-${l.id}`, src: joint, bone: `${l.id}.mid` as const, place: { ...l.joint, rot: 0, scale: 1.5 }, z: 0.6 },
    { id: `foot-${l.id}`, src: joint, bone: `${l.id}.end` as const, place: { ...l.end, rot: 0, scale: 1.2 }, z: 0.7 },
  ]);
  return {
    id: "concord.strider.top",
    name: "His Radiance, the Grand Strider (from above)",
    view: "top",
    frame: "walker",
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: 250,
    pivots: { torso: { x: 0, y: 4 }, head: { x: 0, y: 4 - 1 * KT } },
    parts: [
      ...parts,
      { id: "pod", src: podTop, bone: "pelvis", place: { x: 0, y: 0, rot: 0, scale: S }, z: 1 },
      { id: "weapon", src: scepterTop, bone: "gun", place: wPlace, z: 3 },
      { id: "hand-left", src: handTop, bone: "armL.end", place: { ...left.end, rot: 0, scale: KT }, z: 4.5 },
      { id: "hand-right", src: handTop, bone: "armR.end", place: { x: 18, y: 18, rot: 0, scale: KT }, z: 4.6 },
      { id: "torso", src: torsoTop, bone: "torso", place: O, z: 5 },
      { id: "collar", src: grandCollarTop, bone: "torso", place: { x: 0, y: 4, rot: 0, scale: S }, z: 5.5 },
      { id: "helm", src: crownTop, bone: "head", place: { x: 0, y: 4, rot: 0, scale: 1.5 * S }, z: 6 },
    ],
    limbs: [...legs, left, right],
    limbInk: 2,
    weapon: "weapon",
    gait: tripod(feet, { legL: 0, legB: 2, legR: 4 }, "top", 0),
    stride: 48,
    clips: sixKeyStep("top"),
    fx: { muzzle: LAVENDER, puff: CRYSTAL },
    ground: CONCORD_GROUND,
    shadow: { x: 12, y: 16, r: 86 },
  };
}
