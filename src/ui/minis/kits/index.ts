// The generic kits (a lazy chunk): any unit's art from its KitSpec, and the public API template art
// builds on. See docs/minis.md.
//
//   kitArt(ctx)             a unit's looks from its spec (the registry's fallback for every unit)
//   kitColourway(f, spec)   the kits' colourway from a faction's colours
//   defineTemplateArt(a)    a template's art module (rigs/forge/<key>/index.ts default export)
//   humanoidSide/Top, beastSide/Top, machine..., structure..., standee...: the kit frames
//   squadLooks(...)         per-model variety for a squad

import type { ArtContext, LookVariant, TemplateArt, UnitArt } from "./types";
import { beastSide, beastTop } from "./beast";
import { humanoidSide, humanoidTop, kitWeapon, type HumanoidOpts } from "./humanoid";
import { flyerSide, flyerTop, walkerSide, walkerTop } from "./machine";
import { riderSide, riderTop } from "./rider";
import { kitSpec, specKey, type KitSpec } from "./spec";
import { standeeSide, standeeTop } from "./standee";
import { structureSide, structureTop } from "./structure";
import { rigId } from "./util";
import type { RigDef } from "../types";

export { kitColourway, colourwayOf } from "./colourway";
export { catalogue, kitPart, maybeKitPart, type CatalogueEntry, type KitSlot } from "./catalogue";
export { humanoidSide, humanoidTop, sideWeapon, topWeapon, kitWeapon, HUMANOID_FRAME, type HumanoidOpts, type HeldWeapon, type HeldWeaponTop, type KitWeapon } from "./humanoid";
export { beastSide, beastTop, type BeastOpts } from "./beast";
export { walkerSide, walkerTop, flyerSide, flyerTop, type MachineOpts } from "./machine";
export { riderSide, riderTop, type RiderOpts } from "./rider";
export { structureSide, structureTop, type StructureKitOpts } from "./structure";
export { standeeSide, standeeTop } from "./standee";
export { fitHeight, leanAbout, mirrorPart, rigId, scaleRig, turnAbout } from "./util";
export { kitSpec, specKey, type KitSpec } from "./spec";
export type { ArtContext, LookVariant, TemplateArt, UnitArt, UnitRigs } from "./types";
export { compose, placeAt, anchorAt, reseat, through, trooperKitSide, trooperKitTop, trooperLegs, STAND, type ExtraPart, type LegParts } from "../rigs/militia/kit-troops";

/** A template's art module: `export default defineTemplateArt({ key, colourway?, units })`. */
export const defineTemplateArt = (a: TemplateArt): TemplateArt => a;


/**
 * Per-model variety: a squad of four or more gets a leader and two stances, a pair or trio two
 * stances, a lone model one. Each look is one more baked page, so three at most.
 */
export function squadLooks(models: number): { variants: LookVariant[]; pick: (i: number) => number } {
  const a: LookVariant = { tag: "a", leader: false, lean: 0, aim: 0 };
  const b: LookVariant = { tag: "b", leader: false, lean: -5, aim: -10 };
  if (models >= 4) return { variants: [{ tag: "lead", leader: true, lean: -2, aim: -4 }, a, b], pick: (i) => (i === 0 ? 0 : 1 + ((i - 1) % 2)) };
  if (models >= 2) return { variants: [a, b], pick: (i) => i % 2 };
  return { variants: [a], pick: () => 0 };
}

/** The rigs for one look of a spec. */
function lookRigs(spec: KitSpec, v: LookVariant, name: string, ctx: ArtContext): { side: RigDef; top: RigDef } {
  const key = `${specKey({ ...spec, primary: 0, secondary: 0 })}|${v.tag}`;
  const id = (view: "side" | "top") => rigId(`kit.${spec.body}`, key, view).replace(/\.(side|top)$/, "");
  if (spec.image && ctx.profile.art?.kind === "image") {
    const o = { id: id("side"), name, image: ctx.profile.art.dataUrl, scale: spec.scale, flying: spec.flying };
    return { side: standeeSide(o), top: standeeTop(o) };
  }
  switch (spec.body) {
    case "critter":
      return { side: beastSide({ id: id("side"), name, spec, variant: v }), top: beastTop({ id: id("top"), name, spec, variant: v }) };
    case "walker":
      return { side: walkerSide({ id: id("side"), name, spec, variant: v }), top: walkerTop({ id: id("top"), name, spec, variant: v }) };
    case "flyer":
      return { side: flyerSide({ id: id("side"), name, spec, variant: v }), top: flyerTop({ id: id("top"), name, spec, variant: v }) };
    case "structure":
      return { side: structureSide({ id: id("side"), name, spec }), top: structureTop({ id: id("top"), name, spec }) };
    case "rider":
      return { side: riderSide({ id: id("side"), name, spec, variant: v }), top: riderTop({ id: id("top"), name, spec, variant: v }) };
    default: {
      const brute = spec.body === "brute";
      const leaderBanner = v.leader && (spec.back === "none" || spec.back === "pack") && !spec.flying;
      const o: HumanoidOpts = {
        id: id("side"),
        name,
        head: spec.head,
        headgear: spec.headgear,
        weapon: kitWeapon(spec.weapon),
        back: leaderBanner ? "banner" : spec.back,
        pads: spec.armoured || brute,
        lean: v.lean,
        aim: v.aim,
        scale: spec.scale * (brute ? 1.35 : 1) * (v.leader ? 1.05 : 1),
        parts: brute ? { torso: { side: undefined, top: undefined } } : undefined,
      };
      return { side: humanoidSide(o), top: humanoidTop(o) };
    }
  }
}

/** A unit's art from the generic kits: its spec, in its colourway, with per-model looks. */
export function kitArt(ctx: ArtContext): UnitArt {
  const spec = ctx.spec;
  const { variants, pick } = spec.body === "structure" || spec.image ? squadLooks(1) : squadLooks(spec.models);
  const looks = variants.map((v) => lookRigs(spec, v, ctx.profile.name, ctx));
  return { colourway: ctx.colourway, looks, ...(looks.length > 1 ? { pick } : {}) };
}

/** Re-classify a profile (template art that wants the generic spec of a different faction look, say). */
export { kitSpec as classify };
