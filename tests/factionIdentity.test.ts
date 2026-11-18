// Faction identity (docs/factions.md), checked at the data level, plus the four support effects
// that give each faction its own kind of buff:
//   Dustline Militia: primarily ranged. Gunlines, artillery, overwatch, digging in, air logistics.
//   The Munch: primarily melee and horde. Cheap bodies, impact, regrowth, lurking, tunnels.
//   Lumen Concord: few elite specialists. Shields, precision and tracking, teleporting about.

import { describe, expect, it } from "vitest";
import { saveNeeded, planShooting, strayTarget } from "../src/engine/combat";
import { ABILITIES } from "../src/engine/data/abilities";
import { BUILT_IN_FACTION_IDS, defaultListFor, defaultSupportsFor, factionOf, supportOf } from "../src/engine/data/factions";
import type { ModeId } from "../src/engine/data/modes";
import { applyCommand, createGame, HATCH_MODELS, type GameSetup } from "../src/engine/game";
import { profileFor, profileOf } from "../src/engine/profile";
import { aliveModels, unitById, unitGap } from "../src/engine/rules";
import { cleanupRound } from "../src/engine/scoring";
import { supportTarget } from "../src/engine/supports";
import type { AbilityId, FactionId, GameState, ListEntry, SupportEffect, UnitProfile, Vec, Weapon } from "../src/engine/types";

const MODES: ModeId[] = ["skirmish", "assault"];
const pAtLeast = (n: number) => Math.max(0, Math.min(1, (7 - n) / 6));

/** Expected damage of a weapon per round (before saves), for one whole unit. */
function weaponOutput(p: UnitProfile, w: Weapon): number {
  const dice = p.models * w.dice;
  const pHit = (w.traits ?? []).includes("torrent") ? 1 : pAtLeast(w.hit);
  return (dice * pHit + Math.min(w.precision ?? 0, dice * (1 - pHit))) * w.damage;
}
const best = (p: UnitProfile, melee: boolean) => Math.max(0, ...p.weapons.filter((w) => w.melee === melee).map((w) => weaponOutput(p, w)));
const entries = (f: FactionId, mode: ModeId) => defaultListFor(f, mode).map((e) => profileFor(e.profileId, e.upgrades));

function rangedShare(f: FactionId, mode: ModeId): number {
  let ranged = 0;
  let melee = 0;
  for (const p of entries(f, mode)) {
    ranged += best(p, false);
    melee += best(p, true) + (p.impact ? p.models * p.impact.dice * pAtLeast(p.impact.hit) * p.impact.damage : 0);
  }
  return ranged / (ranged + melee);
}
const models = (f: FactionId, mode: ModeId) => entries(f, mode).reduce((n, p) => n + p.models, 0);
const costPerModel = (f: FactionId, mode: ModeId) => {
  const list = defaultListFor(f, mode);
  const cost = list.reduce((n, e) => {
    const p = profileFor(e.profileId, []);
    return n + p.cost + e.upgrades.reduce((c, id) => c + (p.upgrades.find((u) => u.id === id)?.cost ?? 0), 0);
  }, 0);
  return cost / models(f, mode);
};
const buyable = (f: FactionId) => factionOf(f).profiles.filter((p) => !p.structure?.summonOnly);
const abilitiesOf = (p: UnitProfile): AbilityId[] => [...p.abilities, ...p.upgrades.flatMap((u) => u.addAbilities ?? [])];
const factionsWith = (a: AbilityId) => BUILT_IN_FACTION_IDS.filter((f) => factionOf(f).profiles.some((p) => abilitiesOf(p).includes(a)));
const effects = (f: FactionId): SupportEffect[] => factionOf(f).supports.flatMap((sp) => sp.abilities.map((a) => a.effect));

