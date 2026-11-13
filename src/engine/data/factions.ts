import type { Faction, FactionId, UnitProfile, Weapon } from "../types";

// Original factions for SCDMG. Stats are first-pass and meant to be tuned through playtesting.

const ranged = (name: string, range: number, dice: number, hit: number, damage = 1, ap = 0): Weapon => ({
  name,
  melee: false,
  range,
  dice,
  hit,
  damage,
  ap,
});

const melee = (name: string, dice: number, hit: number, damage = 1, ap = 0): Weapon => ({
  name,
  melee: true,
  range: 0,
  dice,
  hit,
  damage,
  ap,
});

const militia: Faction = {
  id: "militia",
  name: "Dustline Militia",
  blurb:
    "Scrappy frontier settlers in patched-up work suits. Nothing matches, everything is held on with rivets, and they will not leave their farm.",
  color: 0xf28c28,
  defaultList: ["mil-grunts", "mil-grunts", "mil-medic", "mil-bertha", "mil-grunts"],
  profiles: [
    {
      id: "mil-grunts",
      name: "Rivet Grunts",
      faction: "militia",
      cost: 2,
      move: 6,
      hp: 4,
      shield: 0,
      armor: 5,
      baseRadius: 0.8,
      weapons: [ranged("Rivet Rifle", 18, 4, 4), melee("Shovel Swing", 2, 4)],
      abilities: ["entrench"],
      blurb: "Dig in, hold the line, complain loudly.",
    },
    {
      id: "mil-medic",
      name: "Patch Medic",
      faction: "militia",
      cost: 2,
      move: 6,
      hp: 3,
      shield: 0,
      armor: 5,
      baseRadius: 0.7,
      weapons: [ranged("Staple Pistol", 10, 2, 4), melee("Wrench", 1, 4)],
      abilities: ["medic", "entrench"],
      blurb: "Duct tape fixes people too, probably.",
    },
    {
      id: "mil-bertha",
      name: "Big Bertha",
      faction: "militia",
      cost: 4,
      move: 5,
      hp: 8,
      shield: 0,
      armor: 3,
      baseRadius: 1.3,
      weapons: [ranged("Thumper Cannon", 24, 3, 4, 2, 1), melee("Stomp", 2, 3, 2)],
      abilities: [],
      blurb: "A combine harvester someone bolted a cannon to.",
    },
  ],
};

const munch: Faction = {
  id: "munch",
  name: "The Munch",
  blurb:
    "A ravenous tide of goofy, toothy critters. They have one plan, and the plan is lunch. You are lunch.",
  color: 0x6cc24a,
  defaultList: ["munch-nibblers", "munch-nibblers", "munch-nibblers", "munch-spitter", "munch-spitter", "munch-mama"],
  profiles: [
    {
      id: "munch-nibblers",
      name: "Nibbler Pack",
      faction: "munch",
      cost: 1,
      move: 8,
      hp: 3,
      shield: 0,
      armor: 6,
      baseRadius: 0.7,
      weapons: [melee("Chompers", 4, 4)],
      abilities: ["regen", "swarm"],
      blurb: "Small, fast, and absolutely not house-trained.",
    },
    {
      id: "munch-spitter",
      name: "Goo Spitter",
      faction: "munch",
      cost: 2,
      move: 6,
      hp: 4,
      shield: 0,
      armor: 6,
      baseRadius: 0.8,
      weapons: [ranged("Goo Glob", 14, 3, 4, 1, 1), melee("Gummy Bite", 2, 5)],
      abilities: ["regen"],
      blurb: "Lobs sticky goo. Nobody knows where it keeps it.",
    },
    {
      id: "munch-mama",
      name: "Big Mama Chomp",
      faction: "munch",
      cost: 5,
      move: 6,
      hp: 10,
      shield: 0,
      armor: 4,
      baseRadius: 1.4,
      weapons: [melee("Mega Maw", 4, 3, 2, 1)],
      abilities: ["regen", "swarm"],
      blurb: "Mostly mouth. The rest is also mouth.",
    },
  ],
};

const concord: Faction = {
  id: "concord",
  name: "Lumen Concord",
  blurb:
    "Glowing crystal aristocrats who find everyone else faintly embarrassing. Few in number, hard to scratch, impossibly smug.",
  color: 0xb48cf2,
  defaultList: ["con-guard", "con-guard", "con-sniper", "con-skiff"],
  profiles: [
    {
      id: "con-guard",
      name: "Prism Guard",
      faction: "concord",
      cost: 3,
      move: 6,
      hp: 3,
      shield: 2,
      armor: 4,
      baseRadius: 0.8,
      weapons: [melee("Glow Blade", 3, 3, 1, 1), ranged("Light Flick", 12, 2, 3)],
      abilities: [],
      blurb: "Duellists who refuse to sweat.",
    },
    {
      id: "con-sniper",
      name: "Glimmer Lancer",
      faction: "concord",
      cost: 2,
      move: 5,
      hp: 2,
      shield: 2,
      armor: 5,
      baseRadius: 0.7,
      weapons: [ranged("Sunlance", 30, 2, 3, 2, 1), melee("Disdainful Poke", 1, 5)],
      abilities: [],
      blurb: "Shoots you from very far away, then sighs.",
    },
    {
      id: "con-skiff",
      name: "Shimmer Skiff",
      faction: "concord",
      cost: 4,
      move: 9,
      hp: 4,
      shield: 3,
      armor: 5,
      baseRadius: 1.1,
      weapons: [ranged("Flicker Cannon", 18, 3, 4, 1, 1)],
      abilities: ["phase"],
      blurb: "Blinks through walls. Very rude about it.",
    },
  ],
};

export const FACTIONS: Record<FactionId, Faction> = { militia, munch, concord };

export const PROFILES: Record<string, UnitProfile> = Object.fromEntries(
  Object.values(FACTIONS).flatMap((f) => f.profiles.map((p) => [p.id, p])),
);

export function profileOf(profileId: string): UnitProfile {
  const p = PROFILES[profileId];
  if (!p) throw new Error(`Unknown unit profile: ${profileId}`);
  return p;
}

export function listCost(list: string[]): number {
  return list.reduce((sum, id) => sum + profileOf(id).cost, 0);
}
