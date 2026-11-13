// Pixi renderer. Everything inside `board` is drawn in inches; the container is scaled to fit.

import { Application, Container, Graphics, Text, type FederatedPointerEvent } from "pixi.js";
import { FACTIONS, profileOf } from "../engine/data/factions";
import { dist } from "../engine/geometry";
import { enemiesOf, objectiveControl } from "../engine/rules";
import type { GameState, PlayerId, Unit, Vec } from "../engine/types";

export const INK = 0x2b2140;
export const PLAYER_COLORS: Record<PlayerId, number> = { 0: 0x2fb5c8, 1: 0xf0565b };
const ACCENT = 0xffc83d;
const MARGIN = 1.2; // inches of frame around the board

export interface RenderView {
  state: GameState;
  selected: string | null;
  moveRing: { center: Vec; radius: number } | null;
  ghost: { pos: Vec; radius: number; ok: boolean } | null;
  targets: { uid: string; ok: boolean }[];
  losLine: { from: Vec; to: Vec; ok: boolean } | null;
  heals: string[];
}

interface UnitView {
  root: Container;
  gfx: Graphics;
  target: Vec;
}

export class BoardRenderer {
  readonly app = new Application();
  private board = new Container();
  private staticLayer = new Graphics();
  private objectiveLayer = new Graphics();
  private overlayLayer = new Graphics();
  private unitLayer = new Container();
  private fxLayer = new Container();
  private units = new Map<string, UnitView>();
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
    this.board.addChild(this.staticLayer, this.objectiveLayer, this.overlayLayer, this.unitLayer, this.fxLayer);
    this.app.stage.addChild(this.board);
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointermove", (e: FederatedPointerEvent) => this.onPointerMove(this.toBoard(e)));
    this.app.stage.on("pointerdown", (e: FederatedPointerEvent) => this.onPointerDown(this.toBoard(e)));
    this.app.stage.on("pointerleave", () => this.onPointerLeave());
    this.app.renderer.on("resize", () => this.layout());
    this.app.ticker.add((t) => this.tick(t.deltaMS));
  }

  private toBoard(e: FederatedPointerEvent): Vec {
    const p = this.board.toLocal(e.global);
    return { x: p.x, y: p.y };
  }

  /** Board inches -> CSS pixels relative to the canvas. */
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
  }

  setState(state: GameState): void {
    const first = this.lastState === null;
    this.lastState = state;
    if (first) {
      this.drawStatic(state);
      this.layout();
    }
  }

  reset(): void {
    this.lastState = null;
    for (const v of this.units.values()) v.root.destroy({ children: true });
    this.units.clear();
    this.fxLayer.removeChildren();
  }

  render(view: RenderView): void {
    this.setState(view.state);
    this.drawObjectives(view.state);
    this.drawOverlay(view);
    this.syncUnits(view);
  }

  // ---------- static board ----------

  private drawStatic(s: GameState): void {
    const g = this.staticLayer.clear();
    const { width: w, height: h } = s.board;
    // Table frame
    g.roundRect(-MARGIN, -MARGIN, w + MARGIN * 2, h + MARGIN * 2, 1).fill(0x5a3f2e).stroke({ width: 0.15, color: INK });
    g.rect(0, 0, w, h).fill(0xf0d39a).stroke({ width: 0.12, color: INK });
    // Deployment bands
    g.rect(0, 30, w, 6).fill({ color: PLAYER_COLORS[0], alpha: 0.12 });
    g.rect(0, 0, w, 6).fill({ color: PLAYER_COLORS[1], alpha: 0.12 });
    // 6" grid
    for (let x = 6; x < w; x += 6) g.moveTo(x, 0).lineTo(x, h);
    for (let y = 6; y < h; y += 6) g.moveTo(0, y).lineTo(w, y);
    g.stroke({ width: 0.04, color: 0xc9a46a, alpha: 0.7 });
    // Dusty speckles (deterministic)
    for (let i = 0; i < 140; i++) {
      const x = (i * 7.31) % w;
      const y = (i * 13.17 + (i % 5) * 3.3) % h;
      g.circle(x, y, 0.08 + (i % 3) * 0.04).fill({ color: 0xc9a46a, alpha: 0.55 });
    }
    for (const t of s.terrain) {
      const pts = t.poly.flatMap((p) => [p.x, p.y]);
      if (t.kind === "blocking") {
        g.poly(pts.map((v, i) => v + (i % 2 ? 0.35 : 0.25))).fill({ color: INK, alpha: 0.3 });
        g.poly(pts).fill(0x9c7b63).stroke({ width: 0.14, color: INK });
        // Cartoon rivets/planks
        const xs = t.poly.map((p) => p.x);
        const ys = t.poly.map((p) => p.y);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        g.rect(x0 + 0.35, y0 + 0.35, x1 - x0 - 0.7, Math.min(0.5, (y1 - y0) / 4)).fill({ color: 0xffffff, alpha: 0.25 });
        for (let x = x0 + 0.6; x < x1 - 0.3; x += 1.2) {
          g.circle(x, y1 - 0.4, 0.12).fill(0x6e5443);
        }
      } else if (t.id.startsWith("scrub")) {
        g.poly(pts).fill({ color: 0x8dbf4f, alpha: 0.85 }).stroke({ width: 0.1, color: INK });
        const xs = t.poly.map((p) => p.x);
        const ys = t.poly.map((p) => p.y);
        for (let x = Math.min(...xs) + 0.6; x < Math.max(...xs); x += 1.1) {
          for (let y = Math.min(...ys) + 0.6; y < Math.max(...ys); y += 1.1) {
            g.circle(x, y, 0.42).fill(0x5e9a3a).stroke({ width: 0.06, color: INK });
          }
        }
      } else {
        g.poly(pts).fill(0xd2ab6e).stroke({ width: 0.1, color: INK });
        const c = t.poly.reduce((a, p) => ({ x: a.x + p.x / t.poly.length, y: a.y + p.y / t.poly.length }), { x: 0, y: 0 });
        const r = dist(c, t.poly[0]!);
        g.circle(c.x, c.y, r * 0.6).fill(0xb8915a);
        g.circle(c.x - r * 0.15, c.y - r * 0.15, r * 0.25).fill({ color: 0xffffff, alpha: 0.2 });
      }
    }
  }

  private drawObjectives(s: GameState): void {
    const g = this.objectiveLayer.clear();
    const control = objectiveControl(s);
    s.objectives.forEach((o, i) => {
      const c = control[i];
      const color = c === null || c === undefined ? 0xffffff : PLAYER_COLORS[c];
      g.circle(o.pos.x, o.pos.y, o.radius).fill({ color, alpha: 0.18 }).stroke({ width: 0.12, color, alpha: 0.95 });
      g.star(o.pos.x, o.pos.y, 5, 0.75, 0.35).fill(color).stroke({ width: 0.08, color: INK });
    });
  }

  // ---------- overlays ----------

  private drawOverlay(v: RenderView): void {
    const g = this.overlayLayer.clear();
    if (v.moveRing) {
      g.circle(v.moveRing.center.x, v.moveRing.center.y, v.moveRing.radius)
        .fill({ color: 0xffffff, alpha: 0.1 })
        .stroke({ width: 0.08, color: 0xffffff, alpha: 0.8 });
    }
    if (v.losLine) {
      g.moveTo(v.losLine.from.x, v.losLine.from.y)
        .lineTo(v.losLine.to.x, v.losLine.to.y)
        .stroke({ width: 0.1, color: v.losLine.ok ? 0x3fa34d : 0xd9443f, alpha: 0.9 });
    }
    if (v.ghost) {
      const color = v.ghost.ok ? 0x3fa34d : 0xd9443f;
      g.circle(v.ghost.pos.x, v.ghost.pos.y, v.ghost.radius)
        .fill({ color, alpha: 0.3 })
        .stroke({ width: 0.1, color });
      const sel = v.selected ? v.state.units.find((u) => u.uid === v.selected) : undefined;
      if (sel) g.moveTo(sel.pos.x, sel.pos.y).lineTo(v.ghost.pos.x, v.ghost.pos.y).stroke({ width: 0.06, color, alpha: 0.8 });
    }
    for (const t of v.targets) {
      const u = v.state.units.find((x) => x.uid === t.uid);
      if (!u) continue;
      const r = profileOf(u.profileId).baseRadius + 0.55;
      g.circle(u.pos.x, u.pos.y, r).stroke({ width: 0.14, color: t.ok ? 0x3fa34d : 0xd9443f, alpha: t.ok ? 1 : 0.5 });
    }
    for (const uid of v.heals) {
      const u = v.state.units.find((x) => x.uid === uid);
      if (!u) continue;
      const r = profileOf(u.profileId).baseRadius + 0.55;
      g.circle(u.pos.x, u.pos.y, r).stroke({ width: 0.14, color: 0x7fe7ff });
    }
  }

  // ---------- units ----------

  private syncUnits(v: RenderView): void {
    const s = v.state;
    for (const u of s.units) {
      let view = this.units.get(u.uid);
      if (!view) {
        const root = new Container();
        const gfx = new Graphics();
        root.addChild(gfx);
        root.position.set(u.pos.x, u.pos.y);
        this.unitLayer.addChild(root);
        view = { root, gfx, target: { ...u.pos } };
        this.units.set(u.uid, view);
      }
      view.target = { ...u.pos };
      view.root.visible = u.alive;
      this.drawUnit(view.gfx, s, u, v.selected === u.uid);
    }
  }

  private drawUnit(g: Graphics, s: GameState, u: Unit, selected: boolean): void {
    const p = profileOf(u.profileId);
    const r = p.baseRadius;
    const faction = FACTIONS[p.faction];
    g.clear();
    g.alpha = u.activated && !s.over ? 0.55 : 1;

    if (selected) g.circle(0, 0, r + 0.45).fill({ color: ACCENT, alpha: 0.35 }).stroke({ width: 0.12, color: ACCENT });
    g.ellipse(0.12, 0.2, r + 0.1, r * 0.95).fill({ color: INK, alpha: 0.3 });
    if (u.dugIn) {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * 0.05 + (i / 6) * Math.PI * 0.9;
        g.ellipse(Math.cos(a) * (r + 0.28), Math.sin(a) * (r + 0.28), 0.28, 0.18).fill(0xb08a55).stroke({ width: 0.05, color: INK });
      }
    }
    g.circle(0, 0, r + 0.14).fill(PLAYER_COLORS[u.owner]).stroke({ width: 0.07, color: INK });
    g.circle(0, 0, r).fill(faction.color).stroke({ width: 0.09, color: INK });
    g.ellipse(-r * 0.3, -r * 0.4, r * 0.35, r * 0.18).fill({ color: 0xffffff, alpha: 0.45 });

    // Faction flair
    if (p.faction === "militia") {
      g.roundRect(-r * 0.7, -r * 1.02, r * 1.4, r * 0.42, r * 0.15).fill(0x8b5a2b).stroke({ width: 0.07, color: INK });
      g.roundRect(-r * 0.95, -r * 0.66, r * 1.9, r * 0.14, r * 0.07).fill(0x6b4320).stroke({ width: 0.05, color: INK });
    } else if (p.faction === "munch") {
      const n = 4;
      const tw = (r * 1.1) / n;
      for (let i = 0; i < n; i++) {
        const x = -r * 0.55 + i * tw;
        g.poly([x, r * 0.3, x + tw / 2, r * 0.62, x + tw, r * 0.3]).fill(0xffffff).stroke({ width: 0.04, color: INK });
      }
      g.circle(-r * 0.55, -r * 0.75, r * 0.12).fill(0x3e7d2a);
      g.circle(r * 0.55, -r * 0.75, r * 0.12).fill(0x3e7d2a);
    } else {
      g.poly([0, -r * 1.25, r * 0.28, -r * 0.85, 0, -r * 0.5, -r * 0.28, -r * 0.85])
        .fill(0xe9fbff)
        .stroke({ width: 0.06, color: INK });
    }

    // Googly eyes that look at the nearest enemy
    const enemies = enemiesOf(s, u.owner);
    let look = { x: 0, y: u.owner === 0 ? -1 : 1 };
    if (enemies.length) {
      const e = enemies.reduce((a, b) => (dist(a.pos, u.pos) < dist(b.pos, u.pos) ? a : b));
      const d = dist(e.pos, u.pos) || 1;
      look = { x: (e.pos.x - u.pos.x) / d, y: (e.pos.y - u.pos.y) / d };
    }
    for (const side of [-1, 1]) {
      const ex = side * r * 0.32;
      const ey = -r * 0.08;
      g.circle(ex, ey, r * 0.27).fill(0xffffff).stroke({ width: 0.06, color: INK });
      g.circle(ex + look.x * r * 0.11, ey + look.y * r * 0.11, r * 0.12).fill(INK);
    }

    if (u.shield > 0) g.circle(0, 0, r + 0.32).stroke({ width: 0.08, color: 0x7fe7ff, alpha: 0.9 });

    // Wound pips
    const total = p.hp + p.shield;
    const bw = Math.max(r * 2, total * 0.32);
    const pw = bw / total;
    const by = r + 0.42;
    g.roundRect(-bw / 2 - 0.06, by - 0.06, bw + 0.12, 0.34, 0.1).fill(INK);
    for (let i = 0; i < total; i++) {
      const isShield = i >= p.hp;
      const filled = isShield ? i - p.hp < u.shield : i < u.hp;
      const color = isShield ? 0x7fe7ff : 0x6fdc6a;
      g.rect(-bw / 2 + i * pw + 0.03, by, pw - 0.06, 0.22).fill(filled ? color : 0x4a3c5e);
    }
  }

  // ---------- effects ----------

  floatText(pos: Vec, text: string, color = 0xffffff): void {
    const t = new Text({
      text,
      style: {
        fontFamily: "Baloo 2, Trebuchet MS, sans-serif",
        fontSize: 22,
        fontWeight: "800",
        fill: color,
        stroke: { color: INK, width: 5 },
      },
    });
    t.anchor.set(0.5);
    t.scale.set(1 / this.ppi);
    t.position.set(pos.x, pos.y - 1.5);
    this.fxLayer.addChild(t);
    const start = performance.now();
    const step = () => {
      const k = (performance.now() - start) / 1100;
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
    for (const v of this.units.values()) {
      const dx = v.target.x - v.root.x;
      const dy = v.target.y - v.root.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.001) {
        v.root.x += dx * k;
        v.root.y += dy * k;
      }
      // Hop while moving, for a bit of cartoon bounce.
      const moving = Math.abs(dx) + Math.abs(dy) > 0.05;
      v.root.scale.set(moving ? 1 + 0.06 * Math.sin(performance.now() / 50) : 1);
    }
  }
}
