import type { Faction, FactionId, ListEntry, SupportDef, UnitProfile, Weapon, WeaponBonus } from "../types";
import { clearProfileCache } from "../profile";
import type { ModeId } from "./modes";

// Original factions for SCDMG. Stats are first-pass and meant to be tuned through playtesting.

type WeaponOpts = {
  damage?: number;
  ap?: number;
  targets?: Weapon["targets"];
  bonuses?: WeaponBonus[];
  traits?: Weapon["traits"];
  precision?: number;
  tracking?: number;
};

/** Precision and tracking, only when set (keeps exported faction JSON tidy). */
const aim = (o: WeaponOpts): Partial<Weapon> => ({
  ...(o.precision ? { precision: o.precision } : {}),
  ...(o.tracking ? { tracking: o.tracking } : {}),
});

const ranged = (name: string, range: number, dice: number, hit: number, o: WeaponOpts = {}): Weapon => ({
  name,
  melee: false,
  range,
  dice,
  hit,
  damage: o.damage ?? 1,
  ap: o.ap ?? 0,
  targets: o.targets ?? "all",
  bonuses: o.bonuses,
  traits: o.traits,
  ...aim(o),
});

const melee = (name: string, dice: number, hit: number, o: WeaponOpts = {}): Weapon => ({
  name,
  melee: true,
  range: 0,
  dice,
  hit,
  damage: o.damage ?? 1,
  ap: o.ap ?? 0,
  targets: o.targets ?? "ground",
  bonuses: o.bonuses,
  traits: o.traits,
  ...aim(o),
});

