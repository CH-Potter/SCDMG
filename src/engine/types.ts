// Core data types for the rules engine. All distances are in inches.
// The engine is pure: no DOM, no Pixi, no Math.random — only GameState in, GameState out.

import type { HouseRules } from "./houseRules";

export type PlayerId = 0 | 1;

export interface Vec {
  x: number;
  y: number;
}

/** 0 = ground, 1 = raised platform, 2 = flying. */
export type Elevation = 0 | 1 | 2;

/** The three built-in factions. Custom factions use ids starting with "custom-". */
export type BuiltInFactionId = "militia" | "swarm" | "concord";
export type FactionId = string;

export type Keyword =
  | "infantry" // can climb ladders, benefits from cover
  | "light" // may still shoot when exhausted from disengaging
  | "armoured" // reduces incoming AP by 1 unless the weapon is built to crack armour
  | "heavy" // can't use ladders, never gets cover from area terrain
  | "flying" // ignores terrain, can't hold objectives, only hit by anti-air or other flyers
  | "jump" // can change elevation anywhere, without a ramp or ladder
  | "mech"
  | "beast"
  | "monster"
  | "structure" // can't move; can't hold objectives
  | "fearless"; // never takes nerve tests

export type Phase = "movement" | "assault" | "combat" | "scoring";

export type AbilityId =
  // passive
  | "entrenched" // hunkering gives an extra +1 save
  | "regen" // end of round: heal 1 HP if not hurt this round
  | "regrow" // end of round: revive one lost model if not hurt this round
  | "brood-call" // aura: friendly Beasts within 6" get +1 move
  | "radiance" // aura: friendly units within 6" recharge +1 extra shield
  | "steady-aim" // +1 ranged die per model if the unit hasn't moved this round
  | "steadying" // aura: friendly units within 6" get +1 nerve
  | "mending-aura" // aura: end of round, unhurt friendly units within 6" heal 1 HP
  // reactive
  | "overwatch" // once per round: shoot an enemy that ends a move within 10" in sight
  | "sticky-goo" // ranged hits that cause damage slow the target (-2 move next round)
  | "pop" // when one of its models dies, nearby enemy models may take 1 damage
  | "refraction" // once per round: reduce the damage of one ranged attack by 1
  | "lurk" // once per round: lash out at an enemy that ends a move, charge, deploy or teleport within 3"
  // active
  | "patch-up" // heal 2 HP on a nearby friendly unit, reviving a model if needed
  | "hatch" // a nearby friendly unit regrows lost models
  | "barrage" // indirect blast at a point, no line of sight needed
  | "tunnel" // vanish and re-emerge anywhere on the ground away from enemies
  | "blink" // teleport up to 10", even onto platforms
  | "recall" // teleport a friendly unit to the user
  | "grapple" // drag an enemy unit up to 4" toward this unit
  | "bombs-away" // a flying swarm's suicide dive: every model bombs an enemy unit, then the unit is gone
  | "rocket-hop" // assault phase: leap up to 6" over terrain, then still shoot or charge
  | "rampage" // +1 melee die per model this round, saves one worse
  | "spotter" // your shots at a spotted enemy hit one better this round
  | "bubble-shield" // +1 shield per model on a nearby friendly unit until the end of the round
  | "sugar-rush" // +2 move this round, one model takes 1 damage
  | "provoke" // enemy units within 18" must shoot this unit if they can
  | "demo-charge" // throw a charge at an enemy within 4"; extra damage vs structures and mechs
  | "crop-dust" // assault: fly up to 10" in a line, spraying every enemy ground model near the path
  | "bale-out" // movement, once per game: drop a Junk Barricade near this unit
  | "overcharge" // assault: drain the unit's shields for +1 damage on its shots this round
  | "spotlight" // assault: an enemy unit in sight gets no cover this round
  // reactive (added in the ability pass)
  | "return-fire" // once per round: shoot back at an enemy whose shot damaged this unit
  | "riposte" // once per round: when charged, models in base contact strike first
  | "pirouette" // once per round: when a charge is declared at it, step 3" away before the roll
  | "phase-out" // once per game: when a charge reaches it, teleport 6" away before any blows land
  // passive (added in the ability pass)
  | "eye-peck" // a dive that deals damage leaves the target's shooting one worse this round
  | "twirl-away" // always disengages cleanly
  | "radio-spotting" // shells count as spotted when any friendly unit can see the aim point
  // passive (added with the Skitterswarm)
  | "corrode" // attacks that deal damage leave the target's saves one worse this round
  | "brood-bond" // aura: end of round, friendly units within 6" regrow a lost model even if they were hurt
  // structures
  | "burrow-exit" // your reserves may deploy within 3" of this structure
  | "ward-aura" // enemy ranged attacks on friendly units within 4" hit one worse
  | "scrap-cover"; // friendly models within 2" of this structure count as in cover against shooting

