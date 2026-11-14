// AI-vs-AI balance sim. Run with:
//   VITEST_SIM=1 npx vitest run --reporter=verbose      (or `npm run sim`)
//
// Plays the full matrix: every mission x every map of each mode x every ordered faction pairing
// (so each faction plays both sides of every pairing) x SIM_SEEDS seeds. Games run in parallel
// worker threads (sim/worker.mjs) and the results are printed as win-rate tables (sim/report.ts):
// per faction, per pairing (each pairing is played from both sides), per mission and per map, plus
// draws, average VP, a side-bias check, a stall check and per-unit stats. Score% counts a draw as half.
// Figures are AI-vs-AI: the same greedy AI plays every faction, so they approximate human play only.
//
// Env knobs:
//   SIM_SEEDS    seeds per config (default 3: 324 games, about 6-7 minutes on 20 threads; Assault
//                games cost ~10x a Skirmish game, so SIM_MODE=skirmish is the quick check)
//   SIM_MODE     skirmish | assault | all (default all)
//   SIM_WORKERS  worker threads (default: CPU cores - 2, max 20)
//   SIM_OUT      write the raw results as JSON to this path
//   SIM_SEED0    first seed (default 11); seeds are SIM_SEED0 + i * 101
//   SIM_FACTIONS comma-separated factions to include (default: all built-ins), e.g. concord,militia
//   SIM_LISTS    JSON file of roster overrides, { "<faction>": { "skirmish": [...], "assault": [...] } } (see play.ts)
//   SIM_MISSIONS comma-separated mission ids to include (default: all of the mode), e.g. siege,convoy
//   SIM_MAPS     comma-separated map ids to include (default: every map that fits the mission)
//   SIM_OPEN     1 = open roster (RTS-style) games: no lists, recruit any unit (src/engine/openRoster.ts)
//   SIM_OPEN_CAP per-unit cap on the table in open roster games: a number, or "none" (default: the mode's max copies)
// Each mission plays only on the maps it fits (missionFitsMap: mode, required map tags, symmetric vs
// asymmetric). Role missions also get a per-role win-rate table (side A = player 1, side B = player 2).

import { it } from "vitest";
import { availableParallelism } from "node:os";
import { writeFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { BUILT_IN_FACTION_IDS } from "../src/engine/data/factions";
import { MAPS } from "../src/engine/data/maps";
import { MISSIONS, missionFitsMap } from "../src/engine/data/missions";
import type { GameResult, Job } from "./play";
import { report } from "./report";

const seeds = Number(process.env.SIM_SEEDS ?? 3);
const seed0 = Number(process.env.SIM_SEED0 ?? 11);
const modeEnv = process.env.SIM_MODE ?? "all";
const modes = (["assault", "skirmish"] as const).filter((m) => modeEnv === "all" || modeEnv === m);
const factionFilter = process.env.SIM_FACTIONS ? process.env.SIM_FACTIONS.split(",").map((f) => f.trim()) : undefined;
const factions = BUILT_IN_FACTION_IDS.filter((f) => !factionFilter || factionFilter.includes(f));
const missionFilter = process.env.SIM_MISSIONS ? process.env.SIM_MISSIONS.split(",").map((f) => f.trim()) : undefined;
const mapFilter = process.env.SIM_MAPS ? process.env.SIM_MAPS.split(",").map((f) => f.trim()) : undefined;
const workers = Math.max(1, Math.min(Number(process.env.SIM_WORKERS ?? availableParallelism() - 2), 20));

function buildJobs(): Job[] {
  const jobs: Job[] = [];
  for (const mode of modes) {
    const missions = Object.values(MISSIONS).filter((m) => m.mode === mode && (!missionFilter || missionFilter.includes(m.id)));
    for (const mission of missions)
      for (const map of Object.values(MAPS).filter((m) => missionFitsMap(mission, m) && (!mapFilter || mapFilter.includes(m.id))))
        for (const a of factions)
          for (const b of factions) {
            if (a === b) continue;
            for (let i = 0; i < seeds; i++)
              jobs.push({ id: jobs.length, mode, factions: [a, b], missionId: mission.id, mapId: map.id, seed: seed0 + i * 101 });
          }
  }
  return jobs; // assault first: the long games start early, which keeps the pool busy to the end
}

function runPool(jobs: Job[]): Promise<GameResult[]> {
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
      const w = new Worker(new URL("./worker.mjs", import.meta.url));
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
  console.log(`sim: ${jobs.length} games (${modes.join(" + ")}, ${seeds} seeds per config) on ${workers} workers`);
  const results = (await runPool(jobs)).sort((x, y) => x.job.id - y.job.id);
  const out: string[] = [];
  for (const mode of modes) out.push(report(mode.toUpperCase(), results.filter((g) => g.job.mode === mode)));
  if (modes.length > 1) out.push(report("BOTH MODES", results));
  out.push(`wall time ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(out.join("\n\n"));
  if (process.env.SIM_OUT) writeFileSync(process.env.SIM_OUT, JSON.stringify(results));
}, 3_600_000);
