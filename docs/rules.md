# Super Cool Desktop Miniatures Game: rules (v0.9)

This is the design reference for the engine in `src/engine/`. Every number here lives in data or a named constant, so tuning is easy. Distances are in inches. **Skirmish** is played on a 35"×35" table and **Assault** on a 70"×35" table. Each mode has its own missions, maps and roster limits (see `src/engine/data/modes.ts`).

## Armies, resources and supply

- Each side brings a **roster** (army list). Every unit starts in **reserve**, and the board starts empty.
- Missions set **starting resources (⚙)**, **income per round**, a **starting supply cap (◆)**, **supply growth per round** and a **maximum supply**.
- **Deploying** a unit costs its resource cost (base cost plus upgrades) and needs free supply. Free supply is the cap minus the supply of your units on the board.
- Destroyed units are gone for good, but they free up their supply, so you can bring in more reserves.
- Upgrades are chosen in the list. They can add models, move, keywords, abilities, or change weapons.

## Round structure

| Phase | What units can do |
| --- | --- |
| 1. Movement | **Deploy** (into your spawn zone), **Move**, **Disengage** (engaged units only), **Hunker**, **Hold**, movement abilities |
| 2. Assault | **Shoot**, **Charge**, **Advance**, **Hunker**, **Hold**, assault abilities |
| 3. Combat | Engaged units **Fight** (or decline) |
| 4. Scoring | Mission VP, then clean-up: shields recharge, Regen/Regrow, income and supply growth |

- **Deploying:** the deploying model must stand in your spawn zone; a spot exactly on the zone's edge counts as inside.
- In phases 1–3, players **alternate activations**, one unit at a time, starting with the player who has **initiative**.
- A player with nothing left to do is skipped. **Pass** ends your part of the current phase.
- **Who goes first:** both players roll off at the start, and the winner **chooses** who goes first in round 1. Before each later round, the player with fewer VP chooses; on a VP tie, roll off again and the winner chooses.
- **Passing early:** in the movement or combat phase, the first player to pass while they still had units to act claims the initiative: they go first in the next phase (the assault phase, or the next round).
- In the **assault** phase, hunkered units and non-light units exhausted from disengaging sit out. Engaged units can only shoot the unit they're fighting (see *Engagement and shooting*).
- In the **combat** phase, players alternate too, starting with the player who has the initiative. Each player must fight with their units that **charged** before their other units. (The *Chargers strike first* house rule brings back the old order: every charging unit, from both sides, fights before anyone else.)

## Multi-model units

- **Squad sizes:** line infantry and swarms come in big squads, and only leaders, specialists and true elites fight alone. Each faction's sizes follow its style: the Munch field the most bodies per unit, the Lumen Concord the fewest.

| | Squads (models) | Single models |
| --- | --- | --- |
| Dustline Militia | Rivet Grunts 7, Front Porch Grannies 4, Tumbleweed Riders 3 | Patch Medic (support leader), Ridgeline Squinter (sniper), Big Bertha and the Hay Bomber (big machines), Sky Rustler (aircraft), turret, mortar, barricade |
| The Munch | Chrome-Jaw Beetles 9, Piston Foxes 8, Bomb Wasps 6, Web-Gunner Spiders 4, Steel-Jaw Crows 2 | Dr. Graft and Big Mama and the Stink Mortar (monsters), Brood Scorpion (support leader), Mutagen Vat, The Sett Lab, holes and pits |
| Lumen Concord | Phase Guard 3, Blink Dancers 3, Jetwing Scouts 2 | Ray Lancer (sniper), Beam Warden (support leader), Grand Strider (monster), Shimmer Saucer (vehicle), pylon, obelisk, ward |

- A squad's **supply** shrinks with its losses (see *Objectives and missions*), so squad supply is set to suit the squad's size: Rivet Grunts, Chrome-Jaw Beetles, Piston Foxes and Bomb Wasps are worth 3 supply (a squad of Chrome-Jaw Beetles loses 1 for every 3 beetles), the Phase Guard 3 (every lost duellist costs 1), and the other squads 2.
- To move a unit, pick a **leader** model and move it up to the unit's Move along a legal path.
- The rest of the squad follows and **spreads out like a real squad**, not a block. Each follower travels at most Move + 2".
  - **Snap to cover:** within about 3" of the leader's spot, followers take free spots in cover: inside scrub, craters or rubble, or tucked behind a barricade on the side away from the enemy. "The enemy" means the nearest few enemy units, or their deployment zone if none are on the table yet.
  - **In the open**, followers form a loose, slightly staggered skirmish line about 1" apart, facing the enemy.
  - Followers stay on the leader's side of fences, walls and buildings.
  - The move preview marks each model's spot with a **green shield** (in cover from every nearby enemy) or a **yellow shield** (from some).
  - **Charges** don't spread out: chargers pile in around the target.
  - **Heavy** units and **flyers** never get cover, so they just form the loose line.
- **Coherency is a chain:** every model must end within **2"** (edge to edge) of at least one other model in the unit, and the whole unit must form one group. Models don't have to be within 2" of the leader.
- A model cut off by casualties that can't rejoin this move catches up as far as it can.
- All models in a unit always end on the same elevation.
- **Range, line of sight, cover and engagement are all checked per model:**
  - Only models with a valid target add their dice.
  - Hits go to wounded models first, then to the model closest to the attackers.
  - Each model rolls its own save, with its own cover.

## Elevation and terrain

