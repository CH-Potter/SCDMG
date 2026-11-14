import { describe, expect, it } from "vitest";
import { FACTIONS } from "../src/engine/data/factions";
import { factionProblems, KEYWORDS, TRAITS } from "../src/engine/data/factionValidation";
import type { Faction } from "../src/engine/types";
import { copyFaction, exportable, importFaction } from "../src/ui/customFactions";

const builtIn = (id: string): Faction => structuredClone(FACTIONS[id]!);
const has = (problems: string[], text: string) => problems.some((p) => p.includes(text));

describe("weapon traits, nerve and fearless", () => {
  it("knows the new keyword and traits", () => {
    expect(KEYWORDS).toContain("fearless");
    expect([...TRAITS].sort()).toEqual(["blast", "heavy", "pistol", "rending", "torrent"]);
  });

  it("validates traits and nerve", () => {
    const f = builtIn("militia");
    const g = f.profiles[0]!;
    (g.weapons[0] as unknown as { traits: string[] }).traits = ["rending", "laser"];
    g.weapons[1]!.traits = ["pistol", "pistol"];
    g.nerve = 13;
    f.profiles[1]!.nerve = 1.5;
    const p = factionProblems(f);
    expect(has(p, 'unknown trait "laser"')).toBe(true);
    expect(has(p, "a trait is listed twice")).toBe(true);
    expect(has(p, "Rivet Grunts: nerve must be a whole number from 2 to 12")).toBe(true);
    expect(has(p, "Patch Medic: nerve must")).toBe(true);
    const ok = builtIn("militia");
    ok.profiles[0]!.nerve = 2;
    ok.profiles[0]!.keywords.push("fearless");
    expect(factionProblems(ok)).toEqual([]);
  });

  it("allows traits in upgrade weapon patches", () => {
    const f = builtIn("militia");
    const flak = f.profiles.find((p) => p.id === "mil-rustler")!.upgrades[0]!;
    flak.weapon = { index: 0, patch: { traits: ["blast"] } };
    expect(factionProblems(f)).toEqual([]);
  });

  it("keeps traits and nerve through copy and import, and coerces them", () => {
    for (const id of ["militia", "munch", "concord"]) {
      const src = FACTIONS[id]!;
      const f = copyFaction(src, "Keep");
      src.profiles.forEach((p, i) => {
        expect(f.profiles[i]!.nerve).toBe(p.nerve);
        expect(f.profiles[i]!.weapons.map((w) => w.traits)).toEqual(p.weapons.map((w) => w.traits));
      });
      expect(importFaction(JSON.parse(JSON.stringify(exportable(f))), []).faction).toEqual(f);
    }
    const raw = JSON.parse(JSON.stringify(exportable(copyFaction(FACTIONS.munch!, "Coerce")))) as {
      faction: { profiles: { nerve?: unknown; keywords: string[]; weapons: { traits?: unknown }[] }[] };
    };
    const p0 = raw.faction.profiles[0]!;
    p0.nerve = "8";
    p0.keywords.push("fearless");
    p0.weapons[0]!.traits = ["torrent", "<img src=x>"];
    const r = importFaction(raw, []);
    const out = r.faction!.profiles[0]!;
    expect(out.nerve).toBe(8);
    expect(out.keywords).toContain("fearless");
    expect(out.weapons[0]!.traits).toEqual(["torrent"]);
    expect(r.notes.some((n) => n.includes("weapon trait"))).toBe(true);
    expect(r.problems).toEqual([]);
  });
});