const militia: Faction = {
  id: "militia",
  name: "Dustline Militia",
  blurb:
    "The frontier, drafted: farm and mine hands drilled into squads and bolted into old work-suits turned riveted armour. Nothing matches, everything holds, and nobody is leaving the valley.",
  color: 0xf28c28,
  look: "cap",
  // The drop-ship balances in Skirmish but runs away with the long Assault board (sims: ~84% Militia),
  // so Assault keeps the old starter set. Skirmish takes the Ammo Wagon rather than the Motor Pool (then
  // the Tractor Depot): after the Rivet Rifle lost its anti-armour bonus the Militia fell behind the
  // Munch there. v0.11 sims (standard house rules) kept it: with the radio instead the Militia scored
  // ~64%, with the Weather Vane (now the Smoke Detail) ~45%. v0.12 balance pass, against the swarm: still
  // the wagon. Grange Hall Command and the drop-ship, or the Smoke Detail and the Forward Airstrip, took
  // the Militia to ~70-78% against both armies. Assault adds the wagon to the old set: it left 2 Fizz
  // unused, and the Concord led the Militia ~54-46 there without it.
  defaultSupports: ["mil-wagon", "mil-dropship"],
  assaultSupports: ["mil-vane"],
  assaultStarter: ["mil-radio", "mil-depot", "mil-airstrip", "mil-wagon"],
  supports: [
    {
      id: "mil-radio",
      name: "Grange Hall Command",
      faction: "militia",
      fizz: 2,
      cp: 1,
      blurb: "Muster headquarters in the old Grange Hall: a map table, a field radio and the Marshal. She is terrifying.",
      abilities: [
        { id: "supply-run", name: "Supply Run", cp: 1, exhaust: true, timing: "any", effect: { kind: "resources", amount: 3 }, text: "Gain 3 resources." },
        {
          id: "call-it-in",
          name: "Call It In",
          cp: 1,
          exhaust: true,
          timing: "assault",
          effect: { kind: "spot", range: 24 },
          text: 'An enemy unit within 24" of your models is spotted: your shots at it hit one better this round. Every picket post in the valley is on the same frequency.',
        },
      ],
    },
    {
      id: "mil-depot",
      name: "Motor Pool",
      faction: "militia",
      fizz: 3,
      cp: 1,
      blurb: "The old tractor depot, now with a duty roster. Spare parts, spare plating, spare everything.",
      abilities: [
        {
          id: "junk-wall",
          name: "Junk Barricade",
          cp: 2,
          exhaust: true,
          timing: "movement",
          effect: { kind: "summon", profileId: "mil-junk", range: 8, minEnemyDistance: 2 },
          text: 'Drop a Junk Barricade within 8" of one of your models (at least 2" from enemies). It blocks enemy paths until the end of the round.',
        },
        {
          id: "field-repairs",
          name: "Field Repairs",
          cp: 1,
          exhaust: false,
          timing: "any",
          effect: { kind: "heal", amount: 3, revive: false },
          text: "A friendly unit heals 3 HP. A welder and a rivet gun fix tractors, turrets and armour. They do not fix being dead.",
        },
      ],
    },
    {
      id: "mil-vane",
      name: "Smoke Detail",
      faction: "militia",
      fizz: 3,
      cp: 2,
      blurb: "Two old miners, a cart of smoke pots and the valley's dust. They read the wind like a map.",
      abilities: [
        {
          id: "dust-devil",
          name: "Dust Devil",
          cp: 2,
          exhaust: true,
          timing: "any",
          effect: { kind: "ward" },
          text: "Reaction: the next enemy ranged attack on one of your units this round hits one worse.",
        },
        {
          id: "dust-cloud",
          name: "Dust Cloud",
          cp: 1,
          exhaust: true,
          timing: "any",
          effect: { kind: "smoke", range: 12 },
          text: 'A friendly unit vanishes into a cloud of dust: it can\'t be shot from more than 12" away this round.',
        },
      ],
    },
    {
      id: "mil-airstrip",
      name: "Forward Airstrip",
      faction: "militia",
      fizz: 3,
      cp: 1,
      blurb: "A graded field, a windsock, a fuel bowser and a pilot who swears he has done this before.",
      abilities: [
        {
          id: "hay-drop",
          name: "Supply Drop",
          cp: 3,
          exhaust: true,
          timing: "movement",
          effect: { kind: "airdrop", range: 12, minEnemyDistance: 6 },
          text: 'Drop a unit from your reserves within 12" of one of your models (at least 6" from enemies), paying its resources and supply as normal.',
        },
        {
          id: "top-cover",
          name: "Top Cover",
          cp: 1,
          exhaust: true,
          timing: "any",
          effect: { kind: "overwatch" },
          text: "A plane circles over a friendly unit with a gun: it gains Overwatch until the end of the round.",
        },
      ],
    },
    {
      id: "mil-dropship",
      name: "Rust Bucket Drop-Ship",
      faction: "militia",
      fizz: 4,
      cp: 1,
      blurb: "An ore hauler with troop benches bolted in. Forty years old, three engines out of four, and a landing light that is just a lantern on a hook.",
      abilities: [
        {
          id: "bumpy-landing",
          name: "Bumpy Landing",
          cp: 1,
          exhaust: true,
          timing: "movement",
          effect: { kind: "airdrop", range: 0, minEnemyDistance: 8, anywhere: true, fromRound: 2 },
          text: 'From round 2: drop a unit from your reserves anywhere on the table, at least 8" from enemies and not within 6" of the enemy\'s home objective, paying its resources and supply as normal.',
        },
        {
          id: "sandbag-drop",
          name: "Sandbag Drop",
          cp: 1,
          exhaust: true,
          timing: "any",
          effect: { kind: "dugIn", save: 1 },
          text: "Sacks tumble out of the cargo door: a friendly unit digs in, +1 to its saves against shooting and barrages this round.",
        },
      ],
    },
    {
      id: "mil-wagon",
      name: "Ammo Wagon",
      faction: "militia",
      fizz: 2,
      cp: 1,
      blurb: "Rivets, rifle rounds, sandbags, and a quartermaster who counts every one of them twice.",
      abilities: [
        { id: "rivet-crate", name: "Crate of Rivets", cp: 2, exhaust: true, timing: "assault", effect: { kind: "rangedBuff", dice: 1 }, text: "A friendly unit gets +1 ranged die per model this round." },
        {
          id: "sandbag-social",
          name: "Sandbag Detail",
          cp: 1,
          exhaust: true,
          timing: "any",
          effect: { kind: "dugIn", save: 1 },
          text: "A friendly unit digs in: +1 to its saves against shooting and barrages this round, on top of cover and hunkering. Every squad drills it until it can fill sandbags in the dark.",
        },
      ],
    },
  ],
  // The second Big Bertha is the swarm's answer: with a Grunt squad in her place the Militia scored ~33%
  // against the Munch in Assault. v0.12 balance pass: a fourth Grunt squad rather than the Tumbleweed
  // Outriders, who came on in under half the games against the swarm and did under 1 damage when they
  // did (no change in the win rates).
  assaultExtras: [
    { profileId: "mil-rustler", upgrades: [] },
    { profileId: "mil-bertha", upgrades: [] },
    { profileId: "mil-bomber", upgrades: [] },
    { profileId: "mil-grannies", upgrades: [] },
    { profileId: "mil-mortar", upgrades: [] },
    { profileId: "mil-grunts", upgrades: [] },
  ],
  // v0.11 (before the rework): a mortar (Radio Spotter) instead of the Patch Medic and the Watchtower
  // Drill; the third Grunt squad stays (with a marksman in its place the Militia fell to ~43%).
  // The rework: five-strong armoured squads (one drilled for Overwatch, one with Jump Jets, one at full
  // strength with its Second Section) and a Patch Medic team to keep the line standing.
  defaultList: [
    { profileId: "mil-grunts", upgrades: ["overwatch"] },
    { profileId: "mil-grunts", upgrades: ["jets"] },
    { profileId: "mil-grunts", upgrades: ["extra"] },
    { profileId: "mil-bertha", upgrades: ["barrage"] },
    { profileId: "mil-squinter", upgrades: [] },
    { profileId: "mil-squinter", upgrades: [] },
    { profileId: "mil-mortar", upgrades: [] },
    { profileId: "mil-medic", upgrades: [] },
  ],
  profiles: [
    {
      id: "mil-grunts",
      name: "Rivet Grunts",
      faction: "militia",
      // The drafted line: five troopers in riveted work-suit armour (was seven farmhands at armour 5).
      // About the same wounds to chew through, on fewer bodies and fewer rifles.
      cost: 3,
      supply: 2,
      models: 5,
      move: 6,
      hp: 1,
      shield: 0,
      armor: 4,
      baseRadius: 0.55,
      keywords: ["infantry"],
      // No bonus against armoured targets: it made massed rifles the Phase Guard's main killer.
      // Armour-cracking is Big Bertha's and the marksman's job.
      weapons: [ranged("Rivet Rifle", 22, 1, 4), melee("Trench Spade", 1, 5)],
      abilities: ["entrenched", "demo-charge"],
      upgrades: [
        { id: "extra", name: "Second Section", cost: 1, addModels: 2, text: "+2 models." },
        { id: "overwatch", name: "Picket Drill", cost: 1, addAbilities: ["overwatch"], text: "Gains Overwatch." },
        {
          id: "jets",
          name: "Jump Jets",
          cost: 1,
          move: 2,
          addKeywords: ["jump"],
          text: "+2 move, and can hop between levels without a ramp or ladder.",
        },
      ],
      blurb: "Drafted off the farms and out of the mine, drilled at the Grange Hall, bolted into armour that used to be a boiler. Dig in, hold the line, complain by the book.",
    },
    {
      id: "mil-medic",
      name: "Patch Medic",
      faction: "militia",
      // A team of three (was one 3-wound medic): the same wounds, more bodies, a pistol each.
      // Kept at ⚙2/◆1 (pricing.ts says ⚙3/◆2): in v0.11 sims it did under 1 damage a game and
      // patched up about once every three games, so it isn't worth more.
      cost: 2,
      supply: 1,
      models: 3,
      move: 6,
      hp: 1,
      shield: 0,
      armor: 4,
      baseRadius: 0.6,
      keywords: ["infantry", "light"],
      evade: { target: 5, against: ["pointBlank"] },
      weapons: [ranged("Staple Pistol", 10, 1, 4, { traits: ["pistol"] }), melee("Plate Wrench", 1, 4)],
      abilities: ["patch-up", "entrenched", "rocket-hop", "steadying"],
      upgrades: [],
      blurb: "The corps' medics: a staple gun for people, a wrench for armour, and a hop-pack to reach both. They patch you up and send you back to your post.",
    },
    {
      id: "mil-bertha",
      name: "Big Bertha",
      faction: "militia",
      cost: 5,
      supply: 3,
      models: 1,
      move: 5,
      hp: 8,
      shield: 0,
      armor: 3,
      baseRadius: 1.3,
      keywords: ["armoured", "heavy", "mech", "fearless"],
      weapons: [
        ranged("Thumper Cannon", 24, 3, 4, { damage: 2, ap: 1, targets: "ground", bonuses: [{ vs: "armoured", dice: 1 }], traits: ["blast", "heavy"] }),
        melee("Stomp", 2, 3, { damage: 2, bonuses: [{ vs: "infantry", dice: 1 }] }),
      ],
      abilities: ["steady-aim", "return-fire"],
      impact: { dice: 1, hit: 4, damage: 2, ap: 1 },
      upgrades: [{ id: "barrage", name: "Barrage Shells", cost: 2, addAbilities: ["barrage"], text: "Gains Barrage." }],
      blurb: "The Haybright combine, walking now, with plate armour, a crew of three and a cannon. Parks, plants its feet, and keeps firing.",
    },
    {
      id: "mil-rustler",
      name: "Sky Rustler",
      faction: "militia",
      cost: 4,
      supply: 2,
      models: 1,
      move: 12,
      hp: 4,
      shield: 0,
      armor: 5,
      baseRadius: 0.9,
      keywords: ["flying", "light", "mech"],
      evade: { target: 5, against: ["ranged"] },
      weapons: [ranged("Chain Popper", 16, 3, 4, { precision: 1, bonuses: [{ vs: "light", dice: 1 }] })],
      abilities: ["spotter", "crop-dust"],
      upgrades: [
        {
          id: "flak",
          name: "Flak Kit",
          cost: 1,
          weapon: { index: 0, patch: { bonuses: [{ vs: "light", dice: 1 }, { vs: "flying", dice: 2 }] } },
          text: "Chain Popper gets +2 dice against flyers.",
        },
      ],
      blurb: "A crop duster refitted for ground attack: a chain gun in the nose, a dust tank under the wings and squadron numbers on the tail.",
    },
    {
      id: "mil-turret",
      name: "Scrap Turret",
      faction: "militia",
      cost: 3,
      supply: 1,
      models: 1,
      move: 0,
      hp: 5,
      shield: 0,
      armor: 4,
      baseRadius: 0.9,
      keywords: ["structure", "mech"],
      weapons: [ranged("Rivet Repeater", 20, 3, 4, { tracking: 1, traits: ["blast"] })],
      abilities: ["overwatch"],
      upgrades: [],
      structure: { lifetime: "permanent", fieldDeploy: 6 },
      blurb: "Three rifles on a pivot, a boiler-plate shield and one tractor seat. Whoever draws turret duty draws it for the whole battle.",
    },
    {
      id: "mil-junk",
      name: "Junk Barricade",
      faction: "militia",
      cost: 0,
      supply: 0,
      models: 1,
      move: 0,
      hp: 4,
      shield: 0,
      armor: 5,
      baseRadius: 1.3,
      keywords: ["structure"],
      weapons: [],
      abilities: ["scrap-cover"],
      upgrades: [],
      structure: { lifetime: "round", summonOnly: true },
      blurb: "Bedframes, a mine cart, boiler plate and a very confused goat, wired together in the time it takes to say 'incoming'.",
    },
    // ----- new units (sniper, flanker, fearless defenders, bomber, mortar structure) -----
    {
      id: "mil-squinter",
      name: "Ridgeline Marksman",
      faction: "militia",
      cost: 3,
      supply: 1,
      models: 1,
      move: 5,
      hp: 3,
      shield: 0,
      armor: 5,
      baseRadius: 0.55,
      keywords: ["infantry", "light"],
      evade: { target: 6, against: ["ranged"] },
      nerve: 8,
      weapons: [ranged("Varmint Rifle", 30, 2, 3, { precision: 1, damage: 2, ap: 1, traits: ["heavy", "rending"] }), melee("Rifle Butt", 1, 5)],
      abilities: ["steady-aim", "entrenched"],
      upgrades: [
        { id: "porch", name: "Picket Post", cost: 1, addAbilities: ["overwatch"], text: "Gains Overwatch." },
        { id: "holler", name: "Field Telephone", cost: 1, addAbilities: ["spotter"], text: "Gains Spotter." },
        {
          id: "slugs",
          name: "Big-Game Slugs",
          cost: 1,
          weapon: { index: 0, patch: { bonuses: [{ vs: "heavy", damage: 1 }] } },
          text: "Varmint Rifle deals +1 damage to heavy targets.",
        },
      ],
      blurb: "The corps' sharpshooters, led by the Squinter, who hasn't blinked since the harvest of '09. Long rifle, a ghillie of dry grass, and a tally on the stock.",
    },
    {
      id: "mil-riders",
      name: "Tumbleweed Outriders",
      faction: "militia",
      cost: 3,
      supply: 2,
      models: 3,
      move: 12,
      hp: 2,
      shield: 0,
      armor: 5,
      baseRadius: 0.8,
      keywords: ["light", "mech"],
      evade: { target: 5, against: ["ranged", "blast"] },
      weapons: [ranged("Scattergun", 12, 1, 4, { ap: 1, traits: ["blast"] }), melee("Hubcap Swipe", 1, 4)],
      abilities: ["demo-charge", "rocket-hop"],
      upgrades: [
        { id: "nitro", name: "Nitro Cans", cost: 1, move: 2, text: "+2 move." },
        { id: "sidecar", name: "Sidecar", cost: 1, addModels: 1, text: "+1 model." },
      ],
      blurb: "The corps' scouts on armoured dirt bikes: dispatch riders, flankers and raiders. They shoot from the saddle, because the brakes are decorative.",
    },
    {
      id: "mil-grannies",
      name: "Old Guard Veterans",
      faction: "militia",
      cost: 5,
      supply: 2,
      models: 4,
      move: 5,
      hp: 2,
      shield: 0,
      armor: 4,
      baseRadius: 0.55,
      keywords: ["infantry", "fearless"],
      weapons: [
        ranged("Rock-Salt Scattergun", 10, 2, 4, { traits: ["blast", "pistol"] }),
        melee("Pick Haft", 2, 4, { bonuses: [{ vs: "beast", dice: 1 }] }),
      ],
      abilities: ["entrenched", "steadying"],
      upgrades: [
        { id: "mabel", name: "Sergeant Mabel", cost: 1, addModels: 1, text: "+1 model." },
        { id: "eyes", name: "Eyes in the Back", cost: 1, addAbilities: ["overwatch"], text: "Gains Overwatch." },
      ],
      blurb: "Recalled to the colours from the last two wars, in the heaviest plate in the valley. They have dug these trenches before. You do not scare them.",
    },
    {
      id: "mil-bomber",
      name: "Haymaker Bomber",
      faction: "militia",
      cost: 5,
      supply: 3,
      models: 1,
      move: 10,
      hp: 6,
      shield: 0,
      armor: 4,
      baseRadius: 1.1,
      keywords: ["flying", "mech"],
      evade: { target: 6, against: ["ranged"] },
      weapons: [
        ranged("Ore-Bucket Bombs", 6, 3, 4, { targets: "ground", traits: ["torrent", "blast"] }),
        ranged("Tail Gun", 14, 1, 4, { tracking: 1 }),
      ],
      abilities: ["return-fire", "bale-out"],
      upgrades: [
        {
          id: "twin-tail",
          name: "Twin Tail Guns",
          cost: 1,
          weapon: { index: 1, patch: { dice: 2 } },
          text: "Tail Gun rolls 2 dice.",
        },
      ],
      blurb: "A cargo biplane with a bomb rack where the hay used to go. It drops mine buckets of blasting powder, and the crew still call the run a haymaker.",
    },
    {
      id: "mil-mortar",
      name: "Pipe Mortar",
      faction: "militia",
      cost: 3,
      supply: 1,
      models: 1,
      move: 0,
      hp: 5,
      shield: 0,
      armor: 4,
      baseRadius: 0.9,
      keywords: ["structure", "mech"],
      weapons: [ranged("Mine-Charge Lobber", 30, 3, 4, { ap: 1, targets: "ground", traits: ["indirect"] })],
      abilities: ["radio-spotting"],
      upgrades: [{ id: "boom-spuds", name: "Blasting Shells", cost: 2, addAbilities: ["barrage"], text: "Gains Barrage." }],
      structure: { lifetime: "permanent", fieldDeploy: 6 },
      blurb: "A length of mine drainpipe on a sandbagged base, a crate of blasting charges and a crew with a field telephone. Range: yes.",
    },
  ],
};

