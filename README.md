# Super Cool Desktop Miniatures Game (SCDMG)

[![CI](https://github.com/CH-Potter/SCDMG/actions/workflows/ci.yml/badge.svg)](https://github.com/CH-Potter/SCDMG/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

A cartoon sci-fi skirmish miniatures game that runs in the browser or as a Windows desktop app. You play against an AI opponent. This is an original game: the setting, factions, units and rules are all our own.

Free and open source under the [MIT licence](LICENSE).

## Features

- **Three factions** with distinct play styles: the ranged Dustline Militia, the melee horde of The Munch, and the elite specialists of the Lumen Concord.
- **Skirmish and Assault modes**, plus an **open roster** mode where you recruit as you go, RTS-style.
- **13 maps and 14 missions**, with raised platforms, ramps and ladders, cover, channels and choke points.
- **A greedy AI opponent** that plays every faction, and AI-vs-AI simulations for balance work.
- **A map editor and a faction forge** for building your own content, with custom unit art.
- **Procedural music and sound**, one style per faction.
- **A story to fight over**: lore pages for the valley and each faction, and comic-panel intro animations drawn live with the game's own miniatures.
- **A portable Windows build** that runs offline with no install.

## Run it

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests, including full AI-vs-AI games
npm run sim      # AI-vs-AI simulations across missions/maps with outcome stats (balance work)
npm run build    # typecheck + production build into dist/
```

## Rules in a nutshell

Each round has four phases: **Movement** (deploy, move, disengage, hunker), **Assault** (shoot, charge, advance), **Combat** (engaged units fight; chargers first) and **Scoring**. Players alternate activations within each phase. Armies start in reserve and deploy over time, limited by resources and a growing supply cap. Squads move by leader plus coherency; range, line of sight and cover are per model. Raised platforms are reached by ramps and ladders. Keywords such as light, armoured, heavy, flying and jump give soft rock–paper–scissors.

The full rules are in [docs/rules.md](docs/rules.md), and each faction's design pillars are in [docs/factions.md](docs/factions.md). The story of the Dustline valley, its three sides and the places they fight over is in [docs/lore.md](docs/lore.md), and in the game under **📖 Lore**.

## Factions

- **Dustline Militia:** scrappy frontier settlers. Rifle gunlines, artillery, overwatch and digging in, with drop-ship and airstrip arrivals.
- **The Munch:** farmland critters grafted with weapons and wired to the overmind of the evil bioengineer Dr. Graft. Cheap bodies, impact on the charge, regrowth, and tunnels to pop up where you least want them.
- **Lumen Concord:** smug alien invaders with saucers, ray guns and shields. Few elite models with precision shooting, and blinks, gates and portals to be in the right place.

## Project layout

| Path               | What it is                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `src/engine/`      | Pure, deterministic rules engine: no DOM, seeded RNG, `applyCommand(state, cmd)` reducer         |
| `src/engine/data/` | Factions, units, upgrades, abilities, maps and missions (data only; tune here)                   |
| `src/engine/ai.ts` | Greedy one-activation AI: simulates candidates, scores on expected damage, objectives and threat |
| `src/ui/`          | PixiJS board renderer, DOM HUD and the controller that connects them                             |
| `src/editor/`      | Map editor                                                                                       |
| `src/forge/`       | Faction forge (custom factions and unit art)                                                     |
| `src/audio/`       | Procedural music and sound effects                                                               |
| `electron/`        | Desktop app shell                                                                                |
| `tests/`           | Vitest unit and integration tests                                                                |
| `sim/`             | AI-vs-AI balance simulations (`npm run sim`)                                                     |
| `docs/`            | Rules, faction pillars, design notes and packaging                                               |

## Desktop app (Windows portable .exe)

```bash
npm run package  # builds release/SCDMG-<version>-portable.exe (~100 MB, single file)
npm run desktop  # runs the desktop build locally in Electron
```

Copy the exe to any Windows 10/11 x64 PC and run it. It needs no install and no Node.js, and it runs fully offline. The exe is unsigned, so on first run SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**. Save data (lists, maps, factions, settings) is kept in `%APPDATA%\SCDMG` and survives replacing the exe with a newer build. Press **Alt** for the File menu, which has backup, restore and "open data folder". **F11** toggles fullscreen. Details, the security settings, and how to swap in a real icon are in [docs/packaging.md](docs/packaging.md).

## Contributing

Bug reports, balance feedback, maps and code are all welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started, and [SECURITY.md](SECURITY.md) to report a security problem privately.

## Licence

[MIT](LICENSE). You can use, copy, modify and redistribute the game, including commercially, as long as the licence notice stays with it.
