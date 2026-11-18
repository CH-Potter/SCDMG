// Public entry for the intros (loaded lazily: see src/ui/loreLinks.ts).

import { isLoreFaction } from "../../engine/data/lore";
import { factionIntro, GAME_INTRO } from "./scripts";
import { introLength, playIntro, type IntroHandle, type PlayOptions } from "./stage";

export type { IntroHandle, PlayOptions };

/** The game intro: the Dustline, its two invasions, and the drafted frontier that won't leave. */
export function playGameIntro(opts: PlayOptions = {}): IntroHandle {
  return playIntro(GAME_INTRO(), opts);
}

/** A built-in faction's intro (null for custom factions, which have no lore). */
export function playFactionIntro(factionId: string, opts: PlayOptions = {}): IntroHandle | null {
  return isLoreFaction(factionId) ? playIntro(factionIntro(factionId), opts) : null;
}

/** Running times (ms), for the docs and tests. */
export const introLengths = (): Record<string, number> => ({
  game: introLength(GAME_INTRO()),
  militia: introLength(factionIntro("militia")),
  swarm: introLength(factionIntro("swarm")),
  concord: introLength(factionIntro("concord")),
});

// Dev review: __scdmgIntro.play("swarm", { freezeAt: 4200 }) from the console or a screenshot script.
if (import.meta.env?.DEV && typeof window !== "undefined") {
  (window as unknown as { __scdmgIntro: unknown }).__scdmgIntro = {
    play: (id: string, opts: PlayOptions = {}) => (id === "game" ? playGameIntro(opts) : playFactionIntro(id, opts)),
    lengths: introLengths,
  };
}
