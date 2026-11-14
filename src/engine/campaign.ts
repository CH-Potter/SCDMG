// The campaign rules: a war across the Dustline, three acts and a finale, for one built-in faction.
// Pure and deterministic, no DOM: the campaign screen (src/ui/campaign/) calls these, saves the
// state as JSON, and feeds `battleSetup` into createGame.
//
// How the war moves:
//   - Each act offers a few battles; you fight `ACTS[act].fights` of them, in any order.
//   - Win and you hold the battle's place; lose and the enemy takes it; a draw leaves it as it was.
//   - When the act ends, every battle you skipped goes to its enemy (unless you fought for that place
//     this act), and the battles between the other two sides are settled off-screen.
//   - Losing (or retreating) leaves your army battered: less roster budget for the next battle only.
//   - After Act III you face whichever rival holds more of the valley at Fizzwater Ford. Win or lose,
//     that battle ends the campaign; a draw is fought again.
//   - Places you hold give modest perks in later battles (data/campaign.ts PLACE_PERKS, capped by PERK_CAPS).

import {
  ACT_BUDGET,
  ACTS,
  BATTERED_PENALTY,
  CAMPAIGNS,
  DEFAULT_RIVAL,
  FINALE,
  PERK_CAPS,
  PLACE_PERKS,
  WELLSPRING_FATE,
  type CampaignAct,
  type CampaignBattleDef,
  type FactionCampaign,
  type PerkKind,
  type PlacePerk,
} from "./data/campaign";
import {
  baseProfile,
  defaultListFor,
  defaultSupportsFor,
  entryCost,
  listCost,
  PROFILES,
  SUPPORTS,
  supportsCost,
} from "./data/factions";
import {
  BATTLES,
  LORE_FACTIONS,
  LORE_FACTION_IDS,
  PLACES,
  leaderOf,
  placeById,
  type LoreFactionId,
} from "./data/lore";
import { MAPS, type MapDef } from "./data/maps";
import { MISSIONS, swapMapSides, swapMissionSides, type MissionDef } from "./data/missions";
import { MODES, type ModeId } from "./data/modes";
import type { GameSetup, StartBonus } from "./game";
import type { ListEntry } from "./types";

export const CAMPAIGN_FORMAT = "scdmg-campaign";
export const CAMPAIGN_VERSION = 1;

/** 1 to 3: the acts. 4: the finale at Fizzwater Ford. */
export type CampaignStage = CampaignAct | 4;
export type Outcome = "win" | "loss" | "draw";

export interface Roster {
  entries: ListEntry[];
  supports: string[];
}

export interface BattleRecord {
  battleId: string;
  /** The act it was fought in (4: the finale). */
  act: CampaignStage;
  outcome: Outcome;
  /** Your VP, then the enemy's. */
  vp: [number, number];
  retreated?: boolean;
}

export type ChronicleTone = "story" | "win" | "loss" | "draw" | "lost" | "meanwhile";

export interface ChronicleEntry {
  act: CampaignStage;
  tone: ChronicleTone;
  text: string;
}

export interface CampaignState {
  format: typeof CAMPAIGN_FORMAT;
  version: typeof CAMPAIGN_VERSION;
  faction: LoreFactionId;
  /** Seeds the battles and the off-screen fights. */
  seed: number;
  act: CampaignStage;
  /** Who holds each place (place id -> faction, or null for nobody). */
  holders: Record<string, LoreFactionId | null>;
  results: BattleRecord[];
  /** You lost your last battle: less roster budget for the next one. */
  battered: boolean;
  /** Your army for each game mode. */
  army: Record<ModeId, Roster>;
  /** The story so far. */
  chronicle: ChronicleEntry[];
  /** Who you face at the ford (set when the finale begins). */
  rival: LoreFactionId | null;
  /** Set once the finale has been won or lost. */
  ending: "win" | "loss" | null;
  /** Play the comic-panel story scenes before and after battles. */
  scenes: boolean;
  /** When it was last saved (ms since 1970), for the save list. Not used by the rules. */
  updated?: number;
}

const MODE_IDS: ModeId[] = ["skirmish", "assault"];
const ROMAN: Record<CampaignAct, string> = { 1: "I", 2: "II", 3: "III" };

