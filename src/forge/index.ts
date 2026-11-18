// Faction forge: a full-screen editor for custom factions. Built-in factions can be viewed and copied,
// never edited. Custom factions are validated live, saved to browser storage, and registered with the
// engine on save, so the game sees them straight away.

import "./forge.css";
import { ABILITIES } from "../engine/data/abilities";
import { BUILT_IN_FACTION_IDS, FACTIONS } from "../engine/data/factions";
import { showLore } from "../ui/loreLinks";
import { EFFECT_KINDS, entryCostIn, factionProblems, KEYWORDS, LIMITS, TRAITS, starterStats, type StarterStats, EVADE_CONDITIONS } from "../engine/data/factionValidation";
import type { ModeId } from "../engine/data/modes";
import type { Faction, Keyword, SupportAbilityDef, SupportDef, SupportEffect, UnitProfile, UpgradeDef, Weapon } from "../engine/types";
import {
  blankFaction,
  clearFactionDraft,
  copyFaction,
  deleteCustomFaction,
  exportable,
  importFaction,
  listCustomFactions,
  loadFactionDraft,
  saveCustomFaction,
  saveFactionDraft,
} from "../ui/customFactions";
import { tokenDataUrl } from "../ui/art/emblems";
import { randomRecipe } from "../ui/art/miniBuilder";
import { PLAYER_COLORS } from "../ui/art/palette";
import { clampCrop, type CropState, decodeUpload, defaultCrop, encodeCrop, renderCrop, type UploadSource } from "../ui/art/upload";
import { MINI_BACKS, MINI_BODIES, MINI_HEADGEAR, MINI_HEADS, MINI_WEAPONS } from "../engine/data/unitArt";
import type { MiniatureRecipe } from "../engine/types";
import { artSectionHtml, hydrateMinis, miniImg, NEUTRAL_BASE, recipeFromProfile, rosterHtml, swapHtml, unitCardHtml } from "./art";
import { esc, KEYWORD_TEXT, TRAIT_TEXT, weaponLine, EVADE_TEXT } from "../ui/describe";
import { downloadJson, pickJsonFile, slug } from "../ui/files";
import {
  addProfile,
  addSupport,
  addUpgrade,
  defaultEffect,
  duplicateProfile,
  EFFECT_INFO,
  effectSummary,
  kindOf,
  newMelee,
  newRanged,
  newSupportAbility,
  removeProfile,
  removeSupport,
  removeUpgrade,
  removeWeapon,
  setImpact,
  setProfileKind,
  type ProfileKind,
} from "./model";

export interface FactionForgeOptions {
  onClose: () => void;
}

/** Open the faction forge full-screen inside `host` (the #overlay element). */
export function openFactionForge(host: HTMLElement, opts: FactionForgeOptions): void {
  new FactionForge(host, opts);
}

type Sel = { kind: "info" } | { kind: "roster" } | { kind: "profile"; id: string } | { kind: "support"; id: string } | { kind: "lists" };
type TeamPick = "neutral" | "0" | "1";

/** An upload being cropped, and the last decoded picture per profile (this session only). */
interface CropSession {
  profileId: string;
  src: UploadSource;
  state: CropState;
}

const LOOK_NAMES: Record<Faction["look"], string> = { cap: "Cap", teeth: "Teeth", crystal: "Crystal", plain: "Plain" };
const KIND_NAMES: Record<ProfileKind, string> = { unit: "Unit", structure: "Structure", summon: "Summon-only" };
const TIMING_NAMES: Record<SupportAbilityDef["timing"], string> = { any: "Any phase", movement: "Movement", assault: "Assault", combat: "Combat" };
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const hex = (n: number) => `#${(Number.isFinite(n) ? Math.max(0, Math.min(0xffffff, Math.round(n))) : 0).toString(16).padStart(6, "0")}`;
/** A number for an input's value attribute ("" for NaN or missing). */
const nv = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A small token in the faction's colour and look: the game's own miniature art, on a neutral base. */
export function tokenSvg(color: number, look: Faction["look"], size = 40): string {
  const n = Math.max(8, Math.min(256, Math.round(Number(size) || 40)));
  const url = tokenDataUrl(color, look, n);
  return `<svg class="ff-token" width="${n}" height="${n}" viewBox="0 0 40 40" aria-hidden="true"><image href="${url}" x="0" y="0" width="40" height="40"/></svg>`;
}

