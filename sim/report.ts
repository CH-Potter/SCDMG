// Win-rate tables for the balance sim. Pure functions over GameResult[]; no engine imports.

import type { GameResult } from "./play";

const pct = (x: number, n: number) => (n ? ((100 * x) / n).toFixed(1) : "-").padStart(5);
const fix = (x: number, d = 1) => x.toFixed(d);

interface Tally {
  n: number;
  w: number;
  d: number;
  l: number;
  vpFor: number;
  vpAgainst: number;
  dmgFor: number;
  dmgAgainst: number;
}
const tally = (): Tally => ({ n: 0, w: 0, d: 0, l: 0, vpFor: 0, vpAgainst: 0, dmgFor: 0, dmgAgainst: 0 });

function add(t: Tally, g: GameResult, side: 0 | 1): void {
  const o = side === 0 ? 1 : 0;
  t.n += 1;
  if (g.winner === "draw" || g.winner === null) t.d += 1;
  else if (g.winner === side) t.w += 1;
  else t.l += 1;
  t.vpFor += g.vp[side];
  t.vpAgainst += g.vp[o];
  t.dmgFor += g.damage[side];
  t.dmgAgainst += g.damage[o];
}

/** Score: wins plus half the draws, as a percentage. */
const score = (t: Tally) => (t.n ? (100 * (t.w + t.d / 2)) / t.n : 0);

function factionTable(games: GameResult[]): string[] {
  const by: Record<string, Tally> = {};
  for (const g of games) for (const side of [0, 1] as const) add((by[g.job.factions[side]] ??= tally()), g, side);
  const rows = ["faction    games    W    D    L   win%  score%  VP for/against   dmg for/against"];
  for (const [f, t] of Object.entries(by).sort()) {
    rows.push(
      `${f.padEnd(9)} ${String(t.n).padStart(6)} ${String(t.w).padStart(4)} ${String(t.d).padStart(4)} ${String(t.l).padStart(4)}  ${pct(t.w, t.n)}  ${fix(score(t)).padStart(5)}   ${fix(t.vpFor / t.n).padStart(5)} / ${fix(t.vpAgainst / t.n).padEnd(5)}    ${fix(t.dmgFor / t.n).padStart(5)} / ${fix(t.dmgAgainst / t.n)}`,
    );
  }
  return rows;
}

function pairingTable(games: GameResult[]): string[] {
  const by: Record<string, { a: string; b: string; t: Tally }> = {};
  for (const g of games) {
    const [a, b] = [...g.job.factions].sort() as [string, string];
    const side = g.job.factions[0] === a ? 0 : 1;
    const e = (by[`${a}|${b}`] ??= { a, b, t: tally() });
    add(e.t, g, side);
  }
  const rows = ["pairing (A vs B)        games  A wins  draws  B wins   A score%   avg VP A-B"];
  for (const { a, b, t } of Object.values(by).sort((x, y) => (x.a + x.b).localeCompare(y.a + y.b))) {
    rows.push(
      `${`${a} vs ${b}`.padEnd(22)} ${String(t.n).padStart(6)} ${String(t.w).padStart(7)} ${String(t.d).padStart(6)} ${String(t.l).padStart(7)}   ${fix(score(t)).padStart(7)}    ${fix(t.vpFor / t.n)}-${fix(t.vpAgainst / t.n)}`,
    );
  }
  return rows;
}

/** Faction score% broken down by some key (mission, map). */
function splitTable(games: GameResult[], key: (g: GameResult) => string, label: string): string[] {
  const factions = [...new Set(games.flatMap((g) => g.job.factions))].sort();
  const by: Record<string, Record<string, Tally>> = {};
  for (const g of games)
    for (const side of [0, 1] as const) add(((by[key(g)] ??= {})[g.job.factions[side]] ??= tally()), g, side);
  const rows = [`${label.padEnd(12)} ${factions.map((f) => f.padStart(9)).join("")}   (score%, n per faction)`];
  for (const k of Object.keys(by).sort()) {
    rows.push(`${k.padEnd(12)} ${factions.map((f) => fix(score(by[k]![f] ?? tally())).padStart(9)).join("")}   n=${by[k]![factions[0]!]?.n ?? 0}`);
  }
  return rows;
}

