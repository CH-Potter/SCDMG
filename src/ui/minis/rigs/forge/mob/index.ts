// Scrapjaw Mob (Forge template `mob`): squat, barrel-bellied green brutes whose signature is a
// bolted-on iron jaw with a square underbite. Everything they wear was something else first: a
// cooking pot or a bucket for a helmet, a traffic cone for a hat, a hubcap for a pauldron, an
// octagonal road sign sharpened into a cleaver, a blunderbuss of taped pipes. Hazard-stripe orange
// trim on rusty scrap, whatever the faction's green. The boss wears a rebar-horned pot and a trophy
// pole; Gutrot a rebar crown, an engine-block hammer and a pole of looted helmets; the Tinker a
// crate with a sparking coil. The Junk Giant is a bus stood on end with a fridge for a chest and a
// statue of somebody's nan for a head; the Whirlybasher a half-barrel tub under one big rotor.
//
// Built on the generic kits (docs/minis.md), with the Mob's own parts in parts/forge/mob/ and
// parts/forge/mob-top/.

import { colourwayOf, defineTemplateArt, flyerSide, flyerTop, humanoidSide, humanoidTop, placeAt, riderSide, riderTop, squadLooks, structureSide, structureTop, walkerSide, walkerTop, type ArtContext, type HumanoidOpts, type LookVariant, type UnitArt } from "../../../kits";
import { hexToOklch, mixHex, numToHex, oklchToHex } from "../../../color";
import type { Colourway } from "../../../slots";
import type { Place, RigDef } from "../../../types";

const byName = (g: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(g).map(([p, s]) => [p.slice(p.lastIndexOf("/") + 1, -4), s]));
const SIDE = byName(import.meta.glob<string>("../../../parts/forge/mob/*.svg", { query: "?raw", import: "default", eager: true }));
const TOP = byName(import.meta.glob<string>("../../../parts/forge/mob-top/*.svg", { query: "?raw", import: "default", eager: true }));
const side = (n: string): string => SIDE[n] ?? fail(`mob/${n}`);
const top = (n: string): string => TOP[n] ?? fail(`mob-top/${n}`);
function fail(n: string): never {
  throw new Error(`missing Scrapjaw part ${n}`);
}

/** Hazard-stripe orange: the Mob's trim, whatever the faction's green. */
const HAZARD = 0xe8892f;

/**
 * Green hide (plate) in the faction colour; rusty scrap (metal) with a touch of it; dark grubby
 * trousers (suit); hazard orange trim (leather); bone teeth (paint); angry yellow eyes, fire-orange.
 */
function mobColourway(primary: number): Colourway {
  const base = colourwayOf(primary, HAZARD, "teeth");
  const p = hexToOklch(base.plate);
  return {
    ...base,
    id: `mob-${numToHex(primary).slice(1)}`,
    name: "Scrapjaw junk",
    suit: oklchToHex({ l: 0.3, c: 0.035, h: 60 }),
    metal: mixHex("#6e5d4d", oklchToHex({ l: 0.5, c: Math.min(0.08, p.c), h: p.h }), 0.12),
    glow: "#ffd84a",
    fixed: { paint: "#ece0bf", rivet: "#c4ad84", chip: "#c9cfd4", glowWarm: "#ff7a2a" },
  };
}

type Pair = { side: RigDef; top: RigDef };

/** A held weapon: its parts and where the front grip sits in each view ([x, y, rot]). */
interface Arms {
  side: string;
  top: string;
  sideAt: [number, number, number];
  topAt: [number, number, number];
}

const CLEAVER: Arms = { side: side("cleaver"), top: top("cleaver"), sideAt: [36, 56, 50], topAt: [-10, -16, 62] };
const BANGSTICK: Arms = { side: side("bangstick"), top: top("bangstick"), sideAt: [39.2, 58.9, 53.13], topAt: [-8.5, -24.8, 58] };
const FLAMER: Arms = { side: side("flamer"), top: top("flamer"), sideAt: [34, 82, 6], topAt: [-12, -18, 80] };
const HAMMER: Arms = { side: side("hammer"), top: top("hammer"), sideAt: [36, 56, 50], topAt: [-10, -16, 62] };
const SPANNER: Arms = { side: side("spanner"), top: top("spanner"), sideAt: [40, 66, 82], topAt: [-13, -14, 82] };

const at = (src: string, [x, y, r]: [number, number, number], scale = 1): Place => placeAt(src, "g1", { x, y }, r, scale);

