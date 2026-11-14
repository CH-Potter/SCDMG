// Armed support reactions: armed on your turn, they fire automatically on their trigger.

import { SUPPORTS } from "./data/factions";
import type { GameEvent, GameState, PlayerId, ReactionTrigger, SupportAbilityDef, SupportEffect } from "./types";

export const REACTION_TRIGGER: Partial<Record<SupportEffect["kind"], ReactionTrigger>> = {
  ward: "enemyShoots",
  brace: "enemyCharges",
  retaliate: "friendlyDestroyed",
};

export function abilityOf(supportId: string, abilityId: string): SupportAbilityDef | undefined {
  return SUPPORTS[supportId]?.abilities.find((a) => a.id === abilityId);
}

/** Is a reaction with this trigger armed for `owner`? */
export const hasArmed = (s: GameState, owner: PlayerId, trigger: ReactionTrigger): boolean =>
  s.players[owner].armed.some((a) => a.trigger === trigger);

/**
 * Fire (and disarm) the first reaction `owner` has armed for `trigger`.
 * Returns its effect, or null if nothing was armed.
 */
export function consumeReaction(s: GameState, owner: PlayerId, trigger: ReactionTrigger, events: GameEvent[]): SupportEffect | null {
  const pl = s.players[owner];
  const i = pl.armed.findIndex((a) => a.trigger === trigger);
  if (i < 0) return null;
  const armed = pl.armed[i]!;
  pl.armed = pl.armed.filter((_, j) => j !== i);
  const ability = abilityOf(armed.support, armed.ability);
  if (!ability) return null;
  events.push({
    type: "support",
    player: owner,
    support: armed.support,
    ability: armed.ability,
    text: `${ability.name} springs into action!`,
  });
  return ability.effect;
}
