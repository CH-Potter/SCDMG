// Game modes: board size, roster limits, and which missions and maps belong to them.

export type ModeId = "skirmish" | "assault";

export interface GameModeDef {
  id: ModeId;
  name: string;
  blurb: string;
  width: number;
  height: number;
  /** Max total resource cost of a roster (units + upgrades). */
  rosterLimit: number;
  /** Max copies of the same unit profile in a roster. */
  maxCopies: number;
  /** Max units in a roster. */
  maxUnits: number;
  /** Fizz budget for off-board supports. */
  fizzLimit: number;
}

export const MODES: Record<ModeId, GameModeDef> = {
  skirmish: {
    id: "skirmish",
    name: "Skirmish",
    blurb: 'A tight 35" × 35" scrap. Small rosters, fast games.',
    width: 35,
    height: 35,
    rosterLimit: 30,
    maxCopies: 3,
    maxUnits: 8,
    fizzLimit: 6,
  },
  assault: {
    id: "assault",
    name: "Assault",
    blurb: 'A long 70" × 35" battle line. Bigger armies, more supply, longer games.',
    width: 70,
    height: 35,
    rosterLimit: 55,
    maxCopies: 4,
    maxUnits: 14,
    fizzLimit: 10,
  },
};
