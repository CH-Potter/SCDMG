// Short-lived board effects (tracers, comic bursts, onomatopoeia, smoke, decals, trails...) and the
// screen-space comic-panel phase banner. Effects are cheap: a handful of small Graphics, redrawn
// only while they're alive. Everything respects `reduced` (prefers-reduced-motion): static, brief fades.

import { CanvasSource, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { Vec } from "../engine/types";
import { makeCanvas } from "./art/ink";
import { DISPLAY_FONT } from "./art/textures";
import { ACCENT, BAD, css, GOOD, INK, PLAYER_COLORS, rgba, shade } from "./art/palette";

export const FONT = DISPLAY_FONT;

interface Item {
  obj: Container;
  /** ms since start; negative while delayed. */
  t: number;
  dur: number;
  step: (k: number) => void;
  started: boolean;
  onStart?: () => void;
}

const clamp01 = (k: number): number => (k < 0 ? 0 : k > 1 ? 1 : k);
export const easeOut = (k: number): number => 1 - (1 - k) * (1 - k) * (1 - k);
export const easeInOut = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const backOut = (k: number): number => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};

/** Polyline helper: cumulative lengths and point-at-distance. */
export class Polyline {
  readonly lens: number[] = [0];
  readonly length: number;
  constructor(readonly pts: Vec[]) {
    for (let i = 1; i < pts.length; i++) this.lens.push(this.lens[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
    this.length = this.lens[this.lens.length - 1]!;
  }
  at(d: number): Vec {
    const p = this.pts;
    if (p.length === 1 || d <= 0) return { ...p[0]! };
    if (d >= this.length) return { ...p[p.length - 1]! };
    let i = 1;
    while (i < p.length - 1 && this.lens[i]! < d) i++;
    const seg = this.lens[i]! - this.lens[i - 1]!;
    const k = seg > 0 ? (d - this.lens[i - 1]!) / seg : 1;
    return { x: p[i - 1]!.x + (p[i]!.x - p[i - 1]!.x) * k, y: p[i - 1]!.y + (p[i]!.y - p[i - 1]!.y) * k };
  }
  /** Points from distance a to b, inclusive of the interpolated ends. */
  slice(a: number, b: number): Vec[] {
    const out = [this.at(a)];
    for (let i = 1; i < this.pts.length - 1; i++) if (this.lens[i]! > a && this.lens[i]! < b) out.push(this.pts[i]!);
    out.push(this.at(b));
    return out;
  }
}

/** Deterministic jagged starburst points around (0, 0). */
function burst(r0: number, r1: number, n: number, seed: number, rot = 0): number[] {
  const pts: number[] = [];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r0 * (0.85 + rnd() * 0.3) : r1 * (0.75 + rnd() * 0.5);
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

let seedCounter = 1;

export type DecalKind = "scorch" | "goo" | "shards";

export class FxLayer {
  /** Effects above the models. */
  readonly root = new Container();
  /** Ground decals below the models (scorch marks, goo). */
  readonly under = new Container();
  private items: Item[] = [];
  reduced = false;
  /** 1 / pixels-per-inch, so text stays a constant screen size. */
  textScale = 1 / 20;

  get busy(): boolean {
    return this.items.length > 0;
  }

  clear(): void {
    for (const it of this.items) it.obj.destroy({ children: true });
    this.items = [];
  }

  update(dt: number): void {
    if (!this.items.length) return;
    const keep: Item[] = [];
    for (const it of this.items) {
      it.t += dt;
      if (it.t < 0) {
        keep.push(it);
        continue;
      }
      if (!it.started) {
        it.started = true;
        it.obj.visible = true;
        it.onStart?.();
      }
      const k = clamp01(it.t / it.dur);
      it.step(k);
      if (k >= 1) it.obj.destroy({ children: true });
      else keep.push(it);
    }
    this.items = keep;
  }

  private add(obj: Container, delay: number, dur: number, step: (k: number) => void, onStart?: () => void, parent: Container = this.root): void {
    obj.visible = false;
    parent.addChild(obj);
    this.items.push({ obj, t: -delay, dur, step, started: false, onStart });
    // Keep it bounded on huge turns
    if (this.items.length > 320) {
      const old = this.items.shift()!;
      old.obj.destroy({ children: true });
    }
  }

  /** Run a callback after a delay (shares the effect clock, so it respects ordering). */
  later(delay: number, fn: () => void): void {
    this.add(new Container(), delay, 1, () => {}, fn);
  }

  /** A shot: an inked slug that zips from `from` to `to`, with a muzzle burst. Returns travel time in ms. */
  tracer(from: Vec, to: Vec, color: number, delay = 0): number {
    const g = new Graphics();
    const L = Math.hypot(to.x - from.x, to.y - from.y);
    if (this.reduced) {
      this.add(g, delay, 260, (k) => {
        g.clear().moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ width: 0.1, color, alpha: 0.9 * (1 - k) });
      });
      return 60;
    }
    const travel = Math.min(260, 90 + L * 7);
    const dur = travel + 140;
    const flash = burst(0.12, 0.42, 6, seedCounter++);
    this.add(g, delay, dur, (k) => {
      const ms = k * dur;
      const head = clamp01(ms / travel);
      const tail = clamp01((ms - 70) / travel);
      const hx = from.x + (to.x - from.x) * head;
      const hy = from.y + (to.y - from.y) * head;
      const tx = from.x + (to.x - from.x) * tail;
      const ty = from.y + (to.y - from.y) * tail;
      g.clear();
      g.moveTo(tx, ty).lineTo(hx, hy).stroke({ width: 0.3, color: INK, cap: "round" });
      g.moveTo(tx, ty).lineTo(hx, hy).stroke({ width: 0.17, color, cap: "round" });
      g.moveTo(tx, ty).lineTo(hx, hy).stroke({ width: 0.06, color: 0xffffff, cap: "round" });
      if (head < 1) g.circle(hx, hy, 0.15).fill(0xffffff).stroke({ width: 0.05, color: INK });
      if (ms < 110) {
        const s = 1 - ms / 110;
        g.poly(flash.map((v, i) => v * (0.4 + s) + (i % 2 ? from.y : from.x))).fill(ACCENT).stroke({ width: 0.05, color: INK });
      }
    });
    return travel;
  }

  /** An indirect lob (barrage): an arc with a shadow. Returns travel time in ms. */
  lob(from: Vec, to: Vec, color: number, delay = 0): number {
    if (this.reduced) return this.tracer(from, to, color, delay);
    const g = new Graphics();
    const L = Math.hypot(to.x - from.x, to.y - from.y);
    const travel = Math.min(650, 300 + L * 10);
    const h = Math.min(6, 1.5 + L * 0.25);
    this.add(g, delay, travel, (k) => {
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k;
      const z = Math.sin(k * Math.PI) * h;
      g.clear();
      g.ellipse(x, y, 0.3, 0.15).fill({ color: INK, alpha: 0.3 });
      g.circle(x, y - z, 0.3).fill(color).stroke({ width: 0.08, color: INK });
      g.circle(x - 0.08, y - z - 0.08, 0.08).fill({ color: 0xffffff, alpha: 0.7 });
    });
    return travel;
  }

  /** A shell that missed its mark bouncing along the ground from `from` to where it settles (two shrinking hops). */
  bounce(from: Vec, to: Vec, color: number, delay = 0): number {
    const L = Math.hypot(to.x - from.x, to.y - from.y);
    if (this.reduced || L < 0.05) return 0;
    const g = new Graphics();
    const travel = Math.min(700, 260 + L * 60);
    this.add(g, delay, travel, (k) => {
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k;
      // two hops, the second lower than the first
      const z = Math.abs(Math.sin(k * Math.PI * 2)) * (k < 0.5 ? 0.9 : 0.45);
      g.clear();
      g.moveTo(from.x, from.y).lineTo(x, y).stroke({ width: 0.06, color: INK, alpha: 0.35 });
      g.ellipse(x, y, 0.3, 0.15).fill({ color: INK, alpha: 0.3 });
      g.circle(x, y - z, 0.3).fill(color).stroke({ width: 0.08, color: INK });
    });
    return travel;
  }

  /** Melee: three quick inked claw swipes across the target. */
  slash(at: Vec, r: number, color: number, delay = 0): void {
    const g = new Graphics();
    const dur = this.reduced ? 220 : 300;
    this.add(g, delay, dur, (k) => {
      g.clear();
      const grow = this.reduced ? 1 : clamp01(k * 2.2);
      const a = 1 - clamp01((k - 0.55) / 0.45);
      const swipes = () => {
        for (let i = -1; i <= 1; i++) {
          const ox = i * r * 0.35;
          const x0 = at.x - r * 0.7 + ox;
          const y0 = at.y - r * 0.8;
          const x1 = at.x + r * 0.7 + ox;
          const y1 = at.y + r * 0.6;
          const mx = x0 + (x1 - x0) * grow;
          const my = y0 + (y1 - y0) * grow;
          g.moveTo(x0, y0).quadraticCurveTo((x0 + mx) / 2 + 0.25, (y0 + my) / 2 - 0.25, mx, my);
        }
      };
      swipes();
      g.stroke({ width: 0.26, color: INK, alpha: a, cap: "round" });
      swipes();
      g.stroke({ width: 0.12, color: shade(color, 0.6), alpha: a, cap: "round" });
    });
  }

  /** Impact: a jagged comic burst that punches out and fades. */
  impact(at: Vec, size: number, color: number, delay = 0): void {
    const g = new Graphics();
    g.position.set(at.x, at.y);
    const dur = this.reduced ? 240 : 320;
    const outer = burst(size * 0.45, size * 0.95, 7, seedCounter++);
    const inner = burst(size * 0.22, size * 0.48, 6, seedCounter++, 0.4);
    this.add(g, delay, dur, (k) => {
      const s = this.reduced ? 1 : backOut(clamp01(k * 2.5));
      const a = 1 - clamp01((k - 0.5) / 0.5);
      g.clear();
      g.poly(outer.map((v) => v * s)).fill({ color, alpha: a }).stroke({ width: 0.08, color: INK, alpha: a, join: "miter" });
      g.poly(inner.map((v) => v * s)).fill({ color: 0xffffff, alpha: a });
      if (!this.reduced) {
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + 0.3;
          const d0 = size * (0.7 + k * 1.3);
          const d1 = d0 + size * 0.4 * (1 - k);
          g.moveTo(Math.cos(ang) * d0, Math.sin(ang) * d0).lineTo(Math.cos(ang) * d1, Math.sin(ang) * d1);
        }
        g.stroke({ width: 0.08, color: INK, alpha: a, cap: "round" });
      }
    });
  }

