# Lore of the Dustline

The story behind SCDMG: the world, the war, the three sides and the places they fight over. In the game, open **📖 Lore** from the main menu (or **Read their story ›** under an army, or **📖 Lore** on a built-in faction in the Faction forge).

The canonical version lives in code, in [`src/engine/data/lore.ts`](../src/engine/data/lore.ts), so the lore pages, the intro animations and any future campaign all read from the same place. `tests/lore.test.ts` checks that it only names units, supports, maps and missions that exist, and that this page mentions every character, place and battle. If you change one, change the other.

## The Dustline

Out where the paved road gives up and the corn does not, there is a long, dry farming valley called the Dustline. A fizzing creek runs down the middle of it, the soil is suspiciously good, the pumpkins are enormous, and the pies are the best for three hundred miles. Nobody asks too many questions about any of this, because the answer is under the ford.

### The Fizz and the Wellspring

Under the valley runs the Fizz: bubbling, faintly glowing mineral water that rises through the Fizzwater creek. It makes crops grow like they have somewhere to be, and it keeps forty-year-old engines running on fumes and spite. The farmers pour it in the tractors. Dr. Graft brews it into mutagen. The Lumen Concord refine it into light. Its source, the Wellspring, lies deep under Fizzwater Ford, and whoever holds the Wellspring holds the Dustline. (The fizz you spend on support cards is a little of the same stuff.)

### The Dustline War

This season, the harvest is under attack from two directions. From below, Dr. Graft's Munch are tunnelling up through the fields to tap the Wellspring and wire every critter in the valley into his overmind. From above, the Lumen Concord have parked the Star Lens in orbit and begun landscaping the valley into a tasteful pleasure garden for His Radiance, with the Wellspring as its fountain. In between, the Dustline Militia have mustered at the Grange Hall with every rifle, tractor and grandmother they own. Three sides, one valley, and nobody is leaving.

### How we got here

| When | What happened |
| --- | --- |
| Generations ago | **The Settling.** Wagons of settlers followed the creek into the valley, noticed the water fizzed, decided that was probably fine, and stayed. They built windpumps, a Grange Hall and a very long fence, and started arguing about whose pie was best. The argument continues. |
| The boom years | **The Fizz Boom.** Fizz ran a tractor better than diesel, and the valley boomed. The Old Refinery bottled it, the Long Ridge Highway hauled it out, and ore trains rattled past Gutterbend. Then the shallow seam went flat, the refinery closed, a train came off the rails and stayed off, and everyone went back to farming, with a great deal of interesting scrap. |
| Some years back | **The Pest Problem.** A beetle plague hit the corn, and the county hired a pest-control scientist, Dr. Graft. He dealt with it by putting the beetles in charge. When his prize marrow ate the judging table at the Harvest Fair, the Grange banned him for life, and he took his grudge underground, into the old badger sett on Badger Knob. |
| The Harvest of '09 | **Up Through the Corn.** The Chrome-Jaw Beetles came up through the corn for the first time. The farmers held them at Dustbowl Crossing with shovels, a combine and a great deal of shouting. Big Bertha got legs that winter and a cannon the winter after. The Ridgeline Squinter has not blinked since. |
| Last autumn | **The Glow in the Dark.** From orbit, the Fizz shows up as a soft glow. The Concord pleasure yacht Velvet Comet came down to admire it and planted itself in a debris field. Its passengers walked away unhurt and deeply offended, and sent a message home: we have found something lovely, and it is surrounded by farmers. |
| This season | **The Dustline War.** The Star Lens has moved into orbit above the valley. Lady Prismwick has replaced the Haybright bean farm with a croquet lawn. Gopher holes are opening in the bean rows that are left. Aunt Dot has called a meeting at the Grange Hall, and attendance is compulsory. |

## The three sides

### Dustline Militia: the farmers who will not leave

*Rivets, rifles and a very long memory.*

