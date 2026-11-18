// The canonical lore of SCDMG: the world, its central conflict, the named places and characters, each
// built-in faction's story, and a list of battle seeds that chain the world's places, maps and missions.
// Pure data (no DOM), so the lore pages, the intros and a campaign can all build on it. Every unit,
// support, map and mission it names is checked against the game data in tests/lore.test.ts.
//
// House style: dry and funny, a cartoon sci-fi comedy with heart. Characters are "they" (or "it" for
// machines and big bugs) unless the game's own text already gives them a pronoun (Mother Mandible "she",
// His Radiance "he", Marshal Haybright "she", Flight Sergeant Lew "he").

import type { FactionId } from "../types";

export type LoreFactionId = "militia" | "swarm" | "concord";
export const LORE_FACTION_IDS: readonly LoreFactionId[] = ["militia", "swarm", "concord"];

export type Pronoun = "he" | "she" | "they" | "it";

export interface LoreCharacter {
  id: string;
  name: string;
  /** Short role line, e.g. "Marshal of the Dustline Muster". */
  title: string;
  faction: LoreFactionId | null;
  pronoun: Pronoun;
  /** The unit profile this character fights as on the table, if any. */
  unitId?: string;
  /** The support card this character runs, if any. */
  supportId?: string;
  /** Where they are usually found (a place id). */
  placeId?: string;
  bio: string;
  quote?: string;
}

export type PlaceKind = "town" | "farm" | "battlefield" | "lair" | "orbit" | "landmark";

export interface LorePlace {
  id: string;
  name: string;
  kind: PlaceKind;
  /** The built-in battlefield (map id) set here, if there is one. */
  mapId?: string;
  /** Who holds it when the story starts (null: nobody, or everybody is arguing about it). */
  heldBy: LoreFactionId | null;
  blurb: string;
}

export interface LoreNote {
  /** A unit profile id (in `units`) or a support id (in `supports`). */
  id: string;
  note: string;
}

export interface FactionLore {
  factionId: LoreFactionId;
  /** Exactly the faction's name in the game data. */
  name: string;
  /** Who they are, in a few words. */
  epithet: string;
  tagline: string;
  /** The faction leader (a character id). */
  leaderId: string;
  /** Where the faction calls home (a place id). */
  homeId: string;
  /** What they want from the war. */
  goal: string;
  /** What they lose if they lose. */
  stakes: string;
  /** The faction's story, a few paragraphs. */
  story: string[];
  /** The leader's rallying line. */
  quote: string;
  /** Lore for every unit of the faction, by profile id. */
  units: LoreNote[];
  /** Lore for every support card of the faction, by support id. */
  supports: LoreNote[];
  /** Captions for the faction's intro animation, one per scene, in order. */
  intro: string[];
}

export interface LoreEra {
  /** When, in the valley's own terms ("Generations ago", "The Harvest of '09"). */
  when: string;
  title: string;
  text: string;
}

/**
 * A battle the story suggests: a place, the map and mission to fight it on, and who fights. For role
 * missions `sides[0]` plays side A and `sides[1]` side B. A campaign can use these as written, or as
 * a starting point.
 */
export interface LoreBattle {
  id: string;
  /** 1: the muster, 2: the war spreads, 3: the fight for the Wellspring. */
  act: 1 | 2 | 3;
  title: string;
  placeId: string;
  mapId: string;
  missionId: string;
  sides: [LoreFactionId, LoreFactionId];
  hook: string;
}

export interface WorldLore {
  /** The setting's name. */
  name: string;
  summary: string;
  /** The thing everybody wants. */
  prize: { name: string; text: string };
  /** The war the game is about. */
  conflict: { name: string; text: string };
  history: LoreEra[];
  /** Captions for the game's intro animation, one per scene, in order. */
  intro: string[];
}

// ---------------------------------------------------------------- the world

