// Plays one AI-vs-AI game and returns compact stats. Used by the balance sim (sim/ai-sim.test.ts),
// both directly and from worker threads (sim/worker.mjs).

import { readFileSync } from "node:fs";
import { aiCommand } from "../src/engine/ai";
import { defaultListFor } from "../src/engine/data/factions";
import { applyCommand, createGame, type StartBonus } from "../src/engine/game";
import { MISSIONS } from "../src/engine/data/missions";
import { MERCY_LEAD } from "../src/engine/constants";
import { isFlying, profileOf } from "../src/engine/profile";
import { aliveModels, presenceController } from "../src/engine/rules";
import type { FactionId, GameState, ListEntry } from "../src/engine/types";

export interface Job {
  id: number;
  mode: "skirmish" | "assault";
  factions: [FactionId, FactionId];
  missionId: string;
  mapId: string;
  seed: number;
}

/** Per-profile counters, keyed by profile id. */
export interface ProfileStat {
  deployed: number;
  destroyed: number;
  damage: number;
  /** The part of `damage` dealt by impact on the charge. */
  impact: number;
  /** Times this unit was standing on an objective its side controlled at the end of a round. */
  held: number;
}

export interface GameResult {
  job: Job;
  vp: [number, number];
  winner: GameState["winner"];
  cmds: number;
  counts: Record<string, number>;
  damage: [number, number];
  destroyedSupply: [number, number];
  maxMs: number;
  totalMs: number;
  stalled: boolean;
  wipeout: boolean;
  /** The game ended early on the instant-win lead (more than the mission's `mercyLead` VP ahead). */
  mercy: boolean;
  /** The mission's instant-win lead limit. */
  mercyLimit: number;
  /** The biggest VP lead each side held at any point (to see what comebacks happen). */
  peakLead: [number, number];
  round: number;
  /** VP by scoring reason, per player. */
  vpBy: [Record<string, number>, Record<string, number>];
  /** Wounds each side got back on the table: shields recharged, HP healed, models revived or regrown. */
  restored: [Restored, Restored];
  profiles: Record<string, ProfileStat>;
  /** Per side: charges made, short and blocked, and damage by attack kind ("dmg shoot", "dmg impact"...). */
  sides?: [Record<string, number>, Record<string, number>];
  /** Role missions: the role ids of side A (player 1) and side B (player 2). */
  roles?: [string, string];
  error?: string;
}

export interface Restored {
  shield: number;
  hp: number;
  models: number;
}

const MAX_CMDS = 3000;

/** Each on-board model's alive/hp/shield, keyed by unit uid, to spot wounds coming back between commands. */
function woundSnapshot(s: GameState): Map<string, { alive: boolean; hp: number; shield: number }[]> {
  const snap = new Map<string, { alive: boolean; hp: number; shield: number }[]>();
  for (const u of s.units) if (u.onBoard) snap.set(u.uid, u.models.map((m) => ({ alive: m.alive, hp: m.hp, shield: m.shield })));
  return snap;
}

/**
 * SIM_LISTS: path to a JSON file of roster overrides, `{ [faction]: { skirmish?: ListEntry[], assault?: ListEntry[] } }`.
 * Factions or modes left out play their starter roster. Handy for testing new units, which starters may not include.
 */
type ListOverrides = Record<string, Partial<Record<Job["mode"], ListEntry[]>>>;
const listOverrides: ListOverrides = process.env.SIM_LISTS ? JSON.parse(readFileSync(process.env.SIM_LISTS, "utf8")) : {};
const listFor = (f: FactionId, mode: Job["mode"]): ListEntry[] => structuredClone(listOverrides[f]?.[mode] ?? defaultListFor(f, mode));

/**
 * SIM_OPEN=1: open roster (RTS-style) games instead of lists (see src/engine/openRoster.ts).
 * SIM_OPEN_CAP: per-unit cap on the table for those games ("none" = no cap; default: the mode's max copies).
 */
const openRoster = process.env.SIM_OPEN === "1";
const openCapEnv = process.env.SIM_OPEN_CAP;
const openCap = openCapEnv === undefined ? undefined : openCapEnv === "none" ? null : Number(openCapEnv);

/**
 * SIM_BONUS: a head start for player 1 (side A), like the campaign's place perks, to check one isn't a
 * walkover, e.g. SIM_BONUS="resources=2,cp=2".
 */
const startBonus: [StartBonus, undefined] | undefined = process.env.SIM_BONUS
  ? [
      Object.fromEntries(
        process.env.SIM_BONUS.split(",").map((kv) => {
          const [k, v] = kv.split("=");
          return [k!.trim(), Number(v)];
        }),
      ) as StartBonus,
      undefined,
    ]
  : undefined;

/** Collapse a scoring reason like "held objective 3" into a short bucket. */
function vpBucket(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("snack") || r.includes("flag") || r.includes("deliver") || r.includes("cargo")) return "snack";
  if (r.includes("bounty")) return "bounty";
  if (r.includes("salvage")) return "loot";
  if (r.includes("keeping their")) return "guard";
  if (r.includes("home")) return "home";
  if (r.includes("supply") || r.includes("destroy") || r.includes("kill") || r.includes("cutting down")) return "kills";
  if (r.includes("objective") || r.includes("hold") || r.includes("own")) return "objectives";
  return "other";
}

/** Credit the units standing on each objective their side controls (state just before the round ended). */
function creditHolders(s: GameState, stat: (id: string) => ProfileStat): void {
  for (const o of s.objectives) {
    const c = presenceController(s, o);
    if (c === null) continue;
    for (const u of s.units) {
      if (u.owner !== c || !u.onBoard || u.destroyed || isFlying(u) || profileOf(u).structure || u.status.shaken) continue;
      const r = profileOf(u).baseRadius;
      if (aliveModels(u).some((m) => m.elevation === o.elevation && Math.hypot(m.pos.x - o.pos.x, m.pos.y - o.pos.y) <= o.radius + r + 1e-6))
        stat(u.profileId).held += 1;
    }
  }
}