export const campaignOf = (s: Pick<CampaignState, "faction">): FactionCampaign =>
  CAMPAIGNS[s.faction];
/** A faction's name; `mid` for the middle of a sentence ("the Munch"). */
export const factionName = (f: LoreFactionId, mid = false): string =>
  mid ? LORE_FACTIONS[f].name.replace(/^The /, "the ") : LORE_FACTIONS[f].name;
/** A place's name; `mid` for the middle of a sentence ("the Old Refinery"). */
export const placeName = (id: string, mid = false): string => {
  const n = placeById(id)?.name ?? id;
  return mid ? n.replace(/^The /, "the ") : n;
};
/** The two factions you fight. */
export const rivalsOf = (f: LoreFactionId): LoreFactionId[] =>
  LORE_FACTION_IDS.filter((x) => x !== f);
export const modeOfMission = (missionId: string): ModeId => MISSIONS[missionId]?.mode ?? "skirmish";
/** The act whose budget a stage uses (the finale is fought at Act III strength). */
export const budgetAct = (stage: CampaignStage): CampaignAct => (stage === 4 ? 3 : stage);
export const stageName = (stage: CampaignStage): string =>
  stage === 4 ? "The Battle of Fizzwater Ford" : ACTS[stage].name;
export const stageShort = (stage: CampaignStage): string =>
  stage === 4 ? "Finale" : `Act ${ROMAN[stage]}`;

/** Fill `{rival}`, `{rivalLeader}` and `{fate}` in finale and ending text. */
export function fillStory(text: string, rival: LoreFactionId | null): string {
  if (!rival) return text;
  return text
    .replace(/\{rival\}/g, LORE_FACTIONS[rival].name.replace(/^The /, "the "))
    .replace(/\{rivalLeader\}/g, leaderOf(rival).name)
    .replace(/\{fate\}/g, WELLSPRING_FATE[rival]);
}

/** Small deterministic hash, for the off-screen battles. */
function hash(seed: number, text: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  return (h ^ (h >>> 12)) >>> 0;
}

// ---------------------------------------------------------------- armies

/**
 * The biggest part of `entries` that fits `budget`: keeps as much cost as possible, then the priciest
 * unit (the army's centrepiece), then as many units as possible, dropping later entries first.
 * Deterministic. Always keeps at least one unit if any fits.
 */
export function fitList(entries: ListEntry[], budget: number): ListEntry[] {
  if (listCost(entries) <= budget) return structuredClone(entries);
  const n = entries.length;
  if (n > 16) {
    // Not a real roster (more units than any mode allows): just drop from the end.
    const out = structuredClone(entries);
    while (out.length && listCost(out) > budget) out.pop();
    return out;
  }
  const costs = entries.map(entryCost);
  let best: { mask: number; kept: number; top: number; count: number; late: number } | null = null;
  // n is at most a mode's unit limit (14), so trying every subset is cheap.
  for (let mask = 1; mask < 1 << n; mask++) {
    let kept = 0;
    let top = 0;
    let count = 0;
    let late = 0;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) {
        late += i;
        continue;
      }
      kept += costs[i]!;
      top = Math.max(top, costs[i]!);
      count++;
    }
    if (kept > budget) continue;
    const better =
      !best ||
      kept > best.kept ||
      (kept === best.kept &&
        (top > best.top ||
          (top === best.top &&
            (count > best.count || (count === best.count && late > best.late)))));
    if (better) best = { mask, kept, top, count, late };
  }
  if (!best) return [];
  return entries.filter((_, i) => best!.mask & (1 << i)).map((e) => structuredClone(e));
}

/** Your starting army for a mode: the faction's starter, trimmed to Act I's budget. */
export function starterRoster(faction: LoreFactionId, mode: ModeId, act: CampaignAct = 1): Roster {
  return {
    entries: fitList(defaultListFor(faction, mode), ACT_BUDGET[act][mode]),
    supports: defaultSupportsFor(faction, mode),
  };
}

// ---------------------------------------------------------------- a new campaign

