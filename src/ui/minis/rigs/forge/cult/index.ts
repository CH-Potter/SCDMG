// Cult of the Grinning Star (Forge template `cult`): a doom cult that worships a big red star that
// smiles. Their own look, not the generic kit's: the Grinning Star is a round smiling sun-disc with
// short blunt rays, and the grin is everywhere. Zealots in deep crimson hooded robes and white
// porcelain smile masks (ritual knives, rusty pistols, a pole standard with the sun-disc); the
// Spikeplate Champions in crimson plate whose "spikes" are blunt gold sun-rays (a haloed sunburst
// helm with a glowing grin visor, a crescent greataxe shaped like a smile); the Doom Prophet under a
// towering hood with three placards on his back; a hunched Mutant Brute with too many arms and one
// star eye; wobbling Squirming Things; bat-winged imps with tiny pitchforks; a stone Grinning Idol
// with a sun-ray crown and a third eye; and the Screaming Rift, a glowing tear with hands in it.

import { colourwayOf, defineTemplateArt, humanoidSide, humanoidTop, beastSide, beastTop, mirrorPart, placeAt, squadLooks, structureSide, structureTop, type ArtContext, type HeldWeapon, type HeldWeaponTop, type HumanoidOpts, type LookVariant, type UnitArt } from "../../../kits";
import type { ExtraPart, LegParts } from "../../../kits";
import { mixHex, numToHex } from "../../../color";
import type { Colourway } from "../../../slots";
import type { RigDef } from "../../../types";

const byName = (g: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(g).map(([p, s]) => [p.slice(p.lastIndexOf("/") + 1, -4), s]));
const SIDE = byName(import.meta.glob<string>("../../../parts/forge/cult/*.svg", { query: "?raw", import: "default", eager: true }));
const TOP = byName(import.meta.glob<string>("../../../parts/forge/cult-top/*.svg", { query: "?raw", import: "default", eager: true }));
const side = (n: string): string => SIDE[n] ?? fail(`cult/${n}`);
const top = (n: string): string => TOP[n] ?? fail(`cult-top/${n}`);
function fail(n: string): never {
  throw new Error(`missing Cult part ${n}`);
}

/**
 * Robes and plate in the faction colour (plate), a deep lining of the same hue (suit), the recipe's
 * trim tarnished a touch (leather: old gold for the cult, violet for the things from the sky),
 * porcelain masks and pale flesh (paint, rivet), and a warm star-orange glow.
 */
function cultColourway(primary: number, secondary: number): Colourway {
  const base = colourwayOf(primary, secondary, "teeth");
  return {
    ...base,
    id: `cult-${numToHex(primary).slice(1)}-${numToHex(secondary).slice(1)}`,
    name: "Grinning Star",
    leather: mixHex(base.leather, "#6b4a22", 0.28),
    glow: "#ffd27a",
    fixed: { paint: "#efe8d8", rivet: "#c9bea6", chip: "#d6d2c8", glowWarm: "#ff7b2e" },
  };
}

type Look = { side: RigDef; top: RigDef };

// ---------- weapons (side: hands at their grips; top: forward of the shoulders) ----------

const KNIFE = side("knife");
const KNIFE_T = top("knife");
const knivesSide = (): HeldWeapon => ({ src: KNIFE, place: placeAt(KNIFE, "g1", { x: 40, y: 86 }, 28), armB: { hand: KNIFE, at: { x: 67, y: 98 }, to: "torso", rot: -60 } });
const knivesTop = (): HeldWeaponTop => ({ src: KNIFE_T, place: placeAt(KNIFE_T, "g1", { x: -12, y: -14 }, 80), armR: { hand: KNIFE_T, at: { x: 13, y: -11 }, to: "torso", rot: 100 } });
const pistolSide = (): HeldWeapon => {
  const src = side("pistol");
  return { src, place: placeAt(src, "g1", { x: 37, y: 82 }, -4), armB: { hand: KNIFE, at: { x: 68, y: 98 }, to: "torso", rot: -60 } };
};
const pistolTop = (): HeldWeaponTop => {
  const src = top("pistol");
  return { src, place: placeAt(src, "g1", { x: -12, y: -16 }, 86), armR: { hand: KNIFE_T, at: { x: 13, y: -10 }, to: "torso", rot: 100 } };
};
const twoHanded = (s: string, t: string, sideAt: [number, number, number], topAt: [number, number, number]): { side: HeldWeapon; top: HeldWeaponTop } => {
  const a = side(s);
  const b = top(t);
  return { side: { src: a, place: placeAt(a, "g1", { x: sideAt[0], y: sideAt[1] }, sideAt[2]) }, top: { src: b, place: placeAt(b, "g1", { x: topAt[0], y: topAt[1] }, topAt[2]) } };
};
const STANDARD = () => twoHanded("standard", "standard", [41, 72, 84], [-13, -14, 82]);
const AXE = () => twoHanded("axe", "axe", [36, 56, 50], [-10, -16, 62]);
const STAFF = () => twoHanded("staff", "staff", [40, 66, 82], [-13, -14, 82]);

