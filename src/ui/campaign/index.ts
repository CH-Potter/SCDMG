// The campaign screen (loaded on first use from main.ts): pick a side, then fight the Dustline War on a
// map of the valley. Shows who holds what, the battles on offer, what your places give you, your army
// and the story so far; plays the story scenes; launches battles and takes their results back.
// The rules live in src/engine/campaign.ts; this file only presents them.

import "./campaign.css";
import {
  availableBattles,
  battleById,
  budgetAct,
  battleSetup,
  battlesLeftInAct,
  budgetFor,
  campaignOf,
  campaignSummary,
  factionName,
  fillStory,
  fitList,
  heldPerks,
  modeOfMission,
  newCampaign,
  parseCampaign,
  perkText,
  perkTotals,
  placeName,
  recordResult,
  rosterProblems,
  stageName,
  stageShort,
  starterRoster,
  type ChronicleEntry,
  type CampaignState,
  type Outcome,
} from "../../engine/campaign";
import {
  ACT_BUDGET,
  ACTS,
  BATTERED_PENALTY,
  CAMPAIGNS,
  FINALE,
  PERK_CAPS,
  PLACE_PERKS,
  type CampaignBattleDef,
} from "../../engine/data/campaign";
import {
  baseProfile,
  listCost,
  PROFILES,
  SUPPORTS,
  supportsCost,
} from "../../engine/data/factions";
import {
  LORE_FACTIONS,
  LORE_FACTION_IDS,
  PLACES,
  WORLD,
  characterById,
  leaderOf,
  placeById,
  type LoreFactionId,
} from "../../engine/data/lore";
import { MAPS } from "../../engine/data/maps";
import { MISSIONS } from "../../engine/data/missions";
import { MODES, type ModeId } from "../../engine/data/modes";
import type { ListEntry } from "../../engine/types";
import { audio } from "../../audio";
import { factionEmblemSvg } from "../art/emblems";
import type { BattleResult } from "../controller";
import { esc } from "../describe";
import { downloadJson, pickJsonFile } from "../files";
import { openListBuilder } from "../listbuilder";
import type { MenuChoice } from "../menu";
import { playStory, type ScenePanel } from "./scenes";
import { clearCampaign, hasUnreadableSave, loadCampaign, saveCampaign } from "./store";
import { PIN_LABEL, PLACE_POS, valleyMapSvg } from "./valley";

/** A battle result coming back from the game screen. */
export interface CampaignReturn extends BattleResult {
  battleId: string;
}

export interface CampaignLaunchChoice {
  battleId: string;
  /** For the game screen, e.g. "Act I: Up Through the Corn". */
  title: string;
  choice: MenuChoice;
}

export interface CampaignOptions {
  /** The battle just fought, if we're coming back from one. */
  result?: CampaignReturn;
  onExit: () => void;
  onBattle: (launch: CampaignLaunchChoice) => void;
}

const SKY: Record<number, ScenePanel["sky"]> = { 1: "day", 2: "dusk", 3: "night", 4: "dawn" };
const OUTCOME_WORD: Record<Outcome, string> = {
  win: "VICTORY!",
  loss: "DEFEAT!",
  draw: "STALEMATE!",
};
const OUTCOME_COLOR: Record<Outcome, string> = { win: "#9be08f", loss: "#f0565b", draw: "#ffc23a" };

/** "A free Squinter..." in the middle of a sentence. */
const lcFirst = (t: string): string => (t.startsWith("A ") ? `a${t.slice(1)}` : t);

const outcomeOf = (w: BattleResult["winner"]): Outcome =>
  w === "draw" || w === null ? "draw" : w === 0 ? "win" : "loss";

/** "3× Rivet Grunts, Patch Medic, ..." */
function armyLine(entries: ListEntry[]): string {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.profileId, (counts.get(e.profileId) ?? 0) + 1);
  return [...counts].map(([id, n]) => `${n > 1 ? `${n}× ` : ""}${baseProfile(id).name}`).join(", ");
}

// ---------------------------------------------------------------- story scenes

function prologuePanels(s: CampaignState): ScenePanel[] {
  const c = campaignOf(s);
  return [
    ...c.prologue.map((p, i) => ({
      ...p,
      sky: "dawn" as const,
      ...(i === 0 ? { title: "THE DUSTLINE WAR", sub: c.title } : {}),
    })),
    ...openerPanels(s, 1),
  ];
}

