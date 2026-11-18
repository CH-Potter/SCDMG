// Mission scoring, flags (snacks and convoy cargo), mission setup and end-of-round cleanup.

import { allRules, economyOf, GARRISON_FALLBACK_RESOURCES, MISSIONS, rulesFor, type MissionDef, type ObjectiveTarget, type ScoringRule } from "./data/missions";
import { factionOf } from "./data/factions";
import { planUnitMove, reviveSpot } from "./formation";
import { dist, pointInZone } from "./geometry";
import { hasAbility, isFlying, profileFor, profileOf } from "./profile";
import { nextRandom, rollD6 } from "./rng";
import { aliveModels, AURA_RANGE, onBoard, presenceController, radiusOf, unitById, unitGap } from "./rules";
import { freshStatus } from "./supports";
import { platformAt } from "./terrain";
import type { EconomyState, Flag, GameEvent, GameState, MissionState, Objective, PlayerId, Unit, Vec } from "./types";

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

// ---------- mission queries (shared with the AI and the UI) ----------

const missionOf = (s: GameState): MissionDef => MISSIONS[s.missionId]!;

/** The crown objectives (King of the Hill): the neutral objective(s) nearest the board centre. */
export function crownObjectives(s: GameState): Objective[] {
  const c = { x: s.board.width / 2, y: s.board.height / 2 };
  const neutral = s.objectives.filter((o) => o.team === null);
  if (!neutral.length) return [];
  const best = Math.min(...neutral.map((o) => dist(o.pos, c)));
  return neutral.filter((o) => dist(o.pos, c) <= best + 0.5);
}

/** Side `p`'s forward objective: the neutral objective nearest its home (its home if there are no neutrals). */
export function forwardObjective(s: GameState, p: PlayerId): Objective | undefined {
  const home = s.objectives.find((o) => o.team === p);
  if (!home) return undefined;
  let best: Objective | undefined;
  for (const o of s.objectives) if (o.team === null && (!best || dist(o.pos, home.pos) < dist(best.pos, home.pos))) best = o;
  return best ?? home;
}

/** The objective of side `p` a guard or raid rule is about. */
export function targetObjective(s: GameState, p: PlayerId, target: ObjectiveTarget = "home"): Objective | undefined {
  return target === "forward" ? forwardObjective(s, p) : s.objectives.find((o) => o.team === p);
}

/** VP a crown objective would pay `p` if `p` holds it at the coming scoring phase. */
export function crownPayout(s: GameState, o: Objective, p: PlayerId, rule: Extract<ScoringRule, { kind: "crown" }>): number {
  const st = s.missionState?.streaks?.[o.id];
  const held = st && st.player === p ? st.rounds : 0;
  return Math.min(rule.max, rule.vp + rule.step * held);
}

/** The marked unit of player `p` (Bounty), if it's still on the board. */
export function markedUnit(s: GameState, p: PlayerId): Unit | undefined {
  const uid = s.missionState?.bounty?.[p];
  return uid ? s.units.find((u) => u.uid === uid && u.onBoard && !u.destroyed) : undefined;
}

/** Loads of salvage left on an objective (Loot). */
export const loadsLeft = (s: GameState, o: Objective): number => s.missionState?.loads?.[o.id] ?? 0;

/** Each player's economy for the rest of the game (mission defaults, role overrides, garrison supply). */
export function economyState(s: GameState, p: PlayerId): EconomyState {
  const e = s.missionState?.economy?.[p];
  if (e) return e;
  const m = economyOf(missionOf(s), p);
  return { income: m.income, supplyPerRound: m.supplyPerRound, maxSupply: m.maxSupply };
}

/** Supply `p`'s units have conceded so far, squads paying as they shrink (summoned, round-only structures don't count). */
function destroyedSupply(s: GameState, p: PlayerId): number {
  let n = 0;
  for (const u of s.units) if (u.owner === p && !u.summoned && profileOf(u).structure?.lifetime !== "round") n += u.destroyed ? profileOf(u).supply : (u.supplyPaid ?? 0);
  return n;
}

