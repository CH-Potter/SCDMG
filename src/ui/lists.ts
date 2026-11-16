// Saved army lists (rosters), kept in browser storage, with validation and file import/export.

import { baseProfile, defaultListFor, entryCost, FACTIONS, listCost, PROFILES, factionOf, defaultSupportsFor, SUPPORTS, supportsCost } from "../engine/data/factions";
import { MODES, type ModeId } from "../engine/data/modes";
import type { FactionId, ListEntry } from "../engine/types";
import { loadJson, newId, saveJson } from "./files";

export interface SavedList {
  id: string;
  name: string;
  faction: FactionId;
  mode: ModeId;
  entries: ListEntry[];
  /** Off-board support ids (paid in Fizz). */
  supports: string[];
  updated: number;
}

const KEY = "scdmg.lists.v1";
const FORMAT = "scdmg-list";

export function listSavedLists(): SavedList[] {
  const lists = loadJson<SavedList[]>(KEY, []);
  return Array.isArray(lists)
    ? lists.map((l) => ({ ...l, supports: Array.isArray(l?.supports) ? l.supports : [] })).filter((l) => listProblems(l, false).length === 0)
    : [];
}

export function saveList(list: SavedList): string[] {
  const problems = listProblems(list);
  if (problems.length) return problems;
  const rest = loadJson<SavedList[]>(KEY, []).filter((l) => l.id !== list.id);
  return saveJson(KEY, [...rest, { ...list, updated: Date.now() }]) ? [] : ["Couldn't save: browser storage is unavailable or full"];
}

/** Forget every saved list for a faction (used when a custom faction is deleted). */
export function deleteListsForFaction(factionId: string): void {
  saveJson(
    KEY,
    loadJson<SavedList[]>(KEY, []).filter((l) => l?.faction !== factionId),
  );
}

export function deleteList(id: string): void {
  saveJson(
    KEY,
    loadJson<SavedList[]>(KEY, []).filter((l) => l.id !== id),
  );
}

export function starterList(faction: FactionId, mode: ModeId): SavedList {
  return {
    id: `starter-${faction}-${mode}`,
    name: `${factionOf(faction).name} starter (${MODES[mode].name})`,
    faction,
    mode,
    entries: defaultListFor(faction, mode),
    supports: defaultSupportsFor(faction, mode),
    updated: 0,
  };
}

export const isStarter = (l: SavedList): boolean => l.id.startsWith("starter-");

/** Lists you can pick for a faction and mode: the starter first, then saved ones. */
export function listsFor(faction: FactionId, mode: ModeId): SavedList[] {
  return [starterList(faction, mode), ...listSavedLists().filter((l) => l.faction === faction && l.mode === mode)];
}

export function findList(id: string): SavedList | undefined {
  if (id.startsWith("starter-")) {
    const [, faction, mode] = id.split("-") as [string, FactionId, ModeId];
    if (FACTIONS[faction] && MODES[mode]) return starterList(faction, mode);
  }
  return listSavedLists().find((l) => l.id === id);
}

/**
 * Problems that make a list unplayable. `strict` also checks the name. `budget` replaces the mode's
 * roster limit (the campaign's growing budget).
 */
export function listProblems(l: Partial<SavedList>, strict = true, budget?: { limit: number; label: string }): string[] {
  const errs: string[] = [];
  if (!l || typeof l !== "object") return ["Not a list"];
  if (strict && !l.name?.trim()) errs.push("Give the list a name");
  if (!l.faction || !Object.hasOwn(FACTIONS, l.faction)) errs.push("Unknown faction");
  const mode = l.mode && Object.hasOwn(MODES, l.mode) ? MODES[l.mode] : undefined;
  if (!mode) errs.push("Unknown game mode");
  if (!Array.isArray(l.entries)) return [...errs, "Missing units"];
  if (errs.length) return errs;
  if (!l.entries.length) errs.push("Add at least one unit");
  const counts = new Map<string, number>();
  for (const e of l.entries) {
    const p = typeof e?.profileId === "string" && Object.hasOwn(PROFILES, e.profileId) ? PROFILES[e.profileId] : undefined;
    if (!p) {
      errs.push(`Unknown unit ${e?.profileId}`);
      continue;
    }
    if (p.faction !== l.faction) errs.push(`${p.name} isn't in ${factionOf(l.faction!).name}`);
    for (const u of e.upgrades ?? []) if (!p.upgrades.some((x) => x.id === u)) errs.push(`${p.name}: unknown upgrade ${u}`);
    if (new Set(e.upgrades).size !== (e.upgrades ?? []).length) errs.push(`${p.name}: duplicate upgrade`);
    if (p.structure?.summonOnly) errs.push(`${p.name} can only be summoned, not bought`);
    counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
  }
  const sups = Array.isArray(l.supports) ? l.supports : [];
  for (const id of sups) {
    const sp = typeof id === "string" && Object.hasOwn(SUPPORTS, id) ? SUPPORTS[id] : undefined;
    if (!sp) errs.push(`Unknown support ${id}`);
    else if (sp.faction !== l.faction) errs.push(`${sp.name} isn't a ${factionOf(l.faction!).name} support`);
  }
  if (new Set(sups).size !== sups.length) errs.push("Each support can only be taken once");
  if (errs.length) return errs;
  const cost = listCost(l.entries);
  if (budget) {
    if (cost > budget.limit) errs.push(`Over the ${budget.label}: ${cost}/${budget.limit} resources`);
  } else if (cost > mode!.rosterLimit) errs.push(`Over the ${mode!.name} limit: ${cost}/${mode!.rosterLimit} resources`);
  if (l.entries.length > mode!.maxUnits) errs.push(`Too many units: ${l.entries.length}/${mode!.maxUnits}`);
  const fizz = supportsCost(sups);
  if (fizz > mode!.fizzLimit) errs.push(`Over the ${mode!.name} Fizz budget: ${fizz}/${mode!.fizzLimit}`);
  for (const [id, n] of counts) {
    if (n > mode!.maxCopies) errs.push(`At most ${mode!.maxCopies} × ${baseProfile(id).name}`);
  }
  return errs;
}

export function exportable(l: SavedList): unknown {
  return { format: FORMAT, version: 2, name: l.name, faction: l.faction, mode: l.mode, entries: l.entries, supports: l.supports };
}

/** Turn imported JSON into a list with a fresh id, or return problems. */
export function fromImport(data: unknown): SavedList | string[] {
  const d = data as Partial<SavedList> & { format?: string };
  if (!d || typeof d !== "object" || d.format !== FORMAT) return ["That file isn't an SCDMG army list"];
  const list: SavedList = {
    id: newId("list"),
    name: String(d.name ?? "Imported list").slice(0, 60),
    faction: d.faction as FactionId,
    mode: d.mode as ModeId,
    entries: Array.isArray(d.entries)
      ? d.entries.map((e) => ({ profileId: String(e?.profileId), upgrades: Array.isArray(e?.upgrades) ? e.upgrades.map(String) : [] }))
      : [],
    supports: Array.isArray(d.supports) ? d.supports.map(String) : [],
    updated: Date.now(),
  };
  const problems = listProblems(list);
  return problems.length ? problems : list;
}

export { entryCost, listCost };