export function newCampaign(faction: LoreFactionId, seed: number): CampaignState {
  const holders: Record<string, LoreFactionId | null> = {};
  for (const p of PLACES) holders[p.id] = p.heldBy;
  return {
    format: CAMPAIGN_FORMAT,
    version: CAMPAIGN_VERSION,
    faction,
    seed: seed >>> 0,
    act: 1,
    holders,
    results: [],
    battered: false,
    army: {
      skirmish: starterRoster(faction, "skirmish"),
      assault: starterRoster(faction, "assault"),
    },
    chronicle: [
      { act: 1, tone: "story", text: `${LORE_FACTIONS[faction].name} go to war. ${ACTS[1].name}.` },
    ],
    rival: null,
    ending: null,
    scenes: true,
  };
}

// ---------------------------------------------------------------- battles

/** The finale as a battle, against `rival`. */
export function finaleBattle(faction: LoreFactionId, rival: LoreFactionId): CampaignBattleDef {
  const c = CAMPAIGNS[faction];
  return {
    id: FINALE.id,
    act: 3,
    title: FINALE.title,
    placeId: FINALE.placeId,
    mapId: FINALE.mapId,
    missionId: FINALE.missionId,
    enemy: rival,
    side: 0,
    hook: fillStory(c.finale.hook, rival),
    brief: [
      c.finale.brief,
      { who: LORE_FACTIONS[rival].leaderId, text: LORE_FACTIONS[rival].quote },
    ],
    win: c.finale.win,
    loss: c.finale.loss,
  };
}

/** A battle of this campaign by id (including the finale once it is set). */
export function battleById(s: CampaignState, id: string): CampaignBattleDef | undefined {
  if (id === FINALE.id) return finaleBattle(s.faction, s.rival ?? computeRival(s));
  return campaignOf(s).battles.find((b) => b.id === id);
}

/** Has this battle been fought? (A drawn finale is fought again, so it doesn't count.) */
export const hasFought = (s: CampaignState, id: string): boolean =>
  s.results.some((r) => r.battleId === id && (id !== FINALE.id || r.outcome !== "draw"));

/** Battles fought (including draws) in an act. */
export const foughtIn = (s: CampaignState, act: CampaignStage): BattleRecord[] =>
  s.results.filter((r) => r.act === act);

/** What you can fight next. */
export function availableBattles(s: CampaignState): CampaignBattleDef[] {
  if (s.ending) return [];
  if (s.act === 4) return [finaleBattle(s.faction, s.rival ?? computeRival(s))];
  return campaignOf(s).battles.filter((b) => b.act === s.act && !hasFought(s, b.id));
}

/** Battles still to fight before the current act ends. */
export const battlesLeftInAct = (s: CampaignState): number =>
  s.ending ? 0 : s.act === 4 ? 1 : Math.max(0, ACTS[s.act].fights - foughtIn(s, s.act).length);

/** The rival who holds more of the valley's battlefields faces you at the ford (ties: the story's default). */
export function computeRival(s: Pick<CampaignState, "faction" | "holders">): LoreFactionId {
  const count = (f: LoreFactionId) =>
    Object.keys(PLACE_PERKS).filter((p) => s.holders[p] === f).length;
  const [a, b] = rivalsOf(s.faction) as [LoreFactionId, LoreFactionId];
  const ca = count(a);
  const cb = count(b);
  return ca === cb ? DEFAULT_RIVAL[s.faction] : ca > cb ? a : b;
}

/** Places (with a perk) that a faction holds. */
export const placesHeldBy = (s: Pick<CampaignState, "holders">, f: LoreFactionId): string[] =>
  Object.keys(PLACE_PERKS).filter((p) => s.holders[p] === f);

// ---------------------------------------------------------------- perks

export interface HeldPerk {
  placeId: string;
  perk: PlacePerk;
  /** For unit and support perks: what you get. */
  grant?: string;
  /** False when the cap for its kind is already full from places listed before it. */
  active: boolean;
}

export interface PerkTotals {
  cp: number;
  resources: number;
  budget: number;
  units: string[];
  supports: string[];
}

/** The perks of the places you hold, in place order, each marked active or over the cap. */
export function heldPerks(s: Pick<CampaignState, "faction" | "holders">): HeldPerk[] {
  const used: Record<PerkKind, number> = { cp: 0, resources: 0, budget: 0, unit: 0, support: 0 };
  const out: HeldPerk[] = [];
  for (const [placeId, perk] of Object.entries(PLACE_PERKS)) {
    if (s.holders[placeId] !== s.faction) continue;
    const step = perk.kind === "unit" || perk.kind === "support" ? 1 : (perk.amount ?? 0);
    const active = used[perk.kind] < PERK_CAPS[perk.kind];
    if (active) used[perk.kind] = Math.min(PERK_CAPS[perk.kind], used[perk.kind] + step);
    out.push({ placeId, perk, grant: perk.byFaction?.[s.faction], active });
  }
  return out;
}

