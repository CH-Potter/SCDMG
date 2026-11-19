// rig-lint: the checks every part and rig must pass before it merges (run by tests/minis.lint.test.ts
// in CI). They are what lets a non-artist's Forge unit inherit the craft: slot colours only, the
// engine's ink weights, the anchors the frame needs, and a size budget.

import { limbRest } from "./pose";
import { slotOfKey } from "./slots";
import { parseSvg, readPart, walk, type XmlNode } from "./svg";
import type { Pt, RigDef } from "./types";

/** Authored ink weights (u): major edge, interior, minor, detail. Detail only in the detail layer. */
export const INK_WEIGHTS = [2.4, 2, 1.4, 1] as const;
export const DETAIL_WEIGHT = 1;
/** Coloured (non-ink) lines: bands, seams, hoses. */
export const MAX_COLOUR_LINE = 6;

export const PART_BUDGET = {
  /** Bytes of SVG source. */
  bytes: 6000,
  /** Drawing elements. */
  elements: 48,
  /** Largest viewBox side (u). */
  extent: 140,
};

/**
 * The budget for a part marked `data-budget="large"`: hulls, abdomens and towers of monsters,
 * walkers and structures, whose figures run 220 to 290 u (the Hard Ink scale bands).
 */
export const LARGE_PART_BUDGET = {
  bytes: 9000,
  elements: 72,
  extent: 260,
};

const ALLOWED_TAGS = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "title", "desc"]);
const ALLOWED_CLASSES = new Set(["shade", "detail", "glow", "tag"]);
const PAINT = ["fill", "stroke"] as const;
const LICENCE = /SPDX-License-Identifier:\s*GPL-3\.0-or-later/;

/**
 * The team tag's size (rule "team"): big enough to read the team at table zoom, never so big the
 * figure turns into a team-coloured blob.
 *   minU2:    filled tag area in design units² (80 u² is about 5 px² at the 26 px/in table zoom and
 *             a 7 by 11 px patch at the sheet zoom; the Militia trooper's helm stripe is 140 u²).
 *   minShare: of the rest figure's bounding box (big figures need bigger tags).
 *   maxShare: of the same box (the Old Guard's top view, the biggest base-faction tag, is 0.105).
 * Some base-faction figures predate the rule (the Concord's small brooch tags): their tests run
 * lintRig with `{ tagArea: false }` and list them as known gaps; new art must pass it.
 */
export const TAG_AREA = { minU2: 80, minShare: 0.002, maxShare: 0.12 };

export interface LintIssue {
  part: string;
  rule: "parse" | "licence" | "element" | "colour" | "stroke" | "anchor" | "budget" | "class" | "team";
  msg: string;
}

export interface PartLintOptions {
  /** Anchors this part must declare (besides `pivot`). */
  anchors?: string[];
}

export function lintPart(src: string, name = "part", opts: PartLintOptions = {}): LintIssue[] {
  const out: LintIssue[] = [];
  const add = (rule: LintIssue["rule"], msg: string) => out.push({ part: name, rule, msg });
  let root: XmlNode;
  let comments: string[];
  try {
    ({ root, comments } = parseSvg(src));
  } catch (e) {
    add("parse", (e as Error).message);
    return out;
  }
  if (root.tag !== "svg") add("parse", "root element must be <svg>");
  if (root.attrs.xmlns !== "http://www.w3.org/2000/svg") add("parse", "missing the SVG xmlns");
  if (!root.attrs["data-part"]) add("parse", "missing data-part (the library name)");
  if (!comments.some((c) => LICENCE.test(c))) add("licence", "missing the GPL-3.0-or-later SPDX licence header");
  const budget = root.attrs["data-budget"] === "large" ? LARGE_PART_BUDGET : PART_BUDGET;
  if (src.length > budget.bytes) add("budget", `${src.length} bytes, budget ${budget.bytes}`);

  let info;
  try {
    info = readPart(src);
  } catch (e) {
    add("parse", (e as Error).message);
    return out;
  }
  if (info.box.w > budget.extent || info.box.h > budget.extent) add("budget", `viewBox ${info.box.w}x${info.box.h} over ${budget.extent}`);
  for (const a of ["pivot", ...(opts.anchors ?? [])]) if (!info.anchors[a]) add("anchor", `missing anchor "${a}"`);
  for (const [id, p] of Object.entries(info.anchors)) {
    const b = info.box;
    if (p.x < b.x || p.y < b.y || p.x > b.x + b.w || p.y > b.y + b.h) add("anchor", `anchor "${id}" lies outside the viewBox`);
  }

  let elements = 0;
  for (const top of info.body) {
    walk(top, (n, cls) => {
      if (!ALLOWED_TAGS.has(n.tag)) add("element", `<${n.tag}> is not allowed (paths and basic shapes only)`);
      if (n.tag !== "g") elements++;
      if (n.attrs.style) add("colour", `<${n.tag}> uses a style attribute: use fill/stroke attributes with slot colours`);
      for (const c of (n.attrs.class ?? "").split(/\s+/).filter(Boolean)) if (!ALLOWED_CLASSES.has(c)) add("class", `unknown layer class "${c}"`);
      for (const k of PAINT) {
        const v = n.attrs[k];
        if (v === undefined || v === "none") continue;
        const slot = slotOfKey(v);
        if (!slot) add("colour", `${k}="${v}" on <${n.tag}> is not a slot colour`);
        else if ((slot === "team" || slot === "teamShade") && !cls.has("tag")) add("team", `team colour outside the tag layer on <${n.tag}>`);
      }
      const stroke = n.attrs.stroke;
      if (stroke && stroke !== "none") {
        const w = Number(n.attrs["stroke-width"] ?? 1);
        if (slotOfKey(stroke) === "ink") {
          if (!INK_WEIGHTS.includes(w as (typeof INK_WEIGHTS)[number])) add("stroke", `ink stroke ${w} on <${n.tag}>: use ${INK_WEIGHTS.join(", ")}`);
          else if (w === DETAIL_WEIGHT && !cls.has("detail")) add("stroke", `the ${DETAIL_WEIGHT} detail ink weight belongs in the detail layer`);
        } else if (!(w > 0 && w <= MAX_COLOUR_LINE)) add("stroke", `coloured line ${w} on <${n.tag}> (0 to ${MAX_COLOUR_LINE})`);
      }
    });
  }
  if (elements > budget.elements) add("budget", `${elements} elements, budget ${budget.elements}`);
  return out;
}

