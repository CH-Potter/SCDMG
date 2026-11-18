// AI-vs-AI balance sim. Run with:
//   VITEST_SIM=1 npx vitest run sim/ai-sim.test.ts --silent=false   (or `npm run sim`, or sim/run.mjs)
//
// Plays the full matrix: every mission x every map of each mode x every ordered faction pairing
// (so each faction plays both sides of every pairing) x SIM_SEEDS seeds. Games run in parallel
// worker threads (sim/worker.mjs, on a bundle of sim/play.ts built once by sim/bundle.mjs) and the
// results are printed as win-rate tables (sim/report.ts): per faction, per pairing (each pairing is
// played from both sides), per mission and per map, plus draws, average VP, a side-bias check, a
// stall check and per-unit stats. Score% counts a draw as half.
// Figures are AI-vs-AI: the same greedy AI plays every faction, so they approximate human play only.
//
// Env knobs:
//   SIM_SEEDS    seeds per config (default 3: 684 Skirmish + 378 Assault games; Assault games cost
//                several times a Skirmish game, so SIM_MODE=skirmish is the quick check)
//   SIM_MODE     skirmish | assault | all (default all)
//   SIM_WORKERS  worker threads (default: CPU cores - 2, max 20)
//   SIM_OUT      write the raw results as JSON to this path (sim/summary.mjs prints more tables from it)
//   SIM_REF      compare every game with this earlier SIM_OUT file (or a golden file, see sim/golden.json):
//                the test fails if any game played differently (see sim/compare.mjs)
//   SIM_SEED0    first seed (default 11); seeds are SIM_SEED0 + i * 101
//   SIM_STRIDE   keep only every Nth game of the matrix (a cheap cross-section; sim:golden uses 7)
//   SIM_FACTIONS comma-separated factions to include (default: all built-ins), e.g. concord,militia
//   SIM_LISTS    JSON file of roster overrides, { "<faction>": { "skirmish": [...], "assault": [...] } } (see play.ts)
//   SIM_MISSIONS comma-separated mission ids to include (default: all of the mode), e.g. siege,convoy
//   SIM_MAPS     comma-separated map ids to include (default: every map that fits the mission)
//   SIM_OPEN     1 = open roster (RTS-style) games: no lists, recruit any unit (src/engine/openRoster.ts)
//   SIM_OPEN_CAP per-unit cap on the table in open roster games: a number, or "none" (default: the mode's max copies)
//   SIM_BONUS    a campaign-style head start for player 1 (side A), e.g. "resources=2,cp=2" (see play.ts)
//   SIM_DATA_DIR play with alternative copies of factions.ts / abilities.ts (see sim/bundle.mjs)
// Each mission plays only on the maps it fits (missionFitsMap: mode, required map tags, symmetric vs
// asymmetric). Role missions also get a per-role win-rate table (side A = player 1, side B = player 2).

import { expect, it } from "vitest";
import { availableParallelism } from "node:os";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { BUILT_IN_FACTION_IDS } from "../src/engine/data/factions";
import { MAPS } from "../src/engine/data/maps";
import { MISSIONS, missionFitsMap } from "../src/engine/data/missions";
import type { GameResult, Job } from "./play";
import { report } from "./report";
// @ts-expect-error plain JS helpers (no type declarations)
import { bundlePlay } from "./bundle.mjs";
// @ts-expect-error plain JS helpers (no type declarations)
import { compareRuns } from "./compare.mjs";

const seeds = Number(process.env.SIM_SEEDS ?? 3);
const seed0 = Number(process.env.SIM_SEED0 ?? 11);
const stride = Math.max(1, Number(process.env.SIM_STRIDE ?? 1));
const modeEnv = process.env.SIM_MODE ?? "all";
const modes = (["assault", "skirmish"] as const).filter((m) => modeEnv === "all" || modeEnv === m);
const factionFilter = process.env.SIM_FACTIONS ? process.env.SIM_FACTIONS.split(",").map((f) => f.trim()) : undefined;
const factions = BUILT_IN_FACTION_IDS.filter((f) => !factionFilter || factionFilter.includes(f));
const missionFilter = process.env.SIM_MISSIONS ? process.env.SIM_MISSIONS.split(",").map((f) => f.trim()) : undefined;
const mapFilter = process.env.SIM_MAPS ? process.env.SIM_MAPS.split(",").map((f) => f.trim()) : undefined;
const workers = Math.max(1, Math.min(Number(process.env.SIM_WORKERS ?? availableParallelism() - 2), 20));

function buildJobs(): Job[] {
  const jobs: Job[] = [];
  let n = 0;
  for (const mode of modes) {
    const missions = Object.values(MISSIONS).filter((m) => m.mode === mode && (!missionFilter || missionFilter.includes(m.id)));
    for (const mission of missions)
      for (const map of Object.values(MAPS).filter((m) => missionFitsMap(mission, m) && (!mapFilter || mapFilter.includes(m.id))))
        for (const a of factions)
          for (const b of factions) {
            if (a === b) continue;
            for (let i = 0; i < seeds; i++) {
              if (n++ % stride) continue;
              jobs.push({ id: jobs.length, mode, factions: [a, b], missionId: mission.id, mapId: map.id, seed: seed0 + i * 101 });
            }
          }
  }
  return jobs; // assault first: the long games start early, which keeps the pool busy to the end
}

function runPool(jobs: Job[], bundle: string): Promise<GameResult[]> {
  return new Promise((resolve, reject) => {
    const results: GameResult[] = [];
    let next = 0;
    let live = 0;
    const startTime = Date.now();
    const feed = (w: Worker) => {
      if (next < jobs.length) w.postMessage(jobs[next++]);
      else {
        w.postMessage(null);
        if (--live === 0) resolve(results);
      }
    };
    for (let i = 0; i < Math.min(workers, jobs.length); i++) {
      const w = new Worker(new URL("./worker.mjs", import.meta.url), { workerData: { bundle } });
      live += 1;
      w.on("message", (msg: GameResult | "ready") => {
        if (msg !== "ready") {
          results.push(msg);
          if (results.length % 100 === 0)
            console.log(`  ${results.length}/${jobs.length} games, ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
        }
        feed(w);
      });
      w.on("error", reject);
    }
  });
}

it("sim: balance matrix", async () => {
  const jobs = buildJobs();
  const t0 = Date.now();
  const bundle: string = await bundlePlay();
  console.log(`sim: ${jobs.length} games (${modes.join(" + ")}, ${seeds} seeds per config${stride > 1 ? `, every ${stride}th game` : ""}) on ${workers} workers`);
  let results: GameResult[];
  try {
    results = (await runPool(jobs, bundle)).sort((x, y) => x.job.id - y.job.id);
  } finally {
    rmSync(dirname(fileURLToPath(bundle)), { recursive: true, force: true });
  }
  const out: string[] = [];
  for (const mode of modes) out.push(report(mode.toUpperCase(), results.filter((g) => g.job.mode === mode)));
  if (modes.length > 1) out.push(report("BOTH MODES", results));
  out.push(`wall time ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(out.join("\n\n"));
  if (process.env.SIM_OUT) writeFileSync(process.env.SIM_OUT, JSON.stringify(results));
  if (process.env.SIM_REF) {
    const { checked, same, diffs } = compareRuns(JSON.parse(readFileSync(process.env.SIM_REF, "utf8")), results) as { checked: number; same: number; diffs: string[] };
    console.log([`reference check (${process.env.SIM_REF}): ${same}/${checked} games identical`, ...diffs.slice(0, 40)].join("\n"));
    expect(diffs, "games that played differently from the reference").toEqual([]);
  }
}, 3_600_000);