/** The unit a side would have marked for Bounty: its priciest non-structure unit on the board. */
function pickMark(s: GameState, p: PlayerId): string | null {
  const cands = onBoard(s, p).filter((u) => !profileOf(u).structure);
  if (!cands.length) return null;
  cands.sort((a, b) => profileOf(b).cost - profileOf(a).cost || profileOf(b).supply - profileOf(a).supply || a.uid.localeCompare(b.uid));
  return cands[0]!.uid;
}

/** Roll a neutral objective number, avoiding `not` when there's a choice. Uses the game's RNG. */
function rollObjective(s: GameState, not: number | null): number | null {
  const pool = s.objectives.filter((o) => o.team === null && o.number !== not).map((o) => o.number);
  if (!pool.length) return not;
  const [v, next] = nextRandom(s.rng);
  s.rng = next;
  return pool[Math.floor(v * pool.length)]!;
}

/** Where `p`'s convoy cargo starts. */
function cargoStart(s: GameState, p: PlayerId, from: "far" | "home"): Objective | undefined {
  const home = s.objectives.find((o) => o.team === p);
  if (from === "home" || !home) return home;
  const neutral = s.objectives.filter((o) => o.team === null);
  return neutral.sort((a, b) => dist(b.pos, home.pos) - dist(a.pos, home.pos))[0] ?? home;
}

/** The convoy rule `p` scores, if any. */
export function convoyRule(s: GameState, p: PlayerId): Extract<ScoringRule, { kind: "convoy" }> | undefined {
  const r = rulesFor(missionOf(s), p).find((x) => x.kind === "convoy");
  return r && r.kind === "convoy" ? r : undefined;
}

/** The side whose home or deployment zone a convoy cargo is delivered to: its own for `from: "far"`, the enemy's for `from: "home"`. */
export function cargoDestination(s: GameState, f: Flag): PlayerId {
  return convoyRule(s, f.team)?.from === "home" ? other(f.team) : f.team;
}

// ---------- setup ----------

/**
 * Mission setup at game creation: per-role economy, free garrison structures, the first live
 * objectives (Shifting), salvage loads (Loot) and convoy cargo. Call once from createGame, after
 * the initiative roll-off.
 */
export function setupMission(s: GameState): void {
  const mission = missionOf(s);
  const economy = ([0, 1] as const).map((p) => {
    const e = economyOf(mission, p);
    s.players[p].resources = e.startResources;
    s.players[p].supplyCap = e.startSupply;
    return { income: e.income, supplyPerRound: e.supplyPerRound, maxSupply: e.maxSupply };
  }) as [EconomyState, EconomyState];
  const ms: MissionState = { economy };
  for (const p of [0, 1] as const) {
    const n = mission.roles?.[p]?.garrison ?? 0;
    for (let i = 0; i < n; i++) {
      const supply = placeGarrison(s, p, i);
      if (supply === null) s.players[p].resources += GARRISON_FALLBACK_RESOURCES;
      else {
        s.players[p].supplyCap += supply;
        economy[p] = { ...economy[p], maxSupply: economy[p].maxSupply + supply };
      }
    }
  }
  for (const { rule, players } of allRules(mission)) {
    if (rule.kind === "shifting") {
      ms.live = rollObjective(s, null);
      ms.next = rollObjective(s, ms.live);
    } else if (rule.kind === "loot") {
      ms.loads = { ...ms.loads };
      for (const o of s.objectives) if (o.team === null) ms.loads[o.id] = Math.max(ms.loads[o.id] ?? 0, rule.loads);
    } else if (rule.kind === "bounty") {
      ms.bounty = [null, null];
    } else if (rule.kind === "cull") {
      ms.culled = [0, 0];
    } else if (rule.kind === "convoy") {
      for (const p of players) {
        const start = cargoStart(s, p, rule.from);
        if (start) s.flags.push({ team: p, home: { ...start.pos }, pos: { ...start.pos }, carrier: null, cargo: true });
      }
    } else if (rule.kind === "crown") {
      ms.streaks = {};
    }
  }
  s.missionState = ms;
}

