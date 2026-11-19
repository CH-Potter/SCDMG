// Gristletusk Horde (Forge template `orcs`): big, green, loud and leaning into the fight. Their own
// look: small heavy-browed heads slung low over barrel chests, a huge underbite with upturned tusks
// and a bone nose ring, a single great spiked pauldron, rust-rag wrappings and bare clawed feet,
// scrap plate hammered on wherever it fits, and notched cleavers. The leaders carry a tusked-skull
// totem. Goblin Stabbers are small yellow-green things with enormous ears, hooked noses and rag
// hoods; the Tuskguard wear bucket helms with one great bone horn; the Howlback Riders sit on shaggy
// wolves in spiked collars; the Mud Shaman wears a tusked beast skull; the Bridge Troll is a grey
// hunched hulk with a mossy hump, dragging a bridge plank with a mooring stone lashed to it; the
// Skewer Chucker is a plank cart with a spiked mantlet and a crossbow the size of a door.
//
// Silhouette language: hunched and front-heavy (everything leans forward), spikes and tusks pointing
// up and out, jagged hems. Colour: the faction colour as green hide, dark brown-green cloth, rust-red
// rags and trim, rusty iron, bone, sickly yellow-green eyes.

import { colourwayOf, defineTemplateArt, fitHeight, humanoidSide, humanoidTop, placeAt, riderSide, riderTop, scaleRig, squadLooks, type ArtContext, type HeldWeapon, type HeldWeaponTop, type HumanoidOpts, type LookVariant, type UnitArt } from "../../../kits";
import { hexToOklch, mixHex, numToHex, oklchToHex } from "../../../color";
import type { Colourway, SlotName } from "../../../slots";
import type { PartUse, RigDef, RigView } from "../../../types";

const byName = (g: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(g).map(([p, s]) => [p.slice(p.lastIndexOf("/") + 1, -4), s]));
const SIDE = byName(import.meta.glob<string>("../../../parts/forge/orcs/*.svg", { query: "?raw", import: "default", eager: true }));
const TOP = byName(import.meta.glob<string>("../../../parts/forge/orcs-top/*.svg", { query: "?raw", import: "default", eager: true }));
const side = (n: string): string => SIDE[n] ?? fail(`orcs/${n}`);
const top = (n: string): string => TOP[n] ?? fail(`orcs-top/${n}`);
function fail(n: string): never {
  throw new Error(`missing Gristletusk part ${n}`);
}

/** Rust: the Horde's rags and trim, whatever the faction's colour. */
const RUST = 0xa4532e;
const GROUND = "#4d4a44";

/** Green hide in the faction colour, a dark brown-green cloth from it, rust rags, rusty iron, bone, sickly glow. */
function orcColourway(primary: number): Colourway {
  const base = colourwayOf(primary, RUST, "teeth");
  const p = hexToOklch(base.plate);
  return {
    ...base,
    id: `orcs-${numToHex(primary).slice(1)}`,
    name: "Gristletusk",
    suit: oklchToHex({ l: 0.3, c: Math.min(0.05, 0.02 + p.c * 0.2), h: p.h * 0.4 + 70 * 0.6 }),
    metal: mixHex("#5c4f47", base.plate, 0.08),
    glow: "#d8ef5a",
    fixed: { paint: "#eadfbe", rivet: "#c6b48a", chip: "#aaa49a", glowWarm: "#a6c22a" },
  };
}

/** Goblins: a paler, yellower hide than the orcs', from the same faction colour. */
function goblinColourway(cw: Colourway): Colourway {
  const p = hexToOklch(cw.plate);
  return { ...cw, id: `${cw.id}-gob`, plate: oklchToHex({ l: Math.min(0.82, p.l + 0.1), c: p.c, h: p.h - 18 }) };
}

type Look = { side: RigDef; top: RigDef };
const one = (cw: Colourway, look: Look): UnitArt => ({ colourway: cw, looks: [look] });
const LONE: LookVariant = { tag: "a", leader: false, lean: 0, aim: 0 };
function squad(ctx: ArtContext, build: (v: LookVariant) => Look, cw: Colourway = ctx.colourway): UnitArt {
  const { variants, pick } = squadLooks(ctx.spec.models);
  return { colourway: cw, looks: variants.map(build), ...(variants.length > 1 ? { pick } : {}) };
}