/** Everything your places give you in the next battle, capped (PERK_CAPS). */
export function perkTotals(s: Pick<CampaignState, "faction" | "holders">): PerkTotals {
  const t: PerkTotals = { cp: 0, resources: 0, budget: 0, units: [], supports: [] };
  for (const h of heldPerks(s)) {
    if (!h.active) continue;
    const k = h.perk.kind;
    if (k === "unit" && h.grant) t.units.push(h.grant);
    else if (k === "support" && h.grant) t.supports.push(h.grant);
    else if (k === "cp" || k === "resources" || k === "budget")
      t[k] = Math.min(PERK_CAPS[k], t[k] + (h.perk.amount ?? 0));
  }
  t.units = t.units.slice(0, PERK_CAPS.unit);
  t.supports = t.supports.slice(0, PERK_CAPS.support);
  return t;
}

/** A perk in words, e.g. "+1 CP at the start of every battle". */
export function perkText(perk: PlacePerk, faction: LoreFactionId): string {
  const grant = perk.byFaction?.[faction];
  switch (perk.kind) {
    case "cp":
      return `+${perk.amount} CP at the start of every battle`;
    case "resources":
      return `+${perk.amount} starting resource${perk.amount === 1 ? "" : "s"} (⚙) in every battle`;
    case "budget":
      return `+${perk.amount} roster budget (⚙) for your army`;
    case "unit":
      return `A free ${grant && PROFILES[grant] ? PROFILES[grant]!.name : "unit"} joins your army in every battle`;
    case "support":
      return `A free ${grant && SUPPORTS[grant] ? SUPPORTS[grant]!.name : "support card"} (no Fizz) in every battle`;
  }
}

/** Your roster budget for a mode right now: the act's budget, plus place perks, minus the battered penalty. */
export function budgetFor(s: CampaignState, mode: ModeId): number {
  return (
    ACT_BUDGET[budgetAct(s.act)][mode] + perkTotals(s).budget - (s.battered ? BATTERED_PENALTY : 0)
  );
}

/** Why a roster can't be taken into battle (empty when it can). */
export function rosterProblems(s: CampaignState, mode: ModeId, r: Roster): string[] {
  const errs: string[] = [];
  const m = MODES[mode];
  if (!r.entries.length) errs.push("Add at least one unit");
  const counts = new Map<string, number>();
  for (const e of r.entries) {
    const p = PROFILES[e.profileId];
    if (!p || p.faction !== s.faction) {
      errs.push(`${e.profileId} isn't one of your units`);
      continue;
    }
    if (p.structure?.summonOnly) errs.push(`${p.name} can only be summoned`);
    counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
  }
  for (const id of r.supports)
    if (SUPPORTS[id]?.faction !== s.faction) errs.push(`${id} isn't one of your supports`);
  if (errs.length) return errs;
  const budget = budgetFor(s, mode);
  const cost = listCost(r.entries);
  if (cost > budget) errs.push(`Over the campaign budget: ⚙${cost}/${budget}`);
  if (r.entries.length > m.maxUnits) errs.push(`Too many units: ${r.entries.length}/${m.maxUnits}`);
  for (const [id, n] of counts)
    if (n > m.maxCopies) errs.push(`At most ${m.maxCopies} × ${baseProfile(id).name}`);
  const fizz = supportsCost(r.supports);
  if (fizz > m.fizzLimit) errs.push(`Over the Fizz budget: ${fizz}/${m.fizzLimit}`);
  if (new Set(r.supports).size !== r.supports.length)
    errs.push("Each support can only be taken once");
  return errs;
}

// ---------------------------------------------------------------- launching a battle

