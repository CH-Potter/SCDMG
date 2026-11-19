// The humanoid kit: any two-legged, two-armed figure (troopers, knights, cultists, elves, brutes).
// Built on the Militia trooper frame (rigs/militia/kit-troops.ts: legs, boots, arms, the walk), with
// the generic catalogue's torso, head, headgear, back and weapon in both views. Every choice of the
// Forge's parts recipe maps to a catalogue part; a template can pass its own sources for any slot.

import type { MiniBack, MiniHead, MiniHeadgear, MiniWeapon } from "../../../engine/types";
import gauntletSide from "../parts/militia/trooper/gauntlet.svg?raw";
import gauntletTop from "../parts/militia/trooper-top/gauntlet.svg?raw";
import { compose, placeAt, STAND, through, trooperKitSide, trooperKitTop, type ArmUse, type ExtraPart, type LegParts, type TopArmUse } from "../rigs/militia/kit-troops";
import { readPart } from "../svg";
import type { FrameType, Place, Pt, RigDef } from "../types";
import { kitPart } from "./catalogue";
import { fitHeight, leanAbout, mirrorPart, scaleRig, turnAbout } from "./util";

const GAUNTLET_SIDE = (): string => gauntletSide;

/** How a weapon is held, side view: its part, where it sits (frame rest coords) and what each hand does. */
export interface HeldWeapon {
  src: string;
  place: Place;
  armF?: ArmUse;
  armB?: ArmUse;
}

/** How a weapon is held, top view. */
export interface HeldWeaponTop {
  src: string;
  place: Place;
  armL?: TopArmUse;
  armR?: TopArmUse;
}

/** Weapons the kit carries: the recipe's choices, plus "sword" and "fist" (sword and shield; empty hands). */
export type KitWeapon = Exclude<MiniWeapon, "none"> | "sword" | "fist";

const side = (n: string) => kitPart("humanoid", "side", n);
const top = (n: string) => kitPart("humanoid", "top", n);

/** The side-view grips: hands at about (39, 59) and (62, 88) for a long gun, like the Militia trooper's. */
export function sideWeapon(w: KitWeapon): HeldWeapon {
  switch (w) {
    case "rifle":
      return { src: side("weapon-rifle"), place: { x: 10, y: 20, rot: 53.13 } };
    case "cannon":
      return { src: side("weapon-cannon"), place: { x: 22, y: 84, rot: 19.65 } };
    case "blade": {
      const src = side("weapon-blade");
      return { src, place: placeAt(src, "g1", { x: 48, y: 80 }, 58) };
    }
    case "axe": {
      const src = side("weapon-axe");
      return { src, place: placeAt(src, "g1", { x: 36, y: 56 }, 50) };
    }
    case "staff": {
      const src = side("weapon-staff");
      return { src, place: placeAt(src, "g1", { x: 40, y: 66 }, 82) };
    }
    case "bow": {
      const src = side("weapon-bow");
      return { src, place: placeAt(src, "g1", { x: 30, y: 72 }, -4) };
    }
    case "claws": {
      const src = side("weapon-claws");
      return { src, place: placeAt(src, "g1", { x: 36, y: 78 }, -8), armB: { hand: GAUNTLET_SIDE(), at: { x: 66, y: 98 }, to: "torso", rot: 0 } };
    }
    case "shield":
    case "sword": {
      // the sword in the far hand, raised; the shield on the near arm, across the body
      const src = side("weapon-sword");
      return {
        src,
        place: placeAt(src, "g1", { x: 62, y: 62 }, 62),
        armB: { grip: "g1" },
        armF: w === "shield" ? { hand: side("shield"), at: { x: 40, y: 84 }, to: "torso", rot: -4 } : { hand: GAUNTLET_SIDE(), at: { x: 44, y: 98 }, to: "torso" },
      };
    }
    case "fist": {
      const src = side("weapon-fist");
      return { src, place: placeAt(src, "g1", { x: 40, y: 80 }, 0), armB: { hand: GAUNTLET_SIDE(), at: { x: 66, y: 98 }, to: "torso" } };
    }
  }
}

const TOP_GAUNTLET = (): string => gauntletTop;

