// The canonical lore (src/engine/data/lore.ts) must match the game: every faction, unit, support,
// map and mission it names exists, and each built-in faction has a full write-up a campaign can use.

import { describe, expect, it } from "vitest";
import { BUILT_IN_FACTION_IDS, FACTIONS, PROFILES, SUPPORTS } from "../src/engine/data/factions";
import {
  BATTLES,
  CHARACTERS,
  LORE_FACTIONS,
  LORE_FACTION_IDS,
  PLACES,
  WORLD,
  battlesAt,
  battlesFor,
  characterById,
  charactersOf,
  factionLore,
  leaderOf,
  loreNote,
  placeById,
  placeForMap,
} from "../src/engine/data/lore";
import { MAPS } from "../src/engine/data/maps";
import { MISSIONS, missionMapProblem } from "../src/engine/data/missions";
import loreDoc from "../docs/lore.md?raw";
import readme from "../README.md?raw";

const unique = (xs: string[]) => new Set(xs).size === xs.length;

describe("lore: factions", () => {
  it("covers exactly the three built-in factions, by their game names", () => {
    expect([...LORE_FACTION_IDS].sort()).toEqual([...BUILT_IN_FACTION_IDS].sort());
    for (const id of BUILT_IN_FACTION_IDS) {
      const f = LORE_FACTIONS[id];
      expect(f.factionId).toBe(id);
      expect(f.name).toBe(FACTIONS[id]!.name);
      expect(factionLore(id)).toBe(f);
    }
    expect(factionLore("custom-anything")).toBeUndefined();
  });

  it("gives each faction a leader, a home, a goal, stakes, a story and a quote", () => {
    for (const id of LORE_FACTION_IDS) {
      const f = LORE_FACTIONS[id];
      const leader = characterById(f.leaderId);
      expect(leader, `${id} leader`).toBeDefined();
      expect(leader!.faction).toBe(id);
      expect(leaderOf(id)).toBe(leader);
      expect(charactersOf(id)[0]).toBe(leader);
      expect(placeById(f.homeId), `${id} home`).toBeDefined();
      for (const text of [f.epithet, f.tagline, f.goal, f.stakes, f.quote]) expect(text.trim().length).toBeGreaterThan(5);
      expect(f.story.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("only names units and supports that exist, in the right faction", () => {
    for (const id of LORE_FACTION_IDS) {
      const f = LORE_FACTIONS[id];
      expect(unique(f.units.map((u) => u.id)), `${id} unit notes are unique`).toBe(true);
      expect(unique(f.supports.map((s) => s.id)), `${id} support notes are unique`).toBe(true);
      for (const u of f.units) {
        expect(PROFILES[u.id], u.id).toBeDefined();
        expect(PROFILES[u.id]!.faction).toBe(id);
        expect(u.note.length).toBeGreaterThan(10);
      }
      for (const s of f.supports) {
        expect(SUPPORTS[s.id], s.id).toBeDefined();
        expect(SUPPORTS[s.id]!.faction).toBe(id);
      }
    }
  });

  it("has a note for every unit and support card of each built-in faction", () => {
    for (const id of LORE_FACTION_IDS) {
      const game = FACTIONS[id]!;
      const lore = LORE_FACTIONS[id];
      const missingUnits = game.profiles.map((p) => p.id).filter((pid) => !lore.units.some((u) => u.id === pid));
      const missingSupports = game.supports.map((s) => s.id).filter((sid) => !lore.supports.some((s) => s.id === sid));
      expect(missingUnits, `${id}: units without lore`).toEqual([]);
      expect(missingSupports, `${id}: supports without lore`).toEqual([]);
      for (const p of game.profiles) expect(loreNote(p.id)).toBeTruthy();
    }
  });

  it("has a short caption for every intro scene", () => {
    const captions = [WORLD.intro, ...LORE_FACTION_IDS.map((id) => LORE_FACTIONS[id].intro)];
    for (const list of captions) {
      expect(list.length).toBeGreaterThanOrEqual(4);
      for (const c of list) {
        expect(c.trim().length).toBeGreaterThan(5);
        expect(c.length).toBeLessThanOrEqual(110);
      }
    }
  });
});

describe("lore: characters and places", () => {
  it("has unique ids and valid references", () => {
    expect(unique(CHARACTERS.map((c) => c.id))).toBe(true);
    expect(unique(PLACES.map((p) => p.id))).toBe(true);
    for (const c of CHARACTERS) {
      if (c.unitId) expect(PROFILES[c.unitId], `${c.id} unit`).toBeDefined();
      if (c.unitId && c.faction) expect(PROFILES[c.unitId]!.faction).toBe(c.faction);
      if (c.supportId) expect(SUPPORTS[c.supportId], `${c.id} support`).toBeDefined();
      if (c.placeId) expect(placeById(c.placeId), `${c.id} place`).toBeDefined();
      expect(["he", "she", "they", "it"]).toContain(c.pronoun);
    }
  });

  it("uses the pronouns the game's own text sets", () => {
    expect(characterById("broodmother")!.pronoun).toBe("she");
    expect(characterById("broodmother")!.unitId).toBe("swarm-mother");
    expect(characterById("aunt-dot")!.pronoun).toBe("she");
    expect(characterById("grand-strider")!.pronoun).toBe("he");
    expect(characterById("grand-strider")!.name).toBe(PROFILES["con-facet"]!.name);
  });

  it("keeps the Munch out of the base lore: they live on as a forge template", () => {
    const text = JSON.stringify({ WORLD, PLACES, CHARACTERS, LORE_FACTIONS, BATTLES });
    expect(text).not.toMatch(/munch|Dr\. Graft|Big Mama|Sett Lab|overmind/i);
    for (const b of BATTLES) expect(b.sides).not.toContain("munch");
  });

  it("sets every built-in battlefield somewhere in the valley", () => {
    for (const mapId of Object.keys(MAPS)) expect(placeForMap(mapId), `place for map ${mapId}`).toBeDefined();
    for (const p of PLACES) if (p.mapId) expect(MAPS[p.mapId], `${p.id} map`).toBeDefined();
    for (const p of PLACES) if (p.mapId) expect(p.name.replace(/^The /, "")).toContain(MAPS[p.mapId]!.name.replace(/^The /, "").split(" ")[0]);
  });
});

describe("lore: battle seeds", () => {
  it("has unique ids and covers all three acts and every faction", () => {
    expect(unique(BATTLES.map((b) => b.id))).toBe(true);
    expect(new Set(BATTLES.map((b) => b.act))).toEqual(new Set([1, 2, 3]));
    for (const id of LORE_FACTION_IDS) expect(battlesFor(id).length).toBeGreaterThanOrEqual(4);
  });

  it("names a real place, map and mission, and the mission fits the map", () => {
    for (const b of BATTLES) {
      const place = placeById(b.placeId);
      expect(place, `${b.id} place`).toBeDefined();
      expect(place!.mapId).toBe(b.mapId);
      const map = MAPS[b.mapId];
      const mission = MISSIONS[b.missionId];
      expect(map, `${b.id} map`).toBeDefined();
      expect(mission, `${b.id} mission`).toBeDefined();
      expect(missionMapProblem(mission!, map!), `${b.id}: ${b.missionId} on ${b.mapId}`).toBeNull();
      expect(b.sides[0]).not.toBe(b.sides[1]);
      expect(battlesAt(b.placeId)).toContain(b);
    }
  });
});

describe("lore: docs", () => {
  const doc = loreDoc;

  it("docs/lore.md mentions every character, place and battle", () => {
    for (const c of CHARACTERS) expect(doc, c.name).toContain(c.name);
    for (const p of PLACES) expect(doc, p.name).toContain(p.name);
    for (const b of BATTLES) expect(doc, b.title).toContain(b.title);
    for (const id of LORE_FACTION_IDS) expect(doc).toContain(LORE_FACTIONS[id].name);
  });

  it("the README points to it", () => {
    expect(readme).toContain("docs/lore.md");
  });
});
