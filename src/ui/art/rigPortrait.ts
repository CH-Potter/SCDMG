// Still pictures of the new miniatures (Ink Rig side view or Overhead top view) for the DOM: intros,
// campaign story scenes, lore pages and the gallery. A small adapter over the miniature engine's
// public pieces (registry → rigs, pose, part renderer, slot colours), so these pictures are the same
// art as the board's, posed and painted the same way, without Pixi:
//   1. pose the rig (rest pose plus a clip at a time) with the engine's own poseRig,
//   2. draw every part and limb capsule as the bake plan does, with its posed matrix,
//   3. add the Hard Ink outer contour by dilating the finished figure's alpha (an SVG filter),
//      never drawn per part.
// The result is one SVG (data URL), cached. Units without new-engine art return null, so callers
// fall back to the Classic figure painter (custom factions, forge copies).

import { factionOf, PROFILES } from "../../engine/data/factions";
import type { UnitProfile } from "../../engine/types";
import { capsule, TIERS, tierFor } from "../minis/atlas";
import { addClip, channels, clipsFor } from "../minis/clips";
import { poseRig, drawOrder } from "../minis/pose";
import { rigsFor } from "../minis/registry";
import { keyMap, resolveSlots } from "../minis/slots";
import { r3, readPart, renderBody } from "../minis/svg";
import type { ClipId, Mat, RigDef, Tier } from "../minis/types";

const INK = "#141414";
/** The neutral base the lore pages and the codex use. */
export const NEUTRAL_TEAM = 0x9a8f80;

export interface PortraitOptions {
  /** "side" (Ink Rig, the default) or "top" (Overhead). */
  view?: "side" | "top";
  /** Side view: which way the figure faces (default right, like the Classic painters). */
  face?: "left" | "right";
  /** Team colour for the team tag and base ring (0xRRGGBB). Default: the faction's colour. */
  team?: number;
  /** Stand it on its base. */
  base?: boolean;
  /** The model's index in its unit (squads vary their looks by it). */
  model?: number;
  /** Pose: a clip and a time in it (default the idle clip at 0, which is the rest pose). */
  clip?: ClipId;
  t?: number;
  /**
   * Roughly how many CSS pixels an inch of miniature will be on screen: picks the detail tier and
   * the outline weight, as the board does. Default: close up (sheet tier).
   */
  ppi?: number;
}

