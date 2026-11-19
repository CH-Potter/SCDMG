// Brightmantle Kingdom (Forge template `knights`): upright, proud and heraldic. Their own look:
// polished steel under blue tabards with the kingdom's gold rising sun, kettle hats and sweeping
// sallets, great helms with tall blue plumes, gold-rimmed heater shields carrying the team field,
// striped lances with swallowtail pennants. The Men-at-Arms fight sword and shield; the Pitchfork
// Levy turn out in drab smocks and straw hats with a sack of turnips; the Longbow Yeomen wear green
// hoods with long liripipe tails over leather jerkins; the Knights ride bay warhorses under dagged
// blue caparisons with a steel chanfron; the Lantern Chaplain carries a lantern on a crook and a
// flanged mace; the Griffin Lancer rides a golden griffin; the Royal Trebuchet flies the banner.
//
// Silhouette language: tall and vertical (plumes, lances held high, pennants, the trebuchet frame),
// clean rounded steel and crisp heater shapes. Colour: the faction colour as tabards, caparisons and
// plumes; polished light steel; heraldic gold; a unit's own cloth where the recipe gives one.

import { colourwayOf, defineTemplateArt, fitHeight, humanoidSide, humanoidTop, mirrorPart, placeAt, riderSide, riderTop, scaleRig, squadLooks, type ArtContext, type HeldWeapon, type HeldWeaponTop, type HumanoidOpts, type LookVariant, type RiderOpts, type UnitArt, type ExtraPart } from "../../../kits";
import { hexToOklch, mixHex, numToHex, oklchToHex } from "../../../color";
import type { Colourway, SlotName } from "../../../slots";
import type { LimbDef, PartUse, RigDef, RigView } from "../../../types";

const byName = (g: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(g).map(([p, s]) => [p.slice(p.lastIndexOf("/") + 1, -4), s]));
const SIDE = byName(import.meta.glob<string>("../../../parts/forge/knights/*.svg", { query: "?raw", import: "default", eager: true }));
const TOP = byName(import.meta.glob<string>("../../../parts/forge/knights-top/*.svg", { query: "?raw", import: "default", eager: true }));
const side = (n: string): string => SIDE[n] ?? fail(`knights/${n}`);
const top = (n: string): string => TOP[n] ?? fail(`knights-top/${n}`);
function fail(n: string): never {
  throw new Error(`missing Brightmantle part ${n}`);
}

/** Heraldic gold: the Kingdom's trim, whatever the faction's colour. */
const GOLD = 0xdcb55a;
const GROUND = "#4d4a44";

/**
 * Tabards, caparisons and plumes in the faction colour; polished light steel (a breath of the main
 * hue); heraldic gold trim; warm lantern light. `cloth` is a unit's own cloth (the levy's smocks, the
 * yeomen's green, the chaplain's cream, the trebuchet's timber), else a dark cloth from the main colour.
 */
function kingdom(primary: number, cloth?: number): Colourway {
  const base = colourwayOf(primary, GOLD, "plain");
  const p = hexToOklch(base.plate);
  return {
    ...base,
    id: `knights-${numToHex(primary).slice(1)}${cloth === undefined ? "" : `-${numToHex(cloth).slice(1)}`}`,
    name: "Brightmantle",
    suit: cloth === undefined ? oklchToHex({ l: Math.max(0.22, Math.min(0.32, p.l * 0.45)), c: Math.min(0.06, p.c * 0.55), h: p.h }) : numToHex(cloth),
    metal: mixHex("#b7c1ca", base.plate, 0.08),
    glow: "#ffe3a0",
    fixed: { paint: "#efcfaa", rivet: "#b98a62", chip: "#f2f5f8", glowWarm: "#f2a93b" },
  };
}

