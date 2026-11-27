// What the online lobby sends, and how both players turn it into the same game (no DOM here; the
// screens are in lobby.ts). See docs/pvp-feasibility.md §5.1 and §5.5.
//
// The host offers the mode, mission, battlefield, house rules, army rule and their own army; the
// guest answers with theirs. Each army is a faction (a built-in by id, a custom one as its full
// JSON) and, for list games, a roster. Everything from the other player is untrusted: it goes
// through the same cleaning and checks as a file import, and custom factions are registered under
// `net-p0` / `net-p1` ids for this game only, so they never touch your own saved factions.
//
// Both players run `agree` on exactly the same two messages and get exactly the same GameSetup: the
// host proposes it, and the guest accepts only a setup identical to the one it worked out itself.

import { BUILT_IN_FACTION_IDS, FACTIONS, isBuiltInFaction } from "../engine/data/factions";
import { factionProblems, NET_PREFIX } from "../engine/data/factionValidation";
import { MAPS, type MapDef } from "../engine/data/maps";
import { mapProblems } from "../engine/data/mapValidation";
import { missionMapProblem, MISSIONS, type MissionDef } from "../engine/data/missions";
import { MODES, type ModeId } from "../engine/data/modes";
import { setupFingerprint } from "../engine/fingerprint";
import type { GameSetup } from "../engine/game";
import { cleanRules, type HouseRules } from "../engine/houseRules";
import type { ArmyRule } from "../engine/openRoster";
import { applyComputedCosts } from "../engine/pricing";
import type { Faction, FactionId, ListEntry } from "../engine/types";
import { fitStarterLists, fixStructures } from "../forge/model";
import { cleanFaction, rekeyFaction, useNetFactions } from "./customFactions";
import { cleanMap } from "./customMaps";
import { listProblems } from "./lists";

/** Bump when the lobby messages change (the build check already keeps both players in step). */
export const LOBBY_VERSION = 1;
/** The most one player's lobby message may weigh (custom faction art included). */
export const MAX_LOBBY_BYTES = 512 * 1024;

// ---------------------------------------------------------------- wire messages

/** A faction: a built-in by id, or a custom one in full. */
export type WireFaction = { id: string } | { custom: unknown };
/** A roster, with ids as the sender knows them (`agree` maps custom ones to the game's). */
export interface WireList {
  entries: ListEntry[];
  supports: string[];
}
/** One player's army. `list` is left out in open-roster games. */
export interface WireArmy {
  faction: WireFaction;
  list?: WireList;
}

/** Host → guest: the game on offer. */
export interface HostOffer {
  v: typeof LOBBY_VERSION;
  kind: "host";
  mode: ModeId;
  missionId: string;
  map: { id: string } | { custom: unknown };
  rules: HouseRules;
  army: ArmyRule;
  side: WireArmy;
}

/** Guest → host: the guest's army, and whether they're ready to play it. */
export interface GuestPick {
  v: typeof LOBBY_VERSION;
  kind: "guest";
  side: WireArmy;
  ready: boolean;
}

/** Host → guest: the guest's army can't be played (they can pick again). */
export interface Refusal {
  v: typeof LOBBY_VERSION;
  kind: "refused";
  reasons: string[];
}

/** Either way: I've backed out. */
export interface Bye {
  v: typeof LOBBY_VERSION;
  kind: "bye";
}

export type LobbyMessage = HostOffer | GuestPick | Refusal | Bye;

// ---------------------------------------------------------------- small helpers

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const enc = new TextEncoder();

/** How many bytes `x` takes as JSON. */
export const jsonBytes = (x: unknown): number => enc.encode(JSON.stringify(x) ?? "").length;

/** A JSON round trip: what the other player will see of `x` (both players work from the same data). */
export const wire = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const kb = (n: number) => `${Math.ceil(n / 1024)} KB`;

// ---------------------------------------------------------------- sending

/** A faction as it goes over the wire. */
export function wireFaction(f: Faction): WireFaction {
  if (isBuiltInFaction(f.id)) return { id: f.id };
  const clean = cleanFaction(f);
  delete clean.custom;
  return { custom: clean };
}

