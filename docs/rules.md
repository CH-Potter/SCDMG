# SCDMG rules (v0.2)

This is the design reference for the engine in `src/engine/`. Every number here lives in data or a named constant, so tuning is easy. Distances are in inches, on a 36"×36" table.

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

- In phases 1–3, players **alternate activations**, one unit at a time, starting with the player who has **initiative**.
- A player with nothing left to do is skipped. **Pass** ends your part of the current phase.
- Initiative starts on a die roll. After that it goes to the player with fewer VP, and alternates on ties.
- In the **assault** phase, engaged units, hunkered units and non-light units that disengaged sit out.
- In the **combat** phase, units that **charged** fight first. After that, everyone else alternates.

## Multi-model units

- To move a unit, pick a **leader** model and move it up to the unit's Move along a legal path.
- Every other model is placed within **2" coherency** (edge to edge) of the leader, travelling at most Move + 2".
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

- **Shooting:** each contributing model rolls the weapon's dice. Each die at or above the hit number is a hit.
- **Saves:** the defender saves on armour + AP, adjusted as follows, with a minimum of 2+. A save worse than 6+ means no save.
  - −1 for cover.
  - −1 for hunkering (−2 with Entrenched).
  - Cover and hunkering don't apply in melee.
- **Damage:** each failed save deals the weapon's damage to one model. Shields soak damage first, and extra damage doesn't carry over to other models.
- **Charge:** the engine routes the closest model into base contact (within 1"), and the rest pile in.
  - Charging models get +1 die each in that round's combat.
  - Only a charge can end in base contact. Normal moves, deploys and teleports can't.
- **Engaged** units can't move (only disengage), can't shoot, and fight in the combat phase.
- **Disengage:** move out of contact. Afterwards the unit can't charge. Only **light** units may still shoot.

## Keywords (rock–paper–scissors, but soft)

| Keyword | Effect |
| --- | --- |
| infantry | Can climb ladders. Gets cover. |
| light | Can still shoot after disengaging. |
| armoured | Ignores 1 AP, unless the weapon has a bonus against armoured targets. |
| heavy | No ladders. Never gets cover. |
| flying | Ignores terrain. Can't hold objectives. Ground melee can't reach it. Ranged weapons need `targets: all/air`. |
| jump | Changes level without ramps or ladders. |

Weapons can carry **bonuses vs keywords** (extra dice, damage or AP). Examples: Chain Popper vs light, Thumper Cannon vs armoured, Flicker Cannon vs flying.

## Abilities

- **Active abilities** use the unit's activation in their phase:
  - Patch Up (heal or revive)
  - Barrage (indirect blast; friendly fire happens)
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

## Objectives and missions

- Objectives are **numbered**. Each is either **neutral** or a team's **home** objective.
- An objective is controlled by the side with more **supply** of non-flying units touching it, at the objective's elevation.

| Mission | Rounds | Scoring |
| --- | --- | --- |
| Hold the Line | 5 | 1 VP per neutral objective held each round from round 2; 2 VP for holding the enemy's home objective |
| Smash and Grab | 5 | Sticky control. 1 VP per owned neutral objective each round; 3 VP for owning the enemy's home objective |
| Scrapyard Brawl | 4 | 1 VP per enemy supply destroyed; 1 VP per neutral objective held each round |
| Swipe the Snack | 6 | Carry the enemy's snack from their home objective to yours for 4 VP. If the carrier dies, the snack drops; touching your own dropped snack sends it home. Neutral objectives score 1 VP each from round 3 |

The game ends after the last round (most VP wins), or immediately if an army has no units left on the board or in reserve.

## Maps

- **Dustbowl Crossing:** a central silo deck (2 ramps, 2 ladders); deployment on opposite edges.
- **Mesa Ridge:** twin flanking mesas (1 ramp + 1 ladder each); diagonal corner deployment.
- **Old Refinery:** two catwalks, a cluttered yard; deployment on the left and right edges.
