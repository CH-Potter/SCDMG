// Rig Lab (dev page: http://localhost:5173/rig-lab.html). Assemble a unit from its parts, pose it,
// play the six clips, flip team colours and colourways, step through the zoom tiers, switch between
// the Ink Rig (A) and Overhead (D) views, run the silhouette test, and measure 100+ models.

import { Application, Container, Graphics, UPDATE_PRIORITY } from "pixi.js";
import { TIERS } from "./ui/minis/atlas";
import { bakedSkins } from "./ui/minis/bake";
import { CLIP_IDS } from "./ui/minis/clips";
import { RigMini } from "./ui/minis/mini";
import type { UnitRigs } from "./ui/minis/registry";
import { trooperSide, trooperTop, type TrooperWeapon } from "./ui/minis/rigs/militiaTrooper";
import { COLOURWAYS } from "./ui/minis/slots";
import type { ClipId, RigView, Status } from "./ui/minis/types";
import { drawOrder } from "./ui/minis/pose";

const TEAMS: [string, number][] = [
  ["Teal (you)", 0x2fb5c8],
  ["Red (AI)", 0xf0565b],
  ["Gold", 0xe2c13a],
  ["Violet", 0x7b5be0],
];
const DIRT = 0xcf9f62;
const BASE_R = 0.55; // mil-grunts

type Scene = "one" | "squad" | "zooms" | "perf";

const q = new URLSearchParams(location.search);
const S = {
  view: (q.get("view") === "top" ? "top" : "side") as RigView,
  weapon: "rifle" as TrooperWeapon,
  team: TEAMS[0]![1],
  cw: "dust",
  ppi: Number(q.get("ppi")) || 90,
  scene: (["one", "squad", "zooms", "perf"].includes(q.get("scene") ?? "") ? q.get("scene") : "one") as Scene,
  walking: false,
  flying: false,
  debug: false,
  silhouette: false,
  autoTurn: false,
  angle: 180,
  hidden: new Set<string>(),
  status: { selected: false, hurt: false, engaged: false, shaken: false, spent: false, hunkered: false },
  perfN: 100,
};

const app = new Application();
const stage = document.getElementById("stage")!;
const panel = document.getElementById("panel")!;
const readout = document.getElementById("readout")!;

interface Placed {
  mini: RigMini;
  /** Container (and its pixels per inch) the mini lives in. */
  ppi: number;
  x: number;
  y: number;
  walk?: { x0: number; x1: number; dir: number; speed: number };
  /** Perf scene: random pulses. */
  next?: number;
  flying?: boolean;
}

let placed: Placed[] = [];
const world = new Container();
const ground = new Graphics();
let perf: { frames: number[]; work: number[]; t0: number; done: boolean; result: string } | null = null;

function rigs(): UnitRigs {
  return { side: trooperSide(S.weapon), top: trooperTop(S.weapon), colourway: COLOURWAYS[S.cw]! };
}

function status(i = 0): Partial<Status> & { hunkered: boolean } {
  const st = S.status;
  return {
    selected: st.selected,
    hp: st.hurt ? 1 : 2,
    hpMax: 2,
    engaged: st.engaged,
    shaken: st.shaken,
    flying: S.flying,
    spent: st.spent && i % 2 === 0,
    hunkered: st.hunkered,
  };
}

function clear(): void {
  for (const p of placed) p.mini.destroy();
  placed = [];
  world.removeChildren().forEach((c) => c !== ground && c.destroy({ children: true }));
  world.addChild(ground);
}

/** A table area with its own scale (pixels per inch), so several zooms can sit side by side. */
function area(ppi: number, x: number, y: number, w: number, h: number): Container {
  const c = new Container();
  c.position.set(x, y);
  c.scale.set(ppi);
  const g = new Graphics();
  g.rect(0, 0, w / ppi, h / ppi).fill(DIRT);
  for (let i = 1; i < w / ppi; i++) g.moveTo(i, 0).lineTo(i, h / ppi);
  for (let j = 1; j < h / ppi; j++) g.moveTo(0, j).lineTo(w / ppi, j);
  g.stroke({ width: 1 / ppi, color: 0x9a6c3b, alpha: 0.35 });
  g.zIndex = -1e6;
  c.addChild(g);
  world.addChild(c);
  return c;
}

