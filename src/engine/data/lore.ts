// The canonical lore of SCDMG: the world, its central conflict, the named places and characters, each
// built-in faction's story, and a list of battle seeds that chain the world's places, maps and missions.
// Pure data (no DOM), so the lore pages, the intros and a campaign can all build on it. Every unit,
// support, map and mission it names is checked against the game data in tests/lore.test.ts.
//
// House style: dry and funny, a cartoon sci-fi comedy with heart. Characters are "they" (or "it" for
// machines) unless the game's own text already gives them a pronoun (Dr. Graft "his", Big Mama "her",
// His Radiance "he", Aunt Dot "she", Lucky Lew "he").

import type { FactionId } from "../types";

export type LoreFactionId = "militia" | "munch" | "concord";
export const LORE_FACTION_IDS: readonly LoreFactionId[] = ["militia", "munch", "concord"];

export type Pronoun = "he" | "she" | "they" | "it";

export interface LoreCharacter {
  id: string;
  name: string;
  /** Short role line, e.g. "Chair of the Grange Hall committee". */
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
    "Out where the paved road gives up and the corn does not, there is a long, dry farming valley called the Dustline. A fizzing creek runs down the middle of it, the soil is suspiciously good, the pumpkins are enormous, and the pies are the best for three hundred miles. Nobody asks too many questions about any of this, because the answer is under the ford.",
  prize: {
    name: "The Fizz and the Wellspring",
    text: "Under the valley runs the Fizz: bubbling, faintly glowing mineral water that rises through the Fizzwater creek. It makes crops grow like they have somewhere to be, and it keeps forty-year-old engines running on fumes and spite. The farmers pour it in the tractors. Dr. Graft brews it into mutagen. The Lumen Concord refine it into light. Its source, the Wellspring, lies deep under Fizzwater Ford, and whoever holds the Wellspring holds the Dustline. (The fizz you spend on support cards is a little of the same stuff.)",
  },
  conflict: {
    name: "The Dustline War",
    text: "This season, the harvest is under attack from two directions. From below, Dr. Graft's Munch are tunnelling up through the fields to tap the Wellspring and wire every critter in the valley into his overmind. From above, the Lumen Concord have parked the Star Lens in orbit and begun landscaping the valley into a tasteful pleasure garden for His Radiance, with the Wellspring as its fountain. In between, the Dustline Militia have mustered at the Grange Hall with every rifle, tractor and grandmother they own. Three sides, one valley, and nobody is leaving.",
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
      text: "Somebody found that Fizz ran a tractor better than diesel, and the valley boomed. The Old Refinery bottled it, the Long Ridge Highway hauled it out, and ore trains rattled past Gutterbend. Then the shallow seam went flat, the refinery closed, a train came off the rails and stayed off, and everyone went back to farming, with a great deal of interesting scrap.",
    },
    {
      when: "Some years back",
      title: "The Pest Problem",
      text: "A beetle plague hit the corn, and the county hired a pest-control scientist, Dr. Graft, to deal with it. He dealt with it by putting the beetles in charge. When his prize marrow ate the judging table at the Harvest Fair, the Grange banned him for life, and he took his notes and his grudge underground, into the old badger sett on Badger Knob.",
    },
    {
      when: "The Harvest of '09",
      title: "Up Through the Corn",
      text: "The night the Chrome-Jaw Beetles first came up through the corn. The farmers held them at Dustbowl Crossing with shovels, a combine and a great deal of shouting. Big Bertha got legs that winter and a cannon the winter after. The Ridgeline Squinter has not blinked since.",
    },
    {
      when: "Last autumn",
      title: "The Glow in the Dark",
      text: "From orbit, the Fizz shows up as a soft glow on the night side of the planet. The Lumen Concord's pleasure yacht Velvet Comet came down to admire it, misjudged the landing and planted itself in a debris field. Its passengers walked away unhurt and deeply offended, and sent a message home: we have found something lovely, and it is surrounded by farmers.",
    },
    {
      when: "This season",
      title: "The Dustline War",
      text: "The Star Lens has moved into orbit above the valley. Lady Prismwick has replaced the Haybright bean farm with a croquet lawn. Gopher holes are opening in the bean rows that are left. Aunt Dot has called a meeting at the Grange Hall, and attendance is compulsory.",
    },
  ],
  intro: [
    "Out where the paved road gives up, there is a farming valley called the Dustline.",
    "The creek fizzes, the pumpkins are enormous, and deep under the ford, the Wellspring glows.",
    "This season, something came up from below...",
    "...something came down from above...",
    "...and the farmers did not budge an inch.",
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
      "The valley's community hall: dances on Saturdays, pie judging in autumn, and now the Militia's headquarters. The Grange Hall Radio broadcasts from a folding table in the back, next to the urn.",
  },
  {
    id: "haybright-farm",
    name: "Haybright Farm",
    kind: "farm",
    heldBy: "militia",
    blurb: "Aunt Dot's family farm, and the barn Big Bertha lives in. Half of it is still beans. The other half is now Lady Prismwick's Lawn.",
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
      "The canyon maze on the valley's western rim. Munch tunnels come up in the Narrows, Concord scouts like the view from the twin mesas, and the Ridgeline Squinter has been up there since before either of them arrived.",
  },
  {
    id: "old-refinery",
    name: "The Old Refinery",
    kind: "battlefield",
    mapId: "refinery",
    heldBy: null,
    blurb:
      "Where the Fizz was bottled in the boom years. The tanks are empty, mostly, and the pipes still hum when the Wellspring stirs. Dr. Graft wants to restart it. The Concord want to knock it down and put up something tasteful.",
  },
  {
    id: "long-ridge-highway",
    name: "Long Ridge Highway",
    kind: "battlefield",
    mapId: "highway",
    heldBy: "militia",
    blurb:
      "The only paved road into the valley, raised on an embankment and broken in the middle since the boom years. The Militia's supply wagons use it. So do the Munch, from underneath.",
  },
  {
    id: "scrapyard-sprawl",
    name: "Scrapyard Sprawl",
    kind: "battlefield",
    mapId: "sprawl",
    heldBy: "militia",
    blurb:
      "Forty years of broken tractors stacked into city blocks around the old smelter. Every Militia machine started life here, and most of them come back eventually, in pieces.",
  },
  {
    id: "rattlevane-junction",
    name: "Rattlevane Junction",
    kind: "battlefield",
    mapId: "rattlevane",
    heldBy: "militia",
    blurb:
      "A walled windpump yard where the valley's signal towers meet, crowned by the Weather Vane. Aunt Dot's radio relays run through here: lose the Junction and the Militia go deaf.",
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
      "The source of the Fizz, deep under Fizzwater Ford: a cavern of glowing, bubbling water that nobody has seen and everybody wants. The farmers want it left alone, Dr. Graft wants it in his vats, and His Radiance wants it in a fountain.",
  },
  {
    id: "prismwick-lawn",
    name: "Lady Prismwick's Lawn",
    kind: "battlefield",
    mapId: "prismwick",
    heldBy: "concord",
    blurb:
      "Until recently, the bean fields of Haybright Farm. Now a croquet lawn boxed in by tall hedges and topiary, with glass gazebos at each end. The Concord's first foothold in the valley, and the farmers' first grudge.",
  },
  {
    id: "brinejaw-flats",
    name: "Brinejaw Flats",
    kind: "battlefield",
    mapId: "brinejaw",
    heldBy: "concord",
    blurb:
      "Bone-dry salt flats at the valley's southern end, where the creek used to run before it changed its mind. The Concord land their saucers here: there is nothing to hide behind but junk.",
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
      "A prospectors' dugout on a raised bank, built in the boom years to guard a claim stake. Whoever is inside tends to stay inside, and to shout at whoever is outside.",
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
      "The Concord pleasure yacht that came to admire the valley and crashed into it instead. Militia scrappers have been stripping it for parts ever since. Its owners would like it back, or at least would like the scrappers to stop sitting in the hot tub.",
  },
  {
    id: "sett-lab",
    name: "The Sett Lab",
    kind: "lair",
    heldBy: "munch",
    blurb:
      "Dr. Graft's laboratory, dug into the old badger sett under Badger Knob: a steel door, a generator, rows of humming incubators, vats of glowing mutagen and his name on the mailbox. The Tunnel Network spreads out from here under the whole valley.",
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
    name: "Aunt Dot Haybright",
    title: "Chair of the Grange Hall committee, voice of the Grange Hall Radio",
    faction: "militia",
    pronoun: "she",
    supportId: "mil-radio",
    placeId: "grange-hall",
    bio: "Nobody elected Aunt Dot to run the Militia. She just switched on the radio and started giving orders, and nobody has dared switch it off. She knows every family, every tractor and every grudge in the valley, and she runs the whole war from a folding table in the Grange Hall with a microphone, a ledger and a thermos of something strong. It was her bean farm Lady Prismwick turned into a lawn. She has not forgotten.",
    quote: "This is Grange Hall Radio. Everybody with a rifle, to the Crossing. Everybody without one, bring sandwiches.",
  },
  {
    id: "lucky-lew",
    name: "Lucky Lew",
    title: "Pilot of the Rust Bucket Drop-Ship, sole staff of the Dirt Airstrip",
    faction: "militia",
    pronoun: "he",
    supportId: "mil-dropship",
    placeId: "haybright-farm",
    bio: "Lucky Lew has flown the Rust Bucket since the boom years, when it hauled Fizz ore. He swears he has done every landing before. Nobody has checked, and the Rust Bucket's landing light is a lantern on a hook, so nobody could.",
    quote: "Hold on to something. No, not that.",
  },
  {
    id: "squinter",
    name: "The Ridgeline Squinter",
    title: "Lookout of Mesa Ridge",
    faction: "militia",
    pronoun: "they",
    unitId: "mil-squinter",
    placeId: "mesa-ridge",
    bio: "Nobody remembers the Squinter's real name, including the Squinter. They have watched the valley from Mesa Ridge with a varmint rifle and a flask of cold coffee since the Harvest of '09, and claim the not-blinking is a medical condition.",
    quote: "Saw you coming last Tuesday.",
  },
  {
    id: "big-bertha",
    name: "Big Bertha",
    title: "The Haybright combine, now walking and armed",
    faction: "militia",
    pronoun: "it",
    unitId: "mil-bertha",
    placeId: "haybright-farm",
    bio: "The family combine harvester, given legs after the Harvest of '09 and a cannon the winter after. It still brings in the wheat in the off-season, slowly and carefully, with the cannon pointed politely away.",
  },
  {
    id: "dr-graft",
    name: "Dr. Graft",
    title: "Bioengineer, overmind of the Munch, banned from the Harvest Fair",
    faction: "munch",
    pronoun: "he",
    unitId: "munch-mama",
    placeId: "sett-lab",
    bio: "Dr. Graft was hired to fix the valley's beetle problem, and in a sense he did: now the beetles have a boss. Banned from the Grange for life after his prize marrow ate the judging table, he went underground, built the Sett Lab under Badger Knob, and wired every critter he could catch into his overmind. He rides to war on Big Mama, waving a test tube and shouting about the Harvest Fair.",
    quote: "They laughed at me at the Harvest Fair. Who's laughing now? Not the judging table.",
  },
  {
    id: "big-mama",
    name: "Big Mama",
    title: "Dr. Graft's war-badger",
    faction: "munch",
    pronoun: "she",
    unitId: "munch-mama",
    placeId: "sett-lab",
    bio: "Once an ordinary and extremely grumpy badger who lived under Badger Knob. Dr. Graft gave her a chrome overmind implant, a course of Fizz-brewed mutagen and a saddle. She is now the size of a tractor, still grumpy, and the only member of the Munch who can overrule him (at mealtimes).",
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
    bio: "His Radiance's landscape architect and critic-in-chief. Lady Prismwick's first act on landing was to replace a working bean farm with a croquet lawn, two glass gazebos and a hedge in the shape of His Radiance. The farmers want the farm back. Lady Prismwick wants the farmers to stop standing on the grass.",
    quote: "Two out of ten. The beans were derivative.",
  },
];

