import type { AbilityId, Phase } from "../types";

export interface AbilityDef {
  id: AbilityId;
  name: string;
  kind: "active" | "passive" | "reactive";
  text: string;
  /** Active abilities: the phase they're used in (it takes the unit's activation). */
  phase?: Phase;
  usesPerGame?: number;
  /** What the active ability needs from the player. */
  needs?: "point" | "friendlyUnit" | "friendlyUnitAndPoint";
  range?: number;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  entrenched: {
    id: "entrenched",
    name: "Entrenched",
    kind: "passive",
    text: "When this unit hunkers down it gets +2 to saves instead of +1.",
  },
  regen: {
    id: "regen",
    name: "Regen",
    kind: "passive",
    text: "End of round: if this unit took no damage this round, its most hurt model heals 1 HP.",
  },
  regrow: {
    id: "regrow",
    name: "Regrow",
    kind: "passive",
    text: "End of round: if this unit took no damage this round, one lost model crawls back.",
  },
  "brood-call": {
    id: "brood-call",
    name: "Brood Call",
    kind: "passive",
    text: 'Friendly Beast units within 6" of this unit get +1 move.',
  },
  radiance: {
    id: "radiance",
    name: "Radiance",
    kind: "passive",
    text: 'End of round: friendly units within 6" recharge 1 extra shield.',
  },
  "steady-aim": {
    id: "steady-aim",
    name: "Steady Aim",
    kind: "passive",
    text: "+1 ranged die per model if this unit hasn't moved this round.",
  },
  overwatch: {
    id: "overwatch",
    name: "Overwatch",
    kind: "reactive",
    text: 'Once per round, when an enemy unit ends a move, charge or deployment within 10" and in sight, shoot it (hitting one worse).',
  },
  "sticky-goo": {
    id: "sticky-goo",
    name: "Sticky Goo",
    kind: "reactive",
    text: "Ranged attacks that cause damage leave the target slowed: -2 move next round.",
  },
  pop: {
    id: "pop",
    name: "Pop!",
    kind: "reactive",
    text: 'When one of its models dies, each enemy model within 1" takes 1 damage on a 5+.',
  },
  refraction: {
    id: "refraction",
    name: "Refraction",
    kind: "reactive",
    text: "Once per round, the first ranged attack that damages this unit deals 1 less damage.",
  },
  "patch-up": {
    id: "patch-up",
    name: "Patch Up",
    kind: "active",
    phase: "movement",
    needs: "friendlyUnit",
    range: 3,
    text: 'Movement phase: a friendly unit within 3" heals 2 HP. If it has lost models, revive one first.',
  },
  barrage: {
    id: "barrage",
    name: "Barrage",
    kind: "active",
    phase: "assault",
    needs: "point",
    range: 24,
    usesPerGame: 2,
    text: 'Assault phase, twice per game: lob shells at a point within 24" (no sight needed). Every ground model within 2" (friend or foe) is hit on a 4+ (1 dmg, AP1).',
  },
  tunnel: {
    id: "tunnel",
    name: "Tunnel",
    kind: "active",
    phase: "movement",
    needs: "point",
    usesPerGame: 1,
    text: 'Movement phase, once per game: burrow and pop up anywhere on the ground at least 6" from enemies.',
  },
  blink: {
    id: "blink",
    name: "Blink",
    kind: "active",
    phase: "movement",
    needs: "point",
    range: 10,
    usesPerGame: 2,
    text: 'Movement phase, twice per game: teleport up to 10", ignoring terrain. Can land on platforms.',
  },
  recall: {
    id: "recall",
    name: "Recall Beam",
    kind: "active",
    phase: "assault",
    needs: "friendlyUnitAndPoint",
    range: 12,
    usesPerGame: 1,
    text: 'Assault phase, once per game: teleport a friendly, unengaged unit within 12" to within 4" of this unit. It can still act afterwards.',
  },
};
