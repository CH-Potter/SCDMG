// Pixi textures baked from the Canvas 2D painters, cached for the lifetime of the page.
// Figures: one sheet per archetype + colour (idle, step, and white silhouettes of both).
// Bases: one per radius + player colour + shape. Icons: hourglass, shaken, DONE tag, muzzle flash.

import { CanvasSource, Rectangle, Texture } from "pixi.js";
import { type BaseShape, type FigureMeta, type FigureSpec, type Look, figurePending, figureReady, paintBase, paintMuzzle, paintSheet, specKey } from "./figures";
import { glow, INK_CSS, makeCanvas, P, part, stroke, type Pen } from "./ink";
import { ACCENT, css } from "./palette";

/** Display font for in-canvas lettering (loaded via index.html). */
export const DISPLAY_FONT = "'Bowlby One', 'Arial Black', Impact, sans-serif";

const dpr = (): number => Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
/** Pixels per inch for baked figures: enough for a close zoom on a hi-dpi screen. */
export const figurePpi = (): number => Math.round(64 * Math.max(1.5, dpr()));

function textureFrom(canvas: HTMLCanvasElement, frame?: Rectangle, mip = true): Texture {
  const source = new CanvasSource({ resource: canvas, autoGenerateMipmaps: mip, scaleMode: "linear" });
  return new Texture({ source, frame });
}

export interface FigureTex {
  frames: Texture[];
  white: Texture[];
  /** Anchor (0..1) of the feet inside a frame. */
  ax: number;
  ay: number;
  /** Sprite scale (inches per pixel). */
  scale: number;
  meta: FigureMeta;
}

const figures = new Map<string, FigureTex>();

export function figureTex(spec: FigureSpec): FigureTex {
  const key = specKey(spec);
  let t = figures.get(key);
  if (t) return t;
  const ppi = figurePpi();
  const sheet = paintSheet(spec, ppi);
  const source = new CanvasSource({ resource: sheet.canvas, autoGenerateMipmaps: true, scaleMode: "linear" });
  const frame = (i: number) => new Texture({ source, frame: new Rectangle(i * sheet.frameW, 0, sheet.frameW, sheet.frameH) });
  t = {
    frames: [frame(0), frame(1)],
    white: [frame(2), frame(3)],
    ax: sheet.ax / sheet.frameW,
    ay: sheet.ay / sheet.frameH,
    scale: 1 / ppi,
    meta: sheet.meta,
  };
  figures.set(key, t);
  // Uploaded images decode asynchronously: the sheet shows a placeholder coin until then, and is
  // repainted in place (same size) so every sprite already using it updates by itself.
  if (figurePending(spec)) {
    void figureReady(spec).then(() => {
      if (figurePending(spec)) return;
      const again = paintSheet(spec, ppi);
      const ctx = sheet.canvas.getContext("2d");
      if (!ctx || again.canvas.width !== sheet.canvas.width || again.canvas.height !== sheet.canvas.height) return;
      ctx.clearRect(0, 0, sheet.canvas.width, sheet.canvas.height);
      ctx.drawImage(again.canvas, 0, 0);
      source.update();
    });
  }
  return t;
}

export interface BaseTex {
  tex: Texture;
  ax: number;
  ay: number;
  scale: number;
}

const bases = new Map<string, BaseTex>();

export function baseTex(r: number, team: number, shape: BaseShape, look?: Look): BaseTex {
  const key = `${r}|${team}|${shape}|${look ?? ""}`;
  let t = bases.get(key);
  if (t) return t;
  const ppi = figurePpi();
  const ext = r + 0.25;
  const w = ext * 2 * ppi;
  const h = (ext * 2 + 0.3) * ppi;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.setTransform(ppi, 0, 0, ppi, ext * ppi, ext * ppi);
  paintBase(ctx, r, team, shape, look);
  t = { tex: textureFrom(c), ax: 0.5, ay: (ext * ppi) / c.height, scale: 1 / ppi };
  bases.set(key, t);
  return t;
}

// ---------- icons ----------

export type IconName = "hourglass" | "shaken" | "done" | "muzzle" | "ready";

const icons = new Map<IconName, { tex: Texture; scale: number }>();

/** Small icons, `size` inches tall. */
export function iconTex(name: IconName): { tex: Texture; scale: number } {
  let t = icons.get(name);
  if (t) return t;
  const ppi = figurePpi() * 1.5;
  const size = name === "done" ? { w: 1.3, h: 0.5 } : name === "muzzle" ? { w: 1, h: 1 } : { w: 0.8, h: 0.8 };
  const c = makeCanvas(size.w * ppi, size.h * ppi);
  const ctx = c.getContext("2d")!;
  ctx.setTransform(ppi, 0, 0, ppi, (size.w / 2) * ppi, (size.h / 2) * ppi);
  const pen: Pen = { ctx, ink: 0.05, hatch: 3 };
  if (name === "muzzle") paintMuzzle(ctx, 0.45);
  else if (name === "hourglass") {
    part(pen, P.circle(0, 0, 0.3), 0xfff3dc, { shadow: 0.05, deep: false });
    part(pen, P.poly([-0.14, -0.19, 0.14, -0.19, 0, 0, 0.14, 0.19, -0.14, 0.19, 0, 0]), ACCENT, { ink: 0.04, shadow: 0, back: false });
    stroke(pen, P.line([-0.17, -0.2, 0.17, -0.2]), 0.06);
    stroke(pen, P.line([-0.17, 0.2, 0.17, 0.2]), 0.06);
  } else if (name === "shaken") {
    part(pen, P.poly(burst(0, 0, 0.22, 0.36, 9)), 0xfff3dc, { shadow: 0.05, deep: false });
    lettering(ctx, "!?", 0, 0.02, 0.3, "#e0443a");
  } else if (name === "ready") {
    glow(pen, 0, 0, 0.38, ACCENT, 0.6);
    part(pen, P.poly(burst(0, 0, 0.16, 0.28, 7)), ACCENT, { shadow: 0.04, deep: false });
    lettering(ctx, "!", 0, 0.02, 0.26, INK_CSS);
  } else {
    // "DONE" stencil tag
    ctx.save();
    ctx.rotate(-0.08);
    part(pen, P.rrect(-0.52, -0.17, 1.04, 0.34, 0.05), 0xd8cdb5, { shadow: 0.05, deep: false, tone: "lines" });
    ctx.restore();
    ctx.save();
    ctx.rotate(-0.08);
    lettering(ctx, "DONE", 0, 0.015, 0.22, "#5a4636", false);
    ctx.restore();
  }
  t = { tex: textureFrom(c), scale: 1 / ppi };
  icons.set(name, t);
  return t;
}

function burst(cx: number, cy: number, r0: number, r1: number, n: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? r0 : r1;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}

function lettering(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, outline = true): void {
  ctx.save();
  ctx.font = `${size}px ${DISPLAY_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (outline) {
    ctx.lineWidth = size * 0.22;
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK_CSS;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Forget icons drawn before the display font loaded, so they're redrawn with it. */
export function refreshLettering(): void {
  for (const k of ["shaken", "done", "ready"] as IconName[]) {
    const t = icons.get(k);
    if (t) icons.delete(k);
  }
}

export { css };
