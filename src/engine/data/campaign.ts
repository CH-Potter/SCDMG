// The campaign, "The Dustline War": one war, told three ways. Each built-in faction gets its own run
// of battles through the same three acts (built on the battle seeds in lore.ts), its own leader's
// voice, and a finale at Fizzwater Ford over the Wellspring. Pure data, no DOM: the rules that move
// the war along are in src/engine/campaign.ts, and tests/campaign.test.ts checks every battle here
// against the maps, missions, units and characters it names.
//
// Story lines are spoken by a character id (lore.ts CHARACTERS) or by a unit profile id (a generic
// trooper of that unit). `{rival}`, `{rivalLeader}` and `{fate}` in finale and ending text are filled
// in once the finale's opponent is known (see fillStory in campaign.ts).

import { BATTLES, type LoreFactionId } from "./lore";
import type { ModeId } from "./modes";

export type CampaignAct = 1 | 2 | 3;

/** One line of dialogue: who says it (a character id or a unit profile id) and what they say. */
export interface StoryLine {
  who: string;
  text: string;
}

/** One comic panel of a story scene: a caption, and optionally someone speaking, at a place. */
export interface StoryPanel {
  caption: string;
  who?: string;
  text?: string;
  /** Where the panel is set (a place id); defaults to the speaker's usual place. */
  placeId?: string;
  /** Big display text slammed onto the panel (a title card). */
  title?: string;
}

export interface CampaignBattleDef {
  /** Unique within its campaign. Matches the lore battle seed's id when it is one. */
  id: string;
  act: CampaignAct;
  title: string;
  placeId: string;
  mapId: string;
  missionId: string;
  enemy: LoreFactionId;
  /** Role missions: the side you play (0 = side A, 1 = side B). Always 0 otherwise. */
  side: 0 | 1;
  /** The set-up, from your side's point of view. */
  hook: string;
  /** Before the battle: your side speaks, then theirs. */
  brief: [StoryLine, StoryLine];
  /** After a win, and after a loss. */
  win: StoryLine;
  loss: StoryLine;
}

export interface FactionCampaign {
  faction: LoreFactionId;
  /** The campaign's own title for this side, e.g. "Not One Inch". */
  title: string;
  /** One or two sentences for the side picker. */
  blurb: string;
  prologue: StoryPanel[];
  /** A short scene as each act opens. */
  openers: Record<CampaignAct, StoryPanel[]>;
  battles: CampaignBattleDef[];
  /** The finale at Fizzwater Ford: your side's line, before the rival answers with their leader's quote. */
  finale: { hook: string; brief: StoryLine; win: StoryLine; loss: StoryLine };
  endings: { win: StoryPanel[]; loss: StoryPanel[] };
}

// ---------------------------------------------------------------- the shape of the war

export const ACTS: Record<CampaignAct, { name: string; short: string; fights: number }> = {
  1: { name: "Act I: The Muster", short: "The Muster", fights: 2 },
  2: { name: "Act II: The War Spreads", short: "The War Spreads", fights: 2 },
  3: { name: "Act III: The Wellspring", short: "The Wellspring", fights: 1 },
};

/**
 * Roster budget (⚙) for both armies in each act. The war escalates: early battles are smaller than a
 * normal game, and from Act III on both sides field the mode's full roster limit. The AI's starter
 * army is trimmed to the same budget, so the only edge you get is from the places you hold.
 */
export const ACT_BUDGET: Record<CampaignAct, Record<ModeId, number>> = {
  1: { skirmish: 24, assault: 45 },
  2: { skirmish: 27, assault: 50 },
  3: { skirmish: 30, assault: 55 },
};

/** Losing a battle (or retreating) leaves your army battered: this much less budget for the next battle only. */
export const BATTERED_PENALTY = 3;

/** The finale: a duel at the ford for the Wellspring. */
export const FINALE = {
  id: "battle-of-fizzwater-ford",
  title: "The Battle of Fizzwater Ford",
  placeId: "fizzwater-ford",
  mapId: "fizzwater",
  missionId: "hold",
} as const;

/** Who you face at the ford when the rivals hold the same number of places. */
export const DEFAULT_RIVAL: Record<LoreFactionId, LoreFactionId> = {
  militia: "concord",
  munch: "militia",
  concord: "militia",
};

/** What each side would do with the Wellspring (for `{fate}`). */
export const WELLSPRING_FATE: Record<LoreFactionId, string> = {
  militia: "left in the creek and poured in the tractors",
  munch: "pumped into Dr. Graft's vats",
  concord: "polished into a fountain for His Radiance",
};

// ---------------------------------------------------------------- perks

export type PerkKind = "cp" | "resources" | "budget" | "unit" | "support";

export interface PlacePerk {
  name: string;
  kind: PerkKind;
  /** cp, resources and budget perks. */
  amount?: number;
  /** unit and support perks: the unit profile or support card each faction gets. */
  byFaction?: Record<LoreFactionId, string>;
  /** Why the place gives it. */
  flavour: string;
}