/** The faction's cheapest buyable permanent structure, for garrisons. */
function garrisonProfile(s: GameState, p: PlayerId): string | null {
  let f;
  try {
    f = factionOf(s.factions[p]);
  } catch {
    return null;
  }
  const options = (f?.profiles ?? []).filter((x) => x.structure?.lifetime === "permanent" && !x.structure.summonOnly);
  options.sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
  return options[0]?.id ?? null;
}

/**
 * Put a free structure for `p` on the board next to its forward objective (the neutral objective
 * nearest its home), on the side facing the enemy. Returns its supply, or null if it couldn't be placed.
 */
function placeGarrison(s: GameState, p: PlayerId, i: number): number | null {
  const profileId = garrisonProfile(s, p);
  if (!profileId) return null;
  const prof = profileFor(profileId, []);
  const enemyHome = s.objectives.find((o) => o.team === other(p));
  const anchor = forwardObjective(s, p) ?? s.objectives.find((o) => o.team === null);
  if (!anchor) return null;
  const facing = enemyHome ? Math.atan2(enemyHome.pos.y - anchor.pos.y, enemyHome.pos.x - anchor.pos.x) : 0;
  const unit: Unit = {
    uid: `p${p}-garrison-${i}`,
    profileId,
    upgrades: [],
    owner: p,
    models: Array.from({ length: prof.models }, (_, id) => ({ id, pos: { x: 0, y: 0 }, elevation: 0 as const, hp: prof.hp, shield: prof.shield, alive: true })),
    onBoard: true,
    destroyed: false,
    status: freshStatus(0),
    abilityUses: {},
    reactionsUsed: [],
  };
  s.units.push(unit);
  for (let ring = 0; ring < 8; ring++) {
    const r = anchor.radius + prof.baseRadius + 0.4 + ring * 1.2;
    for (let k = 0; k < 16; k++) {
      // Fan out either side of the line toward the enemy: 0, +1, -1, +2, -2...
      const step = Math.ceil(k / 2) * (k % 2 ? 1 : -1);
      const a = facing + (step * Math.PI) / 8;
      const to: Vec = { x: anchor.pos.x + Math.cos(a) * r, y: anchor.pos.y + Math.sin(a) * r };
      if (to.x < 1 || to.y < 1 || to.x > s.board.width - 1 || to.y > s.board.height - 1) continue;
      const plan = planUnitMove(s, unit, 0, to, { allowance: 0, teleport: true });
      if (typeof plan === "string") continue;
      for (const pl of plan.placements) {
        const m = unit.models.find((x) => x.id === pl.modelId)!;
        m.pos = { ...pl.pos };
        m.elevation = pl.elevation;
      }
      return prof.supply;
    }
  }
  s.units.pop();
  return null;
}

// ---------- scoring ----------

