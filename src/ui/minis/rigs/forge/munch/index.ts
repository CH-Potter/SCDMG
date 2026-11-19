// The Munch (Forge template `munch`): Dr. Graft's grafted farmland critters, in Hard Ink. Natural
// coats (each critter's own, tinted toward the faction colour), the lab's hardware bolted on: chrome
// jaws, pistons and claws, glass vials of mutagen in the faction colour, staples and stitched seams,
// and on every head the signal implant, a steel cap with a glowing lens. That cap and the mutagen
// glow are the faction's thread; the team colour is the farmer's paint daub, a collar or a band.
//
// Not the Skitterswarm: fur and farm bugs with lab parts, round and lumpy, never violet chitin and
// scythes. Built on this folder's frame helpers (frame.ts) and the kits' rig utilities.

import { defineTemplateArt, placeAt, scaleRig, squadLooks, type ArtContext, type LookVariant, type UnitArt } from "../../../kits";
import type { PartUse, RigDef } from "../../../types";
import type { Colourway } from "../../../slots";
import { munchColourway, type Coat } from "./colours";
import { legs, bothSides, munchRig } from "./frame";

const byName = (g: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(g).map(([p, s]) => [p.slice(p.lastIndexOf("/") + 1, -4), s]));
const SIDE = byName(import.meta.glob<string>("../../../parts/forge/munch/*.svg", { query: "?raw", import: "default", eager: true }));
const TOP = byName(import.meta.glob<string>("../../../parts/forge/munch-top/*.svg", { query: "?raw", import: "default", eager: true }));
const side = (n: string): string => SIDE[n] ?? fail(`munch/${n}`);
const top = (n: string): string => TOP[n] ?? fail(`munch-top/${n}`);
function fail(n: string): never {
  throw new Error(`missing Munch part ${n}`);
}

type Look = { side: RigDef; top: RigDef };

/** A part at a frame point, by its pivot (or another anchor), turned and scaled. */
const at = (id: string, src: string, bone: PartUse["bone"], x: number, y: number, z: number, o: { rot?: number; scale?: number; anchor?: string; anim?: PartUse["anim"] } = {}): PartUse => ({
  id,
  src,
  bone,
  place: placeAt(src, o.anchor ?? "pivot", { x, y }, o.rot ?? 0, o.scale ?? 1),
  z,
  ...(o.anim ? { anim: o.anim } : {}),
});

function squad(ctx: ArtContext, coat: Coat, build: (v: LookVariant, cw: Colourway) => Look): UnitArt {
  const { variants, pick } = squadLooks(ctx.spec.models);
  const cw = munchColourway(ctx.spec.primary, coat);
  return { colourway: cw, looks: variants.map((v) => build(v, cw)), ...(variants.length > 1 ? { pick } : {}) };
}

/** A lone model (a monster, a burrow): one look. */
function one(ctx: ArtContext, coat: Coat, build: (cw: Colourway) => Look): UnitArt {
  const cw = munchColourway(ctx.spec.primary, coat);
  return { colourway: cw, looks: [build(cw)] };
}

const scale = (l: Look, k: number): Look => (k === 1 ? l : { side: scaleRig(l.side, k), top: scaleRig(l.top, k) });

// ---------- Chrome-Jaw Beetles ----------

