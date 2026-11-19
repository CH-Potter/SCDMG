// Rig Lab (dev page: http://localhost:5173/rig-lab.html). Browse every converted unit faction by
// faction, pose it, play the six clips, flip team colours and colourways, step through the zoom
// tiers, switch between the Ink Rig (A) and Overhead (D) views, line a whole faction up, run the
// silhouette test (every unit nameable as a 32 px black shape), and measure 100+ models.
// URL: ?faction=swarm&unit=swarm-mother&view=top&scene=lineup&ppi=26

import { Application, Container, Graphics, UPDATE_PRIORITY } from "pixi.js";
import { FACTIONS } from "./engine/data/factions";
import type { UnitProfile } from "./engine/types";
import { TIERS } from "./ui/minis/atlas";
import { bakedSkins, bakeStats, clearDiskCache } from "./ui/minis/bake";
import { CLIP_IDS } from "./ui/minis/clips";
import { RigMini } from "./ui/minis/mini";
import { drawOrder } from "./ui/minis/pose";
import { artFor, rigsFor, type UnitRigs } from "./ui/minis/registry";
import { COLOURWAYS, FACTION_COLOURWAYS } from "./ui/minis/slots";
import type { ClipId, RigView, Status } from "./ui/minis/types";

const TEAMS: [string, number][] = [
  ["Teal (you)", 0x2fb5c8],
  ["Red (AI)", 0xf0565b],
  ["Gold", 0xe2c13a],
  ["Violet", 0x7b5be0],
];
const DIRT = 0xcf9f62;
const BASE_FACTIONS = ["militia", "swarm", "concord"] as const;
type FactionKey = (typeof BASE_FACTIONS)[number];

type Scene = "one" | "squad" | "zooms" | "lineup" | "sil32" | "perf";
const SCENES: Scene[] = ["one", "squad", "zooms", "lineup", "sil32", "perf"];
const SCENE_LABEL: Record<Scene, string> = { one: "One model", squad: "Squad", zooms: "Three zooms", lineup: "Faction lineup", sil32: "32 px silhouettes", perf: "Perf" };

/** A unit's buyable and summon-only profiles, in faction order. */
const profilesOf = (f: FactionKey): UnitProfile[] => FACTIONS[f]?.profiles ?? [];
const flies = (p: UnitProfile) => p.keywords.includes("flying");
/** The board renderer's flyer altitude (inches), so the lab shows flyers at their table height. */
const flyLift = (r: number): number => 0.8 + r * 0.6;

const q = new URLSearchParams(location.search);
const qFaction = (BASE_FACTIONS as readonly string[]).includes(q.get("faction") ?? "") ? (q.get("faction") as FactionKey) : null;
const qUnit = q.get("unit");
const startFaction: FactionKey = qFaction ?? (BASE_FACTIONS.find((f) => profilesOf(f).some((p) => p.id === qUnit)) as FactionKey | undefined) ?? "militia";

const S = {
  faction: startFaction,
  unit: qUnit && profilesOf(startFaction).some((p) => p.id === qUnit) ? qUnit : "mil-grunts",
  look: Number(q.get("look")) || 0,
  view: (q.get("view") === "top" ? "top" : "side") as RigView,
  team: TEAMS[0]![1],
  cw: "",
  ppi: Number(q.get("ppi")) || 90,
  scene: (SCENES.includes(q.get("scene") as Scene) ? q.get("scene") : "one") as Scene,
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
  /** Pixels per inch of the area it lives in. */
  ppi: number;
  x: number;
  y: number;
  lift: number;
  flying: boolean;
  walk?: { x0: number; x1: number; dir: number; speed: number };
  /** Perf scene: random pulses. */
  next?: number;
}

let placed: Placed[] = [];
const world = new Container();
let perf: { frames: number[]; work: number[]; t0: number; done: boolean; result: string } | null = null;

const profile = (id = S.unit): UnitProfile | undefined => profilesOf(S.faction).find((p) => p.id === id) ?? BASE_FACTIONS.flatMap(profilesOf).find((p) => p.id === id);

function colourwayFor(rigs: UnitRigs): UnitRigs {
  if (!S.cw || !COLOURWAYS[S.cw]) return rigs;
  // only offer the faction's own colourways: the art is drawn for them
  return FACTION_COLOURWAYS[S.faction]?.includes(S.cw) ? { ...rigs, colourway: COLOURWAYS[S.cw]! } : rigs;
}