/**
 * Weapon traits:
 * - blast: +1 die per attacking model against units with 7+ models left (BLAST_SQUAD)
 * - torrent: hits automatically (no hit roll needed)
 * - heavy: hits one worse if the unit has moved this round
 * - rending: natural 6s to hit get +1 AP
 * - pistol: point-blank shots (at a unit you're engaged with) don't allow evade rolls
 * - indirect: lobbed (mortars): needs no line of sight; the shell may drift off target, then bursts on
 *   every model under it, friend or foe (SHELL_BURST, SHELL_DRIFT). The weapon's dice don't apply.
 */
export type WeaponTrait = "blast" | "torrent" | "heavy" | "rending" | "pistol" | "indirect";

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
  traits?: WeaponTrait[];
  /** Precision N: after rolling to hit, move up to N missed dice into the hits. Also lets the weapon shoot into a melee without its misses hitting friends. */
  precision?: number;
  /** Tracking N: cancel up to N of the defender's successful evade rolls. */
  tracking?: number;
}

/** Situations an evade roll applies in: point-blank shots from an engaged enemy, any shooting, close combat, or blasts. */
export type EvadeCondition = "pointBlank" | "ranged" | "melee" | "blast";

/** Evade: each hit from a matching attack is dodged on a d6 >= target (before armour). */
export interface EvadeDef {
  target: number;
  against: EvadeCondition[];
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
  /** Tweak the impact (a charge or a flyer's dive). */
  impact?: Partial<ImpactDef>;
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
  /** Set for structures (turrets, pylons, pods, summoned wards...). */
  structure?: StructureDef;
  /** Impact on charge: each charging model in base contact rolls these dice at the charged unit. */
  impact?: ImpactDef;
  /** Nerve: when a unit at half strength or less takes damage it rolls 2d6; above its nerve it's Shaken. Default 7. */
  nerve?: number;
  /** Evade roll and the situations it applies in. Absent means no evade. */
  evade?: EvadeDef;
  /** Miniature art built from parts or an uploaded image. Without it the renderer picks an archetype (or the faction's own painter) from the profile. */
  art?: UnitArt;
}

/** Custom art for a unit: an uploaded image shown as a coin token, or a figure built from parts. */
export type UnitArt =
  | { kind: "image"; /** Circle-cropped raster image (PNG/WebP/JPEG data URL), validated in data/unitArt.ts. */ dataUrl: string }
  | { kind: "parts"; recipe: MiniatureRecipe };

export type MiniBody = "trooper" | "critter" | "brute" | "walker" | "flyer" | "structure" | "rider";
export type MiniHead = "face" | "visor" | "beast" | "gem" | "skull" | "bug" | "beard";
export type MiniHeadgear = "none" | "helmet" | "hat" | "goggles" | "horns" | "crown" | "antennae" | "hood" | "plume";
export type MiniWeapon = "none" | "rifle" | "cannon" | "blade" | "claws" | "staff" | "bow" | "shield" | "axe";
export type MiniBack = "none" | "pack" | "jets" | "tank" | "banner" | "wings";

/** A miniature built in the forge from original parts, baked like a built-in archetype. */
export interface MiniatureRecipe {
  body: MiniBody;
  head: MiniHead;
  headgear: MiniHeadgear;
  weapon: MiniWeapon;
  back: MiniBack;
  /** Main colour; leave out to use the faction colour. */
  primary?: number;
  /** Trim and accent colour. */
  secondary: number;
  /** Size relative to the base (1 = normal). */
  scale: number;
}