  /** Comic onomatopoeia for big hits: a lettered starburst that pops, shakes and fades. */
  boom(at: Vec, word: string, color: number, delay = 0, big = false): void {
    const c = new Container();
    c.position.set(at.x + 0.6, at.y - 1.4);
    const g = new Graphics();
    const size = big ? 1.9 : 1.5;
    const pts = burst(size * 0.62, size, 11, seedCounter++);
    g.poly(pts.map((v, i) => v + (i % 2 ? 0.14 : 0.12))).fill(INK);
    g.poly(pts).fill(0xfff3c4).stroke({ width: 0.1, color: INK, join: "miter" });
    g.poly(pts.map((v) => v * 0.72)).fill(color);
    const t = this.text(word, 0xffffff, 24, true);
    t.rotation = -0.12;
    // letter the balloon in board inches so it fits whatever the zoom
    const fit = (size * 1.55) / Math.max(1, t.width / t.scale.x);
    c.addChild(g, t);
    c.rotation = (seedCounter % 2 ? -1 : 1) * 0.08;
    const dur = this.reduced ? 700 : 950;
    this.add(c, delay, dur, (k) => {
      t.scale.set(fit);
      const s = this.reduced ? 1 : backOut(clamp01(k * 4.5));
      c.scale.set(s);
      if (!this.reduced && k < 0.35) c.x = at.x + 0.6 + Math.sin(k * 90) * 0.08 * (1 - k / 0.35);
      c.alpha = 1 - clamp01((k - 0.7) / 0.3);
    });
  }

