// Veilwalker Kin (Forge template `kin`): very tall, serene people in long porcelain robes. Their own
// look: smooth porcelain masks with a single glowing crescent eye, swept-back pointed hoods, lotus-petal
// pauldrons in crystal-ceramic (the faction colour), violet trim, a team stole hanging to the hem, and
// little crystal shards floating over the shoulder. Wardens carry slender crossbow-like needle casters,
// Mirror Dancers twin glass swords and a crown of mirror shards, the Star Oracle a crescent rune staff
// under a floating ring of stars. Glide Riders surf on leaf-shaped hover-blades; the Starhawk is a
// seed-shaped fighter with swept vanes; the Crystal Colossus is a faceted stone statue bristling with
// crystal, its old ghost glowing in a lantern head; the Veil Arch two crystal horns round a curtain of light.

import { colourwayOf, defineTemplateArt, flyerSide, flyerTop, humanoidSide, humanoidTop, placeAt, squadLooks, structureSide, structureTop, walkerSide, walkerTop, type ArtContext, type ExtraPart, type HumanoidOpts, type LookVariant, type UnitArt } from "../../../kits";
import { hexToOklch, numToHex, oklchToHex } from "../../../color";
import type { Colourway } from "../../../slots";
import type { PartUse, RigDef } from "../../../types";

const byName = (g: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(g).map(([p, s]) => [p.slice(p.lastIndexOf("/") + 1, -4), s]));
const SIDE = byName(import.meta.glob<string>("../../../parts/forge/kin/*.svg", { query: "?raw", import: "default", eager: true }));
const TOP = byName(import.meta.glob<string>("../../../parts/forge/kin-top/*.svg", { query: "?raw", import: "default", eager: true }));
const side = (n: string): string => SIDE[n] ?? fail(`kin/${n}`);
const top = (n: string): string => TOP[n] ?? fail(`kin-top/${n}`);
function fail(n: string): never {
  throw new Error(`missing Kin part ${n}`);
}

/** The Kin's violet trim, whatever the faction's main colour. */
const VIOLET = 0x9b7be0;

/**
 * Crystal-ceramic plate in the faction colour; a deep robe-lining of the same hue (suit); violet trim
 * (leather); pale pewter (metal); porcelain masks and robes (paint) with their shade (rivet); cyan light.
 */
function kinColourway(primary: number): Colourway {
  const base = colourwayOf(primary, VIOLET, "crystal");
  const p = hexToOklch(base.plate);
  return {
    ...base,
    id: `kin-${numToHex(primary).slice(1)}`,
    name: "Veilwalker porcelain",
    suit: oklchToHex({ l: Math.max(0.22, Math.min(0.32, p.l * 0.42)), c: Math.min(0.07, p.c * 0.6), h: p.h }),
    metal: oklchToHex({ l: 0.66, c: Math.min(0.03, p.c * 0.3), h: p.h }),
    glow: "#c8fbff",
    fixed: { paint: "#efe9dc", rivet: "#cdc4b2", chip: "#e6f6f8", glowWarm: "#7fd8e6" },
  };
}

type Look = { side: RigDef; top: RigDef };
type Held = Pick<HumanoidOpts, "weaponSide" | "weaponTop">;

const CASTER: Held = (() => {
  const s = side("caster");
  const t = top("caster");
  return { weaponSide: { src: s, place: placeAt(s, "g1", { x: 41, y: 64 }, 16) }, weaponTop: { src: t, place: placeAt(t, "g1", { x: -8.5, y: -24.8 }, 62) } };
})();

const BLADES: Held = (() => {
  const s = side("glassblade");
  const t = top("glassblade");
  return {
    weaponSide: { src: s, place: placeAt(s, "g1", { x: 46, y: 78 }, 50), armB: { hand: side("blade-off"), at: { x: 70, y: 96 }, to: "torso", rot: 205 } },
    weaponTop: { src: t, place: placeAt(t, "g1", { x: -10, y: -14 }, 70), armR: { hand: top("blade-off"), at: { x: 13, y: -9 }, to: "torso", rot: 112 } },
  };
})();

const STAFF: Held = (() => {
  const s = side("staff");
  const t = top("staff");
  return { weaponSide: { src: s, place: placeAt(s, "g1", { x: 40, y: 66 }, 82) }, weaponTop: { src: t, place: placeAt(t, "g1", { x: -13, y: -14 }, 82) } };
})();

/** A shard floating over the back shoulder (its own phase, so a squad's shards don't bob together). */
function shards(phase: number): { s: ExtraPart[]; t: ExtraPart[] } {
  const sh = side("shard");
  return {
    s: [{ id: "shard", src: sh, bone: "torso", z: 18.6, place: placeAt(sh, "pivot", { x: 84, y: 48 }, 14), anim: { float: 3, phase } }],
    t: [{ id: "shard", src: sh, bone: "torso", z: 7, place: placeAt(sh, "pivot", { x: 17, y: 9 }, 30, 0.8), anim: { float: 2, phase } }],
  };
}

