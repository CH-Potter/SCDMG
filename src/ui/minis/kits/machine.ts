// The machine kits: walkers (two armoured legs under a cockpit hull, on the Militia's `walkerRig`
// frame: planted feet, slow stomp) and hover pods (a teardrop hull with engines, frame "hover").
// The recipe's weapon is the hull's gun, scaled up; jets or wings become engines or wings.

import { twoLegGait, walkerRig, type WalkerLeg } from "../rigs/militia/bertha";
import { placeAt } from "../rigs/militia/kit-troops";
import type { PartUse, RigDef } from "../types";
import { KIT_GROUND, UPI } from "./beast";
import { kitPart } from "./catalogue";
import { kitWeapon, sideWeapon, topWeapon, type KitWeapon } from "./humanoid";
import type { KitSpec } from "./spec";
import type { LookVariant } from "./types";
import { fitHeight, mirrorPart, scaleRig } from "./util";

export interface MachineOpts {
  id: string;
  name: string;
  spec: KitSpec;
  variant: LookVariant;
  /** Template overrides: the hull, and the gun (part and placement in frame coords). */
  hull?: string;
  gun?: { src: string; place: PartUse["place"] } | null;
  /** More parts in frame coords (a crusher fist, bell-thrusters). */
  extras?: PartUse[];
  /** Hover pods: leave out the default engines (the extras carry them). */
  engines?: false;
}

/** A machine's gun: ranged recipes keep theirs (a staff fires as a lance), melee becomes a blade arm. */
/** The walker is drawn small (a 90 u hull): this brings it to its 1.1" base. */
const WALKER_SIZE = 1.45;

const gunOf = (s: KitSpec): KitWeapon => (s.weapon === "bow" || s.weapon === "none" ? "cannon" : s.weapon === "shield" ? "sword" : kitWeapon(s.weapon));

export function walkerSide(o: MachineOpts): RigDef {
  const s = o.spec;
  const w = { upper: 13, lower: 15 };
  const knee = kitPart("machine", "side", "knee");
  const foot = kitPart("machine", "side", "foot");
  const legN: WalkerLeg = { id: "legN", hip: { x: -6, y: -88 }, knee: { x: -22, y: -48 }, foot: { x: -6, y: -2 }, near: true, z: 16, width: w, kneePart: knee, footPart: foot };
  const legF: WalkerLeg = { id: "legF", hip: { x: 10, y: -90 }, knee: { x: -4, y: -50 }, foot: { x: 12, y: -2 }, near: false, z: 1, width: w, kneePart: knee, footPart: foot };
  const parts: PartUse[] = [{ id: "hull", src: o.hull ?? kitPart("machine", "side", "hull"), bone: "torso", z: 10 }];
  if (o.gun !== null) {
    const g = o.gun ?? (() => {
      const h = sideWeapon(gunOf(s));
      return { src: h.src, place: placeAt(h.src, "g1", { x: -22, y: -86 }, 2 + o.variant.aim * 0.4, 1.35) };
    })();
    parts.push({ id: "gun", src: g.src, bone: "gun", place: g.place, z: 12 });
  }
  parts.push(...(o.extras ?? []));
  if (s.back === "jets") parts.push({ id: "jets", src: kitPart("humanoid", "side", "back-jets"), bone: "torso", place: placeAt(kitPart("humanoid", "side", "back-jets"), "pivot", { x: 34, y: -130 }, 0, 1.1), z: 9 });
  let rig = walkerRig({
    id: `${o.id}.side`,
    name: o.name,
    view: "side",
    origin: { x: 0, y: 0 },
    height: 160,
    pivots: { torso: { x: 0, y: -110 }, head: { x: -20, y: -124 } },
    parts,
    legs: [legF, legN],
    gait: twoLegGait(legN, legF, 16, 12, "x"),
    weapon: o.gun === null ? undefined : "gun",
  });
  rig = fitHeight({ ...rig, ground: KIT_GROUND });
  return scaleRig(rig, s.scale * WALKER_SIZE);
}

export function walkerTop(o: MachineOpts): RigDef {
  const s = o.spec;
  const foot = kitPart("machine", "top", "foot");
  const legL: WalkerLeg = { id: "legL", hip: { x: -30, y: 6 }, knee: { x: -46, y: -2 }, foot: { x: -42, y: 14 }, near: true, z: 2, width: { upper: 12, lower: 12 }, footPart: foot };
  const legR: WalkerLeg = { id: "legR", hip: { x: 30, y: 6 }, knee: { x: 46, y: -2 }, foot: { x: 42, y: 14 }, near: true, z: 2.5, width: { upper: 12, lower: 12 }, footPart: foot };
  const parts: PartUse[] = [{ id: "hull", src: o.hull ?? kitPart("machine", "top", "hull"), bone: "torso", z: 5 }, ...(o.extras ?? [])];
  if (o.gun !== null) {
    const h = topWeapon(gunOf(s));
    const g = o.gun ?? { src: h.src, place: placeAt(h.src, "g1", { x: -20, y: -26 }, 90, 1.35) };
    parts.push({ id: "gun", src: g.src, bone: "gun", place: g.place, z: 6 });
  }
  let rig = walkerRig({
    id: `${o.id}.top`,
    name: `${o.name} (from above)`,
    view: "top",
    origin: { x: 0, y: 0 },
    height: 120,
    pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: -20 } },
    parts,
    legs: [legL, legR],
    gait: twoLegGait(legL, legR, 14, 4, "y"),
    weapon: o.gun === null ? undefined : "gun",
    shadow: { x: 10, y: 14, r: 50 },
  });
  rig = fitHeight({ ...rig, ground: KIT_GROUND });
  return scaleRig(rig, s.scale * WALKER_SIZE);
}