export function scoreRound(s: GameState, events: GameEvent[]): void {
  const mission = missionOf(s);
  const award = (p: PlayerId, vp: number, reason: string) => {
    if (vp <= 0) return;
    s.players[p].vp += vp;
    events.push({ type: "scored", player: p, vp, reason });
  };
  let ms: MissionState = { ...s.missionState };
  for (const { rule, players } of allRules(mission)) {
    const scores = (p: PlayerId | null): p is PlayerId => p !== null && players.includes(p);
    if (rule.kind === "hold" && s.round >= rule.fromRound) {
      for (const o of s.objectives) {
        if (o.team !== null) continue;
        const c = presenceController(s, o);
        if (scores(c)) award(c, rule.vp, `holding objective ${o.number}`);
      }
    } else if (rule.kind === "raidHome") {
      for (const p of players) {
        const o = targetObjective(s, other(p), rule.target);
        if (o && presenceController(s, o) === p) award(p, rule.vp, `raiding their ${rule.target === "forward" ? "stronghold" : "home"} objective ${o.number}`);
      }
    } else if (rule.kind === "flag" && rule.carryVp) {
      // Holding the enemy's snack pays every round, even if you never get it home.
      for (const f of s.flags) {
        if (f.cargo) continue;
        const carrier = f.carrier ? s.units.find((u) => u.uid === f.carrier && u.onBoard) : undefined;
        if (carrier && carrier.owner !== f.team && scores(carrier.owner)) award(carrier.owner, rule.carryVp, "holding their snack");
      }
    } else if (rule.kind === "sticky") {
      for (const o of s.objectives) {
        const c = presenceController(s, o);
        if (c !== null) o.controller = c;
        if (!scores(o.controller)) continue;
        if (o.team === null) award(o.controller, rule.vpNeutral, `owning objective ${o.number}`);
        else if (o.team !== o.controller) award(o.controller, rule.vpEnemyHome, `owning their home objective ${o.number}`);
      }
    } else if (rule.kind === "crown") {
      const crowns = crownObjectives(s);
      const streaks = { ...ms.streaks };
      for (const o of s.objectives) {
        if (o.team !== null) continue;
        const c = presenceController(s, o);
        if (!crowns.includes(o)) {
          if (scores(c)) award(c, rule.outerVp, `holding objective ${o.number}`);
          continue;
        }
        if (c === null) {
          delete streaks[o.id];
          continue;
        }
        const st = streaks[o.id];
        const before = st && st.player === c ? st.rounds : 0;
        if (scores(c)) award(c, Math.min(rule.max, rule.vp + rule.step * before), `holding the heap (${before + 1} round${before ? "s" : ""} running)`);
        streaks[o.id] = { player: c, rounds: before + 1 };
      }
      ms = { ...ms, streaks };
    } else if (rule.kind === "shifting") {
      for (const o of s.objectives) {
        if (o.team !== null) continue;
        const c = presenceController(s, o);
        if (!scores(c)) continue;
        if (o.number === ms.live) award(c, rule.vp, `holding the live objective ${o.number}`);
        else award(c, rule.otherVp, `holding objective ${o.number}`);
      }
    } else if (rule.kind === "bounty") {
      const marks = ms.bounty ?? [null, null];
      for (const p of [0, 1] as const) {
        const uid = marks[p];
        const u = uid ? unitById(s, uid) : undefined;
        if (u && u.destroyed && scores(other(p))) award(other(p), rule.vp, `collecting the bounty on ${profileOf(u).name}`);
      }
    } else if (rule.kind === "loot") {
      const loads = { ...ms.loads };
      for (const o of s.objectives) {
        if (o.team !== null || !(loads[o.id] ?? 0)) continue;
        const c = presenceController(s, o);
        if (!scores(c)) continue;
        loads[o.id] = loads[o.id]! - 1;
        award(c, rule.vp, `hauling salvage from objective ${o.number}`);
        if (rule.resources) s.players[c].resources += rule.resources;
      }
      ms = { ...ms, loads };
    } else if (rule.kind === "guard" && s.round >= rule.fromRound) {
      for (const p of players) {
        const o = targetObjective(s, p, rule.target);
        if (o && presenceController(s, o) !== other(p)) award(p, rule.vp, `keeping their ${rule.target === "forward" ? "stronghold" : "home"} objective ${o.number}`);
      }
    } else if (rule.kind === "cull") {
      const culled: [number, number] = [...(ms.culled ?? [0, 0])];
      for (const p of players) {
        const kills = destroyedSupply(s, other(p));
        // floors of the running totals, so a fractional rate (1 VP per 2 supply) pays as each step is crossed
        award(p, Math.floor(kills * rule.vpPerSupply + 1e-9) - Math.floor(culled[p] * rule.vpPerSupply + 1e-9), "destroying enemy supply");
        culled[p] = kills;
      }
      ms = { ...ms, culled };
    } else if (rule.kind === "convoy" && rule.carryVp) {
      for (const f of s.flags) {
        if (!f.cargo || !players.includes(f.team)) continue;
        const carrier = f.carrier ? s.units.find((u) => u.uid === f.carrier && u.onBoard) : undefined;
        if (carrier && carrier.owner === f.team) award(f.team, rule.carryVp, "moving the cargo");
      }
    }
  }
  // New bounty marks for the coming round: each side's priciest unit on the board.
  if (ms.bounty) ms = { ...ms, bounty: [pickMark(s, 0), pickMark(s, 1)] };
  // Shifting: the announced objective goes live, and the next one is rolled.
  if (ms.live !== undefined && s.round < s.maxRounds) {
    const live = ms.next ?? null;
    ms = { ...ms, live, next: rollObjective(s, live) };
  }
  s.missionState = ms;
}