class FactionForge {
  private f: Faction | null = null;
  private readOnly = false;
  private savedJson = "";
  private sel: Sel = { kind: "info" };
  private notes: string[] = [];
  /** Other factions whose ids this one must not reuse (computed when a faction is opened). */
  private otherFactions: Faction[] = [];
  private toastTimer = 0;
  private root!: HTMLElement;
  /** Base colour for the large previews. */
  private team: TeamPick = "neutral";
  private crop: CropSession | null = null;
  private readonly uploads = new Map<string, { src: UploadSource; state: CropState }>();
  private hydrateQueued = false;
  private lastNav = "";
  private lastSide = "";
  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.root.isConnected) return this.teardown();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && this.f && !this.readOnly) {
      e.preventDefault();
      this.save();
    }
  };

  constructor(
    private readonly host: HTMLElement,
    private readonly opts: FactionForgeOptions,
  ) {
    host.classList.add("show", "ff-open");
    window.addEventListener("keydown", this.onKey);
    this.renderLibrary();
  }

  // ---------- state helpers ----------

  private get dirty(): boolean {
    return !!this.f && !this.readOnly && JSON.stringify(this.f) !== this.savedJson;
  }

  private open(f: Faction, readOnly: boolean, saved: boolean, notes: string[] = []): void {
    this.f = f;
    this.readOnly = readOnly;
    this.savedJson = saved ? JSON.stringify(f) : "";
    this.sel = readOnly ? { kind: "roster" } : { kind: "info" };
    this.notes = notes;
    this.crop = null;
    this.uploads.clear();
    const builtIns = BUILT_IN_FACTION_IDS.map((id) => FACTIONS[id]).filter((x): x is Faction => !!x);
    this.otherFactions = readOnly ? builtIns : [...builtIns, ...listCustomFactions().filter((x) => x.id !== f.id)];
    this.renderEditor();
    if (!readOnly && !saved) saveFactionDraft(f);
  }

  private confirmLeave(): boolean {
    if (!this.dirty) return true;
    if (!confirm(`Discard your unsaved changes to "${this.f!.name}"?`)) return false;
    clearFactionDraft();
    return true;
  }

  private teardown(): void {
    window.removeEventListener("keydown", this.onKey);
    clearTimeout(this.toastTimer);
    this.host.classList.remove("ff-open");
  }

  private close(): void {
    // Unsaved work stays in the draft, so nothing is lost by leaving.
    if (this.dirty && this.f) saveFactionDraft(this.f);
    this.teardown();
    this.host.innerHTML = "";
    this.host.classList.remove("show");
    this.opts.onClose();
  }

  private toast(msg: string, bad = false): void {
    const el = this.root.querySelector<HTMLElement>(".ff-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("bad", bad);
    el.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove("show"), 4000);
  }

  // ---------- library ----------

  private renderLibrary(): void {
    this.f = null;
    const custom = listCustomFactions();
    const draft = loadFactionDraft();
    const card = (f: Faction, buttons: string) => {
      const units = f.profiles.filter((p) => !p.structure).length;
      const structures = f.profiles.length - units;
      return `<div class="ff-libcard">
        <div class="ff-libcard-head">${tokenSvg(f.color, f.look, 44)}<div><b>${esc(f.name)}</b><div class="hint">${plural(units, "unit")} · ${plural(structures, "structure")} · ${plural(f.supports.length, "support")}</div></div></div>
        <p>${esc(f.blurb) || `<i class="hint">No blurb yet.</i>`}</p>
        <div class="ff-strip">${f.profiles
          .slice(0, 6)
          .map((p) => miniImg(f.id, p.id, 40))
          .join("")}</div>
        <div class="row">${buttons}</div>
      </div>`;
    };
    this.host.innerHTML = `
      <div class="ff ff-lib" role="application" aria-label="Faction forge">
        <header class="ff-top">
          <span class="ff-logo">Faction forge</span>
          <span class="hint">Make your own faction: units, structures, supports and starter lists.</span>
          <span class="spacer"></span>
          <button class="secondary" data-act="import" title="Load a faction from a .json file">Import…</button>
          <button class="secondary" data-act="close">Close</button>
        </header>
        <main class="ff-libbody">
          <section class="panel">
            <h2>Start something new</h2>
            <p class="hint">Built-in factions are read-only. View one, or copy it as a starting point.</p>
            <div class="ff-libgrid">
              ${BUILT_IN_FACTION_IDS.map((id) => FACTIONS[id])
                .filter((f): f is Faction => !!f)
                .map((f) =>
                  card(
                    f,
                    `<button class="mini secondary" data-act="view" data-id="${esc(f.id)}">View</button><button class="mini" data-act="copy" data-id="${esc(f.id)}">Copy</button><button class="mini secondary" data-act="lore" data-id="${esc(f.id)}" title="Read this faction's story">📖 Lore</button>`,
                  ),
                )
                .join("")}
              <div class="ff-libcard ff-blank">
                <div class="ff-libcard-head">${tokenSvg(0xfff6e6, "plain", 44)}<div><b>Blank faction</b><div class="hint">One basic squad to get going</div></div></div>
                <p>Start from scratch with your own units, structures and supports.</p>
                <div class="row"><button class="mini" data-act="blank">New blank faction</button></div>
              </div>
            </div>
          </section>
          ${
            draft
              ? `<section class="panel ff-draft"><b>Unsaved draft:</b> ${esc(draft.name || "Untitled")} <span class="spacer"></span>
                <button class="mini" data-act="resume">Resume</button><button class="mini secondary danger" data-act="dropDraft">Discard</button></section>`
              : ""
          }
          <section class="panel">
            <h2>Your factions</h2>
            ${
              custom.length
                ? `<div class="ff-libgrid">${custom
                    .map((f) =>
                      card(
                        f,
                        `<button class="mini" data-act="edit" data-id="${esc(f.id)}">Edit</button>
                         <button class="mini secondary" data-act="copy" data-id="${esc(f.id)}">Copy</button>
                         <button class="mini secondary" data-act="export" data-id="${esc(f.id)}">Export</button>
                         <button class="mini secondary danger" data-act="delete" data-id="${esc(f.id)}">Delete</button>`,
                      ),
                    )
                    .join("")}</div>`
                : `<p class="hint">None yet. Copy a built-in faction, start a blank one, or import a file.</p>`
            }
          </section>
        </main>
        <div class="ff-toast" role="status" aria-live="polite"></div>
      </div>`;
    this.root = this.host.querySelector(".ff")!;
    this.root.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
      if (b) this.libraryAction(b.dataset.act!, b.dataset.id ?? "");
    });
    this.hydrateSoon();
  }

  private libraryAction(act: string, id: string): void {
    switch (act) {
      case "close":
        return this.close();
      case "import":
        return void this.importFile();
      case "lore":
        return showLore(id);
      case "view": {
        const f = FACTIONS[id];
        if (f) this.open(structuredClone(f), true, true);
        return;
      }
      case "copy": {
        const src = listCustomFactions().find((f) => f.id === id) ?? ((BUILT_IN_FACTION_IDS as readonly string[]).includes(id) ? FACTIONS[id] : undefined);
        if (src) this.startCopy(src);
        return;
      }
      case "blank":
        return this.open(blankFaction(), false, false);
      case "resume": {
        const d = loadFactionDraft();
        if (!d) return;
        const saved = listCustomFactions().find((f) => f.id === d.id);
        this.open(d, false, false);
        if (saved) this.savedJson = JSON.stringify(stripCustom(saved));
        return this.refreshLive();
      }
      case "dropDraft":
        if (!confirm("Discard the unsaved draft?")) return;
        clearFactionDraft();
        return this.renderLibrary();
      case "edit": {
        const f = listCustomFactions().find((x) => x.id === id);
        if (f) this.open(stripCustom(f), false, true);
        return;
      }
      case "export": {
        const f = listCustomFactions().find((x) => x.id === id);
        if (f) downloadJson(`scdmg-faction-${slug(f.name)}`, exportable(f));
        return;
      }
      case "delete": {
        const f = listCustomFactions().find((x) => x.id === id);
        if (!f || !confirm(`Delete "${f.name}"? This can't be undone. Saved army lists for it will stop working.`)) return;
        deleteCustomFaction(id);
        this.renderLibrary();
        return this.toast(`Deleted "${f.name}".`);
      }
    }
  }

  private startCopy(src: Faction): void {
    if (!this.confirmLeave()) return;
    const f = copyFaction(src, `${src.name} copy`.slice(0, 40));
    this.open(f, false, false);
    this.toast(`Copied "${src.name}". Rename it, change what you like, then save.`);
  }

  private async importFile(): Promise<void> {
    let raw: unknown;
    try {
      raw = await pickJsonFile();
    } catch (err) {
      return this.toast(`Couldn't import: ${(err as Error).message}`, true);
    }
    const r = importFaction(raw);
    if (!r.faction) return this.toast(`Couldn't import: ${r.problems.join(" ")}`, true);
    if (!this.confirmLeave()) return;
    this.open(r.faction, false, false, r.notes);
    const bits = [`Imported "${r.faction.name}"`];
    if (r.renamed) bits.push("with a fresh id");
    bits.push(r.problems.length ? `${plural(r.problems.length, "problem")} to fix before saving` : "save it to keep it");
    this.toast(bits.join(", "), r.problems.length > 0);
  }

  // ---------- editor ----------

  private renderEditor(): void {
    this.host.innerHTML = `
      <div class="ff ff-edit ${this.readOnly ? "ro" : ""}" role="application" aria-label="Faction forge">
        <header class="ff-top">
          <span class="ff-logo">Faction forge</span>
          <span class="ff-title" id="ff-title"></span>
          ${this.readOnly ? `<span class="chip">Built-in · read only</span>` : `<span class="ff-saved" id="ff-saved"></span>`}
          <span class="spacer"></span>
          <button class="secondary" data-act="library" title="Back to all factions">All factions</button>
          ${
            this.readOnly
              ? `<button data-act="copyThis">Copy to edit</button>`
              : `<button class="secondary" data-act="import" title="Load a faction from a .json file">Import…</button>
                 <button class="secondary" data-act="export" title="Download this faction as a .json file">Export</button>
                 <button data-act="save" title="Save to your factions (Ctrl+S)">Save</button>`
          }
          <button class="secondary" data-act="close">Close</button>
        </header>
        <nav class="ff-nav panel" id="ff-nav"></nav>
        <main class="ff-main panel" id="ff-main"></main>
        <aside class="ff-side" id="ff-side"></aside>
        <div class="ff-toast" role="status" aria-live="polite"></div>
      </div>`;
    this.root = this.host.querySelector(".ff")!;
    this.root.addEventListener("click", (e) => this.onClick(e));
    this.root.addEventListener("input", (e) => this.onInput(e));
    this.root.addEventListener("change", (e) => this.onChange(e));
    this.root.addEventListener("dragover", (e) => {
      if (this.readOnly || this.sel.kind !== "profile" || !(e.target as HTMLElement).closest("[data-drop]")) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    });
    this.root.addEventListener("drop", (e) => {
      if (this.readOnly || this.sel.kind !== "profile" || !(e.target as HTMLElement).closest("[data-drop]")) return;
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) void this.beginUpload(file);
    });
    this.renderMain();
    this.refreshLive();
  }

  // ---------- miniature previews ----------

  /** Find a profile for a preview ref ("factionId|profileId"): the open faction first, then saved ones. */
  private lookupFor(): (ref: string) => { f: Faction; p: UnitProfile } | null {
    let saved: Faction[] | null = null; // read from storage at most once per pass
    return (ref) => {
      const bar = ref.indexOf("|");
      const fid = ref.slice(0, bar);
      const pid = ref.slice(bar + 1);
      const f = this.f && this.f.id === fid ? this.f : (FACTIONS[fid] ?? (saved ??= listCustomFactions()).find((x) => x.id === fid));
      const p = f?.profiles.find((x) => x.id === pid);
      return f && p ? { f, p } : null;
    };
  }

  private teamColor(): number {
    return this.team === "neutral" ? NEUTRAL_BASE : PLAYER_COLORS[this.team === "0" ? 0 : 1];
  }

  /** Fill in previews on the next frame (coalesces bursts of typing or colour dragging). */
  private hydrateSoon(): void {
    if (this.hydrateQueued) return;
    this.hydrateQueued = true;
    requestAnimationFrame(() => {
      this.hydrateQueued = false;
      if (this.root?.isConnected) hydrateMinis(this.root, this.lookupFor(), this.teamColor());
    });
  }

  /** Re-render the form, keeping scroll position and focus. */
  private renderMain(): void {
    const main = this.root.querySelector<HTMLElement>("#ff-main")!;
    const scroll = main.scrollTop;
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active && main.contains(active) ? focusKeyOf(active) : null;
    swapHtml(main, this.mainHtml());
    if (this.readOnly) {
      main.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>("input, select, textarea, button:not([data-keep])").forEach((el) => {
        el.disabled = true;
      });
    }
    main.scrollTop = scroll;
    if (focusKey) {
      const el = [...main.querySelectorAll<HTMLElement>("[data-path], [data-toggle], [data-act], [data-on]")].find((x) => focusKeyOf(x) === focusKey);
      el?.focus({ preventScroll: true });
    }
    this.bindCrop();
    this.hydrateSoon();
  }

  /** Update everything that doesn't hold focus: title, nav, problems, previews. Cheap enough to run on every keystroke. */
  private refreshLive(): void {
    const f = this.f!;
    const problems = factionProblems(f, { others: this.otherFactions });
    this.root.querySelector("#ff-title")!.innerHTML = `${tokenSvg(f.color, f.look, 30)} ${esc(f.name || "Untitled")}`;
    const saved = this.root.querySelector("#ff-saved");
    if (saved) {
      saved.textContent = this.dirty ? (this.savedJson ? "Unsaved changes" : "Not saved yet") : "Saved";
      saved.classList.toggle("ok", !this.dirty);
    }
    const nav = this.root.querySelector<HTMLElement>("#ff-nav")!;
    const navHtml = this.navHtml(problems);
    if (navHtml !== this.lastNav || !nav.firstChild) {
      const navScroll = nav.scrollTop;
      swapHtml(nav, navHtml);
      nav.scrollTop = navScroll;
      this.lastNav = navHtml;
    }
    const side = this.root.querySelector<HTMLElement>("#ff-side")!;
    const sideHtml = this.sideHtml(problems);
    if (sideHtml !== this.lastSide || !side.firstChild) {
      swapHtml(side, sideHtml);
      this.lastSide = sideHtml;
    }
    this.hydrateSoon();
    // live previews inside the form
    this.root.querySelectorAll<HTMLElement>("[data-preview]").forEach((el) => {
      const [kind, path] = el.dataset.preview!.split("|") as [string, string];
      const v = getPath(f, path);
      if (kind === "weapon" && v) el.textContent = weaponLine(v as Weapon);
      if (kind === "effect" && v) el.textContent = effectSummary(v as SupportEffect, f);
    });
    if (this.dirty) saveFactionDraft(f);
  }

  private select(sel: Sel): void {
    this.sel = sel;
    this.crop = null;
    this.root.querySelector<HTMLElement>("#ff-main")!.scrollTop = 0;
    this.renderMain();
    this.refreshLive();
  }

  // ---------- nav and side panels ----------

  private navHtml(problems: string[]): string {
    const f = this.f!;
    const count = (name: string) => problems.filter((p) => p.startsWith(`${name}:`) || p.startsWith(`${name},`)).length;
    const dot = (n: number) => (n ? `<span class="ff-dot" title="${plural(n, "problem")}">${n}</span>` : "");
    const item = (sel: Sel, label: string, extra = "", n = 0) => {
      const on =
        this.sel.kind === sel.kind && (!("id" in sel) || ("id" in this.sel && this.sel.id === sel.id)) ? "selected" : "";
      const data = "id" in sel ? `data-id="${esc(sel.id)}"` : "";
      return `<button class="ff-navitem ${on}" data-act="nav" data-sel="${sel.kind}" ${data}><span class="ff-navlabel">${label}</span>${extra}${dot(n)}</button>`;
    };
    const listProblems = problems.filter((p) => /starter|extras?/i.test(p.split(":")[0] ?? "")).length;
    const infoProblems = problems.filter((p) => p.startsWith("Faction:")).length;
    return `
      ${item({ kind: "info" }, "Faction info", "", infoProblems)}
      ${item({ kind: "roster" }, this.readOnly ? "Codex: all units" : "Roster gallery")}
      <h3>Units &amp; structures</h3>
      ${f.profiles
        .map((p, i) =>
          item(
            { kind: "profile", id: p.id },
            `${miniImg(f.id, p.id, 30, "ff-navmini")}${esc(p.name || `Unit #${i + 1}`)}`,
            `<span class="ff-kind ${kindOf(p)}">${KIND_NAMES[kindOf(p)]}</span>`,
            count(p.name || `Unit #${i + 1}`),
          ),
        )
        .join("")}
      <div class="ff-navadd">
        <button class="mini secondary" data-act="addProfile" data-kind="unit" title="Add a unit">+ Unit</button>
        <button class="mini secondary" data-act="addProfile" data-kind="structure" title="A structure bought in the list">+ Structure</button>
        <button class="mini secondary" data-act="addProfile" data-kind="summon" title="A structure only made by a summon support">+ Summon</button>
      </div>
      <h3>Supports</h3>
      ${f.supports.map((s, i) => item({ kind: "support", id: s.id }, esc(s.name || `Support #${i + 1}`), `<span class="ff-kind">✦${nv(s.fizz)}</span>`, count(s.name || `Support #${i + 1}`))).join("")}
      ${f.supports.length ? "" : `<p class="hint">No supports yet.</p>`}
      <div class="ff-navadd"><button class="mini secondary" data-act="addSupport">+ Support</button></div>
      <h3>Lists</h3>
      ${item({ kind: "lists" }, "Starter lists", "", listProblems)}`;
  }

  private sideHtml(problems: string[]): string {
    const f = this.f!;
    const shown = problems.slice(0, 40);
    const checks = `<section class="panel ff-checks">
        <h3>Checks ${problems.length ? `<span class="ff-dot">${problems.length}</span>` : ""}</h3>
        ${
          problems.length
            ? `${shown.map((p) => `<div class="problem">⚠ ${esc(p)}</div>`).join("")}${problems.length > shown.length ? `<p class="hint">…and ${problems.length - shown.length} more.</p>` : ""}`
            : `<div class="ok">✓ Ready to ${this.readOnly ? "play" : "save and play"}</div>`
        }
        ${this.notes.length ? `<h3>Import notes</h3>${this.notes.slice(0, 20).map((n) => `<div class="hint">• ${esc(n)}</div>`).join("")}` : ""}
      </section>`;
    let preview = "";
    if (this.sel.kind === "profile") {
      const p = this.profile();
      if (p && !this.readOnly) preview = `<section class="panel"><h3>Unit card</h3>${unitCardHtml(f, p, { stage: 200, teamPicker: true, team: this.team })}</section>`;
    } else if (this.sel.kind === "support") {
      const s = this.support();
      if (s) preview = `<section class="panel"><h3>Support card</h3>${supportCard(s, f)}</section>`;
    }
    const stats = (["skirmish", "assault"] as ModeId[]).map((m) => starterStats(f, m));
    const summary = `<section class="panel ff-summary"><h3>Starter armies</h3>${stats.map((s) => statsLine(s)).join("")}</section>`;
    return checks + preview + summary;
  }

  private profile(): UnitProfile | undefined {
    const sel = this.sel;
    return sel.kind === "profile" ? this.f!.profiles.find((p) => p.id === sel.id) : undefined;
  }

  private support(): SupportDef | undefined {
    const sel = this.sel;
    return sel.kind === "support" ? this.f!.supports.find((s) => s.id === sel.id) : undefined;
  }

  // ---------- main form ----------

  private mainHtml(): string {
    const f = this.f!;
    const banner = this.readOnly
      ? `<div class="ff-banner">This is a built-in faction, so it can't be changed. <button class="mini" data-act="copyThis" data-keep="1">Copy it to make your own</button></div>`
      : "";
    switch (this.sel.kind) {
      case "info":
        return banner + this.infoHtml(f);
      case "roster":
        return banner + rosterHtml(f, this.readOnly) + (this.readOnly && f.supports.length ? `<h3>Supports</h3><div class="ff-roster wide">${f.supports.map((s) => supportCard(s, f)).join("")}</div>` : "");
      case "profile": {
        const p = this.profile();
        if (p && this.readOnly) return banner + `<div class="ff-codex">${unitCardHtml(f, p, { stage: 260, teamPicker: true, team: this.team })}</div>`;
        return banner + (p ? this.profileHtml(f, p) : `<p class="hint">Pick something on the left.</p>`);
      }
      case "support": {
        const s = this.support();
        return banner + (s ? this.supportHtml(f, s) : `<p class="hint">Pick something on the left.</p>`);
      }
      case "lists":
        return banner + this.listsHtml(f);
    }
  }

  private infoHtml(f: Faction): string {
    return `
      <h2>Faction info</h2>
      <div class="ff-grid wide">
        ${textField("Name", "name", f.name, LIMITS.nameLength)}
        <label class="ff-field"><span>Colour</span><span class="ff-color"><input type="color" data-path="color" data-t="c" value="${hex(f.color)}"/><code>${hex(f.color)}</code></span></label>
      </div>
      ${areaField("Blurb", "blurb", f.blurb, "Who are they? What do they want? Keep it short and silly.")}
      <div class="ff-field"><span>Token look</span>
        <div class="ff-looks" role="radiogroup" aria-label="Token look">
          ${(Object.keys(LOOK_NAMES) as Faction["look"][])
            .map(
              (l) => `<button class="ff-look ${f.look === l ? "selected" : ""}" data-act="look" data-look="${l}" role="radio" aria-checked="${f.look === l}">${tokenSvg(f.color, l, 48)}<span>${LOOK_NAMES[l]}</span></button>`,
            )
            .join("")}
        </div>
      </div>
      <p class="hint">Faction id: <code>${esc(f.id)}</code></p>`;
  }

  private profileHtml(f: Faction, p: UnitProfile): string {
    const pi = f.profiles.indexOf(p);
    const base = `profiles.${pi}`;
    const kind = kindOf(p);
    const isStructure = kind !== "unit";
    const summonedBy = f.supports.flatMap((s) => s.abilities.filter((a) => a.effect.kind === "summon" && a.effect.profileId === p.id).map((a) => `${s.name}: ${a.name}`));
    return `
      <div class="ff-mainhead">
        <h2>${esc(p.name || "Unnamed unit")}</h2>
        <span class="spacer"></span>
        <button class="mini secondary" data-act="dupProfile" data-id="${esc(p.id)}">Duplicate</button>
        <button class="mini secondary danger" data-act="delProfile" data-id="${esc(p.id)}">Delete</button>
      </div>
      <div class="ff-seg" role="radiogroup" aria-label="Kind">
        ${(Object.keys(KIND_NAMES) as ProfileKind[])
          .map((k) => `<button class="${k === kind ? "selected" : ""}" data-act="kind" data-kind="${k}" role="radio" aria-checked="${k === kind}">${KIND_NAMES[k]}</button>`)
          .join("")}
      </div>
      <p class="hint">${
        kind === "unit"
          ? "A normal unit, bought in the list and deployed from reserve."
          : kind === "structure"
            ? "A permanent structure: bought in the list, can't move, deploys in your zone (or near your units with field deploy)."
            : `A temporary structure that only a summon support can create. It's free, uses no supply and never appears in lists.${summonedBy.length ? ` Summoned by ${esc(summonedBy.join(", "))}.` : " No support summons it yet."}`
      }</p>
      <h3>Miniature</h3>
      ${artSectionHtml(f, p, { crop: this.crop?.profileId === p.id ? this.crop.state : null, canAdjust: this.uploads.has(p.id) })}
      <div class="ff-grid">
        ${textField("Name", `${base}.name`, p.name, LIMITS.nameLength, "span2")}
        ${numField("Cost ⚙", `${base}.cost`, p.cost, LIMITS.cost)}
        ${numField("Supply ◆", `${base}.supply`, p.supply, LIMITS.supply)}
        ${numField("Models", `${base}.models`, p.models, LIMITS.models)}
        ${numField("Move", `${base}.move`, p.move, LIMITS.move, { step: 0.5, disabled: isStructure, title: isStructure ? "Structures can't move" : "" })}
        ${numField("HP / model", `${base}.hp`, p.hp, LIMITS.hp)}
        ${numField("Shield", `${base}.shield`, p.shield, LIMITS.shield)}
        ${numField("Save (7 = none)", `${base}.armor`, p.armor, LIMITS.armor)}
        ${numField("Base radius", `${base}.baseRadius`, p.baseRadius, LIMITS.baseRadius, { step: 0.05 })}
        ${numField("Nerve (2d6)", `${base}.nerve`, p.nerve, LIMITS.nerve, { opt: true, placeholder: "7", title: "Morale: a unit at half strength or less that takes damage rolls 2d6, and is Shaken above this. Empty means 7. Fearless units never test." })}
        ${
          p.structure
            ? `${selectField("Lifetime", `${base}.structure.lifetime`, p.structure.lifetime, kind === "summon" ? [["round", "End of the round"], ["permanent", "Until destroyed"]] : [["permanent", "Until destroyed"]])}
               ${kind === "structure" ? numField("Field deploy ″", `${base}.structure.fieldDeploy`, p.structure.fieldDeploy, LIMITS.fieldDeploy, { step: 0.5, opt: true, title: "May deploy within this many inches of a friendly non-structure unit. Leave empty for spawn zone only." }) : ""}`
            : ""
        }
      </div>
      <h3>Keywords</h3>
      <div class="ff-chips">${KEYWORDS.map((k) => {
        const locked = k === "structure" || (isStructure && (k === "flying" || k === "jump"));
        return chip(`${base}.keywords`, k, k, p.keywords.includes(k), KEYWORD_TEXT[k] + (locked ? " (set by the kind above)" : ""), locked);
      }).join("")}</div>
      <h3>Weapons</h3>
      ${p.weapons.map((w, i) => this.weaponHtml(`${base}.weapons.${i}`, w, i)).join("") || `<p class="hint">No weapons.</p>`}
      ${
        p.weapons.length < LIMITS.weapons
          ? `<div class="row"><button class="mini secondary" data-act="addWeapon" data-melee="0">+ Ranged weapon</button><button class="mini secondary" data-act="addWeapon" data-melee="1">+ Melee weapon</button></div>`
          : ""
      }
      <h3>Evade</h3>
      <label class="ff-check"><input type="checkbox" data-on="evade" ${p.evade ? "checked" : ""}/> This unit can dodge hits: it rolls one die per hit before armour saves</label>
      ${
        p.evade
          ? `<div class="ff-grid">${numField("Evade on", `${base}.evade.target`, p.evade.target, LIMITS.evade, { title: "Each die at or above this dodges a hit" })}</div>
             <div class="ff-sub">Applies against</div>
             <div class="ff-chips small">${EVADE_CONDITIONS.map((c) => chip(`${base}.evade.against`, c, EVADE_TEXT[c], p.evade!.against.includes(c))).join("")}</div>
             <p class="hint">Tracking on the attacker's weapon cancels successful evades. Point-blank pistol shots can't be evaded.</p>`
          : ""
      }
      ${
        isStructure
          ? ""
          : `<h3>Impact on charge</h3>
             <label class="ff-check"><input type="checkbox" data-on="impact" ${p.impact ? "checked" : ""}/> When this unit charges, each model in base contact rolls impact dice at the charged unit</label>
             ${
               p.impact
                 ? `<div class="ff-grid">
                     ${numField("Dice / model", `${base}.impact.dice`, p.impact.dice, LIMITS.dice)}
                     ${numField("Hits on", `${base}.impact.hit`, p.impact.hit, [2, 6])}
                     ${numField("Damage", `${base}.impact.damage`, p.impact.damage, LIMITS.damage)}
                     ${numField("AP", `${base}.impact.ap`, p.impact.ap, LIMITS.ap)}
                   </div>
                   <p class="hint">Hits get normal saves with this AP.</p>`
                 : ""
             }`
      }
      <h3>Abilities</h3>
      <div class="ff-abilities">${(["passive", "reactive", "active"] as const)
        .map(
          (k) => `<div><h4>${k[0]!.toUpperCase() + k.slice(1)}</h4>${Object.values(ABILITIES)
            .filter((a) => a.kind === k)
            .map(
              (a) => `<label class="ff-ability"><input type="checkbox" data-toggle="${base}.abilities" value="${a.id}" ${p.abilities.includes(a.id) ? "checked" : ""}/>
                <span><b>${esc(a.name)}</b> <small>${esc(a.text)}</small></span></label>`,
            )
            .join("")}</div>`,
        )
        .join("")}</div>
      ${
        kind === "summon"
          ? ""
          : `<h3>Upgrades</h3>
             ${p.upgrades.map((u, i) => this.upgradeHtml(p, `${base}.upgrades.${i}`, u)).join("") || `<p class="hint">No upgrades.</p>`}
             ${p.upgrades.length < LIMITS.upgrades ? `<button class="mini secondary" data-act="addUpgrade">+ Upgrade</button>` : ""}`
      }
      ${areaField("Blurb", `${base}.blurb`, p.blurb, "One funny line about them.")}
      <p class="hint">Unit id: <code>${esc(p.id)}</code></p>`;
  }

  private weaponHtml(path: string, w: Weapon, i: number): string {
    return `<div class="ff-card">
      <div class="ff-cardhead">
        <b>Weapon ${i + 1}</b>
        <span class="hint ff-preview" data-preview="weapon|${path}">${esc(weaponLine(w))}</span>
        <button class="mini secondary danger" data-act="delWeapon" data-index="${i}" title="Remove weapon">✕</button>
      </div>
      <div class="ff-grid">
        ${textField("Name", `${path}.name`, w.name, LIMITS.nameLength, "span2")}
        ${selectField("Type", `${path}.melee`, w.melee ? "1" : "0", [["0", "Ranged"], ["1", "Melee"]], "weaponType")}
        ${w.melee ? "" : numField("Range ″", `${path}.range`, w.range, LIMITS.range, { step: 0.5 })}
        ${numField("Dice / model", `${path}.dice`, w.dice, LIMITS.dice)}
        ${numField("Hits on", `${path}.hit`, w.hit, LIMITS.hit, { title: "Each die at or above this is a hit" })}
        ${numField("Damage", `${path}.damage`, w.damage, LIMITS.damage)}
        ${numField("AP", `${path}.ap`, w.ap, LIMITS.ap)}
        ${selectField("Can hit", `${path}.targets`, w.targets, [["ground", "Ground only"], ["air", "Air only"], ["all", "Ground and air"]])}
        ${numField("Precision", `${path}.precision`, w.precision, LIMITS.precision, { opt: true, placeholder: "0", title: "Move up to this many missed dice into the hits. Precision 1+ also lets ranged weapons shoot into a melee without the misses hitting friends." })}
        ${numField("Tracking", `${path}.tracking`, w.tracking, LIMITS.tracking, { opt: true, placeholder: "0", title: "Cancel up to this many of the target's successful evade rolls" })}
      </div>
      <div class="ff-sub">Traits</div>
      ${traitChips(`${path}.traits`, w.traits ?? [])}
      ${bonusesHtml(`${path}.bonuses`, w.bonuses ?? [])}
    </div>`;
  }

  private upgradeHtml(p: UnitProfile, path: string, u: UpgradeDef): string {
    const isStructure = !!p.structure;
    const w = u.weapon ? p.weapons[u.weapon.index] : undefined;
    const patchRows = () => {
      if (!u.weapon || !w) return "";
      const pp = `${path}.weapon.patch`;
      const patch = u.weapon.patch;
      const row = (field: keyof Weapon, label: string, input: string) =>
        `<div class="ff-patchrow"><label class="ff-check"><input type="checkbox" data-on="patchField" data-path="${pp}" data-field="${field}" ${field in patch ? "checked" : ""}/> ${label}</label>${field in patch ? input : `<span class="hint">${esc(String(w[field] ?? "-"))}</span>`}</div>`;
      return `<div class="ff-patch">
        <div class="hint">Change these stats of ${esc(w.name)}:</div>
        ${row("name", "Name", textInput(`${pp}.name`, patch.name ?? "", LIMITS.nameLength))}
        ${w.melee ? "" : row("range", "Range", numInput(`${pp}.range`, patch.range, LIMITS.range, { step: 0.5 }))}
        ${row("dice", "Dice", numInput(`${pp}.dice`, patch.dice, LIMITS.dice))}
        ${row("hit", "Hits on", numInput(`${pp}.hit`, patch.hit, LIMITS.hit))}
        ${row("damage", "Damage", numInput(`${pp}.damage`, patch.damage, LIMITS.damage))}
        ${row("ap", "AP", numInput(`${pp}.ap`, patch.ap, LIMITS.ap))}
        ${row("targets", "Can hit", selectInput(`${pp}.targets`, patch.targets ?? w.targets, [["ground", "Ground only"], ["air", "Air only"], ["all", "Ground and air"]]))}
        ${row("bonuses", "Bonuses (replace)", bonusesHtml(`${pp}.bonuses`, patch.bonuses ?? []))}
        ${row("traits", "Traits (replace)", traitChips(`${pp}.traits`, patch.traits ?? []))}
      </div>`;
    };
    return `<div class="ff-card">
      <div class="ff-cardhead">
        <b>${esc(u.name || "Upgrade")}</b><code class="hint">${esc(u.id)}</code>
        <span class="spacer"></span>
        <button class="mini secondary danger" data-act="delUpgrade" data-id="${esc(u.id)}" title="Remove upgrade">✕</button>
      </div>
      <div class="ff-grid">
        ${textField("Name", `${path}.name`, u.name, LIMITS.nameLength, "span2")}
        ${numField("Cost ⚙", `${path}.cost`, u.cost, LIMITS.upgradeCost)}
        ${numField("+ Models", `${path}.addModels`, u.addModels, LIMITS.addModels, { opt: true })}
        ${isStructure ? "" : numField("+ Move", `${path}.move`, u.move, LIMITS.upgradeMove, { opt: true, step: 0.5 })}
      </div>
      ${textField("Text shown in the list builder", `${path}.text`, u.text, LIMITS.textLength, "block")}
      <div class="ff-sub">Adds keywords</div>
      <div class="ff-chips small">${KEYWORDS.filter((k) => k !== "structure" && !(isStructure && (k === "flying" || k === "jump")))
        .map((k) => chip(`${path}.addKeywords`, k, k, !!u.addKeywords?.includes(k), KEYWORD_TEXT[k]))
        .join("")}</div>
      <div class="ff-sub">Adds abilities</div>
      <div class="ff-chips small">${Object.values(ABILITIES)
        .map((a) => chip(`${path}.addAbilities`, a.id, a.name, !!u.addAbilities?.includes(a.id), a.text))
        .join("")}</div>
      <div class="ff-grid">
        ${selectField(
          "Weapon change",
          `${path}.weapon`,
          u.weapon ? String(u.weapon.index) : "",
          [["", "None"], ...p.weapons.map((x, i): [string, string] => [String(i), `Change ${x.name || `weapon ${i + 1}`}`])],
          "upgradeWeapon",
          "span2",
        )}
      </div>
      ${patchRows()}
    </div>`;
  }

  private supportHtml(f: Faction, s: SupportDef): string {
    const si = f.supports.indexOf(s);
    const base = `supports.${si}`;
    return `
      <div class="ff-mainhead">
        <h2>${esc(s.name || "Unnamed support")}</h2>
        <span class="spacer"></span>
        <button class="mini secondary danger" data-act="delSupport" data-id="${esc(s.id)}">Delete</button>
      </div>
      <p class="hint">An off-board support: bought with Fizz ✦ in the list. It adds CP to your pool every round, and its abilities spend that CP. Playing an ability is a free action.</p>
      <div class="ff-grid">
        ${textField("Name", `${base}.name`, s.name, LIMITS.nameLength, "span2")}
        ${numField("Fizz cost ✦", `${base}.fizz`, s.fizz, LIMITS.fizz)}
        ${numField("CP per round", `${base}.cp`, s.cp, LIMITS.cp)}
      </div>
      ${areaField("Blurb", `${base}.blurb`, s.blurb, "One funny line about it.")}
      <h3>Abilities</h3>
      ${s.abilities.map((a, i) => this.supportAbilityHtml(f, `${base}.abilities.${i}`, a, i)).join("") || `<p class="hint">Add at least one ability.</p>`}
      ${s.abilities.length < LIMITS.supportAbilities ? `<button class="mini secondary" data-act="addAbility">+ Ability</button>` : ""}
      <p class="hint">Support id: <code>${esc(s.id)}</code></p>`;
  }

  private supportAbilityHtml(f: Faction, path: string, a: SupportAbilityDef, i: number): string {
    const e = a.effect;
    const ep = `${path}.effect`;
    const info = EFFECT_INFO[e.kind];
    let params = "";
    switch (e.kind) {
      case "resources":
        params = numField("Resources", `${ep}.amount`, e.amount, [1, 10]);
        break;
      case "heal":
        params = numField("Heal HP", `${ep}.amount`, e.amount, [1, 10]) + checkField("Revive a lost model first", `${ep}.revive`, !!e.revive);
        break;
      case "blast":
        params =
          numField("Radius ″", `${ep}.radius`, e.radius, [0.5, 6], { step: 0.5 }) +
          numField("Range ″", `${ep}.range`, e.range, LIMITS.range, { step: 0.5 }) +
          numField("Hits on", `${ep}.hit`, e.hit, [2, 6]) +
          numField("Damage", `${ep}.damage`, e.damage, LIMITS.damage) +
          numField("AP", `${ep}.ap`, e.ap, LIMITS.ap) +
          checkField("Needs sight from a friendly model", `${ep}.needsSight`, e.needsSight);
        break;
      case "summon": {
        const options = f.profiles.filter((p) => p.structure?.summonOnly).map((p): [string, string] => [p.id, p.name || p.id]);
        if (e.profileId && !options.some(([id]) => id === e.profileId)) options.unshift([e.profileId, `${f.profiles.find((p) => p.id === e.profileId)?.name ?? e.profileId} (not summon-only!)`]);
        if (!e.profileId) options.unshift(["", "Pick a structure…"]);
        params =
          selectField("Structure", `${ep}.profileId`, e.profileId, options, undefined, "span2") +
          numField("Range ″", `${ep}.range`, e.range, LIMITS.range, { step: 0.5 }) +
          numField("Min. from enemies ″", `${ep}.minEnemyDistance`, e.minEnemyDistance, [0, 24], { step: 0.5 }) +
          `<div class="ff-field"><span>&nbsp;</span><button class="mini secondary" data-act="newSummon" data-path="${ep}">+ New summon-only structure</button></div>`;
        break;
      }
      case "meleeBuff":
      case "rangedBuff":
        params = numField("Extra dice / model", `${ep}.dice`, e.dice, [1, 4]);
        break;
      case "slow":
        params = numField("Range ″", `${ep}.range`, e.range, LIMITS.range, { step: 0.5 });
        break;
      case "airdrop":
        params =
          checkField("Anywhere on the table (drop-ship)", `${ep}.anywhere`, !!e.anywhere, "Land anywhere, not just near your models; the range is ignored") +
          (e.anywhere ? "" : numField("Range ″", `${ep}.range`, e.range, LIMITS.range, { step: 0.5 })) +
          numField("Min. from enemies ″", `${ep}.minEnemyDistance`, e.minEnemyDistance, [0, 24], { step: 0.5 }) +
          numField("From round", `${ep}.fromRound`, e.fromRound ?? 1, [1, 10]) +
          numField("Arrival shield", `${ep}.arrivalShield`, e.arrivalShield, [0, 3], { opt: true, placeholder: "0", title: "Extra shield per model on arrival, even above the maximum, until the end of the round" });
        break;
      case "rattle":
        params = numField("Range ″", `${ep}.range`, e.range, LIMITS.range, { step: 0.5 }) + numField("Nerve penalty", `${ep}.penalty`, e.penalty, [0, 6]);
        break;
      case "retaliate":
        params = numField("Hits on", `${ep}.hit`, e.hit, [2, 6]) + numField("Damage", `${ep}.damage`, e.damage, LIMITS.damage);
        break;
      case "aimBuff":
        params = numField("Precision", `${ep}.precision`, e.precision, [0, 3]) + numField("Tracking", `${ep}.tracking`, e.tracking, [0, 3]);
        break;
      case "regrow":
        params = numField("Models regrown", `${ep}.models`, e.models, [1, 6]);
        break;
      case "dugIn":
        params = numField("Save bonus", `${ep}.save`, e.save, [1, 2]);
        break;
      case "teleport":
        params = numField("Range ″", `${ep}.range`, e.range, [1, 24], { step: 0.5 });
        break;
      case "spot":
      case "blind":
      case "silence":
      case "expose":
        params = numField("Range ″", `${ep}.range`, e.range, LIMITS.range, { step: 0.5 });
        break;
      case "smoke":
        params = numField("Shots only from within ″", `${ep}.range`, e.range, [1, 24], { step: 0.5 });
        break;
      case "resonate":
        params = numField("Range ″", `${ep}.range`, e.range, [0, 24], { step: 0.5 });
        break;
      case "haste":
        params = numField("Extra move ″", `${ep}.move`, e.move, [1, 6]);
        break;
      case "overshield":
        params = numField("Shield per model", `${ep}.amount`, e.amount, [1, 3]);
        break;
      default:
        params = `<p class="hint span2">No settings.</p>`;
    }
    const kinds = (reaction: boolean) =>
      EFFECT_KINDS.filter((k) => EFFECT_INFO[k].reaction === reaction)
        .map((k) => `<option value="${k}" ${k === e.kind ? "selected" : ""}>${EFFECT_INFO[k].label}</option>`)
        .join("");
    return `<div class="ff-card">
      <div class="ff-cardhead">
        <b>Ability ${i + 1}</b><code class="hint">${esc(a.id)}</code>
        <span class="spacer"></span>
        <button class="mini secondary danger" data-act="delAbility" data-index="${i}" title="Remove ability">✕</button>
      </div>
      <div class="ff-grid">
        ${textField("Name", `${path}.name`, a.name, LIMITS.nameLength, "span2")}
        ${numField("CP cost", `${path}.cp`, a.cp, LIMITS.cp)}
        ${selectField("When", `${path}.timing`, a.timing, Object.entries(TIMING_NAMES) as [string, string][])}
        ${checkField("Exhausts the card", `${path}.exhaust`, a.exhaust, "Once used, this support's abilities can't be used again until next round")}
      </div>
      <div class="ff-grid">
        <label class="ff-field span2"><span>Effect</span><select data-on="effectKind" data-path="${ep}">
          <optgroup label="Instant">${kinds(false)}</optgroup>
          <optgroup label="Reaction (armed in advance)">${kinds(true)}</optgroup>
        </select></label>
        ${params}
      </div>
      <p class="hint">${esc(info.help)} <b>Does:</b> <span data-preview="effect|${ep}">${esc(effectSummary(e, f))}</span></p>
      <label class="ff-field block"><span>Card text <button class="mini secondary" data-act="useSummary" data-path="${path}" title="Fill in the text from the effect">Use summary</button></span>
        <textarea data-path="${path}.text" data-t="s" rows="2" maxlength="${LIMITS.textLength}">${esc(a.text)}</textarea></label>
    </div>`;
  }

  private listsHtml(f: Faction): string {
    const buyable = f.profiles.filter((p) => !p.structure?.summonOnly);
    const entryRows = (field: "defaultList" | "assaultExtras") =>
      f[field]
        .map((e, i) => {
          const p = f.profiles.find((x) => x.id === e.profileId);
          const options = buyable.map((x): [string, string] => [x.id, x.name || x.id]);
          if (!p) options.unshift([e.profileId, `Unknown: ${e.profileId}`]);
          return `<div class="ff-entry">
            <select data-on="entryProfile" data-list="${field}" data-index="${i}" aria-label="Unit">${options
              .map(([v, l]) => `<option value="${esc(v)}" ${v === e.profileId ? "selected" : ""}>${esc(l)}</option>`)
              .join("")}</select>
            <span class="ff-entrycost">⚙${entryCostIn(f, e)}</span>
            <button class="mini secondary danger" data-act="delEntry" data-list="${field}" data-index="${i}" title="Remove">✕</button>
            ${
              p && p.upgrades.length
                ? `<div class="ff-chips small">${p.upgrades.map((u) => chip(`${field}.${i}.upgrades`, u.id, `${u.name} +⚙${nv(u.cost)}`, e.upgrades.includes(u.id), u.text)).join("")}</div>`
                : ""
            }
          </div>`;
        })
        .join("") || `<p class="hint">Empty.</p>`;
    const adder = (field: "defaultList" | "assaultExtras") =>
      `<select data-on="addEntry" data-list="${field}" aria-label="Add a unit"><option value="">+ Add a unit…</option>${buyable
        .map((p) => `<option value="${esc(p.id)}">${esc(p.name || p.id)} (⚙${nv(p.cost)})</option>`)
        .join("")}</select>`;
    const sk = starterStats(f, "skirmish");
    const as = starterStats(f, "assault");
    const slotOf = (id: string) => (f.defaultSupports.includes(id) ? "skirmish" : f.assaultSupports.includes(id) ? "assault" : "");
    return `
      <h2>Starter lists</h2>
      <p class="hint">The ready-made armies players get when they pick this faction. Skirmish uses the starter roster; Assault adds the extras on top.</p>
      <div class="ff-lists">
        <section class="ff-card">
          <h3>Skirmish roster</h3>
          ${meters(sk)}
          ${entryRows("defaultList")}
          ${adder("defaultList")}
        </section>
        <section class="ff-card">
          <h3>Assault extras <small class="hint">(added to the Skirmish roster)</small></h3>
          ${meters(as)}
          ${entryRows("assaultExtras")}
          ${adder("assaultExtras")}
        </section>
      </div>
      <section class="ff-card">
        <h3>Starter supports</h3>
        <div class="ff-lists">
          <div>${meterRow("Skirmish Fizz ✦", sk.fizz, sk.fizzLimit)}</div>
          <div>${meterRow("Assault Fizz ✦", as.fizz, as.fizzLimit)}</div>
        </div>
        ${
          f.supports.length
            ? f.supports
                .map(
                  (s) => `<div class="ff-entry"><b>${esc(s.name || s.id)}</b> <span class="hint">✦${nv(s.fizz)} · +${nv(s.cp)} CP/round</span><span class="spacer"></span>
                  <select data-on="supportSlot" data-id="${esc(s.id)}" aria-label="Starter slot for ${esc(s.name)}">
                    ${[["", "Not in starter lists"], ["skirmish", "Skirmish and Assault"], ["assault", "Assault only"]]
                      .map(([v, l]) => `<option value="${v}" ${slotOf(s.id) === v ? "selected" : ""}>${l}</option>`)
                      .join("")}
                  </select></div>`,
                )
                .join("")
            : `<p class="hint">This faction has no supports yet.</p>`
        }
      </section>`;
  }

  // ---------- events ----------

  private onClick(ev: Event): void {
    const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!b || (b as HTMLButtonElement).disabled) return;
    const f = this.f!;
    const d = b.dataset;
    const act = d.act!;
    // Actions that work in read-only mode
    switch (act) {
      case "close":
        return this.close();
      case "library":
        if (!this.confirmLeave()) return;
        return this.renderLibrary();
      case "nav": {
        const kind = d.sel as Sel["kind"];
        return this.select(kind === "profile" || kind === "support" ? { kind, id: d.id! } : ({ kind } as Sel));
      }
      case "copyThis":
        return this.startCopy(f);
      case "team":
        this.team = (d.team as TeamPick) ?? "neutral";
        this.lastSide = "";
        this.renderMain();
        return this.refreshLive();
      case "import":
        return void this.importFile();
      case "export":
        return downloadJson(`scdmg-faction-${slug(f.name)}`, exportable(f));
    }
    if (this.readOnly) return;
    const p = this.profile();
    const s = this.support();
    switch (act) {
      case "save":
        return this.save();
      case "look":
        f.look = d.look as Faction["look"];
        break;
      case "addProfile": {
        const np = addProfile(f, d.kind as ProfileKind);
        return this.select({ kind: "profile", id: np.id });
      }
      case "dupProfile": {
        const np = duplicateProfile(f, d.id!);
        if (np) return this.select({ kind: "profile", id: np.id });
        return;
      }
      case "delProfile": {
        if (!p || !confirm(`Delete ${p.name}? It's also removed from the starter lists.`)) return;
        removeProfile(f, p.id);
        return this.select({ kind: "info" });
      }
      case "kind":
        if (p) setProfileKind(f, p, d.kind as ProfileKind);
        break;
      case "addWeapon":
        if (p) p.weapons.push(d.melee === "1" ? newMelee() : newRanged());
        break;
      case "delWeapon":
        if (p) removeWeapon(p, Number(d.index));
        break;
      case "addBonus": {
        const arr = getPath(f, d.path!) as unknown;
        if (Array.isArray(arr)) arr.push({ vs: "infantry", dice: 1 });
        else setPath(f, d.path!, [{ vs: "infantry", dice: 1 }]);
        break;
      }
      case "delBonus": {
        const arr = getPath(f, d.path!) as unknown[] | undefined;
        arr?.splice(Number(d.index), 1);
        break;
      }
      case "addUpgrade":
        if (p) addUpgrade(p);
        break;
      case "delUpgrade":
        if (p) removeUpgrade(f, p, d.id!);
        break;
      case "addSupport": {
        const ns = addSupport(f);
        return this.select({ kind: "support", id: ns.id });
      }
      case "delSupport":
        if (!s || !confirm(`Delete ${s.name}?`)) return;
        removeSupport(f, s.id);
        return this.select({ kind: "info" });
      case "addAbility":
        if (s) s.abilities.push(newSupportAbility(s, f));
        break;
      case "delAbility":
        s?.abilities.splice(Number(d.index), 1);
        break;
      case "useSummary": {
        const a = getPath(f, d.path!) as SupportAbilityDef | undefined;
        if (a) a.text = effectSummary(a.effect, f);
        break;
      }
      case "newSummon": {
        const np = addProfile(f, "summon");
        setPath(f, `${d.path!}.profileId`, np.id);
        this.toast(`Added "${np.name}". Edit it under Units & structures.`);
        break;
      }
      case "delEntry":
        (f[d.list as "defaultList" | "assaultExtras"] ?? []).splice(Number(d.index), 1);
        break;
      case "artMode":
        if (!p) return;
        this.crop = null;
        if (d.mode === "auto") delete p.art;
        else if (d.mode === "parts") {
          if (p.art?.kind !== "parts") p.art = { kind: "parts", recipe: recipeFromProfile(p, f) };
        } else if (d.mode === "image") {
          if (p.art?.kind !== "image") {
            this.root.querySelector<HTMLInputElement>(".ff-hiddenfile")?.click();
            return;
          }
        }
        break;
      case "artPart": {
        if (!p || p.art?.kind !== "parts") return;
        const part = d.part as keyof MiniatureRecipe;
        const allowed: Record<string, readonly string[]> = { body: MINI_BODIES, head: MINI_HEADS, headgear: MINI_HEADGEAR, weapon: MINI_WEAPONS, back: MINI_BACKS };
        if (!allowed[part]?.includes(d.value!)) return;
        (p.art.recipe as unknown as Record<string, unknown>)[part] = d.value;
        break;
      }
      case "artRandom":
        if (!p || p.art?.kind !== "parts") return;
        p.art.recipe = { ...randomRecipe(Math.random, { body: p.art.recipe.body, ...(p.art.recipe.primary !== undefined ? { primary: p.art.recipe.primary } : {}) }), scale: p.art.recipe.scale };
        break;
      case "artRemove":
        if (!p) return;
        delete p.art;
        this.uploads.delete(p.id);
        break;
      case "cropAdjust": {
        const u = p && this.uploads.get(p.id);
        if (!p || !u) return;
        this.crop = { profileId: p.id, src: u.src, state: { ...u.state } };
        break;
      }
      case "cropCancel":
        this.crop = null;
        break;
      case "cropApply": {
        const c = this.crop;
        const target = c && f.profiles.find((x) => x.id === c.profileId);
        if (!c || !target) return;
        try {
          target.art = { kind: "image", dataUrl: encodeCrop(c.src, c.state) };
        } catch (err) {
          return this.toast((err as Error).message, true);
        }
        this.uploads.set(c.profileId, { src: c.src, state: { ...c.state } });
        this.crop = null;
        break;
      }
      default:
        return;
    }
    this.renderMain();
    this.refreshLive();
  }

  /** Typing: update the model and the live panels, but don't rebuild the form (keeps the caret). */
  private onInput(ev: Event): void {
    const el = ev.target as HTMLInputElement | HTMLTextAreaElement;
    if (this.readOnly) return;
    if (el.dataset.art && el.type !== "checkbox") return this.artInput(el as HTMLInputElement);
    if (el.dataset.crop && el.type !== "checkbox") return this.cropInput(el as HTMLInputElement);
    if (!el.dataset.path || el.type === "checkbox" || el.tagName === "SELECT") return;
    this.applyValue(el);
    if (el.dataset.t === "c") {
      const code = el.parentElement?.querySelector("code");
      if (code) code.textContent = el.value;
    }
    this.refreshLive();
  }

  /** Selects and checkboxes change the shape of the form, so they rebuild it. */
  private onChange(ev: Event): void {
    if (this.readOnly) return;
    const el = ev.target as HTMLInputElement | HTMLSelectElement;
    const f = this.f!;
    const d = el.dataset;
    if (d.on === "artFile") {
      const file = (el as HTMLInputElement).files?.[0];
      (el as HTMLInputElement).value = "";
      if (file) void this.beginUpload(file);
      return;
    }
    if (d.art === "useFaction") {
      const p = this.profile();
      if (p?.art?.kind !== "parts") return;
      if ((el as HTMLInputElement).checked) delete p.art.recipe.primary;
      else p.art.recipe.primary = f.color;
    } else if (d.crop && el.type === "checkbox") {
      if (!this.crop) return;
      const on = (el as HTMLInputElement).checked;
      if (d.crop === "outline") this.crop.state.outline = on;
      if (d.crop === "tintOn") this.crop.state.tint = on ? (this.crop.state.tint ?? f.color) : null;
    } else if (d.on) {
      this.special(d.on, el);
    } else if (d.toggle) {
      const arr = (getPath(f, d.toggle) as string[] | undefined) ?? [];
      const next = (el as HTMLInputElement).checked ? [...arr.filter((x) => x !== el.value), el.value] : arr.filter((x) => x !== el.value);
      // keep data tidy: optional upgrade lists disappear when empty
      if (!next.length && /\.(addKeywords|addAbilities|traits)$/.test(d.toggle) && !/\.patch\.traits$/.test(d.toggle)) setPath(f, d.toggle, undefined, true);
      else setPath(f, d.toggle, next);
    } else if (d.path && (el.tagName === "SELECT" || el.type === "checkbox")) {
      this.applyValue(el);
    } else return; // text and number inputs were handled on input
    this.renderMain();
    this.refreshLive();
  }

  private special(on: string, el: HTMLInputElement | HTMLSelectElement): void {
    const f = this.f!;
    const d = el.dataset;
    switch (on) {
      case "weaponType": {
        const w = getPath(f, d.path!.replace(/\.melee$/, "")) as Weapon;
        w.melee = el.value === "1";
        w.range = w.melee ? 0 : w.range || 12;
        w.targets = w.melee ? "ground" : "all";
        return;
      }
      case "impact": {
        const p = this.profile();
        if (p) setImpact(p, (el as HTMLInputElement).checked);
        return;
      }
      case "evade": {
        const p = this.profile();
        if (!p) return;
        if ((el as HTMLInputElement).checked) p.evade ??= { target: 5, against: ["pointBlank"] };
        else delete p.evade;
        return;
      }
      case "upgradeWeapon": {
        const u = getPath(f, d.path!.replace(/\.weapon$/, "")) as UpgradeDef;
        if (el.value === "") delete u.weapon;
        else u.weapon = { index: Number(el.value), patch: u.weapon?.index === Number(el.value) ? u.weapon.patch : {} };
        return;
      }
      case "patchField": {
        const patch = getPath(f, d.path!) as Partial<Weapon>;
        const field = d.field as keyof Weapon;
        const u = getPath(f, d.path!.replace(/\.weapon\.patch$/, "")) as UpgradeDef;
        const p = this.profile();
        const w = p && u.weapon ? p.weapons[u.weapon.index] : undefined;
        if ((el as HTMLInputElement).checked && w) (patch as Record<string, unknown>)[field] = structuredClone(w[field] ?? (field === "bonuses" || field === "traits" ? [] : undefined));
        else delete patch[field];
        return;
      }
      case "effectKind": {
        const a = getPath(f, d.path!.replace(/\.effect$/, "")) as SupportAbilityDef;
        const oldSummary = effectSummary(a.effect, f);
        a.effect = defaultEffect(el.value as SupportEffect["kind"], f);
        if (!a.text.trim() || a.text === oldSummary) a.text = effectSummary(a.effect, f);
        return;
      }
      case "entryProfile": {
        const e = f[d.list as "defaultList" | "assaultExtras"][Number(d.index)];
        if (e) {
          e.profileId = el.value;
          e.upgrades = [];
        }
        return;
      }
      case "addEntry":
        if (el.value) f[d.list as "defaultList" | "assaultExtras"].push({ profileId: el.value, upgrades: [] });
        return;
      case "supportSlot": {
        const id = d.id!;
        f.defaultSupports = f.defaultSupports.filter((x) => x !== id);
        f.assaultSupports = f.assaultSupports.filter((x) => x !== id);
        if (el.value === "skirmish") f.defaultSupports.push(id);
        if (el.value === "assault") f.assaultSupports.push(id);
        return;
      }
    }
  }

  private applyValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
    const f = this.f!;
    const path = el.dataset.path!;
    const t = el.dataset.t ?? "s";
    let v: unknown;
    if (t === "b") v = (el as HTMLInputElement).checked;
    else if (t === "n") {
      if (el.value.trim() === "" && el.dataset.opt) return setPath(f, path, undefined, true);
      v = el.value.trim() === "" ? NaN : Number(el.value);
    } else if (t === "c") v = parseInt(el.value.replace("#", ""), 16);
    else v = el.value;
    setPath(f, path, v);
  }

  /** Colours and size of a built miniature: update live without rebuilding the form (keeps the picker open). */
  private artInput(el: HTMLInputElement): void {
    const p = this.profile();
    if (p?.art?.kind !== "parts") return;
    const r = p.art.recipe;
    if (el.dataset.art === "primary") r.primary = parseInt(el.value.replace("#", ""), 16);
    else if (el.dataset.art === "secondary") r.secondary = parseInt(el.value.replace("#", ""), 16);
    else if (el.dataset.art === "scale") {
      const v = Number(el.value);
      if (Number.isFinite(v)) r.scale = Math.round(v * 100) / 100;
      const out = this.root.querySelector("[data-art-scale]");
      if (out) out.textContent = `${Math.round(r.scale * 100)}%`;
    }
    this.refreshLive();
  }

  private cropInput(el: HTMLInputElement): void {
    const c = this.crop;
    if (!c) return;
    if (el.dataset.crop === "zoom") c.state.zoom = Number(el.value) || 1;
    if (el.dataset.crop === "tint") c.state.tint = parseInt(el.value.replace("#", ""), 16);
    if (el.dataset.crop === "tintAmount") c.state.tintAmount = Number(el.value) || 0;
    c.state = clampCrop(c.src, c.state);
    this.drawCrop();
  }

  /** Check, decode and start cropping an uploaded picture for the selected profile. */
  private async beginUpload(file: Blob): Promise<void> {
    const p = this.profile();
    if (!p || this.readOnly) return;
    let src: UploadSource;
    try {
      src = await decodeUpload(file);
    } catch (err) {
      return this.toast((err as Error).message, true);
    }
    if (this.profile()?.id !== p.id) return;
    this.crop = { profileId: p.id, src, state: defaultCrop() };
    this.renderMain();
    this.refreshLive();
  }

  private drawCrop(): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>(".ff-cropview");
    if (canvas && this.crop) renderCrop(this.crop.src, this.crop.state, canvas.width, canvas);
  }

  /** Drag to pan and wheel to zoom on the crop preview. */
  private bindCrop(): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>(".ff-cropview");
    if (!canvas || !this.crop) return;
    this.drawCrop();
    let drag: { x: number; y: number; cx: number; cy: number } | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.crop) return;
      drag = { x: e.clientX, y: e.clientY, cx: this.crop.state.x, cy: this.crop.state.y };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag || !this.crop) return;
      const w = canvas.getBoundingClientRect().width || canvas.width;
      this.crop.state = clampCrop(this.crop.src, { ...this.crop.state, x: drag.cx + (e.clientX - drag.x) / w, y: drag.cy + (e.clientY - drag.y) / w });
      this.drawCrop();
    });
    const end = () => (drag = null);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!this.crop) return;
        e.preventDefault();
        this.crop.state = clampCrop(this.crop.src, { ...this.crop.state, zoom: this.crop.state.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) });
        const zoom = this.root.querySelector<HTMLInputElement>('[data-crop="zoom"]');
        if (zoom) zoom.value = String(this.crop.state.zoom);
        this.drawCrop();
      },
      { passive: false },
    );
  }

  private save(): void {
    const f = this.f!;
    const problems = saveCustomFaction(f);
    if (problems.length) {
      const checks = this.root.querySelector(".ff-checks");
      checks?.classList.remove("ff-flash");
      void (checks as HTMLElement | null)?.offsetWidth;
      checks?.classList.add("ff-flash");
      return this.toast(`Fix ${plural(problems.length, "problem")} before saving: ${problems[0]}`, true);
    }
    this.savedJson = JSON.stringify(f);
    this.notes = [];
    clearFactionDraft();
    this.refreshLive();
    this.toast(`Saved "${f.name}". It's ready to pick in the game and the list builder.`);
  }
}