function beetle(v: LookVariant): Look {
  const id = `forge.munch.nibblers.${v.tag}`;
  const k = v.leader ? 1.1 : 1;
  const sl = legs(
    "side",
    [
      { id: "nF", hip: { x: -8, y: -20 }, knee: { x: -26, y: -31 }, foot: { x: -37, y: 0 }, near: true, a: true },
      { id: "nM", hip: { x: 5, y: -19 }, knee: { x: 12, y: -33 }, foot: { x: 6, y: 0 }, near: true, a: false },
      { id: "nR", hip: { x: 18, y: -20 }, knee: { x: 36, y: -30 }, foot: { x: 45, y: 0 }, near: true, a: true },
      { id: "fF", hip: { x: -1, y: -23 }, knee: { x: -19, y: -34 }, foot: { x: -28, y: 0 }, near: false, a: false },
      { id: "fM", hip: { x: 12, y: -22 }, knee: { x: 19, y: -36 }, foot: { x: 15, y: 0 }, near: false, a: true },
      { id: "fR", hip: { x: 25, y: -23 }, knee: { x: 43, y: -33 }, foot: { x: 52, y: 0 }, near: false, a: false },
    ],
    { width: [3, 2.4], step: 5, lift: 6, z: [8, 1] },
  );
  const back: PartUse[] = v.tag === "b" ? [at("plate", side("beetle-plate"), "torso", 12, -46, 6)] : [at("vial", side("vial"), "torso", 16, -50, 6, { rot: 14, scale: 0.85, anim: { pulse: 0.04 } })];
  const head = side("beetle-head");
  const s = munchRig({
    id,
    name: "Chrome-Jaw Beetle",
    view: "side",
    k: 0.55 * k,
    pivots: { torso: { x: 8, y: -28 }, head: { x: -16, y: -24 } },
    parts: [
      { id: "shell", src: side("beetle-shell"), bone: "torso", z: 5 },
      ...back,
      { id: "head", src: head, bone: "gun", place: { x: -16, y: -24, rot: v.tag === "b" ? -6 : 0 }, z: 7 },
      ...(v.leader ? [at("booster", side("booster"), "gun", -20, -38, 6.5, { rot: 14, scale: 0.9 })] : []),
    ],
    limbs: sl.limbs,
    gait: sl.gait,
    weapon: "head",
  });
  const tl = legs(
    "top",
    bothSides([
      { id: "lF", hip: { x: -10, y: -10 }, knee: { x: -22, y: -18 }, foot: { x: -27, y: -32 }, a: true },
      { id: "lM", hip: { x: -13, y: 4 }, knee: { x: -27, y: 2 }, foot: { x: -35, y: 8 }, a: false },
      { id: "lR", hip: { x: -11, y: 18 }, knee: { x: -25, y: 24 }, foot: { x: -29, y: 38 }, a: true },
    ]),
    { width: [3, 2.4], step: 4, lift: 0, z: [1, 1] },
  );
  const t = munchRig({
    id,
    name: "Chrome-Jaw Beetle",
    view: "top",
    k: 0.55 * k,
    pivots: { torso: { x: 0, y: 4 }, head: { x: 0, y: -24 } },
    parts: [
      { id: "shell", src: top("beetle-shell"), bone: "torso", z: 5 },
      v.tag === "b" ? at("plate", top("plate"), "torso", 0, 22, 6, { rot: 4 }) : at("vial", side("vial"), "torso", 0, 22, 6, { scale: 0.95, anim: { pulse: 0.04 } }),
      { id: "head", src: top("beetle-head"), bone: "gun", place: { x: 0, y: -24, rot: 0 }, z: 7 },
      ...(v.leader ? [at("booster", top("booster"), "gun", 0, -30, 7.5)] : []),
    ],
    limbs: tl.limbs,
    gait: tl.gait,
    weapon: "head",
    shadow: { x: 4, y: 6, r: 30 },
  });
  return scale({ side: s, top: t }, k);
}

// ---------- Web-Gunner Spiders ----------

