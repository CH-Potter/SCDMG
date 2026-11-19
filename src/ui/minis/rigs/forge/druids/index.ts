// Circle of the Mossy Stone (Forge template `druids`): sandals, beards and a forest with a grudge.
// Their own look: ragged leaf mantles over loam homespun, mossy hoods with a sprig on top, antler
// headdresses for the leaders, bark-strip leg wraps and sandals, forked-branch thorn slings that
// fire glowing seeds. The Archdruid trails a long lichen-white beard and a gnarled crook cradling a
// mistletoe orb; the Grey Wolf Pack runs lean in stone-grey fur with a team leaf-scarf; Mushroom
// Sprites hide under huge red spotted toadstool caps on dragonfly wings; the Angry Bee Swarm comes
// three fat bees to a model; Old Oakheart is a squat, round-crowned oak with a glowing heart-knot,
// root feet and a whole torn-off bough; the Standing Stones are a lichened trilithon with glowing
// spirals; the summoned Strangling Roots writhe up out of churned earth.
//
// Silhouette language: rounded and shaggy, ragged leaf edges everywhere, branching antlers and
// boughs; nothing straight or polished. Colour: the faction colour as moss (cloaks, leaves, robes), a
// deep loam from it, bark brown, weathered stone grey, lichen white, and a warm firefly glow. Team
// colour is always cloth tied on something: scarves, stoles, garlands, ribbons on trees and roots.

import { colourwayOf, defineTemplateArt, beastSide, beastTop, flyerSide, flyerTop, humanoidSide, humanoidTop, mirrorPart, placeAt, squadLooks, fitHeight, scaleRig, type ArtContext, type HeldWeapon, type HeldWeaponTop, type HumanoidOpts, type LookVariant, type UnitArt } from "../../../kits";
import { hexToOklch, mixHex, numToHex, oklchToHex } from "../../../color";
import type { Colourway, SlotName } from "../../../slots";
import type { PartUse, RigDef, RigView } from "../../../types";

const byName = (g: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(g).map(([p, s]) => [p.slice(p.lastIndexOf("/") + 1, -4), s]));
const SIDE = byName(import.meta.glob<string>("../../../parts/forge/druids/*.svg", { query: "?raw", import: "default", eager: true }));
const TOP = byName(import.meta.glob<string>("../../../parts/forge/druids-top/*.svg", { query: "?raw", import: "default", eager: true }));
const side = (n: string): string => SIDE[n] ?? fail(`druids/${n}`);
const top = (n: string): string => TOP[n] ?? fail(`druids-top/${n}`);
function fail(n: string): never {
  throw new Error(`missing Mossy Stone part ${n}`);
}

/** Bark: the Circle's trim (belts, staves, roots, Oakheart), whatever the faction's colour. */
const BARK = 0x7a5232;
const GROUND = "#4d4a44";

/**
 * Moss in the faction colour, a deep loam from it, bark trim, weathered stone (metal), lichen white
 * (chip: beards, antlers), firefly glow. `extra` repaints fixed slots for one unit (bees, sprites).
 */
function druidColourway(primary: number, kind = "", extra: Colourway["fixed"] = {}): Colourway {
  const base = colourwayOf(primary, BARK, "plain");
  const p = hexToOklch(base.plate);
  return {
    ...base,
    id: `druids${kind}-${numToHex(primary).slice(1)}`,
    name: "Mossy Stone",
    suit: mixHex(oklchToHex({ l: 0.32, c: Math.min(0.06, p.c * 0.6), h: p.h }), "#3a2e22", 0.5),
    metal: mixHex("#7e7f76", base.plate, 0.1),
    glow: "#ecf78e",
    fixed: { paint: "#e2bd96", rivet: "#bf9672", chip: "#e3e5d3", glowWarm: "#bfd34a", ...extra },
  };
}

type Look = { side: RigDef; top: RigDef };
const one = (ctx: ArtContext, look: Look, cw = ctx.colourway): UnitArt => ({ colourway: cw, looks: [look] });
const LONE: LookVariant = { tag: "a", leader: false, lean: 0, aim: 0 };
function squad(ctx: ArtContext, build: (v: LookVariant) => Look, cw = ctx.colourway): UnitArt {
  const { variants, pick } = squadLooks(ctx.spec.models);
  return { colourway: cw, looks: variants.map(build), ...(variants.length > 1 ? { pick } : {}) };
}

/** Repaint some limbs (fur, bark) in another slot. */
function limbSlot(rig: RigDef, test: (id: string) => boolean, slot: SlotName, stripe?: SlotName): RigDef {
  return { ...rig, limbs: rig.limbs.map((l) => (test(l.id) ? { ...l, upper: { ...l.upper, slot, stripe }, lower: { ...l.lower, slot, stripe } } : l)) };
}
const both = (look: Look, f: (r: RigDef) => RigDef): Look => ({ side: f(look.side), top: f(look.top) });