export const WORLD: WorldLore = {
  name: "The Dustline",
  summary:
    "Out where the paved road gives up and the corn does not, there is a long, dry farming and mining valley called the Dustline. A fizzing creek runs down the middle of it, the soil is suspiciously good, the pumpkins are enormous, and the pies are the best for three hundred miles. Nobody asks too many questions about any of this, because the answer is under the ford.",
  prize: {
    name: "The Fizz and the Wellspring",
    text: "Under the valley runs the Fizz: bubbling, faintly glowing mineral water that rises through the Fizzwater creek. It makes crops grow like they have somewhere to be, and it keeps forty-year-old engines running on fumes and spite. The Muster pours it in its war machines. The Skitterswarm sleeps curled around it for the warmth. The Lumen Concord refine it into light. Its source, the Wellspring, lies deep under Fizzwater Ford, and whoever holds the Wellspring holds the Dustline. (The fizz you spend on support cards is a little of the same stuff.)",
  },
  conflict: {
    name: "The Dustline War",
    text: "This season, the valley is under attack from two directions. From below, the Skitterswarm is boiling up through the fields, every bug of it answering to Mother Mandible, who means to lay the Great Clutch in the warmth of the Wellspring. From above, the Lumen Concord have parked the Star Lens in orbit and begun landscaping the valley into a tasteful pleasure garden for His Radiance, with the Wellspring as its fountain. In between stands the Dustline Muster: every family's hands, drafted, drilled and bolted into riveted armour. Three sides, one valley, and nobody is leaving.",
  },
  history: [
    {
      when: "Generations ago",
      title: "The Settling",
      text: "Wagons of settlers followed the creek into the valley, noticed the water fizzed, decided that was probably fine, and stayed. They built windpumps, a Grange Hall and a very long fence, and started arguing about whose pie was best. The argument continues.",
    },
    {
      when: "The boom years",
      title: "The Fizz Boom",
      text: "Somebody found that Fizz ran a tractor better than diesel, and the valley boomed. The Old Refinery bottled it, the mines went deep after the richer seams, the Long Ridge Highway hauled it out, and ore trains rattled past Gutterbend. Then the shallow seam went flat, the refinery closed, a train came off the rails and stayed off, and everyone went back to farming, with a great deal of interesting scrap and a few shafts that went deeper than anybody liked to talk about.",
    },
    {
      when: "Some years back",
      title: "Something Below",
      text: "The deep shafts were capped, and the miners stopped talking about the clicking. The wells ran warm. Dogs wouldn't go near Badger Knob. Down in the dark around the Wellspring, something very old and very hungry had been woken by the drilling, and it was laying eggs.",
    },
    {
      when: "The Harvest of '09",
      title: "Up Through the Corn",
      text: "The night the first Skitterlings came up through the corn. The farmers held them at Dustbowl Crossing with shovels, a combine and a great deal of shouting. That winter the Grange Hall raised the Dustline Muster: every family sends its hands, the mining work-suits went to the Scrapyard to be riveted into armour, and squads drilled on the Grange Hall green. Big Bertha got legs and plating. Corporal Squinter has not blinked since.",
    },
    {
      when: "Last autumn",
      title: "The Glow in the Dark",
      text: "From orbit, the Fizz shows up as a soft glow on the night side of the planet. The Lumen Concord's pleasure yacht Velvet Comet came down to admire it, misjudged the landing and planted itself in a debris field. Its passengers walked away unhurt and deeply offended, and sent a message home: we have found something lovely, and it is surrounded by farmers.",
    },
    {
      when: "This season",
      title: "The Dustline War",
      text: "The Star Lens has moved into orbit above the valley. Lady Prismwick has replaced the Haybright bean farm with a croquet lawn. The bean rows that are left have started to tremble, and the clicking is back. Marshal Haybright has called the full Muster to the Grange Hall, and attendance is compulsory.",
    },
  ],
  intro: [
    "Out where the paved road gives up, there is a farming valley called the Dustline.",
    "The creek fizzes, the pumpkins are enormous, and deep under the ford, the Wellspring glows.",
    "This season, something came up from below...",
    "...something came down from above...",
    "...and the Muster did not budge an inch.",
    "Three sides. One valley. Roll the dice.",
  ],
};

// ---------------------------------------------------------------- places

