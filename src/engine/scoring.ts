// Mission scoring, flags (capture the snack) and end-of-round cleanup.

import { MISSIONS } from "./data/missions";
import { reviveSpot } from "./formation";
import { dist } from "./geometry";
import { hasAbility, isFlying, profileOf } from "./profile";
import { aliveModels, AURA_RANGE, onBoard, presenceController, radiusOf, unitById, unitGap } from "./rules";
import type { GameEvent, GameState, PlayerId } from "./types";

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export function scoreRound(s: GameState, events: GameEvent[]): void {
  const mission = MISSIONS[s.missionId]!;
  const award = (p: PlayerId, vp: number, reason: string) => {
    if (vp <= 0) return;
    s.players[p].vp += vp;
    events.push({ type: "scored", player: p, vp, reason });
  };
  for (const rule of mission.scoring) {
    if (rule.kind === "hold" && s.round >= rule.fromRound) {
      for (const o of s.objectives) {
        if (o.team !== null) continue;
        const c = presenceController(s, o);
        if (c !== null) award(c, rule.vp, `holding objective ${o.number}`);
      }
    } else if (rule.kind === "raidHome") {
      for (const o of s.objectives) {
        if (o.team === null) continue;
        const c = presenceController(s, o);
        if (c === other(o.team)) award(c, rule.vp, `raiding their home objective ${o.number}`);
      }
    } else if (rule.kind === "sticky") {
      for (const o of s.objectives) {
        const c = presenceController(s, o);
        if (c !== null) o.controller = c;
        if (o.controller === null) continue;
        if (o.team === null) award(o.controller, rule.vpNeutral, `owning objective ${o.number}`);
        else if (o.team !== o.controller) award(o.controller, rule.vpEnemyHome, `owning their home objective ${o.number}`);
      }
    }
  }
}

/** Flag pickup, carry, return and capture. Call after anything moves or dies. */
export function updateFlags(s: GameState, events: GameEvent[]): void {
  const mission = MISSIONS[s.missionId]!;
  const rule = mission.scoring.find((r) => r.kind === "flag");
  if (!rule || rule.kind !== "flag") return;
  for (const f of s.flags) {
    if (f.carrier) {
      const u = unitById(s, f.carrier);
      const lead = u && aliveModels(u)[0];
      if (!u || !lead) {
        f.carrier = null;
        continue;
      }
      f.pos = { ...lead.pos };
      const home = s.objectives.find((o) => o.team === u.owner);
      if (home && aliveModels(u).some((m) => dist(m.pos, home.pos) <= home.radius + radiusOf(u))) {
        s.players[u.owner].vp += rule.vp;
        events.push({ type: "scored", player: u.owner, vp: rule.vp, reason: "bringing their snack home" });
        events.push({ type: "flag", team: f.team, text: `${profileOf(u).name} delivers the snack!` });
        f.carrier = null;
        f.pos = { ...f.home };
      }
      continue;
    }
    for (const u of onBoard(s)) {
      if (isFlying(u)) continue;
      const touching = aliveModels(u).some((m) => dist(m.pos, f.pos) <= radiusOf(u) + 1);
      if (!touching) continue;
      if (u.owner !== f.team) {
        if (s.flags.some((g) => g.carrier === u.uid)) continue;
        f.carrier = u.uid;
        events.push({ type: "flag", team: f.team, text: `${profileOf(u).name} grabs the snack!` });
        break;
      }
      if (dist(f.pos, f.home) > 0.01) {
        f.pos = { ...f.home };
        events.push({ type: "flag", team: f.team, text: `${profileOf(u).name} returns their snack home.` });
        break;
      }
    }
  }
}

export function cleanupRound(s: GameState, events: GameEvent[]): void {
  for (const u of onBoard(s)) {
    const prof = profileOf(u);
    if (!u.status.hurt) {
      if (hasAbility(u, "regen")) {
        const m = aliveModels(u).filter((x) => x.hp < prof.hp).sort((a, b) => a.hp - b.hp)[0];
        if (m) {
          m.hp += 1;
          events.push({ type: "ability", uid: u.uid, ability: "regen", text: `${prof.name} regenerates.` });
        }
      }
      if (hasAbility(u, "regrow")) {
        const dead = u.models.find((m) => !m.alive);
        const spot = dead && reviveSpot(s, u);
        if (dead && spot) {
          Object.assign(dead, { alive: true, hp: prof.hp, shield: prof.shield, pos: spot.pos, elevation: spot.elevation });
          events.push({ type: "ability", uid: u.uid, ability: "regrow", text: `${prof.name} regrows a critter.` });
        }
      }
    }
    const radiant = onBoard(s, u.owner).some((f) => hasAbility(f, "radiance") && unitGap(f, u) <= AURA_RANGE);
    for (const m of aliveModels(u)) m.shield = Math.min(prof.shield, m.shield + 1 + (radiant ? 1 : 0));
  }
  for (const u of s.units) {
    const st = u.status;
    Object.assign(st, { acted: false, moved: false, disengaged: false, hunkered: false, charged: false, fought: false, hurt: false });
    st.slowedRounds = Math.max(0, st.slowedRounds - 1);
    u.reactionsUsed = [];
  }
}