export interface CampaignLaunch {
  battle: CampaignBattleDef;
  mode: ModeId;
  /** Swapped for side B, like the main menu does (you are always player 1 in the engine). */
  mission: MissionDef;
  map: MapDef;
  factions: [LoreFactionId, LoreFactionId];
  lists: [ListEntry[], ListEntry[]];
  supports: [string[], string[]];
  startBonus: [StartBonus, undefined];
  seed: number;
  /** Both armies' budgets (yours includes perks and the battered penalty). */
  budget: [number, number];
  perks: PerkTotals;
}

/** Everything needed to start a campaign battle. Throws if the battle isn't on offer. */
export function battleSetup(s: CampaignState, battleId: string): CampaignLaunch {
  const battle = availableBattles(s).find((b) => b.id === battleId);
  if (!battle) throw new Error(`${battleId} isn't on offer right now`);
  const baseMission = MISSIONS[battle.missionId]!;
  const baseMap = MAPS[battle.mapId]!;
  const mode = baseMission.mode;
  const sideB = !!baseMission.roles && battle.side === 1;
  const perks = perkTotals(s);
  const roster = s.army[mode];
  const enemyBudget = ACT_BUDGET[budgetAct(s.act)][mode];
  const free = perks.units.map((profileId) => ({ profileId, upgrades: [] as string[] }));
  const supports = [
    ...roster.supports,
    ...perks.supports.filter((id) => !roster.supports.includes(id)),
  ];
  return {
    battle,
    mode,
    mission: sideB ? swapMissionSides(baseMission) : baseMission,
    map: sideB ? swapMapSides(baseMap) : baseMap,
    factions: [s.faction, battle.enemy],
    lists: [
      [...structuredClone(roster.entries), ...free],
      fitList(defaultListFor(battle.enemy, mode), enemyBudget),
    ],
    supports: [supports, defaultSupportsFor(battle.enemy, mode)],
    startBonus: [{ resources: perks.resources, cp: perks.cp }, undefined],
    seed: (s.seed + s.results.length * 7919 + 1) >>> 0,
    budget: [budgetFor(s, mode), enemyBudget],
    perks,
  };
}

/** The createGame setup for a launch. */
export function launchGameSetup(l: CampaignLaunch): GameSetup {
  return {
    factions: l.factions,
    lists: l.lists,
    supports: l.supports,
    seed: l.seed,
    orderChoice: true,
    map: l.map,
    mapId: l.map.id,
    missionId: l.mission.id,
    startBonus: l.startBonus,
  };
}

// ---------------------------------------------------------------- results

export interface ResultReport {
  state: CampaignState;
  /** New chronicle entries, in order (the battle, then anything the end of the act brought). */
  news: ChronicleEntry[];
  /** The act that just ended, if this result ended one. */
  actEnded: CampaignStage | null;
}

const outcomeWord: Record<Outcome, string> = { win: "Victory", loss: "Defeat", draw: "Draw" };

/** Record a battle's result and move the war on. Pure: returns a new state. */
export function recordResult(
  prev: CampaignState,
  battleId: string,
  outcome: Outcome,
  vp: [number, number],
  opts: { retreated?: boolean } = {},
): ResultReport {
  const battle = availableBattles(prev).find((b) => b.id === battleId);
  if (!battle) throw new Error(`${battleId} isn't on offer right now`);
  const s: CampaignState = structuredClone(prev);
  const news: ChronicleEntry[] = [];
  const act = s.act;
  const place = placeName(battle.placeId, true);
  const enemy = factionName(battle.enemy);
  s.results.push({
    battleId,
    act,
    outcome,
    vp: [vp[0], vp[1]],
    ...(opts.retreated ? { retreated: true } : {}),
  });
  s.battered = outcome === "loss";
  const head = `${battle.title}: ${outcomeWord[outcome]}${opts.retreated ? " (you retreated)" : ""}, ${vp[0]}-${vp[1]}.`;
  if (act === 4) {
    if (outcome === "draw")
      news.push({
        act,
        tone: "draw",
        text: `${head} Nobody holds the ford. It will be fought again.`,
      });
    else {
      s.ending = outcome;
      s.holders[battle.placeId] = outcome === "win" ? s.faction : battle.enemy;
      s.holders["wellspring"] = s.holders[battle.placeId]!;
      news.push({
        act,
        tone: outcome,
        text:
          outcome === "win"
            ? `${head} You hold Fizzwater Ford, and the Wellspring with it.`
            : `${head} ${enemy} hold Fizzwater Ford, and the Wellspring with it.`,
      });
    }
    s.chronicle.push(...news);
    return { state: s, news, actEnded: s.ending ? 4 : null };
  }
  if (outcome === "win") {
    s.holders[battle.placeId] = s.faction;
    news.push({ act, tone: "win", text: `${head} You hold ${place}.` });
  } else if (outcome === "loss") {
    s.holders[battle.placeId] = battle.enemy;
    news.push({
      act,
      tone: "loss",
      text: `${head} ${enemy} hold ${place}.${s.battered ? ` Your army is battered: ⚙${BATTERED_PENALTY} less budget next battle.` : ""}`,
    });
  } else
    news.push({ act, tone: "draw", text: `${head} ${placeName(battle.placeId)} stays as it was.` });
  let actEnded: CampaignStage | null = null;
  if (foughtIn(s, act).length >= ACTS[act].fights) {
    actEnded = act;
    news.push(...closeAct(s, act));
  }
  s.chronicle.push(...news);
  return { state: s, news, actEnded };
}

