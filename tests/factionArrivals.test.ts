// Each faction's way onto the table mid-game, each with its own feel:
// Militia drop-ship (anywhere, far from trouble), Munch burrow hole (near the swarm, the whole round),
// Concord portal (beside its own crystals, close to the fight, arriving overcharged).

import { describe, expect, it } from "vitest";
import { defaultSupportsFor, supportOf } from "../src/engine/data/factions";
import { applyCommand, createGame } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { aliveModels, unitById, unitGap } from "../src/engine/rules";
import type { GameState, ListEntry, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

const L = (...ids: string[]): ListEntry[] => ids.map((profileId) => ({ profileId, upgrades: [] }));

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

function portalGame(): GameState {
  const s = createGame({ map: CLASSIC_DUSTBOWL,
    factions: ["concord", "munch"],
    seed: 7,
    lists: [L("con-guard", "con-lancer"), L("munch-nibblers")],
    supports: [["con-portal"], []],
  });
  Object.assign(s, { initiative: 0, activePlayer: 0, orderChoice: null, round: 2, phase: "movement" });
  s.players[0].cp = 8;
  return s;
}

const step = (s: GameState, uid: string, point: Vec) =>
  applyCommand(s, { type: "support", player: 0, support: "con-portal", ability: "step-through", target: uid, point });

describe("faction arrivals", () => {
  it("each faction starts Skirmish with its own way in, and they work differently", () => {
    const ways = {
      militia: "mil-dropship",
      munch: "munch-tunnels",
      concord: "con-portal",
    } as const;
    for (const [f, card] of Object.entries(ways)) expect(defaultSupportsFor(f as keyof typeof ways, "skirmish")).toContain(card);
    const drop = supportOf("mil-dropship").abilities[0]!.effect;
    const burrow = supportOf("munch-tunnels").abilities[0]!.effect;
    const portal = supportOf("con-portal").abilities[0]!.effect;
    expect(drop).toMatchObject({ kind: "airdrop", anywhere: true, minEnemyDistance: 8 });
    expect(burrow).toMatchObject({ kind: "summon", profileId: "munch-hole" });
    expect(portal).toMatchObject({ kind: "airdrop", range: 4, minEnemyDistance: 3, arrivalShield: 1 });
    expect((portal as { anywhere?: boolean }).anywhere).toBeFalsy();
  });

  it("the Grand Portal beams a unit in beside your own unit, close to the enemy, overcharged", () => {
    let s = portalGame();
    const guard = place(s, s.units.find((u) => u.profileId === "con-guard")!.uid, { x: 17, y: 20 });
    place(s, s.units.find((u) => u.profileId === "munch-nibblers")!.uid, { x: 17, y: 12 });
    const lancer = s.units.find((u) => u.profileId === "con-lancer")!;
    const before = profileOf(lancer).shield;
    s = (() => {
      const r = step(s, lancer.uid, { x: 20, y: 19 });
      if (!r.ok) throw new Error(r.error);
      return r.state;
    })();
    const l = unitById(s, lancer.uid)!;
    expect(l.onBoard).toBe(true);
    expect(unitGap(l, unitById(s, guard.uid)!)).toBeLessThanOrEqual(4 + 1e-6);
    for (const m of aliveModels(l)) expect(m.shield).toBe(before + 1);
  });

  it("the portal needs one of your units nearby, and keeps 3\" from enemies", () => {
    const s = portalGame();
    place(s, s.units.find((u) => u.profileId === "con-guard")!.uid, { x: 17, y: 20 });
    place(s, s.units.find((u) => u.profileId === "munch-nibblers")!.uid, { x: 17, y: 12 });
    const lancer = s.units.find((u) => u.profileId === "con-lancer")!;
    expect(step(s, lancer.uid, { x: 30, y: 28 }).ok).toBe(false); // nowhere near a friend
    expect(step(s, lancer.uid, { x: 17, y: 15 }).ok).toBe(false); // too close to the nibblers
  });

  it("the overcharge fades at the end of the round", () => {
    let s = portalGame();
    place(s, s.units.find((u) => u.profileId === "con-guard")!.uid, { x: 17, y: 20 });
    place(s, s.units.find((u) => u.profileId === "munch-nibblers")!.uid, { x: 17, y: 8 });
    const lancer = s.units.find((u) => u.profileId === "con-lancer")!;
    const r = step(s, lancer.uid, { x: 20, y: 19 });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    while (s.round === 2 && !s.over) {
      const n = applyCommand(s, { type: "pass", player: s.activePlayer });
      if (!n.ok) throw new Error(n.error);
      s = n.state;
    }
    for (const m of aliveModels(unitById(s, lancer.uid)!)) expect(m.shield).toBeLessThanOrEqual(profileOf(lancer).shield);
  });
});