function openerPanels(s: CampaignState, stage: CampaignState["act"]): ScenePanel[] {
  if (stage === 4) {
    const rival = s.rival!;
    return [
      {
        placeId: FINALE.placeId,
        sky: "dawn",
        title: "THE FORD",
        sub: "The Battle of Fizzwater Ford",
        caption: fillStory(campaignOf(s).finale.hook, rival),
        versus: [s.faction, rival],
      },
    ];
  }
  const roman = ["", "I", "II", "III"][stage]!;
  return campaignOf(s).openers[stage].map((p, i) => ({
    ...p,
    sky: SKY[stage],
    ...(i === 0 ? { title: `ACT ${roman}`, sub: ACTS[stage].short } : {}),
  }));
}

function briefingPanels(s: CampaignState, b: CampaignBattleDef): ScenePanel[] {
  const m = MISSIONS[b.missionId]!;
  const sky = SKY[s.act];
  const role = m.roles?.[b.side];
  return [
    {
      placeId: b.placeId,
      sky,
      title: b.title.toUpperCase(),
      sub: placeName(b.placeId),
      caption: b.hook,
      versus: [s.faction, b.enemy],
    },
    {
      placeId: b.placeId,
      sky,
      who: b.brief[0].who,
      text: b.brief[0].text,
      caption: `Mission: ${m.name}${role ? `, as the ${role.name}` : ""}. ${m.blurb}`,
    },
    {
      placeId: b.placeId,
      sky,
      who: b.brief[1].who,
      text: b.brief[1].text,
      caption: `${factionName(b.enemy)}: ${LORE_FACTIONS[b.enemy].epithet.toLowerCase()}.`,
    },
  ];
}

function aftermathPanels(
  s: CampaignState,
  b: CampaignBattleDef,
  outcome: Outcome,
  news: ChronicleEntry[],
): ScenePanel[] {
  const line =
    outcome === "win"
      ? b.win
      : outcome === "loss"
        ? b.loss
        : { who: b.brief[0].who, text: "Nobody's giving ground today. We'll be back." };
  const panels: ScenePanel[] = [
    {
      placeId: b.placeId,
      sky: b.id === FINALE.id ? "dawn" : SKY[b.act],
      who: line.who,
      text: line.text,
      caption: news[0]?.text ?? "",
      burst: { word: OUTCOME_WORD[outcome], color: OUTCOME_COLOR[outcome] },
    },
  ];
  const elsewhere = news.filter((n) => n.tone === "lost" || n.tone === "meanwhile");
  if (elsewhere.length)
    panels.push({
      placeId: LORE_FACTIONS[s.faction].homeId,
      sky: "dusk",
      caption: elsewhere.map((n) => n.text).join(" "),
      title: "MEANWHILE...",
    });
  return panels;
}

function endingPanels(s: CampaignState): ScenePanel[] {
  const e = s.ending ?? "loss";
  return campaignOf(s).endings[e].map((p) => ({ ...p, sky: e === "win" ? "dawn" : "dusk" }));
}

// ---------------------------------------------------------------- the screen