  /** A small damage number on a model. */
  number(at: Vec, text: string, color: number, delay = 0, size = 16): void {
    const t = this.text(text, color, size);
    const dur = this.reduced ? 700 : 900;
    this.add(t, delay, dur, (k) => {
      t.position.set(at.x, at.y - (this.reduced ? 0.9 : 0.9 + easeOut(k) * 1.2));
      const s = this.reduced ? 1 : backOut(clamp01(k * 4));
      t.scale.set(this.textScale * s);
      t.alpha = 1 - clamp01((k - 0.65) / 0.35);
    });
  }

  /** Big floating text (the controller's floatText). */
  float(at: Vec, text: string, color: number): void {
    const t = this.text(text, color, 22);
    const dur = this.reduced ? 900 : 1300;
    this.add(t, 0, dur, (k) => {
      t.position.set(at.x, at.y - 1.5 - (this.reduced ? 0 : easeOut(k) * 1.6));
      t.scale.set(this.textScale * (this.reduced ? 1 : backOut(clamp01(k * 5))));
      t.alpha = 1 - clamp01((k - 0.65) / 0.35);
    });
  }

  /** KO: inked smoke puffs with hatching and a few sparks. */
  poof(at: Vec, r: number, delay = 0): void {
    const g = new Graphics();
    g.position.set(at.x, at.y);
    const dur = this.reduced ? 300 : 700;
    const puffs = this.reduced ? 3 : 7;
    this.add(g, delay, dur, (k) => {
      g.clear();
      const a = 1 - clamp01((k - 0.35) / 0.65);
      const spread = this.reduced ? r * 0.6 : r * (0.3 + easeOut(k) * 1.1);
      for (let i = 0; i < puffs; i++) {
        const ang = (i / puffs) * Math.PI * 2 + 0.4;
        const pr = r * (0.55 - k * 0.25) * (i % 2 ? 0.8 : 1);
        const x = Math.cos(ang) * spread;
        const y = Math.sin(ang) * spread * 0.8 - (this.reduced ? 0 : k * 0.8);
        g.circle(x + pr * 0.2, y + pr * 0.25, pr).fill({ color: 0x5a524a, alpha: a });
        g.circle(x, y, pr).fill({ color: 0xbdb3a3, alpha: a }).stroke({ width: 0.07, color: INK, alpha: a });
        g.moveTo(x + pr * 0.1, y + pr * 0.7).lineTo(x + pr * 0.7, y + pr * 0.1).stroke({ width: 0.04, color: INK, alpha: a * 0.6 });
      }
      if (!this.reduced) {
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2 + 1.1;
          const d = r * (0.4 + easeOut(k) * 1.9);
          const x = Math.cos(ang) * d;
          const y = Math.sin(ang) * d - k * 0.8;
          g.moveTo(x, y).lineTo(x + Math.cos(ang) * 0.3, y + Math.sin(ang) * 0.3).stroke({ width: 0.08, color: 0xff9a3a, alpha: a, cap: "round" });
        }
      }
    });
  }

  /** A brief mark on the ground where something died: scorch, goo or crystal shards. */
  decal(at: Vec, kind: DecalKind, r: number, delay = 0): void {
    const g = new Graphics();
    g.position.set(at.x, at.y);
    const pts = burst(r * 0.6, r * 1.05, 8, seedCounter++);
    if (kind === "scorch") {
      g.poly(pts).fill({ color: 0x1c1512, alpha: 0.55 });
      g.poly(pts.map((v) => v * 0.6)).fill({ color: 0x2a1a10, alpha: 0.6 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.45).lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.15);
      }
      g.stroke({ width: 0.06, color: 0x1c1512, alpha: 0.6 });
    } else if (kind === "goo") {
      g.poly(pts.map((v, i) => v * (i % 4 ? 0.9 : 1.15))).fill({ color: 0x8fd33a, alpha: 0.75 }).stroke({ width: 0.06, color: INK, alpha: 0.8 });
      g.circle(-r * 0.3, -r * 0.2, r * 0.18).fill({ color: 0xe9ffb0, alpha: 0.8 });
      for (let i = 0; i < 4; i++) g.circle(Math.cos(i * 1.7) * r * 1.4, Math.sin(i * 1.7) * r * 1.1, 0.1 + (i % 2) * 0.06).fill({ color: 0x8fd33a, alpha: 0.8 }).stroke({ width: 0.04, color: INK });
    } else {
      g.poly(pts.map((v) => v * 0.8)).fill({ color: 0xffffff, alpha: 0.18 });
      for (let i = 0; i < 6; i++) {
        const a = i * 1.1;
        const x = Math.cos(a) * r * 0.8;
        const y = Math.sin(a) * r * 0.6;
        g.poly([x, y - 0.18, x + 0.09, y, x, y + 0.08, x - 0.09, y]).fill(0xe6d9ff).stroke({ width: 0.04, color: INK });
      }
    }
    const dur = this.reduced ? 2500 : 4500;
    this.add(
      g,
      delay,
      dur,
      (k) => {
        g.alpha = 1 - clamp01((k - 0.6) / 0.4);
      },
      undefined,
      this.under,
    );
  }

  /** Summon / vanish sparkle ring. */
  sparkle(at: Vec, r: number, color: number, delay = 0): void {
    const g = new Graphics();
    g.position.set(at.x, at.y);
    const dur = this.reduced ? 300 : 600;
    this.add(g, delay, dur, (k) => {
      g.clear();
      const a = 1 - k;
      const rr = this.reduced ? r + 0.3 : r * (0.6 + easeOut(k) * 1.0) + 0.2;
      g.circle(0, 0, rr).stroke({ width: 0.12 * (1 - k) + 0.04, color, alpha: a });
      if (!this.reduced) {
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + k * 1.5;
          g.star(Math.cos(ang) * rr, Math.sin(ang) * rr, 4, 0.24 * a + 0.05, 0.07).fill({ color: 0xffffff, alpha: a }).stroke({ width: 0.03, color: INK, alpha: a });
        }
      }
    });
  }

  /** Expanding ring (objective control changes, deploy landings). */
  ring(at: Vec, r0: number, r1: number, color: number, delay = 0, width = 0.18): void {
    const g = new Graphics();
    g.position.set(at.x, at.y);
    const dur = this.reduced ? 350 : 700;
    this.add(g, delay, dur, (k) => {
      g.clear();
      const rr = this.reduced ? r1 : r0 + (r1 - r0) * easeOut(k);
      g.circle(0, 0, rr).stroke({ width: width * (1 - k * 0.6) + 0.05, color: INK, alpha: (1 - k) * 0.6 });
      g.circle(0, 0, rr).stroke({ width: width * (1 - k * 0.6), color, alpha: 1 - k });
    });
  }

  /** Dusty boot-print trail revealed along a path, then fading. `travel` should match the model's move time. */
  trail(path: Vec[], color: number, travel: number, delay = 0): void {
    if (this.reduced || path.length < 2) return;
    const pl = new Polyline(path);
    if (pl.length < 0.5) return;
    const g = new Graphics();
    const dur = travel + 900;
    const dots: { p: Vec; side: number }[] = [];
    let side = 1;
    for (let d = 0.35; d < pl.length - 0.2; d += 0.5) {
      const p = pl.at(d);
      const q = pl.at(d + 0.05);
      const L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      dots.push({ p: { x: p.x - ((q.y - p.y) / L) * 0.14 * side, y: p.y + ((q.x - p.x) / L) * 0.14 * side }, side });
      side = -side;
    }
    this.add(
      g,
      delay,
      dur,
      (k) => {
        const ms = k * dur;
        const shown = pl.length * easeInOut(clamp01(ms / travel));
        const fade = 1 - clamp01((ms - travel) / 900);
        g.clear();
        let d = 0.35;
        for (const { p } of dots) {
          if (d > shown) break;
          g.ellipse(p.x, p.y, 0.1, 0.07).fill({ color: INK, alpha: 0.35 * fade });
          d += 0.5;
        }
        g.circle(pl.pts[0]!.x, pl.pts[0]!.y, 0.22).stroke({ width: 0.06, color, alpha: 0.7 * fade });
      },
      undefined,
      this.under,
    );
  }

  /** Charge whoosh: inked speed streaks that chase the charger along its path. */
  whoosh(path: Vec[], color: number, travel: number, delay = 0): void {
    if (path.length < 2) return;
    const pl = new Polyline(path);
    const g = new Graphics();
    if (this.reduced) {
      this.add(g, delay, 300, (k) => {
        g.clear().poly(path.flatMap((p) => [p.x, p.y]), false).stroke({ width: 0.12, color, alpha: 0.7 * (1 - k) });
      });
      return;
    }
    const dur = travel + 350;
    this.add(g, delay, dur, (k) => {
      const ms = k * dur;
      const head = pl.length * easeInOut(clamp01(ms / travel));
      const tailLen = Math.min(4, pl.length) * (1 - clamp01((ms - travel) / 350));
      g.clear();
      if (tailLen <= 0.05) return;
      const seg = pl.slice(Math.max(0, head - tailLen), head);
      g.poly(seg.flatMap((p) => [p.x, p.y]), false).stroke({ width: 0.75, color: 0xffffff, alpha: 0.35, cap: "round", join: "round" });
      const a = seg[0]!;
      const b = seg[seg.length - 1]!;
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / L;
      const ny = (b.x - a.x) / L;
      for (const o of [-0.45, 0, 0.45]) {
        g.poly(
          seg.flatMap((p, i) => {
            const f = i / Math.max(1, seg.length - 1);
            return [p.x + nx * o * f, p.y + ny * o * f];
          }),
          false,
        );
      }
      g.stroke({ width: 0.14, color: INK, alpha: 0.8, cap: "round" });
      for (const o of [-0.45, 0, 0.45]) {
        g.poly(
          seg.flatMap((p, i) => {
            const f = i / Math.max(1, seg.length - 1);
            return [p.x + nx * o * f, p.y + ny * o * f];
          }),
          false,
        );
      }
      g.stroke({ width: 0.07, color, alpha: 0.95, cap: "round" });
    });
  }

  private text(text: string, color: number, size: number, heavy = false): Text {
    const t = new Text({
      text,
      style: {
        fontFamily: FONT,
        fontSize: size * 2,
        fill: color,
        stroke: { color: INK, width: size * (heavy ? 0.6 : 0.45), join: "round" },
        dropShadow: { color: INK, distance: size * 0.18, angle: Math.PI / 3, blur: 0, alpha: 1 },
        letterSpacing: 1,
      },
    });
    t.anchor.set(0.5);
    t.resolution = 1;
    t.scale.set(this.textScale);
    return t;
  }
}

