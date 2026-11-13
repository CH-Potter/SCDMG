// Pixi renderer. Everything inside `board` is drawn in inches; the container is scaled to fit.

import { Application, Container, Graphics, Text, type FederatedPointerEvent } from "pixi.js";
import { FACTIONS } from "../engine/data/factions";
import { dist, polygonCentroid } from "../engine/geometry";
import { isFlying, profileOf } from "../engine/profile";
import { aliveModels, presenceController } from "../engine/rules";
import type { AccessPoint, GameState, Model, PlayerId, Terrain, Unit, Vec } from "../engine/types";

export const INK = 0x2b2140;
export const PLAYER_COLORS: Record<PlayerId, number> = { 0: 0x2fb5c8, 1: 0xf0565b };
const ACCENT = 0xffc83d;
const MARGIN = 1.2;
const FLY_LIFT = 0.8;

export interface Ghost {
  pos: Vec;
  radius: number;
}

export interface RenderView {
  state: GameState;
  selected: string | null;
  leader: number | null;
  moveRing: { center: Vec; radius: number } | null;
  ghosts: Ghost[];
  ghostOk: boolean;
  path: Vec[] | null;
  targets: { uid: string; ok: boolean }[];
  sightLines: { from: Vec; to: Vec; ok: boolean }[];
  friendlyMarks: string[];
  zone: Vec[][] | null;
  blast: { center: Vec; radius: number } | null;
}

interface ModelView {
  root: Container;
  gfx: Graphics;
  target: Vec;
}

export class BoardRenderer {
  readonly app = new Application();
  private board = new Container();
  private staticLayer = new Graphics();
  private objectiveLayer = new Graphics();
  private labelLayer = new Container();
  private overlayLayer = new Graphics();
  private modelLayer = new Container();
  private topOverlay = new Graphics();
  private fxLayer = new Container();
  private models = new Map<string, ModelView>();
  private labels: Text[] = [];
  private ppi = 20;
  private lastState: GameState | null = null;

