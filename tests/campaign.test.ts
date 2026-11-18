// The campaign: its data (every battle fits its map, every speaker and perk exists), the rules that
// move the war along (acts, branching, skipped battles, the finale), perks reaching createGame, and
// saves surviving a round trip, corruption and old versions.

import { describe, expect, it } from "vitest";
import {
  availableBattles,
  battleById,
  battleSetup,
  battlesLeftInAct,
  budgetFor,
  computeRival,
  fillStory,
  fitList,
  heldPerks,
  launchGameSetup,
  newCampaign,
  parseCampaign,
  perkTotals,
  recordResult,
  rosterProblems,
  serializeCampaign,
  starterRoster,
  type CampaignState,
  type Outcome,
} from "../src/engine/campaign";
import {
  ACT_BUDGET,
  ACTS,
  BATTERED_PENALTY,
  CAMPAIGNS,
  FINALE,
  PERK_CAPS,
  PLACE_PERKS,
  type StoryLine,
  type StoryPanel,
} from "../src/engine/data/campaign";
import {
  defaultListFor,
  entryCost,
  listCost,
  PROFILES,
  SUPPORTS,
} from "../src/engine/data/factions";
import {
  CHARACTERS,
  LORE_FACTION_IDS,
  PLACES,
  characterById,
  placeById,
  type LoreFactionId,
} from "../src/engine/data/lore";
import { MAPS } from "../src/engine/data/maps";
import {
  MISSIONS,
  missionMapProblem,
  swapMapSides,
  swapMissionSides,
} from "../src/engine/data/missions";
import { CP_CAP } from "../src/engine/constants";
import { createGame } from "../src/engine/game";
import {
  CAMPAIGN_KEY,
  clearCampaign,
  hasUnreadableSave,
  legacySaveSide,
  loadCampaign,
  saveCampaign,
} from "../src/ui/campaign/store";

/** Who a story line's speaker belongs to: a character's faction, or a unit's. */
const speakerFaction = (who: string): string | null | undefined => {
  const c = characterById(who);
  if (c) return c.faction;
  return PROFILES[who]?.faction;
};

/** Play through a campaign: `pick` chooses the outcome for each battle (the first on offer is fought). */
function playThrough(
  faction: LoreFactionId,
  pick: (s: CampaignState, i: number) => Outcome,
  seed = 7,
): CampaignState {
  let s = newCampaign(faction, seed);
  for (let i = 0; i < 40 && !s.ending; i++) {
    const b = availableBattles(s)[0];
    expect(b, `${faction}: a battle is always on offer`).toBeDefined();
    s = recordResult(s, b!.id, pick(s, i), [3, 1]).state;
  }
  return s;
}

