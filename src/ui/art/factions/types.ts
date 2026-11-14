// The contract between the shared miniature pipeline (figures.ts) and each faction's art module.
// A faction module paints its own units; anything it doesn't cover falls back to the shared
// archetype painters in figures.ts. See STYLE.md in this folder for the house style.

import type { FigureKind, FigureSpec, Look } from "../figures";
import type { Toon } from "../toon";

/**
 * Paints one frame (`f` is 0 = idle or 1 = step/flap/pulse) of a figure in design units
 * (centi-inches at the design's reference base radius), feet at the origin, facing right,
 * y up is negative. No outer silhouette: the pipeline adds it. Returns the weapon tip or
 * focal point [x, y] in the same units (muzzle flashes and shots start there).
 */
export type Painter = (t: Toon, s: FigureSpec, f: number) => [number, number];

/** Design-space size: reference base radius (inches), bounds [x0, y0, x1, y1] and height (centi-inches). */
export interface Design {
  ref: number;
  b: [number, number, number, number];
  top: number;
}

export interface FigureArt {
  paint: Painter;
  /** Bounds for this painter; defaults to the shared archetype's (figures.ts `DESIGN`). */
  design?: Design;
}

export interface FactionArt {
  look: Look;
  /** Built-in units by profile id (e.g. "mil-grunts"). Checked first. */
  units?: Record<string, FigureArt>;
  /** Fallback per archetype for this look, used by custom units of a faction with this look. */
  kinds?: Partial<Record<FigureKind, FigureArt>>;
  /**
   * The ground on top of this faction's bases (flock, tufts, slime, tiles...), painted in design
   * units inside an already-clipped ellipse of radii R by RY centred at the origin. `seed` is stable
   * per base so the scatter doesn't change between frames.
   */
  baseTop?: (t: Toon, R: number, RY: number, seed: number) => void;
}