  onPointerMove: (p: Vec) => void = () => {};
  onPointerDown: (p: Vec) => void = () => {};
  onPointerLeave: () => void = () => {};

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      background: "#3d2f52",
      resizeTo: host,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
    });
    host.appendChild(this.app.canvas);
    this.board.addChild(
      this.staticLayer,
      this.objectiveLayer,
      this.labelLayer,
      this.overlayLayer,
      this.modelLayer,
      this.topOverlay,
      this.fxLayer,
    );
    this.app.stage.addChild(this.board);
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointermove", (e: FederatedPointerEvent) => {
      // Pixi reports moves anywhere on the page; only react over the canvas itself.
      const { x, y } = e.global;
      if (x < 0 || y < 0 || x > this.app.screen.width || y > this.app.screen.height) return;
      this.onPointerMove(this.toBoard(e));
    });
    this.app.stage.on("pointerdown", (e: FederatedPointerEvent) => this.onPointerDown(this.toBoard(e)));
    this.app.stage.on("pointerleave", () => this.onPointerLeave());
    this.app.renderer.on("resize", () => this.layout());
    // Pixi only watches window resizes; also follow the stage element's own size changes.
    new ResizeObserver(() => this.app.resize()).observe(host);
    this.app.ticker.add((t) => this.tick(t.deltaMS));
  }

  private toBoard(e: FederatedPointerEvent): Vec {
    const p = this.board.toLocal(e.global);
    return { x: p.x, y: p.y };
  }

  toScreen(p: Vec): Vec {
    const g = this.board.toGlobal(p);
    return { x: g.x, y: g.y };
  }

  private layout(): void {
    if (!this.lastState) return;
    const { width, height } = this.lastState.board;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.ppi = Math.max(4, Math.min(sw / (width + MARGIN * 2), sh / (height + MARGIN * 2)));
    this.board.scale.set(this.ppi);
    this.board.position.set((sw - width * this.ppi) / 2, (sh - height * this.ppi) / 2);
    this.app.stage.hitArea = this.app.screen;
    for (const t of this.labels) t.scale.set(1 / this.ppi);
  }

  reset(): void {
    this.lastState = null;
    for (const v of this.models.values()) v.root.destroy({ children: true });
    this.models.clear();
    this.fxLayer.removeChildren();
    this.labelLayer.removeChildren().forEach((c) => c.destroy());
    this.labels = [];
  }

  render(view: RenderView): void {
    const first = this.lastState === null;
    this.lastState = view.state;
    if (first) {
      this.drawStatic(view.state);
      this.layout();
    }
    this.drawObjectives(view.state);
    this.drawOverlay(view);
    this.syncModels(view);
  }

  private label(text: string, pos: Vec, size = 15, color = 0xffffff): Text {
    const t = new Text({
      text,
      style: { fontFamily: "Baloo 2, Trebuchet MS, sans-serif", fontSize: size * 2, fontWeight: "800", fill: color, stroke: { color: INK, width: 6 } },
    });
    t.anchor.set(0.5);
    t.position.set(pos.x, pos.y);
    t.scale.set(1 / this.ppi);
    t.resolution = 1;
    this.labelLayer.addChild(t);
    this.labels.push(t);
    return t;
  }

  // ---------- static board ----------

  private drawStatic(s: GameState): void {
    const g = this.staticLayer.clear();
    const { width: w, height: h } = s.board;
    g.roundRect(-MARGIN, -MARGIN, w + MARGIN * 2, h + MARGIN * 2, 1).fill(0x5a3f2e).stroke({ width: 0.15, color: INK });
    g.rect(0, 0, w, h).fill(0xf0d39a).stroke({ width: 0.12, color: INK });
    for (const p of [0, 1] as const) {
      for (const poly of s.spawn[p]) g.poly(flat(poly)).fill({ color: PLAYER_COLORS[p], alpha: 0.13 });
    }
    for (let x = 6; x < w; x += 6) g.moveTo(x, 0).lineTo(x, h);
    for (let y = 6; y < h; y += 6) g.moveTo(0, y).lineTo(w, y);
    g.stroke({ width: 0.04, color: 0xc9a46a, alpha: 0.7 });
    for (let i = 0; i < 140; i++) {
      const x = (i * 7.31) % w;
      const y = (i * 13.17 + (i % 5) * 3.3) % h;
      g.circle(x, y, 0.08 + (i % 3) * 0.04).fill({ color: 0xc9a46a, alpha: 0.55 });
    }
    const ground = s.terrain.filter((t) => t.level === 0 && t.kind !== "platform" && t.kind !== "building");
    const platforms = s.terrain.filter((t) => t.kind === "platform");
    const raised = s.terrain.filter((t) => t.level === 1);
    const buildings = s.terrain.filter((t) => t.kind === "building");
    for (const t of ground) drawFeature(g, t);
    for (const a of s.access.filter((x) => x.kind === "ramp")) drawAccess(g, a);
    for (const t of platforms) drawPlatform(g, t);
    for (const a of s.access.filter((x) => x.kind === "ladder")) drawAccess(g, a);
    for (const t of raised) drawFeature(g, t);
    for (const t of buildings) drawBuilding(g, t);
    for (const o of s.objectives) this.label(String(o.number), { x: o.pos.x, y: o.pos.y + 0.05 }, 15);
  }

  private drawObjectives(s: GameState): void {
    const g = this.objectiveLayer.clear();
    for (const o of s.objectives) {
      const c = o.controller ?? presenceController(s, o);
      const color = c === null ? 0xffffff : PLAYER_COLORS[c];
      g.circle(o.pos.x, o.pos.y, o.radius).fill({ color, alpha: 0.16 }).stroke({ width: 0.12, color, alpha: 0.95 });
      if (o.team !== null) {
        g.circle(o.pos.x, o.pos.y, o.radius + 0.3).stroke({ width: 0.12, color: PLAYER_COLORS[o.team], alpha: 0.9 });
      }
      g.circle(o.pos.x, o.pos.y, 0.6).fill(o.team === null ? 0xffffff : PLAYER_COLORS[o.team]).stroke({ width: 0.08, color: INK });
    }
    for (const f of s.flags) {
      const p = f.pos;
      g.circle(p.x + 0.9, p.y - 0.6, 0.55).fill(0xd99a4e).stroke({ width: 0.08, color: INK });
      for (const [dx, dy] of [[-0.2, -0.15], [0.15, 0.1], [-0.05, 0.25]] as const) {
        g.circle(p.x + 0.9 + dx, p.y - 0.6 + dy, 0.08).fill(0x5a3418);
      }
      g.circle(p.x + 0.9, p.y - 0.6, 0.7).stroke({ width: 0.1, color: PLAYER_COLORS[f.team] });
    }
  }

  // ---------- overlays ----------

  private drawOverlay(v: RenderView): void {
    const g = this.overlayLayer.clear();
    const top = this.topOverlay.clear();
    if (v.zone) for (const poly of v.zone) g.poly(flat(poly)).fill({ color: 0xffffff, alpha: 0.18 }).stroke({ width: 0.1, color: 0xffffff });
    if (v.moveRing) {
      g.circle(v.moveRing.center.x, v.moveRing.center.y, v.moveRing.radius)
        .fill({ color: 0xffffff, alpha: 0.08 })
        .stroke({ width: 0.08, color: 0xffffff, alpha: 0.8 });
    }
    if (v.blast) {
      g.circle(v.blast.center.x, v.blast.center.y, v.blast.radius).fill({ color: 0xff8a3d, alpha: 0.3 }).stroke({ width: 0.1, color: 0xff8a3d });
    }
    if (v.path && v.path.length > 1) {
      g.moveTo(v.path[0]!.x, v.path[0]!.y);
      for (const p of v.path.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({ width: 0.08, color: v.ghostOk ? 0x3fa34d : 0xd9443f, alpha: 0.9 });
    }
    const color = v.ghostOk ? 0x3fa34d : 0xd9443f;
    for (const gh of v.ghosts) top.circle(gh.pos.x, gh.pos.y, gh.radius).fill({ color, alpha: 0.3 }).stroke({ width: 0.08, color });
    for (const l of v.sightLines) {
      top.moveTo(l.from.x, l.from.y).lineTo(l.to.x, l.to.y).stroke({ width: 0.07, color: l.ok ? 0x3fa34d : 0xd9443f, alpha: 0.85 });
    }
    for (const t of v.targets) {
      const u = v.state.units.find((x) => x.uid === t.uid);
      if (!u) continue;
      for (const m of aliveModels(u)) {
        const p = drawPos(u, m);
        top.circle(p.x, p.y, profileOf(u).baseRadius + 0.3).stroke({ width: 0.1, color: t.ok ? 0x3fa34d : 0xd9443f, alpha: t.ok ? 1 : 0.45 });
      }
    }
    for (const uid of v.friendlyMarks) {
      const u = v.state.units.find((x) => x.uid === uid);
      if (!u) continue;
      for (const m of aliveModels(u)) {
        const p = drawPos(u, m);
        top.circle(p.x, p.y, profileOf(u).baseRadius + 0.3).stroke({ width: 0.1, color: 0x7fe7ff });
      }
    }
  }

  // ---------- models ----------

  private syncModels(v: RenderView): void {
    const s = v.state;
    const seen = new Set<string>();
    const ordered = [...s.units].sort((a, b) => layerOf(a) - layerOf(b));
    for (const u of ordered) {
      for (const m of u.models) {
        const key = `${u.uid}:${m.id}`;
        let view = this.models.get(key);
        const visible = u.onBoard && m.alive;
        if (!view) {
          if (!visible) continue;
          const root = new Container();
          const gfx = new Graphics();
          root.addChild(gfx);
          root.position.set(m.pos.x, m.pos.y);
          this.modelLayer.addChild(root);
          view = { root, gfx, target: { ...m.pos } };
          this.models.set(key, view);
        }
        seen.add(key);
        const wasVisible = view.root.visible;
        view.root.visible = visible;
        if (!visible) continue;
        if (!wasVisible) view.root.position.set(m.pos.x, m.pos.y);
        view.target = { ...m.pos };
        this.modelLayer.addChild(view.root); // keep draw order: ground, platform, air
        this.drawModel(view.gfx, s, u, m, v.selected === u.uid, v.selected === u.uid && v.leader === m.id);
      }
    }
    for (const [k, view] of this.models) if (!seen.has(k)) view.root.visible = false;
  }

  private drawModel(g: Graphics, s: GameState, u: Unit, m: Model, selected: boolean, leader: boolean): void {
    const p = profileOf(u);
    const r = p.baseRadius;
    const faction = FACTIONS[p.faction];
    const flying = isFlying(u);
    const lift = flying ? FLY_LIFT : 0;
    g.clear();
    g.alpha = u.status.acted && !s.over ? 0.6 : 1;

    // Shadow on the ground (further away for flyers and for models up on platforms)
    g.ellipse(flying ? 0.25 : 0.12, flying ? 0.35 : m.elevation ? 0.3 : 0.2, r + 0.05, r * 0.9).fill({ color: INK, alpha: flying ? 0.22 : 0.3 });
    if (selected) g.circle(0, -lift, r + 0.35).fill({ color: ACCENT, alpha: 0.3 }).stroke({ width: 0.09, color: ACCENT });
    if (u.status.hunkered) {
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * 0.1 + (i / 5) * Math.PI * 0.8;
        g.ellipse(Math.cos(a) * (r + 0.2), Math.sin(a) * (r + 0.2), 0.22, 0.14).fill(0xb08a55).stroke({ width: 0.04, color: INK });
      }
    }
    if (flying) {
      for (const side of [-1, 1]) {
        g.ellipse(side * (r + 0.15), -lift - r * 0.2, r * 0.55, r * 0.25).fill({ color: 0xffffff, alpha: 0.85 }).stroke({ width: 0.05, color: INK });
      }
    }
    g.circle(0, -lift, r + 0.1).fill(PLAYER_COLORS[u.owner]).stroke({ width: 0.06, color: INK });
    g.circle(0, -lift, r).fill(faction.color).stroke({ width: 0.07, color: INK });
    g.ellipse(-r * 0.3, -lift - r * 0.4, r * 0.35, r * 0.18).fill({ color: 0xffffff, alpha: 0.45 });

    if (p.faction === "militia") {
      g.roundRect(-r * 0.7, -lift - r * 1.02, r * 1.4, r * 0.42, r * 0.15).fill(0x8b5a2b).stroke({ width: 0.05, color: INK });
      g.roundRect(-r * 0.95, -lift - r * 0.66, r * 1.9, r * 0.14, r * 0.07).fill(0x6b4320).stroke({ width: 0.04, color: INK });
    } else if (p.faction === "munch") {
      const n = 4;
      const tw = (r * 1.1) / n;
      for (let i = 0; i < n; i++) {
        const x = -r * 0.55 + i * tw;
        g.poly([x, -lift + r * 0.3, x + tw / 2, -lift + r * 0.62, x + tw, -lift + r * 0.3]).fill(0xffffff).stroke({ width: 0.03, color: INK });
      }
    } else {
      g.poly([0, -lift - r * 1.25, r * 0.28, -lift - r * 0.85, 0, -lift - r * 0.5, -r * 0.28, -lift - r * 0.85])
        .fill(0xe9fbff)
        .stroke({ width: 0.05, color: INK });
    }

    // Googly eyes look at the nearest enemy model
    let look = { x: 0, y: u.owner === 0 ? -1 : 1 };
    let best = Infinity;
    for (const e of s.units) {
      if (e.owner === u.owner || !e.onBoard) continue;
      for (const em of aliveModels(e)) {
        const d = dist(em.pos, m.pos);
        if (d < best && d > 0) {
          best = d;
          look = { x: (em.pos.x - m.pos.x) / d, y: (em.pos.y - m.pos.y) / d };
        }
      }
    }
    for (const side of [-1, 1]) {
      const ex = side * r * 0.32;
      const ey = -lift - r * 0.08;
      g.circle(ex, ey, r * 0.27).fill(0xffffff).stroke({ width: 0.04, color: INK });
      g.circle(ex + look.x * r * 0.11, ey + look.y * r * 0.11, r * 0.12).fill(INK);
    }
    if (m.shield > 0) g.circle(0, -lift, r + 0.25).stroke({ width: 0.07, color: 0x7fe7ff, alpha: 0.9 });
    if (leader) g.star(0, -lift - r - 0.35, 5, 0.32, 0.15).fill(ACCENT).stroke({ width: 0.05, color: INK });

    const total = p.hp + p.shield;
    if (total > 1) {
      const bw = Math.max(r * 2, total * 0.26);
      const pw = bw / total;
      const by = -lift + r + 0.28;
      g.roundRect(-bw / 2 - 0.05, by - 0.05, bw + 0.1, 0.28, 0.08).fill(INK);
      for (let i = 0; i < total; i++) {
        const isShield = i >= p.hp;
        const filled = isShield ? i - p.hp < m.shield : i < m.hp;
        g.rect(-bw / 2 + i * pw + 0.025, by, pw - 0.05, 0.18).fill(filled ? (isShield ? 0x7fe7ff : 0x6fdc6a) : 0x4a3c5e);
      }
    }
  }

  // ---------- effects ----------

  floatText(pos: Vec, text: string, color = 0xffffff): void {
    const t = new Text({
      text,
      style: { fontFamily: "Baloo 2, Trebuchet MS, sans-serif", fontSize: 22, fontWeight: "800", fill: color, stroke: { color: INK, width: 5 } },
    });
    t.anchor.set(0.5);
    t.scale.set(1 / this.ppi);
    t.position.set(pos.x, pos.y - 1.5);
    this.fxLayer.addChild(t);
    const start = performance.now();
    const step = () => {
      const k = (performance.now() - start) / 1200;
      t.position.y = pos.y - 1.5 - k * 1.6;
      t.alpha = 1 - Math.max(0, k - 0.6) / 0.4;
      if (k >= 1) {
        this.app.ticker.remove(step);
        t.destroy();
      }
    };
    this.app.ticker.add(step);
  }

  private tick(dt: number): void {
    const k = 1 - Math.pow(0.001, dt / 300);
    const now = performance.now();
    for (const v of this.models.values()) {
      const dx = v.target.x - v.root.x;
      const dy = v.target.y - v.root.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.001) {
        v.root.x += dx * k;
        v.root.y += dy * k;
      }
      const moving = Math.abs(dx) + Math.abs(dy) > 0.05;
      v.root.scale.set(moving ? 1 + 0.06 * Math.sin(now / 50) : 1);
    }
  }
}

