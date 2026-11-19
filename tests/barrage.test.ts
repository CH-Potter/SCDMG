import { bankCp } from "./helpers/cp";
import { describe, expect, it } from "vitest";
import { barrageGun, expectedBarrage, markerCatches, shellEvade, shellSeen } from "../src/engine/combat";
import { BARRAGE_RADIUS, WIDE_BARRAGE_RADIUS } from "../src/engine/constants";
import { applyCommand, createGame } from "../src/engine/game";
import type { HouseRules } from "../src/engine/houseRules";
import { hasAbility, profileFor, profileOf } from "../src/engine/profile";
import { aliveModels } from "../src/engine/rules";
import type { GameEvent, GameState, ListEntry, Unit, Vec } from "../src/engine/types";

function place(u: Unit, at: Vec): Unit {
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.1), y: at.y + Math.floor(i / 3) * (2 * r + 0.1) };
    m.elevation = 0;
  });
  return u;
}

/** A Bile Bombard (lobbed gun) and Skitterlings for the swarm, Rivet Grunts for the Militia, on an open table. */
function table(rules: Partial<HouseRules> = {}, swarm: ListEntry[] = []) {
  const s = createGame({
    factions: ["swarm", "militia"],
    seed: 7,
    rules: { scatter: false, ...rules },
    lists: [
      [{ profileId: "swarm-bombard", upgrades: [] }, { profileId: "swarm-skitterlings", upgrades: [] }, ...swarm],
      [{ profileId: "mil-grunts", upgrades: [] }],
    ],
  });
  s.terrain = [];
  s.orderChoice = null;
  const bombard = place(s.units.find((u) => u.profileId === "swarm-bombard")!, { x: 5, y: 5 });
  const bugs = place(s.units.find((u) => u.profileId === "swarm-skitterlings")!, { x: 28, y: 28 });
  const grunts = place(s.units.find((u) => u.profileId === "mil-grunts")!, { x: 15, y: 20 });
  s.phase = "movement";
  s.activePlayer = 0;
  bankCp(s, 0, 3);
  return { s, bombard, bugs, grunts };
}

const run = (s: GameState, cmd: Parameters<typeof applyCommand>[1]): { s: GameState; events: GameEvent[] } => {
  const r = applyCommand(s, cmd);
  if (!r.ok) throw new Error(r.error);
  return { s: r.state, events: r.events };
};

/** Both sides pass until the phase is `phase`, collecting the events. */
function passTo(s: GameState, phase: GameState["phase"]): { s: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (let i = 0; i < 20 && s.phase !== phase && !s.over; i++) {
    const r = run(s, { type: "pass", player: s.activePlayer });
    s = r.s;
    events.push(...r.events);
  }
  return { s, events };
}

