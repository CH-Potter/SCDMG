// Silverbough Host (Forge template `elves`): tall, slender and unhurried. Their own look: narrow
// faces with long leaf ears swept back, moonsilver hair, jade leaf-scale jerkins over long coat
// tails, leaf-pointed hoods with the ear tip poking through, crescent moons on everything, and tall
// moonwood longbows that out-reach every other bow on the table. Twirlblades carry a crescent sword
// in each hand under a whipping topknot; Thornwatch Sentinels wear a swept-back leaf crest and a
// tall leaf shield; the Stag Riders ride white stags with branching antlers; the Lorekeeper wears a
// moonsilver robe; the Moonfeather Owl is a round silver owl with moon eyes; the Moonstone Spire
// floats its moonstone in a crescent crown on a cradle of stone leaves.
//
// Silhouette language: vertical and pointed (ears, hood tips, crests, antlers, spire), long trailing
// shapes behind (coat tails, cloaks, pennants). Colour: the faction colour as jade leaf-plate, a deep
// forest cloth from it, moonsilver trim and hair, moonlight glow.

import { colourwayOf, defineTemplateArt, flyerSide, flyerTop, humanoidSide, humanoidTop, mirrorPart, placeAt, riderSide, riderTop, squadLooks, fitHeight, scaleRig, type ArtContext, type HeldWeapon, type HeldWeaponTop, type HumanoidOpts, type LookVariant, type UnitArt } from "../../../kits";
import { hexToOklch, numToHex, oklchToHex } from "../../../color";
import type { Colourway, SlotName } from "../../../slots";
import type { PartUse, RigDef, RigView } from "../../../types";

const byName = (g: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(g).map(([p, s]) => [p.slice(p.lastIndexOf("/") + 1, -4), s]));
const SIDE = byName(import.meta.glob<string>("../../../parts/forge/elves/*.svg", { query: "?raw", import: "default", eager: true }));
const TOP = byName(import.meta.glob<string>("../../../parts/forge/elves-top/*.svg", { query: "?raw", import: "default", eager: true }));
const side = (n: string): string => SIDE[n] ?? fail(`elves/${n}`);
const top = (n: string): string => TOP[n] ?? fail(`elves-top/${n}`);
function fail(n: string): never {
  throw new Error(`missing Silverbough part ${n}`);
}

/** Moonsilver: the Host's trim, hair, bows and robes, whatever the faction's colour. */
const SILVER = 0xd3dde3;
const GROUND = "#4d4a44";

/** Jade leaf-plate in the faction colour, a deep forest cloth of the same hue, moonsilver trim, moonlight. */
function elvenColourway(primary: number): Colourway {
  const base = colourwayOf(primary, SILVER, "crystal");
  const p = hexToOklch(base.plate);
  return {
    ...base,
    id: `elves-${numToHex(primary).slice(1)}`,
    name: "Silverbough",
    suit: oklchToHex({ l: Math.max(0.24, Math.min(0.34, p.l * 0.48)), c: Math.min(0.06, p.c * 0.6), h: p.h }),
    glow: "#c9f6ff",
    fixed: { paint: "#f3e6d2", rivet: "#d6c0a2", chip: "#eef4f6", glowWarm: "#7fd6ea" },
  };
}

type Look = { side: RigDef; top: RigDef };
const one = (ctx: ArtContext, look: Look): UnitArt => ({ colourway: ctx.colourway, looks: [look] });
const LONE: LookVariant = { tag: "a", leader: false, lean: 0, aim: 0 };
function squad(ctx: ArtContext, build: (v: LookVariant, i: number) => Look): UnitArt {
  const { variants, pick } = squadLooks(ctx.spec.models);
  return { colourway: ctx.colourway, looks: variants.map(build), ...(variants.length > 1 ? { pick } : {}) };
}

const legs = { shinF: side("shin-front"), shinB: side("shin-back"), bootF: side("boot-front"), bootB: side("boot-back"), width: 6.6 };