The Dustline Militia is not really an army. It is every family in the valley, a radio and a scrapyard, and that has turned out to be enough. When trouble comes, Aunt Dot gets on the Grange Hall Radio and the valley turns up: Rivet Grunts with riveted rifles and shovels, Patch Medics with staple guns and a cheerful bedside manner, and the Front Porch Grannies, who have been sitting on that porch for years waiting for something exactly like this.

Their war machines come out of the barn and the Scrapyard Sprawl. Big Bertha is a combine harvester with legs and a cannon. The Sky Rustler is a crop duster with opinions. The Hay Bomber drops the farm's finest from a great height, and the Rust Bucket Drop-Ship is older than most of its passengers. They are not fast, and they do not like getting close, but dig them in behind a fence and they will hold it until the cows come home.

- **Leader: Aunt Dot Haybright**, chair of the Grange Hall committee and the voice of the Grange Hall Radio. Nobody elected her; she just switched the radio on and started giving orders, and nobody has dared switch it off. It was her bean farm Lady Prismwick turned into a lawn. *"This is Grange Hall Radio. Everybody with a rifle, to the Crossing. Everybody without one, bring sandwiches."*
- **Lucky Lew**, pilot of the Rust Bucket Drop-Ship and sole staff of the Dirt Airstrip. He swears he has done every landing before.
- **The Ridgeline Squinter**, lookout of Mesa Ridge. Nobody remembers their real name, including them.
- **Big Bertha**, the Haybright family combine, now walking and armed.
- **Wants:** to hold the valley, bring the harvest in, get Haybright Farm back from the Concord, and keep the Wellspring flowing for the people who were here first.
- **At stake:** the farms, the Grange Hall, the Harvest Fair and three generations of pie recipes. If the Militia lose, the Dustline becomes either a lawn or a lunch.
- **Home:** the Grange Hall.

### The Munch: Dr. Graft's critter army

*One mind. Many mouths.*

Dr. Graft was hired to fix the valley's beetle problem, and in a sense he did: now the beetles have a boss. Banned from the Grange, he built the Sett Lab in the old badger sett under Badger Knob, where he met Big Mama, an ordinary and extremely grumpy badger, and gave her a chrome overmind implant, a course of Fizz-brewed mutagen and a saddle. Every critter that followed (Chrome-Jaw Beetles, Web-Gunner Spiders, Piston Foxes, Bomb Wasps, Steel-Jaw Crows, a skunk with a mortar) got an implant of its own, and with it the overmind: one humming thought, which is Dr. Graft's.

The Munch do not shoot well, wear armour or stay frightened for long. They come up out of the ground by the dozen, bite, get knocked down, and come back slightly damp.

- **Leader: Dr. Graft**, bioengineer, overmind of the Munch, banned from the Harvest Fair. He rides to war on Big Mama, waving a test tube. *"They laughed at me at the Harvest Fair. Who's laughing now? Not the judging table."*
- **Big Mama**, his war-badger: the size of a tractor, still grumpy, and the only member of the Munch who can overrule him (at mealtimes).
- **Wants:** to tap the Wellspring, brew enough mutagen to wire every critter in the valley into the overmind, and make the Dustline one big, humming, hungry farm. Also to win the Harvest Fair, by eating it.
- **At stake:** Dr. Graft's life's work, and Big Mama's dinner. Lose the Wellspring and the overmind goes hungry, and Dr. Graft would have to go back to pest control. He would rather be eaten.
- **Home:** The Sett Lab.

### Lumen Concord: invaders from beyond the Star Lens

*Few, bright and insufferable.*

The Lumen Concord are a very old, very bright civilisation that has toured the stars for so long it has run out of things to admire. When the Star Lens picked up the valley's glow, His Radiance sent the pleasure yacht Velvet Comet to take a look. It crashed. So His Radiance came in person. The Star Lens now hangs over the valley like a monocle, saucers glide down through Light Gates, and Lady Prismwick has already replaced Haybright Farm's bean fields with a croquet lawn.

The Concord are few, and every one of them is a specialist. They do not consider this an invasion. They consider it a renovation. The locals are welcome to stay, provided they keep off the lawn.

