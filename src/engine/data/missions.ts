import type { PlayerId } from "../types";
import type { MapDef } from "./maps";
import type { ModeId } from "./modes";

export type ScoringRule =
  /** VP per neutral objective controlled at the end of each round, from `fromRound`. */
  | { kind: "hold"; vp: number; fromRound: number }
  /**
   * VP for controlling the enemy's home objective at the end of a round. With `target: "forward"`
   * it's the enemy's forward objective instead (the neutral objective nearest their home).
   */
  | { kind: "raidHome"; vp: number; target?: ObjectiveTarget }
  /** Objectives stay yours once taken; VP per owned objective each round. */
  | { kind: "sticky"; vpNeutral: number; vpEnemyHome: number }
  /** VP equal to destroyed enemy supply times this (scored the moment a unit dies; shared rules only). */
  | { kind: "eliminate"; vpPerSupply: number }
  /** Carry the enemy flag back to your home objective or deployment zone; `carryVp` per round while you hold it. */
  | { kind: "flag"; vp: number; carryVp?: number }
  /**
   * King of the hill. The crown is the neutral objective nearest the board centre (all of them if
   * several tie). Holding it scores `vp`, plus `step` for every consecutive round you have already
   * held it, up to `max`. Losing it (or nobody holding it) resets the streak. Every other neutral
   * objective scores `outerVp` per round.
   */
  | { kind: "crown"; vp: number; step: number; max: number; outerVp: number }
  /**
   * One neutral objective is live each round and scores `vp` for whoever holds it; the next live
   * objective is rolled and announced a round ahead. Other neutral objectives score `otherVp`.
   */
  | { kind: "shifting"; vp: number; otherVp: number }
  /**
   * Each round, each side's most expensive unit on the board is marked (from the end of round 1).
   * Destroying the enemy's marked unit before the next scoring phase scores `vp`.
   */
  | { kind: "bounty"; vp: number }
  /**
   * Every neutral objective starts with `loads` loads of salvage. At the end of each round, whoever
   * holds one hauls off a load: `vp` VP and `resources` resources.
   */
  | { kind: "loot"; vp: number; resources: number; loads: number }
  /**
   * VP at the end of each round, from `fromRound`, if the enemy doesn't hold your home objective
   * (or, with `target: "forward"`, your forward objective: the neutral objective nearest your home).
   */
  | { kind: "guard"; vp: number; fromRound: number; target?: ObjectiveTarget }
  /** VP per enemy supply destroyed, paid at the end of each round (works in role scoring). */
  | { kind: "cull"; vpPerSupply: number }
  /**
   * Convoy: your own cargo. `from: "far"` puts it on the neutral objective furthest from your home
   * and you deliver it to your home objective or deployment zone; `from: "home"` starts it on your
   * home objective and you deliver it to the enemy's. `vp` per delivery (the cargo then resets),
   * `carryVp` per round it is being carried. An enemy touching dropped cargo sends it back to the start.
   */
  | { kind: "convoy"; vp: number; carryVp: number; from: "far" | "home" };

/** Which of a side's objectives a rule means: its home objective, or its forward objective (the neutral objective nearest its home). */
export type ObjectiveTarget = "home" | "forward";

/** Economy numbers. A mission sets them for both sides; a role can override any of them. */
export interface Economy {
  startResources: number;
  income: number;
  startSupply: number;
  supplyPerRound: number;
  maxSupply: number;
}

/** One side of a role mission. */
export interface RoleDef {
  /** Stable id, e.g. "defender". */
  id: string;
  name: string;
  /** One or two sentences: what this side does and how it scores, with numbers. */
  blurb: string;
  /** Overrides of the mission's economy for this side. */
  economy?: Partial<Economy>;
  /**
   * Free permanent structures placed at the start, next to this side's forward objective: the
   * faction's cheapest buyable permanent structure. Their supply is added on top of the side's
   * supply cap. A faction without one gets `GARRISON_FALLBACK_RESOURCES` per structure instead.
   */
  garrison?: number;
  /** Scoring rules that only this side scores (on top of the mission's shared `scoring`). */
  scoring: ScoringRule[];
}

export interface MissionDef extends Economy {
  id: string;
  mode: ModeId;
  name: string;
  blurb: string;
  rounds: number;
  /** Scoring both sides use. Role missions add per-role rules in `roles`. */
  scoring: ScoringRule[];
  /** Role missions: side A (player 1, index 0) and side B (player 2, index 1). */
  roles?: [RoleDef, RoleDef];
  /** Map tags this mission needs: a map fits only if its `tags` include every one. */
  mapTags?: string[];
}

/** Resources a side gets per garrison structure its faction can't field. */
export const GARRISON_FALLBACK_RESOURCES = 3;

