import { describe, expect, it } from "vitest";
import { defaultEvade, evadeProblem } from "../src/engine/data/agility";
import { FACTIONS, isBuiltInFaction } from "../src/engine/data/factions";
import { factionProblems } from "../src/engine/data/factionValidation";
import { TEMPLATES } from "../src/forge/templates";
import type { Faction, UnitProfile } from "../src/engine/types";

const builtIns = Object.values(FACTIONS).filter((f) => isBuiltInFaction(f.id));
const templates = TEMPLATES.map((t) => t.faction as Faction);
const all = (fs: Faction[]): UnitProfile[] => fs.flatMap((f) => f.profiles);

describe("evade is for small, agile units", () => {
  it("no big or slow unit has an evade (flyers dodge by flying)", () => {
    for (const p of [...all(builtIns), ...all(templates)]) if (p.evade) expect(evadeProblem(p), p.name).toBeNull();
  });

  it("every small, quick, unarmoured ground unit has one", () => {
    for (const p of [...all(builtIns), ...all(templates)]) {
      if (defaultEvade(p)) expect(p.evade, `${p.name} should be able to dodge`).toBeDefined();
    }
  });

  it("names the reason a unit can't evade", () => {
    expect(evadeProblem({ keywords: ["beast", "monster"], baseRadius: 1.4, move: 6 })).toMatch(/too big and slow/);
    expect(evadeProblem({ keywords: ["infantry"], baseRadius: 0.5, move: 4 })).toMatch(/too slow/);
    expect(evadeProblem({ keywords: ["flying", "mech"], baseRadius: 1.1, move: 10 })).toBeNull();
    expect(defaultEvade({ keywords: ["infantry", "light"], baseRadius: 0.5, move: 6 })).toEqual({ target: 5, against: ["pointBlank"] });
    expect(defaultEvade({ keywords: ["infantry", "armoured"], baseRadius: 0.6, move: 6 })).toBeUndefined();
  });

  it("validation rejects an evade on a monster", () => {
    const f = structuredClone(FACTIONS.swarm!) as Faction;
    const mother = f.profiles.find((p) => p.keywords.includes("monster"))!;
    mother.evade = { target: 5, against: ["ranged"] };
    expect(factionProblems(f).some((e) => /can't have an evade/.test(e))).toBe(true);
  });
});
