// The beast kit: four-legged critters, mounts and big beasts. A hide body with a team saddle-cloth,
// the humanoid catalogue's head and headgear set at the neck (a beast head, a bug head, a skull...),
// four ink legs with a diagonal trot (the walk cycle plants two feet while the other two swing), a
// tail that breathes, and either a bite (the head rides the gun bone and lunges) or a gun on its back.
// Frame "insect": the Skitterswarm's clips, scaled to the beast's size.

import type { LimbDef, PartUse, Place, Pt, RigDef, RigView } from "../types";
import { insectClips } from "../rigs/swarm/kit";
import { placeAt } from "../rigs/militia/kit-troops";
import { kitPart } from "./catalogue";
import { sideWeapon, topWeapon, kitWeapon } from "./humanoid";
import type { KitSpec } from "./spec";
import type { LookVariant } from "./types";
import { fitHeight, mirrorPart, scaleRig } from "./util";

export const UPI = 105;
/** Neutral packed earth: the kits' base ground (factions' own art keeps its own). */
export const KIT_GROUND = "#4d4a44";

export interface BeastOpts {
  id: string;
  name: string;
  spec: KitSpec;
  variant: LookVariant;
  /** Template overrides: the body, tail and head parts. */
  parts?: Partial<Record<"body" | "tail" | "head" | "gear", string | null>>;
}

interface Leg {
  id: string;
  hip: Pt;
  knee: Pt;
  foot: Pt;
  near: boolean;
}

/** Four legs and a trot: A = near front + far rear, B = near rear + far front, half a cycle apart. */
function quadruped(legs: Leg[], view: RigView, step: number, lift: number, width: [number, number], z: [number, number]): { limbs: LimbDef[]; gait: Record<string, Pt>[] } {
  const limbs: LimbDef[] = legs.map((l, i) => ({
    id: l.id,
    kind: "leg",
    from: { bone: "pelvis", at: l.hip },
    joint: l.knee,
    end: l.foot,
    upper: { width: width[0] * (l.near ? 1 : 0.85), slot: l.near ? "plate" : "suit", stripe: l.near ? "plateShade" : undefined, z: (l.near ? z[0] : z[1]) + i * 0.01 },
    lower: { width: width[1] * (l.near ? 1 : 0.85), slot: l.near ? "plate" : "suit", stripe: l.near ? "plateShade" : undefined, z: (l.near ? z[0] : z[1]) + 0.005 + i * 0.01 },
  }));
  const A = new Set([legs[0]!.id, legs[3]!.id]);
  const gait = [0, 1, 2, 3].map((key) => {
    const out: Record<string, Pt> = {};
    for (const l of legs) {
      const ph = A.has(l.id) ? key : (key + 2) % 4;
      const p = l.foot;
      if (view === "side") out[l.id] = ph === 0 ? { x: p.x - step, y: p.y } : ph === 1 ? { x: p.x, y: p.y } : ph === 2 ? { x: p.x + step, y: p.y } : { x: p.x, y: p.y - lift };
      else out[l.id] = ph === 0 ? { x: p.x, y: p.y - step } : ph === 1 ? p : ph === 2 ? { x: p.x, y: p.y + step } : { x: p.x - Math.sign(p.x) * 2, y: p.y };
    }
    return out;
  });
  return { limbs, gait };
}

const pick = (o: BeastOpts, k: "body" | "tail" | "head" | "gear", fallback: () => string | null): string | null => (o.parts?.[k] === undefined ? fallback() : o.parts[k]!);

