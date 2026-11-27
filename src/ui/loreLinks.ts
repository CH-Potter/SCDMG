// Small, always-loaded entry points to the lore pages and the intros. The lore, the intro storyboards
// and their art are loaded on first use with dynamic import(), so they stay out of the main bundle.

import { isBuiltInFaction } from "../engine/data/factions";
import type { IntroId } from "./intro/prefs";

export type LoreTab = "world" | "places" | "militia" | "swarm" | "concord";

const builtIn = (id: string): id is "militia" | "swarm" | "concord" => isBuiltInFaction(id);

/** Open the lore pages on a tab. Intros never play by themselves: each page has a button for its intro. */
export function showLore(tab: LoreTab | string = "world", opts: { onClose?: () => void } = {}): void {
  const t: LoreTab = tab === "places" || tab === "world" || builtIn(tab) ? (tab as LoreTab) : "world";
  void import("./lore/loreView")
    .then((m) => m.openLore(t, opts))
    .catch((err) => console.warn("Couldn't open the lore:", err));
}

/** Play an intro now ("game" or a built-in faction id). */
export function playIntro(id: IntroId | string, opts: { onClose?: () => void } = {}): void {
  void import("./intro/index")
    .then((m) => (id === "game" ? m.playGameIntro(opts) : m.playFactionIntro(id, opts)) ?? opts.onClose?.())
    .catch((err) => {
      console.warn("Couldn't play the intro:", err);
      opts.onClose?.();
    });
}
