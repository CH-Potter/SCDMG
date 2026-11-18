import { describe, expect, it } from "vitest";
import { BUILT_IN_FACTION_IDS, FACTIONS, listCost } from "../src/engine/data/factions";
import { factionProblems, fizzLimitOf, listCostIn, starterStats } from "../src/engine/data/factionValidation";
import type { Faction } from "../src/engine/types";

const builtIn = (id: string): Faction => structuredClone(FACTIONS[id]!);
const has = (problems: string[], text: string) => problems.some((p) => p.includes(text));

describe("factionProblems", () => {
  it("finds no problems in the built-in factions", () => {
    for (const id of BUILT_IN_FACTION_IDS) expect(factionProblems(FACTIONS[id]), id).toEqual([]);
  });

  it("computes starter costs from the faction itself, matching the engine", () => {
    for (const id of BUILT_IN_FACTION_IDS) {
      const f = FACTIONS[id]!;
      expect(listCostIn(f, f.defaultList)).toBe(listCost(f.defaultList));
      expect(starterStats(f, "assault").units).toBe(f.defaultList.length + f.assaultExtras.length);
    }
    expect(fizzLimitOf("skirmish")).toBeGreaterThan(0);
  });

  it("rejects things that aren't factions", () => {
    expect(factionProblems(null)).toEqual(["Not a faction"]);
    expect(factionProblems([])).toEqual(["Not a faction"]);
    expect(factionProblems({}).length).toBeGreaterThan(3);
  });

  it("catches missing and duplicate ids", () => {
    const f = builtIn("militia");
    f.profiles[1]!.id = f.profiles[0]!.id;
    f.supports[0]!.id = "";
    f.profiles[0]!.upgrades[1]!.id = f.profiles[0]!.upgrades[0]!.id;
    const p = factionProblems(f);
    expect(has(p, "duplicate id \"mil-grunts\"")).toBe(true);
    expect(has(p, "Grange Hall Command: missing id")).toBe(true);
    expect(has(p, "duplicate id \"extra\"")).toBe(true);
  });

  it("catches ids used by another faction and unprefixed custom ids", () => {
    const f = builtIn("swarm");
    f.id = "custom-test";
    for (const p of f.profiles) p.faction = f.id;
    for (const s of f.supports) s.faction = f.id;
    const p = factionProblems(f);
    expect(has(p, "already used by The Skitterswarm")).toBe(true);
    expect(has(p, 'id must start with "custom-test:"')).toBe(true);
    const g = builtIn("swarm");
    g.id = "rogue";
    expect(has(factionProblems(g), 'must start with "custom-"')).toBe(true);
    const h = builtIn("swarm");
    h.custom = true;
    expect(has(factionProblems(h), "built-in faction id")).toBe(true);
  });

  it("catches unknown keywords and abilities", () => {
    const f = builtIn("concord") as unknown as { profiles: { keywords: string[]; abilities: string[]; upgrades: { addAbilities?: string[] }[] }[] };
    f.profiles[0]!.keywords.push("wizard");
    f.profiles[1]!.abilities.push("teleport-everything");
    f.profiles[0]!.upgrades[0]!.addAbilities = ["nope"];
    const p = factionProblems(f);
    expect(has(p, 'unknown keyword "wizard"')).toBe(true);
    expect(has(p, 'unknown ability "teleport-everything"')).toBe(true);
    expect(has(p, 'unknown ability "nope"')).toBe(true);
  });

  it("catches unknown units, upgrades and supports in the starter lists", () => {
    const f = builtIn("militia");
    f.defaultList[0]!.upgrades = ["laser-cows"];
    f.assaultExtras.push({ profileId: "mil-ghost", upgrades: [] });
    f.assaultSupports.push("mil-nothing");
    const p = factionProblems(f);
    expect(has(p, 'no upgrade "laser-cows"')).toBe(true);
    expect(has(p, 'unknown unit "mil-ghost"')).toBe(true);
    expect(has(p, 'unknown support "mil-nothing"')).toBe(true);
  });

  it("rejects summon-only structures in lists", () => {
    const f = builtIn("militia");
    f.defaultList.push({ profileId: "mil-junk", upgrades: [] });
    expect(has(factionProblems(f), "summon-only and can't be in a list")).toBe(true);
  });

  it("checks summon targets", () => {
    const f = builtIn("militia");
    const summon = f.supports[1]!.abilities[0]!.effect as { profileId: string };
    summon.profileId = "mil-ghost";
    expect(has(factionProblems(f), "isn't a unit in this faction")).toBe(true);
    summon.profileId = "mil-turret";
    expect(has(factionProblems(f), "Scrap Turret isn't one")).toBe(true);
    summon.profileId = "mil-grunts";
    expect(has(factionProblems(f), "Rivet Grunts isn't one")).toBe(true);
  });

  it("catches impossible stats", () => {
    const f = builtIn("militia");
    const g = f.profiles[0]!;
    g.models = 0;
    g.hp = -1;
    g.baseRadius = 0;
    g.armor = 8;
    g.cost = -2;
    g.weapons[0]!.hit = 1;
    g.weapons[0]!.dice = 1.5;
    g.weapons[0]!.range = 0;
    (g as unknown as { move: unknown }).move = "fast";
    f.supports[0]!.abilities[0]!.cp = 9;
    const p = factionProblems(f);
    for (const t of ["models must", "HP must", "base radius must", "armour save must", "cost must", "hit must", "dice must", "range must", "move must", "CP cost must"])
      expect(has(p, t), t).toBe(true);
  });

  it("requires structures to be consistent", () => {
    const f = builtIn("militia");
    const turret = f.profiles.find((p) => p.id === "mil-turret")!;
    turret.move = 4;
    turret.keywords = ["mech"];
    const grunts = f.profiles[0]!;
    grunts.keywords.push("structure");
    const p = factionProblems(f);
    expect(has(p, "Scrap Turret: structures can't move")).toBe(true);
    expect(has(p, 'Scrap Turret: structures need the "structure" keyword')).toBe(true);
    expect(has(p, 'Rivet Grunts: has the "structure" keyword but no structure settings')).toBe(true);
  });

  it("checks weapon patches in upgrades", () => {
    const f = builtIn("militia");
    const flak = f.profiles.find((p) => p.id === "mil-rustler")!.upgrades[0]!;
    flak.weapon = { index: 5, patch: {} };
    expect(has(factionProblems(f), "changes a weapon that doesn't exist")).toBe(true);
    flak.weapon = { index: 0, patch: { hit: 9 } };
    expect(has(factionProblems(f), "(changed weapon): hit must")).toBe(true);
  });

  it("enforces the mode limits on the starter lists", () => {
    const f = builtIn("militia");
    f.defaultList.push({ profileId: "mil-grunts", upgrades: [] });
    const p = factionProblems(f);
    expect(has(p, "Skirmish starter list: 4 × Rivet Grunts")).toBe(true);
    const g = builtIn("militia");
    g.profiles[0]!.cost = 20;
    expect(has(factionProblems(g), "over the limit of 30")).toBe(true);
    const h = builtIn("militia");
    h.supports.find((x) => x.id === h.defaultSupports[0])!.fizz = 9; // with a 4-Fizz second card: 13
    expect(has(factionProblems(h), "Skirmish starter supports: cost ✦13 Fizz")).toBe(true);
    const k = builtIn("militia");
    k.defaultList = [];
    expect(has(factionProblems(k), "add at least one unit")).toBe(true);
  });

  it("checks impact on charge", () => {
    const f = builtIn("swarm");
    const borer = f.profiles.find((p) => p.id === "swarm-borer")!;
    borer.impact = { dice: 0, hit: 7, damage: 0, ap: -1 };
    const p = factionProblems(f);
    for (const t of ["impact dice", "impact hit", "impact damage", "impact AP"]) expect(has(p, `Deep Borer: ${t}`), t).toBe(true);
    const spire = f.profiles.find((x) => x.id === "swarm-spire")!;
    spire.impact = { dice: 1, hit: 4, damage: 1, ap: 0 };
    expect(has(factionProblems(f), "Brood Spire: structures can't charge")).toBe(true);
  });

  it("checks effect parameters", () => {
    const f = builtIn("concord");
    const sun = f.supports[2]!.abilities[0]!;
    sun.effect = { kind: "blast", radius: 50, hit: 1, damage: 0, ap: 0, range: 24, needsSight: true };
    const p = factionProblems(f);
    expect(has(p, "blast radius")).toBe(true);
    expect(has(p, "blast hit")).toBe(true);
    expect(has(p, "blast damage")).toBe(true);
    (sun as unknown as { effect: unknown }).effect = { kind: "nuke" };
    expect(has(factionProblems(f), "unknown effect")).toBe(true);
  });

  it("accepts army slots: known classes, whole numbers from 0 to 2", () => {
    const f = builtIn("swarm");
    f.slots = { base: 2, elite: 0 };
    f.supports[0]!.slots = { flyer: 1, static: 2 };
    expect(factionProblems(f)).toEqual([]);
    delete f.slots;
    delete f.supports[0]!.slots;
    expect(factionProblems(f)).toEqual([]); // optional: built-ins use the tables
  });

  it("rejects bad army slots", () => {
    const f = builtIn("swarm");
    (f as unknown as { slots: unknown }).slots = { base: 3, flyer: -1, elite: 1.5, wizard: 1 };
    (f.supports[0] as unknown as { slots: unknown }).slots = "lots";
    (f.supports[1] as unknown as { slots: unknown }).slots = { support: "1" };
    const p = factionProblems(f);
    expect(has(p, "Faction: Base slots must be a whole number from 0 to 2")).toBe(true);
    expect(has(p, "Faction: Flyer slots must be")).toBe(true);
    expect(has(p, "Faction: Elite slots must be")).toBe(true);
    expect(has(p, `Faction: unknown unit class "wizard"`)).toBe(true);
    expect(has(p, `${f.supports[0]!.name}: army slots must be a set of numbers`)).toBe(true);
    expect(has(p, `${f.supports[1]!.name}: Support slots must be`)).toBe(true);
  });
});
