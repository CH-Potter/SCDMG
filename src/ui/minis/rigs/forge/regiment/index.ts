// 88th Mudfoot Regiment (Forge template `regiment`): a mud-and-trench gunline. Their own look, not the
// generic kit's: round wide-brimmed soup-bowl helmets with chin straps (goggles up or down), long
// muddy greatcoats flared to the knee with split tails, webbing, a team-coloured regimental scarf,
// puttee-wrapped shins and mud-caked boots, a blanket roll over the pack, and the flash rifle with
// its bayonet and glowing cell. The Heavy Gun Team splits into a gunner (the tripod autocannon at the
// hip) and a loader (crates on his back, the shovel); the Sniper Scouts are walking hedges in leaf
// cloaks; Grimsby has a peaked cap, the moustache and the regimental colour; the medics a banded
// helmet, a satchel and a tall lamp-topped pack. The Stomper Tank is a riveted tank on chicken legs,
// the Sky Barge a flying lorry full of helmets, the Mortar Pit a sandbag ring with a pennant.
//
// Built like the Bulwark (docs/minis.md): parts in parts/forge/regiment/ and parts/forge/regiment-top/,
// every unit on the generic kit frames with its own parts swapped in. The trim slot (leather) is the
// unit recipe's own colour, so the scouts' leaves are green, Grimsby's sash and colour red and the
// medics' bands white, while the coats follow the faction colour.

import {
  colourwayOf,
  defineTemplateArt,
  flyerSide,
  flyerTop,
  humanoidSide,
  humanoidTop,
  kitPart,
  placeAt,
  squadLooks,
  structureSide,
  structureTop,
  walkerSide,
  walkerTop,
  type ArtContext,
  type ExtraPart,
  type HeldWeapon,
  type HeldWeaponTop,
  type HumanoidOpts,
  type LookVariant,
  type UnitArt,
} from "../../../kits";
import { hexToOklch, numToHex, oklchToHex } from "../../../color";
import type { Colourway } from "../../../slots";
import type { PartUse, RigDef } from "../../../types";

const byName = (g: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(g).map(([p, s]) => [p.slice(p.lastIndexOf("/") + 1, -4), s]));
const SIDE = byName(import.meta.glob<string>("../../../parts/forge/regiment/*.svg", { query: "?raw", import: "default", eager: true }));
const TOP = byName(import.meta.glob<string>("../../../parts/forge/regiment-top/*.svg", { query: "?raw", import: "default", eager: true }));
const side = (n: string): string => SIDE[n] ?? fail(`regiment/${n}`);
const top = (n: string): string => TOP[n] ?? fail(`regiment-top/${n}`);
function fail(n: string): never {
  throw new Error(`missing Regiment part ${n}`);
}

/**
 * Drab coats in the faction colour; a muddy brown cloth (suit: trousers, gloves, mud) leaning from
 * the faction hue toward earth; the unit's trim colour as webbing, scarves' neighbours and flags
 * (leather); lamp-yellow lights.
 */
function regimentColourway(primary: number, secondary: number): Colourway {
  const base = colourwayOf(primary, secondary, "cap");
  const p = hexToOklch(base.plate);
  // blend the faction hue toward earth brown (about 65 degrees), the short way round the wheel
  const d = ((((65 - p.h) % 360) + 540) % 360) - 180;
  return {
    ...base,
    id: `regiment-${numToHex(primary).slice(1)}-${numToHex(secondary).slice(1)}`,
    name: "Mudfoot drab",
    suit: oklchToHex({ l: Math.max(0.3, Math.min(0.42, p.l * 0.62)), c: Math.min(0.055, 0.025 + p.c * 0.25), h: (p.h + d * 0.65 + 360) % 360 }),
    glow: "#fff2c0",
    fixed: { ...base.fixed, glowWarm: "#f2b84b" },
  };
}

type Rigs = { side: RigDef; top: RigDef };
type Pair = { side: string | null; top: string | null };

const one = (ctx: ArtContext, look: Rigs): UnitArt => ({ colourway: ctx.colourway, looks: [look] });
const squad = (ctx: ArtContext, build: (v: LookVariant) => Rigs): UnitArt => {
  const { variants, pick } = squadLooks(ctx.spec.models);
  return { colourway: ctx.colourway, looks: variants.map(build), ...(variants.length > 1 ? { pick } : {}) };
};
const LONE: LookVariant = { tag: "a", leader: false, lean: 0, aim: 0 };

const LEGS = { shinF: side("shin-front"), shinB: side("shin-back"), kneeF: side("knee-front"), kneeB: side("knee-back"), bootF: side("boot-front"), bootB: side("boot-back") };
const FACE: Pair = { side: kitPart("humanoid", "side", "head-face"), top: kitPart("humanoid", "top", "head-face") };
const pair = (n: string): Pair => ({ side: side(n), top: top(n) });

