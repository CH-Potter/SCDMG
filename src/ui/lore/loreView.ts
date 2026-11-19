// The lore pages: the Dustline, each built-in faction, and the places and battles of the war. A modal
// layer of its own (above the menu or the faction forge, which stay as they were underneath), with
// keyboard tabs, Esc to close and focus kept inside while it is open.

import "./lore.css";
import {
  BATTLES,
  LORE_FACTIONS,
  LORE_FACTION_IDS,
  PLACES,
  WORLD,
  battlesAt,
  battlesFor,
  charactersOf,
  leaderOf,
  placeById,
  type FactionLore,
  type LoreBattle,
  type LoreCharacter,
  type LoreFactionId,
  type LorePlace,
} from "../../engine/data/lore";
import { FACTIONS, PROFILES, SUPPORTS } from "../../engine/data/factions";
import { MAPS } from "../../engine/data/maps";
import { MISSIONS } from "../../engine/data/missions";
import { factionEmblemSvg, wordmarkSvg } from "../art/emblems";
import { figureDataUrl, figureSpec } from "../art/figures";
import { rigPortraitFit } from "../art/rigPortrait";
import { esc } from "../describe";
import { maybeFactionIntro, playIntro, type LoreTab } from "../loreLinks";
import { drawMapPreview } from "../previews";

const TABS: { id: LoreTab; label: () => string }[] = [
  { id: "world", label: () => `<span aria-hidden="true">🏜</span> The Dustline` },
  ...LORE_FACTION_IDS.map((id) => ({ id: id as LoreTab, label: () => `${factionEmblemSvg(id, 26)}${esc(LORE_FACTIONS[id].name)}` })),
  { id: "places", label: () => `<span aria-hidden="true">🗺</span> Places &amp; battles` },
];

const ACT_NAMES: Record<LoreBattle["act"], string> = { 1: "Act I: The Muster", 2: "Act II: The War Spreads", 3: "Act III: The Wellspring" };

const NEUTRAL_BASE = 0x9a8f80;

const factionName = (id: LoreFactionId | null): string => (id ? LORE_FACTIONS[id].name : "Nobody (yet)");

function miniImg(unitId: string, px: number, alt = ""): string {
  return `<img class="lore-mini" data-unit="${esc(unitId)}" data-px="${px}" width="${px}" height="${px}" alt="${esc(alt)}" />`;
}