export function openCampaign(host: HTMLElement, opts: CampaignOptions): void {
  let state: CampaignState | null = loadCampaign();
  const unreadable = !state && hasUnreadableSave();
  let selected: string | null = null;
  let placeInfo: string | null = null;
  let message = "";
  let lastNews: { title: string; outcome: Outcome; news: ChronicleEntry[] } | null = null;
  let launching = false;
  const queue: { title: string; panels: ScenePanel[] }[] = [];

  const persist = () => {
    if (state && !saveCampaign(state))
      message =
        "Couldn't save: browser storage is unavailable or full. Export a save to keep your progress.";
  };

  // Coming back from a battle: record it (once) and queue its story.
  if (opts.result && state) {
    const r = opts.result;
    const battle = availableBattles(state).find((b) => b.id === r.battleId);
    if (battle) {
      const outcome = outcomeOf(r.winner);
      const before = state.act;
      const rep = recordResult(state, r.battleId, outcome, r.vp, { retreated: r.retreated });
      state = rep.state;
      persist();
      lastNews = { title: battle.title, outcome, news: rep.news };
      queue.push({
        title: battle.title,
        panels: aftermathPanels(state, battle, outcome, rep.news),
      });
      if (state.ending) queue.push({ title: "The end of the war", panels: endingPanels(state) });
      else if (state.act !== before)
        queue.push({ title: stageName(state.act), panels: openerPanels(state, state.act) });
    }
  }

  const playQueue = async (): Promise<void> => {
    while (queue.length) {
      const next = queue.shift()!;
      if (state?.scenes !== false)
        await playStory(next.title, next.panels, state?.faction ?? "militia", state?.rival ?? null);
    }
  };

  /** Keep keyboard focus on the same control after a re-render. */
  const focusKey = (): string | null => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !host.contains(el)) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;
    const d = [...el.attributes].find((a) => a.name.startsWith("data-") && a.value);
    return d ? `[${d.name}="${CSS.escape(d.value)}"]` : null;
  };

  const render = () => {
    const key = focusKey();
    const scroller = host.querySelector<HTMLElement>(".modal");
    const top = scroller?.scrollTop ?? 0;
    const mapLeft = host.querySelector<HTMLElement>(".cmp-map-scroll")?.scrollLeft;
    if (!state) host.innerHTML = pickScreen();
    else if (state.ending) host.innerHTML = endingScreen(state);
    else host.innerHTML = mainScreen(state);
    host.classList.add("show");
    const next = host.querySelector<HTMLElement>(".modal");
    if (next) next.scrollTop = top;
    const map = host.querySelector<HTMLElement>(".cmp-map-scroll");
    if (map && map.scrollWidth > map.clientWidth) {
      if (mapLeft !== undefined) map.scrollLeft = mapLeft;
      else {
        // First look at a scrolled map: centre it on a battle on offer (or the middle of the valley).
        const pin = map.querySelector<HTMLElement>(".cmp-pin.is-selected, .cmp-pin.is-open");
        const x = pin ? pin.offsetLeft : map.scrollWidth / 2;
        map.scrollLeft = Math.max(0, x - map.clientWidth / 2);
      }
    }
    bind();
    if (key) host.querySelector<HTMLElement>(key)?.focus({ preventScroll: true });
  };

  // ------------------------------------------------ pick a side

  const pickScreen = (): string => `
    <div class="modal menu campaign">
      <header class="menu-head">
        <div>
          <h1>⚔ The Dustline War</h1>
          <p class="tagline">${esc(WORLD.conflict.text)}</p>
        </div>
        <div class="row">
          <button class="secondary" id="c-import">Import a save…</button>
          <button class="secondary" id="c-exit">Back to menu</button>
          <span id="c-audio"></span>
        </div>
      </header>
      ${unreadable ? `<p class="problem">⚠ There is a campaign save from a different version of the game that this one can't read. Starting a new campaign replaces it.</p>` : ""}
      ${message ? `<p class="cmp-message" role="status">${esc(message)}</p>` : ""}
      <h2 class="step"><span>1</span> Choose your side</h2>
      <div class="cmp-sides">${LORE_FACTION_IDS.map((f) => {
        const L = LORE_FACTIONS[f];
        const c = CAMPAIGNS[f];
        return `<button type="button" class="pick cmp-side" data-faction="${f}" data-start="${f}">
          <span class="cmp-side-head">${factionEmblemSvg(f, 64)}<span><b>${esc(L.name)}</b><small>${esc(c.title)}</small></span></span>
          <span class="cmp-side-blurb">${esc(c.blurb)}</span>
          <span class="cmp-side-line"><b>Led by</b> ${esc(leaderOf(f).name)}</span>
          <span class="cmp-side-line"><b>Wants</b> ${esc(L.goal)}</span>
          <span class="cmp-side-go">Start as ${esc(L.name)} ▸</span>
        </button>`;
      }).join("")}</div>
      <h2 class="step"><span>2</span> How the campaign works</h2>
      <ul class="cmp-how">
        <li><b>Three acts and a finale.</b> Each act offers a few battles across the valley; you fight ${ACTS[1].fights}, ${ACTS[2].fights} and ${ACTS[3].fights} of them. Battles you skip fall to the enemy.</li>
        <li><b>Win and you hold the place; lose and they take it.</b> A loss also leaves your army battered (⚙${BATTERED_PENALTY} less for the next battle), but the war goes on either way.</li>
        <li><b>Places give perks</b> in later battles: extra CP, resources or roster budget, a free unit or a free support card. Each is small, and capped.</li>
        <li><b>Your army</b> carries over: one roster for Skirmish battles and one for Assault, built in the list builder within a budget that grows each act. The AI fields the same budget.</li>
        <li><b>The finale</b> is the Battle of Fizzwater Ford, against whichever rival holds more of the valley. Win it or lose it, the war ends there.</li>
      </ul>
    </div>`;

  // ------------------------------------------------ the war

  const actBar = (s: CampaignState): string => {
    const stages = [1, 2, 3, 4] as const;
    const left = battlesLeftInAct(s);
    const offered = availableBattles(s).length;
    return `
      <div class="cmp-actbar">
        <ol class="cmp-acts" aria-label="Campaign progress">${stages
          .map(
            (st) =>
              `<li class="${st < s.act ? "done" : st === s.act ? "current" : ""}" ${st === s.act ? 'aria-current="step"' : ""}><span>${st === 4 ? "★" : ["", "I", "II", "III"][st]}</span>${esc(st === 4 ? "Finale" : ACTS[st].short)}</li>`,
          )
          .join("")}</ol>
        <p>${
          s.act === 4
            ? `<b>The Battle of Fizzwater Ford.</b> ${esc(factionName(s.rival!))} hold the most of the valley and are waiting at the ford. Win or lose, this decides the war.`
            : `<b>${esc(stageName(s.act))}.</b> Fight ${left} more of the ${offered} battle${offered === 1 ? "" : "s"} on offer. Whatever you skip falls to the enemy when the act ends.`
        }</p>
        <label class="cmp-toggle"><input type="checkbox" id="c-scenes" ${s.scenes ? "checked" : ""}/> Story scenes</label>
      </div>`;
  };

  const mapHtml = (s: CampaignState, open: Set<string>): string => {
    const pins = PLACES.filter((p) => PLACE_POS[p.id])
      .map((p) => {
        const pos = PLACE_POS[p.id]!;
        const h = s.holders[p.id] ?? null;
        const isOpen = open.has(p.id);
        const sel = placeInfo === p.id;
        const mine = h === s.faction;
        const label = `${p.name}: ${h ? `held by ${LORE_FACTIONS[h].name}` : "held by nobody"}${isOpen ? ". A battle is on offer here" : ""}`;
        return `<button type="button" class="cmp-pin ${isOpen ? "is-open" : ""} ${sel ? "is-selected" : ""} ${mine ? "is-mine" : ""} ${p.mapId ? "" : "is-landmark"}" data-place="${p.id}" ${h ? `data-faction="${h}"` : ""} style="left:${pos.x}%;top:${pos.y}%" aria-label="${esc(label)}" aria-pressed="${sel}">
          <span class="cmp-pin-badge">${h ? factionEmblemSvg(h, 30) : `<span class="cmp-pin-none" aria-hidden="true">?</span>`}${isOpen ? `<span class="cmp-pin-swords" aria-hidden="true">⚔</span>` : ""}</span>
          <span class="cmp-pin-name">${esc(PIN_LABEL[p.id] ?? p.name.replace(/^The /, ""))}</span>
        </button>`;
      })
      .join("");
    // On narrow screens the map keeps a readable size and scrolls sideways inside its panel.
    return `<div class="cmp-map-scroll"><div class="cmp-map">${valleyMapSvg()}${pins}</div></div><p class="cmp-map-hint">Swipe the map sideways to see the whole valley.</p>`;
  };

  const legend = (s: CampaignState): string => `
    <ul class="cmp-legend">${LORE_FACTION_IDS.map((f) => `<li>${factionEmblemSvg(f, 20)} ${esc(LORE_FACTIONS[f].name)}${f === s.faction ? " (you)" : ""}: ${Object.keys(PLACE_PERKS).filter((p) => s.holders[p] === f).length}</li>`).join("")}
      <li><span class="cmp-pin-none" aria-hidden="true">?</span> Nobody</li>
      <li><span class="cmp-swords-key" aria-hidden="true">⚔</span> Battle on offer</li></ul>`;

  const placeBox = (s: CampaignState): string => {
    if (!placeInfo)
      return `<p class="hint cmp-place-hint">Pick a place on the map to see who holds it and what it's worth.</p>`;
    const p = placeById(placeInfo)!;
    const h = s.holders[p.id] ?? null;
    const perk = PLACE_PERKS[p.id];
    const here = availableBattles(s).filter((b) => b.placeId === p.id);
    return `<div class="cmp-place-box" ${h ? `data-faction="${h}"` : ""}>
      <h3>${h ? factionEmblemSvg(h, 26) : ""} ${esc(p.name)}</h3>
      <p class="hint">${h ? `Held by ${esc(LORE_FACTIONS[h].name)}${h === s.faction ? " (you)" : ""}` : "Held by nobody"}${p.mapId ? ` · battlefield: ${esc(MAPS[p.mapId]?.name ?? p.mapId)}` : ""}</p>
      <p>${esc(p.blurb)}</p>
      ${perk ? `<p><b>${esc(perk.name)}:</b> ${esc(perkText(perk, s.faction))}. <span class="hint">${esc(perk.flavour)}</span></p>` : p.id === "wellspring" ? `<p><b>The prize.</b> Whoever wins the Battle of Fizzwater Ford holds it.</p>` : ""}
      ${here.map((b) => `<button type="button" class="mini" data-battle="${b.id}">⚔ ${esc(b.title)}</button>`).join(" ")}
    </div>`;
  };

  const battleCard = (s: CampaignState, b: CampaignBattleDef): string => {
    const m = MISSIONS[b.missionId]!;
    const perk = PLACE_PERKS[b.placeId];
    const h = s.holders[b.placeId] ?? null;
    const sel = selected === b.id;
    const worth = perk ? `${perk.name}: ${lcFirst(perkText(perk, s.faction))}` : "";
    const stake =
      b.id === FINALE.id
        ? "The Wellspring, and the war."
        : h === s.faction
          ? `You hold it (${worth}). Lose or skip it and ${factionName(b.enemy, true)} take it.`
          : h === b.enemy
            ? `${factionName(h)} hold it. Win to take it (${worth}).`
            : `${h ? `${factionName(h)} hold it` : "Nobody holds it"}. Win to take it (${worth}); lose or skip it and ${factionName(b.enemy, true)} take it.`;
    return `<button type="button" class="cmp-battle ${sel ? "selected" : ""}" data-battle="${b.id}" aria-pressed="${sel}">
      <span class="cmp-battle-head">${factionEmblemSvg(b.enemy, 36)}<span><b>${esc(b.title)}</b><small>vs ${esc(factionName(b.enemy, true))} · ${esc(placeName(b.placeId))}</small></span></span>
      <span class="cmp-battle-tags"><span class="tag">${esc(MODES[m.mode].name)}</span><span class="tag">${esc(m.name)}</span>${m.roles ? `<span class="tag">as ${esc(m.roles[b.side].name)}</span>` : ""}</span>
      <span class="cmp-battle-stake">${esc(stake)}</span>
    </button>`;
  };

  const briefPanel = (s: CampaignState, b: CampaignBattleDef): string => {
    const m = MISSIONS[b.missionId]!;
    const mode = m.mode;
    const roster = s.army[mode];
    const budget = budgetFor(s, mode);
    const cost = listCost(roster.entries);
    const problems = rosterProblems(s, mode, roster);
    const t = perkTotals(s);
    const role = m.roles?.[b.side];
    const perk = PLACE_PERKS[b.placeId];
    const extras = [
      t.cp ? `+${t.cp} CP` : "",
      t.resources ? `+${t.resources} starting resources` : "",
      ...t.units.map((u) => `a free ${baseProfile(u).name}`),
      ...t.supports
        .filter((x) => !roster.supports.includes(x))
        .map((x) => `a free ${SUPPORTS[x]!.name}`),
    ].filter(Boolean);
    const overBudget = cost > budget;
    return `
      <section class="panel cmp-brief" data-faction="${s.faction}" aria-labelledby="c-brief-title">
        <h2 id="c-brief-title">${esc(b.title)}</h2>
        <p class="cmp-hook">${esc(b.hook)}</p>
        <dl class="cmp-facts">
          <div><dt>Where</dt><dd>${esc(placeName(b.placeId))} <span class="hint">(${esc(MAPS[b.mapId]?.name ?? b.mapId)})</span></dd></div>
          <div><dt>Against</dt><dd>${factionEmblemSvg(b.enemy, 20)} ${esc(factionName(b.enemy))}, led by ${esc(leaderOf(b.enemy).name)}. Their army: ⚙${ACT_BUDGET[budgetAct(s.act)][mode]}.</dd></div>
          <div><dt>Mission</dt><dd><b>${esc(m.name)}</b> (${esc(MODES[mode].name)}, ${m.rounds} rounds). ${esc(m.blurb)}</dd></div>
          ${role ? `<div><dt>Your side</dt><dd><b>${esc(role.name)}</b>: ${esc(role.blurb)}</dd></div>` : ""}
          <div><dt>At stake</dt><dd>${b.id === FINALE.id ? "The Wellspring. Win or lose, the war ends here." : `${esc(placeName(b.placeId))}${perk ? `: <b>${esc(perk.name)}</b>, ${esc(lcFirst(perkText(perk, s.faction)))}` : ""}.`}</dd></div>
        </dl>
        <h3>Your ${esc(MODES[mode].name)} army <span class="cmp-budget ${overBudget ? "over" : ""}">⚙${cost}/${budget}</span></h3>
        <p class="cmp-army">${esc(armyLine(roster.entries))}${roster.supports.length ? `<br><span class="hint">Supports: ${esc(roster.supports.map((x) => SUPPORTS[x]?.name ?? x).join(", "))} (✦${supportsCost(roster.supports)})</span>` : ""}</p>
        <p class="hint">${extras.length ? `From the places you hold: ${esc(extras.join(", "))}.` : "Your places give you nothing extra in this battle."}${s.battered ? ` Your army is battered from the last battle: ⚙${BATTERED_PENALTY} less budget.` : ""}</p>
        ${problems.map((p) => `<p class="problem">⚠ ${esc(p)}</p>`).join("")}
        ${message ? `<p class="cmp-message" role="status">${esc(message)}</p>` : ""}
        <div class="row cmp-brief-actions">
          <button id="c-fight" class="big" ${problems.length || launching ? "disabled" : ""}>To battle!</button>
          <button class="secondary" id="c-muster" data-mode="${mode}">📜 Muster army</button>
          ${overBudget ? `<button class="secondary" id="c-trim" data-mode="${mode}">Trim to fit</button>` : ""}
          <button class="secondary" id="c-briefing">▶ Briefing</button>
        </div>
      </section>`;
  };

  const perksPanel = (s: CampaignState): string => {
    const held = heldPerks(s);
    return `
      <section class="panel cmp-perks" data-faction="${s.faction}">
        <h2>What your places give you</h2>
        ${
          held.length
            ? `<ul>${held
                .map(
                  (h) =>
                    `<li class="${h.active ? "" : "capped"}"><b>${esc(placeName(h.placeId))}</b>: ${esc(perkText(h.perk, s.faction))}${h.active ? "" : " <small>(over the limit: no extra effect)</small>"}</li>`,
                )
                .join("")}</ul>`
            : `<p class="hint">You hold no battlefields. Win some!</p>`
        }
        <p class="hint">Limits per battle: +${PERK_CAPS.cp} CP, +${PERK_CAPS.resources} resources, +${PERK_CAPS.budget} roster budget, ${PERK_CAPS.unit} free unit and ${PERK_CAPS.support} free support card.</p>
        <h3>Your armies</h3>
        <div class="cmp-armies">${(["skirmish", "assault"] as ModeId[])
          .map((mode) => {
            const r = s.army[mode];
            const cost = listCost(r.entries);
            const budget = budgetFor(s, mode);
            return `<div class="cmp-army-row"><span><b>${esc(MODES[mode].name)}</b> <span class="cmp-budget ${cost > budget ? "over" : ""}">⚙${cost}/${budget}</span><br><small>${esc(armyLine(r.entries))}</small></span><button class="mini secondary" data-muster="${mode}">Muster</button></div>`;
          })
          .join("")}</div>
      </section>`;
  };

  const chronicle = (s: CampaignState): string => {
    const byAct = new Map<number, ChronicleEntry[]>();
    for (const c of s.chronicle) byAct.set(c.act, [...(byAct.get(c.act) ?? []), c]);
    return `
      <section class="panel cmp-chronicle">
        <h2>The story so far</h2>
        ${[...byAct]
          .reverse()
          .map(
            ([
              act,
              items,
            ]) => `<h3>${esc(act === 4 ? "The Battle of Fizzwater Ford" : ACTS[act as 1 | 2 | 3].name)}</h3>
              <ul>${items
                .slice()
                .reverse()
                .map((c) => `<li class="tone-${c.tone}">${esc(c.text)}</li>`)
                .join("")}</ul>`,
          )
          .join("")}
        <button type="button" class="linkish" id="c-prologue">▶ Watch the prologue again</button>
      </section>`;
  };

  const header = (s: CampaignState, sub: string): string => `
    <header class="menu-head cmp-head" data-faction="${s.faction}">
      <div class="cmp-title">${factionEmblemSvg(s.faction, 56)}<div><h1>The Dustline War</h1><p class="tagline">${esc(LORE_FACTIONS[s.faction].name)}: <i>${esc(campaignOf(s).title)}</i> · ${esc(sub)}</p></div></div>
      <div class="row">
        <button class="secondary" id="c-export" title="Save this campaign to a file">Export save</button>
        <button class="secondary" id="c-import" title="Load a campaign from a file">Import…</button>
        <button class="secondary danger" id="c-abandon" title="Delete this campaign and start again">Abandon</button>
        <button class="secondary" id="c-exit">Main menu</button>
        <span id="c-audio"></span>
      </div>
    </header>`;

  const newsBanner = (): string => {
    if (!lastNews) return "";
    const n = lastNews;
    return `<section class="panel cmp-news tone-${n.outcome}" role="status">
      <h2>${n.outcome === "win" ? "Victory" : n.outcome === "loss" ? "Defeat" : "Stalemate"}: ${esc(n.title)}</h2>
      <ul>${n.news.map((c) => `<li class="tone-${c.tone}">${esc(c.text)}</li>`).join("")}</ul>
    </section>`;
  };

  const mainScreen = (s: CampaignState): string => {
    const battles = availableBattles(s);
    if (!selected || !battles.some((b) => b.id === selected)) selected = battles[0]?.id ?? null;
    const b = selected ? battles.find((x) => x.id === selected) : undefined;
    const open = new Set(battles.map((x) => x.placeId));
    return `
      <div class="modal menu campaign">
        ${header(s, stageShort(s.act))}
        ${actBar(s)}
        ${newsBanner()}
        <div class="cmp-grid">
          <section class="panel cmp-map-panel" aria-labelledby="c-map-title">
            <h2 id="c-map-title">The Dustline</h2>
            ${mapHtml(s, open)}
            ${legend(s)}
            ${placeBox(s)}
          </section>
          <div class="cmp-side-col">
            <section class="panel cmp-battles" aria-labelledby="c-battles-title">
              <h2 id="c-battles-title">${s.act === 4 ? "The final battle" : "Choose your next battle"}</h2>
              <div class="cmp-battle-list">${battles.map((x) => battleCard(s, x)).join("")}</div>
            </section>
            ${b ? briefPanel(s, b) : ""}
          </div>
          ${perksPanel(s)}
          ${chronicle(s)}
        </div>
      </div>`;
  };

  // ------------------------------------------------ the end

  const endingScreen = (s: CampaignState): string => {
    const won = s.ending === "win";
    const panels = campaignOf(s).endings[s.ending!];
    const record = s.results.map((r) => {
      const b = battleById(s, r.battleId);
      return `<li class="tone-${r.outcome}"><b>${esc(b?.title ?? r.battleId)}</b> (${esc(stageShort(r.act))}): ${r.outcome === "win" ? "won" : r.outcome === "loss" ? "lost" : "drawn"} ${r.vp[0]}-${r.vp[1]}${r.retreated ? ", retreated" : ""}</li>`;
    });
    return `
      <div class="modal menu campaign">
        ${header(s, won ? "The war is won" : "The war is lost")}
        <section class="panel cmp-ending ${won ? "tone-win" : "tone-loss"}" data-faction="${s.faction}">
          <h2 class="cmp-ending-title">${esc(panels[0]?.title ?? (won ? "VICTORY" : "DEFEAT"))}</h2>
          ${panels
            .map(
              (p) =>
                `<p>${esc(fillStory(p.caption, s.rival))}</p>${p.who && p.text ? `<blockquote>“${esc(fillStory(p.text, s.rival))}”<cite>${esc(speakerName(p.who))}</cite></blockquote>` : ""}`,
            )
            .join("")}
          <p class="hint">${esc(campaignSummary(s))}</p>
          <div class="row">
            <button id="c-ending">▶ Watch the ending</button>
            <button class="secondary" id="c-again">Start a new campaign</button>
          </div>
        </section>
        <div class="cmp-grid">
          <section class="panel cmp-map-panel"><h2>The Dustline, after the war</h2>${mapHtml(s, new Set())}${legend(s)}${placeBox(s)}</section>
          <section class="panel cmp-chronicle"><h2>Your war</h2><ul>${record.join("")}</ul></section>
          ${chronicle(s)}
        </div>
      </div>`;
  };

  // ------------------------------------------------ actions

  const startNew = async (f: LoreFactionId) => {
    if (state && !confirm("Start a new campaign? The one in progress will be deleted.")) return;
    state = newCampaign(f, (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
    selected = null;
    placeInfo = null;
    lastNews = null;
    message = "";
    persist();
    render();
    if (state.scenes) await playStory("The Dustline War", prologuePanels(state), f, null);
  };

  const muster = (mode: ModeId) => {
    if (!state) return;
    const s = state;
    const budget = budgetFor(s, mode);
    openListBuilder(host, {
      faction: s.faction,
      mode,
      onClose: render,
      campaign: {
        title: `Muster: ${MODES[mode].name} army`,
        budget,
        note: `${stageName(s.act)}: your ${MODES[mode].name} army can cost up to ⚙${budget}${
          perkTotals(s).budget || s.battered
            ? ` (the act's ⚙${ACT_BUDGET[budgetAct(s.act)][mode]}${perkTotals(s).budget ? `, +${perkTotals(s).budget} from your places` : ""}${s.battered ? `, −${BATTERED_PENALTY} because your army is battered` : ""})`
            : ""
        }.`,
        entries: s.army[mode].entries,
        supports: s.army[mode].supports,
        starter: starterRoster(s.faction, mode, s.act === 4 ? 3 : s.act),
        onDone: (entries, supports) => {
          if (!state) return;
          state = { ...state, army: { ...state.army, [mode]: { entries, supports } } };
          message = `Your ${MODES[mode].name} army is ready.`;
          persist();
          render();
        },
      },
    });
  };

  const fight = async () => {
    if (!state || !selected || launching) return;
    const s = state;
    const b = availableBattles(s).find((x) => x.id === selected);
    if (!b) return;
    const mode = modeOfMission(b.missionId);
    const problems = rosterProblems(s, mode, s.army[mode]);
    if (problems.length) {
      message = problems.join(" ");
      render();
      return;
    }
    launching = true;
    const l = battleSetup(s, b.id);
    if (s.scenes) await playStory(b.title, briefingPanels(s, b), s.faction, s.rival);
    lastNews = null;
    message = "";
    opts.onBattle({
      battleId: b.id,
      title: `${stageShort(s.act)}: ${b.title}`,
      choice: {
        mode: l.mode,
        mission: l.mission,
        map: l.map,
        factions: l.factions,
        lists: l.lists,
        supports: l.supports,
        armyRule: "list",
        startBonus: l.startBonus,
      },
    });
  };

  const importSave = async () => {
    try {
      const data = await pickJsonFile();
      const s = parseCampaign(data);
      if (!s) message = "That file isn't a campaign save this version of the game can read.";
      else if (!state || confirm("Replace the campaign in progress with the imported one?")) {
        state = s;
        selected = null;
        placeInfo = null;
        lastNews = null;
        persist();
        message = message || `Loaded: ${campaignSummary(s)}.`;
      }
    } catch (err) {
      message = `Couldn't import: ${(err as Error).message}`;
    }
    render();
  };

  const bind = () => {
    const on = (sel: string, fn: (el: HTMLElement) => void) =>
      host
        .querySelectorAll<HTMLElement>(sel)
        .forEach((el) => el.addEventListener("click", () => fn(el)));
    audio.mountButton(host.querySelector("#c-audio")); // [audio]
    on("#c-exit", () => opts.onExit());
    on("#c-import", () => void importSave());
    on("[data-start]", (el) => void startNew(el.dataset.start as LoreFactionId));
    on("#c-export", () => state && downloadJson(`scdmg-campaign-${state.faction}`, state));
    on("#c-abandon", () => {
      if (
        !confirm(
          "Abandon this campaign? Your progress will be deleted (export a save first if you want to keep it).",
        )
      )
        return;
      clearCampaign();
      state = null;
      lastNews = null;
      message = "Campaign abandoned. Pick a side to start again.";
      render();
    });
    on("#c-again", () => {
      if (
        !confirm(
          "Start a new campaign? This one will be deleted (export a save first if you want to keep it).",
        )
      )
        return;
      clearCampaign();
      state = null;
      message = "";
      render();
    });
    on("[data-battle]", (el) => {
      selected = el.dataset.battle!;
      const b = state ? battleById(state, selected) : undefined;
      if (b) placeInfo = b.placeId;
      message = "";
      render();
      host
        .querySelector<HTMLElement>(".cmp-brief")
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    on("[data-place]", (el) => {
      placeInfo = placeInfo === el.dataset.place ? null : el.dataset.place!;
      const here = state ? availableBattles(state).find((b) => b.placeId === placeInfo) : undefined;
      if (here) selected = here.id;
      render();
    });
    on("#c-fight", () => void fight());
    on("#c-muster", (el) => muster(el.dataset.mode as ModeId));
    on("[data-muster]", (el) => muster(el.dataset.muster as ModeId));
    on("#c-trim", (el) => {
      if (!state) return;
      const mode = el.dataset.mode as ModeId;
      const r = state.army[mode];
      state = {
        ...state,
        army: {
          ...state.army,
          [mode]: { ...r, entries: fitList(r.entries, budgetFor(state, mode)) },
        },
      };
      message = "Trimmed your army to fit the budget.";
      persist();
      render();
    });
    on("#c-briefing", () => {
      const b =
        state && selected ? availableBattles(state).find((x) => x.id === selected) : undefined;
      if (state && b) void playStory(b.title, briefingPanels(state, b), state.faction, state.rival);
    });
    on(
      "#c-prologue",
      () => state && void playStory("The Dustline War", prologuePanels(state), state.faction, null),
    );
    on(
      "#c-ending",
      () =>
        state &&
        void playStory("The end of the war", endingPanels(state), state.faction, state.rival),
    );
    host.querySelector<HTMLInputElement>("#c-scenes")?.addEventListener("change", (e) => {
      if (!state) return;
      state = { ...state, scenes: (e.target as HTMLInputElement).checked };
      persist();
    });
  };

  render();
  void playQueue();
}

/** Who a story line's speaker is, by name. */
function speakerName(who: string): string {
  return characterById(who)?.name ?? (PROFILES[who] ? baseProfile(who).name : who);
}
