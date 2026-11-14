import { describe, expect, it } from "vitest";
import { MAPS } from "../src/engine/data/maps";
import { mapProblems } from "../src/engine/data/mapValidation";
import { cleanMap, importMap } from "../src/ui/customMaps";

describe("custom map import hygiene", () => {
  it("coerces fields so markup can't ride along in numbers or enums", () => {
    const evil = structuredClone(MAPS.dustbowl) as unknown as Record<string, unknown>;
    const objs = evil.objectives as Record<string, unknown>[];
    objs[0]!.radius = '"><img src=x onerror=alert(1)>';
    objs[0]!.number = "<b>1</b>";
    objs[0]!.elevation = "<i>";
    (evil.terrain as Record<string, unknown>[])[0]!.kind = "<script>";
    const clean = cleanMap(evil);
    expect(typeof clean.objectives[0]!.radius).toBe("number");
    expect(typeof clean.objectives[0]!.number).toBe("number");
    expect(clean.objectives[0]!.elevation).toBe(0);
    expect(clean.terrain[0]!.kind).toBeUndefined();
    expect(mapProblems(clean).length).toBeGreaterThan(0);
  });

  it("keeps a clean built-in map intact", () => {
    const back = cleanMap(JSON.parse(JSON.stringify(MAPS.highway)));
    expect(mapProblems(back)).toEqual([]);
    expect(importMap(JSON.parse(JSON.stringify(MAPS.highway))).renamed).toBe(true);
  });
});
