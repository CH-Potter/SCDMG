// The runtime baker: a rig's bake plan (one SVG per atlas page) → a canvas → one Pixi texture page.
// The left half is the colour art; the right half is its silhouette, made by dilating the colour
// half's alpha and filling it white (tinted ink at draw time, or white for a hit flash). That's the
// Hard Ink rule "the silhouette is made by dilating the finished figure's alpha, never drawn per
// part": every part's ink sprite sits behind every colour sprite, so the union of the dilated parts
// is the dilated figure. Pages are cached per rig, colourway, team colour, tier and pixel ratio.

import { CanvasSource, Rectangle, Texture } from "pixi.js";
import { planAtlas, type AtlasPlan } from "./atlas";
import { resolveSlots, type Colourway } from "./slots";
import type { RigDef, Tier } from "./types";

export interface Skin {
  key: string;
  tier: Tier;
  plan: AtlasPlan;
  source: CanvasSource;
  colour: Map<string, Texture>;
  ink: Map<string, Texture>;
  /** Milliseconds the bake took (decode + dilate + upload prep). */
  ms: number;
}

const ready = new Map<string, Skin>();
const pending = new Map<string, Promise<Skin>>();
/** Bakes waiting their turn: one starts per frame-ish, so a zoom-tier change never stalls a frame. */
const queue: (() => void)[] = [];
let pumping = false;

export const pixelRatio = (): number => Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);

export const skinKey = (rig: RigDef, cw: Colourway, team: number, tier: Tier, dpr: number): string => `${rig.id}|${cw.id}:${cw.plate}${cw.suit}${cw.leather}${cw.metal}${cw.glow}|${team}|${tier}|${dpr}`;

function pump(): void {
  if (pumping) return;
  const next = queue.shift();
  if (!next) return;
  pumping = true;
  next();
}

function done(): void {
  pumping = false;
  if (queue.length) (typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : (f: () => void) => setTimeout(f, 16))(() => pump());
}

/** The baked page if it's ready; otherwise starts (or keeps) a bake and returns null. */
export function skinNow(rig: RigDef, cw: Colourway, team: number, tier: Tier): Skin | null {
  const key = skinKey(rig, cw, team, tier, pixelRatio());
  const s = ready.get(key);
  if (s) return s;
  void skin(rig, cw, team, tier);
  return null;
}

export function skin(rig: RigDef, cw: Colourway, team: number, tier: Tier): Promise<Skin> {
  const dpr = pixelRatio();
  const key = skinKey(rig, cw, team, tier, dpr);
  const s = ready.get(key);
  if (s) return Promise.resolve(s);
  let p = pending.get(key);
  if (!p) {
    p = new Promise<Skin>((resolve, reject) => {
      queue.push(() => {
        bake(key, rig, cw, team, tier, dpr)
          .then((sk) => {
            ready.set(key, sk);
            pending.delete(key);
            resolve(sk);
          }, reject)
          .finally(done);
      });
      pump();
    });
    pending.set(key, p);
  }
  return p;
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

async function bake(key: string, rig: RigDef, cw: Colourway, team: number, tier: Tier, dpr: number): Promise<Skin> {
  const t0 = performance.now();
  const plan = planAtlas(rig, tier, resolveSlots(cw, team), dpr);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(plan.svg)}`;
  await img.decode();
  const page = canvas(plan.w * 2, plan.h);
  const ctx = page.getContext("2d")!;
  ctx.drawImage(img, 0, 0, plan.w, plan.h);
  // Silhouette: stamp the colour art round two rings (full and half radius), then fill it white.
  const sil = canvas(plan.w, plan.h);
  const s = sil.getContext("2d")!;
  const r = plan.sil;
  const steps = r > 4 ? 24 : 16;
  // (stamped from the rasterised colour half, not the SVG, so the SVG is only rasterised once)
  const stamp = (dx: number, dy: number) => s.drawImage(page, 0, 0, plan.w, plan.h, dx, dy, plan.w, plan.h);
  stamp(0, 0);
  for (const rr of [r, r * 0.55]) {
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      stamp(Math.cos(a) * rr, Math.sin(a) * rr);
    }
  }
  s.globalCompositeOperation = "source-in";
  s.fillStyle = "#ffffff";
  s.fillRect(0, 0, plan.w, plan.h);
  ctx.drawImage(sil, plan.w, 0);
  const source = new CanvasSource({ resource: page, autoGenerateMipmaps: true, scaleMode: "linear" });
  const colour = new Map<string, Texture>();
  const ink = new Map<string, Texture>();
  for (const e of plan.entries) {
    colour.set(e.id, new Texture({ source, frame: new Rectangle(e.x, e.y, e.w, e.h) }));
    ink.set(e.id, new Texture({ source, frame: new Rectangle(e.x + plan.w, e.y, e.w, e.h) }));
  }
  return { key, tier, plan, source, colour, ink, ms: performance.now() - t0 };
}

/** Pages baked so far (the Rig Lab shows them, and their memory). */
export function bakedSkins(): Skin[] {
  return [...ready.values()];
}
