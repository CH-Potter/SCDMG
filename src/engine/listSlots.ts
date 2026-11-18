// Army slots for a list of the registered factions (built-in and custom): see data/unitClasses.ts.

import { factionOf, PROFILES, SUPPORTS } from "./data/factions";
import type { ModeId } from "./data/modes";
import { slotCounts, slotProblems, type SlotCount } from "./data/unitClasses";
import type { FactionId, ListEntry } from "./types";

/** Slots a list uses and may have. A unit's class comes from its base profile (upgrades don't change it). */
export function listSlots(faction: FactionId, mode: ModeId, entries: readonly ListEntry[], supports: readonly string[]): SlotCount[] {
  const cards = supports.flatMap((id) => (Object.hasOwn(SUPPORTS, id) ? [SUPPORTS[id]!] : []));
  return slotCounts(mode, factionOf(faction), entries, cards, (id) => (Object.hasOwn(PROFILES, id) ? PROFILES[id] : undefined));
}

/** Slot problems for a list (empty when it fits). */
export const listSlotProblems = (faction: FactionId, mode: ModeId, entries: readonly ListEntry[], supports: readonly string[]): string[] =>
  slotProblems(listSlots(faction, mode, entries, supports));