// ---------------------------------------------------------------- factions

export const LORE_FACTIONS: Record<LoreFactionId, FactionLore> = {
  militia: {
    factionId: "militia",
    name: "Dustline Militia",
    epithet: "The farmers who will not leave",
    tagline: "Rivets, rifles and a very long memory.",
    leaderId: "aunt-dot",
    homeId: "grange-hall",
    goal: "Hold the valley, bring the harvest in, get Haybright Farm back from the Concord, and keep the Wellspring flowing for the people who were here first.",
    stakes:
      "Everything they have: the farms, the Grange Hall, the Harvest Fair and three generations of pie recipes. If the Militia lose, the Dustline becomes either a lawn or a lunch.",
    story: [
      "The Dustline Militia is not really an army. It is every family in the valley, a radio and a scrapyard, and that has turned out to be enough. When trouble comes, Aunt Dot gets on the Grange Hall Radio and the valley turns up: Rivet Grunts with riveted rifles and shovels, Patch Medics with staple guns and a cheerful bedside manner, and the Front Porch Grannies, who have been sitting on that porch for years waiting for something exactly like this.",
      "Their war machines come out of the barn and the Scrapyard Sprawl. Big Bertha is a combine harvester with legs and a cannon. The Sky Rustler is a crop duster with opinions. The Hay Bomber drops the farm's finest from a great height, and the Rust Bucket Drop-Ship is older than most of its passengers. Lucky Lew lands it wherever the shouting is loudest.",
      "They are not fast, and they do not like getting close. But dig them in behind a fence with a clear field of fire and they will hold it until the cows come home, and the cows have been told to stay put.",
    ],
    quote: "This is Grange Hall Radio. Everybody with a rifle, to the Crossing. Everybody without one, bring sandwiches.",
    units: [
      { id: "mil-grunts", note: "Farmhands, ranch kids and the feed-store staff, each issued a riveted rifle and a shovel. They dig in first and ask questions loudly." },
      { id: "mil-medic", note: "The valley's vets and first-aiders. They have patched up calves, tractors and Lucky Lew, in roughly that order of difficulty." },
      { id: "mil-bertha", note: "A combine harvester on legs, with a cannon where the grain chute used to be. Everybody in the valley has had a turn driving it. Nobody has had a turn parking it." },
      { id: "mil-rustler", note: "Crop dusters pulled out of retirement and fitted with a chain popper. Their pilots spot for the gunline and argue with crows." },
      { id: "mil-turret", note: "Somebody has to sit in it. Somebody always volunteers, then regrets it, then refuses to leave." },
      { id: "mil-junk", note: "Whatever the Tractor Depot can throw across the road in a hurry. The goat is not officially part of the barricade. The goat disagrees." },
      { id: "mil-squinter", note: "Watches the valley from Mesa Ridge with a varmint rifle and a flask of cold coffee. Nothing crosses the valley without them noticing, and remarking on it." },
      { id: "mil-riders", note: "Dirt-bike couriers who carry Aunt Dot's messages when the radio is down, and buckshot when it isn't." },
      { id: "mil-grannies", note: "The valley's grandmothers, with Cousin Mabel on call. Rock salt for the wildlife, rolling pins for everything else." },
      { id: "mil-bomber", note: "A cargo biplane from the Dirt Airstrip that delivers fertiliser by the tonne, from height, with feeling." },
      { id: "mil-mortar", note: "The surplus of a record potato harvest, returned to sender at speed." },
    ],
    supports: [
      { id: "mil-radio", note: "Aunt Dot's microphone. Everything the Militia does starts with a crackle and a 'Now listen here.'" },
      { id: "mil-depot", note: "The valley's spare-parts store, which is also its armoury, its hospital and its barricade supply." },
      { id: "mil-vane", note: "The weather vane on top of Rattlevane Junction. It always points at trouble, and the farmers have learned to duck that way." },
      { id: "mil-airstrip", note: "A cleared field behind Haybright Farm: home of the Hay Bomber, a windsock and Lucky Lew's confidence." },
      { id: "mil-dropship", note: "A boom-years ore hauler that Lucky Lew keeps flying on Fizz, prayer and baling wire." },
      { id: "mil-wagon", note: "Rivets, buckshot, sandbags and pickles, pulled by whoever lost the coin toss." },
    ],
    intro: [
      "When trouble comes up the valley, Aunt Dot gets on the Grange Hall Radio.",
      "The whole valley turns up, with rifles, shovels and sandwiches.",
      "Big Bertha comes out of the barn.",
      "The crop dusters come out of retirement.",
      "Dustline Militia: rivets, rifles and a very long memory.",
    ],
  },
  munch: {
    factionId: "munch",
    name: "The Munch",
    epithet: "Dr. Graft's critter army",
    tagline: "One mind. Many mouths.",
    leaderId: "dr-graft",
    homeId: "sett-lab",
    goal: "Tap the Wellspring, brew enough mutagen to wire every critter in the valley into the overmind, and make the Dustline one big, humming, hungry farm. Also, win the Harvest Fair. By eating it.",
    stakes:
      "Dr. Graft's life's work, and Big Mama's dinner. If the Wellspring goes to the Concord it gets polished, and if it goes to the farmers it goes back in the tractors. Either way the overmind goes hungry, and Dr. Graft would have to go back to pest control. He would rather be eaten.",
    story: [
      "Dr. Graft was hired to fix the valley's beetle problem, and in a sense he did: now the beetles have a boss. After his prize marrow ate the judging table at the Harvest Fair and the Grange banned him for life, he took his notes, his centrifuge and his grudge underground, into the old badger sett beneath Badger Knob, and built the Sett Lab.",
      "There he met Big Mama, an ordinary and extremely grumpy badger, and gave her a chrome overmind implant, a course of Fizz-brewed mutagen and a saddle. She is now the size of a tractor. Every critter that followed got an implant of its own (Chrome-Jaw Beetles, Web-Gunner Spiders, Piston Foxes, Bomb Wasps, Steel-Jaw Crows, a skunk with a mortar) and with it the overmind: one humming thought, which is Dr. Graft's.",
      "The Munch do not shoot well, wear armour or stay frightened for long. They come up out of the ground by the dozen, bite, get knocked down, and come back slightly damp. Any hole in the valley might be a Gopher Hole. Most of them are.",
    ],
    quote: "They laughed at me at the Harvest Fair. Who's laughing now? Not the judging table.",
    units: [
      { id: "munch-nibblers", note: "The corn beetles Dr. Graft was hired to get rid of. He gave them chrome jaws instead. They came up through the corn in '09 and have been coming ever since." },
      { id: "munch-spitter", note: "Barn spiders who used to catch flies. They have upgraded." },
      { id: "munch-buzz", note: "A wasp nest from the Grange Hall eaves, improved. They were always angry; now they are also explosive." },
      { id: "munch-mama", note: "The doctor and his war-badger. He does the thinking. She does the digging, the biting and the final decision." },
      { id: "munch-pod", note: "Vats of Fizz-brewed mutagen, carried up from the Sett Lab. The glow is the mutagen. Nobody is sure what the bubbling is." },
      { id: "munch-hole", note: "The Tunnel Network surfaces for a moment, lets something out, and closes again. The farmers have stopped filling them in." },
      { id: "munch-pit", note: "A trapdoor spider, scaled up and given a lid. It sits under the bean rows and waits, and it is very good at waiting." },
      { id: "munch-hoppers", note: "Hen-house foxes on hydraulic hind legs. They still go for the hen house, just from much further away." },
      { id: "munch-lobber", note: "A skunk with a mortar on its back and a grudge against noses. It clears a field faster than a fire alarm." },
      { id: "munch-flapjaw", note: "The crows that used to mock the scarecrows. Now they have steel beaks, and they mock the tanks." },
      { id: "munch-nanny", note: "The Munch's nurse. It hatches spares, staples the wounded and has never once had a day off." },
      { id: "munch-warren", note: "Wherever Dr. Graft wants a front door, the Munch dig a new entrance to the Sett Lab. The mailbox comes with it." },
    ],
    supports: [
      { id: "munch-nest", note: "The Sett Lab's hatchery, where tomorrow's Munch hum in their incubators." },
      { id: "munch-tunnels", note: "Miles of tunnels under the valley. Most of the farmers' missing tools are down there." },
      { id: "munch-stash", note: "Dr. Graft's emergency mutagen, kept in jam jars labelled NOT JAM." },
      { id: "munch-stink", note: "Collected, with great difficulty, from the Stink Mortar's relatives." },
      { id: "munch-burrows", note: "The old tunnels under the fields, deeper than the farmers' wells and full of surprises." },
    ],
    intro: [
      "Under Badger Knob, behind a steel door, the Sett Lab hums.",
      "Dr. Graft has a plan. It is a bad plan for you.",
      "Every critter in the valley, wired into one overmind.",
      "And every one of them is hungry.",
      "The Munch: one mind, many mouths.",
    ],
  },
  concord: {
    factionId: "concord",
    name: "Lumen Concord",
    epithet: "Invaders from beyond the Star Lens",
    tagline: "Few, bright and insufferable.",
    leaderId: "grand-strider",
    homeId: "star-lens",
    goal: "Turn the Dustline into a pleasure garden worthy of His Radiance: terraced, hedged, lit from beneath by the Wellspring, and free of farmers, critters and anything beige.",
    stakes:
      "Their saucers, gates and shields run on refined light, and the Wellspring is the brightest source they have found in a thousand worlds. More importantly, losing a war to a valley of farmers would be embarrassing, and the Concord would rather do almost anything than be embarrassed.",
    story: [
      "The Lumen Concord are a very old, very bright civilisation that has toured the stars for so long it has run out of things to admire. When the Star Lens picked up a soft glow on the night side of an unremarkable planet, His Radiance sent the pleasure yacht Velvet Comet to take a look. It crashed. Its passengers walked away unhurt and deeply offended, and sent word home: we have found something lovely, and it is surrounded by farmers.",
      "So His Radiance, the Grand Strider, came in person. The Star Lens now hangs over the valley like a monocle, saucers glide down through Light Gates, and Lady Prismwick has already replaced Haybright Farm's bean fields with a croquet lawn. The Concord are few, and every one of them is a specialist: a duellist, a sniper, a dancer or a critic. They hit what they aim at, they arrive shielded, and they never hurry.",
      "They do not consider this an invasion. They consider it a renovation. The locals are welcome to stay, provided they keep off the lawn.",
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
      { id: "con-choir", note: "A choir that has been humming one perfect note since the landing. The farmers would like it to stop." },
      { id: "con-lens", note: "A ring of crystal the size of a county, parked in orbit, that turns sunlight into Sunbeams." },
      { id: "con-court", note: "Lady Prismwick's panel of critics. They score every battle, and point out where the enemy's armour is cheap." },
      { id: "con-gate", note: "Doorways of light for crossing the valley without touching the dirt." },
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
    sides: ["militia", "munch"],
    hook: "The first beetles of the season come up through the corn at Dustbowl Crossing. Hold the silo deck until the rest of the valley gets there.",
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
    sides: ["munch", "militia"],
    hook: "The Munch have chewed through the radio relays at Rattlevane Junction. Whoever holds the windpump yard decides whether the Grange Hall Radio can be heard.",
  },
  {
    id: "last-drops",
    act: 2,
    title: "Last Drops",
    placeId: "old-refinery",
    mapId: "refinery",
    missionId: "scavenge",
    sides: ["munch", "concord"],
    hook: "There is still Fizz in the Old Refinery's tanks. Dr. Graft wants it for mutagen. The Concord want it for their lamps.",
  },
  {
    id: "highway-robbery",
    act: 2,
    title: "Highway Robbery",
    placeId: "long-ridge-highway",
    mapId: "highway",
    missionId: "heist",
    sides: ["militia", "munch"],
    hook: "The Munch have stolen the Harvest Fair's prize pie off a wagon on Long Ridge Highway. Get it back before Big Mama gets a slice, and take one of theirs while you're at it.",
  },
  {
    id: "finders-keepers",
    act: 2,
    title: "Finders Keepers",
    placeId: "velvet-comet",
    mapId: "velvetcomet",
    missionId: "salvage",
    sides: ["militia", "concord"],
    hook: "Militia scrappers have been stripping the Velvet Comet for parts all season. Its owners have come back for it, and they are livid.",
  },
  {
    id: "the-gemhaul-road",
    act: 2,
    title: "The Gemhaul Road",
    placeId: "gemhaul-road",
    mapId: "gemhaul",
    missionId: "convoy",
    sides: ["concord", "militia"],
    hook: "A Concord crystal caravan has stalled on the Gemhaul Road with a strongbox of refined Fizz. The Tumbleweed Riders have noticed.",
  },
  {
    id: "claim-jumpers",
    act: 2,
    title: "Claim Jumpers",
    placeId: "grubstake-redoubt",
    mapId: "grubstake",
    missionId: "siege",
    sides: ["militia", "munch"],
    hook: "Prospectors at Grubstake Redoubt have struck a fresh seam of Fizz. The Munch want it, and they are not knocking.",
  },
  {
    id: "off-the-rails",
    act: 2,
    title: "Off the Rails",
    placeId: "gutterbend",
    mapId: "gutterbend",
    missionId: "shifting",
    sides: ["munch", "concord"],
    hook: "The derailed ore cars at Gutterbend still glow. The Munch are tunnelling under them, so the ground keeps shifting, and the Concord keep complaining about it.",
  },
  {
    id: "spare-parts",
    act: 3,
    title: "Spare Parts",
    placeId: "scrapyard-sprawl",
    mapId: "sprawl",
    missionId: "scrapheap",
    sides: ["militia", "munch"],
    hook: "The Munch go for the Scrapyard Sprawl to cut the Militia off from its spare parts. Everyone arrives fast and angry.",
  },
  {
    id: "landing-party",
    act: 3,
    title: "Landing Party",
    placeId: "brinejaw-flats",
    mapId: "brinejaw",
    missionId: "frontline",
    sides: ["concord", "militia"],
    hook: "His Radiance's main fleet sets down on Brinejaw Flats. The Militia drag every barricade they own across the salt to meet it.",
  },
  {
    id: "the-narrows",
    act: 3,
    title: "The Narrows",
    placeId: "mesa-ridge",
    mapId: "mesa",
    missionId: "brawl",
    sides: ["munch", "concord"],
    hook: "A Concord scouting party and a Munch tunnel column run into each other in the Narrows. Nobody planned this, and nobody is backing down.",
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