// The Skitterswarm: a bug tide from under the valley around one Broodmother. Not the old Munch with
// new names: no impact on the line bugs, no goo. Acid (Corrode) softens a target for the rest of the
// swarm; the Broodmother's Brood Bond refills every hurt brood around her, so the army fights in a
// knot around her and comes apart when she falls; and it burrows (Tunnel on squads, the Lurker, the
// Deep Borer, Surface Breach and the Brood Spire).
const swarm: Faction = {
  id: "swarm",
  name: "The Skitterswarm",
  blurb:
    "A tide of bugs boiling up from under the valley, every one of them answering to the Broodmother. They chew, they spit acid, they dig, and whatever you squash, she lays again.",
  color: 0xa3c936,
  look: "teeth",
  // Its way in: Surface Breach (a reserve bursts up near the swarm) and the Tunnel Mouth on one card.
  defaultSupports: ["swarm-tunnels", "swarm-chamber"],
  assaultSupports: ["swarm-hum"],
  supports: [
    {
      id: "swarm-hum",
      name: "Brood Hum",
      faction: "swarm",
      fizz: 4,
      cp: 1,
      blurb: "A thrum under the soil that every bug in the valley feels in its legs. When it rises, they run.",
      abilities: [
        { id: "gnashing-frenzy", name: "Gnashing Frenzy", cp: 1, exhaust: false, timing: "any", effect: { kind: "meleeBuff", dice: 1 }, text: "A friendly unit gets +1 melee die per model this round." },
        {
          id: "skitter-rush",
          name: "Skitter Rush",
          cp: 1,
          exhaust: true,
          timing: "any",
          effect: { kind: "haste", move: 2 },
          text: 'The hum rises: a friendly unit gets +2" move this round (and +2" on a rolled charge). It exhausts the card, so no Gnashing Frenzy this round.',
        },
      ],
    },
    {
      id: "swarm-chamber",
      name: "Egg Chamber",
      faction: "swarm",
      fizz: 3,
      cp: 1,
      blurb: "Warm, damp, humming, and full to the ceiling. Nobody counts the eggs. Nobody could.",
      abilities: [
        {
          id: "lay-clutch",
          name: "Lay a Clutch",
          cp: 2,
          exhaust: true,
          timing: "movement",
          effect: { kind: "summon", profileId: "swarm-eggs", range: 10, minEnemyDistance: 3 },
          text: 'Lay an Egg Clutch within 10" of one of your models (at least 3" from enemies). Until the end of the round it Lurks: the first enemy ground unit to end a move within 3" of it gets nipped by whatever hatches.',
        },
        {
          id: "quickening",
          name: "Quickening",
          cp: 1,
          exhaust: true,
          timing: "any",
          effect: { kind: "regrow", models: 2 },
          text: "A friendly unit regrows up to 2 lost models (1 HP each), fresh out of the shell.",
        },
      ],
    },
    {
      id: "swarm-tunnels",
      name: "Undertunnels",
      faction: "swarm",
      fizz: 3,
      cp: 1,
      blurb: "Miles of chewed tunnels under the fields. The Militia's surveyors call it subsidence. It is not subsidence.",
      abilities: [
        {
          id: "surface-breach",
          name: "Surface Breach",
          cp: 2,
          exhaust: true,
          timing: "movement",
          effect: { kind: "airdrop", range: 10, minEnemyDistance: 5, fromRound: 2 },
          text: 'From round 2: a unit from your reserves bursts up out of the ground within 10" of one of your models (at least 5" from enemies), paying its resources and supply as normal.',
        },
        {
          id: "open-tunnel",
          name: "Open a Tunnel",
          cp: 3,
          exhaust: true,
          timing: "movement",
          // From round 2, like every other arrival card (v0.12 balance pass). In round 1 of Assault the
          // swarm had the 3 CP to open one a third of the way up the long board and pour out of it:
          // ~69% in Assault, 94% on Long Ridge Highway.
          effect: { kind: "summon", profileId: "swarm-mouth", range: 12, minEnemyDistance: 6, fromRound: 2 },
          text: 'From round 2: open a Tunnel Mouth within 12" of one of your models (at least 6" from enemies). Until the end of the round your reserves can deploy next to it.',
        },
      ],
    },
    {
      id: "swarm-pheromones",
      name: "Pheromone Cloud",
      faction: "swarm",
      fizz: 2,
      cp: 1,
      blurb: "It smells of old pennies and wet leaves, and it makes the back of your neck itch.",
      abilities: [
        {
          id: "skin-crawl",
          name: "Skin-Crawl",
          cp: 1,
          exhaust: true,
          timing: "any",
          effect: { kind: "rattle", range: 10, penalty: 1 },
          text: 'An enemy unit within 10" of your models takes a nerve test at -1 nerve, whatever its strength. Something is crawling up its sleeve.',
        },
        {
          id: "spore-fog",
          name: "Spore Fog",
          cp: 1,
          exhaust: true,
          timing: "any",
          effect: { kind: "blind", range: 10 },
          text: 'An enemy unit within 10" of your models is lost in a cloud of spores: its shooting hits one worse this round.',
        },
      ],
    },
    {
      id: "swarm-glands",
      name: "Acid Glands",
      faction: "swarm",
      fizz: 2,
      cp: 1,
      blurb: "Sacs of acid the size of a water tank, buried under the brood chambers. They gurgle at night.",
      abilities: [
        {
          id: "acid-blood",
          name: "Acid Blood",
          cp: 1,
          exhaust: true,
          timing: "any",
          effect: { kind: "retaliate", hit: 4, damage: 1 },
          text: "Reaction: when one of your units is destroyed this round, it bursts: every enemy model touching it is hit on a 4+ for 1 damage.",
        },
        {
          id: "caustic-snare",
          name: "Caustic Snare",
          cp: 1,
          exhaust: true,
          timing: "assault",
          effect: { kind: "slow", range: 14 },
          text: 'An enemy unit within 14" of your models steps in a puddle of acid and its boots start to go: -2 move next round.',
        },
      ],
    },
  ],
  // v0.12 balance pass: the third brood without More Eggs and the second Stinger Swarm with a Bigger
  // Cloud (the swarm was ~4 points ahead in Assault; this took about 7 off it against the Militia). The
  // Brood Spire stays: it's the swarm's way forward in round 1 now that the Tunnel Mouth waits for
  // round 2, and with the Acid Geyser in its place the swarm fell ~15 points against the Concord.
  assaultExtras: [
    { profileId: "swarm-skitterlings", upgrades: [] },
    { profileId: "swarm-shellbacks", upgrades: [] },
    { profileId: "swarm-borer", upgrades: [] },
    { profileId: "swarm-bombard", upgrades: [] },
    { profileId: "swarm-tenders", upgrades: [] },
    { profileId: "swarm-stingers", upgrades: ["more"] },
    { profileId: "swarm-spire", upgrades: [] },
  ],
  // v0.12 balance pass: the Lurker without Acid Drool, now that it costs ⚙3. The Bile Bombard in its
  // place played about the same; the Acid Geyser cost the swarm ~6 points against the Militia.
  defaultList: [
    { profileId: "swarm-skitterlings", upgrades: ["eggs"] },
    { profileId: "swarm-skitterlings", upgrades: ["burrowers"] },
    { profileId: "swarm-spitters", upgrades: ["glands"] },
    { profileId: "swarm-shellbacks", upgrades: [] },
    { profileId: "swarm-mother", upgrades: ["sacs"] },
    { profileId: "swarm-lurker", upgrades: [] },
    { profileId: "swarm-stingers", upgrades: [] },
  ],
  profiles: [
    {
      id: "swarm-skitterlings",
      name: "Skitterlings",
      faction: "swarm",
      cost: 3,
      supply: 3,
      models: 10,
      move: 7,
      hp: 1,
      shield: 0,
      armor: 6,
      baseRadius: 0.42,
      keywords: ["infantry", "light", "beast"],
      evade: { target: 5, against: ["pointBlank", "blast"] },
      nerve: 6,
      // No impact dice (the Munch's trick): they win by numbers, by coming back, and by chewing on
      // whatever the acid has already softened. AP1 since the v0.12 balance pass (pricing.ts: still ⚙3),
      // so the bites tell against the Militia's armour 4.
      weapons: [melee("Snippers", 1, 4, { ap: 1, traits: ["rending"] })],
      abilities: ["regrow", "rampage"],
      upgrades: [
        { id: "eggs", name: "More Eggs", cost: 1, addModels: 3, text: "+3 models." },
        { id: "burrowers", name: "Burrowers", cost: 1, addAbilities: ["tunnel"], text: "Gains Tunnel: the whole brood digs under the table once and comes up somewhere else." },
      ],
      blurb: "Cat-sized, all legs and all mouth. One is a nuisance; ten is a problem. They never come in ones.",
    },
    {
      id: "swarm-spitters",
      name: "Acid Spitters",
      faction: "swarm",
      cost: 3,
      supply: 2,
      models: 4,
      move: 6,
      hp: 2,
      shield: 0,
      armor: 6,
      baseRadius: 0.55,
      keywords: ["infantry", "light", "beast"],
      evade: { target: 5, against: ["pointBlank"] },
      nerve: 6,
      weapons: [ranged("Acid Spit", 14, 1, 4, { ap: 1, bonuses: [{ vs: "armoured", damage: 1 }] }), melee("Nip", 1, 5)],
      abilities: ["corrode", "regrow"],
      upgrades: [{ id: "glands", name: "Swollen Glands", cost: 1, weapon: { index: 0, patch: { dice: 2 } }, text: "Acid Spit rolls 2 dice." }],
      blurb: "They gargle, they aim, they spit. Whatever they hit starts to fizz, and whatever fizzes is next on the menu.",
    },
    {
      id: "swarm-shellbacks",
      name: "Shellback Brood",
      faction: "swarm",
      cost: 3,
      supply: 2,
      models: 4,
      move: 5,
      hp: 2,
      shield: 0,
      armor: 4,
      baseRadius: 0.6,
      keywords: ["infantry", "beast"],
      nerve: 7,
      weapons: [melee("Crusher Mandibles", 2, 4, { ap: 1 })],
      abilities: ["corrode", "regen"],
      upgrades: [{ id: "plates", name: "Thick Plates", cost: 1, addKeywords: ["armoured"], text: "Becomes armoured (ignores 1 AP from weapons not built to crack armour)." }],
      blurb: "Beetles with shells like upturned bathtubs and acid in their jaws. They walk into the guns, and the guns go first.",
    },
    {
      id: "swarm-lurker",
      name: "Trapjaw Lurker",
      faction: "swarm",
      // ⚙3 (was 2): Tunnel at 1 CP made it worth more (pricing.ts: 3.5). Still weak in AI play: it
      // charges alone and is shot down (under 0.5 damage a game).
      cost: 3,
      supply: 1,
      models: 1,
      move: 7,
      hp: 4,
      shield: 0,
      armor: 5,
      baseRadius: 0.7,
      keywords: ["beast", "jump"],
      nerve: 7,
      weapons: [melee("Trapjaw", 3, 3, { ap: 1 })],
      abilities: ["lurk", "tunnel"],
      upgrades: [{ id: "drool", name: "Acid Drool", cost: 1, addAbilities: ["corrode"], text: "Gains Corrode." }],
      blurb: "That isn't a rock. That was never a rock. It has been waiting under there since last spring.",
    },
    {
      id: "swarm-mother",
      name: "The Broodmother",
      faction: "swarm",
      cost: 6,
      supply: 4,
      models: 1,
      move: 5,
      hp: 12,
      shield: 0,
      armor: 4,
      baseRadius: 1.4,
      keywords: ["beast", "monster", "heavy", "fearless"],
      weapons: [ranged("Larva Lob", 12, 2, 4, { traits: ["blast"] }), melee("Egg-Tooth Jaws", 3, 3, { damage: 2, ap: 1 })],
      // The swarm's centre: Brood Bond refills every hurt brood within 6" each round, hurt or not.
      abilities: ["brood-bond", "brood-call", "hatch"],
      upgrades: [{ id: "sacs", name: "Acid Sacs", cost: 1, addAbilities: ["corrode"], text: "Gains Corrode." }],
      blurb: "Mostly abdomen, entirely in charge. Every bug on the table is one of hers, and while she lives, none of them stay dead.",
    },
    {
      id: "swarm-borer",
      name: "Deep Borer",
      faction: "swarm",
      cost: 5,
      supply: 2,
      models: 1,
      move: 7,
      hp: 10,
      shield: 0,
      armor: 4,
      baseRadius: 1.35,
      keywords: ["beast", "monster"],
      nerve: 9,
      weapons: [melee("Grinding Jaws", 3, 3, { damage: 2, ap: 1 })],
      impact: { dice: 2, hit: 4, damage: 1, ap: 1 },
      abilities: ["tunnel", "rampage"],
      upgrades: [{ id: "hide", name: "Plated Hide", cost: 1, addAbilities: ["regen"], text: "Gains Regen." }],
      blurb: "A tunnelling bug as long as an ore train. It doesn't come up through the ground so much as the ground gets out of its way.",
    },
    {
      id: "swarm-stingers",
      name: "Stinger Swarm",
      faction: "swarm",
      cost: 5,
      supply: 2,
      models: 5,
      move: 12,
      hp: 1,
      shield: 0,
      armor: 6,
      baseRadius: 0.4,
      keywords: ["flying", "light", "beast"],
      evade: { target: 5, against: ["ranged", "blast"] },
      nerve: 6,
      // Acid barbs from the air: whatever they sting, the brood on the ground finishes.
      weapons: [ranged("Acid Barbs", 10, 1, 4, { targets: "ground" })],
      impact: { dice: 1, hit: 4, damage: 1, ap: 0 },
      abilities: ["corrode", "bombs-away"],
      upgrades: [{ id: "more", name: "Bigger Cloud", cost: 1, addModels: 2, text: "+2 models." }],
      blurb: "A buzzing cloud of acid-tailed flyers. They sting the thing in front of the swarm, and then the swarm arrives.",
    },
    {
      id: "swarm-bombard",
      name: "Bile Bombard",
      faction: "swarm",
      cost: 3,
      supply: 1,
      models: 1,
      move: 4,
      hp: 6,
      shield: 0,
      armor: 5,
      baseRadius: 1.0,
      keywords: ["beast"],
      nerve: 7,
      weapons: [ranged("Bile Shell", 22, 2, 4, { ap: 1, targets: "ground", traits: ["indirect"] }), melee("Bloated Bump", 1, 5)],
      abilities: ["corrode", "regen"],
      upgrades: [],
      blurb: "A beetle the size of a hay cart with a belly full of acid and a very strong cough. It lobs. It burbles. It lobs again.",
    },
    {
      id: "swarm-tenders",
      name: "Brood Tenders",
      faction: "swarm",
      cost: 2,
      supply: 1,
      models: 2,
      move: 6,
      hp: 2,
      shield: 0,
      armor: 6,
      baseRadius: 0.55,
      keywords: ["infantry", "beast"],
      nerve: 6,
      weapons: [ranged("Grub Toss", 8, 1, 4), melee("Nursing Pincers", 1, 4)],
      abilities: ["hatch", "mending-aura"],
      upgrades: [],
      blurb: "Fussy nursemaids with backs full of eggs. They patch the wounded with spit and lay replacements for the ones that didn't make it.",
    },
    {
      id: "swarm-spire",
      name: "Brood Spire",
      faction: "swarm",
      cost: 3,
      supply: 1,
      models: 1,
      move: 0,
      hp: 6,
      shield: 0,
      armor: 5,
      baseRadius: 1,
      keywords: ["structure", "beast"],
      weapons: [ranged("Spore Puff", 14, 2, 4, { targets: "ground", traits: ["blast"] })],
      abilities: ["burrow-exit", "regen"],
      upgrades: [],
      // The permanent way up; the Tunnel Mouth (Undertunnels) is the one-round one.
      structure: { lifetime: "permanent", fieldDeploy: 6 },
      blurb: "A chimney of chewed dirt and spit, warm to the touch. The reserves come up through it, and it never stops coughing spores.",
    },
    {
      id: "swarm-geyser",
      name: "Acid Geyser",
      faction: "swarm",
      cost: 3,
      supply: 1,
      models: 1,
      move: 0,
      hp: 5,
      shield: 0,
      armor: 5,
      baseRadius: 0.9,
      keywords: ["structure", "beast"],
      weapons: [ranged("Acid Jet", 16, 2, 4, { ap: 1, targets: "ground", bonuses: [{ vs: "armoured", damage: 1 }] })],
      abilities: ["corrode", "regen"],
      upgrades: [],
      structure: { lifetime: "permanent", fieldDeploy: 6 },
      blurb: "A crust of chalky shell over a pocket of acid. When something walks past, it hisses, and then it spits.",
    },
    {
      id: "swarm-eggs",
      name: "Egg Clutch",
      faction: "swarm",
      cost: 0,
      supply: 0,
      models: 1,
      move: 0,
      hp: 3,
      shield: 0,
      armor: 6,
      baseRadius: 0.8,
      keywords: ["structure", "beast"],
      weapons: [melee("Hatchling Nips", 2, 4)],
      abilities: ["lurk"],
      upgrades: [],
      structure: { lifetime: "round", summonOnly: true },
      blurb: "Do not poke the eggs. The eggs poke back.",
    },
    {
      id: "swarm-mouth",
      name: "Tunnel Mouth",
      faction: "swarm",
      cost: 0,
      supply: 0,
      models: 1,
      move: 0,
      hp: 3,
      shield: 0,
      armor: 6,
      baseRadius: 1,
      keywords: ["structure"],
      weapons: [],
      abilities: ["burrow-exit"],
      upgrades: [],
      structure: { lifetime: "round", summonOnly: true },
      blurb: "A fresh hole, still crumbling at the edges. Listen: legs.",
    },
  ],
};

