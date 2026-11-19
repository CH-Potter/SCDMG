// The Ever-Restless (Forge template `undead`): dead, but not done. Their own look: gaunt skeletons
// with bare ribcages and thin bone limbs, long skulls with a jaw hanging a little open and spectral
// cyan pinpoints in the sockets, rusted kettle helms, coffin lids for shields (the team field inset,
// a bronze hourglass on it), shredded grave-cloth rags and tattered standards with a grave lantern
// swinging from the crossbar. The Shamblers are hunched zombies in torn, stitched shirts reaching
// forward with both hands (one in a battered top hat); the Wailing Wraiths are legless hooded
// shrouds streaming into tatters; the Grave Riders sit in dented breastplates on skeletal horses;
// the Necromancer wears a peaked hood and a tall flared collar and carries a skull staff with a
// lantern; the Bone Colossus is a giant cage of ribs packed with skulls, a skull-heap head with
// curling horns, swinging a femur; the Crypt Gate is a squat mausoleum with an iron-barred door
// glowing cyan from inside.
//
// Silhouette language: thin and jagged (bare limbs, ragged hems, shredded flags and plumes), with
// heavy blunt shapes for contrast (kettle brims, coffin lids, the Colossus). Colour: the faction
// colour as corroded armour and shroud cloth, a deep grave-violet from it, tarnished bronze trim,
// rusted iron, bone ivory, spectral cyan.

import { colourwayOf, defineTemplateArt, fitHeight, flyerSide, flyerTop, humanoidSide, humanoidTop, placeAt, riderSide, riderTop, scaleRig, squadLooks, type ArtContext, type HeldWeapon, type HeldWeaponTop, type HumanoidOpts, type LookVariant, type UnitArt } from "../../../kits";
import { hexToOklch, numToHex, oklchToHex, shadeOf } from "../../../color";
import type { Colourway } from "../../../slots";
import type { LimbDef, PartUse, RigDef, RigView } from "../../../types";

const byName = (g: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(g).map(([p, s]) => [p.slice(p.lastIndexOf("/") + 1, -4), s]));
const SIDE = byName(import.meta.glob<string>("../../../parts/forge/undead/*.svg", { query: "?raw", import: "default", eager: true }));
const TOP = byName(import.meta.glob<string>("../../../parts/forge/undead-top/*.svg", { query: "?raw", import: "default", eager: true }));
const side = (n: string): string => SIDE[n] ?? fail(`undead/${n}`);
const top = (n: string): string => TOP[n] ?? fail(`undead-top/${n}`);
function fail(n: string): never {
  throw new Error(`missing Ever-Restless part ${n}`);
}

/** Tarnished bronze: the trim (belts, buckles, hourglasses, rust blooms), whatever the faction's colour. */
const BRONZE = 0x8f7d4c;
const GROUND = "#4d4a44";

/** Corroded lavender plate and shroud in the faction colour, grave-violet cloth, bronze, rusted iron, bone, spectral cyan. */
function undeadColourway(primary: number): Colourway {
  const base = colourwayOf(primary, BRONZE, "plain");
  const p = hexToOklch(base.plate);
  return {
    ...base,
    id: `undead-${numToHex(primary).slice(1)}`,
    name: "Ever-Restless",
    suit: oklchToHex({ l: Math.max(0.2, Math.min(0.3, p.l * 0.42)), c: Math.min(0.07, p.c * 0.8), h: p.h }),
    metal: "#5c5450",
    glow: "#8ff4ff",
    fixed: { paint: "#e8dfc4", rivet: "#bdb092", chip: "#c9c6bb", glowWarm: "#38c3d6" },
  };
}

type Look = { side: RigDef; top: RigDef };
const one = (ctx: ArtContext, look: Look): UnitArt => ({ colourway: ctx.colourway, looks: [look] });
const LONE: LookVariant = { tag: "a", leader: false, lean: 0, aim: 0 };
function squad(ctx: ArtContext, build: (v: LookVariant) => Look, colourway = ctx.colourway): UnitArt {
  const { variants, pick } = squadLooks(ctx.spec.models);
  return { colourway, looks: variants.map(build), ...(variants.length > 1 ? { pick } : {}) };
}
const PIECE = (n: string) => ({ side: side(n), top: top(n) });
const NONE = { side: null, top: null };

