// Core data types for the rules engine. All distances are in inches.
// The engine is pure: no DOM, no Pixi, no Math.random — only GameState in, GameState out.

export type PlayerId = 0 | 1;

export interface Vec {
  x: number;
  y: number;
}

export type FactionId = "militia" | "munch" | "concord";

export type AbilityId =
  | "entrench" // Action: +1 to saves until this unit's next activation.
  | "medic" // Action: heal a friendly unit within 3" for 1 HP.
  | "regen" // End of round: heal 1 HP if this unit took no damage this round.
  | "swarm" // Melee: +1 die per other friendly unit within 3" of the target (max +2).
  | "phase"; // Movement ignores terrain and units along the path.

export interface Weapon {
  name: string;
  melee: boolean;
  range: number; // ignored for melee weapons (engagement range applies)
  dice: number;
  hit: number; // each d6 >= hit is a hit
  damage: number;
  ap: number; // worsens the target's save by this much
}

export interface UnitProfile {
  id: string;
  name: string;
  faction: FactionId;
  cost: number;
  move: number;
  hp: number;
  shield: number; // absorbs damage before HP; recharges 1 per round
  armor: number; // save on a d6 >= armor (7+ means no save)
  baseRadius: number;
  weapons: Weapon[];
  abilities: AbilityId[];
  blurb: string;
}

export interface Faction {
  id: FactionId;
  name: string;
  blurb: string;
  color: number;
  profiles: UnitProfile[];
  defaultList: string[];
}

export interface Unit {
  uid: string;
  profileId: string;
  owner: PlayerId;
  pos: Vec;
  hp: number;
  shield: number;
  activated: boolean;
  dugIn: boolean;
  hurtThisRound: boolean;
  alive: boolean;
}

export interface Terrain {
  id: string;
  kind: "blocking" | "cover";
  poly: Vec[];
}

export interface Objective {
  id: string;
  pos: Vec;
  radius: number;
}

export interface Activation {
  uid: string;
  actionsLeft: number;
  attacked: boolean;
  usedSpecial: boolean;
}

export interface GameState {
  board: { width: number; height: number };
  round: number;
  maxRounds: number;
  activePlayer: PlayerId;
  factions: [FactionId, FactionId];
  units: Unit[];
  terrain: Terrain[];
  objectives: Objective[];
  score: [number, number];
  rng: number;
  activation: Activation | null;
  over: boolean;
  winner: PlayerId | "draw" | null;
}

export type Command =
  | { type: "move"; uid: string; to: Vec }
  | { type: "attack"; uid: string; target: string; weapon: number }
  | { type: "entrench"; uid: string }
  | { type: "heal"; uid: string; target: string }
  | { type: "end"; uid: string };

export type GameEvent =
  | { type: "moved"; uid: string; from: Vec; to: Vec }
  | {
      type: "attacked";
      uid: string;
      target: string;
      weapon: string;
      hitRolls: number[];
      hits: number;
      saveTarget: number | null;
      saveRolls: number[];
      damage: number;
      cover: boolean;
      killed: boolean;
    }
  | { type: "entrenched"; uid: string }
  | { type: "healed"; uid: string; target: string; amount: number }
  | { type: "activationEnded"; uid: string }
  | { type: "roundEnded"; round: number; scored: [number, number]; healed: string[] }
  | { type: "gameOver"; winner: PlayerId | "draw"; reason: string };

export type CommandResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
