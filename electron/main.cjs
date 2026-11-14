// Electron main process for the SCDMG desktop build.
//
// Plain CommonJS on purpose: it is not part of the app's tsconfig, needs no build
// step, and package.json has "type": "module" (hence the .cjs extension).
//
// The game itself is the Vite production build in dist-desktop/ (see `npm run package`).
// It is served from a private, privileged `app://scdmg/` scheme rather than file://, so:
//   - the page has a stable origin, which is what localStorage is keyed on (saves persist);
//   - we can attach a strict Content-Security-Policy header to every response;
//   - nothing outside dist-desktop/ can be read by the page.
"use strict";

const { app, BrowserWindow, Menu, dialog, protocol, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { allowNavigation, windowOpenHandler } = require("./navigation.cjs");

const APP_TITLE = "Super Cool Desktop Miniatures Game";
// Must never change once released: the scheme + host form the page origin that
// localStorage (saved lists, custom maps, factions, settings) is stored under.
const SCHEME = "app";
const HOST = "scdmg";
const ORIGIN = `${SCHEME}://${HOST}`;
const DIST_DIR = path.join(__dirname, "..", "dist-desktop");
const ICON_PNG = path.join(__dirname, "..", "build", "icon.png");
const IS_DEV = !app.isPackaged;

// Strict CSP for the packaged game. Notes:
//  - script-src 'self' only: no inline scripts, no eval (Pixi's eval-free path is
//    forced by the desktop Vite plugin, see scripts/vite-plugin-desktop.mjs).
//  - style-src needs 'unsafe-inline' because the UI sets inline style attributes.
//  - img/worker/connect allow blob:/data: for Pixi textures and the JSON export downloads.
//  - no http(s) anywhere: the app is fully offline.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

// --- Save-data location --------------------------------------------------------------
// Default: %APPDATA%\SCDMG (stable regardless of where the portable exe is run from).
// Opt-in "USB stick mode": if a folder named SCDMG-data exists next to the .exe,
// data is kept there instead. PORTABLE_EXECUTABLE_DIR is set by the portable launcher.
function resolveUserDataDir() {
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (exeDir) {
    const local = path.join(exeDir, "SCDMG-data");
    try {
      if (fs.statSync(local).isDirectory()) return local;
    } catch {
      /* not present: use the default */
    }
  }
  return path.join(app.getPath("appData"), "SCDMG");
}
app.setName(APP_TITLE);
app.setPath("userData", resolveUserDataDir());
app.setAppUserModelId("com.scdmg.desktop");

// Two instances would fight over the same localStorage database.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

async function serveDist(request) {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response("Not found", { status: 404 });
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  const file = path.normalize(path.join(DIST_DIR, rel));
  // Refuse anything that escapes dist-desktop/.
  if (!file.startsWith(DIST_DIR + path.sep)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await fs.promises.readFile(file);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Security-Policy": CSP,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function hardenSession(ses) {
  ses.protocol.handle(SCHEME, serveDist);

  // Belt and braces for "no network": cancel every http(s)/ws(s) request outright.
  ses.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (details, cb) => {
    console.warn(`[scdmg] blocked network request: ${details.url}`);
    cb({ cancel: true });
  });

  // The game needs no camera, mic, geolocation, notifications, etc. Clipboard
  // writes and fullscreen are harmless and may be used by the UI.
  const allowed = new Set(["clipboard-sanitized-write", "fullscreen"]);
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  // No spell-check dictionaries (they are downloaded from the network on demand).
  ses.setSpellCheckerEnabled(false);
}

function createWindow() {
  const win = new BrowserWindow({
    title: APP_TITLE,
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#6b4f8a", // matches the page background in src/ui/style.css
    show: false,
    autoHideMenuBar: true, // press Alt to show the menu
    icon: fs.existsSync(ICON_PNG) ? ICON_PNG : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      devTools: IS_DEV, // disabled in the packaged exe
      // No preload script: the game needs no Node or IPC access.
    },
  });

  // Keep the fixed title (the page's <title> could otherwise replace it).
  win.on("page-title-updated", (e) => e.preventDefault());
  win.once("ready-to-show", () => win.show());

  const wc = win.webContents;
  // Block navigation away from the app and every new window, outright. Nothing is ever
  // handed to the OS browser (no shell.openExternal anywhere): the game has no external
  // links, and the app must never open URLs on its own. See electron/navigation.cjs.
  wc.on("will-navigate", (e, url) => {
    if (!allowNavigation(url)) {
      e.preventDefault();
      console.warn(`[scdmg] blocked navigation: ${url}`);
    }
  });
  wc.on("will-redirect", (e, url) => {
    if (!allowNavigation(url)) e.preventDefault();
  });
  wc.on("will-attach-webview", (e) => e.preventDefault());
  wc.setWindowOpenHandler(windowOpenHandler);
  if (!IS_DEV) wc.on("devtools-opened", () => wc.closeDevTools());

  win.loadURL(`${ORIGIN}/index.html`);
  return win;
}

