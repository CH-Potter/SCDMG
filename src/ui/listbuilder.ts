import { factionEmblemSvg } from "./art/emblems";
// Army list builder: pick a faction and mode, add units and upgrades within the mode's limits,
// save to browser storage, and import/export lists as JSON files.

import { ABILITIES } from "../engine/data/abilities";
import { entryCost, FACTIONS, listCost, factionOf, supportsCost } from "../engine/data/factions";
import { MODES, type ModeId } from "../engine/data/modes";
import { profileFor } from "../engine/profile";
import type { FactionId, SupportDef, UnitProfile } from "../engine/types";
import { esc, KEYWORD_TEXT, weaponLine, impactLine, evadeLine } from "./describe";
import { downloadJson, newId, pickJsonFile, slug } from "./files";
import { deleteList, exportable, fromImport, isStarter, listProblems, listsFor, saveList, starterList, type SavedList } from "./lists";

export interface ListBuilderOptions {
  onClose: () => void;
  faction?: FactionId;
  mode?: ModeId;
  listId?: string;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

export function openListBuilder(host: HTMLElement, opts: ListBuilderOptions): void {
  const faction = opts.faction ?? "militia";
  const mode = opts.mode ?? "skirmish";
  let list: SavedList = structuredClone(listsFor(faction, mode).find((l) => l.id === opts.listId) ?? starterList(faction, mode));
  if (isStarter(list)) list = { ...list, id: newId("list"), name: `My ${factionOf(faction).name}` };
  let dirty = false;
  let message = "";

  const render = () => {
    const f = factionOf(list.faction);
    const m = MODES[list.mode];
    const cost = listCost(list.entries);
    const problems = listProblems(list);
    const saved = listsFor(list.faction, list.mode).filter((l) => !isStarter(l));
    const pct = Math.min(100, (cost / m.rosterLimit) * 100);

    // Re-rendering replaces the page, so keep the scroll position where the player was.
    const scroller = host.querySelector<HTMLElement>(".lb");
    const scrollTop = scroller?.scrollTop ?? 0;
    const hostScrollTop = host.scrollTop;
    host.innerHTML = `
      <div class="lb">
        <header class="lb-head" data-faction="${esc(list.faction)}" style="--faction-color:${hex(f.color)}">
          <div>
            <h1>${factionEmblemSvg(list.faction, 40)} List builder</h1>
            <p class="tagline">Build a roster within the ${esc(m.name)} limits: ⚙${m.rosterLimit} resources, up to ${m.maxUnits} units, max ${m.maxCopies} of any one unit.</p>
          </div>
          <div class="row">
            <button class="secondary" id="lb-import">Import…</button>
            <button class="secondary" id="lb-export">Export</button>
            <button class="secondary" id="lb-close">Back to menu</button>
          </div>
        </header>
        <div class="lb-bar panel">
          <label>Name <input id="lb-name" maxlength="60" value="${esc(list.name)}"/></label>
          <label>Faction <select id="lb-faction">${Object.values(FACTIONS)
            .map((x) => `<option value="${x.id}" ${x.id === list.faction ? "selected" : ""}>${esc(x.name)}</option>`)
            .join("")}</select></label>
          <label>Mode <select id="lb-mode">${Object.values(MODES)
            .map((x) => `<option value="${x.id}" ${x.id === list.mode ? "selected" : ""}>${esc(x.name)}</option>`)
            .join("")}</select></label>
          <label>Load <select id="lb-load"><option value="">Saved lists…</option>${saved
            .map((l) => `<option value="${esc(l.id)}" ${l.id === list.id ? "selected" : ""}>${esc(l.name)}</option>`)
            .join("")}</select></label>
          <div class="lb-cost">
            <div class="meter ${cost > m.rosterLimit ? "over" : ""}"><span style="width:${pct}%"></span></div>
            <b>⚙ ${cost}/${m.rosterLimit}</b> · <b>✦ ${supportsCost(list.supports)}/${m.fizzLimit} Fizz</b> · ${list.entries.length}/${m.maxUnits} units · ◆ ${list.entries.reduce((s, e) => s + profileFor(e.profileId, e.upgrades).supply, 0)} supply
          </div>
        </div>
        <div class="lb-body">
          <section class="panel lb-catalogue">
            <h2>${factionEmblemSvg(list.faction, 24)} ${esc(f.name)} units</h2>
            ${f.profiles
              .filter((p) => !p.structure?.summonOnly)
              .map((p) => unitCard(p, list))
              .join("")}
          </section>
          <section class="panel lb-roster">
            <h2>Roster</h2>
            ${list.entries.length ? "" : `<p class="hint">Empty. Add units from the left.</p>`}
            ${list.entries.map((e, i) => rosterRow(e.profileId, e.upgrades, i)).join("")}
            <h2 style="margin-top:12px">Supports <small class="hint">✦ ${supportsCost(list.supports)}/${m.fizzLimit} Fizz</small></h2>
            <p class="hint" style="margin:0 0 4px">Off-board backing paid in Fizz. Each gives CP every round to spend on its abilities.</p>
            ${f.supports.map((sp) => supportCard(sp, list)).join("") || `<p class="hint">This faction has no supports.</p>`}
            <div class="lb-problems">${problems.map((p) => `<div class="problem">⚠ ${esc(p)}</div>`).join("")}${
              !problems.length ? `<div class="ok">✓ Ready to play</div>` : ""
            }</div>
            ${message ? `<p class="hint">${esc(message)}</p>` : ""}
            <div class="row">
              <button id="lb-save" ${problems.length ? "disabled" : ""}>Save${dirty ? " *" : ""}</button>
              <button class="secondary" id="lb-saveas" ${problems.length ? "disabled" : ""}>Save as new</button>
              <button class="secondary" id="lb-starter">Reset to starter</button>
              ${saved.some((l) => l.id === list.id) ? `<button class="secondary danger" id="lb-delete">Delete</button>` : ""}
            </div>
          </section>
        </div>
      </div>`;
    host.classList.add("show");
    const nextScroller = host.querySelector<HTMLElement>(".lb");
    if (nextScroller) nextScroller.scrollTop = scrollTop;
    host.scrollTop = hostScrollTop;
    bind();
  };

  const unitCard = (p: UnitProfile, l: SavedList) => {
    const copies = l.entries.filter((e) => e.profileId === p.id).length;
    const m = MODES[l.mode];
    return `
      <div class="lb-unit">
        <div class="lb-unit-head">
          <b>${esc(p.name)}</b>
          <span class="hint">⚙${p.cost} · ◆${p.supply} · ${p.models} model${p.models > 1 ? "s" : ""} · ${p.move}" · ${p.hp}HP${p.shield ? `+${p.shield}🛡` : ""} · ${p.armor}+</span>
          <button class="mini" data-add="${p.id}" ${copies >= m.maxCopies ? "disabled" : ""}>Add${copies ? ` (${copies})` : ""}</button>
        </div>
        <div class="tags">${p.keywords.map((k) => `<span class="tag kw" title="${esc(KEYWORD_TEXT[k])}">${k}</span>`).join("")}</div>
        ${p.weapons.map((w) => `<div class="weapon">⚔ ${esc(weaponLine(w))}</div>`).join("")}
      ${p.impact ? `<div class="weapon">${esc(impactLine(p))}</div>` : ""}
      ${p.evade ? `<div class="weapon">${esc(evadeLine(p))}</div>` : ""}
        ${p.abilities.map((a) => `<div class="ability"><b>${esc(ABILITIES[a].name)}</b>: ${esc(ABILITIES[a].text)}</div>`).join("")}
        <p class="hint" style="margin:2px 0 0">${esc(p.blurb)}</p>
      </div>`;
  };

  const supportCard = (sp: SupportDef, l: SavedList) => {
    const taken = l.supports.includes(sp.id);
    return `
      <div class="lb-entry ${taken ? "taken" : ""}">
        <div class="lb-unit-head">
          <b>${esc(sp.name)}</b>
          <span class="hint">✦${sp.fizz} Fizz · +${sp.cp} CP/round</span>
          <button class="mini ${taken ? "secondary" : ""}" data-sup="${esc(sp.id)}">${taken ? "Remove" : "Take"}</button>
        </div>
        ${sp.abilities.map((a) => `<div class="ability"><b>${esc(a.name)}</b> <small>(${a.cp} CP${a.exhaust ? ", exhausts" : ""})</small>: ${esc(a.text)}</div>`).join("")}
        <p class="hint" style="margin:2px 0 0">${esc(sp.blurb)}</p>
      </div>`;
  };

  const rosterRow = (profileId: string, upgrades: string[], i: number) => {
    const p = profileFor(profileId, []);
    const eff = profileFor(profileId, upgrades);
    return `
      <div class="lb-entry">
        <div class="lb-unit-head">
          <b>${esc(p.name)}</b>
          <span class="hint">⚙${entryCost({ profileId, upgrades })} · ◆${eff.supply} · ${eff.models} models</span>
          <span>
            <button class="mini secondary" data-dup="${i}" title="Duplicate">⧉</button>
            <button class="mini secondary" data-del="${i}" title="Remove">✕</button>
          </span>
        </div>
        ${
          p.upgrades.length
            ? `<div class="lb-ups">${p.upgrades
                .map(
                  (u) => `<label class="lb-up" title="${esc(u.text)}"><input type="checkbox" data-up="${i}" value="${u.id}" ${upgrades.includes(u.id) ? "checked" : ""}/> ${esc(u.name)} <small>+⚙${u.cost}: ${esc(u.text)}</small></label>`,
                )
                .join("")}</div>`
            : `<p class="hint" style="margin:0">No upgrades</p>`
        }
      </div>`;
  };

  const change = (fn: () => void, msg = "") => {
    fn();
    dirty = true;
    message = msg;
    render();
  };

  const bind = () => {
    const $ = <T extends Element>(sel: string) => host.querySelector<T>(sel);
    $("#lb-close")!.addEventListener("click", () => {
      if (dirty && !confirm("Leave without saving this list?")) return;
      opts.onClose();
    });
    $<HTMLInputElement>("#lb-name")!.addEventListener("change", (e) => change(() => (list.name = (e.target as HTMLInputElement).value)));
    $<HTMLSelectElement>("#lb-faction")!.addEventListener("change", (e) => {
      const fid = (e.target as HTMLSelectElement).value as FactionId;
      if (list.entries.length && !confirm("Switching faction clears the roster. Continue?")) return render();
      change(() => {
        list = { ...starterList(fid, list.mode), id: newId("list"), name: `My ${factionOf(fid).name}`, entries: [], supports: [] };
      });
    });
    $<HTMLSelectElement>("#lb-mode")!.addEventListener("change", (e) => change(() => (list.mode = (e.target as HTMLSelectElement).value as ModeId)));
    $<HTMLSelectElement>("#lb-load")!.addEventListener("change", (e) => {
      const id = (e.target as HTMLSelectElement).value;
      const found = listsFor(list.faction, list.mode).find((l) => l.id === id);
      if (!found) return;
      if (dirty && !confirm("Discard unsaved changes?")) return render();
      list = structuredClone(found);
      dirty = false;
      message = `Loaded "${found.name}".`;
      render();
    });
    host.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((b) =>
      b.addEventListener("click", () => change(() => list.entries.push({ profileId: b.dataset.add!, upgrades: [] }))),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-sup]").forEach((b) =>
      b.addEventListener("click", () =>
        change(() => {
          const id = b.dataset.sup!;
          list.supports = list.supports.includes(id) ? list.supports.filter((x) => x !== id) : [...list.supports, id];
        }),
      ),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-dup]").forEach((b) =>
      b.addEventListener("click", () => change(() => list.entries.splice(Number(b.dataset.dup) + 1, 0, structuredClone(list.entries[Number(b.dataset.dup)]!)))),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-del]").forEach((b) =>
      b.addEventListener("click", () => change(() => list.entries.splice(Number(b.dataset.del), 1))),
    );
    host.querySelectorAll<HTMLInputElement>("[data-up]").forEach((c) =>
      c.addEventListener("change", () =>
        change(() => {
          const e = list.entries[Number(c.dataset.up)]!;
          e.upgrades = c.checked ? [...e.upgrades, c.value] : e.upgrades.filter((u) => u !== c.value);
        }),
      ),
    );
    $("#lb-save")?.addEventListener("click", () => {
      const problems = saveList(list);
      dirty = problems.length > 0;
      message = problems.length ? problems.join(" ") : `Saved "${list.name}".`;
      render();
    });
    $("#lb-saveas")?.addEventListener("click", () => {
      list = { ...structuredClone(list), id: newId("list"), name: `${list.name} (copy)` };
      const problems = saveList(list);
      dirty = problems.length > 0;
      message = problems.length ? problems.join(" ") : `Saved a copy as "${list.name}".`;
      render();
    });
    $("#lb-starter")!.addEventListener("click", () =>
      change(() => {
        const st = starterList(list.faction, list.mode);
        list.entries = st.entries;
        list.supports = st.supports;
      }, "Reset to the starter roster."),
    );
    $("#lb-delete")?.addEventListener("click", () => {
      if (!confirm(`Delete "${list.name}"? This can't be undone.`)) return;
      deleteList(list.id);
      list = { ...starterList(list.faction, list.mode), id: newId("list"), name: `My ${factionOf(list.faction).name}` };
      dirty = false;
      message = "List deleted.";
      render();
    });
    $("#lb-export")!.addEventListener("click", () => downloadJson(`scdmg-list-${slug(list.name)}`, exportable(list)));
    $("#lb-import")!.addEventListener("click", async () => {
      try {
        const result = fromImport(await pickJsonFile());
        if (Array.isArray(result)) {
          message = `Couldn't import: ${result.join(" ")}`;
        } else {
          list = result;
          const problems = saveList(list);
          dirty = problems.length > 0;
          message = problems.length ? problems.join(" ") : `Imported and saved "${list.name}".`;
        }
      } catch (err) {
        message = `Couldn't import: ${(err as Error).message}`;
      }
      render();
    });
  };

  render();
}
