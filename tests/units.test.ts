// The second wave of built-in units: they exist, they're legal, they cover the roles each faction is
// meant to have, and the mechanics they lean on (fearless, torrent, burrow exits, jump) work.

import { describe, expect, it } from "vitest";
import { moraleCheck, planShooting } from "../src/engine/combat";
import { ABILITIES } from "../src/engine/data/abilities";
import { factionProblems } from "../src/engine/data/factionValidation";
import { BUILT_IN_FACTION_IDS, FACTIONS, baseProfile } from "../src/engine/data/factions";
import { createGame } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { unitById } from "../src/engine/rules";
import { deployZones } from "../src/engine/supports";
import type { GameEvent, GameState, ListEntry, Unit, UnitProfile, Vec } from "../src/engine/types";

const NEW_UNITS: Record<string, string[]> = {
  militia: ["mil-squinter", "mil-riders", "mil-grannies", "mil-bomber", "mil-mortar"],
  munch: ["munch-hoppers", "munch-lobber", "munch-flapjaw", "munch-nanny", "munch-warren"],
  concord: ["con-facet", "con-dancers", "con-sylph", "con-obelisk"],
};

const longest = (p: UnitProfile) => Math.max(0, ...p.weapons.filter((w) => !w.melee).map((w) => w.range));
const buyable = (p: UnitProfile) => !p.structure?.summonOnly;

function place(s: GameState, uid: string, at: Vec): Unit {
  const u = unitById(s, uid)!;
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.1), y: at.y + Math.floor(i / 3) * (2 * r + 0.1) };
    m.elevation = 0;
  });
  return u;
}

const entry = (profileId: string): ListEntry => ({ profileId, upgrades: [] });
const uidOf = (s: GameState, owner: 0 | 1, profileId: string): string => s.units.find((u) => u.owner === owner && u.profileId === profileId)!.uid;

describe("new units", () => {
  it("built-in factions still pass validation", () => {
    for (const id of BUILT_IN_FACTION_IDS) expect(factionProblems(FACTIONS[id]), id).toEqual([]);
  });

  for (const [fid, ids] of Object.entries(NEW_UNITS)) {
    it(`${fid}: 3-5 new units, buyable, with known abilities and some upgrades`, () => {
      expect(ids.length).toBeGreaterThanOrEqual(3);
      expect(ids.length).toBeLessThanOrEqual(5);
      let upgrades = 0;
      for (const id of ids) {
        const p = baseProfile(id);
        expect(p.faction).toBe(fid);
        expect(buyable(p), id).toBe(true);
        expect(p.blurb.length, id).toBeGreaterThan(10);
        for (const a of [...p.abilities, ...p.upgrades.flatMap((u) => u.addAbilities ?? [])]) expect(ABILITIES[a], `${id}: ${a}`).toBeDefined();
        upgrades += p.upgrades.length;
      }
      expect(upgrades).toBeGreaterThanOrEqual(ids.length);
    });
  }

  it("each faction has a flyer, a jumper, a monster or heavy, and a buyable structure; the shooting factions have long range", () => {
    for (const fid of BUILT_IN_FACTION_IDS) {
      const ps = FACTIONS[fid]!.profiles.filter(buyable);
      const has = (pred: (p: UnitProfile) => boolean) => ps.some(pred);
      // The Munch are a melee swarm: their spit and gloop are short-ranged on purpose (see docs/factions.md).
      if (fid !== "munch") expect(has((p) => longest(p) >= 26), `${fid} long range`).toBe(true);
      else expect(has((p) => longest(p) >= 26), `${fid} has no long-range gun`).toBe(false);
      expect(has((p) => p.keywords.includes("flying")), `${fid} flyer`).toBe(true);
      expect(
        has((p) => p.keywords.includes("jump") || p.upgrades.some((u) => u.addKeywords?.includes("jump"))),
        `${fid} jump`,
      ).toBe(true);
      expect(has((p) => p.keywords.includes("monster") || p.keywords.includes("heavy")), `${fid} big`).toBe(true);
      expect(ps.filter((p) => p.structure).length, `${fid} structures`).toBeGreaterThanOrEqual(2);
    }
  });

  it("every starter roster shows off some of the new units", () => {
    for (const [fid, ids] of Object.entries(NEW_UNITS)) {
      const f = FACTIONS[fid]!;
      expect(f.defaultList.some((e) => ids.includes(e.profileId)), `${fid} skirmish`).toBe(true);
      expect(f.assaultExtras.filter((e) => ids.includes(e.profileId)).length, `${fid} assault`).toBeGreaterThanOrEqual(2);
    }
  });

  it("new unit names are unique across the built-ins", () => {
    const names = BUILT_IN_FACTION_IDS.flatMap((f) => FACTIONS[f]!.profiles.map((p) => p.name));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("new unit mechanics", () => {
  it("Front Porch Grannies are fearless and never get Shaken", () => {
    const s = createGame({ factions: ["militia", "munch"], seed: 3, lists: [[entry("mil-grannies")], [entry("munch-nibblers")]] });
    const g = place(s, uidOf(s, 0, "mil-grannies"), { x: 10, y: 20 });
    g.models[0]!.alive = false;
    g.models[1]!.alive = false;
    g.models[2]!.hp = 1;
    for (let i = 0; i < 20; i++) moraleCheck(s, g, [] as GameEvent[]);
    expect(g.status.shaken).toBe(false);
  });

  it("the Hay Bomber's Fertiliser Drop auto-hits ground targets, gets blast dice, and can't hit flyers", () => {
    const s = createGame({
      factions: ["militia", "munch"],
      seed: 3,
      lists: [[entry("mil-bomber")], [entry("munch-nibblers"), entry("munch-flapjaw")]],
    });
    const b = place(s, uidOf(s, 0, "mil-bomber"), { x: 10, y: 20 });
    b.models[0]!.elevation = 2;
    const nibs = place(s, uidOf(s, 1, "munch-nibblers"), { x: 10, y: 15 });
    const drop = profileOf(b).weapons[0]!;
    const plan = planShooting(s, b, nibs, drop);
    if (typeof plan === "string") throw new Error(plan);
    expect(plan.attackers[0]!.dice).toBe(4); // 3 dice + blast against 6 models
    const flap = place(s, uidOf(s, 1, "munch-flapjaw"), { x: 14, y: 20 });
    flap.models[0]!.elevation = 2;
    expect(typeof planShooting(s, b, flap, drop)).toBe("string");
  });

  it("a Warren Mound lets Munch reserves deploy next to it", () => {
    const s = createGame({ factions: ["munch", "militia"], seed: 3, lists: [[entry("munch-warren"), entry("munch-hoppers")], [entry("mil-grunts")]] });
    const mound = place(s, uidOf(s, 0, "munch-warren"), { x: 17.5, y: 17.5 });
    const hoppers = unitById(s, uidOf(s, 0, "munch-hoppers"))!;
    const zones = deployZones(s, hoppers);
    expect(zones.length).toBeGreaterThan(s.spawn[0].length);
    void mound;
  });

  it("jumpers and flankers are faster than the line troops they support", () => {
    expect(baseProfile("munch-hoppers").move).toBeGreaterThan(baseProfile("munch-spitter").move);
    expect(baseProfile("con-dancers").move).toBeGreaterThan(baseProfile("con-guard").move);
    expect(baseProfile("mil-riders").move).toBeGreaterThan(baseProfile("mil-grunts").move);
  });
});