// --- Save-data backup / restore (File menu) -------------------------------------------
// Done from the main process via executeJavaScript, so the game's UI code is untouched.
async function backupSaveData(win) {
  const json = await win.webContents.executeJavaScript(
    "(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return JSON.stringify(o); })()",
  );
  const stamp = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Back up save data",
    defaultPath: path.join(app.getPath("documents"), `scdmg-backup-${stamp}.json`),
    filters: [{ name: "SCDMG backup", extensions: ["json"] }],
  });
  if (canceled || !filePath) return;
  const payload = { format: "scdmg-backup", version: 1, created: new Date().toISOString(), localStorage: JSON.parse(json) };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  dialog.showMessageBox(win, { type: "info", message: "Backup saved.", detail: filePath });
}

async function restoreSaveData(win) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Restore save data",
    properties: ["openFile"],
    filters: [{ name: "SCDMG backup", extensions: ["json"] }],
  });
  if (canceled || !filePaths[0]) return;
  let data;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePaths[0], "utf8"));
    if (parsed.format !== "scdmg-backup" || typeof parsed.localStorage !== "object" || !parsed.localStorage) throw new Error("not an SCDMG backup");
    data = Object.fromEntries(Object.entries(parsed.localStorage).filter(([k, v]) => typeof k === "string" && typeof v === "string"));
  } catch (err) {
    dialog.showMessageBox(win, { type: "error", message: "That file is not a valid SCDMG backup.", detail: String(err.message || err) });
    return;
  }
  const choice = dialog.showMessageBoxSync(win, {
    type: "warning",
    buttons: ["Replace my save data", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    message: "Replace all current save data with this backup?",
    detail: `${Object.keys(data).length} entries. Current lists, maps, factions and settings will be overwritten.`,
  });
  if (choice !== 0) return;
  // JSON.stringify makes the data a safe JS literal.
  await win.webContents.executeJavaScript(
    `(() => { const d = ${JSON.stringify(data)}; localStorage.clear(); for (const k of Object.keys(d)) localStorage.setItem(k, d[k]); })()`,
  );
  win.webContents.reload();
}

function buildMenu() {
  const template = [
    {
      label: "&File",
      submenu: [
        { label: "Back up save data…", click: (_i, w) => w && backupSaveData(w) },
        { label: "Restore save data…", click: (_i, w) => w && restoreSaveData(w) },
        { label: "Open save data folder", click: () => shell.openPath(app.getPath("userData")) },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "&View",
      submenu: [
        { role: "togglefullscreen", accelerator: "F11" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        ...(IS_DEV ? [{ type: "separator" }, { role: "reload" }, { role: "toggleDevTools" }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on("web-contents-created", (_e, contents) => {
  contents.on("will-attach-webview", (e) => e.preventDefault());
});

app.whenReady().then(() => {
  hardenSession(session.defaultSession);
  buildMenu();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
