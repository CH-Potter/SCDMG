// Worker thread for the balance sim. Loads sim/play.ts through Vite's module runner (so TypeScript
// works without a separate build), then plays the jobs the parent sends until told to stop.

import { parentPort } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const playPath = fileURLToPath(new URL("./play.ts", import.meta.url));
// SIM_DATA_DIR: play with alternative copies of factions.ts / abilities.ts (e.g. a "before" snapshot
// for a before/after comparison). Their imports must point at the real engine files.
const dataDir = process.env.SIM_DATA_DIR?.replace(/\\/g, "/");
const alias = dataDir ? [{ find: /^(\.{1,2}\/)+([\w-]+\/)*(factions|abilities)$/, replacement: `${dataDir}/$3.ts` }] : [];
const { module } = await runnerImport(playPath, { logLevel: "silent", configFile: false, resolve: { alias } });

parentPort.on("message", (job) => {
  if (job === null) {
    process.exit(0);
  }
  let result;
  try {
    result = module.playGame(job);
  } catch (e) {
    result = { job, error: String(e && e.stack ? e.stack : e) };
  }
  parentPort.postMessage(result);
});
parentPort.postMessage("ready");
