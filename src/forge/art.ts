// Faction forge: miniature previews (thumbnails, animated stages), unit cards, the roster gallery, and the
// HTML for the miniature controls (auto / uploaded picture / built from parts). Previews are rendered with
// the game's own art pipeline and assigned to <img>.src through the DOM after the HTML is in place, so
// no user data (names, images) is ever written into markup unescaped.

import { ABILITIES } from "../engine/data/abilities";
import { ART_LIMITS, imageDataUrlInfo, MINI_BACKS, MINI_BODIES, MINI_HEADGEAR, MINI_HEADS, MINI_WEAPONS } from "../engine/data/unitArt";
import type { AbilityId, Faction, MiniatureRecipe, UnitProfile } from "../engine/types";
import { emblemFor, factionEmblemSvg } from "../ui/art/emblems";
import { archetypeSpec, type FigureSpec, figureDataUrl, figureDataUrlAsync, figurePending, figureSpec, IDLE_BREATH, type MiniLayer, miniFraming, specKey } from "../ui/art/figures";
import { BACK_NAMES, BODY_NAMES, HEAD_NAMES, HEADGEAR_NAMES, WEAPON_NAMES } from "../ui/art/miniBuilder";
import { css } from "../ui/art/palette";
import { UPLOAD_ACCEPT } from "../ui/art/upload";
import { esc, evadeLine, KEYWORD_TEXT, weaponLine } from "../ui/describe";
import { kindOf, type ProfileKind } from "./model";

export const KIND_NAMES: Record<ProfileKind, string> = { unit: "Unit", structure: "Structure", summon: "Summon-only" };
/** Neutral base for thumbnails (the forge's tokens use it too). */
export const NEUTRAL_BASE = 0x9a8f80;

const nv = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "-");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------- previews ----------

/** A thumbnail placeholder; `hydrateMinis` fills it in. `ref` is "factionId|profileId". */
export function miniImg(fid: string, pid: string, px: number, cls = ""): string {
  const ref = esc(`${fid}|${pid}`);
  return `<img class="ff-mini ${cls}" data-mini="${ref}" data-px="${px}" data-persist="mini|${ref}|${px}" width="${px}" height="${px}" alt="" decoding="async"/>`;
}

/** A large animated preview placeholder: base and figure stacked, the figure breathing. */
export function stageHtml(fid: string, pid: string, px: number): string {
  const ref = esc(`${fid}|${pid}`);
  return `<div class="ff-stage" data-stage="${ref}" data-px="${px}" data-persist="stage|${ref}|${px}" style="--px:${px}px" role="img" aria-label="Miniature preview">
    <img class="ff-stage-base" alt="" decoding="async"/><img class="ff-stage-fig" alt="" decoding="async"/>
  </div>`;
}

function setSrc(img: HTMLImageElement, spec: FigureSpec, team: number | null, px: number, layer: MiniLayer): void {
  const key = `${specKey(spec)}|${team}|${px}|${layer}`;
  if (img.dataset.key === key) return;
  img.dataset.key = key;
  img.src = figureDataUrl(spec, team, px, layer);
  if (figurePending(spec))
    void figureDataUrlAsync(spec, team, px, layer).then((url) => {
      if (img.dataset.key === key && img.isConnected) img.src = url;
    });
}

export type ProfileLookup = (ref: string) => { f: Faction; p: UnitProfile } | null;

/** Fill in every thumbnail and stage inside `scope`. Cheap when nothing changed (keys are compared). */
export function hydrateMinis(scope: ParentNode, lookup: ProfileLookup, team: number): void {
  scope.querySelectorAll<HTMLImageElement>("img[data-mini]").forEach((img) => {
    const hit = lookup(img.dataset.mini ?? "");
    if (!hit) return;
    setSrc(img, figureSpec(hit.p, hit.f.look, hit.f.color), NEUTRAL_BASE, Number(img.dataset.px) || 32, "all");
  });
  scope.querySelectorAll<HTMLElement>("[data-stage]").forEach((el) => {
    const hit = lookup(el.dataset.stage ?? "");
    if (!hit) return;
    const spec = figureSpec(hit.p, hit.f.look, hit.f.color);
    const px = Number(el.dataset.px) || 200;
    const [amp, period] = IDLE_BREATH[spec.kind];
    el.style.setProperty("--amp", String(amp * 1.4));
    el.style.setProperty("--period", `${period}s`);
    el.style.setProperty("--feet", `${(miniFraming(spec).feet * 100).toFixed(1)}%`);
    el.classList.toggle("fly", hit.p.keywords.includes("flying"));
    el.classList.toggle("still", amp === 0 && !hit.p.keywords.includes("flying"));
    setSrc(el.querySelector<HTMLImageElement>(".ff-stage-base")!, spec, team, px, "base");
    setSrc(el.querySelector<HTMLImageElement>(".ff-stage-fig")!, spec, null, px, "figure");
  });
}

