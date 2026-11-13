import type { Vec } from "./types";

const EPS = 1e-9;

export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const len = (a: Vec): number => Math.hypot(a.x, a.y);

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

function edges(poly: Vec[]): [Vec, Vec][] {
  return poly.map((p, i) => [p, poly[(i + 1) % poly.length]!]);
}

export function segmentIntersectsPolygon(a: Vec, b: Vec, poly: Vec[]): boolean {
  if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return true;
  return edges(poly).some(([p, q]) => segmentsIntersect(a, b, p, q));
}

/** Shortest distance from a segment to a polygon (0 if they touch or overlap). */
export function segmentPolygonDistance(a: Vec, b: Vec, poly: Vec[]): number {
  if (segmentIntersectsPolygon(a, b, poly)) return 0;
  return Math.min(...edges(poly).map(([p, q]) => segmentSegmentDistance(a, b, p, q)));
}

export function circleOverlapsPolygon(c: Vec, r: number, poly: Vec[]): boolean {
  return segmentPolygonDistance(c, c, poly) < r - EPS;
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
