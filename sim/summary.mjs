// Balance-pass tables from a sim results file (SIM_OUT, or `node sim/run.mjs --out`):
//
//   node sim/summary.mjs <results.json> [--vs <before.json>] [--pair concord-swarm] [--only pairs,seeds,units,abilities]
//
//   pairs      per pairing: score, VP sources, damage, score per mission and map (with --vs: the change)
//   seeds      per pairing: score per seed (how noisy a figure is)
//   units      per pairing: per-unit deploys, damage, losses, objective rounds
//   abilities  per faction: ability use per game (ab: unit abilities, sp: support plays, ev: abilities
//              that went off, active or reactive), and per-side counters (charges, damage by kind)
//
// Score% counts a draw as half. Plain JS on purpose: runs with node alone, no build.

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!file) {
  console.log("Usage: node sim/summary.mjs <results.json> [--vs <before.json>] [--pair a-b] [--only pairs,seeds,units,abilities]");
  process.exit(2);
}
const load = (f) => JSON.parse(readFileSync(f, "utf8")).filter((g) => !g.error);
const games = load(file);
const before = opt("vs") ? load(opt("vs")) : null;
const only = new Set((opt("only") ?? "pairs,seeds,units,abilities").split(","));
const pairFilter = opt("pair");

const factions = [...new Set(games.flatMap((g) => g.job.factions))].sort();
const pairs = [];
for (let i = 0; i < factions.length; i++) for (let j = i + 1; j < factions.length; j++) pairs.push([factions[i], factions[j]]);
const pct = (x) => (100 * x).toFixed(1);
/** Score of `a` in a game (1 win, 0.5 draw, 0 loss) and its side index. */
const scoreOf = (g, a) => {
  const ia = g.job.factions.indexOf(a);
  return { ia, ib: 1 - ia, s: g.winner === ia ? 1 : g.winner === 1 - ia ? 0 : 0.5 };
};
const between = (gs, a, b) => gs.filter((g) => g.job.factions.includes(a) && g.job.factions.includes(b));
const mean = (gs, a) => (gs.length ? gs.reduce((n, g) => n + scoreOf(g, a).s, 0) / gs.length : NaN);
const delta = (now, then) => (Number.isNaN(then) ? "" : ` (${now >= then ? "+" : ""}${(100 * (now - then)).toFixed(1)})`);

console.log(`${file}: ${games.length} games${before ? `, compared with ${opt("vs")} (${before.length} games)` : ""}`);
for (const [a, b] of pairs) {
  if (pairFilter && pairFilter !== `${a}-${b}` && pairFilter !== `${b}-${a}`) continue;
  const gs = between(games, a, b);
  if (!gs.length) continue;
  const old = before ? between(before, a, b) : [];
  const n = gs.length;
  const sc = mean(gs, a);
  console.log(`\n== ${a} vs ${b}: n=${n}, ${a} score ${pct(sc)}%${before ? delta(sc, mean(old, a)) : ""}`);
  if (only.has("pairs")) {
    const vp = { [a]: {}, [b]: {} };
    const dmg = { [a]: 0, [b]: 0 };
    for (const g of gs) {
      const { ia, ib } = scoreOf(g, a);
      for (const [f, i] of [[a, ia], [b, ib]]) {
        for (const [k, v] of Object.entries(g.vpBy?.[i] ?? {})) vp[f][k] = (vp[f][k] ?? 0) + v;
        dmg[f] += g.damage[i];
      }
    }
    for (const f of [a, b]) console.log(`  ${f.padEnd(9)} dmg ${(dmg[f] / n).toFixed(1).padStart(5)}  VP: ${Object.entries(vp[f]).sort().map(([k, v]) => `${k} ${(v / n).toFixed(2)}`).join(", ")}`);
    const split = (key, label) => {
      const keys = [...new Set(gs.map(key))].sort();
      const cells = keys.map((k) => {
        const sub = gs.filter((g) => key(g) === k);
        const s = mean(sub, a);
        const vpa = sub.reduce((x, g) => x + g.vp[scoreOf(g, a).ia], 0) / sub.length;
        const vpb = sub.reduce((x, g) => x + g.vp[scoreOf(g, a).ib], 0) / sub.length;
        const was = before ? mean(old.filter((g) => key(g) === k), a) : NaN;
        return `${k} ${pct(s)}%${before ? delta(s, was) : ""} (${vpa.toFixed(1)}-${vpb.toFixed(1)})`;
      });
      console.log(`  ${label}: ${cells.join(" | ")}`);
    };
    split((g) => g.job.missionId, "missions");
    split((g) => g.job.mapId, "maps");
  }
  if (only.has("seeds")) {
    const by = {};
    for (const g of gs) ((by[g.job.seed] ??= []).push(g));
    console.log(`  seeds: ${Object.entries(by).map(([k, sub]) => `${k} ${pct(mean(sub, a))}% (n=${sub.length})`).join("  ")}`);
  }
  if (only.has("units")) {
    const units = {};
    for (const g of gs)
      for (const [p, v] of Object.entries(g.profiles ?? {})) {
        const o = (units[p] ??= { dep: 0, dmg: 0, dest: 0, imp: 0, held: 0 });
        o.dep += v.deployed || 0;
        o.dmg += v.damage || 0;
        o.dest += v.destroyed || 0;
        o.imp += v.impact || 0;
        o.held += v.held || 0;
      }
    console.log("  unit              dep/game  dmg/dep  impact/dep  lost%  held/dep");
    for (const [p, o] of Object.entries(units).sort())
      if (o.dep)
        console.log(
          `  ${p.padEnd(17)} ${(o.dep / n).toFixed(2).padStart(8)} ${(o.dmg / o.dep).toFixed(2).padStart(8)} ${(o.imp / o.dep).toFixed(2).padStart(11)} ${((100 * o.dest) / o.dep).toFixed(0).padStart(6)} ${(o.held / o.dep).toFixed(2).padStart(9)}`,
        );
  }
}

if (only.has("abilities") && !pairFilter) {
  // Per faction, per game it played: everything counted per side (abilities, supports, charges, damage).
  const played = {};
  const tot = {};
  for (const g of games)
    g.job.factions.forEach((f, i) => {
      played[f] = (played[f] ?? 0) + 1;
      for (const [k, v] of Object.entries(g.sides?.[i] ?? {})) ((tot[f] ??= {})[k] = (tot[f]?.[k] ?? 0) + v);
    });
  for (const f of factions) {
    const t = tot[f] ?? {};
    const per = (k) => (t[k] / played[f]).toFixed(2);
    const abil = Object.keys(t).filter((k) => /^(ab|sp|ev):/.test(k)).sort();
    const other = Object.keys(t).filter((k) => !/^(ab|sp|ev):/.test(k)).sort();
    console.log(`\n-- ${f} (${played[f]} games), per game`);
    if (abil.length) for (const k of abil) console.log(`   ${k.padEnd(26)} ${per(k)}`);
    else console.log("   (no per-side ability counts in this file: it predates them)");
    console.log(`   ${other.map((k) => `${k} ${per(k)}`).join(", ")}`);
  }
}