/** Replace `el`'s HTML, carrying over elements marked `data-persist` (so previews don't flicker or restart). */
export function swapHtml(el: HTMLElement, html: string): void {
  const keep = new Map<string, Element>();
  el.querySelectorAll("[data-persist]").forEach((x) => {
    const k = x.getAttribute("data-persist")!;
    if (!keep.has(k)) keep.set(k, x);
  });
  el.innerHTML = html;
  el.querySelectorAll("[data-persist]").forEach((x) => {
    const k = x.getAttribute("data-persist")!;
    const old = keep.get(k);
    if (old) {
      x.replaceWith(old);
      keep.delete(k);
    }
  });
}

// ---------- unit card and roster ----------

function emblem(f: Faction, size: number): string {
  return f.custom || f.id.startsWith("custom-") ? emblemFor(f.color, f.look, f.name, size) : factionEmblemSvg(f.id, size);
}

const artLabel = (p: UnitProfile): string => (p.art?.kind === "image" ? "Picture token" : p.art?.kind === "parts" ? "Built miniature" : "");

/** The full unit card: miniature, stats, weapons, abilities, upgrades, keywords and the faction emblem. */
export function unitCardHtml(f: Faction, p: UnitProfile, o: { stage: number; teamPicker?: boolean; team?: string }): string {
  const kind = kindOf(p);
  const stat = (label: string, value: string, title = "") => `<div class="ff-stat-cell" ${title ? `title="${esc(title)}"` : ""}><span>${label}</span><b>${value}</b></div>`;
  const fearless = p.keywords.includes("fearless");
  const teams: [string, string][] = [
    ["neutral", "Plain"],
    ["0", "Blue"],
    ["1", "Red"],
  ];
  return `<article class="ff-ucard" style="--fc:${css(f.color)}">
    <header class="ff-ucard-head">
      <span class="ff-ucard-emblem">${emblem(f, 34)}</span>
      <div><b class="ff-ucard-name">${esc(p.name || "Unnamed")}</b><div class="hint">${esc(f.name)} · ${KIND_NAMES[kind]}${artLabel(p) ? ` · ${artLabel(p)}` : ""}</div></div>
    </header>
    <div class="ff-ucard-art">${stageHtml(f.id, p.id, o.stage)}
      ${
        o.teamPicker
          ? `<div class="ff-teams" role="radiogroup" aria-label="Base colour">${teams
              .map(([v, l]) => `<button class="mini ${o.team === v ? "selected" : "secondary"}" data-act="team" data-team="${v}" data-keep="1" role="radio" aria-checked="${o.team === v}">${l}</button>`)
              .join("")}</div>`
          : ""
      }
    </div>
    <div class="ff-statgrid">
      ${stat("Cost", `⚙${nv(p.cost)}`)}${stat("Supply", `◆${nv(p.supply)}`)}${stat("Models", nv(p.models))}${stat("Move", p.structure ? "-" : `${nv(p.move)}″`)}
      ${stat("HP", nv(p.hp), "Per model")}${stat("Shield", nv(p.shield), "Per model; recharges")}${stat("Save", p.armor >= 7 ? "none" : `${nv(p.armor)}+`)}${stat("Nerve", fearless ? "∞" : nv(p.nerve ?? 7), fearless ? "Fearless: never tests" : "2d6 morale")}
    </div>
    ${p.weapons.length ? `<h4>Weapons</h4>${p.weapons.map((w) => `<div class="weapon">⚔ ${esc(weaponLine(w))}</div>`).join("")}` : ""}
    ${p.evade ? `<div class="weapon">${esc(evadeLine(p))}</div>` : ""}
    ${p.impact ? `<div class="weapon">💥 Impact on charge: ${nv(p.impact.dice)}d/model, hits ${nv(p.impact.hit)}+, ${nv(p.impact.damage)} dmg${p.impact.ap ? `, AP${nv(p.impact.ap)}` : ""}</div>` : ""}
    ${
      p.abilities.length
        ? `<h4>Abilities</h4>${p.abilities.map((a: AbilityId) => (ABILITIES[a] ? `<div class="ability"><b>${esc(ABILITIES[a].name)}</b>: ${esc(ABILITIES[a].text)}</div>` : "")).join("")}`
        : ""
    }
    ${p.upgrades.length ? `<h4>Upgrades</h4>${p.upgrades.map((u) => `<div class="ability">⬆ <b>${esc(u.name)}</b> +⚙${nv(u.cost)}: ${esc(u.text)}</div>`).join("")}` : ""}
    <div class="tags">${p.keywords.map((k) => `<span class="tag kw" title="${esc(KEYWORD_TEXT[k] ?? "")}">${esc(k)}</span>`).join("")}</div>
    ${p.blurb ? `<p class="ff-ucard-blurb">${esc(p.blurb)}</p>` : ""}
  </article>`;
}