/** Rework some limbs (a skeleton's bare bones, a zombie's grey forearms). */
function limbs(rig: RigDef, test: (id: string) => boolean, f: (l: LimbDef) => LimbDef): RigDef {
  return { ...rig, limbs: rig.limbs.map((l) => (test(l.id) ? f(l) : l)) };
}
/** Bare bone: ivory, no stripe, thinner (k of the kit's width). */
const bone =
  (k: number) =>
  (l: LimbDef): LimbDef => ({ ...l, upper: { ...l.upper, slot: "paint", stripe: undefined, width: l.upper.width * k }, lower: { ...l.lower, slot: "paint", stripe: undefined, width: l.lower.width * k } });
const ALL = (): boolean => true;
const bony = (look: Look, k = 0.6): Look => ({ side: limbs(look.side, ALL, bone(k)), top: limbs(look.top, ALL, bone(k)) });

/** A structure: the body part on the structure frame (no gun). */
function tower(id: string, name: string, view: RigView, body: string, scale: number): RigDef {
  const parts: PartUse[] = [{ id: "body", src: body, bone: "torso", z: 5 }];
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
    ground: GROUND,
    ...(view === "top" ? { shadow: { x: 10, y: 12, r: 46 } } : {}),
  };
  rig = fitHeight(rig);
  return scaleRig(rig, scale);
}

/** A humanoid of the Ever-Restless: the slots the unit swaps, both views. */
function figure(ctx: ArtContext, v: LookVariant, o: Partial<HumanoidOpts> & { idTag: string; scale?: number }): Look {
  const opts: HumanoidOpts = {
    id: `forge.undead.${o.idTag}.${v.tag}`,
    name: ctx.profile.name,
    head: "skull",
    headgear: "none",
    weapon: "sword",
    back: "none",
    lean: v.lean,
    aim: v.aim,
    ...o,
    scale: (o.scale ?? 1) * (v.leader ? 1.04 : 1),
    parts: { gear: NONE, back: NONE, ...o.parts },
  };
  return { side: humanoidSide(opts), top: humanoidTop(opts) };
}

const BONE_LEGS = { shinF: side("bone-shin"), shinB: side("bone-shin-back"), kneeF: side("bone-knee"), kneeB: side("bone-knee-back"), bootF: side("bone-foot"), bootB: side("bone-foot-back") };

/** A skeleton: ribcage, skull, bone legs and hands; limbs bared to the bone. */
const skeleton = (ctx: ArtContext, v: LookVariant, o: Partial<HumanoidOpts> & { idTag: string }): Look =>
  bony(figure(ctx, v, { legParts: BONE_LEGS, hand: side("bone-hand"), ...o, parts: { torso: PIECE("ribs"), head: PIECE("skull"), ...o.parts } }));

// ---------- held weapons ----------

/** Rattlebones: the notched sword in the far hand, the coffin lid on the near arm. */
function swordShieldSide(v: LookVariant): HeldWeapon {
  const s = side("sword");
  return {
    src: s,
    place: v.tag === "b" ? placeAt(s, "g1", { x: 56, y: 84 }, 10) : placeAt(s, "g1", { x: 62, y: 62 }, 62),
    armB: { grip: "g1" },
    armF: { hand: side("coffin"), at: { x: 40, y: 86 }, to: "torso", rot: v.tag === "b" ? 6 : -4 },
  };
}
function swordShieldTop(): HeldWeaponTop {
  const s = top("sword");
  return { src: s, place: placeAt(s, "g1", { x: 12, y: -14 }, 80), armR: { grip: "g1" }, armL: { hand: top("coffin"), at: { x: -15, y: -12 }, to: "torso", rot: -24 } };
}
const bowSide = (): HeldWeapon => ({ src: side("bonebow"), place: placeAt(side("bonebow"), "g1", { x: 30, y: 72 }, -4) });
const bowTop = (): HeldWeaponTop => ({ src: top("bonebow"), place: placeAt(top("bonebow"), "g1", { x: -6, y: -26 }, 86) });