describe("faction pillars in the data", () => {
  it("Militia starter lists are mostly ranged, Munch mostly melee, Concord in between", () => {
    for (const mode of MODES) {
      expect(rangedShare("militia", mode), `militia ${mode}`).toBeGreaterThan(0.6);
      expect(rangedShare("munch", mode), `munch ${mode}`).toBeLessThan(0.4);
      expect(rangedShare("concord", mode), `concord ${mode}`).toBeLessThan(rangedShare("militia", mode));
      expect(rangedShare("concord", mode), `concord ${mode}`).toBeGreaterThan(rangedShare("munch", mode));
    }
  });

  it("the Munch field the most models and Concord the fewest, at the highest price per model", () => {
    for (const mode of MODES) {
      expect(models("munch", mode)).toBeGreaterThan(models("militia", mode));
      expect(models("militia", mode)).toBeGreaterThan(models("concord", mode));
      expect(costPerModel("concord", mode)).toBeGreaterThan(costPerModel("militia", mode));
      expect(costPerModel("militia", mode)).toBeGreaterThan(costPerModel("munch", mode));
    }
    // Across everything you can buy, Concord units cost the most on average.
    const avgCost = (f: FactionId) => buyable(f).reduce((n, p) => n + p.cost, 0) / buyable(f).length;
    expect(avgCost("concord")).toBeGreaterThan(avgCost("militia"));
    expect(avgCost("concord")).toBeGreaterThan(avgCost("munch"));
  });

  it("stat bands: Concord hits best and alone has shields; Munch has the shakiest nerve and the most impact", () => {
    const avgHit = (f: FactionId) => {
      const ws = buyable(f).flatMap((p) => p.weapons);
      return ws.reduce((n, w) => n + w.hit, 0) / ws.length;
    };
    expect(avgHit("concord")).toBeLessThan(avgHit("militia"));
    expect(avgHit("concord")).toBeLessThan(avgHit("munch"));
    for (const f of ["militia", "munch"]) expect(factionOf(f).profiles.every((p) => p.shield === 0), f).toBe(true);
    expect(buyable("concord").filter((p) => !p.structure).every((p) => p.shield > 0)).toBe(true);
    const nerve = (f: FactionId) => {
      const ps = buyable(f).filter((p) => !p.structure && !p.keywords.includes("fearless"));
      return ps.reduce((n, p) => n + (p.nerve ?? 7), 0) / ps.length;
    };
    expect(nerve("munch")).toBeLessThan(nerve("militia"));
    expect(nerve("militia")).toBeLessThan(nerve("concord"));
    const impact = (f: FactionId) => buyable(f).filter((p) => p.impact).length;
    expect(impact("munch")).toBeGreaterThan(impact("militia") + impact("concord"));
  });

  it("each signature ability belongs to one faction only", () => {
    const own: Record<string, AbilityId[]> = {
      militia: ["overwatch", "entrenched", "steady-aim", "spotter", "barrage", "demo-charge", "patch-up", "steadying", "rocket-hop", "return-fire", "crop-dust", "bale-out", "radio-spotting", "scrap-cover"],
      munch: ["regen", "regrow", "hatch", "lurk", "sticky-goo", "rampage", "sugar-rush", "brood-call", "mending-aura", "tunnel", "burrow-exit", "pop", "grapple", "bombs-away", "eye-peck"],
      concord: ["blink", "recall", "radiance", "refraction", "bubble-shield", "provoke", "ward-aura", "overcharge", "spotlight", "riposte", "pirouette", "phase-out", "twirl-away"],
    };
    for (const [f, ids] of Object.entries(own)) for (const a of ids) expect(factionsWith(a), `${a}`).toEqual([f]);
    // Every ability in the library has a home.
    expect(Object.values(own).flat().sort()).toEqual(Object.keys(ABILITIES).sort());
  });

  it("support buffs follow the faction: no effect is a reskin of another faction's", () => {
    const owner: Partial<Record<SupportEffect["kind"], FactionId>> = {
      resources: "militia",
      rangedBuff: "militia",
      dugIn: "militia",
      ward: "militia",
      heal: "militia",
      spot: "militia",
      smoke: "militia",
      overwatch: "militia",
      meleeBuff: "munch",
      regrow: "munch",
      rattle: "munch",
      slow: "munch",
      retaliate: "munch",
      haste: "munch",
      blind: "munch",
      recharge: "concord",
      aimBuff: "concord",
      teleport: "concord",
      brace: "concord",
      blast: "concord",
      resonate: "concord",
      expose: "concord",
      silence: "concord",
      overshield: "concord",
    };
    for (const f of BUILT_IN_FACTION_IDS)
      for (const e of effects(f)) if (e.kind !== "summon" && e.kind !== "airdrop") expect(owner[e.kind], `${f}: ${e.kind}`).toBe(f);
    // Shared kinds play differently: each faction summons its own kind of structure...
    const summoned = (f: FactionId) =>
      effects(f).flatMap((e) => (e.kind === "summon" ? [profileFor(e.profileId, []).abilities.slice().sort().join(",")] : []));
    const all = BUILT_IN_FACTION_IDS.flatMap(summoned);
    expect(new Set(all).size).toBe(all.length);
    // ...and only the Militia and Concord drop reserves in: anywhere, or beside your own, overcharged.
    expect(effects("munch").some((e) => e.kind === "airdrop")).toBe(false);
    for (const e of effects("concord")) if (e.kind === "airdrop") expect(e.arrivalShield).toBeGreaterThan(0);
    expect(effects("militia").some((e) => e.kind === "airdrop" && e.anywhere)).toBe(true);
  });

  it("each faction starts Skirmish with its own arrival card, and the Munch also buy a permanent tunnel", () => {
    const arrival = { militia: "mil-dropship", munch: "munch-tunnels", concord: "con-portal" } as const;
    for (const [f, card] of Object.entries(arrival)) expect(defaultSupportsFor(f, "skirmish")).toContain(card);
    const hole = supportOf("munch-tunnels").abilities[0]!.effect;
    expect(hole.kind).toBe("summon");
    if (hole.kind !== "summon") return;
    // Temporary: the Gopher Hole. Permanent: the Sett Lab, bought in the list.
    expect(profileFor(hole.profileId, []).structure?.lifetime).toBe("round");
    const warren = profileFor("munch-warren", []);
    expect(warren.structure?.lifetime).toBe("permanent");
    expect(warren.structure?.summonOnly).toBeFalsy();
    for (const p of [profileFor(hole.profileId, []), warren]) expect(p.abilities).toContain("burrow-exit");
  });
});