export const PLACES: LorePlace[] = [
  {
    id: "grange-hall",
    name: "The Grange Hall",
    kind: "town",
    heldBy: "militia",
    blurb:
      "The valley's community hall: dances on Saturdays, pie judging in autumn, and now the headquarters of the Dustline Muster. The map table stands where the buffet used to, the field radio sits next to the urn, and the squads drill on the green outside.",
  },
  {
    id: "haybright-farm",
    name: "Haybright Farm",
    kind: "farm",
    heldBy: "militia",
    blurb: "The Marshal's family farm, and the barn Big Bertha was refitted in. Half of it is still beans. The other half is now Lady Prismwick's Lawn.",
  },
  {
    id: "dustbowl-crossing",
    name: "Dustbowl Crossing",
    kind: "battlefield",
    mapId: "dustbowl",
    heldBy: "militia",
    blurb:
      "The valley's crossroads, where three fenced lanes meet under the old silo. Whoever holds the silo deck can see the whole middle of the valley, which is why everyone keeps fighting over it. The Harvest of '09 was won here.",
  },
  {
    id: "mesa-ridge",
    name: "Mesa Ridge",
    kind: "battlefield",
    mapId: "mesa",
    heldBy: null,
    blurb:
      "The canyon maze on the valley's western rim. Swarm tunnels come up in the Narrows, Concord scouts like the view from the twin mesas, and Corporal Squinter has been up there since before either of them arrived.",
  },
  {
    id: "old-refinery",
    name: "The Old Refinery",
    kind: "battlefield",
    mapId: "refinery",
    heldBy: null,
    blurb:
      "Where the Fizz was bottled in the boom years. The tanks are empty, mostly, and the pipes still hum when the Wellspring stirs. The swarm likes the warm pipes. The Concord want to knock it down and put up something tasteful.",
  },
  {
    id: "long-ridge-highway",
    name: "Long Ridge Highway",
    kind: "battlefield",
    mapId: "highway",
    heldBy: "militia",
    blurb:
      "The only paved road into the valley, raised on an embankment and broken in the middle since the boom years. The Muster's supply convoys use it. So does the swarm, from underneath.",
  },
  {
    id: "scrapyard-sprawl",
    name: "Scrapyard Sprawl",
    kind: "battlefield",
    mapId: "sprawl",
    heldBy: "militia",
    blurb:
      "Forty years of broken tractors and mine carts stacked into city blocks around the old smelter. Every suit of Muster armour was riveted here, and every machine started life here, and most of them come back eventually, in pieces.",
  },
  {
    id: "rattlevane-junction",
    name: "Rattlevane Junction",
    kind: "battlefield",
    mapId: "rattlevane",
    heldBy: "militia",
    blurb:
      "A walled windpump yard where the valley's signal towers meet, crowned by an old weather vane. The Muster's radio relays run through here: lose the Junction and the Grange Hall goes deaf.",
  },
  {
    id: "fizzwater-ford",
    name: "Fizzwater Ford",
    kind: "battlefield",
    mapId: "fizzwater",
    heldBy: null,
    blurb:
      "The creek runs deep and fizzing here, between two old mills, with a bridge at each end and a slow ford in the middle. Beneath it lies the Wellspring. Every road in the valley leads here eventually.",
  },
  {
    id: "wellspring",
    name: "The Wellspring",
    kind: "landmark",
    heldBy: null,
    blurb:
      "The source of the Fizz, deep under Fizzwater Ford: a cavern of glowing, bubbling water that nobody has seen and everybody wants. The Muster wants it left alone, Mother Mandible wants to lay her eggs in it, and His Radiance wants it in a fountain.",
  },
  {
    id: "prismwick-lawn",
    name: "Lady Prismwick's Lawn",
    kind: "battlefield",
    mapId: "prismwick",
    heldBy: "concord",
    blurb:
      "Until recently, the bean fields of Haybright Farm. Now a croquet lawn boxed in by tall hedges and topiary, with glass gazebos at each end. The Concord's first foothold in the valley, and the Muster's first grudge.",
  },
  {
    id: "brinejaw-flats",
    name: "Brinejaw Flats",
    kind: "battlefield",
    mapId: "brinejaw",
    heldBy: "concord",
    blurb:
      "Bone-dry salt flats at the valley's southern end, where the creek used to run before it changed its mind. The Concord land their saucers here: there is nothing to hide behind but junk, and nothing to dig through but salt.",
  },
  {
    id: "gutterbend",
    name: "Gutterbend",
    kind: "battlefield",
    mapId: "gutterbend",
    heldBy: null,
    blurb:
      "An ore train came off the rails at Gutterbend in the boom years and never got back on. The cars still hold Fizz ore, and the ore still glows, so somebody is always fighting over it.",
  },
  {
    id: "grubstake-redoubt",
    name: "Grubstake Redoubt",
    kind: "battlefield",
    mapId: "grubstake",
    heldBy: "militia",
    blurb:
      "A prospectors' dugout on a raised bank, built in the boom years to guard a claim stake and now a Muster strongpoint. Whoever is inside tends to stay inside, and to shout at whoever is outside.",
  },
  {
    id: "gemhaul-road",
    name: "The Gemhaul Road",
    kind: "battlefield",
    mapId: "gemhaul",
    heldBy: "concord",
    blurb:
      "The hill road where Concord crystal caravans haul refined Fizz up to the landing fields. The caravans are slow and shiny, which makes the road popular with raiders of every kind.",
  },
  {
    id: "velvet-comet",
    name: "Wreck of the Velvet Comet",
    kind: "battlefield",
    mapId: "velvetcomet",
    heldBy: null,
    blurb:
      "The Concord pleasure yacht that came to admire the valley and crashed into it instead. Muster salvage crews have been stripping it for armour plate ever since. Its owners would like it back, or at least would like the salvagers to stop sitting in the hot tub.",
  },
  {
    id: "brood-hollow",
    name: "The Brood Hollow",
    kind: "lair",
    heldBy: "swarm",
    blurb:
      "A cavern under Badger Knob, warm from the Wellspring below and packed wall to wall with eggs that glow faintly green. Mother Mandible broods at the heart of it, and the Undertunnels spread out from here under the whole valley.",
  },
  {
    id: "star-lens",
    name: "The Star Lens",
    kind: "orbit",
    heldBy: "concord",
    blurb:
      "A ring of polished crystal the size of a county, parked in orbit over the valley like a monocle. It focuses sunlight into Sunbeams and the Concord's attention onto the Dustline. His Radiance's flagship, the Bright Palace, hangs beside it.",
  },
];

// ---------------------------------------------------------------- characters