const PIECE = (n: string) => ({ side: side(n), top: top(n) });
const NONE = { side: null, top: null };
const legs = { shinF: side("shin-front"), shinB: side("shin-back"), kneeF: side("knee-front"), kneeB: side("knee-back"), bootF: side("boot-front"), bootB: side("boot-back"), width: 7 };

/** A druid of the Circle: face, homespun and mantle, wrapped legs and sandals, with the unit's swaps. */
function druid(ctx: ArtContext, v: LookVariant, o: Partial<HumanoidOpts> & { idTag: string; scale?: number }): Look {
  const opts: HumanoidOpts = {
    id: `forge.druids.${o.idTag}.${v.tag}`,
    name: ctx.profile.name,
    head: "face",
    headgear: "none",
    weapon: "staff",
    back: "none",
    lean: v.lean,
    aim: v.aim,
    legParts: legs,
    ...o,
    scale: (o.scale ?? 1) * (v.leader ? 1.05 : 1),
    parts: { torso: PIECE("torso"), head: PIECE("head"), gear: NONE, back: NONE, ...o.parts },
  };
  return { side: humanoidSide(opts), top: humanoidTop(opts) };
}

// ---------- held weapons ----------

/** The thorn sling levelled forward, band drawn. */
const slingAim = (): HeldWeapon => ({ src: side("sling"), place: placeAt(side("sling"), "g1", { x: 36, y: 72 }, 20) });
const slingAimTop = (): HeldWeaponTop => ({ src: top("sling"), place: placeAt(top("sling"), "g1", { x: -13, y: -16 }, 82) });
/** The sling grounded upright in the far hand, a cudgel raised in the near one. */
const slingRest = (): HeldWeapon => ({
  src: side("sling"),
  place: placeAt(side("sling"), "g1", { x: 62, y: 66 }, 84),
  armB: { grip: "g1" },
  armF: { hand: side("cudgel"), at: { x: 40, y: 80 }, to: "torso", rot: 56 },
});
const slingRestTop = (): HeldWeaponTop => ({
  src: top("sling"),
  place: placeAt(top("sling"), "g1", { x: 12, y: -14 }, 80),
  armR: { grip: "g1" },
  armL: { hand: top("cudgel"), at: { x: -14, y: -14 }, to: "torso", rot: 70 },
});

// ---------- structures ----------

/** A structure on the structure frame: its body, and more parts (writhing roots), no gun. */
function tower(id: string, name: string, view: RigView, body: string, scale: number, more: PartUse[] = []): RigDef {
  let rig: RigDef = {
    id: `${id}.${view}`,
    name: view === "side" ? name : `${name} (from above)`,
    view,
    frame: "structure",
    origin: { x: 0, y: 0 },
    unitsPerInch: 105,
    height: 100,
    pivots: { torso: { x: 0, y: view === "side" ? -60 : 0 }, head: { x: 0, y: view === "side" ? -120 : 0 } },
    parts: [{ id: "body", src: body, bone: "torso", z: 5 }, ...more],
    limbs: [],
    limbInk: 1.8,
    ground: GROUND,
    ...(view === "top" ? { shadow: { x: 10, y: 12, r: 40 } } : {}),
  };
  rig = fitHeight(rig);
  return scaleRig(rig, scale);
}

