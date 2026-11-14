import { describe, expect, it } from "vitest";
import { applyCommand, createGame } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { controlWeight, objectivePresence, unitById } from "../src/engine/rules";
import { scoreRound, updateFlags } from "../src/engine/scoring";
import type { GameEvent, GameState, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

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

const uidOf = (s: GameState, owner: 0 | 1, profileId: string): string =>
  s.units.find((u) => u.owner === owner && u.profileId === profileId)!.uid;

describe("objective control by surviving strength", () => {
  it("a unit at half strength or less counts half its supply", () => {
    const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 1 });
    const g = place(s, uidOf(s, 0, "mil-grunts"), { x: 5, y: 21 });
    const full = controlWeight(g);
    expect(full).toBe(profileOf(g).supply);
    g.models.slice(-Math.ceil(g.models.length / 2)).forEach((m) => (m.alive = false));
    expect(controlWeight(g)).toBe(full / 2);
    expect(objectivePresence(s, s.objectives[1]!)[0]).toBe(full / 2);
  });
});

describe("forward-deploy limits", () => {
  const mama = () => {
    const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["munch", "militia"], seed: 2 });
    s.initiative = 0;
    s.activePlayer = 0;
    s.players[0].cp = 8;
    const m = unitById(s, uidOf(s, 0, "munch-mama"))!;
    place(s, m.uid, { x: 17, y: 32 });
    return { s, m };
  };

  it("no tunnelling in round 1", () => {
    const { s, m } = mama();
    const r = applyCommand(s, { type: "ability", uid: m.uid, ability: "tunnel", point: { x: 17, y: 25 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/round 2/);
  });

  it("can't pop up next to the enemy's home objective", () => {
    const { s, m } = mama();
    s.round = 2;
    const enemyHome = s.objectives.find((o) => o.team === 1)!;
    const r = applyCommand(s, { type: "ability", uid: m.uid, ability: "tunnel", point: { x: enemyHome.pos.x, y: enemyHome.pos.y + 3 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/home objective/);
  });
});

describe("snack delivery", () => {
  it("scores when the carrier reaches its own deployment zone, and pays each round while held", () => {
    const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 3, missionId: "flag" });
    const g = place(s, uidOf(s, 0, "mil-grunts"), { x: 10, y: 20 });
    const flag = s.flags.find((f) => f.team === 1)!;
    flag.carrier = g.uid;
    // Holding it pays at the end of a round.
    const events: GameEvent[] = [];
    scoreRound(s, events);
    expect(s.players[0].vp).toBe(1);
    // Walking into our own deployment zone (y 30-35 on Dustbowl) delivers it.
    g.models.forEach((m, i) => (m.pos = { x: 10 + i * 1.2, y: 32 }));
    updateFlags(s, events);
    expect(s.players[0].vp).toBe(1 + 4);
    expect(flag.carrier).toBeNull();
  });
});
