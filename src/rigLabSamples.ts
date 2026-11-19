// Rig Lab sample units for the generic kits: custom-style profiles covering every kit frame and most
// recipe choices, plus units with no recipe (classified from their stats) and one with an uploaded
// picture (the standee). Dev only.

import type { Keyword, MiniatureRecipe, UnitProfile } from "./engine/types";
import type { FactionLook } from "./ui/minis/kits/spec";

export interface Sample {
  profile: UnitProfile;
  faction: FactionLook;
}

const FID = "custom-kit-samples";
const gun = { name: "Gun", melee: false, range: 18, dice: 1, hit: 4, damage: 1, ap: 0, targets: "all" as const };
const bigGun = { ...gun, name: "Big gun", range: 24, damage: 2 };
const sword = { name: "Blade", melee: true, range: 0, dice: 1, hit: 4, damage: 1, ap: 0, targets: "ground" as const };

let n = 0;
function unit(name: string, o: { kw?: Keyword[]; models?: number; base?: number; recipe?: Partial<MiniatureRecipe>; ranged?: boolean; melee?: boolean; heavy?: boolean; structure?: UnitProfile["structure"]; abilities?: string[] }): UnitProfile {
  const p: UnitProfile = {
    id: `${FID}:s${++n}`,
    name,
    faction: FID,
    cost: 3,
    supply: 2,
    models: o.models ?? 1,
    move: o.structure ? 0 : 6,
    hp: 2,
    shield: 0,
    armor: 4,
    baseRadius: o.base ?? 0.55,
    keywords: o.kw ?? ["infantry"],
    weapons: [...(o.ranged === false ? [] : [o.heavy ? bigGun : gun]), ...(o.melee ? [sword] : [])],
    abilities: (o.abilities ?? []) as UnitProfile["abilities"],
    upgrades: [],
    blurb: "",
  };
  if (o.structure) p.structure = o.structure;
  if (o.recipe) p.art = { kind: "parts", recipe: { body: "trooper", head: "face", headgear: "none", weapon: "rifle", back: "none", secondary: 0xe2c13a, scale: 1, ...o.recipe } };
  return p;
}

/** A small picture for the standee sample: a bold original emblem drawn on a canvas. */
function emblem(): string {
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2f5f8f";
  g.fillRect(0, 0, 96, 96);
  g.fillStyle = "#f2d16b";
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 18 : 40;
    g.lineTo(48 + Math.cos(a) * r, 48 + Math.sin(a) * r);
  }
  g.fill();
  g.fillStyle = "#141414";
  g.beginPath();
  g.arc(48, 50, 9, 0, Math.PI * 2);
  g.fill();
  return c.toDataURL("image/png");
}

const TEAL: FactionLook = { color: 0x2f7fb8, look: "plain" };
const RED: FactionLook = { color: 0xb8432f, look: "cap" };
const GREEN: FactionLook = { color: 0x5f8f3a, look: "teeth" };
const VIOLET: FactionLook = { color: 0x8a6ad0, look: "crystal" };

export function kitSamples(): Sample[] {
  n = 0;
  const s = (f: FactionLook, p: UnitProfile): Sample => ({ profile: p, faction: f });
  const pic = emblem();
  const out: Sample[] = [
    s(TEAL, unit("Visored line", { models: 5, kw: ["infantry", "armoured"], recipe: { head: "visor", headgear: "helmet", weapon: "rifle", back: "pack" } })),
    s(RED, unit("Hat and bow", { models: 3, recipe: { head: "face", headgear: "hat", weapon: "bow", back: "none", secondary: 0x6b4a2a } })),
    s(RED, unit("Bearded axes", { models: 3, kw: ["infantry", "armoured"], recipe: { head: "beard", headgear: "horns", weapon: "axe", back: "pack", scale: 0.9 } })),
    s(VIOLET, unit("Hooded seer", { recipe: { head: "skull", headgear: "hood", weapon: "staff", back: "tank" } })),
    s(GREEN, unit("Bug jumpers", { models: 4, kw: ["infantry", "jump"], recipe: { head: "bug", headgear: "antennae", weapon: "claws", back: "jets", secondary: 0xc8ef5a } })),
    s(VIOLET, unit("Crystal wings", { models: 2, kw: ["infantry", "flying"], recipe: { head: "gem", headgear: "crown", weapon: "shield", back: "wings" } })),
    s(TEAL, unit("Goggled gunner", { recipe: { head: "face", headgear: "goggles", weapon: "cannon", back: "pack" } })),
    s(RED, unit("Plumed knights", { models: 3, kw: ["infantry", "armoured"], recipe: { head: "visor", headgear: "plume", weapon: "blade", back: "none", secondary: 0xf0f0f0 } })),
    s(GREEN, unit("Snapping critters", { models: 4, kw: ["beast"], base: 0.45, ranged: false, melee: true, recipe: { body: "critter", head: "beast", headgear: "none", weapon: "claws" } })),
    s(GREEN, unit("Spitting bug", { kw: ["beast"], base: 0.5, recipe: { body: "critter", head: "bug", headgear: "antennae", weapon: "cannon" } })),
    s(RED, unit("Horned brute", { kw: ["monster"], base: 1.2, melee: true, recipe: { body: "brute", head: "beast", headgear: "horns", weapon: "axe", back: "none" } })),
    s(TEAL, unit("Stomp walker", { kw: ["mech", "heavy"], base: 1.2, heavy: true, recipe: { body: "walker", head: "visor", headgear: "none", weapon: "cannon" } })),
    s(TEAL, unit("Hover pod", { kw: ["mech", "flying"], base: 0.9, recipe: { body: "flyer", head: "visor", headgear: "none", weapon: "cannon", back: "jets" } })),
    s(VIOLET, unit("Winged skiff", { kw: ["flying"], base: 0.9, recipe: { body: "flyer", head: "gem", headgear: "none", weapon: "staff", back: "wings" } })),
    s(RED, unit("Lancer rider", { kw: ["infantry"], base: 0.9, melee: true, ranged: false, recipe: { body: "rider", head: "face", headgear: "helmet", weapon: "blade" } })),
    s(TEAL, unit("Bunker turret", { kw: ["structure"], base: 0.9, heavy: true, structure: { lifetime: "permanent" } })),
    s(VIOLET, unit("Crystal beacon", { kw: ["structure"], base: 0.9, ranged: false, structure: { lifetime: "permanent" } })),
    s(GREEN, unit("Spore pod", { kw: ["structure"], base: 0.9, structure: { lifetime: "permanent" } })),
    s(VIOLET, unit("Summoned ward", { kw: ["structure"], base: 0.6, ranged: false, structure: { lifetime: "round", summonOnly: true } })),
    // no recipe: classified from keywords and stats
    s(TEAL, unit("Stat-only squad", { models: 4, kw: ["infantry"], melee: true })),
    s(GREEN, unit("Stat-only beast", { models: 2, kw: ["beast"], base: 0.5, ranged: false, melee: true })),
    s(RED, unit("Stat-only monster", { kw: ["monster"], base: 1.3, melee: true })),
  ];
  if (pic) {
    const p = unit("Uploaded picture", { models: 2 });
    p.art = { kind: "image", dataUrl: pic };
    out.push(s(TEAL, p));
  }
  return out;
}
