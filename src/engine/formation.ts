// Multi-model unit movement. The player moves one "leader" model; the rest of the squad follows and
// spreads out like a real squad: followers snap to nearby cover (inside scrub, behind barricades, on
// the side away from the enemy) and otherwise form a loose skirmish line facing the enemy. Charges
// pile in instead. Every model must end in chain coherency: within COHERENCY (edge to edge) of at
// least one other model, the whole unit forming one group. Followers may travel up to move +
// coherency. All models of a unit end on the same elevation.

import { dist, pointInZone, polyBounds, segmentIntersectsPolygon, towards } from "./geometry";
import { hasKeyword, isFlying, profileOf } from "./profile";
import { aliveModels, ENGAGE_RANGE, engagedWith, onBoard, radiusOf } from "./rules";
import { allPlaced, checkPlacement, elevationFor, planRoute, terrainCovers, type Placed } from "./terrain";
import type { Elevation, GameState, Model, Terrain, Unit, Vec } from "./types";

export const COHERENCY = 2;
const EPS = 1e-6;
/** Gaps between neighbouring bases wider than this close up when the squad moves. */
const TIGHT_GAP = 0.5;
/** Edge-to-edge gaps of the fallback spots tried around each placed squad mate (snug first). */
const SNUG_GAPS = [0.2, 0.9, 1.8];
/** Fallback spots closer than this (edge to edge) to a squad mate are tried later. */
const MIN_AIR = 0.12;
const CROWD_PENALTY = 0.6;
/** Fallback spots: weight of "close to the leader and the squad's middle" against "close to where this model wanted to be". */
const COMPACT = 0.3;
/** Most fallback spots per follower that get a full route check (keeps hover previews fast). */
const MAX_ROUTE_TRIES = 24;
/** Fallback spots are first sought around this many squad mates nearest the intended spot. */
const NEAR_MATES = 3;
/** Followers look for cover within this distance of the leader's spot. */
export const SNAP_RADIUS = 3;
/** Gap between bases in a loose skirmish line (in the open). */
const LINE_GAP = 1;
/** Smallest gap between squad mates' bases when they snap into cover. */
const SNAP_SPACING = 0.3;
/** How much a covered spot is worth against walking a little further for it. */
const COVER_WEIGHT = 2.5;
/** Weight of "close to this model's own skirmish-line slot". */
const SLOT_PULL = 0.5;
/** Cover counts from features this close to the model's base (cover is what you're up against). */
const COVER_REACH = 1.6;
/** Enemy units whose fire a squad takes cover from. */
const MAX_THREATS = 3;
/** On a charge, weight of "close to where the model stands now" (fewer trips round the target). */
const PILE_TRAVEL = 0.5;
/** Once a follower turns out to be short of movement, weight of "close to where it stands now". */
const TRAVEL = 1;

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
  /** Prefer follower spots within `radius` of these points (charge pile-in). */
  pileIn?: { points: Vec[]; radius: number }[];
  /** Restrict every model to these polygons (deployment zones). */
  zone?: Vec[][];
}

// ---------- coherency ----------

/** Are two models of a unit (base radius `r`) within coherency of each other? */
const linked = (a: Vec, b: Vec, r: number): boolean => dist(a, b) - 2 * r <= COHERENCY + EPS;

/** The unit's living models split into chain-coherent groups, largest first (ties: lowest model id). */
export function coherencyGroups(unit: Unit): Model[][] {
  const r = profileOf(unit).baseRadius;
  const left = unit.models.filter((m) => m.alive);
  const groups: Model[][] = [];
  while (left.length) {
    const group = [left.shift()!];
    for (let i = 0; i < group.length; i++) {
      for (let j = left.length - 1; j >= 0; j--) {
        if (linked(group[i]!.pos, left[j]!.pos, r)) group.push(...left.splice(j, 1));
      }
    }
    groups.push(group);
  }
  const minId = (g: Model[]) => Math.min(...g.map((m) => m.id));
  return groups.sort((a, b) => b.length - a.length || minId(a) - minId(b));
}