export const CHARACTERS: LoreCharacter[] = [
  {
    id: "aunt-dot",
    name: "Marshal Dot Haybright",
    title: "Marshal of the Dustline Muster",
    faction: "militia",
    pronoun: "she",
    supportId: "mil-radio",
    placeId: "grange-hall",
    bio: "Dot Haybright chaired the Grange Hall committee until the night of '09, when she switched on the radio and started giving orders. That winter the Grange made it official: she raised the Muster, wrote the draft roll in her own ledger, and has commanded it from the map table ever since. She knows every family, every squad number and every grudge in the valley. The troops still call her Aunt Dot, never to her face. It was her bean farm Lady Prismwick turned into a lawn. She has not forgotten.",
    quote: "This is Grange Hall Command. Every section, to the Crossing. Rifles loaded, plates riveted, and nobody falls back without my say-so.",
  },
  {
    id: "lucky-lew",
    name: "Flight Sergeant Lew",
    title: "Pilot of the Rust Bucket Drop-Ship, ranking flyer of the Forward Airstrip",
    faction: "militia",
    pronoun: "he",
    supportId: "mil-dropship",
    placeId: "haybright-farm",
    bio: "Lew has flown the Rust Bucket since the boom years, when it hauled Fizz ore. The Muster gave him stripes, a logbook and a squadron of crop dusters, and everyone still calls him Lucky. He swears he has done every landing before. Nobody has checked, and the Rust Bucket's landing light is a lantern on a hook, so nobody could.",
    quote: "Hold on to something. No, not that.",
  },
  {
    id: "squinter",
    name: 'Corporal "Squinter"',
    title: "Lead marksman of the Ridgeline Marksmen",
    faction: "militia",
    pronoun: "they",
    unitId: "mil-squinter",
    placeId: "mesa-ridge",
    bio: "Nobody remembers the Squinter's real name, including the Squinter, and the Muster's draft roll just says 'Squinter (Ridge)'. They have watched the valley from Mesa Ridge since the Harvest of '09, and now train the corps' marksmen up there: long rifle, a ghillie of dry grass, a flask of cold coffee, and no blinking. They claim the not-blinking is a medical condition.",
    quote: "Saw you coming last Tuesday.",
  },
  {
    id: "big-bertha",
    name: "Big Bertha",
    title: "The Haybright combine, refitted as a walker-tank",
    faction: "militia",
    pronoun: "it",
    unitId: "mil-bertha",
    placeId: "haybright-farm",
    bio: "The family combine harvester, given legs after the Harvest of '09, then plate armour, a cannon and a crew of three when the Muster took it on strength. It has a hull number now, painted over the old farm name. It still brings in the wheat in the off-season, slowly and carefully, with the cannon pointed politely away.",
  },
  {
    id: "broodmother",
    name: "Mother Mandible",
    title: "The Broodmother",
    faction: "swarm",
    pronoun: "she",
    unitId: "swarm-mother",
    placeId: "brood-hollow",
    bio: "Mother Mandible slept curled around the Wellspring for longer than the valley has had a name, until the boom years' drills tickled her awake. She is mostly abdomen and entirely in charge: every bug in the Skitterswarm hatched from one of her eggs, and every one of them hears her clicking through the ground. She doesn't speak human. What she does say, the Muster's listening posts write down as best they can, and none of it is reassuring.",
    quote: "*click-click* The ground is warm. The ground is ours.",
  },
  {
    id: "old-grinder",
    name: "Old Grinder",
    title: "The Deep Borer, oldest of the brood",
    faction: "swarm",
    pronoun: "it",
    unitId: "swarm-borer",
    placeId: "brood-hollow",
    bio: "The first of Mother Mandible's brood to wake, and the biggest: a tunnelling bug as long as an ore train. Old Grinder dug the Undertunnels, and most of the boom years' 'subsidence'. When the ground in the valley sags overnight, the Muster's surveyors write down the date and go and stand somewhere else.",
  },
  {
    id: "grand-strider",
    name: "His Radiance, the Grand Strider",
    title: "Supreme Luminary of the Lumen Concord",
    faction: "concord",
    pronoun: "he",
    unitId: "con-facet",
    placeId: "star-lens",
    bio: "His Radiance has toured a thousand worlds on three gleaming legs and found nearly all of them disappointing. The Dustline is the first in centuries to glow back at him, and he intends to have it: terraced, hedged, lit from beneath by the Wellspring, and set at the centre of his collection. He believes he is the main character. He is, unfortunately, correct.",
    quote: "Do not be alarmed. You are merely being improved.",
  },
  {
    id: "lady-prismwick",
    name: "Lady Prismwick",
    title: "Keeper of Lawns, chair of the Court of Disdain",
    faction: "concord",
    pronoun: "they",
    supportId: "con-court",
    placeId: "prismwick-lawn",
    bio: "His Radiance's landscape architect and critic-in-chief. Lady Prismwick's first act on landing was to replace a working bean farm with a croquet lawn, two glass gazebos and a hedge in the shape of His Radiance. The Muster wants the farm back. Lady Prismwick wants the Muster to stop standing on the grass, and the bugs to stop coming up through it.",
    quote: "Two out of ten. The beans were derivative.",
  },
];

// ---------------------------------------------------------------- factions

