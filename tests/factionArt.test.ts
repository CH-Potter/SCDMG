// The faction art outside the battlefield: every base faction has its own intro and emblem, the intros
// and title cards show the new miniatures (Ink Rig), the Munch only survives as a Forge template, and
// the miniature stills (src/ui/art/rigPortrait.ts) are framed and inked the way the DOM needs them.

import { describe, expect, it } from "vitest";
import { BUILT_IN_FACTION_IDS, PROFILES } from "../src/engine/data/factions";
import { LORE_FACTION_IDS } from "../src/engine/data/lore";
import { emblemFor, factionEmblemSvg } from "../src/ui/art/emblems";
import { hasRigPortrait, rigPortrait, rigPortraitFit, rigPortraitUrl } from "../src/ui/art/rigPortrait";
import { factionIntro, GAME_INTRO } from "../src/ui/intro/scripts";
import type { IntroDef, Kit } from "../src/ui/intro/stage";
import { RIGGED_PROFILES } from "../src/ui/minis/registry";

/** A stand-in DOM element: enough for the storyboards to build against. */
function fakeEl(): HTMLElement {
  return { style: {}, classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll: () => [], appendChild() {} } as unknown as HTMLElement;
}

/** Build every scene of an intro against a recording kit: which miniatures and emblems it shows. */
function record(def: IntroDef): { minis: string[]; emblems: string[] } {
  const minis: string[] = [];
  const emblems: string[] = [];
  for (const s of def.scenes) {
    const kit: Kit = {
      root: fakeEl(),
      still: true,
      dur: s.dur,
      add: () => fakeEl(),
      backdrop: () => fakeEl(),
      mini: (id) => (minis.push(id), fakeEl()),
      emblem: (fid) => (emblems.push(fid), fakeEl()),
      bubble: () => fakeEl(),
      burst: () => fakeEl(),
      anim() {},
      pop() {},
      fadeIn() {},
      shake() {},
      dust() {},
      sfx() {},
    };
    s.build(kit);
  }
  return { minis, emblems };
}

describe("faction art: every base faction has its own intro and emblem", () => {
  it("covers exactly the three base factions (the Munch is a Forge template now)", () => {
    expect([...LORE_FACTION_IDS].sort()).toEqual([...BUILT_IN_FACTION_IDS].sort());
    expect(LORE_FACTION_IDS).not.toContain("munch");
  });

  for (const fid of BUILT_IN_FACTION_IDS) {
    it(`${fid}: an intro in the house format, ending on its own title card`, () => {
      const def = factionIntro(fid);
      expect(def.id).toBe(fid);
      expect(def.scenes.length).toBe(5);
      for (const s of def.scenes) {
        expect(s.caption.length).toBeGreaterThan(10);
        expect(s.dur).toBeGreaterThanOrEqual(2500);
      }
      const { minis, emblems } = record(def);
      // the title card shows the faction's own emblem, and only its own units appear
      expect(emblems).toContain(fid);
      for (const id of minis) expect(PROFILES[id]?.faction, id).toBe(fid);
      // everything on screen is painted before the intro starts
      for (const id of minis) expect(def.cast, id).toContain(id);
    });

    it(`${fid}: a dedicated emblem, not the procedural custom one`, () => {
      const svg = factionEmblemSvg(fid, 64);
      expect(svg).toMatch(/^<svg class="emblem"/);
      expect(svg).toContain('role="img"');
      expect(svg).not.toMatch(/NaN|undefined/);
      expect(svg).not.toContain("Faction emblem");
      // the same faction always draws the same picture (only the per-instance ids differ)
      const strip = (s: string) => s.replace(/(ht|c)e\d+/g, "#");
      expect(strip(factionEmblemSvg(fid, 64))).toBe(strip(svg));
    });
  }

  it("the three emblems are all different, and differ from a custom faction's", () => {
    const strip = (s: string) => s.replace(/(ht|c|cl)[ew]\d+/g, "#");
    const all = BUILT_IN_FACTION_IDS.map((f) => strip(factionEmblemSvg(f, 64)));
    expect(new Set(all).size).toBe(3);
    const custom = strip(emblemFor(0xf28c28, "cap", "Dustline Militia", 64));
    expect(all).not.toContain(custom);
  });

  it("the Militia emblem reads as a drafted army: rank chevrons in the faction orange on a riveted plate", () => {
    const svg = factionEmblemSvg("militia", 64);
    expect(svg).toContain("Dustline Militia emblem");
    expect(svg.match(/stroke="#f28c28"/g)?.length).toBe(2);
    expect(svg.match(/<circle [^>]*fill="#ddd3ba"/g)?.length).toBe(5);
  });
});