/** Is the whole unit one chain-coherent group? */
export function inCoherency(unit: Unit): boolean {
  return coherencyGroups(unit).length <= 1;
}

/**
 * Is this model cut off from the main body of its unit (e.g. after casualties)? The main body is the
 * group holding `anchorId` when given, otherwise the largest group.
 */
export function isStraggler(unit: Unit, m: Model, anchorId?: number): boolean {
  const groups = coherencyGroups(unit);
  if (groups.length < 2) return false;
  const main =
    (anchorId !== undefined && groups.find((g) => g.some((x) => x.id === anchorId))) || groups[0]!;
  return !main.some((x) => x.id === m.id);
}

// ---------- placement ----------

/**
 * Spots around `center` at snug gaps from a base of radius `r`, the first of each ring facing
 * `toward`. `rings` > 0 takes the first that many gaps, < 0 skips that many, 0 takes them all.
 */
function snugSpots(center: Vec, r: number, toward: Vec, rings = 0): Vec[] {
  const out: Vec[] = [];
  const a0 = Math.atan2(toward.y - center.y, toward.x - center.x);
  const gaps = rings > 0 ? SNUG_GAPS.slice(0, rings) : SNUG_GAPS.slice(-rings);
  for (const gap of gaps) {
    const d = 2 * r + gap;
    const n = Math.max(6, Math.ceil((2 * Math.PI * d) / Math.max(0.3, r)));
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      out.push({ x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d });
    }
  }
  return out;
}

function inZone(p: Vec, zone?: Vec[][]): boolean {
  return !zone || zone.some((poly) => pointInZone(p, poly));
}

/**
 * The order followers are placed in, each with the model it hangs off (`parent`): a spanning tree
 * of the current formation grown from the leader, nearest first. Every follower's parent is placed
 * before it, so a formation in coherency stays chained as it moves.
 */
function followOrder(leader: Model, followers: Model[]): { f: Model; parent: Model }[] {
  const done: Model[] = [leader];
  const left = [...followers];
  const out: { f: Model; parent: Model }[] = [];
  while (left.length) {
    let bi = 0;
    let bp = leader;
    let bd = Infinity;
    left.forEach((f, i) => {
      for (const p of done) {
        const d = dist(f.pos, p.pos);
        if (d < bd - EPS || (Math.abs(d - bd) <= EPS && f.id < left[bi]!.id))
          [bi, bp, bd] = [i, p, d];
      }
    });
    const f = left.splice(bi, 1)[0]!;
    done.push(f);
    out.push({ f, parent: bp });
  }
  return out;
}

