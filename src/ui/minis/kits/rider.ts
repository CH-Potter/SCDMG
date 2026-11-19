// The rider kit: a humanoid from the catalogue in the saddle of a beast-kit steed. The steed's body,
// head, tail and four legs (and its trot) are the beast kit's, scaled up under the rider; the rider
// keeps the humanoid's arms, weapon and headgear, knees forward over the steed's flanks.

import type { LimbDef, PartUse, Place, Pt, RigDef } from "../types";
import { beastSide, beastTop, type BeastOpts } from "./beast";
import { humanoidTop, kitWeapon, sideWeapon, type HeldWeapon, type HeldWeaponTop } from "./humanoid";
import { compose, STAND, through, trooperKitSide, type ExtraPart } from "../rigs/militia/kit-troops";
import { readPart } from "../svg";
import { kitPart } from "./catalogue";
import type { KitSpec } from "./spec";
import type { LookVariant } from "./types";
import { fitHeight, scaleRig, turnAbout } from "./util";

export interface RiderOpts {
  id: string;
  name: string;
  spec: KitSpec;
  variant: LookVariant;
  /**
   * Template overrides (all optional: leaving them out draws the kit's rider exactly as before).
   * `parts`: the rider's head, headgear, torso and back sources per view (null = none);
   * `steed`: the beast kit's part overrides for the mount, per view, and its scale;
   * `weaponSide` / `weaponTop`: the held weapon (hands go to its grips, or to its `armF` / `armB`);
   * `padsSide`: shoulder plates; `extrasSide` / `extrasTop`: more parts (an ExtraPart with
   * `absolute: true` is in final frame coords: wings on the mount, a pennant).
   */
  parts?: Partial<Record<"torso" | "head" | "gear" | "back", { side?: string | null; top?: string | null }>>;
  steed?: { side?: BeastOpts["parts"]; top?: BeastOpts["parts"]; scale?: number };
  weaponSide?: HeldWeapon;
  weaponTop?: HeldWeaponTop;
  padsSide?: { front: string; back: string };
  extrasSide?: ExtraPart[];
  extrasTop?: ExtraPart[];
}

/** A rider slot's override for a view (undefined: the kit's choice). */
const ov = (o: RiderOpts, s: "torso" | "head" | "gear" | "back", view: "side" | "top"): string | null | undefined => o.parts?.[s]?.[view];

/** Move a rig's parts and limbs (and gait) through a placement: one rig set into another's frame. */
function carry(rig: RigDef, T: Place, prefix: string, zShift: number): { parts: PartUse[]; limbs: LimbDef[]; gait: Record<string, Pt>[] } {
  const k = T.scale ?? 1;
  const ren = (b: string) => (b.includes(".") ? `${prefix}${b}` : b === "root" ? "root" : "pelvis");
  const parts = rig.parts.map((p) => ({ ...p, id: `${prefix}${p.id}`, bone: ren(p.bone) as PartUse["bone"], place: compose(T, p.place), z: p.z + zShift }));
  const limbs = rig.limbs.map((l) => ({
    ...l,
    id: `${prefix}${l.id}`,
    from: { bone: "pelvis" as const, at: through(T, l.from.at) },
    joint: through(T, l.joint),
    end: through(T, l.end),
    upper: { ...l.upper, width: l.upper.width * k, z: l.upper.z + zShift },
    lower: { ...l.lower, width: l.lower.width * k, z: l.lower.z + zShift },
  }));
  const gait = (rig.gait ?? []).map((g) => Object.fromEntries(Object.entries(g).map(([id, p]) => [`${prefix}${id}`, through(T, p)])));
  return { parts, limbs, gait };
}

