// Which intros the player has already watched. The intros never play by themselves; this only records
// which ones were opened from the menu or the lore pages. Kept in
// localStorage behind try/catch (storage may be blocked); pure apart from the storage you pass in.

export const INTRO_SEEN_KEY = "scdmg.intro.v1";

/** "game" for the game intro, or a built-in faction id. */
export type IntroId = "game" | "militia" | "swarm" | "concord";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The set of intros seen so far (anything odd in storage counts as nothing seen). */
export function loadSeen(storage: StorageLike | null = defaultStorage()): Set<string> {
  try {
    const raw = storage?.getItem(INTRO_SEEN_KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 32) : []);
  } catch {
    return new Set();
  }
}

export function hasSeenIntro(id: IntroId, storage: StorageLike | null = defaultStorage()): boolean {
  return loadSeen(storage).has(id);
}

/** Remember that an intro was shown. Returns false if storage is unavailable. */
export function markIntroSeen(id: IntroId, storage: StorageLike | null = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    const seen = loadSeen(storage);
    if (seen.has(id)) return true;
    seen.add(id);
    storage.setItem(INTRO_SEEN_KEY, JSON.stringify([...seen]));
    return true;
  } catch {
    return false;
  }
}
