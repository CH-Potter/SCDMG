// Bulwark Brotherhood (Forge template `bulwark`): eight-foot monks in walking bank vaults. Their own
// look, not the generic kit's: rounded strongbox helms with a glowing keyhole visor, vault-door
// chests with a spoked locking wheel, squared shoulder slabs edged in gold, cream robe skirts, a
// team-coloured monk's stole, reliquary packs with two candles burning, and bronze bell-thrusters
// for the Breachers. Old Ironsides is a walking vault with the old brother scowling through a
// porthole; the Hammerhawk is a flying strongbox on bells; the Bastion Battery a vault-chapel.
//
// The reference template for the art agents (docs/minis.md): one file registers it (this one, by
// its folder name), parts live in parts/forge/bulwark/ and parts/forge/bulwark-top/, and every unit
// is built on the generic kits with its own parts swapped in.

import { colourwayOf, defineTemplateArt, humanoidSide, humanoidTop, placeAt, squadLooks, flyerSide, flyerTop, structureSide, structureTop, walkerSide, walkerTop, type ArtContext, type HumanoidOpts, type LookVariant, type UnitArt } from "../../../kits";
import { hexToOklch, numToHex, oklchToHex } from "../../../color";
import type { Colourway } from "../../../slots";

const byName = (g: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(g).map(([p, s]) => [p.slice(p.lastIndexOf("/") + 1, -4), s]));
const SIDE = byName(import.meta.glob<string>("../../../parts/forge/bulwark/*.svg", { query: "?raw", import: "default", eager: true }));
const TOP = byName(import.meta.glob<string>("../../../parts/forge/bulwark-top/*.svg", { query: "?raw", import: "default", eager: true }));
const side = (n: string): string => SIDE[n] ?? fail(`bulwark/${n}`);
const top = (n: string): string => TOP[n] ?? fail(`bulwark-top/${n}`);
function fail(n: string): never {
  throw new Error(`missing Bulwark part ${n}`);
}

/** The Brotherhood's gold, whatever the faction's main colour. */
const GOLD = 0xdcb55a;

/**
 * Vault plate in the faction colour; a deep undersuit of the same hue; Brotherhood gold trim (leather);
 * candle-warm lights; cream robes (paint) with their shade (rivet).
 */
function bulwarkColourway(primary: number): Colourway {
  const base = colourwayOf(primary, GOLD, "plain");
  const p = hexToOklch(base.plate);
  return {
    ...base,
    id: `bulwark-${numToHex(primary).slice(1)}`,
    name: "Brotherhood vault",
    suit: oklchToHex({ l: Math.max(0.2, Math.min(0.3, p.l * 0.45)), c: Math.min(0.06, p.c * 0.55), h: p.h }),
    glow: "#ffe08a",
    fixed: { paint: "#ece2c8", rivet: "#cbbd98", chip: "#d4dade", glowWarm: "#f2a93b" },
  };
}

/** The Brotherhood's shared armour: helm, vault chest, slabs, greaves and sabatons, reliquary pack. */
function brother(ctx: ArtContext, v: LookVariant, o: Partial<HumanoidOpts> & { idTag: string; arms: { side: string; top: string; sideAt: [number, number, number]; topAt: [number, number, number] } }): { side: ReturnType<typeof humanoidSide>; top: ReturnType<typeof humanoidTop> } {
  const [sx, sy, sr] = o.arms.sideAt;
  const [tx, ty, tr] = o.arms.topAt;
  const opts: HumanoidOpts = {
    id: `forge.bulwark.${o.idTag}.${v.tag}`,
    name: ctx.profile.name,
    head: "visor",
    headgear: "none",
    weapon: "rifle",
    back: "pack",
    lean: v.lean,
    aim: v.aim,
    // eight-foot monks: a head taller than a Militia trooper
    scale: 1.22 * (v.leader ? 1.04 : 1),
    padsSide: { front: side("pad-front"), back: side("pad-back") },
    legParts: { shinF: side("shin-front"), shinB: side("shin-back"), bootF: side("boot-front"), bootB: side("boot-back"), width: 9 },
    weaponSide: { src: o.arms.side, place: placeAt(o.arms.side, "g1", { x: sx, y: sy }, sr) },
    weaponTop: { src: o.arms.top, place: placeAt(o.arms.top, "g1", { x: tx, y: ty }, tr) },
    ...o,
    parts: {
      torso: { side: side("torso"), top: top("torso") },
      head: { side: side("helm"), top: top("helm") },
      gear: { side: null, top: null },
      back: { side: side("pack"), top: top("pack") },
      ...o.parts,
    },
  };
  return { side: humanoidSide(opts), top: humanoidTop(opts) };
}

const CARBINE = { side: side("carbine"), top: top("carbine"), sideAt: [39.2, 58.9, 53.13] as [number, number, number], topAt: [-8.5, -24.8, 58] as [number, number, number] };
const MAUL = { side: side("maul"), top: top("maul"), sideAt: [36, 58, 50] as [number, number, number], topAt: [-10, -16, 62] as [number, number, number] };
const LONGRIFLE = { side: side("longrifle"), top: top("longrifle"), sideAt: [40, 60, 48] as [number, number, number], topAt: [-8.5, -24.8, 60] as [number, number, number] };

/** A squad's looks: the leader carries the Lector's standard. */
function squad(ctx: ArtContext, build: (v: LookVariant) => { side: ReturnType<typeof humanoidSide>; top: ReturnType<typeof humanoidTop> }): UnitArt {
  const { variants, pick } = squadLooks(ctx.spec.models);
  return { colourway: ctx.colourway, looks: variants.map(build), ...(variants.length > 1 ? { pick } : {}) };
}

