// rig-lint: the checks every part and rig must pass before it merges (run by tests/minis.lint.test.ts
// in CI). They are what lets a non-artist's Forge unit inherit the craft: slot colours only, the
// engine's ink weights, the anchors the frame needs, and a size budget.

import { limbRest } from "./pose";
import { slotOfKey } from "./slots";
import { parseSvg, readPart, walk, type XmlNode } from "./svg";
import type { RigDef } from "./types";

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

/** Rig-level checks: every part lints, one team tag per figure, limbs reach, the weapon has grips. */
export function lintRig(rig: RigDef): LintIssue[] {
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
