// Rig utilities for the kits and template art: scale a whole rig, fit its height to what's drawn,
// mirror a part, turn a placement about one of the part's anchors, and stable rig ids.

import { figureBox } from "../lint";
import { compose, through } from "../rigs/militia/kit-troops";
import { parseSvg, readPart, write } from "../svg";
import type { LimbDef, Place, Pt, RigDef } from "../types";
import { shortHash } from "./spec";

const LICENCE = "<!-- SPDX-License-Identifier: GPL-3.0-or-later. SCDMG miniature part: original art, (c) 2026 Craig Potter and SCDMG contributors. -->";

const sp = (p: Pt, k: number): Pt => ({ x: p.x * k, y: p.y * k });

/**
 * The whole rig `k` times bigger (about frame point (0, 0)): parts, limbs and their widths, pivots,
 * gait keys, stride, height and shadow. Ink stays at its authored weight in the limb capsules (the
 * parts' own ink scales with them, so keep `k` within about 0.7 to 1.5 and draw bigger figures big).
 */
export function scaleRig(rig: RigDef, k: number): RigDef {
  if (Math.abs(k - 1) < 1e-6) return rig;
  const S: Place = { x: 0, y: 0, rot: 0, scale: k };
  const limbs: LimbDef[] = rig.limbs.map((l) => ({
    ...l,
    from: { ...l.from, at: sp(l.from.at, k) },
    joint: sp(l.joint, k),
    end: sp(l.end, k),
    upper: { ...l.upper, width: l.upper.width * k },
    lower: { ...l.lower, width: l.lower.width * k },
  }));
  return {
    ...rig,
    origin: sp(rig.origin, k),
    height: rig.height * k,
    pivots: { torso: sp(rig.pivots.torso, k), head: sp(rig.pivots.head, k) },
    parts: rig.parts.map((p) => ({ ...p, place: compose(S, p.place) })),
    limbs,
    gait: rig.gait?.map((g) => Object.fromEntries(Object.entries(g).map(([id, p]) => [id, sp(p, k)]))),
    ...(rig.stride ? { stride: rig.stride * k } : {}),
    ...(rig.shadow ? { shadow: { x: rig.shadow.x * k, y: rig.shadow.y * k, r: rig.shadow.r * k } } : {}),
  };
}

/** Set the rig's height from what's drawn: feet to the top of the figure (side), or the footprint's size (top). */
export function fitHeight(rig: RigDef, extra = 0): RigDef {
  const b = figureBox(rig);
  const height = rig.view === "side" ? rig.origin.y - b.y : Math.max(b.w, b.h);
  return { ...rig, height: Math.round(height + extra) };
}

/** A part mirrored left to right (anchors too), e.g. the other wing. Its library name gets "-m". */
export function mirrorPart(src: string): string {
  const { root } = parseSvg(src);
  const [x, y, w, h] = (root.attrs.viewBox ?? "0 0 1 1").trim().split(/[\s,]+/).map(Number) as [number, number, number, number];
  const body = root.children.filter((c) => !(c.tag === "g" && c.attrs.id === "anchors") && c.tag !== "title" && c.tag !== "desc");
  const anchors = Object.entries(readPart(src).anchors)
    .map(([id, p]) => `<circle id="${id}" cx="${-p.x}" cy="${p.y}" r="1"/>`)
    .join("");
  const name = root.attrs["data-part"] ?? "part";
  const extra = Object.entries(root.attrs)
    .filter(([k]) => k.startsWith("data-") && k !== "data-part")
    .map(([k, v]) => ` ${k}="${v}"`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-(x + w)} ${y} ${w} ${h}" data-part="${name}-m"${extra}>${LICENCE}<g transform="scale(-1,1)">${body.map(write).join("")}</g><g id="anchors">${anchors}</g></svg>`;
}

/** A placement turned `deg` degrees about one of the placed part's anchors (aim a weapon up or down about its grip). */
export function turnAbout(src: string, place: Place, anchor: string, deg: number): Place {
  if (!deg) return place;
  const a = readPart(src).anchors[anchor] ?? { x: 0, y: 0 };
  const at = through(place, a);
  // rotate about `at`: R(at) · place
  const R: Place = { x: at.x - (at.x * Math.cos((deg * Math.PI) / 180) - at.y * Math.sin((deg * Math.PI) / 180)), y: at.y - (at.x * Math.sin((deg * Math.PI) / 180) + at.y * Math.cos((deg * Math.PI) / 180)), rot: deg };
  return compose(R, place);
}

/** A placement that turns the upper body `deg` degrees about point `p` (a lean, a crouch). */
export function leanAbout(p: Pt, deg: number): Place {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  return { x: p.x - (p.x * c - p.y * s), y: p.y - (p.x * s + p.y * c), rot: deg };
}

/** A stable rig id: a prefix and a short hash of everything that shapes the drawing. */
export const rigId = (prefix: string, key: string, view: "side" | "top"): string => `${prefix}.${shortHash(key)}.${view}`;