function spider(v: LookVariant, cw: Colourway): Look {
  const id = `forge.munch.spitter.${v.tag}`;
  const k = v.leader ? 1.08 : 1;
  const sl = legs(
    "side",
    [
      { id: "n1", hip: { x: -18, y: -26 }, knee: { x: -36, y: -48 }, foot: { x: -52, y: 0 }, near: true, a: true },
      { id: "n2", hip: { x: -13, y: -24 }, knee: { x: -24, y: -52 }, foot: { x: -30, y: 0 }, near: true, a: false },
      { id: "n3", hip: { x: -8, y: -24 }, knee: { x: 8, y: -50 }, foot: { x: 20, y: 0 }, near: true, a: true },
      { id: "n4", hip: { x: -4, y: -26 }, knee: { x: 26, y: -46 }, foot: { x: 46, y: 0 }, near: true, a: false },
      { id: "f1", hip: { x: -12, y: -29 }, knee: { x: -28, y: -52 }, foot: { x: -42, y: 0 }, near: false, a: false },
      { id: "f2", hip: { x: -7, y: -27 }, knee: { x: -16, y: -56 }, foot: { x: -20, y: 0 }, near: false, a: true },
      { id: "f3", hip: { x: -2, y: -27 }, knee: { x: 16, y: -54 }, foot: { x: 30, y: 0 }, near: false, a: false },
      { id: "f4", hip: { x: 2, y: -29 }, knee: { x: 34, y: -50 }, foot: { x: 56, y: 0 }, near: false, a: true },
    ],
    { width: [3, 2.2], step: 6, lift: 7, z: [8, 1] },
  );
  const gun = side("web-cannon");
  const s = munchRig({
    id,
    name: "Web-Gunner Spider",
    view: "side",
    k: 0.6 * k,
    spits: true,
    limbInk: 1.4,
    pivots: { torso: { x: 8, y: -34 }, head: { x: -20, y: -31 } },
    parts: [
      { id: "body", src: side("spider-body"), bone: "torso", z: 5 },
      { id: "head", src: side("spider-head"), bone: "head", place: { x: -21, y: -31, rot: 0 }, z: 9 },
      { id: "cannon", src: gun, bone: "gun", place: placeAt(gun, "pivot", { x: 10, y: -64 }, v.aim * 0.6, 1.05), z: 6 },
      ...(v.leader ? [at("booster", side("booster"), "head", -24, -44, 9.5, { rot: 10, scale: 0.8 })] : []),
    ],
    limbs: sl.limbs,
    gait: sl.gait,
    weapon: "cannon",
    fx: { muzzle: cw.glow },
  });
  const tl = legs(
    "top",
    bothSides([
      { id: "l1", hip: { x: -7, y: -14 }, knee: { x: -24, y: -26 }, foot: { x: -30, y: -44 }, a: true },
      { id: "l2", hip: { x: -9, y: -9 }, knee: { x: -30, y: -14 }, foot: { x: -42, y: -20 }, a: false },
      { id: "l3", hip: { x: -9, y: -4 }, knee: { x: -30, y: 4 }, foot: { x: -42, y: 14 }, a: true },
      { id: "l4", hip: { x: -7, y: 0 }, knee: { x: -24, y: 16 }, foot: { x: -32, y: 36 }, a: false },
    ]),
    { width: [2.8, 2.2], step: 5, lift: 0, z: [1, 1] },
  );
  const t = munchRig({
    id,
    name: "Web-Gunner Spider",
    view: "top",
    k: 0.6 * k,
    spits: true,
    limbInk: 1.4,
    pivots: { torso: { x: 0, y: 6 }, head: { x: 0, y: -18 } },
    parts: [
      { id: "body", src: top("spider-body"), bone: "torso", z: 5 },
      { id: "head", src: top("spider-head"), bone: "head", place: { x: 0, y: -17, rot: 0 }, z: 6 },
      { id: "cannon", src: gun, bone: "gun", place: placeAt(gun, "pivot", { x: 0, y: 8 }, 90 + v.aim * 0.3, 0.95), z: 7 },
      ...(v.leader ? [at("booster", top("booster"), "head", 0, -14, 6.5)] : []),
    ],
    limbs: tl.limbs,
    gait: tl.gait,
    weapon: "cannon",
    fx: { muzzle: cw.glow },
    shadow: { x: 4, y: 6, r: 34 },
  });
  return scale({ side: s, top: t }, k);
}

// ---------- Bomb Wasps ----------

/** A point turned `deg` about the origin. */
const turn = (x: number, y: number, deg: number) => {
  const c = Math.cos((deg * Math.PI) / 180);
  const n = Math.sin((deg * Math.PI) / 180);
  return { x: x * c - y * n, y: x * n + y * c };
};

