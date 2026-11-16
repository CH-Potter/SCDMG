// Pixi renderer. Everything inside `board` is drawn in inches; the container is scaled to fit.
//
// Art: the static board (ground + terrain) is painted once in Canvas 2D by `art/terrain` and baked into a
// texture (re-baked only when the zoom changes a lot). Every model is a little painted miniature: a base
// sprite in the owner's colour, a figure sprite from a baked sheet (`art/figures` + `art/textures`), a cast
// shadow made from the figure's own silhouette, a white silhouette for hit flashes, and a muzzle flash.
// Custom units with `profile.art` swap the archetype for a builder figure (`art/miniBuilder`) or a coin
// token showing their uploaded image (`art/coin`); image sheets show a placeholder until they decode.
// Animation is all transforms and frame swaps: idle breathing, hop-walks along routed paths, recoil,
// lunges, flinches, crumpling deaths, hovering/banking flyers, flickering temporary structures.
//
// Performance: each model's HUD/status Graphics are only redrawn when its visual inputs change (owner,
// hp/shield, statuses, ready/spent, selection, leader). Pointer moves only redraw the small overlay layers.
// Effects are driven by diffing the previous and current GameState, sharpened by `RenderView.events`.

import { Application, CanvasSource, Container, Graphics, Matrix, Sprite, Text, Texture } from "pixi.js";
import { SHELL_BURST } from "../engine/constants";
import { factionOf } from "../engine/data/factions";
import { dist } from "../engine/geometry";
import { isFlying, profileOf } from "../engine/profile";
import { aliveModels, modelsEngage, presenceController } from "../engine/rules";
import { planRoute, type ShotMarkKind } from "../engine/terrain";
import type { AttackReport, GameEvent, GameState, Model, Objective, Phase, Unit, UnitProfile, Vec } from "../engine/types";
import { figureSpec, IDLE_BREATH, rotates, type FigureKind, type FigureSpec, type Look } from "./art/figures";
import { makeCanvas } from "./art/ink";
import { paintGround, paintTerrain } from "./art/terrain";
import { baseTex, figureTex, iconTex, refreshLettering, type FigureTex } from "./art/textures";
import { ACCENT, BAD, CLASH, dashCircle, dashLine, dashPoly, drawCoverPip, drawGhost, drawRangeTick, drawShotMark, flat, GOOD, INK, PLAYER_COLORS, SAND_DARK, shade, SHIELD } from "./boardArt";
import { PHASE_NAMES } from "./describe";
import { backOut, Banner, type BannerOpts, easeInOut, easeOut, FONT, FxLayer, Polyline } from "./fx";
import { DropShipFx, drawNoGo, type NoGoRing } from "./fx/dropship";

export { INK, PLAYER_COLORS } from "./boardArt";
import { drawAttackMark, drawExhausted, type AttackMarkView } from "./attackMark";
import { TAP_SLOP_PX } from "./touch";
export type { BannerTone } from "./fx";

const MARGIN = 1.2;
/** How far flyers are drawn above their ground position (also used for hit-testing via drawPos): bigger flyers fly higher. */
const flyLift = (r: number): number => 0.8 + r * 0.6;
/** Models up on a platform are drawn slightly raised. */
const PLAT_LIFT = 0.22;
/** The clickable/aim point sits this far (× base radius) above the base centre, on the figure's body. */
const AIM = 0.35;
/** Base ellipse squash (bases are seen a little from the front). */
const BASE_RY = 0.92;

const PHASE_HINTS: Record<Phase, string> = {
  movement: "Deploy, move or hunker down",
  assault: "Shoot, charge or advance",
  combat: "Engaged units fight. Chargers strike first",
  scoring: "Objectives pay out. Shields recharge",
};

export interface Ghost {
  pos: Vec;
  radius: number;
  /** Cover the model will have there: 2 = full (green shield), 1 = partial (yellow), 0/absent = open. */
  cover?: 0 | 1 | 2;
}

/**
 * An aim or measuring line. `marks` (from `shotLine`) show what the terrain along it does: a red ✕
 * where sight is blocked, an amber shield where the target gets cover, a grey shield where cover is
 * ignored, a green arrow for plunging fire. `rangeT` (0..1) is where the weapon's reach ends: the
 * rest is drawn red, with a tick. `label` is shown beside the line (e.g. the distance).
 */
export interface SightLine {
  from: Vec;
  to: Vec;
  ok: boolean;
  marks?: { t: number; kind: ShotMarkKind }[];
  rangeT?: number;
  label?: string;
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
  sightLines: SightLine[];
  friendlyMarks: string[];
  zone: Vec[][] | null;
  blast: { center: Vec; radius: number } | null;
  /** Optional: how far an indirect shell (and its burst) could reach if it drifts: a dashed ring. */
  drift?: { center: Vec; radius: number };
  /** Optional: red no-go rings (where a support airdrop can't land). */
  noGo?: NoGoRing[];
  /** Optional: the attack being declared or resolved (attacker ring, arrow, target crosshair). See attackMark.ts. */
  attack?: AttackMarkView | null;
  /** Optional: uids of units exhausted from disengaging (an hourglass marker). */
  exhausted?: string[];
  /**
   * Optional: the events produced by the command that created `state`. Only read when `state`
   * changes, so passing the same list on later refreshes is harmless. With it, attack tracers,
   * charges and teleports are exact (including misses and overwatch); without it the renderer
   * infers them from state diffs.
   */
  events?: GameEvent[];
  /**
   * Optional: uids of the active player's units that can still act this phase (e.g. from
   * `eligibleUnits`). Units of the active player not in the list are drawn as spent. Without it,
   * spent means `status.acted`.
   */
  ready?: string[];
}

interface Pulse {
  t: number;
  dur: number;
  dx: number;
  dy: number;
}

interface ModelView {
  uid: string;
  root: Container;
  mini: Container;
  under: Graphics;
  readyRing: Graphics;
  base: Sprite;
  stand: Graphics | null;
  cast: Container;
  castSprite: Sprite;
  fig: Container;
  figSprite: Sprite;
  flash: Sprite;
  muzzle: Sprite;
  fore: Graphics;
  hud: Graphics;
  tag: Sprite;
  mark: Sprite;
  glass: Sprite | null;
  tex: FigureTex;
  spec: FigureSpec;
  kind: FigureKind;
  sig: string;
  r: number;
  flying: boolean;
  structure: boolean;
  temp: boolean;
  lift: number;
  liftTarget: number;
  target: Vec;
  path: Polyline | null;
  pathT: number;
  pathDur: number;
  charging: boolean;
  anim: { kind: "pop" | "ko" | "vanish"; t: number; dur: number } | null;
  face: 1 | -1;
  faceTarget: 1 | -1;
  /** Whether this figure turns to face things (structures mostly don't). */
  turns: boolean;
  frame: number;
  seed: number;
  bank: number;
  recoil: Pulse | null;
  lunge: Pulse | null;
  flinch: Pulse | null;
  shaken: boolean;
  hunkered: boolean;
  spent: boolean;
  ready: boolean;
  /** Nothing to animate (reduced motion only): tick skips it. */
  idle: boolean;
}

interface ObjectiveView {
  base: Graphics;
  spin: Graphics;
  color: number | null;
  from: number | null;
  t: number;
  o: Objective;
}

function lookOf(p: UnitProfile): { color: number; look: Look } {
  try {
    const f = factionOf(p.faction);
    return { color: f.color, look: f.look ?? "plain" };
  } catch {
    return { color: 0xb8b0c8, look: "plain" };
  }
}

const liftOf = (u: Unit, m: Model): number => (isFlying(u) ? flyLift(profileOf(u).baseRadius) : m.elevation === 1 ? PLAT_LIFT : 0);

/** Where a model is drawn (the figure's body, not its shadow). The controller hit-tests against this. */
export const drawPos = (u: Unit, m: Model): Vec => {
  const l = liftOf(u, m) + AIM * profileOf(u).baseRadius;
  return { x: m.pos.x, y: m.pos.y - l };
};

/** Centre for rings and markers: the base for ground models, the figure for flyers. */
const ringPos = (u: Unit, m: Model): Vec => (isFlying(u) ? drawPos(u, m) : { x: m.pos.x, y: m.pos.y - liftOf(u, m) });

const isStructure = (p: UnitProfile): boolean => !!p.structure || p.keywords.includes("structure");

const findModel = (u: Unit | undefined, i: number, id: number): Model | undefined =>
  !u ? undefined : u.models[i]?.id === id ? u.models[i] : u.models.find((x) => x.id === id);

const centroid = (pts: Vec[]): Vec => ({
  x: pts.reduce((s, p) => s + p.x, 0) / Math.max(1, pts.length),
  y: pts.reduce((s, p) => s + p.y, 0) / Math.max(1, pts.length),
});

/** Breathing amplitude and period by archetype (shared with the forge previews). */
const BREATH = IDLE_BREATH;

function hitWord(a: Unit | undefined, kind: AttackReport["kind"]): string {
  if (kind === "barrage") return "KA-BOOM!";
  if (kind === "impact") return "CRUNCH!";
  let look: Look = "plain";
  let beast = false;
  let mech = false;
  if (a) {
    const p = profileOf(a);
    look = lookOf(p).look;
    beast = p.keywords.includes("beast");
    mech = p.keywords.includes("mech") || p.keywords.includes("heavy");
  }
  if (kind === "fight") return look === "teeth" || beast ? "CHOMP!" : look === "crystal" ? "SHING!" : mech ? "KRUNCH!" : "WHAM!";
  if (look === "crystal") return "ZZAP!";
  if (look === "teeth" || beast) return "SPLAT!";
  return mech ? "BLAM!" : kind === "overwatch" ? "BLAM!" : "KRAK!";
}

export class BoardRenderer {
  readonly app = new Application();
  private board = new Container();
  private boardSprite: Sprite | null = null;
  private boardRes = 0;
  private bakeTimer = 0;
  private objectiveLayer = new Container();
  private flagLayer = new Graphics();
  private labelLayer = new Container();
  private overlayLayer = new Graphics();
  private engageUnder = new Graphics();
  private hoverLayer = new Graphics();
  private modelLayer = new Container();
  private engageOver = new Graphics();
  private topOverlay = new Graphics();
  private fx = new FxLayer();
  private dropShip = new DropShipFx();
  private bannerFx = new Banner();
  private models = new Map<string, ModelView>();
  private objectives = new Map<string, ObjectiveView>();
  private labels: Text[] = [];
  /** Distance labels on aim lines, pooled and reused every redraw. */
  private aimLabelLayer = new Container();
  private aimLabels: Text[] = [];
  private ppi = 20;
  /** Camera: current (cam) and target (camT) pixels-per-inch and board offset; fit = whole board on stage. */
  private cam = { ppi: 20, x: 0, y: 0 };
  private camT = { ppi: 20, x: 0, y: 0 };
  private fit = { ppi: 20, x: 0, y: 0 };
  private atFit = true;
  private screenW = 0;
  private screenH = 0;
  private spaceDown = false;
  private lastState: GameState | null = null;
  private boardKey = "";
  private units = new Map<string, Unit>();
  private selected: string | null = null;
  private leader: number | null = null;
  private readyKey: string | null = null;
  private readySet: Set<string> | null = null;
  private pointer: Vec | null = null;
  private hoverUid: string | null = null;
  private reduced = false;
  private time = 0;