// ---------- the four new support effects and Hatchlings ----------

const L = (...ids: string[]): ListEntry[] => ids.map((profileId) => ({ profileId, upgrades: [] }));

function game(lists: [ListEntry[], ListEntry[]], extra: Partial<GameSetup> = {}): GameState {
  const s = createGame({ factions: ["militia", "munch"], seed: 7, lists, supports: [[], []], ...extra });
  Object.assign(s, { initiative: 0, activePlayer: 0, orderChoice: null });
  // An open table: these tests are about the effects, not about finding a way round the scenery.
  Object.assign(s, { terrain: [], access: [] });
  s.players[0].cp = 8;
  s.players[1].cp = 8;
  return s;
}

function place(s: GameState, uid: string, at: Vec) {
  const u = unitById(s, uid)!;
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.1), y: at.y + Math.floor(i / 3) * (2 * r + 0.1) };
    m.elevation = profileOf(u).keywords.includes("flying") ? 2 : 0;
  });
  return u;
}

const ok = (r: ReturnType<typeof applyCommand>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe("faction buffs", () => {
  it("Militia Sandbag Social: a dug-in unit saves better against shooting only", () => {
    let s = game([L("mil-grunts"), L("munch-spitter")], { supports: [["mil-wagon"], []] });
    const grunts = place(s, "p0-0", { x: 10, y: 26 });
    const spit = place(s, "p1-0", { x: 10, y: 14 });
    const before = saveNeeded(s, spit, grunts, grunts.models[0]!, 0, false);
    s = ok(applyCommand(s, { type: "support", player: 0, support: "mil-wagon", ability: "sandbag-social", target: grunts.uid }));
    const g = unitById(s, grunts.uid)!;
    const sp = unitById(s, spit.uid)!;
    expect(saveNeeded(s, sp, g, g.models[0]!, 0, false)).toBe(before! - 1);
    expect(saveNeeded(s, sp, g, g.models[0]!, 0, true)).toBe(profileOf(g).armor); // melee: no help
    cleanupRound(s, []);
    expect(unitById(s, grunts.uid)!.status.dugIn ?? 0).toBe(0);
  });

  it("Munch Cough Up and Hatchlings regrow lost bodies", () => {
    let s = game([L("munch-nibblers", "munch-nanny"), L("mil-grunts")], { factions: ["munch", "militia"], supports: [["munch-burrows"], []] });
    const nibs = place(s, "p0-0", { x: 10, y: 26 });
    place(s, "p0-1", { x: 10, y: 29.5 });
    place(s, "p1-0", { x: 28, y: 4 });
    for (const m of nibs.models.slice(2)) m.alive = false; // two left, whatever the pack size
    s = ok(applyCommand(s, { type: "support", player: 0, support: "munch-burrows", ability: "cough-up", target: nibs.uid }));
    expect(aliveModels(unitById(s, nibs.uid)!).length).toBe(4);
    Object.assign(s, { phase: "movement" });
    s = ok(applyCommand(s, { type: "ability", uid: "p0-1", ability: "hatch", target: nibs.uid }));
    expect(aliveModels(unitById(s, nibs.uid)!).length).toBe(4 + HATCH_MODELS);
    expect(aliveModels(unitById(s, nibs.uid)!).every((m) => m.hp === 1)).toBe(true);
  });

  it("Munch Trapdoor Pit lurks for the round and bites whoever walks up to it", () => {
    let s = game([L("munch-nibblers"), L("mil-grunts")], { factions: ["munch", "militia"], supports: [["munch-burrows"], []] });
    place(s, "p0-0", { x: 4, y: 26 });
    place(s, "p1-0", { x: 10, y: 8 });
    s = ok(applyCommand(s, { type: "support", player: 0, support: "munch-burrows", ability: "gobble-pit", target: undefined, point: { x: 10, y: 16 } }));
    const pit = s.units.find((u) => u.profileId === "munch-pit")!;
    expect(pit.onBoard).toBe(true);
    s.activePlayer = 1;
    const r = applyCommand(s, { type: "move", uid: "p1-0", leader: 0, to: { x: 10, y: 12.5 } });
    if (!r.ok) throw new Error(r.error);
    expect(r.events.some((e) => e.type === "ability" && e.ability === "lurk" && e.uid === pit.uid)).toBe(true);
  });

  it("Concord Point Out Flaws adds precision, so a unit can pick a target out of a melee without hitting friends", () => {
    let s = game([L("con-dancers", "con-guard"), L("munch-nibblers")], { factions: ["concord", "munch"], supports: [["con-court"], []] });
    const dancers = place(s, "p0-0", { x: 10, y: 24 });
    const guard = place(s, "p0-1", { x: 10, y: 15.2 });
    const nibs = place(s, "p1-0", { x: 10, y: 13.9 });
    Object.assign(s, { phase: "assault" });
    expect(unitGap(guard, nibs)).toBeLessThan(1);
    const darts = profileOf(dancers).weapons[0]!;
    expect(strayTarget(s, dancers, nibs, darts)?.uid).toBe(guard.uid); // misses would hit the guard
    s = ok(applyCommand(s, { type: "support", player: 0, support: "con-court", ability: "point-out-flaws", target: dancers.uid }));
    const d = unitById(s, dancers.uid)!;
    expect(d.status.precisionBonus).toBe(1);
    expect(d.status.trackingBonus).toBe(1);
    expect(typeof planShooting(s, d, unitById(s, nibs.uid)!, darts)).not.toBe("string");
    expect(strayTarget(s, d, unitById(s, nibs.uid)!, darts)).toBeNull();
  });

  it("Concord Gate Step teleports a unit on the table, which can still act", () => {
    let s = game([L("con-guard"), L("munch-nibblers")], { factions: ["concord", "munch"], supports: [["con-gate"], []] });
    const guard = place(s, "p0-0", { x: 10, y: 28 });
    place(s, "p1-0", { x: 28, y: 4 });
    Object.assign(s, { phase: "movement" });
    expect(supportTarget(supportOf("con-gate").abilities[0]!)).toBe("unitPoint");
    const far = applyCommand(s, { type: "support", player: 0, support: "con-gate", ability: "gate-step", target: guard.uid, point: { x: 10, y: 12 } });
    expect(far.ok).toBe(false);
    const r = applyCommand(s, { type: "support", player: 0, support: "con-gate", ability: "gate-step", target: guard.uid, point: { x: 10, y: 21 } });
    s = ok(r);
    const g = unitById(s, guard.uid)!;
    expect(aliveModels(g)[0]!.pos.y).toBeLessThan(23);
    expect(g.status.acted).toBe(false);
    expect(r.ok && r.events.some((e) => e.type === "moved" && e.kind === "teleport")).toBe(true);
    // Only units already on the table: reserves come in through the Grand Portal.
    const reserve = game([L("con-guard", "con-lancer"), L("munch-nibblers")], { factions: ["concord", "munch"], supports: [["con-gate"], []] });
    place(reserve, "p0-0", { x: 10, y: 28 });
    Object.assign(reserve, { phase: "movement" });
    expect(applyCommand(reserve, { type: "support", player: 0, support: "con-gate", ability: "gate-step", target: "p0-1", point: { x: 10, y: 22 } }).ok).toBe(false);
  });
});
