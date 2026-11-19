// Command points. Every CP spend in the game goes through `spendCp`.
//
// Standard game (the Card-bound CP house rule): CP lives on the support cards. A ready card is worth
// its CP; to spend CP you exhaust cards worth at least that much, which also switches their abilities
// off until the cards refresh at the end of the round. Paying 1 with a 2-CP card loses the other CP for
// the round. CP doesn't bank: it comes back when the cards refresh. A campaign head start can add
// loose CP, tied to no card: it's spent first and doesn't come back.
//
// Off (the classic pool): each round adds the cards' CP to a bank (up to CP_CAP), and spending takes
// from the bank; cards exhaust only through their own "exhausts" abilities.
//
// `PlayerState.cp` is always the CP the player can spend right now (card-bound: loose CP plus ready
// cards), so checks like `pl.cp < cost` work under both rules.

import { CP_CAP } from "./constants";
import { SUPPORTS } from "./data/factions";
import { rulesOf } from "./houseRules";
import type { GameEvent, GameState, PlayerId, PlayerState } from "./types";

/** A support card's CP value. */
export const cardCp = (id: string): number => SUPPORTS[id]?.cp ?? 0;

/** Card-bound CP is in play in this game. */
export const cardBound = (s: Pick<GameState, "rules">): boolean => rulesOf(s).cardCp;

/** Card-bound: set `pl.cp` to its loose CP plus its ready cards' CP. */
export function syncCardCp(pl: PlayerState): void {
  pl.cp = (pl.looseCp ?? 0) + pl.supports.reduce((n, c) => n + (c.exhausted ? 0 : cardCp(c.id)), 0);
}

/** The card whose ability is being paid for: it can pay for itself, and costs nothing extra if it exhausts anyway. */
export interface OwnCard {
  id: string;
  exhausts: boolean;
}

export interface Payment {
  /** Loose CP used. */
  loose: number;
  /** Cards exhausted to pay. */
  cards: string[];
  /** CP lost to overpaying (a 2-CP card paying for 1). */
  wasted: number;
}

/** Every way to pay `cost` with ready cards after loose CP, as card subsets (no card more than needed). */
export function paymentOptions(pl: PlayerState, cost: number): Payment[] {
  const loose = Math.min(pl.looseCp ?? 0, cost);
  const need = cost - loose;
  if (need <= 0) return [{ loose, cards: [], wasted: 0 }];
  const ready = pl.supports.filter((c) => !c.exhausted && cardCp(c.id) > 0).map((c) => c.id);
  const out: Payment[] = [];
  for (let mask = 1; mask < 1 << ready.length; mask++) {
    const cards = ready.filter((_, i) => mask & (1 << i));
    const total = cards.reduce((n, id) => n + cardCp(id), 0);
    if (total < need) continue;
    // Minimal: dropping any one card would no longer cover the cost.
    if (cards.some((id) => total - cardCp(id) >= need)) continue;
    out.push({ loose, cards, wasted: total - need });
  }
  return out;
}

/**
 * The payment the engine picks when nobody chose: the card being played if it exhausts anyway, then
 * the least CP wasted, then the fewest cards, then the cards furthest down the hand.
 */
export function defaultPayment(pl: PlayerState, cost: number, own?: OwnCard): Payment | null {
  const opts = paymentOptions(pl, cost);
  if (!opts.length) return null;
  const order = pl.supports.map((c) => c.id);
  const score = (p: Payment): number[] => [
    own?.exhausts && p.cards.includes(own.id) ? 0 : 1,
    p.wasted,
    p.cards.length,
    -Math.max(...p.cards.map((id) => order.indexOf(id)), -1),
  ];
  return opts.sort((a, b) => {
    const x = score(a);
    const y = score(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
    return 0;
  })[0]!;
}

/** Check a chosen payment: the player's own ready cards, each needed, covering the cost. */
function checkPayment(pl: PlayerState, cost: number, cards: string[]): Payment | string {
  if (new Set(cards).size !== cards.length) return "A card can only pay once";
  for (const id of cards) {
    const c = pl.supports.find((x) => x.id === id);
    if (!c) return "You don't have that card";
    if (c.exhausted) return "That card is already exhausted";
    if (cardCp(id) <= 0) return "That card gives no CP";
  }
  const loose = Math.min(pl.looseCp ?? 0, cost);
  const need = cost - loose;
  const total = cards.reduce((n, id) => n + cardCp(id), 0);
  if (total < need) return `Those cards only give ${total + loose} CP; it needs ${cost}`;
  if (need <= 0 && cards.length) return "No card needed: loose CP covers it";
  if (cards.some((id) => total - cardCp(id) >= need)) return "That's more cards than it needs";
  return { loose, cards, wasted: total - need };
}

/**
 * Spend `cost` CP for player `p`. Card-bound: exhaust the chosen cards (`pay`), or the default
 * payment if none were chosen. Returns an error (and changes nothing), or null.
 */
export function spendCp(s: GameState, p: PlayerId, cost: number, events: GameEvent[], opts: { pay?: string[]; own?: OwnCard } = {}): string | null {
  if (cost <= 0) return null;
  const pl = s.players[p];
  if (pl.cp < cost) return `Needs ${cost} CP (you have ${pl.cp})`;
  if (!cardBound(s)) {
    pl.cp -= cost;
    return null;
  }
  const payment = opts.pay ? checkPayment(pl, cost, opts.pay) : defaultPayment(pl, cost, opts.own);
  if (!payment) return `Needs ${cost} CP (you have ${pl.cp})`;
  if (typeof payment === "string") return payment;
  pl.looseCp = (pl.looseCp ?? 0) - payment.loose;
  pl.supports = pl.supports.map((c) => (payment.cards.includes(c.id) ? { ...c, exhausted: true } : c));
  syncCardCp(pl);
  events.push({ type: "cpPaid", player: p, amount: cost, cards: payment.cards, loose: payment.loose, wasted: payment.wasted });
  return null;
}

/** A head start's extra CP: loose CP under card-bound rules, banked (up to the cap) otherwise. */
export function grantCp(s: GameState, p: PlayerId, amount: number): void {
  const pl = s.players[p];
  if (cardBound(s)) {
    // Still capped: loose CP plus the cards' CP never goes over CP_CAP.
    const cards = pl.cp - (pl.looseCp ?? 0);
    pl.looseCp = Math.max(0, Math.min((pl.looseCp ?? 0) + amount, CP_CAP - cards));
    syncCardCp(pl);
  } else pl.cp = Math.min(CP_CAP, pl.cp + amount);
}