// ---------- small render helpers ----------

/** Built-in data structures, minus the registry's custom flag. */
function stripCustom(f: Faction): Faction {
  const c = structuredClone(f);
  delete c.custom;
  return c;
}

function focusKeyOf(el: HTMLElement): string {
  const d = el.dataset;
  return [d.path, d.toggle, d.act, d.on, d.index, d.list, d.id, (el as HTMLInputElement).value && d.toggle ? (el as HTMLInputElement).value : ""].join("|");
}

function getPath(root: unknown, path: string): unknown {
  let o: unknown = root;
  for (const k of path.split(".")) {
    if (FORBIDDEN_KEYS.has(k) || typeof o !== "object" || o === null) return undefined;
    o = (o as Record<string, unknown>)[k];
  }
  return o;
}

function setPath(root: unknown, path: string, value: unknown, remove = false): void {
  const keys = path.split(".");
  if (keys.some((k) => FORBIDDEN_KEYS.has(k))) return;
  const last = keys.pop()!;
  const parent = keys.length ? getPath(root, keys.join(".")) : root;
  if (typeof parent !== "object" || parent === null) return;
  if (remove) delete (parent as Record<string, unknown>)[last];
  else (parent as Record<string, unknown>)[last] = value;
}

type NumOpts = { step?: number; disabled?: boolean; opt?: boolean; title?: string; placeholder?: string };

