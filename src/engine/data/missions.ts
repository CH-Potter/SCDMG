export type ScoringRule =
  /** VP per neutral objective controlled at the end of each round, from `fromRound`. */
  | { kind: "hold"; vp: number; fromRound: number }
  /** VP for controlling the enemy's home objective at the end of a round. */
  | { kind: "raidHome"; vp: number }
  /** Objectives stay yours once taken; VP per owned objective each round. */
  | { kind: "sticky"; vpNeutral: number; vpEnemyHome: number }
  /** VP equal to destroyed enemy supply times this. */
  | { kind: "eliminate"; vpPerSupply: number }
  /** Carry the enemy flag back to your home objective. */
  | { kind: "flag"; vp: number };

export interface MissionDef {
  id: string;
  name: string;
  blurb: string;
  rounds: number;
  startResources: number;
  income: number;
  startSupply: number;
  supplyPerRound: number;
  maxSupply: number;
  scoring: ScoringRule[];
}

export const MISSIONS: Record<string, MissionDef> = {
  hold: {
    id: "hold",
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
    name: "Swipe the Snack",
    blurb: "Each side has a snack on its home objective. Grab theirs and bring it home for 4 VP. Neutral objectives score 1 VP each from round 3.",
    rounds: 6,
    startResources: 10,
    income: 4,
    startSupply: 6,
    supplyPerRound: 2,
    maxSupply: 12,
    scoring: [
      { kind: "flag", vp: 4 },
      { kind: "hold", vp: 1, fromRound: 3 },
    ],
  },
};
