import { describe, expect, it } from "vitest";
import { blastOn } from "../src/engine/combat";
import { createGame } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { aliveModels } from "../src/engine/rules";
import type { GameEvent, Unit } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

const game = (seed: number) => createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed, missionId: "brawl" });
const unitOf = (s: ReturnType<typeof game>, id: string): Unit => s.units.find((u) => u.profileId === id)!;

describe("barrages and support blasts", () => {
  it("let a target that evades blasts roll its evade for every hit", () => {
    let hits = 0;
    let dodged = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = game(seed);
      const pack = unitOf(s, "munch-nibblers");
      const ev = profileOf(pack).evade!;
      expect(ev.against).toContain("blast");
      const events: GameEvent[] = [];
      const r = blastOn(s, pack, aliveModels(pack), { hit: 4, damage: 1, ap: 0 }, events);
      const h = r.hitRolls.filter((x) => x >= 4).length;
      if (!h) continue;
      expect(r.evadeOn).toBe(ev.target);
      expect(r.evadeRolls).toHaveLength(h);
      // Only hits that weren't dodged go on to a save.
      const through = r.evadeRolls!.filter((x) => x < r.evadeOn!).length;
      expect(r.saveRolls).toHaveLength(through);
      hits += h;
      dodged += h - through;
    }
    expect(hits).toBeGreaterThan(50);
    expect(dodged).toBeGreaterThan(0);
  });

  it("a target with no blast evade rolls none", () => {
    const s = game(3);
    const grunts = unitOf(s, "mil-grunts");
    expect(profileOf(grunts).evade?.against ?? []).not.toContain("blast");
    const r = blastOn(s, grunts, aliveModels(grunts), { hit: 2, damage: 1, ap: 0 }, []);
    expect(r.evadeRolls).toBeUndefined();
  });

  it("always allows the target its save, even when the caster has no unit on the table", () => {
    const s = game(5);
    for (const u of s.units) if (u.owner === 0) u.onBoard = false; // the caster's whole army is in reserve
    const grunts = unitOf(s, "mil-grunts");
    const r = blastOn(s, grunts, aliveModels(grunts), { hit: 2, damage: 1, ap: 0 }, []);
    expect(r.saveOn.length).toBeGreaterThan(0);
    expect(r.saveOn.every((x) => x === profileOf(grunts).armor)).toBe(true);
  });
});
