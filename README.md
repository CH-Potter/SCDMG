# Super Cool Desktop Miniatures Game (SCDMG)

A cartoon sci-fi skirmish miniatures game that runs in the browser. You play against an AI opponent. This is an original game: the setting, factions, units and rules are all our own.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests, including full AI-vs-AI games
npm run sim      # AI-vs-AI simulations across missions/maps with outcome stats (balance work)
npm run build    # typecheck + production build into dist/
```

## Layout

| Path | What it is |
| --- | --- |
| `src/engine/` | Pure, deterministic rules engine: no DOM, seeded RNG, `applyCommand(state, cmd)` reducer |
| `src/engine/terrain.ts` | Elevation, line of sight, cover, placement, ramp/ladder routing |
| `src/engine/formation.ts` | Multi-model moves: leader + coherency placement |
| `src/engine/combat.ts` | Per-model attacks, keyword bonuses, saves, reactions |
| `src/engine/game.ts` | Phases, activations, deploy/supply, charges, abilities |
| `src/engine/scoring.ts` | Mission scoring, the snack flags, end-of-round clean-up |
| `src/engine/data/` | Factions, units, upgrades, abilities, maps and missions (data only; tune here) |
| `src/engine/ai.ts` | Greedy one-activation AI: simulates candidates, scores on expected damage, objectives and threat |
| `src/ui/` | PixiJS board renderer, DOM HUD and the controller that connects them |
| `docs/rules.md` | The full rules reference |

## Rules in a nutshell

Each round has four phases: **Movement** (deploy, move, disengage, hunker), **Assault** (shoot, charge, advance), **Combat** (engaged units fight; chargers first) and **Scoring**. Players alternate activations within each phase. Armies start in reserve and deploy over time, limited by resources and a growing supply cap. Squads move by leader plus coherency; range, line of sight and cover are per model. Raised platforms are reached by ramps and ladders. Keywords such as light, armoured, heavy, flying and jump give soft rock–paper–scissors. Four missions run across three maps. The details are in [docs/rules.md](docs/rules.md).

## Factions

- **Dustline Militia:** scrappy frontier settlers. Rivet Grunts (Overwatch or Jump Jets upgrades), Patch Medic, Big Bertha (Barrage), and the Sky Rustler crop-duster flyer.
- **The Munch:** a goofy, ravenous critter swarm. Regrowing Nibbler Packs, slowing Goo Spitters, exploding Buzz Swarm flyers, and Big Mama Chomp (Brood Call, Tunnel).
- **Lumen Concord:** smug crystal aristocrats. Blinking Prism Guard, Glimmer Lancer snipers, the Shimmer Skiff, and the Lumen Warden (Radiance, Recall Beam).

## Desktop app (Windows portable .exe)

```bash
npm run package  # builds release/SCDMG-<version>-portable.exe (~100 MB, single file)
npm run desktop  # runs the desktop build locally in Electron
```

Copy the exe to any Windows 10/11 x64 PC and run it. It needs no install and no Node.js, and it runs fully offline. The exe is unsigned, so on first run SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**. Save data (lists, maps, factions, settings) is kept in `%APPDATA%\SCDMG` and survives replacing the exe with a newer build. Press **Alt** for the File menu, which has backup, restore and "open data folder". **F11** toggles fullscreen. Details, the security settings, and how to swap in a real icon are in [docs/packaging.md](docs/packaging.md).

## Licence

MIT
