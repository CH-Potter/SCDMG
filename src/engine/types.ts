// Core data types for the rules engine. All distances are in inches.
// The engine is pure: no DOM, no Pixi, no Math.random — only GameState in, GameState out.

export type PlayerId = 0 | 1;

export interface Vec {
  x: number;
  y: number;
}

/** 0 = ground, 1 = raised platform, 2 = flying. */
export type Elevation = 0 | 1 | 2;

export type FactionId = "militia" | "munch" | "concord";

export type Keyword =
  | "infantry" // can climb ladders, benefits from cover
  | "light" // may still shoot after disengaging
  | "armoured" // reduces incoming AP by 1 unless the weapon is built to crack armour
  | "heavy" // can't use ladders, never gets cover from area terrain
  | "flying" // ignores terrain, can't hold objectives, only hit by anti-air or other flyers
  | "jump" // can change elevation anywhere, without a ramp or ladder
  | "mech"
  | "beast"
  | "monster";

export type Phase = "movement" | "assault" | "combat" | "scoring";

export type AbilityId =
  // passive
  | "entrenched" // hunkering gives an extra +1 save
  | "regen" // end of round: heal 1 HP if not hurt this round
  | "regrow" // end of round: revive one lost model if not hurt this round
  | "brood-call" // aura: friendly Beasts within 6" get +1 move
  | "radiance" // aura: friendly units within 6" recharge +1 extra shield
  | "steady-aim" // +1 ranged die per model if the unit hasn't moved this round
  // reactive
  | "overwatch" // once per round: shoot an enemy that ends a move within 10" in sight
  | "sticky-goo" // ranged hits that cause damage slow the target (-2 move next round)
  | "pop" // when one of its models dies, nearby enemy models may take 1 damage
  | "refraction" // once per round: reduce the damage of one ranged attack by 1
  // active
  | "patch-up" // heal 2 HP on a nearby friendly unit, reviving a model if needed
  | "barrage" // indirect blast at a point, no line of sight needed
  | "tunnel" // vanish and re-emerge anywhere on the ground away from enemies
  | "blink" // teleport up to 10", even onto platforms
  | "recall"; // teleport a friendly unit to the user

export interface WeaponBonus {
  vs: Keyword;
  dice?: number;
  damage?: number;
  ap?: number;
}

export interface Weapon {
  name: string;
  melee: boolean;
  range: number; // ignored for melee weapons (engagement range applies)
  dice: number; // per model
  hit: number; // each d6 >= hit is a hit
  damage: number;
  ap: number;
  /** Which domains this weapon can hit. Melee from ground units can never hit flyers. */
  targets: "ground" | "air" | "all";
  bonuses?: WeaponBonus[];
}

export interface UpgradeDef {
  id: string;
  name: string;
  cost: number;
  text: string;
  addModels?: number;
  move?: number;
  addKeywords?: Keyword[];
  addAbilities?: AbilityId[];
  /** Replace or tweak a weapon by index. */
  weapon?: { index: number; patch: Partial<Weapon> };
}

export interface UnitProfile {
  id: string;
  name: string;
  faction: FactionId;
  cost: number; // resources to deploy
  supply: number;
  models: number;
  move: number;
  hp: number; // per model
  shield: number; // per model; absorbs damage first, recharges 1 per round
  armor: number; // save on a d6 >= armor (7+ means no save)
  baseRadius: number;
  keywords: Keyword[];
  weapons: Weapon[];
  abilities: AbilityId[];
  upgrades: UpgradeDef[];
  blurb: string;
}

export interface Faction {
  id: FactionId;
  name: string;
  blurb: string;
  color: number;
  profiles: UnitProfile[];
  defaultList: ListEntry[];
}

export interface ListEntry {
  profileId: string;
  upgrades: string[];
}

export interface Model {
  id: number;
  pos: Vec;
  elevation: Elevation;
  hp: number;
  shield: number;
  alive: boolean;
}

export interface UnitStatus {
  acted: boolean; // has activated in the current phase
  moved: boolean; // moved, advanced, charged, deployed or teleported this round
  disengaged: boolean;
  hunkered: boolean;
  charged: boolean;
  fought: boolean;
  hurt: boolean; // took damage this round
  slowedRounds: number; // >0: -2 move
  deployedRound: number;
}