/** An army list as it goes over the wire. */
export const wireList = (entries: ListEntry[], supports: string[]): WireList => ({
  entries: entries.map((e) => ({ profileId: e.profileId, upgrades: [...e.upgrades] })),
  supports: [...supports],
});

/**
 * Fit a lobby message within MAX_LOBBY_BYTES: if a custom faction makes it too big, its unit
 * pictures are left out (noted in `notes`). Returns the message to send, or null if it is still too big.
 */
export function fitLobbyMessage<T extends HostOffer | GuestPick>(msg: T, notes: string[] = []): T | null {
  if (jsonBytes(msg) <= MAX_LOBBY_BYTES) return msg;
  const f = msg.side.faction;
  if (!("custom" in f) || !isObj(f.custom) || !Array.isArray(f.custom.profiles)) return null;
  const lean = structuredClone(msg);
  const profiles = (lean.side.faction as { custom: Obj }).custom.profiles as unknown[];
  for (const p of profiles) if (isObj(p)) delete p.art;
  if (jsonBytes(lean) > MAX_LOBBY_BYTES) return null;
  notes.push(`Your faction's unit pictures were left out: with them it was over the ${kb(MAX_LOBBY_BYTES)} an online game can send. Your opponent sees plain tokens.`);
  return lean;
}

// ---------------------------------------------------------------- receiving

/** The other player's lobby message, checked for shape (its contents are checked by `agree`). Null if it isn't one. */
export function readLobbyMessage(raw: unknown): LobbyMessage | null {
  if (!isObj(raw) || raw.v !== LOBBY_VERSION) return null;
  if (raw.kind === "bye") return { v: LOBBY_VERSION, kind: "bye" };
  if (raw.kind === "refused") {
    const reasons = Array.isArray(raw.reasons) ? raw.reasons.filter((r): r is string => typeof r === "string").slice(0, 8).map((r) => r.slice(0, 300)) : [];
    return { v: LOBBY_VERSION, kind: "refused", reasons };
  }
  const army = readArmy(raw.side);
  if (!army) return null;
  if (raw.kind === "guest") return { v: LOBBY_VERSION, kind: "guest", side: army, ready: raw.ready === true };
  if (raw.kind !== "host") return null;
  if (typeof raw.mode !== "string" || !has(MODES, raw.mode)) return null;
  if (typeof raw.missionId !== "string" || !has(MISSIONS, raw.missionId)) return null;
  const map = raw.map;
  if (!isObj(map) || !((typeof map.id === "string" && !has(map, "custom")) || (isObj(map.custom) && !has(map, "id")))) return null;
  return {
    v: LOBBY_VERSION,
    kind: "host",
    mode: raw.mode as ModeId,
    missionId: raw.missionId,
    map: typeof map.id === "string" ? { id: map.id } : { custom: map.custom },
    rules: cleanRules(raw.rules),
    army: raw.army === "open" ? "open" : "list",
    side: army,
  };
}

function readArmy(raw: unknown): WireArmy | null {
  if (!isObj(raw) || !isObj(raw.faction)) return null;
  const f = raw.faction;
  let faction: WireFaction;
  if (typeof f.id === "string" && !has(f, "custom")) faction = { id: f.id };
  else if (isObj(f.custom) && !has(f, "id")) faction = { custom: f.custom };
  else return null;
  const out: WireArmy = { faction };
  if (raw.list !== undefined) {
    const l = raw.list;
    if (!isObj(l) || !Array.isArray(l.entries) || !Array.isArray(l.supports) || l.entries.length > 200 || l.supports.length > 50) return null;
    out.list = {
      entries: l.entries.map((e) => ({
        profileId: isObj(e) ? String(e.profileId).slice(0, 300) : "",
        upgrades: isObj(e) && Array.isArray(e.upgrades) ? e.upgrades.slice(0, 20).map((u) => String(u).slice(0, 300)) : [],
      })),
      supports: l.supports.map((s) => String(s).slice(0, 300)),
    };
  }
  return out;
}

/** A custom faction from the other player, made safe to play: cleaned, checked and renamed for this game. */
export interface NetFaction {
  /** The faction under its game id (`net-p0` or `net-p1`), or null if it can't be played. */
  faction: Faction | null;
  problems: string[];
  /** What cleaning changed. */
  notes: string[];
  /** The sender's profile and support ids → the game's. */
  ids: Map<string, string>;
}

