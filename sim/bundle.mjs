// Bundles sim/play.ts (and the engine it imports) into one plain ES module for the sim's worker
// threads. Each worker then just imports a file: no Vite module runner per worker (twenty of those
// starting at once used to time out), and the engine runs as one scope-hoisted module, which is
// faster than the runner's per-import property lookups.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

/**
 * Build the bundle and return its file URL (a string, so it can be posted to workers).
 * `dataDir` (SIM_DATA_DIR): play with alternative copies of factions.ts / abilities.ts, e.g. a
 * "before" snapshot for a before/after comparison. Their imports must point at the real engine files.
 */
export async function bundlePlay(dataDir = process.env.SIM_DATA_DIR) {
  const playPath = fileURLToPath(new URL("./play.ts", import.meta.url));
  const dir = dataDir?.replace(/\\/g, "/");
  const alias = dir ? [{ find: /^(\.{1,2}\/)+([\w-]+\/)*(factions|abilities)$/, replacement: `${dir}/$3.ts` }] : [];
  const outDir = mkdtempSync(join(tmpdir(), "scdmg-sim-"));
  await build({
    configFile: false,
    logLevel: "silent",
    resolve: { alias },
    build: {
      ssr: playPath,
      outDir,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      reportCompressedSize: false,
      rolldownOptions: { output: { format: "es", entryFileNames: "play.mjs" } },
    },
  });
  return pathToFileURL(join(outDir, "play.mjs")).href;
}
