# Contributing to SCDMG

Thanks for wanting to help. Bug reports, balance feedback, new maps, missions, units and code are all welcome.

## Ground rules

- **Keep it original.** SCDMG has its own setting, factions, units and rules. Please don't add names, art, rules text or lore copied from existing games or other copyrighted works.
- **Keep faction identity.** New units and supports should fit their faction's pillars in [docs/factions.md](docs/factions.md). `tests/factionIdentity.test.ts` checks the main ones.
- **Be kind.** Assume good faith, keep feedback about the work, and help newcomers.

## Getting set up

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
npm run dev        # play at http://localhost:5173
npm test           # run the test suite
npm run typecheck  # strict TypeScript check
npm run format     # Prettier
```

## How the code fits together

- `src/engine/` is a pure, deterministic rules engine. Game state only changes through `applyCommand(state, cmd)`, and all randomness comes from the seeded RNG in the state. Don't use `Math.random()`, the clock or the DOM in the engine; that keeps games replayable and the AI's look-ahead correct.
- `src/engine/data/` holds the content: factions, units, abilities, maps and missions. Most balance changes belong here.
- `src/ui/`, `src/editor/`, `src/forge/` and `src/audio/` are the browser side, built on PixiJS and plain DOM.
- The rules reference is [docs/rules.md](docs/rules.md). If you change a rule, update it there too.

## Balance changes

The AI plays every faction, so you can measure a change with AI-vs-AI games:

```bash
npm run sim
```

For a narrower run, set environment variables and call Vitest directly (bash syntax shown):

```bash
VITEST_SIM=1 SIM_MODE=assault SIM_SEEDS=3 npx vitest run sim/ai-sim.test.ts --silent=false
```

`SIM_MODE` is `skirmish` or `assault`; `SIM_FACTIONS`, `SIM_MAPS` and `SIM_OPEN=1` narrow it further. Run one sim at a time. In a pull request that changes balance, include the win rates before and after.

`sim/run.mjs` wraps the same sim with flags, keeps each run's results and report in `sim/out/`, and prints the pairing tables at the end (`sim/summary.mjs` prints them, and per-unit and ability-use tables, from any results file):

```bash
npm run sim:quick                                   # Skirmish, 1 seed: the first look at a change
npm run sim:quick -- --factions concord,swarm       # one pairing
node sim/run.mjs --mode assault --seeds 3 --vs sim/out/<before>.json   # full run, with the change per pairing
node sim/summary.mjs sim/out/<run>.json --pair concord-swarm           # VP sources, missions, maps, seeds, units
```

Engine or AI changes that shouldn't change what the AI decides (refactors, speed-ups) can be checked with `npm run sim:golden`: it plays a fixed cross-section of both modes and fails if any game plays differently from `sim/golden.json` (same commands, same final state). For a bigger check, run the full sim before and after with `--tag before` / `--ref sim/out/before.json`. If a change is meant to alter the AI, rewrite the golden file with `npm run sim:golden -- --update`.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Make your change, with tests for new rules or engine behaviour.
3. Check that `npm run typecheck` and `npm test` pass, and run `npm run format`.
4. Open a pull request describing what changed and why. Screenshots help for UI changes.

By contributing, you agree that your contribution is licensed under the project's licence, the [GNU General Public License v3.0 or later](LICENSE), and that you keep the existing copyright and credit notices.