/** The whole faction at a glance: one tile per unit, structure and summon. */
export function rosterHtml(f: Faction, readOnly: boolean): string {
  const groups: [ProfileKind, string][] = [
    ["unit", "Units"],
    ["structure", "Structures"],
    ["summon", "Summon-only"],
  ];
  const tile = (p: UnitProfile) => `<button class="ff-tile" data-keep="1" data-act="nav" data-sel="profile" data-id="${esc(p.id)}" title="Open ${esc(p.name)}">
      ${miniImg(f.id, p.id, 112, "ff-tile-mini")}
      <b>${esc(p.name || "Unnamed")}</b>
      <span class="hint">⚙${nv(p.cost)} · ◆${nv(p.supply)} · ${plural(Number(p.models) || 0, "model")}${p.structure ? "" : ` · ${nv(p.move)}″`}</span>
      <span class="ff-tile-tags">${p.keywords
        .filter((k) => k !== "structure")
        .slice(0, 4)
        .map((k) => `<span class="tag kw">${esc(k)}</span>`)
        .join("")}</span>
    </button>`;
  return `
    <div class="ff-mainhead"><span class="ff-ucard-emblem">${emblem(f, 44)}</span><h2>${esc(f.name || "Untitled")}</h2></div>
    <p class="hint">${readOnly ? "The codex: every unit, structure and support in this faction. Pick one for its full card." : "Everything in your faction. Pick a miniature to edit it."}</p>
    ${f.blurb ? `<p>${esc(f.blurb)}</p>` : ""}
    ${groups
      .map(([k, label]) => {
        const ps = f.profiles.filter((p) => kindOf(p) === k);
        return ps.length ? `<h3>${label} <small class="hint">${ps.length}</small></h3><div class="ff-roster">${ps.map(tile).join("")}</div>` : "";
      })
      .join("")}`;
}

// ---------- miniature controls ----------

/** A recipe that starts close to what the auto archetype shows. */
export function recipeFromProfile(p: UnitProfile, f: Faction): MiniatureRecipe {
  const a = archetypeSpec(p, f.look, f.color);
  const body: MiniatureRecipe["body"] =
    a.kind === "critter" || a.kind === "bug" ? "critter" : a.kind === "brute" || a.kind === "golem" ? "brute" : a.kind === "walker" ? "walker" : a.kind === "plane" || a.kind === "skiff" || a.kind === "sylph" ? "flyer" : p.structure ? "structure" : "trooper";
  const head: MiniatureRecipe["head"] = f.look === "teeth" ? "beast" : f.look === "crystal" ? "gem" : f.look === "plain" ? "visor" : "face";
  const headgear: MiniatureRecipe["headgear"] = f.look === "teeth" ? "horns" : f.look === "crystal" ? "crown" : f.look === "cap" ? "hat" : "helmet";
  const weapon: MiniatureRecipe["weapon"] = a.caster ? "staff" : a.ranged ? (a.long || a.heavy ? "cannon" : "rifle") : body === "critter" || body === "brute" ? "claws" : "blade";
  const back: MiniatureRecipe["back"] = a.jump ? "jets" : a.spitter ? "tank" : a.medic ? "pack" : body === "trooper" ? "pack" : "none";
  return { body, head, headgear, weapon, back, secondary: 0xffc23a, scale: 1 };
}

const hex = (n: number) => css(Number.isFinite(n) ? Math.max(0, Math.min(0xffffff, Math.round(n))) : 0);

function partRow(label: string, part: keyof MiniatureRecipe, values: readonly string[], names: Record<string, string>, current: string): string {
  return `<div class="ff-partrow"><span>${label}</span><div class="ff-seg small" role="radiogroup" aria-label="${label}">${values
    .map((v) => `<button class="${v === current ? "selected" : ""}" data-act="artPart" data-part="${part}" data-value="${v}" role="radio" aria-checked="${v === current}">${esc(names[v] ?? v)}</button>`)
    .join("")}</div></div>`;
}

export interface CropView {
  zoom: number;
  tint: number | null;
  tintAmount: number;
  outline: boolean;
}