type Look = { side: RigDef; top: RigDef };
const LONE: LookVariant = { tag: "a", leader: false, lean: 0, aim: 0 };
const one = (cw: Colourway, look: Look): UnitArt => ({ colourway: cw, looks: [look] });
function squad(ctx: ArtContext, cw: Colourway, build: (v: LookVariant) => Look): UnitArt {
  const { variants, pick } = squadLooks(ctx.spec.models);
  return { colourway: cw, looks: variants.map(build), ...(variants.length > 1 ? { pick } : {}) };
}
/** The unit's own cloth colourway when its recipe gives a main colour other than the faction's. */
const clothOf = (ctx: ArtContext): Colourway => (ctx.spec.primary === ctx.faction.color ? ctx.colourway : kingdom(ctx.faction.color, ctx.spec.primary));

/** Repaint limbs: steel legs and vambraces, bare forearms, cream sleeves, a horse's coat. */
type Paint = { upper?: SlotName; lower?: SlotName; stripe?: SlotName };
function paint(rig: RigDef, f: (id: string) => Paint | undefined): RigDef {
  return {
    ...rig,
    limbs: rig.limbs.map((l: LimbDef) => {
      const p = f(l.id);
      if (!p) return l;
      return { ...l, upper: { ...l.upper, slot: p.upper ?? l.upper.slot, stripe: p.stripe }, lower: { ...l.lower, slot: p.lower ?? l.lower.slot, stripe: p.stripe } };
    }),
  };
}
const both = (look: Look, f: (id: string) => Paint | undefined): Look => ({ side: paint(look.side, f), top: paint(look.top, f) });
/** Steel legs and forearms (side and top). */
const steel = (id: string): Paint | undefined => (id.startsWith("leg") ? { upper: "metal", lower: "metal", stripe: "metalShade" } : id.startsWith("arm") ? { lower: "metal" } : undefined);

const STEEL_LEGS = { shinF: side("shin-front"), shinB: side("shin-back"), bootF: side("boot-front"), bootB: side("boot-back"), kneeF: side("knee-front"), kneeB: side("knee-back"), width: 7.6 };
const WRAP_LEGS = { shinF: side("wrap-front"), shinB: side("wrap-back"), bootF: side("shoe-front"), bootB: side("shoe-back"), kneeF: side("patch-front"), kneeB: side("patch-back"), width: 7.2 };
const PIECE = (n: string) => ({ side: side(n), top: top(n) });
const NONE = { side: null, top: null };

/** A subject of the Kingdom: face, legs and the slots the unit swaps. */
function subject(ctx: ArtContext, v: LookVariant, o: Partial<HumanoidOpts> & { idTag: string; scale?: number }): Look {
  const opts: HumanoidOpts = {
    id: `forge.knights.${o.idTag}.${v.tag}`,
    name: ctx.profile.name,
    head: "face",
    headgear: "none",
    weapon: "sword",
    back: "none",
    lean: v.lean,
    aim: v.aim,
    legParts: STEEL_LEGS,
    ...o,
    scale: (o.scale ?? 1) * (v.leader ? 1.05 : 1),
    parts: {
      torso: PIECE("torso"),
      head: PIECE("head"),
      gear: NONE,
      back: NONE,
      ...o.parts,
    },
  };
  return { side: humanoidSide(opts), top: humanoidTop(opts) };
}

// ---------- held weapons ----------

