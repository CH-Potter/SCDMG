// "Play a friend online": the lobby before an online game (docs/pvp-feasibility.md §5.1).
//
//   notice (once) → host or join
//   host:  pick the game and your army → Create game → invite code, "Waiting for opponent…"
//   guest: paste the code (or open a #join= link) → see the host's game → pick your army → Ready
//   both:  the match summary → Start (the host proposes the setup, the guest accepts it) → the battle
//
// Either player can back out at any point before the battle. main.ts loads this file (and with it
// the session and transports) only when it is needed, so none of it is in the main bundle. Anything
// from the other player is untrusted: lobbyData.ts checks it, and it is shown escaped.

import { factionOf, FACTIONS, listCost, PROFILES, supportsCost } from "../engine/data/factions";
import type { MapDef } from "../engine/data/maps";
import { missionMapProblem, MISSIONS, type MissionDef } from "../engine/data/missions";
import { MODES, type ModeId } from "../engine/data/modes";
import type { GameSetup } from "../engine/game";
import { HOUSE_RULES, rulesSummary, STANDARD_RULES, type HouseRuleId, type HouseRules } from "../engine/houseRules";
import type { ArmyRule } from "../engine/openRoster";
import type { FactionId, ListEntry } from "../engine/types";
import { BUILD } from "../net/build";
import { codeFromHash, newInviteCode, prettyCode } from "../net/code";
import { DEFAULT_BROKERS, MqttTransport } from "../net/mqtt";
import { PvpSession, type PeerStatus, type Role } from "../net/session";
import type { LinkStatus, Transport } from "../net/transport";
import { dropNetFactions, isNetFactionId } from "./customFactions";
import { cleanMap, mapsForMode } from "./customMaps";
import { esc } from "./describe";
import { loadJson, saveJson } from "./files";
import { loadHouseRules, saveHouseRules } from "./houseRulesStore";
import { listProblems, listsFor, type SavedList } from "./lists";
import {
  agree,
  fitLobbyMessage,
  LOBBY_VERSION,
  matchesAgreement,
  netFaction,
  netMap,
  readLobbyMessage,
  wire,
  wireFaction,
  wireList,
  type Agreement,
  type GuestPick,
  type HostOffer,
} from "./lobbyData";
import { factionChipsHtml, houseRulesPanelHtml, toggleHouseRule } from "./menu";
import { NetOpponent } from "./opponent";
import { drawMapPreview, drawMissionPreview } from "./previews";
import "./lobby.css";

export interface LobbyOptions {
  /** The game has started: show the battle. */
  onStart: (session: PvpSession, setup: GameSetup, net: NetOpponent) => void;
  /** Back to the main menu. */
  onExit: () => void;
  /** Opened from a join link: its `#join=…` fragment. */
  joinLink?: string;
}

/** The public relays, as named to the player (the privacy notice and SECURITY.md name them too). */
const RELAYS = DEFAULT_BROKERS.map((b) => b.name);
const NOTICE_KEY = "scdmg.pvpNotice.v1";
const PREFS_KEY = "scdmg.lobby.v1";

/** Dev server only: `?pvp-local` plays between tabs of this browser instead of over the public relays. */
const LOCAL = import.meta.env.DEV && new URLSearchParams(location.search).has("pvp-local");

interface Prefs {
  mode: ModeId;
  mission: Record<ModeId, string>;
  map: Record<ModeId, string>;
  faction: FactionId;
  /** The chosen list id per faction and mode ("<faction>/<mode>" → list id). */
  list: Record<string, string>;
  army: ArmyRule;
}

const defaults = (): Prefs => ({
  mode: "skirmish",
  mission: { skirmish: "hold", assault: "frontline" },
  map: { skirmish: "dustbowl", assault: "highway" },
  faction: "militia",
  list: {},
  army: "list",
});

function noticeSeen(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberNotice(): void {
  try {
    localStorage.setItem(NOTICE_KEY, "1");
  } catch {
    // storage blocked: the notice shows again next time
  }
}

async function makeTransport(): Promise<Transport> {
  if (LOCAL) {
    const { BroadcastTransport } = await import("../net/broadcast");
    return new BroadcastTransport("scdmg-lobby/");
  }
  return new MqttTransport(DEFAULT_BROKERS);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2× Grunts, Sniper" for a roster. */
function unitNames(entries: ListEntry[]): string {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const name = PROFILES[e.profileId]?.name ?? e.profileId;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, n]) => (n > 1 ? `${n}× ${name}` : name)).join(", ");
}

/** What the guest sees of the host's game before picking an army. */
interface OfferView {
  mission: MissionDef;
  map: MapDef;
  hostFaction: string;
  hostCustom: boolean;
}

