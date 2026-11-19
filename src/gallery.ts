// Dev-only miniature gallery (http://localhost:5173/gallery.html): every built-in unit, large and at
// board size, in both player colours, facing both ways, with its idle and step frames. Used to review
// the faction art. Query: ?faction=militia|swarm|concord|all|templates|<template key>, &ground=<hex>,
// &px=<large size>, &style=ink|overhead|classic. "templates" shows the faction forge's trope templates
// (built from miniature parts). Ink Rig (the default) and Overhead show the new miniatures the way the
// DOM pictures (intros, lore) draw them; Classic, and units without new art, use the Classic painters.

import { FACTIONS } from "./engine/data/factions";
import { TEMPLATES } from "./forge/templates";
import type { Faction, UnitProfile } from "./engine/types";
import { figureDataUrl, figureSpec, paintSheet } from "./ui/art/figures";
import { PLAYER_COLORS } from "./ui/art/palette";
import { rigPortraitUrl } from "./ui/art/rigPortrait";
import { loadAllArt } from "./ui/minis/registry";

const q = new URLSearchParams(location.search);
const which = q.get("faction") ?? "all";
const ground = `#${(q.get("ground") ?? "7a6a4e").replace(/[^0-9a-f]/gi, "").slice(0, 6)}`;
const px = Math.min(400, Math.max(64, Number(q.get("px")) || 180));
/** Board scale: the game draws about this many CSS pixels per inch at default zoom. */
const BOARD_PPI = 26;
const style = (["ink", "overhead", "classic"] as const).find((s) => s === q.get("style")) ?? "ink";

const bar = document.getElementById("bar")!;
const out = document.getElementById("out")!;
document.body.style.setProperty("--ground", ground);

for (const id of ["all", ...Object.keys(FACTIONS), "templates"]) {
  const a = document.createElement("a");
  const u = new URLSearchParams(q);
  u.set("faction", id);
  a.href = `?${u}`;
  a.textContent = id === "all" ? "All" : id === "templates" ? "Forge templates" : FACTIONS[id as keyof typeof FACTIONS]!.name;
  if (id === which) a.setAttribute("aria-current", "true");
  bar.append(a);
}
for (const st of ["ink", "overhead", "classic"] as const) {
  const a = document.createElement("a");
  const u = new URLSearchParams(q);
  u.set("style", st);
  a.href = `?${u}`;
  a.textContent = st === "ink" ? "Ink Rig" : st === "overhead" ? "Overhead" : "Classic";
  if (st === style) a.setAttribute("aria-current", "true");
  bar.append(a);
}
for (const [label, hex] of [["Dirt", "7a6a4e"], ["Sand", "b89a6a"], ["Grass", "5d7a45"], ["Concrete", "8a8a86"], ["Dark", "2b2620"]]) {
  const b = document.createElement("button");
  b.textContent = label!;
  b.onclick = () => {
    const u = new URLSearchParams(location.search);
    u.set("ground", hex!);
    location.search = `?${u}`;
  };
  bar.append(b);
}

function img(src: string, size: number, mirror = false): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "ground";
  const i = document.createElement("img");
  i.src = src;
  i.width = i.height = size;
  if (mirror) i.className = "mirror";
  wrap.append(i);
  return wrap;
}

/** Idle and step frames side by side, without the white silhouettes, at `ppi` CSS pixels per inch. */
function frames(p: UnitProfile, f: Faction, ppi: number): HTMLElement {
  const spec = figureSpec(p, f.look ?? "plain", f.color);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const sheet = paintSheet(spec, ppi * dpr);
  const c = document.createElement("canvas");
  c.width = sheet.frameW * sheet.frames;
  c.height = sheet.frameH;
  c.style.width = `${c.width / dpr}px`;
  c.style.height = `${c.height / dpr}px`;
  c.getContext("2d")!.drawImage(sheet.canvas, 0, 0, c.width, c.height, 0, 0, c.width, c.height);
  const wrap = document.createElement("div");
  wrap.className = "ground";
  wrap.title = "idle | step";
  wrap.append(c);
  return wrap;
}

/** An image sized by its own framing, at `ppi` CSS pixels per inch of miniature. */
function rigImg(url: string, w: number, h: number, ppi: number): HTMLImageElement {
  const i = document.createElement("img");
  i.src = url;
  i.width = Math.round(w * ppi);
  i.height = Math.round(h * ppi);
  return i;
}