// ---------- tag area ----------

/** Polygon area (shoelace), absolute. */
function polyArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
/** Arguments each path command takes per repeat. */
const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, q: 4, t: 2, c: 6, s: 4, a: 7, z: 0 };

/**
 * A path's filled area, near enough for a size rule: each subpath is closed through its command
 * endpoints and measured with the shoelace (curves count as their chords).
 */
export function pathArea(d: string): number {
  const subs: Pt[][] = [];
  let cur: Pt[] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  for (const m of d.matchAll(/([MmLlHhVvQqTtCcSsAaZz])([^MmLlHhVvQqTtCcSsAaZz]*)/g)) {
    const cmd = m[1]!;
    const lc = cmd.toLowerCase();
    const rel = cmd === lc;
    const nums = (m[2]!.match(NUM) ?? []).map(Number);
    if (lc === "z") {
      if (cur.length) subs.push(cur);
      cur = [];
      x = sx;
      y = sy;
      continue;
    }
    const n = ARGS[lc]!;
    for (let i = 0; i + n <= nums.length; i += n) {
      const a = nums.slice(i, i + n);
      if (lc === "h") x = (rel ? x : 0) + a[0]!;
      else if (lc === "v") y = (rel ? y : 0) + a[0]!;
      else {
        x = (rel ? x : 0) + a[n - 2]!;
        y = (rel ? y : 0) + a[n - 1]!;
      }
      if (lc === "m" && i === 0) {
        if (cur.length) subs.push(cur);
        cur = [];
        sx = x;
        sy = y;
      }
      cur.push({ x, y });
    }
  }
  if (cur.length) subs.push(cur);
  return subs.reduce((s, p) => s + (p.length > 2 ? polyArea(p) : 0), 0);
}

/** Area (part units²) of one element's fill. */
function shapeArea(n: XmlNode): number {
  const a = n.attrs;
  const f = (k: string) => Number(a[k] ?? 0) || 0;
  switch (n.tag) {
    case "rect":
      return f("width") * f("height");
    case "circle":
      return Math.PI * f("r") ** 2;
    case "ellipse":
      return Math.PI * f("rx") * f("ry");
    case "polygon": {
      const v = (a.points ?? "").match(NUM)?.map(Number) ?? [];
      const pts: Pt[] = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push({ x: v[i]!, y: v[i + 1]! });
      return polyArea(pts);
    }
    case "path":
      return pathArea(a.d ?? "");
    default:
      return 0;
  }
}

/** The team tag's area in a part (part units²): filled tag-layer shapes, and team-coloured lines (length times width). */
export function tagArea(src: string): number {
  let area = 0;
  for (const b of readPart(src).body)
    walk(b, (n, cls) => {
      if (!cls.has("tag") || n.tag === "g") return;
      const fill = n.attrs.fill;
      if (fill && fill !== "none") area += shapeArea(n);
      else if (n.tag === "line" && n.attrs.stroke && slotOfKey(n.attrs.stroke) === "team")
        area += Math.hypot(Number(n.attrs.x2 ?? 0) - Number(n.attrs.x1 ?? 0), Number(n.attrs.y2 ?? 0) - Number(n.attrs.y1 ?? 0)) * (Number(n.attrs["stroke-width"] ?? 1) || 1);
    });
  return area;
}