const concord: Faction = {
  id: "concord",
  name: "Lumen Concord",
  blurb:
    "Alien invaders in saucers and fishbowl helmets who find everyone else faintly embarrassing. Few in number, hard to scratch, impossibly smug.",
  color: 0xb48cf2,
  look: "crystal",
  // Each faction starts with its way in: drop-ship, burrow hole, portal. Unlike the drop-ship, the
  // portal also suits the long Assault board: a few elites can't hold its many objectives on foot
  // (sims: Concord ~39% without it, ~56% with it). The Star Lens adds no CP, so the Concord could afford
  // neither Sunbeam nor Afterglow (v0.11 sims: ~34%). v0.12 balance pass: the Court of Disdain rather than
  // the Mirror Spire. Once the AI stopped pouring its CP into Afterglow, the Concord scored ~63% against
  // the Militia with the spire; with the Court (and Phase Guard at supply 2) about 51%. The Choir of Light
  // took less off (~58%).
  defaultSupports: ["con-court", "con-portal"],
  assaultSupports: ["con-lens"],
  // Assault: the Light Gate rather than the Star Lens. With the bigger squads the Sunbeam ran away against
  // the swarm (sims: Concord ~58% vs Munch), while Gate Step helps a few elites reach the long board's objectives.
  // v0.11: the Court of Disdain rather than the Mirror Spire. Point Out Flaws and Withering Review (which
  // switches off Overwatch and Return Fire) took the Concord from ~45% to ~54% against the Militia.
  assaultStarter: ["con-court", "con-portal", "con-gate"],
  supports: [
    {
      id: "con-spire",
      name: "Mirror Spire",
      faction: "concord",
      fizz: 3,
      cp: 1,
      blurb: "A tower of polished smugness.",
      abilities: [
        { id: "refocus", name: "Refocus", cp: 1, exhaust: false, timing: "any", effect: { kind: "recharge" }, text: "A friendly unit's shields recharge to full." },
        {
          id: "glimmer-ward",
          name: "Glimmer Dome",
          cp: 3,
          exhaust: true,
          timing: "movement",
          effect: { kind: "summon", profileId: "con-ward", range: 8, minEnemyDistance: 2 },
          text: 'Place a Glimmer Dome within 8" of one of your models. Until the end of the round, enemy shots at friendly units within 4" of it hit one worse.',
        },
      ],
    },
    {
      id: "con-choir",
      name: "Choir of Light",
      faction: "concord",
      fizz: 2,
      cp: 1,
      blurb: "They hum in perfect, unbearable harmony.",
      abilities: [
        { id: "hold-fast", name: "Hold Fast", cp: 1, exhaust: true, timing: "any", effect: { kind: "brace" }, text: "Reaction: the next friendly unit charged this round gets +1 to saves in that combat." },
        {
          id: "resonance",
          name: "Resonance",
          cp: 1,
          exhaust: true,
          timing: "any",
          effect: { kind: "resonate", range: 6 },
          text: 'One perfect note: a friendly unit and every friendly unit within 6" of it recharge 1 shield per model.',
        },
      ],
    },
    {
      id: "con-lens",
      name: "Star Lens",
      faction: "concord",
      fizz: 3,
      cp: 0,
      blurb: "Focuses sunlight. Also focuses disdain.",
      abilities: [
        {
          id: "sunbeam",
          name: "Sunbeam",
          cp: 3,
          exhaust: true,
          timing: "assault",
          effect: { kind: "blast", radius: 2, hit: 3, damage: 2, ap: 1, range: 24, needsSight: true },
          text: 'A 2" blast at a point within 24" that one of your models can see. Each model under it is hit on a 3+ for 2 damage, AP1.',
        },
        {
          id: "glaring-light",
          name: "Glaring Light",
          cp: 1,
          exhaust: true,
          timing: "assault",
          effect: { kind: "expose", range: 24 },
          text: 'Assault phase: an enemy unit within 24" that one of your models can see is lit up: cover, hunkering and digging in don\'t help its saves against shooting this round.',
        },
      ],
    },
    {
      id: "con-court",
      name: "Court of Disdain",
      faction: "concord",
      fizz: 2,
      cp: 1,
      blurb: "A panel of alien critics, permanently unimpressed. They will tell your gunners exactly where the enemy's armour is cheap.",
      abilities: [
        {
          id: "point-out-flaws",
          name: "Point Out Flaws",
          cp: 1,
          exhaust: true,
          timing: "assault",
          effect: { kind: "aimBuff", precision: 1, tracking: 1 },
          text: "A friendly unit's attacks get precision +1 and tracking +1 this round. Precision also lets it pick a target out of a melee.",
        },
        {
          id: "withering-review",
          name: "Withering Review",
          cp: 2,
          exhaust: true,
          timing: "any",
          effect: { kind: "silence", range: 12 },
          text: 'An enemy unit within 12" of your models is too mortified to act: it can\'t use active abilities, and its reactions (Overwatch, Lurk and the like) don\'t trigger, this round.',
        },
      ],
    },
    {
      id: "con-gate",
      name: "Light Gate",
      faction: "concord",
      fizz: 4,
      cp: 1,
      blurb: "A doorway of pure light for getting about the battlefield. Please wipe your feet.",
      abilities: [
        {
          id: "gate-step",
          name: "Gate Step",
          cp: 3,
          exhaust: true,
          timing: "movement",
          effect: { kind: "teleport", range: 8 },
          text: 'One of your unengaged units on the table steps through a gate and out up to 8" away, ignoring terrain (not into base contact). It can still move and act afterwards.',
        },
        {
          id: "flash-step",
          name: "Flash Step",
          cp: 2,
          exhaust: true,
          timing: "assault",
          effect: { kind: "teleport", range: 4 },
          text: 'Assault phase: one of your unengaged units on the table flashes up to 4" through a small gate, ignoring terrain (not into base contact). It can still shoot or charge afterwards.',
        },
      ],
    },
    {
      // Concord's way in. Not the drop-ship's "anywhere, far from trouble" or the burrow's "the whole
      // swarm pours out": an elite reinforcement beams in right beside your own crystals, close to
      // the fight, and arrives overcharged.
      id: "con-portal",
      name: "Grand Portal",
      faction: "concord",
      fizz: 3,
      cp: 1,
      blurb: "Arriving fashionably late is an art. Arriving in a blaze of light, beside one's peers, is a privilege.",
      abilities: [
        {
          id: "step-through",
          name: "Step Through",
          cp: 2,
          exhaust: true,
          timing: "movement",
          effect: { kind: "airdrop", range: 4, minEnemyDistance: 3, fromRound: 2, arrivalShield: 1 },
          text: 'From round 2: a unit from your reserves steps out of a portal within 4" of one of your units (at least 3" from enemies), paying its resources and supply as normal. It arrives overcharged: +1 shield per model, even above its maximum, until the end of the round.',
        },
        {
          id: "afterglow",
          name: "Afterglow",
          cp: 2,
          exhaust: true,
          timing: "any",
          effect: { kind: "overshield", amount: 1 },
          text: "The portal's leftover light clings to a friendly unit: +1 shield per model, even above its maximum, until the end of the round.",
        },
      ],
    },
  ],
  // A third Phase Guard rather than the Sunray Tower: on the long board the Concord out-shot everyone
  // but lost on objective VP, and a structure can't hold an objective. v0.11: a second Grand Strider
  // (the best objective holder) rather than a fourth Lancer and Extra Guard (Concord ~39% -> ~45% against
  // the Militia). v0.12 balance pass: the Grand Strider stays ⚙7 (pricing.ts says 8). At ⚙8 this list
  // must lose a Lancer or a Phase Guard, and the Concord fell to ~35-40% in Assault.
  assaultExtras: [
    { profileId: "con-facet", upgrades: [] },
    { profileId: "con-facet", upgrades: [] },
    { profileId: "con-sylph", upgrades: [] },
    { profileId: "con-guard", upgrades: [] },
  ],
  // v0.11: a third Ray Lancer and Afterimage (Blink) on the Blink Dancers rather than the Beam Warden,
  // who did under 1 damage a game and recalled a unit about once in a hundred games.
  defaultList: [
    { profileId: "con-guard", upgrades: [] },
    { profileId: "con-guard", upgrades: [] },
    { profileId: "con-lancer", upgrades: [] },
    { profileId: "con-lancer", upgrades: [] },
    { profileId: "con-skiff", upgrades: [] },
    { profileId: "con-lancer", upgrades: [] },
    { profileId: "con-dancers", upgrades: ["afterimage"] },
  ],
  profiles: [
    {
      id: "con-guard",
      name: "Phase Guard",
      faction: "concord",
      cost: 5,
      // Supply 2 like the other squads (was 3), as pricing.ts computes it: three duellists held an
      // objective like a ten-bug brood.
      supply: 2,
      models: 3,
      move: 6,
      hp: 1,
      shield: 1,
      armor: 4,
      baseRadius: 0.6,
      keywords: ["infantry", "armoured"],
      nerve: 8,
      weapons: [melee("Glow Blade", 2, 3, { ap: 1, traits: ["rending"] }), ranged("Light Flick", 12, 1, 3, { traits: ["pistol", "blast"] })],
      abilities: ["blink", "riposte"],
      upgrades: [{ id: "third", name: "Extra Guard", cost: 1, addModels: 1, text: "+1 model." }],
      blurb: "Duellists who refuse to sweat.",
    },
    {
      id: "con-lancer",
      name: "Ray Lancer",
      faction: "concord",
      // Hand-set below pricing.ts's 4 (v0.12 balance pass): at ⚙4 the Skirmish starter (two Lancers)
      // was fine, but in Assault the Concord fell ~10 points with the same list, ~17 with one Lancer fewer.
      cost: 3,
      supply: 1,
      models: 1,
      move: 5,
      hp: 2,
      shield: 2,
      armor: 5,
      baseRadius: 0.55,
      keywords: ["infantry", "light"],
      evade: { target: 6, against: ["pointBlank"] },
      nerve: 8,
      weapons: [
        ranged("Sunlance", 24, 2, 3, { precision: 2, damage: 2, ap: 1, bonuses: [{ vs: "armoured", damage: 1 }], traits: ["rending"] }),
        melee("Disdainful Poke", 1, 5),
      ],
      abilities: ["overcharge", "phase-out"],
      upgrades: [{ id: "twin", name: "Twin Lancers", cost: 2, addModels: 1, text: "+1 model." }],
      blurb: "Shoots you from very far away, then sighs. Has never missed, and will mention it.",
    },
    {
      id: "con-skiff",
      name: "Shimmer Saucer",
      faction: "concord",
      // Hand-set below pricing.ts's 6 (v0.12 balance pass): at ⚙6 it and a Phase Guard don't fit the
      // first round's 10 resources in Skirmish, and the Concord fell ~15 points.
      cost: 5,
      supply: 3,
      models: 1,
      move: 10,
      hp: 4,
      shield: 3,
      armor: 5,
      baseRadius: 1.1,
      keywords: ["flying", "mech"],
      evade: { target: 6, against: ["ranged"] },
      nerve: 8,
      weapons: [ranged("Flicker Cannon", 18, 3, 4, { tracking: 1, ap: 1, bonuses: [{ vs: "flying", dice: 1 }], traits: ["blast"] })],
      abilities: ["refraction", "bubble-shield"],
      upgrades: [],
      blurb: "Glides about looking expensive. Is expensive.",
    },
    {
      id: "con-warden",
      name: "Beam Warden",
      faction: "concord",
      cost: 4,
      supply: 2,
      models: 1,
      move: 6,
      hp: 3,
      shield: 2,
      armor: 4,
      baseRadius: 0.75,
      keywords: ["infantry", "armoured"],
      nerve: 9,
      weapons: [ranged("Glow Orb", 12, 2, 4), melee("Warden Staff", 2, 4)],
      abilities: ["radiance", "recall"],
      upgrades: [],
      blurb: "Hums softly. Summons friends. Judges you.",
    },
    {
      id: "con-pylon",
      name: "Shield Pylon",
      faction: "concord",
      cost: 4,
      supply: 1,
      models: 1,
      move: 0,
      hp: 3,
      shield: 3,
      armor: 4,
      baseRadius: 0.9,
      keywords: ["structure"],
      weapons: [ranged("Pylon Beam", 18, 2, 4, { tracking: 1, ap: 1, traits: ["rending"] })],
      abilities: ["radiance"],
      upgrades: [],
      structure: { lifetime: "permanent", fieldDeploy: 6 },
      blurb: "A shield generator with a beam on top. It charges rent.",
    },
    {
      id: "con-ward",
      name: "Glimmer Dome",
      faction: "concord",
      cost: 0,
      supply: 0,
      models: 1,
      move: 0,
      hp: 2,
      shield: 2,
      armor: 5,
      baseRadius: 0.7,
      keywords: ["structure"],
      weapons: [],
      abilities: ["ward-aura"],
      upgrades: [],
      structure: { lifetime: "round", summonOnly: true },
      blurb: "A hex-cell dome that politely declines bullets.",
    },
    // ----- new units (crystal monster, jump flankers, light flyer, sniper structure) -----
    {
      id: "con-facet",
      name: "His Radiance, the Grand Strider",
      faction: "concord",
      cost: 7,
      supply: 4,
      models: 1,
      move: 5,
      hp: 7,
      shield: 3,
      armor: 3,
      baseRadius: 1.35,
      keywords: ["armoured", "heavy", "monster", "fearless"],
      weapons: [
        ranged("Prism Cannon", 24, 2, 3, { precision: 1, damage: 2, ap: 2, bonuses: [{ vs: "armoured", damage: 1 }], traits: ["heavy"] }),
        melee("Gem Fist", 3, 3, { damage: 2, ap: 1 }),
      ],
      abilities: ["refraction", "provoke"],
      impact: { dice: 1, hit: 3, damage: 2, ap: 1 },
      upgrades: [{ id: "lustre", name: "Lustre Core", cost: 1, addAbilities: ["radiance"], text: "Gains Radiance." }],
      blurb: "His Radiance, on three gleaming legs. Believes he is the main character. Is, unfortunately, correct.",
    },
    {
      id: "con-dancers",
      name: "Blink Dancers",
      faction: "concord",
      cost: 5,
      supply: 2,
      models: 3,
      move: 9,
      hp: 1,
      shield: 1,
      armor: 4,
      baseRadius: 0.55,
      keywords: ["infantry", "light", "jump"],
      evade: { target: 4, against: ["pointBlank", "melee"] },
      nerve: 8,
      weapons: [
        ranged("Glint Darts", 12, 2, 3, { tracking: 1, traits: ["pistol"] }),
        melee("Flourish", 2, 3, { ap: 1, traits: ["rending"] }),
      ],
      abilities: ["twirl-away", "pirouette"],
      upgrades: [
        { id: "encore", name: "Encore", cost: 1, addModels: 1, text: "+1 model." },
        { id: "afterimage", name: "Afterimage", cost: 1, addAbilities: ["blink"], text: "Gains Blink." },
      ],
      blurb: "Pirouette onto the roof, stab you, curtsey. Applause is expected.",
    },
    {
      id: "con-sylph",
      name: "Jetwing Scouts",
      faction: "concord",
      cost: 6,
      supply: 2,
      models: 2,
      move: 14,
      hp: 2,
      shield: 1,
      armor: 5,
      baseRadius: 0.7,
      keywords: ["flying", "light"],
      evade: { target: 5, against: ["ranged", "blast"] },
      nerve: 8,
      weapons: [ranged("Needle Glare", 16, 2, 3, { tracking: 1, ap: 1, bonuses: [{ vs: "flying", dice: 1 }], traits: ["rending"] })],
      abilities: ["spotlight", "overcharge"],
      upgrades: [{ id: "plumage", name: "Mirror Plumage", cost: 1, addAbilities: ["refraction"], text: "Gains Refraction." }],
      blurb: "Jet packs, sharp opinions. Only land for compliments.",
    },
    {
      id: "con-obelisk",
      name: "Sunray Tower",
      faction: "concord",
      cost: 5,
      supply: 1,
      models: 1,
      move: 0,
      hp: 3,
      shield: 3,
      armor: 4,
      baseRadius: 0.9,
      keywords: ["structure"],
      weapons: [ranged("Judgement Ray", 32, 2, 3, { precision: 1, tracking: 1, damage: 2, ap: 2, bonuses: [{ vs: "heavy", damage: 1 }], traits: ["rending"] })],
      abilities: ["overcharge"],
      upgrades: [],
      structure: { lifetime: "permanent", fieldDeploy: 6 },
      blurb: "A monument to good taste that fires on anyone who lacks it. So: everyone.",
    },
  ],
};