const GEAR = { plain: pair("helmet"), up: pair("helmet-up"), down: pair("helmet-down"), medic: pair("helmet-medic"), hood: pair("hood-scout") };
const BACK = { pack: pair("pack"), pennant: pair("pack-pennant"), crates: pair("pack-crates"), banner: pair("banner"), medic: pair("medic-pack"), ghillie: pair("ghillie-back") };

/** A long gun held at the port (diagonal across the chest) or levelled to fire. */
function longGun(name: string, levelled: boolean): { side: HeldWeapon; top: HeldWeaponTop } {
  const s = side(name);
  const t = top(name);
  return levelled
    ? { side: { src: s, place: placeAt(s, "g1", { x: 34, y: 76 }, 8) }, top: { src: t, place: placeAt(t, "g1", { x: -6, y: -22 }, 84) } }
    : { side: { src: s, place: placeAt(s, "g1", { x: 39.2, y: 58.9 }, 53.13) }, top: { src: t, place: placeAt(t, "g1", { x: -8.5, y: -24.8 }, 58) } };
}

interface Mudfoot {
  idTag: string;
  head?: Pair;
  gear: Pair;
  torso?: Pair;
  back: Pair;
  arms: { side: HeldWeapon; top: HeldWeaponTop };
  /** Size against the unit's spec scale. */
  size: number;
  extrasSide?: ExtraPart[];
  extrasTop?: ExtraPart[];
}

/** A Mudfooter on the humanoid frame: greatcoat, puttees, boots, gloves, the unit's head, gear and pack. */
function mudfoot(ctx: ArtContext, v: LookVariant, m: Mudfoot): Rigs {
  const opts: HumanoidOpts = {
    id: `forge.regiment.${m.idTag}.${v.tag}`,
    name: ctx.profile.name,
    head: "face",
    headgear: "none",
    weapon: "rifle",
    back: "pack",
    lean: v.lean,
    aim: v.aim,
    scale: ctx.spec.scale * m.size * (v.leader ? 1.04 : 1),
    legParts: LEGS,
    hand: side("hand"),
    weaponSide: m.arms.side,
    weaponTop: m.arms.top,
    ...(m.extrasSide ? { extrasSide: m.extrasSide } : {}),
    ...(m.extrasTop ? { extrasTop: m.extrasTop } : {}),
    parts: {
      torso: m.torso ?? pair("torso"),
      head: m.head ?? FACE,
      gear: m.gear,
      back: m.back,
    },
  };
  return { side: humanoidSide(opts), top: humanoidTop(opts) };
}

// ---------- machines ----------

function tank(ctx: ArtContext): Rigs {
  const gun = side("tank-cannon");
  const gunT = top("tank-cannon");
  const legParts = { knee: side("chicken-knee"), foot: side("chicken-foot"), footTop: top("chicken-foot"), width: { upper: 10, lower: 8 } };
  const common = { id: "forge.regiment.tank", name: ctx.profile.name, spec: ctx.spec, variant: LONE, legParts };
  return {
    side: walkerSide({ ...common, hull: side("tank-hull"), gun: { src: gun, place: placeAt(gun, "g1", { x: -31, y: -142 }, 0) } }),
    top: walkerTop({ ...common, hull: top("tank-hull"), gun: { src: gunT, place: placeAt(gunT, "g1", { x: 0, y: -10 }, 90) } }),
  };
}

function barge(ctx: ArtContext): Rigs {
  const rk = side("rockets");
  const rkT = top("rockets");
  const fan = side("fan");
  const fanT = top("fan");
  const common = { id: "forge.regiment.barge", name: ctx.profile.name, spec: ctx.spec, variant: LONE, engines: false as const };
  const fansTop: PartUse[] = [
    [-38, -36, 0],
    [38, -36, 0.25],
    [-38, 40, 0.5],
    [38, 40, 0.75],
  ].map(([x, y, phase], i) => ({ id: `fan${i}`, src: fanT, bone: "torso" as const, place: { x: x!, y: y!, rot: 0 }, z: 4.5, anim: { spin: 3, phase: phase! } }));
  return {
    side: flyerSide({
      ...common,
      hull: side("barge"),
      gun: { src: rk, place: placeAt(rk, "g1", { x: 8, y: -21 }, 0) },
      extras: [
        { id: "fan-front", src: fan, bone: "torso", place: { x: -43, y: -17, rot: 0 }, z: 11, anim: { pulse: 0.12 } },
        { id: "fan-rear", src: fan, bone: "torso", place: { x: 45, y: -17, rot: 0 }, z: 11, anim: { pulse: 0.12, phase: 0.5 } },
      ],
    }),
    top: flyerTop({ ...common, hull: top("barge"), gun: { src: rkT, place: placeAt(rkT, "g1", { x: 0, y: -60 }, 90) }, extras: fansTop }),
  };
}