/** The level a snack is lying on: on a platform if it's inside one, otherwise the ground. */
export function flagElevation(s: GameState, f: Flag): 0 | 1 {
  return platformAt(s, f.pos) ? 1 : 0;
}

const touchesFlag = (s: GameState, u: Unit, f: Flag): boolean => {
  if (isFlying(u)) return false;
  const level = flagElevation(s, f);
  return aliveModels(u).some((m) => m.elevation === level && dist(m.pos, f.pos) <= radiusOf(u) + 1);
};

/** A carrier that teleports (Blink, Tunnel, Recall) leaves the snack behind where it stood. */
export function dropCarriedFlag(s: GameState, u: Unit, events: GameEvent[], why: string): void {
  const lead = aliveModels(u)[0];
  for (const f of s.flags) {
    if (f.carrier !== u.uid) continue;
    f.carrier = null;
    if (lead) f.pos = { ...lead.pos };
    events.push({ type: "flag", team: f.team, text: `${profileOf(u).name} ${why} and drops the ${f.cargo ? "cargo" : "snack"}!` });
  }
}

/** Is a unit at side `p`'s delivery point: its home objective or (on the ground) its deployment zone? */
function atDelivery(s: GameState, u: Unit, p: PlayerId): boolean {
  const home = s.objectives.find((o) => o.team === p);
  const r = radiusOf(u);
  if (home && aliveModels(u).some((m) => m.elevation === home.elevation && dist(m.pos, home.pos) <= home.radius + r)) return true;
  return aliveModels(u).some((m) => m.elevation === 0 && s.spawn[p].some((poly) => pointInZone(m.pos, poly)));
}

/**
 * Flag pickup, carry, return and capture. Call after anything moves or dies.
 * Models only touch a snack on their own level. A dropped snack touched by its own side goes
 * straight home (defenders win ties); otherwise an enemy touching it grabs it. A carrier scores as
 * soon as it touches its own home objective, even on the move it picks the snack up.
 * Convoy cargo is the other way round: its own side carries it, and an enemy touching it while
 * it's dropped away from its start sends it back there.
 */
export function updateFlags(s: GameState, events: GameEvent[]): void {
  if (!s.flags.length) return;
  const snack = missionOf(s).scoring.find((r) => r.kind === "flag");
  for (const f of s.flags) {
    if (f.carrier && !unitById(s, f.carrier)?.onBoard) f.carrier = null;
    const word = f.cargo ? "cargo" : "snack";
    if (!f.carrier) {
      const touching = onBoard(s).filter((u) => touchesFlag(s, u, f));
      const atHome = dist(f.pos, f.home) <= 0.01;
      if (f.cargo) {
        const raider = touching.find((u) => u.owner !== f.team);
        if (raider && !atHome) {
          f.pos = { ...f.home };
          events.push({ type: "flag", team: f.team, text: `${profileOf(raider).name} kicks the cargo back to the start!` });
          continue;
        }
        const porter = touching.find((u) => u.owner === f.team && !s.flags.some((g) => g.carrier === u.uid));
        if (!porter) continue;
        f.carrier = porter.uid;
        events.push({ type: "flag", team: f.team, text: `${profileOf(porter).name} picks up the cargo.` });
      } else {
        const defender = touching.find((u) => u.owner === f.team);
        if (defender && !atHome) {
          f.pos = { ...f.home };
          events.push({ type: "flag", team: f.team, text: `${profileOf(defender).name} returns their snack home.` });
          continue;
        }
        const thief = touching.find((u) => u.owner !== f.team && !s.flags.some((g) => g.carrier === u.uid));
        if (!thief) continue;
        f.carrier = thief.uid;
        events.push({ type: "flag", team: f.team, text: `${profileOf(thief).name} grabs the snack!` });
      }
    }
    const u = unitById(s, f.carrier)!;
    const lead = aliveModels(u)[0];
    if (!lead) {
      f.carrier = null;
      continue;
    }
    f.pos = { ...lead.pos };
    const rule = f.cargo ? convoyRule(s, f.team) : snack && snack.kind === "flag" ? snack : undefined;
    if (!rule) continue;
    // Snacks go to the thief's own home; cargo to its destination side's home (or deployment zone).
    const dest = f.cargo ? cargoDestination(s, f) : u.owner;
    if (atDelivery(s, u, dest)) {
      s.players[u.owner].vp += rule.vp;
      events.push({ type: "scored", player: u.owner, vp: rule.vp, reason: f.cargo ? "delivering the cargo" : "bringing their snack home" });
      events.push({ type: "flag", team: f.team, text: `${profileOf(u).name} delivers the ${word}!` });
      f.carrier = null;
      f.pos = { ...f.home };
    }
  }
}

