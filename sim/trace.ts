// Debug helper: plays one game and prints a per-round summary (objective control, units, VP).
import { aiCommand } from "../src/engine/ai";
import { applyCommand, createGame } from "../src/engine/game";
import { isFlying, profileOf } from "../src/engine/profile";
import { aliveModels, objectivePresence } from "../src/engine/rules";
import type { FactionId } from "../src/engine/types";

export function trace(a: FactionId, b: FactionId, missionId: string, mapId: string, seed: number): string {
  let s = createGame({ orderChoice: true, factions: [a, b], seed, missionId, mapId });
  const out: string[] = [`${a} vs ${b} ${missionId}/${mapId} #${seed}`];
  let n = 0;
  const tally: Record<string, number> = {};
  while (!s.over && n++ < 3000) {
    const cmd = aiCommand(s);
    const key = `${s.activePlayer}:${cmd.type === "ability" ? "ab:" + cmd.ability : cmd.type === "support" ? "sup:" + cmd.ability : cmd.type}`;
    tally[key] = (tally[key] ?? 0) + 1;
    const r = applyCommand(s, cmd);
    if (!r.ok) return out.join("\n") + `\nILLEGAL ${JSON.stringify(cmd)} ${r.error}`;
    for (const e of r.events) {
      if (e.type === "morale") out.push(`   morale ${e.uid} ${e.roll} vs ${e.nerve} shaken=${e.shaken}`);
      if (e.type === "rallied") out.push(`   rallied ${e.uid} ${e.how}`);
      if (e.type === "roundEnded" || e.type === "gameOver") {
        out.push(`-- round ${s.round} end: vp ${s.players[0].vp}-${s.players[1].vp} res ${s.players[0].resources}/${s.players[1].resources} cp ${s.players[0].cp}/${s.players[1].cp}`);
        for (const o of s.objectives) {
          const pr = objectivePresence(s, o);
          const who = s.units.filter((u) => u.onBoard && !u.destroyed && !isFlying(u) && aliveModels(u).some((m) => Math.hypot(m.pos.x - o.pos.x, m.pos.y - o.pos.y) <= o.radius + profileOf(u).baseRadius));
          out.push(`   obj${o.number}${o.team !== null ? "(home" + o.team + ")" : ""} ctrl=${o.controller} presence ${pr.join("/")} ${who.map((u) => `${u.owner}:${u.profileId}${u.status.shaken ? "(S)" : ""}[${aliveModels(u).length}]`).join(" ")}`);
        }
        out.push(`   on board: ${s.units.filter((u) => u.onBoard && !u.destroyed).map((u) => `${u.owner}:${u.profileId}[${aliveModels(u).length}]`).join(" ")}`);
      }
      if (e.type === "scored") out.push(`   +${e.vp} p${e.player} ${e.reason}`);
    }
    s = r.state;
  }
  out.push(`winner ${s.winner} vp ${s.players[0].vp}-${s.players[1].vp}`);
  out.push(JSON.stringify(tally));
  return out.join("\n");
}