/** The game id of a custom faction played by `seat`. */
export const netFactionId = (seat: 0 | 1): FactionId => `${NET_PREFIX}p${seat}`;

/**
 * Turn a custom faction from the wire into one this game can use, the way a file import does:
 * known fields only, every value coerced, costs recomputed from the stats, then validated. Its ids
 * become `net-p<seat>` (and `net-p<seat>:<unit>`), whatever the sender called them.
 */
export function netFaction(raw: unknown, seat: 0 | 1): NetFaction {
  const ids = new Map<string, string>();
  if (!isObj(raw) || !Array.isArray(raw.profiles)) return { faction: null, problems: ["That isn't a faction"], notes: [], ids };
  if (jsonBytes(raw) > MAX_LOBBY_BYTES) return { faction: null, problems: [`The faction is too big to play online (over ${kb(MAX_LOBBY_BYTES)})`], notes: [], ids };
  const notes: string[] = [];
  // Cleaned as a custom faction whatever id it claims (a built-in's id would keep hand-set costs).
  const clean = cleanFaction({ ...raw, id: netFactionId(seat) }, notes);
  delete clean.custom;
  clean.name = (clean.name.trim() || "Opponent's faction").slice(0, 40);
  const f = rekeyFaction(clean, netFactionId(seat));
  clean.profiles.forEach((p, i) => ids.set(p.id, f.profiles[i]!.id));
  clean.supports.forEach((s, i) => ids.set(s.id, f.supports[i]!.id));
  fixStructures(f);
  // Costs always come from the stats here, even if the sender claimed a built-in's id.
  applyComputedCosts(f);
  fitStarterLists(f);
  const builtIns = BUILT_IN_FACTION_IDS.map((id) => FACTIONS[id]!);
  const problems = factionProblems(f, { others: builtIns });
  return { faction: problems.length ? null : { ...f, custom: true }, problems, notes, ids };
}

/** The battlefield on offer: a built-in by id, or a custom one (cleaned and checked like an import). */
export function netMap(raw: HostOffer["map"]): { map: MapDef | null; problems: string[] } {
  if ("id" in raw) {
    const m = has(MAPS, raw.id) ? MAPS[raw.id] : undefined;
    return m ? { map: m, problems: [] } : { map: null, problems: [`Unknown battlefield "${raw.id.slice(0, 40)}"`] };
  }
  if (jsonBytes(raw.custom) > MAX_LOBBY_BYTES) return { map: null, problems: ["The battlefield is too big to play online"] };
  const map = cleanMap(raw.custom);
  if (!isObj(map)) return { map: null, problems: ["That isn't a battlefield"] };
  map.id = "net-map";
  map.name = (typeof map.name === "string" && map.name.trim() ? map.name : "Opponent's battlefield").slice(0, 60);
  map.blurb = typeof map.blurb === "string" ? map.blurb.slice(0, 300) : "";
  map.custom = true;
  const problems = mapProblems(map);
  return problems.length ? { map: null, problems } : { map, problems: [] };
}

// ---------------------------------------------------------------- the agreed game

/** One side of the agreed game. */
export interface AgreedSide {
  faction: Faction;
  /** The roster (open roster: empty). */
  entries: ListEntry[];
  supports: string[];
  /** True if the faction came from that player's faction forge. */
  custom: boolean;
}

export interface Agreement {
  /** What the host proposes (without a seed: the session adds a joint one). */
  setup: GameSetup;
  mode: ModeId;
  mission: MissionDef;
  map: MapDef;
  rules: HouseRules;
  army: ArmyRule;
  sides: [AgreedSide, AgreedSide];
  /** The custom factions this game registered (`net-` ids). */
  netFactions: Faction[];
  /** What cleaning changed in the custom factions (for the record; nothing to act on). */
  notes: string[];
}

export type AgreeResult = { ok: true; game: Agreement } | { ok: false; problems: string[]; side?: 0 | 1 };

