// One miniature on the new engine, in three layers:
//   footprint: the flat base layer (goes under every figure on the board),
//   figure:    the posed rig: a silhouette (ink) sprite behind a colour sprite for every part and
//              limb segment, all from one baked atlas page, re-posed each frame with matrices only,
//   effects:   muzzle flash, compressor exhaust, the flyer's stem and glow, riding the figure.
// Side view (Ink Rig) mirrors to face left/right; top view (Overhead) turns freely to face.

import { ColorMatrixFilter, Container, Graphics, Matrix, Sprite, Texture } from "pixi.js";
import { tierFor, type AtlasEntry } from "./atlas";
import { skinNow, type Skin } from "./bake";
import { addClip, channels, CLIPS, statusPose } from "./clips";
import { Footprint } from "./footprint";
import { drawOrder, poseRig, type Pose } from "./pose";
import type { UnitRigs } from "./registry";
import { readPart } from "./svg";
import type { Channels, ClipId, Mat, Pt, RigDef, RigView, Status, Tier } from "./types";
import { NO_STATUS } from "./types";

const INK = 0x141414;
const TAU = Math.PI * 2;

/** Every "pulse" the board renderer sends (recoil, flinch...) is an object: a new object = a new pulse. */
export interface MiniDrive {
  /** Screen pixels per board inch. */
  ppi: number;
  walking: boolean;
  /** Height above the ground (inches): platforms for walkers, altitude for flyers. */
  lift: number;
  /** Side view facing: 1 right, -1 left. */
  face?: 1 | -1;
  reduced?: boolean;
  /** Base position (board inches). */
  x: number;
  y: number;
  visible: boolean;
  alpha: number;
}

interface Slot {
  id: string;
  colour: Sprite;
  ink: Sprite;
  /** Limb segment with a shade stripe: flipped so the stripe stays on the side away from the light. */
  stripe: boolean;
  /** Its rect on the current atlas page. */
  entry: AtlasEntry | null;
}

interface Playing {
  id: ClipId;
  t: number;
}

const blend = (cur: number, target: number, dt: number, ms: number) => cur + (target - cur) * Math.min(1, dt / ms);

export class RigMini {
  readonly footprint: Container;
  readonly figure = new Container();
  readonly rig: RigDef;
  readonly view: RigView;
  private foot: Footprint;
  /** Mirrors (side) or turns (top) the posed figure. */
  private facer = new Container();
  /** Rig space (design units) → inches. */
  private body = new Container();
  private inkLayer = new Container();
  private colourLayer = new Container();
  private fx = new Graphics();
  private stem: Graphics | null = null;
  private slots: Slot[] = [];
  private skin: Skin | null = null;
  private tier: Tier | null = null;
  private status: Status = { ...NO_STATUS };
  /** Status pose weights, eased in and out. */
  private w = { hurt: 0, engaged: 0, shaken: 0, hunkered: 0, flying: 0 };
  private hunkered = false;
  private playing: Playing[] = [];
  private time = Math.random() * 2400;
  private walkT = 0;
  private wasWalking = false;
  private facing = -Math.PI / 2;
  private facingTarget = -Math.PI / 2;
  /** Direction of travel while walking (radians), or null. */
  private moveDir: number | null = null;
  private side: 1 | -1 = -1;
  private sideTurn = 1;
  private drainFilter: ColorMatrixFilter | null = null;
  private pulses = new WeakSet<object>();
  private puffs: { x: number; y: number; t: number }[] = [];
  private puffClock = 0;
  private c: Channels = channels();
  private lastPose: Pose | null = null;
  private tmp = new Matrix();
  private dead = false;
  private muzzleDir: Pt = { x: -1, y: 0 };

