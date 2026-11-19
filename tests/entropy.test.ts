import { describe, expect, it } from "vitest";
import { applyCommand, createGame } from "../src/engine/game";
import { freshSeed, reseed } from "../src/ui/entropy";

describe("random dice in live games", () => {
  it("draws fresh 32-bit seeds from the crypto source", () => {
    const seeds = new Set(Array.from({ length: 50 }, () => freshSeed()));
    expect(seeds.size).toBeGreaterThan(45);
    for (const x of seeds) expect(Number.isInteger(x) && x >= 0 && x < 2 ** 32).toBe(true);
  });

  it("reseeds a state without touching anything else, so undo (the earlier state) keeps its dice", () => {
    const s = createGame({ factions: ["militia", "swarm"], seed: 1 });
    const r = applyCommand(s, { type: "pass", player: s.activePlayer });
    if (!r.ok) throw new Error(r.error);
    const before = s.rng;
    const after = reseed(r.state);
    expect(after).toBe(r.state);
    expect(s.rng).toBe(before); // the undo state is untouched
  });
});
