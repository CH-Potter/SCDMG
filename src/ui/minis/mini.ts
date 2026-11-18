// One miniature on the new engine, in three layers:
//   footprint: the flat base layer (goes under every figure on the board),
//   figure:    the posed rig: a silhouette (ink) sprite behind a colour sprite for every part and
//              limb segment, all from one baked atlas page, re-posed each frame with matrices only,
//   effects:   muzzle flash, exhaust and spore puffs, the flyer's stem and glow, riding the figure.
// Side view (Ink Rig) mirrors to face left/right; top view (Overhead) turns freely to face.
// The frame type (lean, insect, walker, vehicle, hover, structure) picks the clip set; the walk
// cycle advances with the distance actually walked, so planted feet don't skate.

import { ColorMatrixFilter, Container, Graphics, Matrix, Sprite, Texture } from "pixi.js";
import { tierFor, type AtlasEntry } from "./atlas";
import { releaseSkin, retainSkin, skinNow, skinReady, type Skin } from "./bake";
import { addClip, channels, clipsFor, hunkerPose, resetChannels, statusPose } from "./clips";
import { hexToNum } from "./color";
import { Footprint } from "./footprint";
import { drawOrder, poseRig, strideOf, type Pose } from "./pose";
import type { UnitRigs } from "./registry";
import { readPart } from "./svg";
import type { Channel, Channels, Clip, ClipId, Mat, Pt, RigDef, RigView, Status, Tier } from "./types";
import { NO_STATUS } from "./types";

const INK = 0x141414;
const TAU = Math.PI * 2;
const LAMP = 0xffe28a;
const PUFF = 0xd8d0c0;

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

type Weights = { hurt: number; engaged: number; shaken: number; hunkered: number; flying: number };
type PoseList = [Channel, number][];