/** Check the host's offer enough to show it (`agree` checks it all once the guest has picked). */
function viewOffer(offer: HostOffer): OfferView | string[] {
  const mission = MISSIONS[offer.missionId];
  if (!mission || mission.mode !== offer.mode) return ["The mission doesn't fit the game mode"];
  const { map, problems } = netMap(offer.map);
  if (!map) return problems.map((p) => `Battlefield: ${p}`);
  const fit = missionMapProblem(mission, map);
  if (fit) return [fit];
  const f = offer.side.faction;
  if ("id" in f) {
    const known = Object.prototype.hasOwnProperty.call(FACTIONS, f.id) && !isNetFactionId(f.id) && !FACTIONS[f.id]!.custom;
    if (!known) return ["The host's faction isn't one this game knows"];
    return { mission, map, hostFaction: FACTIONS[f.id]!.name, hostCustom: false };
  }
  const nf = netFaction(f.custom, 0);
  if (!nf.faction) return nf.problems.slice(0, 6).map((p) => `The host's faction: ${p}`);
  return { mission, map, hostFaction: nf.faction.name, hostCustom: true };
}

type Screen = "notice" | "start" | "host-setup" | "host-wait" | "guest-wait" | "guest-pick" | "summary" | "failed";

class Lobby {
  private screen: Screen = "start";
  private readonly prefs: Prefs;
  private house: HouseRules = loadHouseRules();
  private joinCode: string;
  private joinError = "";
  private setupError: string[] = [];
  // the session
  private session: PvpSession | null = null;
  private role: Role | null = null;
  private code = "";
  private link: LinkStatus = "connecting";
  private linkLabel = "";
  private peer: PeerStatus = "waiting";
  private problem = "";
  private failure = "";
  private gone = false;
  // the agreement
  private offer: HostOffer | null = null;
  private view: OfferView | null = null;
  private pick: GuestPick | null = null;
  private game: Agreement | null = null;
  private offered: GameSetup | null = null;
  private refused: string[] = [];
  private notes: string[] = [];
  private proposed = false;
  private accepted = false;
  private started = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly opts: LobbyOptions,
  ) {
    const saved = loadJson<Partial<Prefs>>(PREFS_KEY, {});
    this.prefs = { ...defaults(), ...(typeof saved === "object" && saved ? saved : {}) };
    if (!MODES[this.prefs.mode]) this.prefs.mode = "skirmish";
    if (typeof this.prefs.list !== "object" || !this.prefs.list) this.prefs.list = {};
    if (this.prefs.army !== "open") this.prefs.army = "list";
    if (!FACTIONS[this.prefs.faction] || isNetFactionId(this.prefs.faction)) this.prefs.faction = "militia";
    const linked = opts.joinLink === undefined ? null : codeFromHash(opts.joinLink);
    this.joinCode = linked ?? "";
    if (opts.joinLink !== undefined && !linked) this.joinError = "That invite link's code isn't valid. Ask your friend to send the code, and paste it here.";
  }

  open(): void {
    this.go(noticeSeen() ? "start" : "notice");
  }

  private savePrefs(): void {
    saveJson(PREFS_KEY, this.prefs);
  }

  // ---------------------------------------------------------------- rendering

  private go(screen: Screen): void {
    if (this.gone) return;
    this.screen = screen;
    this.render();
  }

  private render(): void {
    if (this.gone) return;
    const body = (() => {
      switch (this.screen) {
        case "notice":
          return this.noticeHtml();
        case "start":
          return this.startHtml();
        case "host-setup":
          return this.hostSetupHtml();
        case "host-wait":
          return this.hostWaitHtml();
        case "guest-wait":
          return this.guestWaitHtml();
        case "guest-pick":
          return this.guestPickHtml();
        case "summary":
          return this.summaryHtml();
        case "failed":
          return this.failedHtml();
      }
    })();
    const scroller = this.host.querySelector<HTMLElement>(".modal.lobby");
    const keep = scroller?.dataset.screen === this.screen ? scroller.scrollTop : 0;
    this.host.innerHTML = `
      <div class="modal lobby" data-screen="${this.screen}" role="dialog" aria-modal="true" aria-labelledby="lb-title">
        <h1 id="lb-title">🌐 Play a friend online</h1>
        ${LOCAL ? `<p class="lobby-dev">Dev: this lobby talks between tabs of this browser (BroadcastChannel), not the public relays.</p>` : ""}
        ${body}
      </div>`;
    this.host.classList.add("show");
    const next = this.host.querySelector<HTMLElement>(".modal.lobby");
    if (next) next.scrollTop = keep;
    this.bind();
    requestAnimationFrame(() => this.drawPreviews());
  }

  /** The connection lines (updated in place, so typing and scrolling aren't disturbed). */
  private statusHtml(): string {
    const linkText: Record<LinkStatus, string> = {
      connecting: "Connecting to the relays…",
      open: `Connected to ${esc(this.linkLabel)}`,
      reconnecting: "Connection lost: reconnecting…",
      closed: "Not connected",
    };
    const peerText = (): string => {
      if (!this.session?.isPaired) return this.role === "host" ? "Nobody has joined yet." : "Looking for the host…";
      if (this.peer === "silent") return "Your opponent has gone quiet: waiting for them…";
      return "Your opponent is connected.";
    };
    return `<div class="lobby-status" data-status aria-live="polite">
        <p><span class="link-dot ${this.link}"></span>${linkText[this.link]}</p>
        <p>${peerText()}</p>
        ${this.problem ? `<p class="problem">⚠ ${esc(this.problem)}</p>` : ""}
      </div>`;
  }

  private updateStatus(): void {
    const el = this.host.querySelector<HTMLElement>("[data-status]");
    if (el) el.outerHTML = this.statusHtml();
  }

  private noticeHtml(): string {
    return `
      <div class="panel lobby-notice">
        <h2>Before you play: what goes over the internet</h2>
        <ul>
          <li>Your moves and the game setup (armies, battlefield, house rules, and any custom faction or map you pick) travel through two free public relay servers: <b>${RELAYS.map(esc).join("</b> and <b>")}</b>.</li>
          <li>It's all encrypted with a key made from your invite code, so the relays can't read it. Only someone with the code can join, so share it just with your friend.</li>
          <li>No accounts, no emails, no names.</li>
          <li>Like any server, a relay can see connection details, such as your IP address and when you're online.</li>
        </ul>
      </div>
      <div class="row">
        <button id="lb-notice-ok" class="big">Got it</button>
        <button class="secondary" id="lb-exit">Back</button>
      </div>`;
  }

  private startHtml(): string {
    return `
      <p class="tagline">Play against a friend over the internet. One of you hosts and sends an invite code; the other joins with it.
        <button type="button" class="linkish" id="lb-notice">What's sent, and who can see it?</button></p>
      <div class="lobby-choices">
        <div class="panel">
          <h2>Host a game</h2>
          <p>Choose the battlefield, mission, house rules and your army, then send your friend the invite code.</p>
          <button id="lb-host" class="big">Host a game</button>
        </div>
        <div class="panel ${this.opts.joinLink !== undefined ? "lobby-focus" : ""}">
          <h2>Join a game</h2>
          <label for="lb-code">Invite code from your friend</label>
          <div class="row">
            <input id="lb-code" class="invite-input" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="40" value="${esc(this.joinCode)}">
            <button id="lb-join" class="big">Join</button>
          </div>
          ${this.joinError ? `<p class="problem" role="alert">⚠ ${esc(this.joinError)}</p>` : ""}
        </div>
      </div>
      <div class="row"><button class="secondary" id="lb-exit">Back to the menu</button></div>`;
  }

  private hostSetupHtml(): string {
    const p = this.prefs;
    const mode = p.mode;
    const missions = Object.values(MISSIONS).filter((m) => m.mode === mode);
    const mission = missions.find((m) => m.id === p.mission[mode]) ?? missions[0]!;
    const maps = mapsForMode(mode).filter((m) => missionMapProblem(mission, m) === null);
    const map = maps.find((m) => m.id === p.map[mode]) ?? maps[0];
    const list = this.chosenList(p.faction, mode);
    const problems = p.army === "open" ? [] : listProblems(list, false, undefined, this.house.classLimits);
    return `
      <h2 class="step"><span>1</span> Game mode</h2>
      <div class="card-row">${Object.values(MODES)
        .map((m) => `<button class="pick ${m.id === mode ? "selected" : ""}" data-mode="${m.id}"><b>${esc(m.name)}</b><p>${esc(m.blurb)}</p></button>`)
        .join("")}</div>
      <h2 class="step"><span>2</span> Mission</h2>
      <div class="card-grid">${missions
        .map(
          (m) => `<button class="pick ${m.id === mission.id ? "selected" : ""}" data-mission="${esc(m.id)}">
            <canvas class="preview" data-mission-preview="${esc(m.id)}"></canvas>
            <b>${esc(m.name)}${m.roles ? ` <span class="tag">two sides</span>` : ""}</b><p>${esc(m.blurb)}</p></button>`,
        )
        .join("")}</div>
      ${mission.roles ? `<p class="hint">You host, so you play side A (${esc(mission.roles[0].name)}); your friend plays side B (${esc(mission.roles[1].name)}).</p>` : ""}
      <h2 class="step"><span>3</span> Battlefield</h2>
      <div class="card-grid">${maps
        .map(
          (m) => `<button class="pick ${m.id === map?.id ? "selected" : ""}" data-map="${esc(m.id)}">
            <canvas class="preview" data-map-preview="${esc(m.id)}"></canvas>
            <b>${esc(m.name)}${m.custom ? ` <span class="tag">custom</span>` : ""}</b><p>${esc(m.blurb ?? "")}</p></button>`,
        )
        .join("")}</div>
      ${map ? "" : `<p class="problem">⚠ No battlefield suits ${esc(mission.name)}. Pick another mission.</p>`}
      <h2 class="step"><span>4</span> Armies</h2>
      <div class="card-row sides" role="radiogroup" aria-label="How armies are chosen">
        <button class="pick ${p.army === "list" ? "selected" : ""}" data-army-rule="list" role="radio" aria-checked="${p.army === "list"}">
          <b>Army: from a list</b><p>Each of you brings a roster from your list builder.</p></button>
        <button class="pick ${p.army === "open" ? "selected" : ""}" data-army-rule="open" role="radio" aria-checked="${p.army === "open"}">
          <b>Army: open roster (RTS)</b><p>No lists. Recruit any unit of your faction, as often as you can pay for it.</p></button>
      </div>
      ${this.armyPickerHtml("Your army", p.faction, mode, p.army, this.house.classLimits, problems)}
      <h2 class="step"><span>5</span> House rules</h2>
      ${houseRulesPanelHtml(this.house, "Your friend sees every house rule before the game starts. The game was balanced with the standard rules.")}
      ${this.setupError.map((e) => `<p class="problem" role="alert">⚠ ${esc(e)}</p>`).join("")}
      <div class="row start-row">
        <button id="lb-create" class="big" ${map && !problems.length ? "" : "disabled"}>Create game</button>
        <button class="secondary" id="lb-back">Back</button>
      </div>`;
  }

  /** Faction chips and (for list games) the list to bring. */
  private armyPickerHtml(title: string, fid: FactionId, mode: ModeId, army: ArmyRule, classLimits: boolean, problems: string[]): string {
    const lists = listsFor(fid, mode);
    const chosen = this.chosenList(fid, mode);
    return `
      <div class="army panel" data-faction="${esc(fid)}" style="--faction-color:${hex(factionOf(fid).color)}">
        <h3>${esc(title)}</h3>
        <div class="faction-row">${factionChipsHtml(fid, (f) => `data-faction-pick="${esc(f.id)}"`)}</div>
        <p class="hint">${esc(factionOf(fid).blurb)}</p>
        ${
          army === "open"
            ? `<p class="hint"><b>Open roster:</b> every unit of the faction, plus its starter supports.</p>`
            : `<label>Army list <select data-list>${lists
                .map((l) => `<option value="${esc(l.id)}" ${l.id === chosen.id ? "selected" : ""}>${esc(l.name)} (⚙${listCost(l.entries)} · ✦${supportsCost(l.supports)})</option>`)
                .join("")}</select></label>
               ${problems.map((x) => `<p class="problem">⚠ ${esc(x)}</p>`).join("")}
               ${classLimits ? "" : `<p class="hint">Unit class limits are off for this game.</p>`}`
        }
      </div>`;
  }

  private chosenList(fid: FactionId, mode: ModeId): SavedList {
    const lists = listsFor(fid, mode);
    return lists.find((l) => l.id === this.prefs.list[`${fid}/${mode}`]) ?? lists[0]!;
  }

  private hostWaitHtml(): string {
    const o = this.offer!;
    const mission = MISSIONS[o.missionId]!;
    const map = netMap(o.map).map;
    const paired = !!this.session?.isPaired;
    const theirs = this.pick ? this.pickName(this.pick) : null;
    return `
      <div class="panel lobby-invite">
        <h2>Your invite code</h2>
        <div class="invite-code" id="lb-code-text">${esc(this.code)}</div>
        <div class="row">
          <button id="lb-copy-code">📋 Copy code</button>
          <button class="secondary" id="lb-copy-link">🔗 Copy link</button>
          <span class="hint" id="lb-copied" aria-live="polite"></span>
        </div>
        <p>Send this to your opponent (WhatsApp, Discord…). Anyone with the code can join, so send it only to them.</p>
      </div>
      <p class="lobby-wait">${
        !paired
          ? "Waiting for opponent…"
          : theirs
            ? `Your opponent is picking their army: <b>${esc(theirs)}</b> so far…`
            : "Your opponent has joined and is picking their army…"
      }</p>
      ${this.refused.length ? `<div class="panel"><p><b>Your opponent's army couldn't be used</b>, so they've been asked to pick again:</p>${this.refused.map((r) => `<p class="problem">⚠ ${esc(r)}</p>`).join("")}</div>` : ""}
      ${this.statusHtml()}
      <p class="hint">Your game: ${esc(MODES[o.mode].name)} · ${esc(mission.name)} · ${esc(map?.name ?? "")} · ${o.army === "open" ? "open roster" : "army lists"} · ${this.rulesLine(o.rules)}</p>
      ${this.notes.map((n) => `<p class="hint">ℹ ${esc(n)}</p>`).join("")}
      <div class="row"><button class="secondary" id="lb-back">Back out</button></div>`;
  }

  private guestWaitHtml(): string {
    return `
      <p class="lobby-wait">Joining game <b class="nowrap">${esc(this.code)}</b>…</p>
      ${this.statusHtml()}
      <p class="hint">If nothing happens, check the code with your friend: they need to have created the game and still have it open.</p>
      <div class="row"><button class="secondary" id="lb-back">Back out</button></div>`;
  }

  private guestPickHtml(): string {
    const o = this.offer!;
    const v = this.view!;
    const list = this.chosenList(this.prefs.faction, o.mode);
    const problems = o.army === "open" ? [] : listProblems(list, false, undefined, o.rules.classLimits);
    return `
      <h2>The host's game</h2>
      <div class="lobby-offer panel">
        <canvas class="preview" data-offer-preview></canvas>
        <div>
          <p><b>${esc(MODES[o.mode].name)}</b> · ${o.army === "open" ? "open roster (recruit any unit)" : "army lists"}</p>
          <p><b>Mission: ${esc(v.mission.name)}</b><br><small>${esc(v.mission.blurb)}</small></p>
          ${v.mission.roles ? `<p class="hint">The host plays side A (${esc(v.mission.roles[0].name)}); you play side B (${esc(v.mission.roles[1].name)}).</p>` : ""}
          <p><b>Battlefield: ${esc(v.map.name)}</b>${v.map.custom ? ` <span class="tag">custom</span>` : ""}</p>
          <p><b>House rules:</b> ${this.rulesLine(o.rules)}</p>
          <p><b>The host's army:</b> ${esc(v.hostFaction)}${v.hostCustom ? ` <span class="tag">custom</span>` : ""}</p>
        </div>
      </div>
      <h2>Your army</h2>
      ${this.armyPickerHtml("You", this.prefs.faction, o.mode, o.army, o.rules.classLimits, problems)}
      ${this.refused.length ? `<div class="panel"><p><b>The host couldn't use that army:</b></p>${this.refused.map((r) => `<p class="problem">⚠ ${esc(r)}</p>`).join("")}<p>Pick again.</p></div>` : ""}
      ${this.setupError.map((e) => `<p class="problem" role="alert">⚠ ${esc(e)}</p>`).join("")}
      ${this.statusHtml()}
      <div class="row start-row">
        <button id="lb-ready" class="big" ${problems.length ? "disabled" : ""}>Ready</button>
        <button class="secondary" id="lb-back">Back out</button>
      </div>`;
  }

  private summaryHtml(): string {
    const g = this.game!;
    const me = this.role === "host" ? 0 : 1;
    const side = (seat: 0 | 1) => {
      const s = g.sides[seat];
      const f = s.faction;
      const role = g.mission.roles?.[seat];
      return `<div class="army panel" data-faction="${esc(f.id)}" style="--faction-color:${hex(f.color)}">
          <h3>${seat === me ? "You" : "Your opponent"} <span class="hint">(${seat === 0 ? "host, cyan" : "guest, red"})</span></h3>
          <p><b>${esc(f.name)}</b>${s.custom ? ` <span class="tag">custom</span>` : ""}</p>
          ${role ? `<p>Side ${seat === 0 ? "A" : "B"}: <b>${esc(role.name)}</b></p>` : ""}
          ${
            g.army === "open"
              ? `<p class="hint">Open roster: recruits any of the faction's units.</p>`
              : `<p>Army list: ⚙${listCost(s.entries)} · ✦${supportsCost(s.supports)} · ${plural(s.entries.length, "unit")}</p>
                 <p class="hint">${esc(unitNames(s.entries))}</p>`
          }
        </div>`;
    };
    const rule = (id: HouseRuleId) => {
      const info = HOUSE_RULES.find((r) => r.id === id)!;
      const on = g.rules[id];
      const changed = on !== STANDARD_RULES[id];
      return `<li class="${on ? "on" : "off"}"><b>${esc(info.name)}: ${on ? "on" : "off"}</b>${changed ? ` <span class="tag">changed</span>` : ""}<br><small>${esc(info.text)}</small></li>`;
    };
    let action: string;
    if (this.role === "host") {
      action = this.proposed
        ? `<button class="big" disabled>Waiting for your opponent to start…</button>`
        : `<button id="lb-start" class="big">Start</button>`;
    } else {
      const mismatch = this.offered && !this.offerMatches(this.offered);
      action = mismatch
        ? `<p class="problem" role="alert">⚠ The host's game doesn't match this summary, so it wasn't accepted. Back out and try again.</p>`
        : this.accepted
          ? `<button class="big" disabled>Starting…</button>`
          : this.offered
            ? `<button id="lb-start" class="big">Start</button> <span class="hint">The host is ready.</span>`
            : `<button class="big" disabled>Waiting for the host to start…</button>`;
    }
    return `
      <h2>Match summary</h2>
      <div class="armies">${side(0)}${side(1)}</div>
      <div class="lobby-offer panel">
        <canvas class="preview" data-summary-preview></canvas>
        <div>
          <p><b>${esc(MODES[g.mode].name)}</b> · ${g.army === "open" ? "open roster" : "army lists"} · ${g.mission.rounds} rounds</p>
          <p><b>Mission: ${esc(g.mission.name)}</b><br><small>${esc(g.mission.blurb)}</small></p>
          <p><b>Battlefield: ${esc(g.map.name)}</b>${g.map.custom ? ` <span class="tag">custom</span>` : ""}</p>
        </div>
      </div>
      <h3>House rules</h3>
      <ul class="lobby-rules">${HOUSE_RULES.map((r) => rule(r.id)).join("")}</ul>
      ${this.notes.map((n) => `<p class="hint">ℹ ${esc(n)}</p>`).join("")}
      ${this.statusHtml()}
      <div class="row start-row">
        ${action}
        <button class="secondary" id="lb-back">Back out</button>
      </div>`;
  }

  private failedHtml(): string {
    return `
      <div class="panel"><p class="lobby-wait">${esc(this.failure)}</p></div>
      <div class="row"><button id="lb-exit" class="big">Back to the menu</button></div>`;
  }

  /** "Standard rules" or the changed ones. */
  private rulesLine(r: HouseRules): string {
    const changed = rulesSummary(r);
    return changed.length ? esc(changed.join(", ")) : "standard rules";
  }

  /** The faction name in a guest's pick (for the host's waiting line). */
  private pickName(p: GuestPick): string {
    const f = p.side.faction;
    if ("id" in f) return FACTIONS[f.id] && !isNetFactionId(f.id) ? FACTIONS[f.id]!.name : "an unknown faction";
    const raw = f.custom as { name?: unknown };
    return `${typeof raw?.name === "string" ? raw.name.slice(0, 40) : "a custom faction"} (custom)`;
  }

  private drawPreviews(): void {
    const h = this.host;
    if (this.screen === "host-setup") {
      const mode = this.prefs.mode;
      const missions = Object.values(MISSIONS).filter((m) => m.mode === mode);
      const mission = missions.find((m) => m.id === this.prefs.mission[mode]) ?? missions[0]!;
      const all = mapsForMode(mode);
      const maps = all.filter((m) => missionMapProblem(mission, m) === null);
      const map = maps.find((m) => m.id === this.prefs.map[mode]) ?? maps[0];
      h.querySelectorAll<HTMLCanvasElement>("[data-mission-preview]").forEach((c) => {
        const m = MISSIONS[c.dataset.missionPreview!];
        if (!m) return;
        const on = map && missionMapProblem(m, map) === null ? map : all.find((x) => missionMapProblem(m, x) === null);
        if (on) drawMissionPreview(c, m, on);
      });
      h.querySelectorAll<HTMLCanvasElement>("[data-map-preview]").forEach((c) => {
        const m = maps.find((x) => x.id === c.dataset.mapPreview);
        if (m) drawMapPreview(c, m);
      });
    }
    const offerCanvas = h.querySelector<HTMLCanvasElement>("[data-offer-preview]");
    if (offerCanvas && this.view) drawMissionPreview(offerCanvas, this.view.mission, this.view.map);
    const summaryCanvas = h.querySelector<HTMLCanvasElement>("[data-summary-preview]");
    if (summaryCanvas && this.game) drawMissionPreview(summaryCanvas, this.game.mission, this.game.map);
  }

  // ---------------------------------------------------------------- events

  private bind(): void {
    const h = this.host;
    const on = (sel: string, fn: () => void) => h.querySelector(sel)?.addEventListener("click", fn);
    on("#lb-exit", () => void this.backOut());
    on("#lb-back", () => (this.screen === "host-setup" ? this.go("start") : void this.backOut()));
    on("#lb-notice-ok", () => {
      rememberNotice();
      this.go("start");
    });
    on("#lb-notice", () => this.go("notice"));
    on("#lb-host", () => {
      this.setupError = [];
      this.go("host-setup");
    });
    const codeInput = h.querySelector<HTMLInputElement>("#lb-code");
    codeInput?.addEventListener("input", () => (this.joinCode = codeInput.value));
    codeInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.join(codeInput.value);
    });
    on("#lb-join", () => this.join(codeInput?.value ?? ""));
    on("#lb-create", () => void this.create());
    on("#lb-ready", () => this.ready());
    on("#lb-start", () => void this.start());
    on("#lb-copy-code", () => void this.copy(this.code, "Code copied"));
    on("#lb-copy-link", () => void this.copy(`${location.origin}${location.pathname}${location.search}#join=${this.code}`, "Link copied"));

    // the host's picks
    const p = this.prefs;
    h.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => {
        p.mode = b.dataset.mode === "assault" ? "assault" : "skirmish";
        this.savePrefs();
        this.render();
      }),
    );
    h.querySelectorAll<HTMLButtonElement>("[data-mission]").forEach((b) =>
      b.addEventListener("click", () => {
        p.mission[p.mode] = b.dataset.mission!;
        this.savePrefs();
        this.render();
      }),
    );
    h.querySelectorAll<HTMLButtonElement>("[data-map]").forEach((b) =>
      b.addEventListener("click", () => {
        p.map[p.mode] = b.dataset.map!;
        this.savePrefs();
        this.render();
      }),
    );
    h.querySelectorAll<HTMLButtonElement>("[data-army-rule]").forEach((b) =>
      b.addEventListener("click", () => {
        p.army = b.dataset.armyRule === "open" ? "open" : "list";
        this.savePrefs();
        this.render();
      }),
    );
    h.querySelectorAll<HTMLButtonElement>("[data-faction-pick]").forEach((b) =>
      b.addEventListener("click", () => {
        const fid = b.dataset.factionPick!;
        if (!FACTIONS[fid] || isNetFactionId(fid)) return;
        p.faction = fid;
        this.savePrefs();
        this.armyChanged();
        h.querySelector<HTMLElement>(`[data-faction-pick="${CSS.escape(fid)}"]`)?.focus({ preventScroll: true });
      }),
    );
    h.querySelector<HTMLSelectElement>("[data-list]")?.addEventListener("change", (e) => {
      const mode = this.screen === "guest-pick" && this.offer ? this.offer.mode : p.mode;
      p.list[`${p.faction}/${mode}`] = (e.target as HTMLSelectElement).value;
      this.savePrefs();
      this.armyChanged();
    });
    h.querySelectorAll<HTMLInputElement>("[data-house]").forEach((box) =>
      box.addEventListener("change", () => {
        const id = box.dataset.house as HouseRuleId;
        this.house = toggleHouseRule(this.house, id, box.checked);
        saveHouseRules(this.house);
        this.render();
        h.querySelector<HTMLElement>(`[data-house="${id}"]`)?.focus({ preventScroll: true });
      }),
    );
    on("#m-house-reset", () => {
      this.house = { ...STANDARD_RULES };
      saveHouseRules(this.house);
      this.render();
    });
  }

  /** The army pick changed: re-render, and (guest) tell the host what we're looking at. */
  private armyChanged(): void {
    this.setupError = [];
    this.render();
    if (this.screen === "guest-pick") {
      const pick = this.makePick(false);
      if (pick) void this.session?.sendLobby(pick);
    }
  }

  private async copy(text: string, done: string): Promise<void> {
    const ok = await copyText(text);
    const el = this.host.querySelector<HTMLElement>("#lb-copied");
    if (el) el.textContent = ok ? `✔ ${done}` : `Couldn't copy: select it and copy it by hand: ${text}`;
  }

  // ---------------------------------------------------------------- host

  private async create(): Promise<void> {
    const p = this.prefs;
    const mode = p.mode;
    const missions = Object.values(MISSIONS).filter((m) => m.mode === mode);
    const mission = missions.find((m) => m.id === p.mission[mode]) ?? missions[0]!;
    const maps = mapsForMode(mode).filter((m) => missionMapProblem(mission, m) === null);
    const map = maps.find((m) => m.id === p.map[mode]) ?? maps[0];
    if (!map) return;
    const list = this.chosenList(p.faction, mode);
    const offer: HostOffer = {
      v: LOBBY_VERSION,
      kind: "host",
      mode,
      missionId: mission.id,
      map: map.custom ? { custom: cleanMap(map) } : { id: map.id },
      rules: { ...this.house },
      army: p.army,
      side: { faction: wireFaction(factionOf(p.faction)), ...(p.army === "list" ? { list: wireList(list.entries, list.supports) } : {}) },
    };
    const notes: string[] = [];
    const fitted = fitLobbyMessage(offer, notes);
    if (!fitted) {
      this.setupError = ["Your faction is too big to send online, even without its unit pictures. Pick another faction."];
      return this.render();
    }
    // Check our own side now, the way the guest will (against a stand-in opponent).
    const sent = wire(fitted);
    const standIn = listsFor("militia", mode)[0]!;
    const check = agree(sent, {
      v: LOBBY_VERSION,
      kind: "guest",
      ready: true,
      side: { faction: { id: "militia" }, ...(p.army === "list" ? { list: wireList(standIn.entries, standIn.supports) } : {}) },
    });
    dropNetFactions();
    if (!check.ok && check.side !== 1) {
      this.setupError = check.problems;
      return this.render();
    }
    this.offer = sent;
    this.notes = notes;
    this.code = newInviteCode();
    this.go("host-wait");
    await this.connect("host");
  }

  private onHostLobby(data: unknown): void {
    const msg = readLobbyMessage(data);
    if (!msg || this.started) return;
    if (msg.kind === "bye") return this.fail("Your opponent backed out.");
    if (msg.kind !== "guest" || !this.offer) return;
    this.pick = msg;
    if (!msg.ready) {
      if (this.game && !this.proposed) {
        // They went back to picking (they were refused, or changed their mind).
        this.game = null;
        dropNetFactions();
      }
      if (!this.game && this.screen === "host-wait") this.render();
      return;
    }
    if (this.proposed) return; // the game is fixed now
    const r = agree(this.offer, msg);
    if (!r.ok) {
      if (r.side === 1) {
        this.refused = r.problems;
        void this.session?.sendLobby({ v: LOBBY_VERSION, kind: "refused", reasons: r.problems });
        this.game = null;
        dropNetFactions();
        return this.go("host-wait");
      }
      return this.fail(`Your game can't be played: ${r.problems.join(" ")}`);
    }
    this.refused = [];
    this.game = r.game;
    this.notes = [...new Set([...this.notes, ...r.game.notes.slice(0, 3)])];
    this.go("summary");
  }

  // ---------------------------------------------------------------- guest

  private join(raw: string): void {
    const code = prettyCode(raw);
    if (!code) {
      this.joinCode = raw;
      this.joinError = "That code isn't right. It's 16 letters and digits, in four groups of four. Check it with your friend.";
      return this.go("start");
    }
    this.joinError = "";
    this.code = code;
    this.go("guest-wait");
    void this.connect("guest");
  }

  private onGuestLobby(data: unknown): void {
    const msg = readLobbyMessage(data);
    if (!msg || this.started) return;
    if (msg.kind === "bye") return this.fail("The host backed out.");
    if (msg.kind === "refused") {
      if (this.accepted) return;
      this.refused = msg.reasons.length ? msg.reasons : ["(no reason given)"];
      this.game = null;
      this.offered = null;
      dropNetFactions();
      return this.go("guest-pick");
    }
    if (msg.kind !== "host" || this.offer) return; // only the first offer counts: the host can't change it
    const view = viewOffer(msg);
    if (Array.isArray(view)) return this.fail(`The host's game can't be played here: ${view.join(" ")}`);
    this.offer = msg;
    this.view = view;
    this.go("guest-pick");
    const pick = this.makePick(false);
    if (pick) void this.session?.sendLobby(pick);
  }

  /** The guest's army as a lobby message (null if it is too big to send). */
  private makePick(ready: boolean, notes: string[] = []): GuestPick | null {
    const o = this.offer;
    if (!o) return null;
    const list = this.chosenList(this.prefs.faction, o.mode);
    const pick: GuestPick = {
      v: LOBBY_VERSION,
      kind: "guest",
      ready,
      side: { faction: wireFaction(factionOf(this.prefs.faction)), ...(o.army === "list" ? { list: wireList(list.entries, list.supports) } : {}) },
    };
    return fitLobbyMessage(pick, notes);
  }

  private ready(): void {
    if (!this.offer || !this.session) return;
    const notes: string[] = [];
    const pick = this.makePick(true, notes);
    if (!pick) {
      this.setupError = ["Your faction is too big to send online, even without its unit pictures. Pick another faction."];
      return this.render();
    }
    const sent = wire(pick);
    const r = agree(this.offer, sent);
    if (!r.ok) {
      dropNetFactions();
      if (r.side === 0) return this.fail(`The host's game can't be played here: ${r.problems.join(" ")}`);
      this.setupError = r.problems;
      return this.render();
    }
    this.setupError = [];
    this.refused = [];
    this.game = r.game;
    this.notes = [...notes, ...r.game.notes.slice(0, 3)];
    void this.session.sendLobby(sent);
    this.go("summary");
  }

  private onOffered(setup: GameSetup): void {
    if (this.started) return;
    this.offered = setup;
    if (this.screen === "summary") this.render();
  }

  /** The setup the host proposed is exactly the one this summary shows. */
  private offerMatches(setup: GameSetup): boolean {
    return !!this.game && matchesAgreement(setup, this.game);
  }

  // ---------------------------------------------------------------- both

  private async start(): Promise<void> {
    const s = this.session;
    if (!s || !this.game) return;
    if (this.role === "host") {
      if (this.proposed) return;
      this.proposed = true;
      this.render();
      try {
        await s.proposeSetup(this.game.setup);
      } catch (err) {
        this.fail(`Couldn't start the game: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    if (this.accepted || !this.offered || !this.offerMatches(this.offered)) return;
    this.accepted = true;
    this.render();
    try {
      await s.acceptSetup();
    } catch (err) {
      this.fail(`Couldn't start the game: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async connect(role: Role): Promise<void> {
    this.role = role;
    this.link = "connecting";
    let transport: Transport;
    try {
      transport = await makeTransport();
    } catch (err) {
      return this.fail(`Couldn't go online: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (this.gone) return;
    this.linkLabel = transport.label;
    const s = new PvpSession({ transport, code: this.code, role, build: BUILD });
    this.session = s;
    s.link.add((st) => {
      this.link = st;
      this.updateStatus();
    });
    s.peer.add((p) => {
      this.peer = p;
      this.updateStatus();
    });
    s.paired.add(() => {
      this.problem = "";
      if (role === "host" && this.offer) void s.sendLobby(this.offer);
      if (this.screen === "host-wait") this.render();
      else this.updateStatus();
    });
    s.problem.add((p) => {
      if (this.started) return;
      this.problem = p;
      this.updateStatus();
    });
    s.lobby.add((d) => (role === "host" ? this.onHostLobby(d) : this.onGuestLobby(d)));
    s.setupOffered.add((setup) => this.onOffered(setup));
    s.started.add(({ setup }) => {
      if (this.gone || this.started) return;
      this.started = true;
      this.gone = true;
      this.opts.onStart(s, setup, new NetOpponent(s));
    });
    if (role === "host" && this.offer) void s.sendLobby(this.offer); // sent as soon as we pair
    try {
      await s.start();
      this.link = transport.status;
      this.updateStatus();
    } catch (err) {
      console.warn("Couldn't join the relays:", err);
      this.fail(
        LOCAL
          ? "Couldn't open the channel between tabs."
          : `Couldn't reach the relay servers (${RELAYS.join(", ")}). Check your internet connection, then try again.`,
      );
    }
  }

  /** Something went wrong (or the other player left): close the session and say so. */
  private fail(message: string): void {
    if (this.gone) return;
    this.failure = message;
    const s = this.session;
    this.session = null;
    s?.close();
    dropNetFactions();
    this.go("failed");
  }

  /** Leave the lobby (telling the other player, if there is one) and go back to the menu. */
  private async backOut(): Promise<void> {
    if (this.gone) return;
    this.gone = true;
    const s = this.session;
    this.session = null;
    if (s) {
      if (s.isPaired) await Promise.race([s.sendLobby({ v: LOBBY_VERSION, kind: "bye" }).catch(() => {}), sleep(400)]);
      s.close();
    }
    dropNetFactions();
    this.opts.onExit();
  }
}

/** Open the lobby in `host` (the overlay). */
export function openLobby(host: HTMLElement, opts: LobbyOptions): void {
  new Lobby(host, opts).open();
}
