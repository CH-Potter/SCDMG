#!/usr/bin/env node
// Generates the placeholder app icon: build/icon.png (512x512) and build/icon.ico
// (16-256 px, PNG-compressed entries). Pure Node, no dependencies.
//
//   node scripts/make-icon.mjs              # (re)generate both files
//   node scripts/make-icon.mjs --if-missing # only if build/icon.ico is absent (used by `npm run package`)
//
// To use a real logo instead, see docs/packaging.md ("App icon"): replace build/icon.png
// and build/icon.ico, and the --if-missing run will leave them alone.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "build");
const icoPath = path.join(outDir, "icon.ico");
const pngPath = path.join(outDir, "icon.png");

if (process.argv.includes("--if-missing") && fs.existsSync(icoPath) && fs.existsSync(pngPath)) {
  console.log("[icon] build/icon.ico and build/icon.png exist; leaving them alone.");
  process.exit(0);
}

// ---- tiny vector "scene" in unit coordinates (0..1), evaluated per sample ----------------
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const INK = hexToRgb("#2b2140");
const BG_TOP = hexToRgb("#8a6bb0");
const BG_BOT = hexToRgb("#4e3770");
const HEX = hexToRgb("#ffd23f");
const HEX_SHADE = hexToRgb("#f2a93b");
const WHITE = [255, 255, 255];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function sdHexagon(x, y, cx, cy, r) {
  // flat-topped regular hexagon, r = circumradius
  const k = [-0.866025404, 0.5, 0.577350269];
  let px = Math.abs(y - cy);
  let py = Math.abs(x - cx);
  const d = 2 * Math.min(k[0] * px + k[1] * py, 0);
  px -= d * k[0];
  py -= d * k[1];
  const ri = r * 0.866025404;
  px -= Math.min(Math.max(px, -k[2] * ri), k[2] * ri);
  py -= ri;
  return Math.hypot(px, py) * Math.sign(py);
}
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

/** Returns [r,g,b,a] for a point, painter's order (later layers on top). */
function shade(x, y, small) {
  const stroke = small ? 0.05 : 0.03;
  let c = [0, 0, 0, 0];
  const put = (rgb) => (c = [...rgb, 255]);

  // Rounded-square badge with an ink rim
  const bg = sdRoundRect(x, y, 0.5, 0.5, 0.46, 0.46, 0.2);
  if (bg <= 0) put(bg > -stroke ? INK : mix(BG_TOP, BG_BOT, y));
  // Hexagon "miniature base" with a darker lower half for depth
  const hx = sdHexagon(x, y, 0.5, 0.53, 0.33);
  if (hx <= 0) put(hx > -stroke ? INK : y > 0.6 ? HEX_SHADE : HEX);
  // Big cartoon eye
  const eye = sdCircle(x, y, 0.5, 0.5, 0.15);
  if (eye <= 0) put(eye > -stroke ? INK : WHITE);
  if (sdCircle(x, y, 0.53, 0.53, 0.07) <= 0) put(INK);
  if (!small && sdCircle(x, y, 0.505, 0.505, 0.022) <= 0) put(WHITE);
  return c;
}

function render(size) {
  const ss = 4; // 4x4 supersampling for anti-aliasing
  const small = size <= 32;
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sj = 0; sj < ss; sj++) {
        for (let si = 0; si < ss; si++) {
          const [cr, cg, cb, ca] = shade((i + (si + 0.5) / ss) / size, (j + (sj + 0.5) / ss) / size, small);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const o = (j * size + i) * 4;
      px[o] = a ? Math.round(r / a) : 0;
      px[o + 1] = a ? Math.round(g / a) : 0;
      px[o + 2] = a ? Math.round(b / a) : 0;
      px[o + 3] = Math.round(a / (ss * ss));
    }
  }
  return px;
}

// ---- PNG encoder (RGBA, 8-bit, filter 0) ---------------------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- ICO container with PNG-compressed images (Windows Vista+) ------------------------
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir[o] = size >= 256 ? 0 : size;
    dir[o + 1] = size >= 256 ? 0 : size;
    dir.writeUInt16LE(1, o + 4); // colour planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...images.map((im) => im.png)]);
}

fs.mkdirSync(outDir, { recursive: true });
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const images = icoSizes.map((size) => ({ size, png: encodePng(size, render(size)) }));
fs.writeFileSync(icoPath, encodeIco(images));
fs.writeFileSync(pngPath, encodePng(512, render(512)));
console.log(`[icon] wrote ${path.relative(root, pngPath)} (512px) and ${path.relative(root, icoPath)} (${icoSizes.join(", ")} px)`);