function swordShieldSide(v: LookVariant): HeldWeapon {
  const s = side("sword");
  const place = v.leader ? placeAt(s, "g1", { x: 64, y: 56 }, 74) : v.tag === "b" ? placeAt(s, "g1", { x: 58, y: 80 }, 14) : placeAt(s, "g1", { x: 62, y: 62 }, 62);
  return { src: s, place, armB: { grip: "g1" }, armF: { hand: side("shield"), at: { x: 40, y: 86 }, to: "torso", rot: -4 } };
}
const swordShieldTop = (): HeldWeaponTop => ({
  src: top("sword"),
  place: placeAt(top("sword"), "g1", { x: 12, y: -14 }, 80),
  armR: { grip: "g1" },
  armL: { hand: top("shield"), at: { x: -15, y: -12 }, to: "torso", rot: -24 },
});
const forkSide = (v: LookVariant): HeldWeapon => ({ src: side("pitchfork"), place: v.tag === "a" ? placeAt(side("pitchfork"), "g1", { x: 38, y: 82 }, 12) : placeAt(side("pitchfork"), "g1", { x: 40, y: 66 }, 82) });
const forkTop = (): HeldWeaponTop => ({ src: top("pitchfork"), place: placeAt(top("pitchfork"), "g1", { x: -13, y: -14 }, 82) });
const bowSide = (): HeldWeapon => ({ src: side("longbow"), place: placeAt(side("longbow"), "g1", { x: 30, y: 72 }, -4) });
const bowTop = (): HeldWeaponTop => ({ src: top("longbow"), place: placeAt(top("longbow"), "g1", { x: -6, y: -26 }, 86) });
/** The chaplain: the lantern held forward on its crook, the mace raised behind. */
const lanternSide = (): HeldWeapon => ({ src: side("lantern-staff"), place: placeAt(side("lantern-staff"), "g1", { x: 40, y: 76 }, -8), armB: { hand: side("mace"), at: { x: 74, y: 70 }, to: "torso", rot: 120 } });
const lanternTop = (): HeldWeaponTop => ({ src: top("lantern-staff"), place: placeAt(top("lantern-staff"), "g1", { x: -8, y: -14 }, 76), armR: { hand: top("mace"), at: { x: 14, y: -6 }, to: "torso", rot: 150 } });
/** A lance: couched under the arm (look a) or raised with its pennant flying (look b); the other hand on the reins. */
function lanceSide(raised: boolean): HeldWeapon {
  const l = side("lance");
  return { src: l, place: raised ? placeAt(l, "g1", { x: 46, y: 96 }, 58) : placeAt(l, "g1", { x: 52, y: 94 }, 3), armB: { hand: side("gauntlet"), at: { x: 66, y: 98 }, to: "torso" } };
}
const lanceTop = (): HeldWeaponTop => ({ src: top("lance"), place: placeAt(top("lance"), "g1", { x: -10, y: 4 }, 90), armR: { hand: top("gauntlet"), at: { x: 12, y: -6 }, to: "torso" } });

// ---------- non-humanoid builders ----------

/** A structure: the body part and a gun part at its mount, on the structure frame. */
function tower(id: string, name: string, view: RigView, body: string, scale: number, gun?: { src: string; place: PartUse["place"] }): RigDef {
  const parts: PartUse[] = [{ id: "body", src: body, bone: "torso", z: 5 }];
  if (gun) parts.push({ id: "gun", src: gun.src, bone: "gun", place: gun.place, z: 6 });
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
    ...(view === "top" ? { shadow: { x: 10, y: 12, r: 44 } } : {}),
  };
  rig = fitHeight(rig);
  return scaleRig(rig, scale);
}

/** A mounted knight: great helm and plume, steel pauldrons, the lance; the steed's parts and coat. */
function mounted(ctx: ArtContext, v: LookVariant, o: { idTag: string; steed: RiderOpts["steed"]; coat: Paint; raised: boolean; banner?: boolean; extrasSide?: ExtraPart[]; extrasTop?: ExtraPart[] }): Look {
  const r: RiderOpts = {
    id: `forge.knights.${o.idTag}.${v.tag}`,
    name: ctx.profile.name,
    spec: ctx.spec,
    variant: v,
    steed: o.steed,
    rider: {
      helm: side("greathelm"),
      gear: side("plume"),
      torso: side("torso"),
      pack: o.banner ? side("banner") : null,
      pads: { front: side("pad-front"), back: side("pad-back") },
      weapon: lanceSide(o.raised),
      ...(o.extrasSide ? { extras: o.extrasSide } : {}),
      top: {
        parts: { head: { top: top("greathelm") }, gear: { top: top("plume") }, torso: { top: top("torso") }, back: { top: o.banner ? top("banner") : null } },
        weaponTop: lanceTop(),
        ...(o.extrasTop ? { extrasTop: o.extrasTop } : {}),
      },
    },
  };
  const f = (id: string): Paint | undefined => (id.startsWith("s") ? o.coat : steel(id));
  // the rider's leg plates are drawn in the standing frame like ours: swap in the Kingdom's steel
  const legs: Record<string, string> = { "shin-front": STEEL_LEGS.shinF, "shin-back": STEEL_LEGS.shinB, "knee-front": STEEL_LEGS.kneeF, "knee-back": STEEL_LEGS.kneeB, "boot-front": STEEL_LEGS.bootF, "boot-back": STEEL_LEGS.bootB };
  const sideRig = riderSide(r);
  return { side: paint({ ...sideRig, parts: sideRig.parts.map((x) => (legs[x.id] ? { ...x, src: legs[x.id]! } : x)) }, f), top: paint(riderTop(r), f) };
}