export const MISSIONS: Record<string, MissionDef> = {
  hold: {
    id: "hold",
    mode: "skirmish",
    name: "Hold the Line",
    blurb: "Score 1 VP per neutral objective you hold each round from round 2, and 2 VP for sitting on their home objective.",
    rounds: 5,
    startResources: 10,
    income: 5,
    startSupply: 6,
    supplyPerRound: 2,
    maxSupply: 14,
    scoring: [
      { kind: "hold", vp: 1, fromRound: 2 },
      { kind: "raidHome", vp: 2 },
    ],
  },
  grab: {
    id: "grab",
    mode: "skirmish",
    name: "Smash and Grab",
    blurb: "Objectives stay yours until the enemy takes them. Each round: 1 VP per neutral objective you own, 3 VP for their home objective.",
    rounds: 5,
    startResources: 10,
    income: 5,
    startSupply: 6,
    supplyPerRound: 2,
    maxSupply: 14,
    scoring: [{ kind: "sticky", vpNeutral: 1, vpEnemyHome: 3 }],
  },
  brawl: {
    id: "brawl",
    mode: "skirmish",
    name: "Scrapyard Brawl",
    blurb: "A short, bloody one. Score 1 VP per enemy supply destroyed, plus 1 VP per neutral objective held each round.",
    rounds: 4,
    startResources: 14,
    income: 5,
    startSupply: 8,
    supplyPerRound: 2,
    maxSupply: 14,
    scoring: [
      { kind: "eliminate", vpPerSupply: 1 },
      { kind: "hold", vp: 1, fromRound: 1 },
    ],
  },
  flag: {
    id: "flag",
    mode: "skirmish",
    name: "Swipe the Snack",
    blurb: "Each side has a snack on its home objective. Grab theirs: +1 VP each round you hold it, and 4 VP when you get it back to your deployment zone or home objective. Neutral objectives score 1 VP each from round 3.",
    rounds: 6,
    startResources: 10,
    income: 4,
    startSupply: 6,
    supplyPerRound: 2,
    maxSupply: 12,
    scoring: [
      { kind: "flag", vp: 4, carryVp: 1 },
      { kind: "hold", vp: 1, fromRound: 3 },
    ],
  },
  hill: {
    id: "hill",
    mode: "skirmish",
    name: "Top of the Heap",
    blurb: "The middle objective is the heap. Hold it at the end of a round for 1 VP, then 2, 3 and 4 VP for each round in a row you keep it. Lose it and the count starts again. Other neutral objectives score 1 VP each from round 1.",
    rounds: 5,
    startResources: 10,
    income: 5,
    startSupply: 6,
    supplyPerRound: 2,
    maxSupply: 14,
    scoring: [{ kind: "crown", vp: 1, step: 1, max: 4, outerVp: 1 }],
  },
  scavenge: {
    id: "scavenge",
    mode: "skirmish",
    name: "Scrap Rush",
    blurb: "Every neutral objective holds 3 loads of scrap. At the end of each round, whoever holds one hauls off a load: 1 VP and 2 resources. Once a pile is empty it's worth nothing.",
    rounds: 5,
    startResources: 10,
    income: 4,
    startSupply: 6,
    supplyPerRound: 2,
    maxSupply: 14,
    scoring: [{ kind: "loot", vp: 1, resources: 2, loads: 3 }],
  },
  frontline: {
    id: "frontline",
    mode: "assault",
    name: "Frontline",
    blurb: "Hold the line across a long battlefield. Objectives stay yours until taken: 1 VP per neutral objective each round, 4 VP for their home objective.",
    rounds: 6,
    startResources: 16,
    income: 8,
    startSupply: 10,
    supplyPerRound: 3,
    maxSupply: 24,
    scoring: [{ kind: "sticky", vpNeutral: 1, vpEnemyHome: 4 }],
  },
  heist: {
    id: "heist",
    mode: "assault",
    name: "The Great Snack Heist",
    blurb: "Their snack is a long way off. Steal it: +1 VP each round you hold it, and 5 VP when you get it back to your deployment zone or home objective. Neutral objectives score 1 VP each from round 3.",
    rounds: 7,
    startResources: 16,
    income: 7,
    startSupply: 10,
    supplyPerRound: 3,
    maxSupply: 22,
    scoring: [
      { kind: "flag", vp: 5, carryVp: 1 },
      { kind: "hold", vp: 1, fromRound: 3 },
    ],
  },
  scrapheap: {
    id: "scrapheap",
    mode: "assault",
    name: "Scrapheap Showdown",
    blurb: "Everyone arrives fast and angry. 1 VP per enemy supply destroyed, plus 1 VP per neutral objective held each round.",
    rounds: 5,
    startResources: 24,
    income: 8,
    startSupply: 14,
    supplyPerRound: 3,
    maxSupply: 24,
    scoring: [
      { kind: "eliminate", vpPerSupply: 1 },
      { kind: "hold", vp: 1, fromRound: 1 },
    ],
  },
  shifting: {
    id: "shifting",
    mode: "assault",
    name: "Shifting Ground",
    blurb: "One neutral objective is live each round and scores 3 VP for whoever holds it; the next one is rolled and announced a round ahead. Every other neutral objective scores 1 VP.",
    rounds: 6,
    startResources: 16,
    income: 8,
    startSupply: 10,
    supplyPerRound: 3,
    maxSupply: 24,
    scoring: [{ kind: "shifting", vp: 3, otherVp: 1 }],
  },
  bounty: {
    id: "bounty",
    mode: "assault",
    name: "Most Wanted",
    blurb: "From the end of round 1, each side's priciest unit on the board is marked each round. Destroy theirs before the next scoring phase for 3 VP. Neutral objectives score 1 VP each round.",
    rounds: 6,
    startResources: 18,
    income: 8,
    startSupply: 12,
    supplyPerRound: 3,
    maxSupply: 24,
    scoring: [
      { kind: "bounty", vp: 3 },
      { kind: "hold", vp: 1, fromRound: 1 },
    ],
  },
  siege: {
    id: "siege",
    mode: "skirmish",
    name: "Claim-Jump Siege",
    blurb: "Side A digs in around its stronghold with a free emplacement and fewer resources; side B brings a bigger war chest to break them. Both sides score 1 VP per neutral objective held from round 2.",
    rounds: 5,
    startResources: 10,
    income: 5,
    startSupply: 6,
    supplyPerRound: 2,
    maxSupply: 14,
    scoring: [{ kind: "hold", vp: 1, fromRound: 2 }],
    mapTags: ["siege"],
    roles: [
      {
        id: "defender",
        name: "Holdouts",
        blurb: "Start with a free emplacement by your stronghold (the neutral objective nearest your home) but only 8 resources (income 5). From round 2, score 1 VP each round the enemy doesn't hold the stronghold, plus 1 VP per neutral objective held.",
        economy: { startResources: 8, income: 5 },
        garrison: 1,
        scoring: [{ kind: "guard", vp: 1, fromRound: 2, target: "forward" }],
      },
      {
        id: "attacker",
        name: "Claim-Jumpers",
        blurb: "Start with 13 resources and 6 income. Score 3 VP each round you hold their stronghold (the neutral objective nearest their home), plus 1 VP per neutral objective held from round 2.",
        economy: { startResources: 13, income: 6 },
        scoring: [{ kind: "raidHome", vp: 3, target: "forward" }],
      },
    ],
  },
  salvage: {
    id: "salvage",
    mode: "skirmish",
    name: "Salvage Rights",
    blurb: "Each neutral objective holds 3 loads of salvage; whoever holds one at the end of a round hauls off a load for 1 VP and 1 resource. Side A is already on site; side B arrives later but its supply grows faster.",
    rounds: 5,
    startResources: 10,
    income: 5,
    startSupply: 6,
    supplyPerRound: 2,
    maxSupply: 14,
    scoring: [{ kind: "loot", vp: 1, resources: 1, loads: 3 }],
    mapTags: ["salvage"],
    roles: [
      {
        id: "camp",
        name: "Site Crew",
        blurb: "Already on site: 8 supply from the start, but only 4 income. Haul salvage for 1 VP and 1 resource a load.",
        economy: { startSupply: 8, income: 4 },
        scoring: [],
      },
      {
        id: "latecomers",
        name: "Rival Outfit",
        blurb: "Arriving late: 5 supply at the start, then +3 a round. Haul salvage for 1 VP and 1 resource a load.",
        economy: { startSupply: 5, supplyPerRound: 3 },
        scoring: [],
      },
    ],
  },
  convoy: {
    id: "convoy",
    mode: "assault",
    name: "Strongbox Run",
    blurb: "Side A must haul a strongbox off the furthest neutral objective back to its home objective or deployment zone. Side B raids the objectives along the way.",
    rounds: 6,
    startResources: 16,
    income: 8,
    startSupply: 10,
    supplyPerRound: 3,
    maxSupply: 24,
    scoring: [],
    mapTags: ["convoy"],
    roles: [
      {
        id: "escort",
        name: "Escorts",
        blurb: "Carry the strongbox home: 5 VP per delivery (it then reappears at the start) and 1 VP each round it's being carried. 1 VP per neutral objective held each round.",
        scoring: [
          { kind: "convoy", vp: 5, carryVp: 1, from: "far" },
          { kind: "hold", vp: 1, fromRound: 1 },
        ],
      },
      {
        id: "raiders",
        name: "Raiders",
        blurb: "Each neutral objective holds 2 loads of loot: holding one at the end of a round hauls a load for 2 VP. Score 1 VP per enemy supply destroyed. Touch a dropped strongbox to send it back to the start.",
        scoring: [
          { kind: "loot", vp: 2, resources: 0, loads: 2 },
          { kind: "cull", vpPerSupply: 1 },
        ],
      },
    ],
  },
};