/** A Scrapjaw on the humanoid frame: iron-jaw head, barrel torso, hubcap pauldron, clompy boots. */
function scrapjaw(ctx: ArtContext, v: LookVariant, o: { idTag: string; arms: Arms; gear: string; pack: string | null; scale: number } & Partial<HumanoidOpts>): Pair {
  const { idTag, arms, gear, pack, scale, ...rest } = o;
  const opts: HumanoidOpts = {
    id: `forge.mob.${idTag}.${v.tag}`,
    name: ctx.profile.name,
    head: "beast",
    headgear: "none",
    weapon: "axe",
    back: "none",
    lean: v.lean,
    aim: v.aim,
    scale: scale * (v.leader ? 1.05 : 1),
    padsSide: { front: side("pad-front"), back: side("pad-back") },
    legParts: { shinF: side("shin-front"), shinB: side("shin-back"), bootF: side("boot-front"), bootB: side("boot-back"), width: 9.6 },
    weaponSide: { src: arms.side, place: at(arms.side, arms.sideAt) },
    weaponTop: { src: arms.top, place: at(arms.top, arms.topAt) },
    ...rest,
    parts: {
      torso: { side: side("torso"), top: top("torso") },
      head: { side: side("head"), top: top("head") },
      gear: { side: side(gear), top: top(gear) },
      back: pack ? { side: side(pack), top: top(pack) } : { side: null, top: null },
    },
  };
  return { side: humanoidSide(opts), top: humanoidTop(opts) };
}

function squad(ctx: ArtContext, build: (v: LookVariant) => Pair): UnitArt {
  const { variants, pick } = squadLooks(ctx.spec.models);
  return { colourway: ctx.colourway, looks: variants.map(build), ...(variants.length > 1 ? { pick } : {}) };
}

const one = (ctx: ArtContext, look: Pair): UnitArt => ({ colourway: ctx.colourway, looks: [look] });
const LONE: LookVariant = { tag: "a", leader: false, lean: 0, aim: 0 };
/** Squat brutes: a touch bigger than a trooper, never as tall as the Bulwark's monks. */
const MOB_SCALE = 1.02;

