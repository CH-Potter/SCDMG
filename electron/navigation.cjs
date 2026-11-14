// Navigation / new-window policy for the SCDMG desktop app. Pure functions with no
// Electron dependency, so they can be checked with plain Node:
//   node electron/navigation.test.cjs
//
// Policy: the page may only navigate within app://scdmg. Every new-window request
// (window.open, target=_blank, middle-click, ...) is denied. Nothing is ever passed to
// shell.openExternal, so the app can never launch the system browser by itself.
"use strict";

const APP_PROTOCOL = "app:";
const APP_HOST = "scdmg";

/** True only for URLs inside the packaged app's own origin. */
function allowNavigation(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === APP_PROTOCOL && u.host === APP_HOST;
  } catch {
    return false;
  }
}

/** webContents.setWindowOpenHandler callback: always deny, never open externally. */
function windowOpenHandler({ url }) {
  console.warn(`[scdmg] blocked new window: ${url}`);
  return { action: "deny" };
}

module.exports = { allowNavigation, windowOpenHandler };