const legs = { shinF: side("shin-front"), shinB: side("shin-back"), bootF: side("foot-front"), bootB: side("foot-back"), width: 9 };
const PADS = { front: side("pad-front"), back: side("pad-back") };
const PIECE = (n: string) => ({ side: side(n), top: top(n) });
const NONE = { side: null, top: null };

/** An orc: the Horde's head, torso, legs and bare feet, hunched forward, with the slots the unit swaps. */
function orc(ctx: ArtContext, v: LookVariant, o: Partial<HumanoidOpts> & { idTag: string; scale?: number }): Look {
  const opts: HumanoidOpts = {
    id: `forge.orcs.${o.idTag}.${v.tag}`,
    name: ctx.profile.name,
    head: "beast",
    headgear: "none",
    weapon: "axe",
    back: "none",
    lean: v.lean - 8,
    aim: v.aim,
    legParts: legs,
    padsSide: PADS,
    ...o,
    scale: (o.scale ?? 1.12) * (v.leader ? 1.05 : 1),
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

/** The grunts' cleaver in the near hand, a chucking axe ready in the far one. */
function hackSide(v: LookVariant): HeldWeapon {
  const c = side("cleaver");
  return {
    src: c,
    place: v.tag === "b" ? placeAt(c, "g1", { x: 40, y: 82 }, 18) : placeAt(c, "g1", { x: 40, y: 74 }, 62),
    armB: { hand: side("hatchet"), at: { x: 74, y: v.tag === "b" ? 76 : 96 }, to: "torso", rot: v.tag === "b" ? 120 : 70 },
  };
}
function hackTop(): HeldWeaponTop {
  const c = top("cleaver");
  return { src: c, place: placeAt(c, "g1", { x: -8, y: -12 }, 70), armR: { hand: top("hatchet"), at: { x: 14, y: -6 }, to: "torso", rot: 120 } };
}
const spearSide = (rot = 12): HeldWeapon => ({ src: side("spear"), place: placeAt(side("spear"), "g1", { x: 42, y: 82 }, rot) });
const spearTop = (): HeldWeaponTop => ({ src: top("spear"), place: placeAt(top("spear"), "g1", { x: -8, y: -12 }, 76) });

// ---------- non-humanoid builders ----------

/** Repaint some limbs (a steed's legs) in another slot. */
function limbSlot(rig: RigDef, test: (id: string) => boolean, slot: SlotName, stripe?: SlotName): RigDef {
  return { ...rig, limbs: rig.limbs.map((l) => (test(l.id) ? { ...l, upper: { ...l.upper, slot, stripe }, lower: { ...l.lower, slot, stripe } } : l)) };
}

/** A structure: the body part (and a gun part at its mount) on the structure frame. */
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
    pivots: { torso: { x: 0, y: view === "side" ? -50 : 0 }, head: { x: 0, y: view === "side" ? -80 : 0 } },
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
  key: "orcs",
  colourway: (f) => orcColourway(f.color),
  units: {
    // Gristle Grunts: cleaver and chucking axe; a pot helm, or a bare head and a topknot; the boss
    // carries the tusked-skull totem
    grunts: (ctx) =>
      squad(ctx, (v) =>
        orc(ctx, v, {
          idTag: "grunts",
          weaponSide: hackSide(v),
          weaponTop: hackTop(),
          parts: { gear: v.tag === "b" ? PIECE("topknot") : PIECE("pot"), back: v.leader ? PIECE("totem") : NONE },
        }),
      ),
    // Goblin Stabbers: small, big-eared, rag-hooded, a long pointy stick; the boss wears a pot far too big
    stabbers: (ctx) =>
      squad(
        ctx,
        (v) =>
          orc(ctx, v, {
            idTag: "stabbers",
            scale: 0.8,
            lean: v.lean - 4,
            padsSide: undefined,
            pads: false,
            weaponSide: spearSide(v.tag === "b" ? 30 : 10),
            weaponTop: spearTop(),
            parts: { head: PIECE("head-goblin"), gear: v.leader ? PIECE("pot") : v.tag === "b" ? NONE : PIECE("hood-goblin") },
          }),
        goblinColourway(ctx.colourway),
      ),
    // Tuskguard Bruisers: scrap-plated hulks in horned bucket helms, the great spiked cleaver in both hands
    bruisers: (ctx) =>
      squad(ctx, (v) => {
        const gc = side("greatcleaver");
        const gt = top("greatcleaver");
        return orc(ctx, v, {
          idTag: "bruisers",
          scale: 1.32,
          lean: v.lean - 6,
          weaponSide: { src: gc, place: v.tag === "b" ? placeAt(gc, "g1", { x: 42, y: 80 }, 14) : placeAt(gc, "g1", { x: 36, y: 60 }, 52) },
          weaponTop: { src: gt, place: placeAt(gt, "g1", { x: -10, y: -16 }, 64) },
          parts: { torso: PIECE("torso-heavy"), gear: PIECE("helm-horned"), back: v.leader ? PIECE("totem") : NONE },
        });
      }),
    // Howlback Riders: an orc with a long spear on a shaggy wolf in a spiked collar
    wolves: (ctx) => {
      const cw: Colourway = { ...ctx.colourway, id: `${ctx.colourway.id}-wolf`, suit: "#5f5246" };
      return squad(
        ctx,
        (v) => {
          const o = {
            id: `forge.orcs.wolves.${v.tag}`,
            name: ctx.profile.name,
            spec: ctx.spec,
            variant: v,
            steed: { side: { body: side("wolf-body"), head: side("wolf-head"), tail: side("wolf-tail") }, top: { body: top("wolf-body"), head: top("wolf-head"), tail: top("wolf-tail") }, scale: 1.12 },
            rider: {
              helm: side("head"),
              gear: side(v.tag === "b" ? "pot" : "topknot"),
              torso: side("torso-plain"),
              weapon: spearSide(v.tag === "b" ? 24 : 8),
              pads: PADS,
              top: { parts: { head: { top: top("head") }, gear: { top: top(v.tag === "b" ? "pot" : "topknot") }, torso: { top: top("torso-plain") } }, weaponTop: spearTop() },
            },
          };
          const steed = (id: string) => id.startsWith("s");
          return { side: limbSlot(riderSide(o), steed, "suit", "suitShade"), top: limbSlot(riderTop(o), steed, "suit", "suitShade") };
        },
        cw,
      );
    },
    // the Mud Shaman: a tusked beast-skull mask, the bone staff spitting green light, the fetish pole
    shaman: (ctx) =>
      one(
        ctx.colourway,
        orc(ctx, { ...LONE, leader: true }, {
          idTag: "shaman",
          scale: 1.08,
          weaponSide: { src: side("staff"), place: placeAt(side("staff"), "g1", { x: 40, y: 66 }, 82) },
          weaponTop: { src: top("staff"), place: placeAt(top("staff"), "g1", { x: -13, y: -14 }, 82) },
          parts: { gear: PIECE("mask"), back: PIECE("fetish") },
        }),
      ),
    // the Bridge Troll: a grey hulk with a mossy hump, long arms, dragging the plank club
    troll: (ctx) => {
      const base = ctx.colourway;
      const skin = numToHex(ctx.spec.secondary);
      const cw: Colourway = { ...base, id: `${base.id}-troll-${skin.slice(1)}`, plate: skin, suit: mixHex(base.suit, base.plate, 0.35) };
      const club = side("club");
      const clubT = top("club");
      return one(
        cw,
        orc(ctx, LONE, {
          idTag: "troll",
          scale: 2.05,
          lean: -10,
          padsSide: undefined,
          pads: false,
          legParts: { ...legs, width: 11 },
          weaponSide: { src: club, place: placeAt(club, "g1", { x: 38, y: 126 }, -24), armB: { hand: side("claw"), at: { x: 78, y: 132 }, to: "torso" } },
          weaponTop: { src: clubT, place: placeAt(clubT, "g1", { x: -14, y: -10 }, 70), armR: { hand: top("claw"), at: { x: 16, y: -10 }, to: "torso" } },
          parts: { torso: PIECE("troll-torso"), head: PIECE("troll-head") },
        }),
      );
    },
    // the Skewer Chucker: a plank cart, a spiked mantlet with the team daub, the giant crossbow on top
    chucker: (ctx) => {
      const cb = side("crossbow");
      const cbT = top("crossbow");
      const k = ctx.spec.scale * 1.15;
      return one(ctx.colourway, {
        side: tower("forge.orcs.chucker", ctx.profile.name, "side", side("cart"), k, { src: cb, place: placeAt(cb, "g1", { x: 54, y: -74 }, 4) }),
        top: tower("forge.orcs.chucker", ctx.profile.name, "top", top("cart"), k, { src: cbT, place: placeAt(cbT, "g1", { x: 0, y: 30 }, 90) }),
      });
    },
  },
});
