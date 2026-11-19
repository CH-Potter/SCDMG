// Deepdelve Hold (Forge template `dwarves`): short, very broad, and stubborn. Their own look:
// barrel chests of enamelled plate with brass rims, plate tassets to the knee over short legs and
// huge iron-shod boots, square riveted pauldrons, and a great braided beard that covers the chest.
// A mining hold rather than a war temple: flat-topped square helms with cheek plates and a nasal
// bar, brass goggles on padded caps, lamp-lit hardhats, hexagon and cog devices on shields, banners
// and buckles. The Shieldbeards carry tall hexagonal tower shields; the Boomstick Brothers long
// bell-mouthed muskets and powder kegs; the Miners mattocks and spare picks; the Anvil Guard closed
// box helms with brass fan crests and anvil-headed hammers; the Rune Carver a forge hammer still
// glowing from the fire and an anvil on his back. The Whirlygig is a barrel cockpit on a rotor; the
// Grudge Cannon a bronze mortar on an octagonal stone bastion.
//
// Silhouette language: low, wide, square and flat-topped (helms, pauldrons, shields, bastion), with
// the beard as the one soft shape. Colour: the faction colour as enamel, a dark cloth from it, brass
// trim, gunmetal; each unit's recipe trim colour is its beard (ginger, white, brown, gold).

import { colourwayOf, defineTemplateArt, fitHeight, flyerSide, flyerTop, humanoidSide, humanoidTop, placeAt, scaleRig, squadLooks, type ArtContext, type HeldWeapon, type HeldWeaponTop, type HumanoidOpts, type LookVariant, type UnitArt } from "../../../kits";
import { hexToOklch, numToHex, oklchToHex } from "../../../color";
import type { Colourway } from "../../../slots";
import type { PartAnim, PartUse, RigDef, RigView } from "../../../types";

const byName = (g: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(g).map(([p, s]) => [p.slice(p.lastIndexOf("/") + 1, -4), s]));
const SIDE = byName(import.meta.glob<string>("../../../parts/forge/dwarves/*.svg", { query: "?raw", import: "default", eager: true }));
const TOP = byName(import.meta.glob<string>("../../../parts/forge/dwarves-top/*.svg", { query: "?raw", import: "default", eager: true }));
const side = (n: string): string => SIDE[n] ?? fail(`dwarves/${n}`);
const top = (n: string): string => TOP[n] ?? fail(`dwarves-top/${n}`);
function fail(n: string): never {
  throw new Error(`missing Deepdelve part ${n}`);
}

/** The Hold's brass, whatever the faction's colour. */
const BRASS = "#d9a441";
const GROUND = "#4d4a44";

/**
 * Enamelled plate in the faction colour, a dark cloth of the same hue, gunmetal, brass trim (chip);
 * the beard (leather) is the unit's recipe trim colour, so every unit has its own; lamp and forge light.
 */
function holdColourway(primary: number, beard: number): Colourway {
  const base = colourwayOf(primary, beard, "cap");
  const p = hexToOklch(base.plate);
  return {
    ...base,
    id: `dwarves-${numToHex(primary).slice(1)}-${numToHex(beard).slice(1)}`,
    name: "Deepdelve enamel",
    suit: oklchToHex({ l: Math.max(0.22, Math.min(0.32, p.l * 0.45)), c: Math.min(0.05, p.c * 0.5), h: p.h }),
    metal: "#4d535b",
    glow: "#ffe3a0",
    fixed: { paint: "#eab48c", rivet: "#b9784e", chip: BRASS, glowWarm: "#f08a2c" },
  };
}

type Look = { side: RigDef; top: RigDef };
const one = (ctx: ArtContext, look: Look): UnitArt => ({ colourway: ctx.colourway, looks: [look] });
const LONE: LookVariant = { tag: "a", leader: false, lean: 0, aim: 0 };
function squad(ctx: ArtContext, build: (v: LookVariant) => Look): UnitArt {
  const { variants, pick } = squadLooks(ctx.spec.models);
  return { colourway: ctx.colourway, looks: variants.map(build), ...(variants.length > 1 ? { pick } : {}) };
}

const PIECE = (n: string) => ({ side: side(n), top: top(n) });
const NONE = { side: null, top: null };
const legs = { shinF: side("shin-front"), shinB: side("shin-back"), bootF: side("boot-front"), bootB: side("boot-back"), width: 10 };
const pads = { front: side("pad-front"), back: side("pad-back") };

