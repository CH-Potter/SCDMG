import { factionEmblemSvg, wordmarkSvg } from "./art/emblems";
// Main menu: game mode, mission and battlefield (with previews), armies and lists, plus entry
// points to the list builder and map builder.

import { FACTIONS, isBuiltInFaction, listCost, factionOf, supportsCost } from "../engine/data/factions";
import type { MapDef } from "../engine/data/maps";
import { economyOf, missionMapProblem, MISSIONS, swapMapSides, swapMissionSides, type MissionDef } from "../engine/data/missions";
import { MODES, type ModeId } from "../engine/data/modes";
import { cleanRules, HOUSE_RULES, isCoreRule, isStandard, rulesSummary, STANDARD_RULES, type HouseRules } from "../engine/houseRules";
import type { StartBonus } from "../engine/game";
import type { FactionId, ListEntry } from "../engine/types";
import { mapsForMode } from "./customMaps";
import { esc } from "./describe";
import { loadJson, saveJson } from "./files";
import { findList, listsFor } from "./lists";
import { recruitableProfiles, type ArmyRule } from "../engine/openRoster";
import { drawMapPreview, drawMissionPreview } from "./previews";
import { maybeFactionIntro, playIntro, showLore } from "./loreLinks";
import { audio } from "../audio"; // [audio]

export interface MenuChoice {
  mode: ModeId;
  mission: MissionDef;
  map: MapDef;
  factions: [FactionId, FactionId];
  lists: [ListEntry[], ListEntry[]];
  supports: [string[], string[]];
  /** "open": an open roster (RTS-style) game, no lists (lists and supports are then empty). */
  armyRule?: ArmyRule;
  /** Campaign perks: a small head start for either side (see GameSetup.startBonus). */
  startBonus?: [StartBonus | undefined, StartBonus | undefined];
}

export interface MenuOptions {
  onStart: (choice: MenuChoice) => void;
  onListBuilder: (faction: FactionId, mode: ModeId, listId?: string) => void;
  onMapBuilder: () => void;
  onFactionForge: () => void;
  onRules: () => void;
  onCampaign: () => void;
}

interface Prefs {
  mode: ModeId;
  mission: Record<ModeId, string>;
  map: Record<ModeId, string>;
  faction: [FactionId, FactionId];
  list: [string, string];
  /** Which side of each role mission you play: 0 = side A, 1 = side B. */
  side: Record<string, 0 | 1>;
  /** Armies from lists, or the open roster (RTS-style: recruit any unit). */
  army: ArmyRule;
}

const PREFS_KEY = "scdmg.menu.v1";
const HOUSE_KEY = "scdmg.houseRules.v1";

/** The house rules chosen in the menu (every battle uses them, the campaign's too). */
export function loadHouseRules(): HouseRules {
  return cleanRules(loadJson<unknown>(HOUSE_KEY, {}));
}
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

function defaults(): Prefs {
  return {
    mode: "skirmish",
    mission: { skirmish: "hold", assault: "frontline" },
    map: { skirmish: "dustbowl", assault: "highway" },
    faction: ["militia", "munch"],
    list: ["", ""],
    side: {},
    army: "list",
  };
}

const missionsFor = (mode: ModeId) => Object.values(MISSIONS).filter((m) => m.mode === mode);

/** "⚙10 (+5/round) · ◆6 → 14" for one side's economy. */
const economyText = (m: MissionDef, p: 0 | 1) => {
  const e = economyOf(m, p);
  return `⚙${e.startResources} (+${e.income}/round) · ◆${e.startSupply} → ${e.maxSupply}`;
};