describe("faction art: intros and title cards use the new miniatures", () => {
  const intros = [GAME_INTRO(), ...BUILT_IN_FACTION_IDS.map((f) => factionIntro(f))];
  for (const def of intros) {
    it(`${def.id}: every miniature on screen has Ink Rig art`, () => {
      const { minis } = record(def);
      expect(minis.length).toBeGreaterThan(5);
      for (const id of minis) {
        expect(RIGGED_PROFILES, id).toContain(id);
        expect(hasRigPortrait(id), id).toBe(true);
      }
      expect(minis.some((id) => id.startsWith("munch"))).toBe(false);
    });
  }
});

describe("miniature stills (rig portraits)", () => {
  it("draws every rigged unit in both views, inked by dilating the figure's alpha", () => {
    for (const id of RIGGED_PROFILES) {
      for (const view of ["side", "top"] as const) {
        const p = rigPortrait(id, { view, base: true });
        expect(p, `${id} ${view}`).not.toBeNull();
        const vb = p!.svg.match(/viewBox="([^"]+)"/)![1]!.split(" ").map(Number);
        expect(vb.every(Number.isFinite), `${id} ${view}`).toBe(true);
        expect(p!.svg).toContain('operator="dilate"');
        expect(p!.svg).toContain('filter="url(#ink)"');
        expect(p!.svg).not.toMatch(/NaN|undefined/);
        expect(p!.w).toBeGreaterThan(0.3);
        expect(p!.h).toBeGreaterThan(0.3);
        expect(p!.feetY).toBeGreaterThan(0);
        expect(p!.feetY).toBeLessThanOrEqual(1);
      }
    }
  });

  it("frames the side view symmetric about the feet, facing right unless asked", () => {
    const right = rigPortrait("mil-grunts")!;
    const left = rigPortrait("mil-grunts", { face: "left" })!;
    expect(right.feetX).toBe(0.5);
    expect(right.svg).toContain('transform="scale(-1 1)"');
    expect(left.svg).not.toContain('transform="scale(-1 1)"');
    const [x0, , w] = right.svg.match(/viewBox="([^"]+)"/)![1]!.split(" ").map(Number);
    expect(x0! + w! / 2).toBeCloseTo(0, 3);
  });

  it("paints the team colour, and picks the detail tier and outline weight by on-screen size", () => {
    expect(rigPortrait("mil-grunts", { team: 0x2fb5c8, base: true })!.svg.toLowerCase()).toContain("#2fb5c8");
    const close = rigPortrait("mil-grunts")!;
    const small = rigPortrait("mil-grunts", { ppi: 20 })!;
    expect(close.tier).toBe("sheet");
    expect(small.tier).toBe("tiny");
    const radius = (s: string) => Number(s.match(/radius="([\d.]+)"/)![1]);
    expect(radius(small.svg)).toBeGreaterThan(radius(close.svg));
    expect(rigPortraitFit("swarm-mother", 72)!.tier).not.toBe("sheet");
  });

  it("caches data URLs, and returns null for units without new-engine art", () => {
    const a = rigPortraitUrl("con-guard", { base: true });
    expect(a!.url.startsWith("data:image/svg+xml")).toBe(true);
    expect(rigPortraitUrl("con-guard", { base: true })).toBe(a);
    expect(rigPortrait("no-such-unit")).toBeNull();
    expect(hasRigPortrait("custom-x:mil-grunts")).toBe(false);
  });
});
