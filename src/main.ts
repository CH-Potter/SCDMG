import { FACTIONS, entryCost, listCost } from "./engine/data/factions";
import { MAPS } from "./engine/data/maps";
import { MISSIONS } from "./engine/data/missions";
import { profileFor } from "./engine/profile";
import type { FactionId } from "./engine/types";
import { Controller, showRules } from "./ui/controller";
import { esc } from "./ui/describe";
import { BoardRenderer } from "./ui/renderer";

const els = {
  topbar: document.getElementById("topbar")!,
  sidebar: document.getElementById("sidebar")!,
  stage: document.getElementById("stage")!,
};
const overlay = document.getElementById("overlay")!;
const renderer = new BoardRenderer();
let controller: Controller | null = null;

const ids = Object.keys(FACTIONS) as FactionId[];
let mine: FactionId = "militia";
let theirs: FactionId = "munch";
let missionId = "hold";
let mapId = "dustbowl";

function factionCards(group: "mine" | "theirs", chosen: FactionId): string {
  return ids
    .map((id) => {
      const f = FACTIONS[id];
      const roster = f.defaultList
        .map((e) => {
          const p = profileFor(e.profileId, e.upgrades);
          const ups = e.upgrades.map((u) => p.upgrades.find((x) => x.id === u)?.name ?? u);
          return `<li>${esc(p.name)} ×${p.models}${ups.length ? ` <small>(${esc(ups.join(", "))})</small>` : ""} <small>⚙${entryCost(e)}</small></li>`;
        })
        .join("");
      return `
        <button class="faction-card ${id === chosen ? "selected" : ""}" data-group="${group}" data-id="${id}">
          <span class="row"><span class="swatch" style="background:#${f.color.toString(16).padStart(6, "0")}"></span>
          <strong style="font-size:1.15rem">${esc(f.name)}</strong></span>
          <p>${esc(f.blurb)}</p>
          <ul>${roster}</ul>
          <p class="hint">Roster: ${listCost(f.defaultList)} resources' worth</p>
        </button>`;
    })
    .join("");
}

const options = (rec: Record<string, { id: string; name: string }>, chosen: string) =>
  Object.values(rec)
    .map((x) => `<option value="${x.id}" ${x.id === chosen ? "selected" : ""}>${esc(x.name)}</option>`)
    .join("");

function showStart(): void {
  const mission = MISSIONS[missionId]!;
  const map = MAPS[mapId]!;
  overlay.innerHTML = `
    <div class="modal">
      <h1>SCDMG</h1>
      <p class="tagline">A cartoon sci-fi skirmish on the tabletop. Pick your side, the AI's side, a mission and a battlefield.</p>
      <div class="row" style="align-items:flex-start;margin-bottom:8px">
        <label style="flex:1;min-width:220px"><b>Mission</b><br/><select id="mission">${options(MISSIONS, missionId)}</select>
          <span class="hint" style="display:block">${esc(mission.blurb)} ${mission.rounds} rounds.</span></label>
        <label style="flex:1;min-width:220px"><b>Battlefield</b><br/><select id="map">${options(MAPS, mapId)}</select>
          <span class="hint" style="display:block">${esc(map.blurb)}</span></label>
      </div>
      <h3>Your faction</h3>
      <div class="faction-grid">${factionCards("mine", mine)}</div>
      <h3>AI opponent</h3>
      <div class="faction-grid">${factionCards("theirs", theirs)}</div>
      <div class="row">
        <button id="start">To battle!</button>
        <button class="secondary" id="rules">How to play</button>
      </div>
    </div>`;
  overlay.classList.add("show");
  overlay.querySelectorAll<HTMLButtonElement>(".faction-card").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.group === "mine") mine = b.dataset.id as FactionId;
      else theirs = b.dataset.id as FactionId;
      showStart();
    }),
  );
  overlay.querySelector<HTMLSelectElement>("#mission")!.addEventListener("change", (e) => {
    missionId = (e.target as HTMLSelectElement).value;
    showStart();
  });
  overlay.querySelector<HTMLSelectElement>("#map")!.addEventListener("change", (e) => {
    mapId = (e.target as HTMLSelectElement).value;
    showStart();
  });
  overlay.querySelector("#rules")!.addEventListener("click", () => showRules());
  overlay.querySelector("#start")!.addEventListener("click", () => startGame());
}

function startGame(): void {
  overlay.classList.remove("show");
  controller?.destroy();
  renderer.reset();
  controller = new Controller(renderer, els, showStart, { factions: [mine, theirs], seed: Date.now(), missionId, mapId });
}

await renderer.init(els.stage);
showStart();