// ---------- banner ----------

export type BannerTone = "you" | "ai" | "neutral" | "good" | "bad";

export interface BannerOpts {
  sub?: string;
  /** Small caption above the title, in the slanted kicker box (e.g. "ROUND 2"). */
  kicker?: string;
  tone?: BannerTone;
  /** Hold time in ms (default 1200). */
  ms?: number;
  /** Automatic banners (phase changes seen in the state) replace older automatic ones still waiting in the queue. */
  auto?: boolean;
}

interface BannerItem {
  title: string;
  sub: string;
  kicker: string;
  color: number;
  hold: number;
  at: number;
  auto: boolean;
  done: Promise<void>;
  resolve: () => void;
}

const TONES: Record<BannerTone, number> = { you: PLAYER_COLORS[0], ai: PLAYER_COLORS[1], neutral: ACCENT, good: GOOD, bad: BAD };

/** Screen-space comic-panel banner: halftone panel, ink border, slanted caption box; queued, never dropped. */
export class Banner {
  readonly root = new Container();
  private sprite: Sprite | null = null;
  private art: { w: number; h: number; key: string } | null = null;
  private t = 0;
  private queue: BannerItem[] = [];
  private current: BannerItem | null = null;
  reduced = false;
  width = 800;
  height = 600;

  constructor() {
    this.root.visible = false;
  }