function numInput(path: string, value: unknown, [min, max]: readonly [number, number], o: NumOpts = {}): string {
  return `<input type="number" data-path="${path}" data-t="n" ${o.opt ? `data-opt="1" placeholder="${esc(o.placeholder ?? "-")}"` : ""} value="${nv(value)}" min="${min}" max="${max}" step="${o.step ?? 1}" ${o.disabled ? "disabled" : ""}/>`;
}

function numField(label: string, path: string, value: unknown, range: readonly [number, number], o: NumOpts = {}): string {
  return `<label class="ff-field" ${o.title ? `title="${esc(o.title)}"` : ""}><span>${label}</span>${numInput(path, value, range, o)}</label>`;
}

function textInput(path: string, value: string, max: number): string {
  return `<input type="text" data-path="${path}" data-t="s" value="${esc(value)}" maxlength="${max}"/>`;
}

function textField(label: string, path: string, value: string, max: number, cls = ""): string {
  return `<label class="ff-field ${cls}"><span>${label}</span>${textInput(path, value, max)}</label>`;
}

function areaField(label: string, path: string, value: string, placeholder = ""): string {
  return `<label class="ff-field block"><span>${label}</span><textarea data-path="${path}" data-t="s" rows="2" maxlength="${LIMITS.textLength}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
}

function selectInput(path: string, value: string, options: [string, string][], on?: string): string {
  return `<select data-path="${path}" data-t="e" ${on ? `data-on="${on}"` : ""}>${options
    .map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`)
    .join("")}</select>`;
}

function selectField(label: string, path: string, value: string, options: [string, string][], on?: string, cls = ""): string {
  return `<label class="ff-field ${cls}"><span>${label}</span>${selectInput(path, value, options, on)}</label>`;
}

function checkField(label: string, path: string, checked: boolean, title = ""): string {
  return `<label class="ff-check ff-field" ${title ? `title="${esc(title)}"` : ""}><span>&nbsp;</span><span><input type="checkbox" data-path="${path}" data-t="b" ${checked ? "checked" : ""}/> ${label}</span></label>`;
}

function chip(path: string, value: string, label: string, checked: boolean, title = "", locked = false): string {
  return `<label class="ff-chip ${checked ? "on" : ""} ${locked ? "locked" : ""}" title="${esc(title)}"><input type="checkbox" data-toggle="${path}" value="${esc(value)}" ${checked ? "checked" : ""} ${locked ? "disabled" : ""}/>${esc(label)}</label>`;
}

function traitChips(path: string, traits: string[]): string {
  return `<div class="ff-chips small">${TRAITS.map((t) => chip(path, t, t, traits.includes(t), TRAIT_TEXT[t])).join("")}</div>`;
}

function bonusesHtml(path: string, bonuses: { vs: Keyword; dice?: number; damage?: number; ap?: number }[]): string {
  return `<div class="ff-bonuses">
    ${bonuses
      .map(
        (b, i) => `<div class="ff-bonus">
          <span>Bonus vs</span>${selectInput(`${path}.${i}.vs`, b.vs, KEYWORDS.map((k): [string, string] => [k, k]))}
          <label>+dice ${numInput(`${path}.${i}.dice`, b.dice, LIMITS.bonus, { opt: true })}</label>
          <label>+dmg ${numInput(`${path}.${i}.damage`, b.damage, LIMITS.bonus, { opt: true })}</label>
          <label>+AP ${numInput(`${path}.${i}.ap`, b.ap, LIMITS.bonus, { opt: true })}</label>
          <button class="mini secondary danger" data-act="delBonus" data-path="${path}" data-index="${i}" title="Remove bonus">✕</button>
        </div>`,
      )
      .join("")}
    ${bonuses.length < LIMITS.bonuses ? `<button class="mini secondary" data-act="addBonus" data-path="${path}">+ Bonus vs keyword</button>` : ""}
  </div>`;
}

function meterRow(label: string, value: number, limit: number): string {
  const pct = limit > 0 ? Math.min(100, (value / limit) * 100) : 100;
  return `<div class="ff-meter"><span>${label}</span><div class="meter ${value > limit ? "over" : ""}"><span style="width:${pct}%"></span></div><b>${value}/${limit}</b></div>`;
}

function meters(s: StarterStats): string {
  const m = s.mode;
  const copies = s.maxCopies?.count ?? 0;
  return `<div class="ff-meters">
    ${meterRow(`${esc(m.name)} ⚙`, s.cost, m.rosterLimit)}
    ${meterRow("Units", s.units, m.maxUnits)}
    ${meterRow("Most copies", copies, m.maxCopies)}
  </div>`;
}

function statsLine(s: StarterStats): string {
  const m = s.mode;
  const over = s.cost > m.rosterLimit || s.units > m.maxUnits || (s.maxCopies?.count ?? 0) > m.maxCopies || s.fizz > s.fizzLimit;
  return `<div class="ff-stat ${over ? "over" : ""}"><b>${esc(m.name)}</b> ⚙${s.cost}/${m.rosterLimit} · ${s.units}/${m.maxUnits} units · ✦${s.fizz}/${s.fizzLimit} · +${s.cpPerRound} CP/round</div>`;
}

function supportCard(s: SupportDef, f: Faction): string {
  return `<div class="lb-unit ff-preview-card">
    <div class="lb-unit-head"><b>${esc(s.name)}</b><span class="hint">✦${nv(s.fizz)} · +${nv(s.cp)} CP/round</span></div>
    ${s.abilities
      .map(
        (a) => `<div class="ability"><b>${esc(a.name)}</b> <span class="tag">${nv(a.cp)} CP</span> <span class="tag">${esc(TIMING_NAMES[a.timing] ?? a.timing)}</span>${a.exhaust ? ` <span class="tag">exhausts</span>` : ""}<br/>${esc(a.text || effectSummary(a.effect, f))}</div>`,
      )
      .join("")}
    ${s.blurb ? `<p class="hint">${esc(s.blurb)}</p>` : ""}
  </div>`;
}
