// Side-bias check: mirror matches only, every game with its own seed.
// Run with: SIM_SIDEBIAS=1 VITEST_SIM=1 npx vitest run sim/side-bias.test.ts --reporter=verbose
import { it } from "vitest";
import { aiCommand } from "../src/engine/ai";
import { applyCommand, createGame } from "../src/engine/game";
import type { GameState } from "../src/engine/types";

const maps = ["dustbowl", "mesa", "refinery"];
const missions = ["hold", "grab", "brawl", "flag"];
const factions = ["militia", "munch", "concord"];

it.skipIf(!process.env.SIM_SIDEBIAS)("side bias", () => {
  const rows: { map: string; mission: string; f: string; seed: number; winner: string; init1: number; vp: [number, number]; firstMover: number[] }[] = [];
  for (const map of maps)
    for (const mission of missions)
      for (const f of factions)
        for (let seed = 1; seed <= 8; seed++) {
          let s: GameState = createGame({ orderChoice: true, factions: [f, f], seed: (rows.length + 1) * 2654435761 >>> 0, missionId: mission, mapId: map });
          const init1 = s.initiative;
          const firstMover: number[] = [];
          let lastRound = 0;
          let n = 0;
          while (!s.over && n++ < 1500) {
            if (s.round !== lastRound) {
              firstMover.push(s.initiative);
              lastRound = s.round;
            }
            const r = applyCommand(s, aiCommand(s));
            if (!r.ok) throw new Error(r.error);
            s = r.state;
          }
          rows.push({ map, mission, f, seed, winner: String(s.winner), init1, vp: [s.players[0].vp, s.players[1].vp], firstMover });
        }
  const tally = (pred: (r: (typeof rows)[number]) => boolean) => {
    const sub = rows.filter(pred);
    const w0 = sub.filter((r) => r.winner === "0").length;
    const w1 = sub.filter((r) => r.winner === "1").length;
    return `${sub.length} games: P1 ${w0} · P2 ${w1} · draw ${sub.length - w0 - w1}`;
  };
  const out: string[] = [];
  out.push("ALL " + tally(() => true));
  for (const m of maps) out.push(`map ${m}: ` + tally((r) => r.map === m));
  for (const m of missions) out.push(`mission ${m}: ` + tally((r) => r.mission === m));
  for (const f of factions) out.push(`faction ${f}: ` + tally((r) => r.f === f));
  out.push("P1 won initiative: " + tally((r) => r.init1 === 0));
  out.push("P2 won initiative: " + tally((r) => r.init1 === 1));
  const firstShare = rows.reduce((n, r) => n + r.firstMover.filter((x) => x === 1).length, 0) / rows.reduce((n, r) => n + r.firstMover.length, 0);
  out.push(`share of rounds where P2 moved first: ${(firstShare * 100).toFixed(1)}%`);
  const avg = (i: 0 | 1) => (rows.reduce((n, r) => n + r.vp[i], 0) / rows.length).toFixed(2);
  out.push(`avg VP: P1 ${avg(0)} · P2 ${avg(1)}`);
  console.log(out.join("\n"));
}, 2400000);