export function planUnitMove(
  s: GameState,
  unit: Unit,
  leaderId: number,
  to: Vec,
  opts: MoveOptions,
): UnitMovePlan | string {
  const prof = profileOf(unit);
  const r = prof.baseRadius;
  const leader = unit.models.find((m) => m.id === leaderId && m.alive);
  if (!leader) return "That model isn't available";
  const others = allPlaced(s).filter((p) => p.uid !== unit.uid);
  const enemies = others.filter((p) => p.owner !== unit.owner);
  const elev = elevationFor(s, unit, to);

  if (!inZone(to, opts.zone)) return "Must be placed in your deployment zone";
  let leaderDistance = 0;
  let via: string | undefined;
  if (!opts.teleport) {
    const route = planRoute(s, unit, leader.pos, leader.elevation, to, enemies, opts.allowance);
    if (typeof route === "string") return route;
    if (route.length > opts.allowance + EPS) {
      // Say when area cover is what makes it too far (it costs double), since the move ring can't show it.
      const walked = route.legs.reduce((n, l) => n + dist(l.from, l.to), 0);
      const slow = route.length - walked > 0.05 ? ", as crossing area cover costs double" : "";
      return `Too far: ${route.length.toFixed(1)}" of ${opts.allowance}"${slow}`;
    }
    leaderDistance = route.length;
    via = route.via;
  }
  const err = checkPlacement(s, unit, to, elev, others);
  if (err) return err;

  const placedModel = (id: number, pos: Vec): Placed => ({
    key: `${unit.uid}:${id}`,
    uid: unit.uid,
    owner: unit.owner,
    pos,
    elevation: elev,
    radius: r,
  });
  const placed: Placed[] = [...others, placedModel(leader.id, to)];
  const snapSlot = new Map<number, Vec>();
  /** Squad mates already placed and chained to the leader: followers must link up with one of these. */
  const group: Vec[] = [to];
  const at = new Map<number, Vec>([[leader.id, to]]);
  const placements: Placement[] = [{ modelId: leader.id, pos: { ...to }, elevation: elev }];
  const followers = unit.models.filter((m) => m.alive && m.id !== leader.id);
  // Models on the table keep their formation; units arriving (deploy, drop-in) form up around the leader.
  const shaped = unit.onBoard;
  const main = coherencyGroups(unit).find((g) => g.includes(leader))!;
  const strays = new Set(
    shaped && !opts.teleport ? followers.filter((f) => !main.includes(f)).map((f) => f.id) : [],
  );
  const order = shaped
    ? followOrder(leader, followers)
    : followers.map((f) => ({ f, parent: leader }));
  const ctx: SpotContext = {
    s,
    near: nearTerrain(s, r),
    unit,
    r,
    elev,
    opts,
    enemies,
    placed,
    group,
    to,
    allowance: opts.allowance + COHERENCY,
  };

  // Arriving units form up facing the middle of the board. A fixed compass direction would face a
  // different way for each side (forward for one, backward for the other) and bias deployments.
  const mid = { x: s.board.width / 2, y: s.board.height / 2 };
  const toMid = Math.hypot(mid.x - to.x, mid.y - to.y);
  const arriveWant = toMid > EPS ? { x: to.x + ((mid.x - to.x) / toMid) * 0.01, y: to.y + ((mid.y - to.y) / toMid) * 0.01 } : to;
  // Ordinary moves, teleports and arrivals spread out and take cover; charges pile in.
  const spread = !opts.pileIn?.length;
  const snap = spread ? snapContext(s, unit, to, elev, followers.length) : null;
  if (snap) {
    const free = order.map(({ f }) => f);
    for (const slot of snap.slots) {
      if (!free.length) break;
      let bi = 0;
      free.forEach((f, i) => {
        if (dist(f.pos, slot) < dist(free[bi]!.pos, slot) - EPS) bi = i;
      });
      snapSlot.set(free.splice(bi, 1)[0]!.id, slot);
    }
  }
  for (const { f, parent } of order) {
    const want = snap ? snapSlot.get(f.id)! : shaped ? intendedSpot(f, parent, at.get(parent.id)!, r) : arriveWant;
    // A model left stranded by casualties that can't reach coherency this move catches up as far
    // as it can instead of pinning the whole unit in place.
    let spot = (snap && snapSpot(ctx, snap, f, want, snapSlot)) || findSpot(ctx, f, want);
    const joined = !!spot;
    if (!spot && strays.has(f.id)) spot = catchUpSpot(ctx, f, nearest(group, f.pos));
    if (!spot) return "Not enough room to keep the unit together there";
    placed.push(placedModel(f.id, spot));
    if (joined) group.push(spot);
    at.set(f.id, spot);
    placements.push({ modelId: f.id, pos: spot, elevation: elev });
  }
  return { placements, leaderDistance, via };
}

/**
 * Where a follower would like to end up: the same offset from its parent as now, measured from where
 * the parent ended up. In a clear move that is exactly the leader's move vector, so the squad moves
 * as a block. Wide gaps (over TIGHT_GAP) close up so the squad stays tight.
 */
function intendedSpot(f: Model, parent: Model, parentAt: Vec, r: number): Vec {
  const dx = f.pos.x - parent.pos.x;
  const dy = f.pos.y - parent.pos.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return { ...parentAt };
  const k = Math.min(len, 2 * r + TIGHT_GAP) / len;
  return { x: parentAt.x + dx * k, y: parentAt.y + dy * k };
}