export function beastSide(o: BeastOpts): RigDef {
  const s = o.spec;
  const bite = !s.ranged;
  const L = (id: string, hip: Pt, knee: Pt, foot: Pt, near: boolean): Leg => ({ id, hip, knee, foot, near });
  const far = (p: Pt): Pt => ({ x: p.x + 7, y: p.y - 3 });
  const legs = [
    L("nF", { x: -20, y: -34 }, { x: -25, y: -17 }, { x: -20, y: 0 }, true),
    L("nR", { x: 20, y: -34 }, { x: 27, y: -17 }, { x: 21, y: 0 }, true),
    L("fF", far({ x: -20, y: -34 }), far({ x: -25, y: -17 }), { x: -13, y: 0 }, false),
    L("fR", far({ x: 20, y: -34 }), far({ x: 27, y: -17 }), { x: 28, y: 0 }, false),
  ];
  const q = quadruped(legs, "side", 8, 6, [8, 6.6], [12, 1]);
  const parts: PartUse[] = [];
  const body = pick(o, "body", () => kitPart("beast", "side", "body"));
  if (body) parts.push({ id: "body", src: body, bone: "pelvis", z: 6 });
  const tail = pick(o, "tail", () => kitPart("beast", "side", "tail"));
  if (tail) parts.push({ id: "tail", src: tail, bone: "pelvis", z: 5, anim: { pulse: 0.06 } });
  const paw = kitPart("beast", "side", "paw");
  for (const l of legs.filter((x) => x.near)) parts.push({ id: `${l.id}-paw`, src: paw, bone: `${l.id}.end`, place: { x: l.foot.x, y: l.foot.y - 1, rot: 0 }, z: 12.5 });
  // the head at the neck, a little forward and down; its headgear rides with it
  const head = pick(o, "head", () => kitPart("humanoid", "side", `head-${s.head}`));
  const lean = o.variant.lean * 0.6;
  const at: Place | undefined = head ? placeAt(head, "pivot", { x: -27, y: -40 }, -14 + lean, 0.95) : undefined;
  if (head) parts.push({ id: "head", src: head, bone: bite ? "gun" : "head", place: at, z: 14 });
  const gear = pick(o, "gear", () => (s.headgear === "none" ? null : kitPart("humanoid", "side", `gear-${s.headgear}`)));
  if (gear && at) parts.push({ id: "gear", src: gear, bone: bite ? "gun" : "head", place: at, z: 14.5 });
  // a gun on its back, or wings, or gear on the saddle
  let weapon: string | undefined;
  if (s.ranged) {
    const w = sideWeapon(kitWeapon(s.weapon === "claws" || s.weapon === "none" ? "cannon" : s.weapon));
    parts.push({ id: "weapon", src: w.src, bone: "gun", place: placeAt(w.src, "g1", { x: 2, y: -68 }, o.variant.aim * 0.5, 0.62), z: 7 });
    weapon = "weapon";
  }
  if (s.back === "wings" || s.flying) {
    const wing = kitPart("humanoid", "side", "back-wings");
    parts.push(
      { id: "wing-far", src: wing, bone: "pelvis", place: placeAt(wing, "pivot", { x: 10, y: -64 }, -6, 0.62), z: 0.5, anim: { flap: 0.8, phase: 0.06 } },
      { id: "wing-near", src: wing, bone: "pelvis", place: placeAt(wing, "pivot", { x: 4, y: -62 }, 4, 0.7), z: 6.5, anim: { flap: 0.8 } },
    );
  } else if (s.back !== "none" && !s.ranged) {
    const b = kitPart("humanoid", "side", `back-${s.back}`);
    parts.push({ id: "back", src: b, bone: "pelvis", place: placeAt(b, "pivot", { x: 8, y: -62 }, -84, 0.6), z: 6.2 });
  }
  let rig: RigDef = {
    id: `${o.id}.side`,
    name: o.name,
    view: "side",
    frame: "insect",
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: 80,
    pivots: { torso: { x: 0, y: -40 }, head: { x: -27, y: -44 } },
    parts,
    limbs: q.limbs,
    limbInk: 1.8,
    weapon,
    gait: q.gait,
    clips: insectClips("side", s.scale, s.ranged),
    ground: KIT_GROUND,
  };
  rig = fitHeight(rig);
  return scaleRig(rig, s.scale);
}

export function beastTop(o: BeastOpts): RigDef {
  const s = o.spec;
  const bite = !s.ranged;
  const legs: Leg[] = [
    { id: "lF", hip: { x: -12, y: -14 }, knee: { x: -21, y: -16 }, foot: { x: -18, y: -22 }, near: true },
    { id: "rF", hip: { x: 12, y: -14 }, knee: { x: 21, y: -16 }, foot: { x: 18, y: -22 }, near: true },
    { id: "lR", hip: { x: -12, y: 14 }, knee: { x: -21, y: 16 }, foot: { x: -18, y: 22 }, near: true },
    { id: "rR", hip: { x: 12, y: 14 }, knee: { x: 21, y: 16 }, foot: { x: 18, y: 22 }, near: true },
  ];
  const q = quadruped(legs, "top", 5, 0, [7, 6], [1, 1]);
  const parts: PartUse[] = [];
  const body = pick(o, "body", () => kitPart("beast", "top", "body"));
  if (body) parts.push({ id: "body", src: body, bone: "pelvis", z: 4 });
  const tail = pick(o, "tail", () => kitPart("beast", "top", "tail"));
  if (tail) parts.push({ id: "tail", src: tail, bone: "pelvis", z: 3, anim: { pulse: 0.08 } });
  const head = pick(o, "head", () => kitPart("humanoid", "top", `head-${s.head}`));
  const at: Place | undefined = head ? placeAt(head, "pivot", { x: 0, y: -30 }, 0, 1.15) : undefined;
  if (head) parts.push({ id: "head", src: head, bone: bite ? "gun" : "head", place: at, z: 6 });
  const gear = pick(o, "gear", () => (s.headgear === "none" ? null : kitPart("humanoid", "top", `gear-${s.headgear}`)));
  if (gear && at) parts.push({ id: "gear", src: gear, bone: bite ? "gun" : "head", place: at, z: 6.5 });
  let weapon: string | undefined;
  if (s.ranged) {
    const w = topWeapon(kitWeapon(s.weapon === "claws" || s.weapon === "none" ? "cannon" : s.weapon));
    parts.push({ id: "weapon", src: w.src, bone: "gun", place: placeAt(w.src, "g1", { x: 0, y: 2 }, 90, 0.8), z: 5 });
    weapon = "weapon";
  }
  if (s.back === "wings" || s.flying) {
    const wing = kitPart("humanoid", "top", "back-wing");
    parts.push(
      { id: "wing-l", src: mirrorPart(wing), bone: "pelvis", place: { x: -12, y: -4, rot: -90, scale: 0.8 }, z: 3.5, anim: { flap: 0.7 } },
      { id: "wing-r", src: wing, bone: "pelvis", place: { x: 12, y: -4, rot: 90, scale: 0.8 }, z: 3.5, anim: { flap: 0.7 } },
    );
  }
  let rig: RigDef = {
    id: `${o.id}.top`,
    name: `${o.name} (from above)`,
    view: "top",
    frame: "insect",
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: 70,
    pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: -28 } },
    parts,
    limbs: q.limbs,
    limbInk: 1.6,
    weapon,
    gait: q.gait,
    clips: insectClips("top", s.scale, s.ranged),
    ground: KIT_GROUND,
    shadow: { x: 5, y: 8, r: 26 },
  };
  rig = fitHeight(rig);
  return scaleRig(rig, s.scale);
}