export interface ImpactDef {
  dice: number; // per charging model in base contact
  hit: number;
  damage: number;
  ap: number;
}

export interface StructureDef {
  /** Permanent structures stay until destroyed; "round" ones vanish at the end of the round. */
  lifetime: "permanent" | "round";
  /** Only created by summons (support effects); never bought in a list. */
  summonOnly?: boolean;
  /** May deploy within this many inches of a friendly non-structure unit, not just in the spawn zone. */
  fieldDeploy?: number;
}

// ---------- off-board supports ----------

export type SupportTiming = "movement" | "assault" | "combat" | "any";
export type ReactionTrigger = "enemyShoots" | "enemyCharges" | "friendlyDestroyed";

export type SupportEffect =
  | { kind: "resources"; amount: number }
  | { kind: "heal"; amount: number; revive?: boolean }
  | { kind: "recharge" }
  | { kind: "blast"; radius: number; hit: number; damage: number; ap: number; range: number; needsSight: boolean }
  /** Place a summon-only structure near your models until the end of the round. `fromRound`: can't be used before this round. */
  | { kind: "summon"; profileId: string; range: number; minEnemyDistance: number; fromRound?: number }
  | { kind: "meleeBuff"; dice: number }
  | { kind: "rangedBuff"; dice: number }
  | { kind: "slow"; range: number }
  /**
   * Deploy a reserve unit (paying its cost and supply) at a point near your models. Target: a reserve unit and a point.
   * `anywhere`: the point can be anywhere on the table (`range` is ignored). `fromRound`: can't be used before this round.
   * Never within HOME_EXCLUSION of the enemy's home objective.
   */
  | {
      kind: "airdrop";
      range: number;
      minEnemyDistance: number;
      anywhere?: boolean;
      fromRound?: number;
      /** Shield added to each arriving model, even above its maximum, until the end of the round. */
      arrivalShield?: number;
    }
  /** An enemy unit near your models takes a nerve test at -penalty nerve, at any strength. */
  | { kind: "rattle"; range: number; penalty: number }
  /** A friendly unit's attacks get +precision and +tracking this round. */
  | { kind: "aimBuff"; precision: number; tracking: number }
  /** A friendly unit regrows up to `models` lost models (1 HP each). */
  | { kind: "regrow"; models: number }
  /** A friendly unit digs in: +`save` to its saves against shooting and barrages this round. */
  | { kind: "dugIn"; save: number }
  /** A friendly, unengaged unit teleports up to `range`" (its leader), ignoring terrain; it can still act afterwards. */
  | { kind: "teleport"; range: number }
  /** An enemy unit within `range`" of your models is spotted: your shots at it hit one better this round. */
  | { kind: "spot"; range: number }
  /** A friendly unit is hidden in dust: it can't be shot from more than `range`" away this round. */
  | { kind: "smoke"; range: number }
  /** A friendly unit gains Overwatch until the end of the round. */
  | { kind: "overwatch" }
  /** A friendly unit gets +`move`" move this round. */
  | { kind: "haste"; move: number }
  /** An enemy unit within `range`" of your models: its shooting hits one worse this round. */
  | { kind: "blind"; range: number }
  /** A friendly unit and every friendly unit within `range`" of it recharge 1 shield per model. */
  | { kind: "resonate"; range: number }
  /** An enemy unit within `range`" that one of your models can see gets nothing from cover, hunkering or digging in against shooting this round. */
  | { kind: "expose"; range: number }
  /** An enemy unit within `range`" of your models can't use active abilities, and its reactive ones don't trigger, this round. */
  | { kind: "silence"; range: number }
  /** A friendly unit gets +`amount` shield per model, even above its maximum, until the end of the round. */
  | { kind: "overshield"; amount: number }
  // reactions: armed on your turn, fire automatically on the trigger, expire at the end of the round
  | { kind: "ward" }
  | { kind: "brace" }
  | { kind: "retaliate"; hit: number; damage: number };