/** A view of `s` whose terrain is only the features whose bounding box comes within `r` of a point. */
function nearTerrain(s: GameState, r: number): (p: Vec) => GameState {
  const boxes = s.terrain.map((t) => ({ t, b: polyBounds(t.poly) }));
  const view: GameState = { ...s };
  return (p) => {
    view.terrain = boxes
      .filter(({ b }) => p.x >= b.x0 - r && p.x <= b.x1 + r && p.y >= b.y0 - r && p.y <= b.y1 + r)
      .map(({ t }) => t);
    return view;
  };
}

const nearest = (pts: Vec[], p: Vec): Vec =>
  pts.reduce((a, b) => (dist(b, p) < dist(a, p) ? b : a));

interface SpotContext {
  s: GameState;
  /** `s` seen with only the terrain that could touch a base at `p` (placement checks run a lot). */
  near: (p: Vec) => GameState;
  unit: Unit;
  r: number;
  elev: Elevation;
  opts: MoveOptions;
  enemies: Placed[];
  placed: Placed[];
  group: Vec[];
  to: Vec;
  allowance: number;
}

/**
 * The best legal spot for a follower: its intended spot if it can get there, otherwise the nearest
 * legal spot to it that is snug against a squad mate (preferring spots near the leader, and pile-in
 * spots on a charge). Every spot it returns is chained to the leader's group.
 */
function findSpot(c: SpotContext, f: Model, want: Vec): Vec | null {
  const { r, opts, to, group } = c;
  const pileBonus = (p: Vec): number => {
    let b = 0;
    for (const pi of opts.pileIn ?? []) if (pi.points.some((q) => dist(q, p) <= pi.radius)) b += 10;
    return b;
  };
  // Bases almost touching read as a jumble on the table: leave a little air where there's room.
  const crowd = (p: Vec): number =>
    group.some((g) => dist(g, p) - 2 * r < MIN_AIR) ? CROWD_PENALTY : 0;
  // Chargers pile in from the side they come from rather than running round the target.
  const travel = opts.pileIn?.length ? PILE_TRAVEL : 0;
  const mid = {
    x: group.reduce((a, g) => a + g.x, 0) / group.length,
    y: group.reduce((a, g) => a + g.y, 0) / group.length,
  };
  const score = (p: Vec): number =>
    dist(p, want) +
    COMPACT * (dist(p, to) + dist(p, mid)) +
    travel * dist(p, f.pos) +
    crowd(p) -
    pileBonus(p);
  const reach = opts.teleport ? Infinity : c.allowance;
  // Bases this follower could possibly bump into.
  const blockers = c.placed.filter(
    (o) => o.elevation === c.elev && dist(o.pos, f.pos) <= reach + o.radius + r + EPS,
  );
  let routeTries = 0;
  /** Set once a route fails: this model is short of movement, so spots nearer to it go first. */
  let unreachable = false;
  const tryAt = (p: Vec, chained: boolean): boolean => {
    if (!inZone(p, opts.zone)) return false;
    // Cheapest checks first: other bases, coherency and straight-line reach, then terrain.
    if (dist(f.pos, p) > reach + EPS) return false;
    for (const o of blockers) if (dist(o.pos, p) < o.radius + r - EPS) return false;
    if (!chained && !group.some((g) => linked(g, p, r))) return false;
    const local = c.near(p);
    if (elevationFor(local, c.unit, p) !== c.elev) return false;
    if (checkPlacement(local, c.unit, p, c.elev, [])) return false;
    if (opts.teleport) return true;
    if (routeTries++ >= MAX_ROUTE_TRIES) return false;
    const route = planRoute(c.s, c.unit, f.pos, f.elevation, p, c.enemies, c.allowance);
    if (typeof route !== "string" && route.length <= c.allowance + EPS) return true;
    unreachable = true;
    return false;
  };

  // Fast path: the intended spot, unless a charge would rather pile in somewhere else.
  const wantPiles = !opts.pileIn?.length || pileBonus(want) > 0;
  if (wantPiles && tryAt(want, false)) return want;

  type Cand = { p: Vec; chained: boolean; sc: number };
  const add = (into: Cand[], p: Vec, chained: boolean): void => {
    if (dist(f.pos, p) <= reach + EPS) into.push({ p, chained, sc: score(p) });
  };
  /**
   * Try candidates best first (picked one at a time: the first few nearly always do). Once the
   * model turns out short of movement, spots nearer to it go first.
   */
  const tryBest = (cands: Cand[]): Vec | null => {
    let travelling = false;
    for (let left = cands.length; left > 0; left--) {
      if (routeTries >= MAX_ROUTE_TRIES && !opts.teleport) return null;
      if (unreachable && !travelling) {
        travelling = true;
        for (const x of cands) x.sc += TRAVEL * dist(x.p, f.pos);
      }
      let best: Cand | undefined;
      for (const x of cands) if (x.sc < (best?.sc ?? Infinity)) best = x;
      if (!best) return null;
      best.sc = Infinity;
      if (tryAt(best.p, best.chained)) return best.p;
    }
    return null;
  };

  // First the snug spots around the few squad mates nearest the intended spot (and pile-in spots
  // on a charge): that is nearly always where the best spot is. Then everything else.
  const ring = 2 * r + SNUG_GAPS[SNUG_GAPS.length - 1]!;
  const mates = group
    .filter((g) => dist(f.pos, g) <= reach + ring + EPS)
    .sort((a, b) => dist(a, want) - dist(b, want));
  const first: Cand[] = [];
  if (!wantPiles) add(first, want, false);
  const near = mates.slice(0, NEAR_MATES);
  for (const g of near) for (const p of snugSpots(g, r, want, 1)) add(first, p, true);
  // The nooks touching two squad mates at once: the tightest spots there are.
  const d = 2 * r + SNUG_GAPS[0]!;
  near.forEach((a, i) =>
    near.slice(i + 1).forEach((b) => nooks(a, b, d).forEach((p) => add(first, p, true))),
  );
  // Charges: also try spots in base contact with the target, wherever the group can reach them.
  for (const pi of opts.pileIn ?? []) {
    const d = Math.max(2 * r, pi.radius - ENGAGE_RANGE + 0.25);
    for (const q of pi.points) {
      // Start the ring on the side facing the charger, so it reads the same from either seat.
      const a0 = Math.atan2(f.pos.y - q.y, f.pos.x - q.x);
      for (let i = 0; i < 8; i++) {
        const a = a0 + (i / 8) * Math.PI * 2;
        add(first, { x: q.x + Math.cos(a) * d, y: q.y + Math.sin(a) * d }, false);
      }
    }
  }
  const hit = tryBest(first);
  if (hit || routeTries >= MAX_ROUTE_TRIES) return hit;
  const rest: Cand[] = [];
  mates.forEach((g, i) => {
    for (const p of snugSpots(g, r, want, i < NEAR_MATES ? -1 : 0)) add(rest, p, true);
  });
  return tryBest(rest);
}

