// The runtime baker: a rig's bake plan (one SVG per atlas page) → a canvas → one Pixi texture page.
// The left half is the colour art; the right half is its silhouette, made by dilating the colour
// half's alpha and filling it white (tinted ink at draw time, or white for a hit flash). That's the
// Hard Ink rule "the silhouette is made by dilating the finished figure's alpha, never drawn per
// part": every part's ink sprite sits behind every colour sprite, so the union of the dilated parts
// is the dilated figure. Pages are cached per rig, colourway, team colour, tier and pixel ratio.
//
// Two caches:
//   memory: pages in use, reference-counted by the minis that show them; a page nobody has used
//           for a few seconds is freed (its GPU texture too), so zooming and refreshing don't leak.
//   disk:   finished pages as PNGs in IndexedDB, keyed by the page and a hash of its bake plan, so
//           a reload decodes a PNG instead of rasterising SVG and dilating it again. Any change to
//           the art, colours or baker changes the hash, so stale pages are never shown.

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
  /** Where it came from: a fresh bake or the disk cache. */
  from: "bake" | "disk";
}

/** Bumped whenever the baker's output changes for the same plan (invalidates the disk cache). */
const BAKER_VERSION = 1;
/** How long an unused page stays in memory before it's freed (ms). */
export const FREE_AFTER_MS = 6000;

const ready = new Map<string, Skin>();
const pending = new Map<string, Promise<Skin>>();
const refs = new Map<string, number>();
const freeTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Bakes waiting their turn: one starts per frame-ish, so a zoom-tier change never stalls a frame. */
const queue: (() => void)[] = [];
let pumping = false;
const stats = { baked: 0, fromDisk: 0, freed: 0 };

export const pixelRatio = (): number => Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);

const cwKey = (cw: Colourway): string => `${cw.id}:${cw.plate}${cw.suit}${cw.leather}${cw.metal}${cw.glow}${cw.fixed ? JSON.stringify(cw.fixed) : ""}`;
export const skinKey = (rig: RigDef, cw: Colourway, team: number, tier: Tier, dpr: number): string => `${rig.id}|${cwKey(cw)}|${team}|${tier}|${dpr}`;

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

/** The baked page if it's in memory, without starting a bake. */
export function skinReady(rig: RigDef, cw: Colourway, team: number, tier: Tier): Skin | null {
  return ready.get(skinKey(rig, cw, team, tier, pixelRatio())) ?? null;
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
            // nobody may want it by the time it lands: free it later unless someone takes it
            if (!refs.get(key)) scheduleFree(key);
            resolve(sk);
          }, (e) => {
            pending.delete(key);
            reject(e);
          })
          .finally(done);
      });
      pump();
    });
    pending.set(key, p);
  }
  return p;
}

/** A mini starts showing this page. */
export function retainSkin(sk: Skin): void {
  refs.set(sk.key, (refs.get(sk.key) ?? 0) + 1);
  const t = freeTimers.get(sk.key);
  if (t !== undefined) {
    clearTimeout(t);
    freeTimers.delete(sk.key);
  }
}

/** A mini stops showing this page; once nothing has shown it for a while, it's freed. */
export function releaseSkin(sk: Skin): void {
  const n = (refs.get(sk.key) ?? 0) - 1;
  if (n > 0) {
    refs.set(sk.key, n);
    return;
  }
  refs.delete(sk.key);
  scheduleFree(sk.key);
}