export default defineTemplateArt({
  key: "mob",
  colourway: (_f, spec) => mobColourway(spec.primary),
  units: {
    // the Krunch Gang: the boss in a rebar-horned pot with the trophy pole; pot-and-cleaver lads; cone-hat lads with bang sticks
    gang: (ctx) =>
      squad(ctx, (v) =>
        v.leader
          ? scrapjaw(ctx, v, { idTag: "gang", arms: CLEAVER, gear: "boss-pot", pack: "trophy", scale: MOB_SCALE })
          : v.tag === "a"
            ? scrapjaw(ctx, v, { idTag: "gang", arms: CLEAVER, gear: "pot", pack: null, scale: MOB_SCALE })
            : scrapjaw(ctx, v, { idTag: "gang", arms: BANGSTICK, gear: "cone", pack: null, scale: MOB_SCALE }),
      ),
    // the Scorch Crew: welders' masks, fuel drums on their backs, watering-can flamers at the hip
    scorchers: (ctx) =>
      squad(ctx, (v) => scrapjaw(ctx, v, { idTag: "scorchers", arms: FLAMER, gear: v.tag === "b" ? "pot" : "mask", pack: "barrel", scale: MOB_SCALE, aim: v.aim * 0.4 })),
    // Hog Riders: a war hog in rusty barding with an iron snout; the rider in a bucket (or a pot) with a sign cleaver
    hogs: (ctx) => {
      const { variants, pick } = squadLooks(ctx.spec.models);
      const looks = variants.map((v): Pair => {
        const gear = v.tag === "a" ? "bucket" : "pot";
        const back = v.tag === "a" ? "trophy" : null;
        const o = {
          id: `forge.mob.hogs.${v.tag}`,
          name: ctx.profile.name,
          spec: ctx.spec,
          variant: v,
          steed: { side: { body: side("hog-body"), head: side("hog-head"), gear: null }, top: { body: top("hog-body"), head: top("hog-head"), gear: null } },
          rider: {
            helm: side("head"),
            torso: side("torso"),
            gear: side(gear),
            pack: back ? side(back) : null,
            weapon: { src: CLEAVER.side, place: at(CLEAVER.side, CLEAVER.sideAt) },
            top: {
              parts: { torso: { top: top("torso") }, head: { top: top("head") }, gear: { top: top(gear) }, back: { top: back ? top(back) : null } },
              weaponTop: { src: CLEAVER.top, place: at(CLEAVER.top, CLEAVER.topAt) },
            },
          },
        };
        return { side: riderSide(o), top: riderTop(o) };
      });
      return { colourway: ctx.colourway, looks, ...(looks.length > 1 ? { pick } : {}) };
    },
    // Warlord Gutrot: half again the size of his lads, rebar crown, the engine-block hammer, a pole of looted helmets
    warlord: (ctx) => one(ctx, scrapjaw(ctx, { ...LONE, leader: true }, { idTag: "warlord", arms: HAMMER, gear: "crown", pack: "helmpole", scale: MOB_SCALE * 1.36, lean: -3 })),
    // the Scrap Tinker: magnifier goggles, the zappy spanner, a crate with a sparking coil
    tinker: (ctx) => one(ctx, scrapjaw(ctx, LONE, { idTag: "tinker", arms: SPANNER, gear: "specs", pack: "junkpack", scale: MOB_SCALE })),
    // the Junk Giant: a bus on end, fridge chest, nan statue head, belly cannon, wrecking claw, oil-drum knees on tyre feet
    giant: (ctx) => {
      const spec = { ...ctx.spec, scale: ctx.spec.scale * 0.85 };
      const cannon = side("belly-cannon");
      const cannonTop = top("belly-cannon");
      const claw = side("claw");
      const clawTop = top("claw");
      const legParts = { knee: side("drum-knee"), foot: side("giant-foot"), footTop: top("giant-foot"), width: { upper: 18, lower: 22 } };
      return one(ctx, {
        side: walkerSide({
          id: "forge.mob.giant",
          name: ctx.profile.name,
          spec,
          variant: LONE,
          hull: side("giant-hull"),
          gun: { src: cannon, place: placeAt(cannon, "g1", { x: -20, y: -100 }, 0, 1.1) },
          extras: [{ id: "claw", src: claw, bone: "torso", place: placeAt(claw, "pivot", { x: -38, y: -150 }, 0, 1.05), z: 13 }],
          legParts,
        }),
        top: walkerTop({
          id: "forge.mob.giant",
          name: ctx.profile.name,
          spec,
          variant: LONE,
          hull: top("giant-hull"),
          gun: { src: cannonTop, place: placeAt(cannonTop, "g1", { x: 18, y: -34 }, 90, 1.1) },
          extras: [{ id: "claw", src: clawTop, bone: "torso", place: placeAt(clawTop, "pivot", { x: -34, y: -18 }, -10, 1.05), z: 6.5 }],
          legParts,
        }),
      });
    },
    // the Whirlybasher: a half-barrel tub with two goggled pilots under one big rotor, rattle guns on the front
    gyro: (ctx) => {
      const gun = side("rattle");
      const gunTop = top("rattle");
      const spec = { ...ctx.spec, scale: ctx.spec.scale * 1.15 };
      return one(ctx, {
        side: flyerSide({
          id: "forge.mob.gyro",
          name: ctx.profile.name,
          spec,
          variant: LONE,
          hull: side("gyro-hull"),
          engines: false,
          gun: { src: gun, place: placeAt(gun, "g1", { x: -32, y: -38 }, 4) },
          extras: [{ id: "rotor", src: side("rotor"), bone: "torso", place: { x: 8.5, y: -112, rot: 90 }, z: 12, anim: { flap: 0.82 } }],
        }),
        top: flyerTop({
          id: "forge.mob.gyro",
          name: ctx.profile.name,
          spec,
          variant: LONE,
          hull: top("gyro-hull"),
          engines: false,
          gun: { src: gunTop, place: placeAt(gunTop, "g1", { x: 6, y: -30 }, 90) },
          extras: [{ id: "rotor", src: top("rotor"), bone: "torso", place: { x: 0, y: 0, rot: 0 }, z: 8, anim: { spin: 1 } }],
        }),
      });
    },
    // the Scrap Fort: a junk mound and a corrugated shack, the lookout gun on its plank deck, the flag on a pipe
    fort: (ctx) => {
      const gun = side("rattle");
      const gunTop = top("rattle");
      const flag = side("fort-flag");
      return one(ctx, {
        side: structureSide({
          id: "forge.mob.fort",
          name: ctx.profile.name,
          spec: ctx.spec,
          body: side("fort-heap"),
          plinth: null,
          gun: { src: gun, place: placeAt(gun, "g1", { x: 8, y: -104 }, -4, 1.1) },
          extras: [{ id: "flag", src: flag, bone: "torso", place: placeAt(flag, "pivot", { x: 30, y: -96 }), z: 4, anim: { flap: 0.12 } }],
        }),
        top: structureTop({
          id: "forge.mob.fort",
          name: ctx.profile.name,
          spec: ctx.spec,
          body: top("fort-heap"),
          plinth: null,
          gun: { src: gunTop, place: placeAt(gunTop, "g1", { x: 0, y: -4 }, 90, 1.1) },
          extras: [{ id: "flag", src: top("fort-flag"), bone: "torso", place: { x: 24, y: -24, rot: 30 }, z: 7 }],
        }),
      });
    },
  },
});