  constructor(
    private rigs: UnitRigs,
    view: RigView,
    private team: number,
    private baseR: number,
  ) {
    this.view = view;
    this.rig = view === "side" ? rigs.side : rigs.top;
    const upi = this.rig.unitsPerInch;
    this.foot = new Footprint({
      r: baseR,
      team,
      ground: this.rig.ground,
      view,
      shadow: this.rig.shadow ? { x: this.rig.shadow.x / upi, y: this.rig.shadow.y / upi, r: this.rig.shadow.r / upi } : undefined,
    });
    this.footprint = this.foot.root;
    this.body.scale.set(1 / upi);
    this.body.addChild(this.inkLayer, this.colourLayer, this.fx);
    this.facer.addChild(this.body);
    this.figure.addChild(this.facer);
    for (const d of drawOrder(this.rig)) {
      const ink = new Sprite(Texture.EMPTY);
      ink.tint = INK;
      const colour = new Sprite(Texture.EMPTY);
      this.inkLayer.addChild(ink);
      this.colourLayer.addChild(colour);
      this.slots.push({ id: d.id, colour, ink, stripe: !!d.limb && !!d.limb.def[d.limb.seg].stripe, entry: null });
    }
    this.figure.visible = false; // until the first bake lands
    this.foot.setFacing(this.facing);
  }

  setStatus(s: Partial<Status> & { hunkered?: boolean }): void {
    const { hunkered, ...rest } = s;
    if (hunkered !== undefined) this.hunkered = hunkered;
    this.status = { ...this.status, ...rest };
  }

  /** Face along a board vector (top view turns to it; side view mirrors by its x sign). */
  aimAt(dx: number, dy: number): void {
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return;
    this.facingTarget = Math.atan2(dy, dx);
    if (Math.abs(dx) > 0.3) this.side = dx >= 0 ? 1 : -1;
  }

  play(id: ClipId, delay = 0): void {
    if (id === "death") this.dead = true;
    this.playing = this.playing.filter((p) => p.id !== id);
    this.playing.push({ id, t: -delay });
    if (id === "recoil") this.emitPuff();
  }

  /** Fire a renderer pulse once: `pulse` is the renderer's pulse object (new object = new pulse). */
  pulse(id: ClipId, pulse: object | null | undefined, t: number): void {
    if (!pulse || this.pulses.has(pulse)) return;
    this.pulses.add(pulse);
    this.play(id, Math.max(0, -t));
  }