function scheduleFree(key: string): void {
  if (freeTimers.has(key)) return;
  freeTimers.set(
    key,
    setTimeout(() => {
      freeTimers.delete(key);
      if (refs.get(key)) return;
      const sk = ready.get(key);
      if (!sk) return;
      ready.delete(key);
      for (const t of sk.colour.values()) t.destroy(false);
      for (const t of sk.ink.values()) t.destroy(false);
      sk.source.destroy();
      stats.freed++;
    }, FREE_AFTER_MS),
  );
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

/** FNV-1a over the plan: the disk cache's proof that a stored page is still the same art. */
export function planHash(plan: AtlasPlan): string {
  let h = 0x811c9dc5;
  const s = `${BAKER_VERSION}|${plan.w}x${plan.h}|${plan.sil}|${plan.svg}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

async function bake(key: string, rig: RigDef, cw: Colourway, team: number, tier: Tier, dpr: number): Promise<Skin> {
  const t0 = performance.now();
  const plan = planAtlas(rig, tier, resolveSlots(cw, team), dpr);
  const hash = planHash(plan);
  const page = canvas(plan.w * 2, plan.h);
  const ctx = page.getContext("2d")!;
  let from: Skin["from"] = "bake";
  const stored = await diskGet(key, hash);
  if (stored) {
    try {
      const bmp = await createImageBitmap(stored);
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      from = "disk";
    } catch {
      ctx.clearRect(0, 0, page.width, page.height);
    }
  }
  if (from === "bake") {
    await rasterise(plan, page, ctx);
    if (typeof page.toBlob === "function") page.toBlob((b) => b && void diskPut(key, hash, b), "image/png");
  }
  if (from === "disk") stats.fromDisk++;
  else stats.baked++;
  const source = new CanvasSource({ resource: page, autoGenerateMipmaps: true, scaleMode: "linear" });
  const colour = new Map<string, Texture>();
  const ink = new Map<string, Texture>();
  for (const e of plan.entries) {
    colour.set(e.id, new Texture({ source, frame: new Rectangle(e.x, e.y, e.w, e.h) }));
    ink.set(e.id, new Texture({ source, frame: new Rectangle(e.x + plan.w, e.y, e.w, e.h) }));
  }
  return { key, tier, plan, source, colour, ink, ms: performance.now() - t0, from };
}

/** SVG → colour half, then the dilated silhouette into the right half. */
async function rasterise(plan: AtlasPlan, page: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<void> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(plan.svg)}`;
  await img.decode();
  ctx.drawImage(img, 0, 0, plan.w, plan.h);
  // raster pictures (a standee's face), each clipped to its circle; a picture that won't decode is skipped
  for (const im of plan.images) {
    try {
      const pic = new Image();
      pic.src = im.href;
      await pic.decode();
      const s = Math.max((im.r * 2) / pic.naturalWidth, (im.r * 2) / pic.naturalHeight);
      ctx.save();
      ctx.beginPath();
      ctx.arc(im.x, im.y, im.r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(pic, im.x - (pic.naturalWidth * s) / 2, im.y - (pic.naturalHeight * s) / 2, pic.naturalWidth * s, pic.naturalHeight * s);
      ctx.restore();
    } catch {
      // the coin's face stays plain
    }
  }
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
}

/** Pages in memory now (the Rig Lab shows them, and their memory). */
export function bakedSkins(): Skin[] {
  return [...ready.values()];
}

/** Bake counters: fresh bakes, pages decoded from the disk cache, pages freed. */
export function bakeStats(): Readonly<typeof stats> & { inMemory: number; inUse: number } {
  return { ...stats, inMemory: ready.size, inUse: [...refs.values()].filter((n) => n > 0).length };
}

// ---------- disk cache (IndexedDB) ----------
// Best effort: private windows, blocked storage and tests have no IndexedDB, and then every page is
// simply baked. Entries carry the time they were last written; the oldest go once there are too many.

const DB_NAME = "scdmg-minis";
const STORE = "pages";
const MAX_ENTRIES = 400;
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

interface Stored {
  hash: string;
  blob: Blob;
  at: number;
}

async function diskGet(key: string, hash: string): Promise<Blob | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => {
        const v = req.result as Stored | undefined;
        resolve(v && v.hash === hash ? v.blob : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let puts = 0;
async function diskPut(key: string, hash: string, blob: Blob): Promise<void> {
  const d = await db();
  if (!d) return;
  try {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ hash, blob, at: Date.now() } satisfies Stored, key);
    if (++puts % 25 === 1) tx.oncomplete = () => void prune(d);
  } catch {
    // quota or a closed database: the page just isn't kept
  }
}

async function prune(d: IDBDatabase): Promise<void> {
  try {
    const store = d.transaction(STORE, "readwrite").objectStore(STORE);
    const all: { key: IDBValidKey; at: number }[] = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        all.push({ key: cur.key, at: (cur.value as Stored).at });
        cur.continue();
        return;
      }
      if (all.length <= MAX_ENTRIES) return;
      all.sort((a, b) => a.at - b.at);
      for (const e of all.slice(0, all.length - MAX_ENTRIES)) store.delete(e.key);
    };
  } catch {
    // best effort
  }
}

/** Forget every stored page (the Rig Lab's "clear disk cache"). */
export async function clearDiskCache(): Promise<void> {
  const d = await db();
  if (!d) return;
  try {
    d.transaction(STORE, "readwrite").objectStore(STORE).clear();
  } catch {
    // best effort
  }
}
