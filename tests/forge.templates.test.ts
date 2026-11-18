// The faction forge's trope templates (src/forge/templates): every one is a complete, valid, playable
// custom faction whose starter lists fit both modes, whose miniatures validate, and which starts as a
// fresh copy. Two of them then play a whole AI-vs-AI game without an illegal move.

import { afterEach, describe, expect, it } from "vitest";
import { aiCommand } from "../src/engine/ai";
import { BUILT_IN_FACTION_IDS, FACTIONS, registerCustomFactions } from "../src/engine/data/factions";
import { factionProblems, starterFor } from "../src/engine/data/factionValidation";
import { MODES, type ModeId } from "../src/engine/data/modes";
import { artProblems, cleanArt, MINI_BACKS, MINI_BODIES, MINI_HEADGEAR, MINI_HEADS, MINI_WEAPONS } from "../src/engine/data/unitArt";
import { slotCounts, slotProblems, unitClassOf } from "../src/engine/data/unitClasses";
import { applyCommand, createGame } from "../src/engine/game";
import { priceUnit, supportFizz, upgradeCost } from "../src/engine/pricing";
import type { Faction } from "../src/engine/types";
import { startFromTemplate, TEMPLATE_PREFIX, TEMPLATES, templateByKey } from "../src/forge/templates";
import { cleanFaction } from "../src/ui/customFactions";

afterEach(() => registerCustomFactions([]));

const builtIns = (): Faction[] => BUILT_IN_FACTION_IDS.map((id) => FACTIONS[id]!);
const profileIn = (f: Faction) => (id: string) => f.profiles.find((p) => p.id === id);

