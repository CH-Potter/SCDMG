// Did two sim runs play the same games? Matches games by job (mode, factions, mission, map, seed)
// and compares winner, VP, command count and the fingerprints play.ts records (`hash`: every
// command the AIs chose; `stateHash`: the final state). Use it to check that an engine or AI change
// meant to be a pure speed-up changes nothing, or to see how much a real change moved.
//
//   node sim/compare.mjs <reference.json> <new.json>     (SIM_OUT files, or a golden file)
//
// Exit code 1 if any game differs or is missing. Also used by the sim itself (SIM_REF).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A game's identity, independent of its position in the job list. */
export const jobKey = (j) => `${j.mode}|${j.factions[0]}-${j.factions[1]}|${j.missionId}|${j.mapId}|${j.seed}`;

/** The parts of a result that must match for "the same game". */
export const fingerprint = (g) => ({
  winner: g.winner,
  vp: g.vp,
  cmds: g.cmds,
  hash: g.hash,
  stateHash: g.stateHash,
  error: g.error ? String(g.error).split("\n")[0] : undefined,
});

/** A compact reference file: one fingerprint per game, keyed by job. */
export function toGolden(results) {
  const out = {};
  for (const g of [...results].sort((a, b) => jobKey(a.job).localeCompare(jobKey(b.job)))) out[jobKey(g.job)] = fingerprint(g);
  return out;
}

/** A golden object as file text, one game per line. */
export const goldenText = (golden) =>
  `{\n${Object.entries(golden)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(",\n")}\n}\n`;

/** Normalise a SIM_OUT array or a golden object to { key: fingerprint }. */
function asMap(data) {
  if (Array.isArray(data)) return toGolden(data);
  return data;
}

/**
 * Compare `results` with `reference` (either form). Only games present in `results` are checked
 * unless `requireAll` is set. Returns { checked, same, diffs: string[] }.
 */
export function compareRuns(reference, results, requireAll = false) {
  const ref = asMap(reference);
  const now = asMap(results);
  const diffs = [];
  let checked = 0;
  let same = 0;
  for (const [key, f] of Object.entries(now)) {
    const r = ref[key];
    if (!r) {
      diffs.push(`${key}: not in the reference`);
      continue;
    }
    checked += 1;
    const bad = Object.keys(r).filter((k) => r[k] !== undefined && JSON.stringify(r[k]) !== JSON.stringify(f[k]));
    if (!bad.length) same += 1;
    else diffs.push(`${key}: ${bad.map((k) => `${k} ${JSON.stringify(r[k])} -> ${JSON.stringify(f[k])}`).join(", ")}`);
  }
  if (requireAll) for (const key of Object.keys(ref)) if (!now[key]) diffs.push(`${key}: missing from the new run`);
  return { checked, same, diffs };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [a, b] = process.argv.slice(2);
  if (!b) {
    console.log("Usage: node sim/compare.mjs <reference.json> <new.json>");
    process.exit(2);
  }
  const read = (f) => JSON.parse(readFileSync(f, "utf8"));
  const { checked, same, diffs } = compareRuns(read(a), read(b));
  for (const d of diffs.slice(0, 40)) console.log(d);
  if (diffs.length > 40) console.log(`... and ${diffs.length - 40} more`);
  console.log(`${same}/${checked} games identical${diffs.length ? `, ${diffs.length} differ or missing` : ""}`);
  process.exit(diffs.length ? 1 : 0);
}