// ---------- helpers (engine, AI and menu) ----------

/** The scoring rules `p` scores: the mission's shared rules plus its role's. */
export function rulesFor(mission: MissionDef, p: PlayerId): ScoringRule[] {
  const role = mission.roles?.[p];
  return role ? [...mission.scoring, ...role.scoring] : mission.scoring;
}

/** Every rule in the mission, with the players who score it. */
export function allRules(mission: MissionDef): { rule: ScoringRule; players: PlayerId[] }[] {
  const out: { rule: ScoringRule; players: PlayerId[] }[] = mission.scoring.map((rule) => ({ rule, players: [0, 1] }));
  mission.roles?.forEach((role, i) => {
    for (const rule of role.scoring) out.push({ rule, players: [i as PlayerId] });
  });
  return out;
}

/** Side `p`'s starting economy: the mission's numbers with the role's overrides. */
export function economyOf(mission: MissionDef, p: PlayerId): Economy {
  const o = mission.roles?.[p]?.economy ?? {};
  return {
    startResources: o.startResources ?? mission.startResources,
    income: o.income ?? mission.income,
    startSupply: o.startSupply ?? mission.startSupply,
    supplyPerRound: o.supplyPerRound ?? mission.supplyPerRound,
    maxSupply: o.maxSupply ?? mission.maxSupply,
  };
}