// ---------- cover snapping ----------

/** A spot enemy fire is expected from, with its level. */
interface Threat {
  pos: Vec;
  elev: Elevation;
}

/**
 * Where a squad at `at` expects fire from: the nearest few enemy units (by their middle), or before
 * any are on the table, the middle of the enemy's deployment zone.
 */
function threatsTo(s: GameState, unit: Unit, at: Vec): Threat[] {
  const foes = onBoard(s)
    .filter((e) => e.owner !== unit.owner)
    .map((e) => {
      const ms = aliveModels(e);
      const pos = { x: ms.reduce((a, m) => a + m.pos.x, 0) / ms.length, y: ms.reduce((a, m) => a + m.pos.y, 0) / ms.length };
      return { pos, elev: ms[0]!.elevation };
    })
    .sort((a, b) => dist(a.pos, at) - dist(b.pos, at))
    .slice(0, MAX_THREATS);
  if (foes.length) return foes;
  const zones = s.spawn[unit.owner === 0 ? 1 : 0];
  return zones
    .map((poly) => ({ pos: { x: poly.reduce((a, q) => a + q.x, 0) / poly.length, y: poly.reduce((a, q) => a + q.y, 0) / poly.length }, elev: 0 as Elevation }))
    .sort((a, b) => dist(a.pos, at) - dist(b.pos, at))
    .slice(0, 1);
}

