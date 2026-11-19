import { missionFitsMap, MISSIONS } from "./engine/data/missions";
import { freshSeed } from "./ui/entropy";
import { FACTIONS, registerCustomFactions } from "./engine/data/factions";
import { openMapBuilder } from "./editor/index";
import { openFactionForge } from "./forge/index";
import { listCustomFactions } from "./ui/customFactions";
import { Controller, showRules, type ControllerHooks } from "./ui/controller";
import type { CampaignReturn } from "./ui/campaign/index";
import { openListBuilder } from "./ui/listbuilder";
import { maybeGameIntro } from "./ui/loreLinks";
import { loadHouseRules, openMenu, type MenuChoice } from "./ui/menu";
import "./ui/menu.css";
import { loadArt, miniStyle } from "./ui/minis";
import { BoardRenderer } from "./ui/renderer";
import { audio } from "./audio"; // [audio]

audio.init(); // [audio] starts on the first click or key press (autoplay policy)

const els = {
  topbar: document.getElementById("topbar")!,
  sidebar: document.getElementById("sidebar")!,
  stage: document.getElementById("stage")!,
};
const overlay = document.getElementById("overlay")!;
const renderer = new BoardRenderer();
let controller: Controller | null = null;

function showMenu(): void {
  audio.setMood("menu"); // [audio]
  openMenu(overlay, {
    onStart: startGame,
    onListBuilder: (faction, mode, listId) => openListBuilder(overlay, { faction, mode, listId, onClose: showMenu }),
    onMapBuilder: () =>
      openMapBuilder(overlay, {
        onClose: showMenu,
        onPlay: (map) => {
          const fits = Object.values(MISSIONS).filter((m) => missionFitsMap(m, map));
          const mission = fits.find((m) => !m.roles) ?? fits[0] ?? Object.values(MISSIONS).find((m) => m.mode === map.mode)!;
          startGame({ mode: map.mode, mission, map, factions: ["militia", "swarm"], lists: [[], []], supports: [[], []] });
        },
      }),
    onFactionForge: () =>
      openFactionForge(overlay, {
        onClose: () => {
          registerCustomFactions(listCustomFactions());
          showMenu();
        },
      }),
    onRules: () => showRules(),
    onCampaign: () => showCampaign(),
  });
}

/** The campaign screen (loaded on first use). `result` is the battle you just came back from, if any. */
function showCampaign(result?: CampaignReturn): void {
  audio.setMood("menu"); // [audio]
  void import("./ui/campaign/index")
    .then((m) =>
      m.openCampaign(overlay, {
        result,
        onExit: showMenu,
        onBattle: (launch) =>
          startGame(launch.choice, {
            campaign: { title: launch.title, onResult: (r) => showCampaign({ battleId: launch.battleId, ...r }) },
          }),
      }),
    )
    .catch((err) => {
      console.warn("Couldn't open the campaign:", err);
      showMenu();
    });
}

function startGame(choice: MenuChoice, hooks: ControllerHooks = {}): void {
  overlay.classList.remove("show");
  overlay.innerHTML = "";
  controller?.destroy();
  renderer.reset();
  const custom = choice.lists.every((l) => l.length > 0);
  const lists = custom ? choice.lists : undefined;
  const supports = custom ? choice.supports : undefined;
  const start = () => (controller = new Controller(renderer, els, showMenu, {
    factions: choice.factions,
    lists,
    supports,
    seed: freshSeed(),
    orderChoice: true,
    map: choice.map,
    mapId: choice.map.id,
    missionId: choice.mission.id,
    armyRule: choice.armyRule,
    startBonus: choice.startBonus,
    rules: loadHouseRules(),
  }, hooks));
  // New-engine miniatures load per army (lazy chunks): fetch both armies' art before the board shows.
  if (miniStyle() === "classic") start();
  else {
    const mine = ++starting;
    const go = () => void (mine === starting && start());
    void loadArt(choice.factions.flatMap((f) => FACTIONS[f]?.profiles ?? [])).then(go, go);
  }
}
/** Bumped by each start, so a slow art load never starts a battle the player has moved on from. */
let starting = 0;

// Custom factions from the Faction Forge join the built-ins.
registerCustomFactions(listCustomFactions());

// The miniatures' art loads in chunks (ui/minis/registry.ts): fetch the registered factions' in the
// background, for the intros, lore and codex pictures (the battle loads its armies' itself).
const artReady = loadArt(Object.values(FACTIONS).flatMap((f) => f.profiles)).catch((e) => console.warn("Couldn't load miniature art:", e));

await renderer.init(els.stage);
showMenu();
// First launch: the game intro plays over the menu (skippable, and replayable from the menu), once
// its miniatures are in (a moment; the Classic figures stand in if they never come).
void Promise.race([artReady, new Promise((r) => setTimeout(r, 2500))]).then(() => maybeGameIntro());