export interface SupportAbilityDef {
  id: string;
  name: string;
  text: string;
  cp: number;
  /** Using it exhausts the support card until the next round. */
  exhaust: boolean;
  timing: SupportTiming;
  effect: SupportEffect;
}

export interface SupportDef {
  id: string;
  name: string;
  faction: FactionId;
  /** List-building cost in Fizz. */
  fizz: number;
  /** Command points this support adds to your pool at the start of each round. */
  cp: number;
  blurb: string;
  abilities: SupportAbilityDef[];
  /** Extra army slots taking this card gives, by unit class (see data/unitClasses.ts; built-ins use its table). */
  slots?: Partial<Record<"base" | "support" | "elite" | "flyer" | "static", number>>;
}

export interface Faction {
  id: FactionId;
  name: string;
  blurb: string;
  color: number;
  profiles: UnitProfile[];
  /** Starter roster for Skirmish. */
  defaultList: ListEntry[];
  /** Added to the Skirmish roster for Assault. */
  assaultExtras: ListEntry[];
  /** Off-board supports this faction can take. */
  supports: SupportDef[];
  /** Starter supports for Skirmish, and the extras added for Assault. */
  defaultSupports: string[];
  assaultSupports: string[];
  /**
   * The whole Assault starter set, when it shouldn't simply be the Skirmish set plus the extras
   * (e.g. a card that's fine on the small board but too strong on the long one).
   */
  assaultStarter?: string[];
  /** Token decoration the renderer uses. */
  look: "cap" | "teeth" | "crystal" | "plain";
  /** True for factions made in the faction tool. */
  custom?: boolean;
  /** Extra army slots every list of this faction gets, by unit class (see data/unitClasses.ts; built-ins use its table). */
  slots?: Partial<Record<"base" | "support" | "elite" | "flyer" | "static", number>>;
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
  /** Exhausted from a disengage that didn't outnumber the enemy in supply: sits out the assault phase (light units may still shoot) and can't charge. */
  disengaged: boolean;
  hunkered: boolean;
  charged: boolean;
  fought: boolean;
  hurt: boolean; // took damage this round
  slowedRounds: number; // >0: -2 move
  deployedRound: number;
  /** Per-round buffs from supports. */
  meleeBonus: number;
  rangedBonus: number;
  braced: boolean;
  /** Used its active ability this phase (abilities are free actions within the activation). */
  abilityUsed: boolean;
  /** Shaken: hits one worse, won't charge, can't hold objectives. Lasts until rallied. */
  shaken: boolean;
  /** Rampage: saves one worse until the end of the round. */
  reckless?: boolean;
  /** Corrode: acid has eaten at its armour, so its saves are one worse until the end of the round. */
  corroded?: boolean;
  /** Spotter: enemy shots at this unit hit one better until the end of the round. */
  spotted?: boolean;
  /** Sugar Rush: extra move until the end of the round. */
  hasted?: number;
  /** Provoke: enemy units within range must shoot this unit if they can, until the end of the round. */
  provoking?: boolean;
  /** Per-round combat buffs (negative = debuff): evade target, precision and tracking on every attack. */
  evadeBonus?: number;
  precisionBonus?: number;
  trackingBonus?: number;
  /** Dug in (support): this much better saves against shooting and barrages until the end of the round. */
  dugIn?: number;
  /** Eye Peck / Eye-Watering Reek: this unit's shooting hits one worse until the end of the round. */
  blinded?: boolean;
  /** Spotlight / Glaring Light: cover, hunkering and digging in don't help its saves against shooting until the end of the round. */
  exposed?: boolean;
  /** Dust Cloud: can't be shot from further than this many inches until the end of the round (0 = no smoke). */
  smoked?: number;
  /** Withering Review: no active abilities, and its reactive abilities don't trigger, until the end of the round. */
  silenced?: boolean;
  /** Overcharge: +1 damage on its ranged attacks until the end of the round. */
  overcharged?: boolean;
  /** Top Cover: has Overwatch until the end of the round. */
  overwatching?: boolean;
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
  /** Temporary structures: removed at the end of this round. */
  expiresRound?: number;
  /** Created by a summon rather than bought in the list. */
  summoned?: boolean;
  /** Supply this unit has conceded to the enemy through its losses. It never goes down, so regrown models don't pay out twice. */
  supplyPaid?: number;
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
  /**
   * Convoy cargo (role missions): `team`'s own payload, carried by `team` toward the enemy's
   * deployment zone or home objective. Without it, the flag is a snack the enemy steals.
   */
  cargo?: boolean;
}

