// Round flow the UI walks the player through: phases nobody can act in are skipped silently, and
// the end of the round reports each step (scores, recharges, upkeep) as its own event.

import { describe, expect, it } from "vitest";
import { applyCommand, createGame } from "../src/engine/game";
import type { GameEvent, GameState } from "../src/engine/types";
import { registerMunch } from "./helpers/munch";

// The Munch are a Forge template now: register a test copy under their old ids.
registerMunch();

function passUntil(s: GameState, done: (s: GameState) => boolean): { s: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (let i = 0; i < 200 && !done(s); i++) {
    const r = applyCommand(s, { type: "pass", player: s.activePlayer });
    if (!r.ok) throw new Error(r.error);
    events.push(...r.events);
    s = r.state;
  }
  return { s, events };
}

describe("round flow", () => {
  it("with nobody in melee, the combat phase is skipped without a banner: straight to scoring", () => {
    let s = createGame({ factions: ["militia", "munch"], seed: 3 });
    // A unit each, far apart, so the assault phase happens but nobody ends up engaged.
    for (const [owner, y] of [
      [0, 32],
      [1, 3],
    ] as const) {
      const u = s.units.find((x) => x.owner === owner)!;
      u.onBoard = true;
      u.models.forEach((m, i) => (m.pos = { x: 4 + i * 1.3, y }));
    }
    const { s: after, events } = passUntil(s, (x) => x.round === 2);
    const phases = events.filter((e): e is Extract<GameEvent, { type: "phase" }> => e.type === "phase" && e.round === 1).map((e) => e.phase);
    expect(phases).toContain("assault");
    expect(phases).not.toContain("combat");
    expect(phases).toContain("scoring");
    expect(after.round).toBe(2);
  });

  it("the end of the round reports upkeep for each side, after the scores", () => {
    const s = createGame({ factions: ["militia", "munch"], seed: 4 });
    const { events } = passUntil(s, (x) => x.round === 2);
    const upkeep = events.filter((e): e is Extract<GameEvent, { type: "upkeep" }> => e.type === "upkeep");
    expect(upkeep.map((e) => e.player).sort()).toEqual([0, 1]);
    for (const e of upkeep) expect(e.resources).toBeGreaterThan(0);
    const ended = events.findIndex((e) => e.type === "roundEnded");
    expect(events.findIndex((e) => e.type === "upkeep")).toBeGreaterThan(events.findIndex((e) => e.type === "phase" && e.phase === "scoring"));
    expect(ended).toBeGreaterThan(-1);
  });
});