function mortar(ctx: ArtContext): Rigs {
  const tube = side("mortar");
  const tubeT = top("mortar");
  const id = "forge.regiment.mortar";
  // a dug-in pit is wide and low: drawn a third bigger so the sandbags fill the 0.9" base
  const spec = { ...ctx.spec, scale: ctx.spec.scale * 1.32 };
  return {
    side: structureSide({
      id,
      name: ctx.profile.name,
      spec,
      body: side("sandbags"),
      plinth: null,
      gun: { src: tube, place: placeAt(tube, "g1", { x: 4, y: -30 }, 52) },
      extras: [
        { id: "crate", src: side("crate"), bone: "torso", z: 7 },
        { id: "flag", src: side("flag"), bone: "torso", z: 4, anim: { pulse: 0.04 } },
      ],
    }),
    top: structureTop({
      id,
      name: ctx.profile.name,
      spec,
      body: top("sandbags"),
      plinth: null,
      gun: { src: tubeT, place: placeAt(tubeT, "g1", { x: -4, y: 8 }, 90) },
      extras: [
        { id: "crate", src: top("crate"), bone: "torso", z: 5.5 },
        { id: "flag", src: top("flag"), bone: "torso", z: 7, anim: { pulse: 0.05 } },
      ],
    }),
  };
}

export default defineTemplateArt({
  key: "regiment",
  colourway: (_f, spec) => regimentColourway(spec.primary, spec.secondary),
  units: {
    // eight Line Troopers: the corporal with goggles up and the company pennant; rifles at the port;
    // rifles levelled, goggles down
    troopers: (ctx) =>
      squad(ctx, (v) =>
        mudfoot(ctx, v, {
          idTag: "troopers",
          gear: v.leader ? GEAR.up : v.tag === "b" ? GEAR.down : GEAR.plain,
          back: v.leader ? BACK.pennant : BACK.pack,
          arms: longGun("flash-rifle", v.tag === "b"),
          size: 1.04,
        }),
      ),
    // the Heavy Gun Team: the gunner with the tripod autocannon at the hip, the loader with the crates and the shovel
    heavy: (ctx) =>
      squad(ctx, (v) => {
        if (v.tag === "b") return mudfoot(ctx, v, { idTag: "heavy", gear: GEAR.up, back: BACK.crates, arms: longGun("shovel", false), size: 1.04 });
        const ac = side("autocannon");
        const acT = top("autocannon");
        return mudfoot(ctx, v, {
          idTag: "heavy",
          gear: GEAR.plain,
          back: BACK.pack,
          arms: { side: { src: ac, place: placeAt(ac, "g1", { x: 40, y: 92 }, 12) }, top: { src: acT, place: placeAt(acT, "g1", { x: -10, y: -12 }, 80) } },
          size: 1.06,
        });
      }),
    // Sniper Scouts: walking hedges, the scoped long rifle at the port or aimed
    scouts: (ctx) =>
      squad(ctx, (v) =>
        mudfoot(ctx, v, {
          idTag: "scouts",
          gear: GEAR.hood,
          torso: pair("torso-scout"),
          back: BACK.ghillie,
          arms: longGun("long-rifle", v.tag === "b"),
          size: 1.02,
        }),
      ),
    // Sergeant-Major Grimsby: peaked cap and moustache, the regimental colour, pistol and swagger stick
    sergeant: (ctx) => {
      const pistol = side("pistol");
      const pistolT = top("pistol");
      return one(
        ctx,
        mudfoot(ctx, { ...LONE, leader: true }, {
          idTag: "sergeant",
          head: pair("head-grimsby"),
          gear: { side: null, top: null },
          torso: pair("torso-sgt"),
          back: BACK.banner,
          arms: {
            side: { src: pistol, place: placeAt(pistol, "g1", { x: 32, y: 78 }, -8), armB: { hand: side("swagger"), at: { x: 68, y: 96 }, to: "torso", rot: 28 } },
            top: { src: pistolT, place: placeAt(pistolT, "g1", { x: -13, y: -16 }, 90), armR: { hand: top("swagger"), at: { x: 13, y: -8 }, to: "torso", rot: 160 } },
          },
          size: 1.12,
        }),
      );
    },
    // Field Medics: banded helmets, the satchel, the tall lamp-topped pack, bonesaw and bandage
    medic: (ctx) => {
      const saw = side("bonesaw");
      const sawT = top("bonesaw");
      return squad(ctx, (v) =>
        mudfoot(ctx, v, {
          idTag: "medic",
          gear: GEAR.medic,
          back: BACK.medic,
          arms: {
            side: { src: saw, place: placeAt(saw, "g1", { x: 36, y: 86 }, -24), armB: { hand: side("bandage"), at: { x: 64, y: 86 }, to: "torso" } },
            top: { src: sawT, place: placeAt(sawT, "g1", { x: -13, y: -15 }, 90), armR: { hand: top("bandage"), at: { x: 13, y: -10 }, to: "torso" } },
          },
          size: 1.02,
          extrasSide: [{ id: "satchel", src: side("satchel"), bone: "torso", z: 10.5 }],
          extrasTop: [{ id: "satchel", src: top("satchel"), bone: "torso", z: 5.5 }],
        }),
      );
    },
    tank: (ctx) => one(ctx, tank(ctx)),
    barge: (ctx) => one(ctx, barge(ctx)),
    mortar: (ctx) => one(ctx, mortar(ctx)),
  },
});
