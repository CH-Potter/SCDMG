import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FACTIONS, PROFILES, SUPPORTS, registerCustomFactions } from "../src/engine/data/factions";
import { factionProblems } from "../src/engine/data/factionValidation";
import type { Faction } from "../src/engine/types";
import {
  addProfile,
  addSupport,
  removeProfile,
  removeSupport,
  removeUpgrade,
  removeWeapon,
  setProfileKind,
} from "../src/forge/model";
import {
  blankFaction,
  cleanFaction,
  copyFaction,
  deleteCustomFaction,
  exportable,
  importFaction,
  listCustomFactions,
  saveCustomFaction,
} from "../src/ui/customFactions";

// A minimal in-memory localStorage for the storage tests (vitest runs in node).
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

describe("copying a faction", () => {
  it("re-prefixes every id and fixes internal references", () => {
    for (const id of ["militia", "munch", "concord"]) {
      const src = FACTIONS[id]!;
      const before = JSON.stringify(src);
      const f = copyFaction(src, "My copy");
      expect(JSON.stringify(src)).toBe(before); // the built-in is untouched
      expect(f.id.startsWith("custom-my-copy-")).toBe(true);
      expect(f.custom).toBeUndefined();
      for (const p of f.profiles) {
        expect(p.id.startsWith(`${f.id}:`)).toBe(true);
        expect(p.faction).toBe(f.id);
      }
      for (const s of f.supports) {
        expect(s.id.startsWith(`${f.id}:`)).toBe(true);
        expect(s.faction).toBe(f.id);
        for (const a of s.abilities) if (a.effect.kind === "summon") expect(f.profiles.some((p) => p.id === (a.effect as { profileId: string }).profileId)).toBe(true);
      }
      for (const e of [...f.defaultList, ...f.assaultExtras]) expect(f.profiles.some((p) => p.id === e.profileId)).toBe(true);
      for (const s of [...f.defaultSupports, ...f.assaultSupports]) expect(f.supports.some((x) => x.id === s)).toBe(true);
      expect(factionProblems(f), id).toEqual([]);
    }
  });

  it("carries impact on charge into copies and through import", () => {
    for (const id of ["militia", "munch"]) {
      const src = FACTIONS[id]!;
      const f = copyFaction(src, "Impact");
      const withImpact = src.profiles.filter((p) => p.impact);
      for (const p of withImpact) expect(f.profiles.find((x) => x.name === p.name)!.impact).toEqual(p.impact);
      const back = importFaction(JSON.parse(JSON.stringify(exportable(f))), []);
      expect(back.faction).toEqual(f);
    }
    const raw = JSON.parse(JSON.stringify(exportable(copyFaction(FACTIONS.munch!, "Coerce")))) as { faction: { profiles: Record<string, unknown>[] } };
    raw.faction.profiles[0]!.impact = { dice: "2", hit: "<b>", damage: 1, ap: 0, junk: true };
    const r = importFaction(raw, []);
    expect(r.faction!.profiles[0]!.impact!.dice).toBe(2);
    expect(Number.isNaN(r.faction!.profiles[0]!.impact!.hit)).toBe(true);
    expect("junk" in r.faction!.profiles[0]!.impact!).toBe(false);
    expect(r.problems.some((p) => p.includes("impact hit"))).toBe(true);
  });

  it("gives two copies different ids", () => {
    const a = copyFaction(FACTIONS.militia!, "Same name");
    const b = copyFaction(FACTIONS.militia!, "Same name");
    expect(a.id).not.toBe(b.id);
  });

  it("makes a valid blank faction", () => {
    expect(factionProblems(blankFaction("Blank"))).toEqual([]);
  });
});

describe("forge editing helpers keep references consistent", () => {
  it("removing a profile drops its list entries and empties summons", () => {
    const f = copyFaction(FACTIONS.militia!, "Edit me");
    const junk = f.profiles.find((p) => p.id.endsWith(":mil-junk"))!;
    const grunts = f.profiles.find((p) => p.id.endsWith(":mil-grunts"))!;
    removeProfile(f, grunts.id);
    removeProfile(f, junk.id);
    expect(f.defaultList.some((e) => e.profileId === grunts.id)).toBe(false);
    const p = factionProblems(f);
    expect(p.some((x) => x.includes("pick a structure to summon"))).toBe(true);
  });

  it("switching kinds auto-fixes structures", () => {
    const f = blankFaction("Kinds");
    const p = addProfile(f, "unit");
    p.impact = { dice: 1, hit: 4, damage: 1, ap: 0 };
    setProfileKind(f, p, "structure");
    expect(p.impact).toBeUndefined();
    expect(p.move).toBe(0);
    expect(p.keywords).toContain("structure");
    setProfileKind(f, p, "summon");
    expect(p.structure).toEqual({ lifetime: "round", summonOnly: true });
    setProfileKind(f, p, "unit");
    expect(p.structure).toBeUndefined();
    expect(p.keywords).not.toContain("structure");
    expect(p.move).toBeGreaterThan(0);
    expect(factionProblems(f)).toEqual([]);
  });

  it("removing weapons, upgrades and supports fixes their references", () => {
    const f = copyFaction(FACTIONS.militia!, "Refs");
    const rustler = f.profiles.find((p) => p.id.endsWith(":mil-rustler"))!;
    rustler.weapons.unshift({ name: "Extra", melee: true, range: 0, dice: 1, hit: 4, damage: 1, ap: 0, targets: "ground" });
    rustler.upgrades[0]!.weapon!.index = 1;
    removeWeapon(rustler, 0);
    expect(rustler.upgrades[0]!.weapon!.index).toBe(0);
    const grunts = f.profiles.find((p) => p.id.endsWith(":mil-grunts"))!;
    removeUpgrade(f, grunts, "jets");
    expect(f.defaultList.some((e) => e.upgrades.includes("jets"))).toBe(false);
    removeSupport(f, f.defaultSupports[0]!);
    const s = addSupport(f);
    expect(s.id.startsWith(`${f.id}:`)).toBe(true);
    expect(factionProblems(f)).toEqual([]);
  });
});