/** All factions: the three built-ins plus any registered custom ones. Treat as read-only. */
export const FACTIONS: Record<FactionId, Faction> = { militia, swarm, concord };
export const BUILT_IN_FACTION_IDS = ["militia", "swarm", "concord"] as const;
export const isBuiltInFaction = (id: FactionId): boolean => (BUILT_IN_FACTION_IDS as readonly string[]).includes(id);

export function factionOf(id: FactionId): Faction {
  const f = FACTIONS[id];
  if (!f) throw new Error(`Unknown faction: ${id}`);
  return f;
}

export const PROFILES: Record<string, UnitProfile> = {};
export const SUPPORTS: Record<string, SupportDef> = {};

function rebuildIndexes(clearCache = true): void {
  for (const k of Object.keys(PROFILES)) delete PROFILES[k];
  for (const k of Object.keys(SUPPORTS)) delete SUPPORTS[k];
  for (const f of Object.values(FACTIONS)) {
    for (const p of f.profiles) PROFILES[p.id] = p;
    for (const sp of f.supports) SUPPORTS[sp.id] = sp;
  }
  // profile.ts imports this module, so its cache doesn't exist yet during the first build.
  if (clearCache) clearProfileCache();
}
rebuildIndexes(false);

/**
 * Replace the registered custom factions (built-ins are never touched). Call before creating a game.
 * Custom factions must have ids starting with "custom-" and unique profile/support ids.
 */