interface KinOpts extends Partial<HumanoidOpts> {
  idTag: string;
  held: Held;
  /** Head: hooded mask, bare mask with hair, or the Oracle's tall hood. */
  face?: "mask" | "mask-bare" | "oracle-head";
  torsoName?: "torso" | "torso-dancer";
  /** Extra size on top of the Kin's height. */
  size?: number;
  shard?: number | null;
}

/** One Kin figure: the shared slim greaves and slippers, lotus pauldrons, the robe and the mask. */
function kin(ctx: ArtContext, v: LookVariant, o: KinOpts): Look {
  const face = o.face ?? "mask";
  const torso = o.torsoName ?? "torso";
  const sh = o.shard === null ? null : shards(o.shard ?? 0);
  const opts: HumanoidOpts = {
    id: `forge.kin.${o.idTag}.${v.tag}`,
    name: ctx.profile.name,
    head: "gem",
    headgear: "none",
    weapon: "rifle",
    back: "none",
    lean: v.lean,
    aim: v.aim,
    // a head taller than a Militia trooper, and slender
    scale: ctx.spec.scale * 1.18 * (o.size ?? 1) * (v.leader ? 1.04 : 1),
    padsSide: { front: side("pad-front"), back: side("pad-back") },
    legParts: { shinF: side("shin-front"), shinB: side("shin-back"), bootF: side("boot-front"), bootB: side("boot-back"), width: 6.4 },
    ...o.held,
    ...o,
    extrasSide: [...(sh?.s ?? []), ...(o.extrasSide ?? [])],
    extrasTop: [...(sh?.t ?? []), ...(o.extrasTop ?? [])],
    parts: {
      torso: { side: side(torso), top: top(torso) },
      head: { side: side(face), top: top(face) },
      gear: { side: null, top: null },
      back: { side: null, top: null },
      ...o.parts,
    },
  };
  return { side: humanoidSide(opts), top: humanoidTop(opts) };
}

function squad(ctx: ArtContext, build: (v: LookVariant) => Look): UnitArt {
  const { variants, pick } = squadLooks(ctx.spec.models);
  return { colourway: ctx.colourway, looks: variants.map(build), ...(variants.length > 1 ? { pick } : {}) };
}

const one = (ctx: ArtContext, look: Look): UnitArt => ({ colourway: ctx.colourway, looks: [look] });
const LONE: LookVariant = { tag: "a", leader: false, lean: 0, aim: 0 };

const STANDARD = { side: side("standard"), top: top("standard") };

/** The mirror-shard crown, fanned behind a Dancer's head. */
const crown = (): Pick<KinOpts, "extrasSide" | "extrasTop"> => ({
  extrasSide: [{ id: "crown", src: side("mirror-crown"), bone: "head", z: 18.8 }],
  extrasTop: [{ id: "crown", src: top("mirror-crown"), bone: "head", z: 5.5 }],
});