function add(host: Container, ppi: number, x: number, y: number, view: RigView, team: number, i = 0): Placed {
  const mini = new RigMini(rigs(), view, team, BASE_R);
  host.addChild(mini.footprint);
  const fig = new Container();
  fig.position.set(x, y);
  fig.zIndex = y;
  fig.addChild(mini.figure);
  host.addChild(fig);
  host.sortableChildren = true;
  mini.footprint.zIndex = -1000;
  mini.setStatus(status(i));
  mini.setDebug(S.debug);
  mini.setSilhouette(S.silhouette);
  for (const id of S.hidden) mini.setPartVisible(id, false);
  const p: Placed = { mini, ppi, x, y };
  placed.push(p);
  return p;
}

function build(): void {
  clear();
  const W = app.screen.width;
  const H = app.screen.height;
  if (S.scene === "one") {
    const host = area(S.ppi, 0, 0, W, H);
    const p = add(host, S.ppi, W / S.ppi / 2, (H / S.ppi) * 0.62, S.view, S.team);
    p.walk = { x0: W / S.ppi / 2 - 2.5, x1: W / S.ppi / 2 + 2.5, dir: -1, speed: 2.6 };
  } else if (S.scene === "squad") {
    const host = area(S.ppi, 0, 0, W, H);
    const cx = W / S.ppi / 2;
    const cy = (H / S.ppi) * 0.55;
    const spots = [
      [-1.3, -0.9],
      [0.4, -1.2],
      [-0.2, 0.2],
      [-1.6, 0.9],
      [0.9, 0.7],
    ];
    spots.forEach(([dx, dy], i) => {
      const p = add(host, S.ppi, cx - 2 + dx!, cy + dy!, S.view, S.team, i);
      p.mini.aimAt(1, 0);
    });
    const foes = [
      [3.2, -0.6],
      [3.8, 0.8],
    ];
    foes.forEach(([dx, dy], i) => {
      const p = add(host, S.ppi, cx + dx!, cy + dy!, S.view, TEAMS[1]![1], i);
      p.mini.aimAt(-1, 0);
    });
  } else if (S.scene === "zooms") {
    // the trooper at three zooms (one per tier), side view above, overhead below
    const ppis = [Math.round(TIERS.tiny.refS * 68), 26, Math.round(TIERS.sheet.refS * 68 * 1.3)];
    const colW = W / 3;
    ppis.forEach((ppi, i) => {
      const host = area(ppi, colW * i + 4, 4, colW - 8, H - 8);
      const w = (colW - 8) / ppi;
      const h = (H - 8) / ppi;
      for (const [view, fy] of [["side", 0.42], ["top", 0.8]] as const) {
        const a = add(host, ppi, w * 0.3, h * fy, view, TEAMS[0]![1]);
        a.mini.aimAt(view === "side" ? 1 : 1, view === "side" ? 0 : -0.4);
        const b = add(host, ppi, w * 0.72, h * fy, view, TEAMS[1]![1]);
        b.mini.aimAt(-1, view === "side" ? 0 : 0.3);
      }
    });
  } else {
    const ppi = 26;
    const host = area(ppi, 0, 0, W, H);
    const cols = Math.ceil(Math.sqrt(S.perfN * (W / H)));
    const gx = W / ppi / (cols + 1);
    const rows = Math.ceil(S.perfN / cols);
    const gy = H / ppi / (rows + 1);
    for (let i = 0; i < S.perfN; i++) {
      const x = gx * (1 + (i % cols));
      const y = gy * (1 + Math.floor(i / cols));
      const p = add(host, ppi, x, y, S.view, i % 2 ? TEAMS[1]![1] : TEAMS[0]![1], i);
      p.mini.aimAt(i % 2 ? -1 : 1, (i % 5) - 2);
      p.next = Math.random() * 1500;
      if (i % 3 === 0) p.walk = { x0: x - 0.6, x1: x + 0.6, dir: 1, speed: 1.5 };
    }
    perf = { frames: [], work: [], t0: performance.now(), done: false, result: "measuring…" };
  }
}