/** End an act: skipped battles fall to their enemies, the other sides fight it out, and the next act (or the finale) begins. Mutates `s`. */
function closeAct(s: CampaignState, act: CampaignAct): ChronicleEntry[] {
  const news: ChronicleEntry[] = [];
  const foughtAt = new Set(
    foughtIn(s, act).map((r) => campaignOf(s).battles.find((b) => b.id === r.battleId)?.placeId),
  );
  for (const b of campaignOf(s).battles) {
    if (b.act !== act || hasFought(s, b.id) || foughtAt.has(b.placeId)) continue;
    const was = s.holders[b.placeId];
    s.holders[b.placeId] = b.enemy;
    news.push({
      act,
      tone: "lost",
      text: `While you fought elsewhere, ${factionName(b.enemy, true)} ${was === b.enemy ? "tightened their grip on" : "took"} ${placeName(b.placeId, true)} (${b.title}).`,
    });
  }
  // The other two sides' battles this act, settled off-screen.
  for (const lb of BATTLES) {
    if (
      lb.act !== act ||
      lb.sides.includes(s.faction) ||
      foughtAt.has(lb.placeId) ||
      s.holders[lb.placeId] === s.faction
    )
      continue;
    if (lb.placeId === FINALE.placeId) continue;
    const winner = lb.sides[hash(s.seed, lb.id) % 2]!;
    const loser = lb.sides.find((x) => x !== winner)!;
    s.holders[lb.placeId] = winner;
    news.push({
      act,
      tone: "meanwhile",
      text: `Meanwhile, ${lb.title} at ${placeName(lb.placeId, true)}: ${factionName(winner, true)} beat ${factionName(loser, true)}, and hold it now.`,
    });
  }
  if (act < 3) {
    s.act = (act + 1) as CampaignAct;
    news.push({ act: s.act, tone: "story", text: `${ACTS[s.act as CampaignAct].name} begins.` });
  } else {
    s.act = 4;
    s.rival = computeRival(s);
    const held = placesHeldBy(s, s.rival).length;
    news.push({
      act: 4,
      tone: "story",
      text: `The road to the ford: ${factionName(s.rival, true)} hold ${held} place${held === 1 ? "" : "s"} in the valley and are waiting at Fizzwater Ford. The Battle of Fizzwater Ford decides the war.`,
    });
  }
  return news;
}

// ---------------------------------------------------------------- save and load

export function serializeCampaign(s: CampaignState): string {
  return JSON.stringify(s);
}

const isFaction = (x: unknown): x is LoreFactionId =>
  typeof x === "string" && (LORE_FACTION_IDS as readonly string[]).includes(x);
const isStage = (x: unknown): x is CampaignStage => x === 1 || x === 2 || x === 3 || x === 4;
const TONES: ChronicleTone[] = ["story", "win", "loss", "draw", "lost", "meanwhile"];
const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);