/** Legs under a robe: cloth wraps, knotted knees, soft boots. */
const ROBE_LEGS: LegParts = { shinF: side("wrap-front"), shinB: side("wrap-back"), kneeF: side("knot-front"), kneeB: side("knot-back"), bootF: side("boot-front"), bootB: side("boot-back") };

interface FigureOpts {
  idTag: string;
  torso: string;
  head: string;
  back?: string;
  weapon: { side: HeldWeapon; top: HeldWeaponTop };
  scale: number;
  more?: Partial<HumanoidOpts>;
}

/** A cult humanoid: the kit's frame with the cult's own torso, head, back and weapon. */
function figure(ctx: ArtContext, v: LookVariant, o: FigureOpts): Look {
  const opts: HumanoidOpts = {
    id: `forge.cult.${o.idTag}.${v.tag}`,
    name: ctx.profile.name,
    head: "skull",
    headgear: "none",
    weapon: "blade",
    back: "none",
    lean: v.lean,
    aim: v.aim,
    scale: o.scale * (v.leader ? 1.05 : 1),
    hand: side("hand"),
    legParts: ROBE_LEGS,
    weaponSide: o.weapon.side,
    weaponTop: o.weapon.top,
    ...o.more,
    parts: {
      torso: { side: side(o.torso), top: top(o.torso) },
      head: { side: side(o.head), top: top(o.head) },
      gear: { side: null, top: null },
      back: o.back ? { side: side(o.back), top: top(o.back) } : { side: null, top: null },
      ...o.more?.parts,
    },
  };
  return { side: humanoidSide(opts), top: humanoidTop(opts) };
}

/** A squad's looks, one builder per look. */
function squad(ctx: ArtContext, build: (v: LookVariant) => Look): UnitArt {
  const { variants, pick } = squadLooks(ctx.spec.models);
  return { colourway: ctx.colourway, looks: variants.map(build), ...(variants.length > 1 ? { pick } : {}) };
}
const one = (ctx: ArtContext, look: Look): UnitArt => ({ colourway: ctx.colourway, looks: [look] });
const LONE: LookVariant = { tag: "a", leader: false, lean: 0, aim: 0 };

// ---------- the Mutant Brute ----------

function brute(ctx: ArtContext): Look {
  const claw = side("claw");
  const clawT = top("claw");
  const arm = side("brute-arm");
  const armT = top("brute-arm");
  const extrasSide: ExtraPart[] = [
    { id: "arm-far", src: arm, bone: "torso", z: 9, place: placeAt(arm, "pivot", { x: 80, y: 62 }, 150, 0.95) },
    { id: "arm-near", src: arm, bone: "torso", z: 13.5, place: placeAt(arm, "pivot", { x: 64, y: 82 }, 52) },
  ];
  const extrasTop: ExtraPart[] = [
    { id: "arm-l", src: armT, bone: "torso", z: 3, place: placeAt(armT, "pivot", { x: -22, y: 4 }, -24) },
    { id: "arm-r", src: armT, bone: "torso", z: 3, place: placeAt(armT, "pivot", { x: 22, y: 4 }, 24) },
  ];
  return figure(ctx, { ...LONE, lean: -10 }, {
    idTag: "brute",
    torso: "brute-torso",
    head: "brute-head",
    scale: 1.62,
    weapon: {
      side: { src: claw, place: placeAt(claw, "g1", { x: 38, y: 92 }, -20), armB: { hand: claw, at: { x: 70, y: 102 }, to: "torso", rot: -40 } },
      top: { src: clawT, place: placeAt(clawT, "g1", { x: -14, y: -16 }, 80), armR: { hand: clawT, at: { x: 15, y: -13 }, to: "torso", rot: 100 } },
    },
    more: {
      hand: side("hand"),
      legParts: { shinF: side("wrap-front"), shinB: side("wrap-back"), kneeF: side("knot-front"), kneeB: side("knot-back"), bootF: side("brute-foot"), bootB: side("brute-foot-back"), width: 10 },
      extrasSide,
      extrasTop,
    },
  });
}

// ---------- the imps: small winged humanoids with pitchforks ----------

function imp(ctx: ArtContext, v: LookVariant): Look {
  const wing = side("imp-wing");
  const wingT = top("imp-wing");
  const fork = side("fork");
  const forkT = top("fork");
  return figure(ctx, v, {
    idTag: "imps",
    torso: "imp-torso",
    head: "imp-head",
    scale: 0.64,
    weapon: {
      side: { src: fork, place: placeAt(fork, "g1", { x: 40, y: 84 }, v.leader ? -30 : -12) },
      top: { src: forkT, place: placeAt(forkT, "g1", { x: -12, y: -16 }, 80) },
    },
    more: {
      hand: side("hand"),
      legParts: { shinF: side("knot-front"), shinB: side("knot-back"), kneeF: side("knot-front"), kneeB: side("knot-back"), bootF: side("hoof-front"), bootB: side("hoof-back"), width: 6 },
      extrasSide: [
        { id: "wing-far", src: wing, bone: "torso", z: -1, place: placeAt(wing, "pivot", { x: 80, y: 66 }, -10, 1.05), anim: { flap: 0.8, phase: 0.08 } },
        { id: "wing-near", src: wing, bone: "torso", z: -0.5, place: placeAt(wing, "pivot", { x: 72, y: 70 }, 4, 1.15), anim: { flap: 0.8 } },
      ],
      extrasTop: [
        { id: "wing-l", src: mirrorPart(wingT), bone: "torso", z: -1, place: { x: -9, y: 3, rot: -90, scale: 1.1 }, anim: { flap: 0.75 } },
        { id: "wing-r", src: wingT, bone: "torso", z: -1, place: { x: 9, y: 3, rot: 90, scale: 1.1 }, anim: { flap: 0.75, phase: 0.04 } },
      ],
    },
  });
}