function rigsOf(id: string, model: number): UnitRigs | null {
  const r = rigsFor(id, model);
  return r ? colourwayFor(r) : null;
}

function status(p: UnitProfile | undefined, i = 0, flying = false): Partial<Status> & { hunkered: boolean } {
  const st = S.status;
  const hpMax = Math.max(1, p?.hp ?? 2);
  return {
    selected: st.selected,
    hp: st.hurt ? Math.max(0, hpMax - 1) : hpMax,
    hpMax,
    shield: p?.shield ?? 0,
    shieldMax: p?.shield ?? 0,
    engaged: st.engaged,
    shaken: st.shaken,
    flying,
    spent: st.spent && i % 2 === 0,
    hunkered: st.hunkered,
  };
}

function clear(): void {
  for (const p of placed) p.mini.destroy();
  placed = [];
  for (const c of world.removeChildren()) c.destroy({ children: true });
}

/** A table area with its own scale (pixels per inch), so several zooms can sit side by side. */
function area(ppi: number, x: number, y: number, w: number, h: number, colour = DIRT): Container {
  const c = new Container();
  c.position.set(x, y);
  c.scale.set(ppi);
  c.sortableChildren = true;
  const g = new Graphics();
  g.rect(0, 0, w / ppi, h / ppi).fill(colour);
  if (colour === DIRT) {
    for (let i = 1; i < w / ppi; i++) g.moveTo(i, 0).lineTo(i, h / ppi);
    for (let j = 1; j < h / ppi; j++) g.moveTo(0, j).lineTo(w / ppi, j);
    g.stroke({ width: 1 / ppi, color: 0x9a6c3b, alpha: 0.35 });
  }
  g.zIndex = -1e6;
  c.addChild(g);
  world.addChild(c);
  return c;
}

function add(host: Container, ppi: number, x: number, y: number, view: RigView, team: number, id = S.unit, i = 0, look?: number): Placed | null {
  const p = profile(id);
  const rigs = rigsOf(id, look ?? i);
  if (!p || !rigs) return null;
  const mini = new RigMini(rigs, view, team, p.baseRadius);
  host.addChild(mini.footprint);
  const fig = new Container();
  fig.position.set(x, y);
  fig.zIndex = y;
  fig.addChild(mini.figure);
  host.addChild(fig);
  mini.footprint.zIndex = -1000;
  const flying = flies(p) || S.flying;
  mini.setStatus(status(p, i, flying));
  mini.setDebug(S.debug);
  mini.setSilhouette(S.silhouette);
  for (const h of S.hidden) mini.setPartVisible(h, false);
  const pl: Placed = { mini, ppi, x, y, flying, lift: flying ? flyLift(p.baseRadius) : 0 };
  placed.push(pl);
  return pl;
}

/** Converted units of the current faction. */
const rigged = (): UnitProfile[] => profilesOf(S.faction).filter((p) => !!artFor(p.id));