export function cleanupRound(s: GameState, events: GameEvent[]): void {
  const recharged: [number, number] = [0, 0];
  for (const u of onBoard(s)) {
    const prof = profileOf(u);
    if (!u.status.hurt) {
      const mended = onBoard(s, u.owner).some((f) => f.uid !== u.uid && hasAbility(f, "mending-aura") && unitGap(f, u) <= AURA_RANGE);
      if (hasAbility(u, "regen") || mended) {
        const m = aliveModels(u).filter((x) => x.hp < prof.hp).sort((a, b) => a.hp - b.hp)[0];
        if (m) {
          m.hp += 1;
          events.push({ type: "ability", uid: u.uid, ability: "regen", text: `${prof.name} ${hasAbility(u, "regen") ? "regenerates" : "is mended by spores"}.` });
        }
      }
    }
    // Regrow (only when unhurt this round), or a Brood Bond nearby (hurt or not): one lost model comes back.
    const own = hasAbility(u, "regrow") && !u.status.hurt;
    const mother = own || prof.structure ? undefined : onBoard(s, u.owner).find((f) => f.uid !== u.uid && hasAbility(f, "brood-bond") && unitGap(f, u) <= AURA_RANGE);
    if (own || mother) {
      const dead = u.models.find((m) => !m.alive);
      const spot = dead && reviveSpot(s, u);
      if (dead && spot) {
        Object.assign(dead, { alive: true, hp: prof.hp, shield: prof.shield, pos: spot.pos, elevation: spot.elevation });
        events.push(
          mother
            ? { type: "ability", uid: mother.uid, ability: "brood-bond", text: `${profileOf(mother).name} lays again: ${prof.name} regrows a model.` }
            : { type: "ability", uid: u.uid, ability: "regrow", text: `${prof.name} regrows a critter.` },
        );
      }
    }
    const radiant = onBoard(s, u.owner).some((f) => hasAbility(f, "radiance") && unitGap(f, u) <= AURA_RANGE);
    for (const m of aliveModels(u)) {
      const was = m.shield;
      m.shield = Math.min(prof.shield, m.shield + 1 + (radiant ? 1 : 0));
      if (m.shield > was) recharged[u.owner] += 1;
    }
  }
  for (const p of [0, 1] as const) if (recharged[p]) events.push({ type: "recharged", player: p, models: recharged[p] });
  // Shaken units try to pull themselves together: 4+ recovers.
  for (const u of onBoard(s)) {
    if (!u.status.shaken) continue;
    if (rollD6(s) >= 4) {
      u.status.shaken = false;
      events.push({ type: "rallied", uid: u.uid, how: "roll" });
    }
  }
  for (const u of s.units) {
    const st = u.status;
    Object.assign(st, { acted: false, moved: false, disengaged: false, hunkered: false, charged: false, fought: false, hurt: false, meleeBonus: 0, rangedBonus: 0, braced: false, abilityUsed: false, reckless: false, corroded: false, spotted: false, hasted: 0, provoking: false, evadeBonus: 0, precisionBonus: 0, trackingBonus: 0, dugIn: 0, blinded: false, exposed: false, smoked: 0, silenced: false, overcharged: false, overwatching: false });
    st.slowedRounds = Math.max(0, st.slowedRounds - 1);
    u.reactionsUsed = [];
  }
}