export interface Unit {
  uid: string;
  profileId: string;
  upgrades: string[];
  owner: PlayerId;
  models: Model[];
  onBoard: boolean;
  destroyed: boolean;
  status: UnitStatus;
  abilityUses: Partial<Record<AbilityId, number>>; // uses this game
  reactionsUsed: AbilityId[]; // reactive abilities used this round
}

export type TerrainKind =
  | "platform" // raised area (elevation 1); reach it via ramps/ladders
  | "building" // tall, impassable, blocks all sight except to and from flyers
  | "wall" // impassable at its level, blocks sight between models at that level
  | "barricade" // impassable at its level, gives cover, doesn't block sight
  | "cover"; // passable area that gives cover

export interface Terrain {
  id: string;
  kind: TerrainKind;
  level: 0 | 1; // the elevation it stands on
  poly: Vec[]; // convex for platforms
}

export interface AccessPoint {
  id: string;
  kind: "ramp" | "ladder";
  platform: string; // terrain id
  low: Vec; // foot, at ground level
  high: Vec; // top, on the platform
}

export interface Objective {
  id: string;
  number: number;
  pos: Vec;
  radius: number;
  elevation: 0 | 1;
  team: PlayerId | null; // home objective of a team, or neutral
  controller: PlayerId | null; // sticky control (capture missions)
}

export interface Flag {
  team: PlayerId;
  home: Vec;
  pos: Vec;
  carrier: string | null;
}

export interface PlayerState {
  resources: number;
  supplyCap: number;
  vp: number;
  passed: boolean;
}

export interface GameState {
  board: { width: number; height: number };
  mapId: string;
  missionId: string;
  round: number;
  maxRounds: number;
  phase: Phase;
  initiative: PlayerId;
  activePlayer: PlayerId;
  factions: [FactionId, FactionId];
  players: [PlayerState, PlayerState];
  units: Unit[];
  terrain: Terrain[];
  access: AccessPoint[];
  spawn: [Vec[][], Vec[][]];
  objectives: Objective[];
  flags: Flag[];
  rng: number;
  over: boolean;
  winner: PlayerId | "draw" | null;
}

export type Command =
  | { type: "deploy"; uid: string; to: Vec }
  | { type: "move"; uid: string; leader: number; to: Vec }
  | { type: "disengage"; uid: string; leader: number; to: Vec }
  | { type: "advance"; uid: string; leader: number; to: Vec }
  | { type: "charge"; uid: string; target: string }
  | { type: "shoot"; uid: string; target: string; weapon: number }
  | { type: "fight"; uid: string; target: string; weapon: number }
  | { type: "hunker"; uid: string }
  | { type: "hold"; uid: string }
  | { type: "ability"; uid: string; ability: AbilityId; target?: string; point?: Vec }
  | { type: "pass"; player: PlayerId };

export interface AttackReport {
  uid: string;
  target: string;
  weapon: string;
  kind: "shoot" | "fight" | "overwatch" | "barrage";
  attackers: number; // models contributing
  hitRolls: number[];
  hitOn: number;
  saveRolls: number[];
  saveOn: (number | null)[];
  damage: number;
  modelsKilled: number;
  unitDestroyed: boolean;
}

export type GameEvent =
  | { type: "deployed"; uid: string }
  | { type: "moved"; uid: string; kind: "move" | "disengage" | "advance" | "charge" | "teleport" }
  | { type: "attack"; report: AttackReport }
  | { type: "hunkered"; uid: string }
  | { type: "held"; uid: string }
  | { type: "ability"; uid: string; ability: AbilityId; text: string }
  | { type: "passed"; player: PlayerId }
  | { type: "phase"; phase: Phase; round: number }
  | { type: "scored"; player: PlayerId; vp: number; reason: string }
  | { type: "flag"; team: PlayerId; text: string }
  | { type: "roundEnded"; round: number }
  | { type: "gameOver"; winner: PlayerId | "draw"; reason: string };

export type CommandResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
