// Map builder: a full-screen editor for custom battlefields (both game modes).

import "./editor.css";
import { MAPS, type MapDef } from "../engine/data/maps";
import { mapProblems, mapWarnings } from "../engine/data/mapValidation";
import { MODES, type ModeId } from "../engine/data/modes";
import { ngon } from "../engine/geometry";
import type { PlayerId, TerrainKind, Vec } from "../engine/types";
import {
  cleanMap,
  deleteCustomMap,
  importMap,
  listCustomMaps,
  loadDraft,
  saveCustomMap,
  saveDraft,
} from "../ui/customMaps";
import { downloadJson, pickJsonFile, slug } from "../ui/files";
import { drawMap, fitView, PLAYER, playerName, swatch, type Overlay, type View } from "./draw";
import { History } from "./history";
import {
  addAccess,
  addObjective,
  addSpawn,
  addTerrain,
  asymmetricItems,
  blankMap,
  clampDelta,
  clampVec,
  cloneMap,
  coverLook,
  type CoverLook,
  deleteItem,
  duplicateMap,
  edgeMidAt,
  findTerrain,
  type Half,
  hitTest,
  insertVertex,
  type ItemRef,
  itemExists,
  mirrorHalf,
  mirrorItem,
  normalize,
  platformAt,
  polyOf,
  rectFrom,
  refForMessage,
  removeVertex,
  renameAccess,
  renameTerrain,
  ridersOf,
  type Riders,
  sameRef,
  setVertex,
  snapTo,
  snapVec,
  terrainIdFor,
  translateItem,
  uniqueId,
  allIds,
  vertexAt,
} from "./model";

export interface MapBuilderOptions {
  /** Called when the user leaves the builder. */
  onClose: () => void;
  /** Optional: start a test game on the map being edited. */
  onPlay?: (map: MapDef) => void;
}

type Tool = "select" | TerrainKind | "ramp" | "ladder" | "spawn0" | "spawn1" | "objective";

const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: "select", label: "Select", key: "V", hint: "Click to select, drag to move. Drag corners to reshape; drag a yellow edge dot to add a corner; right-click a corner to remove it." },
  { id: "platform", label: "Platform", key: "P", hint: "Raised deck (elevation 1). Must be convex. Drag a rectangle, or click for a default size." },
  { id: "building", label: "Building", key: "B", hint: "Tall and impassable; blocks sight. Drag a rectangle, or click for a default size." },
  { id: "wall", label: "Wall", key: "W", hint: "Impassable at its level and blocks sight there. Level 1 = on top of a platform." },
  { id: "barricade", label: "Barricade", key: "C", hint: "Impassable at its level, gives cover, doesn't block sight. Level 1 = on top of a platform." },
  { id: "cover", label: "Cover", key: "S", hint: "Passable area that gives cover: green scrub or a crater." },
  { id: "ramp", label: "Ramp", key: "R", hint: "Drag from the ground end to the platform end. It attaches to the platform under the top end." },
  { id: "ladder", label: "Ladder", key: "L", hint: "Drag from the ground end to the platform end. Costs +1\" to climb; heavy units can't use ladders." },
  { id: "spawn0", label: "Spawn P1", key: "1", hint: "Paint a deployment zone for player 1 (cyan). Drag a rectangle or draw a polygon." },
  { id: "spawn1", label: "Spawn P2", key: "2", hint: "Paint a deployment zone for player 2 (red). Drag a rectangle or draw a polygon." },
  { id: "objective", label: "Objective", key: "O", hint: "Click to place. Numbered automatically; elevation follows the platform underneath." },
];

/** Default footprint (w × h) when you click instead of dragging. */
const DEFAULT_SIZE: Record<TerrainKind, [number, number]> = {
  platform: [8, 6],
  building: [4, 4],
  wall: [0.8, 4],
  barricade: [3, 0.8],
  cover: [4, 3],
};

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const isTerrainTool = (t: Tool): t is TerrainKind => t === "platform" || t === "building" || t === "wall" || t === "barricade" || t === "cover";
const fmt = (n: number): string => String(Math.round(n * 100) / 100);

type Drag =
  | { kind: "move"; ref: ItemRef; start: Vec; base: MapDef; riders: Riders; before: string; moved: boolean }
  | { kind: "vertex"; ref: ItemRef; index: number; base: MapDef; before: string }
  | { kind: "insert"; ref: ItemRef; edge: number; base: MapDef; before: string }
  | { kind: "end"; id: string; end: "low" | "high"; base: MapDef; before: string }
  | { kind: "rect"; start: Vec; cur: Vec }
  | { kind: "access"; start: Vec; cur: Vec }
  | { kind: "pan"; startPx: Vec; center: Vec };

/** Open the map builder full-screen inside `host` (the #overlay element). */
export function openMapBuilder(host: HTMLElement, opts: MapBuilderOptions): void {
  new MapBuilder(host, opts);
}

class MapBuilder {
  private map: MapDef;
  /** JSON of the map as last saved to "your maps" ("" if never saved). */
  private savedJson = "";
  private history = new History<string>(200);
  private tool: Tool = "select";
  private shape: "rect" | "poly" = "rect";
  private level: 0 | 1 = 0;
  private look: CoverLook = "scrub";
  private objTeam: PlayerId | null = null;
  private snap = true;
  private step = 0.5;
  private autoMirror = false;
  private showUnmatched = false;
  private labels = false;
  private sel: ItemRef | null = null;
  private drag: Drag | null = null;
  private polyDraft: Vec[] | null = null;
  private cursor: Vec | null = null;
  private zoom = 1;
  private center: Vec | null = null;
  private view: View = { scale: 10, ox: 0, oy: 0, dpr: 1 };
  private raf = 0;
  private toastTimer = 0;
  private spaceDown = false;