function wasps(v: LookVariant): Look {
  const id = `forge.munch.buzz.${v.tag}`;
  // the bomb swings a little differently on each model; the two wasps sit on the ends of its lines
  const swing = v.tag === "b" ? 9 : v.leader ? -4 : -10;
  const bk = v.leader ? 1.15 : 1;
  const hook = { x: 0, y: -84 };
  const la = turn(-17 * bk, -15 * bk, swing);
  const lb = turn(15 * bk, -23 * bk, swing);
  const A = { x: hook.x + la.x, y: hook.y + la.y };
  const B = { x: hook.x + lb.x, y: hook.y + lb.y };
  const wasp = side("wasp");
  const wings = side("wings");
  const fly = (n: string, p: { x: number; y: number }, bone: PartUse["bone"], sc: number, z: number, phase: number): PartUse[] => [
    { id: `wasp-${n}`, src: wasp, bone, place: { x: p.x, y: p.y, rot: -6, scale: sc }, z },
    { id: `wings-${n}`, src: wings, bone, place: { x: p.x + 1 * sc, y: p.y - 4 * sc, rot: 0, scale: sc * 1.15 }, z: z + 0.5, anim: { flap: 0.55, phase } },
  ];
  const s = munchRig({
    id,
    name: "Bomb Wasps",
    view: "side",
    frame: "hover",
    k: 0.5,
    pivots: { torso: { x: 0, y: -84 }, head: { x: A.x, y: A.y } },
    parts: [
      ...fly("b", B, "torso", 1.0, 3, 0.3),
      { id: "bomb", src: side("bomb"), bone: "gun", place: { x: hook.x, y: hook.y, rot: swing, scale: bk }, z: 6 },
      ...fly("a", A, "head", 1.15, 8, 0),
    ],
    weapon: "bomb",
    limbInk: 1.4,
  });
  const wt = top("wasp");
  const wgt = top("wings");
  const flyT = (n: string, x: number, y: number, rot: number, bone: PartUse["bone"], z: number, phase: number): PartUse[] => [
    { id: `wasp-${n}`, src: wt, bone, place: { x, y, rot, scale: 1.1 }, z },
    { id: `wings-${n}`, src: wgt, bone, place: { x, y, rot, scale: 1.15 }, z: z + 0.5, anim: { flap: 0.5, phase } },
  ];
  const t = munchRig({
    id,
    name: "Bomb Wasps",
    view: "top",
    frame: "hover",
    k: 0.5,
    pivots: { torso: { x: 0, y: 4 }, head: { x: -13, y: -8 } },
    parts: [
      { id: "bomb", src: top("bomb"), bone: "gun", place: { x: 0, y: 6, rot: swing, scale: bk }, z: 3 },
      ...flyT("a", -13, -8 + (v.tag === "b" ? 4 : 0), -10, "head", 5, 0),
      ...flyT("b", 14, -4 - (v.tag === "b" ? 4 : 0), 8, "torso", 6, 0.3),
    ],
    weapon: "bomb",
    shadow: { x: 4, y: 6, r: 30 },
  });
  return { side: s, top: t };
}

// ---------- Dr. Graft and Big Mama ----------