export interface Portrait {
  svg: string;
  /** Picture size in inches. */
  w: number;
  h: number;
  /** Where the feet (side) or the base centre (top) sit, as fractions of w and h. */
  feetX: number;
  feetY: number;
  tier: Tier;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const grow = (b: Box, x: number, y: number): void => {
  if (x < b.x0) b.x0 = x;
  if (y < b.y0) b.y0 = y;
  if (x > b.x1) b.x1 = x;
  if (y > b.y1) b.y1 = y;
};

const matStr = (m: Mat): string => `matrix(${m.map(r3).join(" ")})`;

/** Whether a unit has new-engine art (so a portrait exists). */
export function hasRigPortrait(profileId: string): boolean {
  return !!rigsFor(profileId);
}

/** Flyers stand on a clear stem when shown on their base. */
const isFlyer = (p: UnitProfile | undefined): boolean => !!p?.keywords.includes("flying");

/** A still of the unit's miniature, or null if it has no new-engine art. */
export function rigPortrait(profileId: string, o: PortraitOptions = {}): Portrait | null {
  const rigs = rigsFor(profileId, o.model ?? 0);
  if (!rigs) return null;
  const view = o.view ?? "side";
  const rig: RigDef = view === "top" ? rigs.top : rigs.side;
  const profile = PROFILES[profileId];
  let team = o.team;
  if (team === undefined) {
    try {
      team = profile ? factionOf(profile.faction).color : NEUTRAL_TEAM;
    } catch {
      team = NEUTRAL_TEAM;
    }
  }
  const upi = rig.unitsPerInch;
  const tier: Tier = o.ppi ? tierFor(o.ppi / upi) : "sheet";
  const spec = TIERS[tier];
  /** Outer contour radius (design units): the board's target weight for this tier. */
  const sil = spec.silPx / spec.refS;
  const colours = resolveSlots(rigs.colourway, team);
  const keys = keyMap(colours);

  // pose: the rest pose plus a clip at a time; a flyer on its base is lifted onto a stem
  const c = channels();
  const clips = clipsFor(rig);
  addClip(c, clips[o.clip ?? "idle"], o.t ?? 0);
  if (c.flap > 1) c.flap = 1;
  const lift = view === "side" && o.base && isFlyer(profile) ? Math.max(0.55, (profile?.baseRadius ?? 0.5) * 0.9) * upi : 0;
  c.lift += lift;
  const pose = poseRig(rig, c);

  const box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const groups: string[] = [];
  for (const d of drawOrder(rig)) {
    const mat = pose.mats.get(d.id);
    if (!mat) continue;
    let m: Mat = mat;
    let body: string;
    let b: { x: number; y: number; w: number; h: number };
    if (d.limb) {
      const cap = capsule(rig, d.limb.def, d.limb.seg, tier, colours);
      body = cap.body;
      b = cap.box;
      // keep a limb's shade stripe on the side away from the top-left light (as the board does)
      if (d.limb.def[d.limb.seg].stripe && m[2] + m[3] < 0) m = [m[0], m[1], -m[2], -m[3], m[4], m[5]];
    } else {
      const part = rig.parts.find((p) => p.id === d.id);
      if (!part) continue;
      const info = readPart(part.src);
      body = renderBody(info, tier, keys);
      b = info.box;
    }
    for (const [x, y] of [
      [b.x, b.y],
      [b.x + b.w, b.y],
      [b.x, b.y + b.h],
      [b.x + b.w, b.y + b.h],
    ] as const)
      grow(box, m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
    groups.push(`<g transform="${matStr(m)}">${body}</g>`);
  }
  if (!groups.length) return null;

  // the base: a disc under the feet (side: seen at a low angle; top: from above)
  const R = (profile?.baseRadius ?? 0.5) * upi;
  const RY = view === "side" ? R * 0.34 : R;
  let base = "";
  if (o.base) {
    const ring = Math.max(R * 0.16, 5);
    const teamCss = colours.team;
    const shade = colours.teamShade;
    base =
      `<ellipse cx="${r3(R * 0.06)}" cy="${r3(RY * 0.3)}" rx="${r3(R + ring * 0.5)}" ry="${r3(RY + ring * 0.5)}" fill="${INK}" opacity="0.4"/>` +
      (view === "side" ? `<ellipse cx="0" cy="${r3(RY * 0.28)}" rx="${r3(R)}" ry="${r3(RY)}" fill="${shade}" stroke="${INK}" stroke-width="${r3(sil * 1.2)}"/>` : "") +
      `<ellipse cx="0" cy="0" rx="${r3(R)}" ry="${r3(RY)}" fill="${teamCss}" stroke="${INK}" stroke-width="${r3(sil * 1.2)}"/>` +
      `<ellipse cx="0" cy="0" rx="${r3(R - ring)}" ry="${r3(Math.max(1, RY - ring * (RY / R)))}" fill="${rig.ground}" stroke="${INK}" stroke-width="${r3(sil * 0.6)}"/>`;
    if (lift > 0) {
      const top = -lift;
      base += `<rect x="-3" y="${r3(top)}" width="6" height="${r3(lift)}" fill="#d8f2ff" opacity="0.55"/><rect x="-1" y="${r3(top)}" width="2" height="${r3(lift)}" fill="#ffffff" opacity="0.7"/>`;
    }
    grow(box, -R - ring, -RY - ring);
    grow(box, R + ring, RY * 1.35 + ring);
  } else if (view === "side") {
    // a soft contact shadow so a figure without a base still stands on something
    base = `<ellipse cx="0" cy="0" rx="${r3(R * 0.8)}" ry="${r3(R * 0.18)}" fill="${INK}" opacity="0.28"/>`;
    grow(box, -R * 0.8, -R * 0.18);
    grow(box, R * 0.8, R * 0.18);
  }

  // Framing: symmetric about the feet (so mirroring keeps them in place), padded for the contour.
  const pad = sil + 2;
  const half = Math.max(Math.abs(box.x0), Math.abs(box.x1)) + pad;
  const y0 = box.y0 - pad;
  const y1 = box.y1 + pad;
  const W = half * 2;
  const H = y1 - y0;
  // the rigs face left (-x) at rest; the side view faces right unless asked otherwise
  const mirror = view === "side" && (o.face ?? "right") === "right" && !rig.fixed;
  const flip = mirror ? ` transform="scale(-1 1)"` : "";
  const filter =
    `<filter id="ink" filterUnits="userSpaceOnUse" x="${r3(-half)}" y="${r3(y0)}" width="${r3(W)}" height="${r3(H)}" color-interpolation-filters="sRGB">` +
    `<feMorphology in="SourceAlpha" operator="dilate" radius="${r3(sil)}" result="d"/>` +
    `<feFlood flood-color="${INK}"/><feComposite in2="d" operator="in" result="ink"/>` +
    `<feMerge><feMergeNode in="ink"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r3(-half)} ${r3(y0)} ${r3(W)} ${r3(H)}" width="${Math.ceil(W)}" height="${Math.ceil(H)}">` +
    `<defs>${filter}</defs><g${flip}>${base}<g filter="url(#ink)">${groups.join("")}</g></g></svg>`;
  return { svg, w: W / upi, h: H / upi, feetX: 0.5, feetY: -y0 / H, tier };
}

export type PortraitUrl = Portrait & { url: string };

const urlCache = new Map<string, PortraitUrl>();

/** `rigPortrait` as a cached data URL (plus its framing), or null if the unit has no new-engine art. */
export function rigPortraitUrl(profileId: string, o: PortraitOptions = {}): PortraitUrl | null {
  const upi = rigsFor(profileId)?.side.unitsPerInch ?? 105;
  const key = `${profileId}|${o.view ?? "side"}|${o.face ?? "right"}|${o.team ?? "f"}|${o.base ? 1 : 0}|${o.model ?? 0}|${o.clip ?? "idle"}|${o.t ?? 0}|${o.ppi ? tierFor(o.ppi / upi) : "sheet"}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const p = rigPortrait(profileId, o);
  if (!p) return null;
  const out = { ...p, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.svg)}` };
  if (urlCache.size > 400) urlCache.clear();
  urlCache.set(key, out);
  return out;
}

/**
 * A portrait to show inside a `px` × `px` box (object-fit: contain): picks the detail tier and the
 * outline weight for the size it will actually be drawn at.
 */
export function rigPortraitFit(profileId: string, px: number, o: Omit<PortraitOptions, "ppi"> = {}): PortraitUrl | null {
  const first = rigPortraitUrl(profileId, o);
  if (!first) return null;
  const ppi = px / Math.max(first.w, first.h);
  return rigPortraitUrl(profileId, { ...o, ppi });
}