- **Leader: His Radiance, the Grand Strider**, Supreme Luminary of the Lumen Concord, on three gleaming legs. He believes he is the main character. He is, unfortunately, correct. *"Do not be alarmed. You are merely being improved."*
- **Lady Prismwick**, Keeper of Lawns and chair of the Court of Disdain. They would like the farmers to stop standing on the grass.
- **Wants:** to turn the Dustline into a pleasure garden worthy of His Radiance: terraced, hedged, lit from beneath by the Wellspring, and free of farmers, critters and anything beige.
- **At stake:** their saucers, gates and shields run on refined light, and the Wellspring is the brightest source in a thousand worlds. More importantly, losing to a valley of farmers would be embarrassing, and the Concord would rather do almost anything than be embarrassed.
- **Home:** The Star Lens, with His Radiance's flagship, the Bright Palace, beside it.

Every unit and support card also has a line of lore; see each faction's page in the game.

## Places

| Place | Battlefield | Held by | |
| --- | --- | --- | --- |
| The Grange Hall | | Militia | The valley's community hall, and now the Militia's headquarters. The radio broadcasts from a folding table next to the urn. |
| Haybright Farm | | Militia | Aunt Dot's family farm, and the barn Big Bertha lives in. Half of it is now a lawn. |
| Dustbowl Crossing | Dustbowl Crossing | Militia | The crossroads under the old silo. Whoever holds the silo deck sees the whole middle of the valley. |
| Mesa Ridge | Mesa Ridge | nobody | The canyon maze on the western rim, and the Ridgeline Squinter's perch. |
| The Old Refinery | Old Refinery | nobody | Where the Fizz was bottled in the boom years. The pipes still hum when the Wellspring stirs. |
| Long Ridge Highway | Long Ridge Highway | Militia | The only paved road in, broken in the middle. The Munch use it too, from underneath. |
| Scrapyard Sprawl | Scrapyard Sprawl | Militia | Forty years of broken tractors round the old smelter, where every Militia machine began. |
| Rattlevane Junction | Rattlevane Junction | Militia | The windpump yard where the radio relays meet. Lose it and the Militia go deaf. |
| Fizzwater Ford | Fizzwater Ford | nobody | Two mills, two bridges and a slow ford, with the Wellspring beneath. Every road leads here. |
| The Wellspring | | nobody | The glowing source of the Fizz, deep under the ford. Nobody has seen it; everybody wants it. |
| Lady Prismwick's Lawn | Lady Prismwick's Lawn | Concord | Haybright Farm's bean fields, now a croquet lawn with hedges and glass gazebos. |
| Brinejaw Flats | Brinejaw Flats | Concord | Salt flats at the southern end where the Concord land their saucers. |
| Gutterbend | Gutterbend Derailment | nobody | A boom-years ore train that came off the rails. The ore still glows. |
| Grubstake Redoubt | Grubstake Redoubt | Militia | A prospectors' dugout on a raised bank, guarding a claim stake. |
| The Gemhaul Road | Gemhaul Ambush | Concord | The hill road for Concord crystal caravans. Popular with raiders. |
| Wreck of the Velvet Comet | Wreck of the Velvet Comet | nobody | The crashed Concord pleasure yacht, stripped for parts by Militia scrappers. |
| The Sett Lab | | Munch | Dr. Graft's lab under Badger Knob: a steel door, incubators, vats of mutagen and his name on the mailbox. |
| The Star Lens | | Concord | A crystal ring the size of a county, parked in orbit like a monocle. |

## The Dustline War, battle by battle

A suggested order for the war, each with a battlefield and mission from the game. For role missions the first side plays side A.

**Act I: The Muster**

