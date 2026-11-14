import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FACTIONS, registerCustomFactions } from "../src/engine/data/factions";
import { factionProblems } from "../src/engine/data/factionValidation";
import type { Faction, UnitArt } from "../src/engine/types";
import { duplicateProfile } from "../src/forge/model";
import { cleanFaction, copyFaction, exportable, importFaction, listCustomFactions, saveCustomFaction } from "../src/ui/customFactions";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
}
const g = globalThis as unknown as { localStorage?: MemoryStorage };

beforeEach(() => {
  g.localStorage = new MemoryStorage();
});
afterEach(() => {
  delete g.localStorage;
  registerCustomFactions([]);
});

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const IMAGE: UnitArt = { kind: "image", dataUrl: PNG };
const PARTS: UnitArt = { kind: "parts", recipe: { body: "walker", head: "visor", headgear: "antennae", weapon: "cannon", back: "jets", secondary: 0x7fe7ff, scale: 1.1 } };

function withArt(): Faction {
  const f = copyFaction(FACTIONS.militia!, "Art test");
  f.profiles[0]!.art = structuredClone(PARTS);
  f.profiles[1]!.art = structuredClone(IMAGE);
  return f;
}

describe("unit art in custom factions", () => {
  it("is valid, survives structuredClone, and is kept by cleanFaction", () => {
    const f = withArt();
    expect(factionProblems(f)).toEqual([]);
    const c = cleanFaction(structuredClone(f));
    expect(c.profiles[0]!.art).toEqual(PARTS);
    expect(c.profiles[1]!.art).toEqual(IMAGE);
    expect(c.profiles[2]!.art).toBeUndefined();
  });

  it("round-trips through save, storage and the registry", () => {
    const f = withArt();
    expect(saveCustomFaction(f)).toEqual([]);
    const saved = listCustomFactions().find((x) => x.id === f.id)!;
    expect(saved.profiles[0]!.art).toEqual(PARTS);
    expect(saved.profiles[1]!.art).toEqual(IMAGE);
    expect(FACTIONS[f.id]!.profiles[1]!.art).toEqual(IMAGE);
  });

  it("round-trips through export and import (with fresh ids)", () => {
    const f = withArt();
    const file = JSON.parse(JSON.stringify(exportable(f)));
    const r = importFaction(file, [f.id]);
    expect(r.problems).toEqual([]);
    expect(r.renamed).toBe(true);
    expect(r.faction!.profiles[0]!.art).toEqual(PARTS);
    expect(r.faction!.profiles[1]!.art).toEqual(IMAGE);
  });

  it("strips unsafe or unknown art on import, with notes", () => {
    const raw = JSON.parse(JSON.stringify(exportable(withArt())));
    raw.faction.profiles[0].art = { kind: "image", dataUrl: "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+" };
    raw.faction.profiles[1].art = { kind: "parts", recipe: { body: "dragon", head: "visor", headgear: "none", weapon: "none", back: "none", secondary: 1, scale: 1 }, html: "<b>" };
    raw.faction.profiles[2].art = "<img src=x onerror=alert(1)>";
    const r = importFaction(raw);
    expect(r.problems).toEqual([]);
    expect(r.faction!.profiles[0]!.art).toBeUndefined();
    expect(r.faction!.profiles[1]!.art).toEqual({ kind: "parts", recipe: { body: "trooper", head: "visor", headgear: "none", weapon: "none", back: "none", secondary: 1, scale: 1 } });
    expect(r.faction!.profiles[2]!.art).toBeUndefined();
    expect(r.notes.filter((n) => /image|miniature/i.test(n)).length).toBeGreaterThanOrEqual(3);
  });

  it("flags bad art in validation, and never stores it", () => {
    const f = withArt();
    (f.profiles[1]!.art as { dataUrl: string }).dataUrl = "data:image/png;base64,PHN2Zz4=";
    expect(factionProblems(f).join(" ")).toMatch(/isn't a PNG, JPEG or WebP/);
    expect(saveCustomFaction(f)).toEqual([]);
    const saved = listCustomFactions().find((x) => x.id === f.id)!;
    expect(saved.profiles[1]!.art).toBeUndefined();
    expect(saved.profiles[0]!.art).toEqual(PARTS);
  });

  it("copies art when a profile is duplicated or the faction is copied", () => {
    const f = withArt();
    const dup = duplicateProfile(f, f.profiles[0]!.id)!;
    expect(dup.art).toEqual(PARTS);
    expect(dup.art).not.toBe(f.profiles[0]!.art);
    const again = copyFaction(f, "Again");
    expect(again.profiles[2]!.art).toEqual(IMAGE);
  });
});