- **Elevation levels:** 0 = ground, 1 = on a platform, 2 = flying.
- **Platforms** (raised decks, mesas, catwalks) are reached only via **ramps** or **ladders**. They create chokepoints.
  - Heavy units can't climb ladders. Ladders also cost +1".
  - An enemy standing on either end of a ramp or ladder blocks it.
  - **Jump** units can change level anywhere, at a cost of +2" per level.
- **Line of sight:** a feature blocks sight if the line crosses it and its top is above both models' eye level.
  - Buildings: top 2.
  - Walls: their level + 1.
  - The platform itself: top 1.
  - Cover and barricades never block sight.
  - In practice, a platform blocks sight between two ground models, but a model standing on it sees and is seen. Flyers see over everything.
- **Cover** gives +1 to saves against shooting. It comes from:
  - area cover or barricades at the target's level,
  - or the target standing on a platform while the shooter is on the ground.
  - Shooting from higher up ignores cover.
  - Flyers and heavy units never get cover.
- **Impassable:** buildings everywhere; walls and barricades at their own level; for ground models, the platform's footprint.

## Combat

Every attack, ranged or melee, runs the same sequence:

1. **Attack dice:** each contributing model rolls the weapon's dice, plus any keyword bonus dice against this target.
2. **To hit:** each die at or above the hit number (X+) is a hit.
3. **Precision Y:** move up to Y missed dice into the hits. It comes from the weapon (`precision`) and from buffs.
4. **Evade:** if the attack matches one of the target's evade situations, the defender rolls one die per hit against its evade number. Each success dodges a hit completely. **Tracking Z** on the attacker's weapon cancels up to Z successful evades.
5. **Armour:** every hit that wasn't evaded gets a save, as below.
6. **Damage and morale.**

- **Evade is conditional.** A unit's evade stat lists the situations it works in:
  - **point-blank:** shots from a unit that is engaged with it;
  - **ranged:** any shooting;
  - **melee:** close combat and impact hits;
  - **blast:** blast weapons and barrages.
  - Nimble infantry tend to dodge point-blank shots, flyers dodge shooting, and small swarms dodge blasts.
  - Evade numbers are 2+ to 6+. Buffs and debuffs move it by one for the round.
- **Saves:** the defender saves on armour + AP, adjusted as follows, with a minimum of 2+. A save worse than 6+ means no save.
  - −1 for cover.
  - −1 for hunkering (−2 with Entrenched).
  - Cover and hunkering don't apply in melee.
- **Damage:** each failed save deals the weapon's damage to one model. Shields soak damage first, and extra damage doesn't carry over to other models.
- **Charge:** declare a charge at an enemy within 12" (plus any move buffs or debuffs, such as Sugar Rush or Sticky Goo), then roll 2d6 and add the same buffs or debuffs. If the total reaches base contact, the engine routes the closest model into base contact (within 1") and the rest pile in. If it's short, the unit stays where it is and its activation is spent. The charge preview shows the roll you need and the odds. (House rule *Rolled charges* off: a charge reaches up to the unit's move, and always arrives.)
  - Charging models get +1 die each in that round's combat.
- **Close ranks:** when a unit fights, each of its models that isn't in base contact first steps up to 3" (straight, not through solid terrain): into base contact with the target if it can, or else into base contact with a squad-mate who is. Models that can't reach either stay put.
- **Supporting rank:** a model fights if it's in base contact with an enemy model of the target, *or* in base contact with a squad-mate who is (base to base to base). Supporting models get the charge bonus too.
  - Only a charge can end in base contact. Normal moves, deploys and teleports can't.
- **Engaged** units can't move (only disengage) and fight in the combat phase.
- **Disengage:** move out of contact. Compare the unit's current **supply** with the total supply of the enemies it was engaged with. If it's worth **more**, it breaks away cleanly with no penalty. If it's worth the **same or less**, it's **exhausted** for the next phase: it sits out the assault phase and can't charge, though **light** units may still shoot.

### Engagement and shooting
- **Shooting into a melee:** an unengaged unit may shoot an enemy unit that is in a melee. With **precision 1+** (from the weapon or a buff) it picks the target out cleanly. Without precision, resolve the shot as normal, then **every missed die rolls again, as the same shot, at your own unit in that melee** (the one nearest the shooter), with its evade and saves. Lobbed shells (indirect fire) don't stray this way: their burst hits whoever is under it.
- **Shooting out of a melee:** an engaged unit can only shoot at a unit it is directly engaged with. It may do so in the assault phase with any ranged weapon.
- **Point-blank shots** let the target use its point-blank (or ranged) evade. **Pistols** are built for this: point-blank pistol shots can't be evaded.

## Keywords (rock–paper–scissors, but soft)

| Keyword | Effect |
| --- | --- |
| infantry | Can climb ladders. Gets cover. |
| light | Can still shoot when exhausted from disengaging. |
| armoured | Ignores 1 AP, unless the weapon has a bonus against armoured targets. |
| heavy | No ladders. Never gets cover. |
| flying | Ignores terrain. Can't hold objectives. Never engaged in melee: ground units can't charge it, and its own charge is a dive (see *Flyers*). Ground units may move under it but not stop on its base. Ranged weapons need `targets: all/air`. |
| jump | Changes level without ramps or ladders. |

Weapons can carry **bonuses vs keywords** (extra dice, damage or AP). Examples: Chain Popper vs light, Thumper Cannon vs armoured, Flicker Cannon vs flying.

## Factions