describe("campaign: data", () => {
  it("has a campaign for each built-in faction, with enough battles in every act", () => {
    for (const f of LORE_FACTION_IDS) {
      const c = CAMPAIGNS[f];
      expect(c.faction).toBe(f);
      expect(new Set(c.battles.map((b) => b.id)).size).toBe(c.battles.length);
      for (const act of [1, 2, 3] as const) {
        const n = c.battles.filter((b) => b.act === act).length;
        expect(n, `${f} act ${act}`).toBeGreaterThan(ACTS[act].fights);
        expect(c.openers[act].length).toBeGreaterThan(0);
      }
      expect(c.prologue.length).toBeGreaterThanOrEqual(2);
      expect(c.endings.win.length).toBeGreaterThan(0);
      expect(c.endings.loss.length).toBeGreaterThan(0);
    }
  });

  it("every campaign battle's mission fits its map, from the side you play", () => {
    const all = LORE_FACTION_IDS.flatMap((f) => [
      ...CAMPAIGNS[f].battles.map((b) => ({ f, b })),
      { f, b: { ...FINALE, side: 0 as const, enemy: f } },
    ]);
    for (const { f, b } of all) {
      const mission = MISSIONS[b.missionId];
      const map = MAPS[b.mapId];
      expect(mission, `${f}/${b.id} mission`).toBeDefined();
      expect(map, `${f}/${b.id} map`).toBeDefined();
      expect(
        missionMapProblem(mission!, map!),
        `${f}/${b.id}: ${b.missionId} on ${b.mapId}`,
      ).toBeNull();
      expect(placeById(b.placeId)?.mapId, `${f}/${b.id} place`).toBe(b.mapId);
      if (b.side === 1) {
        expect(mission!.roles, `${f}/${b.id}: side B needs a role mission`).toBeDefined();
        expect(missionMapProblem(swapMissionSides(mission!), swapMapSides(map!))).toBeNull();
      }
    }
  });

  it("pits each faction against the other two, and names real speakers on the right sides", () => {
    for (const f of LORE_FACTION_IDS) {
      const c = CAMPAIGNS[f];
      const enemies = new Set(c.battles.map((b) => b.enemy));
      expect(enemies.has(f)).toBe(false);
      expect(enemies.size).toBe(2);
      for (const b of c.battles) {
        expect(b.hook.length, `${f}/${b.id} hook`).toBeGreaterThan(20);
        const [ours, theirs] = b.brief;
        expect(speakerFaction(ours.who), `${f}/${b.id} ally ${ours.who}`).toBe(f);
        expect(speakerFaction(theirs.who), `${f}/${b.id} enemy ${theirs.who}`).toBe(b.enemy);
        for (const l of [b.win, b.loss])
          expect([f, b.enemy], `${f}/${b.id} ${l.who}`).toContain(speakerFaction(l.who));
      }
      const lines: (StoryLine | StoryPanel)[] = [
        ...c.prologue,
        ...Object.values(c.openers).flat(),
        ...c.endings.win,
        ...c.endings.loss,
        c.finale.brief,
        c.finale.win,
        c.finale.loss,
      ];
      for (const l of lines) {
        if (l.who) expect(speakerFaction(l.who), `${f}: speaker ${l.who}`).not.toBeUndefined();
        if ("placeId" in l && l.placeId)
          expect(placeById(l.placeId), `${f}: place ${l.placeId}`).toBeDefined();
      }
    }
  });

  it("gives perks only for battlefields, naming real units and supports of each faction", () => {
    for (const [placeId, perk] of Object.entries(PLACE_PERKS)) {
      expect(placeById(placeId)?.mapId, placeId).toBeDefined();
      expect(placeId).not.toBe(FINALE.placeId);
      if (perk.kind === "unit" || perk.kind === "support") {
        for (const f of LORE_FACTION_IDS) {
          const id = perk.byFaction?.[f];
          const thing = perk.kind === "unit" ? PROFILES[id!] : SUPPORTS[id!];
          expect(thing, `${placeId} ${f}`).toBeDefined();
          expect(thing!.faction).toBe(f);
          if (perk.kind === "unit") expect(PROFILES[id!]!.structure?.summonOnly).toBeFalsy();
        }
      } else expect(perk.amount).toBeGreaterThan(0);
    }
    // Every place a campaign battle is fought over (bar the finale) gives something.
    for (const f of LORE_FACTION_IDS)
      for (const b of CAMPAIGNS[f].battles) expect(PLACE_PERKS[b.placeId], b.placeId).toBeDefined();
  });

  it("characters all appear somewhere in the campaign", () => {
    const text = JSON.stringify(CAMPAIGNS);
    for (const c of CHARACTERS) expect(text, c.id).toContain(`"${c.id}"`);
  });
});