/** Shamblers: both dead hands reaching forward (the second stance lets one arm hang). */
function grabSide(v: LookVariant): HeldWeapon {
  const h = side("zombie-hand");
  const hang = v.tag === "b";
  return { src: h, place: placeAt(h, "g1", { x: 30, y: 76 }, hang ? 18 : 0), armB: { hand: side("zombie-hand-off"), at: hang ? { x: 68, y: 104 } : { x: 38, y: 86 }, to: "torso", rot: hang ? 74 : 6 } };
}
function grabTop(): HeldWeaponTop {
  const h = top("zombie-hand");
  return { src: h, place: placeAt(h, "g1", { x: -8, y: -24 }, 90), armR: { hand: top("zombie-hand-off"), at: { x: 9, y: -22 }, to: "torso", rot: 90 } };
}

export default defineTemplateArt({
  key: "undead",
  colourway: (f) => undeadColourway(f.color),
  units: {
    // Rattlebones: kettle helm, coffin-lid shield, notched sword; the sergeant's crested helm and
    // lantern standard; the second stance bareheaded under a knotted rag, thrusting low
    bones: (ctx) =>
      squad(ctx, (v) =>
        skeleton(ctx, v, {
          idTag: "bones",
          weaponSide: swordShieldSide(v),
          weaponTop: swordShieldTop(),
          parts: {
            torso: { side: side("ribs-plain"), top: top("ribs") },
            gear: v.leader ? PIECE("kettle-crest") : v.tag === "b" ? PIECE("headrag") : PIECE("kettle"),
            back: v.leader ? PIECE("standard") : NONE,
          },
        }),
      ),
    // Shamblers: hunched and reaching; one in a top hat, one bandaged with an arm hanging
    shamblers: (ctx) => {
      const skin = numToHex(ctx.spec.primary);
      const cw: Colourway = { ...ctx.colourway, id: `${ctx.colourway.id}-shambler-${skin.slice(1)}`, fixed: { ...ctx.colourway.fixed, paint: skin, rivet: shadeOf(skin) } };
      return squad(
        ctx,
        (v) => {
          const look = figure(ctx, v, {
            idTag: "shamblers",
            lean: v.leader ? -8 : v.tag === "b" ? -5 : -14,
            weaponSide: grabSide(v),
            weaponTop: grabTop(),
            hand: side("knuckle"),
            legParts: { shinF: side("zombie-shin"), shinB: side("zombie-shin-back"), kneeF: side("bone-knee"), kneeB: side("bone-knee-back"), bootF: side("zombie-foot"), bootB: side("zombie-foot-back") },
            parts: { torso: PIECE("zombie-torso"), head: PIECE("zombie-head"), gear: v.leader ? PIECE("tophat") : v.tag === "b" ? PIECE("bandage") : NONE },
          });
          const grey = (l: LimbDef): LimbDef => ({ ...l, lower: { ...l.lower, slot: "paint", stripe: "rivet" } });
          const arm = (id: string) => id.startsWith("arm");
          return { side: limbs(look.side, arm, grey), top: limbs(look.top, arm, grey) };
        },
        cw,
      );
    },
    // Hollow-Eye Archers: cowled skeletons, rag cloaks, the bonebow; the leader's lantern standard,
    // the second stance bareheaded
    archers: (ctx) =>
      squad(ctx, (v) =>
        skeleton(ctx, v, {
          idTag: "archers",
          weaponSide: bowSide(),
          weaponTop: bowTop(),
          parts: { gear: v.tag === "b" ? PIECE("headrag") : PIECE("cowl"), back: v.leader ? PIECE("standard") : PIECE("rags") },
        }),
      ),
    // Wailing Wraiths: a hooded shroud streaming into tatters, the chill-touch claws reaching out
    wraiths: (ctx) =>
      squad(ctx, (v) => {
        const spec = { ...ctx.spec, scale: 1.1, back: "none" as const };
        const c = side("wraith-claw");
        const ct = top("wraith-claw");
        const o = { id: `forge.undead.wraiths.${v.tag}`, name: ctx.profile.name, spec, variant: v, engines: false as const };
        return {
          side: flyerSide({ ...o, hull: side("wraith"), gun: { src: c, place: placeAt(c, "g1", { x: -38, y: -56 }, v.tag === "b" ? -16 : 8) } }),
          top: flyerTop({
            ...o,
            hull: top("wraith"),
            gun: { src: ct, place: placeAt(ct, "g1", { x: -11, y: -30 }, 90) },
            extras: [{ id: "claw-r", src: ct, bone: "torso", place: placeAt(ct, "g1", { x: 11, y: -30 }, 90), z: 6 }],
          }),
        };
      }),
    // Grave Riders: dented breastplate, rusted sallet and shredded plume, the couched lance, the
    // lantern standard; on a skeletal horse with a ragged mane
    riders: (ctx) =>
      squad(ctx, (v) => {
        const l = side("lance");
        const lt = top("lance");
        const o = {
          id: `forge.undead.riders.${v.tag}`,
          name: ctx.profile.name,
          spec: ctx.spec,
          variant: v,
          steed: { side: { body: side("horse-body"), head: side("horse-head"), tail: side("horse-tail") }, top: { body: top("horse-body"), head: top("horse-head"), tail: top("horse-tail") }, scale: 1.1 },
          rider: {
            helm: side("skull"),
            gear: side("rider-helm"),
            torso: side("rider-torso"),
            pack: side("standard"),
            pads: { front: side("pad-front"), back: side("pad-back") },
            weapon: { src: l, place: v.tag === "b" ? placeAt(l, "g1", { x: 50, y: 84 }, 22) : placeAt(l, "g1", { x: 52, y: 88 }, 4) },
            top: {
              parts: { head: { top: top("skull") }, gear: { top: top("rider-helm") }, torso: { top: top("rider-torso") }, back: { top: null } },
              weaponTop: { src: lt, place: placeAt(lt, "g1", { x: -12, y: -6 }, 86) },
            },
          },
        };
        const steed = (id: string) => id.startsWith("s");
        const rider = (id: string) => !id.startsWith("s");
        const bare = (r: RigDef) => limbs(limbs(r, steed, bone(0.72)), rider, bone(0.62));
        return { side: bare(riderSide(o)), top: bare(riderTop(o)) };
      }),
    // the Necromancer: peaked hood, flared collar, long ragged robe, the skull staff and its lantern
    necro: (ctx) =>
      one(
        ctx,
        figure(ctx, { ...LONE, leader: true }, {
          idTag: "necro",
          scale: 1.04,
          hand: side("glove"),
          weaponSide: { src: side("skullstaff"), place: placeAt(side("skullstaff"), "g1", { x: 40, y: 66 }, 82) },
          weaponTop: { src: top("skullstaff"), place: placeAt(top("skullstaff"), "g1", { x: -13, y: -14 }, 82) },
          parts: { torso: PIECE("necro-robe"), head: PIECE("necro-face"), gear: PIECE("necro-hood") },
        }),
      ),
    // the Bone Colossus: a giant cage of ribs and skulls, horned skull-heap head, the femur club
    colossus: (ctx) => {
      const f = side("femur");
      const ft = top("femur");
      return one(
        ctx,
        bony(
          figure(ctx, LONE, {
            idTag: "colossus",
            scale: ctx.spec.scale * 1.45,
            lean: -4,
            hand: side("bone-hand"),
            padsSide: { front: side("col-pad-front"), back: side("col-pad-back") },
            legParts: { shinF: side("col-shin"), shinB: side("col-shin-back"), kneeF: side("col-knee"), kneeB: side("col-knee-back"), bootF: side("col-foot"), bootB: side("col-foot-back"), width: 9 },
            weaponSide: { src: f, place: placeAt(f, "g1", { x: 36, y: 56 }, 50) },
            weaponTop: { src: ft, place: placeAt(ft, "g1", { x: -10, y: -16 }, 62) },
            parts: { torso: PIECE("col-torso"), head: PIECE("col-head") },
          }),
          0.95,
        ),
      );
    },
    // the Crypt Gate: a squat mausoleum, iron-barred door glowing, team banners each side
    crypt: (ctx) =>
      one(ctx, {
        side: tower("forge.undead.crypt", ctx.profile.name, "side", side("crypt"), ctx.spec.scale),
        top: tower("forge.undead.crypt", ctx.profile.name, "top", top("crypt"), ctx.spec.scale),
      }),
  },
});