  get busy(): boolean {
    return !!this.current;
  }

  /**
   * Show (or queue) a banner; resolves when it has swept out. A banner with the same title shown or
   * queued in the last 2.5s is merged (its subline updated) and shares that banner's promise.
   */
  show(title: string, opts: BannerOpts = {}): Promise<void> {
    const now = performance.now();
    for (const b of [this.current, ...this.queue]) {
      if (b && b.title === title && now - b.at < 2500) {
        let changed = false;
        if (opts.sub && b.sub !== opts.sub) {
          b.sub = opts.sub;
          changed = true;
        }
        if (opts.kicker && b.kicker !== opts.kicker) {
          b.kicker = opts.kicker;
          changed = true;
        }
        if (changed && b === this.current) this.art = null;
        return b.done;
      }
    }
    let resolve = () => {};
    const done = new Promise<void>((r) => (resolve = r));
    const item: BannerItem = {
      title,
      sub: opts.sub ?? "",
      kicker: opts.kicker ?? "",
      color: TONES[opts.tone ?? "neutral"],
      hold: Math.max(300, opts.ms ?? 1200),
      at: now,
      auto: !!opts.auto,
      done,
      resolve,
    };
    if (item.auto) {
      // a newer phase supersedes older automatic announcements that haven't shown yet
      for (const q of this.queue.filter((b) => b.auto)) q.resolve();
      this.queue = this.queue.filter((b) => !b.auto);
    }
    if (!this.current) this.start(item);
    else this.queue.push(item);
    return done;
  }