/** Per-player economy for the rest of the game (mission defaults, role overrides, garrison supply). */
export interface EconomyState {
  income: number;
  supplyPerRound: number;
  maxSupply: number;
}

/**
 * Mission bookkeeping that lives across rounds. Treat it as immutable: replace the object (and any
 * record inside it) rather than editing it, because cloneState copies it by reference.
 */
export interface MissionState {
  /** Each player's economy (set up by createGame). */
  economy?: [EconomyState, EconomyState];
  /** Crown: consecutive rounds each crown objective (by id) has been held, and by whom. */
  streaks?: Record<string, { player: PlayerId; rounds: number }>;
  /** Shifting: the objective number that scores this round, and the one announced for next round. */
  live?: number | null;
  next?: number | null;
  /** Bounty: the uid of each player's marked unit (the one the other side is hunting), or null. */
  bounty?: [string | null, string | null];
  /** Loot: loads of salvage left on each objective (by id). */
  loads?: Record<string, number>;
  /** Cull: enemy supply destroyed that each player has already been paid for. */
  culled?: [number, number];
}

export interface PlayerState {
  resources: number;
  supplyCap: number;
  vp: number;
  passed: boolean;
  /** Command points. */
  cp: number;
  supports: { id: string; exhausted: boolean }[];
  /** Reactions armed this round. */
  armed: { support: string; ability: string; trigger: ReactionTrigger; expiresRound: number }[];
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
  /** The opening initiative roll-off: one d6 each, re-rolled on ties. Last pair decides. */
  initiativeRolls?: [number, number][];
  /** Someone must choose who goes first before anything else happens (roll-off winner, or trailing player). */
  orderChoice?: { player: PlayerId; reason: "rolloff" | "tie" | "behind" } | null;
  /** First player to pass early in the movement or combat phase: goes first in the next phase. */
  initiativeClaim?: PlayerId | null;
  /** Whether order choices are in play this game (GameSetup.orderChoice). */
  orderChoiceRule?: boolean;
  /** Mission bookkeeping (economy, crown streaks, live objective, bounty marks, loot). See MissionState. */
  missionState?: MissionState;
  /**
   * Open roster ("RTS") game: no army lists. Each side keeps one reserve unit of every buyable
   * profile in its faction, refilled as soon as it deploys (see openRoster.ts). `cap`: most copies
   * of one profile on the table at once (absent = no limit). `seq` numbers new recruits' uids.
   * Treat as immutable: replace the object rather than editing it (cloneState shares it).
   */
  openRoster?: { cap?: number; seq: number };
  /** House rules this game is played with (see houseRules.ts). Absent: the standard game. Treat as immutable. */
  rules?: HouseRules;
  /** AI look-ahead only: rolled charges skip the roll and always reach (the AI weighs the odds itself). */
  aiAssumeChargesLand?: boolean;
}

export type Command =
  | { type: "deploy"; uid: string; to: Vec }
  | { type: "move"; uid: string; leader: number; to: Vec }
  | { type: "disengage"; uid: string; leader: number; to: Vec }
  | { type: "advance"; uid: string; leader: number; to: Vec }
  | { type: "charge"; uid: string; target: string }
  /** `reroll`: the Command re-roll house rule, spend 1 CP to re-roll the attack's misses. */
  | { type: "shoot"; uid: string; target: string; weapon: number; reroll?: boolean }
  | { type: "fight"; uid: string; target: string; weapon: number; reroll?: boolean }
  | { type: "hunker"; uid: string }
  | { type: "hold"; uid: string }
  | { type: "ability"; uid: string; ability: AbilityId; target?: string; point?: Vec }
  | { type: "pass"; player: PlayerId }
  /** Free action every army has: spend 1 CP to steady a Shaken unit. */
  | { type: "rally"; player: PlayerId; target: string }
  /** The roll-off winner (or trailing player) decides who goes first this round. */
  | { type: "chooseOrder"; player: PlayerId; goFirst: boolean }
  /** Free action: play a support ability (doesn't use an activation or pass the turn). */
  | { type: "support"; player: PlayerId; support: string; ability: string; target?: string; point?: Vec };