// ---------- the Squirming Things (beast frame) ----------

function squirmer(ctx: ArtContext, v: LookVariant): Look {
  const k = v.leader ? 1.15 : v.tag === "b" ? 0.88 : 1;
  const spec = { ...ctx.spec, scale: ctx.spec.scale * k };
  const id = `forge.cult.squirmers.${v.tag}`;
  return {
    side: beastSide({ id, name: ctx.profile.name, spec, variant: v, parts: { body: side("squirm-body"), head: side("squirm-head"), tail: side("squirm-tail"), gear: null } }),
    top: beastTop({ id, name: ctx.profile.name, spec, variant: v, parts: { body: top("squirm-body"), head: top("squirm-head"), tail: top("squirm-tail"), gear: null } }),
  };
}

export default defineTemplateArt({
  key: "cult",
  colourway: (_f, spec) => cultColourway(spec.primary, spec.secondary),
  units: {
    // Grinning Zealots: the leader carries the sun-disc standard; ritual knives, or a rusty pistol under a pointed cowl
    zealots: (ctx) =>
      squad(ctx, (v) =>
        v.leader
          ? figure(ctx, v, { idTag: "zealots", torso: "robe", head: "hood", weapon: STANDARD(), scale: 0.98 })
          : v.tag === "a"
            ? figure(ctx, v, { idTag: "zealots", torso: "robe", head: "hood", weapon: { side: knivesSide(), top: knivesTop() }, scale: 0.98 })
            : figure(ctx, v, { idTag: "zealots", torso: "robe", head: "cowl", weapon: { side: pistolSide(), top: pistolTop() }, scale: 0.98 }),
      ),
    // Spikeplate Champions: sun-ray plate, the sunburst helm, the grin-moon greataxe; the leader bears the banner
    champions: (ctx) =>
      squad(ctx, (v) =>
        figure(ctx, v, {
          idTag: "champions",
          torso: "champ-torso",
          head: "champ-helm",
          weapon: AXE(),
          scale: 1.14,
          ...(v.leader ? { back: "banner" } : {}),
          more: { padsSide: { front: side("pad-front"), back: side("pad-back") }, hand: undefined, legParts: undefined, lean: v.lean - (v.tag === "b" ? 3 : 0), aim: v.aim - (v.tag === "b" ? 14 : 0) },
        }),
      ),
    // Squirming Things: jelly sacs on stubby tentacles, a lunging toothed maw
    squirmers: (ctx) => squad(ctx, (v) => squirmer(ctx, v)),
    // the Doom Prophet: towering hood, seer's mask and beard, three placards, the crooked staff with its star lantern
    prophet: (ctx) => one(ctx, figure(ctx, { ...LONE, leader: true }, { idTag: "prophet", torso: "robe", head: "tall-hood", back: "placards", weapon: STAFF(), scale: 1.06 })),
    // the Mutant Brute: a hunched bulk with four arms and one star eye
    brute: (ctx) => one(ctx, brute(ctx)),
    // Bat-Winged Imps: little red flyers with pitchforks
    imps: (ctx) => squad(ctx, (v) => imp(ctx, v)),
    // the Grinning Idol: a stone head on an altar, its third eye the gun
    idol: (ctx) => {
      const gaze = side("gaze");
      const gazeT = top("gaze");
      return one(ctx, {
        side: structureSide({ id: "forge.cult.idol", name: ctx.profile.name, spec: ctx.spec, body: side("idol"), plinth: side("altar"), gun: { src: gaze, place: placeAt(gaze, "pivot", { x: -4, y: -104 }) } }),
        top: structureTop({ id: "forge.cult.idol", name: ctx.profile.name, spec: ctx.spec, body: top("idol"), plinth: top("altar"), gun: { src: gazeT, place: placeAt(gazeT, "pivot", { x: 0, y: -26 }, 90) } }),
      });
    },
    // the Screaming Rift (summon-only): a glowing tear in the air with hands grasping out of it
    rift: (ctx) =>
      one(ctx, {
        side: structureSide({ id: "forge.cult.rift", name: ctx.profile.name, spec: { ...ctx.spec, scale: ctx.spec.scale * 1.3 }, ward: side("rift") }),
        top: structureTop({ id: "forge.cult.rift", name: ctx.profile.name, spec: { ...ctx.spec, scale: ctx.spec.scale * 1.3 }, ward: top("rift") }),
      }),
  },
});
