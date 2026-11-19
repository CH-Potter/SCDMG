import { describe, expect, it } from "vitest";
import { planShooting } from "../src/engine/combat";
import { DETECT_RANGE, HIDDEN_RANGE, SURFACE_MOVE } from "../src/engine/constants";
import { applyCommand, createGame } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { aliveModels, concealment, detected, effectiveMove, isHidden, objectivePresence, unitsEngage } from "../src/engine/rules";
import type { GameState, ListEntry, Unit, Vec } from "../src/engine/types";
import { factionProblems } from "../src/engine/data/factionValidation";
import { FACTIONS } from "../src/engine/data/factions";
import type { Faction } from "../src/engine/types";

function place(u: Unit, at: Vec): Unit {
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.1), y: at.y + Math.floor(i / 3) * (2 * r + 0.1) };
    m.elevation = 0;
  });
  return u;
}

function table(militia: ListEntry[], swarm: ListEntry[]): GameState {
  const s = createGame({ factions: ["militia", "swarm"], seed: 3, lists: [militia, swarm] });
  s.terrain = [];
  s.orderChoice = null;
  s.phase = "assault";
  s.activePlayer = 1;
  return s;
}
const unit = (s: GameState, id: string): Unit => s.units.find((u) => u.profileId === id)!;
const gun = (u: Unit) => profileOf(u).weapons.find((w) => !w.melee)!;

describe("hidden", () => {
  function setup() {
    const s = table([{ profileId: "mil-squinter", upgrades: ["ghillie"] }], [{ profileId: "swarm-spitters", upgrades: [] }, { profileId: "swarm-mother", upgrades: [] }]);
    const sniper = place(unit(s, "mil-squinter"), { x: 10, y: 5 });
    const spitters = place(unit(s, "swarm-spitters"), { x: 10, y: 15 });
    return { s, sniper, spitters, mother: unit(s, "swarm-mother") };
  }

  it("can only be picked out from within 6\" until it attacks", () => {
    const { s, sniper, spitters } = setup();
    expect(isHidden(s, sniper)).toBe(true);
    const far = planShooting(s, spitters, sniper, gun(spitters));
    expect(typeof far === "string" && far).toMatch(/Hidden/);
    // Up close it can be shot.
    place(spitters, { x: 10, y: 5 + HIDDEN_RANGE });
    expect(concealment(s, spitters, sniper)).toBeNull();
    // Shooting gives it away: revealed, it can be shot from any range for the rest of the round.
    place(spitters, { x: 10, y: 15 });
    s.activePlayer = 0;
    const r = applyCommand(s, { type: "shoot", uid: sniper.uid, target: spitters.uid, weapon: 0 });
    if (!r.ok) throw new Error(r.error);
    const after = r.state;
    const sn = after.units.find((u) => u.uid === sniper.uid)!;
    expect(sn.status.revealed).toBe(true);
    expect(concealment(after, after.units.find((u) => u.uid === spitters.uid)!, sn)).toBeNull();
  });

  it("is found by an enemy detector (Keen Eyes) within 8\", for that whole side", () => {
    const { s, sniper, spitters, mother } = setup();
    expect(profileOf(mother).abilities).toContain("detector");
    place(mother, { x: 10 + DETECT_RANGE + profileOf(sniper).baseRadius + profileOf(mother).baseRadius + 1, y: 5 });
    expect(detected(s, sniper)).toBe(false);
    place(mother, { x: 16, y: 5 });
    expect(detected(s, sniper)).toBe(true);
    expect(typeof planShooting(s, spitters, sniper, gun(spitters))).not.toBe("string");
  });
});

describe("burrow", () => {
  function setup() {
    const s = table(
      [{ profileId: "mil-grunts", upgrades: [] }, { profileId: "mil-mortar", upgrades: [] }],
      [{ profileId: "swarm-shellbacks", upgrades: [] }],
    );
    const grunts = place(unit(s, "mil-grunts"), { x: 10, y: 5 });
    const bugs = place(unit(s, "swarm-shellbacks"), { x: 10, y: 15 });
    s.phase = "movement";
    return { s, grunts, bugs, mortar: unit(s, "mil-mortar") };
  }

  it("goes under in the movement phase: no shooting, charging, holding or fighting it", () => {
    const { s, grunts, bugs } = setup();
    const r = applyCommand(s, { type: "ability", uid: bugs.uid, ability: "burrow" });
    if (!r.ok) throw new Error(r.error);
    const after = r.state;
    const b = after.units.find((u) => u.uid === bugs.uid)!;
    const g = after.units.find((u) => u.uid === grunts.uid)!;
    expect(b.status.burrowed).toBe(true);
    expect(b.status.acted).toBe(true);
    expect(concealment(after, g, b)).toMatch(/Burrowed/);
    // Not in anyone's melee, and not on any objective.
    place(b, { x: 10, y: 5 + 2 * profileOf(g).baseRadius + 0.2 });
    expect(unitsEngage(g, b)).toBe(false);
    after.objectives = [{ ...after.objectives[0]!, pos: aliveModels(b)[0]!.pos, elevation: 0 }];
    expect(objectivePresence(after, after.objectives[0]!)[1]).toBe(0);
  });

  it("is found by a detector, and surfaces with a move of up to 3\"", () => {
    const { s, grunts, bugs, mortar } = setup();
    let r = applyCommand(s, { type: "ability", uid: bugs.uid, ability: "burrow" });
    if (!r.ok) throw new Error(r.error);
    let st = r.state;
    const b = () => st.units.find((u) => u.uid === bugs.uid)!;
    // The Pipe Mortar has Keen Eyes: within 8" it lets the Militia shoot the burrowed brood.
    place(st.units.find((u) => u.uid === mortar.uid)!, { x: 11, y: 22 });
    expect(detected(st, b())).toBe(true);
    expect(concealment(st, st.units.find((u) => u.uid === grunts.uid)!, b())).toBeNull();
    // Next movement phase: a short move brings it up.
    b().status.acted = false;
    st.activePlayer = 1;
    expect(effectiveMove(st, b())).toBe(SURFACE_MOVE);
    const lead = aliveModels(b())[0]!.pos;
    const tooFar = applyCommand(st, { type: "move", uid: bugs.uid, leader: 0, to: { x: lead.x + 5, y: lead.y } });
    expect(tooFar.ok).toBe(false);
    r = applyCommand(st, { type: "move", uid: bugs.uid, leader: 0, to: { x: lead.x + 2, y: lead.y - 1 } });
    if (!r.ok) throw new Error(r.error);
    st = r.state;
    expect(b().status.burrowed).toBe(false);
    expect(r.events.some((e) => e.type === "burrowed" && !e.under)).toBe(true);
  });

  it("can't go on a structure or a flyer (Faction Forge check)", () => {
    const f = structuredClone(FACTIONS.swarm!) as Faction;
    f.profiles.find((p) => p.id === "swarm-spire")!.abilities.push("burrow");
    f.profiles.find((p) => p.id === "swarm-stingers")!.abilities.push("burrow");
    const errs = factionProblems(f);
    expect(errs.some((e) => /structures can't burrow/.test(e))).toBe(true);
    expect(errs.some((e) => /flyers can't burrow/.test(e))).toBe(true);
  });
});