function mama(): Look {
  const id = "forge.munch.mama";
  const paw = side("claw-paw");
  const sl = legs(
    "side",
    [
      { id: "nF", hip: { x: -84, y: -78 }, knee: { x: -98, y: -42 }, foot: { x: -100, y: -2 }, near: true, a: true },
      { id: "nR", hip: { x: 80, y: -80 }, knee: { x: 102, y: -44 }, foot: { x: 92, y: -2 }, near: true, a: false },
      { id: "fF", hip: { x: -64, y: -84 }, knee: { x: -78, y: -48 }, foot: { x: -76, y: -2 }, near: false, a: false },
      { id: "fR", hip: { x: 98, y: -86 }, knee: { x: 118, y: -50 }, foot: { x: 112, y: -2 }, near: false, a: true },
    ],
    { width: [26, 21], step: 14, lift: 10, z: [8, 1], slot: "suit", farSlot: "suitShade" },
  );
  const paws = sl.limbs.map((l) => ({ id: `${l.id}-paw`, src: paw, bone: `${l.id}.end` as PartUse["bone"], place: placeAt(paw, "pivot", { x: l.end.x + 4, y: 0 }, 0, 1.25), z: l.upper.z + 0.5 }));
  const tx = side("transmitter");
  const s = munchRig({
    id,
    name: "Dr. Graft and Big Mama",
    view: "side",
    k: 1.6,
    limbInk: 2.4,
    pivots: { torso: { x: 0, y: -110 }, head: { x: -112, y: -104 } },
    parts: [
      ...paws,
      { id: "body", src: side("mama-body"), bone: "torso", z: 5 },
      { id: "saddle", src: side("mama-saddle"), bone: "torso", z: 6 },
      { id: "graft", src: side("graft"), bone: "torso", z: 7 },
      at("transmitter", tx, "torso", 12, -276, 7.5, { anim: { pulse: 0.05 } }),
      { id: "head", src: side("mama-head"), bone: "gun", place: { x: -114, y: -100, rot: 0 }, z: 9 },
    ],
    limbs: sl.limbs,
    gait: sl.gait,
    weapon: "head",
  });
  const tl = legs(
    "top",
    bothSides([
      { id: "lF", hip: { x: -46, y: -62 }, knee: { x: -76, y: -70 }, foot: { x: -84, y: -92 }, a: true },
      { id: "lR", hip: { x: -48, y: 66 }, knee: { x: -78, y: 78 }, foot: { x: -84, y: 100 }, a: false },
    ]),
    { width: [24, 20], step: 12, lift: 0, z: [1, 1], slot: "suit" },
  );
  const t = munchRig({
    id,
    name: "Dr. Graft and Big Mama",
    view: "top",
    k: 1.6,
    limbInk: 2.4,
    pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: -104 } },
    parts: [
      { id: "body", src: top("mama-body"), bone: "torso", z: 5 },
      { id: "graft", src: top("graft"), bone: "torso", z: 7, anim: { pulse: 0.02 } },
      { id: "head", src: top("mama-head"), bone: "gun", place: { x: 0, y: -100, rot: 0 }, z: 6 },
    ],
    limbs: tl.limbs,
    gait: tl.gait,
    weapon: "head",
    shadow: { x: 10, y: 14, r: 110 },
  });
  // from above, the badger is drawn a touch smaller so she sits on her 1.4" base
  return { side: s, top: scaleRig(t, 0.88) };
}

// ---------- Piston Foxes ----------

type LegsOut = ReturnType<typeof legs>;
/** Two leg sets (fur and chrome) as one: limbs together, walk keys merged. */
const merge = (a: LegsOut, b: LegsOut): LegsOut => ({ limbs: [...a.limbs, ...b.limbs], gait: a.gait.map((k, i) => ({ ...k, ...b.gait[i] })) });