1. **Up Through the Corn** (Militia vs Munch; Dustbowl Crossing, Hold the Line). The first beetles of the season come up through the corn. Hold the silo deck until the rest of the valley gets there.
2. **Keep Off the Grass** (Militia vs Concord; Lady Prismwick's Lawn, Smash and Grab). Take Haybright Farm back, one hedge at a time.
3. **Signal Lost** (Munch vs Militia; Rattlevane Junction, Top of the Heap). The Munch have chewed through the radio relays.

**Act II: The War Spreads**

4. **Last Drops** (Munch vs Concord; Old Refinery, Scrap Rush). There is still Fizz in the tanks.
5. **Highway Robbery** (Militia vs Munch; Long Ridge Highway, The Great Snack Heist). The Munch have stolen the Harvest Fair's prize pie.
6. **Finders Keepers** (Militia vs Concord; Wreck of the Velvet Comet, Salvage Rights). The yacht's owners have come back for it, and they are livid.
7. **The Gemhaul Road** (Concord vs Militia; Gemhaul Ambush, Strongbox Run). A crystal caravan has stalled, and the Tumbleweed Riders have noticed.
8. **Claim Jumpers** (Militia vs Munch; Grubstake Redoubt, Claim-Jump Siege). A fresh seam of Fizz, and the Munch are not knocking.
9. **Off the Rails** (Munch vs Concord; Gutterbend Derailment, Shifting Ground). The ground keeps shifting as the Munch tunnel under the ore cars.

**Act III: The Wellspring**

10. **Spare Parts** (Militia vs Munch; Scrapyard Sprawl, Scrapheap Showdown). The Munch go for the Militia's spare parts.
11. **Landing Party** (Concord vs Militia; Brinejaw Flats, Frontline). His Radiance's main fleet sets down on the salt.
12. **The Narrows** (Munch vs Concord; Mesa Ridge, Scrapyard Brawl). Nobody planned this, and nobody is backing down.
13. **The Battle of Fizzwater Ford** (Militia vs Concord; Fizzwater Ford, Hold the Line). Whoever holds the bridges holds the Wellspring, and the Dustline.

## The intros

The intros are drawn live in the game's own style (the real miniatures, emblems and wordmark on inked comic panels); there are no video files. Each one can be skipped with a click, Esc, Space or the Skip button, and with *reduce motion* turned on in your system they show as a still comic page instead.

- **The game intro** (about 19 seconds) plays once on first launch: the valley at dawn, the fizzing creek and the Wellspring below it, the Munch bursting up through the corn, Concord saucers beaming down at night, the farmers standing firm, and the three emblems facing off under the SCDMG wordmark. Replay it from **▶ Watch the intro** on the main menu or the lore pages.
- **A faction intro** (about 16 seconds each) plays the first time you pick a built-in faction or open its lore page, and can be replayed from the faction's lore page:
  - *Dustline Militia:* Aunt Dot on the Grange Hall Radio, the valley turning up, Big Bertha bursting out of the barn, the crop dusters flying over, and the title card.
  - *The Munch:* the Sett Lab humming, Dr. Graft and Big Mama revealed, the overmind lighting up every critter, the swarm pouring across the fields, and the title card.
  - *Lumen Concord:* the Star Lens noticing the glow, saucers beaming down, His Radiance stepping out of a Light Gate, the Court of Disdain scoring the locals, and the title card.

## For campaign builders

Import from `src/engine/data/lore.ts`:

- `WORLD`: `name`, `summary`, `prize`, `conflict`, `history` (eras), `intro` (captions).
- `LORE_FACTIONS[factionId]`: `epithet`, `tagline`, `leaderId`, `homeId`, `goal`, `stakes`, `story`, `quote`, and a lore note for every unit (`units`) and support card (`supports`), keyed by the game's ids.
- `CHARACTERS`: id, name, title, faction, pronoun, and the `unitId` or `supportId` they appear as on the table.
- `PLACES`: id, name, kind, the `mapId` of its battlefield (if any), who holds it when the story starts, and a blurb.
- `BATTLES`: battle seeds in three acts, each with a place, map, mission and the two sides. Tests check every mission fits its map.
- Helpers: `factionLore`, `leaderOf`, `charactersOf`, `characterById`, `placeById`, `placeForMap`, `battlesFor`, `battlesAt`, `loreNote`.
