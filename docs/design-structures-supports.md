# Design: structures, off-board supports, custom factions

Status: agreed design, being implemented. Everything here is original to SCDMG.

## 1. Structures

Structures are units with the `structure` keyword and `move: 0`.

| | Permanent structures | Temporary structures |
| --- | --- | --- |
| Examples | turrets, pylons, spore pods | wards, burrow holes, barricade drops |
| How they arrive | Bought in the army list and deployed from reserve like other units | Summoned by a support effect (or a unit ability), at a point |
| Where | In your spawn zone, or within `fieldDeploy` inches of a friendly non-structure unit | Wherever the summon effect allows |
| Supply | Uses supply normally | Uses no supply |
| How long | Stays until destroyed | Removed at the end of the round it was summoned in |
| List builder | Listed | Not listed (`summonOnly`) |

**Rules for all structures:**
- They can't move, advance, charge or disengage. They can shoot, hunker and fight back in melee if they have weapons, and use their abilities.
- They can't hold objectives.
- Enemies can charge them. A structure engaged in melee doesn't stop the enemy from leaving.
- Profile field: `structure?: { lifetime: "permanent" | "round"; summonOnly?: boolean; fieldDeploy?: number }`.

## 2. Off-board supports, Fizz and CP

- **Fizz ✦** is a second list-building currency. Each mode sets a Fizz budget (Skirmish 6, Assault 10). An army list is a set of units (paid in resources) plus a set of **supports** (paid in Fizz).
- **Each support** has:
  - `fizz` (list cost)
  - `cp` (command points it adds to your pool at the start of each round)
  - one or more **support abilities**
- **CP** is the in-game currency that pays for support abilities. The pool carries over between rounds, up to a cap of 8.
- **Support abilities** cost CP and can **exhaust** their support card. An exhausted card's abilities can't be used again until it refreshes at the start of the next round.
- **Playing a support ability is a free action.** It doesn't use up your activation, and the turn doesn't pass. You can play one on your turn in its listed phase (`timing`), or `any`.
- **Reactions are armed in advance.** On your turn, pay the CP to arm a reaction. It then fires automatically the next time its trigger happens this round, and expires at the end of the round if it never triggers. This gives reaction play without interrupting the other player's turn.

**Support effects are data-driven**, so custom factions can combine them:

| Effect | Kind | Target | What it does |
| --- | --- | --- | --- |
| `resources` | instant | none | +N resources |
| `heal` | instant | friendly unit | heal N HP, optionally reviving a model |
| `recharge` | instant | friendly unit | shields to full |
| `blast` | instant | point | models within radius are hit on X+ (damage, AP); optional sight requirement from any friendly model; range from any friendly model |
| `summon` | instant | point | place a summon-only profile within range of a friendly model, at least N" from enemies |
| `meleeBuff` | instant | friendly unit | +N melee dice per model this round |
| `rangedBuff` | instant | friendly unit | +N ranged dice per model this round |
| `slow` | instant | enemy unit | slowed next round |
| `ward` | reaction | `enemyShoots` | the next enemy ranged attack on one of your units this round hits one worse |
| `brace` | reaction | `enemyCharges` | the charged unit gets +1 to saves in combat this round |
| `retaliate` | reaction | `friendlyDestroyed` | each enemy model engaged with the destroyed unit takes a hit on X+ |

## 3. Custom factions

- The three built-in factions are read-only. The faction tool can **copy** one as a starting point, or start blank.
- A custom faction is a `Faction` JSON with:
  - its own id (prefixed `custom-`)
  - profiles (units and structures) with ids prefixed by the faction id
  - supports
  - starter lists
- Custom factions are stored in browser storage and registered with the engine at startup through `registerCustomFactions(factions)`. They can be imported and exported as files.
- Abilities are chosen from the existing ability library. Support effects are chosen from the effect library above, with their parameters.
- Validation rejects broken references, impossible stats and duplicate ids.