function cleanRoster(faction: LoreFactionId, mode: ModeId, raw: unknown): Roster {
  const r = raw as Partial<Roster> | null;
  const entries: ListEntry[] = [];
  if (r && Array.isArray(r.entries)) {
    for (const e of r.entries.slice(0, 40)) {
      const p = PROFILES[(e as ListEntry)?.profileId];
      if (!p || p.faction !== faction || p.structure?.summonOnly) continue;
      const ups = Array.isArray((e as ListEntry).upgrades)
        ? (e as ListEntry).upgrades.filter(
            (u) => typeof u === "string" && p.upgrades.some((x) => x.id === u),
          )
        : [];
      entries.push({ profileId: p.id, upgrades: [...new Set(ups)] });
    }
  }
  const supports =
    r && Array.isArray(r.supports)
      ? [
          ...new Set(
            r.supports.filter(
              (id): id is string => typeof id === "string" && SUPPORTS[id]?.faction === faction,
            ),
          ),
        ]
      : [];
  return entries.length ? { entries, supports } : starterRoster(faction, mode);
}

/**
 * Read a saved campaign (a JSON string or a parsed object). Returns null for anything that isn't a
 * campaign save this version can read (corrupt, from another game, or an unknown version), and
 * repairs what it can in an otherwise sound save (unknown places, units or battles are dropped).
 */
export function parseCampaign(raw: unknown): CampaignState | null {
  let d: unknown = raw;
  if (typeof raw === "string") {
    try {
      d = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const o = d as Record<string, unknown>;
  if (o.format !== CAMPAIGN_FORMAT || o.version !== CAMPAIGN_VERSION || !isFaction(o.faction))
    return null;
  const faction = o.faction;
  const s = newCampaign(faction, num(o.seed));
  s.chronicle = [];
  if (isStage(o.act)) s.act = o.act;
  if (o.holders && typeof o.holders === "object") {
    const h = o.holders as Record<string, unknown>;
    for (const p of PLACES)
      if (p.id in h && (h[p.id] === null || isFaction(h[p.id])))
        s.holders[p.id] = h[p.id] as LoreFactionId | null;
  }
  const known = new Set([...campaignOf(s).battles.map((b) => b.id), FINALE.id]);
  if (Array.isArray(o.results)) {
    for (const r of o.results.slice(0, 64) as Partial<BattleRecord>[]) {
      if (
        !r ||
        typeof r.battleId !== "string" ||
        !known.has(r.battleId) ||
        !isStage(r.act) ||
        !["win", "loss", "draw"].includes(r.outcome as string)
      )
        continue;
      const vp = Array.isArray(r.vp) ? r.vp : [];
      s.results.push({
        battleId: r.battleId,
        act: r.act,
        outcome: r.outcome as Outcome,
        vp: [num(vp[0]), num(vp[1])],
        ...(r.retreated === true ? { retreated: true } : {}),
      });
    }
  }
  s.battered = o.battered === true;
  const army = (o.army ?? {}) as Record<string, unknown>;
  for (const m of MODE_IDS) s.army[m] = cleanRoster(faction, m, army[m]);
  if (Array.isArray(o.chronicle)) {
    for (const c of o.chronicle.slice(-300) as Partial<ChronicleEntry>[]) {
      if (
        c &&
        typeof c.text === "string" &&
        isStage(c.act) &&
        TONES.includes(c.tone as ChronicleTone)
      )
        s.chronicle.push({ act: c.act, tone: c.tone as ChronicleTone, text: c.text.slice(0, 500) });
    }
  }
  s.rival = isFaction(o.rival) && o.rival !== faction ? o.rival : null;
  if (s.act === 4 && !s.rival) s.rival = computeRival(s);
  if (s.act !== 4) s.rival = null;
  s.ending = s.act === 4 && (o.ending === "win" || o.ending === "loss") ? o.ending : null;
  s.scenes = o.scenes !== false;
  if (typeof o.updated === "number" && Number.isFinite(o.updated)) s.updated = o.updated;
  return s;
}

/** A one-line summary of a campaign, for the side picker and the save. */
export function campaignSummary(s: CampaignState): string {
  const wins = s.results.filter((r) => r.outcome === "win").length;
  const losses = s.results.filter((r) => r.outcome === "loss").length;
  const where = s.ending ? (s.ending === "win" ? "won the war" : "lost the war") : stageName(s.act);
  return `${LORE_FACTIONS[s.faction].name} · ${where} · ${wins} won, ${losses} lost · ${placesHeldBy(s, s.faction).length} places held`;
}