/** The "Miniature" section of the unit editor. */
export function artSectionHtml(f: Faction, p: UnitProfile, o: { crop: CropView | null; canAdjust: boolean }): string {
  const mode = o.crop ? "image" : (p.art?.kind ?? "auto");
  const seg = (m: string, label: string, title: string) =>
    `<button class="${mode === m ? "selected" : ""}" data-act="artMode" data-mode="${m}" role="radio" aria-checked="${mode === m}" title="${title}">${label}</button>`;
  let body = "";
  if (o.crop) {
    const c = o.crop;
    body = `<div class="ff-crop">
        <canvas class="ff-cropview" width="220" height="220" aria-label="Drag to move the picture, scroll to zoom"></canvas>
        <div class="ff-cropctl">
          <label class="ff-field"><span>Zoom</span><input type="range" data-crop="zoom" min="1" max="4" step="0.05" value="${c.zoom}"/></label>
          <label class="ff-check"><input type="checkbox" data-crop="tintOn" ${c.tint !== null ? "checked" : ""}/> Colour wash</label>
          ${
            c.tint !== null
              ? `<div class="row"><input type="color" data-crop="tint" value="${hex(c.tint)}" aria-label="Wash colour"/><input type="range" data-crop="tintAmount" min="0.05" max="0.8" step="0.05" value="${c.tintAmount}" aria-label="Wash strength"/></div>`
              : ""
          }
          <label class="ff-check"><input type="checkbox" data-crop="outline" ${c.outline ? "checked" : ""}/> Ink outline</label>
          <p class="hint">Drag the picture to move it; scroll or use the slider to zoom.</p>
          <div class="row"><button class="mini" data-act="cropApply">Use this picture</button><button class="mini secondary" data-act="cropCancel">Cancel</button></div>
        </div>
      </div>`;
  } else if (p.art?.kind === "image") {
    const kb = Math.ceil((imageDataUrlInfo(p.art.dataUrl)?.bytes ?? 0) / 1024);
    body = `<p class="hint">Shown in game as a coin token on the unit's base. Stored size ${kb} KB (max ${Math.round(ART_LIMITS.imageBytes / 1024)} KB).</p>
      <div class="row">
        <label class="ff-filebtn mini secondary">Replace picture…<input type="file" data-on="artFile" accept="${UPLOAD_ACCEPT}"/></label>
        ${o.canAdjust ? `<button class="mini secondary" data-act="cropAdjust">Adjust crop</button>` : ""}
        <button class="mini secondary danger" data-act="artRemove">Remove</button>
      </div>`;
  } else if (p.art?.kind === "parts") {
    const r = p.art.recipe;
    body = `
      ${partRow("Body", "body", MINI_BODIES, BODY_NAMES, r.body)}
      ${partRow("Head", "head", MINI_HEADS, HEAD_NAMES, r.head)}
      ${partRow("Headgear", "headgear", MINI_HEADGEAR, HEADGEAR_NAMES, r.headgear)}
      ${partRow("Holding", "weapon", MINI_WEAPONS, WEAPON_NAMES, r.weapon)}
      ${partRow("On the back", "back", MINI_BACKS, BACK_NAMES, r.back)}
      <div class="ff-partrow"><span>Colours</span><div class="row">
        <label class="ff-colorpick" title="Main colour"><input type="color" data-art="primary" value="${hex(r.primary ?? f.color)}" ${r.primary === undefined ? "disabled" : ""}/> Main</label>
        <label class="ff-check"><input type="checkbox" data-art="useFaction" ${r.primary === undefined ? "checked" : ""}/> Faction colour</label>
        <label class="ff-colorpick" title="Trim colour"><input type="color" data-art="secondary" value="${hex(r.secondary)}"/> Trim</label>
      </div></div>
      <div class="ff-partrow"><span>Size</span><div class="row"><input type="range" data-art="scale" min="${ART_LIMITS.scale[0]}" max="${ART_LIMITS.scale[1]}" step="0.05" value="${r.scale}" aria-label="Size"/><code data-art-scale>${Math.round(r.scale * 100)}%</code>
        <span class="spacer"></span><button class="mini secondary" data-act="artRandom" title="Random parts and trim">Surprise me</button></div></div>`;
  } else {
    body = `<p class="hint">The game picks a miniature from the keywords, base size, weapons, abilities and the faction look. Upload a picture or build your own to replace it.</p>`;
  }
  return `<div class="ff-artbox" data-drop="art">
      ${stageHtml(f.id, p.id, 168)}
      <div class="ff-artctl">
        <div class="ff-seg" role="radiogroup" aria-label="Miniature">
          ${seg("auto", "Auto", "Picked from the unit's profile")}
          ${seg("image", "Picture", "Upload a PNG, JPEG, WebP or GIF picture, shown as a coin token")}
          ${seg("parts", "Build", "Put a miniature together from parts")}
        </div>
        <input type="file" class="ff-hiddenfile" data-on="artFile" accept="${UPLOAD_ACCEPT}" tabindex="-1" aria-hidden="true"/>
        ${body}
      </div>
    </div>`;
}
