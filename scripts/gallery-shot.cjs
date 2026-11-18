// Dev tool: screenshot the miniature gallery to a PNG, headless, so art can be reviewed without a browser.
// Needs the dev server running (npm run dev).
//   npx electron scripts/gallery-shot.cjs <faction|all> <out.png> [width] [query]
// e.g. npx electron scripts/gallery-shot.cjs swarm shots/swarm.png 1400 "ground=5d7a45&px=220"

const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const [faction = "all", out = "gallery.png", width = "1400", extra = ""] = process.argv.slice(2).filter((a) => !a.startsWith("--") && !a.endsWith(".cjs"));
const base = process.env.GALLERY_URL || "http://localhost:5173/gallery.html";
const url = `${base}?faction=${encodeURIComponent(faction)}${extra ? `&${extra}` : ""}`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const w = Number(width) || 1400;
  const win = new BrowserWindow({ show: false, width: w, height: 900, webPreferences: { offscreen: true } });
  try {
    await win.loadURL(url);
    // let images decode and fonts settle
    await new Promise((r) => setTimeout(r, 1500));
    const h = await win.webContents.executeJavaScript("Math.ceil(document.documentElement.scrollHeight)");
    win.setContentSize(w, Math.min(h, 16000));
    await new Promise((r) => setTimeout(r, 800));
    const img = await win.webContents.capturePage();
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, img.toPNG());
    console.log(`wrote ${out} (${w}x${Math.min(h, 16000)}) from ${url}`);
  } catch (e) {
    console.error(String(e));
    process.exitCode = 1;
  }
  app.quit();
});