export function riderSide(o: RiderOpts): RigDef {
  const s = o.spec;
  // the steed: a melee-free beast (its head doesn't lunge: the rider fights), no tail-gun
  const steed = beastSide({ id: `${o.id}.steed`, name: "steed", spec: { ...s, ranged: true, weapon: "none", back: "none", head: s.head === "beast" || s.head === "bug" || s.head === "skull" ? s.head : "beast", headgear: "none", scale: 1, flying: false }, variant: o.variant, ...(o.steed?.side ? { parts: o.steed.side } : {}) });
  const mount = carry({ ...steed, parts: steed.parts.filter((p) => p.id !== "weapon") }, { x: STAND.origin.x + 6, y: STAND.origin.y, rot: 0, scale: 1.3 * (o.steed?.scale ?? 1) }, "s", -20);
  // the rider, seated: hips on the saddle, knees forward down the flanks; the steed carries the team cloth
  const held = o.weaponSide ?? sideWeapon(s.weapon === "shield" ? "sword" : kitWeapon(s.weapon));
  const gear = ov(o, "gear", "side");
  const gearSrc = gear === undefined ? (s.headgear === "none" ? null : kitPart("humanoid", "side", `gear-${s.headgear}`)) : gear;
  const extras: ExtraPart[] = [...(gearSrc ? [{ id: "gear", src: gearSrc, bone: "head" as const, z: 19.5 }] : []), ...(o.extrasSide ?? [])];
  const head = ov(o, "head", "side");
  const torso = ov(o, "torso", "side");
  const back = ov(o, "back", "side");
  const rider = trooperKitSide({
    id: `${o.id}.side`,
    name: o.name,
    legs: { footF: { x: 48, y: 142 }, footB: { x: 66, y: 140 }, knees: -1 },
    helm: head ?? kitPart("humanoid", "side", `head-${s.head === "beast" ? "face" : s.head}`),
    torso: torso ?? kitPart("humanoid", "side", "torso-plain"),
    pack: back !== undefined ? back : s.back === "none" || s.back === "wings" ? null : kitPart("humanoid", "side", `back-${s.back}`),
    padFront: o.padsSide ? o.padsSide.front : s.armoured ? undefined : null,
    padBack: o.padsSide ? o.padsSide.back : s.armoured ? undefined : null,
    extras,
    weapon: { src: held.src, place: turnAbout(held.src, held.place, "g1", o.variant.aim) },
    armF: held.armF && "hand" in held.armF && readPart(held.armF.hand).tagged ? undefined : held.armF,
    armB: held.armB,
    height: 200,
    gait: mount.gait,
    more: { parts: mount.parts, limbs: mount.limbs },
  });
  let rig: RigDef = { ...rider, clips: steed.clips ? { step: steed.clips.step!, death: steed.clips.death! } : undefined, ground: steed.ground };
  rig = fitHeight(rig);
  return scaleRig(rig, s.scale);
}

export function riderTop(o: RiderOpts): RigDef {
  const s = o.spec;
  const steed = beastTop({ id: `${o.id}.steed`, name: "steed", spec: { ...s, ranged: true, weapon: "none", back: "none", head: "beast", headgear: "none", scale: 1, flying: false }, variant: o.variant, ...(o.steed?.top ? { parts: o.steed.top } : {}) });
  const mount = carry({ ...steed, parts: steed.parts.filter((p) => p.id !== "weapon") }, { x: 0, y: 6, rot: 0, scale: 1.4 * (o.steed?.scale ?? 1) }, "s", -10);
  const topOv = (k: "torso" | "head" | "gear" | "back"): { top?: string | null } => {
    const v = ov(o, k, "top");
    return v === undefined ? {} : { top: v };
  };
  const man = humanoidTop({
    id: `${o.id}.top`,
    name: o.name,
    head: s.head === "beast" ? "face" : s.head,
    headgear: s.headgear,
    weapon: s.weapon === "shield" ? "sword" : kitWeapon(s.weapon),
    back: s.back === "wings" ? "none" : s.back,
    aim: o.variant.aim,
    parts: { torso: { top: kitPart("humanoid", "top", "torso-plain"), ...topOv("torso") }, head: topOv("head"), gear: topOv("gear"), back: topOv("back") },
    ...(o.weaponTop ? { weaponTop: o.weaponTop } : {}),
    ...(o.extrasTop ? { extrasTop: o.extrasTop } : {}),
  });
  let rig: RigDef = { ...man, parts: [...mount.parts, ...man.parts], limbs: [...mount.limbs, ...man.limbs], gait: mount.gait, ground: steed.ground, shadow: { x: 6, y: 10, r: 34 } };
  rig = fitHeight(rig);
  return scaleRig(rig, s.scale);
}
