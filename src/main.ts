import { missionFitsMap, MISSIONS } from "./engine/data/missions";
import { registerCustomFactions } from "./engine/data/factions";
import { openMapBuilder } from "./editor/index";
import { openFactionForge } from "./forge/index";
import { listCustomFactions } from "./ui/customFactions";
import { Controller, showRules, type ControllerHooks } from "./ui/controller";
import type { CampaignReturn } from "./ui/campaign/index";
import { openListBuilder } from "./ui/listbuilder";
import { maybeGameIntro } from "./ui/loreLinks";
import { loadHouseRules, openMenu, type MenuChoice } from "./ui/menu";
import "./ui/menu.css";
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
  controller = new Controller(renderer, els, showMenu, {
    factions: choice.factions,
    lists,
    supports,
    seed: Date.now(),
    orderChoice: true,
    map: choice.map,
    mapId: choice.map.id,
    missionId: choice.mission.id,
    armyRule: choice.armyRule,
    startBonus: choice.startBonus,
    rules: loadHouseRules(),
  }, hooks);
}

// Custom factions from the Faction Forge join the built-ins.
registerCustomFactions(listCustomFactions());

await renderer.init(els.stage);
showMenu();
// First launch: the game intro plays over the menu (skippable, and replayable from the menu).
maybeGameIntro();