// ---------- drawing helpers ----------

const flat = (poly: Vec[]): number[] => poly.flatMap((p) => [p.x, p.y]);

const layerOf = (u: Unit): number => (isFlying(u) ? 2 : (u.models.find((m) => m.alive)?.elevation ?? 0));

export const drawPos = (u: Unit, m: Model): Vec => (isFlying(u) ? { x: m.pos.x, y: m.pos.y - FLY_LIFT } : m.pos);

function bbox(poly: Vec[]): [number, number, number, number] {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function drawPlatform(g: Graphics, t: Terrain): void {
  const pts = flat(t.poly);
  g.poly(pts.map((v, i) => v + (i % 2 ? 0.7 : 0.5))).fill({ color: INK, alpha: 0.35 });
  g.poly(pts).fill(0xb98f5c).stroke({ width: 0.16, color: INK });
  const [x0, y0, x1, y1] = bbox(t.poly);
  g.rect(x0 + 0.3, y0 + 0.3, x1 - x0 - 0.6, y1 - y0 - 0.6).fill(0xd9b07a);
  for (let y = y0 + 1; y < y1 - 0.3; y += 1) g.moveTo(x0 + 0.3, y).lineTo(x1 - 0.3, y);
  g.stroke({ width: 0.04, color: 0xa87f4c, alpha: 0.8 });
  // Cliff edge on the "front" (bottom) side for a raised look
  g.rect(x0, y1 - 0.25, x1 - x0, 0.25).fill(0x8a6640);
}

function drawBuilding(g: Graphics, t: Terrain): void {
  const pts = flat(t.poly);
  g.poly(pts.map((v, i) => v + (i % 2 ? 1 : 0.7))).fill({ color: INK, alpha: 0.35 });
  g.poly(pts).fill(0x8d6e5a).stroke({ width: 0.16, color: INK });
  const c = polygonCentroid(t.poly);
  g.poly(t.poly.flatMap((p) => [c.x + (p.x - c.x) * 0.75, c.y + (p.y - c.y) * 0.75])).fill(0xa4806a).stroke({ width: 0.06, color: INK, alpha: 0.6 });
  g.circle(c.x, c.y, 0.25).fill(0x6e5443);
}

function drawFeature(g: Graphics, t: Terrain): void {
  const pts = flat(t.poly);
  const [x0, y0, x1, y1] = bbox(t.poly);
  if (t.kind === "wall") {
    g.poly(pts.map((v, i) => v + (i % 2 ? 0.35 : 0.25))).fill({ color: INK, alpha: 0.3 });
    g.poly(pts).fill(0x7d7189).stroke({ width: 0.12, color: INK });
    g.rect(x0 + 0.1, y0 + 0.1, Math.max(0, x1 - x0 - 0.2), Math.min(0.3, (y1 - y0) / 3)).fill({ color: 0xffffff, alpha: 0.2 });
  } else if (t.kind === "barricade") {
    g.poly(pts).fill(0xb0844f).stroke({ width: 0.1, color: INK });
    for (let x = x0 + 0.6; x < x1 - 0.2; x += 0.8) g.moveTo(x, y0).lineTo(x, y1);
    g.stroke({ width: 0.05, color: 0x7d5a31 });
  } else if (t.kind === "cover") {
    const c = polygonCentroid(t.poly);
    if (t.id.startsWith("crater") || t.id.startsWith("rubble")) {
      g.poly(pts).fill(0xd2ab6e).stroke({ width: 0.1, color: INK });
      const r = dist(c, t.poly[0]!);
      g.circle(c.x, c.y, r * 0.6).fill(0xb8915a);
      g.circle(c.x - r * 0.15, c.y - r * 0.15, r * 0.25).fill({ color: 0xffffff, alpha: 0.2 });
    } else if (t.id.startsWith("pond")) {
      g.poly(pts).fill(0x7cc4d9).stroke({ width: 0.1, color: INK });
      g.ellipse(c.x - 0.5, c.y - 0.4, 0.8, 0.25).fill({ color: 0xffffff, alpha: 0.5 });
    } else if (t.id.startsWith("tarp")) {
      g.poly(pts).fill(0x6c8fc7).stroke({ width: 0.1, color: INK });
      g.moveTo(x0, y0).lineTo(x1, y1).moveTo(x1, y0).lineTo(x0, y1).stroke({ width: 0.05, color: 0x4a6a9e });
    } else {
      g.poly(pts).fill({ color: 0x8dbf4f, alpha: 0.85 }).stroke({ width: 0.1, color: INK });
      for (let x = x0 + 0.6; x < x1; x += 1.1) {
        for (let y = y0 + 0.6; y < y1; y += 1.1) g.circle(x, y, 0.42).fill(0x5e9a3a).stroke({ width: 0.05, color: INK });
      }
    }
  }
}

function drawAccess(g: Graphics, a: AccessPoint): void {
  const dx = a.high.x - a.low.x;
  const dy = a.high.y - a.low.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  // Extend slightly past the high point so it meets the deck
  const hi = { x: a.high.x + (dx / len) * 0.4, y: a.high.y + (dy / len) * 0.4 };
  if (a.kind === "ramp") {
    const w = 1.1;
    g.poly([a.low.x + nx * w, a.low.y + ny * w, hi.x + nx * w, hi.y + ny * w, hi.x - nx * w, hi.y - ny * w, a.low.x - nx * w, a.low.y - ny * w])
      .fill(0xc49a63)
      .stroke({ width: 0.1, color: INK });
    for (let t = 0.2; t < 1; t += 0.2) {
      const p = { x: a.low.x + (hi.x - a.low.x) * t, y: a.low.y + (hi.y - a.low.y) * t };
      g.moveTo(p.x + nx * w, p.y + ny * w).lineTo(p.x - nx * w, p.y - ny * w);
    }
    g.stroke({ width: 0.05, color: 0x8a6640 });
  } else {
    const w = 0.45;
    for (const side of [-1, 1]) g.moveTo(a.low.x + nx * w * side, a.low.y + ny * w * side).lineTo(hi.x + nx * w * side, hi.y + ny * w * side);
    g.stroke({ width: 0.12, color: 0x6b4320 });
    for (let t = 0.1; t < 1; t += 0.18) {
      const p = { x: a.low.x + (hi.x - a.low.x) * t, y: a.low.y + (hi.y - a.low.y) * t };
      g.moveTo(p.x + nx * w, p.y + ny * w).lineTo(p.x - nx * w, p.y - ny * w);
    }
    g.stroke({ width: 0.08, color: 0x8b5a2b });
  }
}