function rolesOf(missionId: string): [string, string] | undefined {
  const r = MISSIONS[missionId]?.roles;
  return r ? [r[0].id, r[1].id] : undefined;
}

export function playGame(job: Job): GameResult {
  const { factions, seed, missionId, mapId } = job;
  let s = createGame({
    orderChoice: true,
    factions,
    seed,
    missionId,
    mapId,
    lists: [listFor(factions[0], job.mode), listFor(factions[1], job.mode)],
    ...(openRoster ? { armyRule: "open" as const, openCap } : {}),
    ...(startBonus ? { startBonus } : {}),
  });
  const counts: Record<string, number> = {};
  const sides: [Record<string, number>, Record<string, number>] = [{}, {}];
  const bump = (p: number, k: string, n = 1) => {
    const c = sides[p as 0 | 1];
    c[k] = (c[k] ?? 0) + n;
  };
  const damage: [number, number] = [0, 0];
  const vpBy: [Record<string, number>, Record<string, number>] = [{}, {}];
  const profiles: Record<string, ProfileStat> = {};
  const stat = (id: string) => (profiles[id] ??= { deployed: 0, destroyed: 0, damage: 0, impact: 0, held: 0 });
  const restored: [Restored, Restored] = [
    { shield: 0, hp: 0, models: 0 },
    { shield: 0, hp: 0, models: 0 },
  ];
  let n = 0;
  let maxMs = 0;
  let totalMs = 0;
  let wipeout = false;
  let mercy = false;
  const peakLead: [number, number] = [0, 0];
  let error: string | undefined;
  while (!s.over && n++ < MAX_CMDS) {
    const t0 = performance.now();
    const cmd = aiCommand(s);
    const ms = performance.now() - t0;
    maxMs = Math.max(maxMs, ms);
    totalMs += ms;
    const key = cmd.type === "ability" ? `ab:${cmd.ability}` : cmd.type === "support" ? `sp:${cmd.ability}` : cmd.type;
    counts[key] = (counts[key] ?? 0) + 1;
    if (cmd.type === "support") counts.support = (counts.support ?? 0) + 1;
    const before = woundSnapshot(s);
    const r = applyCommand(s, cmd);
    if (!r.ok) {
      error = `illegal ${JSON.stringify(cmd)}: ${r.error}`;
      break;
    }
    for (const e of r.events) {
      // Every ability that went off (active or reactive), so new abilities' usage shows up in the results.
      if (e.type === "ability") counts[`ev:${e.ability}`] = (counts[`ev:${e.ability}`] ?? 0) + 1;
      if (e.type === "chargeRoll" || e.type === "chargeFailed") {
        const u = r.state.units.find((x) => x.uid === e.uid);
        if (u) bump(u.owner, e.type === "chargeRoll" ? (e.made ? "charge made" : "charge short") : "charge blocked");
      }
      if (e.type === "attack") {
        const u = s.units.find((x) => x.uid === e.report.uid) ?? r.state.units.find((x) => x.uid === e.report.uid);
        if (u) bump(u.owner, `dmg ${e.report.kind}`, e.report.damage);
        if (u) {
          damage[u.owner] += e.report.damage;
          stat(u.profileId).damage += e.report.damage;
          if (e.report.kind === "impact") stat(u.profileId).impact += e.report.damage;
        }
      } else if (e.type === "deployed") {
        const u = r.state.units.find((x) => x.uid === e.uid);
        if (u) stat(u.profileId).deployed += 1;
      } else if (e.type === "scored") {
        const b = vpBucket(e.reason);
        vpBy[e.player][b] = (vpBy[e.player][b] ?? 0) + e.vp;
      } else if (e.type === "roundEnded") {
        creditHolders(s, stat);
      } else if (e.type === "gameOver" && e.reason.includes("wiped")) wipeout = true;
      else if (e.type === "gameOver" && e.reason.includes("lead")) mercy = true;
    }
    if (r.ok) {
      for (const u of r.state.units) {
        const was = before.get(u.uid);
        if (!was || !u.onBoard) continue;
        u.models.forEach((m, i) => {
          const b = was[i];
          if (!b || !m.alive) return;
          if (!b.alive) restored[u.owner].models += 1;
          else {
            restored[u.owner].shield += Math.max(0, m.shield - b.shield);
            restored[u.owner].hp += Math.max(0, m.hp - b.hp);
          }
        });
      }
    }
    s = r.state;
    const lead = s.players[0].vp - s.players[1].vp;
    peakLead[0] = Math.max(peakLead[0], lead);
    peakLead[1] = Math.max(peakLead[1], -lead);
  }
  const destroyedSupply: [number, number] = [0, 0];
  for (const u of s.units) {
    if (!u.destroyed) continue;
    const p = profileOf(u);
    if (p.structure?.lifetime === "round") continue;
    destroyedSupply[u.owner === 0 ? 1 : 0] += p.supply;
    stat(u.profileId).destroyed += 1;
  }
  return {
    job,
    vp: [s.players[0].vp, s.players[1].vp],
    winner: s.winner,
    cmds: n,
    counts,
    damage,
    destroyedSupply,
    maxMs,
    totalMs,
    stalled: !s.over && !error,
    wipeout,
    mercy,
    mercyLimit: MISSIONS[missionId]?.mercyLead ?? MERCY_LEAD,
    peakLead,
    round: s.round,
    vpBy,
    restored,
    profiles,
    sides,
    roles: rolesOf(missionId),
    error,
  };
}