function build(): void {
  clear();
  perf = null;
  const W = app.screen.width;
  const H = app.screen.height;
  const p = profile();
  const look = artFor(S.unit) ? S.look : 0;
  if (S.scene === "one") {
    const host = area(S.ppi, 0, 0, W, H);
    const pl = add(host, S.ppi, W / S.ppi / 2, (H / S.ppi) * 0.66, S.view, S.team, S.unit, 0, look);
    if (pl && (p?.move ?? 0) > 0) pl.walk = { x0: W / S.ppi / 2 - 2.5, x1: W / S.ppi / 2 + 2.5, dir: -1, speed: 2.6 };
  } else if (S.scene === "squad") {
    const host = area(S.ppi, 0, 0, W, H);
    const n = Math.max(1, Math.min(12, p?.models ?? 1));
    const r = (p?.baseRadius ?? 0.5) * 2.4;
    const cx = W / S.ppi / 2 - 1.5;
    const cy = (H / S.ppi) * 0.55;
    const cols = Math.ceil(Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      const x = cx + ((i % cols) - (cols - 1) / 2) * r + (Math.floor(i / cols) % 2) * r * 0.4;
      const y = cy + (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * r;
      add(host, S.ppi, x, y, S.view, S.team, S.unit, i)?.mini.aimAt(1, 0);
    }
    // two foes from the other faction lists, for scale
    const foe = rigged().find((x) => x.id !== S.unit) ?? p;
    if (foe) {
      add(host, S.ppi, cx + 4.5, cy - 0.8, S.view, TEAMS[1]![1], foe.id, 0)?.mini.aimAt(-1, 0);
      add(host, S.ppi, cx + 5.2, cy + 1.2, S.view, TEAMS[1]![1], foe.id, 1)?.mini.aimAt(-1, 0);
    }
  } else if (S.scene === "zooms") {
    // the unit at three zooms (one per tier), side view above, overhead below
    const upi = rigsOf(S.unit, 0)?.side.unitsPerInch ?? 105;
    const ppis = [Math.round(TIERS.tiny.refS * upi * 0.6), 26, Math.round(TIERS.sheet.refS * upi * 0.9)];
    const colW = W / 3;
    ppis.forEach((ppi, i) => {
      const host = area(ppi, colW * i + 4, 4, colW - 8, H - 8);
      const w = (colW - 8) / ppi;
      const h = (H - 8) / ppi;
      for (const [view, fy] of [["side", 0.46], ["top", 0.82]] as const) {
        const a = add(host, ppi, w * 0.3, h * fy, view, TEAMS[0]![1], S.unit, 0, look);
        a?.mini.aimAt(1, view === "side" ? 0 : -0.4);
        const b = add(host, ppi, w * 0.72, h * fy, view, TEAMS[1]![1], S.unit, 0, look);
        b?.mini.aimAt(-1, view === "side" ? 0 : 0.3);
      }
    });
  } else if (S.scene === "lineup" || S.scene === "sil32") {
    // every converted unit of the faction, side by side on a table at the chosen zoom (or, for the
    // silhouette test, each scaled so its figure is about 32 px tall, all flat black)
    const units = rigged();
    const sil = S.scene === "sil32";
    const rows = sil ? 1 : 2;
    const perRow = Math.ceil(units.length / rows);
    const ppi = sil ? 26 : S.ppi;
    const host = area(ppi, 0, 0, W, H, sil ? 0xeee6d2 : DIRT);
    const gap = W / ppi / (perRow + 0.5);
    units.forEach((u, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const x = gap * (col + 0.75);
      if (sil) {
        // two views per unit: side figure above, overhead below, each sized to ~32 px
        const rigs = rigsOf(u.id, 0)!;
        for (const [view, fy] of [["side", 0.38], ["top", 0.72]] as const) {
          const r = view === "side" ? rigs.side : rigs.top;
          const sub = new Container();
          const px = 32;
          const k = px / ((view === "side" ? r.height : r.height) / r.unitsPerInch) / ppi;
          sub.scale.set(k);
          sub.position.set(x, (H / ppi) * fy);
          sub.sortableChildren = true;
          host.addChild(sub);
          const pl = add(sub, ppi * k, 0, 0, view, 0x141414, u.id, 0);
          if (pl) {
            pl.mini.setSilhouette(true);
            pl.mini.footprint.visible = false;
            pl.mini.aimAt(-1, 0);
            pl.flying = false;
            pl.lift = 0;
            pl.mini.setStatus({ flying: false });
            (pl as Placed & { noBase?: boolean }).noBase = true;
          }
        }
      } else {
        const y = (H / ppi) * (rows === 1 ? 0.6 : row === 0 ? 0.42 : 0.86);
        add(host, ppi, x, y, S.view, i % 2 ? TEAMS[1]![1] : TEAMS[0]![1], u.id, 0)?.mini.aimAt(1, 0.2);
      }
    });
  } else {
    const ppi = 26;
    const host = area(ppi, 0, 0, W, H);
    const units = rigged();
    const cols = Math.ceil(Math.sqrt(S.perfN * (W / H)));
    const gx = W / ppi / (cols + 1);
    const rows = Math.ceil(S.perfN / cols);
    const gy = H / ppi / (rows + 1);
    for (let i = 0; i < S.perfN; i++) {
      const x = gx * (1 + (i % cols));
      const y = gy * (1 + Math.floor(i / cols));
      // mixed: every converted unit of the faction in turn (squads weighted by their model count)
      const u = units.length ? units[i % units.length]! : profile()!;
      const pl = add(host, ppi, x, y, S.view, i % 2 ? TEAMS[1]![1] : TEAMS[0]![1], u.id, i);
      if (!pl) continue;
      pl.mini.aimAt(i % 2 ? -1 : 1, (i % 5) - 2);
      pl.next = Math.random() * 1500;
      if (i % 3 === 0 && u.move > 0) pl.walk = { x0: x - 0.6, x1: x + 0.6, dir: 1, speed: 1.5 };
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
        p.mini.play(Math.random() < 0.6 ? "recoil" : "flinch");
      }
    }
    const lift = p.flying || S.flying ? p.lift || 1.1 : 0;
    p.mini.update(dt, { ppi: p.ppi, walking, lift, face, x: p.x, y: p.y, visible: true, alpha: 1 });
    if ((p as Placed & { noBase?: boolean }).noBase) p.mini.footprint.visible = false;
  }
  const work = performance.now() - t0;
  if (perf && !perf.done) {
    const since = performance.now() - perf.t0;
    if (since > 1500) {
      perf.frames.push(dt);
      perf.work.push(work);
    }
    if (since > 7500) {
      perf.done = true;
      const n = perf.frames.length;
      const avg = perf.frames.reduce((a, b) => a + b, 0) / n;
      const sorted = perf.frames.slice().sort((a, b) => a - b);
      const p95 = sorted[Math.floor(n * 0.95)]!;
      const w = perf.work.reduce((a, b) => a + b, 0) / n;
      const sprites = placed.reduce((s, pl) => s + drawOrder(pl.mini.rig).length * 2, 0);
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
  const st = bakeStats();
  const lines = [
    `${profile()?.name ?? S.unit} (${S.unit})   view ${S.view === "side" ? "A · Ink Rig" : "D · Overhead"}   scene ${S.scene}   ${S.scene === "one" || S.scene === "squad" || S.scene === "lineup" ? `${S.ppi} px/in` : ""}`,
    sk ? `tier ${sk.tier}: page ${sk.plan.w * 2}×${sk.plan.h}px, ${sk.plan.entries.length} drawables, k ${sk.plan.k.toFixed(2)} px/u, ink ${sk.plan.sil.toFixed(1)} px, ${sk.from === "disk" ? "from disk cache" : "baked"} in ${sk.ms.toFixed(0)} ms` : "baking…",
    `pages in memory ${pages.length} (${st.inUse} in use), ~${mb.toFixed(1)} MB GPU; baked ${st.baked}, from disk ${st.fromDisk}, freed ${st.freed}`,
  ];
  if (perf) lines.push(`perf: ${perf.result}`);
  return lines.join("\n");
}

// ---------- panel ----------

function btn(text: string, on: () => void, pressed?: () => boolean, title?: string, rebuild = true): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = text;
  if (title) b.title = title;
  b.onclick = () => {
    on();
    // one-shot clips play on the models already there (a rebuild would make new ones)
    if (rebuild) render();
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

function check(text: string, get: () => boolean, set: (v: boolean) => void): HTMLLabelElement {
  const l = document.createElement("label");
  const c = document.createElement("input");
  c.type = "checkbox";
  c.checked = get();
  c.onchange = () => {
    set(c.checked);
    render(false);
  };
  l.append(c, text);
  return l;
}

function render(rebuild = true): void {
  const p = profile();
  const art = artFor(S.unit);
  panel.replaceChildren();
  const h1 = document.createElement("h1");
  h1.textContent = "Rig Lab";
  const sm = document.createElement("small");
  sm.textContent = `${p?.name ?? S.unit} (${S.unit}): ${art ? `${art.looks.length} look${art.looks.length > 1 ? "s" : ""}` : "no new art yet (Classic)"}. Dev page: not part of the game build.`;
  panel.append(h1, sm);
  section(
    "Faction",
    ...BASE_FACTIONS.map((f) =>
      btn(
        FACTIONS[f]?.name ?? f,
        () => {
          S.faction = f;
          S.unit = (rigged()[0] ?? profilesOf(f)[0]!).id;
          S.cw = "";
          S.look = 0;
          S.hidden.clear();
        },
        () => S.faction === f,
      ),
    ),
  );
  section(
    `Units (${rigged().length}/${profilesOf(S.faction).length} converted)`,
    ...profilesOf(S.faction).map((u) => {
      const b = btn(
        u.name.replace(/^His Radiance, the /, ""),
        () => {
          S.unit = u.id;
          S.look = 0;
          S.hidden.clear();
          if (S.scene === "lineup" || S.scene === "sil32" || S.scene === "perf") S.scene = "one";
        },
        () => S.unit === u.id,
        `${u.id}${u.structure?.summonOnly ? " (summon-only)" : ""}`,
      );
      if (!artFor(u.id)) b.style.opacity = "0.45";
      return b;
    }),
  );
  if (art && art.looks.length > 1)
    section("Look (per-model variation)", ...art.looks.map((l, i) => btn(`${i}: ${l.side.name}`, () => (S.look = i), () => S.look === i)));
  section(
    "View",
    btn("A · Ink Rig", () => (S.view = "side"), () => S.view === "side"),
    btn("D · Overhead", () => (S.view = "top"), () => S.view === "top"),
  );
  section(
    "Scene",
    ...SCENES.filter((s) => s !== "perf").map((sc) => btn(SCENE_LABEL[sc], () => (S.scene = sc), () => S.scene === sc)),
    btn("Perf 100", () => ((S.perfN = 100), (S.scene = "perf")), () => S.scene === "perf" && S.perfN === 100),
    btn("200", () => ((S.perfN = 200), (S.scene = "perf")), () => S.scene === "perf" && S.perfN === 200),
    btn("400", () => ((S.perfN = 400), (S.scene = "perf")), () => S.scene === "perf" && S.perfN === 400),
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
    ...(["recoil", "flinch", "death"] as ClipId[]).map((id) => btn(id[0]!.toUpperCase() + id.slice(1), () => playAll(id), undefined, undefined, false)),
    btn("Flyer bob", () => (S.flying = !S.flying), () => S.flying),
  );
  section(
    "Status",
    ...(["selected", "hurt", "engaged", "shaken", "spent", "hunkered"] as const).map((k) => check(k, () => S.status[k], (v) => (S.status[k] = v))),
  );
  const angle = document.createElement("input");
  angle.type = "range";
  angle.min = "0";
  angle.max = "359";
  angle.value = String(Math.round(S.angle));
  angle.oninput = () => (S.angle = Number(angle.value));
  section("Facing (degrees)", angle, check("auto-turn", () => S.autoTurn, (v) => (S.autoTurn = v)));
  section("Team colour", ...TEAMS.map(([n, c]) => btn(n, () => (S.team = c), () => S.team === c)));
  const cws = FACTION_COLOURWAYS[S.faction] ?? [];
  const current = S.cw || art?.colourway.id || "";
  section("Colourway", ...cws.map((id) => btn(COLOURWAYS[id]!.name, () => (S.cw = id), () => current === id)));
  const rigs = rigsOf(S.unit, S.look);
  if (rigs) {
    const rig = S.view === "side" ? rigs.side : rigs.top;
    section(
      `Parts and limbs (${rig.frame} frame)`,
      ...drawOrder(rig).map((d) =>
        check(d.id, () => !S.hidden.has(d.id), (v) => {
          if (v) S.hidden.delete(d.id);
          else S.hidden.add(d.id);
        }),
      ),
    );
  }
  section(
    "Tests",
    check("bones, grips, muzzle", () => S.debug, (v) => (S.debug = v)),
    check("silhouette test", () => S.silhouette, (v) => (S.silhouette = v)),
  );
  const clearBtn = document.createElement("button");
  clearBtn.textContent = "Clear disk cache";
  clearBtn.onclick = () => void clearDiskCache();
  section("Bake cache", clearBtn);
  const u = new URL(location.href);
  u.search = new URLSearchParams({ faction: S.faction, unit: S.unit, view: S.view, scene: S.scene, ppi: String(S.ppi) }).toString();
  history.replaceState(null, "", u);
  if (rebuild) build();
  else
    for (const [i, pl] of placed.entries()) {
      pl.mini.setStatus(status(profile(), i, pl.flying));
      pl.mini.setDebug(S.debug);
      pl.mini.setSilhouette(S.silhouette || S.scene === "sil32");
      for (const d of drawOrder(pl.mini.rig)) pl.mini.setPartVisible(d.id, !S.hidden.has(d.id));
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