export const LORE_FACTIONS: Record<LoreFactionId, FactionLore> = {
  militia: {
    factionId: "militia",
    name: "Dustline Militia",
    epithet: "The frontier, drafted",
    tagline: "Rivets, rifles and a very long memory.",
    leaderId: "aunt-dot",
    homeId: "grange-hall",
    goal: "Hold the valley, bring the harvest in, get Haybright Farm back from the Concord, push the swarm back underground, and keep the Wellspring flowing for the people who were here first.",
    stakes:
      "Everything they have: the farms, the mines, the Grange Hall, the Harvest Fair and three generations of pie recipes. If the Muster breaks, the Dustline becomes either a lawn or a nest.",
    story: [
      "The Dustline Militia used to be every family in the valley, a radio and a scrapyard. After the Harvest of '09 that stopped being enough, so the Grange Hall raised the Dustline Muster. Every family sends its hands. Farmhands, ranch kids and mine crews were drafted, drilled on the Grange Hall green and given squad numbers, and their old mining and farm work-suits went to the Scrapyard Sprawl to come back riveted into armour. The Rivet Grunts hold the line, the Patch Medics keep it standing, and the Old Guard Veterans, recalled from the last two wars, show everyone how a trench is dug.",
      "Their war machines are farm and mine kit, refitted and numbered. Big Bertha is the Haybright combine on legs with plate armour and a cannon. The Sky Rustlers are crop dusters refitted for ground attack. The Haymaker Bomber drops mine buckets of blasting powder, and the Rust Bucket Drop-Ship is older than most of its passengers. Flight Sergeant Lew lands it wherever the Marshal points.",
      "They are not fast, and they do not like getting close. But dig a section in behind a fence with a clear field of fire and it will hold until relieved, and it has been told it will not be relieved.",
    ],
    quote: "This is Grange Hall Command. Every section, to the Crossing. Rifles loaded, plates riveted, and nobody falls back without my say-so.",
    units: [
      { id: "mil-grunts", note: "Farmhands, ranch kids and mine crews, drafted by family, drilled by section and bolted into work-suits riveted into armour. They dig in first and complain strictly through the proper channels." },
      { id: "mil-medic", note: "The valley's vets and first-aiders, now the Muster's medical corps. They patch up troopers, armour plate and Flight Sergeant Lew, in roughly that order of difficulty." },
      { id: "mil-bertha", note: "The Haybright combine, refitted at the Scrapyard as a walker-tank with plate armour, a crew of three and a cannon where the grain chute used to be. Everyone in the valley has had a turn driving it. Nobody has had a turn parking it." },
      { id: "mil-rustler", note: "Crop dusters pulled out of retirement, given squadron numbers and a chain gun. Their pilots spot for the gunline, fly in formation, and still argue with crows." },
      { id: "mil-turret", note: "Somebody has to sit in it. The duty roster says who. They always swap, then regret it, then refuse to leave." },
      { id: "mil-junk", note: "Whatever the Motor Pool can throw across the road in a hurry. The goat is not officially part of the barricade. The goat disagrees." },
      { id: "mil-squinter", note: "Corporal Squinter's marksmen, trained on Mesa Ridge with long rifles and cold coffee. Nothing crosses the valley without them noticing, and logging it." },
      { id: "mil-riders", note: "Dirt-bike dispatch riders who carry the Marshal's orders when the radio is down, and buckshot when it isn't." },
      { id: "mil-grannies", note: "Recalled veterans of the last two wars, led by Sergeant Mabel, in the heaviest plate the Scrapyard could rivet. Rock salt for the bugs, pick hafts for everything else." },
      { id: "mil-bomber", note: "A cargo biplane from the Forward Airstrip that delivers blasting powder by the mine bucket, from height, with feeling." },
      { id: "mil-mortar", note: "A length of mine drainpipe, a sandbagged pit and a crate of blasting charges. The crew learned their trade blasting rock, and the rock never complained either." },
    ],
    supports: [
      { id: "mil-radio", note: "The Marshal's map table and microphone. Everything the Muster does starts with a crackle and a 'Now listen here.'" },
      { id: "mil-depot", note: "The old tractor depot, now the Muster's motor pool, armoury, field hospital and barricade supply, with a duty roster on the door." },
      { id: "mil-vane", note: "Two old miners who read the valley's wind like a map, with a cart of smoke pots and the weather vane at Rattlevane Junction to check it by." },
      { id: "mil-airstrip", note: "A graded field behind Haybright Farm: home of the Haymaker Bomber, the crop-duster squadron, a windsock and Flight Sergeant Lew's confidence." },
      { id: "mil-dropship", note: "A boom-years ore hauler with troop benches bolted in, which Flight Sergeant Lew keeps flying on Fizz, prayer and rivets." },
      { id: "mil-wagon", note: "Rivets, rifle rounds and sandbags, signed out by a quartermaster who counts every one of them twice." },
    ],
    intro: [
      "When trouble comes up the valley, the Marshal calls the Muster roll.",
      "Every family sends its hands: squads fall in, riveted into their armour.",
      "Big Bertha strides out of the motor pool.",
      "The crop dusters fly over in formation.",
      "Dustline Militia: rivets, rifles and a very long memory.",
    ],
  },
  swarm: {
    factionId: "swarm",
    name: "The Skitterswarm",
    epithet: "The ground is hungry",
    tagline: "Every one of them is hers.",
    leaderId: "broodmother",
    homeId: "brood-hollow",
    goal: "Reach the Wellspring and lay the Great Clutch in its warmth, so that the whole valley hatches: every field a nursery, every barn a nest, and every bug in it one of Mother Mandible's.",
    stakes:
      "The brood itself. The Wellspring's warmth is what keeps the eggs alive. If the Concord bottle it for their lamps, or the Muster caps it for their engines, the Brood Hollow goes cold and the Great Clutch never hatches.",
    story: [
      "The Skitterswarm was here first. Long before the wagons came, Mother Mandible slept curled around the Wellspring in the warm dark under the valley, with her brood asleep around her. Then the boom years came, and the mines went deep after the richer seams, and the drills went a little too deep. The clicking started under Badger Knob. The wells ran warm. In the Harvest of '09 the first Skitterlings came up through the corn.",
      "Now the Brood Hollow is full to the ceiling with glowing eggs, and Mother Mandible wants more room. Every bug in the swarm hatched from one of her eggs and hears her clicking through the ground: Skitterlings by the hundred, Acid Spitters, Shellback Brood, Trapjaw Lurkers waiting under rocks, Stinger Swarms overhead, and Old Grinder, the Deep Borer, who dug the Undertunnels in the first place.",
      "The swarm doesn't shoot much and doesn't wear much armour, but it doesn't need to. Acid softens whatever is in the way, the brood pours in after it, and whatever the farmers squash, Mother Mandible lays again. Where she goes, the swarm stays thick. Where she falls, it comes apart.",
    ],
    quote: "*click-click* The ground is warm. The ground is ours.",
    units: [
      { id: "swarm-skitterlings", note: "The first of the brood to come up through the corn in '09, and still the most of it. Cat-sized, all legs, and always hungry. Some of them dig, and the Muster's sentries have learned to watch their feet." },
      { id: "swarm-spitters", note: "They spit acid that eats rivets. The Muster's armourers keep a bucket of baking soda by every repair bench, and it is never enough." },
      { id: "swarm-shellbacks", note: "Beetles with shells like upturned bathtubs, bred to walk into the guns. The Muster's rifles bounce off, and their mandibles don't." },
      { id: "swarm-lurker", note: "It digs a hole, pulls the lid over, and waits. It is very good at waiting, and the Muster's maps are dotted with rocks marked 'probably a rock'." },
      { id: "swarm-mother", note: "Mother Mandible herself, out of the Brood Hollow and on the march. While she lives, the brood around her keeps hatching back, however much of it the Muster shoots." },
      { id: "swarm-borer", note: "Old Grinder, or one of its children: tunnelling bugs as long as an ore train. When the ground sags under a Muster trench, it's already too late to move the trench." },
      { id: "swarm-stingers", note: "A buzzing cloud of acid-tailed flyers that sting the front of the Muster's line, so that the swarm on the ground finds it softer." },
      { id: "swarm-bombard", note: "A bloated beetle with a belly full of acid and a cough you can hear across the valley. The farmers named it. The farmers were not being kind." },
      { id: "swarm-tenders", note: "Fussy nursemaids with backs full of eggs. They patch the wounded with spit and lay replacements for the ones that didn't make it." },
      { id: "swarm-geyser", note: "Where the acid pockets come close to the surface, the brood lets them crust over and waits. The Muster's surveyors mark them on the map with a skull. The swarm marks them with nothing at all." },
      { id: "swarm-spire", note: "A chimney of chewed dirt and spit over a tunnel shaft, warm to the touch. Wherever one goes up, the brood comes up behind it." },
      { id: "swarm-eggs", note: "Laid fresh in the middle of a battle, and very quick to hatch. The Muster's standing order is: do not poke the eggs." },
      { id: "swarm-mouth", note: "Old Grinder's work: a fresh shaft up from the Undertunnels, open just long enough for something to climb out." },
    ],
    supports: [
      { id: "swarm-hum", note: "Mother Mandible's clicking, carried through the ground to every bug in the valley. When it rises, the swarm runs." },
      { id: "swarm-chamber", note: "The Brood Hollow's egg chambers, warm and damp and humming. Nobody has ever counted the eggs. Nobody could." },
      { id: "swarm-tunnels", note: "Miles of tunnels under the fields, dug by Old Grinder. The Muster's surveyors call it subsidence. It is not subsidence." },
      { id: "swarm-pheromones", note: "A smell like old pennies and wet leaves that drifts up from the tunnels before an attack. Troopers who've smelled it once check their sleeves for the rest of their lives." },
      { id: "swarm-glands", note: "Sacs of acid the size of water tanks, buried under the brood chambers. They gurgle at night, and the wells near them taste of batteries." },
    ],
    intro: [
      "Under Badger Knob, the ground trembles.",
      "In the Brood Hollow, a thousand eggs glow in the warm dark.",
      "Mother Mandible is awake. Every one of them is hers.",
      "And every one of them is coming up.",
      "The Skitterswarm: the ground is hungry.",
    ],
  },
  concord: {
    factionId: "concord",
    name: "Lumen Concord",
    epithet: "Invaders from beyond the Star Lens",
    tagline: "Few, bright and insufferable.",
    leaderId: "grand-strider",
    homeId: "star-lens",
    goal: "Turn the Dustline into a pleasure garden worthy of His Radiance: terraced, hedged, lit from beneath by the Wellspring, and free of farmers, insects and anything beige.",
    stakes:
      "Their saucers, gates and shields run on refined light, and the Wellspring is the brightest source they have found in a thousand worlds. More importantly, losing a war to a valley of farmers would be embarrassing, and losing one to bugs would be worse. The Concord would rather do almost anything than be embarrassed.",
    story: [
      "The Lumen Concord are a very old, very bright civilisation that has toured the stars for so long it has run out of things to admire. When the Star Lens picked up a soft glow on the night side of an unremarkable planet, His Radiance sent the pleasure yacht Velvet Comet to take a look. It crashed. Its passengers walked away unhurt and deeply offended, and sent word home: we have found something lovely, and it is surrounded by farmers.",
      "So His Radiance, the Grand Strider, came in person. The Star Lens now hangs over the valley like a monocle, saucers glide down through Light Gates, and Lady Prismwick has already replaced Haybright Farm's bean fields with a croquet lawn. The Concord are few, and every one of them is a specialist: a duellist, a sniper, a dancer or a critic. They hit what they aim at, they arrive shielded, and they never hurry.",
      "They do not consider this an invasion. They consider it a renovation. The locals are welcome to stay, provided they keep off the lawn, and the bugs are not welcome at all.",
    ],
    quote: "Do not be alarmed. You are merely being improved.",
    units: [
      { id: "con-guard", note: "His Radiance's honour guard: duellists who have never broken a sweat, or a nail." },
      { id: "con-lancer", note: "The Concord's snipers. They score every shot out of ten, and have never given themselves less than nine." },
      { id: "con-skiff", note: "The Concord runabout: a polished saucer with a fishbowl canopy, a flicker cannon and heated seats." },
      { id: "con-warden", note: "Keepers of the Star Lens who keep the light flowing, and keep a list of everyone who has stood in it." },
      { id: "con-pylon", note: "A hex-cell shield generator that the Concord plant like a lawn ornament." },
      { id: "con-ward", note: "Thrown up by the Mirror Spire whenever things get uncouth." },
      { id: "con-facet", note: "His Radiance himself, on three gleaming legs, firing a prism cannon at anyone standing in his light." },
      { id: "con-dancers", note: "Court performers who teleport mid-pirouette. The routine is lethal, and a standing ovation is mandatory." },
      { id: "con-sylph", note: "Jet-pack heralds who fly ahead to announce His Radiance and review the landing site." },
      { id: "con-obelisk", note: "A monument that marks Concord territory and fires on bad taste. It has views on the whole valley." },
    ],
    supports: [
      { id: "con-spire", note: "Polished towers that recharge Concord shields and reflect His Radiance back at himself." },
      { id: "con-choir", note: "A choir that has been humming one perfect note since the landing. The Muster would like it to stop." },
      { id: "con-lens", note: "A ring of crystal the size of a county, parked in orbit, that turns sunlight into Sunbeams." },
      { id: "con-court", note: "Lady Prismwick's panel of critics. They score every battle, and point out where the enemy's armour is cheap." },
      { id: "con-gate", note: "Doorways of light for crossing the valley without touching the dirt, or whatever is in it." },
      { id: "con-portal", note: "The Concord's front door, opened wherever His Radiance's peers would like to make an entrance." },
    ],
    intro: [
      "From orbit, the Dustline glows. The Star Lens noticed.",
      "The Lumen Concord have come to admire it. Up close. Permanently.",
      "His Radiance, the Grand Strider, has arrived. Applause is expected.",
      "They find everyone faintly embarrassing.",
      "Lumen Concord: few, bright and insufferable.",
    ],
  },
};