/** What holding each battlefield gives you in later battles. Only battlefields can change hands. */
export const PLACE_PERKS: Record<string, PlacePerk> = {
  "dustbowl-crossing": {
    name: "The silo deck",
    kind: "cp",
    amount: 1,
    flavour: "Whoever holds the silo deck sees the whole middle of the valley.",
  },
  "rattlevane-junction": {
    name: "The radio relays",
    kind: "cp",
    amount: 1,
    flavour: "Every signal in the valley runs through the Junction.",
  },
  "old-refinery": {
    name: "Fizz in the tanks",
    kind: "resources",
    amount: 1,
    flavour: "The tanks are empty. Mostly.",
  },
  gutterbend: {
    name: "Glowing ore",
    kind: "resources",
    amount: 1,
    flavour: "The ore cars still glow, and glow is worth money.",
  },
  "gemhaul-road": {
    name: "The caravan road",
    kind: "resources",
    amount: 1,
    flavour: "Crystal caravans pay a toll to whoever holds the road.",
  },
  "long-ridge-highway": {
    name: "Supply wagons",
    kind: "budget",
    amount: 2,
    flavour: "The only paved road in keeps the wagons rolling.",
  },
  "scrapyard-sprawl": {
    name: "Spare parts",
    kind: "budget",
    amount: 2,
    flavour: "Forty years of broken tractors, and most of the bits still fit something.",
  },
  "grubstake-redoubt": {
    name: "The fresh seam",
    kind: "budget",
    amount: 2,
    flavour: "A new seam of Fizz pays for a lot of rivets.",
  },
  "mesa-ridge": {
    name: "Eyes on the ridge",
    kind: "unit",
    byFaction: { militia: "mil-squinter", munch: "munch-spitter", concord: "con-lancer" },
    flavour: "Somebody up on the ridge comes down to help.",
  },
  "velvet-comet": {
    name: "Salvage from the wreck",
    kind: "unit",
    byFaction: { militia: "mil-rustler", munch: "munch-buzz", concord: "con-skiff" },
    flavour: "The wreck of the Velvet Comet still has a few good parts in it.",
  },
  "prismwick-lawn": {
    name: "The old bean field",
    kind: "support",
    byFaction: { militia: "mil-airstrip", munch: "munch-burrows", concord: "con-choir" },
    flavour: "Whoever holds the lawn holds the field behind it.",
  },
  "brinejaw-flats": {
    name: "A landing field",
    kind: "support",
    byFaction: { militia: "mil-dropship", munch: "munch-tunnels", concord: "con-gate" },
    flavour: "Flat, empty salt: room to land anything.",
  },
};

/**
 * The most each kind of perk can add up to in one battle, however many places you hold. Starting
 * resources are capped lowest: in AI-vs-AI sims (SIM_BONUS) +4 resources and +2 CP lifted side A's
 * Skirmish score from 44% to 67%, while +2 and +2 lifted it to 54%.
 */
export const PERK_CAPS: Record<PerkKind, number> = {
  cp: 2,
  resources: 2,
  budget: 3,
  unit: 1,
  support: 1,
};

// ---------------------------------------------------------------- stories

const hookOf = (id: string): string => BATTLES.find((b) => b.id === id)?.hook ?? "";

