import { describe, expect, it } from "vitest";
import { aiCommand } from "../src/engine/ai";
import { applyCommand, createGame } from "../src/engine/game";
import type { GameState } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

describe("attack events come before what they cause", () => {
  it("a morale test is logged after the attack on that unit, not before it", () => {
    let checked = 0;
    for (const seed of [1, 2, 3]) {
      let s: GameState = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed, missionId: "brawl" });
      for (let i = 0; i < 400 && !s.over; i++) {
        const r = applyCommand(s, aiCommand(s));
        if (!r.ok) break;
        s = r.state;
        r.events.forEach((e, idx) => {
          if (e.type !== "morale") return;
          // The attack that broke their nerve, if this batch has one, must come first.
          const attack = r.events.findIndex((x) => x.type === "attack" && x.report.target === e.uid);
          if (attack < 0) return;
          checked++;
          expect(attack, `seed ${seed}: attack on ${e.uid} logged after its morale test`).toBeLessThan(idx);
        });
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 60_000);
});