/** The top-view grips, hands forward of the shoulders. */
export function topWeapon(w: KitWeapon): HeldWeaponTop {
  switch (w) {
    case "rifle":
      return { src: top("weapon-rifle"), place: { x: -18, y: -40, rot: 58 } };
    case "cannon":
      return { src: top("weapon-cannon"), place: { x: -8, y: -30, rot: 66 } };
    case "blade": {
      const src = top("weapon-blade");
      return { src, place: placeAt(src, "g1", { x: -8, y: -12 }, 72) };
    }
    case "axe": {
      const src = top("weapon-axe");
      return { src, place: placeAt(src, "g1", { x: -10, y: -16 }, 62) };
    }
    case "staff": {
      const src = top("weapon-staff");
      return { src, place: placeAt(src, "g1", { x: -13, y: -14 }, 82) };
    }
    case "bow": {
      const src = top("weapon-bow");
      return { src, place: placeAt(src, "g1", { x: -6, y: -26 }, 86) };
    }
    case "claws": {
      const src = top("weapon-claws");
      return { src, place: placeAt(src, "g1", { x: -12, y: -18 }, 90), armR: { hand: TOP_GAUNTLET(), at: { x: 13, y: -9 }, to: "torso" } };
    }
    case "shield":
    case "sword": {
      const src = top("weapon-sword");
      return {
        src,
        place: placeAt(src, "g1", { x: 12, y: -14 }, 80),
        armR: { grip: "g1" },
        armL: w === "shield" ? { hand: top("shield"), at: { x: -15, y: -12 }, to: "torso", rot: -24 } : { hand: TOP_GAUNTLET(), at: { x: -14, y: -10 }, to: "torso" },
      };
    }
    case "fist": {
      const src = top("weapon-fist");
      return { src, place: placeAt(src, "g1", { x: -10, y: -18 }, 90), armR: { hand: TOP_GAUNTLET(), at: { x: 13, y: -9 }, to: "torso" } };
    }
  }
}

/** The kit weapon for a recipe weapon ("none" holds up a fist). */
export const kitWeapon = (w: MiniWeapon): KitWeapon => (w === "none" ? "fist" : w);

export interface HumanoidOpts {
  /** Rig id (without the view suffix) and name. */
  id: string;
  name: string;
  head: MiniHead;
  headgear: MiniHeadgear;
  weapon: KitWeapon;
  back: MiniBack;
  /** Shoulder plates (armoured units). */
  pads?: boolean;
  /** Upper-body lean (degrees, about the hips; negative leans forward) and aim (degrees about the front grip). */
  lean?: number;
  aim?: number;
  /** Whole-figure scale. */
  scale?: number;
  frame?: FrameType;
  /** Template overrides: any slot's part source (side and top), and extra parts. */
  parts?: Partial<Record<"torso" | "head" | "gear" | "back", { side?: string | null; top?: string | null }>>;
  weaponSide?: HeldWeapon;
  weaponTop?: HeldWeaponTop;
  extrasSide?: ExtraPart[];
  extrasTop?: ExtraPart[];
  /** Template overrides for the side view's shoulder plates, leg plates and gripping hand. */
  padsSide?: { front: string; back: string };
  legParts?: LegParts;
  hand?: string;
  ground?: string;
}

const HIPS: Pt = { x: 60, y: 106 };

/** Pick a slot's source: the template's override (null = none), else the catalogue's. */
function slot(o: HumanoidOpts, s: "torso" | "head" | "gear" | "back", view: "side" | "top", fallback: () => string | null): string | null {
  const ov = o.parts?.[s]?.[view];
  return ov === undefined ? fallback() : ov;
}