export default defineTemplateArt({
  key: "druids",
  colourway: (f) => druidColourway(f.color),
  units: {
    // Bramble Wardens: the leader bareheaded under an antler headdress; hooded slingers aiming;
    // bareheaded wreathed wardens with the sling grounded and a cudgel up, no cloak
    wardens: (ctx) =>
      squad(ctx, (v) =>
        druid(ctx, v, {
          idTag: "wardens",
          weaponSide: v.tag === "b" ? slingRest() : slingAim(),
          weaponTop: v.tag === "b" ? slingRestTop() : slingAimTop(),
          parts: {
            gear: v.leader ? PIECE("antlers") : v.tag === "b" ? PIECE("wreath") : PIECE("hood"),
            back: v.tag === "b" ? NONE : PIECE("mantle"),
          },
        }),
      ),
    // Grey Wolf Pack: lean stone-grey wolves, a team leaf-scarf at the neck; the pack leader is bigger
    // with a moss mane; every other wolf snarls
    wolves: (ctx) =>
      squad(ctx, (v) => {
        const spec = { ...ctx.spec, scale: ctx.spec.scale * (v.leader ? 1.12 : 1) };
        const o = (view: "side" | "top") => ({
          id: `forge.druids.wolves.${v.tag}`,
          name: ctx.profile.name,
          spec,
          variant: v,
          parts: {
            body: (view === "side" ? side : top)(v.leader ? "wolf-body-alpha" : "wolf-body"),
            head: (view === "side" ? side : top)(v.tag === "b" ? "wolf-head-snarl" : "wolf-head"),
            tail: (view === "side" ? side : top)("wolf-tail"),
          },
        });
        return both({ side: beastSide(o("side")), top: beastTop(o("top")) }, (r) => limbSlot(r, () => true, "metal", "metalShade"));
      }),
    // Mushroom Sprites: tiny folk under huge red toadstool caps (one round, one tall), dragonfly
    // wings, squeezing a puffball of spores
    sprites: (ctx) => {
      const cw = druidColourway(ctx.faction.color, "-sprite", { chip: "#d2463a", paint: "#f0dcc0", rivet: "#d2b597" });
      const wing = side("sprite-wing");
      const wingT = top("sprite-wing");
      const cap = (v: LookVariant) => PIECE(v.tag === "b" ? "sprite-cap-b" : "sprite-cap");
      return squad(
        ctx,
        (v) =>
          druid(ctx, v, {
            idTag: "sprites",
            scale: ctx.spec.scale,
            weaponSide: { src: side("puffball"), place: placeAt(side("puffball"), "g1", { x: 40, y: 84 }, v.tag === "b" ? -14 : 0) },
            weaponTop: { src: top("puffball"), place: placeAt(top("puffball"), "g1", { x: -6, y: -16 }, 90) },
            parts: { torso: PIECE("sprite-torso"), head: PIECE("sprite-head"), gear: NONE },
            extrasSide: [
              { id: "cap", src: cap(v).side, bone: "head", z: 19.5, place: placeAt(cap(v).side, "pivot", { x: 59, y: 33 }, v.tag === "b" ? -6 : 4, 1.35) },
              { id: "wing-far", src: wing, bone: "torso", z: -1, place: placeAt(wing, "pivot", { x: 80, y: 70 }, -14), anim: { flap: 0.8, phase: 0.25 } },
              { id: "wing-near", src: wing, bone: "torso", z: -0.5, place: placeAt(wing, "pivot", { x: 74, y: 74 }, 6), anim: { flap: 0.8 } },
            ],
            extrasTop: [
              { id: "cap", src: cap(v).top, bone: "head", z: 6.5, place: placeAt(cap(v).top, "pivot", { x: 0, y: -2 }, 0, 1.3) },
              { id: "wing-l", src: mirrorPart(wingT), bone: "torso", z: -1, place: { x: -6, y: 4, rot: -60 }, anim: { flap: 0.7 } },
              { id: "wing-r", src: wingT, bone: "torso", z: -1, place: { x: 6, y: 4, rot: 60 }, anim: { flap: 0.7, phase: 0.2 } },
            ],
          }),
        cw,
      );
    },
    // Angry Bee Swarm: three fat striped bees to a model; the lead bee carries the team stripe and
    // strikes stinger-first; every wing beats on its own phase
    bees: (ctx) => {
      const cw = druidColourway(ctx.faction.color, "-bee", { chip: "#f2b93a", rivet: "#dfeaee" });
      const spec = { ...ctx.spec, scale: 1.15, back: "none" as const };
      const lead = side("bee-lead");
      const leadT = top("bee-lead");
      const w = side("bee-wing");
      const wT = top("bee-wing");
      const wTm = mirrorPart(wT);
      const flap = (phase: number) => ({ flap: 0.9, phase });
      return one(
        ctx,
        {
          side: flyerSide({
            id: "forge.druids.bees",
            name: ctx.profile.name,
            spec,
            variant: LONE,
            hull: side("bees"),
            engines: false,
            gun: { src: lead, place: placeAt(lead, "pivot", { x: -22, y: -40 }) },
            extras: [
              { id: "wing-lead", src: w, bone: "gun", place: placeAt(w, "pivot", { x: -27, y: -50 }, 0, 1.2), z: 11, anim: flap(0) },
              { id: "wing-1", src: w, bone: "torso", place: placeAt(w, "pivot", { x: -15, y: -76 }, 0, 0.85), z: 10.5, anim: flap(0.33) },
              { id: "wing-2", src: w, bone: "torso", place: placeAt(w, "pivot", { x: 14, y: -51 }, 0, 0.9), z: 10.5, anim: flap(0.66) },
            ],
          }),
          top: flyerTop({
            id: "forge.druids.bees",
            name: ctx.profile.name,
            spec,
            variant: LONE,
            hull: top("bees"),
            engines: false,
            gun: { src: leadT, place: placeAt(leadT, "pivot", { x: 0, y: -26 }) },
            extras: [
              { id: "wing-lead-l", src: wTm, bone: "gun", place: { x: -3, y: -26, rot: -60, scale: 1.2 }, z: 7, anim: flap(0) },
              { id: "wing-lead-r", src: wT, bone: "gun", place: { x: 3, y: -26, rot: 60, scale: 1.2 }, z: 7, anim: flap(0.1) },
              { id: "wing-1-l", src: wTm, bone: "torso", place: { x: -16, y: -6, rot: -60, scale: 0.8 }, z: 6, anim: flap(0.33) },
              { id: "wing-1-r", src: wT, bone: "torso", place: { x: -12, y: -6, rot: 60, scale: 0.8 }, z: 6, anim: flap(0.43) },
              { id: "wing-2-l", src: wTm, bone: "torso", place: { x: 12, y: 2, rot: -60, scale: 0.85 }, z: 6, anim: flap(0.66) },
              { id: "wing-2-r", src: wT, bone: "torso", place: { x: 16, y: 2, rot: 60, scale: 0.85 }, z: 6, anim: flap(0.76) },
            ],
          }),
        },
        cw,
      );
    },
    // the Archdruid: antler crown, a long white beard, moss robe under a bark-fur mantle, the
    // gnarled crook with its mistletoe orb
    archdruid: (ctx) =>
      one(
        ctx,
        druid(ctx, { ...LONE, leader: true }, {
          idTag: "archdruid",
          weaponSide: { src: side("staff"), place: placeAt(side("staff"), "g1", { x: 40, y: 66 }, 82) },
          weaponTop: { src: top("staff"), place: placeAt(top("staff"), "g1", { x: -13, y: -14 }, 82) },
          parts: { torso: PIECE("robe"), head: PIECE("head-beard"), gear: PIECE("antlers"), back: PIECE("mantle") },
        }),
      ),
    // Old Oakheart: a squat walking oak, round leafy crown, glowing heart-knot, root feet, bark
    // limbs and knotted fists, swinging a torn-off bough
    oakheart: (ctx) => {
      const k = Math.min(1.6, ctx.spec.scale * 1.25);
      const look = druid(ctx, LONE, {
        idTag: "oakheart",
        scale: k,
        lean: -3,
        weaponSide: { src: side("branch"), place: placeAt(side("branch"), "g1", { x: 36, y: 56 }, 50, 1.2) },
        weaponTop: { src: top("branch"), place: placeAt(top("branch"), "g1", { x: -10, y: -16 }, 62, 1.2) },
        padsSide: { front: side("oak-pad-front"), back: side("oak-pad-back") },
        legParts: { shinF: side("oak-shin-front"), shinB: side("oak-shin-back"), kneeF: side("oak-knee-front"), kneeB: side("oak-knee-back"), bootF: side("oak-foot-front"), bootB: side("oak-foot-back"), width: 12 },
        hand: side("oak-hand"),
        parts: { torso: PIECE("oak-torso"), head: PIECE("oak-head"), gear: NONE, back: NONE },
        // the crown is drawn big: a round canopy wider than the trunk
        extrasSide: [{ id: "crown", src: side("oak-crown"), bone: "head", z: 19.5, place: placeAt(side("oak-crown"), "pivot", { x: 59, y: 46 }, 0, 1.3) }],
        extrasTop: [{ id: "crown", src: top("oak-crown"), bone: "head", z: 6.5, place: placeAt(top("oak-crown"), "pivot", { x: 0, y: -2 }, 0, 1.15) }],
      });
      return one(ctx, both(look, (r) => limbSlot(r, () => true, "leather", "leatherShade")));
    },
    // the Standing Stones: a lichened trilithon, glowing spirals, the team garland between the stones
    stones: (ctx) =>
      one(ctx, {
        side: tower("forge.druids.stones", ctx.profile.name, "side", side("stones"), ctx.spec.scale),
        top: tower("forge.druids.stones", ctx.profile.name, "top", top("stones"), ctx.spec.scale),
      }),
    // Strangling Roots (summoned for a round): thorny roots writhing up out of churned earth
    roots: (ctx) => {
      const k = Math.max(1.1, ctx.spec.scale);
      const roots = (view: RigView): PartUse => ({ id: "roots", src: view === "side" ? side("roots") : top("roots"), bone: "head", z: 6, anim: { pulse: 0.05 } });
      return one(ctx, {
        side: tower("forge.druids.roots", ctx.profile.name, "side", side("roots-earth"), k, [roots("side")]),
        top: tower("forge.druids.roots", ctx.profile.name, "top", top("roots-earth"), k, [roots("top")]),
      });
    },
  },
});