describe("importing factions", () => {
  it("round-trips an exported faction", () => {
    const f = copyFaction(FACTIONS.concord!, "Round trip");
    const file = JSON.parse(JSON.stringify(exportable(f)));
    const r = importFaction(file, []);
    expect(r.problems).toEqual([]);
    expect(r.renamed).toBe(false);
    expect(r.faction).toEqual(f);
  });

  it("re-ids clashes with built-ins and taken ids", () => {
    const r = importFaction(JSON.parse(JSON.stringify(FACTIONS.munch)), []);
    expect(r.renamed).toBe(true);
    expect(r.faction!.id.startsWith("custom-")).toBe(true);
    expect(r.problems).toEqual([]);
    const f = copyFaction(FACTIONS.munch!, "Taken");
    const again = importFaction(exportable(f), [f.id]);
    expect(again.renamed).toBe(true);
    expect(again.faction!.id).not.toBe(f.id);
    expect(again.faction!.profiles.every((p) => p.id.startsWith(`${again.faction!.id}:`))).toBe(true);
    expect(again.problems).toEqual([]);
  });

  it("coerces types and drops unknown fields so markup can't ride along", () => {
    const evil = JSON.parse(JSON.stringify(exportable(copyFaction(FACTIONS.militia!, "Evil")))) as { faction: Record<string, unknown> };
    const raw = evil.faction;
    raw.look = "<script>";
    raw.color = "#ff0000";
    raw.onload = "alert(1)";
    const p0 = (raw.profiles as Record<string, unknown>[])[0]!;
    p0.cost = "4";
    p0.hp = '"><img src=x onerror=alert(1)>';
    p0.keywords = ["infantry", "<b>bad</b>"];
    p0.extra = { nested: true };
    const w0 = (p0.weapons as Record<string, unknown>[])[0]!;
    w0.targets = "everything";
    w0.melee = "yes";
    const r = importFaction(evil, []);
    const f = r.faction!;
    expect(f.look).toBe("plain");
    expect(f.color).toBe(0xff0000);
    expect("onload" in f).toBe(false);
    expect(f.profiles[0]!.cost).toBe(4);
    expect(Number.isNaN(f.profiles[0]!.hp)).toBe(true);
    expect(f.profiles[0]!.keywords).toEqual(["infantry"]);
    expect("extra" in f.profiles[0]!).toBe(false);
    expect(f.profiles[0]!.weapons[0]!.targets).toBe("all");
    expect(f.profiles[0]!.weapons[0]!.melee).toBe(false);
    expect(r.notes.length).toBeGreaterThanOrEqual(3);
    expect(r.problems.some((p) => p.includes("HP must"))).toBe(true);
  });

  it("auto-fixes structures on import", () => {
    const f = copyFaction(FACTIONS.concord!, "Fix me");
    const pylon = f.profiles.find((p) => p.id.endsWith(":con-pylon"))!;
    pylon.move = 3;
    pylon.keywords = [];
    const r = importFaction(exportable(f), []);
    const fixed = r.faction!.profiles.find((p) => p.id === pylon.id)!;
    expect(fixed.move).toBe(0);
    expect(fixed.keywords).toContain("structure");
    expect(r.problems).toEqual([]);
  });

  it("rejects non-factions", () => {
    expect(importFaction("hello").faction).toBeNull();
    expect(importFaction({ format: "scdmg-list" }).faction).toBeNull();
  });

  it("keeps a clean faction intact through cleanFaction", () => {
    for (const id of ["militia", "munch", "concord"]) expect(cleanFaction(JSON.parse(JSON.stringify(FACTIONS[id])))).toEqual(FACTIONS[id]);
  });
});

describe("custom faction storage", () => {
  it("saves, lists, registers and deletes", () => {
    const f = copyFaction(FACTIONS.militia!, "Stored");
    expect(saveCustomFaction(f)).toEqual([]);
    expect(listCustomFactions().map((x) => x.id)).toEqual([f.id]);
    expect(FACTIONS[f.id]?.custom).toBe(true);
    expect(PROFILES[f.profiles[0]!.id]).toBeDefined();
    expect(SUPPORTS[f.supports[0]!.id]).toBeDefined();
    // saving again replaces rather than duplicates
    f.name = "Stored again";
    expect(saveCustomFaction(f)).toEqual([]);
    expect(listCustomFactions()).toHaveLength(1);
    expect(listCustomFactions()[0]!.name).toBe("Stored again");
    deleteCustomFaction(f.id);
    expect(listCustomFactions()).toEqual([]);
    expect(FACTIONS[f.id]).toBeUndefined();
    expect(PROFILES[f.profiles[0]!.id]).toBeUndefined();
  });

  it("refuses invalid factions and built-in ids", () => {
    const f = copyFaction(FACTIONS.munch!, "Broken");
    f.profiles[0]!.hp = 0;
    expect(saveCustomFaction(f).length).toBeGreaterThan(0);
    expect(saveCustomFaction(structuredClone(FACTIONS.munch!) as Faction).length).toBeGreaterThan(0);
    expect(listCustomFactions()).toEqual([]);
  });

  it("skips corrupt storage entries", () => {
    const ok = copyFaction(FACTIONS.concord!, "Good");
    g.localStorage!.setItem("scdmg.customFactions.v1", JSON.stringify([{ id: "custom-bad" }, 42, ok]));
    expect(listCustomFactions().map((x) => x.id)).toEqual([ok.id]);
  });
});