  private root!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private stage!: HTMLElement;
  private resizeObs: ResizeObserver | null = null;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);
  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") this.spaceDown = false;
  };

  constructor(
    private readonly host: HTMLElement,
    private readonly opts: MapBuilderOptions,
  ) {
    const draft = loadDraft();
    this.map = draft ? normalize(cloneMap(draft)) : blankMap("skirmish");
    this.savedJson = this.storedJson(this.map.id);
    this.build();
    if (draft) this.toast("Restored your last draft. Use New / open to start another map.");
    else this.showDialog();
  }

  // ---------- setup ----------

  private build(): void {
    const host = this.host;
    host.innerHTML = `
      <div class="mb" role="application" aria-label="Map builder">
        <header class="mb-top">
          <span class="mb-logo">Map builder</span>
          <span class="mb-title" id="mb-title"></span>
          <span class="chip" id="mb-mode"></span>
          <span class="mb-saved" id="mb-saved"></span>
          <span class="spacer"></span>
          <button class="secondary mb-icon" id="mb-undo" title="Undo (Ctrl+Z)" aria-label="Undo">&#8630;</button>
          <button class="secondary mb-icon" id="mb-redo" title="Redo (Ctrl+Y)" aria-label="Redo">&#8631;</button>
          <button class="secondary" id="mb-open" title="Start a new map or open one">New / open</button>
          <button class="secondary" id="mb-import" title="Load a map from a .json file">Import</button>
          <button class="secondary" id="mb-export" title="Download this map as a .json file">Export</button>
          <button id="mb-save" title="Save to your maps (Ctrl+S)">Save</button>
          ${this.opts.onPlay ? `<button class="mb-play" id="mb-play">Play test</button>` : ""}
          <button class="secondary" id="mb-close">Close</button>
        </header>
        <aside class="mb-tools panel" id="mb-tools"></aside>
        <main class="mb-stage" id="mb-stage">
          <canvas id="mb-canvas" tabindex="0" aria-label="Board"></canvas>
          <div class="mb-hud"><span id="mb-coords"></span><span id="mb-hint"></span></div>
          <div class="mb-zoom">
            <button class="secondary mb-icon" id="mb-zoom-in" title="Zoom in (+)" aria-label="Zoom in">+</button>
            <button class="secondary mb-icon" id="mb-zoom-out" title="Zoom out (-)" aria-label="Zoom out">&minus;</button>
            <button class="secondary mb-icon" id="mb-fit" title="Fit board (F)" aria-label="Fit board">&#9635;</button>
          </div>
          <div class="mb-toast" id="mb-toast" role="status" aria-live="polite"></div>
        </main>
        <aside class="mb-side">
          <section class="panel" id="mb-props"></section>
          <section class="panel mb-checks" id="mb-checks"></section>
          <section class="panel" id="mb-info"></section>
        </aside>
        <div class="mb-dialog-wrap" id="mb-dialog" hidden></div>
      </div>`;
    host.classList.add("show", "mb-open");
    this.root = host.querySelector(".mb")!;
    this.canvas = host.querySelector<HTMLCanvasElement>("#mb-canvas")!;
    this.ctx = this.canvas.getContext("2d")!;
    this.stage = host.querySelector("#mb-stage")!;

    const $ = (id: string) => host.querySelector<HTMLElement>(`#${id}`);
    $("mb-undo")!.onclick = () => this.undo();
    $("mb-redo")!.onclick = () => this.redo();
    $("mb-open")!.onclick = () => this.showDialog();
    $("mb-import")!.onclick = () => void this.importFile();
    $("mb-export")!.onclick = () => this.exportFile();
    $("mb-save")!.onclick = () => this.save();
    $("mb-play")?.addEventListener("click", () => this.play());
    $("mb-close")!.onclick = () => this.close();
    $("mb-zoom-in")!.onclick = () => this.zoomBy(1.25);
    $("mb-zoom-out")!.onclick = () => this.zoomBy(0.8);
    $("mb-fit")!.onclick = () => this.fit();

    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => this.pointerDown(e));
    c.addEventListener("pointermove", (e) => this.pointerMove(e));
    c.addEventListener("pointerup", (e) => this.pointerUp(e));
    c.addEventListener("pointercancel", () => this.cancelDrag());
    c.addEventListener("pointerleave", () => {
      this.cursor = null;
      this.updateCoords();
      this.requestRender();
    });
    c.addEventListener("dblclick", (e) => {
      e.preventDefault();
      if (this.polyDraft) this.finishPoly();
    });
    c.addEventListener("contextmenu", (e) => this.contextMenu(e));
    c.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.stage);

    this.renderTools();
    this.refresh();
    this.resize();
  }

  private teardown(): void {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.toastTimer);
    this.host.classList.remove("mb-open");
  }

  private alive(): boolean {
    if (this.root.isConnected) return true;
    this.teardown();
    return false;
  }

  // ---------- view ----------

  private resize(): void {
    if (!this.alive()) return;
    const r = this.stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.updateView();
    this.render();
  }

  private updateView(): void {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const fit = fitView(this.map, w, h, window.devicePixelRatio || 1);
    const c = this.center ?? { x: this.map.width / 2, y: this.map.height / 2 };
    const scale = fit.scale * this.zoom;
    this.view = { scale, ox: w / 2 - c.x * scale, oy: h / 2 - c.y * scale, dpr: fit.dpr };
  }

  private fit(): void {
    this.zoom = 1;
    this.center = null;
    this.updateView();
    this.requestRender();
  }

  private zoomBy(k: number, at?: Vec, atPx?: Vec): void {
    const z = Math.min(8, Math.max(1, this.zoom * k));
    if (z === this.zoom) return;
    const w = this.canvas.width / this.view.dpr;
    const h = this.canvas.height / this.view.dpr;
    const p = at ?? this.center ?? { x: this.map.width / 2, y: this.map.height / 2 };
    const px = atPx ?? { x: w / 2, y: h / 2 };
    this.zoom = z;
    if (z === 1) this.center = null;
    else {
      const s = fitView(this.map, w, h, this.view.dpr).scale * z;
      this.center = this.clampCenter({ x: p.x - (px.x - w / 2) / s, y: p.y - (px.y - h / 2) / s });
    }
    this.updateView();
    this.requestRender();
  }

  private clampCenter(c: Vec): Vec {
    return { x: Math.min(this.map.width, Math.max(0, c.x)), y: Math.min(this.map.height, Math.max(0, c.y)) };
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const px = { x: e.clientX - r.left, y: e.clientY - r.top };
    this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, this.toBoard(e), px);
  }

  private toBoard(e: { clientX: number; clientY: number }): Vec {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.view.ox) / this.view.scale, y: (e.clientY - r.top - this.view.oy) / this.view.scale };
  }

  private snapP(p: Vec): Vec {
    return clampVec(snapVec(p, this.snap ? this.step : null), this.map.width, this.map.height);
  }

  /** Pick slack in inches for a number of screen pixels. */
  private px(n: number): number {
    return n / this.view.scale;
  }

  private requestRender(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  private render(): void {
    if (!this.alive()) return;
    const o: Overlay = {
      sel: this.sel,
      labels: this.labels,
      grid: this.snap ? this.step : null,
      unmatched: this.showUnmatched ? asymmetricItems(this.map) : [],
      cursor: this.tool !== "select" ? this.cursor : null,
    };
    const d = this.drag;
    if (d?.kind === "rect" && this.tool !== "select") {
      o.ghost = { poly: this.rectPoly(d.start, d.cur), closed: true, color: this.ghostColor() };
    } else if (this.polyDraft) {
      o.ghost = { poly: this.polyDraft, closed: false, color: this.ghostColor() };
    }
    if (d?.kind === "access" && (this.tool === "ramp" || this.tool === "ladder")) {
      const plat = platformAt(this.map, d.cur);
      o.ghostAccess = { kind: this.tool, low: d.start, high: d.cur, ok: !!plat && !platformAt(this.map, d.start, undefined) };
    }
    drawMap(this.ctx, this.map, this.view, o);
  }

  private ghostColor(): string {
    if (this.tool === "spawn0" || this.tool === "spawn1") return swatch(this.tool);
    return isTerrainTool(this.tool) ? swatch(this.tool) : "#ffffff";
  }

  private rectPoly(a: Vec, b: Vec): Vec[] {
    if (this.tool === "cover" && this.look === "crater") return this.ellipsePoly(a, b);
    return rectFrom(a, b);
  }

  /** An octagon inscribed in the rectangle a–b (for craters). */
  private ellipsePoly(a: Vec, b: Vec): Vec[] {
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const rx = Math.abs(a.x - b.x) / 2;
    const ry = Math.abs(a.y - b.y) / 2;
    return ngon(0, 0, 1).map((p) => ({ x: cx + p.x * rx, y: cy + p.y * ry }));
  }

  // ---------- state changes ----------

  private snapshot(): string {
    return JSON.stringify(this.map);
  }

  /** Apply an edit with undo support. `fn` mutates `this.map`. */
  private change(fn: (m: MapDef) => void): void {
    const before = this.snapshot();
    fn(this.map);
    normalize(this.map);
    this.commit(before);
  }

  /** Record `before` in the history if the map changed, then refresh everything. */
  private commit(before: string): void {
    if (this.snapshot() !== before) this.history.push(before);
    if (this.sel && !itemExists(this.map, this.sel)) this.sel = null;
    saveDraft(this.map);
    this.refresh();
  }

  private setMap(m: MapDef, savedJson: string, resetHistory = true): void {
    this.map = normalize(cloneMap(m));
    this.savedJson = savedJson;
    this.sel = null;
    this.polyDraft = null;
    this.drag = null;
    if (resetHistory) this.history.clear();
    this.zoom = 1;
    this.center = null;
    saveDraft(this.map);
    this.updateView();
    this.refresh();
  }

  private undo(): void {
    const prev = this.history.undo(this.snapshot());
    if (prev === null) return this.toast("Nothing to undo");
    this.restore(prev);
  }

  private redo(): void {
    const next = this.history.redo(this.snapshot());
    if (next === null) return this.toast("Nothing to redo");
    this.restore(next);
  }

  private restore(json: string): void {
    const m = JSON.parse(json) as MapDef;
    const sizeChanged = m.width !== this.map.width || m.height !== this.map.height;
    this.map = m;
    if (this.sel && !itemExists(this.map, this.sel)) this.sel = null;
    this.polyDraft = null;
    saveDraft(this.map);
    if (sizeChanged) this.fit();
    this.refresh();
  }

  private storedJson(id: string): string {
    const m = listCustomMaps().find((x) => x.id === id);
    return m ? JSON.stringify(cleanMap(m)) : "";
  }

  private get dirty(): boolean {
    return JSON.stringify(cleanMap(this.map)) !== this.savedJson;
  }

  private confirmDiscard(): boolean {
    if (!this.dirty) return true;
    const empty = !this.map.terrain.length && !this.map.access.length;
    return empty || window.confirm(`Discard unsaved changes to "${this.map.name}"?`);
  }

  // ---------- pointer input ----------

  private pointerDown(e: PointerEvent): void {
    if (this.drag) return;
    this.canvas.focus({ preventScroll: true });
    const p = this.toBoard(e);
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      e.preventDefault();
      this.drag = { kind: "pan", startPx: { x: e.clientX, y: e.clientY }, center: this.center ?? { x: this.map.width / 2, y: this.map.height / 2 } };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    this.canvas.setPointerCapture(e.pointerId);
    const sp = this.snapP(p);
    const tol = this.px(8);
    switch (this.tool) {
      case "select": {
        if (this.sel) {
          const poly = polyOf(this.map, this.sel);
          if (poly) {
            const vi = vertexAt(poly, p, tol);
            if (vi >= 0) {
              this.drag = { kind: "vertex", ref: this.sel, index: vi, base: cloneMap(this.map), before: this.snapshot() };
              return;
            }
            const ei = edgeMidAt(poly, p, this.px(6));
            if (ei >= 0) {
              this.drag = { kind: "insert", ref: this.sel, edge: ei, base: cloneMap(this.map), before: this.snapshot() };
              return;
            }
          }
          if (this.sel.type === "access") {
            const id = this.sel.id;
            const a = this.map.access.find((x) => x.id === id);
            if (a) {
              for (const end of ["high", "low"] as const) {
                if (Math.hypot(a[end].x - p.x, a[end].y - p.y) <= tol) {
                  this.drag = { kind: "end", id, end, base: cloneMap(this.map), before: this.snapshot() };
                  return;
                }
              }
            }
          }
        }
        const hit = hitTest(this.map, p, this.px(4));
        this.select(hit);
        if (hit) {
          this.drag = { kind: "move", ref: hit, start: p, base: cloneMap(this.map), riders: ridersOf(this.map, hit), before: this.snapshot(), moved: false };
        } else if (this.zoom > 1) {
          // Dragging empty ground pans a zoomed-in board (the only way to pan on a touch screen).
          this.drag = { kind: "pan", startPx: { x: e.clientX, y: e.clientY }, center: this.center ?? { x: this.map.width / 2, y: this.map.height / 2 } };
        }
        return;
      }
      case "ramp":
      case "ladder":
        this.drag = { kind: "access", start: sp, cur: sp };
        this.requestRender();
        return;
      case "objective": {
        const before = this.snapshot();
        const ref = addObjective(this.map, sp, this.objTeam);
        this.afterCreate(ref, before);
        return;
      }
      default: {
        if (this.shape === "poly") {
          this.addPolyPoint(sp);
          return;
        }
        this.drag = { kind: "rect", start: sp, cur: sp };
        this.requestRender();
      }
    }
  }

  private pointerMove(e: PointerEvent): void {
    const p = this.toBoard(e);
    this.cursor = this.tool === "select" ? p : this.snapP(p);
    this.updateCoords();
    const d = this.drag;
    if (!d) {
      if (this.tool === "select") this.updateCursorStyle(p);
      if (this.tool !== "select") this.requestRender();
      return;
    }
    const sp = this.snapP(p);
    switch (d.kind) {
      case "pan": {
        const s = this.view.scale;
        this.center = this.clampCenter({ x: d.center.x - (e.clientX - d.startPx.x) / s, y: d.center.y - (e.clientY - d.startPx.y) / s });
        this.updateView();
        break;
      }
      case "move": {
        let delta = { x: p.x - d.start.x, y: p.y - d.start.y };
        if (!d.moved && Math.hypot(delta.x, delta.y) < this.px(3)) return;
        d.moved = true;
        if (this.snap) delta = { x: snapTo(delta.x, this.step), y: snapTo(delta.y, this.step) };
        delta = clampDelta(d.base, d.ref, delta, d.riders);
        const m = cloneMap(d.base);
        translateItem(m, d.ref, delta, d.riders);
        this.map = normalize(m);
        break;
      }
      case "vertex": {
        const m = cloneMap(d.base);
        setVertex(m, d.ref, d.index, sp);
        this.map = normalize(m);
        break;
      }
      case "insert": {
        const m = cloneMap(d.base);
        insertVertex(m, d.ref, d.edge, sp);
        this.map = normalize(m);
        break;
      }
      case "end": {
        const m = cloneMap(d.base);
        const a = m.access.find((x) => x.id === d.id);
        if (a) a[d.end] = sp;
        this.map = normalize(m);
        break;
      }
      case "rect":
      case "access":
        d.cur = sp;
        break;
    }
    this.requestRender();
  }

  private pointerUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    switch (d.kind) {
      case "pan":
        return this.requestRender();
      case "move":
      case "vertex":
      case "insert":
      case "end":
        return this.commit(d.before);
      case "rect":
        return this.finishRect(d.start, d.cur);
      case "access":
        return this.finishAccess(d.start, d.cur);
    }
  }

  private cancelDrag(): void {
    const d = this.drag;
    this.drag = null;
    if (d && "base" in d) this.map = d.base;
    this.requestRender();
  }

  private contextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (this.polyDraft) {
      this.polyDraft.pop();
      if (!this.polyDraft.length) this.polyDraft = null;
      return this.requestRender();
    }
    if (!this.sel) return;
    const poly = polyOf(this.map, this.sel);
    if (!poly) return;
    const vi = vertexAt(poly, this.toBoard(e), this.px(8));
    if (vi < 0) return;
    const ref = this.sel;
    let ok = true;
    this.change((m) => (ok = removeVertex(m, ref, vi)));
    if (!ok) this.toast("A shape needs at least 3 corners");
  }

  private updateCursorStyle(p: Vec): void {
    let cur = "default";
    if (this.spaceDown) cur = "grab";
    else if (this.sel) {
      const poly = polyOf(this.map, this.sel);
      if (poly && (vertexAt(poly, p, this.px(8)) >= 0 || edgeMidAt(poly, p, this.px(6)) >= 0)) cur = "crosshair";
    }
    if (cur === "default" && hitTest(this.map, p, this.px(4))) cur = "move";
    this.canvas.style.cursor = cur;
  }

  // ---------- creating ----------

  private finishRect(a: Vec, b: Vec): void {
    const tool = this.tool;
    const before = this.snapshot();
    let poly: Vec[];
    if (Math.abs(a.x - b.x) < 0.25 || Math.abs(a.y - b.y) < 0.25) {
      if (!isTerrainTool(tool)) {
        this.toast("Drag out a rectangle to paint a spawn zone");
        return this.requestRender();
      }
      // A click: drop a default-size piece centred on the click, kept on the board.
      const [w, h] = DEFAULT_SIZE[tool];
      const x = Math.min(this.map.width - w, Math.max(0, snapTo(a.x - w / 2, this.snap ? this.step : 0.01)));
      const y = Math.min(this.map.height - h, Math.max(0, snapTo(a.y - h / 2, this.snap ? this.step : 0.01)));
      poly = this.rectPoly({ x, y }, { x: x + w, y: y + h });
    } else poly = this.rectPoly(a, b);
    this.createShape(poly, before);
  }

  private createShape(poly: Vec[], before: string): void {
    const tool = this.tool;
    let ref: ItemRef;
    if (tool === "spawn0" || tool === "spawn1") ref = addSpawn(this.map, tool === "spawn0" ? 0 : 1, poly);
    else if (isTerrainTool(tool)) ref = addTerrain(this.map, tool, poly, this.level, this.look);
    else return;
    this.afterCreate(ref, before);
  }

  private afterCreate(ref: ItemRef, before: string): void {
    normalize(this.map);
    let sel: ItemRef | null = ref;
    if (this.autoMirror) {
      const r = mirrorItem(this.map, ref);
      normalize(this.map);
      if (r.notes.length) this.toast(r.notes.join(". "));
      // Objectives are renumbered by mirroring; find ours again by position.
      if (ref.type === "objective") sel = null;
    }
    this.sel = sel && itemExists(this.map, sel) ? sel : null;
    this.commit(before);
  }

  private addPolyPoint(p: Vec): void {
    const d = this.polyDraft;
    if (d && d.length >= 3 && Math.hypot(d[0]!.x - p.x, d[0]!.y - p.y) <= Math.max(this.px(10), 0.01)) return this.finishPoly();
    const last = d?.[d.length - 1];
    if (last && last.x === p.x && last.y === p.y) return;
    this.polyDraft = [...(d ?? []), p];
    this.requestRender();
  }

  private finishPoly(): void {
    const pts = (this.polyDraft ?? []).filter((p, i, a) => i === 0 || p.x !== a[i - 1]!.x || p.y !== a[i - 1]!.y);
    if (pts.length > 1 && pts[0]!.x === pts[pts.length - 1]!.x && pts[0]!.y === pts[pts.length - 1]!.y) pts.pop();
    this.polyDraft = null;
    if (pts.length < 3) {
      this.toast("A shape needs at least 3 corners");
      return this.requestRender();
    }
    this.createShape(pts, this.snapshot());
  }

  private finishAccess(low: Vec, high: Vec): void {
    const kind = this.tool === "ladder" ? "ladder" : "ramp";
    if (Math.hypot(low.x - high.x, low.y - high.y) < 0.5) {
      this.toast(`Drag from the ground end to the platform end to place a ${kind}`);
      return this.requestRender();
    }
    const before = this.snapshot();
    const r = addAccess(this.map, kind, low, high);
    if (typeof r === "string") {
      this.toast(r);
      return this.requestRender();
    }
    this.afterCreate(r, before);
  }

  // ---------- commands ----------

  private select(ref: ItemRef | null): void {
    if (sameRef(ref, this.sel) || (!ref && !this.sel)) return;
    this.sel = ref;
    this.renderProps();
    this.requestRender();
  }

  private setTool(t: Tool): void {
    this.tool = t;
    this.polyDraft = null;
    this.drag = null;
    if (t === "platform" || t === "building") this.level = 0;
    this.canvas.style.cursor = t === "select" ? "default" : "crosshair";
    this.renderTools();
    this.updateCoords();
    this.requestRender();
  }

  private deleteSelection(): void {
    const ref = this.sel;
    if (!ref) return;
    this.change((m) => deleteItem(m, ref));
    this.sel = null;
    this.refresh();
  }

  private mirrorSelection(): void {
    const ref = this.sel;
    if (!ref) return this.toast("Select something to mirror first");
    const before = this.snapshot();
    const r = mirrorItem(this.map, ref);
    normalize(this.map);
    if (r.notes.length) this.toast(r.notes.join(". "));
    else this.toast("Added a copy rotated 180° about the centre");
    if (r.ref && itemExists(this.map, r.ref)) this.sel = r.ref;
    this.commit(before);
  }

  private applyMirrorHalf(keep: Half): void {
    const before = this.snapshot();
    const r = mirrorHalf(this.map, keep);
    this.map = r.map;
    this.sel = null;
    this.toast(r.notes.length ? r.notes.join(". ") : `Copied the ${keep} half onto the other side`);
    this.commit(before);
  }

  private duplicateSelection(): void {
    const ref = this.sel;
    if (!ref) return;
    const before = this.snapshot();
    const off = { x: 1, y: 1 };
    let next: ItemRef | null = null;
    if (ref.type === "terrain") {
      const t = findTerrain(this.map, ref.id);
      if (t) {
        const id = terrainIdFor(this.map, t.kind, t.kind === "cover" ? coverLook(t) : "scrub");
        this.map.terrain.push({ ...t, id, poly: t.poly.map((p) => ({ x: p.x + off.x, y: p.y + off.y })) });
        next = { type: "terrain", id };
      }
    } else if (ref.type === "spawn") {
      const z = this.map.spawn[ref.player][ref.index];
      if (z) next = addSpawn(this.map, ref.player, z.map((p) => ({ x: p.x + off.x, y: p.y + off.y })));
    } else if (ref.type === "objective") {
      const o = this.map.objectives.find((x) => x.id === ref.id);
      if (o) next = addObjective(this.map, { x: o.pos.x + off.x, y: o.pos.y + off.y }, o.team);
    } else {
      return this.toast("Draw a new ramp or ladder instead of copying one");
    }
    if (next) {
      const d = clampDelta(this.map, next, { x: 0, y: 0 }, { access: [], terrain: [], objectives: [] });
      translateItem(this.map, next, d, { access: [], terrain: [], objectives: [] });
    }
    normalize(this.map);
    this.sel = next && itemExists(this.map, next) ? next : null;
    this.commit(before);
  }

  private nudge(dx: number, dy: number): void {
    const ref = this.sel;
    if (!ref) return;
    const s = this.snap ? this.step : 0.1;
    this.change((m) => {
      const riders = ridersOf(m, ref);
      translateItem(m, ref, clampDelta(m, ref, { x: dx * s, y: dy * s }, riders), riders);
    });
  }

  private save(): void {
    const problems = saveCustomMap(this.map);
    if (problems.length) {
      this.toast(`Can't save yet: ${problems.length === 1 ? problems[0] : `${problems.length} problems to fix (see Checks)`}`, true);
      this.root.querySelector("#mb-checks")?.classList.add("mb-flash");
      setTimeout(() => this.root.querySelector("#mb-checks")?.classList.remove("mb-flash"), 900);
      return;
    }
    this.savedJson = JSON.stringify(cleanMap(this.map));
    this.toast(`Saved "${this.map.name}" to your maps`);
    this.refresh();
  }

  private exportFile(): void {
    downloadJson(slug(this.map.name), cleanMap(this.map));
    const n = mapProblems(this.map).length;
    this.toast(n ? `Exported (it still has ${n} problem${n > 1 ? "s" : ""} to fix)` : "Exported");
  }

  private async importFile(): Promise<void> {
    let raw: unknown;
    try {
      raw = await pickJsonFile();
    } catch (err) {
      return this.toast((err as Error).message || "Couldn't read that file", true);
    }
    if (!this.alive()) return;
    const r = importMap(raw, listCustomMaps().map((m) => m.id));
    if (!r.map) return this.toast(`That isn't a map we can open: ${r.problems.slice(0, 2).join("; ")}`, true);
    if (!this.confirmDiscard()) return;
    this.hideDialog();
    this.setMap(r.map, "");
    const bits = [`Imported "${r.map.name}"`];
    if (r.renamed) bits.push("with a fresh id");
    bits.push(r.problems.length ? `${r.problems.length} problem${r.problems.length > 1 ? "s" : ""} to fix before saving` : "save it to keep it");
    this.toast(bits.join(", "));
  }

  private play(): void {
    const problems = mapProblems(this.map);
    if (problems.length) return this.toast(`Fix ${problems.length} problem${problems.length > 1 ? "s" : ""} before play testing`, true);
    const map = cloneMap(this.map);
    saveDraft(map);
    this.teardown();
    this.host.innerHTML = "";
    this.host.classList.remove("show");
    this.opts.onPlay?.(map);
  }

  private close(): void {
    // The draft stays in storage, so nothing is lost by leaving.
    this.teardown();
    this.host.innerHTML = "";
    this.host.classList.remove("show");
    this.opts.onClose();
  }

  // ---------- keyboard ----------

  private handleKey(e: KeyboardEvent): void {
    if (!this.alive()) return;
    const dialog = this.root.querySelector<HTMLElement>("#mb-dialog")!;
    if (!dialog.hidden) {
      if (e.key === "Escape") this.hideDialog();
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
      if (e.key === "Escape") target.blur();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z") {
      e.preventDefault();
      return e.shiftKey ? this.redo() : this.undo();
    }
    if (mod && k === "y") {
      e.preventDefault();
      return this.redo();
    }
    if (mod && k === "s") {
      e.preventDefault();
      return this.save();
    }
    if (mod && k === "d") {
      e.preventDefault();
      return this.duplicateSelection();
    }
    if (mod || e.altKey) return;
    if (e.code === "Space") {
      this.spaceDown = true;
      e.preventDefault();
      this.canvas.style.cursor = "grab";
      return;
    }
    switch (e.key) {
      case "Escape":
        if (this.drag) return this.cancelDrag();
        if (this.polyDraft) {
          this.polyDraft = null;
          return this.requestRender();
        }
        if (this.sel) return this.select(null);
        if (this.tool !== "select") return this.setTool("select");
        return;
      case "Enter":
        if (this.polyDraft) this.finishPoly();
        return;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        if (this.polyDraft) {
          this.polyDraft.pop();
          if (!this.polyDraft.length) this.polyDraft = null;
          return this.requestRender();
        }
        return this.deleteSelection();
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown":
        if (!this.sel) return;
        e.preventDefault();
        return this.nudge(e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0, e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0);
      case "+":
      case "=":
        return this.zoomBy(1.25);
      case "-":
        return this.zoomBy(0.8);
    }
    if (k === "m") return this.mirrorSelection();
    if (k === "g") {
      this.snap = !this.snap;
      this.renderTools();
      return this.requestRender();
    }
    if (k === "f") return this.fit();
    if (k === "t") {
      this.shape = this.shape === "rect" ? "poly" : "rect";
      this.polyDraft = null;
      return this.renderTools();
    }
    const tool = TOOLS.find((t) => t.key.toLowerCase() === k);
    if (tool) this.setTool(tool.id);
  }

  // ---------- panels ----------

  private refresh(): void {
    if (!this.alive()) return;
    this.renderTop();
    this.renderProps();
    this.renderChecks();
    this.renderInfo();
    this.requestRender();
  }

  private renderTop(): void {
    const $ = (id: string) => this.root.querySelector<HTMLElement>(`#${id}`)!;
    const mode = MODES[this.map.mode];
    $("mb-title").textContent = this.map.name;
    $("mb-mode").textContent = `${mode.name} ${mode.width}" × ${mode.height}"`;
    const saved = $("mb-saved");
    saved.textContent = !this.savedJson ? "Not saved yet" : this.dirty ? "Unsaved changes" : "Saved";
    saved.className = `mb-saved ${this.savedJson && !this.dirty ? "ok" : ""}`;
    (this.root.querySelector("#mb-undo") as HTMLButtonElement).disabled = !this.history.canUndo;
    (this.root.querySelector("#mb-redo") as HTMLButtonElement).disabled = !this.history.canRedo;
    const problems = mapProblems(this.map).length;
    const play = this.root.querySelector<HTMLButtonElement>("#mb-play");
    if (play) {
      play.disabled = problems > 0;
      play.title = problems ? "Fix the problems listed under Checks first" : "Start a test game on this map";
    }
  }

  private renderTools(): void {
    const el = this.root.querySelector<HTMLElement>("#mb-tools")!;
    const t = this.tool;
    const tool = TOOLS.find((x) => x.id === t)!;
    const shapeTool = isTerrainTool(t) || t === "spawn0" || t === "spawn1";
    const levelTool = t === "wall" || t === "barricade" || t === "cover";
    const seg = (name: string, items: [string, string][], cur: string) =>
      `<div class="mb-seg" role="group" aria-label="${name}">${items
        .map(([v, l]) => `<button class="${v === cur ? "selected" : "secondary"}" data-${name}="${v}">${l}</button>`)
        .join("")}</div>`;
    el.innerHTML = `
      <h3>Tools</h3>
      <div class="mb-toolgrid">
        ${TOOLS.map(
          (x) => `<button class="mb-tool ${x.id === t ? "selected" : "secondary"}" data-tool="${x.id}" title="${esc(x.label)} (${x.key})">
            <span class="mb-sw mb-sw-${x.id}"></span>${esc(x.label)}<kbd>${x.key}</kbd></button>`,
        ).join("")}
      </div>
      <p class="hint mb-toolhint">${esc(tool.hint)}</p>
      ${shapeTool ? `<label class="mb-lab">Shape</label>${seg("shape", [["rect", "Rectangle"], ["poly", "Polygon"]], this.shape)}` : ""}
      ${shapeTool && this.shape === "poly" ? `<p class="hint">Click to add corners. Click the first corner, double-click or press Enter to finish. Backspace removes the last one.</p>` : ""}
      ${levelTool ? `<label class="mb-lab">Level</label>${seg("level", [["0", "Ground (0)"], ["1", "On platform (1)"]], String(this.level))}` : ""}
      ${t === "cover" ? `<label class="mb-lab">Look</label>${seg("look", [["scrub", "Scrub"], ["crater", "Crater"]], this.look)}` : ""}
      ${t === "objective" ? `<label class="mb-lab">Objective type</label>${seg("team", [["n", "Neutral"], ["0", "P1 home"], ["1", "P2 home"]], this.objTeam === null ? "n" : String(this.objTeam))}` : ""}
      <h3>Grid</h3>
      <div class="mb-row">
        <label class="mb-check"><input type="checkbox" id="mb-snap" ${this.snap ? "checked" : ""}/> Snap (G)</label>
        <select id="mb-step" aria-label="Grid size">${[0.25, 0.5, 1, 2].map((s) => `<option value="${s}" ${s === this.step ? "selected" : ""}>${s}"</option>`).join("")}</select>
      </div>
      <label class="mb-check"><input type="checkbox" id="mb-labels" ${this.labels ? "checked" : ""}/> Show ids</label>
      <h3>Symmetry</h3>
      <button class="secondary mb-wide" id="mb-mirror" ${this.sel ? "" : "disabled"} title="Add a copy of the selection rotated 180° about the board centre (M)">Mirror selected (M)</button>
      <label class="mb-check"><input type="checkbox" id="mb-automirror" ${this.autoMirror ? "checked" : ""}/> Auto-mirror new pieces</label>
      <div class="mb-row">
        <select id="mb-half" aria-label="Half to keep">
          <option value="top">Keep top half</option><option value="bottom">Keep bottom half</option>
          <option value="left">Keep left half</option><option value="right">Keep right half</option>
        </select>
        <button class="secondary" id="mb-mirrorhalf" title="Replace the other half with this half rotated 180°">Mirror</button>
      </div>
      <label class="mb-check"><input type="checkbox" id="mb-unmatched" ${this.showUnmatched ? "checked" : ""}/> Highlight unmatched</label>`;
    el.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => (b.onclick = () => this.setTool(b.dataset.tool as Tool)));
    el.querySelectorAll<HTMLButtonElement>("[data-shape]").forEach(
      (b) =>
        (b.onclick = () => {
          this.shape = b.dataset.shape as "rect" | "poly";
          this.polyDraft = null;
          this.renderTools();
          this.requestRender();
        }),
    );
    el.querySelectorAll<HTMLButtonElement>("[data-level]").forEach(
      (b) =>
        (b.onclick = () => {
          this.level = b.dataset.level === "1" ? 1 : 0;
          this.renderTools();
        }),
    );
    el.querySelectorAll<HTMLButtonElement>("[data-look]").forEach(
      (b) =>
        (b.onclick = () => {
          this.look = b.dataset.look as CoverLook;
          this.renderTools();
        }),
    );
    el.querySelectorAll<HTMLButtonElement>("[data-team]").forEach(
      (b) =>
        (b.onclick = () => {
          this.objTeam = b.dataset.team === "n" ? null : (Number(b.dataset.team) as PlayerId);
          this.renderTools();
        }),
    );
    const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`#${id}`)!;
    q<HTMLInputElement>("mb-snap").onchange = (e) => {
      this.snap = (e.target as HTMLInputElement).checked;
      this.requestRender();
    };
    q<HTMLSelectElement>("mb-step").onchange = (e) => {
      this.step = Number((e.target as HTMLSelectElement).value);
      this.requestRender();
    };
    q<HTMLInputElement>("mb-labels").onchange = (e) => {
      this.labels = (e.target as HTMLInputElement).checked;
      this.requestRender();
    };
    q<HTMLButtonElement>("mb-mirror").onclick = () => this.mirrorSelection();
    q<HTMLInputElement>("mb-automirror").onchange = (e) => (this.autoMirror = (e.target as HTMLInputElement).checked);
    q<HTMLButtonElement>("mb-mirrorhalf").onclick = () => this.applyMirrorHalf(q<HTMLSelectElement>("mb-half").value as Half);
    q<HTMLInputElement>("mb-unmatched").onchange = (e) => {
      this.showUnmatched = (e.target as HTMLInputElement).checked;
      this.requestRender();
    };
  }

  private renderProps(): void {
    const el = this.root.querySelector<HTMLElement>("#mb-props")!;
    const mirrorBtn = this.root.querySelector<HTMLButtonElement>("#mb-mirror");
    if (mirrorBtn) mirrorBtn.disabled = !this.sel;
    const ref = this.sel;
    if (!ref) {
      el.innerHTML = `<h3>Selection</h3><p class="hint">Nothing selected. Pick the Select tool (V) and click a piece, ramp, objective or spawn zone.</p>`;
      return;
    }
    const actions = `<div class="mb-row mb-actions">
        <button class="secondary" data-act="mirror" title="Add a 180° copy (M)">Mirror</button>
        ${ref.type !== "access" ? `<button class="secondary" data-act="dup" title="Duplicate (Ctrl+D)">Duplicate</button>` : ""}
        <button class="mb-danger" data-act="del" title="Delete (Del)">Delete</button></div>`;
    let body = "";
    if (ref.type === "terrain") {
      const t = findTerrain(this.map, ref.id);
      if (!t) return;
      const b = t.poly.reduce((acc, p) => ({ x0: Math.min(acc.x0, p.x), y0: Math.min(acc.y0, p.y), x1: Math.max(acc.x1, p.x), y1: Math.max(acc.y1, p.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
      const fixedLevel = t.kind === "platform" || t.kind === "building";
      body = `
        <label class="mb-lab" for="mb-p-id">Id</label><input id="mb-p-id" value="${esc(t.id)}" spellcheck="false"/>
        <label class="mb-lab" for="mb-p-kind">Kind</label>
        <select id="mb-p-kind">${(["platform", "building", "wall", "barricade", "cover"] as const).map((k) => `<option value="${k}" ${k === t.kind ? "selected" : ""}>${k}</option>`).join("")}</select>
        <label class="mb-lab" for="mb-p-level">Level</label>
        <select id="mb-p-level" ${fixedLevel ? "disabled" : ""}><option value="0" ${t.level === 0 ? "selected" : ""}>0 (ground)</option><option value="1" ${t.level === 1 ? "selected" : ""}>1 (on a platform)</option></select>
        ${t.kind === "cover" ? `<label class="mb-lab" for="mb-p-look">Look</label><select id="mb-p-look"><option value="scrub" ${coverLook(t) === "scrub" ? "selected" : ""}>Scrub</option><option value="crater" ${coverLook(t) === "crater" ? "selected" : ""}>Crater</option></select>` : ""}
        <p class="hint">${t.poly.length} corners, ${fmt(b.x1 - b.x0)}" × ${fmt(b.y1 - b.y0)}" at (${fmt(b.x0)}, ${fmt(b.y0)})${t.kind === "platform" ? `. Ramps/ladders: ${this.map.access.filter((a) => a.platform === t.id).length}` : ""}</p>`;
    } else if (ref.type === "access") {
      const a = this.map.access.find((x) => x.id === ref.id);
      if (!a) return;
      const len = Math.hypot(a.high.x - a.low.x, a.high.y - a.low.y);
      body = `
        <label class="mb-lab" for="mb-p-id">Id</label><input id="mb-p-id" value="${esc(a.id)}" spellcheck="false"/>
        <label class="mb-lab" for="mb-p-akind">Kind</label>
        <select id="mb-p-akind"><option value="ramp" ${a.kind === "ramp" ? "selected" : ""}>Ramp</option><option value="ladder" ${a.kind === "ladder" ? "selected" : ""}>Ladder</option></select>
        <p class="hint">Platform: <b>${esc(a.platform)}</b>. Length ${fmt(len)}". Drag the green dot (ground end) or yellow dot (platform end) to adjust.</p>`;
    } else if (ref.type === "objective") {
      const o = this.map.objectives.find((x) => x.id === ref.id);
      if (!o) return;
      body = `
        <p><b>Objective ${Number(o.number) || 0}</b> <span class="hint">(${esc(o.id)})</span></p>
        <label class="mb-lab" for="mb-p-team">Type</label>
        <select id="mb-p-team"><option value="n" ${o.team === null ? "selected" : ""}>Neutral</option><option value="0" ${o.team === 0 ? "selected" : ""}>Player 1 home</option><option value="1" ${o.team === 1 ? "selected" : ""}>Player 2 home</option></select>
        <label class="mb-lab" for="mb-p-radius">Radius (inches)</label>
        <input id="mb-p-radius" type="number" min="0.5" max="6" step="0.5" value="${fmt(Number(o.radius) || 2.5)}"/>
        <p class="hint">At (${fmt(o.pos.x)}, ${fmt(o.pos.y)}), elevation ${o.elevation === 1 ? 1 : 0}${o.elevation === 1 ?" (on a platform)" : " (ground)"}. Numbers are given automatically: neutral first, then homes.</p>`;
    } else {
      const z = this.map.spawn[ref.player][ref.index];
      if (!z) return;
      body = `
        <p><b>Spawn zone</b> <span class="mb-dot" style="background:${PLAYER[ref.player]}"></span></p>
        <label class="mb-lab" for="mb-p-player">Player</label>
        <select id="mb-p-player"><option value="0" ${ref.player === 0 ? "selected" : ""}>${playerName(0)} (cyan)</option><option value="1" ${ref.player === 1 ? "selected" : ""}>${playerName(1)} (red)</option></select>
        <p class="hint">${z.length} corners. ${playerName(ref.player)} has ${this.map.spawn[ref.player].length} zone${this.map.spawn[ref.player].length > 1 ? "s" : ""}.</p>`;
    }
    el.innerHTML = `<h3>Selection</h3>${body}${actions}`;
    const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`#${id}`);
    el.querySelector<HTMLButtonElement>('[data-act="mirror"]')!.onclick = () => this.mirrorSelection();
    el.querySelector<HTMLButtonElement>('[data-act="dup"]')?.addEventListener("click", () => this.duplicateSelection());
    el.querySelector<HTMLButtonElement>('[data-act="del"]')!.onclick = () => this.deleteSelection();

    const idInput = q<HTMLInputElement>("mb-p-id");
    if (idInput && (ref.type === "terrain" || ref.type === "access")) {
      idInput.onchange = () => {
        let err: string | null = null;
        const to = idInput.value.trim();
        this.change((m) => (err = ref.type === "terrain" ? renameTerrain(m, ref.id, to) : renameAccess(m, ref.id, to)));
        if (err) {
          this.toast(err, true);
          idInput.value = ref.id;
        } else {
          this.sel = { type: ref.type, id: to };
          this.refresh();
        }
      };
    }
    if (ref.type === "terrain") {
      q<HTMLSelectElement>("mb-p-kind")!.onchange = (e) => {
        const kind = (e.target as HTMLSelectElement).value as TerrainKind;
        this.change((m) => {
          const t = findTerrain(m, ref.id);
          if (!t) return;
          if (t.kind === "platform" && kind !== "platform") m.access = m.access.filter((a) => a.platform !== t.id);
          t.kind = kind;
        });
      };
      q<HTMLSelectElement>("mb-p-level")!.onchange = (e) => {
        const level = (e.target as HTMLSelectElement).value === "1" ? 1 : 0;
        this.change((m) => {
          const t = findTerrain(m, ref.id);
          if (t) t.level = level;
        });
      };
      const look = q<HTMLSelectElement>("mb-p-look");
      if (look) {
        look.onchange = () => {
          const t = findTerrain(this.map, ref.id);
          if (!t) return;
          const want = look.value as CoverLook;
          if (coverLook(t) === want) return;
          const newId = uniqueId(`${want}-${t.id.replace(/^(crater|rubble|scrub|pond|tarp)-?/, "") || "1"}`, allIds(this.map));
          this.change((m) => renameTerrain(m, ref.id, newId));
          this.sel = { type: "terrain", id: newId };
          this.refresh();
        };
      }
    } else if (ref.type === "access") {
      q<HTMLSelectElement>("mb-p-akind")!.onchange = (e) => {
        const kind = (e.target as HTMLSelectElement).value as "ramp" | "ladder";
        this.change((m) => {
          const a = m.access.find((x) => x.id === ref.id);
          if (a) a.kind = kind;
        });
      };
    } else if (ref.type === "objective") {
      q<HTMLSelectElement>("mb-p-team")!.onchange = (e) => {
        const v = (e.target as HTMLSelectElement).value;
        const team: PlayerId | null = v === "n" ? null : (Number(v) as PlayerId);
        const o = this.map.objectives.find((x) => x.id === ref.id);
        if (!o) return;
        const pos = o.pos;
        this.change((m) => {
          const x = m.objectives.find((y) => y.id === ref.id);
          if (x) {
            x.team = team;
            x.number = 1e6; // goes last within its new group
          }
        });
        const found = this.map.objectives.find((y) => y.team === team && y.pos.x === pos.x && y.pos.y === pos.y);
        this.sel = found ? { type: "objective", id: found.id } : null;
        this.refresh();
      };
      q<HTMLInputElement>("mb-p-radius")!.onchange = (e) => {
        const r = Number((e.target as HTMLInputElement).value);
        if (!(r > 0) || r > 12) return this.toast("Radius must be between 0 and 12 inches", true);
        this.change((m) => {
          const x = m.objectives.find((y) => y.id === ref.id);
          if (x) x.radius = r;
        });
      };
    } else {
      q<HTMLSelectElement>("mb-p-player")!.onchange = (e) => {
        const to = Number((e.target as HTMLSelectElement).value) as PlayerId;
        if (to === ref.player) return;
        let next: ItemRef | null = null;
        this.change((m) => {
          const [z] = m.spawn[ref.player].splice(ref.index, 1);
          if (z) next = addSpawn(m, to, z);
        });
        this.sel = next;
        this.refresh();
      };
    }
  }

  private renderChecks(): void {
    const el = this.root.querySelector<HTMLElement>("#mb-checks")!;
    const problems = mapProblems(this.map);
    const warnings = mapWarnings(this.map);
    const unmatched = asymmetricItems(this.map).length;
    const item = (cls: string, msg: string) => `<li class="${cls}"><button class="mb-msg" data-msg="${esc(msg)}">${esc(msg)}</button></li>`;
    el.innerHTML = `
      <h3>Checks</h3>
      ${
        problems.length
          ? `<p class="mb-bad">${problems.length} problem${problems.length > 1 ? "s" : ""}: fix before saving or play testing.</p>`
          : `<p class="mb-good">Ready to save and play.</p>`
      }
      <ul class="mb-list">
        ${problems.map((p) => item("bad", p)).join("")}
        ${warnings.map((w) => item("warn", w)).join("")}
      </ul>
      <p class="hint">${
        unmatched
          ? `${unmatched} item${unmatched > 1 ? "s have" : " has"} no 180° partner, so the map isn't point-symmetric. That's allowed, but symmetric maps are fairer.`
          : "Point-symmetric: both sides get the same board."
      }</p>`;
    el.querySelectorAll<HTMLButtonElement>(".mb-msg").forEach(
      (b) =>
        (b.onclick = () => {
          const ref = refForMessage(this.map, b.dataset.msg ?? "");
          if (ref) {
            if (this.tool !== "select") this.setTool("select");
            this.select(ref);
          }
        }),
    );
  }

  private renderInfo(): void {
    const el = this.root.querySelector<HTMLElement>("#mb-info")!;
    const m = this.map;
    const homes = [0, 1].map((p) => m.objectives.filter((o) => o.team === p).length);
    const active = document.activeElement;
    // Don't clobber the field the user is typing in.
    if (active && el.contains(active)) return;
    el.innerHTML = `
      <h3>Map</h3>
      <label class="mb-lab" for="mb-name">Name</label>
      <input id="mb-name" maxlength="40" value="${esc(m.name)}"/>
      <label class="mb-lab" for="mb-blurb">Description</label>
      <textarea id="mb-blurb" rows="3" maxlength="200" placeholder="One or two lines shown when picking a battlefield">${esc(m.blurb)}</textarea>
      <p class="hint">${m.terrain.length} terrain pieces, ${m.access.length} ramps/ladders, ${m.objectives.length} objectives (${homes[0]} + ${homes[1]} home), ${m.spawn[0].length} + ${m.spawn[1].length} spawn zones.</p>`;
    const name = el.querySelector<HTMLInputElement>("#mb-name")!;
    name.onchange = () => {
      const v = name.value.trim() || "Untitled battlefield";
      this.change((x) => (x.name = v));
    };
    const blurb = el.querySelector<HTMLTextAreaElement>("#mb-blurb")!;
    blurb.onchange = () => this.change((x) => (x.blurb = blurb.value.trim()));
  }

  private updateCoords(): void {
    const el = this.root.querySelector<HTMLElement>("#mb-coords");
    const hint = this.root.querySelector<HTMLElement>("#mb-hint");
    if (!el || !hint) return;
    const c = this.cursor;
    el.textContent = c && c.x >= 0 && c.y >= 0 && c.x <= this.map.width && c.y <= this.map.height ? `${fmt(c.x)}", ${fmt(c.y)}"` : "";
    const t = TOOLS.find((x) => x.id === this.tool)!;
    hint.textContent = this.tool === "select" ? "Scroll to zoom; drag empty ground, Space+drag or middle-drag to pan" : `${t.label}: Esc to stop`;
  }

  private toast(msg: string, bad = false): void {
    const el = this.root.querySelector<HTMLElement>("#mb-toast");
    if (!el) return;
    el.textContent = msg;
    el.className = `mb-toast show ${bad ? "bad" : ""}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (el.className = "mb-toast"), 3500);
  }

  // ---------- new / open dialog ----------

  private showDialog(): void {
    const el = this.root.querySelector<HTMLElement>("#mb-dialog")!;
    const custom = listCustomMaps();
    const row = (m: MapDef, own: boolean) => `
      <li class="mb-maprow">
        <canvas class="mb-thumb" data-thumb="${esc(m.id)}" data-own="${own ? 1 : 0}" width="120" height="${m.mode === "assault" ? 66 : 120}"></canvas>
        <div class="mb-mapinfo"><b>${esc(m.name)}</b> <span class="chip">${MODES[m.mode].name}</span><br/><span class="hint">${esc(m.blurb || "")}</span></div>
        <div class="mb-row">
          ${own ? `<button data-edit="${esc(m.id)}">Edit</button>` : ""}
          <button class="secondary" data-dup="${esc(m.id)}" data-own="${own ? 1 : 0}">Duplicate</button>
          ${own ? `<button class="mb-danger" data-del="${esc(m.id)}">Delete</button>` : ""}
        </div>
      </li>`;
    el.innerHTML = `
      <div class="modal mb-dialog" role="dialog" aria-modal="true" aria-labelledby="mb-dlg-title">
        <h1 id="mb-dlg-title">Map builder</h1>
        <p class="tagline">Build your own battlefields. Start from a blank board, or copy a map you like and change it.</p>
        <h3>New blank board</h3>
        <div class="mb-row">
          ${(Object.keys(MODES) as ModeId[])
            .map((id) => `<button class="mb-new" data-new="${id}"><b>${MODES[id].name}</b><br/><span class="hint">${MODES[id].width}" × ${MODES[id].height}"</span></button>`)
            .join("")}
          <button class="secondary mb-new" id="mb-dlg-import"><b>Import</b><br/><span class="hint">from a .json file</span></button>
        </div>
        <h3>Your maps</h3>
        ${custom.length ? `<ul class="mb-maplist">${custom.map((m) => row(m, true)).join("")}</ul>` : `<p class="hint">No saved maps yet.</p>`}
        <h3>Built-in maps</h3>
        <ul class="mb-maplist">${Object.values(MAPS).map((m) => row(m, false)).join("")}</ul>
        <div class="mb-row" style="justify-content:flex-end"><button class="secondary" id="mb-dlg-cancel">Keep editing</button></div>
      </div>`;
    el.hidden = false;
    const find = (id: string, own: boolean) => (own ? custom.find((m) => m.id === id) : MAPS[id]);
    el.querySelectorAll<HTMLCanvasElement>("canvas[data-thumb]").forEach((c) => {
      const m = find(c.dataset.thumb!, c.dataset.own === "1");
      const ctx = c.getContext("2d");
      if (!m || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = c.width;
      const h = c.height;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      c.width = w * dpr;
      c.height = h * dpr;
      drawMap(ctx, m, fitView(m, w, h, dpr, 2));
    });
    el.querySelectorAll<HTMLButtonElement>("[data-new]").forEach(
      (b) =>
        (b.onclick = () => {
          if (!this.confirmDiscard()) return;
          this.setMap(blankMap(b.dataset.new as ModeId), "");
          this.hideDialog();
        }),
    );
    el.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach(
      (b) =>
        (b.onclick = () => {
          const m = find(b.dataset.edit!, true);
          if (!m || !this.confirmDiscard()) return;
          this.setMap(m, JSON.stringify(cleanMap(m)));
          this.hideDialog();
        }),
    );
    el.querySelectorAll<HTMLButtonElement>("[data-dup]").forEach(
      (b) =>
        (b.onclick = () => {
          const m = find(b.dataset.dup!, b.dataset.own === "1");
          if (!m || !this.confirmDiscard()) return;
          this.setMap(duplicateMap(m), "");
          this.hideDialog();
          this.toast(`Copied "${m.name}". Save to add it to your maps.`);
        }),
    );
    el.querySelectorAll<HTMLButtonElement>("[data-del]").forEach(
      (b) =>
        (b.onclick = () => {
          const m = find(b.dataset.del!, true);
          if (!m || !window.confirm(`Delete "${m.name}" from your maps? This can't be undone.`)) return;
          deleteCustomMap(m.id);
          if (m.id === this.map.id) this.savedJson = "";
          this.refresh();
          this.showDialog();
        }),
    );
    el.querySelector<HTMLButtonElement>("#mb-dlg-import")!.onclick = () => void this.importFile();
    el.querySelector<HTMLButtonElement>("#mb-dlg-cancel")!.onclick = () => this.hideDialog();
    el.onclick = (e) => {
      if (e.target === el) this.hideDialog();
    };
    el.querySelector<HTMLButtonElement>("[data-new]")?.focus();
  }

  private hideDialog(): void {
    const el = this.root.querySelector<HTMLElement>("#mb-dialog");
    if (!el) return;
    el.hidden = true;
    el.innerHTML = "";
    this.canvas.focus({ preventScroll: true });
  }
}
