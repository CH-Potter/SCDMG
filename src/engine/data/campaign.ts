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
  swarm: "militia",
  concord: "militia",
};

/** What each side would do with the Wellspring (for `{fate}`). */
export const WELLSPRING_FATE: Record<LoreFactionId, string> = {
  militia: "left in the creek and poured in the Muster's engines",
  swarm: "filled with Mother Mandible's eggs",
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
    name: "Supply convoys",
    kind: "budget",
    amount: 2,
    flavour: "The only paved road in keeps the convoys rolling.",
  },
  "scrapyard-sprawl": {
    name: "Spare parts",
    kind: "budget",
    amount: 2,
    flavour: "Forty years of broken tractors and mine carts, and most of the bits still fit something.",
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
    byFaction: { militia: "mil-squinter", swarm: "swarm-spitters", concord: "con-lancer" },
    flavour: "Somebody up on the ridge comes down to help.",
  },
  "velvet-comet": {
    name: "Salvage from the wreck",
    kind: "unit",
    byFaction: { militia: "mil-rustler", swarm: "swarm-stingers", concord: "con-skiff" },
    flavour: "The wreck of the Velvet Comet still has a few good parts in it.",
  },
  "prismwick-lawn": {
    name: "The old bean field",
    kind: "support",
    byFaction: { militia: "mil-airstrip", swarm: "swarm-chamber", concord: "con-choir" },
    flavour: "Whoever holds the lawn holds the field behind it.",
  },
  "brinejaw-flats": {
    name: "A landing field",
    kind: "support",
    byFaction: { militia: "mil-dropship", swarm: "swarm-tunnels", concord: "con-gate" },
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
    "Marshal Haybright and the Dustline Muster hold their valley against the swarm from below and the snobs from above.",
  prologue: [
    {
      caption: "This season, the Dustline is under attack from two directions.",
      placeId: "grange-hall",
      who: "aunt-dot",
      text: "This is Grange Hall Command. Every section, to the Crossing. Rifles loaded, plates riveted, and nobody falls back without my say-so.",
    },
    {
      caption: "Lady Prismwick has turned the Haybright bean field into a croquet lawn.",
      placeId: "prismwick-lawn",
      who: "lady-prismwick",
      text: "Two out of ten. The beans were derivative.",
    },
    {
      caption: "The bean rows that are left have started to tremble, and the clicking is back.",
      placeId: "dustbowl-crossing",
      who: "broodmother",
      text: "*click-click* The ground is warm. The ground is ours.",
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
          "Bugs in the corn and a lawn where the beans were. The Marshal's ledger has two columns: positions to defend, and positions to take back.",
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
        text: "Dispatch from Command: trouble on the highway, the hills and the wreck. All at once. Naturally.",
      },
    ],
    3: [
      {
        caption:
          "The pipes at the Old Refinery are humming. Something under the ford is waking up.",
        placeId: "mesa-ridge",
        who: "squinter",
        text: "Ford's glowing. Been glowing since Tuesday. Logged it. Nobody asked me.",
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
      enemy: "swarm",
      side: 0,
      hook: hookOf("up-through-the-corn"),
      brief: [
        {
          who: "aunt-dot",
          text: "Bugs at the Crossing, same as '09. First Section holds the silo deck till the rest of the Muster gets there.",
        },
        { who: "swarm-skitterlings", text: "Chk-chk-chk-chk-chk." },
      ],
      win: { who: "aunt-dot", text: "Crossing held. Somebody hose down the silo, and count the shell casings." },
      loss: {
        who: "aunt-dot",
        text: "Fall back to the Grange in good order. The bugs can have the corn. For now.",
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
        text: "Beans back in the ground by Tuesday. The gazebos make decent sentry posts.",
      },
      loss: { who: "lady-prismwick", text: "A brave effort. Three out of ten, for the marching." },
    },
    {
      id: "signal-lost",
      act: 1,
      title: "Signal Lost",
      placeId: "rattlevane-junction",
      mapId: "rattlevane",
      missionId: "hill",
      enemy: "swarm",
      side: 0,
      hook: "The swarm is chewing through the radio cables at Rattlevane Junction. Lose the windpump yard and Grange Hall Command goes quiet.",
      brief: [
        {
          who: "aunt-dot",
          text: "...hear me? Bugs are chewing the... *krrsh* ...hold the Junction...",
        },
        { who: "broodmother", text: "*click* Quiet up there. Quiet is good. Quiet is food." },
      ],
      win: {
        who: "aunt-dot",
        text: "Loud and clear. This is Grange Hall Command, and we are back on the air.",
      },
      loss: {
        who: "mil-riders",
        text: "Junction's lost. We'll carry the orders by bike, and it'll be slow.",
      },
    },
    {
      id: "highway-robbery",
      act: 2,
      title: "Highway Robbery",
      placeId: "long-ridge-highway",
      mapId: "highway",
      missionId: "heist",
      enemy: "swarm",
      side: 0,
      hook: hookOf("highway-robbery"),
      brief: [
        {
          who: "mil-grannies",
          text: "Something came up under my convoy and walked off with a crate of Fizz cells. Signed for. In triplicate. Somebody is about to have a very bad day.",
        },
        { who: "broodmother", text: "*click-click* Warm. Glowing. For the eggs." },
      ],
      win: { who: "mil-grannies", text: "Crate recovered, seal intact. Well. One dent." },
      loss: { who: "broodmother", text: "*chitter* The eggs are warm tonight." },
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
          text: "Three engines, a hull's worth of armour plate and a crystal chandelier in that wreck. I've got plans for all of them.",
        },
        { who: "con-guard", text: "Unhand the chandelier, peasant." },
      ],
      win: { who: "lucky-lew", text: "The Rust Bucket's got new plating and a chandelier. Classy." },
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
          text: "Crystal caravan, stuck in the hills, guarded by people in very clean boots. Outriders, mount up.",
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
      enemy: "swarm",
      side: 0,
      hook: hookOf("claim-jumpers"),
      brief: [
        {
          who: "aunt-dot",
          text: "Fresh seam of Fizz at Grubstake. Dig in, and don't open the door to anything with more than four legs.",
        },
        { who: "old-grinder", text: "GRRRRRNNNNNND." },
      ],
      win: { who: "mil-grunts", text: "Still ours. Tell the bugs to fill in a requisition form." },
      loss: { who: "broodmother", text: "*click-click* Warm seam. Good nest." },
    },
    {
      id: "spare-parts",
      act: 3,
      title: "Spare Parts",
      placeId: "scrapyard-sprawl",
      mapId: "sprawl",
      missionId: "scrapheap",
      enemy: "swarm",
      side: 0,
      hook: hookOf("spare-parts"),
      brief: [
        {
          who: "aunt-dot",
          text: "If the swarm gets the Sprawl, nobody gets new plating, and Bertha never gets her new knee. Hold it.",
        },
        { who: "swarm-spitters", text: "Hhhhk. Ptoo." },
      ],
      win: { who: "aunt-dot", text: "Sprawl's held. Bertha's getting that knee." },
      loss: { who: "aunt-dot", text: "They've got the scrapyard. We'll patch the armour with what we carry." },
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
      text: "This is Grange Hall Command. The whole Muster, to the ford. Every section, every machine, and yes, the goat.",
    },
    win: {
      who: "aunt-dot",
      text: "The ford is ours. Somebody tell the Wellspring it can stop worrying.",
    },
    loss: { who: "aunt-dot", text: "Fall back in good order. Everybody home. Radio stays on." },
  },
  endings: {
    win: [
      {
        caption: "The Dustline Muster holds Fizzwater Ford, and the Wellspring under it.",
        placeId: "wellspring",
        title: "THE WELLSPRING HOLDS",
        who: "aunt-dot",
        text: "The Fizz stays where it belongs: in the creek, in the war machines, and in the pie.",
      },
      {
        caption:
          "The harvest comes in. The Muster stands down for the Harvest Fair on Saturday, and the judging table survives.",
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
          "But the Muster did not break. Grange Hall Command is still broadcasting, the squads are still drilling, and the war is not over. It is just rescheduled.",
        placeId: "grange-hall",
        who: "mil-grunts",
        text: "Same time next harvest, Marshal?",
      },
    ],
  },
};