/** A dwarf: the Hold's beard, barrel chest, tassets, greaves and boots, with the slots the unit swaps. */
function dwarf(ctx: ArtContext, v: LookVariant, o: Partial<HumanoidOpts> & { idTag: string; scale?: number }): Look {
  const opts: HumanoidOpts = {
    id: `forge.dwarves.${o.idTag}.${v.tag}`,
    name: ctx.profile.name,
    head: "beard",
    headgear: "none",
    weapon: "axe",
    back: "none",
    lean: v.lean,
    aim: v.aim,
    legParts: legs,
    padsSide: pads,
    ...o,
    // short and broad: a little shorter than a Militia trooper, the bulk is in the parts
    scale: (o.scale ?? 0.98) * (v.leader ? 1.04 : 1),
    parts: {
      torso: PIECE("torso"),
      head: PIECE("head"),
      gear: PIECE("helm"),
      back: NONE,
      ...o.parts,
    },
  };
  return { side: humanoidSide(opts), top: humanoidTop(opts) };
}

// ---------- held weapons ----------

/** The Shieldbeards' axe in the far hand, the tower shield on the near arm. */
function shieldWall(v: LookVariant): { side: HeldWeapon; top: HeldWeaponTop } {
  const a = side("axe");
  const t = top("axe");
  return {
    side: { src: a, place: v.tag === "b" ? placeAt(a, "g1", { x: 64, y: 60 }, 96) : placeAt(a, "g1", { x: 62, y: 62 }, 62), armB: { grip: "g1" }, armF: { hand: side("shield"), at: { x: 40, y: 88 }, to: "torso", rot: -4 } },
    top: { src: t, place: placeAt(t, "g1", { x: 12, y: -14 }, 80), armR: { grip: "g1" }, armL: { hand: top("shield"), at: { x: -16, y: -12 }, to: "torso", rot: -24 } },
  };
}

function musket(v: LookVariant): { side: HeldWeapon; top: HeldWeaponTop } {
  const m = side("musket");
  const t = top("musket");
  return {
    side: { src: m, place: v.tag === "b" ? placeAt(m, "g1", { x: 30, y: 72 }, 8) : placeAt(m, "g1", { x: 38, y: 62 }, 40) },
    top: { src: t, place: placeAt(t, "g1", { x: -6, y: -24 }, 84) },
  };
}

/** A two-handed haft (mattock, hammer): raised over the shoulder, or levelled for the b stance. */
function haft(name: string, v: LookVariant): { side: HeldWeapon; top: HeldWeaponTop } {
  const s = side(name);
  const t = top(name);
  return {
    side: { src: s, place: v.tag === "b" ? placeAt(s, "g1", { x: 40, y: 80 }, 12) : placeAt(s, "g1", { x: 36, y: 56 }, 50) },
    top: { src: t, place: placeAt(t, "g1", { x: -10, y: -16 }, 62) },
  };
}

const held = (w: { side: HeldWeapon; top: HeldWeaponTop }) => ({ weaponSide: w.side, weaponTop: w.top });

// ---------- the structure frame ----------

/** A structure: the body part (and a gun part at its mount) on the structure frame. */
function tower(id: string, name: string, view: RigView, body: string, scale: number, gun?: { src: string; place: PartUse["place"]; anim?: PartAnim }): RigDef {
  const parts: PartUse[] = [{ id: "body", src: body, bone: "torso", z: 5 }];
  if (gun) parts.push({ id: "gun", src: gun.src, bone: "gun", place: gun.place, z: 6, ...(gun.anim ? { anim: gun.anim } : {}) });
  let rig: RigDef = {
    id: `${id}.${view}`,
    name: view === "side" ? name : `${name} (from above)`,
    view,
    frame: "structure",
    origin: { x: 0, y: 0 },
    unitsPerInch: 105,
    height: 100,
    pivots: { torso: { x: 0, y: view === "side" ? -50 : 0 }, head: { x: 0, y: view === "side" ? -90 : 0 } },
    parts,
    limbs: [],
    limbInk: 1.8,
    weapon: gun ? "gun" : undefined,
    ground: GROUND,
    ...(view === "top" ? { shadow: { x: 10, y: 12, r: 44 } } : {}),
  };
  rig = fitHeight(rig);
  return scaleRig(rig, scale);
}