// ---------------------------------------------------------------- battle seeds (for a campaign)

export const BATTLES: LoreBattle[] = [
  {
    id: "up-through-the-corn",
    act: 1,
    title: "Up Through the Corn",
    placeId: "dustbowl-crossing",
    mapId: "dustbowl",
    missionId: "hold",
    sides: ["militia", "swarm"],
    hook: "The first Skitterlings of the season come up through the corn at Dustbowl Crossing. Hold the silo deck until the rest of the Muster gets there.",
  },
  {
    id: "keep-off-the-grass",
    act: 1,
    title: "Keep Off the Grass",
    placeId: "prismwick-lawn",
    mapId: "prismwick",
    missionId: "grab",
    sides: ["militia", "concord"],
    hook: "Take Haybright Farm back from Lady Prismwick, one hedge at a time. Mind the gazebos: they are made of glass, and very smug.",
  },
  {
    id: "signal-lost",
    act: 1,
    title: "Signal Lost",
    placeId: "rattlevane-junction",
    mapId: "rattlevane",
    missionId: "hill",
    sides: ["swarm", "militia"],
    hook: "The swarm has come up under Rattlevane Junction and chewed through the radio cables. Whoever holds the windpump yard decides whether Grange Hall Command can be heard.",
  },
  {
    id: "last-drops",
    act: 2,
    title: "Last Drops",
    placeId: "old-refinery",
    mapId: "refinery",
    missionId: "scavenge",
    sides: ["swarm", "concord"],
    hook: "There is still Fizz in the Old Refinery's tanks. The brood wants it warm in the egg chambers. The Concord want it for their lamps.",
  },
  {
    id: "highway-robbery",
    act: 2,
    title: "Highway Robbery",
    placeId: "long-ridge-highway",
    mapId: "highway",
    missionId: "heist",
    sides: ["militia", "swarm"],
    hook: "The swarm came up under a Muster convoy on Long Ridge Highway and dragged off a crate of Fizz cells. Get it back before it ends up in an egg chamber, and take something of theirs while you're at it.",
  },
  {
    id: "finders-keepers",
    act: 2,
    title: "Finders Keepers",
    placeId: "velvet-comet",
    mapId: "velvetcomet",
    missionId: "salvage",
    sides: ["militia", "concord"],
    hook: "Muster salvage crews have been stripping the Velvet Comet for armour plate all season. Its owners have come back for it, and they are livid.",
  },
  {
    id: "the-gemhaul-road",
    act: 2,
    title: "The Gemhaul Road",
    placeId: "gemhaul-road",
    mapId: "gemhaul",
    missionId: "convoy",
    sides: ["concord", "militia"],
    hook: "A Concord crystal caravan has stalled on the Gemhaul Road with a strongbox of refined Fizz. The Tumbleweed Outriders have noticed.",
  },
  {
    id: "claim-jumpers",
    act: 2,
    title: "Claim Jumpers",
    placeId: "grubstake-redoubt",
    mapId: "grubstake",
    missionId: "siege",
    sides: ["militia", "swarm"],
    hook: "Prospectors at Grubstake Redoubt have struck a fresh, warm seam of Fizz. The swarm can smell it, and it is not knocking.",
  },
  {
    id: "off-the-rails",
    act: 2,
    title: "Off the Rails",
    placeId: "gutterbend",
    mapId: "gutterbend",
    missionId: "shifting",
    sides: ["swarm", "concord"],
    hook: "The derailed ore cars at Gutterbend still glow. The swarm is tunnelling under them, so the ground keeps shifting, and the Concord keep complaining about it.",
  },
  {
    id: "spare-parts",
    act: 3,
    title: "Spare Parts",
    placeId: "scrapyard-sprawl",
    mapId: "sprawl",
    missionId: "scrapheap",
    sides: ["militia", "swarm"],
    hook: "The swarm comes up under the Scrapyard Sprawl to cut the Muster off from its armour and spare parts. Everyone arrives fast and angry.",
  },
  {
    id: "landing-party",
    act: 3,
    title: "Landing Party",
    placeId: "brinejaw-flats",
    mapId: "brinejaw",
    missionId: "frontline",
    sides: ["concord", "militia"],
    hook: "His Radiance's main fleet sets down on Brinejaw Flats. The Muster drags every barricade it owns across the salt to meet it.",
  },
  {
    id: "the-narrows",
    act: 3,
    title: "The Narrows",
    placeId: "mesa-ridge",
    mapId: "mesa",
    missionId: "brawl",
    sides: ["swarm", "concord"],
    hook: "A Concord scouting party and a swarm tunnel column run into each other in the Narrows. Nobody planned this, and nobody is backing down.",
  },
  {
    id: "battle-of-fizzwater-ford",
    act: 3,
    title: "The Battle of Fizzwater Ford",
    placeId: "fizzwater-ford",
    mapId: "fizzwater",
    missionId: "hold",
    sides: ["militia", "concord"],
    hook: "Every road in the valley leads to Fizzwater Ford. Whoever holds the bridges holds the Wellspring, and whoever holds the Wellspring holds the Dustline.",
  },
];