export function registerCustomFactions(custom: Faction[]): void {
  for (const id of Object.keys(FACTIONS)) if (!isBuiltInFaction(id)) delete FACTIONS[id];
  for (const f of custom) {
    if (isBuiltInFaction(f.id)) continue;
    FACTIONS[f.id] = { ...f, custom: true };
  }
  rebuildIndexes();
}

export function supportOf(id: string): SupportDef {
  const sp = SUPPORTS[id];
  if (!sp) throw new Error(`Unknown support: ${id}`);
  return sp;
}

export const supportsCost = (ids: string[]): number => ids.reduce((sum, id) => sum + (SUPPORTS[id]?.fizz ?? 0), 0);

/** Built-in starter supports for a faction in a mode. */
export function defaultSupportsFor(faction: FactionId, mode: ModeId): string[] {
  const f = factionOf(faction);
  if (mode !== "assault") return [...f.defaultSupports];
  return f.assaultStarter ? [...f.assaultStarter] : [...f.defaultSupports, ...f.assaultSupports];
}

export function baseProfile(profileId: string): UnitProfile {
  const p = PROFILES[profileId];
  if (!p) throw new Error(`Unknown unit profile: ${profileId}`);
  return p;
}

export function entryCost(e: ListEntry): number {
  const p = baseProfile(e.profileId);
  return p.cost + e.upgrades.reduce((s, id) => s + (p.upgrades.find((u) => u.id === id)?.cost ?? 0), 0);
}

export const listCost = (list: ListEntry[]): number => list.reduce((s, e) => s + entryCost(e), 0);

/** The built-in starter roster for a faction in a game mode. */
export function defaultListFor(faction: FactionId, mode: ModeId): ListEntry[] {
  const f = factionOf(faction);
  return structuredClone(mode === "assault" ? [...f.defaultList, ...f.assaultExtras] : f.defaultList);
}
