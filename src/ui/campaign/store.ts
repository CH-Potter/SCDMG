// The campaign save: one campaign at a time, in localStorage behind try/catch (storage may be blocked
// or full). Pure apart from the storage you pass in, so the tests can use a fake.

import { CAMPAIGN_FORMAT, LEGACY_SIDES, parseCampaign, serializeCampaign, type CampaignState } from "../../engine/campaign";

export const CAMPAIGN_KEY = "scdmg.campaign.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The saved campaign, or null if there is none (or it is corrupt, or from a version this game can't read). */
export function loadCampaign(storage: StorageLike | null = defaultStorage()): CampaignState | null {
  try {
    const raw = storage?.getItem(CAMPAIGN_KEY);
    return raw ? parseCampaign(raw) : null;
  } catch {
    return null;
  }
}

/** Is there something in the save slot this version can't read? (So the screen can say so.) */
export function hasUnreadableSave(storage: StorageLike | null = defaultStorage()): boolean {
  try {
    const raw = storage?.getItem(CAMPAIGN_KEY);
    return !!raw && parseCampaign(raw) === null;
  } catch {
    return false;
  }
}

/**
 * The side of a saved campaign this version recognises but can't continue: "munch" for a campaign
 * fought on the Munch's side, from before the Skitterswarm took their place in the Dustline. Null
 * when there's no such save (none at all, a readable one, or just a corrupt file).
 */
export function legacySaveSide(storage: StorageLike | null = defaultStorage()): string | null {
  try {
    const raw = storage?.getItem(CAMPAIGN_KEY);
    if (!raw || parseCampaign(raw) !== null) return null;
    const d = JSON.parse(raw) as { format?: unknown; faction?: unknown } | null;
    return d && d.format === CAMPAIGN_FORMAT && typeof d.faction === "string" && LEGACY_SIDES.includes(d.faction) ? d.faction : null;
  } catch {
    return null;
  }
}

/** Save the campaign. Returns false if storage is unavailable or full. */
export function saveCampaign(
  s: CampaignState,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(CAMPAIGN_KEY, serializeCampaign({ ...s, updated: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** Delete the saved campaign. */
export function clearCampaign(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(CAMPAIGN_KEY);
  } catch {
    /* nothing to do */
  }
}