export function openMenu(host: HTMLElement, opts: MenuOptions): void {
  const prefs: Prefs = { ...defaults(), ...loadJson<Partial<Prefs>>(PREFS_KEY, {}) };
  // A remembered custom faction may have been deleted since: fall back to the defaults.
  ([0, 1] as const).forEach((p) => {
    if (!FACTIONS[prefs.faction[p]]) {
      prefs.faction[p] = defaults().faction[p];
      prefs.list[p] = "";
    }
  });
  if (!MODES[prefs.mode]) prefs.mode = "skirmish";
  if (typeof prefs.side !== "object" || prefs.side === null) prefs.side = {};
  if (prefs.army !== "open") prefs.army = "list";
  const save = () => saveJson(PREFS_KEY, prefs);
  let house = loadHouseRules();
  const saveHouse = () => saveJson(HOUSE_KEY, house);

  const render = () => {
    audio.setMenuFaction(prefs.faction[0]); // [audio] menu music follows your faction
    const mode = prefs.mode;
    const missions = missionsFor(mode);
    const mission = missions.find((m) => m.id === prefs.mission[mode]) ?? missions[0]!;
    // Only battlefields that suit the mission (mode, tags for role missions, home objectives...).
    const allMaps = mapsForMode(mode);
    const maps = allMaps.filter((m) => missionMapProblem(mission, m) === null);
    const hidden = allMaps.length - maps.length;
    const map = maps.find((m) => m.id === prefs.map[mode]) ?? maps[0];
    const mapOk = !!map;
    const side: 0 | 1 = mission.roles ? (prefs.side[mission.id] ?? 0) : 0;

    // Re-rendering replaces the page, so keep the scroll position where the player was.
    const scroller = host.querySelector<HTMLElement>(".modal");
    const scrollTop = scroller?.scrollTop ?? 0;
    const hostScrollTop = host.scrollTop;
    host.innerHTML = `
      <div class="modal menu">
        <header class="menu-head">
          <div>
            <h1 aria-label="Super Cool Desktop Miniatures Game">${wordmarkSvg()}</h1>
            <p class="tagline"><b>SCDMG</b>: a cartoon sci-fi skirmish on the tabletop. Pick a mode, a mission, a battlefield and your armies. <button type="button" class="linkish" id="m-intro">▶ Watch the intro</button></p>
          </div>
          <div class="row">
            <button id="m-campaign" title="The Dustline War: a campaign of linked battles for one side">⚔ Campaign</button>
            <button class="secondary" id="m-lists">📜 List builder</button>
            <button class="secondary" id="m-maps">🗺 Map builder</button>
            <button class="secondary" id="m-forge">🧬 Faction forge</button>
            <button class="secondary" id="m-lore">📖 Lore</button>
            <button class="secondary" id="m-rules">❓ How to play</button>
            <span id="m-audio"></span>
          </div>
        </header>

        <h2 class="step"><span>1</span> Game mode</h2>
        <div class="card-row">${Object.values(MODES)
          .map(
            (m) => `<button class="pick ${m.id === mode ? "selected" : ""}" data-mode="${m.id}">
              <div class="mode-board" style="aspect-ratio:${m.width}/${m.height}"><span>${m.width}" × ${m.height}"</span></div>
              <b>${esc(m.name)}</b><p>${esc(m.blurb)}</p>
              <p class="hint">Rosters up to ⚙${m.rosterLimit}, ${m.maxUnits} units</p></button>`,
          )
          .join("")}</div>

        <h2 class="step"><span>2</span> Mission</h2>
        <div class="card-grid">${missions
          .map(
            (m) => `<button class="pick ${m.id === mission.id ? "selected" : ""}" data-mission="${m.id}">
              <canvas class="preview" data-mission-preview="${m.id}"></canvas>
              <b>${esc(m.name)}${m.roles ? ` <span class="tag">two sides</span>` : ""}</b><p>${esc(m.blurb)}</p>
              ${
                m.roles
                  ? `<p class="hint">${m.rounds} rounds · A, ${esc(m.roles[0].name)}: ${economyText(m, 0)}<br>B, ${esc(m.roles[1].name)}: ${economyText(m, 1)}</p>`
                  : `<p class="hint">${m.rounds} rounds · start ${economyText(m, 0)}</p>`
              }</button>`,
          )
          .join("")}</div>
        ${
          mission.roles
            ? `<h3 class="sub">Your side</h3>
               <div class="card-row sides">${mission.roles
                 .map(
                   (r, i) => `<button class="pick ${i === side ? "selected" : ""}" data-side="${i}">
                     <b>Side ${i === 0 ? "A" : "B"}: ${esc(r.name)}</b><p>${esc(r.blurb)}</p>
                     <p class="hint">${economyText(mission, i as 0 | 1)}${r.garrison ? ` · ${r.garrison} free emplacement${r.garrison > 1 ? "s" : ""}` : ""}</p></button>`,
                 )
                 .join("")}</div>
               <p class="hint">The AI plays the other side.</p>`
            : ""
        }

        <h2 class="step"><span>3</span> Battlefield</h2>
        <div class="card-grid">${maps
          .map(
            (m) => `<button class="pick ${m.id === map?.id ? "selected" : ""}" data-map="${esc(m.id)}">
              <canvas class="preview" data-map-preview="${esc(m.id)}"></canvas>
              <b>${esc(m.name)}${m.custom ? ` <span class="tag">custom</span>` : ""}</b><p>${esc(m.blurb ?? "")}</p></button>`,
          )
          .join("")}</div>
        ${
          mapOk
            ? hidden
              ? `<p class="hint">${hidden} battlefield${hidden > 1 ? "s don't" : " doesn't"} suit ${esc(mission.name)} and ${hidden > 1 ? "are" : "is"} hidden.</p>`
              : ""
            : `<p class="problem">⚠ No battlefield suits ${esc(mission.name)}${allMaps[0] ? `: ${esc(missionMapProblem(mission, allMaps[0]) ?? "")}` : ""}. Pick another mission, or build a map for it.</p>`
        }

        <h2 class="step"><span>4</span> Armies</h2>
        <div class="card-row sides" role="radiogroup" aria-label="How armies are chosen">
          <button class="pick ${prefs.army === "list" ? "selected" : ""}" data-army-rule="list" role="radio" aria-checked="${prefs.army === "list"}">
            <b>Army: from a list</b><p>Each side brings a roster from the list builder.</p></button>
          <button class="pick ${prefs.army === "open" ? "selected" : ""}" data-army-rule="open" role="radio" aria-checked="${prefs.army === "open"}">
            <b>Army: open roster (RTS)</b><p>No lists. Recruit any unit of your faction, as often as you can pay for it, even after it dies. At most ${MODES[mode].maxCopies} of one unit on the table at once.</p></button>
        </div>
        <div class="armies">
          ${[0, 1].map((p) => armyPicker(p as 0 | 1, mode)).join("")}
        </div>

        <h2 class="step"><span>5</span> House rules</h2>
        ${houseRulesPanel()}

        <p class="legal">SCDMG © 2026 Craig Potter and SCDMG contributors. Free software under the GNU General Public License v3 or later, with ABSOLUTELY NO WARRANTY. You may share and change it under that licence, keeping these credits: see LICENSE, and the source, at github.com/CH-Potter/SCDMG.</p>

        <div class="row start-row">
          <button id="m-start" class="big" ${mapOk ? "" : "disabled"}>To battle!</button>
          <span class="hint">${esc(mission.name)}${mission.roles ? ` (as ${esc(mission.roles[side].name)})` : ""} · ${esc(map?.name ?? "no battlefield")} · ${esc(MODES[mode].name)}${prefs.army === "open" ? " · open roster" : ""}${isStandard(house) ? "" : ` · ${rulesSummary(house).length} house rule${rulesSummary(house).length === 1 ? "" : "s"}`}</span>
        </div>
      </div>`;
    host.classList.add("show");
    const nextScroller = host.querySelector<HTMLElement>(".modal");
    if (nextScroller) nextScroller.scrollTop = scrollTop;
    host.scrollTop = hostScrollTop;
    requestAnimationFrame(() => {
      host.querySelectorAll<HTMLCanvasElement>("[data-mission-preview]").forEach((c) => {
        const m = MISSIONS[c.dataset.missionPreview!]!;
        // Each mission card previews on the chosen battlefield if it fits, else on one that does.
        const on = map && missionMapProblem(m, map) === null ? map : allMaps.find((x) => missionMapProblem(m, x) === null);
        if (on) drawMissionPreview(c, m, on);
      });
      host.querySelectorAll<HTMLCanvasElement>("[data-map-preview]").forEach((c) => {
        const m = maps.find((x) => x.id === c.dataset.mapPreview);
        if (m) drawMapPreview(c, m);
      });
      // Thumbnails size themselves once drawn, which shifts the page: put the scroll back again.
      if (nextScroller) nextScroller.scrollTop = scrollTop;
    });
    bind(mission, map, side);
  };

  const houseRulesPanel = () => {
    const box = (group: "core" | "optional") =>
      HOUSE_RULES.filter((r) => isCoreRule(r.id) === (group === "core"))
        .map(
          (r) => `<label class="house-rule">
            <input type="checkbox" data-house="${r.id}" ${house[r.id] ? "checked" : ""}>
            <span><b>${esc(r.name)}</b>${house[r.id] !== STANDARD_RULES[r.id] ? ` <span class="tag">changed</span>` : ""}<br><small>${esc(r.text)}</small></span>
          </label>`,
        )
        .join("");
    const changed = rulesSummary(house);
    return `<details class="house-rules panel" ${changed.length ? "open" : ""}>
        <summary>${changed.length ? `<b>${changed.length} house rule${changed.length === 1 ? "" : "s"}:</b> ${esc(changed.join(", "))}` : "<b>Standard rules.</b> Open to switch mechanics off, or tabletop staples on."}</summary>
        <div class="house-grid">
          <fieldset><legend>Core rules: untick to switch off</legend>${box("core")}</fieldset>
          <fieldset><legend>Optional rules: tick to switch on</legend>${box("optional")}</fieldset>
        </div>
        <div class="row">
          <button type="button" class="mini secondary" id="m-house-reset" ${changed.length ? "" : "disabled"}>Back to standard rules</button>
          <span class="hint">House rules apply to every battle, the campaign's too, and the AI plays by them. The game was balanced with the standard rules.</span>
        </div>
      </details>`;
  };

  const armyPicker = (p: 0 | 1, mode: ModeId) => {
    const fid = prefs.faction[p];
    const lists = listsFor(fid, mode);
    const chosen = lists.find((l) => l.id === prefs.list[p]) ?? lists[0]!;
    return `
      <div class="army panel" data-faction="${esc(fid)}" style="--faction-color:${hex(factionOf(fid).color)}">
        <h3>${p === 0 ? "You" : "AI opponent"}</h3>
        <div class="faction-row">${Object.values(FACTIONS)
          .map(
            (f) => `<button class="faction-chip ${f.id === fid ? "selected" : ""}" data-faction-pick="${p}:${esc(f.id)}" data-faction="${esc(f.id)}" style="--faction-color:${hex(f.color)}" title="${esc(f.blurb)}">
              ${factionEmblemSvg(f.id, 28)}${esc(f.name)}</button>`,
          )
          .join("")}</div>
        <p class="hint">${esc(factionOf(fid).blurb)}${isBuiltInFaction(fid) ? ` <button type="button" class="linkish" data-lore="${esc(fid)}">Read their story ›</button>` : ""}</p>
        ${
          prefs.army === "open"
            ? `<p class="hint"><b>Open roster:</b> all ${recruitableProfiles(fid).length} units of the faction, plus its starter supports.</p>`
            : `<label>Army list <select data-list="${p}">${lists
                .map((l) => `<option value="${esc(l.id)}" ${l.id === chosen.id ? "selected" : ""}>${esc(l.name)} (⚙${listCost(l.entries)} · ✦${supportsCost(l.supports)})</option>`)
                .join("")}</select></label>
        <button class="mini secondary" data-edit-list="${p}">Edit lists…</button>`
        }
      </div>`;
  };

  const bind = (mission: MissionDef, map: MapDef | undefined, side: 0 | 1) => {
    const $ = (sel: string) => host.querySelector(sel)!;
    $("#m-campaign").addEventListener("click", () => opts.onCampaign());
    $("#m-lists").addEventListener("click", () => opts.onListBuilder(prefs.faction[0], prefs.mode));
    $("#m-maps").addEventListener("click", () => opts.onMapBuilder());
    $("#m-forge").addEventListener("click", () => opts.onFactionForge());
    $("#m-rules").addEventListener("click", () => opts.onRules());
    $("#m-lore").addEventListener("click", () => showLore("world"));
    $("#m-intro").addEventListener("click", () => playIntro("game"));
    host.querySelectorAll<HTMLButtonElement>("[data-lore]").forEach((b) => b.addEventListener("click", () => showLore(b.dataset.lore!)));
    audio.mountButton(host.querySelector("#m-audio")); // [audio]
    host.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => {
        prefs.mode = b.dataset.mode as ModeId;
        prefs.list = ["", ""];
        save();
        render();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-mission]").forEach((b) =>
      b.addEventListener("click", () => {
        prefs.mission[prefs.mode] = b.dataset.mission!;
        save();
        render();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-side]").forEach((b) =>
      b.addEventListener("click", () => {
        prefs.side[mission.id] = Number(b.dataset.side) === 1 ? 1 : 0;
        save();
        render();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-army-rule]").forEach((b) =>
      b.addEventListener("click", () => {
        prefs.army = b.dataset.armyRule === "open" ? "open" : "list";
        save();
        render();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-map]").forEach((b) =>
      b.addEventListener("click", () => {
        prefs.map[prefs.mode] = b.dataset.map!;
        save();
        render();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-faction-pick]").forEach((b) =>
      b.addEventListener("click", () => {
        const [p, fid] = b.dataset.factionPick!.split(":") as [string, FactionId];
        prefs.faction[Number(p) as 0 | 1] = fid;
        prefs.list[Number(p) as 0 | 1] = "";
        save();
        render();
        // Keep keyboard focus on the chip that was picked (the page was just re-rendered).
        host.querySelector<HTMLElement>(`[data-faction-pick="${p}:${CSS.escape(fid)}"]`)?.focus({ preventScroll: true });
        // The first time a built-in faction is picked, its intro plays.
        maybeFactionIntro(fid);
      }),
    );
    host.querySelectorAll<HTMLSelectElement>("[data-list]").forEach((sel) =>
      sel.addEventListener("change", () => {
        prefs.list[Number(sel.dataset.list) as 0 | 1] = sel.value;
        save();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-edit-list]").forEach((b) =>
      b.addEventListener("click", () => {
        const p = Number(b.dataset.editList) as 0 | 1;
        opts.onListBuilder(prefs.faction[p], prefs.mode, prefs.list[p] || undefined);
      }),
    );
    host.querySelectorAll<HTMLInputElement>("[data-house]").forEach((box) =>
      box.addEventListener("change", () => {
        const id = box.dataset.house as keyof HouseRules;
        house = cleanRules({ ...house, ...Object.fromEntries((box.checked ? (HOUSE_RULES.find((r) => r.id === id)?.excludes ?? []) : []).map((x) => [x, false])), [id]: box.checked });
        saveHouse();
        render();
        host.querySelector<HTMLElement>(`[data-house="${id}"]`)?.focus({ preventScroll: true });
      }),
    );
    $("#m-house-reset").addEventListener("click", () => {
      house = { ...STANDARD_RULES };
      saveHouse();
      render();
    });
    $("#m-start").addEventListener("click", () => {
      if (!map) return;
      const chosen = (p: 0 | 1) => (prefs.list[p] && findList(prefs.list[p])) || listsFor(prefs.faction[p], prefs.mode)[0]!;
      const [a, b] = [chosen(0), chosen(1)];
      // Playing side B: you stay player 1 in the engine, with the roles and the map's sides swapped.
      const sideB = !!mission.roles && side === 1;
      opts.onStart({
        mode: prefs.mode,
        mission: sideB ? swapMissionSides(mission) : mission,
        map: sideB ? swapMapSides(map) : map,
        factions: [...prefs.faction],
        // Open roster: no lists; the engine gives each side every unit and its starter supports.
        lists: prefs.army === "open" ? [[], []] : [structuredClone(a.entries), structuredClone(b.entries)],
        supports: prefs.army === "open" ? [[], []] : [[...a.supports], [...b.supports]],
        armyRule: prefs.army,
      });
    });
  };

  render();
}