  clear(): void {
    const all = [this.current, ...this.queue];
    this.queue = [];
    this.current = null;
    this.root.visible = false;
    for (const b of all) b?.resolve();
  }

  private start(item: BannerItem): void {
    this.current = item;
    this.t = 0;
    this.art = null;
    this.root.visible = true;
  }

  update(dt: number): void {
    const cur = this.current;
    if (!cur) return;
    // Shorten each banner a little when others are waiting
    const hold = this.queue.length ? Math.min(cur.hold, 800) : cur.hold;
    const inT = this.reduced ? 140 : 260;
    const outT = this.reduced ? 140 : 240;
    const total = inT + hold + outT;
    this.t += dt;
    const key = `${cur.title}|${cur.sub}|${cur.kicker}|${cur.color}|${Math.round(this.width)}`;
    if (!this.art || this.art.key !== key) this.paint(cur, key);
    const w = this.art!.w;
    const cx = this.width / 2;
    const cy = Math.max(this.art!.h / 2 + 24, this.height * 0.24);
    let x = cx;
    let alpha = 1;
    let squash = 1;
    if (this.t < inT) {
      const k = easeOut(this.t / inT);
      if (this.reduced) alpha = k;
      else {
        x = cx - (1 - k) * (this.width / 2 + w);
        squash = 0.9 + 0.1 * k;
      }
    } else if (this.t > inT + hold) {
      const k = clamp01((this.t - inT - hold) / outT);
      if (this.reduced) alpha = 1 - k;
      else x = cx + k * k * (this.width / 2 + w);
    }
    this.root.alpha = alpha;
    if (this.sprite) {
      this.sprite.position.set(Math.round(x), Math.round(cy));
      this.sprite.scale.y = this.sprite.scale.x * squash;
    }
    if (this.t >= total) {
      cur.resolve();
      const next = this.queue.shift();
      if (next) this.start(next);
      else {
        this.current = null;
        this.root.visible = false;
      }
    }
  }