function tick(dt: number): void {
  const t0 = performance.now();
  for (const p of placed) {
    let walking = false;
    let face: 1 | -1 | undefined;
    if (p.walk && (S.walking || S.scene === "perf")) {
      walking = true;
      p.x += (p.walk.dir * p.walk.speed * dt) / 1000;
      if (p.x < p.walk.x0) p.walk.dir = 1;
      if (p.x > p.walk.x1) p.walk.dir = -1;
      p.mini.heading(p.walk.dir, 0);
      face = p.walk.dir > 0 ? 1 : -1;
      (p.mini.figure.parent as Container).position.set(p.x, p.y);
    }
    if (S.scene === "one" && !walking) {
      if (S.autoTurn) S.angle = (S.angle + dt * 0.045) % 360;
      const a = (S.angle * Math.PI) / 180;
      p.mini.aimAt(Math.cos(a), Math.sin(a));
      face = Math.cos(a) >= 0 ? 1 : -1;
    }
    if (S.scene === "perf" && p.next !== undefined) {
      p.next -= dt;
      if (p.next < 0) {
        p.next = 900 + Math.random() * 2400;
        const r = Math.random();
        p.mini.play(r < 0.6 ? "recoil" : "flinch");
      }
    }
    const lift = S.flying ? 1.1 : 0;
    p.mini.update(dt, { ppi: p.ppi, walking, lift, face, x: p.x, y: p.y, visible: true, alpha: 1 });
  }
  const work = performance.now() - t0;
  if (perf && !perf.done) {
    const since = performance.now() - perf.t0;
    if (since > 1000) {
      perf.frames.push(dt);
      perf.work.push(work);
    }
    if (since > 6000) {
      perf.done = true;
      const n = perf.frames.length;
      const avg = perf.frames.reduce((a, b) => a + b, 0) / n;
      const sorted = perf.frames.slice().sort((a, b) => a - b);
      const p95 = sorted[Math.floor(n * 0.95)]!;
      const w = perf.work.reduce((a, b) => a + b, 0) / n;
      const sprites = placed.length * drawOrder(placed[0]!.mini.rig).length * 2;
      perf.result = `${placed.length} models, ${sprites} sprites: ${(1000 / avg).toFixed(1)} fps avg, frame ${avg.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms; rig update ${w.toFixed(2)} ms/frame`;
      console.info(`[rig-lab perf] ${perf.result}`);
      (window as unknown as { rigLabPerf: string }).rigLabPerf = perf.result;
    }
  }
}

function readoutText(): string {
  const m = placed[0]?.mini;
  const sk = m?.skinInfo;
  const pages = bakedSkins();
  const mb = pages.reduce((s, p) => s + (p.plan.w * 2 * p.plan.h * 4 * 4) / 3 / 1e6, 0);
  const lines = [
    `view ${S.view === "side" ? "A · Ink Rig" : "D · Overhead"}   scene ${S.scene}   ${S.scene === "one" || S.scene === "squad" ? `${S.ppi} px/in` : ""}`,
    sk ? `tier ${sk.tier}: page ${sk.plan.w * 2}×${sk.plan.h}px, ${sk.plan.entries.length} drawables, k ${sk.plan.k.toFixed(2)} px/u, ink ${sk.plan.sil.toFixed(1)} px, baked in ${sk.ms.toFixed(0)} ms` : "baking…",
    `pages baked ${pages.length}, ~${mb.toFixed(1)} MB GPU (with mipmaps)`,
  ];
  if (perf) lines.push(`perf: ${perf.result}`);
  return lines.join("\n");
}

// ---------- panel ----------

function btn(label: string, on: () => void, pressed?: () => boolean): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = () => {
    on();
    render();
  };
  if (pressed) b.setAttribute("aria-pressed", String(pressed()));
  return b;
}

function section(title: string, ...kids: (HTMLElement | string)[]): void {
  const h = document.createElement("h2");
  h.textContent = title;
  const row = document.createElement("div");
  row.className = "row";
  row.append(...kids);
  panel.append(h, row);
}

function check(label: string, get: () => boolean, set: (v: boolean) => void): HTMLLabelElement {
  const l = document.createElement("label");
  const c = document.createElement("input");
  c.type = "checkbox";
  c.checked = get();
  c.onchange = () => {
    set(c.checked);
    render(false);
  };
  l.append(c, label);
  return l;
}