  /** Face the way it's walking (until the walk ends, then back to `aimAt`). */
  heading(dx: number, dy: number): void {
    if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) this.moveDir = Math.atan2(dy, dx);
  }

  /**
   * Where the muzzle will be once the model has turned to its target (inches from the base centre,
   * board axes), for tracers. `face`: the side view's facing if the caller decides it.
   */
  muzzleOffset(face?: 1 | -1): Pt {
    const pose = this.lastPose ?? poseRig(this.rig, this.c);
    const upi = this.rig.unitsPerInch;
    const m = { x: pose.muzzle.x / upi, y: pose.muzzle.y / upi };
    if (this.view === "side") return { x: m.x * -(face ?? this.side), y: m.y };
    const a = this.facingTarget + Math.PI / 2;
    return { x: m.x * Math.cos(a) - m.y * Math.sin(a), y: m.x * Math.sin(a) + m.y * Math.cos(a) };
  }

  // ---------- Rig Lab hooks ----------

  private debug: Graphics | null = null;
  private silhouette = false;

  /** Show or hide one drawable (part id, or `<limb>.upper|lower`). */
  setPartVisible(id: string, on: boolean): void {
    for (const s of this.slots) if (s.id === id) s.colour.visible = s.ink.visible = on;
  }

  /** Draw bones, joints, anchors, grips and the muzzle over the figure. */
  setDebug(on: boolean): void {
    if (on && !this.debug) this.body.addChild((this.debug = new Graphics()));
    if (!on && this.debug) {
      this.debug.destroy();
      this.debug = null;
    }
  }

  /** The silhouette test: the figure as one flat black shape. */
  setSilhouette(on: boolean): void {
    this.silhouette = on;
  }

  /** Bake page in use (Rig Lab read-out). */
  get skinInfo(): Skin | null {
    return this.skin;
  }

  private drawDebug(): void {
    const g = this.debug;
    const pose = this.lastPose;
    if (!g || !pose) return;
    g.clear();
    const f = pose.figure;
    const P = (p: Pt) => ({ x: f[0] * p.x + f[2] * p.y + f[4], y: f[1] * p.x + f[3] * p.y + f[5] });
    for (const l of pose.limbs.values()) {
      const [a, b, c] = [P(l.root), P(l.joint), P(l.end)];
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(c.x, c.y).stroke({ width: 1.2, color: 0x41e0ff });
      for (const p of [a, b]) g.circle(p.x, p.y, 2.2).fill(0x41e0ff);
    }
    const w = this.rig.parts.find((p) => p.id === this.rig.weapon);
    const wm = pose.mats.get(this.rig.weapon);
    if (w && wm) {
      for (const [id, p] of Object.entries(readPart(w.src).anchors)) {
        const q = { x: wm[0] * p.x + wm[2] * p.y + wm[4], y: wm[1] * p.x + wm[3] * p.y + wm[5] };
        if (id.startsWith("g")) g.poly([q.x, q.y - 3.2, q.x + 3.2, q.y, q.x, q.y + 3.2, q.x - 3.2, q.y]).fill(0xffd23a).stroke({ width: 0.8, color: 0x141414 });
        else if (id === "muzzle") g.circle(q.x, q.y, 2.6).stroke({ width: 1, color: 0xff5a3a });
      }
    }
    g.moveTo(-6, 0).lineTo(6, 0).moveTo(0, -6).lineTo(0, 6).stroke({ width: 1, color: 0xffffff });
  }

  /** Height of the figure's top above its base (inches), for markers drawn over it. */
  get top(): number {
    return this.view === "side" ? this.rig.height / this.rig.unitsPerInch : 0.35;
  }

  /** Base radius in inches. */
  get radius(): number {
    return this.baseR;
  }

  get tierNow(): Tier | null {
    return this.tier;
  }

  update(dt: number, d: MiniDrive): void {
    // ---- placement ----
    const flying = this.status.flying;
    const platform = flying ? 0 : d.lift;
    this.footprint.position.set(d.x, d.y - platform);
    this.footprint.visible = d.visible;
    this.footprint.alpha = d.alpha;
    if (!d.visible) return;

    // ---- zoom tier: swap to the new page once it's baked (bakes are queued, one at a time) ----
    const s = d.ppi / this.rig.unitsPerInch;
    const want = tierFor(s, this.tier ?? undefined);
    if (want !== this.tier || !this.skin) {
      const sk = skinNow(this.rig, this.rigs.colourway, this.team, want);
      if (sk) this.applySkin(sk);
      else if (!this.skin) {
        // nothing yet: try any tier that's already baked
        for (const t of ["token", "sheet", "tiny"] as Tier[]) {
          const any = skinNow(this.rig, this.rigs.colourway, this.team, t);
          if (any) {
            this.applySkin(any);
            break;
          }
        }
      }
    }

    // ---- clips ----
    const reduced = !!d.reduced;
    this.time += dt;
    if (d.walking && !this.wasWalking) this.walkT = 0;
    this.wasWalking = d.walking;
    if (d.walking) this.walkT += dt;
    const c = (this.c = channels());
    const view = this.view;
    if (!reduced && !this.dead) {
      if (d.walking) addClip(c, CLIPS[view].step, this.walkT);
      else addClip(c, CLIPS[view].idle, this.time);
      if (flying) addClip(c, CLIPS[view].bob, this.time);
    }
    // held status poses, eased in and out
    const st = this.status;
    const k = reduced ? 1e9 : 160;
    this.w.hurt = blend(this.w.hurt, st.hp < st.hpMax ? 1 : 0, dt, k);
    this.w.engaged = blend(this.w.engaged, st.engaged && !d.walking ? 1 : 0, dt, k);
    this.w.shaken = blend(this.w.shaken, st.shaken ? 1 : 0, dt, k * 1.5);
    this.w.hunkered = blend(this.w.hunkered, this.hunkered ? 1 : 0, dt, k);
    this.w.flying = blend(this.w.flying, flying ? 1 : 0, dt, k * 2);
    const add = (p: Partial<Channels>, w: number) => {
      if (w < 1e-3) return;
      for (const [ch, v] of Object.entries(p) as [keyof Channels, number][]) {
        if (ch === "gaitW") c.gaitW = Math.max(c.gaitW, v * w);
        else c[ch] += v * w;
      }
    };
    add(statusPose(view, { hp: 0, hpMax: 1, engaged: false, shaken: false }), this.w.hurt);
    add(statusPose(view, { hp: 1, hpMax: 1, engaged: true, shaken: false }), this.w.engaged);
    add(statusPose(view, { hp: 1, hpMax: 1, engaged: false, shaken: true }), this.w.shaken);
    add(view === "side" ? { pelvisY: 7, torsoRot: -4, headRot: 3 } : { rootSX: -0.06, rootSY: -0.06 }, this.w.hunkered);
    // one-shot clips (recoil, flinch, death) on top
    for (const p of this.playing) {
      p.t += dt;
      if (p.t >= 0) addClip(c, CLIPS[view][p.id], p.t);
    }
    this.playing = this.playing.filter((p) => p.id === "death" || p.t < CLIPS[view][p.id].dur);
    if (view === "side" && flying) c.lift += (d.lift * this.rig.unitsPerInch) * this.w.flying;

    // ---- facing ----
    if (view === "side") {
      this.side = d.face ?? this.side;
      // the wedge shows the exact facing; keep it on the side the figure faces
      if (Math.cos(this.facingTarget) * this.side < 0) this.facingTarget = Math.PI - this.facingTarget;
      // a quick card-flip when turning round
      this.sideTurn = reduced ? this.side : blend(this.sideTurn, this.side, dt, 45);
      this.facer.scale.x = -(Math.abs(this.sideTurn) < 0.15 ? Math.sign(this.sideTurn || 1) * 0.15 : this.sideTurn);
      this.facer.rotation = 0;
      this.facing = this.facingTarget;
    } else {
      if (!d.walking) this.moveDir = null;
      let diff = (this.moveDir ?? this.facingTarget) - this.facing;
      diff = ((diff + Math.PI) % TAU + TAU) % TAU - Math.PI;
      // 360°/s, eased into the last half radian
      const maxStep = (TAU * dt) / 1000;
      const step = reduced ? diff : Math.sign(diff) * Math.min(Math.abs(diff), Math.abs(diff) < 0.5 ? Math.abs(diff) * Math.min(1, dt / 60) + 1e-4 : maxStep);
      this.facing += step;
      this.facer.rotation = this.facing + Math.PI / 2 + (c.yaw * Math.PI) / 180;
      this.facer.scale.x = 1;
      this.foot.setShadow(Math.max(c.shadow, this.w.flying * 0.6), flying ? d.lift : 0);
    }
    this.foot.setFacing(this.facing);
    this.foot.draw(this.status, d.ppi);

    // ---- pose: matrices only, no vector redraw ----
    if (this.skin) this.place(c);
    this.figure.alpha = d.alpha;
    this.figure.position.set(0, 0);
    this.body.alpha = 1 - c.fade;
    // hit flash: the ink silhouette goes white and the colour falls away
    const f = Math.max(0, Math.min(1, c.flash));
    this.colourLayer.alpha = this.silhouette ? 0 : 1 - f * 0.92;
    this.inkLayer.tint = f > 0.02 ? lerpColour(INK, 0xffffff, f) : INK;
    if (this.debug) this.drawDebug();
    // (lighter than Classic's spent grey: the faction paint is already dark)
    this.colourLayer.tint = st.spent ? 0xbcb7af : 0xffffff;
    this.applyDrain(c.drain);
    this.drawFx(c, dt, d, reduced);
  }

  private applySkin(sk: Skin): void {
    this.skin = sk;
    this.tier = sk.tier;
    for (const s of this.slots) {
      s.colour.texture = sk.colour.get(s.id) ?? Texture.EMPTY;
      s.ink.texture = sk.ink.get(s.id) ?? Texture.EMPTY;
      s.entry = sk.plan.entries.find((e) => e.id === s.id) ?? null;
    }
    this.figure.visible = true;
  }

  private place(c: Channels): void {
    const pose = (this.lastPose = poseRig(this.rig, c));
    this.muzzleDir = pose.muzzleDir;
    const plan = this.skin!.plan;
    const inv = 1 / plan.k;
    const m = this.tmp;
    for (const s of this.slots) {
      const mat = pose.mats.get(s.id);
      const e = s.entry;
      if (!mat || !e) continue;
      let a: Mat = mat;
      // keep a limb's shade stripe on the side away from the top-left light
      if (s.stripe && a[2] + a[3] < 0) a = [a[0], a[1], -a[2], -a[3], a[4], a[5]];
      // sprite = pose · translate(origin of the texture rect) · scale(1 / bake resolution)
      m.set(a[0] * inv, a[1] * inv, a[2] * inv, a[3] * inv, a[0] * e.ox + a[2] * e.oy + a[4], a[1] * e.ox + a[3] * e.oy + a[5]);
      s.colour.setFromMatrix(m);
      s.ink.position.copyFrom(s.colour.position);
      s.ink.scale.copyFrom(s.colour.scale);
      s.ink.skew.copyFrom(s.colour.skew);
      s.ink.rotation = s.colour.rotation;
    }
  }

  private applyDrain(drain: number): void {
    if (drain > 0.05) {
      if (!this.drainFilter) {
        this.drainFilter = new ColorMatrixFilter();
        this.colourLayer.filters = [this.drainFilter];
      }
      this.drainFilter.saturate(-Math.min(0.85, drain), false);
      this.drainFilter.brightness(1 - drain * 0.15, true);
    } else if (this.drainFilter) {
      this.colourLayer.filters = [];
      this.drainFilter.destroy();
      this.drainFilter = null;
    }
  }

  private emitPuff(): void {
    if (this.puffs.length > 6) return;
    const pack = this.rig.parts.find((p) => p.id === "pack");
    if (!pack) return;
    const a = readPart(pack.src).anchors;
    const pose = this.lastPose;
    const m = pose?.mats.get("pack");
    for (const id of ["exhaust1", "exhaust2"]) {
      const p = a[id];
      if (!p || !m) continue;
      this.puffs.push({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5], t: 0 });
    }
  }

  private drawFx(c: Channels, dt: number, d: MiniDrive, reduced: boolean): void {
    // compressor exhaust: a puff now and then, more while walking
    if (!reduced && !this.dead) {
      this.puffClock += dt * (d.walking ? 2.2 : 1);
      if (this.puffClock > 1700) {
        this.puffClock = Math.random() * 400;
        this.emitPuff();
      }
    }
    const busy = this.puffs.length > 0 || c.muzzle > 0.5;
    const g = this.fx;
    if (!busy && !g.visible) return;
    g.clear();
    g.visible = busy;
    for (const p of this.puffs) {
      p.t += dt;
      const k = p.t / 800;
      const up = this.view === "side" ? -18 * k : 0;
      const drift = this.view === "side" ? 6 * k : 4 * k;
      g.circle(p.x + drift, p.y + up, 2.4 + 5 * k).fill({ color: 0xd8d0c0, alpha: 0.55 * (1 - k) });
    }
    this.puffs = this.puffs.filter((p) => p.t < 800);
    if (c.muzzle > 0.5 && this.lastPose) {
      const { x, y } = this.lastPose.muzzle;
      const dir = this.muzzleDir;
      const nx = -dir.y;
      const ny = dir.x;
      const L = this.view === "side" ? 16 : 10;
      const W = L * 0.45;
      g.poly([x + nx * W, y + ny * W, x + dir.x * L, y + dir.y * L, x - nx * W, y - ny * W, x + dir.x * L * 0.35, y + dir.y * L * 0.35])
        .fill(0xffe28a)
        .stroke({ width: 1.4, color: INK, join: "round" });
      g.circle(x + dir.x * 3, y + dir.y * 3, 3).fill(0xffffff);
    }
    // flyer: a clear stem and glow from the base up to the figure (side view)
    if (this.view === "side") {
      const lift = c.lift;
      if (lift > 1) {
        if (!this.stem) {
          this.stem = new Graphics();
          this.figure.addChildAt(this.stem, 0);
        }
        const upi = this.rig.unitsPerInch;
        const h = lift / upi;
        this.stem.clear();
        this.stem.ellipse(0, 0, this.baseR * 0.45, this.baseR * 0.22).fill({ color: 0xbfefff, alpha: 0.35 });
        this.stem.rect(-0.035, -h, 0.07, h).fill({ color: 0xd8f2ff, alpha: 0.45 });
        this.stem.rect(-0.01, -h, 0.02, h).fill({ color: 0xffffff, alpha: 0.6 });
        this.stem.visible = true;
      } else if (this.stem) this.stem.visible = false;
    }
  }

  destroy(): void {
    this.foot.destroy();
    this.drainFilter?.destroy();
    this.figure.destroy({ children: true });
  }
}

function lerpColour(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