export interface AttackReport {
  uid: string;
  target: string;
  weapon: string;
  kind: "shoot" | "fight" | "overwatch" | "barrage" | "impact";
  attackers: number; // models contributing
  hitRolls: number[];
  hitOn: number;
  /** Command re-roll: the misses' first rolls (`hitRolls` holds the dice after the re-roll). */
  rerolledFrom?: number[];
  /** Missed dice moved into the hits by precision. */
  precisionMoved?: number;
  /** The defender's evade dice (one per hit) and the target they needed; absent when the attack allowed no evade. */
  evadeRolls?: number[];
  evadeOn?: number;
  /** Successful evades cancelled by tracking. */
  evadesCancelled?: number;
  /** Breach dice house rule: the breach die's size and roll, and how many hits skipped the save. */
  breach?: { die: 3 | 6; roll: number; vs: string; skipped: number };
  saveRolls: number[];
  saveOn: (number | null)[];
  damage: number;
  modelsKilled: number;
  unitDestroyed: boolean;
}

export type GameEvent =
  | { type: "deployed"; uid: string }
  | { type: "moved"; uid: string; kind: "move" | "disengage" | "advance" | "charge" | "teleport" | "closeRanks"; /** Disengage only: it didn't outnumber the enemy in supply. */ exhausted?: boolean }
  | { type: "attack"; report: AttackReport }
  /** Rolled charges house rule: the 2d6 rolled for a charge, the distance it needed, and whether it made it. */
  | { type: "chargeRoll"; uid: string; target: string; roll: [number, number]; need: number; made: boolean }
  /** Random activation order house rule: who was drawn to go next, and how many activations each side had left. */
  | { type: "orderDraw"; player: PlayerId; left: [number, number] }
  /** A declared charge that could no longer reach (overwatch took down the models it was routed for). */
  | { type: "chargeFailed"; uid: string; target: string; reason: string }
  /** An indirect shell (mortar, Barrage) aimed at `aim` landed at `landed`: on target if `roll` >= `need`, else it drifted `drift` inches (halved when a firing model could see the spot). */
  | { type: "scatter"; uid: string; weapon: string; aim: Vec; landed: Vec; roll: number; need: number; drift: number; spotted: boolean }
  | { type: "hunkered"; uid: string }
  | { type: "held"; uid: string }
  | { type: "ability"; uid: string; ability: AbilityId; text: string }
  | { type: "passed"; player: PlayerId }
  | { type: "phase"; phase: Phase; round: number }
  | { type: "scored"; player: PlayerId; vp: number; reason: string }
  | { type: "flag"; team: PlayerId; text: string }
  | { type: "roundEnded"; round: number }
  | { type: "gameOver"; winner: PlayerId | "draw"; reason: string }
  | { type: "support"; player: PlayerId; support: string; ability: string; text: string }
  | { type: "summoned"; uid: string }
  | { type: "morale"; uid: string; roll: [number, number]; nerve: number; shaken: boolean }
  | { type: "rallied"; uid: string; how: "cp" | "roll" }
  | { type: "rolloff"; rolls: [number, number][]; winner: PlayerId; reason: "start" | "tie" }
  | { type: "orderChosen"; player: PlayerId; goFirst: boolean; round: number }
  | { type: "initiativeClaimed"; player: PlayerId; nextPhase: Phase }
  | { type: "expired"; uid: string }
  /** End of round: a side's shields recharge (`models` that gained shield). */
  | { type: "recharged"; player: PlayerId; models: number }
  /** End of round: a side's income, supply-cap growth and CP for the next round. */
  | { type: "upkeep"; player: PlayerId; resources: number; supply: number; cp: number };

export type CommandResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
