// Test helper: the same game seen from the other seat (board rotated 180°, owners swapped, lists in their original order).
import type { Command, GameState, PlayerId, Vec } from "../../src/engine/types";

export const flip = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export function mirrorState(s: GameState): GameState {
  const W = s.board.width;
  const H = s.board.height;
  const m = (v: Vec): Vec => ({ x: W - v.x, y: H - v.y });
  const t: GameState = structuredClone(s);
  for (const u of t.units) {
    u.owner = flip(u.owner);
    for (const md of u.models) md.pos = m(md.pos);
  }
  t.players = [t.players[1], t.players[0]];
  t.activePlayer = flip(t.activePlayer);
  t.initiative = flip(t.initiative);
  if (t.initiativeClaim != null) t.initiativeClaim = flip(t.initiativeClaim);
  if (t.orderChoice) t.orderChoice = { ...t.orderChoice, player: flip(t.orderChoice.player) };
  for (const o of t.objectives) {
    o.pos = m(o.pos);
    if (o.team !== null) o.team = flip(o.team);
    if (o.controller !== null) o.controller = flip(o.controller);
  }
  t.spawn = [t.spawn[1].map((z) => z.map(m)), t.spawn[0].map((z) => z.map(m))];
  for (const tr of t.terrain) tr.poly = tr.poly.map(m);
  for (const a of t.access) {
    a.low = m(a.low);
    a.high = m(a.high);
  }
  for (const f of t.flags) {
    f.team = flip(f.team);
    f.home = m(f.home);
    f.pos = m(f.pos);
  }
  const ms = t.missionState;
  if (ms?.economy) ms.economy = [ms.economy[1], ms.economy[0]];
  if (ms?.culled) ms.culled = [ms.culled[1], ms.culled[0]];
  if (ms?.bounty) ms.bounty = [ms.bounty[1], ms.bounty[0]];
  if (ms?.streaks) for (const k of Object.keys(ms.streaks)) ms.streaks[k] = { ...ms.streaks[k]!, player: flip(ms.streaks[k]!.player) };
  if (t.winner === 0 || t.winner === 1) t.winner = flip(t.winner);
  return t;
}


/** The mirrored command, for comparing the AI's answers in a state and in its mirror. */
export function mirrorCmd(s: GameState, c: Command): Command {
  const m = (v: Vec): Vec => ({ x: s.board.width - v.x, y: s.board.height - v.y });
  const x = structuredClone(c) as Command & { to?: Vec; point?: Vec; player?: PlayerId };
  if (x.to) x.to = m(x.to);
  if (x.point) x.point = m(x.point);
  if (x.player !== undefined) x.player = flip(x.player);
  return x;
}
