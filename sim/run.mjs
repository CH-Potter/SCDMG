// Run the balance sim (sim/ai-sim.test.ts) with flags instead of env vars, keep its results and log,
// and print the balance-pass tables (sim/summary.mjs) at the end.
//
//   node sim/run.mjs [--mode skirmish|assault|all] [--seeds 3] [--seed0 11] [--stride N]
//                    [--factions a,b] [--missions m1,m2] [--maps m1,m2] [--lists lists.json]
//                    [--workers N] [--tag name] [--ref ref.json] [--vs before.json] [--quiet]
//
// Results go to sim/out/<tag>.json and the full report to sim/out/<tag>.log (tag: mode + time by
// default). --ref checks every game against an earlier run (fails if any played differently);
// --vs prints the pairing tables with the change from an earlier run.
//
// Shortcuts (package.json):
//   npm run sim:quick  -- [flags]   Skirmish, 1 seed (228 games): the first look at a change
//   npm run sim:golden              a fixed cross-section of both modes (every 7th game, 1 seed),
//                                   checked against sim/golden.json: proves a refactor or speed-up
//                                   leaves every game unchanged. --update rewrites the golden file.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { goldenText, toGolden } from "./compare.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};

const golden = flag("golden");
const goldenFile = join(root, "sim", "golden.json");
const update = flag("update");
const mode = opt("mode", golden ? "all" : "skirmish");
const env = {
  ...process.env,
  VITEST_SIM: "1",
  SIM_MODE: mode,
  SIM_SEEDS: opt("seeds", golden ? "1" : "3"),
};
const pass = { seed0: "SIM_SEED0", stride: "SIM_STRIDE", factions: "SIM_FACTIONS", missions: "SIM_MISSIONS", maps: "SIM_MAPS", lists: "SIM_LISTS", workers: "SIM_WORKERS" };
for (const [k, v] of Object.entries(pass)) if (opt(k) !== undefined) env[v] = opt(k);
if (golden) env.SIM_STRIDE = opt("stride", "7");

const outDir = join(root, "sim", "out");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const tag = opt("tag", golden ? `golden-${stamp}` : `${mode}-${stamp}`);
const out = join(outDir, `${tag}.json`);
const log = join(outDir, `${tag}.log`);
env.SIM_OUT = out;
const ref = golden && !update ? goldenFile : opt("ref");
if (ref) env.SIM_REF = ref;

console.log(`sim ${tag}: mode ${env.SIM_MODE}, ${env.SIM_SEEDS} seed(s)${env.SIM_STRIDE ? `, every ${env.SIM_STRIDE}th game` : ""}${ref ? `, checked against ${ref}` : ""}`);
const vitest = join(root, "node_modules", "vitest", "vitest.mjs");
const t0 = Date.now();
const r = spawnSync(process.execPath, [vitest, "run", "sim/ai-sim.test.ts", "--silent=false"], { cwd: root, env, encoding: "utf8", maxBuffer: 1 << 28 });
const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
writeFileSync(log, text);
const wall = ((Date.now() - t0) / 1000).toFixed(0);
const lines = text.split(/\r?\n/);
const pick = (re, after = 0) => {
  const i = lines.findIndex((l) => re.test(l));
  return i < 0 ? [] : lines.slice(i, i + 1 + after);
};
if (!existsSync(out)) {
  console.log(lines.filter((l) => /error|fail|timed out/i.test(l)).slice(0, 20).join("\n"));
  console.log(`sim failed after ${wall}s: no results (full log: ${log})`);
  process.exit(1);
}
if (!flag("quiet")) console.log([...pick(/^faction\s+games/, 3), "", ...pick(/^pairing \(A vs B\)/, 3)].join("\n"));
console.log([...pick(/^reference check/, 40), ...pick(/^wall time/)].join("\n"));
if (golden && update) {
  writeFileSync(goldenFile, goldenText(toGolden(JSON.parse(readFileSync(out, "utf8")))));
  console.log(`wrote ${goldenFile}`);
}
if (!golden && !flag("quiet")) {
  const vs = opt("vs");
  spawnSync(process.execPath, [join(root, "sim", "summary.mjs"), out, ...(vs ? ["--vs", vs] : []), "--only", "pairs,seeds"], { stdio: "inherit" });
}
console.log(`results ${out}\nlog     ${log}\n(${wall}s)`);
process.exit(r.status ?? 1);