/**
 * The game both players agreed on, worked out the same way on both sides from the host's offer
 * and the guest's pick (as they arrived over the wire). Registers the game's custom factions (their
 * `net-` ids; `dropNetFactions` forgets them). `side` says whose army was the problem.
 */
export function agree(offer: HostOffer, pick: GuestPick): AgreeResult {
  const mode = offer.mode;
  const mission = has(MISSIONS, offer.missionId) ? MISSIONS[offer.missionId] : undefined;
  if (!has(MODES, mode) || !mission || mission.mode !== mode) return { ok: false, problems: ["The host's mission doesn't fit the game mode"], side: 0 };
  const { map, problems: mapIssues } = netMap(offer.map);
  if (!map) return { ok: false, problems: mapIssues.map((p) => `Battlefield: ${p}`), side: 0 };
  const fit = missionMapProblem(mission, map);
  if (map.mode !== mode || fit) return { ok: false, problems: [fit ?? "The battlefield doesn't fit the game mode"], side: 0 };
  const rules = cleanRules(offer.rules);
  const army: ArmyRule = offer.army === "open" ? "open" : "list";

  // Both factions first: lists are checked against the registered factions.
  const notes: string[] = [];
  const resolved: { faction: Faction; ids: Map<string, string>; custom: boolean }[] = [];
  for (const seat of [0, 1] as const) {
    const wireF = (seat === 0 ? offer : pick).side.faction;
    const who = seat === 0 ? "The host's faction" : "Your opponent's faction";
    if ("id" in wireF) {
      if (!(BUILT_IN_FACTION_IDS as readonly string[]).includes(wireF.id)) return { ok: false, problems: [`${who} isn't one this game knows`], side: seat };
      resolved.push({ faction: FACTIONS[wireF.id]!, ids: new Map(), custom: false });
      continue;
    }
    const nf = netFaction(wireF.custom, seat);
    if (!nf.faction) return { ok: false, problems: nf.problems.slice(0, 6).map((p) => `${who}: ${p}`), side: seat };
    notes.push(...nf.notes);
    resolved.push({ faction: nf.faction, ids: nf.ids, custom: true });
  }
  const netFactions = resolved.filter((r) => r.custom).map((r) => r.faction);
  useNetFactions(netFactions);

  const sides: AgreedSide[] = [];
  for (const seat of [0, 1] as const) {
    const r = resolved[seat]!;
    const wl = (seat === 0 ? offer : pick).side.list;
    if (army === "open") {
      sides.push({ faction: r.faction, entries: [], supports: [], custom: r.custom });
      continue;
    }
    if (!wl) return { ok: false, problems: [`${seat === 0 ? "The host" : "Your opponent"} didn't send an army list`], side: seat };
    const rename = (id: string) => r.ids.get(id) ?? id;
    const entries = wl.entries.map((e) => ({ profileId: rename(e.profileId), upgrades: [...e.upgrades] }));
    const supports = wl.supports.map(rename);
    const problems = listProblems({ faction: r.faction.id, mode, entries, supports }, false, undefined, rules.classLimits);
    if (problems.length) return { ok: false, problems: problems.slice(0, 6).map((p) => `${seat === 0 ? "The host's" : "Your opponent's"} army list: ${p}`), side: seat };
    sides.push({ faction: r.faction, entries, supports, custom: r.custom });
  }
  const [a, b] = sides as [AgreedSide, AgreedSide];

  const setup: GameSetup = {
    factions: [a.faction.id, b.faction.id],
    ...("id" in offer.map ? { mapId: map.id } : { map }),
    missionId: mission.id,
    orderChoice: true,
    armyRule: army,
    rules,
    ...(army === "list" ? { lists: [a.entries, b.entries] as [ListEntry[], ListEntry[]], supports: [a.supports, b.supports] as [string[], string[]] } : {}),
  };
  return { ok: true, game: { setup, mode, mission, map, rules, army, sides: [a, b], netFactions, notes } };
}

/** Guest: the setup the host proposed is exactly the agreed one (seed aside), so it is safe to accept. */
export function matchesAgreement(offered: GameSetup, game: Agreement): boolean {
  const { seed: _a, ...theirs } = offered;
  const { seed: _b, ...mine } = game.setup;
  return setupFingerprint(theirs) === setupFingerprint(mine);
}
