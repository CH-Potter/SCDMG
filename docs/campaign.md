# The campaign: The Dustline War

The campaign strings Skirmish and Assault battles into one war for the Dustline valley, told from the side you pick. Each built-in faction has its own story through the same war, in its leader's voice, and every one of them ends at Fizzwater Ford, over the Wellspring. The story comes from the lore ([docs/lore.md](lore.md)).

Open it from **⚔ Campaign** on the main menu.

## Your side

| Side | Campaign | Led by | What they want |
| --- | --- | --- | --- |
| Dustline Militia | *Not One Inch* | Aunt Dot Haybright | Hold the valley, get Haybright Farm back, keep the Wellspring for the people who were here first. |
| The Munch | *One Mind, Many Mouths* | Dr. Graft (and Big Mama) | Tap the Wellspring and wire every critter in the valley into the overmind. |
| Lumen Concord | *A Tasteful Renovation* | His Radiance, the Grand Strider | Turn the valley into a pleasure garden, with the Wellspring as its fountain. |

Each side fights a different set of battles (the ones its story puts it in), speaks its own lines before and after them, and has its own win and loss endings.

## How the war works

- **Three acts and a finale.** Act I (The Muster), Act II (The War Spreads) and Act III (The Wellspring) each offer three or four battles on the campaign map. You fight 2, 2 and 1 of them, in any order.
- **Win and you hold the place; lose and the enemy takes it.** A draw leaves the place as it was.
- **You can't be everywhere.** When an act ends, every battle you skipped falls to its enemy (unless you fought for that place yourself that act), and the battles between the other two sides are settled off-screen. The map and the story so far show what happened.
- **Losing costs you, but never ends the war.** A lost battle (or a retreat) hands the place to the enemy and leaves your army battered: ⚙3 less roster budget for the next battle only.
- **The finale** is the Battle of Fizzwater Ford (Hold the Line, Skirmish), against whichever rival holds more of the valley's battlefields when Act III ends. Win it and you hold the Wellspring; lose it and they do. Either way it is the end of the war, with an ending for each. A drawn finale is fought again.

You always play against the AI, which plays the other side. In a two-sided mission (Claim-Jump Siege, Salvage Rights, Strongbox Run) the campaign picks the side your story puts you on.

## Places and perks

Every battlefield in the valley gives whoever holds it a small perk in later battles. You start with the places your side holds in the lore.

| Place | Perk |
| --- | --- |
| Dustbowl Crossing (the silo deck) | +1 CP at the start of every battle |
| Rattlevane Junction (the radio relays) | +1 CP at the start of every battle |
| The Old Refinery, Gutterbend, The Gemhaul Road | +1 starting resource each |
| Long Ridge Highway, Scrapyard Sprawl, Grubstake Redoubt | +2 roster budget each |
| Mesa Ridge | A free unit in every battle: a Ridgeline Squinter (Militia), Web-Gunner Spiders (Munch) or a Ray Lancer (Concord) |
| Wreck of the Velvet Comet | A free unit in every battle: a Sky Rustler, Bomb Wasps or a Shimmer Saucer (by side, as above) |
| Lady Prismwick's Lawn | A free support card (no Fizz): Dirt Airstrip, Deep Burrows or Choir of Light (by side) |
| Brinejaw Flats | A free support card (no Fizz): Rust Bucket Drop-Ship, Tunnel Network or Light Gate (by side) |

Perks add up, but each kind is capped per battle: at most +2 CP, +2 starting resources, +3 roster budget, one free unit and one free support card. The caps were checked with AI-vs-AI sims: the biggest start-of-battle edge (+2 CP and +2 resources) lifts the AI's Skirmish score from about 44% to 54%; an uncapped +4 resources would have made it 67%. The campaign screen lists your perks and marks any that are over the limit. Only you get perks; the AI fights with its starter army at the act's budget.

## Your army

Your army carries over from battle to battle: one roster for Skirmish battles and one for Assault battles. **Muster army** opens the list builder for that roster, with the faction and mode fixed and the campaign's budget in place of the mode's limit (unit counts, copies and Fizz follow the mode as usual).

The budget grows as the war escalates, and the AI's army is trimmed to the same budget:

| | Skirmish | Assault |
| --- | --- | --- |
| Act I | ⚙24 | ⚙45 |
| Act II | ⚙27 | ⚙50 |
| Act III and the finale | ⚙30 | ⚙55 |

On top of that come the roster-budget perks, minus ⚙3 if your army is battered. If your roster no longer fits (after a loss, say), the briefing shows **Trim to fit**, or muster it again.

## Story scenes

Short comic-panel scenes play when the campaign starts, before and after each battle, as each act opens, and at the end. They use the same player as the game intro: click, Esc, Space or **Skip** skips them, and with *reduce motion* on they show as a still comic page. Untick **Story scenes** on the campaign screen to turn them off; **▶ Briefing** replays a battle's scene.

## Saves

The campaign saves itself in the browser (or the desktop app's data folder) after every change. There is one campaign at a time:

- **Export save** downloads it as a `.json` file, and **Import…** loads one back (a save from another version of the game, or a corrupt file, is refused rather than half-loaded).
- **Abandon** deletes the campaign so you can start again, as any side.
- In a battle, **⚑ Retreat** on the top bar leaves it as a defeat. Closing the game mid-battle doesn't count: the battle is still on offer when you come back.

## For developers

- The war's rules are pure and deterministic, in [`src/engine/campaign.ts`](../src/engine/campaign.ts): `newCampaign`, `availableBattles`, `recordResult`, `perkTotals`, `budgetFor`, `battleSetup` (everything `createGame` needs, including the perks), and `parseCampaign` / `serializeCampaign` for saves.
- The campaign data (each side's battles, lines, perks, budgets) is in [`src/engine/data/campaign.ts`](../src/engine/data/campaign.ts), built on the battle seeds, places and characters in `lore.ts`.
- Perks reach the engine through one small option, `GameSetup.startBonus` (extra starting resources and CP per side), plus the lists and supports passed to `createGame`. No rules, stats or scoring change.
- The screen is [`src/ui/campaign/`](../src/ui/campaign/) (loaded on first use), and the story scenes reuse the intro player in `src/ui/intro/`.
- [`tests/campaign.test.ts`](../tests/campaign.test.ts) checks every battle's mission fits its map, every speaker and perk exists, the branching, that each side reaches an ending whether it wins or loses, perks reaching `createGame`, and saves.
- `SIM_BONUS="resources=2,cp=2"` gives side A of the AI-vs-AI sim the biggest start-of-battle perk the caps allow, to check it stays modest.