/** An elf: the Host's head, torso, legs and boots, with the slots the unit swaps. */
function elf(ctx: ArtContext, v: LookVariant, o: Partial<HumanoidOpts> & { idTag: string; scale?: number }): Look {
  const opts: HumanoidOpts = {
    id: `forge.elves.${o.idTag}.${v.tag}`,
    name: ctx.profile.name,
    head: "face",
    headgear: "none",
    weapon: "bow",
    back: "none",
    lean: v.lean,
    aim: v.aim,
    legParts: legs,
    ...o,
    // tall and slender: a little taller than a Militia trooper
    scale: (o.scale ?? 1.08) * (v.leader ? 1.04 : 1),
    parts: {
      torso: { side: side("torso"), top: top("torso") },
      head: { side: side("head"), top: top("head") },
      gear: { side: null, top: null },
      back: { side: null, top: null },
      ...o.parts,
    },
  };
  return { side: humanoidSide(opts), top: humanoidTop(opts) };
}

const PIECE = (n: string) => ({ side: side(n), top: top(n) });

// ---------- held weapons ----------

const bowSide = (): HeldWeapon => ({ src: side("longbow"), place: placeAt(side("longbow"), "g1", { x: 30, y: 72 }, -4) });
const bowTop = (): HeldWeaponTop => ({ src: top("longbow"), place: placeAt(top("longbow"), "g1", { x: -6, y: -26 }, 86) });
const staffSide = (): HeldWeapon => ({ src: side("staff"), place: placeAt(side("staff"), "g1", { x: 40, y: 66 }, 82) });
const staffTop = (): HeldWeaponTop => ({ src: top("staff"), place: placeAt(top("staff"), "g1", { x: -13, y: -14 }, 82) });

/** The Twirlblades' pair: one crescent levelled forward, the other swept back over the shoulder. */
function pairSide(v: LookVariant): HeldWeapon {
  const s = side("crescent");
  const fwd = v.tag === "b" ? 8 : 24;
  return { src: s, place: placeAt(s, "g1", { x: 40, y: 80 }, fwd), armB: { hand: side("crescent-off"), at: { x: 76, y: v.tag === "b" ? 70 : 92 }, to: "torso", rot: v.tag === "b" ? 110 : 140 } };
}
function pairTop(): HeldWeaponTop {
  const s = top("crescent");
  return { src: s, place: placeAt(s, "g1", { x: -8, y: -12 }, 66), armR: { hand: top("crescent-off"), at: { x: 14, y: -4 }, to: "torso", rot: 150 } };
}

/** The Sentinels' glaive in the far hand, the leaf shield on the near arm. */
function guardSide(v: LookVariant): HeldWeapon {
  const g = side("glaive");
  return {
    src: g,
    place: v.tag === "b" ? placeAt(g, "g1", { x: 60, y: 78 }, 24) : placeAt(g, "g1", { x: 62, y: 66 }, 84),
    armB: { grip: "g1" },
    armF: { hand: side("shield"), at: { x: 40, y: 86 }, to: "torso", rot: -4 },
  };
}
function guardTop(): HeldWeaponTop {
  const g = top("glaive");
  return { src: g, place: placeAt(g, "g1", { x: 12, y: -14 }, 80), armR: { grip: "g1" }, armL: { hand: top("shield"), at: { x: -15, y: -12 }, to: "torso", rot: -24 } };
}

// ---------- non-humanoid builders ----------

/** Repaint some limbs (a steed's legs) in another slot. */
function limbSlot(rig: RigDef, test: (id: string) => boolean, slot: SlotName, stripe?: SlotName): RigDef {
  return { ...rig, limbs: rig.limbs.map((l) => (test(l.id) ? { ...l, upper: { ...l.upper, slot, stripe }, lower: { ...l.lower, slot, stripe } } : l)) };
}

