import { describe, expect, it } from "vitest";
import { defaultPayment, paymentOptions } from "../src/engine/cp";
import { SUPPORTS } from "../src/engine/data/factions";
import { applyCommand, createGame } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import type { Command, GameEvent, GameState, Unit, Vec } from "../src/engine/types";

function place(u: Unit, at: Vec): Unit {
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.1), y: at.y + Math.floor(i / 3) * (2 * r + 0.1) };
    m.elevation = 0;
  });
  return u;
}

/** Militia with the Motor Pool and the Ammo Wagon (2 CP each), a squad of Grunts on the table. */
function table(extra: Partial<Parameters<typeof createGame>[0]> = {}) {
  const s = createGame({
    factions: ["militia", "concord"],
    seed: 5,
    supports: [["mil-depot", "mil-wagon"], ["con-court", "con-portal"]],
    lists: [[{ profileId: "mil-grunts", upgrades: [] }, { profileId: "mil-bertha", upgrades: [] }], [{ profileId: "con-guard", upgrades: [] }]],
    ...extra,
  });
  s.orderChoice = null;
  s.activePlayer = 0;
  const grunts = place(s.units.find((u) => u.profileId === "mil-grunts")!, { x: 10, y: 10 });
  // Big Bertha, dented: something for Field Repairs to fix.
  const bertha = place(s.units.find((u) => u.profileId === "mil-bertha")!, { x: 20, y: 10 });
  bertha.models[0]!.hp -= 3;
  return { s, grunts, bertha };
}

const run = (s: GameState, cmd: Command): { s: GameState; events: GameEvent[] } => {
  const r = applyCommand(s, cmd);
  if (!r.ok) throw new Error(r.error);
  return { s: r.state, events: r.events };
};
const card = (s: GameState, id: string) => s.players[0].supports.find((c) => c.id === id)!;

describe("card-bound CP (the standard game)", () => {
  it("your CP is your ready cards' CP", () => {
    const { s } = table();
    expect(SUPPORTS["mil-depot"]!.cp).toBe(2);
    expect(SUPPORTS["mil-wagon"]!.cp).toBe(2);
    expect(s.players[0].cp).toBe(4);
  });

  it("you pick the card to burn; its abilities switch off and CP over the cost is lost", () => {
    const { s, grunts, bertha } = table();
    // Field Repairs costs 1 and doesn't exhaust the Motor Pool: pay with the Ammo Wagon instead.
    const r = run(s, { type: "support", player: 0, support: "mil-depot", ability: "field-repairs", target: bertha.uid, pay: ["mil-wagon"] });
    expect(card(r.s, "mil-wagon").exhausted).toBe(true);
    expect(card(r.s, "mil-depot").exhausted).toBe(false);
    expect(r.s.players[0].cp).toBe(2); // the Wagon's second CP is gone for the round
    const paid = r.events.find((e) => e.type === "cpPaid");
    expect(paid).toMatchObject({ amount: 1, cards: ["mil-wagon"], wasted: 1 });
    // The burnt Wagon's own abilities are off until it refreshes.
    expect(applyCommand(r.s, { type: "support", player: 0, support: "mil-wagon", ability: "sandbag-social", target: grunts.uid }).ok).toBe(false);
  });

  it("a card whose ability exhausts it pays for itself by default", () => {
    const { s, grunts } = table();
    const r = run(s, { type: "support", player: 0, support: "mil-wagon", ability: "sandbag-social", target: grunts.uid });
    expect(card(r.s, "mil-wagon").exhausted).toBe(true);
    expect(card(r.s, "mil-depot").exhausted).toBe(false);
    expect(r.s.players[0].cp).toBe(2);
  });

  it("refuses an exhausted card, a card you don't have, or more cards than the cost needs", () => {
    const { s, bertha } = table();
    const play = (pay: string[]) => applyCommand(s, { type: "support", player: 0, support: "mil-depot", ability: "field-repairs", target: bertha.uid, pay });
    expect(play(["mil-depot", "mil-wagon"]).ok).toBe(false);
    expect(play(["con-court"]).ok).toBe(false);
    card(s, "mil-wagon").exhausted = true;
    expect(play(["mil-wagon"]).ok).toBe(false);
  });

  it("doesn't bank: the cards refresh at the end of the round and that's all the CP there is", () => {
    let { s } = table();
    while (s.round === 1) s = run(s, { type: "pass", player: s.activePlayer }).s;
    expect(s.players[0].cp).toBe(4);
  });

  it("spends a head start's loose CP first, and caps it", () => {
    const { s, bertha } = table({ startBonus: [{ cp: 1 }, undefined] });
    expect(s.players[0].cp).toBe(5);
    const r = run(s, { type: "support", player: 0, support: "mil-depot", ability: "field-repairs", target: bertha.uid });
    expect(r.s.players[0].supports.every((c) => !c.exhausted)).toBe(true);
    expect(r.s.players[0].looseCp).toBe(0);
    expect(table({ startBonus: [{ cp: 99 }, undefined] }).s.players[0].cp).toBe(8);
  });

  it("lists every minimal way to pay, and picks the least wasteful", () => {
    const { s } = table();
    const pl = s.players[0];
    expect(paymentOptions(pl, 1).map((p) => p.cards)).toEqual([["mil-depot"], ["mil-wagon"]]);
    expect(paymentOptions(pl, 3).map((p) => p.cards)).toEqual([["mil-depot", "mil-wagon"]]);
    expect(paymentOptions(pl, 5)).toEqual([]);
    expect(defaultPayment(pl, 1, { id: "mil-wagon", exhausts: true })!.cards).toEqual(["mil-wagon"]);
  });

  it("classic CP pool when the house rule is off: CP banks and spending takes from the bank", () => {
    let { s } = table({ rules: { cardCp: false } });
    const start = s.players[0].cp;
    while (s.round === 1) s = run(s, { type: "pass", player: s.activePlayer }).s;
    expect(s.players[0].cp).toBe(Math.min(8, start * 2));
  });
});