const MILITIA: FactionCampaign = {
  faction: "militia",
  title: "Not One Inch",
  blurb:
    "Aunt Dot and the farmers of the Dustline hold their valley against critters from below and snobs from above.",
  prologue: [
    {
      caption: "This season, the Dustline is under attack from two directions.",
      placeId: "grange-hall",
      who: "aunt-dot",
      text: "This is Grange Hall Radio. Everybody with a rifle, to the Crossing. Everybody without one, bring sandwiches.",
    },
    {
      caption: "Lady Prismwick has turned the Haybright bean field into a croquet lawn.",
      placeId: "prismwick-lawn",
      who: "lady-prismwick",
      text: "Two out of ten. The beans were derivative.",
    },
    {
      caption: "Gopher holes are opening in the bean rows that are left.",
      placeId: "dustbowl-crossing",
      who: "dr-graft",
      text: "Fresh corn, fresh farmers. Dinner is served!",
    },
    {
      caption:
        "Hold the valley, take back the farm, and keep the Wellspring for the people who were here first.",
      placeId: "haybright-farm",
      who: "big-bertha",
      text: "KA-THUMP.",
    },
  ],
  openers: {
    1: [
      {
        caption:
          "Beetles in the corn and a lawn where the beans were. Aunt Dot's ledger has two columns: things to defend, and things to take back.",
        placeId: "grange-hall",
        who: "aunt-dot",
        text: "Pick your fights. We can't be everywhere, and whatever we leave, they'll take.",
      },
    ],
    2: [
      {
        caption: "The war has spread to every road in the valley.",
        placeId: "long-ridge-highway",
        who: "mil-riders",
        text: "Radio says trouble on the highway, the hills and the wreck. All at once. Naturally.",
      },
    ],
    3: [
      {
        caption:
          "The pipes at the Old Refinery are humming. Something under the ford is waking up.",
        placeId: "mesa-ridge",
        who: "squinter",
        text: "Ford's glowing. Been glowing since Tuesday. Nobody asked me.",
      },
    ],
  },
  battles: [
    {
      id: "up-through-the-corn",
      act: 1,
      title: "Up Through the Corn",
      placeId: "dustbowl-crossing",
      mapId: "dustbowl",
      missionId: "hold",
      enemy: "munch",
      side: 0,
      hook: hookOf("up-through-the-corn"),
      brief: [
        {
          who: "aunt-dot",
          text: "Beetles at the Crossing, same as '09. Hold the silo deck till the rest of the valley gets there.",
        },
        { who: "dr-graft", text: "Fresh corn, fresh farmers. Dinner is served!" },
      ],
      win: { who: "aunt-dot", text: "That's the Crossing held. Somebody hose down the silo." },
      loss: {
        who: "aunt-dot",
        text: "Fall back to the Grange. The beetles can have the corn. For now.",
      },
    },
    {
      id: "keep-off-the-grass",
      act: 1,
      title: "Keep Off the Grass",
      placeId: "prismwick-lawn",
      mapId: "prismwick",
      missionId: "grab",
      enemy: "concord",
      side: 0,
      hook: hookOf("keep-off-the-grass"),
      brief: [
        {
          who: "aunt-dot",
          text: "That's my bean farm under that croquet lawn. Take it back, one hedge at a time.",
        },
        {
          who: "lady-prismwick",
          text: "Please keep to the gravel paths. And off the grass. And out of the valley.",
        },
      ],
      win: {
        who: "aunt-dot",
        text: "Beans back in the ground by Tuesday. Somebody fetch me a gazebo for the chickens.",
      },
      loss: { who: "lady-prismwick", text: "A brave effort. Three out of ten, for enthusiasm." },
    },
    {
      id: "signal-lost",
      act: 1,
      title: "Signal Lost",
      placeId: "rattlevane-junction",
      mapId: "rattlevane",
      missionId: "hill",
      enemy: "munch",
      side: 0,
      hook: "The Munch are chewing through the radio relays at Rattlevane Junction. Lose the windpump yard and the Grange Hall Radio goes quiet.",
      brief: [
        {
          who: "aunt-dot",
          text: "...hear me? Beetles are chewing the... *krrsh* ...hold the Junction...",
        },
        { who: "dr-graft", text: "Chew through the relays and nobody can hear Aunt Dot. Bliss." },
      ],
      win: {
        who: "aunt-dot",
        text: "Loud and clear. This is Grange Hall Radio, and we are back on the air.",
      },
      loss: {
        who: "mil-riders",
        text: "Junction's lost. We'll carry the messages by bike, and it'll be slow.",
      },
    },
    {
      id: "highway-robbery",
      act: 2,
      title: "Highway Robbery",
      placeId: "long-ridge-highway",
      mapId: "highway",
      missionId: "heist",
      enemy: "munch",
      side: 0,
      hook: hookOf("highway-robbery"),
      brief: [
        {
          who: "mil-grannies",
          text: "Somebody stole the Harvest Fair pie. Rhubarb. My recipe. Somebody is about to have a very bad day.",
        },
        { who: "dr-graft", text: "Rhubarb and Fizz. Big Mama approves." },
      ],
      win: { who: "mil-grannies", text: "Not a crumb missing. Well. One crumb." },
      loss: { who: "dr-graft", text: "Delicious. Tell the judges I'll be entering it." },
    },
    {
      id: "finders-keepers",
      act: 2,
      title: "Finders Keepers",
      placeId: "velvet-comet",
      mapId: "velvetcomet",
      missionId: "salvage",
      enemy: "concord",
      side: 0,
      hook: hookOf("finders-keepers"),
      brief: [
        {
          who: "lucky-lew",
          text: "There's three engines, a hot tub and a crystal chandelier in that wreck. I've got plans for all of them.",
        },
        { who: "con-guard", text: "Unhand the chandelier, peasant." },
      ],
      win: { who: "lucky-lew", text: "The Rust Bucket's got a chandelier now. Classy." },
      loss: { who: "con-guard", text: "Our yacht. Our wreckage. Our rules." },
    },
    {
      id: "the-gemhaul-road",
      act: 2,
      title: "The Gemhaul Road",
      placeId: "gemhaul-road",
      mapId: "gemhaul",
      missionId: "convoy",
      enemy: "concord",
      side: 1,
      hook: hookOf("the-gemhaul-road"),
      brief: [
        {
          who: "mil-riders",
          text: "Crystal caravan, stuck in the hills, guarded by people in very clean boots. Let's go.",
        },
        { who: "con-lancer", text: "Nine out of ten for the ambush. One point off for the dust." },
      ],
      win: {
        who: "mil-riders",
        text: "Fizz crystals in the saddlebags, and the Concord walking home.",
      },
      loss: { who: "con-lancer", text: "The caravan proceeds. Do mind the wheels." },
    },
    {
      id: "claim-jumpers",
      act: 2,
      title: "Claim Jumpers",
      placeId: "grubstake-redoubt",
      mapId: "grubstake",
      missionId: "siege",
      enemy: "munch",
      side: 0,
      hook: hookOf("claim-jumpers"),
      brief: [
        {
          who: "aunt-dot",
          text: "Fresh seam of Fizz at Grubstake. Dig in, and don't open the door to anything with more than four legs.",
        },
        { who: "dr-graft", text: "Knock knock. Never mind. We'll dig." },
      ],
      win: { who: "mil-grunts", text: "Still ours. Tell the doctor to make an appointment." },
      loss: { who: "dr-graft", text: "A lovely seam. My vats thank you." },
    },
    {
      id: "spare-parts",
      act: 3,
      title: "Spare Parts",
      placeId: "scrapyard-sprawl",
      mapId: "sprawl",
      missionId: "scrapheap",
      enemy: "munch",
      side: 0,
      hook: hookOf("spare-parts"),
      brief: [
        {
          who: "aunt-dot",
          text: "If the Munch get the Sprawl, Bertha never gets her new knee. Hold it.",
        },
        { who: "dr-graft", text: "Scrap metal and chewy farmers. Lunch and a hobby." },
      ],
      win: { who: "aunt-dot", text: "Sprawl's held. Bertha's getting that knee." },
      loss: { who: "aunt-dot", text: "They've got the scrapyard. We'll patch with baling wire." },
    },
    {
      id: "landing-party",
      act: 3,
      title: "Landing Party",
      placeId: "brinejaw-flats",
      mapId: "brinejaw",
      missionId: "frontline",
      enemy: "concord",
      side: 0,
      hook: hookOf("landing-party"),
      brief: [
        {
          who: "squinter",
          text: "Saucers on the salt. Lots of them. Saw 'em coming last Tuesday.",
        },
        { who: "grand-strider", text: "Do not be alarmed. You are merely being improved." },
      ],
      win: {
        who: "aunt-dot",
        text: "Salt flats cleared. Send His Radiance the bill for the barricades.",
      },
      loss: {
        who: "grand-strider",
        text: "The landing proceeds. Applause is optional, but noticed.",
      },
    },
  ],
  finale: {
    hook: "Every road in the valley leads to Fizzwater Ford, and {rival} got there first. Whoever holds the bridges holds the Wellspring.",
    brief: {
      who: "aunt-dot",
      text: "This is Grange Hall Radio. Everybody. To the ford. Bring everything, and I mean the goat.",
    },
    win: {
      who: "aunt-dot",
      text: "The ford is ours. Somebody tell the Wellspring it can stop worrying.",
    },
    loss: { who: "aunt-dot", text: "Fall back. Everybody home. Radio stays on." },
  },
  endings: {
    win: [
      {
        caption: "The Dustline Militia hold Fizzwater Ford, and the Wellspring under it.",
        placeId: "wellspring",
        title: "THE WELLSPRING HOLDS",
        who: "aunt-dot",
        text: "The Fizz stays where it belongs: in the creek, in the tractors, and in the pie.",
      },
      {
        caption:
          "The harvest comes in. The Harvest Fair goes ahead on Saturday, and the judging table survives.",
        placeId: "grange-hall",
        who: "mil-grannies",
        text: "Rhubarb, second place. Rigged.",
      },
    ],
    loss: [
      {
        caption: "The Wellspring is lost, to be {fate}.",
        placeId: "wellspring",
        title: "THE FORD IS LOST",
        who: "aunt-dot",
        text: "They've got the ford. They haven't got the valley.",
      },
      {
        caption:
          "But the farmers did not leave. The Grange Hall Radio is still broadcasting, and the war is not over. It is just rescheduled.",
        placeId: "grange-hall",
        who: "mil-grunts",
        text: "Same time next harvest?",
      },
    ],
  },
};

