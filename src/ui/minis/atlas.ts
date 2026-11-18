// The bake plan: every drawable of a rig (authored parts and engine-drawn limb capsules) laid out on
// one atlas page for one zoom tier, as a single SVG document. The baker rasterises it once and adds
// an ink silhouette (the colour atlas's alpha, dilated) beside it on the same page, so a model's
// colour and ink sprites all batch from one texture. Pure and deterministic: the plan for the
// reference unit is snapshot-tested at all three tiers.

import { drawOrder, limbRest } from "./pose";
import { keyMap, type SlotName } from "./slots";
import { r3, readPart, renderBody } from "./svg";
import type { LimbDef, RigDef, Tier } from "./types";

/**
 * Zoom tiers by on-screen size: `s` is CSS pixels per design unit (a 162 u trooper is 40 px tall at
 * s = 0.25, 100 px at 0.62). Each tier bakes at its top size, so textures are only ever scaled down
 * (with mipmaps) and ink stays near its target weight: `silPx` is the outer contour in screen
 * pixels at `refS`, a typical size inside the tier.
 */
export const TIERS: Readonly<Record<Tier, { maxS: number; bake: number; silPx: number; refS: number }>> = {
  tiny: { maxS: 0.25, bake: 0.28, silPx: 1.5, refS: 0.2 },
  token: { maxS: 0.62, bake: 0.66, silPx: 1.8, refS: 0.4 },
  sheet: { maxS: Infinity, bake: 1.7, silPx: 2.2, refS: 1.0 },
};
export const TIER_ORDER: Tier[] = ["tiny", "token", "sheet"];

/** The tier for screen scale `s`, with a little hysteresis around the current one. */
export function tierFor(s: number, current?: Tier): Tier {
  let t: Tier = s < TIERS.tiny.maxS ? "tiny" : s < TIERS.token.maxS ? "token" : "sheet";
  if (current && current !== t) {
    const ci = TIER_ORDER.indexOf(current);
    const ti = TIER_ORDER.indexOf(t);
    const edge = ti > ci ? TIERS[current].maxS * 1.08 : TIERS[t].maxS * 0.92;
    if (ti > ci ? s < edge : s > edge) t = current;
  }
  return t;
}

export interface AtlasEntry {
  id: string;
  /** Pixel rect on the colour half of the page; the silhouette sits at x + page width. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Local (part or capsule) coords of the rect's top-left pixel. */
  ox: number;
  oy: number;
}

export interface AtlasPlan {
  tier: Tier;
  /** Texture pixels per design unit. */
  k: number;
  /** Silhouette (outer contour) radius in texture pixels. */
  sil: number;
  /** Colour half size; the page is 2w wide. */
  w: number;
  h: number;
  entries: AtlasEntry[];
  svg: string;
}

/** A limb segment's capsule: length from the rest pose, and its SVG drawn along +x from 0. */
export function capsule(rig: RigDef, l: LimbDef, seg: "upper" | "lower", tier: Tier, colours: Record<SlotName, string>) {
  const rest = limbRest(l);
  const L = seg === "upper" ? rest.l1 : rest.l2;
  const s = l[seg];
  const ink = rig.limbInk;
  const half = s.width / 2 + ink;
  let body = `<line x1="0" y1="0" x2="${r3(L)}" y2="0" stroke="${colours.ink}" stroke-width="${r3(s.width + 2 * ink)}" stroke-linecap="round"/>`;
  body += `<line x1="0" y1="0" x2="${r3(L)}" y2="0" stroke="${colours[s.slot]}" stroke-width="${r3(s.width)}" stroke-linecap="round"/>`;
  if (s.stripe && tier !== "tiny") {
    const off = s.width * 0.3;
    body += `<line x1="${r3(off)}" y1="${r3(off)}" x2="${r3(L - off)}" y2="${r3(off)}" stroke="${colours[s.stripe]}" stroke-width="${r3(s.width * 0.33)}" stroke-linecap="round"/>`;
  }
  return { box: { x: -half, y: -half, w: L + 2 * half, h: 2 * half }, body };
}

/** Plan one atlas page for a rig at a tier. `dpr` multiplies the bake resolution. */
export function planAtlas(rig: RigDef, tier: Tier, colours: Record<SlotName, string>, dpr = 1): AtlasPlan {
  const spec = TIERS[tier];
  const k = spec.bake * dpr;
  const sil = (spec.silPx * dpr * spec.bake) / spec.refS;
  const pad = Math.ceil(sil) + 2;
  const keys = keyMap(colours);
  const items: { id: string; box: { x: number; y: number; w: number; h: number }; body: string }[] = [];
  for (const d of drawOrder(rig)) {
    if (d.limb) {
      const c = capsule(rig, d.limb.def, d.limb.seg, tier, colours);
      items.push({ id: d.id, box: c.box, body: c.body });
    } else {
      const p = rig.parts.find((x) => x.id === d.id)!;
      const info = readPart(p.src);
      items.push({ id: d.id, box: info.box, body: renderBody(info, tier, keys) });
    }
  }
  // Shelf packing, tallest first (ties by id), so the layout is stable.
  const sized = items.map((it) => ({ ...it, pw: Math.ceil(it.box.w * k) + pad * 2, ph: Math.ceil(it.box.h * k) + pad * 2 }));
  const order = sized.slice().sort((a, b) => b.ph - a.ph || (a.id < b.id ? -1 : 1));
  const area = sized.reduce((s, it) => s + it.pw * it.ph, 0);
  const maxW = Math.max(Math.max(...sized.map((s) => s.pw)), Math.min(2048, Math.ceil(Math.sqrt(area) * 1.25)));
  const entries = new Map<string, AtlasEntry>();
  let x = 0;
  let y = 0;
  let row = 0;
  let w = 0;
  for (const it of order) {
    if (x + it.pw > maxW) {
      x = 0;
      y += row + 1;
      row = 0;
    }
    entries.set(it.id, { id: it.id, x, y, w: it.pw, h: it.ph, ox: it.box.x - pad / k, oy: it.box.y - pad / k });
    x += it.pw + 1;
    row = Math.max(row, it.ph);
    w = Math.max(w, x);
  }
  const h = y + row;
  const groups = sized.map((it) => {
    const e = entries.get(it.id)!;
    return `<g transform="translate(${r3(e.x - e.ox * k)},${r3(e.y - e.oy * k)}) scale(${r3(k)})">${it.body}</g>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${groups.join("")}</svg>`;
  return { tier, k, sil, w, h, entries: sized.map((it) => entries.get(it.id)!), svg };
}
