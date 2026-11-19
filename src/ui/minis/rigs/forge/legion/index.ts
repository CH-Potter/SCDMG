// Tin Can Legion (Forge template `legion`): marching tin-toy robots. Their own look, not the generic
// kit's: rolled tin-can bodies with brass bands and a bellows waist, dome heads with one porthole
// eye (or twin lens tubes) and a ball-tipped antenna, team-painted ball shoulders, boxy block feet,
// ring-stacked zap rifles, and a brass wind-up key in every trooper's back. The Scuttlers are lidded
// tins on crab legs, the Heavies walking boilers with a beam arm and a crusher claw, the drones flying
// toolboxes, the Overseer a crowned can with epaulettes and a sceptre; the Crusher Walker is a
// factory on stamp feet, the Hover Reaper a mower with a spinning blade disc, the Pylon a tesla tower.
//
// Built like the Bulwark (docs/minis.md): parts in parts/forge/legion/ and parts/forge/legion-top/,
// every unit on the generic kit frames with its own parts swapped in.

import {
  beastSide,
  beastTop,
  colourwayOf,
  defineTemplateArt,
  flyerSide,
  flyerTop,
  humanoidSide,
  humanoidTop,
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
import { lightOf, numToHex } from "../../../color";
import type { Colourway } from "../../../slots";
import type { PartUse, RigDef } from "../../../types";

const byName = (g: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(g).map(([p, s]) => [p.slice(p.lastIndexOf("/") + 1, -4), s]));
const SIDE = byName(import.meta.glob<string>("../../../parts/forge/legion/*.svg", { query: "?raw", import: "default", eager: true }));
const TOP = byName(import.meta.glob<string>("../../../parts/forge/legion-top/*.svg", { query: "?raw", import: "default", eager: true }));
const side = (n: string): string => SIDE[n] ?? fail(`legion/${n}`);
const top = (n: string): string => TOP[n] ?? fail(`legion-top/${n}`);
function fail(n: string): never {
  throw new Error(`missing Legion part ${n}`);
}

/** The Legion's brass trim, whatever the faction's main colour. */
const BRASS = 0xc89b4a;

/**
 * Tin plate in the faction colour; a dark bellows cloth of the same hue; brass trim (leather); eyes
 * and ray rings in the recipe's glow colour (a paler core, the recipe colour as the warm glow); cream
 * enamel dials (paint).
 */
function legionColourway(primary: number, glow: number): Colourway {
  const base = colourwayOf(primary, BRASS, "plain");
  const g = numToHex(glow);
  return {
    ...base,
    id: `legion-${numToHex(primary).slice(1)}-${g.slice(1)}`,
    name: "Tin Can Legion",
    glow: lightOf(g, 0.1),
    fixed: { paint: "#efe8d4", rivet: "#d2c7a8", chip: "#e2e7eb", glowWarm: g },
  };
}

type Rigs = { side: RigDef; top: RigDef };

const one = (ctx: ArtContext, look: Rigs): UnitArt => ({ colourway: ctx.colourway, looks: [look] });
const squad = (ctx: ArtContext, build: (v: LookVariant) => Rigs): UnitArt => {
  const { variants, pick } = squadLooks(ctx.spec.models);
  return { colourway: ctx.colourway, looks: variants.map(build), ...(variants.length > 1 ? { pick } : {}) };
};
const LONE: LookVariant = { tag: "a", leader: false, lean: 0, aim: 0 };

// ---------- the clank frame: tin can, bellows, ball joints, block feet, the wind-up key ----------

const LEGS = { shinF: side("shin-front"), shinB: side("shin-back"), kneeF: side("knee-front"), kneeB: side("knee-back"), bootF: side("boot-front"), bootB: side("boot-back"), width: 8 };
const BALLS = { front: side("pad-front"), back: side("pad-back") };

/** The wind-up key's bow on the back, turning (side), and lying behind the shaft (top). */
const keySide = (at: { x: number; y: number }, phase: number): ExtraPart => ({ id: "key", src: side("key"), bone: "torso", z: 0.5, place: { x: at.x, y: at.y, rot: 0 }, anim: { spin: 1, phase } });
const keyTop = (y: number, phase: number): ExtraPart => ({ id: "key", src: top("key"), bone: "torso", z: 0.5, place: { x: 0, y, rot: 0, scale: 0.9 }, anim: { spin: 1, phase } });

const RIFLE_SIDE: HeldWeapon = { src: side("zap-rifle"), place: placeAt(side("zap-rifle"), "g1", { x: 39.2, y: 58.9 }, 53.13) };
const RIFLE_TOP: HeldWeaponTop = { src: top("zap-rifle"), place: placeAt(top("zap-rifle"), "g1", { x: -8.5, y: -24.8 }, 58) };

interface Robot {
  idTag: string;
  head: { side: string; top: string };
  torso?: { side: string; top: string };
  back?: { side: string | null; top: string | null };
  weaponSide: HeldWeapon;
  weaponTop: HeldWeaponTop;
  scale: number;
  pads?: { front: string; back: string };
  /** Key bow position (side frame coords) and its distance behind the shoulders (top); null for none. */
  key?: { side: { x: number; y: number }; top: number } | null;
  extrasSide?: ExtraPart[];
  extrasTop?: ExtraPart[];
  legWidth?: number;
}

/** A Legion robot on the humanoid frame. */
function robot(ctx: ArtContext, v: LookVariant, r: Robot): Rigs {
  const phase = v.tag === "b" ? 0.5 : v.tag === "lead" ? 0.25 : 0;
  const key = r.key === undefined ? { side: { x: 96, y: 80 }, top: 21 } : r.key;
  const opts: HumanoidOpts = {
    id: `forge.legion.${r.idTag}.${v.tag}`,
    name: ctx.profile.name,
    head: "visor",
    headgear: "none",
    weapon: "rifle",
    back: "pack",
    lean: v.lean,
    aim: v.aim,
    scale: r.scale,
    padsSide: r.pads ?? BALLS,
    legParts: { ...LEGS, width: r.legWidth ?? LEGS.width },
    weaponSide: r.weaponSide,
    weaponTop: r.weaponTop,
    extrasSide: [...(key ? [keySide(key.side, phase)] : []), ...(r.extrasSide ?? [])],
    extrasTop: [...(key ? [keyTop(key.top, phase)] : []), ...(r.extrasTop ?? [])],
    parts: {
      torso: r.torso ?? { side: side("torso"), top: top("torso") },
      head: r.head,
      gear: { side: null, top: null },
      back: r.back ?? { side: side("back-key"), top: top("back-key") },
    },
  };
  return { side: humanoidSide(opts), top: humanoidTop(opts) };
}

const HEAD = {
  one: { side: side("head-one"), top: top("head-one") },
  two: { side: side("head-two"), top: top("head-two") },
  tall: { side: side("head-tall"), top: top("head-tall") },
  crown: { side: side("head-crown"), top: top("head-crown") },
  heavy: { side: side("head-heavy"), top: top("head-heavy") },
};

// ---------- the Lumbering Heavies: boilers with a beam arm and a crusher claw ----------

function heavy(ctx: ArtContext, v: LookVariant): Rigs {
  const beam = side("beam-cannon");
  const beamT = top("beam-cannon");
  const stacks = v.tag !== "b";
  return robot(ctx, v, {
    idTag: "heavies",
    head: HEAD.heavy,
    torso: { side: side("torso-heavy"), top: top("torso-heavy") },
    back: stacks ? { side: side("stacks"), top: top("stacks") } : { side: side("back-key"), top: top("back-key") },
    key: stacks ? null : { side: { x: 97, y: 80 }, top: 22 },
    // the beam arm rides the far arm, slung low across the hips; the near arm swings the claw
    weaponSide: { src: beam, place: placeAt(beam, "g1", { x: 70, y: 90 }, 6), armB: { grip: "g1" }, armF: { hand: side("claw"), at: { x: 34, y: 96 }, to: "torso", rot: -6 } },
    weaponTop: { src: beamT, place: placeAt(beamT, "g1", { x: 13, y: -12 }, 84), armR: { grip: "g1" }, armL: { hand: top("claw"), at: { x: -15, y: -16 }, to: "torso" } },
    scale: 1.34,
    legWidth: 10,
  });
}

// ---------- machines ----------

function drone(ctx: ArtContext, v: LookVariant): Rigs {
  const spec = { ...ctx.spec, scale: 0.8 };
  const weld = side("weld-arm");
  const weldT = top("weld-arm");
  const rotor = side("rotor");
  const id = `forge.legion.drones.${v.tag}`;
  const common = { id, name: ctx.profile.name, spec, variant: v, engines: false as const };
  return {
    side: flyerSide({
      ...common,
      hull: side("drone"),
      gun: { src: weld, place: placeAt(weld, "g1", { x: -16, y: -31 }, -38 + v.aim * 0.8) },
      extras: [{ id: "rotor", src: rotor, bone: "torso", place: { x: 1, y: -93, rot: 90 }, z: 11, anim: { flap: 0.85, phase: v.tag === "b" ? 0.5 : 0 } }],
    }),
    top: flyerTop({
      ...common,
      hull: top("drone"),
      gun: { src: weldT, place: placeAt(weldT, "g1", { x: 8, y: -16 }, 90 + v.aim * 0.4) },
      extras: [{ id: "rotor", src: top("rotor"), bone: "torso", place: { x: 0, y: -2, rot: 0 }, z: 7, anim: { spin: 3, phase: v.tag === "b" ? 0.5 : 0 } }],
    }),
  };
}

function crusher(ctx: ArtContext): Rigs {
  const dish = side("dish");
  const dishT = top("dish");
  const legParts = { knee: side("bolt-knee"), foot: side("stamp"), footTop: top("stamp"), width: { upper: 15, lower: 17 } };
  const common = { id: "forge.legion.crusher", name: ctx.profile.name, spec: ctx.spec, variant: LONE, legParts };
  return {
    side: walkerSide({ ...common, hull: side("crusher-hull"), gun: { src: dish, place: placeAt(dish, "g1", { x: -36, y: -136 }, 0, 1.1) } }),
    top: walkerTop({ ...common, hull: top("crusher-hull"), gun: { src: dishT, place: placeAt(dishT, "g1", { x: -22, y: -26 }, 90, 1.1) } }),
  };
}

function reaper(ctx: ArtContext): Rigs {
  const sweep = side("sweep");
  const sweepT = top("sweep");
  const common = { id: "forge.legion.reaper", name: ctx.profile.name, spec: ctx.spec, variant: LONE, engines: false as const };
  return {
    side: flyerSide({
      ...common,
      hull: side("reaper-hull"),
      gun: { src: sweep, place: placeAt(sweep, "g1", { x: -32, y: -39 }, 0) },
      extras: [{ id: "disc", src: side("blade-disc"), bone: "torso", place: { x: 2, y: -30, rot: 0 }, z: 9.5 }],
    }),
    top: flyerTop({
      ...common,
      hull: top("reaper-hull"),
      gun: { src: sweepT, place: placeAt(sweepT, "g1", { x: 0, y: -38 }, 90, 0.8) },
      extras: [{ id: "disc", src: top("blade-disc"), bone: "torso", place: { x: 0, y: -2, rot: 0 }, z: 4, anim: { spin: 4 } }],
    }),
  };
}

function pylon(ctx: ArtContext): Rigs {
  const coil = side("zap-coil");
  const coilT = top("zap-coil");
  const ring = side("coil-ring");
  const ringT = top("coil-ring");
  const rings = (view: "side" | "top"): PartUse[] =>
    [
      [-62, 1.15, 0],
      [-96, 0.95, 0.33],
      [-128, 0.78, 0.66],
    ].map(([y, k, phase], i) => ({
      id: `ring${i}`,
      src: view === "side" ? ring : ringT,
      bone: "torso" as const,
      // from above the rings nest inside the drum's team-painted flanks
      place: view === "side" ? placeAt(ring, "pivot", { x: 0, y: y! }, 0, k) : { x: 0, y: 0, rot: 0, scale: k! * 0.78 },
      z: 6.5 + i * 0.1,
      anim: { pulse: 0.07, phase: phase! },
    }));
  const id = "forge.legion.pylon";
  return {
    side: structureSide({ id, name: ctx.profile.name, spec: ctx.spec, body: side("pylon"), gun: { src: coil, place: placeAt(coil, "g1", { x: 0, y: -164 }, 90) }, extras: rings("side") }),
    top: structureTop({ id, name: ctx.profile.name, spec: ctx.spec, body: top("pylon"), gun: { src: coilT, place: placeAt(coilT, "g1", { x: 0, y: 0 }, 90) }, extras: rings("top") }),
  };
}

function scuttler(ctx: ArtContext, v: LookVariant): Rigs {
  const id = `forge.legion.scuttlers.${v.tag}`;
  const tail = v.leader ? side("scuttler-tail-flag") : side("scuttler-tail");
  return {
    side: beastSide({ id, name: ctx.profile.name, spec: ctx.spec, variant: v, parts: { body: side("scuttler-body"), head: side("scuttler-head"), tail, gear: null } }),
    top: beastTop({ id, name: ctx.profile.name, spec: ctx.spec, variant: v, parts: { body: top("scuttler-body"), head: top("scuttler-head"), tail: top("scuttler-tail"), gear: null } }),
  };
}

export default defineTemplateArt({
  key: "legion",
  colourway: (_f, spec) => legionColourway(spec.primary, spec.secondary),
  units: {
    // eight Clank Troopers in step: the sergeant's tall pennant head, porthole-eyed and lens-eyed ranks
    clankers: (ctx) =>
      squad(ctx, (v) =>
        robot(ctx, v, {
          idTag: "clankers",
          head: v.leader ? HEAD.tall : v.tag === "b" ? HEAD.two : HEAD.one,
          weaponSide: RIFLE_SIDE,
          weaponTop: RIFLE_TOP,
          scale: v.leader ? 1.04 : 1,
        }),
      ),
    // Scuttlers: lidded tins on crab legs, one eye, snipping pincers
    scuttlers: (ctx) => squad(ctx, (v) => scuttler(ctx, v)),
    // Lumbering Heavies: walking boilers; one keeps its smokestacks, the other its giant key
    heavies: (ctx) => squad(ctx, (v) => heavy(ctx, v)),
    // Repair Drones: flying toolboxes with a rotor and a welding arm
    drones: (ctx) => squad(ctx, (v) => drone(ctx, v)),
    // the Overseer: a taller can in a brass crown and epaulettes, a short cape, the sceptre
    overseer: (ctx) => {
      const sc = side("sceptre");
      const scT = top("sceptre");
      return one(
        ctx,
        robot(ctx, { ...LONE, leader: true }, {
          idTag: "overseer",
          head: HEAD.crown,
          torso: { side: side("torso"), top: top("torso-overseer") },
          back: { side: side("cape"), top: top("cape") },
          pads: { front: side("epaulette-front"), back: side("epaulette-back") },
          key: { side: { x: 101, y: 78 }, top: 20 },
          weaponSide: { src: sc, place: placeAt(sc, "g1", { x: 40, y: 66 }, 82) },
          weaponTop: { src: scT, place: placeAt(scT, "g1", { x: -13, y: -14 }, 82) },
          scale: 1.2,
        }),
      );
    },
    crusher: (ctx) => one(ctx, crusher(ctx)),
    reaper: (ctx) => one(ctx, reaper(ctx)),
    pylon: (ctx) => one(ctx, pylon(ctx)),
  },
});
