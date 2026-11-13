// Multi-model unit movement: the player moves one "leader" model; the rest of the unit follows
// and must end within coherency (edge to edge) of the leader. Followers may travel up to
// move + coherency. All models of a unit end on the same elevation.

import { dist, pointInPolygon } from "./geometry";
import { profileOf } from "./profile";
import { allPlaced, checkPlacement, elevationFor, planRoute, type Placed } from "./terrain";
import type { Elevation, GameState, Model, Unit, Vec } from "./types";

export const COHERENCY = 2;
const EPS = 1e-6;

export interface Placement {
  modelId: number;
  pos: Vec;
  elevation: Elevation;
}

export interface UnitMovePlan {
  placements: Placement[];
  leaderDistance: number;
  via?: string;
}

export interface MoveOptions {
  /** Max distance for the leader (ignored when teleporting). */
  allowance: number;
  /** Teleports skip paths and distance limits entirely. */
  teleport?: boolean;
  /** Prefer follower spots within `engageRange` of these points (charge pile-in). */
  pileIn?: { points: Vec[]; radius: number }[];
  /** Restrict every model to these polygons (deployment zones). */
  zone?: Vec[][];
}

/** Candidate follower spots around a leader position, nearest rings first. */
export function ringSpots(center: Vec, leaderR: number, r: number): Vec[] {
  const out: Vec[] = [];
  const step = 2 * r + 0.15;
  for (let d = leaderR + r + 0.12, ring = 0; d - leaderR - r <= COHERENCY + EPS; d += step, ring++) {
    const n = Math.max(6, Math.floor((2 * Math.PI * d) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (ring % 2 ? Math.PI / n : 0);
      out.push({ x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d });
    }
  }
  return out;
}

const othersFor = (s: GameState, unit: Unit): Placed[] => allPlaced(s).filter((p) => !p.key.startsWith(`${unit.uid}:`));

function inZone(p: Vec, zone?: Vec[][]): boolean {
  return !zone || zone.some((poly) => pointInPolygon(p, poly));
}

export function planUnitMove(s: GameState, unit: Unit, leaderId: number, to: Vec, opts: MoveOptions): UnitMovePlan | string {
  const prof = profileOf(unit);
  const r = prof.baseRadius;
  const leader = unit.models.find((m) => m.id === leaderId && m.alive);
  if (!leader) return "That model isn't available";
  const others = othersFor(s, unit);
  const enemies = others.filter((p) => s.units.find((u) => p.key.startsWith(`${u.uid}:`))?.owner !== unit.owner);
  const elev = elevationFor(s, unit, to);

  if (!inZone(to, opts.zone)) return "Must be placed in your deployment zone";
  let leaderDistance = 0;
  let via: string | undefined;
  if (!opts.teleport) {
    const route = planRoute(s, unit, leader.pos, leader.elevation, to, enemies);
    if (typeof route === "string") return route;
    if (route.length > opts.allowance + EPS) return `Too far: ${route.length.toFixed(1)}" of ${opts.allowance}"`;
    leaderDistance = route.length;
    via = route.via;
  }
  const err = checkPlacement(s, unit, to, elev, others);
  if (err) return err;

  const placed: Placed[] = [...others, { key: `${unit.uid}:${leader.id}`, pos: to, elevation: elev, radius: r }];
  const placements: Placement[] = [{ modelId: leader.id, pos: { ...to }, elevation: elev }];
  const followers = unit.models.filter((m) => m.alive && m.id !== leader.id).sort((a, b) => dist(a.pos, to) - dist(b.pos, to));
  const spots = ringSpots(to, r, r);
  const followerAllowance = opts.allowance + COHERENCY;

  for (const f of followers) {
    const spot = findSpot(s, unit, f, to, elev, spots, placed, opts, followerAllowance, enemies);
    if (!spot) return "Not enough room to keep the unit together there";
    placed.push({ key: `${unit.uid}:${f.id}`, pos: spot, elevation: elev, radius: r });
    placements.push({ modelId: f.id, pos: spot, elevation: elev });
  }
  return { placements, leaderDistance, via };
}

function findSpot(
  s: GameState,
  unit: Unit,
  f: Model,
  leaderPos: Vec,
  elev: Elevation,
  spots: Vec[],
  placed: Placed[],
  opts: MoveOptions,
  allowance: number,
  enemies: Placed[],
): Vec | null {
  const r = profileOf(unit).baseRadius;
  const candidates = [...spots];
  // Staying put is fine if it keeps coherency.
  if (f.elevation === elev && dist(f.pos, leaderPos) - 2 * r <= COHERENCY) candidates.push(f.pos);
  const score = (c: Vec): number => {
    let sc = opts.teleport ? dist(c, leaderPos) : dist(c, f.pos);
    for (const p of opts.pileIn ?? []) if (p.points.some((q) => dist(q, c) <= p.radius)) sc -= 10;
    return sc;
  };
  candidates.sort((a, b) => score(a) - score(b));
  for (const c of candidates) {
    if (!inZone(c, opts.zone)) continue;
    if (elevationFor(s, unit, c) !== elev) continue;
    if (checkPlacement(s, unit, c, elev, placed)) continue;
    if (!opts.teleport) {
      const route = planRoute(s, unit, f.pos, f.elevation, c, enemies);
      if (typeof route === "string" || route.length > allowance + EPS) continue;
    }
    return c;
  }
  return null;
}

/** Find a free spot next to the unit's first living model (used to revive models). */
export function reviveSpot(s: GameState, unit: Unit): Placement | null {
  const anchor = unit.models.find((m) => m.alive);
  if (!anchor) return null;
  const r = profileOf(unit).baseRadius;
  const placed = allPlaced(s);
  for (const c of ringSpots(anchor.pos, r, r)) {
    if (elevationFor(s, unit, c) !== anchor.elevation) continue;
    if (checkPlacement(s, unit, c, anchor.elevation, placed)) continue;
    return { modelId: -1, pos: c, elevation: anchor.elevation };
  }
  return null;
}