function fox(v: LookVariant): Look {
  const id = `forge.munch.hoppers.${v.tag}`;
  const k = v.leader ? 1.08 : 1;
  const front = legs(
    "side",
    [
      { id: "nF", hip: { x: -16, y: -32 }, knee: { x: -19, y: -16 }, foot: { x: -22, y: 0 }, near: true, a: true },
      { id: "fF", hip: { x: -10, y: -34 }, knee: { x: -12, y: -17 }, foot: { x: -12, y: 0 }, near: false, a: false },
    ],
    { width: [4.6, 3.4], step: 6, lift: 6, z: [8, 1], slot: "suit", farSlot: "suitShade" },
  );
  const rear = legs(
    "side",
    [
      { id: "nR", hip: { x: 14, y: -34 }, knee: { x: 25, y: -17 }, foot: { x: 17, y: 0 }, near: true, a: false },
      { id: "fR", hip: { x: 20, y: -36 }, knee: { x: 31, y: -18 }, foot: { x: 25, y: 0 }, near: false, a: true },
    ],
    { width: [3.4, 2.6], step: 6, lift: 6, z: [8, 1], slot: "metal", farSlot: "metalShade" },
  );
  const sl = merge(front, rear);
  const paw = side("paw");
  const piston = side("piston");
  const up = v.tag === "b";
  const tail = side(up ? "fox-tail-up" : "fox-tail");
  const s = munchRig({
    id,
    name: "Piston Fox",
    view: "side",
    k: 0.55 * k,
    limbInk: 1.4,
    pivots: { torso: { x: 0, y: -40 }, head: { x: -22, y: -50 } },
    parts: [
      ...sl.limbs.map((l) => ({ id: `${l.id}-paw`, src: paw, bone: `${l.id}.end` as PartUse["bone"], place: placeAt(paw, "pivot", l.end, 0, 1), z: l.upper.z + 0.5 })),
      { id: "tail", src: tail, bone: "pelvis", place: placeAt(tail, "pivot", { x: 24, y: -44 }, 0, 1), z: 4, anim: { pulse: 0.05 } },
      { id: "body", src: side("fox-body"), bone: "torso", z: 5 },
      { id: "piston", src: piston, bone: "nR.upper", place: placeAt(piston, "pivot", { x: 14, y: -34 }, -32, 1), z: 8.5 },
      { id: "piston-far", src: piston, bone: "fR.upper", place: placeAt(piston, "pivot", { x: 20, y: -36 }, -32, 0.9), z: 1.5 },
      { id: "head", src: side("fox-head"), bone: "gun", place: { x: -22, y: -50, rot: up ? 10 : 0 }, z: 9 },
      ...(v.leader ? [at("booster", side("booster"), "gun", -29, -70, 8.5, { rot: 18, scale: 0.75 })] : []),
    ],
    limbs: sl.limbs,
    gait: sl.gait,
    weapon: "head",
  });
  const tl = merge(
    legs("top", [{ id: "lF", hip: { x: -7, y: -10 }, knee: { x: -13, y: -12 }, foot: { x: -13, y: -22 }, near: true, a: true }, { id: "rF", hip: { x: 7, y: -10 }, knee: { x: 13, y: -12 }, foot: { x: 13, y: -22 }, near: true, a: false }], { width: [4.4, 3.4], step: 5, lift: 0, z: [1, 1], slot: "suit" }),
    legs("top", [{ id: "lR", hip: { x: -8, y: 14 }, knee: { x: -14, y: 20 }, foot: { x: -13, y: 28 }, near: true, a: false }, { id: "rR", hip: { x: 8, y: 14 }, knee: { x: 14, y: 20 }, foot: { x: 13, y: 28 }, near: true, a: true }], { width: [3.4, 2.6], step: 5, lift: 0, z: [1, 1], slot: "metal" }),
  );
  const t = munchRig({
    id,
    name: "Piston Fox",
    view: "top",
    k: 0.55 * k,
    limbInk: 1.4,
    pivots: { torso: { x: 0, y: 4 }, head: { x: 0, y: -16 } },
    parts: [
      { id: "tail", src: top("fox-tail"), bone: "pelvis", place: { x: 0, y: 24, rot: up ? 14 : -8 }, z: 3, anim: { pulse: 0.06 } },
      { id: "body", src: top("fox-body"), bone: "torso", z: 5 },
      { id: "head", src: top("fox-head"), bone: "gun", place: { x: 0, y: -16, rot: 0 }, z: 6 },
      ...(v.leader ? [at("booster", top("booster"), "gun", 0, -20, 6.5)] : []),
    ],
    limbs: tl.limbs,
    gait: tl.gait,
    weapon: "head",
    shadow: { x: 4, y: 6, r: 26 },
  });
  return scale({ side: s, top: t }, k);
}

// ---------- burrows and lab kit (structures) ----------

