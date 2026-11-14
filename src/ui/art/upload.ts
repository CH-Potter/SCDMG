// Turning an uploaded picture into a unit's coin art. Security model:
// - Only raster PNG, JPEG, WebP and GIF files are accepted, checked by their magic bytes as well as
//   the declared type (SVG and everything else is refused before decoding).
// - Files over MAX_UPLOAD_BYTES or with absurd dimensions are refused.
// - The picture is decoded by the browser into a bitmap and redrawn through a canvas, so only fresh
//   pixels survive: no metadata, no animation, no scripts. The result is re-encoded as WebP (or PNG)
//   at about 160px, circle-cropped, and must fit within ART_LIMITS.imageBytes.
// - User data never reaches HTML: the result is a data URL that is validated again on save/import and
//   only ever assigned to an <img>.src or drawn on a canvas.

import { ART_LIMITS, imageDataUrlInfo } from "../../engine/data/unitArt";
import { INK, rgba } from "./palette";

export const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const UPLOAD_ACCEPT = UPLOAD_TYPES.join(",");
/** Largest file we'll even try to decode. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 8192;
const MIN_DIMENSION = 8;

export interface CropState {
  /** 1 = the picture's short side just fills the circle; up to 4. */
  zoom: number;
  /** Pan, in fractions of the circle's diameter (0, 0 = centred). */
  x: number;
  y: number;
  /** Optional colour wash over the picture. */
  tint: number | null;
  tintAmount: number;
  /** Ink ring just inside the edge. */
  outline: boolean;
}

export const defaultCrop = (): CropState => ({ zoom: 1, x: 0, y: 0, tint: null, tintAmount: 0.35, outline: true });

export type UploadSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

/** Sniff the real type of a file from its first bytes. */
export function sniffImageType(head: Uint8Array): (typeof UPLOAD_TYPES)[number] | null {
  const b = (i: number) => head[i] ?? -1;
  const ascii = (from: number, len: number) => String.fromCharCode(...Array.from(head.slice(from, from + len)));
  if (b(0) === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  return null;
}

/** Check and decode an uploaded file. Throws an Error with a readable message if it's refused. */
export async function decodeUpload(file: Blob): Promise<UploadSource> {
  if (!(file instanceof Blob)) throw new Error("That isn't a file");
  if (file.size === 0) throw new Error("That file is empty");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`That picture is too big (over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`);
  const declared = file.type.toLowerCase();
  if (declared && !(UPLOAD_TYPES as readonly string[]).includes(declared)) throw new Error("Only PNG, JPEG, WebP or GIF pictures can be used (no SVG)");
  const sniffed = sniffImageType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!sniffed) throw new Error("That file isn't a PNG, JPEG, WebP or GIF picture");
  // Decode from a blob explicitly typed by its real content, so nothing else gets interpreted.
  const typed = new Blob([file], { type: sniffed });
  let src: UploadSource;
  try {
    src = await createImageBitmap(typed);
  } catch {
    throw new Error("Couldn't read that picture");
  }
  const { width, height } = sizeOf(src);
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) throw new Error("That picture is too small");
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) throw new Error("That picture is too large (over 8192 pixels)");
  return src;
}

export const sizeOf = (s: UploadSource): { width: number; height: number } =>
  s instanceof HTMLImageElement ? { width: s.naturalWidth, height: s.naturalHeight } : { width: s.width, height: s.height };

/** Paint the circle-cropped picture into a square canvas `size` pixels across. */
export function renderCrop(src: UploadSource, crop: CropState, size: number, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas ?? document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  const { width, height } = sizeOf(src);
  const zoom = Math.max(1, Math.min(4, crop.zoom || 1));
  // "cover" the circle at zoom 1, then zoom and pan
  const k = (size / Math.min(width, height)) * zoom;
  const w = width * k;
  const h = height * k;
  const x = (size - w) / 2 + crop.x * size;
  const y = (size - h) / 2 + crop.y * size;
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, x, y, w, h);
  if (crop.tint !== null && crop.tintAmount > 0) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = rgba(crop.tint, Math.max(0, Math.min(1, crop.tintAmount)));
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = "source-over";
  }
  if (crop.outline) {
    ctx.lineWidth = Math.max(2, size * 0.035);
    ctx.strokeStyle = rgba(INK, 0.9);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  return c;
}

/** Keep pans within reach of the picture so the circle never shows empty corners at zoom 1. */
export function clampCrop(src: UploadSource, crop: CropState): CropState {
  const { width, height } = sizeOf(src);
  const zoom = Math.max(1, Math.min(4, crop.zoom || 1));
  const s = Math.min(width, height);
  const maxX = Math.max(0, ((width / s) * zoom - 1) / 2);
  const maxY = Math.max(0, ((height / s) * zoom - 1) / 2);
  return { ...crop, zoom, x: Math.max(-maxX, Math.min(maxX, crop.x)), y: Math.max(-maxY, Math.min(maxY, crop.y)) };
}

/**
 * Encode the crop as the stored coin image: WebP where the browser supports it (PNG otherwise), trying
 * smaller sizes and lower quality until it fits the size cap. Returns a data URL that passes validation.
 */
export function encodeCrop(src: UploadSource, crop: CropState): string {
  const tries: [number, string, number][] = [
    [176, "image/webp", 0.9],
    [160, "image/webp", 0.82],
    [144, "image/webp", 0.72],
    [128, "image/webp", 0.62],
    [160, "image/png", 1],
    [128, "image/png", 1],
    [96, "image/png", 1],
    [96, "image/jpeg", 0.8],
  ];
  const canvas = document.createElement("canvas");
  for (const [size, type, q] of tries) {
    renderCrop(src, crop, size, canvas);
    if (type === "image/jpeg") {
      // no alpha in JPEG: paint the corners a neutral tone (the coin face clips them anyway)
      const ctx = canvas.getContext("2d")!;
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#9a8f80";
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = "source-over";
    }
    const url = canvas.toDataURL(type, q);
    const info = imageDataUrlInfo(url);
    if (info && info.bytes <= ART_LIMITS.imageBytes) return url;
  }
  throw new Error("Couldn't shrink that picture enough. Try zooming in on a simpler part of it.");
}
