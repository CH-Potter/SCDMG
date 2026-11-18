// Each faction's way onto the table mid-game, each with its own feel:
// Militia drop-ship (anywhere, far from trouble), Skitterswarm Surface Breach (bursting up near the swarm,
// or a Tunnel Mouth for the round), Concord portal (beside its own crystals, close to the fight, arriving overcharged).

import { describe, expect, it } from "vitest";
import { defaultSupportsFor, supportOf } from "../src/engine/data/factions";
import { aiSupportCommand } from "../src/engine/ai";
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
    factions: ["concord", "swarm"],
    seed: 7,
    lists: [L("con-guard", "con-lancer"), L("swarm-skitterlings")],
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
      swarm: "swarm-tunnels",
      concord: "con-portal",
    } as const;
    for (const [f, card] of Object.entries(ways)) expect(defaultSupportsFor(f as keyof typeof ways, "skirmish")).toContain(card);
    const drop = supportOf("mil-dropship").abilities[0]!.effect;
    const breach = supportOf("swarm-tunnels").abilities[0]!.effect;
    const burrow = supportOf("swarm-tunnels").abilities[1]!.effect;
    const portal = supportOf("con-portal").abilities[0]!.effect;
    expect(drop).toMatchObject({ kind: "airdrop", anywhere: true, minEnemyDistance: 8 });
    expect(breach).toMatchObject({ kind: "airdrop", range: 10, minEnemyDistance: 5, fromRound: 2 });
    expect((breach as { anywhere?: boolean; arrivalShield?: number }).anywhere).toBeFalsy();
    expect((breach as { arrivalShield?: number }).arrivalShield).toBeFalsy();
    expect(burrow).toMatchObject({ kind: "summon", profileId: "swarm-mouth" });
    expect(portal).toMatchObject({ kind: "airdrop", range: 4, minEnemyDistance: 3, arrivalShield: 1 });
    expect((portal as { anywhere?: boolean }).anywhere).toBeFalsy();
  });

  it("the Grand Portal beams a unit in beside your own unit, close to the enemy, overcharged", () => {
    let s = portalGame();
    const guard = place(s, s.units.find((u) => u.profileId === "con-guard")!.uid, { x: 17, y: 20 });
    place(s, s.units.find((u) => u.profileId === "swarm-skitterlings")!.uid, { x: 17, y: 12 });
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
    place(s, s.units.find((u) => u.profileId === "swarm-skitterlings")!.uid, { x: 17, y: 12 });
    const lancer = s.units.find((u) => u.profileId === "con-lancer")!;
    expect(step(s, lancer.uid, { x: 30, y: 28 }).ok).toBe(false); // nowhere near a friend
    expect(step(s, lancer.uid, { x: 17, y: 15 }).ok).toBe(false); // too close to the skitterlings
  });

  it("the overcharge fades at the end of the round", () => {
    let s = portalGame();
    place(s, s.units.find((u) => u.profileId === "con-guard")!.uid, { x: 17, y: 20 });
    place(s, s.units.find((u) => u.profileId === "swarm-skitterlings")!.uid, { x: 17, y: 8 });
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

describe("Surface Breach (the Skitterswarm's Undertunnels)", () => {
  function breachGame(round = 2): GameState {
    const s = createGame({
      map: CLASSIC_DUSTBOWL,
      factions: ["swarm", "militia"],
      seed: 11,
      lists: [L("swarm-skitterlings", "swarm-shellbacks"), L("mil-grunts")],
      supports: [["swarm-tunnels"], []],
    });
    Object.assign(s, { initiative: 0, activePlayer: 0, orderChoice: null, round, phase: "movement" });
    s.players[0].cp = 8;
    s.players[0].resources = 20;
    return s;
  }
  const breach = (s: GameState, uid: string, point: Vec) =>
    applyCommand(s, { type: "support", player: 0, support: "swarm-tunnels", ability: "surface-breach", target: uid, point });

  it("bursts a reserve up within 10\" of the swarm and at least 5\" from enemies, from round 2", () => {
    const s = breachGame();
    place(s, s.units.find((u) => u.profileId === "swarm-skitterlings")!.uid, { x: 10, y: 22 });
    place(s, s.units.find((u) => u.profileId === "mil-grunts")!.uid, { x: 24, y: 8 });
    const shell = s.units.find((u) => u.profileId === "swarm-shellbacks")!;
    expect(breach(s, shell.uid, { x: 26, y: 26 }).ok).toBe(false); // more than 10" from the swarm
    expect(breach(s, shell.uid, { x: 22, y: 11 }).ok).toBe(false); // right next to the grunts
    expect(breach(breachGame(1), shell.uid, { x: 14, y: 20 }).ok).toBe(false); // not in round 1
    const r = breach(s, shell.uid, { x: 14, y: 20 });
    if (!r.ok) throw new Error(r.error);
    const up = unitById(r.state, shell.uid)!;
    expect(up.onBoard).toBe(true);
    for (const m of aliveModels(up)) expect(m.shield).toBe(0); // no overcharge: that's the portal's
  });

  it("the AI breaches a reserve up toward an objective it wants", () => {
    const s = breachGame();
    place(s, s.units.find((u) => u.profileId === "swarm-skitterlings")!.uid, { x: 10, y: 22 });
    place(s, s.units.find((u) => u.profileId === "mil-grunts")!.uid, { x: 30, y: 4 });
    const cmd = aiSupportCommand(s);
    expect(cmd?.type === "support" && cmd.support === "swarm-tunnels").toBe(true);
    const r = applyCommand(s, cmd!);
    expect(r.ok).toBe(true);
  });
});
