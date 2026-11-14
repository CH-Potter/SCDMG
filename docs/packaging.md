# Desktop packaging (Windows portable .exe)

SCDMG ships as a **single portable Windows executable**: copy it to any Windows 10/11 x64 PC and double-click. There is no installer, no Node.js, and the app makes **no network requests** at runtime.

## Approach

- **Electron + electron-builder, `portable` target.** The exe is a self-extracting launcher that unpacks the app to a temp folder and runs it. Electron was chosen because it needs no extra toolchain (Tauri would need Rust, which is not installed), Pixi's WebGL/WebGPU rendering is identical to Chrome's, and electron-builder's `portable` target produces exactly one file. The cost is size (~100 MB).
- The game is the normal Vite production build, made with `vite build --mode desktop` into `dist-desktop/`. That mode only adds `base: "./"` and two build-time plugins (see below). `npm run dev`, `npm run build`, `npm test` and `npm run sim` are unchanged.
- Electron's main process (`electron/main.cjs`, plain CommonJS, outside the app's tsconfig) serves `dist-desktop/` from a private `app://scdmg/` scheme, never from `file://` or the web.

## Commands

| Command | What it does |
| --- | --- |
| `npm run package` | Typecheck, desktop build, then build the portable exe into `release/` |
| `npm run desktop` | Typecheck, desktop build, then run it in Electron locally (devtools enabled) |
| `npm run build:desktop` | Only the desktop Vite build (`dist-desktop/`) |
| `npm run icons` | Regenerate the placeholder icon in `build/` |
| `npm run test:desktop` | Plain-Node check of the navigation/new-window policy (opens nothing) |

Output: **`release/SCDMG-<version>-portable.exe`** (about 100 MB). `release/`, `dist-desktop/` and `.cache/` are gitignored. `<version>` comes from `package.json`.

The first `npm run package` needs internet access: electron-builder downloads its Windows build helpers (once, into its cache), and the Google Fonts used by `index.html` are downloaded once into `.cache/fonts/`. Later builds work offline.

`npm run package` runs `tsc --noEmit` first, the same as `npm run build`, so it refuses to package code that does not typecheck.

## First run on another PC (SmartScreen)

The exe is **not code-signed**, so Windows SmartScreen will show "Windows protected your PC" the first time it runs. Click **More info**, then **Run anyway**. If the file came from email or a browser download, you can also right-click it, choose **Properties**, tick **Unblock** and click **OK**.

Each launch unpacks the app (about 310 MB) to a temp folder first, so start-up is slow: about 15 to 25 seconds on the build machine, and longer on a busy PC or while antivirus scans the unpacked files. That is the cost of the single-file portable target. The temp folder is removed when the app exits.

## Where save data lives

Saved army lists, custom maps, custom factions and settings are kept in the page's `localStorage`. The desktop app stores them in:

```
%APPDATA%\SCDMG\
```

For example, `C:\Users\<you>\AppData\Roaming\SCDMG\`. Inside, `Local Storage\leveldb\` is the actual store. The location does not depend on where the exe is or what it is called, so saves survive moving, renaming or updating the exe. The page origin `app://scdmg` and the folder name must never change, or existing saves will not be found.

- **USB stick mode (optional):** create a folder named `SCDMG-data` next to the exe. If it exists, the app keeps its data there instead of in `%APPDATA%`.
- **Backup and restore:** press **Alt** to show the menu, then use **File > Back up save data…** to write a JSON file, **File > Restore save data…** to load one (this replaces the current data after a confirmation), or **File > Open save data folder**. This is done from the Electron side and does not touch the game's UI code.
- The in-game JSON export and import buttons (lists, maps, factions) work as usual and open the normal Windows save and open dialogs.
- Browser play (`npm run dev`) and the desktop app have **separate** storage.

## Updating

There is no auto-update. To update, build a new exe with `npm run package` (bump `version` in `package.json` first so the file name changes), copy it over the old one and run it. Save data in `%APPDATA%\SCDMG` is kept. Back up first if you are cautious.

## Window and keys

- Title "Super Cool Desktop Miniatures Game", 1440×900 by default (min 1024×640).
- **F11** toggles fullscreen. **Ctrl +/-/0** zoom. **Alt** shows the menu bar.
- Only one copy runs at a time; launching it again focuses the existing window.

## Security hardening

Set in `electron/main.cjs` and the `build.electronFuses` section of `package.json`:

- `contextIsolation: true`, `nodeIntegration: false` (also in workers and subframes), `sandbox: true`, `webSecurity: true`, `webviewTag: false`, and **no preload script**: the page has no access to Node or IPC. The `remote` module no longer exists in Electron, so nothing is needed to disable it.
- A strict **Content-Security-Policy** header on every response: `default-src 'none'`, scripts only from the app itself (`script-src 'self'`, no inline scripts, **no `unsafe-eval`**), `connect/img/worker` limited to `'self'`, `data:` and `blob:`, and `object-src`, `frame-src` and `base-uri` set to none. `style-src` allows `'unsafe-inline'` because the UI uses inline style attributes.
- **Navigation lock:** `will-navigate` and `will-redirect` block anything outside `app://scdmg`. Every new-window request (`window.open`, `target=_blank`) is denied. **Nothing is ever handed to the system browser**: there is no `shell.openExternal` anywhere, since the game has no external links. Webviews are refused. The policy is in `electron/navigation.cjs` and is checked without launching anything by `npm run test:desktop`.
- **Network kill-switch:** every `http(s)://` and `ws(s)://` request from the session is cancelled. Spell-check is off, because it would download dictionaries.
- **Permissions:** all are denied except clipboard write and fullscreen.
- **DevTools are disabled** in the packaged exe; they work under `npm run desktop`.
- **Electron fuses:** `RunAsNode` off, `NODE_OPTIONS` and `--inspect` off, app only loads from an integrity-checked `app.asar`, and no extra `file://` privileges.

## Offline fonts and the no-eval Pixi build (`scripts/vite-plugin-desktop.mjs`)

Both plugins run only in `--mode desktop`:

1. **Offline fonts.** Any Google Fonts stylesheet referenced by `index.html` (`<link href="https://fonts.googleapis.com/css2?...">`) or by `@import` in bundled CSS is downloaded at build time (cached in `.cache/fonts/`). The font files are written to `dist-desktop/fonts/` and the references are rewritten to the local copies. Preconnect hints are dropped. The build **fails** if any Google Fonts URL remains in the HTML or CSS output. Whatever fonts `index.html` uses at build time are picked up automatically, so editing `index.html` needs no change here. Google Fonts are licensed under the SIL Open Font License, which allows bundling.
2. **Pixi without eval.** PixiJS v8 normally generates shader-upload code with `new Function`, which the CSP forbids. Pixi refuses to start in that case unless `pixi.js/unsafe-eval` is imported. Despite the name, that module installs Pixi's eval-free code path. The plugin prepends that import to `src/main.ts` during the desktop build only. If `src/main.ts` imports it itself one day, the plugin does nothing.

## App icon

The placeholder icon is generated by `scripts/make-icon.mjs` into:

- `build/icon.ico`: the exe icon (16 to 256 px)
- `build/icon.png`: 512 px, used for the window and taskbar icon

**To use the real logo:** replace both files (ICO with at least a 256 px image, PNG at 512 px or larger), then run `npm run package`. The package step only generates the placeholder when `build/icon.ico` or `build/icon.png` is missing, so your files will not be overwritten. `npm run icons` always overwrites them with the placeholder. As an alternative to making an ICO, point `build.win.icon` in `package.json` at a PNG of 256 px or larger and electron-builder converts it.

## Files

| Path | Purpose |
| --- | --- |
| `electron/main.cjs` | Main process: window, `app://` protocol, CSP, hardening, menu, backup/restore |
| `electron/navigation.cjs` | Navigation and new-window policy (deny everything outside `app://scdmg`), plus `navigation.test.cjs` |
| `scripts/vite-plugin-desktop.mjs` | Desktop-only Vite plugins (offline fonts, Pixi no-eval) |
| `scripts/make-icon.mjs` | Placeholder icon generator (PNG + ICO, no dependencies) |
| `build/icon.ico`, `build/icon.png` | App icon |
| `package.json` → `build` | electron-builder config (portable x64, fuses, files) |
| `vite.config.ts` | `--mode desktop` branch: `base: "./"`, plugins, `outDir: dist-desktop` |

## Known gaps

- **Unsigned**, so SmartScreen warns on first run. Signing needs a code-signing certificate (set `CSC_LINK` and `CSC_KEY_PASSWORD` for electron-builder).
- **No auto-update.** Replace the exe by hand.
- **Windows x64 only.** No macOS or Linux builds are configured, and an arm64 build could be added with `--arm64`.
- **Slow start-up:** the portable launcher unpacks about 310 MB to `%TEMP%` on every start, which took 14 to 25 s here and up to about 70 s under heavy load. If that becomes a problem, ship the `release/win-unpacked/` folder as a zip (it starts instantly), or switch to an NSIS installer target.
- **Size:** about 100 MB, almost all of it the Electron/Chromium runtime. The game itself is about 1 MB.
