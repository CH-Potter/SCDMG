// The kit layer's first step: any UnitProfile (built-in, template or custom) → a KitSpec, the plain
// data the generic kits draw from. A parts recipe (the Forge's "build from parts") is honoured as it
// is; a unit without one is classified from its keywords, base size, weapons and abilities, the way
// the Classic archetypes are. Pure and cheap: it lives in the main chunk (the registry keys its art
// cache on it), while the kits that draw it load lazily.

import type { Faction, MiniBack, MiniBody, MiniHead, MiniHeadgear, MiniWeapon, UnitProfile } from "../../../engine/types";

export type Look = Faction["look"];

/** What the registry needs to know about a unit's faction: its colour and token look. */
export interface FactionLook {
  color: number;
  look: Look;
}

export interface KitSpec {
  /** Which kit frame draws it (the recipe's body names). */
  body: MiniBody;
  head: MiniHead;
  headgear: MiniHeadgear;
  weapon: MiniWeapon;
  back: MiniBack;
  /** Main colour (0xRRGGBB): the recipe's own, or the faction's. */
  primary: number;
  /** Trim colour. */
  secondary: number;
  /** Figure size against the body's design size: the recipe's size times a base-size factor. */
  scale: number;
  /** Models in the unit (squads get a leader look and a variant). */
  models: number;
  flying: boolean;
  /** A summon-only or one-round structure (a ward, a hole) rather than a permanent one. */
  temp: boolean;
  /** It has a gun (a structure with one is a turret; a critter with one carries it on its back). */
  ranged: boolean;
  armoured: boolean;
  mech: boolean;
  beast: boolean;
  look: Look;
  /** Uploaded picture art: drawn as a coin standee. A short hash of the image, not the image. */
  image?: string;
}

/** Each body's design base radius (inches): a figure on a bigger base is drawn bigger. */
export const BODY_BASE: Record<MiniBody, number> = { trooper: 0.55, critter: 0.45, brute: 1.1, walker: 1.1, flyer: 0.9, structure: 0.9, rider: 0.9 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Defaults by the faction's token look: what a unit with no recipe wears. */
const LOOK_HEAD: Record<Look, [MiniHead, MiniHeadgear]> = {
  cap: ["face", "helmet"],
  teeth: ["beast", "none"],
  crystal: ["gem", "crown"],
  plain: ["visor", "helmet"],
};
const LOOK_TRIM: Record<Look, number> = { cap: 0xe2b93a, teeth: 0xc8ef5a, crystal: 0xd9ccff, plain: 0xdcb55a };

/** A short stable hash (FNV-1a, base 36). */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** The kit spec for a unit of a faction. */
export function kitSpec(p: UnitProfile, f: FactionLook): KitSpec {
  const kw = new Set(p.keywords);
  const ab = new Set(p.abilities);
  const ranged = p.weapons.some((w) => !w.melee);
  const structure = !!p.structure || kw.has("structure");
  const flying = kw.has("flying") && !structure;
  const mech = kw.has("mech");
  const beast = kw.has("beast");
  const common = {
    models: Math.max(1, p.models),
    flying,
    temp: structure && (p.structure?.lifetime === "round" || !!p.structure?.summonOnly),
    ranged,
    armoured: kw.has("armoured"),
    mech,
    beast,
    look: f.look,
  };
  const sizeFor = (body: MiniBody, recipeScale = 1) => clamp(recipeScale * clamp((p.baseRadius / BODY_BASE[body]) ** 0.6, 0.75, 1.45), 0.55, 1.8);
  if (p.art?.kind === "parts") {
    const r = p.art.recipe;
    const body: MiniBody = structure ? "structure" : r.body === "structure" ? "trooper" : r.body;
    return { ...common, body, head: r.head, headgear: r.headgear, weapon: r.weapon, back: flying && r.back === "none" && body !== "flyer" ? "wings" : r.back, primary: r.primary ?? f.color, secondary: r.secondary, scale: sizeFor(body, r.scale) };
  }
  // no recipe (or a picture): an archetype from the profile, like the Classic figures
  let body: MiniBody;
  if (structure) body = "structure";
  else if (flying) body = beast ? "critter" : "flyer";
  else if (kw.has("monster")) body = mech ? "walker" : "brute";
  else if (mech) body = kw.has("light") ? "rider" : "walker";
  else if (beast) body = p.baseRadius >= 1.1 ? "brute" : "critter";
  else body = p.baseRadius >= 1.15 && kw.has("heavy") ? "walker" : "trooper";
  const [lookHead, lookGear] = LOOK_HEAD[f.look] ?? LOOK_HEAD.plain;
  const monster = kw.has("monster") && !mech;
  const head: MiniHead = beast ? (f.look === "teeth" ? "bug" : "beast") : monster ? (f.look === "crystal" ? "gem" : "beast") : mech && body !== "trooper" ? "visor" : lookHead;
  const headgear: MiniHeadgear = beast ? (kw.has("heavy") ? "horns" : "none") : monster ? (f.look === "crystal" ? "crown" : "horns") : body === "trooper" ? lookGear : "none";
  const melee = p.weapons.filter((w) => w.melee);
  const guns = p.weapons.filter((w) => !w.melee);
  const caster = ab.has("radiance") || ab.has("recall");
  const heavyGun = guns.some((w) => w.damage >= 2 || (w.traits ?? []).includes("heavy") || w.dice >= 3);
  const weapon: MiniWeapon = caster
    ? "staff"
    : guns.length
      ? heavyGun || body === "walker" || body === "flyer" || body === "structure"
        ? "cannon"
        : "rifle"
      : melee.length
        ? beast
          ? "claws"
          : melee.some((w) => w.damage >= 2)
            ? "axe"
            : "blade"
        : "none";
  const medic = ab.has("patch-up") || ab.has("hatch");
  const back: MiniBack = flying && body !== "flyer" ? "wings" : kw.has("jump") ? "jets" : medic ? "tank" : body === "trooper" && guns.length ? "pack" : "none";
  const spec: KitSpec = { ...common, body, head, headgear, weapon, back, primary: f.color, secondary: LOOK_TRIM[f.look] ?? LOOK_TRIM.plain, scale: sizeFor(body) };
  if (p.art?.kind === "image") spec.image = `${shortHash(p.art.dataUrl)}.${p.art.dataUrl.length.toString(36)}`;
  return spec;
}

/** A stable key for a spec: every field that changes the drawing (the art cache and rig ids use it). */
export function specKey(s: KitSpec): string {
  return [s.body, s.head, s.headgear, s.weapon, s.back, s.primary.toString(16), s.secondary.toString(16), s.scale.toFixed(3), s.models, +s.flying, +s.temp, +s.ranged, +s.armoured, +s.mech, +s.beast, s.look, s.image ?? ""].join(".");
}
