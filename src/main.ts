import { FACTIONS, listCost, profileOf } from "./engine/data/factions";
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

function factionCards(group: "mine" | "theirs", chosen: FactionId): string {
  return ids
    .map((id) => {
      const f = FACTIONS[id];
      const counts = new Map<string, number>();
      for (const pid of f.defaultList) counts.set(pid, (counts.get(pid) ?? 0) + 1);
      const roster = [...counts].map(([pid, n]) => `<li>${n}× ${esc(profileOf(pid).name)}</li>`).join("");
      return `
        <button class="faction-card ${id === chosen ? "selected" : ""}" data-group="${group}" data-id="${id}">
          <span class="row"><span class="swatch" style="background:#${f.color.toString(16).padStart(6, "0")}"></span>
          <strong style="font-size:1.15rem">${esc(f.name)}</strong></span>
          <p>${esc(f.blurb)}</p>
          <ul>${roster}</ul>
          <p class="hint">${listCost(f.defaultList)} points</p>
        </button>`;
    })
    .join("");
}

function showStart(): void {
  overlay.innerHTML = `
    <div class="modal">
      <h1>SCDMG</h1>
      <p class="tagline">A cartoon sci-fi skirmish on the tabletop. Pick your side and an opponent for the AI.</p>
      <h3>Your faction</h3>
      <div class="faction-grid">${factionCards("mine", mine)}</div>
      <h3>AI opponent</h3>
      <div class="faction-grid">${factionCards("theirs", theirs)}</div>
      <div class="row">
        <button id="start">Deploy and fight!</button>
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
  overlay.querySelector("#rules")!.addEventListener("click", () => showRules());
  overlay.querySelector("#start")!.addEventListener("click", () => startGame());
}

function startGame(): void {
  overlay.classList.remove("show");
  controller?.destroy();
  renderer.reset();
  controller = new Controller(renderer, els, showStart, { factions: [mine, theirs], seed: Date.now() });
}

await renderer.init(els.stage);
showStart();
