// Coin tokens for units with an uploaded image: a thick round coin standing on the miniature's base,
// rimmed in the faction colour, with the image on its face, an inner shadow and a glossy highlight,
// in the spirit of the game's original flat coin tokens. The renderer's base supplies the player-colour
// ring around it. Images decode asynchronously, so the coin paints a placeholder face until they're ready.

import { imageDataUrlInfo } from "../../engine/data/unitArt";
import { css, rgba, shade } from "./palette";
import { ellipse, fill, flat, ink, mat, type Toon } from "./toon";

/** Coin size relative to the base radius, and its thickness (centi-inches). */
export const COIN_K = 0.78;
const COIN_RY = 0.92;
export const coinThickness = (R: number): number => 8 + R * 0.06;

/** Coin bounds in centi-inches for a base radius in inches: [x0, y0, x1, y1], height. */
export function coinDesign(r: number): { b: [number, number, number, number]; top: number } {
  const R = r * 100 * COIN_K;
  const h = coinThickness(R);
  const ry = R * COIN_RY;
  return { b: [-R - 4, -h - ry - 4, R + 4, ry + 4], top: h + ry };
}

// ---------- image cache ----------

interface Entry {
  img: HTMLImageElement;
  ready: boolean;
  failed: boolean;
  waiters: Array<(img: HTMLImageElement | null) => void>;
}

const images = new Map<string, Entry>();

/** Start decoding an art image (only validated raster data URLs are ever loaded). */
function entry(src: string): Entry | null {
  let e = images.get(src);
  if (e) return e;
  if (!imageDataUrlInfo(src)) return null;
  const img = new Image();
  e = { img, ready: false, failed: false, waiters: [] };
  const done = (ok: boolean) => {
    e!.ready = ok;
    e!.failed = !ok;
    for (const w of e!.waiters.splice(0)) w(ok ? img : null);
  };
  img.onload = () => done(img.naturalWidth > 0);
  img.onerror = () => done(false);
  img.decoding = "async";
  img.src = src;
  images.set(src, e);
  return e;
}

/** The decoded image if it's ready, else null (and decoding starts). */
export function artImage(src: string): HTMLImageElement | null {
  const e = entry(src);
  return e?.ready ? e.img : null;
}

export const artImagePending = (src: string): boolean => {
  const e = entry(src);
  return !!e && !e.ready && !e.failed;
};

/** Resolves with the decoded image, or null if it can't be decoded. */
export function whenArtImage(src: string): Promise<HTMLImageElement | null> {
  const e = entry(src);
  if (!e) return Promise.resolve(null);
  if (e.ready || e.failed) return Promise.resolve(e.ready ? e.img : null);
  return new Promise((res) => e.waiters.push(res));
}

// ---------- painting ----------

/** Paint a coin token (feet at the origin, centi-inches). `img` null paints a placeholder face. */
export function paintCoin(t: Toon, r: number, rim: number, img: CanvasImageSource | null, frame: number): [number, number] {
  const { ctx } = t;
  const R = r * 100 * COIN_K;
  const RY = R * COIN_RY;
  const h = coinThickness(R) + (frame === 1 ? 1.5 : 0);
  const edge = mat(shade(rim, -0.3), 0.4);
  // the coin's edge: bottom half-ellipse joined to the face
  fill(t, `M ${-R} ${-h} L ${-R} 0 A ${R} ${RY} 0 0 0 ${R} 0 L ${R} ${-h} Z`, edge, { s: 4, line: t.line * 1.4 });
  ctx.save();
  ctx.clip(new Path2D(`M ${-R} ${-h} L ${-R} 0 A ${R} ${RY} 0 0 0 ${R} 0 L ${R} ${-h} Z`));
  for (let i = 1; i < 24; i++) {
    const a = Math.PI * (i / 24);
    const x = -Math.cos(a) * R;
    ink(t, `M ${x} ${-h + Math.sin(a) * RY} L ${x} ${Math.sin(a) * RY}`, t.line * 0.5, "rgba(28,21,18,0.35)");
  }
  ctx.restore();
  // face: rim ring in the faction colour
  fill(t, ellipse(0, -h, R, RY), mat(rim, 0.5), { s: 5, line: t.line * 1.4, spec: [-R * 0.55, -h - RY * 0.62, R * 0.16, 2.2, -0.5] });
  const Ri = R * 0.84;
  const RYi = RY * 0.84;
  const face = new Path2D(ellipse(0, -h, Ri, RYi));
  ctx.save();
  ctx.clip(face);
  if (img) {
    ctx.drawImage(img, -Ri, -h - RYi, Ri * 2, RYi * 2);
  } else {
    // placeholder until the image decodes: a plain face in a lighter rim tone
    ctx.fillStyle = css(shade(rim, 0.45));
    ctx.fill(face);
    flat(t, ellipse(0, -h + RYi * 0.1, Ri * 0.32, RYi * 0.36), rgba(shade(rim, -0.2), 0.5));
    flat(t, ellipse(0, -h + RYi * 0.8, Ri * 0.62, RYi * 0.45), rgba(shade(rim, -0.2), 0.5));
  }
  // inner shadow from the raised rim (lower right) and a gloss sweep (upper left)
  ctx.lineWidth = Ri * 0.12;
  ctx.strokeStyle = "rgba(28,21,18,0.28)";
  ctx.stroke(new Path2D(ellipse(-Ri * 0.03, -h - RYi * 0.04, Ri, RYi)));
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.ellipse(-Ri * 0.3, -h - RYi * 0.45, Ri * 0.55, RYi * 0.28, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ink(t, face, t.line * 1.1);
  return [R * 0.2, -h - RY * 0.3];
}
