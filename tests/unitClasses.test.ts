import { describe, expect, it } from "vitest";
import { defaultListFor, defaultSupportsFor, FACTIONS, isBuiltInFaction } from "../src/engine/data/factions";
import { MODES, type ModeId } from "../src/engine/data/modes";
import { MODE_SLOTS, slotsText, supportSlots, unitClassOf, UNIT_CLASSES } from "../src/engine/data/unitClasses";
import { listSlotProblems, listSlots } from "../src/engine/listSlots";

const builtIns = Object.values(FACTIONS).filter((f) => isBuiltInFaction(f.id));

describe("unit classes", () => {
  it("are worked out from a unit's stats", () => {
    const cls = (id: string) => unitClassOf(builtIns.flatMap((f) => f.profiles).find((p) => p.id === id)!);
    expect(cls("mil-grunts")).toBe("base");
    expect(cls("mil-medic")).toBe("support"); // a team of 3 with Patch Up
    expect(cls("con-guard")).toBe("base"); // 3 models, no support ability
    expect(cls("mil-bertha")).toBe("elite");
    expect(cls("mil-rustler")).toBe("flyer");
    expect(cls("mil-turret")).toBe("static");
    expect(cls("munch-mama")).toBe("elite");
    expect(cls("munch-lobber")).toBe("elite");
    expect(cls("con-facet")).toBe("elite");
    expect(cls("con-lancer")).toBe("support");
    expect(cls("con-dancers")).toBe("base");
  });

  it("every built-in support card gives a slot", () => {
    for (const f of builtIns) for (const s of f.supports) expect(slotsText(supportSlots(s)), s.id).not.toBe("");
  });

  it("every starter list fits its slots", () => {
    for (const f of builtIns)
      for (const mode of Object.keys(MODES) as ModeId[]) {
        const problems = listSlotProblems(f.id, mode, defaultListFor(f.id, mode), defaultSupportsFor(f.id, mode));
        expect(problems, `${f.id} ${mode}: ${JSON.stringify(listSlots(f.id, mode, defaultListFor(f.id, mode), defaultSupportsFor(f.id, mode)))}`).toEqual([]);
      }
  });

  it("counts slots from the mode, the faction and the support cards", () => {
    const counts = listSlots("militia", "skirmish", [{ profileId: "mil-turret", upgrades: [] }], ["mil-depot"]);
    const st = counts.find((c) => c.cls === "static")!;
    expect(st).toMatchObject({ used: 1, max: MODE_SLOTS.skirmish.max.static + 1 + 1 }); // mode + Militia + Tractor Depot
    expect(listSlotProblems("militia", "skirmish", [{ profileId: "mil-turret", upgrades: [] }], [])).toContain("Needs at least 2 Base units: has 0");
    const elites = Array.from({ length: 2 }, () => ({ profileId: "mil-bertha", upgrades: [] }));
    expect(listSlotProblems("militia", "skirmish", elites, []).some((e) => e.startsWith("Too many Elite"))).toBe(true);
    expect(UNIT_CLASSES.length).toBe(5);
  });
});