export default defineTemplateArt({
  key: "kin",
  colourway: (_f, spec) => kinColourway(spec.primary),
  units: {
    // Starblade Wardens: needle casters; the leader carries the crystal standard, the others hood up or down
    wardens: (ctx) =>
      squad(ctx, (v) =>
        v.leader
          ? kin(ctx, v, { idTag: "wardens", held: CASTER, shard: null, parts: { back: STANDARD } })
          : kin(ctx, v, { idTag: "wardens", held: CASTER, face: v.tag === "b" ? "mask-bare" : "mask", shard: v.tag === "b" ? 0.55 : 0.1 }),
      ),
    // Mirror Dancers: twin glassblades, ribbons, the mirror-shard crown; leaning, mid-pirouette stances
    dancers: (ctx) =>
      squad(ctx, (v) =>
        kin(ctx, v, {
          idTag: "dancers",
          held: BLADES,
          torsoName: "torso-dancer",
          face: v.tag === "b" ? "mask" : "mask-bare",
          shard: null,
          lean: v.leader ? -10 : v.tag === "a" ? -14 : 6,
          aim: v.tag === "b" ? 24 : v.aim,
          ...(v.tag === "b" ? {} : crown()),
        }),
      ),
    // Glide Riders: a rider standing on a leaf-shaped hover-blade, the prism lance levelled
    skimmers: (ctx) => {
      const spec = { ...ctx.spec, scale: ctx.spec.scale * 1.6 };
      const lance = side("lance");
      const lanceTop = top("lance");
      return squad(ctx, (v) => ({
        side: flyerSide({ id: `forge.kin.skimmers.${v.tag}`, name: ctx.profile.name, spec, variant: v, hull: side("skimmer"), engines: false, gun: { src: lance, place: placeAt(lance, "g1", { x: -32, y: -88 }, -6 + v.aim * 0.6) } }),
        top: flyerTop({ id: `forge.kin.skimmers.${v.tag}`, name: ctx.profile.name, spec, variant: v, hull: top("skimmer"), engines: false, gun: { src: lanceTop, place: placeAt(lanceTop, "g1", { x: -12, y: -20 }, 84 + v.aim * 0.3) } }),
      }));
    },
    // the Star Oracle: the tallest Kin, a towering hood, a floating ring of stars, the crescent rune staff
    oracle: (ctx) => {
      const halo = side("halo");
      return one(
        ctx,
        kin(ctx, { ...LONE, leader: true }, {
          idTag: "oracle",
          held: STAFF,
          face: "oracle-head",
          size: 1.06,
          shard: 0.3,
          extrasSide: [{ id: "halo", src: halo, bone: "head", z: 19.6, place: placeAt(halo, "pivot", { x: 67, y: 16 }, -6), anim: { float: 2.4, phase: 0.5 } }],
          extrasTop: [{ id: "halo", src: top("halo"), bone: "head", z: 7.5, place: { x: 0, y: -2, rot: 0 }, anim: { float: 1.5, phase: 0.5 } }],
        }),
      );
    },
    // the Crystal Colossus: a walking geode statue, the prism cannon for a near arm, a glass fist behind
    colossus: (ctx) => {
      const spec = { ...ctx.spec, scale: 0.94 };
      const cannon = side("colossus-cannon");
      const cannonTop = top("colossus-cannon");
      const fist = side("colossus-fist");
      const fistTop = top("colossus-fist");
      const legParts = { knee: side("colossus-knee"), foot: side("colossus-foot"), footTop: top("colossus-foot"), width: { upper: 12, lower: 16 } };
      return one(ctx, {
        side: walkerSide({
          id: "forge.kin.colossus",
          name: ctx.profile.name,
          spec,
          variant: LONE,
          hull: side("colossus-hull"),
          legParts,
          gun: { src: cannon, place: placeAt(cannon, "g1", { x: -34, y: -128 }, -6, 1.1) },
          extras: [{ id: "fist", src: fist, bone: "torso", place: placeAt(fist, "pivot", { x: 38, y: -84 }, -14, 1.1), z: 9 }],
        }),
        top: walkerTop({
          id: "forge.kin.colossus",
          name: ctx.profile.name,
          spec,
          variant: LONE,
          hull: top("colossus-hull"),
          legParts,
          gun: { src: cannonTop, place: placeAt(cannonTop, "g1", { x: -42, y: -2 }, 90, 1.1) },
          extras: [{ id: "fist", src: fistTop, bone: "torso", place: placeAt(fistTop, "pivot", { x: 44, y: -14 }, 0, 1.1), z: 6.5 }],
        }),
      });
    },
    // the Starhawk: a seed-shaped fighter, swept vanes, twin star lances under the nose
    starhawk: (ctx) => {
      const spec = { ...ctx.spec, scale: ctx.spec.scale * 1.08 };
      const g = side("lances");
      const gt = top("lances");
      return one(ctx, {
        side: flyerSide({ id: "forge.kin.starhawk", name: ctx.profile.name, spec, variant: LONE, hull: side("starhawk"), engines: false, gun: { src: g, place: placeAt(g, "g1", { x: -22, y: -36 }, 0) } }),
        top: flyerTop({ id: "forge.kin.starhawk", name: ctx.profile.name, spec, variant: LONE, hull: top("starhawk"), engines: false, gun: { src: gt, place: placeAt(gt, "g1", { x: 0, y: -26 }, 90) } }),
      });
    },
    // the Veil Arch: two crystal horns over a porcelain step, a shimmering veil between them, shards adrift
    arch: (ctx) => {
      const sh = side("shard");
      const spec = { ...ctx.spec, scale: ctx.spec.scale * 1.2 };
      const drift = (view: "side" | "top"): PartUse[] =>
        view === "side"
          ? [
              { id: "veil", src: side("veil"), bone: "torso", z: 4.5, anim: { pulse: 0.04 } },
              { id: "apex", src: sh, bone: "head", z: 6, place: placeAt(sh, "pivot", { x: 0, y: -142 }, 0, 1.4), anim: { float: 3, phase: 0.25 } },
              { id: "shard-l", src: sh, bone: "head", z: 6, place: placeAt(sh, "pivot", { x: -40, y: -128 }, -10), anim: { float: 4 } },
              { id: "shard-r", src: sh, bone: "head", z: 6, place: placeAt(sh, "pivot", { x: 42, y: -118 }, 12, 0.8), anim: { float: 4, phase: 0.5 } },
            ]
          : [
              { id: "apex", src: sh, bone: "head", z: 6.5, place: placeAt(sh, "pivot", { x: 0, y: -4 }, 0, 1.2), anim: { float: 2, phase: 0.25 } },
              { id: "shard-l", src: sh, bone: "head", z: 6, place: placeAt(sh, "pivot", { x: -22, y: -14 }, 0, 0.8), anim: { float: 2 } },
              { id: "shard-r", src: sh, bone: "head", z: 6, place: placeAt(sh, "pivot", { x: 22, y: 14 }, 0, 0.8), anim: { float: 2, phase: 0.5 } },
            ];
      return one(ctx, {
        side: structureSide({ id: "forge.kin.arch", name: ctx.profile.name, spec, body: side("arch"), plinth: null, gun: null, extras: drift("side") }),
        top: structureTop({ id: "forge.kin.arch", name: ctx.profile.name, spec, body: top("arch"), plinth: null, gun: null, extras: drift("top") }),
      });
    },
  },
});
