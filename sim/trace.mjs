// Prints a per-round summary of one AI-vs-AI game (objective control, units on board, VP, morale).
// Usage: node sim/trace.mjs <factionA> <factionB> <missionId> <mapId> <seed>
//   e.g. node sim/trace.mjs concord swarm grab mesa 11

import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const [a, b, mission, map, seed] = process.argv.slice(2);
if (!seed) {
  console.log("Usage: node sim/trace.mjs <factionA> <factionB> <missionId> <mapId> <seed>");
  process.exit(1);
}
const tracePath = fileURLToPath(new URL("./trace.ts", import.meta.url));
const { module } = await runnerImport(tracePath, { logLevel: "silent", configFile: false });
console.log(module.trace(a, b, mission, map, Number(seed)));
process.exit(0);