export default defineTemplateArt({
  key: "dwarves",
  colourway: (f, spec) => holdColourway(f.color, spec.secondary),
  units: {
    // Shieldbeards: square helms, hexagonal tower shields and bearded axes; the second stance has
    // the helm off and the axe levelled; the leader carries the hold standard
    shieldbeards: (ctx) =>
      squad(ctx, (v) =>
        dwarf(ctx, v, {
          idTag: "shieldbeards",
          ...held(shieldWall(v)),
          parts: { torso: PIECE("torso-plain"), gear: v.tag === "b" ? NONE : PIECE("helm"), back: v.leader ? PIECE("banner") : NONE },
        }),
      ),
    // Boomstick Brothers: padded caps, brass goggles, bell-mouthed muskets and powder kegs
    gunners: (ctx) =>
      squad(ctx, (v) =>
        dwarf(ctx, v, {
          idTag: "gunners",
          ...held(musket(v)),
          parts: { gear: v.leader ? PIECE("helm") : PIECE("goggles"), back: v.leader ? PIECE("banner") : PIECE("pack-powder") },
        }),
      ),
    // Tunnel Miners: lamp-lit hardhats, mattocks and spare picks
    miners: (ctx) =>
      squad(ctx, (v) =>
        dwarf(ctx, v, {
          idTag: "miners",
          lean: v.lean - 3,
          ...held(haft("mattock", v)),
          parts: { gear: PIECE("hardhat"), back: v.leader ? PIECE("banner") : PIECE("pack-picks") },
        }),
      ),
    // the Anvil Guard: closed box helms with fan crests, anvil hammers; one carries the oath banner
    anvils: (ctx) =>
      squad(ctx, (v) =>
        dwarf(ctx, v, {
          idTag: "anvils",
          scale: 1.06,
          ...held(haft("greathammer", v)),
          parts: { gear: PIECE("helm-face"), back: v.tag === "a" ? PIECE("banner") : NONE },
        }),
      ),
    // the Rune Carver: bald, the long braided beard, the glowing forge hammer, an anvil on his back
    runesmith: (ctx) => {
      const s = side("forgehammer");
      const t = top("forgehammer");
      return one(
        ctx,
        dwarf(ctx, { ...LONE, leader: true }, {
          idTag: "runesmith",
          weaponSide: { src: s, place: placeAt(s, "g1", { x: 40, y: 66 }, 82) },
          weaponTop: { src: t, place: placeAt(t, "g1", { x: -13, y: -14 }, 82) },
          parts: { head: PIECE("head-bald"), gear: NONE, back: PIECE("pack-anvil") },
        }),
      );
    },
    // the Whirlygig: a barrel cockpit under a rotor, the goggled pilot, the steam repeater beneath
    gyro: (ctx) => {
      const spec = { ...ctx.spec, back: "none" as const };
      const rep = side("repeater");
      const repT = top("repeater");
      const rotor = side("rotor");
      const prop = side("prop");
      return one(ctx, {
        side: flyerSide({
          id: "forge.dwarves.gyro",
          name: ctx.profile.name,
          spec,
          variant: LONE,
          hull: side("gyro"),
          engines: false,
          gun: { src: rep, place: placeAt(rep, "g1", { x: -20, y: -30 }, 4) },
          extras: [
            { id: "rotor", src: rotor, bone: "torso", place: placeAt(rotor, "pivot", { x: -1, y: -100 }), z: 12, anim: { pulse: 0.05 } },
            { id: "prop", src: prop, bone: "torso", place: placeAt(prop, "pivot", { x: 72, y: -62 }), z: 11, anim: { spin: 3 } },
          ],
        }),
        top: flyerTop({
          id: "forge.dwarves.gyro",
          name: ctx.profile.name,
          spec,
          variant: LONE,
          hull: top("gyro"),
          engines: false,
          gun: { src: repT, place: placeAt(repT, "g1", { x: 0, y: -18 }, 90) },
          extras: [
            { id: "rotor", src: top("rotor"), bone: "torso", place: { x: 0, y: -2, rot: 0 }, z: 8, anim: { spin: 3 } },
            { id: "prop", src: top("prop"), bone: "torso", place: { x: 8, y: 56, rot: 90 }, z: 7, anim: { pulse: 0.1 } },
          ],
        }),
      });
    },
    // the Grudge Cannon: a bronze mortar on its turntable, cocked high for the indirect shot
    cannon: (ctx) => {
      const b = side("barrel");
      const bT = top("barrel");
      const k = ctx.spec.scale;
      return one(ctx, {
        side: tower("forge.dwarves.cannon", ctx.profile.name, "side", side("cannon"), k, { src: b, place: placeAt(b, "pivot", { x: 0, y: -92 }, 34) }),
        top: tower("forge.dwarves.cannon", ctx.profile.name, "top", top("cannon"), k, { src: bT, place: placeAt(bT, "pivot", { x: 0, y: 4 }, 90) }),
      });
    },
  },
});
