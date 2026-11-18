// Dev-only miniature gallery (http://localhost:5173/gallery.html): every built-in unit, large and at
// board size, in both player colours, facing both ways, with its idle and step frames. Used to review
// the faction art. Query: ?faction=militia|swarm|concord|all|templates|<template key>, &ground=<hex>,
// &px=<large size>. "templates" shows the faction forge's trope templates (built from miniature parts).

import { FACTIONS } from "./engine/data/factions";
import { TEMPLATES } from "./forge/templates";
import type { Faction, UnitProfile } from "./engine/types";
import { figureDataUrl, figureSpec, paintSheet } from "./ui/art/figures";
import { PLAYER_COLORS } from "./ui/art/palette";

const q = new URLSearchParams(location.search);
const which = q.get("faction") ?? "all";
const ground = `#${(q.get("ground") ?? "7a6a4e").replace(/[^0-9a-f]/gi, "").slice(0, 6)}`;
const px = Math.min(400, Math.max(64, Number(q.get("px")) || 180));
/** Board scale: the game draws about this many CSS pixels per inch at default zoom. */
const BOARD_PPI = 26;

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

function unitRow(p: UnitProfile, f: Faction): HTMLElement {
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