/** Paint miniature placeholders a few per frame, so the page opens at once. */
function hydrate(root: HTMLElement): void {
  const imgs = [...root.querySelectorAll<HTMLImageElement>("img.lore-mini:not([src])")];
  const step = () => {
    if (!root.isConnected) return;
    const t0 = performance.now();
    while (imgs.length && performance.now() - t0 < 14) {
      const img = imgs.shift()!;
      const p = PROFILES[img.dataset.unit ?? ""];
      if (!p) continue;
      try {
        const px = Number(img.dataset.px) || 72;
        // the new miniature (Ink Rig) on a neutral base; Classic only for units without new art
        const rig = rigPortraitFit(p.id, px, { team: NEUTRAL_BASE, base: true });
        if (rig) {
          img.src = rig.url;
          img.classList.add("rig");
        } else {
          const f = FACTIONS[p.faction]!;
          img.src = figureDataUrl(figureSpec(p, f.look, f.color), NEUTRAL_BASE, px);
        }
      } catch {
        /* leave it blank */
      }
    }
    if (imgs.length) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function drawPreviews(root: HTMLElement): void {
  requestAnimationFrame(() => {
    root.querySelectorAll<HTMLCanvasElement>("canvas[data-map]").forEach((c) => {
      const m = MAPS[c.dataset.map ?? ""];
      if (m) drawMapPreview(c, m);
    });
  });
}

// ---------------------------------------------------------------- pages

function characterCard(c: LoreCharacter, lead = false): string {
  const pic = c.unitId ? miniImg(c.unitId, lead ? 120 : 80, PROFILES[c.unitId]?.name ?? "") : `<span class="lore-badge">${factionEmblemSvg(c.faction ?? "", lead ? 96 : 64)}</span>`;
  const where = c.supportId ? SUPPORTS[c.supportId]?.name : c.unitId ? PROFILES[c.unitId]?.name : undefined;
  return `<article class="lore-char ${lead ? "lead" : ""}">
    <div class="lore-char-pic">${pic}</div>
    <div>
      <h4>${esc(c.name)}${lead ? ` <span class="tag">Leader</span>` : ""}</h4>
      <p class="lore-role">${esc(c.title)}${where ? ` · <span class="hint">${c.supportId ? "support card" : "on the table"}: ${esc(where)}</span>` : ""}</p>
      <p>${esc(c.bio)}</p>
      ${c.quote ? `<blockquote>“${esc(c.quote)}”</blockquote>` : ""}
    </div>
  </article>`;
}

function battleRow(b: LoreBattle, showPlace = true): string {
  const place = placeById(b.placeId);
  const mission = MISSIONS[b.missionId];
  const map = MAPS[b.mapId];
  return `<li class="lore-battle">
    <span class="lore-sides">${factionEmblemSvg(b.sides[0], 26)}<i>vs</i>${factionEmblemSvg(b.sides[1], 26)}</span>
    <div><b>${esc(b.title)}</b> <span class="hint">${showPlace && place ? `${esc(place.name)} · ` : ""}${esc(mission?.name ?? b.missionId)}${map && map.name !== place?.name ? ` on ${esc(map.name)}` : ""}</span>
    <p>${esc(b.hook)}</p></div></li>`;
}

function worldPage(): string {
  const leaders = LORE_FACTION_IDS.map((id) => {
    const f = LORE_FACTIONS[id];
    const l = leaderOf(id);
    return `<button class="lore-side pick" data-faction="${id}" data-goto="${id}">
      <span class="lore-side-head">${factionEmblemSvg(id, 52)}<span><b>${esc(f.name)}</b><span class="hint">${esc(f.epithet)}</span></span></span>
      <span class="lore-side-led">Led by <b>${esc(l.name)}</b></span>
      <span class="lore-side-goal">${esc(f.goal)}</span>
      <span class="lore-more">Read more ›</span>
    </button>`;
  }).join("");
  return `
    <section class="lore-hero lore-world-hero">
      <div class="lore-hero-text">
        <p class="lore-kicker">The setting</p>
        <h2>${esc(WORLD.name)}</h2>
        <p class="lore-lead">${esc(WORLD.summary)}</p>
        <button class="big" data-intro="game">▶ Watch the intro</button>
      </div>
      <div class="lore-hero-art" aria-hidden="true">${wordmarkSvg()}</div>
    </section>
    <div class="lore-cols">
      <section class="panel lore-box"><h3>${esc(WORLD.prize.name)}</h3><p>${esc(WORLD.prize.text)}</p></section>
      <section class="panel lore-box"><h3>${esc(WORLD.conflict.name)}</h3><p>${esc(WORLD.conflict.text)}</p></section>
    </div>
    <h3 class="lore-h">Three sides</h3>
    <div class="lore-sides-grid">${leaders}</div>
    <h3 class="lore-h">How we got here</h3>
    <ol class="lore-timeline">${WORLD.history
      .map((e) => `<li><span class="lore-when">${esc(e.when)}</span><div><b>${esc(e.title)}</b><p>${esc(e.text)}</p></div></li>`)
      .join("")}</ol>`;
}

function factionPage(f: FactionLore): string {
  const id = f.factionId;
  const leader = leaderOf(id);
  const others = charactersOf(id).filter((c) => c.id !== leader.id);
  const home = placeById(f.homeId);
  const held = PLACES.filter((p) => p.heldBy === id && p.id !== f.homeId);
  const units = f.units
    .map((u) => {
      const p = PROFILES[u.id];
      if (!p) return "";
      return `<article class="lore-unit">${miniImg(u.id, 72, p.name)}<div><b>${esc(p.name)}</b>${p.structure ? ` <span class="tag">structure</span>` : ""}<p>${esc(u.note)}</p></div></article>`;
    })
    .join("");
  const supports = f.supports
    .map((s) => {
      const sp = SUPPORTS[s.id];
      return sp ? `<li><b>${esc(sp.name)}</b>: ${esc(s.note)}</li>` : "";
    })
    .join("");
  return `
    <section class="lore-hero panel" data-faction="${id}">
      <div class="lore-hero-emblem">${factionEmblemSvg(id, 112)}</div>
      <div class="lore-hero-text">
        <p class="lore-kicker">${esc(f.epithet)}</p>
        <h2>${esc(f.name)}</h2>
        <p class="lore-tagline">${esc(f.tagline)}</p>
        <button class="big" data-intro="${id}">▶ Play the intro</button>
      </div>
    </section>
    <div class="lore-cols wide-left">
      <section class="lore-story">
        ${f.story.map((p) => `<p>${esc(p)}</p>`).join("")}
        <div class="lore-cols tight">
          <div class="panel lore-box"><h3>What they want</h3><p>${esc(f.goal)}</p></div>
          <div class="panel lore-box"><h3>What's at stake</h3><p>${esc(f.stakes)}</p></div>
        </div>
      </section>
      <aside class="lore-people">
        ${characterCard(leader, true)}
        ${others.map((c) => characterCard(c)).join("")}
      </aside>
    </div>
    <h3 class="lore-h">Who's who on the table</h3>
    <div class="lore-units">${units}</div>
    <h3 class="lore-h">Support cards</h3>
    <ul class="lore-supports">${supports}</ul>
    <h3 class="lore-h">Where they fight</h3>
    <p>${home ? `Home: <b>${esc(home.name)}</b>. ${esc(home.blurb)}` : ""}</p>
    ${held.length ? `<p class="hint">Also holding: ${held.map((p) => `<button class="linkish" data-goto="places" data-place="${esc(p.id)}">${esc(p.name)}</button>`).join(", ")}.</p>` : ""}
    <ul class="lore-battles">${battlesFor(id)
      .map((b) => battleRow(b))
      .join("")}</ul>`;
}

function placeCard(p: LorePlace): string {
  const map = p.mapId ? MAPS[p.mapId] : undefined;
  const battles = battlesAt(p.id);
  return `<article class="lore-place panel ${map ? "has-map" : ""}" id="lore-place-${esc(p.id)}" ${p.heldBy ? `data-faction="${p.heldBy}"` : ""}>
    ${map ? `<div class="lore-place-map"><canvas class="preview" data-map="${esc(map.id)}" aria-label="Battlefield preview: ${esc(map.name)}" role="img"></canvas></div>` : ""}
    <div class="lore-place-text">
    <h4>${esc(p.name)}</h4>
    <p class="hint">${map ? `Battlefield: ${esc(map.name)} (${esc(map.mode)})` : esc(p.kind[0]!.toUpperCase() + p.kind.slice(1))} · Held by: ${esc(factionName(p.heldBy))}</p>
    <p>${esc(p.blurb)}</p>
    ${battles.length ? `<p class="lore-place-battles">${battles.map((b) => `⚔ ${esc(b.title)}`).join("<br>")}</p>` : ""}
    </div>
  </article>`;
}

function placesPage(): string {
  const acts = ([1, 2, 3] as const)
    .map((a) => `<h4 class="lore-act">${esc(ACT_NAMES[a])}</h4><ul class="lore-battles">${BATTLES.filter((b) => b.act === a)
      .map((b) => battleRow(b))
      .join("")}</ul>`)
    .join("");
  return `
    <section class="lore-intro-text">
      <h2>Places &amp; battles</h2>
      <p class="lore-lead">Every battlefield in the game is somewhere in the Dustline. Here is where, who holds it, and what the war has in store for it.</p>
    </section>
    <h3 class="lore-h">Landmarks</h3>
    <div class="lore-places">${PLACES.filter((p) => !p.mapId)
      .map(placeCard)
      .join("")}</div>
    <h3 class="lore-h">Battlefields</h3>
    <div class="lore-places maps">${PLACES.filter((p) => p.mapId)
      .map(placeCard)
      .join("")}</div>
    <h3 class="lore-h">The Dustline War, battle by battle</h3>
    <p class="hint">A suggested order for the war. Each battle names the battlefield and mission to play it on: pick them in the menu and fight it out.</p>
    ${acts}`;
}

// ---------------------------------------------------------------- the layer

let openLayer: { close: () => void; show: (t: LoreTab) => void } | null = null;

/** Open the lore pages on a tab (or switch tabs if they are already open). */
export function openLore(tab: LoreTab = "world", opts: { onClose?: () => void } = {}): void {
  if (openLayer) {
    openLayer.show(tab);
    return;
  }
  const prevFocus = document.activeElement as HTMLElement | null;
  const layer = document.createElement("div");
  layer.className = "lore-layer";
  layer.innerHTML = `
    <div class="lore-book" role="dialog" aria-modal="true" aria-labelledby="lore-title">
      <header class="lore-head">
        <h1 id="lore-title"><span aria-hidden="true">📖</span> Lore of the Dustline</h1>
        <span class="spacer"></span>
        <button class="secondary" data-close>✕ Close</button>
      </header>
      <div class="lore-tabs" role="tablist" aria-label="Lore sections">${TABS.map(
        (t) => `<button role="tab" class="lore-tab" id="lore-tab-${t.id}" data-tab="${t.id}" aria-controls="lore-page" ${t.id !== "world" && t.id !== "places" ? `data-faction="${t.id}"` : ""}>${t.label()}</button>`,
      ).join("")}</div>
      <div class="lore-page" id="lore-page" role="tabpanel" tabindex="0"></div>
    </div>`;
  document.body.appendChild(layer);
  const page = layer.querySelector<HTMLElement>(".lore-page")!;
  const tabs = [...layer.querySelectorAll<HTMLButtonElement>("[role=tab]")];
  let current: LoreTab = tab;

  const show = (t: LoreTab, placeId?: string) => {
    current = t;
    tabs.forEach((b) => {
      const on = b.dataset.tab === t;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle("selected", on);
    });
    page.setAttribute("aria-labelledby", `lore-tab-${t}`);
    const f = t === "world" || t === "places" ? undefined : LORE_FACTIONS[t as LoreFactionId];
    page.innerHTML = f ? factionPage(f) : t === "places" ? placesPage() : worldPage();
    if (f) page.dataset.faction = f.factionId;
    else delete page.dataset.faction;
    page.scrollTop = 0;
    hydrate(page);
    drawPreviews(page);
    // Viewing a faction for the first time plays its intro on top.
    if (f) maybeFactionIntro(f.factionId);
    if (placeId) {
      requestAnimationFrame(() => {
        const el = page.querySelector<HTMLElement>(`#lore-place-${CSS.escape(placeId)}`);
        el?.scrollIntoView({ block: "start" });
        el?.classList.add("flash");
      });
    }
  };

  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    layer.remove();
    openLayer = null;
    if (prevFocus?.isConnected) prevFocus.focus({ preventScroll: true });
    opts.onClose?.();
  };

  const onKey = (e: KeyboardEvent) => {
    // An intro playing on top handles its own keys.
    if (document.querySelector(".intro-layer:not(.is-closing)")) return;
    if ((e.target as Element | null)?.closest?.(".audio-pop")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    const onTab = (e.target as HTMLElement | null)?.getAttribute?.("role") === "tab";
    if (onTab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const i = tabs.findIndex((b) => b.dataset.tab === current);
      const n = tabs.length;
      const j = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowRight" ? 1 : n - 1)) % n;
      show(tabs[j]!.dataset.tab as LoreTab);
      tabs[j]!.focus();
      return;
    }
    if (e.key === "Tab") {
      // Keep focus inside the dialog.
      const items = [...layer.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), [tabindex="0"], a[href]')].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  layer.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t === layer) return close();
    const btn = t.closest<HTMLElement>("button");
    if (!btn) return;
    if (btn.hasAttribute("data-close")) return close();
    if (btn.dataset.tab) return show(btn.dataset.tab as LoreTab);
    if (btn.dataset.intro) return playIntro(btn.dataset.intro);
    if (btn.dataset.goto) {
      show(btn.dataset.goto as LoreTab, btn.dataset.place);
      layer.querySelector<HTMLElement>(`#lore-tab-${btn.dataset.goto}`)?.focus({ preventScroll: true });
    }
  });
  document.addEventListener("keydown", onKey, true);
  openLayer = { close, show: (t) => show(t) };
  show(tab);
  layer.querySelector<HTMLElement>(`#lore-tab-${tab}`)?.focus({ preventScroll: true });
}

/** Close the lore pages if they are open. */
export const closeLore = (): void => openLayer?.close();

