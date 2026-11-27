import { describe, expect, it } from "vitest";
import { aiCommand } from "../src/engine/ai";
import { applyCommand, createGame } from "../src/engine/game";
import { rerollMisses, rerollProblem } from "../src/engine/reroll";
import type { FactionId } from "../src/engine/types";

describe("re-roll offers", () => {
  it("are only made for re-rolls the engine will accept (never a lobbed shell), and the AI only asks for those", () => {
    let offered = 0;
    // Games (with seeds) where the AI used to ask to re-roll a lobbed shell, which the engine refuses.
    const games: [FactionId, FactionId, number][] = [
      ["militia", "swarm", 4],
      ["concord", "militia", 25],
      ["swarm", "concord", 2],
    ];
    for (const [a, b, seed] of games) {
      // Banked CP leaves the AI CP to spare, so re-rolls come up often.
      let s = createGame({ factions: [a, b], mapId: "dustbowl", orderChoice: true, seed, rules: { reroll: true, cardCp: false } });
      for (let n = 0; n < 500 && !s.over; n++) {
        const cmd = aiCommand(s)!;
        const r = applyCommand(s, cmd);
        if (!r.ok) throw new Error(`the AI made an illegal move: ${r.error} (${JSON.stringify(cmd)})`);
        if ((cmd.type === "shoot" || cmd.type === "fight") && rerollMisses(s, cmd, r.events) > 0) {
          offered++;
          const again = applyCommand(structuredClone(s), { ...cmd, reroll: true });
          expect(again.ok ? null : again.error).toBeNull();
        }
        s = r.state;
      }
    }
    expect(offered).toBeGreaterThan(0);
  }, 60000);

  it("name the engine's refusal for a re-roll that can't be made", () => {
    const s = createGame({ factions: ["militia", "swarm"], mapId: "dustbowl", seed: 3 });
    expect(rerollProblem(s, { type: "shoot", uid: "nope", target: "x", weapon: 0, reroll: true })).toBeTruthy();
  });
});