const blend = (cur: number, target: number, dt: number, ms: number) => cur + (target - cur) * Math.min(1, dt / ms);
const entries = (p: Partial<Channels>): PoseList => Object.entries(p) as PoseList;

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
  private w: Weights = { hurt: 0, engaged: 0, shaken: 0, hunkered: 0, flying: 0 };
  private hunkered = false;
  private playing: Playing[] = [];
  private time = Math.random() * 2400;
  /** Walk cycle position in cycles (advanced by distance walked). */
  private walkPhase = 0;
  private wasWalking = false;
  private lastX = NaN;
  private lastY = NaN;
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
  // made once per mini: the clip set, the stride, the status poses, the exhaust points
  private clips: Record<ClipId, Clip>;
  private stride: number;
  private poses: { hurt: PoseList; engaged: PoseList; shaken: PoseList; hunkered: PoseList };
  private exhausts: { part: string; at: Pt }[] = [];
  private muzzleColour: number;
  private puffColour: number;

  constructor(
    private rigs: UnitRigs,
    view: RigView,
    private team: number,
    private baseR: number,
  ) {
    this.view = view;
    this.rig = view === "side" ? rigs.side : rigs.top;
    const rig = this.rig;
    const upi = rig.unitsPerInch;
    this.clips = clipsFor(rig);
    this.stride = strideOf(rig);
    const f = rig.frame;
    this.poses = {
      hurt: entries(statusPose(view, { hp: 0, hpMax: 1, engaged: false, shaken: false }, f)),
      engaged: entries(statusPose(view, { hp: 1, hpMax: 1, engaged: true, shaken: false }, f)),
      shaken: entries(statusPose(view, { hp: 1, hpMax: 1, engaged: false, shaken: true }, f)),
      hunkered: entries(hunkerPose(view, f)),
    };
    for (const p of rig.parts)
      for (const [id, at] of Object.entries(readPart(p.src).anchors)) if (id.startsWith("exhaust")) this.exhausts.push({ part: p.id, at });
    this.muzzleColour = rig.fx?.muzzle ? hexToNum(rig.fx.muzzle) : LAMP;
    this.puffColour = rig.fx?.puff ? hexToNum(rig.fx.puff) : PUFF;
    this.foot = new Footprint({
      r: baseR,
      team,
      ground: rig.ground,
      view,
      shadow: rig.shadow ? { x: rig.shadow.x / upi, y: rig.shadow.y / upi, r: rig.shadow.r / upi } : undefined,
    });
    this.footprint = this.foot.root;
    this.body.scale.set(1 / upi);
    this.body.addChild(this.inkLayer, this.colourLayer, this.fx);
    this.facer.addChild(this.body);
    this.figure.addChild(this.facer);
    for (const d of drawOrder(rig)) {
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
    for (let i = this.playing.length - 1; i >= 0; i--) if (this.playing[i]!.id === id) this.playing.splice(i, 1);
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
    if (this.view === "side") return { x: m.x * -(this.rig.fixed ? 1 : (face ?? this.side)), y: m.y };
    const a = (this.rig.fixed ? -Math.PI / 2 : this.facingTarget) + Math.PI / 2;
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
    const wm = w ? pose.mats.get(w.id) : undefined;
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

  private addPose(p: PoseList, w: number): void {
    if (w < 1e-3) return;
    const c = this.c;
    for (let i = 0; i < p.length; i++) {
      const [ch, v] = p[i]!;
      if (ch === "gaitW") c.gaitW = Math.max(c.gaitW, v * w);
      else c[ch] += v * w;
    }
  }

  update(dt: number, d: MiniDrive): void {
    // ---- placement ----
    const flying = this.status.flying;
    const platform = flying ? 0 : d.lift;
    this.footprint.position.set(d.x, d.y - platform);
    this.footprint.visible = d.visible;
    this.footprint.alpha = d.alpha;
    if (!d.visible) return;
    const rig = this.rig;

    // ---- zoom tier: swap to the new page once it's baked (bakes are queued, one at a time) ----
    const s = d.ppi / rig.unitsPerInch;
    const want = tierFor(s, this.tier ?? undefined);
    if (want !== this.tier || !this.skin) {
      const sk = skinNow(rig, this.rigs.colourway, this.team, want);
      if (sk) this.applySkin(sk);
      else if (!this.skin) {
        // nothing yet: show any tier that's already in memory (without baking the others)
        for (const t of ["token", "sheet", "tiny"] as Tier[]) {
          const any = skinReady(rig, this.rigs.colourway, this.team, t);
          if (any) {
            this.applySkin(any);
            break;
          }
        }
      }
    }

    // ---- clips ----
    const reduced = !!d.reduced;
    const clips = this.clips;
    this.time += dt;
    if (d.walking && !this.wasWalking) this.walkPhase = 0;
    this.wasWalking = d.walking;
    if (d.walking) {
      // planted feet: one walk cycle per stride of ground actually covered (time only if it isn't moving)
      const moved = Number.isFinite(this.lastX) ? Math.hypot(d.x - this.lastX, d.y - this.lastY) : 0;
      this.walkPhase += moved > 1e-5 ? (moved * rig.unitsPerInch) / this.stride : dt / clips.step.dur;
    }
    this.lastX = d.x;
    this.lastY = d.y;
    const c = resetChannels(this.c);
    const view = this.view;
    if (!reduced && !this.dead) {
      if (d.walking) addClip(c, clips.step, this.walkPhase * clips.step.dur);
      else addClip(c, clips.idle, this.time);
      if (flying) addClip(c, clips.bob, this.time);
    }
    // held status poses, eased in and out
    const st = this.status;
    const k = reduced ? 1e9 : 160;
    const w = this.w;
    w.hurt = blend(w.hurt, st.hp < st.hpMax ? 1 : 0, dt, k);
    w.engaged = blend(w.engaged, st.engaged && !d.walking ? 1 : 0, dt, k);
    w.shaken = blend(w.shaken, st.shaken ? 1 : 0, dt, k * 1.5);
    w.hunkered = blend(w.hunkered, this.hunkered ? 1 : 0, dt, k);
    w.flying = blend(w.flying, flying ? 1 : 0, dt, k * 2);
    this.addPose(this.poses.hurt, w.hurt);
    this.addPose(this.poses.engaged, w.engaged);
    this.addPose(this.poses.shaken, w.shaken);
    this.addPose(this.poses.hunkered, w.hunkered);
    // one-shot clips (recoil, flinch, death) on top
    for (let i = this.playing.length - 1; i >= 0; i--) {
      const p = this.playing[i]!;
      p.t += dt;
      if (p.t >= 0) addClip(c, clips[p.id], p.t);
      if (p.id !== "death" && p.t >= clips[p.id].dur) this.playing.splice(i, 1);
    }
    if (view === "side" && flying) c.lift += d.lift * rig.unitsPerInch * w.flying;

    // ---- facing ----
    if (view === "side") {
      this.side = rig.fixed ? -1 : (d.face ?? this.side);
      // the wedge shows the exact facing; keep it on the side the figure faces
      if (!rig.fixed && Math.cos(this.facingTarget) * this.side < 0) this.facingTarget = Math.PI - this.facingTarget;
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
      this.facer.rotation = rig.fixed ? 0 : this.facing + Math.PI / 2 + (c.yaw * Math.PI) / 180;
      this.facer.scale.x = 1;
      this.foot.setShadow(Math.max(c.shadow, w.flying * 0.6), flying ? d.lift : 0);
    }
    this.foot.setFacing(this.facing);
    this.foot.draw(this.status, d.ppi);

    // ---- pose: matrices only, no vector redraw ----
    if (this.skin) this.place(c);
    this.figure.alpha = d.alpha;
    this.figure.position.set(0, 0);
    this.body.alpha = 1 - c.fade;
    // hit flash: the ink silhouette goes white and the colour falls away
    const fl = Math.max(0, Math.min(1, c.flash));
    this.colourLayer.alpha = this.silhouette ? 0 : 1 - fl * 0.92;
    this.inkLayer.tint = fl > 0.02 ? lerpColour(INK, 0xffffff, fl) : INK;
    if (this.debug) this.drawDebug();
    // (lighter than Classic's spent grey: the faction paint is already dark)
    this.colourLayer.tint = st.spent ? 0xbcb7af : 0xffffff;
    this.applyDrain(c.drain);
    this.drawFx(c, dt, d, reduced);
  }

  private applySkin(sk: Skin): void {
    if (sk === this.skin) return;
    retainSkin(sk);
    if (this.skin) releaseSkin(this.skin);
    this.skin = sk;
    this.tier = sk.tier;
    const byId = new Map(sk.plan.entries.map((e) => [e.id, e]));
    for (const s of this.slots) {
      s.colour.texture = sk.colour.get(s.id) ?? Texture.EMPTY;
      s.ink.texture = sk.ink.get(s.id) ?? Texture.EMPTY;
      s.entry = byId.get(s.id) ?? null;
    }
    this.figure.visible = true;
  }

  private place(c: Channels): void {
    const pose = (this.lastPose = poseRig(this.rig, c, this.lastPose ?? undefined));
    this.muzzleDir = pose.muzzleDir;
    const plan = this.skin!.plan;
    const inv = 1 / plan.k;
    const m = this.tmp;
    for (const s of this.slots) {
      const mat = pose.mats.get(s.id);
      const e = s.entry;
      if (!mat || !e) continue;
      const a0 = mat[0];
      const a1 = mat[1];
      let a2 = mat[2];
      let a3 = mat[3];
      // keep a limb's shade stripe on the side away from the top-left light
      if (s.stripe && a2 + a3 < 0) {
        a2 = -a2;
        a3 = -a3;
      }
      // sprite = pose · translate(origin of the texture rect) · scale(1 / bake resolution)
      m.set(a0 * inv, a1 * inv, a2 * inv, a3 * inv, a0 * e.ox + a2 * e.oy + mat[4], a1 * e.ox + a3 * e.oy + mat[5]);
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
    if (this.puffs.length > 6 || !this.exhausts.length) return;
    const pose = this.lastPose;
    if (!pose) return;
    for (const e of this.exhausts) {
      const m: Mat | undefined = pose.mats.get(e.part);
      if (!m) continue;
      const p = e.at;
      this.puffs.push({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5], t: 0 });
    }
  }

  private drawFx(c: Channels, dt: number, d: MiniDrive, reduced: boolean): void {
    // exhaust (or spores): a puff now and then, more while walking
    if (!reduced && !this.dead && this.exhausts.length) {
      this.puffClock += dt * (d.walking ? 2.2 : 1);
      if (this.puffClock > 1700) {
        this.puffClock = Math.random() * 400;
        this.emitPuff();
      }
    }
    const firing = c.muzzle > 0.5 && !!this.rig.weapon;
    const busy = this.puffs.length > 0 || firing;
    const g = this.fx;
    if (!busy && !g.visible) return;
    g.clear();
    g.visible = busy;
    for (const p of this.puffs) {
      p.t += dt;
      const k = p.t / 800;
      const up = this.view === "side" ? -18 * k : 0;
      const drift = this.view === "side" ? 6 * k : 4 * k;
      g.circle(p.x + drift, p.y + up, 2.4 + 5 * k).fill({ color: this.puffColour, alpha: 0.55 * (1 - k) });
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) if (this.puffs[i]!.t >= 800) this.puffs.splice(i, 1);
    if (firing && this.lastPose) {
      const { x, y } = this.lastPose.muzzle;
      const dir = this.muzzleDir;
      const nx = -dir.y;
      const ny = dir.x;
      const L = this.view === "side" ? 16 : 10;
      const W = L * 0.45;
      g.poly([x + nx * W, y + ny * W, x + dir.x * L, y + dir.y * L, x - nx * W, y - ny * W, x + dir.x * L * 0.35, y + dir.y * L * 0.35])
        .fill(this.muzzleColour)
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
    if (this.skin) releaseSkin(this.skin);
    this.skin = null;
    this.foot.destroy();
    this.drainFilter?.destroy();
    this.figure.destroy({ children: true });
  }
}

function lerpColour(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