describe("campaign: armies", () => {
  it("fitList keeps the most it can within budget, and the army's centrepiece", () => {
    for (const f of LORE_FACTION_IDS)
      for (const mode of ["skirmish", "assault"] as const)
        for (const act of [1, 2, 3] as const) {
          const full = defaultListFor(f, mode);
          const fit = fitList(full, ACT_BUDGET[act][mode]);
          expect(listCost(fit)).toBeLessThanOrEqual(ACT_BUDGET[act][mode]);
          expect(fit.length).toBeGreaterThan(0);
          const top = Math.max(...full.map(entryCost));
          expect(
            Math.max(...fit.map(entryCost)),
            `${f} ${mode} act ${act} keeps its priciest unit`,
          ).toBe(top);
        }
    // Skitterswarm Act I keeps the Broodmother and drops cheaper broods instead.
    const swarm = fitList(defaultListFor("swarm", "skirmish"), 24);
    expect(swarm.some((e) => e.profileId === "swarm-mother")).toBe(true);
    expect(listCost(swarm)).toBe(24);
    expect(fitList([], 10)).toEqual([]);
  });

  it("starts each army within its Act I budget, and grows the budget act by act", () => {
    for (const f of LORE_FACTION_IDS) {
      const s = newCampaign(f, 1);
      for (const mode of ["skirmish", "assault"] as const) {
        expect(rosterProblems(s, mode, s.army[mode]), `${f} ${mode}`).toEqual([]);
        expect(budgetFor(s, mode)).toBe(ACT_BUDGET[1][mode] + perkTotals(s).budget);
      }
      expect(ACT_BUDGET[1].skirmish).toBeLessThan(ACT_BUDGET[2].skirmish);
      expect(ACT_BUDGET[3].skirmish).toBe(30);
    }
  });

  it("flags rosters that break the rules", () => {
    const s = newCampaign("militia", 1);
    expect(rosterProblems(s, "skirmish", { entries: [], supports: [] })).toContain(
      "Add at least one unit",
    );
    const big = {
      entries: Array.from({ length: 6 }, () => ({ profileId: "mil-bertha", upgrades: [] })),
      supports: [],
    };
    const p = rosterProblems(s, "skirmish", big);
    expect(p.some((x) => x.startsWith("Over the campaign budget"))).toBe(true);
    expect(p.some((x) => x.startsWith("At most"))).toBe(true);
    expect(
      rosterProblems(s, "skirmish", {
        entries: [{ profileId: "swarm-mother", upgrades: [] }],
        supports: [],
      })[0],
    ).toMatch(/isn't one of your units/);
  });
});

describe("campaign: progression", () => {
  it("offers the act's battles, and moves to the next act after enough fights", () => {
    let s = newCampaign("militia", 3);
    expect(availableBattles(s).map((b) => b.id)).toEqual([
      "up-through-the-corn",
      "keep-off-the-grass",
      "signal-lost",
    ]);
    expect(battlesLeftInAct(s)).toBe(2);
    s = recordResult(s, "keep-off-the-grass", "win", [9, 2]).state;
    expect(s.holders["prismwick-lawn"]).toBe("militia");
    expect(s.act).toBe(1);
    expect(availableBattles(s).map((b) => b.id)).not.toContain("keep-off-the-grass");
    const r = recordResult(s, "signal-lost", "loss", [1, 6]);
    s = r.state;
    expect(r.actEnded).toBe(1);
    expect(s.act).toBe(2);
    expect(s.holders["rattlevane-junction"]).toBe("swarm");
    // Skipped: the Skitterswarm takes Dustbowl Crossing while you were away.
    expect(s.holders["dustbowl-crossing"]).toBe("swarm");
    expect(r.news.some((n) => n.tone === "lost" && n.text.includes("Dustbowl Crossing"))).toBe(
      true,
    );
    expect(s.battered).toBe(true);
    expect(availableBattles(s).every((b) => b.act === 2)).toBe(true);
  });

  it("a battle that isn't on offer can't be recorded or launched", () => {
    const s = newCampaign("swarm", 3);
    expect(() => recordResult(s, "spare-parts", "win", [1, 0])).toThrow();
    expect(() => battleSetup(s, "nope")).toThrow();
  });

  it("does not hand a place you fought for this act to an enemy you skipped", () => {
    let s = newCampaign("concord", 5);
    s = recordResult(s, "keep-off-the-grass", "win", [5, 1]).state;
    s = recordResult(s, "a-better-view", "win", [5, 1]).state;
    expect(s.act).toBe(2);
    // Lawn Pests (also at the lawn) was skipped, but you held the lawn yourself this act.
    expect(s.holders["prismwick-lawn"]).toBe("concord");
    expect(s.holders["mesa-ridge"]).toBe("concord");
  });

  it("settles the other sides' battles off-screen, deterministically", () => {
    const end = (seed: number) => {
      let s = newCampaign("militia", seed);
      s = recordResult(s, "up-through-the-corn", "win", [3, 1]).state;
      s = recordResult(s, "keep-off-the-grass", "win", [3, 1]).state;
      s = recordResult(s, "highway-robbery", "win", [3, 1]).state;
      return recordResult(s, "finders-keepers", "win", [3, 1]);
    };
    const a = end(11);
    const b = end(11);
    expect(a.state.holders).toEqual(b.state.holders);
    // Act II's Skitterswarm-vs-Concord battles (Last Drops, Off the Rails) went one way or the other.
    expect(["swarm", "concord"]).toContain(a.state.holders["old-refinery"]);
    expect(["swarm", "concord"]).toContain(a.state.holders["gutterbend"]);
    expect(a.news.filter((n) => n.tone === "meanwhile").length).toBe(2);
  });

  it("draws leave the place as it was", () => {
    let s = newCampaign("militia", 2);
    s = recordResult(s, "up-through-the-corn", "draw", [2, 2]).state;
    expect(s.holders["dustbowl-crossing"]).toBe("militia");
    expect(s.battered).toBe(false);
  });

  for (const f of LORE_FACTION_IDS) {
    for (const [label, pick] of [
      ["winning every battle", () => "win"],
      ["losing every battle", () => "loss"],
      ["winning and losing in turn", (_: CampaignState, i: number) => (i % 2 ? "loss" : "win")],
    ] as [string, (s: CampaignState, i: number) => Outcome][]) {
      it(`${f} reaches the finale and an ending, ${label}`, () => {
        let reachedFinale = false;
        const s = playThrough(f, (st, i) => {
          if (st.act === 4) reachedFinale = true;
          return pick(st, i);
        });
        expect(reachedFinale).toBe(true);
        expect(s.ending).not.toBeNull();
        expect(s.rival).not.toBe(f);
        expect(s.results.length).toBe(ACTS[1].fights + ACTS[2].fights + ACTS[3].fights + 1);
        expect(s.holders[FINALE.placeId]).toBe(s.ending === "win" ? f : s.rival);
        expect(availableBattles(s)).toEqual([]);
      });
    }
  }

  it("a drawn finale is fought again", () => {
    let s = newCampaign("swarm", 9);
    while (s.act !== 4) s = recordResult(s, availableBattles(s)[0]!.id, "win", [1, 0]).state;
    s = recordResult(s, FINALE.id, "draw", [3, 3]).state;
    expect(s.ending).toBeNull();
    expect(availableBattles(s).map((b) => b.id)).toEqual([FINALE.id]);
    s = recordResult(s, FINALE.id, "loss", [1, 5]).state;
    expect(s.ending).toBe("loss");
  });

  it("the finale's rival is whoever holds more of the valley", () => {
    const s = newCampaign("militia", 1);
    for (const p of Object.keys(s.holders)) s.holders[p] = null;
    expect(computeRival(s)).toBe("concord"); // a tie: the story's default
    s.holders["old-refinery"] = "swarm";
    expect(computeRival(s)).toBe("swarm");
    s.holders["gutterbend"] = "concord";
    s.holders["gemhaul-road"] = "concord";
    expect(computeRival(s)).toBe("concord");
    const fin = battleById({ ...s, act: 4, rival: "swarm" }, FINALE.id)!;
    expect(fin.enemy).toBe("swarm");
    expect(fin.brief[1].who).toBe("broodmother");
    expect(fin.hook).not.toContain("{");
  });

  it("fills in the rival in finale and ending text", () => {
    expect(fillStory("{rival} took it, to be {fate}. Ask {rivalLeader}.", "swarm")).toBe(
      "the Skitterswarm took it, to be filled with Mother Mandible's eggs. Ask Mother Mandible.",
    );
    expect(fillStory("{rival}", null)).toBe("{rival}");
  });
});

describe("campaign: perks", () => {
  it("adds up what your places give, within the caps", () => {
    const s = newCampaign("militia", 1);
    for (const p of Object.keys(PLACE_PERKS)) s.holders[p] = "militia";
    const t = perkTotals(s);
    expect(t.cp).toBe(PERK_CAPS.cp);
    expect(t.resources).toBe(PERK_CAPS.resources);
    expect(t.budget).toBe(PERK_CAPS.budget);
    expect(t.units).toHaveLength(PERK_CAPS.unit);
    expect(t.supports).toHaveLength(PERK_CAPS.support);
    expect(heldPerks(s).some((h) => !h.active)).toBe(true);
    expect(budgetFor(s, "skirmish")).toBe(ACT_BUDGET[1].skirmish + PERK_CAPS.budget);
    s.battered = true;
    expect(budgetFor(s, "skirmish")).toBe(
      ACT_BUDGET[1].skirmish + PERK_CAPS.budget - BATTERED_PENALTY,
    );
  });

  it("starts with only the perks of the places you hold in the lore", () => {
    const s = newCampaign("concord", 1);
    const held = heldPerks(s)
      .map((h) => h.placeId)
      .sort();
    expect(held).toEqual(
      PLACES.filter((p) => p.heldBy === "concord" && PLACE_PERKS[p.id])
        .map((p) => p.id)
        .sort(),
    );
  });

  it("feeds perks into createGame: resources, CP, a free unit and a free support", () => {
    const s = newCampaign("militia", 42);
    s.holders["old-refinery"] = "militia"; // +1 resource
    s.holders["gutterbend"] = "militia"; // +1 resource
    s.holders["gemhaul-road"] = "militia"; // +1 resource, but resources are capped at +2
    s.holders["mesa-ridge"] = "militia"; // a free Ridgeline Marksman
    s.holders["prismwick-lawn"] = "militia"; // a free Forward Airstrip
    const l = battleSetup(s, "up-through-the-corn");
    expect(l.mode).toBe("skirmish");
    expect(l.factions).toEqual(["militia", "swarm"]);
    expect(l.lists[0].length).toBe(s.army.skirmish.entries.length + 1);
    expect(l.lists[0].at(-1)!.profileId).toBe("mil-squinter");
    expect(l.supports[0]).toContain("mil-airstrip");
    expect(listCost(l.lists[1])).toBeLessThanOrEqual(ACT_BUDGET[1].skirmish);
    const cp = 1 + 1; // the silo deck and the radio relays, held from the start
    expect(l.startBonus[0]).toEqual({ resources: PERK_CAPS.resources, cp });
    const plain = createGame({ ...launchGameSetup(l), startBonus: undefined });
    const game = createGame(launchGameSetup(l));
    expect(game.players[0].resources).toBe(plain.players[0].resources + PERK_CAPS.resources);
    expect(game.players[0].cp).toBe(Math.min(CP_CAP, plain.players[0].cp + cp));
    expect(game.players[1].resources).toBe(plain.players[1].resources);
    expect(game.players[1].cp).toBe(plain.players[1].cp);
    expect(game.units.filter((u) => u.owner === 0)).toHaveLength(l.lists[0].length);
    // Same campaign, same battle: same seed and setup.
    expect(battleSetup(s, "up-through-the-corn").seed).toBe(l.seed);
  });

  it("swaps the mission and map when you play side B", () => {
    let s = newCampaign("militia", 4);
    s = recordResult(s, "up-through-the-corn", "win", [1, 0]).state;
    s = recordResult(s, "signal-lost", "win", [1, 0]).state;
    const l = battleSetup(s, "the-gemhaul-road");
    expect(l.mode).toBe("assault");
    expect(l.mission.id).toBe("convoy~b");
    expect(l.mission.roles![0].id).toBe("raiders");
    expect(l.map.id).toBe("gemhaul~b");
    expect(() => createGame(launchGameSetup(l))).not.toThrow();
  });

  it("ignores junk bonuses and caps CP in the engine", () => {
    const base = { factions: ["militia", "swarm"] as ["militia", "swarm"], seed: 3 };
    const plain = createGame(base);
    const odd = createGame({
      ...base,
      startBonus: [{ resources: -5, cp: Number.NaN }, { resources: 2.7 }],
    });
    expect(odd.players[0].resources).toBe(plain.players[0].resources);
    expect(odd.players[0].cp).toBe(plain.players[0].cp);
    expect(odd.players[1].resources).toBe(plain.players[1].resources + 2);
    expect(createGame({ ...base, startBonus: [{ cp: 99 }, undefined] }).players[0].cp).toBe(CP_CAP);
  });
});

describe("campaign: save and load", () => {
  it("round-trips a campaign in progress", () => {
    let s = newCampaign("concord", 77);
    s = recordResult(s, "lawn-pests", "loss", [2, 5]).state;
    s.army.skirmish = {
      entries: [{ profileId: "con-guard", upgrades: [] }],
      supports: ["con-spire"],
    };
    s.scenes = false;
    const back = parseCampaign(serializeCampaign(s));
    expect(back).toEqual(s);
    expect(parseCampaign(JSON.parse(serializeCampaign(s)))).toEqual(s);
  });

  it("round-trips a finished campaign", () => {
    const s = playThrough("militia", (_, i) => (i % 3 ? "win" : "loss"));
    expect(parseCampaign(serializeCampaign(s))).toEqual(s);
  });

  it("keeps an old save going when the Munch held places in it: they're the Skitterswarm's now", () => {
    const s = recordResult(newCampaign("militia", 6), "up-through-the-corn", "loss", [1, 4]).state;
    const raw = JSON.parse(serializeCampaign(s));
    for (const [place, who] of Object.entries(raw.holders)) if (who === "swarm") raw.holders[place] = "munch";
    raw.holders["old-refinery"] = "munch";
    const back = parseCampaign(raw)!;
    expect(back).not.toBeNull();
    expect(back.holders["dustbowl-crossing"]).toBe("swarm");
    expect(back.holders["old-refinery"]).toBe("swarm");
    expect(Object.values(back.holders)).not.toContain("munch");
    expect(back.results).toEqual(s.results);
    // A finale rival from before the swap becomes the swarm too.
    const fin = JSON.parse(serializeCampaign({ ...s, act: 4, rival: "swarm" }));
    fin.rival = "munch";
    expect(parseCampaign(fin)!.rival).toBe("swarm");
  });

  it("refuses corrupt, foreign and old saves", () => {
    expect(parseCampaign("{not json")).toBeNull();
    expect(parseCampaign("")).toBeNull();
    expect(parseCampaign(null)).toBeNull();
    expect(parseCampaign([])).toBeNull();
    expect(parseCampaign({ format: "scdmg-list", version: 1, faction: "militia" })).toBeNull();
    expect(parseCampaign({ format: "scdmg-campaign", version: 0, faction: "militia" })).toBeNull();
    expect(parseCampaign({ format: "scdmg-campaign", faction: "militia" })).toBeNull();
    expect(parseCampaign({ format: "scdmg-campaign", version: 2, faction: "militia" })).toBeNull();
    expect(parseCampaign({ format: "scdmg-campaign", version: 1, faction: "custom-x" })).toBeNull();
    // A campaign on the Munch's side, from before the Skitterswarm took their place.
    expect(parseCampaign({ format: "scdmg-campaign", version: 1, faction: "munch" })).toBeNull();
  });

  it("repairs what it can in a damaged save", () => {
    const s = newCampaign("swarm", 5);
    const raw = JSON.parse(serializeCampaign(s));
    raw.holders["dustbowl-crossing"] = "aliens";
    raw.holders["nowhere"] = "swarm";
    raw.results = [
      { battleId: "made-up", act: 1, outcome: "win", vp: [1, 1] },
      { battleId: "signal-lost", act: 1, outcome: "win", vp: ["x", 2] },
      5,
    ];
    raw.army = {
      skirmish: {
        entries: [
          { profileId: "mil-grunts", upgrades: [] },
          { profileId: "swarm-mother", upgrades: ["bogus"] },
        ],
        supports: ["con-spire", "swarm-hum", "swarm-hum"],
      },
      assault: "junk",
    };
    raw.chronicle = [
      { act: 9, tone: "win", text: "bad" },
      { act: 1, tone: "story", text: "ok" },
    ];
    raw.rival = "swarm";
    raw.ending = "win";
    raw.act = 7;
    const back = parseCampaign(raw)!;
    expect(back).not.toBeNull();
    expect(back.holders["dustbowl-crossing"]).toBe("militia");
    expect(back.holders["nowhere"]).toBeUndefined();
    expect(back.results).toEqual([{ battleId: "signal-lost", act: 1, outcome: "win", vp: [0, 2] }]);
    expect(back.army.skirmish).toEqual({
      entries: [{ profileId: "swarm-mother", upgrades: [] }],
      supports: ["swarm-hum"],
    });
    expect(back.army.assault).toEqual(starterRoster("swarm", "assault"));
    expect(back.chronicle).toEqual([{ act: 1, tone: "story", text: "ok" }]);
    expect(back.act).toBe(1);
    expect(back.rival).toBeNull();
    expect(back.ending).toBeNull();
  });
});

describe("campaign: the save slot", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      removeItem: (k: string) => void data.delete(k),
    };
  };
  const blocked = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };

  it("saves, loads and clears one campaign", () => {
    const st = memory();
    expect(loadCampaign(st)).toBeNull();
    const s = recordResult(newCampaign("swarm", 8), "signal-lost", "win", [4, 1]).state;
    expect(saveCampaign(s, st)).toBe(true);
    const back = loadCampaign(st)!;
    expect(typeof back.updated).toBe("number");
    expect({ ...back, updated: undefined }).toEqual({ ...s, updated: undefined });
    clearCampaign(st);
    expect(loadCampaign(st)).toBeNull();
  });

  it("treats a corrupt or old save as no save, and says so", () => {
    const st = memory();
    st.setItem(CAMPAIGN_KEY, "{oops");
    expect(loadCampaign(st)).toBeNull();
    expect(hasUnreadableSave(st)).toBe(true);
    st.setItem(
      CAMPAIGN_KEY,
      JSON.stringify({ format: "scdmg-campaign", version: 0, faction: "militia" }),
    );
    expect(loadCampaign(st)).toBeNull();
    expect(hasUnreadableSave(memory())).toBe(false);
    expect(legacySaveSide(st)).toBeNull(); // old, but not a retired side
  });

  it("recognises a campaign saved on the Munch's side, which can't continue", () => {
    const st = memory();
    expect(legacySaveSide(st)).toBeNull();
    const old = JSON.parse(serializeCampaign(newCampaign("militia", 3)));
    old.faction = "munch";
    st.setItem(CAMPAIGN_KEY, JSON.stringify(old));
    expect(parseCampaign(old)).toBeNull();
    expect(loadCampaign(st)).toBeNull();
    expect(hasUnreadableSave(st)).toBe(true);
    expect(legacySaveSide(st)).toBe("munch");
    clearCampaign(st);
    expect(legacySaveSide(st)).toBeNull();
    // A readable save, a corrupt one, or blocked storage is never a legacy side.
    saveCampaign(newCampaign("swarm", 1), st);
    expect(legacySaveSide(st)).toBeNull();
    st.setItem(CAMPAIGN_KEY, "{oops");
    expect(legacySaveSide(st)).toBeNull();
    expect(legacySaveSide(blocked)).toBeNull();
  });

  it("never throws when storage is blocked", () => {
    expect(loadCampaign(blocked)).toBeNull();
    expect(saveCampaign(newCampaign("militia", 1), blocked)).toBe(false);
    expect(saveCampaign(newCampaign("militia", 1), null)).toBe(false);
    expect(hasUnreadableSave(blocked)).toBe(false);
    expect(() => clearCampaign(blocked)).not.toThrow();
  });
});