function render(rebuild = true): void {
  panel.innerHTML = `<h1>Rig Lab</h1><small>Dustline line trooper (mil-grunts). Dev page: not part of the game build.</small>`;
  section(
    "View",
    btn("A · Ink Rig", () => (S.view = "side"), () => S.view === "side"),
    btn("D · Overhead", () => (S.view = "top"), () => S.view === "top"),
  );
  section(
    "Scene",
    ...(["one", "squad", "zooms", "perf"] as Scene[]).map((sc) =>
      btn({ one: "One model", squad: "Squad of 5", zooms: "Three zooms", perf: `Perf ×${S.perfN}` }[sc], () => (S.scene = sc), () => S.scene === sc),
    ),
    btn("100", () => ((S.perfN = 100), (S.scene = "perf")), () => S.perfN === 100),
    btn("200", () => ((S.perfN = 200), (S.scene = "perf")), () => S.perfN === 200),
    btn("400", () => ((S.perfN = 400), (S.scene = "perf")), () => S.perfN === 400),
  );
  const zoom = document.createElement("input");
  zoom.type = "range";
  zoom.min = "8";
  zoom.max = "140";
  zoom.value = String(S.ppi);
  zoom.oninput = () => {
    S.ppi = Number(zoom.value);
    build();
  };
  section(
    "Zoom (px per inch)",
    btn("Tiny 12", () => (S.ppi = 12), () => S.ppi === 12),
    btn("Table 26", () => (S.ppi = 26), () => S.ppi === 26),
    btn("Close 60", () => (S.ppi = 60), () => S.ppi === 60),
    btn("Sheet 120", () => (S.ppi = 120), () => S.ppi === 120),
    zoom,
  );
  section(
    "Clips",
    btn("Idle", () => (S.walking = false), () => !S.walking),
    btn("Step (walk)", () => (S.walking = !S.walking), () => S.walking),
    ...(["recoil", "flinch", "death"] as ClipId[]).map((id) => btn(id[0]!.toUpperCase() + id.slice(1), () => playAll(id))),
    btn("Flyer bob", () => (S.flying = !S.flying), () => S.flying),
  );
  section(
    "Status",
    ...(["selected", "hurt", "engaged", "shaken", "spent", "hunkered"] as const).map((k) => check(k, () => S.status[k], (v) => (S.status[k] = v))),
    check("flying", () => S.flying, (v) => (S.flying = v)),
  );
  const angle = document.createElement("input");
  angle.type = "range";
  angle.min = "0";
  angle.max = "359";
  angle.value = String(Math.round(S.angle));
  angle.oninput = () => (S.angle = Number(angle.value));
  section("Facing (degrees)", angle, check("auto-turn", () => S.autoTurn, (v) => (S.autoTurn = v)));
  section("Team colour", ...TEAMS.map(([n, c]) => btn(n, () => (S.team = c), () => S.team === c)));
  section("Colourway", ...Object.values(COLOURWAYS).map((cw) => btn(cw.name, () => (S.cw = cw.id), () => S.cw === cw.id)));
  section(
    "Weapon (the arms re-solve to its grips)",
    btn("Long rifle", () => (S.weapon = "rifle"), () => S.weapon === "rifle"),
    btn("Scatter-gun", () => (S.weapon = "scatter"), () => S.weapon === "scatter"),
  );
  const rig = S.view === "side" ? trooperSide(S.weapon) : trooperTop(S.weapon);
  section(
    "Parts and limbs",
    ...drawOrder(rig).map((d) =>
      check(d.id, () => !S.hidden.has(d.id), (v) => {
        if (v) S.hidden.delete(d.id);
        else S.hidden.add(d.id);
      }),
    ),
  );
  section(
    "Tests",
    check("bones, grips, muzzle", () => S.debug, (v) => (S.debug = v)),
    check("silhouette test", () => S.silhouette, (v) => (S.silhouette = v)),
  );
  if (rebuild) build();
  else for (const [i, p] of placed.entries()) {
    p.mini.setStatus(status(i));
    p.mini.setDebug(S.debug);
    p.mini.setSilhouette(S.silhouette);
    for (const d of drawOrder(p.mini.rig)) p.mini.setPartVisible(d.id, !S.hidden.has(d.id));
  }
}

function playAll(id: ClipId): void {
  for (const [i, p] of placed.entries()) p.mini.play(id, i * 60);
  if (id === "death") setTimeout(() => build(), 1800);
}

async function main(): Promise<void> {
  await app.init({ background: "#1f1712", resizeTo: stage, antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) });
  stage.prepend(app.canvas);
  app.stage.addChild(world);
  app.ticker.add((t) => tick(t.deltaMS));
  let last = 0;
  app.ticker.add(() => {
    const now = performance.now();
    if (now - last > 250) {
      last = now;
      readout.textContent = readoutText();
    }
  }, null, UPDATE_PRIORITY.UTILITY);
  let w = 0;
  let h = 0;
  app.renderer.on("resize", () => {
    if (Math.abs(app.screen.width - w) > 2 || Math.abs(app.screen.height - h) > 2) {
      w = app.screen.width;
      h = app.screen.height;
      build();
    }
  });
  w = app.screen.width;
  h = app.screen.height;
  render();
  (window as unknown as { rigLab: unknown }).rigLab = { S, render, build, placed: () => placed, clips: CLIP_IDS };
}

void main();
