# Design: combat dice (v0.4)

Status: implemented in v0.4 (engine, data, UI, Forge, AI). Names and numbers are our own.

## Attack sequence
1. **Attack dice:** each attacking model rolls the weapon's dice. **Keyword bonus dice** (`bonuses: [{ vs: "armoured", dice: 1 }]`) add dice per model against units with that keyword. These already exist.
2. **To hit:** each die at or above the weapon's hit value (X+) is a hit.
3. **Precision Y** (`Weapon.precision`, plus buffs): after rolling, move up to Y missed dice into the hit pool.
4. **Evade (conditional):** if the attack matches one of the target's evade conditions (see below), it rolls one die per hit against its evade value; each success dodges that hit entirely. **Tracking Z** (`Weapon.tracking`, plus buffs) cancels up to Z successful evades.
5. **Armour:** every hit that wasn't evaded gets an armour save, as today. The save value is the unit's armour stat, worsened by AP and improved by cover, hunkering and bracing. Each failed save deals the weapon's damage, to shields first.
6. **Damage and morale:** as today, followed by a nerve test.

## Engagement and shooting
- **Shooting into a melee:** an unengaged unit **can't shoot at an enemy unit that is engaged**, with anyone, unless the weapon has **precision 1+** (or a precision buff). A precise shooter can pick its target out of the scrum.
- **Shooting out of a melee:** an engaged unit **can't shoot at anything except a unit it is directly engaged with**.
- **Point-blank:** an engaged unit **may shoot a unit it is engaged with** using any ranged weapon. Against these point-blank shots the defender gets its **evade roll**, if it has an evade stat. **Pistols** are made for this: point-blank pistol shots don't allow evade.
- **Evade is conditional:** a unit's evade only applies in the situations its profile lists:
  - `UnitProfile.evade = { target: 5, against: ["pointBlank"] }`, where `against` can include `"pointBlank"` (shot by a unit engaged with it), `"ranged"` (any shooting), `"melee"` (close combat) and `"blast"` (barrages, blasts and support blasts).
  - Most nimble infantry dodge point-blank shots; flyers might evade all ranged fire; tiny swarms might evade blasts.
  - Tracking still cancels successful evades. Buffs like smoke can add an extra condition or +1 for the round.

## Stats and modifiers
| Field | Where | Meaning |
| --- | --- | --- |
| `evade?: { target: number; against: ("pointBlank" \| "ranged" \| "melee" \| "blast")[] }` | UnitProfile | Evade roll target (2–6) and the situations it applies in. Absent means no evade. |
| `precision?: number` | Weapon | Move up to N missed dice into hits. |
| `tracking?: number` | Weapon | Cancel up to N successful evades. |
| status `evadeBonus`, `precisionBonus`, `trackingBonus` | UnitStatus (per round) | Buffs and debuffs from abilities and supports, e.g. smoke (+1 evade), spotter (+precision), marked (−1 evade). |

## UI
- **Dice tray:** three rows per attack: *To hit* (with the misses moved by precision highlighted), *Evade* (the defender's dice, with cancelled evades struck through), and *Armour*.
- **Unit cards:** show the evade stat. Weapon lines show `precision N` and `tracking N`.

## AI
Expected damage per attack: `dice × P(hit) + min(precision, expected misses)`, then × (1 − P(evade) adjusted for tracking), then × (1 − P(save)) × damage.

## Rollout
1. Add the fields and engine resolution in `combat.ts`, `saveNeeded` and `expectedDamage`, keeping attack reports backward compatible: add `evadeRolls` and `evadeOn`.
2. Assign evade to light, swarm and flying units, and precision and tracking to fitting weapons (snipers, auto-guns, beam weapons), as data in `factions.ts`.
3. Update the dice tray, unit card text, list builder and the Faction Forge (editors for the new fields and validation).
4. Re-balance with the sim.