describe("trope templates", () => {
  it("cover both groups with unique keys and names", () => {
    expect(TEMPLATES.filter((t) => t.group === "grimdark").length).toBeGreaterThanOrEqual(6);
    expect(TEMPLATES.filter((t) => t.group === "fantasy").length).toBeGreaterThanOrEqual(5);
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(TEMPLATES.length);
    expect(new Set(TEMPLATES.map((t) => t.faction.name)).size).toBe(TEMPLATES.length);
    expect(new Set(TEMPLATES.map((t) => t.faction.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) {
      expect(t.faction.id).toBe(`${TEMPLATE_PREFIX}${t.key}`);
      expect(templateByKey(t.key)).toBe(t);
      expect(t.trope.length).toBeGreaterThan(0);
      expect(t.faction.blurb.length).toBeGreaterThan(0);
    }
  });

  it("are not built-in factions and are not registered with the game", () => {
    for (const t of TEMPLATES) {
      expect(FACTIONS[t.faction.id]).toBeUndefined();
      expect((BUILT_IN_FACTION_IDS as readonly string[]).includes(t.faction.id)).toBe(false);
    }
  });

  for (const t of TEMPLATES) {
    describe(`${t.key}: ${t.faction.name}`, () => {
      const f = t.faction;

      it("is a valid faction after cleanFaction, with computed costs", () => {
        const clean = cleanFaction(structuredClone(f));
        expect(factionProblems(clean, { others: builtIns() })).toEqual([]);
        expect(clean).toEqual(f); // already clean and priced
        for (const p of f.profiles) {
          expect(p.cost, p.name).toBe(priceUnit(p).cost);
          expect(p.supply, p.name).toBe(priceUnit(p).supply);
          for (const u of p.upgrades) expect(u.cost, `${p.name}: ${u.name}`).toBe(upgradeCost(p, u));
        }
        for (const s of f.supports) expect(s.fizz, s.name).toBe(supportFizz(s, profileIn(f)));
      });

      it("has a full roster: 6 to 10 buyable units over several classes, each armed with two or more abilities", () => {
        const buyable = f.profiles.filter((p) => !p.structure?.summonOnly);
        expect(buyable.length).toBeGreaterThanOrEqual(6);
        expect(buyable.length).toBeLessThanOrEqual(10);
        const classes = new Set(buyable.map((p) => unitClassOf(p)));
        expect(classes.has("base")).toBe(true);
        expect(classes.has("support")).toBe(true);
        expect(classes.has("static")).toBe(true);
        expect(classes.size).toBeGreaterThanOrEqual(4);
        for (const p of buyable) {
          expect(p.abilities.length, p.name).toBeGreaterThanOrEqual(2);
          if (!p.structure) expect(p.weapons.length, p.name).toBeGreaterThan(0);
        }
      });

      it("has 3 to 5 support cards with two abilities and army slots each, plus faction slots", () => {
        expect(f.supports.length).toBeGreaterThanOrEqual(3);
        expect(f.supports.length).toBeLessThanOrEqual(5);
        for (const s of f.supports) {
          expect(s.abilities.length, s.name).toBeGreaterThanOrEqual(2);
          expect(s.slots, s.name).toBeDefined();
        }
        expect(f.slots).toBeDefined();
      });

      for (const mode of ["skirmish", "assault"] as ModeId[]) {
        it(`its ${mode} starter army fits the mode's limits and class slots`, () => {
          const m = MODES[mode];
          const { entries, supports } = starterFor(f, mode);
          const cost = entries.reduce((s, e) => {
            const p = profileIn(f)(e.profileId)!;
            return s + p.cost + e.upgrades.reduce((n, u) => n + p.upgrades.find((x) => x.id === u)!.cost, 0);
          }, 0);
          expect(cost).toBeLessThanOrEqual(m.rosterLimit);
          expect(entries.length).toBeLessThanOrEqual(m.maxUnits);
          const fizz = supports.reduce((s, id) => s + f.supports.find((x) => x.id === id)!.fizz, 0);
          expect(fizz).toBeLessThanOrEqual(m.fizzLimit);
          const counts = slotCounts(
            mode,
            f,
            entries,
            supports.map((id) => f.supports.find((x) => x.id === id)!),
            profileIn(f),
          );
          expect(slotProblems(counts)).toEqual([]);
        });
      }

      it("gives every unit a miniature built from parts that validates", () => {
        for (const p of f.profiles) {
          expect(p.art?.kind, p.name).toBe("parts");
          expect(artProblems(p.art, p.name)).toEqual([]);
          const notes: string[] = [];
          expect(cleanArt(structuredClone(p.art), notes, p.name)).toEqual(p.art);
          expect(notes).toEqual([]);
        }
      });
    });
  }
});

describe("miniature parts added for the templates", () => {
  it("keeps every original part and adds the new ones", () => {
    expect(MINI_BODIES).toEqual(expect.arrayContaining(["trooper", "critter", "brute", "walker", "flyer", "structure", "rider"]));
    expect(MINI_HEADS).toEqual(expect.arrayContaining(["face", "visor", "beast", "gem", "skull", "bug", "beard"]));
    expect(MINI_HEADGEAR).toEqual(expect.arrayContaining(["none", "helmet", "hat", "goggles", "horns", "crown", "antennae", "hood", "plume"]));
    expect(MINI_WEAPONS).toEqual(expect.arrayContaining(["none", "rifle", "cannon", "blade", "claws", "staff", "bow", "shield", "axe"]));
    expect(MINI_BACKS).toEqual(expect.arrayContaining(["none", "pack", "jets", "tank", "banner", "wings"]));
  });

  it("validates old and new recipes alike, and still rejects unknown parts", () => {
    const old = { kind: "parts", recipe: { body: "walker", head: "visor", headgear: "antennae", weapon: "cannon", back: "jets", secondary: 0x7fe7ff, scale: 1.1 } };
    const fresh = { kind: "parts", recipe: { body: "rider", head: "skull", headgear: "plume", weapon: "shield", back: "wings", secondary: 0xffc23a, scale: 1 } };
    expect(artProblems(old, "Old")).toEqual([]);
    expect(artProblems(fresh, "New")).toEqual([]);
    expect(cleanArt(fresh)).toEqual(fresh);
    for (const [part, value] of [["head", "bug"], ["head", "beard"], ["headgear", "hood"], ["weapon", "bow"], ["weapon", "axe"]] as const)
      expect(artProblems({ kind: "parts", recipe: { ...fresh.recipe, [part]: value } }, "Part")).toEqual([]);
    expect(artProblems({ kind: "parts", recipe: { ...fresh.recipe, body: "dragon" } }, "Bad")).toEqual(['Bad: unknown miniature body "dragon"']);
  });
});

describe("starting a template", () => {
  it("makes a fresh custom faction with re-prefixed, unique ids and the template untouched", () => {
    const started: Faction[] = [];
    for (const t of TEMPLATES) {
      const before = JSON.stringify(t.faction);
      const notes: string[] = [];
      const f = startFromTemplate(t, undefined, notes);
      expect(JSON.stringify(t.faction)).toBe(before);
      expect(notes).toEqual([]); // nothing trimmed: the starter lists fit as written
      expect(f.name).toBe(t.faction.name);
      expect(f.id.startsWith("custom-")).toBe(true);
      expect(f.id.startsWith(TEMPLATE_PREFIX)).toBe(false);
      expect(f.custom).toBeUndefined();
      const ids = [...f.profiles.map((p) => p.id), ...f.supports.map((s) => s.id)];
      expect(new Set(ids).size).toBe(ids.length);
      for (const p of f.profiles) {
        expect(p.id.startsWith(`${f.id}:`)).toBe(true);
        expect(p.faction).toBe(f.id);
      }
      for (const s of f.supports) {
        expect(s.id.startsWith(`${f.id}:`)).toBe(true);
        expect(s.faction).toBe(f.id);
        for (const a of s.abilities) if (a.effect.kind === "summon") expect(profileIn(f)(a.effect.profileId)?.structure?.summonOnly).toBe(true);
      }
      for (const e of [...f.defaultList, ...f.assaultExtras]) expect(profileIn(f)(e.profileId)).toBeDefined();
      for (const id of [...f.defaultSupports, ...f.assaultSupports]) expect(f.supports.some((s) => s.id === id)).toBe(true);
      expect(f.defaultList.length).toBe(t.faction.defaultList.length);
      expect(f.assaultExtras.length).toBe(t.faction.assaultExtras.length);
      expect(factionProblems(f, { others: [...builtIns(), ...started] })).toEqual([]);
      started.push(f);
    }
    const a = startFromTemplate(TEMPLATES[0]!);
    const b = startFromTemplate(TEMPLATES[0]!);
    expect(a.id).not.toBe(b.id);
  });

  it("can be renamed on the way in", () => {
    const f = startFromTemplate(templateByKey("hive")!, "My Bugs");
    expect(f.name).toBe("My Bugs");
    expect(f.id.startsWith("custom-my-bugs-")).toBe(true);
  });
});

describe("templates in play", () => {
  // Register two started templates as custom factions and let the AI play a whole game.
  const playOut = (keys: [string, string], mapId: string, seed: number) => {
    const a = startFromTemplate(templateByKey(keys[0])!);
    const b = startFromTemplate(templateByKey(keys[1])!);
    registerCustomFactions([
      { ...a, custom: true },
      { ...b, custom: true },
    ]);
    let s = createGame({ factions: [a.id, b.id], mapId, seed, orderChoice: true });
    let steps = 0;
    for (; steps < 4000 && !s.over; steps++) {
      const cmd = aiCommand(s);
      const r = applyCommand(s, cmd);
      if (!r.ok) throw new Error(`illegal AI move at step ${steps}: ${JSON.stringify(cmd)}: ${r.error}`);
      s = r.state;
    }
    expect(s.over).toBe(true);
    expect(s.units.some((u) => u.owner === 0)).toBe(true);
    expect(s.units.some((u) => u.owner === 1)).toBe(true);
  };

  it("a grimdark and a fantasy template finish a Skirmish game without an illegal move", () => playOut(["hive", "knights"], "dustbowl", 3), 240_000);

  it("two more finish an Assault game without an illegal move", () => playOut(["bulwark", "undead"], "highway", 8), 240_000);
});
