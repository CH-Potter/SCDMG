import { defineConfig } from "vitest/config";
import { desktopOfflineFonts, desktopPixiNoEval } from "./scripts/vite-plugin-desktop.mjs";

// `--mode desktop` is used only by `npm run package` / `npm run desktop` (Electron build).
// Every other mode (dev server, `npm run build`, Vitest) gets exactly the previous config.
export default defineConfig(({ mode }) => {
  const desktop = mode === "desktop";
  return {
    ...(desktop
      ? {
          base: "./",
          plugins: [desktopPixiNoEval(), desktopOfflineFonts()],
          build: { outDir: "dist-desktop", emptyOutDir: true },
        }
      : {}),
    test: { include: [process.env.VITEST_SIM ? "sim/**/*.test.ts" : "tests/**/*.test.ts"] },
  };
});
