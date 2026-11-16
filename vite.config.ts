import { defineConfig } from "vitest/config";
import { desktopOfflineFonts, desktopPixiNoEval } from "./scripts/vite-plugin-desktop.mjs";

// `--mode desktop` is used only by `npm run package` / `npm run desktop` (Electron build).
// The web build uses relative asset paths too, so it works from any folder, such as GitHub Pages'
// https://<user>.github.io/SCDMG/ (see .github/workflows/pages.yml). Both builds bundle the fonts
// (downloaded once at build time), so players' browsers never contact Google; the dev server still
// loads them from Google.
export default defineConfig(({ mode }) => {
  const desktop = mode === "desktop";
  return {
    base: "./",
    plugins: desktop ? [desktopPixiNoEval(), desktopOfflineFonts()] : [desktopOfflineFonts()],
    ...(desktop ? { build: { outDir: "dist-desktop", emptyOutDir: true } } : {}),
    test: { include: [process.env.VITEST_SIM ? "sim/**/*.test.ts" : "tests/**/*.test.ts"] },
  };
});