  /** Show a banner automatically on every phase/round change seen in the state. */
  autoPhaseBanners = true;

  onPointerMove: (p: Vec) => void = () => {};
  /** A click or tap on the board (`touch`: it came from a finger, which can't hover first). */
  onPointerDown: (p: Vec, touch: boolean) => void = () => {};
  onPointerLeave: () => void = () => {};
  /** Called whenever the camera pans or zooms (to reposition DOM popups placed with `toScreen`). */
  onViewChange?: () => void;

  /** Set the board's mouse cursor (a CSS cursor value; see cues.ts). */
  setCursor(css: string): void {
    if (this.app.stage) this.app.stage.cursor = css;
    const c = this.app.canvas as HTMLCanvasElement | undefined;
    if (c && c.style.cursor !== css) c.style.cursor = css;
  }

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      background: "#1f1712",
      resizeTo: host,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
    });
    host.appendChild(this.app.canvas);
    // Lettering on icons and banners uses the display font: give it a moment to arrive.
    try {
      await Promise.race([
        Promise.all([document.fonts.load(`40px "Bowlby One"`), document.fonts.load(`700 18px "Barlow Semi Condensed"`)]),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch {
      /* fonts are optional */
    }
    refreshLettering();
    this.modelLayer.sortableChildren = true;
    this.board.addChild(
      this.objectiveLayer,
      this.labelLayer,
      this.fx.under,
      this.overlayLayer,
      this.engageUnder,
      this.hoverLayer,
      this.flagLayer,
      this.modelLayer,
      this.engageOver,
      this.topOverlay,
      this.aimLabelLayer,
      this.fx.root,
      this.dropShip.root,
    );
    this.app.stage.addChild(this.board, this.bannerFx.root);
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.bindInput(this.app.canvas);
    this.app.renderer.on("resize", () => this.layout());
    // Pixi only watches window resizes; also follow the stage element's own size changes.
    const ro = new ResizeObserver(() => {
      // the app may have been destroyed (tests, hot reloads): stop watching then
      if (!this.app.renderer) return ro.disconnect();
      this.app.resize();
    });
    ro.observe(host);
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const setReduced = () => {
      this.reduced = !!mq?.matches;
      this.fx.reduced = this.reduced;
      this.dropShip.reduced = this.reduced;
      this.bannerFx.reduced = this.reduced;
      for (const v of this.models.values()) v.idle = false;
    };
    setReduced();
    mq?.addEventListener?.("change", setReduced);
    this.app.ticker.add((t) => this.tick(t.deltaMS));
  }

  private toBoardAt(sx: number, sy: number): Vec {
    return { x: (sx - this.cam.x) / this.cam.ppi, y: (sy - this.cam.y) / this.cam.ppi };
  }

  // ---------- camera: wheel/pinch zoom, drag pan, click on release ----------

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.style.touchAction = "none";
    const local = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { id: number; sx: number; sy: number; camX: number; camY: number; panning: boolean; click: boolean; touch: boolean } | null = null;
    let pinch: { d: number; ppi: number } | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      const p = local(e);
      pointers.set(e.pointerId, p);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, ppi: this.camT.ppi };
        drag = null;
        return;
      }
      const pan = e.button === 1 || (e.button === 0 && this.spaceDown);
      if (e.button === 0 || e.button === 1) {
        if (e.button === 1) e.preventDefault();
        const touch = e.pointerType === "touch";
        drag = { id: e.pointerId, sx: p.x, sy: p.y, camX: this.camT.x, camY: this.camT.y, panning: pan, click: e.button === 0 && !pan, touch };
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      const p = local(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
        this.zoomTo((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, (pinch.ppi * d) / pinch.d, true);
        return;
      }
      if (drag && drag.id === e.pointerId) {
        const dx = p.x - drag.sx;
        const dy = p.y - drag.sy;
        // Fingers wobble more than mice: they get a bigger allowance before a tap turns into a pan.
        if (!drag.panning && Math.hypot(dx, dy) > TAP_SLOP_PX[drag.touch ? "touch" : "mouse"]) {
          drag.panning = true;
          drag.click = false;
        }
        if (drag.panning) {
          this.camT.x = drag.camX + dx;
          this.camT.y = drag.camY + dy;
          this.atFit = false;
          this.clampCam();
          this.cam.x = this.camT.x;
          this.cam.y = this.camT.y;
          this.applyCam();
        }
      }
      if (p.x < 0 || p.y < 0 || p.x > this.app.screen.width || p.y > this.app.screen.height) return;
      // A finger dragging is panning, not hovering: the hover stays on the last tap (see touch.ts).
      if (e.pointerType === "touch") return;
      const b = this.toBoardAt(p.x, p.y);
      this.pointer = b;
      this.onPointerMove(b);
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && drag.id === e.pointerId) {
        const click = drag.click && !cancelled;
        const touch = drag.touch;
        drag = null;
        if (click) {
          const p = local(e);
          const b = this.toBoardAt(p.x, p.y);
          // A finger never hovered here: point the hover highlight at the tap.
          if (touch) this.pointer = b;
          this.onPointerDown(b, touch);
        }
      }
    };
    canvas.addEventListener("pointerup", (e) => end(e, false));
    canvas.addEventListener("pointercancel", (e) => end(e, true));
    canvas.addEventListener("pointerleave", (e) => {
      // A lifted finger "leaves" too: keep what the tap pointed at (its preview and unit card) on screen.
      if (drag || e.pointerType === "touch") return;
      this.pointer = null;
      this.onPointerLeave();
      this.updateHover(false);
    });
    // Taps are handled on pointerup above. Cancel the browser's own click that follows a touch, or it
    // lands on whatever the tap just opened under the finger (the deploy menu's first unit, say).
    canvas.addEventListener("touchend", (e) => e.cancelable && e.preventDefault(), { passive: false });
    canvas.addEventListener("auxclick", (e) => e.button === 1 && e.preventDefault());
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!this.lastState) return;
        e.preventDefault();
        const p = local(e);
        // trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheels with big ones
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        const k = Math.exp((-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0018)));
        this.zoomTo(p.x, p.y, this.camT.ppi * k, false);
      },
      { passive: false },
    );
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    };
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !typing(e.target)) this.spaceDown = true;
      if (!this.lastState || !canvas.isConnected || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const sw = this.app.screen.width / 2;
      const sh = this.app.screen.height / 2;
      if (e.key === "+" || e.key === "=") this.zoomTo(sw, sh, this.camT.ppi * 1.25, false);
      else if (e.key === "-" || e.key === "_") this.zoomTo(sw, sh, this.camT.ppi / 1.25, false);
      else if (e.key === "0") this.resetView();
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.spaceDown = false;
    });
    window.addEventListener("blur", () => (this.spaceDown = false));
  }

  /** Zoom so that the board point under (sx, sy) stays put. */
  private zoomTo(sx: number, sy: number, ppi: number, snap: boolean): void {
    if (!this.lastState) return;
    const k = Math.max(this.fit.ppi * 0.6, Math.min(this.fit.ppi * 4, ppi));
    const bx = (sx - this.camT.x) / this.camT.ppi;
    const by = (sy - this.camT.y) / this.camT.ppi;
    this.camT.ppi = k;
    this.camT.x = sx - bx * k;
    this.camT.y = sy - by * k;
    this.atFit = Math.abs(k - this.fit.ppi) < 1e-3 && Math.abs(this.camT.x - this.fit.x) < 1 && Math.abs(this.camT.y - this.fit.y) < 1;
    this.clampCam();
    if (snap || this.reduced) {
      this.cam = { ...this.camT };
      this.applyCam();
    }
  }

  /** Keep at least ~25% of the board on screen. */
  private clampCam(): void {
    if (!this.lastState) return;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const bw = this.lastState.board.width * this.camT.ppi;
    const bh = this.lastState.board.height * this.camT.ppi;
    this.camT.x = Math.min(sw - bw * 0.25, Math.max(-bw * 0.75, this.camT.x));
    this.camT.y = Math.min(sh - bh * 0.25, Math.max(-bh * 0.75, this.camT.y));
  }

  /** Fit the whole board to the stage. */
  resetView(): void {
    this.atFit = true;
    this.camT = { ...this.fit };
    if (this.reduced) {
      this.cam = { ...this.camT };
      this.applyCam();
    }
  }

  private applyCam(): void {
    this.board.scale.set(this.cam.ppi);
    this.board.position.set(Math.round(this.cam.x), Math.round(this.cam.y));
    if (this.cam.ppi !== this.ppi) {
      this.ppi = this.cam.ppi;
      this.fx.textScale = 1 / this.ppi;
      for (const t of this.labels) t.scale.set(1 / this.ppi);
      for (const t of this.aimLabels) t.scale.set(1 / this.ppi);
      this.maybeRebake();
    }
    this.onViewChange?.();
  }

  private maybeRebake(): void {
    if (!this.lastState || !this.boardSprite) return;
    const want = this.boardResFor(this.lastState);
    if (Math.abs(want - this.boardRes) / this.boardRes <= 0.25) return;
    clearTimeout(this.bakeTimer);
    this.bakeTimer = window.setTimeout(() => {
      if (this.lastState) this.bakeBoard(this.lastState);
    }, 260);
  }

  /** Screen pixels per board inch at the current zoom. */
  pixelsPerInch(): number {
    return this.cam.ppi;
  }

  toScreen(p: Vec): Vec {
    const g = this.board.toGlobal(p);
    return { x: g.x, y: g.y };
  }

  /**
   * Show a comic-panel banner (queued behind any others). Resolves once it has swept out, so callers
   * can wait for it. Banners with the same title within ~2.5s are merged.
   */
  banner(title: string, opts?: BannerOpts): Promise<void> {
    return this.bannerFx.show(title, opts);
  }

  private layout(): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.bannerFx.width = sw;
    this.bannerFx.height = sh;
    this.app.stage.hitArea = this.app.screen;
    const oldW = this.screenW;
    const oldH = this.screenH;
    this.screenW = sw;
    this.screenH = sh;
    if (!this.lastState) return;
    const { width, height } = this.lastState.board;
    const ppi = Math.max(4, Math.min(sw / (width + MARGIN * 2), sh / (height + MARGIN * 2)));
    this.fit = { ppi, x: (sw - width * ppi) / 2, y: (sh - height * ppi) / 2 };
    if (this.atFit || !oldW) {
      this.camT = { ...this.fit };
    } else {
      // keep the board point at the centre of the view in the centre
      const cx = (oldW / 2 - this.camT.x) / this.camT.ppi;
      const cy = (oldH / 2 - this.camT.y) / this.camT.ppi;
      this.camT.ppi = Math.max(this.fit.ppi * 0.6, Math.min(this.fit.ppi * 4, this.camT.ppi));
      this.camT.x = sw / 2 - cx * this.camT.ppi;
      this.camT.y = sh / 2 - cy * this.camT.ppi;
      this.clampCam();
    }
    this.cam = { ...this.camT };
    this.applyCam();
  }

  private boardResFor(s: GameState): number {
    const tw = s.board.width + MARGIN * 2;
    const th = s.board.height + MARGIN * 2;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    return Math.max(8, Math.min(this.ppi * dpr, 4096 / tw, 4096 / th));
  }

  reset(): void {
    this.atFit = true;
    this.lastState = null;
    this.boardKey = "";
    this.units = new Map();
    for (const v of this.models.values()) v.root.destroy({ children: true });
    this.models.clear();
    for (const o of this.objectives.values()) {
      o.base.destroy();
      o.spin.destroy();
    }
    this.objectives.clear();
    this.fx.clear();
    this.dropShip.clear();
    this.bannerFx.clear();
    this.labelLayer.removeChildren().forEach((c) => c.destroy());
    this.labels = [];
    for (const g of [this.overlayLayer, this.topOverlay, this.engageUnder, this.engageOver, this.hoverLayer, this.flagLayer]) g.clear();
    if (this.boardSprite) {
      this.boardSprite.destroy({ texture: true, textureSource: true });
      this.boardSprite = null;
    }
    this.hoverUid = null;
    this.selected = null;
    this.leader = null;
    this.readyKey = null;
    this.readySet = null;
  }

  render(view: RenderView): void {
    const s = view.state;
    const key = `${s.mapId}|${s.board.width}x${s.board.height}|${s.terrain.length}|${s.objectives.length}`;
    if (this.lastState && key !== this.boardKey) this.reset();
    const prev = this.lastState;
    const fresh = prev === null;
    if (fresh) {
      this.boardKey = key;
      this.lastState = s;
      this.layout();
      this.drawStatic(s);
    }
    const stateChanged = fresh || s !== prev;
    if (stateChanged) {
      this.lastState = s;
      this.onState(fresh ? null : prev, s, view.events ?? null);
    }
    const readyKey = view.ready ? view.ready.join(",") : null;
    if (stateChanged || view.selected !== this.selected || view.leader !== this.leader || readyKey !== this.readyKey) {
      this.selected = view.selected;
      this.leader = view.leader;
      this.readyKey = readyKey;
      this.readySet = view.ready ? new Set(view.ready) : null;
      this.refreshArt(s);
    }
    this.drawOverlay(view);
    this.updateHover(stateChanged);
  }

  private label(text: string, pos: Vec, size = 15, color = 0xffffff): Text {
    const t = new Text({
      text,
      style: { fontFamily: FONT, fontSize: size * 2, fill: color, stroke: { color: INK, width: 7, join: "round" } },
    });
    t.anchor.set(0.5);
    t.position.set(pos.x, pos.y);
    t.scale.set(1 / this.ppi);
    t.resolution = 1;
    this.labelLayer.addChild(t);
    this.labels.push(t);
    return t;
  }

  /** Show pooled aim label `i` (created on first use; the pool survives board rebuilds). */
  private aimLabel(i: number, text: string, pos: Vec, color: number): void {
    let t = this.aimLabels[i];
    if (!t) {
      t = new Text({ text, style: { fontFamily: FONT, fontSize: 24, fill: color, stroke: { color: INK, width: 6, join: "round" } } });
      t.anchor.set(0.5, 1.15);
      t.resolution = 1;
      this.aimLabelLayer.addChild(t);
      this.aimLabels.push(t);
    }
    if (t.text !== text) t.text = text;
    t.style.fill = color;
    t.scale.set(1 / this.ppi);
    t.position.set(pos.x, pos.y);
    t.visible = true;
  }

  // ---------- static board ----------

  private drawStatic(s: GameState): void {
    this.bakeBoard(s);
    for (const o of s.objectives) this.label(String(o.number), { x: o.pos.x, y: o.pos.y + 0.02 - o.elevation * PLAT_LIFT }, 14, o.team === null ? 0xfff3d6 : 0xffffff);
  }

  /** Paint ground + terrain into a canvas at the current zoom and show it as one sprite. */
  private bakeBoard(s: GameState): void {
    const res = this.boardResFor(s);
    const { width: w, height: h } = s.board;
    const c = makeCanvas((w + MARGIN * 2) * res, (h + MARGIN * 2) * res);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(res, 0, 0, res, MARGIN * res, MARGIN * res);
    const b = { width: w, height: h, terrain: s.terrain, access: s.access, spawn: s.spawn };
    paintGround(ctx, b, { frame: MARGIN });
    paintTerrain(ctx, b);
    const tex = new Texture({ source: new CanvasSource({ resource: c, autoGenerateMipmaps: true, scaleMode: "linear" }) });
    const old = this.boardSprite;
    const sp = new Sprite(tex);
    sp.position.set(-MARGIN, -MARGIN);
    sp.scale.set(1 / res);
    this.board.addChildAt(sp, 0);
    this.boardSprite = sp;
    this.boardRes = res;
    old?.destroy({ texture: true, textureSource: true });
  }

  // ---------- state diffing ----------

  private onState(prev: GameState | null, s: GameState, events: GameEvent[] | null): void {
    const prevUnits = this.units;
    const units = new Map<string, Unit>();
    for (const u of s.units) units.set(u.uid, u);
    this.units = units;
    const t0 = performance.now();

    const hitDelay = new Map<string, number>();
    const teleported = new Set<string>();
    const charged = new Set<string>();
    const summoned = new Set<string>();
    // Units a drop-ship sets down appear when it touches down.
    const landing = prev && events ? this.dropShip.fromEvents(events, units, s.board) : null;
    if (prev) {
      if (events) this.effectsFromEvents(prevUnits, events, hitDelay, teleported, charged, summoned);
      else this.effectsFromDiff(prev, s, prevUnits, hitDelay, charged);
    }

    for (const u of s.units) {
      const pu = prevUnits.get(u.uid);
      const prof = profileOf(u);
      const team = PLAYER_COLORS[u.owner];
      const damaged: { m: Model; loss: number; shieldOnly: boolean }[] = [];
      let longest = null as { path: Polyline; dur: number } | null;
      const delay = hitDelay.get(u.uid) ?? 0;
      u.models.forEach((m, i) => {
        const key = `${u.uid}:${m.id}`;
        const pm = findModel(pu, i, m.id);
        const was = !!prev && !!pu && pu.onBoard && !!pm && pm.alive;
        const now = u.onBoard && m.alive;
        let v = this.models.get(key);
        if (!v) {
          if (!now) return;
          v = this.createView(u, m, prof);
        }
        v.liftTarget = liftOf(u, m);
        v.target = { ...m.pos };
        v.root.zIndex = (isFlying(u) ? 2 : m.elevation) * 100000 + Math.round(m.pos.y * 100);
        if (now && pm && was) {
          const loss = pm.hp + pm.shield - (m.hp + m.shield);
          if (loss > 0) damaged.push({ m, loss, shieldOnly: pm.hp === m.hp });
          else if (m.hp > pm.hp) this.fx.number(drawPos(u, m), `+${m.hp - pm.hp}`, 0x8fe36a, 0, 14);
        }
        if (now && !was) {
          // Deployed, summoned, revived or re-emerged
          v.root.visible = true;
          v.root.alpha = 1;
          v.root.position.set(m.pos.x, m.pos.y);
          v.path = null;
          v.lift = v.liftTarget;
          v.idle = false;
          if (prev) {
            v.anim = { kind: "pop", t: -(landing?.get(u.uid) ?? 0), dur: this.reduced ? 160 : 460 };
            const at = drawPos(u, m);
            if (summoned.has(u.uid) || (u.summoned && !pu?.onBoard)) this.fx.sparkle(at, v.r, shade(team, 0.4));
            else if (pm && !pm.alive) this.fx.sparkle(at, v.r, 0x8fe36a);
            else this.fx.ring(m.pos, v.r * 0.5, v.r + 0.9, SAND_DARK, (landing?.get(u.uid) ?? 0) + (this.reduced ? 0 : 220), 0.16);
          } else v.anim = null;
        } else if (now && was && pm) {
          const moved = dist(pm.pos, m.pos) > 0.01;
          if (moved) {
            const tp = teleported.has(u.uid);
            let pts: Vec[] | null = null;
            if (!tp) pts = this.routeFor(prev!, pu!, pm, m.pos, performance.now() - t0 < 10);
            if (tp || (!pts && dist(pm.pos, m.pos) > 2.5 && !events)) {
              this.fx.sparkle(drawPos(pu!, pm), v.r, 0xffffff);
              v.root.position.set(m.pos.x, m.pos.y);
              v.path = null;
              v.anim = { kind: "pop", t: -120, dur: this.reduced ? 160 : 380 };
              this.fx.sparkle(drawPos(u, m), v.r, shade(team, 0.4), 120);
            } else {
              const here = { x: v.root.x, y: v.root.y };
              const route = pts ?? [here, m.pos];
              // Still walking the last move? Start from where the miniature actually is.
              if (dist(route[0]!, here) > 0.05) route.unshift(here);
              const path = new Polyline(route);
              const dur = this.reduced ? 140 : Math.max(300, Math.min(1050, 180 + path.length * 62));
              v.path = path;
              v.pathT = 0;
              v.pathDur = dur;
              v.charging = charged.has(u.uid);
              if (!longest || path.length > longest.path.length) longest = { path, dur };
              if (v.charging && i < 8) this.fx.whoosh(path.pts, shade(team, 0.5), dur);
              if (v.charging) v.lunge = { t: -dur * 0.85, dur: 320, ...this.toward(u, m, s) };
            }
            v.idle = false;
          } else if (!v.path) v.root.position.set(m.pos.x, m.pos.y);
          if (v.lift !== v.liftTarget) v.idle = false;
        } else if (!now && was && pm) {
          v.idle = false;
          v.path = null;
          if (!m.alive) {
            v.anim = { kind: "ko", t: -delay, dur: this.reduced ? 220 : 760 };
            v.flinch = { t: -delay, dur: 160, dx: 0, dy: 0 };
            this.fx.poof(drawPos(pu!, pm), v.r + 0.1, delay + (this.reduced ? 0 : 120));
            const kind = v.spec.look === "teeth" || prof.keywords.includes("beast") ? "goo" : v.spec.look === "crystal" ? "shards" : "scorch";
            this.fx.decal(pm.pos, kind, v.r * 0.95, delay + (this.reduced ? 0 : 200));
            damaged.push({ m: pm, loss: pm.hp + pm.shield, shieldOnly: false });
          } else {
            v.anim = { kind: "vanish", t: 0, dur: this.reduced ? 200 : 600 };
            this.fx.sparkle(drawPos(pu!, pm), v.r, 0xffffff);
          }
        } else if (!now && !v.anim) {
          v.root.visible = false;
        }
      });
      if (longest) {
        this.fx.trail(longest.path.pts, shade(team, -0.15), longest.dur);
        if (charged.has(u.uid)) this.fx.ring(longest.path.pts[longest.path.pts.length - 1]!, 0.3, 1.6, 0xffffff, longest.dur * 0.9, 0.14);
      }
      // Impact bursts + flinches (+ per-model numbers when several models were hit; the controller shows the total)
      for (const d of damaged) {
        const at = drawPos(u, d.m);
        this.fx.impact(at, Math.max(0.55, prof.baseRadius * 0.9), d.shieldOnly ? SHIELD : 0xffe066, delay);
        if (damaged.length > 1) this.fx.number(at, `-${d.loss}`, d.shieldOnly ? SHIELD : 0xff6b6b, delay + 40, 13);
        const v = this.models.get(`${u.uid}:${d.m.id}`);
        if (v && d.m.alive) {
          v.flinch = { t: -delay, dur: 300, dx: 0, dy: 0 };
          v.idle = false;
        }
      }
    }
    // Units that disappeared from the state entirely
    for (const [uid, pu] of prevUnits) {
      if (units.has(uid)) continue;
      for (const m of pu.models) {
        const v = this.models.get(`${uid}:${m.id}`);
        if (v && v.root.visible && !v.anim) {
          v.anim = { kind: "vanish", t: 0, dur: this.reduced ? 200 : 600 };
          v.idle = false;
        }
      }
    }

    this.updateLooks(s);
    this.drawEngaged(s);
    this.drawObjectives(s, !!prev);
    this.drawFlags(s);
    if ((!prev || prev.phase !== s.phase || prev.round !== s.round) && !s.over && this.autoPhaseBanners) this.phaseBanner(s.phase, s.round);
  }

  private phaseBanner(phase: Phase, round: number): Promise<void> {
    const name = (PHASE_NAMES[phase] ?? phase).toUpperCase();
    return this.bannerFx.show(`${name} PHASE`, { kicker: `ROUND ${round}`, sub: PHASE_HINTS[phase] ?? "", tone: "neutral", auto: true });
  }

  /** Unit vector from a model towards the nearest enemy (for lunges). */
  private toward(u: Unit, m: Model, s: GameState): { dx: number; dy: number } {
    let best = Infinity;
    let dx = u.owner === 0 ? 0 : 0;
    let dy = u.owner === 0 ? -1 : 1;
    for (const e of s.units) {
      if (e.owner === u.owner || !e.onBoard) continue;
      for (const em of e.models) {
        if (!em.alive) continue;
        const d = (em.pos.x - m.pos.x) ** 2 + (em.pos.y - m.pos.y) ** 2;
        if (d < best && d > 1e-6) {
          best = d;
          const L = Math.sqrt(d);
          dx = (em.pos.x - m.pos.x) / L;
          dy = (em.pos.y - m.pos.y) / L;
        }
      }
    }
    return { dx, dy };
  }

  /** The routed path a model took (via ramps/ladders), or null for "no idea". */
  private routeFor(prev: GameState, pu: Unit, pm: Model, to: Vec, allowSearch: boolean): Vec[] | null {
    if (isFlying(pu) || !allowSearch) return [pm.pos, to];
    try {
      const r = planRoute(prev, pu, pm.pos, pm.elevation, to);
      if (typeof r === "string" || !r.legs.length) return null;
      return [r.legs[0]!.from, ...r.legs.map((l) => l.to)];
    } catch {
      return null;
    }
  }

  /** Where a model's weapon tip is when facing `toward`; also turns the figure to face that way. */
  private muzzleAt(u: Unit, m: Model, toward: Vec, delay: number, recoil: boolean): Vec {
    const v = this.models.get(`${u.uid}:${m.id}`);
    if (!v) return drawPos(u, m);
    const face: 1 | -1 = !v.turns ? 1 : toward.x >= m.pos.x ? 1 : -1;
    v.faceTarget = face;
    v.idle = false;
    if (recoil) v.recoil = { t: -delay, dur: 220, dx: -face, dy: 0 };
    const mz = v.tex.meta.muzzle;
    return { x: m.pos.x + face * mz.x, y: m.pos.y - liftOf(u, m) + mz.y };
  }

  private shoot(a: Unit, am: Model[], t: Unit, tm: Model[], kind: AttackReport["kind"], baseDelay: number): number {
    if (!am.length || !tm.length) return baseDelay;
    const color = shade(PLAYER_COLORS[a.owner], 0.35);
    let arrive = baseDelay;
    if (kind === "barrage") {
      const to = centroid(tm.map((m) => m.pos));
      const from = this.muzzleAt(a, am[0]!, to, baseDelay, true);
      arrive = baseDelay + this.fx.lob(from, to, 0xff8a3d, baseDelay);
      this.fx.ring(to, 0.4, 2.4, 0xff8a3d, arrive, 0.2);
      return arrive;
    }
    if (kind === "overwatch") this.fx.number(drawPos(a, am[0]!), "!", ACCENT, baseDelay, 20);
    am.slice(0, 10).forEach((m, i) => {
      let near = tm[0]!;
      for (const x of tm) if (dist(x.pos, m.pos) < dist(near.pos, m.pos)) near = x;
      const to = drawPos(t, near);
      const d = baseDelay + i * (this.reduced ? 0 : 45);
      if (kind === "fight") {
        const v = this.models.get(`${a.uid}:${m.id}`);
        if (v) {
          const L = dist(near.pos, m.pos) || 1;
          if (v.turns) v.faceTarget = near.pos.x >= m.pos.x ? 1 : -1;
          v.lunge = { t: -d, dur: 280, dx: (near.pos.x - m.pos.x) / L, dy: (near.pos.y - m.pos.y) / L };
          v.idle = false;
        }
        this.fx.slash(to, profileOf(t).baseRadius + 0.2, color, d + 90);
        arrive = Math.max(arrive, d + 200);
      } else {
        const from = this.muzzleAt(a, m, near.pos, d, true);
        arrive = Math.max(arrive, d + this.fx.tracer(from, to, color, d));
      }
    });
    return arrive;
  }

  private effectsFromEvents(
    prevUnits: Map<string, Unit>,
    events: GameEvent[],
    hitDelay: Map<string, number>,
    teleported: Set<string>,
    charged: Set<string>,
    summoned: Set<string>,
  ): void {
    let base = 0;
    // The last indirect shell this batch: its bursts don't lob a second shell.
    let shell: { uid: string; arrive: number } | null = null;
    for (const e of events) {
      if (e.type === "scatter") {
        const a = prevUnits.get(e.uid) ?? this.units.get(e.uid);
        const am = a ? aliveModels(a)[0] : undefined;
        if (!a || !am) continue;
        const from = this.muzzleAt(a, am, e.aim, base, true);
        let t = base + this.fx.lob(from, e.aim, 0xff8a3d, base);
        if (e.drift > 0) {
          this.fx.ring(e.aim, 0.2, 0.9, 0xffffff, t, 0.1); // where it was aimed
          t += this.fx.bounce(e.aim, e.landed, 0xff8a3d, t);
        }
        this.fx.ring(e.landed, 0.4, SHELL_BURST + 0.4, 0xff8a3d, t, 0.2);
        shell = { uid: e.uid, arrive: t };
        base = t;
        continue;
      }
      if (e.type === "moved") {
        if (e.kind === "charge") charged.add(e.uid);
        if (e.kind === "teleport") teleported.add(e.uid);
        if (e.kind !== "teleport") base = Math.max(base, 300);
      } else if (e.type === "summoned") summoned.add(e.uid);
      else if (e.type === "attack") {
        const r = e.report;
        const a = prevUnits.get(r.uid) ?? this.units.get(r.uid);
        const t = prevUnits.get(r.target) ?? this.units.get(r.target);
        if (!a || !t) continue;
        // Attackers fire from where they stood; the target is hit where it ends up (overwatch on a mover)
        const am = aliveModels(a);
        const now = this.units.get(r.target);
        const tm = (now && aliveModels(now).length ? aliveModels(now) : aliveModels(t)).slice();
        const near = (m: Model) => Math.min(...tm.map((x) => dist(x.pos, m.pos)));
        const shooters = am.slice().sort((x, y) => near(x) - near(y)).slice(0, Math.max(1, r.attackers));
        const start = r.kind === "overwatch" ? base + 120 : base;
        const arrive = r.kind === "barrage" && shell?.uid === r.uid ? shell.arrive : this.shoot(a, shooters, now ?? t, tm, r.kind, start);
        hitDelay.set(r.target, Math.max(hitDelay.get(r.target) ?? 0, arrive));
        const c = centroid(tm.map((m) => drawPos(t, m)));
        if (!r.damage) this.fx.later(arrive, () => this.fx.impact(c, 0.45, 0xffffff));
        else if (r.damage >= 2 || r.modelsKilled > 0) this.fx.boom(c, hitWord(a, r.kind), r.unitDestroyed ? BAD : CLASH, arrive, r.unitDestroyed || r.damage >= 4);
        base = arrive + 80;
      }
    }
  }

  private effectsFromDiff(prev: GameState, s: GameState, prevUnits: Map<string, Unit>, hitDelay: Map<string, number>, charged: Set<string>): void {
    if (prev.phase !== s.phase || prev.round !== s.round) return;
    const combat = s.phase === "combat";
    const actor = s.units.find((u) => {
      const pu = prevUnits.get(u.uid);
      if (!pu || !u.onBoard) return false;
      return combat ? u.status.fought && !pu.status.fought : u.status.acted && !pu.status.acted;
    });
    if (!actor) return;
    const pa = prevUnits.get(actor.uid)!;
    if (actor.status.charged && !pa.status.charged) charged.add(actor.uid);
    if (s.phase !== "assault" && !combat) return;
    const movedActor = actor.models.some((m, i) => {
      const pm = findModel(pa, i, m.id);
      return !!pm && dist(pm.pos, m.pos) > 0.01;
    });
    if (movedActor && !combat) return;
    for (const t of s.units) {
      if (t.owner === actor.owner) continue;
      const pt = prevUnits.get(t.uid);
      if (!pt || !pt.onBoard) continue;
      const before = pt.models.reduce((n, m) => n + (m.alive ? m.hp + m.shield : 0), 0);
      const after = t.models.reduce((n, m) => n + (m.alive ? m.hp + m.shield : 0), 0);
      if (after >= before) continue;
      const tm = aliveModels(pt);
      const kind = combat ? "fight" : "shoot";
      const arrive = this.shoot(pa, aliveModels(pa), pt, tm, kind, 0);
      hitDelay.set(t.uid, arrive);
      if (before - after >= 2) this.fx.boom(centroid(tm.map((m) => drawPos(pt, m))), hitWord(pa, kind), CLASH, arrive, before - after >= 4);
    }
  }

  // ---------- models ----------

  private createView(u: Unit, m: Model, prof: UnitProfile): ModelView {
    const { color, look } = lookOf(prof);
    const spec = figureSpec(prof, look, color);
    const tex = figureTex(spec);
    const flying = isFlying(u);
    const structure = isStructure(prof);
    const temp = structure && prof.structure?.lifetime === "round";
    const root = new Container();
    const mini = new Container();
    const under = new Graphics();
    const readyRing = new Graphics();
    const bt = baseTex(prof.baseRadius, PLAYER_COLORS[u.owner], temp ? "holo" : structure ? "plate" : "round", prof.art ? undefined : look);
    const base = new Sprite(bt.tex);
    base.anchor.set(bt.ax, bt.ay);
    base.scale.set(bt.scale);
    const mkFig = (t: Texture) => {
      const sp = new Sprite(t);
      sp.anchor.set(tex.ax, tex.ay);
      sp.scale.set(tex.scale);
      return sp;
    };
    const cast = new Container();
    const castSprite = mkFig(tex.white[0]!);
    castSprite.tint = INK;
    castSprite.alpha = flying ? 0.22 : 0.3;
    cast.addChild(castSprite);
    // Light from the upper left: shadows fall down-right; flyers' shadows lie flat on the ground.
    cast.setFromMatrix(flying ? new Matrix(0.9, 0, 0, 0.42, 0.35, 0.25) : new Matrix(1, 0, -0.5, -0.36, 0, 0));
    const fig = new Container();
    const figSprite = mkFig(tex.frames[0]!);
    const flash = mkFig(tex.white[0]!);
    flash.alpha = 0;
    const mz = iconTex("muzzle");
    const muzzle = new Sprite(mz.tex);
    muzzle.anchor.set(0.5);
    muzzle.scale.set(mz.scale);
    muzzle.position.set(tex.meta.muzzle.x, tex.meta.muzzle.y);
    muzzle.visible = false;
    fig.addChild(figSprite, flash, muzzle);
    const fore = new Graphics();
    const hud = new Graphics();
    const dn = iconTex("done");
    const tag = new Sprite(dn.tex);
    tag.anchor.set(0.5);
    tag.scale.set(dn.scale * 0.8);
    tag.position.set(0, prof.baseRadius * BASE_RY * 0.55);
    tag.visible = false;
    const sk = iconTex("shaken");
    const mark = new Sprite(sk.tex);
    mark.anchor.set(0.5);
    mark.scale.set(sk.scale);
    mark.visible = false;
    let glass: Sprite | null = null;
    if (temp) {
      const hg = iconTex("hourglass");
      glass = new Sprite(hg.tex);
      glass.anchor.set(0.5);
      glass.scale.set(hg.scale * 0.9);
      glass.position.set(prof.baseRadius * 0.85, -prof.baseRadius * 0.5);
    }
    let stand: Graphics | null = null;
    if (flying) stand = new Graphics();
    mini.addChild(readyRing, under, base);
    if (stand) mini.addChild(stand);
    mini.addChild(cast, fig, fore, tag, hud, mark);
    if (glass) mini.addChild(glass);
    root.addChild(mini);
    root.position.set(m.pos.x, m.pos.y);
    this.modelLayer.addChild(root);
    const v: ModelView = {
      uid: u.uid,
      root,
      mini,
      under,
      readyRing,
      base,
      stand,
      cast,
      castSprite,
      fig,
      figSprite,
      flash,
      muzzle,
      fore,
      hud,
      tag,
      mark,
      glass,
      tex,
      spec,
      kind: spec.kind,
      sig: "",
      r: prof.baseRadius,
      flying,
      structure,
      temp,
      lift: liftOf(u, m),
      liftTarget: liftOf(u, m),
      target: { ...m.pos },
      path: null,
      pathT: 0,
      pathDur: 1,
      charging: false,
      anim: null,
      face: u.owner === 0 || !rotates(spec.kind) ? 1 : -1,
      faceTarget: u.owner === 0 || !rotates(spec.kind) ? 1 : -1,
      turns: rotates(spec.kind),
      frame: 0,
      seed: (this.models.size * 1.618) % (Math.PI * 2),
      bank: 0,
      recoil: null,
      lunge: null,
      flinch: null,
      shaken: false,
      hunkered: false,
      spent: false,
      ready: false,
      idle: false,
    };
    if (stand) this.drawStand(v);
    this.models.set(`${u.uid}:${m.id}`, v);
    return v;
  }

  private drawStand(v: ModelView): void {
    const g = v.stand!.clear();
    const h = v.liftTarget;
    g.moveTo(0, 0).lineTo(0, -h).stroke({ width: 0.11, color: INK, alpha: 0.5 });
    g.moveTo(0, 0).lineTo(0, -h).stroke({ width: 0.06, color: 0xd8f2ff, alpha: 0.65 });
    g.ellipse(0, 0, 0.14, 0.08).fill({ color: 0xd8f2ff, alpha: 0.7 }).stroke({ width: 0.04, color: INK, alpha: 0.6 });
  }

  /** Figures turn to face the nearest enemy. Only recomputed when the state changes. */
  private updateLooks(s: GameState): void {
    const enemies: [Vec[], Vec[]] = [[], []];
    for (const u of s.units) {
      if (!u.onBoard || u.destroyed) continue;
      for (const m of u.models) if (m.alive) enemies[u.owner === 0 ? 1 : 0].push(m.pos);
    }
    for (const u of s.units) {
      if (!u.onBoard) continue;
      const list = enemies[u.owner];
      for (const m of u.models) {
        const v = this.models.get(`${u.uid}:${m.id}`);
        if (!v || !m.alive || !v.turns) continue;
        let best = Infinity;
        let bx = 0;
        let by = 0;
        for (const e of list) {
          const dx = e.x - m.pos.x;
          const dy = e.y - m.pos.y;
          const d = dx * dx + dy * dy;
          if (d < best && d > 1e-6) {
            best = d;
            bx = dx;
            by = dy;
          }
        }
        void by;
        const face: 1 | -1 = best === Infinity ? (u.owner === 0 ? 1 : -1) : Math.abs(bx) < 0.3 ? v.faceTarget : bx >= 0 ? 1 : -1;
        if (face !== v.faceTarget) {
          v.faceTarget = face;
          v.idle = false;
        }
      }
    }
  }

  /** Redraw only the models whose visual inputs changed. */
  private refreshArt(s: GameState): void {
    const active = s.activePlayer;
    const quiet = s.over || s.phase === "scoring";
    for (const u of s.units) {
      if (!u.onBoard) continue;
      const prof = profileOf(u);
      const sel = this.selected === u.uid;
      const passive = isStructure(prof) && !prof.weapons.length;
      let ready = false;
      let spent = false;
      if (!quiet && !passive) {
        if (u.owner === active && this.readySet) {
          ready = this.readySet.has(u.uid);
          spent = !ready;
        } else {
          spent = u.status.acted;
          ready = u.owner === active && !spent;
        }
      }
      const st = u.status;
      const flags = `${spent ? 1 : 0}${ready ? 1 : 0}${st.hunkered ? 1 : 0}${st.slowedRounds > 0 ? 1 : 0}${st.braced ? 1 : 0}${st.shaken ? 1 : 0}`;
      for (const m of u.models) {
        if (!m.alive) continue;
        const v = this.models.get(`${u.uid}:${m.id}`);
        if (!v) continue;
        const leader = sel && this.leader === m.id;
        const sig = `${u.owner}|${m.hp}/${m.shield}|${flags}|${sel ? 1 : 0}${leader ? 1 : 0}|${m.elevation}`;
        if (sig === v.sig) continue;
        v.sig = sig;
        v.spent = spent;
        v.ready = ready;
        v.shaken = st.shaken;
        v.hunkered = st.hunkered;
        v.idle = false;
        this.drawStatus(v, u, m, prof, { sel, leader, slowed: st.slowedRounds > 0, braced: st.braced });
      }
    }
  }

  private drawStatus(v: ModelView, u: Unit, m: Model, prof: UnitProfile, o: { sel: boolean; leader: boolean; slowed: boolean; braced: boolean }): void {
    const r = prof.baseRadius;
    const ry = r * BASE_RY;
    const team = PLAYER_COLORS[u.owner];
    const figLift = v.flying ? v.liftTarget : 0;
    const top = -(v.tex.meta.top + figLift);
    // under the base: selection
    const g = v.under.clear();
    if (o.sel) {
      g.ellipse(0, 0.05, r + 0.42, ry + 0.4).fill({ color: ACCENT, alpha: 0.35 });
      dashCircle(g, 0, 0.05, r + 0.42, 12, 0.62, this.time / 1000, ry + 0.4);
      g.stroke({ width: 0.16, color: INK });
      dashCircle(g, 0, 0.05, r + 0.42, 12, 0.62, this.time / 1000, ry + 0.4);
      g.stroke({ width: 0.09, color: ACCENT });
    }
    // ready ring: pulses (alpha animated in tick)
    const rr = v.readyRing.clear();
    if (v.ready) {
      rr.ellipse(0, 0.04, r + 0.3, ry + 0.28).fill({ color: team, alpha: 0.28 });
      rr.ellipse(0, 0.04, r + 0.3, ry + 0.28).stroke({ width: 0.2, color: INK, alpha: 0.7 });
      rr.ellipse(0, 0.04, r + 0.3, ry + 0.28).stroke({ width: 0.11, color: shade(team, 0.35) });
    }
    // spent: greyed and stood down, with a DONE tag
    const grey = v.spent ? 0xa29d97 : 0xffffff;
    v.figSprite.tint = grey;
    v.base.tint = v.spent ? 0xa09a94 : 0xffffff;
    v.tag.visible = v.spent && m.id === u.models.find((x) => x.alive)?.id;
    // in front: sandbags for hunkered models, goo for slowed ones
    const f = v.fore.clear();
    if (o.slowed) {
      for (const [x, s] of [[-0.5, 0.16], [0.1, 0.2], [0.5, 0.13]] as const) {
        f.ellipse(x * r, ry * 0.75, s * 1.4, s * 0.8).fill({ color: 0x8fd33a, alpha: 0.9 }).stroke({ width: 0.04, color: INK });
      }
    }
    if (v.hunkered) {
      const n = Math.max(4, Math.round(r * 7));
      for (let i = 0; i < n; i++) {
        const a = Math.PI * 0.08 + (i / (n - 1)) * Math.PI * 0.84;
        const x = Math.cos(a) * (r + 0.12);
        const y = Math.sin(a) * (ry + 0.06) - 0.05;
        f.ellipse(x + 0.03, y + 0.05, 0.25, 0.15).fill({ color: INK, alpha: 0.6 });
        f.ellipse(x, y, 0.25, 0.15).fill(0xb89a68).stroke({ width: 0.05, color: INK });
        f.moveTo(x - 0.12, y - 0.02).lineTo(x + 0.1, y + 0.03).stroke({ width: 0.025, color: INK, alpha: 0.6 });
      }
    }
    // HUD: shield, braced, leader, pips
    const h = v.hud.clear();
    if (m.shield > 0) {
      h.ellipse(0, 0, r + 0.24, ry + 0.22).stroke({ width: 0.14, color: INK, alpha: 0.5 });
      h.ellipse(0, 0, r + 0.24, ry + 0.22).stroke({ width: 0.07, color: SHIELD, alpha: 0.95 });
      h.arc(0, 0, r + 0.24, -Math.PI * 0.85, -Math.PI * 0.6).stroke({ width: 0.12, color: 0xffffff, alpha: 0.85 });
    }
    if (o.braced) {
      const x = r * 0.85;
      const y = ry * 0.1;
      h.poly([x - 0.2, y - 0.22, x + 0.2, y - 0.22, x + 0.2, y + 0.02, x, y + 0.24, x - 0.2, y + 0.02]).fill(0xd8d0c4).stroke({ width: 0.05, color: INK });
    }
    if (o.leader) h.star(0, top - 0.32, 5, 0.34, 0.16).fill(ACCENT).stroke({ width: 0.07, color: INK });
    const total = prof.hp + prof.shield;
    if (total > 1) {
      const barY = ry + 0.24;
      const bw = Math.max(r * 1.8, total * 0.26);
      const pw = bw / total;
      h.roundRect(-bw / 2 - 0.07, barY - 0.07, bw + 0.14, 0.32, 0.06).fill(INK);
      for (let i = 0; i < total; i++) {
        const isShield = i >= prof.hp;
        const filled = isShield ? i - prof.hp < m.shield : i < m.hp;
        h.rect(-bw / 2 + i * pw + 0.03, barY, pw - 0.06, 0.18).fill(filled ? (isShield ? SHIELD : 0x7fdc5a) : 0x4a3a32);
      }
    }
    v.mark.visible = v.shaken;
    v.mark.position.set(o.leader ? 0.45 : 0, top - 0.32);
  }

  // ---------- engagement, objectives, flags ----------

  private drawEngaged(s: GameState): void {
    const under = this.engageUnder.clear();
    const over = this.engageOver.clear();
    const live = s.units.filter((u) => u.onBoard && !u.destroyed);
    const a = live.filter((u) => u.owner === 0);
    const b = live.filter((u) => u.owner === 1);
    const marked = new Set<Model>();
    for (const ua of a) {
      const ra = profileOf(ua).baseRadius;
      for (const ub of b) {
        const rb = profileOf(ub).baseRadius;
        let best: { p: Vec; d: number } | null = null;
        for (const am of ua.models) {
          if (!am.alive) continue;
          for (const bm of ub.models) {
            if (!bm.alive) continue;
            if (Math.abs(am.pos.x - bm.pos.x) > ra + rb + 1.5 || Math.abs(am.pos.y - bm.pos.y) > ra + rb + 1.5) continue;
            if (!modelsEngage(ua, am, ub, bm)) continue;
            const pa = ringPos(ua, am);
            const pb = ringPos(ub, bm);
            const d = dist(pa, pb);
            for (const [m, p, r] of [[am, pa, ra], [bm, pb, rb]] as const) {
              if (marked.has(m)) continue;
              marked.add(m);
              dashCircle(under, p.x, p.y, r + 0.3, 8, 0.6, 0, (r + 0.3) * BASE_RY);
            }
            if (!best || d < best.d) best = { p: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 - 0.5 }, d };
          }
        }
        if (best) {
          over.star(best.p.x + 0.06, best.p.y + 0.08, 9, 0.55, 0.26).fill(INK);
          over.star(best.p.x, best.p.y, 9, 0.55, 0.26).fill(CLASH).stroke({ width: 0.07, color: INK });
          over.star(best.p.x, best.p.y, 9, 0.28, 0.13).fill(0xfff1c2);
        }
      }
    }
    if (marked.size) {
      under.stroke({ width: 0.17, color: INK, alpha: 0.8 });
      // second pass in colour on top of the ink
      for (const ua of live) {
        const r = profileOf(ua).baseRadius;
        for (const m of ua.models) {
          if (!marked.has(m)) continue;
          const p = ringPos(ua, m);
          dashCircle(under, p.x, p.y, r + 0.3, 8, 0.6, 0, (r + 0.3) * BASE_RY);
        }
      }
      under.stroke({ width: 0.1, color: CLASH, alpha: 0.95 });
    }
  }

  private drawObjectives(s: GameState, animate: boolean): void {
    for (const o of s.objectives) {
      const c = o.controller ?? presenceController(s, o);
      const color = c === null ? null : PLAYER_COLORS[c];
      let ov = this.objectives.get(o.id);
      let first = false;
      if (!ov) {
        first = true;
        ov = { base: new Graphics(), spin: new Graphics(), color, from: color, t: 1, o };
        ov.spin.position.set(o.pos.x, o.pos.y - o.elevation * PLAT_LIFT);
        this.objectiveLayer.addChild(ov.base, ov.spin);
        this.objectives.set(o.id, ov);
      }
      ov.o = o;
      if (ov.color === color && !first) continue;
      ov.from = first ? color : ov.color;
      ov.color = color;
      ov.t = first || !animate ? 1 : 0;
      if (!first && animate) {
        const at = { x: o.pos.x, y: o.pos.y - o.elevation * PLAT_LIFT };
        this.fx.ring(at, o.radius * 0.3, o.radius + 1.4, color ?? 0xffffff, 0, 0.22);
        this.fx.ring(at, o.radius * 0.1, o.radius + 0.6, 0xffffff, 120, 0.12);
      }
      this.drawObjective(ov);
      const sp = ov.spin.clear();
      dashCircle(sp, 0, 0, o.radius + 0.42, 12, 0.5);
      sp.stroke({ width: 0.17, color: INK, alpha: 0.6 });
      dashCircle(sp, 0, 0, o.radius + 0.42, 12, 0.5);
      sp.stroke({ width: 0.1, color: color ?? 0xfff3d6, alpha: color === null ? 0.6 : 0.95 });
    }
  }

  private drawObjective(ov: ObjectiveView): void {
    const o = ov.o;
    const x = o.pos.x;
    const y = o.pos.y - o.elevation * PLAT_LIFT;
    const g = ov.base.clear();
    const now = ov.color ?? 0xfff3d6;
    const from = ov.from ?? 0xfff3d6;
    const k = ov.t;
    g.circle(x, y, o.radius).fill({ color: k >= 1 ? now : from, alpha: 0.18 });
    if (k < 1) {
      // control sweeps round like a filling pie
      const a0 = -Math.PI / 2;
      g.moveTo(x, y).arc(x, y, o.radius, a0, a0 + Math.PI * 2 * easeInOut(k)).lineTo(x, y).fill({ color: now, alpha: 0.38 });
    }
    g.circle(x, y, o.radius).stroke({ width: 0.2, color: INK, alpha: 0.7 });
    g.circle(x, y, o.radius).stroke({ width: 0.11, color: now, alpha: 0.95 });
    if (o.team !== null) g.circle(x, y, o.radius + 0.75).stroke({ width: 0.12, color: PLAYER_COLORS[o.team], alpha: 0.9 });
    // marker plate: a riveted hex with the number on it
    const hex = (r: number, dy = 0) => {
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        pts.push(x + Math.cos(a) * r, y + dy + Math.sin(a) * r * 0.9);
      }
      return pts;
    };
    g.poly(hex(0.78, 0.14)).fill(INK);
    g.poly(hex(0.78)).fill(o.team === null ? 0x5a4636 : shade(PLAYER_COLORS[o.team], -0.35)).stroke({ width: 0.1, color: INK });
    g.poly(hex(0.6)).stroke({ width: 0.05, color: o.team === null ? ACCENT : PLAYER_COLORS[o.team], alpha: 0.9 });
  }

  private drawFlags(s: GameState): void {
    const g = this.flagLayer.clear();
    for (const f of s.flags) {
      const p = f.pos;
      const x = p.x + 0.9;
      const y = p.y - 0.6;
      g.ellipse(x + 0.15, y + 0.75, 0.55, 0.22).fill({ color: INK, alpha: 0.35 });
      g.circle(x, y, 0.74).stroke({ width: 0.2, color: INK });
      g.circle(x, y, 0.74).stroke({ width: 0.1, color: PLAYER_COLORS[f.team] });
      g.circle(x, y, 0.56).fill(0xd99a4e).stroke({ width: 0.09, color: INK });
      g.moveTo(x - 0.3, y + 0.35).arc(x, y, 0.45, 2.2, 3.4).stroke({ width: 0.06, color: 0x8a5424, alpha: 0.8 });
      for (const [dx, dy] of [[-0.2, -0.15], [0.15, 0.1], [-0.05, 0.25]] as const) g.circle(x + dx, y + dy, 0.09).fill(0x3a1e0c);
      g.arc(x, y, 0.4, -2.6, -1.8).stroke({ width: 0.08, color: 0xffffff, alpha: 0.6 });
    }
  }

  // ---------- hover + overlays ----------

  private hitUnit(p: Vec): Unit | null {
    let best: { u: Unit; d: number } | null = null;
    for (const u of this.units.values()) {
      if (!u.onBoard || u.destroyed) continue;
      const r = profileOf(u).baseRadius + 0.15;
      for (const m of u.models) {
        if (!m.alive) continue;
        const q = drawPos(u, m);
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        if (Math.abs(dx) > r || Math.abs(dy) > r) continue;
        const d = Math.hypot(dx, dy);
        if (d <= r && (!best || d < best.d)) best = { u, d };
      }
    }
    return best?.u ?? null;
  }

  private updateHover(force: boolean): void {
    const u = this.pointer ? this.hitUnit(this.pointer) : null;
    const uid = u?.uid ?? null;
    if (uid === this.hoverUid && !force) return;
    this.hoverUid = uid;
    const g = this.hoverLayer.clear();
    if (!u) return;
    const r = profileOf(u).baseRadius;
    const color = shade(PLAYER_COLORS[u.owner], 0.45);
    const pts = aliveModels(u).map((m) => ringPos(u, m));
    // Thin web between squad mates so the whole unit reads as one thing
    for (let i = 1; i < pts.length; i++) {
      let j = 0;
      for (let k = 1; k < i; k++) if (dist(pts[k]!, pts[i]!) < dist(pts[j]!, pts[i]!)) j = k;
      dashLine(g, pts[j]!, pts[i]!, 0.25, 0.2);
    }
    if (pts.length > 1) g.stroke({ width: 0.1, color: 0xffffff, alpha: 0.9 });
    for (const p of pts) {
      g.ellipse(p.x, p.y, r + 0.36, (r + 0.36) * BASE_RY).fill({ color, alpha: 0.3 }).stroke({ width: 0.18, color: INK, alpha: 0.7 });
      g.ellipse(p.x, p.y, r + 0.36, (r + 0.36) * BASE_RY).stroke({ width: 0.09, color: 0xffffff, alpha: 0.95 });
    }
  }

  private drawOverlay(v: RenderView): void {
    const g = this.overlayLayer.clear();
    const top = this.topOverlay.clear();
    if (v.zone) {
      for (const poly of v.zone) g.poly(flat(poly)).fill({ color: 0xffffff, alpha: 0.16 });
      for (const poly of v.zone) dashPoly(g, poly, 0.5, 0.3);
      g.stroke({ width: 0.14, color: 0xffffff, alpha: 0.95 });
    }
    if (v.moveRing) {
      const { center: c, radius } = v.moveRing;
      g.circle(c.x, c.y, radius).fill({ color: 0xffffff, alpha: 0.09 });
      dashCircle(g, c.x, c.y, radius, Math.max(16, Math.round(radius * 5)), 0.6);
      g.stroke({ width: 0.17, color: INK, alpha: 0.55 });
      dashCircle(g, c.x, c.y, radius, Math.max(16, Math.round(radius * 5)), 0.6);
      g.stroke({ width: 0.09, color: 0xffffff, alpha: 0.9 });
    }
    if (v.noGo) drawNoGo(g, v.noGo);
    if (v.drift) {
      // Above the miniatures, so it reads over a crowded spot.
      const { center: c, radius } = v.drift;
      g.circle(c.x, c.y, radius).fill({ color: 0xff8a3d, alpha: 0.1 });
      dashCircle(top, c.x, c.y, radius, Math.max(16, Math.round(radius * 4)), 0.5);
      top.stroke({ width: 0.16, color: INK, alpha: 0.6 });
      dashCircle(top, c.x, c.y, radius, Math.max(16, Math.round(radius * 4)), 0.5);
      top.stroke({ width: 0.09, color: 0xff8a3d, alpha: 0.95 });
    }
    if (v.blast) {
      const { center: c, radius } = v.blast;
      g.circle(c.x, c.y, radius).fill({ color: 0xff8a3d, alpha: 0.3 }).stroke({ width: 0.14, color: INK });
      g.circle(c.x, c.y, radius).stroke({ width: 0.08, color: 0xff8a3d });
      top.circle(c.x, c.y, radius).stroke({ width: 0.14, color: INK, alpha: 0.7 });
      top.circle(c.x, c.y, radius).stroke({ width: 0.08, color: 0xff8a3d });
      g.circle(c.x, c.y, radius * 0.5).stroke({ width: 0.06, color: 0xff8a3d, alpha: 0.8 });
      g.moveTo(c.x - radius - 0.3, c.y).lineTo(c.x - radius * 0.3, c.y).moveTo(c.x + radius * 0.3, c.y).lineTo(c.x + radius + 0.3, c.y);
      g.moveTo(c.x, c.y - radius - 0.3).lineTo(c.x, c.y - radius * 0.3).moveTo(c.x, c.y + radius * 0.3).lineTo(c.x, c.y + radius + 0.3);
      g.stroke({ width: 0.08, color: INK, alpha: 0.8 });
    }
    const color = v.ghostOk ? GOOD : BAD;
    if (v.path && v.path.length > 1) {
      const pl = new Polyline(v.path);
      for (let d = 0.25; d < pl.length - 0.3; d += 0.45) {
        const p = pl.at(d);
        g.circle(p.x, p.y, 0.12).fill({ color, alpha: 0.95 }).stroke({ width: 0.04, color: INK });
      }
      const end = v.path[v.path.length - 1]!;
      const pre = pl.at(Math.max(0, pl.length - 0.6));
      const L = dist(pre, end) || 1;
      const ux = (end.x - pre.x) / L;
      const uy = (end.y - pre.y) / L;
      g.poly([end.x, end.y, end.x - ux * 0.55 - uy * 0.33, end.y - uy * 0.55 + ux * 0.33, end.x - ux * 0.55 + uy * 0.33, end.y - uy * 0.55 - ux * 0.33]).fill(color).stroke({ width: 0.06, color: INK });
    }
    for (const gh of v.ghosts) {
      drawGhost(top, gh.pos, gh.radius, v.ghostOk, GOOD, BAD);
      if (gh.cover && v.ghostOk) drawCoverPip(top, gh.pos, gh.radius, gh.cover);
    }
    let aimLabel = 0;
    for (const l of v.sightLines) {
      const at = (t: number): Vec => ({ x: l.from.x + (l.to.x - l.from.x) * t, y: l.from.y + (l.to.y - l.from.y) * t });
      // Where the shot stops working: the weapon's reach, or the first thing that blocks sight.
      const block = l.marks?.find((m) => m.kind === "blocks")?.t;
      const cut = Math.min(1, l.rangeT ?? 1, block ?? 1);
      const reach = at(cut);
      const live = l.ok ? GOOD : cut < 1 ? 0xfff3d6 : BAD;
      if (cut > 0.001) {
        dashLine(top, l.from, reach, 0.4, 0.22);
        top.stroke({ width: 0.15, color: INK, alpha: 0.5 });
        dashLine(top, l.from, reach, 0.4, 0.22);
        top.stroke({ width: 0.08, color: live, alpha: 0.95 });
      }
      if (cut < 0.999) {
        dashLine(top, reach, l.to, 0.18, 0.22);
        top.stroke({ width: 0.12, color: INK, alpha: 0.35 });
        dashLine(top, reach, l.to, 0.18, 0.22);
        top.stroke({ width: 0.07, color: BAD, alpha: 0.85 });
      }
      if (l.rangeT !== undefined && l.rangeT < 1) drawRangeTick(top, l.from, l.to, at(l.rangeT));
      top.circle(l.to.x, l.to.y, 0.13).fill(l.ok ? GOOD : BAD).stroke({ width: 0.04, color: INK });
      for (const m of l.marks ?? []) drawShotMark(top, at(m.t), m.kind);
      if (l.label) this.aimLabel(aimLabel++, l.label, at(l.ok ? 0.55 : 0.3), l.ok ? 0xffffff : 0xffd2c8);
    }
    for (let i = aimLabel; i < this.aimLabels.length; i++) this.aimLabels[i]!.visible = false;
    for (const t of v.targets) {
      const u = this.units.get(t.uid);
      if (!u || !u.onBoard) continue;
      const r = profileOf(u).baseRadius + 0.34;
      const c = t.ok ? GOOD : BAD;
      for (const m of u.models) {
        if (!m.alive) continue;
        const p = ringPos(u, m);
        top.ellipse(p.x, p.y, r, r * BASE_RY).stroke({ width: 0.17, color: INK, alpha: t.ok ? 0.7 : 0.3 });
        top.ellipse(p.x, p.y, r, r * BASE_RY).stroke({ width: 0.1, color: c, alpha: t.ok ? 1 : 0.45 });
        if (t.ok) {
          top.moveTo(p.x - r - 0.22, p.y).lineTo(p.x - r + 0.15, p.y).moveTo(p.x + r - 0.15, p.y).lineTo(p.x + r + 0.22, p.y);
          top.moveTo(p.x, p.y - r - 0.22).lineTo(p.x, p.y - r + 0.15).moveTo(p.x, p.y + r - 0.15).lineTo(p.x, p.y + r + 0.22);
          top.stroke({ width: 0.09, color: c });
        }
      }
    }
    for (const uid of v.exhausted ?? []) {
      const u = this.units.get(uid);
      const m = u?.onBoard ? u.models.find((x) => x.alive) : undefined;
      if (u && m) drawExhausted(top, ringPos(u, m), profileOf(u).baseRadius);
    }
    if (v.attack) drawAttackMark(top, v.attack);
    for (const uid of v.friendlyMarks) {
      const u = this.units.get(uid);
      if (!u || !u.onBoard) continue;
      const r = profileOf(u).baseRadius + 0.32;
      for (const m of u.models) {
        if (!m.alive) continue;
        const p = ringPos(u, m);
        dashCircle(top, p.x, p.y, r, 8, 0.6, 0, r * BASE_RY);
      }
      top.stroke({ width: 0.11, color: SHIELD });
    }
  }

  // ---------- effects ----------

  floatText(pos: Vec, text: string, color = 0xffffff): void {
    // Phase announcements become the banner (deduped against the state-diff banner)
    const phase = (Object.keys(PHASE_NAMES) as Phase[]).find((p) => text === `${PHASE_NAMES[p]}!`);
    if (phase) {
      // the state diff already announces phase changes; only add one if it's still the current phase
      if (this.autoPhaseBanners && (!this.lastState || this.lastState.phase === phase)) void this.phaseBanner(phase, this.lastState?.round ?? 1);
      return;
    }
    this.fx.float(pos, text, color);
  }

  private setFrame(v: ModelView, f: number): void {
    if (f === v.frame) return;
    v.frame = f;
    v.figSprite.texture = v.tex.frames[f]!;
    v.flash.texture = v.tex.white[f]!;
    v.castSprite.texture = v.tex.white[f]!;
  }

  private tick(dt: number): void {
    this.time += dt;
    const now = this.time;
    const reduced = this.reduced;
    this.fx.update(dt);
    this.dropShip.update(dt);
    this.bannerFx.update(dt);
    if (this.cam.ppi !== this.camT.ppi || this.cam.x !== this.camT.x || this.cam.y !== this.camT.y) {
      const k = reduced ? 1 : 1 - Math.exp(-dt / 70);
      const close = Math.abs(this.cam.ppi - this.camT.ppi) < 0.01 && Math.abs(this.cam.x - this.camT.x) < 0.5 && Math.abs(this.cam.y - this.camT.y) < 0.5;
      if (close || k >= 1) this.cam = { ...this.camT };
      else {
        this.cam.ppi += (this.camT.ppi - this.cam.ppi) * k;
        this.cam.x += (this.camT.x - this.cam.x) * k;
        this.cam.y += (this.camT.y - this.cam.y) * k;
      }
      this.applyCam();
    }
    const pulse = 0.55 + 0.45 * Math.sin(now / 260);
    for (const v of this.models.values()) {
      if (!v.root.visible) continue;
      if (v.ready && !v.anim) v.readyRing.alpha = reduced ? 0.9 : pulse;
      if (v.idle) continue;
      let hop = 0;
      let tilt = 0;
      let sx = 1;
      let sy = 1;
      let ox = 0;
      let oy = 0;
      let rot = 0;
      let frame = 0;
      let busy = false;
      if (v.path) {
        busy = true;
        v.pathT += dt;
        const k = Math.min(1, v.pathT / v.pathDur);
        const e = reduced ? k : easeInOut(k);
        const p = v.path.at(e * v.path.length);
        const ahead = v.path.at(Math.min(v.path.length, e * v.path.length + 0.3));
        if (v.turns && Math.abs(ahead.x - p.x) > 0.02) v.face = ahead.x > p.x ? 1 : -1;
        v.root.position.set(p.x, p.y);
        if (!v.structure && !reduced) {
          if (v.flying) {
            v.bank += ((ahead.x - p.x) * 0.9 - v.bank) * Math.min(1, dt / 120);
          } else {
            const hops = Math.max(1, Math.round(v.path.length / 1.2));
            const w = Math.sin(k * Math.PI * hops);
            hop = Math.abs(w) * (v.kind === "walker" || v.kind === "brute" ? 0.14 : 0.3);
            tilt = w * (v.charging ? 0.05 : 0.09);
            sx = 1 + 0.08 * (1 - Math.abs(w));
            sy = 1 - 0.08 * (1 - Math.abs(w));
            frame = Math.floor(v.pathT / 140) % 2;
            if (v.charging) rot = v.face * 0.16;
          }
        }
        if (k >= 1) {
          v.path = null;
          v.charging = false;
          v.root.position.set(v.target.x, v.target.y);
        }
      } else if (v.face !== v.faceTarget) {
        v.face = v.faceTarget;
        if (!reduced) {
          sx *= 0.85;
        }
      }
      if (v.lift !== v.liftTarget) {
        busy = true;
        const d = v.liftTarget - v.lift;
        v.lift = reduced || Math.abs(d) < 0.01 ? v.liftTarget : v.lift + d * Math.min(1, dt / 90);
      }
      // idle life
      let bob = 0;
      if (!reduced) {
        const [amp, period] = BREATH[v.kind];
        const ph = (now / 1000 / period) * Math.PI * 2 + v.seed;
        const a = v.spent ? amp * 0.4 : amp;
        if (!v.path && a) {
          sy *= 1 + a * Math.sin(ph);
          sx *= 1 - a * 0.4 * Math.sin(ph);
        }
        if (v.flying) {
          bob = Math.sin(now / 420 + v.seed) * 0.14;
          if (!v.path) v.bank += (Math.sin(now / 1300 + v.seed) * 0.06 - v.bank) * Math.min(1, dt / 300);
          rot += v.bank * 0.35;
          frame = v.kind === "skiff" ? Math.floor(now / 320 + v.seed) % 2 : Math.floor(now / (v.kind === "bug" ? 55 : 45)) % 2;
          v.cast.scale.set(1 - bob * 0.6);
        } else if (v.kind === "pod" || v.kind === "ward" || v.kind === "hole") {
          frame = Math.floor(now / 650 + v.seed * 3) % 2;
          if (v.kind === "ward") bob = Math.sin(now / 500 + v.seed) * 0.08;
        } else if (v.kind === "walker" && !v.path) {
          ox += Math.sin(now / 28) * 0.006;
          if (!v.spent) frame = 0;
        }
        if (v.shaken && Math.floor(now / 70 + v.seed * 5) % 4 === 0) {
          ox += Math.sin(now * 1.7) * 0.05;
          rot += Math.sin(now * 2.3) * 0.04;
        }
        if (v.shaken) v.mark.rotation = Math.sin(now / 90) * 0.15;
      }
      if (v.hunkered && !v.flying) {
        sy *= 0.84;
        sx *= 1.05;
      }
      // pulses: recoil, lunge, flinch
      if (v.recoil) {
        busy = true;
        const p = v.recoil;
        p.t += dt;
        if (p.t >= 0) {
          const k = Math.min(1, p.t / p.dur);
          if (!reduced) ox += p.dx * 0.13 * (1 - k) * (1 - k);
          v.muzzle.visible = p.t < 90;
          v.muzzle.scale.set(iconTex("muzzle").scale * (reduced ? 0.8 : 0.7 + Math.random() * 0.5));
          if (k >= 1) {
            v.recoil = null;
            v.muzzle.visible = false;
          }
        }
      }
      if (v.lunge) {
        busy = true;
        const p = v.lunge;
        p.t += dt;
        if (p.t >= 0) {
          const k = Math.min(1, p.t / p.dur);
          if (!reduced) {
            const s = Math.sin(k * Math.PI) * (k < 0.35 ? 1 : 1);
            ox += p.dx * 0.5 * s;
            oy += p.dy * 0.35 * s;
            rot += (p.dx >= 0 ? 1 : -1) * 0.2 * s;
          }
          if (k >= 1) v.lunge = null;
        }
      }
      if (v.flinch) {
        busy = true;
        const p = v.flinch;
        p.t += dt;
        if (p.t >= 0) {
          const k = Math.min(1, p.t / p.dur);
          v.flash.alpha = k < 0.45 ? 1 - k / 0.45 : 0;
          if (!reduced) {
            ox += Math.sin(k * 38) * 0.07 * (1 - k);
            rot -= v.face * 0.12 * Math.sin(k * Math.PI) * (1 - k);
          }
          if (k >= 1) {
            v.flinch = null;
            v.flash.alpha = 0;
          }
        }
      }
      if (v.temp) {
        busy = true;
        const glitch = !reduced && Math.floor(now / 70 + v.seed * 11) % 31 === 0;
        v.fig.alpha = reduced ? 0.82 : 0.78 + 0.12 * Math.sin(now / 170 + v.seed) - (glitch ? 0.35 : 0);
        if (glitch) ox += 0.08;
      }
      if (v.anim) {
        busy = true;
        const a = v.anim;
        a.t += dt;
        const k = Math.min(1, Math.max(0, a.t / a.dur));
        if (a.t >= 0) {
          if (a.kind === "pop") {
            if (reduced) v.root.alpha = k;
            else {
              const drop = 1 - easeOut(Math.min(1, k * 1.6));
              oy -= drop * 1.4;
              const land = k > 0.6 ? backOut((k - 0.6) / 0.4) : 0;
              sy *= k > 0.6 ? 0.85 + 0.15 * land : 1;
              sx *= k > 0.6 ? 1.12 - 0.12 * land : 1;
              v.root.alpha = Math.min(1, k * 4);
            }
          } else if (a.kind === "ko") {
            if (!reduced) {
              const c = easeOut(Math.min(1, k * 1.7));
              if (v.structure) {
                sy *= 1 - 0.55 * c;
                ox += Math.sin(k * 50) * 0.05 * (1 - k);
              } else if (v.flying) {
                oy += c * v.lift * 0.8;
                rot += v.face * 0.9 * c;
              } else {
                rot += v.face * 1.35 * c;
                sy *= 1 - 0.25 * c;
                oy += 0.1 * c;
              }
            }
            v.root.alpha = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
          } else {
            const s = reduced ? 1 : 1 - 0.85 * k;
            sx *= s;
            sy *= s;
            rot += reduced ? 0 : k * 2.2;
            v.root.alpha = (1 - k) * (reduced ? 1 : 0.6 + 0.4 * Math.abs(Math.sin(k * 30)));
          }
        } else if (a.kind === "pop") {
          v.root.alpha = 0;
        }
        if (k >= 1) {
          if (a.kind !== "pop") v.root.visible = false;
          v.anim = null;
          v.root.alpha = 1;
          sx = 1;
          sy = 1;
          rot = 0;
          ox = 0;
          oy = 0;
        }
      }
      this.setFrame(v, frame);
      // apply: the miniature hops/tilts as a whole; the figure breathes, recoils, lunges, banks
      if (v.flying) {
        v.mini.position.set(0, 0);
        v.mini.rotation = 0;
        v.fig.position.set(ox, -(v.lift + bob) + oy);
      } else {
        v.mini.position.set(0, -(v.lift + hop) + (v.anim?.kind === "pop" ? oy : 0));
        v.mini.rotation = tilt;
        v.fig.position.set(ox, v.anim?.kind === "pop" ? 0 : oy);
      }
      v.fig.scale.set(v.face * sx, sy);
      v.fig.rotation = rot;
      v.castSprite.scale.x = v.face * v.tex.scale;
      if (reduced && !busy && !v.path) v.idle = true;
    }
    // Gentle pulses for hover/engagement, slow spin for held objectives
    if (reduced) {
      this.hoverLayer.alpha = 0.9;
      this.engageOver.alpha = 1;
    } else {
      this.hoverLayer.alpha = 0.72 + 0.28 * Math.sin(now / 200);
      this.engageOver.alpha = 0.75 + 0.25 * Math.sin(now / 130);
    }
    for (const ov of this.objectives.values()) {
      if (ov.t < 1) {
        ov.t = reduced ? 1 : Math.min(1, ov.t + dt / 650);
        this.drawObjective(ov);
      }
      if (!reduced && ov.color !== null) ov.spin.rotation += dt / 4000;
    }
  }
}