/** Cover and barricades on level `elev` that come within `reach` of `at`. */
function coverNear(s: GameState, at: Vec, elev: Elevation, reach: number): Terrain[] {
  return s.terrain.filter((t) => {
    if (t.level !== elev || (t.kind !== "cover" && t.kind !== "barricade")) return false;
    const b = polyBounds(t.poly);
    return at.x >= b.x0 - reach && at.x <= b.x1 + reach && at.y >= b.y0 - reach && at.y <= b.y1 + reach;
  });
}

/** Share (0..1) of the threats a model at `p` has cover from, counting only features right by it. */
function coverShare(features: Terrain[], threats: Threat[], p: Vec, elev: Elevation): number {
  if (!threats.length) return 0;
  const local = features.filter((t) => {
    const b = polyBounds(t.poly);
    return p.x >= b.x0 - COVER_REACH && p.x <= b.x1 + COVER_REACH && p.y >= b.y0 - COVER_REACH && p.y <= b.y1 + COVER_REACH;
  });
  let n = 0;
  for (const t of threats) {
    // Standing on a ledge above a shooter on the ground is cover too.
    if (elev === 1 && t.elev === 0) n += 1;
    else if (local.length && terrainCovers(local, t.pos, p, elev)) n += 1;
  }
  return n / threats.length;
}

/**
 * How well a model of `unit` standing at `pos` is covered from the enemy: 2 = from every nearby
 * enemy (green), 1 = from some (yellow), 0 = in the open. Flyers and heavy units never get cover.
 */
export function coverRating(s: GameState, unit: Unit, pos: Vec, elev: Elevation): 0 | 1 | 2 {
  if (isFlying(unit) || hasKeyword(unit, "heavy")) return 0;
  const share = coverShare(coverNear(s, pos, elev, COVER_REACH), threatsTo(s, unit, pos), pos, elev);
  return share >= 1 - EPS ? 2 : share > EPS ? 1 : 0;
}

interface SnapContext {
  /** Loose skirmish-line slots for the followers, nearest the leader first. */
  slots: Vec[];
  /** Spots in or behind cover near the leader's spot, with how much cover each gives. */
  covered: { p: Vec; share: number }[];
  /** Outlines of barricades, walls and buildings near the leader's spot (the squad stays on its side of them). */
  blockers: Vec[][];
}

