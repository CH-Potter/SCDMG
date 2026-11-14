// Vite plugins used ONLY for the desktop (Electron) build: `vite build --mode desktop`.
// `npm run dev`, `npm run build`, `npm test` and `npm run sim` never load them.
//
// 1. desktopPixiNoEval: the packaged app runs under a CSP without 'unsafe-eval'. Pixi v8
//    refuses to start in that environment unless `pixi.js/unsafe-eval` (its eval-free
//    code path, despite the name) is imported first. We prepend that import to the entry
//    module. If src/main.ts ever imports it itself, this becomes a no-op.
//
// 2. desktopOfflineFonts: makes Google Fonts work offline. Any
//      <link href="https://fonts.googleapis.com/css...">        in index.html, and any
//      @import url("https://fonts.googleapis.com/css...")       in bundled CSS
//    is downloaded ONCE at build time (cached in .cache/fonts/), the font files are written
//    into <outDir>/fonts/, and the references are rewritten to the local copies.
//    Preconnect hints to the Google hosts are removed. The fonts are OFL-licensed.
//    Finally the build output is scanned and the build FAILS if any Google Fonts URL survives.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const GOOGLE_CSS = /https:\/\/fonts\.googleapis\.com\/css2?\?[^"')\s]+/g;
// A current desktop Chrome UA so Google serves woff2 with unicode-range subsets.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const decodeHtml = (s) => s.replace(/&amp;/g, "&");

export function desktopPixiNoEval({ entry = "src/main.ts" } = {}) {
  let entryAbs = "";
  return {
    name: "scdmg-desktop-pixi-no-eval",
    apply: "build",
    configResolved(cfg) {
      entryAbs = path.resolve(cfg.root, entry).replace(/\\/g, "/");
    },
    transform(code, id) {
      if (id.replace(/\\/g, "/").split("?")[0] !== entryAbs) return null;
      if (code.includes("pixi.js/unsafe-eval")) return null;
      return { code: `import "pixi.js/unsafe-eval";\n${code}`, map: null };
    },
  };
}

export function desktopOfflineFonts({ cacheDir = ".cache/fonts" } = {}) {
  let root = "";
  let outDir = "";
  /** url -> { cssFile, css } */
  const sheets = new Map();
  /** fileName -> Buffer */
  const fontFiles = new Map();

  async function fetchCached(url, kind) {
    const ext = kind === "css" ? ".css" : path.extname(new URL(url).pathname) || ".bin";
    const file = path.join(root, cacheDir, `${sha(url)}${ext}`);
    if (fs.existsSync(file)) return fs.readFileSync(file);
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`[offline-fonts] ${res.status} ${res.statusText} for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    return buf;
  }

  /** Download a Google Fonts stylesheet + its font files; returns the local css file name. */
  async function localize(rawUrl) {
    const url = decodeHtml(rawUrl);
    if (sheets.has(url)) return sheets.get(url).cssFile;
    let css = (await fetchCached(url, "css")).toString("utf8");
    const fontUrls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
    for (const fu of fontUrls) {
      const buf = await fetchCached(fu, "font");
      const name = `${sha(fu)}${path.extname(new URL(fu).pathname) || ".woff2"}`;
      fontFiles.set(name, buf);
      css = css.split(fu).join(name); // same folder as the css file
    }
    const cssFile = `fonts-${sha(url)}.css`;
    sheets.set(url, { cssFile, css });
    console.log(`[offline-fonts] vendored ${url} (${fontUrls.length} font files)`);
    return cssFile;
  }

  return {
    name: "scdmg-desktop-offline-fonts",
    apply: "build",
    configResolved(cfg) {
      root = cfg.root;
      outDir = path.resolve(cfg.root, cfg.build.outDir);
    },
    transformIndexHtml: {
      order: "post",
      async handler(html) {
        // Drop preconnect / dns-prefetch hints to Google's font hosts.
        html = html.replace(/[ \t]*<link[^>]+href="https:\/\/fonts\.(googleapis|gstatic)\.com\/?"[^>]*>[ \t]*\r?\n?/g, (tag) =>
          /rel="(preconnect|dns-prefetch)"/.test(tag) ? "" : tag,
        );
        for (const m of [...html.matchAll(GOOGLE_CSS)]) {
          const cssFile = await localize(m[0]);
          html = html.split(m[0]).join(`./fonts/${cssFile}`);
        }
        return html;
      },
    },
    async generateBundle(_opts, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== "asset" || !asset.fileName.endsWith(".css")) continue;
        let css = typeof asset.source === "string" ? asset.source : Buffer.from(asset.source).toString("utf8");
        const urls = [...new Set(css.match(GOOGLE_CSS) || [])];
        if (!urls.length) continue;
        const depth = asset.fileName.split("/").length - 1;
        const prefix = depth ? "../".repeat(depth) : "./";
        for (const u of urls) css = css.split(u).join(`${prefix}fonts/${await localize(u)}`);
        asset.source = css;
      }
    },
    writeBundle() {
      if (!sheets.size) return;
      const dir = path.join(outDir, "fonts");
      fs.mkdirSync(dir, { recursive: true });
      for (const { cssFile, css } of sheets.values()) fs.writeFileSync(path.join(dir, cssFile), css);
      for (const [name, buf] of fontFiles) fs.writeFileSync(path.join(dir, name), buf);
    },
    closeBundle() {
      // Guard: nothing in the HTML/CSS output may still point at Google Fonts.
      const offenders = [];
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (/\.(html|css)$/.test(e.name) && /fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(p, "utf8")))
            offenders.push(path.relative(outDir, p));
        }
      };
      if (fs.existsSync(outDir)) walk(outDir);
      if (offenders.length) throw new Error(`[offline-fonts] Google Fonts URLs remain in: ${offenders.join(", ")}`);
    },
  };
}