function unitTable(games: GameResult[]): string[] {
  const agg: Record<string, { deployed: number; destroyed: number; damage: number; held: number }> = {};
  for (const g of games)
    for (const [id, p] of Object.entries(g.profiles)) {
      const a = (agg[id] ??= { deployed: 0, destroyed: 0, damage: 0, held: 0 });
      a.held += p.held ?? 0;
      a.deployed += p.deployed;
      a.destroyed += p.destroyed;
      a.damage += p.damage;
    }
  const rows = ["unit                 deploys  dmg/deploy  lost%  obj-rounds/deploy"];
  for (const [id, a] of Object.entries(agg).sort()) {
    if (!a.deployed) continue;
    rows.push(`${id.padEnd(20)} ${String(a.deployed).padStart(7)}  ${fix(a.damage / a.deployed, 2).padStart(10)}  ${pct(a.destroyed, a.deployed)}  ${fix(a.held / a.deployed, 2).padStart(8)}`);
  }
  return rows;
}

/**
 * Role missions: win rates per role (side A = player 1, side B = player 2), overall and per faction
 * playing that role. Aim for every role between 45% and 55% score.
 */
function roleTable(games: GameResult[]): string[] {
  const roleGames = games.filter((g) => g.roles);
  if (!roleGames.length) return [];
  const factions = [...new Set(roleGames.flatMap((g) => g.job.factions))].sort();
  const by: Record<string, { all: Tally; f: Record<string, Tally> }> = {};
  for (const g of roleGames)
    for (const side of [0, 1] as const) {
      const key = `${g.job.missionId}:${g.roles![side]}`;
      const e = (by[key] ??= { all: tally(), f: {} });
      add(e.all, g, side);
      add((e.f[g.job.factions[side]] ??= tally()), g, side);
    }
  const rows = [`role                     games  win%  score%  avg VP for/against   ${factions.map((f) => f.padStart(9)).join("")}   (score% per faction in that role)`];
  for (const [k, e] of Object.entries(by).sort()) {
    const t = e.all;
    rows.push(
      `${k.padEnd(24)} ${String(t.n).padStart(5)} ${pct(t.w, t.n)}  ${fix(score(t)).padStart(5)}   ${fix(t.vpFor / t.n).padStart(5)} / ${fix(t.vpAgainst / t.n).padEnd(5)}      ${factions.map((f) => fix(score(e.f[f] ?? tally())).padStart(9)).join("")}`,
    );
  }
  return rows;
}

export function report(title: string, games: GameResult[]): string {
  const ok = games.filter((g) => !g.error);
  const errors = games.filter((g) => g.error);
  const configs = new Set(games.map((g) => `${g.job.factions.join("-")}/${g.job.missionId}/${g.job.mapId}`)).size;
  const p0 = ok.filter((g) => g.winner === 0).length;
  const p1 = ok.filter((g) => g.winner === 1).length;
  const draws = ok.filter((g) => g.winner === "draw" || g.winner === null).length;
  const stalls = ok.filter((g) => g.stalled).length;
  const avg = (f: (g: GameResult) => number) => fix(ok.reduce((s, g) => s + f(g), 0) / Math.max(1, ok.length));
  const cmds = ok.reduce((s, g) => s + g.cmds, 0);
  const ms = ok.reduce((s, g) => s + g.totalMs, 0);
  const all: Record<string, number> = {};
  for (const g of ok) for (const [k, v] of Object.entries(g.counts)) all[k] = (all[k] ?? 0) + v;
  const share = (k: string) => pct(all[k] ?? 0, cmds).trim();
  const rows = [
    `=== ${title}: ${ok.length} games (${configs} configs) ===`,
    ...factionTable(ok),
    "",
    ...pairingTable(ok),
    "",
    ...splitTable(ok, (g) => g.job.missionId, "mission"),
    "",
    ...splitTable(ok, (g) => g.job.mapId, "map"),
    "",
    ...(ok.some((g) => g.roles) ? [...roleTable(ok), ""] : []),
    `side check: player 0 won ${p0}, player 1 won ${p1}, draws ${draws} (${pct(draws, ok.length).trim()}%)`,
    `stall check: ${stalls} stalled (hit the command cap), ${errors.length} errors, ${ok.filter((g) => g.wipeout).length} wipeouts · avg round reached ${avg((g) => g.round)} · avg cmds ${avg((g) => g.cmds)}`,
    `avg total VP ${avg((g) => g.vp[0] + g.vp[1])} · avg dmg ${avg((g) => g.damage[0] + g.damage[1])} · avg supply killed ${avg((g) => g.destroyedSupply[0] + g.destroyedSupply[1])}`,
    `command mix: hunker ${share("hunker")}% hold ${share("hold")}% shoot ${share("shoot")}% charge ${share("charge")}% fight ${share("fight")}% · avg AI ms ${fix(ms / Math.max(1, cmds))} · worst ms ${fix(Math.max(0, ...ok.map((g) => g.maxMs)), 0)}`,
    "",
    ...unitTable(ok),
  ];
  for (const e of errors.slice(0, 5)) rows.push(`ERROR ${JSON.stringify(e.job)}: ${e.error}`);
  return rows.join("\n");
}