describe("barrage markers", () => {
  it("every unit with a lobbed gun can lay one; Barrage Shells widen it to 2\" and give it to any gun", () => {
    expect(profileFor("swarm-bombard", []).abilities).toContain("barrage");
    expect(profileFor("mil-mortar", []).abilities).toContain("barrage");
    expect(profileFor("mil-bertha", []).abilities).not.toContain("barrage");
    const bertha = profileFor("mil-bertha", ["barrage"]);
    expect(bertha.abilities).toEqual(expect.arrayContaining(["barrage", "wide-barrage"]));
    expect(barrageGun(bertha)?.name).toBe("Thumper Cannon");
    expect(barrageGun(profileFor("mil-mortar", []))?.traits).toContain("indirect");
    expect(BARRAGE_RADIUS).toBe(1);
    expect(WIDE_BARRAGE_RADIUS).toBe(2);
  });

  it("is laid in the movement phase for 1 CP as a free action, then comes down at the end of the assault phase", () => {
    const t = table();
    const aim = aliveModels(t.grunts)[0]!.pos;
    const before = t.s.players[0].cp;
    let { s, events } = run(t.s, { type: "ability", uid: t.bombard.uid, ability: "barrage", point: aim });
    expect(s.players[0].cp).toBe(before - 1);
    expect(s.barrages).toHaveLength(1);
    expect(s.barrages![0]!.radius).toBe(BARRAGE_RADIUS);
    expect(s.barrages![0]!.dice).toBe(profileOf(t.bombard).weapons.find((w) => w.traits?.includes("indirect"))!.dice);
    expect(events.some((e) => e.type === "barrageMarker" && !e.landed)).toBe(true);
    // A free action: the bombard can still move this activation.
    const bombard = s.units.find((u) => u.uid === t.bombard.uid)!;
    expect(bombard.status.acted).toBe(false);
    ({ s } = run(s, { type: "move", uid: bombard.uid, leader: 0, to: { x: 6, y: 7 } }));
    // Nothing happens until the assault phase ends.
    ({ s, events } = passTo(s, "assault"));
    expect(events.some((e) => e.type === "attack" && e.report.kind === "barrage")).toBe(false);
    expect(s.barrages).toHaveLength(1);
    ({ s, events } = passTo(s, "combat"));
    const hits = events.filter((e): e is Extract<GameEvent, { type: "attack" }> => e.type === "attack" && e.report.kind === "barrage");
    expect(hits.map((e) => e.report.target)).toEqual([t.grunts.uid]);
    expect(hits[0]!.report.hitRolls).toHaveLength(2); // the Bile Shell's 2 dice, every one a hit
    expect(events.some((e) => e.type === "barrageMarker" && e.landed)).toBe(true);
    expect(s.barrages ?? []).toHaveLength(0);
  });

  it("can't be laid outside the movement phase, or beyond its gun's range", () => {
    const t = table();
    const far = { x: 34, y: 34 };
    const gun = barrageGun(profileOf(t.bombard))!;
    expect(Math.hypot(far.x - 5, far.y - 5)).toBeGreaterThan(gun.range);
    const r = applyCommand(t.s, { type: "ability", uid: t.bombard.uid, ability: "barrage", point: far });
    expect(r.ok).toBe(false);
    t.s.phase = "assault";
    const r2 = applyCommand(t.s, { type: "ability", uid: t.bombard.uid, ability: "barrage", point: aliveModels(t.grunts)[0]!.pos });
    expect(r2.ok).toBe(false);
  });

  it("hits friend and foe alike, and only ground units within its radius", () => {
    const t = table();
    const mark = { uid: t.bombard.uid, owner: 0 as const, weapon: "Bile Shell", pos: aliveModels(t.grunts)[0]!.pos, radius: 1, dice: 2, damage: 1, ap: 1 };
    expect(markerCatches(mark, t.grunts).length).toBeGreaterThan(0);
    expect(markerCatches(mark, t.bugs)).toHaveLength(0);
    place(t.bugs, { x: mark.pos.x + 1.2, y: mark.pos.y });
    expect(markerCatches(mark, t.bugs).length).toBeGreaterThan(0);
    expect(expectedBarrage(t.s, mark, t.grunts)).toBeGreaterThan(0);
  });
});

describe("house rules: dodge unseen shells", () => {
  it("a shell from out of sight lets the target roll its own evade; one in sight goes by its card", () => {
    const t = table();
    // Rivet Grunts only dodge point-blank shots: a seen shell gets no evade, an unseen one their own 6+.
    const own = profileOf(t.grunts).evade!.target;
    expect(shellEvade(t.s, t.grunts, true)).toBeNull();
    expect(shellEvade(t.s, t.grunts, false)).toBe(own);
    const off = table({ unseenEvade: false });
    expect(shellEvade(off.s, off.grunts, false)).toBeNull();
    // Big, slow units have no evade to roll.
    const bertha = createGame({ factions: ["militia", "swarm"], seed: 4, lists: [[{ profileId: "mil-bertha", upgrades: [] }], []] }).units[0]!;
    expect(hasAbility(bertha, "barrage")).toBe(false);
    expect(shellEvade(t.s, bertha, false)).toBeNull();
  });

  it("knows whether the firing unit can see the models it caught", () => {
    const t = table();
    expect(shellSeen(t.s, t.bombard, aliveModels(t.grunts))).toBe(true);
    expect(shellSeen(t.s, undefined, aliveModels(t.grunts))).toBe(false);
  });
});