export default defineTemplateArt({
  key: "knights",
  colourway: (f) => kingdom(f.color),
  units: {
    // Men-at-Arms: steel under the blue tabard, sword and heater shield. Look a: a kettle hat, the
    // sword at the ready; look b: a sallet with the visor down, the sword levelled; the sergeant: a
    // plumed kettle hat, the sword raised and the Kingdom's pennant on his back
    menatarms: (ctx) =>
      squad(ctx, ctx.colourway, (v) =>
        both(
          subject(ctx, v, {
            idTag: "menatarms",
            scale: 1.02,
            weaponSide: swordShieldSide(v),
            weaponTop: swordShieldTop(),
            padsSide: { front: side("pad-front"), back: side("pad-back") },
            parts: v.tag === "b" ? { head: PIECE("sallet") } : { gear: PIECE("kettle"), back: v.leader ? PIECE("banner") : NONE },
            extrasSide: v.leader ? [{ id: "plume", src: side("plume"), bone: "head", z: 19.6, place: { x: 0, y: -4, rot: 0 } }] : [],
            extrasTop: v.leader ? [{ id: "plume", src: top("plume"), bone: "head", z: 6.6 }] : [],
          }),
          steel,
        ),
      ),
    // Pitchfork Levy: drab smocks, the blue armband, straw hats and cloth caps, bare forearms, leg
    // wraps; the lead and the bareheaded bearded one carry the turnip sack
    levy: (ctx) => {
      const cw = clothOf(ctx);
      return squad(ctx, cw, (v) =>
        both(
          subject(ctx, v, {
            idTag: "levy",
            scale: 0.98,
            legParts: WRAP_LEGS, hand: side("hand"),
            weaponSide: forkSide(v),
            weaponTop: forkTop(),
            parts: {
              torso: PIECE("smock"),
              head: v.tag === "b" ? PIECE("head-beard") : PIECE("head"),
              gear: v.leader ? PIECE("straw") : v.tag === "a" ? PIECE("cap") : NONE,
              back: v.tag === "a" ? NONE : PIECE("sack"),
            },
          }),
          (id) => (id.startsWith("arm") ? { lower: "paint" } : undefined),
        ),
      );
    },
    // Longbow Yeomen: green liripipe hoods over leather jerkins, the yew longbow and a quiver; the
    // second stance has the hood down; the lead carries the pennant
    yeomen: (ctx) => {
      const cw = clothOf(ctx);
      return squad(ctx, cw, (v) =>
        both(
          subject(ctx, v, {
            idTag: "yeomen",
            legParts: WRAP_LEGS, hand: side("hand"),
            weaponSide: bowSide(),
            weaponTop: bowTop(),
            parts: { torso: PIECE("jerkin"), gear: v.tag === "b" ? NONE : PIECE("hood"), back: v.leader ? PIECE("banner") : NONE },
            extrasSide: v.leader ? [] : [{ id: "quiver", src: side("quiver"), bone: "torso", z: 0.5 }],
            extrasTop: v.leader ? [] : [{ id: "quiver", src: top("quiver"), bone: "torso", z: 0.5 }],
          }),
          (id) => (id.startsWith("arm") ? { lower: "leatherShade" } : undefined),
        ),
      );
    },
    // Knights of the Gallant Charge: great helm and plume on a bay warhorse under a dagged blue
    // caparison; look a couches the lance and flies the pennant, look b holds the lance high
    knights: (ctx) =>
      squad(ctx, ctx.colourway, (v) =>
        mounted(ctx, v, {
          idTag: "knights",
          raised: v.tag === "b",
          banner: v.tag === "a",
          coat: { upper: "rivet", lower: "rivet", stripe: "leatherShade" },
          steed: {
            side: { body: side("horse-body"), head: side("horse-head"), tail: side("horse-tail") },
            top: { body: top("horse-body"), head: top("horse-head"), tail: top("horse-tail") },
            scale: 1.28,
          },
        }),
      ),
    // the Lantern Chaplain: cream robe, blue stole, a tall hat with the sun, lantern and mace
    chaplain: (ctx) => {
      const cw = clothOf(ctx);
      return one(
        cw,
        both(
          subject(ctx, { ...LONE, leader: true }, { idTag: "chaplain", scale: 0.98, legParts: WRAP_LEGS, hand: side("hand"), weaponSide: lanternSide(), weaponTop: lanternTop(), parts: { torso: PIECE("robe"), head: PIECE("head-beard"), gear: PIECE("chaplain-hat") } }),
          (id) => (id.startsWith("arm") ? { lower: "suit" } : undefined),
        ),
      );
    },
    // the Griffin Lancer: a knight on a golden griffin, its great wings raised, the lance high
    skylancer: (ctx) => {
      const w = side("griffin-wing");
      const wt = top("griffin-wing");
      return one(
        ctx.colourway,
        mounted(ctx, LONE, {
          idTag: "skylancer",
          raised: true,
          coat: { upper: "leather", lower: "leather", stripe: "leatherShade" },
          steed: {
            side: { body: side("griffin-body"), head: side("griffin-head"), tail: side("griffin-tail") },
            top: { body: top("griffin-body"), head: top("griffin-head"), tail: top("griffin-tail") },
            scale: 1.15,
          },
          extrasSide: [
            { id: "wing-far", src: w, bone: "pelvis", z: -30, place: placeAt(w, "pivot", { x: 84, y: 92 }, -24, 0.95), anim: { flap: 0.8, phase: 0.06 }, absolute: true },
            { id: "wing-near", src: w, bone: "pelvis", z: -4, place: placeAt(w, "pivot", { x: 72, y: 98 }, -2, 1.1), anim: { flap: 0.8 }, absolute: true },
          ],
          extrasTop: [
            { id: "wing-l", src: mirrorPart(wt), bone: "torso", z: -5.5, place: { x: -15, y: 8, rot: -90, scale: 1.25 }, anim: { flap: 0.7 } },
            { id: "wing-r", src: wt, bone: "torso", z: -5.5, place: { x: 15, y: 8, rot: 90, scale: 1.25 }, anim: { flap: 0.7, phase: 0.04 } },
          ],
        }),
      );
    },
    // the Royal Trebuchet: the timber frame on wheels, the royal banner; the arm is the gun
    trebuchet: (ctx) => {
      const cw = clothOf(ctx);
      const arm = side("trebuchet-arm");
      const armT = top("trebuchet-arm");
      const k = ctx.spec.scale;
      return one(cw, {
        side: tower("forge.knights.trebuchet", ctx.profile.name, "side", side("trebuchet"), k, { src: arm, place: placeAt(arm, "pivot", { x: 0, y: -116 }) }),
        top: tower("forge.knights.trebuchet", ctx.profile.name, "top", top("trebuchet"), k * 1.45, { src: armT, place: placeAt(armT, "pivot", { x: 0, y: 0 }) }),
      });
    },
  },
});