/** The rest figure's bounding box (frame units): every part's viewBox through its placement, and the limbs. */
export function figureBox(rig: RigDef): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (p: Pt) => {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  };
  for (const p of rig.parts) {
    let b;
    try {
      b = readPart(p.src).box;
    } catch {
      continue;
    }
    const pl = p.place ?? { x: 0, y: 0, rot: 0 };
    const s = pl.scale ?? 1;
    const c = Math.cos((pl.rot * Math.PI) / 180);
    const n = Math.sin((pl.rot * Math.PI) / 180);
    for (const [u, v] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]] as const) add({ x: pl.x + s * (u * c - v * n), y: pl.y + s * (u * n + v * c) });
  }
  for (const l of rig.limbs) for (const p of [l.from.at, l.joint, l.end]) add(p);
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 1, h: 1 };
}

/** The figure's team tag area as a share of its rest bounding box's area (see TAG_AREA). */
export function tagShare(rig: RigDef): number {
  let area = 0;
  for (const p of rig.parts) {
    try {
      if (!readPart(p.src).tagged) continue;
    } catch {
      continue;
    }
    area += tagArea(p.src) * (p.place?.scale ?? 1) ** 2;
  }
  const b = figureBox(rig);
  return area / Math.max(1, b.w * b.h);
}

/** The team-tag size rule alone (see TAG_AREA). */
export function lintTagArea(rig: RigDef): LintIssue[] {
  const out: LintIssue[] = [];
  const share = tagShare(rig);
  const b = figureBox(rig);
  const area = share * b.w * b.h;
  if (area < TAG_AREA.minU2) out.push({ part: rig.id, rule: "team", msg: `team tag too small to read: ${area.toFixed(0)} u² (at least ${TAG_AREA.minU2})` });
  else if (share < TAG_AREA.minShare) out.push({ part: rig.id, rule: "team", msg: `team tag too small for the figure: ${share.toFixed(4)} of its box (at least ${TAG_AREA.minShare})` });
  if (share > TAG_AREA.maxShare) out.push({ part: rig.id, rule: "team", msg: `team tag too big: ${share.toFixed(3)} of the figure's box (at most ${TAG_AREA.maxShare})` });
  return out;
}

/**
 * Rig-level checks: every part lints, one team tag per figure (of a readable size), limbs reach, the
 * weapon has grips. `tagArea: false` skips the tag-size rule (base-faction figures that predate it).
 */
export function lintRig(rig: RigDef, opts: { tagArea?: boolean } = {}): LintIssue[] {
  const out: LintIssue[] = [];
  const seen = new Set<string>();
  let tags = 0;
  for (const p of rig.parts) {
    if (seen.has(p.id)) out.push({ part: p.id, rule: "parse", msg: "duplicate part id" });
    seen.add(p.id);
    const need = p.id === rig.weapon ? ["muzzle", ...rig.limbs.filter((l) => l.grip).map((l) => l.grip!)] : [];
    out.push(...lintPart(p.src, `${rig.id}/${p.id}`, { anchors: need }));
    try {
      if (readPart(p.src).tagged) tags++;
    } catch {
      /* reported above */
    }
  }
  if (tags !== 1) out.push({ part: rig.id, rule: "team", msg: `${tags} parts carry the team tag: a figure has exactly one` });
  else if (opts.tagArea !== false) out.push(...lintTagArea(rig));
  if (rig.weapon && !rig.parts.some((p) => p.id === rig.weapon)) out.push({ part: rig.id, rule: "anchor", msg: `weapon part "${rig.weapon}" is missing` });
  const ids = new Set(rig.limbs.map((l) => l.id));
  for (const l of rig.limbs) {
    const r = limbRest(l);
    if (r.l1 < 2 || r.l2 < 2) out.push({ part: `${rig.id}/${l.id}`, rule: "anchor", msg: "limb bones shorter than 2 u" });
    if (!rig.parts.some((p) => p.bone.startsWith(`${l.id}.`)) && l.kind === "arm") out.push({ part: `${rig.id}/${l.id}`, rule: "anchor", msg: "an arm with no hand part" });
    if (l.grip && !rig.weapon) out.push({ part: `${rig.id}/${l.id}`, rule: "anchor", msg: "a grip with no weapon to hold" });
  }
  if (rig.frame === "structure" && rig.limbs.some((l) => l.kind === "leg")) out.push({ part: rig.id, rule: "anchor", msg: "structures have no legs" });
  for (const [i, k] of (rig.gait ?? []).entries())
    for (const id of Object.keys(k)) if (!ids.has(id)) out.push({ part: rig.id, rule: "anchor", msg: `gait key ${i} moves "${id}", which is not a limb` });
  for (const p of rig.parts)
    for (const b of [p.bone]) {
      const limb = b.split(".")[0]!;
      if (b.includes(".") && !ids.has(limb)) out.push({ part: `${rig.id}/${p.id}`, rule: "anchor", msg: `rides bone "${b}" of a limb that doesn't exist` });
    }
  return out;
}
