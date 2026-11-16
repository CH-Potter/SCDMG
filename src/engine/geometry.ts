import type { Vec } from "./types";

const EPS = 1e-9;

// Math.hypot is notably slower than a plain sqrt and this is the hottest function in the engine.
export const dist = (a: Vec, b: Vec): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const len = (a: Vec): number => Math.sqrt(a.x * a.x + a.y * a.y);

/** Point `maxLen` along the line from `from` towards `to` (or `to` itself if closer). */
export function towards(from: Vec, to: Vec, maxLen: number): Vec {
  const d = dist(from, to);
  if (d <= maxLen || d < EPS) return { ...to };
  return add(from, scale(sub(to, from), maxLen / d));
}

export function pointSegmentDistance(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  if (l2 < EPS) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2));
  return dist(p, { x: a.x + ab.x * t, y: a.y + ab.y * t });
}

const cross = (o: Vec, a: Vec, b: Vec): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

export function segmentsIntersect(p1: Vec, p2: Vec, q1: Vec, q2: Vec): boolean {
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) {
    return true;
  }
  // Collinear / touching cases
  if (Math.abs(d1) <= EPS && pointSegmentDistance(p1, q1, q2) <= EPS) return true;
  if (Math.abs(d2) <= EPS && pointSegmentDistance(p2, q1, q2) <= EPS) return true;
  if (Math.abs(d3) <= EPS && pointSegmentDistance(q1, p1, p2) <= EPS) return true;
  if (Math.abs(d4) <= EPS && pointSegmentDistance(q2, p1, p2) <= EPS) return true;
  return false;
}

export function segmentSegmentDistance(p1: Vec, p2: Vec, q1: Vec, q2: Vec): number {
  if (segmentsIntersect(p1, p2, q1, q2)) return 0;
  return Math.min(
    pointSegmentDistance(p1, q1, q2),
    pointSegmentDistance(p2, q1, q2),
    pointSegmentDistance(q1, p1, p2),
    pointSegmentDistance(q2, p1, p2),
  );
}

export function pointInPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Inside a zone, counting its edge as inside. Plain ray casting is inconsistent on edges (a point on
 * an edge can be "in" for a polygon and "out" for its mirror image), which gave one side extra
 * deployment spots on diagonal zone edges. Deployment zones use this.
 */
export function pointInZone(p: Vec, poly: Vec[], eps = 1e-6): boolean {
  if (pointInPolygon(p, poly)) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (pointSegmentDistance(p, poly[j]!, poly[i]!) <= eps) return true;
  }
  return false;
}

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const boundsCache = new WeakMap<Vec[], Bounds>();

/** Axis-aligned bounding box of a polygon (cached: map polygons never change). */
export function polyBounds(poly: Vec[]): Bounds {
  let b = boundsCache.get(poly);
  if (!b) {
    b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const p of poly) {
      if (p.x < b.x0) b.x0 = p.x;
      if (p.y < b.y0) b.y0 = p.y;
      if (p.x > b.x1) b.x1 = p.x;
      if (p.y > b.y1) b.y1 = p.y;
    }
    boundsCache.set(poly, b);
  }
  return b;
}

/** Cheap reject: is the segment's bounding box further than `pad` from the polygon's? */
function farFromBounds(a: Vec, b: Vec, poly: Vec[], pad: number): boolean {
  const bb = polyBounds(poly);
  return (
    Math.max(a.x, b.x) < bb.x0 - pad ||
    Math.min(a.x, b.x) > bb.x1 + pad ||
    Math.max(a.y, b.y) < bb.y0 - pad ||
    Math.min(a.y, b.y) > bb.y1 + pad
  );
}

export function segmentIntersectsPolygon(a: Vec, b: Vec, poly: Vec[]): boolean {
  if (farFromBounds(a, b, poly, EPS)) return false;
  if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return true;
  for (let i = 0, n = poly.length; i < n; i++) {
    if (segmentsIntersect(a, b, poly[i]!, poly[(i + 1) % n]!)) return true;
  }
  return false;
}

/** Shortest distance from a segment to a polygon (0 if they touch or overlap). */
export function segmentPolygonDistance(a: Vec, b: Vec, poly: Vec[]): number {
  if (segmentIntersectsPolygon(a, b, poly)) return 0;
  let best = Infinity;
  for (let i = 0, n = poly.length; i < n; i++) {
    const d = segmentSegmentDistance(a, b, poly[i]!, poly[(i + 1) % n]!);
    if (d < best) best = d;
  }
  return best;
}

/** Does the segment pass within `r` of the polygon? Same as segmentPolygonDistance(...) < r, but faster. */
export function segmentNearPolygon(a: Vec, b: Vec, poly: Vec[], r: number): boolean {
  if (farFromBounds(a, b, poly, r)) return false;
  return segmentPolygonDistance(a, b, poly) < r;
}

export function circleOverlapsPolygon(c: Vec, r: number, poly: Vec[]): boolean {
  return segmentNearPolygon(c, c, poly, r - EPS);
}

export function rect(x: number, y: number, w: number, h: number): Vec[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

export function ngon(cx: number, cy: number, r: number, sides = 8): Vec[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

export function polygonCentroid(poly: Vec[]): Vec {
  const s = poly.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
  return scale(s, 1 / poly.length);
}

/**
 * How far along a→b (0..1) the segment first enters the polygon: 0 if `a` is inside, null if it
 * never touches it.
 */
export function segmentEntry(a: Vec, b: Vec, poly: Vec[]): number | null {
  if (!segmentIntersectsPolygon(a, b, poly)) return null;
  if (pointInPolygon(a, poly)) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let best = 1;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < EPS) continue; // parallel edge: the entry is found on a neighbouring edge
    const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den;
    const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
    if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) best = Math.min(best, Math.max(0, t));
  }
  return best;
}