/** Precompute a move's skirmish line and its candidate cover spots. */
function snapContext(s: GameState, unit: Unit, to: Vec, elev: Elevation, followers: number): SnapContext {
  const r = profileOf(unit).baseRadius;
  const threats = threatsTo(s, unit, to);
  // Face the threat: the line runs across the direction the enemy is in.
  const aim = threats.length
    ? { x: threats.reduce((a, t) => a + t.pos.x, 0) / threats.length - to.x, y: threats.reduce((a, t) => a + t.pos.y, 0) / threats.length - to.y }
    : { x: s.board.width / 2 - to.x, y: s.board.height / 2 - to.y };
  const L = Math.hypot(aim.x, aim.y);
  const fwd = L > EPS ? { x: aim.x / L, y: aim.y / L } : { x: 0, y: -1 };
  const side = { x: -fwd.y, y: fwd.x };
  const step = 2 * r + LINE_GAP;
  const perRow = 5; // leader in the middle, two either side
  const slots: Vec[] = [];
  // Two spare slots, for followers whose own slot is out of reach or blocked.
  for (let k = 1; slots.length < followers + 2; k++) {
    const row = Math.floor((k - 1) / (perRow - 1));
    const inRow = (k - 1) % (perRow - 1);
    const sign = inRow % 2 === 0 ? 1 : -1;
    const across = (Math.floor(inRow / 2) + 1) * step * sign + (row % 2 ? step / 2 : 0);
    // A little stagger so the line reads as people, not a ruler; later rows fall in behind.
    const back = (inRow % 2 ? 0.35 * r : 0) + row * step * 0.8;
    slots.push({ x: to.x + side.x * across - fwd.x * back, y: to.y + side.y * across - fwd.y * back });
  }
  const covered: { p: Vec; share: number }[] = [];
  if (!isFlying(unit) && !hasKeyword(unit, "heavy")) {
    const features = coverNear(s, to, elev, SNAP_RADIUS + COVER_REACH);
    const consider = (p: Vec) => {
      if (dist(p, to) > SNAP_RADIUS + 2 * r + COHERENCY) return;
      const share = coverShare(features, threats, p, elev);
      if (share > EPS) covered.push({ p, share });
    };
    for (const t of features) {
      if (t.kind === "cover") {
        // Spots inside the scrub/crater/rubble.
        const b = polyBounds(t.poly);
        for (let x = Math.ceil(b.x0 * 2) / 2; x <= b.x1; x += 0.5)
          for (let y = Math.ceil(b.y0 * 2) / 2; y <= b.y1; y += 0.5) consider({ x, y });
      }
      // Spots hugging the outline (outside a barricade, or just inside/outside area cover).
      const poly = t.poly;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[j]!;
        const b = poly[i]!;
        const len = dist(a, b);
        if (len < EPS) continue;
        const nx = (b.y - a.y) / len;
        const ny = (a.x - b.x) / len;
        for (let d = 0.25; d < len; d += 0.5) {
          const q = { x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len };
          for (const o of [r + 0.12, -(r + 0.12)]) consider({ x: q.x + nx * o, y: q.y + ny * o });
        }
      }
    }
  }
  const blockers = s.terrain
    .filter((t) => (t.kind === "building" || ((t.kind === "barricade" || t.kind === "wall") && t.level === elev)))
    .filter((t) => {
      const b = polyBounds(t.poly);
      const R = SNAP_RADIUS + 2 * r + COHERENCY;
      return to.x >= b.x0 - R && to.x <= b.x1 + R && to.y >= b.y0 - R && to.y <= b.y1 + R;
    })
    .map((t) => t.poly);
  return { slots, covered, blockers };
}

/**
 * The best spot for a follower when the squad spreads out: a free covered spot near the leader if
 * there is one worth the walk, else its own skirmish-line slot. Null falls back to `findSpot`.
 */
function snapSpot(c: SpotContext, snap: SnapContext, f: Model, slot: Vec, assigned: Map<number, Vec>): Vec | null {
  const { r, group } = c;
  // Spread out round the leader's spot, but never to the far side of a fence or wall from it:
  // the squad stays on the side the player sent it to.
  const sameSide = (p: Vec) => !snap.blockers.some((poly) => segmentIntersectsPolygon(c.to, p, poly));
  const roomy = (p: Vec) => group.every((g) => dist(g, p) >= 2 * r + SNAP_SPACING - EPS) && sameSide(p);
  const cands: { p: Vec; sc: number }[] = [];
  for (const { p, share } of snap.covered) {
    if (!roomy(p)) continue;
    // Cover near the leader beats a model's own slot in the open, even if it means swapping sides.
    cands.push({ p, sc: -COVER_WEIGHT * share + 0.2 * dist(p, slot) + 0.2 * dist(p, c.to) });
  }
  if (roomy(slot)) cands.push({ p: slot, sc: 0 });
  // Other line slots nobody has taken (theirs may be out of this model's reach, or blocked).
  const taken = new Set([...assigned.entries()].filter(([id]) => id !== f.id).map(([, v]) => v));
  for (const q of snap.slots) if (q !== slot && !taken.has(q) && roomy(q)) cands.push({ p: q, sc: SLOT_PULL * dist(q, slot) + 0.25 });
  cands.sort((a, b) => a.sc - b.sc);
  let tries = 0;
  const reach = c.opts.teleport ? Infinity : c.allowance;
  for (const { p } of cands) {
    if (tries >= 10) break;
    // Cheap checks first; only spots that pass them count against the tries.
    if (dist(f.pos, p) > reach + EPS || !inZone(p, c.opts.zone)) continue;
    if (!group.some((g) => linked(g, p, r))) continue;
    tries++;
    if (spotOk(c, f, p)) return p;
  }
  return null;
}