const SWARM: FactionCampaign = {
  faction: "swarm",
  title: "Everything Hatches",
  blurb:
    "Mother Mandible and her brood boil up out of the ground to reach the Wellspring and lay the Great Clutch in its warmth.",
  prologue: [
    {
      caption: "Under Badger Knob, in the warm dark of the Brood Hollow, a thousand eggs glow.",
      placeId: "brood-hollow",
      who: "broodmother",
      text: "*click-click* The ground is warm. The ground is ours.",
    },
    {
      caption: "The Hollow is full to the ceiling. The brood needs more room, and more warmth.",
      placeId: "brood-hollow",
      who: "old-grinder",
      text: "GRRRRRNNNNNND.",
    },
    {
      caption: "But up above, the soft ones are drilling in their armour, and the shiny ones have hung a lamp in the sky.",
      placeId: "grange-hall",
      who: "aunt-dot",
      text: "Every section, to the Crossing!",
    },
    {
      caption: "Reach the Wellspring. Lay the Great Clutch. Let the whole valley hatch.",
      placeId: "dustbowl-crossing",
      who: "swarm-skitterlings",
      text: "Chk-chk-chk.",
    },
  ],
  openers: {
    1: [
      {
        caption:
          "The tunnels are dug, the brood is awake, and the corn above is very thin. Up we go.",
        placeId: "brood-hollow",
        who: "broodmother",
        text: "*click... click* Choose where we surface, little ones. Where we do not go, the soft ones dig in.",
      },
    ],
    2: [
      {
        caption: "Every field in the valley trembles now.",
        placeId: "old-refinery",
        who: "broodmother",
        text: "*chitter-chitter* The warm pipes. The road. The glowing rocks. So many nests.",
      },
    ],
    3: [
      {
        caption: "The Wellspring is stirring under the ford. Every egg in the Hollow can feel it.",
        placeId: "brood-hollow",
        who: "old-grinder",
        text: "GRRRRRNNNNNND!",
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
      hook: "The first Skitterlings of the season come up through the corn at Dustbowl Crossing. Take the silo deck before the rest of the Muster gets there.",
      brief: [
        { who: "broodmother", text: "*click-click* Up, little ones. The tall thing in the middle is warm in the sun." },
        { who: "aunt-dot", text: "Bugs at the Crossing, same as '09. First Section, hold that deck!" },
      ],
      win: {
        who: "broodmother",
        text: "*chitter* The corn is ours. The corn was always ours.",
      },
      loss: { who: "broodmother", text: "*click... click* Back down. Lay more. Come up again." },
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
        { who: "broodmother", text: "*click* The soft ones talk through the long wires. Chew the wires." },
        {
          who: "aunt-dot",
          text: "This is Grange Hall Command... *krrsh* ...who is chewing on the...",
        },
      ],
      win: { who: "broodmother", text: "*click-click* Quiet up there. Quiet is good." },
      loss: {
        who: "aunt-dot",
        text: "This is Grange Hall Command, and we are still on the air. Check your boots for bugs.",
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
      hook: "Lady Prismwick is holding a garden party on the old bean field. The lawn is soft, the soil underneath is warm, and the cucumber sandwiches are unguarded.",
      brief: [
        { who: "broodmother", text: "*chitter* Soft grass. Warm soil. Good for eggs. Take the shiny thing they guard." },
        { who: "lady-prismwick", text: "Insects. On the lawn. During the croquet." },
      ],
      win: { who: "swarm-skitterlings", text: "Chk-chk-crunch." },
      loss: { who: "lady-prismwick", text: "Shoo. And take your holes with you." },
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
          who: "broodmother",
          text: "*click-click* Warm Fizz in the round tanks. Carry it home to the eggs.",
        },
        { who: "con-warden", text: "This facility has been scheduled for tasteful demolition." },
      ],
      win: { who: "broodmother", text: "*chitter-chitter* Tanks empty. Eggs warm. More will hatch." },
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
      hook: "A Muster convoy is rumbling up Long Ridge Highway with a crate of Fizz cells: warm, glowing Fizz cells. Mother Mandible would like them for the egg chambers.",
      brief: [
        {
          who: "broodmother",
          text: "*click* Warm boxes on the hard road. Take theirs. Keep ours.",
        },
        { who: "mil-grannies", text: "Hands off that crate, you overgrown cockroaches. It's signed for." },
      ],
      win: { who: "broodmother", text: "*click-click* Warm. Glowing. For the eggs." },
      loss: { who: "mil-grannies", text: "Back on the truck it goes. And you, back in your hole." },
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
        { who: "old-grinder", text: "GRRRRRNNNNNND." },
        { who: "mil-grunts", text: "Nobody jumps this claim. Dig in!" },
      ],
      win: { who: "broodmother", text: "*click-click* Warm seam. Good nest." },
      loss: { who: "mil-grunts", text: "Still ours. Tell the bugs to fill in a requisition form." },
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
          who: "old-grinder",
          text: "GRRRNND. GRRRRRNNNND.",
        },
        { who: "con-guard", text: "The ground is moving. Again. This is intolerable." },
      ],
      win: { who: "broodmother", text: "*chitter* Glowing rocks, and a shiny one in a ditch. Good day." },
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
        { who: "broodmother", text: "*click* The soft ones wear shells they make in the rust pile. No pile, no shells." },
        {
          who: "aunt-dot",
          text: "If they get the Sprawl, nobody gets new plating. Hold it!",
        },
      ],
      win: {
        who: "broodmother",
        text: "*chitter-chitter* The rust pile is ours. Their shells will crack.",
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
        { who: "broodmother", text: "*click-click* Shiny ones in the canyon. They crunch." },
        { who: "grand-strider", text: "Something is chewing on my scouts. Make it stop." },
      ],
      win: { who: "swarm-skitterlings", text: "Chk-chk-chk-crunch-chk." },
      loss: { who: "grand-strider", text: "Pests. Even here. Tidy them away." },
    },
  ],
  finale: {
    hook: "Under Fizzwater Ford lies the Wellspring, the warmest place in the valley, and {rival} are standing on it. Take the bridges and the Great Clutch can be laid.",
    brief: {
      who: "broodmother",
      text: "*CLICK-CLICK-CLICK* Down there is the warm place. All of you. Now.",
    },
    win: { who: "broodmother", text: "*chitter...* Warm. So warm. Lay the Great Clutch." },
    loss: {
      who: "broodmother",
      text: "*click... click* Back to the Hollow. Lay more. The ground remembers.",
    },
  },
  endings: {
    win: [
      {
        caption: "The Skitterswarm holds Fizzwater Ford. In the warmth of the Wellspring, Mother Mandible lays the Great Clutch.",
        placeId: "wellspring",
        title: "EVERYTHING HATCHES",
        who: "broodmother",
        text: "*click-click* The ground is warm. The ground is ours. The ground is hungry.",
      },
      {
        caption:
          "Come spring, every field in the valley hatches. The Harvest Fair goes ahead, in a manner of speaking.",
        placeId: "brood-hollow",
        who: "old-grinder",
        text: "GRRRRRNNNNNND.",
      },
    ],
    loss: [
      {
        caption: "The Wellspring is lost, to be {fate}.",
        placeId: "wellspring",
        title: "THE FORD IS LOST",
        who: "broodmother",
        text: "*click... click* Cold. The ford is cold.",
      },
      {
        caption:
          "The tunnels go quiet, for now. Deep in the Brood Hollow, Mother Mandible curls around her eggs and waits. The ground remembers.",
        placeId: "brood-hollow",
        who: "swarm-tenders",
        text: "...chk.",
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
      caption: "The locals have not taken it well. Neither has whatever lives under the lawn.",
      placeId: "grange-hall",
      who: "aunt-dot",
      text: "Every section, to the lawn!",
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
      enemy: "swarm",
      side: 0,
      hook: "Lady Prismwick's garden party is under attack from below. The swarm is coming up through the lawn after the cucumber sandwiches, and the Concord would like theirs back.",
      brief: [
        {
          who: "lady-prismwick",
          text: "There is an insect in the sandwiches. Remove it. Remove all of them.",
        },
        { who: "broodmother", text: "*chitter* Soft grass. Warm soil. Good for eggs." },
      ],
      win: {
        who: "lady-prismwick",
        text: "Croquet resumes. Fill in the holes, please. Tastefully.",
      },
      loss: { who: "swarm-skitterlings", text: "Chk-chk-crunch." },
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
      hook: "His Radiance would like to see the whole valley from the twin mesas. Corporal Squinter has been sitting on the view for years, and will not move.",
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
      enemy: "swarm",
      side: 0,
      hook: hookOf("last-drops"),
      brief: [
        { who: "con-warden", text: "The tanks hold Fizz enough to light a palace. Drain them." },
        { who: "broodmother", text: "*CLICK* Warm Fizz. Ours. For the eggs." },
      ],
      win: {
        who: "con-warden",
        text: "The light flows to the Star Lens. The pipes may now be demolished.",
      },
      loss: { who: "broodmother", text: "*chitter-chitter* Tanks empty. Eggs warm. More will hatch." },
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
      hook: "Farmers in tin suits have been stripping the Velvet Comet for armour plate all season, and sitting in its hot tub. Its owners have come back for it, and they are livid.",
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
      enemy: "swarm",
      side: 0,
      hook: hookOf("off-the-rails"),
      brief: [
        {
          who: "grand-strider",
          text: "The ore glows. The ground moves. One of these is acceptable.",
        },
        { who: "old-grinder", text: "GRRRNND. GRRRRRNNNND." },
      ],
      win: { who: "con-guard", text: "The ore is ours. Kindly stop moving the scenery." },
      loss: { who: "broodmother", text: "*chitter* Glowing rocks, and a shiny one in a ditch. Good day." },
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
      hook: "His Radiance's main fleet sets down on Brinejaw Flats, and the farmers in their riveted suits have dragged every barricade they own across the salt to say hello.",
      brief: [
        {
          who: "grand-strider",
          text: "The fleet lands today. See that the welcome is suitably grand.",
        },
        { who: "aunt-dot", text: "Every section with a barricade, to the salt flats!" },
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
      enemy: "swarm",
      side: 0,
      hook: hookOf("the-narrows"),
      brief: [
        { who: "grand-strider", text: "Something is chewing on my scouts. Make it stop." },
        { who: "broodmother", text: "*click-click* Shiny ones in the canyon. They crunch." },
      ],
      win: { who: "grand-strider", text: "Pests, tidied. Plant a hedge where they were." },
      loss: { who: "swarm-skitterlings", text: "Chk-chk-chk-crunch-chk." },
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
  swarm: SWARM,
  concord: CONCORD,
};