  /** Paint the whole banner once into a canvas texture; `update` only slides it. */
  private paint(cur: BannerItem, key: string): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const measure = makeCanvas(4, 4).getContext("2d")!;
    const titleFont = (px: number) => `${px}px ${FONT}`;
    const subFont = `700 18px "Barlow Semi Condensed", "Arial Narrow", sans-serif`;
    let tSize = 46;
    measure.font = titleFont(tSize);
    let tw = measure.measureText(cur.title).width + cur.title.length * 2;
    const maxW = Math.max(200, this.width - 60);
    if (tw + 120 > maxW) {
      tSize = Math.max(20, Math.floor((tSize * (maxW - 120)) / tw));
      measure.font = titleFont(tSize);
      tw = measure.measureText(cur.title).width + cur.title.length * 2;
    }
    measure.font = subFont;
    const sw = cur.sub ? measure.measureText(cur.sub).width : 0;
    const w = Math.round(Math.min(this.width - 24, Math.max(340, Math.max(tw, sw) + 110)));
    const h = cur.sub ? 112 : 86;
    const skew = 18;
    const pad = 30;
    const cw = w + skew + pad * 2;
    const ch = h + pad * 2;
    const c = makeCanvas(cw * dpr, ch * dpr);
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    const x0 = pad;
    const y0 = pad;
    const quad = (dx: number, dy: number) => {
      g.beginPath();
      g.moveTo(x0 + skew + dx, y0 + dy);
      g.lineTo(x0 + w + skew + dx, y0 + dy);
      g.lineTo(x0 + w + dx, y0 + h + dy);
      g.lineTo(x0 + dx, y0 + h + dy);
      g.closePath();
    };
    const ink = css(INK);
    quad(9, 9);
    g.fillStyle = "rgba(28,21,18,0.85)";
    g.fill();
    quad(0, 0);
    g.fillStyle = "#fff3d6";
    g.fill();
    g.save();
    quad(0, 0);
    g.clip();
    // halftone that gets heavier towards the bottom
    g.fillStyle = rgba(cur.color, 0.55);
    for (let yy = y0 + 6; yy < y0 + h; yy += 7) {
      const k = (yy - y0) / h;
      const off = Math.round((yy - y0) / 7) % 2 ? 3.5 : 0;
      for (let xx = x0 + off; xx < x0 + w + skew; xx += 7) {
        g.beginPath();
        g.arc(xx, yy, 1 + 1.6 * k, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.strokeStyle = "rgba(28,21,18,0.45)";
    g.lineWidth = 3;
    g.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      const yy = y0 + 14 + i * ((h - 28) / 4);
      g.beginPath();
      g.moveTo(x0 + w + skew - 60 - i * 9, yy);
      g.lineTo(x0 + w + skew - 16, yy);
      g.stroke();
    }
    g.restore();
    quad(0, 0);
    g.lineWidth = 5;
    g.lineJoin = "miter";
    g.strokeStyle = ink;
    g.stroke();
    const mid = x0 + (w + skew) / 2;
    // slanted caption box with the kicker
    if (cur.kicker) {
      g.font = `18px ${FONT}`;
      const kw = g.measureText(cur.kicker).width + 34;
      const kx = x0 + skew + 10;
      const ky = y0 - 16;
      g.beginPath();
      g.moveTo(kx + 6, ky);
      g.lineTo(kx + kw + 6, ky);
      g.lineTo(kx + kw, ky + 30);
      g.lineTo(kx, ky + 30);
      g.closePath();
      g.fillStyle = css(ACCENT);
      g.fill();
      g.lineWidth = 4;
      g.stroke();
      g.fillStyle = ink;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(cur.kicker, kx + kw / 2 + 3, ky + 16);
    }
    // title: hard drop shadow, heavy stroke, colour fill
    g.font = titleFont(tSize);
    g.textAlign = "center";
    g.textBaseline = "middle";
    const ty = y0 + h / 2 - (cur.sub ? 10 : 0);
    g.lineJoin = "round";
    g.lineWidth = Math.max(5, tSize * 0.2);
    g.strokeStyle = ink;
    g.fillStyle = ink;
    g.strokeText(cur.title, mid + 4, ty + 5);
    g.fillText(cur.title, mid + 4, ty + 5);
    g.strokeText(cur.title, mid, ty);
    g.fillStyle = css(shade(cur.color, 0.15));
    g.fillText(cur.title, mid, ty);
    if (cur.sub) {
      g.font = subFont;
      g.fillStyle = ink;
      g.fillText(cur.sub, mid - 6, y0 + h / 2 + 32);
    }
    const tex = new Texture({ source: new CanvasSource({ resource: c }) });
    const old = this.sprite;
    const sp = new Sprite(tex);
    sp.anchor.set((pad + (w + skew) / 2) / cw, (pad + h / 2) / ch);
    sp.scale.set(1 / dpr);
    this.root.addChild(sp);
    this.sprite = sp;
    old?.destroy({ texture: true, textureSource: true });
    this.art = { w, h, key };
  }
}