// ---------------------------------------------------------------- lookups

export const isLoreFaction = (id: FactionId | string): id is LoreFactionId => (LORE_FACTION_IDS as readonly string[]).includes(id);

/** The lore for a built-in faction, or undefined (custom factions have none). */
export const factionLore = (id: FactionId | string): FactionLore | undefined => (isLoreFaction(id) ? LORE_FACTIONS[id] : undefined);

export const characterById = (id: string): LoreCharacter | undefined => CHARACTERS.find((c) => c.id === id);

export const placeById = (id: string): LorePlace | undefined => PLACES.find((p) => p.id === id);

/** The place a built-in battlefield is set in. */
export const placeForMap = (mapId: string): LorePlace | undefined => PLACES.find((p) => p.mapId === mapId);

/** The faction's leader. */
export const leaderOf = (id: LoreFactionId): LoreCharacter => characterById(LORE_FACTIONS[id].leaderId)!;

/** Characters of a faction, leader first. */
export const charactersOf = (id: LoreFactionId): LoreCharacter[] => {
  const lead = LORE_FACTIONS[id].leaderId;
  return CHARACTERS.filter((c) => c.faction === id).sort((a, b) => Number(b.id === lead) - Number(a.id === lead));
};

/** The lore line for one unit or support, wherever it is. */
export function loreNote(id: string): string | undefined {
  for (const f of Object.values(LORE_FACTIONS)) {
    const n = f.units.find((u) => u.id === id) ?? f.supports.find((s) => s.id === id);
    if (n) return n.note;
  }
  return undefined;
}

/** Battle seeds involving a faction, in story order. */
export const battlesFor = (id: LoreFactionId): LoreBattle[] => BATTLES.filter((b) => b.sides.includes(id));

/** Battle seeds set at a place. */
export const battlesAt = (placeId: string): LoreBattle[] => BATTLES.filter((b) => b.placeId === placeId);