const one = (ctx: ArtContext, look: { side: ReturnType<typeof humanoidSide>; top: ReturnType<typeof humanoidTop> }): UnitArt => ({ colourway: ctx.colourway, looks: [look] });
const LONE: LookVariant = { tag: "a", leader: false, lean: 0, aim: 0 };

export default defineTemplateArt({
  key: "bulwark",
  colourway: (_f, spec) => bulwarkColourway(spec.primary),
  units: {
    // four Brothers: slug carbines; the sergeant carries a standard on his reliquary
    brothers: (ctx) =>
      squad(ctx, (v) =>
        brother(ctx, v, {
          idTag: "brothers",
          arms: CARBINE,
          ...(v.leader ? { parts: { back: { side: side("banner"), top: top("banner") } } } : {}),
        }),
      ),
    // Breachers: the breaching maul, and bell-thrusters on their backs
    breachers: (ctx) => squad(ctx, (v) => brother(ctx, v, { idTag: "breachers", arms: MAUL, lean: v.lean - 4, parts: { back: { side: side("jets"), top: top("jets") } } })),
    // the Long-Watch Marksman: cowled, the long rifle
    marksman: (ctx) => one(ctx, brother(ctx, LONE, { idTag: "marksman", arms: LONGRIFLE, lean: -3, parts: { gear: { side: side("hood"), top: top("hood") } } })),
    // Brother Lector: the bone-masked crested helm, the standard, a ceremonial maul
    chaplain: (ctx) =>
      one(ctx, brother(ctx, { ...LONE, leader: true }, { idTag: "lector", arms: MAUL, parts: { head: { side: side("helm-lector"), top: top("helm-lector") }, back: { side: side("banner"), top: top("banner") } } })),
    // Old Ironsides: a walking vault, twin autocannon and a crusher fist
    ironsides: (ctx) => {
      const spec = { ...ctx.spec, scale: ctx.spec.scale * 1.05 };
      const tw = side("twin-cannon");
      const twTop = top("twin-cannon");
      const fist = side("ironsides-fist");
      const fistTop = top("ironsides-fist");
      return one(ctx, {
        side: walkerSide({
          id: "forge.bulwark.ironsides",
          name: ctx.profile.name,
          spec,
          variant: LONE,
          hull: side("ironsides-hull"),
          gun: { src: tw, place: placeAt(tw, "g1", { x: 18, y: -152 }, 0, 1.05) },
          extras: [{ id: "fist", src: fist, bone: "torso", place: placeAt(fist, "pivot", { x: -38, y: -96 }, 14, 1.1), z: 13 }],
        }),
        top: walkerTop({
          id: "forge.bulwark.ironsides",
          name: ctx.profile.name,
          spec,
          variant: LONE,
          hull: top("ironsides-hull"),
          gun: { src: twTop, place: placeAt(twTop, "g1", { x: 26, y: -10 }, 90, 1.05) },
          extras: [{ id: "fist", src: fistTop, bone: "torso", place: placeAt(fistTop, "pivot", { x: -32, y: -34 }, 0, 1.1), z: 6.5 }],
        }),
      });
    },
    // the Hammerhawk: a flying strongbox on four bell-thrusters, the chin cannon underneath
    gunship: (ctx) => {
      const bell = side("bell");
      const bellTop = top("bell");
      return one(ctx, {
        side: flyerSide({
          id: "forge.bulwark.gunship",
          name: ctx.profile.name,
          spec: ctx.spec,
          variant: LONE,
          hull: side("gunship"),
          engines: false,
          extras: [
            { id: "bell-far", src: bell, bone: "torso", place: placeAt(bell, "pivot", { x: 32, y: -30 }, 0, 1), z: 8 },
            { id: "bell-near", src: bell, bone: "torso", place: placeAt(bell, "pivot", { x: 20, y: -28 }, 0, 1.15), z: 11, anim: { pulse: 0.03, phase: 0.5 } },
            { id: "bell-front", src: bell, bone: "torso", place: placeAt(bell, "pivot", { x: -30, y: -28 }, 0, 1.15), z: 11, anim: { pulse: 0.03 } },
          ],
        }),
        top: flyerTop({
          id: "forge.bulwark.gunship",
          name: ctx.profile.name,
          spec: ctx.spec,
          variant: LONE,
          hull: top("gunship"),
          engines: false,
          extras: [
            { id: "bell-fl", src: bellTop, bone: "torso", place: { x: -34, y: -30, rot: 0 }, z: 4 },
            { id: "bell-fr", src: bellTop, bone: "torso", place: { x: 34, y: -30, rot: 0 }, z: 4 },
            { id: "bell-bl", src: bellTop, bone: "torso", place: { x: -34, y: 34, rot: 0 }, z: 4 },
            { id: "bell-br", src: bellTop, bone: "torso", place: { x: 34, y: 34, rot: 0 }, z: 4 },
          ],
        }),
      });
    },
    // the Bastion Battery: a vault-chapel, its cannon over the door
    battery: (ctx) =>
      one(ctx, {
        side: structureSide({ id: "forge.bulwark.battery", name: ctx.profile.name, spec: ctx.spec, body: side("chapel") }),
        top: structureTop({ id: "forge.bulwark.battery", name: ctx.profile.name, spec: ctx.spec, body: top("chapel") }),
      }),
  },
});
