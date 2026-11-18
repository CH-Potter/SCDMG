// Worker thread for the balance sim. Imports the bundled sim/play.ts (see sim/bundle.mjs; the parent
// builds it once and passes its URL as workerData), then plays the jobs the parent sends until told
// to stop.

import { parentPort, workerData } from "node:worker_threads";

const { playGame } = await import(workerData.bundle);

parentPort.on("message", (job) => {
  if (job === null) {
    process.exit(0);
  }
  let result;
  try {
    result = playGame(job);
  } catch (e) {
    result = { job, error: String(e && e.stack ? e.stack : e) };
  }
  parentPort.postMessage(result);
});
parentPort.postMessage("ready");
