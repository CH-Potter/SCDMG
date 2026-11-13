# SCDMG (working codename)

A cartoon sci-fi skirmish miniatures game that runs in the browser. You play against an AI opponent. This is an original game: the setting, factions, units and rules are all our own.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests, including full AI-vs-AI games for every matchup
npm run build    # typecheck + production build into dist/
```

## Layout

| Path | What it is |
| --- | --- |
| `src/engine/` | Pure, deterministic rules engine: no DOM, seeded RNG, `applyCommand(state, cmd)` reducer |
| `src/engine/data/` | Factions, unit profiles and maps (data only; tune balance here) |
| `src/engine/ai.ts` | Greedy one-activation-lookahead AI scored on expected damage, objectives and threat |
| `src/ui/` | PixiJS board renderer, DOM HUD and the controller that connects them |
| `tests/` | Vitest suite |

## Core rules (v0.1)

- Five rounds on a 36"×36" table with three objectives.
- Players alternate activating one unit at a time. Each activation is 2 actions: Move, Attack (once), or a special (Entrench, Patch up).
- Attacks roll the weapon's dice against its hit number. Each hit gets a save. AP worsens saves; cover and Entrench improve them. Shields soak damage first.
- At the end of each round, each objective scores 1 point for whoever has more units on it. Shields recharge and Regen units heal.

## Factions

- **Dustline Militia:** scrappy frontier settlers. Versatile shooters who can dig in, plus a medic and a walking cannon.
- **The Munch:** a goofy, ravenous critter swarm. Cheap, fast, regenerating, and better in melee when they gang up.
- **Lumen Concord:** smug crystal aristocrats. Few in number, with shields and long-range lances, plus a skiff that phases through walls.

## Licence

MIT
