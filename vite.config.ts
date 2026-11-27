import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { desktopOfflineFonts, desktopPixiNoEval } from "./scripts/vite-plugin-desktop.mjs";

/** package.json's version: online players must be on the same release (src/net/build.ts). */
const APP_VERSION: string = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

/** The short git commit this build came from, or "unknown" outside a git checkout (a source zip). */
function gitCommit(): string {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).toString().trim();
    return /^[0-9a-f]{4,40}$/.test(sha) ? sha : "unknown";
  } catch {
    return "unknown";
  }
}

// `--mode desktop` is used only by `npm run package` / `npm run desktop` (Electron build).
// The web build uses relative asset paths too, so it works from any folder, such as GitHub Pages'
// https://<user>.github.io/SCDMG/ (see .github/workflows/pages.yml). Both builds bundle the fonts
// (downloaded once at build time), so players' browsers never contact Google; the dev server still
// loads them from Google.
export default defineConfig(({ mode }) => {
  const desktop = mode === "desktop";
  return {
    base: "./",
    // The build's version, for the online game's version check (declared in src/vite-env.d.ts). Tests see them too.
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
      __APP_COMMIT__: JSON.stringify(gitCommit()),
    },
    plugins: desktop ? [desktopPixiNoEval(), desktopOfflineFonts()] : [desktopOfflineFonts()],
    ...(desktop ? { build: { outDir: "dist-desktop", emptyOutDir: true } } : {}),
    test: { include: [process.env.VITEST_SIM ? "sim/**/*.test.ts" : "tests/**/*.test.ts"] },
  };
});