const MUNCH: FactionCampaign = {
  faction: "munch",
  title: "One Mind, Many Mouths",
  blurb:
    "Dr. Graft and Big Mama tunnel up through the fields to tap the Wellspring and wire the whole valley into the overmind.",
  prologue: [
    {
      caption: "Under Badger Knob, behind a steel door, the Sett Lab hums.",
      placeId: "sett-lab",
      who: "dr-graft",
      text: "They laughed at me at the Harvest Fair. Who's laughing now? Not the judging table.",
    },
    {
      caption: "Every critter in the valley could be wired into the overmind, with enough Fizz.",
      placeId: "sett-lab",
      who: "big-mama",
      text: "GRRRUMPH.",
    },
    {
      caption: "But the farmers are mustering, and the Concord have parked a monocle in the sky.",
      placeId: "grange-hall",
      who: "aunt-dot",
      text: "Everybody with a shovel, to the Crossing!",
    },
    {
      caption: "Tap the Wellspring. Brew the mutagen. Win the Harvest Fair, by eating it.",
      placeId: "dustbowl-crossing",
      who: "munch-nibblers",
      text: "Chk-chk-chk.",
    },
  ],
  openers: {
    1: [
      {
        caption:
          "The tunnels are dug, the critters are wired, and Big Mama is hungry. Up through the corn we go.",
        placeId: "sett-lab",
        who: "dr-graft",
        text: "Choose where we surface, my darlings. Whatever we don't bite, someone else will.",
      },
    ],
    2: [
      {
        caption: "Every hole in the valley is a door now.",
        placeId: "old-refinery",
        who: "dr-graft",
        text: "The refinery, the highway, the railway, the claim. So many doors, so little time.",
      },
    ],
    3: [
      {
        caption: "The Wellspring is stirring under the ford. The overmind can taste it.",
        placeId: "sett-lab",
        who: "big-mama",
        text: "GRRRUMPH!",
      },
    ],
  },
  battles: [
    {
      id: "up-through-the-corn",
      act: 1,
      title: "Up Through the Corn",
      placeId: "dustbowl-crossing",
      mapId: "dustbowl",
      missionId: "hold",
      enemy: "militia",
      side: 0,
      hook: "The first beetles of the season come up through the corn at Dustbowl Crossing. Take the silo deck before the rest of the valley gets there.",
      brief: [
        { who: "dr-graft", text: "Up, my darlings! The silo deck is a lovely spot for a picnic." },
        { who: "aunt-dot", text: "Beetles at the Crossing, same as '09. Everybody with a shovel!" },
      ],
      win: {
        who: "dr-graft",
        text: "The Crossing is ours. Tell the corn it's under new management.",
      },
      loss: { who: "dr-graft", text: "Back down the holes! Regroup! Mama, stop eating the fence." },
    },
    {
      id: "signal-lost",
      act: 1,
      title: "Signal Lost",
      placeId: "rattlevane-junction",
      mapId: "rattlevane",
      missionId: "hill",
      enemy: "militia",
      side: 0,
      hook: hookOf("signal-lost"),
      brief: [
        { who: "dr-graft", text: "Chew through the relays and nobody can hear Aunt Dot. Bliss." },
        {
          who: "aunt-dot",
          text: "This is Grange Hall Radio... *krrsh* ...who is chewing on the...",
        },
      ],
      win: { who: "dr-graft", text: "Silence. Glorious, farmer-free silence." },
      loss: {
        who: "aunt-dot",
        text: "This is Grange Hall Radio, and we are still on the air. Mind the wasps.",
      },
    },
    {
      id: "lawn-pests",
      act: 1,
      title: "Lawn Pests",
      placeId: "prismwick-lawn",
      mapId: "prismwick",
      missionId: "flag",
      enemy: "concord",
      side: 0,
      hook: "Lady Prismwick is holding a garden party on the old bean field. The Munch were not invited, and the cucumber sandwiches are unguarded.",
      brief: [
        { who: "dr-graft", text: "Cucumber sandwiches, crusts off. Bring me the platter." },
        { who: "lady-prismwick", text: "Critters. On the lawn. During the croquet." },
      ],
      win: { who: "dr-graft", text: "Delicious. Two out of ten. The crusts were missing." },
      loss: { who: "lady-prismwick", text: "Shoo. And take your molehills with you." },
    },
    {
      id: "last-drops",
      act: 2,
      title: "Last Drops",
      placeId: "old-refinery",
      mapId: "refinery",
      missionId: "scavenge",
      enemy: "concord",
      side: 0,
      hook: hookOf("last-drops"),
      brief: [
        {
          who: "dr-graft",
          text: "There's Fizz in those tanks. Enough mutagen for a thousand new mouths.",
        },
        { who: "con-warden", text: "This facility has been scheduled for tasteful demolition." },
      ],
      win: { who: "dr-graft", text: "Tanks drained, vats full. The overmind hums louder." },
      loss: { who: "con-warden", text: "The refinery's Fizz will light a lovely chandelier." },
    },
    {
      id: "highway-robbery",
      act: 2,
      title: "Highway Robbery",
      placeId: "long-ridge-highway",
      mapId: "highway",
      missionId: "heist",
      enemy: "militia",
      side: 0,
      hook: "The Harvest Fair's prize pie is riding up Long Ridge Highway on a wagon. Dr. Graft has decided to enter it, by eating it.",
      brief: [
        {
          who: "dr-graft",
          text: "Rhubarb and Fizz. Steal their pie, and keep your own snack out of their hands.",
        },
        { who: "mil-grannies", text: "Hands off that pie, you overgrown vermin." },
      ],
      win: { who: "big-mama", text: "CHOMP." },
      loss: { who: "mil-grannies", text: "Back on the wagon it goes. And you, back in your hole." },
    },
    {
      id: "claim-jumpers",
      act: 2,
      title: "Claim Jumpers",
      placeId: "grubstake-redoubt",
      mapId: "grubstake",
      missionId: "siege",
      enemy: "militia",
      side: 1,
      hook: hookOf("claim-jumpers"),
      brief: [
        { who: "dr-graft", text: "A fresh seam of Fizz, and a door in the way. We don't knock." },
        { who: "mil-grunts", text: "Nobody jumps this claim. Dig in!" },
      ],
      win: { who: "dr-graft", text: "Our claim now. The prospectors may keep their hats." },
      loss: { who: "mil-grunts", text: "Still ours. Tell the doctor to make an appointment." },
    },
    {
      id: "off-the-rails",
      act: 2,
      title: "Off the Rails",
      placeId: "gutterbend",
      mapId: "gutterbend",
      missionId: "shifting",
      enemy: "concord",
      side: 0,
      hook: hookOf("off-the-rails"),
      brief: [
        {
          who: "dr-graft",
          text: "Tunnel under the ore cars. Keep the ground moving and let the Concord fall over.",
        },
        { who: "con-guard", text: "The ground is moving. Again. This is intolerable." },
      ],
      win: { who: "dr-graft", text: "Glowing ore, and a Concord in a ditch. A fine day." },
      loss: { who: "con-guard", text: "The ore is ours. Kindly stop moving the scenery." },
    },
    {
      id: "spare-parts",
      act: 3,
      title: "Spare Parts",
      placeId: "scrapyard-sprawl",
      mapId: "sprawl",
      missionId: "scrapheap",
      enemy: "militia",
      side: 0,
      hook: hookOf("spare-parts"),
      brief: [
        { who: "dr-graft", text: "No spare parts, no walking combine. Chew the Sprawl to pieces." },
        {
          who: "aunt-dot",
          text: "If they get the Sprawl, Bertha never gets her new knee. Hold it!",
        },
      ],
      win: {
        who: "dr-graft",
        text: "The scrapyard is ours. Mama, that is a tractor, not a chew toy.",
      },
      loss: { who: "aunt-dot", text: "Sprawl's held. Bertha's getting that knee." },
    },
    {
      id: "the-narrows",
      act: 3,
      title: "The Narrows",
      placeId: "mesa-ridge",
      mapId: "mesa",
      missionId: "brawl",
      enemy: "concord",
      side: 0,
      hook: hookOf("the-narrows"),
      brief: [
        { who: "dr-graft", text: "Concord in the Narrows? Wonderful. They're crunchy." },
        { who: "grand-strider", text: "Something is chewing on my scouts. Make it stop." },
      ],
      win: { who: "dr-graft", text: "The Narrows are ours, and the canyon echoes with munching." },
      loss: { who: "grand-strider", text: "Pests. Even here. Tidy them away." },
    },
  ],
  finale: {
    hook: "Under Fizzwater Ford lies enough Fizz to wire the whole valley, and {rival} are standing on it. Take the bridges and the Wellspring is the overmind's.",
    brief: {
      who: "dr-graft",
      text: "Dig, my darlings. Dig! Under that ford is dinner for a thousand years.",
    },
    win: { who: "dr-graft", text: "The Wellspring is mine! Mama, fetch the big jars." },
    loss: {
      who: "dr-graft",
      text: "Retreat to the Sett Lab! I shall return, with bigger beetles.",
    },
  },
  endings: {
    win: [
      {
        caption: "The Munch hold Fizzwater Ford. The Wellspring flows into Dr. Graft's vats.",
        placeId: "wellspring",
        title: "THE OVERMIND FEEDS",
        who: "dr-graft",
        text: "One mind. Many mouths. And now, a great deal of Fizz.",
      },
      {
        caption:
          "Every critter in the valley hums with the overmind. This year, the Harvest Fair is the main course.",
        placeId: "sett-lab",
        who: "big-mama",
        text: "GRRRUMPH.",
      },
    ],
    loss: [
      {
        caption: "The Wellspring is lost, to be {fate}.",
        placeId: "wellspring",
        title: "THE FORD IS LOST",
        who: "dr-graft",
        text: "A setback. A temporary, deeply irritating setback.",
      },
      {
        caption:
          "The tunnels go quiet, for now. Dr. Graft is drawing up a bigger plan, on the back of an old pest-control invoice.",
        placeId: "sett-lab",
        who: "big-mama",
        text: "...grumph.",
      },
    ],
  },
};

