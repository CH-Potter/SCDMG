import { describe, expect, it } from "vitest";
import { applyCommand, createGame } from "../src/engine/game";
import type { Command, GameState } from "../src/engine/types";

const ok = (s: GameState, cmd: Command): GameState => {
  const r = applyCommand(s, cmd);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

const fresh = (seed = 5) => createGame({ factions: ["militia", "munch"], seed, orderChoice: true });

describe("initiative and turn order", () => {
  it("the roll-off winner chooses who goes first, and nothing else happens until they do", () => {
    const s = fresh();
    expect(s.orderChoice).toEqual({ player: s.initiative, reason: "rolloff" });
    expect(s.activePlayer).toBe(s.orderChoice!.player);
    const chooser = s.orderChoice!.player;
    const blocked = applyCommand(s, { type: "pass", player: chooser });
    expect(blocked.ok).toBe(false);
    // Wrong player can't choose.
    expect(applyCommand(s, { type: "chooseOrder", player: chooser === 0 ? 1 : 0, goFirst: true }).ok).toBe(false);
    const after = ok(s, { type: "chooseOrder", player: chooser, goFirst: false });
    expect(after.orderChoice).toBeNull();
    expect(after.initiative).toBe(chooser === 0 ? 1 : 0);
    expect(after.activePlayer).toBe(after.initiative);
  });

  it("passing early in movement claims the lead in the assault phase", () => {
    let s = fresh(9);
    // Give each side a unit on the board so the assault phase actually happens.
    for (const [owner, y] of [
      [0, 32],
      [1, 3],
    ] as const) {
      const u = s.units.find((x) => x.owner === owner)!;
      u.onBoard = true;
      u.models.forEach((m, i) => (m.pos = { x: 4 + i * 1.3, y }));
    }
    // The player who moves second this round passes early on their first turn, claiming the assault lead.
    s = ok(s, { type: "chooseOrder", player: s.orderChoice!.player, goFirst: true });
    const leader = s.activePlayer;
    const other = leader === 0 ? 1 : 0;
    s = ok(s, { type: "hold", uid: s.units.find((u) => u.owner === leader && u.onBoard)!.uid });
    expect(s.activePlayer).toBe(other);
    s = ok(s, { type: "pass", player: other }); // early: `other` still had a unit to move
    expect(s.initiativeClaim).toBe(other);
    while (s.phase === "movement") s = ok(s, { type: "pass", player: s.activePlayer });
    expect(s.phase).toBe("assault");
    expect(s.activePlayer).toBe(other);
  });

  it("between rounds the player behind chooses, and a VP tie triggers a fresh roll-off", () => {
    let s = fresh(11);
    s = ok(s, { type: "chooseOrder", player: s.orderChoice!.player, goFirst: true });
    // Nobody scores in an empty round 1: VP tied 0-0, so a roll-off decides who chooses.
    while (s.round === 1) {
      const r = applyCommand(s, { type: "pass", player: s.activePlayer });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      if (s.round === 2) {
        expect(r.events.some((e) => e.type === "rolloff")).toBe(true);
      }
    }
    expect(s.orderChoice?.reason).toBe("tie");
    s = ok(s, { type: "chooseOrder", player: s.orderChoice!.player, goFirst: true });
    // Now put player 0 behind and finish the round: player 0 should get the choice.
    s.players[1].vp = 3;
    while (s.round === 2) s = ok(s, { type: "pass", player: s.activePlayer });
    expect(s.orderChoice).toEqual({ player: 0, reason: "behind" });
  });
});