/** A structure: the body part (and a gun part at its mount) on the structure frame. */
function tower(id: string, name: string, view: RigView, body: string, scale: number, gun?: { src: string; place: PartUse["place"] }): RigDef {
  const parts: PartUse[] = [{ id: "body", src: body, bone: "torso", z: 5 }];
  if (gun) parts.push({ id: "gun", src: gun.src, bone: "gun", place: gun.place, z: 6, anim: { float: 3 } });
  let rig: RigDef = {
    id: `${id}.${view}`,
    name: view === "side" ? name : `${name} (from above)`,
    view,
    frame: "structure",
    origin: { x: 0, y: 0 },
    unitsPerInch: 105,
    height: 100,
    pivots: { torso: { x: 0, y: view === "side" ? -60 : 0 }, head: { x: 0, y: view === "side" ? -120 : 0 } },
    parts,
    limbs: [],
    limbInk: 1.8,
    weapon: gun ? "gun" : undefined,
    ground: GROUND,
    ...(view === "top" ? { shadow: { x: 10, y: 12, r: 40 } } : {}),
  };
  rig = fitHeight(rig);
  return scaleRig(rig, scale);
}

export default defineTemplateArt({
  key: "elves",
  colourway: (f) => elvenColourway(f.color),
  units: {
    // Glade Archers: hooded, cloaked, the tall longbow; the second stance shows the silver hair;
    // the leader goes bareheaded under a moon circlet and carries the Host's pennant
    archers: (ctx) =>
      squad(ctx, (v) =>
        elf(ctx, v, {
          idTag: "archers",
          weaponSide: bowSide(),
          weaponTop: bowTop(),
          parts: {
            gear: v.leader ? PIECE("circlet") : v.tag === "b" ? { side: null, top: null } : PIECE("hood"),
            back: v.leader ? PIECE("banner") : PIECE("cloak"),
          },
          extrasSide: v.leader ? [] : [{ id: "quiver", src: side("quiver"), bone: "torso", z: 0.5 }],
          extrasTop: v.leader ? [] : [{ id: "quiver", src: top("quiver"), bone: "torso", z: 0.5 }],
        }),
      ),
    // Twirlblades: a crescent in each hand, the topknot whipping back, mid-spin
    dancers: (ctx) =>
      squad(ctx, (v) =>
        elf(ctx, v, {
          idTag: "dancers",
          lean: v.lean - 6,
          weaponSide: pairSide(v),
          weaponTop: pairTop(),
          parts: { gear: PIECE("topknot") },
          extrasSide: v.leader ? [{ id: "circlet", src: side("circlet"), bone: "head", z: 19.6 }] : [],
          extrasTop: v.leader ? [{ id: "circlet", src: top("circlet"), bone: "head", z: 6.6 }] : [],
        }),
      ),
    // Thornwatch Sentinels: crested helm, leaf pauldrons, leaf shield and glaive; the leader's pennant
    sentinels: (ctx) =>
      squad(ctx, (v) =>
        elf(ctx, v, {
          idTag: "sentinels",
          scale: 1.12,
          weaponSide: guardSide(v),
          weaponTop: guardTop(),
          padsSide: { front: side("pad-front"), back: side("pad-back") },
          parts: { torso: PIECE("torso-plain"), gear: PIECE("helm"), back: v.leader ? PIECE("banner") : { side: null, top: null } },
        }),
      ),
    // Stag Riders: a hooded archer on a white stag with branching antlers
    riders: (ctx) =>
      squad(ctx, (v) => {
        const o = {
          id: `forge.elves.riders.${v.tag}`,
          name: ctx.profile.name,
          spec: ctx.spec,
          variant: v,
          steed: { side: { body: side("stag-body"), head: side("stag-head"), tail: side("stag-tail") }, top: { body: top("stag-body"), head: top("stag-head"), tail: top("stag-tail") }, scale: 1.15 },
          rider: {
            helm: side("head"),
            gear: side(v.tag === "b" ? "circlet" : "hood"),
            torso: side("torso-plain"),
            weapon: bowSide(),
            top: { parts: { head: { top: top("head") }, gear: { top: top(v.tag === "b" ? "circlet" : "hood") }, torso: { top: top("torso-plain") } }, weaponTop: bowTop() },
          },
        };
        const steed = (id: string) => id.startsWith("s");
        return { side: limbSlot(riderSide(o), steed, "leather", "leatherShade"), top: limbSlot(riderTop(o), steed, "leather", "leatherShade") };
      }),
    // the Lorekeeper: moonsilver robe, moon circlet, the crescent staff and its star-crystal
    mage: (ctx) =>
      one(ctx, elf(ctx, { ...LONE, leader: true }, { idTag: "mage", scale: 1.06, weaponSide: staffSide(), weaponTop: staffTop(), parts: { torso: PIECE("robe"), gear: PIECE("circlet") } })),
    // the Hollow-Oak Ranger: a shaggy leaf cowl, the forest cloak, quiver and the heartseeker bow
    ranger: (ctx) =>
      one(
        ctx,
        elf(ctx, { ...LONE, lean: -3 }, {
          idTag: "ranger",
          scale: 1.1,
          weaponSide: bowSide(),
          weaponTop: bowTop(),
          parts: { gear: PIECE("hood-ranger"), back: PIECE("cloak") },
          extrasSide: [{ id: "quiver", src: side("quiver"), bone: "torso", z: 0.5 }],
          extrasTop: [{ id: "quiver", src: top("quiver"), bone: "torso", z: 0.5 }],
        }),
      ),
    // the Moonfeather Owl: round and silver, wings raised, talons for the strike
    owl: (ctx) => {
      const spec = { ...ctx.spec, scale: ctx.spec.scale * 0.78, back: "none" as const };
      const wing = side("owl-wing");
      const wingT = top("owl-wing");
      const tal = side("talons");
      const talT = top("talons");
      return one(ctx, {
        side: flyerSide({
          id: "forge.elves.owl",
          name: ctx.profile.name,
          spec,
          variant: LONE,
          hull: side("owl"),
          engines: false,
          gun: { src: tal, place: placeAt(tal, "g1", { x: 4, y: -22 }, 0) },
          extras: [
            { id: "wing-far", src: wing, bone: "torso", place: placeAt(wing, "pivot", { x: 14, y: -70 }, -38, 0.9), z: 5, anim: { flap: 0.8, phase: 0.06 } },
            { id: "wing-near", src: wing, bone: "torso", place: placeAt(wing, "pivot", { x: 4, y: -60 }, -18), z: 12, anim: { flap: 0.8 } },
          ],
        }),
        top: flyerTop({
          id: "forge.elves.owl",
          name: ctx.profile.name,
          spec,
          variant: LONE,
          hull: top("owl"),
          engines: false,
          gun: { src: talT, place: placeAt(talT, "g1", { x: 0, y: 14 }, 90) },
          extras: [
            { id: "wing-l", src: mirrorPart(wingT), bone: "torso", place: { x: -16, y: -2, rot: -90 }, z: 4, anim: { flap: 0.7 } },
            { id: "wing-r", src: wingT, bone: "torso", place: { x: 16, y: -2, rot: 90 }, z: 4, anim: { flap: 0.7, phase: 0.04 } },
          ],
        }),
      });
    },
    // the Moonstone Spire: the moonstone floats in the crescent crown and fires the moonbeam
    spire: (ctx) => {
      const ms = side("moonstone");
      const msT = top("moonstone");
      const k = ctx.spec.scale;
      return one(ctx, {
        side: tower("forge.elves.spire", ctx.profile.name, "side", side("spire"), k, { src: ms, place: placeAt(ms, "pivot", { x: 0, y: -206 }) }),
        top: tower("forge.elves.spire", ctx.profile.name, "top", top("spire"), k, { src: msT, place: placeAt(msT, "pivot", { x: 0, y: 0 }) }),
      });
    },
  },
});