const CONCORD: FactionCampaign = {
  faction: "concord",
  title: "A Tasteful Renovation",
  blurb:
    "His Radiance and Lady Prismwick set out to turn the Dustline into a pleasure garden, starting with the farmers.",
  prologue: [
    {
      caption: "From orbit, the Dustline glows. The Star Lens noticed.",
      placeId: "star-lens",
      who: "grand-strider",
      text: "Do not be alarmed. You are merely being improved.",
    },
    {
      caption: "Lady Prismwick has already replaced a bean farm with a croquet lawn.",
      placeId: "prismwick-lawn",
      who: "lady-prismwick",
      text: "Two out of ten. The beans were derivative.",
    },
    {
      caption: "The locals have not taken it well. Neither have the critters.",
      placeId: "grange-hall",
      who: "aunt-dot",
      text: "Everybody with a rifle, to the lawn!",
    },
    {
      caption:
        "Terrace the valley, light it from beneath, and make the Wellspring a fountain worthy of His Radiance.",
      placeId: "star-lens",
      who: "con-dancers",
      text: "A standing ovation is mandatory.",
    },
  ],
  openers: {
    1: [
      {
        caption:
          "The lawn is laid, the gazebos are polished, and the locals are standing on the grass. This will not do.",
        placeId: "prismwick-lawn",
        who: "lady-prismwick",
        text: "Choose where to be seen. Anywhere we are not, someone vulgar will be.",
      },
    ],
    2: [
      {
        caption: "The renovation spreads across the valley.",
        placeId: "star-lens",
        who: "grand-strider",
        text: "One cannot be everywhere at once. One simply ensures one's critics are.",
      },
    ],
    3: [
      {
        caption:
          "Beneath the ford, the Wellspring glows. His Radiance would like it in a fountain by the end of the season.",
        placeId: "star-lens",
        who: "grand-strider",
        text: "The fleet descends. Let the valley prepare its applause.",
      },
    ],
  },
  battles: [
    {
      id: "keep-off-the-grass",
      act: 1,
      title: "Keep Off the Grass",
      placeId: "prismwick-lawn",
      mapId: "prismwick",
      missionId: "grab",
      enemy: "militia",
      side: 0,
      hook: "The farmers want their bean field back. Lady Prismwick would like them off the croquet lawn, and out of the valley.",
      brief: [
        { who: "lady-prismwick", text: "Farmers. On the lawn. With shovels." },
        {
          who: "aunt-dot",
          text: "That's my bean farm under there. Take it back, one hedge at a time!",
        },
      ],
      win: {
        who: "lady-prismwick",
        text: "The lawn is restored. Somebody rake out the boot prints.",
      },
      loss: { who: "aunt-dot", text: "Beans back in the ground by Tuesday." },
    },
    {
      id: "lawn-pests",
      act: 1,
      title: "Lawn Pests",
      placeId: "prismwick-lawn",
      mapId: "prismwick",
      missionId: "flag",
      enemy: "munch",
      side: 0,
      hook: "Lady Prismwick's garden party is under attack from below. The Munch are after the cucumber sandwiches, and the Concord would like theirs back.",
      brief: [
        {
          who: "lady-prismwick",
          text: "There is a beetle in the sandwiches. Remove it. Remove all of them.",
        },
        { who: "dr-graft", text: "Cucumber sandwiches, crusts off. Bring me the platter!" },
      ],
      win: {
        who: "lady-prismwick",
        text: "Croquet resumes. Fill in the holes, please. Tastefully.",
      },
      loss: { who: "dr-graft", text: "Delicious. Two out of ten. The crusts were missing." },
    },
    {
      id: "a-better-view",
      act: 1,
      title: "A Better View",
      placeId: "mesa-ridge",
      mapId: "mesa",
      missionId: "hill",
      enemy: "militia",
      side: 0,
      hook: "His Radiance would like to see the whole valley from the twin mesas. The Ridgeline Squinter has been sitting on the view for years, and will not move.",
      brief: [
        { who: "grand-strider", text: "That ridge has the finest view in the valley. Clear it." },
        { who: "squinter", text: "Saw you coming last Tuesday." },
      ],
      win: {
        who: "grand-strider",
        text: "Magnificent. The valley looks so much better from above it.",
      },
      loss: { who: "squinter", text: "Still here. Still not blinking." },
    },
    {
      id: "last-drops",
      act: 2,
      title: "Last Drops",
      placeId: "old-refinery",
      mapId: "refinery",
      missionId: "scavenge",
      enemy: "munch",
      side: 0,
      hook: hookOf("last-drops"),
      brief: [
        { who: "con-warden", text: "The tanks hold Fizz enough to light a palace. Drain them." },
        { who: "dr-graft", text: "Hands off my mutagen, you glittering nuisance!" },
      ],
      win: {
        who: "con-warden",
        text: "The light flows to the Star Lens. The pipes may now be demolished.",
      },
      loss: { who: "dr-graft", text: "Tanks drained, vats full. The overmind hums louder." },
    },
    {
      id: "finders-keepers",
      act: 2,
      title: "Finders Keepers",
      placeId: "velvet-comet",
      mapId: "velvetcomet",
      missionId: "salvage",
      enemy: "militia",
      side: 1,
      hook: "Farmers have been stripping the Velvet Comet for parts all season, and sitting in its hot tub. Its owners have come back for it, and they are livid.",
      brief: [
        {
          who: "grand-strider",
          text: "That yacht was a gift from my cousin. Retrieve it. And the chandelier.",
        },
        { who: "lucky-lew", text: "Finders keepers. I've got plans for that chandelier." },
      ],
      win: { who: "con-guard", text: "Our yacht. Our wreckage. Our rules." },
      loss: { who: "lucky-lew", text: "The Rust Bucket's got a chandelier now. Classy." },
    },
    {
      id: "the-gemhaul-road",
      act: 2,
      title: "The Gemhaul Road",
      placeId: "gemhaul-road",
      mapId: "gemhaul",
      missionId: "convoy",
      enemy: "militia",
      side: 0,
      hook: hookOf("the-gemhaul-road"),
      brief: [
        {
          who: "con-lancer",
          text: "The caravan must reach the landing fields. Score the raiders as they come.",
        },
        {
          who: "mil-riders",
          text: "Crystal caravan, guarded by people in very clean boots. Let's go!",
        },
      ],
      win: { who: "con-lancer", text: "Delivered. Nine out of ten; one point off for the dust." },
      loss: {
        who: "mil-riders",
        text: "Fizz crystals in the saddlebags, and the Concord walking home.",
      },
    },
    {
      id: "off-the-rails",
      act: 2,
      title: "Off the Rails",
      placeId: "gutterbend",
      mapId: "gutterbend",
      missionId: "shifting",
      enemy: "munch",
      side: 0,
      hook: hookOf("off-the-rails"),
      brief: [
        {
          who: "grand-strider",
          text: "The ore glows. The ground moves. One of these is acceptable.",
        },
        { who: "dr-graft", text: "Keep digging, my darlings. Let them fall over." },
      ],
      win: { who: "con-guard", text: "The ore is ours. Kindly stop moving the scenery." },
      loss: { who: "dr-graft", text: "Glowing ore, and a Concord in a ditch. A fine day." },
    },
    {
      id: "landing-party",
      act: 3,
      title: "Landing Party",
      placeId: "brinejaw-flats",
      mapId: "brinejaw",
      missionId: "frontline",
      enemy: "militia",
      side: 0,
      hook: "His Radiance's main fleet sets down on Brinejaw Flats, and the farmers have dragged every barricade they own across the salt to say hello.",
      brief: [
        {
          who: "grand-strider",
          text: "The fleet lands today. See that the welcome is suitably grand.",
        },
        { who: "aunt-dot", text: "Everybody with a barricade, to the salt flats!" },
      ],
      win: {
        who: "grand-strider",
        text: "The fleet has landed. Applause is optional, but noticed.",
      },
      loss: {
        who: "aunt-dot",
        text: "Salt flats cleared. Send His Radiance the bill for the barricades.",
      },
    },
    {
      id: "the-narrows",
      act: 3,
      title: "The Narrows",
      placeId: "mesa-ridge",
      mapId: "mesa",
      missionId: "brawl",
      enemy: "munch",
      side: 0,
      hook: hookOf("the-narrows"),
      brief: [
        { who: "grand-strider", text: "Something is chewing on my scouts. Make it stop." },
        { who: "dr-graft", text: "Concord in the Narrows? Wonderful. They're crunchy." },
      ],
      win: { who: "grand-strider", text: "Pests, tidied. Plant a hedge where they were." },
      loss: { who: "dr-graft", text: "The Narrows are ours, and the canyon echoes with munching." },
    },
  ],
  finale: {
    hook: "The Wellspring lies under Fizzwater Ford, and {rival} are in the way. Clear the bridges, and the valley's glow belongs to His Radiance.",
    brief: {
      who: "grand-strider",
      text: "The Wellspring will make a magnificent fountain. Clear the ford of... everyone.",
    },
    win: { who: "grand-strider", text: "Magnificent. Now, about all this beige." },
    loss: {
      who: "lady-prismwick",
      text: "We are leaving. Not retreating. Leaving. There is a difference.",
    },
  },
  endings: {
    win: [
      {
        caption:
          "The Lumen Concord hold Fizzwater Ford. The Wellspring is polished into a fountain fit for His Radiance.",
        placeId: "wellspring",
        title: "A TASTEFUL VICTORY",
        who: "grand-strider",
        text: "At last, a world that glows back.",
      },
      {
        caption:
          "The Dustline is terraced, hedged and lit from beneath. Everyone is welcome, provided they keep off the lawn.",
        placeId: "prismwick-lawn",
        who: "lady-prismwick",
        text: "Nine out of ten. One point off for the farmers.",
      },
    ],
    loss: [
      {
        caption: "The Wellspring is lost, to be {fate}.",
        placeId: "wellspring",
        title: "THE FORD IS LOST",
        who: "grand-strider",
        text: "How very... rustic.",
      },
      {
        caption:
          "The Star Lens pulls back to a higher orbit, and the Court of Disdain begins a very long review of the whole valley.",
        placeId: "star-lens",
        who: "lady-prismwick",
        text: "One out of ten. Would not invade again. Probably.",
      },
    ],
  },
};

export const CAMPAIGNS: Record<LoreFactionId, FactionCampaign> = {
  militia: MILITIA,
  munch: MUNCH,
  concord: CONCORD,
};
