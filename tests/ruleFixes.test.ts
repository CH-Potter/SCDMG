import { describe, expect, it } from "vitest";
import { applyCommand, createGame, mercyLead } from "../src/engine/game";
import { MISSIONS } from "../src/engine/data/missions";
import { PROFILES } from "../src/engine/data/factions";
import { profileOf } from "../src/engine/profile";
import { MERCY_LEAD } from "../src/engine/constants";
import { controlWeight, disengageOdds, isEngaged, objectivePresence, supplyFor, unitById } from "../src/engine/rules";
import { scoreRound, updateFlags } from "../src/engine/scoring";
import type { GameEvent, GameState, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";
import { registerMunch } from "./helpers/munch";

// The Munch are a Forge template now: register a test copy under their old ids.
registerMunch();

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

describe("supply follows surviving models", () => {
  const squad = (supply: number, models: number) => ({ ...PROFILES["mil-grunts"]!, supply, models });

  it("shares supply across the models, rounding down, so a last survivor is worth 0", () => {
    const p = squad(3, 6);
    expect([6, 5, 4, 3, 2, 1, 0].map((n) => supplyFor(p, n))).toEqual([3, 2, 2, 1, 1, 0, 0]);
  });

  it("a single-model unit keeps its full supply until it dies", () => {
    const p = squad(4, 1);
    expect(supplyFor(p, 1)).toBe(4);
    expect(supplyFor(p, 0)).toBe(0);
  });

  it("objective presence uses the unit's current supply", () => {
    const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 1 });
    const g = place(s, uidOf(s, 0, "mil-grunts"), { x: 5, y: 21 });
    const p = profileOf(g);
    expect(controlWeight(g)).toBe(p.supply);
    g.models.slice(1).forEach((m) => (m.alive = false));
    expect(controlWeight(g)).toBe(supplyFor(p, 1));
    expect(objectivePresence(s, s.objectives[1]!)[0]).toBe(supplyFor(p, 1));
  });
});

describe("a big lead wins on the spot", () => {
  it(`ends the game as soon as one side leads by more than ${MERCY_LEAD} VP`, () => {
    const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 4 });
    s.orderChoice = null;
    s.players[1].vp = MERCY_LEAD; // exactly the limit: play on
    const r1 = applyCommand(s, { type: "pass", player: s.activePlayer });
    expect(r1.ok && r1.state.over).toBe(false);
    const t = r1.ok ? r1.state : s;
    t.players[1].vp = MERCY_LEAD + 1;
    const r2 = applyCommand(t, { type: "pass", player: t.activePlayer });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.state.over).toBe(true);
      expect(r2.state.winner).toBe(1);
      expect(r2.events.some((e) => e.type === "gameOver" && /lead/.test(e.reason))).toBe(true);
    }
  });
});

describe("forward-deploy limits", () => {
  const mama = () => {
    const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["munch", "militia"], seed: 2 });
    s.initiative = 0;
    s.activePlayer = 0;
    s.players[0].cp = 8;
    const m = unitById(s, uidOf(s, 0, "munch-mama"))!;
    m.upgrades = ["tunnel"]; // Tunnel Claws (not in every starter list)
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

describe("the instant-win lead is set per mission", () => {
  it("defaults to MERCY_LEAD; big-swing missions allow more", () => {
    const hold = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 6, missionId: "hold" });
    expect(mercyLead(hold)).toBe(MERCY_LEAD);
    const heist = createGame({ factions: ["militia", "munch"], seed: 6, missionId: "heist", mapId: "dustbowl" });
    const limit = MISSIONS.heist!.mercyLead!;
    expect(limit).toBeGreaterThan(MERCY_LEAD);
    expect(mercyLead(heist)).toBe(limit);
    heist.orderChoice = null;
    heist.players[0].vp = limit; // at the limit: play on
    const r = applyCommand(heist, { type: "pass", player: heist.activePlayer });
    expect(r.ok && r.state.over).toBe(false);
  });
});

describe("disengaging by supply", () => {
  /** Rivet Grunts locked in melee with Acid Spitters of the same supply, Grunts to move. */
  function locked() {
    const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "swarm"], seed: 5 });
    s.orderChoice = null;
    s.phase = "movement";
    s.activePlayer = 0;
    const g = place(s, uidOf(s, 0, "mil-grunts"), { x: 26, y: 8 });
    // The Spitters' front row just touches the Grunts' back row (place() lays squads out 3 to a row).
    const gp = profileOf(g);
    const backRow = 8 + (Math.ceil(gp.models / 3) - 1) * (2 * gp.baseRadius + 0.1);
    const nUid = uidOf(s, 1, "swarm-spitters");
    const n = place(s, nUid, { x: 26, y: backRow + gp.baseRadius + PROFILES["swarm-spitters"]!.baseRadius + 0.2 });
    expect(isEngaged(s, g)).toBe(true);
    return { s, g, n };
  }
  const away = (s: GameState, uid: string) => applyCommand(s, { type: "disengage", uid, leader: 0, to: { x: 26, y: 4 } });

  it("a Rivet Grunt squad and an Acid Spitter brood are worth the same supply at full strength", () => {
    expect(PROFILES["mil-grunts"]!.supply).toBe(PROFILES["swarm-spitters"]!.supply);
  });

  it("equal supply: the unit gets away but is exhausted for the assault phase", () => {
    const { s, g } = locked();
    const sup = profileOf(g).supply;
    expect(disengageOdds(s, g)).toEqual({ mine: sup, theirs: sup, clean: false });
    const r = away(s, g.uid);
    expect(r.ok ? null : r.error).toBeNull();
    if (!r.ok) return;
    expect(unitById(r.state, g.uid)!.status.disengaged).toBe(true);
    expect(r.events.some((e) => e.type === "moved" && e.kind === "disengage" && e.exhausted)).toBe(true);
  });

  it("more supply than the enemy: a clean break with no penalty", () => {
    const { s, g, n } = locked();
    const np = profileOf(n);
    // Kill Spitters from the back until the brood is worth one supply less than the Grunts (its front row stays in contact).
    const keep = Array.from({ length: np.models }, (_, i) => np.models - i).find((k) => supplyFor(np, k) === profileOf(g).supply - 1)!;
    n.models.slice(keep).forEach((m) => (m.alive = false));
    expect(isEngaged(s, g)).toBe(true);
    expect(disengageOdds(s, g)).toEqual({ mine: profileOf(g).supply, theirs: profileOf(g).supply - 1, clean: true });
    const r = away(s, g.uid);
    expect(r.ok ? null : r.error).toBeNull();
    if (!r.ok) return;
    expect(unitById(r.state, g.uid)!.status.disengaged).toBe(false);
  });
});