/** Does the mission need a home objective for each side (snacks) or for a side (convoy)? */
const needsHomes = (mission: MissionDef): boolean => allRules(mission).some(({ rule }) => rule.kind === "flag" || rule.kind === "convoy" || rule.kind === "guard");

/**
 * Why a map can't host a mission, or null if it can. Checks the mode, the map tags a role mission
 * needs, that asymmetric maps only host role missions made for them (and symmetric missions only
 * symmetric maps), and that snack/convoy/guard missions have a home objective for each side.
 */
export function missionMapProblem(mission: MissionDef, map: Pick<MapDef, "mode" | "objectives"> & { tags?: string[]; asymmetric?: boolean }): string | null {
  if (map.mode !== mission.mode) return `${mission.name} is a ${mission.mode} mission`;
  const tags = map.tags ?? [];
  const need = mission.mapTags ?? [];
  const missing = need.filter((t) => !tags.includes(t));
  if (missing.length) return `${mission.name} needs a battlefield built for it (${missing.join(", ")})`;
  if (map.asymmetric && !need.length) return `This battlefield is built for role missions`;
  if (needsHomes(mission) && !([0, 1] as const).every((p) => map.objectives.some((o) => o.team === p))) {
    return `${mission.name} needs a home objective for each side`;
  }
  if (!map.objectives.some((o) => o.team === null) && allRules(mission).some(({ rule }) => ["crown", "shifting", "loot", "convoy"].includes(rule.kind))) {
    return `${mission.name} needs neutral objectives`;
  }
  return null;
}

export const missionFitsMap = (mission: MissionDef, map: Parameters<typeof missionMapProblem>[1]): boolean => missionMapProblem(mission, map) === null;

// ---------- playing side B ----------

/**
 * A role mission with its sides swapped, so the human (always player 1 in the engine) can play
 * side B. Pair it with `swapMapSides` on the map. The swapped copy is registered in MISSIONS under
 * `<id>~b` (not enumerable, so menus and sims never list it) because games look missions up by id.
 */
export function swapMissionSides(mission: MissionDef): MissionDef {
  if (!mission.roles) return mission;
  const id = `${mission.id}~b`;
  const known = MISSIONS[id];
  if (known) return known;
  const swapped: MissionDef = { ...mission, id, roles: [mission.roles[1], mission.roles[0]] };
  Object.defineProperty(MISSIONS, id, { value: swapped, enumerable: false, configurable: true });
  return swapped;
}

/** A map with the two sides' deployment zones and home objectives swapped (see `swapMissionSides`). */
export function swapMapSides(map: MapDef): MapDef {
  return {
    ...map,
    id: `${map.id}~b`,
    spawn: [map.spawn[1], map.spawn[0]],
    objectives: map.objectives.map((o) => ({ ...o, team: o.team === null ? null : o.team === 0 ? 1 : 0 })),
  };
}