Each faction has its own play style: the **Dustline Militia** shoot, the **Munch** swarm into melee, and the **Lumen Concord** field a few elite specialists. Abilities and support effects belong to one faction's style (Overwatch and digging in for the Militia, regrowth and lurking for the Munch, shields, precision and teleporting for the Concord), with a little overlap. See `docs/factions.md` for the pillars.

## Abilities

**Forward-deploy limits:**
- **Tunnel** can't be used in round 1.
- Neither a Tunnel nor a **Gopher Hole** can land within 6" of the enemy's home objective.

**Unit abilities and timing:**
- Active unit abilities are **free actions within the unit's activation**. In the movement or assault phase a ready unit can use one active ability, then still take its normal action: for example, Blink and then move, or Recall a squad and then shoot.
- The limit is one ability per unit per phase, within its uses per game.
- Some abilities burn **CP** from the same pool as supports: Barrage, Blink, Tunnel, Recall Beam. Patch Up is free. So you budget CP between unit abilities and faction supports.

- **Active abilities** use the unit's activation in their phase:
  - Patch Up (heal or revive)
  - Hatchlings (Brood Scorpion: a friendly unit within 3" regrows up to 2 lost models at 1 HP; not while engaged)
  - Barrage (an indirect shell at a point; it can drift, see *Indirect fire*; friendly fire happens)
  - Tunnel (pop up anywhere on the ground ≥6" from enemies)
  - Blink (teleport 10", can land on platforms)
  - Recall Beam (teleport a friendly unit next to the Warden; it can still act afterwards)
- **Passive abilities:**
  - Entrenched
  - Regen, Regrow
  - Brood Call (aura: +1 move to Beasts)
  - Radiance (aura: extra shield recharge)
  - Steady Aim
- **Reactive abilities:**
  - Overwatch (shoots a unit that ends a move, charge, deploy or teleport within 10")
  - Sticky Goo (slows the target)
  - Pop! (bursting critters)
  - Refraction (soaks 1 damage once per round)
  - Lurk (once per round, lashes out at an enemy ground unit that ends a move, charge, deployment or teleport within 3")

**Added in v0.4:**
- **Active:**
  - Reel In (drag an enemy 4" closer)
  - Rocket Hop (leap 6" over terrain, then still shoot or charge)
  - Rampage (+1 melee die per model, saves one worse this round)
  - Spotter (your shots at the target hit one better this round)
  - Bubble Shield (+1 shield per model on a nearby friend)
  - Sugar Rush (+2 move this round; the unit takes 1 damage)
  - Provoke (enemies within 18" must shoot this unit if they can)
  - Demo Charge (3 dice at 3+ against a ground enemy within 4", extra damage against structures and mechs)
- **Passive auras:**
  - Steadying Presence (+1 nerve to friends within 6")
  - Mending Spores (unhurt friends within 6" heal 1 at the end of the round)
- **New support effects:**
  - Airdrop (deploy a reserve unit near your models, away from enemies; a drop-ship version can land anywhere)
  - Rattle (force a nerve test on an enemy unit, with a penalty)

**Added in the faction identity pass:**
- Each faction's support buffs now follow its style:
  - Dig in (Militia, Sandbag Social): a friendly unit gets +1 to saves against shooting and barrages this round, on top of cover and hunkering.
  - Regrow (Munch, Cough Up): a friendly unit regrows up to 2 lost models at 1 HP.
  - Aim buff (Concord, Point Out Flaws): a friendly unit's attacks get precision +1 and tracking +1 this round. With precision it can also shoot into a melee.
  - Teleport (Concord, Gate Step): one of your unengaged units on the table moves up to 8", ignoring terrain and not into base contact. It can still move and act afterwards. Enemy Overwatch and Lurk react to where it lands.
- Field Repairs (Militia) heals 3 HP but no longer revives: bringing models back is the Munch's trick (Regrow, Hatchlings, Cough Up) and the Patch Medic's.
- Unit changes: Big Bertha has Steady Aim instead of Provoke (Provoke is the Grand Strider's); the Ray Lancer trades Steady Aim and Spotter for precision 2 (and no longer hits worse after moving); the Sunray Tower rolls 2 dice instead of having Steady Aim; the Beam Warden loses Steadying Presence; the Tumbleweed Riders lose their impact dice; Rivet Grunts' shovels hit on 5+; the Stink Mortar's range is 20"; the Brood Scorpion has Hatchlings instead of Patch Up. To keep the Militia competitive, Rivet Grunts come 5 to a squad (was 4) and the drop-ship's Bumpy Landing costs 1 CP (was 2).

**Added in v0.5:**
- A unit's **supply** now follows its surviving models (see *Objectives and missions*); it decides objective control, disengaging and kill VP.
- **Disengaging:** a unit worth more supply than the enemies it's engaged with breaks away cleanly; otherwise it's exhausted for the next phase (light units can still shoot).
- **Instant win:** a lead of more than 8 VP (10 or 12 in big-swing missions) wins on the spot.
- **Kill VP** is paid as a unit's supply drops, not only when its last model dies.
- **Blast** weapons get their extra die against units with 7+ models left (was 5+).
- New setting: the Munch are Dr. Graft's grafted critter army and the Lumen Concord are alien invaders; their units were renamed.

**Bigger squads:**
- Every squad grew, priced per model at about its old rate: Rivet Grunts 5→7 (cost 4, supply 3; Extra Hands +2 models), Chrome-Jaw Beetles 6→9 (cost 3, supply 3; Bigger Litter +3), Piston Foxes 5→8 (cost 4, supply 3; Kick-Bite 1 die), Bomb Wasps 3→6 (cost 4, supply 3; Stinger 1 die; Extra Buzz +2), Web-Gunner Spiders 3→4, Front Porch Grannies 3→4 (cost 5), Tumbleweed Riders 2→3 (Scattergun 1 die), Phase Guard 2→3 (cost 5, supply 3), Blink Dancers 2→3 (cost 5).
- Two flying creatures became pairs: the Steel-Jaw Crows (2 × 3 HP, 2 bite dice each, and it no longer has tracking, which is a Concord trait) and the Jetwing Scouts (2 models with 1 shield each, cost 6).
- Starter lists were rebuilt to fit the roster limits with the new costs (see `src/engine/data/factions.ts`), and were balanced by AI-vs-AI simulation. The Militia field three Grunt squads and two Squinters (the Sky Rustler moves to the Assault extras), the Munch swap the Stink Mortar for the Brood Scorpion, and the Concord field a second Ray Lancer (and a third in Assault in place of a Phase Guard). In Assault the Concord bring the Light Gate instead of the Star Lens: against the bigger packs the Sunbeam ran away with the Munch match-up, and Gate Step gets a few elites to the long board's objectives.

**Added in v0.6:**
- **Scrapheap Showdown** now pays 1 VP for every 2 enemy supply destroyed and 3 VP per held neutral objective (was 1 and 1), with a 15 VP instant-win limit. Kill-only scoring had left the Munch winning almost none of these games.
- **Campaign:** the Dustline War, linked battles for each faction (see *Campaign* below).
- **Lore and intros:** lore pages for the valley and each faction, and intro animations for the game and each faction.

**Added in v0.7:**
- **Swarm impact hits on 5+:** Chrome-Jaw Beetles (was 4+) and Piston Foxes (was 3+) now land impact on 5+, like the Bomb Wasps. Every model rolls its own impact die, so when the squads grew (beetles 6→9, foxes 5→8) their impact grew with them. A full beetle charge landed about 3 wounds before the defender could act, and impact was more than half of all beetle and fox damage in AI play. In a straight dice count, a 9-beetle charge wiped a Phase Guard or Grannies squad about 70% of the time before it could strike back (about 57% now). Single big beasts and the crows keep 4+.
- **Refraction in the odds:** the expected damage shown in the attack preview, and used by the AI to pick targets, now counts an unused Refraction. Against a 1-damage gun it cancels the first wound, so a Rivet Rifle volley at the Shimmer Saucer was previewed at about 1.9 damage but really did about 1.
- **Barrages and support-card blasts** now let the target roll its blast evade for each hit, as the evade rules always said. Their target always gets its save, even when the caster has no unit on the table (it used to get none).

**Added in v0.8:**
- **Flyers never get stuck in a melee.** Ground units can't charge them; a flyer's charge is a dive that strikes with its impact and leaves both sides free. Flyers fight from range (or with a dive or suicide attack): the Steel-Jaw Crows' bite is now their dive (2 impact dice each on 4+, AP1; Can-Opener Beak makes it AP2), and the Bomb Wasps trade their sting for **Bombs Away!**, a once-per-game suicide dive. Ground units may move under a flyer but not stop on its base.
- **Shooting into a melee** no longer needs precision, but without it every miss rolls again at your own unit in the fight.
- **The Munch, rebalanced for the flyer rules:** with no melee reaching flyers, the Web-Gunner Spiders' Goo Glob now hits flyers as standard (Acid Goo gives +1 AP instead). The Munch starter army swaps the Brood Scorpion and Big Mama's Tunnel Claws for a swarm of Bomb Wasps and 3 more Chrome-Jaw Beetles. Checked by AI-vs-AI simulation in both modes.
- **Indirect fire:** mortars (the Spud Lobber and Stink Shell) and Barrage lob shells that need no line of sight but can drift off target, then burst on everyone under them, friend or foe. See *Indirect fire*.

**Added in v0.9:**
- **Rivet Rifle: no bonus against armoured targets** (it had +1 AP), so armour shrugs off its AP like any other gun's. Massed rifles were the Phase Guard's and Big Mama's main killer, and the Concord lost the objective missions to the Militia in both modes. Armour-cracking is left to Big Bertha and the Squinter.
- **Dr. Graft and Big Mama: 14 HP (was 12).** She was shot down crossing the board in about half her games (63% against the Militia in Skirmish) for 1–3 damage a game; now it takes one more Sunlance or Thumper wound to drop her.
- **Militia Skirmish supports: the Ammo Wagon instead of the Tractor Depot.** With the rifle nerf and a tougher Big Mama the Militia fell behind the Munch in Skirmish; Crate of Rivets and Sandbag Social give the gunline back some bite. Assault keeps the depot.
- **Concord Assault extras: a third Phase Guard (with Extra Guard) instead of the Sunray Tower, and the Grand Strider without Lustre Core.** On the long board the Concord out-damaged both armies but lost on objective VP (Frontline about 25%); a structure can't hold an objective.
- Checked by AI-vs-AI simulation at 3 seeds: every pairing now scores 45–55% in both modes.
- **Moves through area cover:** the rule is unchanged (area cover costs double), but a move that is too far because of it now says so: *Too far: 7.3" of 6", as crossing area cover costs double*, and the preview draws the route in red.

### Flyers

- **No melee engagement.** A flyer is never engaged with anything, so it can always move and shoot freely, and nothing is ever stuck fighting it. Flyers and ground units can still shoot each other (if their weapons can hit the other).
- **Ground units can't charge flyers.** Shoot them down.
- **Dives.** A flyer with impact can charge a ground unit: it dives into base contact and rolls its impact dice (each model in reach), and that is the whole attack. Neither side is engaged afterwards.
- **Flyers have no melee weapons.** They fight from range, with a dive, or with a suicide attack (the Bomb Wasps' **Bombs Away!**: once per game in the assault phase, the whole swarm dives onto an enemy ground unit within 10" and blows itself up; each wasp rolls a die, hitting on 3+ for 1 damage, AP1, with blast evade and saves. The wasps are then gone, and the enemy scores no kill VP for them).
- **Bases.** Ground models may move under a flyer's base but can't stop on it. Flyers may hover over anyone.

### Indirect fire

Weapons with the **indirect** trait, and the Barrage ability, lob a shell instead of shooting straight:

- **No line of sight needed.** The target only has to be in range. Indirect weapons can't fire while their unit is in a melee, or as overwatch, and they still can't pick out a unit that's already in a melee.
- **Aim:** the shell is aimed at the target model nearest the middle of the unit (Barrage: the point you pick).
- **Does it land on target?** Roll a die against the weapon's hit number (4+ for both mortars and Barrage, after the usual modifiers such as Shaken). On a success it lands where it was aimed.
- **Drift:** otherwise it drifts a d6" in a random direction, staying on the table. If any model in the firing unit can see the aim point, the drift is halved (rounding up), so a spotter makes it far more accurate.
- **Burst:** where it lands, every model of every ground unit within 2" (base edge) is rolled for, **yours included**: hit on the weapon's hit number, then the target's blast evade, then a save (no cover against a shell from above; hunkering and digging in still count). Each failed save deals the weapon's damage. The weapon's dice count doesn't apply.
- Each firing model lobs one shell. Sticky Goo slows every unit the burst hurts.

## Tabletop staples

- **Impact on charge:** some units (Munch melee critters, Big Bertha's ram) roll impact dice when a charge lands. Each model in base contact rolls the unit's `impact` dice at the charged unit. Hits get normal saves, and the damage happens before the combat phase.
- **Weapon traits:**

| Trait | Effect |
| --- | --- |
| blast | +1 die per attacking model against units with 7+ models left |
| torrent | hits automatically |
| heavy | hits one worse if the unit moved this round |
| rending | natural 6s to hit get +1 AP |
| pistol | point-blank shots (at a unit you're engaged with) can't be evaded |
| indirect | lobbed shells (the Spud Lobber and Stink Shell): see *Indirect fire* below |

- **Morale** (a house rule, off in the standard game):
  - When a unit at half strength or less (counting wounds) takes damage, it rolls 2d6 against its **nerve** (default 7; Munch critters 6, Concord 8–9). If the roll is above its nerve, the unit is **Shaken**.
  - Shaken units hit one worse, won't charge and can't hold objectives.
  - At the end of each round, each Shaken unit recovers on a 4+.
  - Any army can **Rally** a unit for 1 CP. This is a free action.
  - Structures and `fearless` units (Dr. Graft and Big Mama, Big Bertha) never test.
- **Difficult terrain:** area cover (scrub, craters, rubble, tarps) costs double movement for ground models. Pathfinding weighs going round against going through. Flyers and jumpers ignore it.
- **Obscured:** other units' models standing in the line of fire, at the target's level, give the target cover. Shooting down from higher ground still ignores cover.
- **Measuring tape and line-of-sight checker:** press **M**, then click a model or spot and point anywhere. You get the distance, the edge-to-edge distance between models, and whether sight is clear. It works even during the AI's turn.
- **Undo:** press **Ctrl+Z** to take back your last action, and anything the AI did after it. The dice are seeded, so doing the same thing again rolls the same.

## House rules

Pick these in the main menu (step 5, *House rules*). They're saved in your browser and apply to every battle, the campaign's included. The AI plays by them too. The numbers live in `src/engine/houseRules.ts`. The game is balanced and simulated with the standard rules.

**Core rules you can switch off:**

| Rule | Off means |
| --- | --- |
| Rolled charges | A charge reaches up to the unit's move and always arrives. |
| Close ranks | Models fight from where they stand. |
| Supporting rank | Only models in base contact with the enemy fight. |
| Evade rolls | Every hit goes straight to a save. |
| Stray shots into melee | You can shoot into a melee freely: misses never hit your own side. |
| Impact on charge | Ground units roll no impact dice when a charge lands. A flyer's dive still strikes, since it's the flyer's whole attack. |
| Difficult terrain | Area cover costs normal movement. It still gives cover. |
| Units block shots | Only terrain gives cover: other units' models in the line of fire don't. |
| Shell scatter | Lobbed shells and barrages always land where they're aimed. |

**Optional staples you can switch on:**

- **Morale and Shaken:** nerve tests and Shaken, as described under *Tabletop staples*. Off, nobody is ever Shaken, and Rally and nerve-rattling supports aren't used.
- **Chargers strike first:** in the combat phase every unit that charged, from both sides, fights before anyone else; then the rest alternate.
- **Random activation order:** the player with the initiative takes each phase's first activation. After that, each activation is drawn at random, like pulling order dice from a bag: each side's chance is its share of the activations left (units that can still act, plus reserves it can afford to deploy in the movement phase). A side with nothing left is skipped. The log shows each draw. It can't be on with whole-army turns.

- **Breach dice:** keyword bonuses become breach dice. Against a target with the matching keyword, the weapon gets no bonus dice, damage or AP. Instead, roll one breach die with the attack: a **d3** for a bonus worth 1 (one die, damage or AP), or a **d6** for a bigger one (the Chain Popper with its Flak Kit, against flyers). Only the best matching bonus counts. After evades, that many of the hits (never more than there are) skip the save and go straight to damage; the rest save as normal. Armoured targets still ignore 1 AP from weapons without an anti-armour bonus. Lobbed shells don't breach.
- **Overwatch:** when a unit is charged, before the charge moves, it shoots the charger with its best ranged weapon, hitting only on 6s. It can't if it's already in a melee, and lobbed weapons can't fire overwatch. It fires each time it's charged.
- **Command re-roll:** after one of your attacks, you may spend 1 CP to re-roll all its misses, once. The dice are seeded, so the first roll is the same and only the misses roll again. Lobbed shells can't be re-rolled. The AI re-rolls when about 1.5 or more hits would come back, keeping a CP for a Rally if it needs one.
- **Whole-army turns:** in the movement, assault and combat phases, the player with the initiative activates all their units (or passes), then the other player does. In the combat phase each side still fights with its chargers first. It can't be on with random activation order.

## Structures

Structures have the `structure` keyword and Move 0: turrets, pylons, spore pods, and temporary pieces summoned by supports.

- **Movement:** they can't move, advance, charge or disengage, so they sit out the movement phase.
- **Fighting:** they can shoot, if they have a ranged weapon, and fight back in melee if they have a melee weapon.
- **Objectives:** they can't hold objectives.
- **Permanent structures** are bought in the list and deployed from reserve. They can deploy in your spawn zone, or within their `fieldDeploy` distance (6" for the built-ins) of a friendly non-structure unit.
- **Temporary structures** are created by support summons and vanish at the end of the round. They use no supply.

| Structure | Faction | Kind | What it does |
| --- | --- | --- | --- |
| Scrap Turret | Militia | permanent | Rifle turret with Overwatch |
| Junk Barricade | Militia | temporary | Big base that blocks enemy paths, e.g. a ramp |
| Mutagen Vat | Munch | permanent | Short-range spores; Regen and Brood Call |
| Gopher Hole | Munch | temporary | Your reserves can deploy within 3" of it |
| The Sett Lab | Munch | permanent | A Burrow Exit that stays, with Lurk and Regen |
| Trapdoor Pit | Munch | temporary | Lurks: bites the first enemy ground unit to end a move within 3" |
| Shield Pylon | Concord | permanent | Shielded beam emplacement with Radiance |
| Glimmer Dome | Concord | temporary | Enemy shots at friendly units within 4" of it hit one worse |

## Off-board supports, Fizz and CP

- **Fizz ✦** is a second list currency, used to buy **supports**: off-board backing such as a radio, a depot or a light-choir. The Fizz budget is 6 in Skirmish and 10 in Assault.
- Each support adds **command points (CP)** to your pool at the start of each round. The pool starts with one round's worth and is capped at 8.
- **Support abilities** cost CP and are **free actions** on your turn, in their listed phase or any phase. Playing one doesn't use an activation or pass the turn.
- Many abilities **exhaust** their card until the next round.
- **Reactions** (Dust Devil, Hold Fast, Last Bite) are **armed** on your turn and fire automatically the next time their trigger happens. If they don't fire, they expire at the end of the round.
- **Airdrops** deploy a unit from your reserves straight onto the table, paying its resources and supply as normal. The unit counts as having moved and acted this phase, and enemy Overwatch and Lurk react to it like any other arrival. An airdrop can never land within 6" of the enemy's home objective, inside impassable terrain or off the table. It can land on a platform.
  - **Dirt Airstrip** (Militia, 3 ✦, +1 CP): *Hay Bale Drop* (3 CP, movement phase, exhausts) lands the unit within 12" of one of your models and at least 6" from enemies. It's in the Militia's Assault starter supports.
  - **Rust Bucket Drop-Ship** (Militia, 3 ✦, +1 CP): *Bumpy Landing* (1 CP, movement phase, exhausts, from round 2) lands the unit **anywhere on the table**, at least 8" from enemy models. While you aim it, red rings show where it can't land, and clicking a spot it can't use says why. It's in the Militia's Skirmish starter supports.
  - **Grand Portal** (Concord, 3 ✦, +1 CP): *Step Through* (2 CP, movement phase, exhausts, from round 2) lands the unit within 4" of one of your units and at least 3" from enemies, with +1 shield per model (even above its maximum) until the end of the round. It's in the Concord's Skirmish and Assault starter supports.
  - The Munch don't airdrop: they tunnel. *Dig Through* (Tunnel Network) opens a Gopher Hole for the round, and the Sett Lab is a permanent one.
- **Teleports:** *Gate Step* (Light Gate, Concord, 3 CP, movement phase, exhausts) moves one of your unengaged units on the table up to 8". Click the unit, then where it goes.
- Effects are data-driven, so custom factions can combine them: gain resources, heal or revive, recharge shields, blast a point, summon a structure, give melee or ranged buffs, give precision and tracking, regrow lost models, dig a unit in, teleport a unit, slow an enemy, airdrop a reserve unit (near your models or anywhere, optionally from a later round), rattle an enemy's nerve, and the ward, brace and retaliate reactions.

## Objectives and missions

- Objectives are **numbered**. Each is either **neutral** or a team's **home** objective.
- An objective is controlled by the side with more **supply** of non-flying, non-structure, non-Shaken units touching it, at the objective's elevation. A unit counts its **current supply**: its supply shared out across its models and rounded down, so losses shrink it. A 3-supply squad of 6 is worth 2 at four or five models, 1 at two or three, and 0 at its last model. A single-model unit keeps its full supply until it dies. Current supply also decides how cleanly a unit disengages and what its losses are worth: in missions that score "VP per enemy supply destroyed", each drop in a unit's current supply pays out as it happens (or, for the Raiders, at the next scoring phase), not only when the last model dies. Regrown models don't pay twice.

| Mission | Rounds | Scoring |
| --- | --- | --- |
| Hold the Line | 5 | 1 VP per neutral objective held each round from round 2; 2 VP for holding the enemy's home objective |
| Smash and Grab | 5 | Sticky control. 1 VP per owned neutral objective each round; 3 VP for owning the enemy's home objective |
| Scrapyard Brawl | 4 | 1 VP per enemy supply destroyed; 1 VP per neutral objective held each round |
| Swipe the Snack | 6 | Grab the enemy's snack from their home objective: +1 VP each round you hold it, and 4 VP when you carry it into your own deployment zone or home objective. If the carrier dies, the snack drops; touching your own dropped snack sends it home. Neutral objectives score 1 VP each from round 3 |
| *Assault:* Frontline | 6 | Sticky control. 1 VP per owned neutral objective each round; 4 VP for owning the enemy's home objective |
| *Assault:* The Great Snack Heist | 7 | +1 VP each round you hold their snack; 5 VP for carrying it into your deployment zone or home objective; neutral objectives score 1 VP each from round 3 |
| *Assault:* Scrapheap Showdown | 5 | 1 VP for every 2 enemy supply destroyed; 3 VP per neutral objective held each round |
| Top of the Heap | 5 | The **heap** is the neutral objective nearest the centre. Holding it scores 1 VP, then 2, 3 and 4 VP (the cap) for each round in a row you keep it; losing it, or nobody holding it, resets the count. Other neutral objectives score 1 VP each round |
| Scrap Rush | 5 | Each neutral objective holds 3 loads of scrap. Holding one at the end of a round hauls a load: 1 VP and 2 resources. Empty piles score nothing |
| *Assault:* Shifting Ground | 6 | One neutral objective is **live** each round and scores 3 VP; the others score 1 VP. The next live objective is rolled at the start (and after each scoring phase) and announced a round ahead |
| *Assault:* Most Wanted | 6 | From the end of round 1, each side's priciest non-structure unit on the board is **marked** for the coming round. Destroying the enemy's mark before the next scoring phase scores 3 VP. Neutral objectives score 1 VP each round |
| *Role:* Claim-Jump Siege | 5 | See role missions below |
| *Role:* Salvage Rights | 5 | See role missions below |
| *Role, Assault:* Strongbox Run | 6 | See role missions below |

**Snack details:**
- Snacks sit on the level they're on, so only models on that level can grab, return or deliver them.
- A delivery scores the moment the carrier reaches home.
- If a defender and a thief both touch a dropped snack, the defender wins.
- A carrier that teleports (Blink, Tunnel, Recall) drops the snack where it stood.

### Role missions

Role missions are lopsided on purpose: each side has its own economy and its own scoring, and they're played on battlefields built for them (maps tagged `siege`, `salvage` or `convoy`). **Side A is player 1 and side B is player 2.** A side's **stronghold** is the neutral objective nearest its home objective.

| Mission | Side A | Side B | Both |
| --- | --- | --- | --- |
| Claim-Jump Siege (Skirmish, `siege`) | **Holdouts:** a free emplacement (the faction's cheapest buyable permanent structure; its supply is added on top of the cap) next to the stronghold, 8 resources, income 5. 1 VP each round from round 2 that B doesn't hold A's stronghold | **Claim-Jumpers:** 13 resources, income 6. 3 VP each round they hold A's stronghold | 1 VP per neutral objective held each round from round 2 |
| Salvage Rights (Skirmish, `salvage`) | **Site Crew:** 8 supply from the start, income 4 | **Rival Outfit:** 5 supply from the start, +3 supply per round | Each neutral objective holds 3 loads; holding one at the end of a round hauls a load for 1 VP and 1 resource |
| Strongbox Run (Assault, `convoy`) | **Escorts:** the strongbox starts on the neutral objective furthest from A's home. A carries it to A's home objective or deployment zone: 5 VP per delivery (it then reappears at the start), +1 VP each round it's carried. 1 VP per neutral objective held each round | **Raiders:** each neutral objective holds 2 loads; holding one hauls a load for 2 VP. 1 VP per enemy supply destroyed (paid at scoring). Touching the dropped strongbox away from its start sends it back there | — |

**Strongbox details:** it works like a snack, the other way round. Only side A picks it up; if the carrier dies or teleports it drops; side B can't carry it, but touching it while it's away from its start kicks it back. If an escort and a raider both touch it while it's away from its start, the raider wins.

A faction with no buyable permanent structure gets 3 resources instead of each free emplacement.

**Stragglers:** a model left more than 2" from its squad (for example after casualties) moves as far as it can toward the leader. It catches up rather than blocking the whole move.

The game ends after the last round (most VP wins), or immediately if an army has no units left on the board or in reserve, or the moment one side leads by **more than 8 VP**, which wins at once. Missions with big late swings raise that limit so a real comeback stays possible: **10 VP** for Scrapyard Brawl, Swipe the Snack, Top of the Heap, Claim-Jump Siege, Frontline and Most Wanted, **12 VP** for The Great Snack Heist, Shifting Ground and Strongbox Run, and **15 VP** for Scrapheap Showdown, where held objectives swing the score fastest.

## Maps

Every built-in map has a tactical shape, not just scattered cover. Sight-blocking walls, buildings and platforms split the board into **lanes or channels**, so nobody can shoot across the whole table. The lanes meet at **choke points** (gaps, gates, bridges, ramps) where a few units can hold against many, usually with cover nearby. Longer routes round the outside are safer than the short, exposed ones through the middle, and raised positions overlook a lane but are reached through one narrow ramp or ladder.

- Main routes are at least 3" wide, so the biggest bases (up to 1.4" radius) fit. Some 2" squeezes are infantry-only.
- Ramp and ladder feet stand clear of walls, and every raised objective has a ramp, since heavy units can't use ladders.
- Symmetric maps are point-symmetric (rotated 180°), so neither side gets a better board. Dustbowl Crossing, Old Refinery, Fizzwater Ford and Lady Prismwick's Lawn are mirror-symmetric as well, so when both sides pick the same lane or bridge, neither gets the better one.

**Skirmish (35" × 35")**

- **Dustbowl Crossing (three lanes):** two long fence walls make a left, centre and right lane. The only crossing is the middle row, where the silo deck (2 ramps, 2 ladders) sits in the centre lane with a 3" alley down each side; from the deck you can see over the fence walls into the side lanes. A fence line across the centre lane has a 3" gate, and each side lane has a sandbagged objective with hay bales at each end. Deploy on opposite edges.
- **Mesa Ridge (canyon maze):** two broken rock ridges carve a middle canyon and two side canyons. The middle canyon zig-zags through the Narrows, a boulder pinch either side of the centre. The side canyons loop past twin mesas, whose ramps come down at the windows in the ridges. Diagonal corner deployment.
- **Old Refinery (two lanes and a catwalk):** a pipe rack splits the yard into a north and a south lane, with a raised catwalk over the middle that sees into both. Each side owns one 3.5" gap in the pipes, with the catwalk ramp's foot right in it. The two lanes are mirror images, so neither side gets the better lane. Deploy on the left and right edges.
- **Rattlevane Junction (central fortress):** a walled windpump yard in the middle with one 3.6" gate in each wall, two facing each army. Signal towers on the flanks have a ramp facing the yard and a ladder round the back. Staggered lines: each side holds half of its own edge.
- **Fizzwater Ford (river and two bridges):** a deep creek splits the board. It is impassable; you can see over its outer stretches, but sluice houses block the middle ones. Cross at one of two 3.5" bridges or wade the slow ford in the middle. Mill towers on both banks overlook each bridge. Twin deployment pockets per side.
- **Lady Prismwick's Lawn (open centre, hedged flanks):** a wide-open croquet lawn, deliberately a shooting gallery, boxed in by tall hedges with a wide gap at each army's corner. Screened hedge walks run round the outside to the glass gazebos in the other corners, each reached by a back ramp at the end of the walk or the grand stair from the lawn. Topiary gives a little cover on the way in. L-shaped corner deployment.

**Assault (70" × 35")**

- **Long Ridge Highway (two lanes and a broken bridge):** a raised highway in two spans splits the field into north and south lanes that can't see each other. They meet only at the ends and at the broken span in the middle, where both spans ramp down. Garages in each lane give a choice between the exposed road under the highway and the sheltered verge. Deploy on the short edges.
- **Scrapyard Sprawl (street grid):** junk stacks stand in city blocks round a central smelter. 4" avenues give long sight lines along the board and none across the blocks. A scrap heap and a crane deck on each side look down the streets. Deploy on the short edges.
- **Brinejaw Flats (maze and open wings):** a junk-stack maze round a crane deck in the middle, open salt flats on the wings. Long-edge deployment, only 25" apart.
- **Gutterbend Derailment (wall of wrecks):** a derailed ore train lies across the middle. Squeeze through the 3.6" gaps between the cars, climb over the ore car or a boxcar, or go round the open ends, each next to one side's forward pocket. Main line on the short edge plus a forward pocket.

**Role-mission maps (asymmetric):** Grubstake Redoubt (siege), Wreck of the Velvet Comet (salvage) and Gemhaul Ambush (convoy) are built for their missions and balanced by simulation rather than by mirroring. Each blurb says which side is A and which is B.

## Campaign

**⚔ Campaign** on the main menu plays the Dustline War as one of the three built-in factions: three acts of linked Skirmish and Assault battles on a map of the valley, then a finale at Fizzwater Ford. Every battle uses the normal rules, missions and maps above, against the AI. What the campaign adds:

- **Places.** Winning a battle takes its place; losing hands it to the enemy; a draw leaves it as it was. Battles you skip fall to the enemy when the act ends.
- **Perks.** Each battlefield you hold gives a small edge in later battles: +1 CP, +1 starting resource, +2 roster budget, a free unit or a free support card. They are capped per battle at +2 CP, +2 resources, +3 budget, one free unit and one free support.
- **Armies.** One Skirmish and one Assault roster carry over between battles, built in the list builder within the campaign budget (⚙24 / ⚙45 in Act I, ⚙27 / ⚙50 in Act II, ⚙30 / ⚙55 from Act III on). The AI's starter army is trimmed to the same budget. A lost battle leaves your army battered: ⚙3 less for the next battle.
- **Retreat** on the top bar leaves a campaign battle as a defeat.

The full design, the perks of every place and the save format are in [campaign.md](campaign.md).