export function humanoidSide(o: HumanoidOpts): RigDef {
  const w = o.weaponSide ?? sideWeapon(o.weapon);
  const shieldTagged = !!(w.armF && "hand" in w.armF && readPart(w.armF.hand).tagged) || !!(w.armB && "hand" in w.armB && readPart(w.armB.hand).tagged);
  const body = o.lean ? leanAbout(HIPS, o.lean) : undefined;
  const extras: ExtraPart[] = [...(o.extrasSide ?? [])];
  const gear = slot(o, "gear", "side", () => (o.headgear === "none" ? null : side(`gear-${o.headgear}`)));
  if (gear) extras.push({ id: "gear", src: gear, bone: "head", z: 19.5 });
  let pack = slot(o, "back", "side", () => (o.back === "none" || o.back === "wings" ? null : side(`back-${o.back}`)));
  if (o.back === "wings" && o.parts?.back?.side === undefined) {
    const wing = side("back-wings");
    pack = null;
    extras.push(
      { id: "wing-far", src: wing, bone: "torso", z: -1, place: placeAt(wing, "pivot", { x: 81, y: 66 }, -8, 0.9), anim: { flap: 0.75, phase: 0.06 } },
      { id: "wing-near", src: wing, bone: "torso", z: -0.5, place: placeAt(wing, "pivot", { x: 74, y: 72 }, 2), anim: { flap: 0.75 } },
    );
  }
  const place = body ? compose(body, turnAbout(w.src, w.place, "g1", o.aim ?? 0)) : turnAbout(w.src, w.place, "g1", o.aim ?? 0);
  // a hand item (a shield) rides with the lean too
  const lean = (a: ArmUse | undefined): ArmUse | undefined => (a && body && "hand" in a ? { ...a, at: through(body, a.at), rot: (a.rot ?? 0) + body.rot } : a);
  let rig = trooperKitSide({
    id: `${o.id}.side`,
    name: o.name,
    frame: o.frame,
    body,
    helm: slot(o, "head", "side", () => side(`head-${o.head}`)) ?? undefined,
    torso: slot(o, "torso", "side", () => side(shieldTagged ? "torso-plain" : "torso")) ?? undefined,
    pack,
    padFront: o.padsSide ? o.padsSide.front : o.pads ? undefined : null,
    padBack: o.padsSide ? o.padsSide.back : o.pads ? undefined : null,
    extras,
    weapon: { src: w.src, place },
    armF: lean(w.armF),
    armB: lean(w.armB),
    height: 170,
    ...(o.legParts ? { legParts: o.legParts } : {}),
    ...(o.hand ? { hand: o.hand } : {}),
    ...(o.ground ? { ground: o.ground } : {}),
  });
  rig = fitHeight(rig);
  return scaleRig(rig, o.scale ?? 1);
}

export function humanoidTop(o: HumanoidOpts): RigDef {
  const w = o.weaponTop ?? topWeapon(o.weapon);
  const extras: ExtraPart[] = [...(o.extrasTop ?? [])];
  const gear = slot(o, "gear", "top", () => (o.headgear === "none" ? null : top(`gear-${o.headgear}`)));
  if (gear) extras.push({ id: "gear", src: gear, bone: "head", z: 6.5 });
  let pack = slot(o, "back", "top", () => (o.back === "none" || o.back === "wings" ? null : top(`back-${o.back}`)));
  if (o.back === "wings" && o.parts?.back?.top === undefined) {
    const wing = top("back-wing");
    pack = null;
    extras.push(
      { id: "wing-l", src: mirrorPart(wing), bone: "torso", z: -1, place: { x: -10, y: 4, rot: -90 }, anim: { flap: 0.7 } },
      { id: "wing-r", src: wing, bone: "torso", z: -1, place: { x: 10, y: 4, rot: 90 }, anim: { flap: 0.7 } },
    );
  }
  let rig = trooperKitTop({
    id: `${o.id}.top`,
    name: `${o.name} (from above)`,
    frame: o.frame,
    helm: slot(o, "head", "top", () => top(`head-${o.head}`)) ?? undefined,
    torso: slot(o, "torso", "top", () => top("torso")) ?? undefined,
    pack,
    extras,
    weapon: { src: w.src, place: turnAbout(w.src, w.place, "g1", (o.aim ?? 0) * 0.6) },
    armL: w.armL,
    armR: w.armR,
    ...(o.ground ? { ground: o.ground } : {}),
  });
  rig = fitHeight(rig);
  return scaleRig(rig, o.scale ?? 1);
}

/** The standing frame's key points, for templates placing their own parts. */
export const HUMANOID_FRAME = STAND;