/** A new miniature's row: both teams large, both facings, idle and step, and a squad at board scale. */
function rigRow(p: UnitProfile, view: "side" | "top"): HTMLElement | null {
  const blue = rigPortraitUrl(p, { view, team: PLAYER_COLORS[0], base: true });
  if (!blue) return null;
  const row = document.createElement("div");
  row.className = "row";
  const name = document.createElement("div");
  name.className = "name";
  name.innerHTML = `<b></b><small></small><small></small>`;
  name.children[0]!.textContent = p.name;
  name.children[1]!.textContent = `${p.id} · ${view === "side" ? "Ink Rig" : "Overhead"} · r ${p.baseRadius}"`;
  name.children[2]!.textContent = p.keywords.join(", ");
  row.append(name);
  const ppi = px / 1.6;
  const cell = (...imgs: HTMLElement[]) => {
    const wrap = document.createElement("div");
    wrap.className = "ground";
    wrap.append(...imgs);
    return wrap;
  };
  row.append(cell(rigImg(blue.url, blue.w, blue.h, ppi)));
  const red = rigPortraitUrl(p, { view, team: PLAYER_COLORS[1], base: true, face: "left" })!;
  row.append(cell(rigImg(red.url, red.w, red.h, ppi)));
  const idle = rigPortraitUrl(p, { view, clip: "idle", t: 1200 })!;
  const step = rigPortraitUrl(p, { view, clip: "step", t: 70 })!;
  const half = ppi / 2.2;
  const fr = cell(rigImg(idle.url, idle.w, idle.h, half), rigImg(step.url, step.w, step.h, half));
  fr.title = "idle | step";
  row.append(fr);
  const board = cell();
  board.classList.add("board");
  for (let i = 0; i < Math.min(6, p.models); i++) {
    const m = rigPortraitUrl(p, { view, team: PLAYER_COLORS[0], base: true, model: i, face: i % 2 ? "left" : "right", ppi: BOARD_PPI })!;
    board.append(rigImg(m.url, m.w, m.h, BOARD_PPI));
  }
  row.append(board);
  return row;
}

function unitRow(p: UnitProfile, f: Faction): HTMLElement {
  if (style !== "classic") {
    const r = rigRow(p, style === "overhead" ? "top" : "side");
    if (r) return r;
  }
  const spec = figureSpec(p, f.look ?? "plain", f.color);
  const row = document.createElement("div");
  row.className = "row";
  const name = document.createElement("div");
  name.className = "name";
  name.innerHTML = `<b></b><small></small><small></small>`;
  name.children[0]!.textContent = p.name;
  name.children[1]!.textContent = `${p.id} · ${spec.kind} · r ${p.baseRadius}"`;
  name.children[2]!.textContent = p.keywords.join(", ");
  row.append(name);
  row.append(img(figureDataUrl(spec, PLAYER_COLORS[0], px), px));
  row.append(img(figureDataUrl(spec, PLAYER_COLORS[1], px), px, true));
  row.append(frames(p, f, px / 2.2));
  // board size: a squad of this unit at roughly in-game scale
  const board = document.createElement("div");
  board.className = "ground board";
  const small = Math.round(Math.max(22, (p.baseRadius * 2 + 1.2) * BOARD_PPI));
  const url = figureDataUrl(spec, PLAYER_COLORS[0], small);
  for (let i = 0; i < Math.min(6, p.models); i++) {
    const i2 = document.createElement("img");
    i2.src = url;
    i2.width = i2.height = small;
    if (i % 2) i2.className = "mirror";
    board.append(i2);
  }
  row.append(board);
  return row;
}

// the new miniatures load lazily (one chunk per faction, template and the kits)
await loadAllArt();
const templates = TEMPLATES.filter((t) => which === "templates" || which === t.key).map((t) => t.faction);
for (const f of [...Object.values(FACTIONS), ...templates]) {
  if (which !== "all" && which !== f.id && !templates.includes(f)) continue;
  const sec = document.createElement("section");
  const h = document.createElement("h2");
  h.textContent = `${f.name}`;
  sec.append(h);
  for (const p of f.profiles) sec.append(unitRow(p, f));
  out.append(sec);
}