/** Is `p` a legal end spot for follower `f` (zone, reach, bases, level, terrain, route)? Chained-ness is the caller's. */
function spotOk(c: SpotContext, f: Model, p: Vec): boolean {
  const { r, opts } = c;
  if (!inZone(p, opts.zone)) return false;
  const reach = opts.teleport ? Infinity : c.allowance;
  if (dist(f.pos, p) > reach + EPS) return false;
  for (const o of c.placed) if (o.elevation === c.elev && dist(o.pos, p) < o.radius + r - EPS) return false;
  const local = c.near(p);
  if (elevationFor(local, c.unit, p) !== c.elev) return false;
  if (checkPlacement(local, c.unit, p, c.elev, [])) return false;
  if (opts.teleport) return true;
  const route = planRoute(c.s, c.unit, f.pos, f.elevation, p, c.enemies, c.allowance);
  return typeof route !== "string" && route.length <= c.allowance + EPS;
}

/** The points at distance `d` from both `a` and `b` (none if they're too far apart). */
function nooks(a: Vec, b: Vec, d: number): Vec[] {
  const ab = dist(a, b);
  if (ab < EPS || ab >= 2 * d) return [];
  const h = Math.sqrt(d * d - (ab / 2) ** 2);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const ux = (b.y - a.y) / ab;
  const uy = (a.x - b.x) / ab;
  return [
    { x: mx + ux * h, y: my + uy * h },
    { x: mx - ux * h, y: my - uy * h },
  ];
}

/** The furthest point toward the group a stranded follower can legally reach this move. */
function catchUpSpot(c: SpotContext, f: Model, toward: Vec): Vec | null {
  if (f.elevation !== c.elev) return null;
  const before = dist(f.pos, toward);
  for (let k = c.allowance; k >= 0.5; k -= 0.5) {
    const p = towards(f.pos, toward, k);
    if (dist(p, toward) >= before - EPS) continue;
    if (elevationFor(c.s, c.unit, p) !== c.elev) continue;
    if (checkPlacement(c.s, c.unit, p, c.elev, c.placed)) continue;
    const route = planRoute(c.s, c.unit, f.pos, f.elevation, p, c.enemies, c.allowance);
    if (typeof route === "string" || route.length > c.allowance + EPS) continue;
    return p;
  }
  return null;
}

/**
 * A free spot to bring a lost model back (Regrow, Patch Up): snug against a living model (so in
 * coherency), on its level, and never into base contact with an enemy the unit isn't already
 * fighting (only charges may start a fight). Spots closest to the middle of the unit are preferred.
 */
export function reviveSpot(s: GameState, unit: Unit): Placement | null {
  const alive = aliveModels(unit);
  if (!alive.length) return null;
  const r = profileOf(unit).baseRadius;
  const placed = allPlaced(s);
  const mid = {
    x: alive.reduce((a, m) => a + m.pos.x, 0) / alive.length,
    y: alive.reduce((a, m) => a + m.pos.y, 0) / alive.length,
  };
  const fighting = new Set(engagedWith(s, unit).map((e) => e.uid));
  const foes = onBoard(s).filter((e) => e.owner !== unit.owner && !fighting.has(e.uid));
  const engagesFoe = (c: Vec, elev: Elevation): boolean =>
    foes.some((e) =>
      aliveModels(e).some(
        (em) =>
          dist(em.pos, c) - r - radiusOf(e) <= ENGAGE_RANGE + EPS &&
          (em.elevation === elev || em.elevation === 2 || elev === 2),
      ),
    );
  const candidates = alive
    .flatMap((anchor) =>
      snugSpots(anchor.pos, r, mid).map((pos) => ({ pos, elevation: anchor.elevation })),
    )
    .sort((a, b) => dist(a.pos, mid) - dist(b.pos, mid));
  for (const c of candidates) {
    if (elevationFor(s, unit, c.pos) !== c.elevation) continue;
    if (checkPlacement(s, unit, c.pos, c.elevation, placed)) continue;
    if (engagesFoe(c.pos, c.elevation)) continue;
    return { modelId: -1, pos: c.pos, elevation: c.elevation };
  }
  return null;
}
