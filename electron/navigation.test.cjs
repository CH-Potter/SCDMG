// Unit check for electron/navigation.cjs. Runs in plain Node (no Electron, no window,
// nothing is opened):  node electron/navigation.test.cjs   (also: npm run test:desktop)
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { allowNavigation, windowOpenHandler } = require("./navigation.cjs");

const warn = console.warn;
console.warn = () => {};
try {
  for (const ok of ["app://scdmg/index.html", "app://scdmg/", "app://scdmg/assets/x.js#y"]) {
    assert.equal(allowNavigation(ok), true, ok);
  }
  for (const bad of [
    "https://example.com/",
    "http://localhost:5173/",
    "file:///C:/Windows/win.ini",
    "app://other/index.html",
    "javascript:alert(1)",
    "mailto:a@b.c",
    "ms-settings:",
    "not a url",
    "",
  ]) {
    assert.equal(allowNavigation(bad), false, bad);
    assert.deepEqual(windowOpenHandler({ url: bad }), { action: "deny" }, bad);
  }
  assert.deepEqual(windowOpenHandler({ url: "app://scdmg/index.html" }), { action: "deny" });

  // The main process must never hand URLs to the OS browser.
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8").replace(/\/\/.*$/gm, "");
  assert.ok(!/openExternal\s*\(/.test(main), "main.cjs must not call shell.openExternal");
} finally {
  console.warn = warn;
}
console.log("navigation policy: all checks passed");