function structure(id: string, name: string, o: { side: PartUse[]; top: PartUse[]; weapon?: string; h: number; r: number; fx?: string }): Look {
  const base = { id: `forge.munch.${id}`, name, frame: "structure" as const, k: 1, weapon: o.weapon, ...(o.fx ? { fx: { muzzle: o.fx } } : {}) };
  return {
    side: munchRig({ ...base, view: "side", pivots: { torso: { x: 0, y: -o.h / 2 }, head: { x: 0, y: -o.h } }, parts: o.side }),
    top: munchRig({ ...base, view: "top", pivots: { torso: { x: 0, y: 0 }, head: { x: 0, y: 0 } }, parts: o.top, shadow: { x: 8, y: 10, r: o.r } }),
  };
}

const vat = (cw: Colourway): Look =>
  structure("pod", "Mutagen Vat", {
    h: 130,
    r: 60,
    weapon: "vent",
    fx: cw.glow,
    side: [
      { id: "vat", src: side("vat"), bone: "torso", z: 5 },
      at("vent", side("vent"), "gun", 0, -124, 6),
      at("spores", side("spores"), "head", -6, -148, 7, { anim: { float: 4, pulse: 0.08 } }),
    ],
    top: [
      { id: "vat", src: top("vat"), bone: "torso", z: 5 },
      at("vent", top("vent"), "gun", 0, 0, 6),
    ],
  });

const hole = (): Look =>
  structure("hole", "Gopher Hole", {
    h: 70,
    r: 84,
    side: [
      { id: "mound", src: side("hole-mound"), bone: "torso", z: 4 },
      at("gopher", side("gopher"), "head", 4, -24, 5, { anim: { float: 3 } }),
      { id: "lip", src: side("hole-lip"), bone: "torso", z: 6 },
    ],
    top: [
      { id: "mound", src: top("hole"), bone: "torso", z: 4 },
      at("gopher", top("gopher"), "head", 0, 0, 5, { anim: { pulse: 0.05 } }),
    ],
  });

const pit = (cw: Colourway): Look =>
  structure("pit", "Trapdoor Pit", {
    h: 110,
    r: 80,
    weapon: "lurker",
    fx: cw.glow,
    side: [
      { id: "pit", src: side("pit"), bone: "torso", z: 4 },
      at("lurker", side("lurker"), "gun", 0, -24, 5),
      { id: "lip", src: side("hole-lip"), bone: "torso", place: { x: 0, y: 4, rot: 0, scale: 0.95 }, z: 6 },
    ],
    top: [
      { id: "pit", src: top("pit"), bone: "torso", z: 4 },
      at("lurker", top("lurker"), "gun", 0, -10, 5),
    ],
  });

const sett = (cw: Colourway): Look =>
  structure("warren", "The Sett Lab", {
    h: 140,
    r: 92,
    weapon: "biters",
    fx: cw.glow,
    side: [
      { id: "sett", src: side("sett"), bone: "torso", z: 4 },
      at("dish", side("dish"), "head", 16, -108, 3, { anim: { pulse: 0.04 } }),
      at("biters", side("biters"), "gun", 70, 0, 5),
    ],
    top: [
      { id: "sett", src: top("sett"), bone: "torso", z: 4 },
      at("biters", side("biters"), "gun", -60, -64, 5, { rot: -30 }),
    ],
  });

export default defineTemplateArt({
  key: "munch",
  colourway: (_f, spec) => munchColourway(spec.primary, "beetle"),
  units: {
    nibblers: (ctx) => squad(ctx, "beetle", beetle),
    spitter: (ctx) => squad(ctx, "spider", spider),
    buzz: (ctx) => squad(ctx, "wasp", wasps),
    mama: (ctx) => one(ctx, "badger", mama),
    pod: (ctx) => one(ctx, "lab", vat),
    hole: (ctx) => one(ctx, "dirt", hole),
    pit: (ctx) => one(ctx, "dirt", pit),
    warren: (ctx) => one(ctx, "dirt", sett),
    hoppers: (ctx) => squad(ctx, "fox", fox),
  },
});
