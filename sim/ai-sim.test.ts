import { it } from "vitest";
import { aiCommand } from "../src/engine/ai";
import { applyCommand, createGame } from "../src/engine/game";
import type { FactionId } from "../src/engine/types";
it("sim", () => {
  const rows: string[] = [];
  const pairs: [FactionId, FactionId, string, string][] = [["militia","munch","hold","dustbowl"],["munch","concord","grab","mesa"],["concord","militia","brawl","refinery"],["munch","militia","flag","dustbowl"],["militia","concord","hold","mesa"]];
  for (const [a,b,m,map] of pairs) {
    let s = createGame({ factions: [a,b], seed: 11, missionId: m, mapId: map });
    const counts: Record<string, number> = {};
    let n = 0; let maxMs = 0;
    while (!s.over && n++ < 800) {
      const t0 = performance.now();
      const cmd = aiCommand(s);
      maxMs = Math.max(maxMs, performance.now() - t0);
      counts[cmd.type === "ability" ? `ab:${cmd.ability}` : cmd.type] = (counts[cmd.type === "ability" ? `ab:${cmd.ability}` : cmd.type] ?? 0) + 1;
      const r = applyCommand(s, cmd); if (!r.ok) throw new Error(r.error); s = r.state;
    }
    const dep = [0,1].map(p => s.units.filter(u=>u.owner===p && (u.onBoard||u.destroyed)).length + "/" + s.units.filter(u=>u.owner===p).length);
    const dead = [0,1].map(p => s.units.filter(u=>u.owner===p && u.destroyed).length);
    rows.push(`${a} vs ${b} ${m}/${map}: vp ${s.players[0].vp}-${s.players[1].vp} winner ${s.winner} deployed ${dep} destroyed ${dead} cmds ${n} maxMs ${maxMs.toFixed(0)} ${JSON.stringify(counts)}`);
  }
  console.log(rows.join("\n"));
}, 300000);