export function flyerSide(o: MachineOpts): RigDef {
  const s = o.spec;
  const parts: PartUse[] = [{ id: "pod", src: o.hull ?? kitPart("machine", "side", "pod"), bone: "torso", z: 10 }, ...(o.extras ?? [])];
  if (s.back === "wings") {
    const wing = kitPart("humanoid", "side", "back-wings");
    parts.push(
      { id: "wing-far", src: wing, bone: "torso", place: placeAt(wing, "pivot", { x: 14, y: -62 }, -6, 0.8), z: 2, anim: { flap: 0.8, phase: 0.05 } },
      { id: "wing-near", src: wing, bone: "torso", place: placeAt(wing, "pivot", { x: 6, y: -58 }, 4, 0.9), z: 11, anim: { flap: 0.8 } },
    );
  } else if (o.engines !== false) {
    const eng = kitPart("machine", "side", "engine");
    parts.push({ id: "engine", src: eng, bone: "torso", place: { x: 34, y: -40, rot: 0 }, z: 11 });
  }
  let weapon: string | undefined;
  if (o.gun !== null) {
    const h = sideWeapon(gunOf(s));
    const g = o.gun ?? { src: h.src, place: placeAt(h.src, "g1", { x: -6, y: -26 }, 6 + o.variant.aim * 0.4, 0.9) };
    parts.push({ id: "gun", src: g.src, bone: "gun", place: g.place, z: 9 });
    weapon = "gun";
  }
  let rig: RigDef = {
    id: `${o.id}.side`,
    name: o.name,
    view: "side",
    frame: "hover",
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: 84,
    pivots: { torso: { x: 0, y: -48 }, head: { x: -24, y: -60 } },
    parts,
    limbs: [],
    limbInk: 1.8,
    weapon,
    fx: { puff: "#d8d0c0" },
    ground: KIT_GROUND,
  };
  rig = fitHeight(rig);
  return scaleRig(rig, s.scale);
}

export function flyerTop(o: MachineOpts): RigDef {
  const s = o.spec;
  const parts: PartUse[] = [{ id: "pod", src: o.hull ?? kitPart("machine", "top", "pod"), bone: "torso", z: 5 }, ...(o.extras ?? [])];
  if (s.back === "wings") {
    const wing = kitPart("humanoid", "top", "back-wing");
    parts.push(
      { id: "wing-l", src: mirrorPart(wing), bone: "torso", place: { x: -20, y: 0, rot: -90, scale: 1.2 }, z: 4, anim: { flap: 0.7 } },
      { id: "wing-r", src: wing, bone: "torso", place: { x: 20, y: 0, rot: 90, scale: 1.2 }, z: 4, anim: { flap: 0.7 } },
    );
  } else if (o.engines !== false) {
    const eng = kitPart("machine", "top", "engine");
    parts.push({ id: "engine-l", src: eng, bone: "torso", place: { x: -28, y: 18, rot: 0 }, z: 4 }, { id: "engine-r", src: eng, bone: "torso", place: { x: 28, y: 18, rot: 0 }, z: 4 });
  }
  let weapon: string | undefined;
  if (o.gun !== null) {
    const h = topWeapon(gunOf(s));
    const g = o.gun ?? { src: h.src, place: placeAt(h.src, "g1", { x: 0, y: -20 }, 90, 0.95) };
    parts.push({ id: "gun", src: g.src, bone: "gun", place: g.place, z: 6 });
    weapon = "gun";
  }
  let rig: RigDef = {
    id: `${o.id}.top`,
    name: `${o.name} (from above)`,
    view: "top",
    frame: "hover",
    origin: { x: 0, y: 0 },
    unitsPerInch: UPI,
    height: 100,
    pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: -30 } },
    parts,
    limbs: [],
    limbInk: 1.6,
    weapon,
    fx: { puff: "#d8d0c0" },
    ground: KIT_GROUND,
    shadow: { x: 10, y: 14, r: 34 },
  };
  rig = fitHeight(rig);
  return scaleRig(rig, s.scale);
}
