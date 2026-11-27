import { missionFitsMap, MISSIONS } from "./engine/data/missions";
import { freshSeed } from "./ui/entropy";
import { FACTIONS, registerCustomFactions } from "./engine/data/factions";
import { openMapBuilder } from "./editor/index";
import { openFactionForge } from "./forge/index";
import { dropNetFactions, listCustomFactions } from "./ui/customFactions";
import { Controller, showRules, type ControllerHooks } from "./ui/controller";
import type { CampaignReturn } from "./ui/campaign/index";
import { openListBuilder } from "./ui/listbuilder";
import { loadHouseRules, openMenu, type MenuChoice } from "./ui/menu";
import "./ui/menu.css";
import { loadArt, miniStyle } from "./ui/minis";
import { BoardRenderer } from "./ui/renderer";
import { audio } from "./audio"; // [audio]
import type { GameSetup } from "./engine/game";
import type { PvpSession } from "./net/session";
import type { NetOpponent } from "./ui/opponent";

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
  dropNetFactions(); // an online game's opponent factions were for that game only
  openMenu(overlay, {
    // The desktop build is offline by design (electron/main.cjs blocks the network), so no online play there.
    onOnline: import.meta.env.MODE === "desktop" ? undefined : () => showLobby(),
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

/**
 * "Play a friend online" (loaded on first use, with the session and transports, so none of it is in
 * the main bundle). `joinLink`: opened from a join link (its `#join=…` fragment).
 */
function showLobby(joinLink?: string): void {
  audio.setMood("menu"); // [audio]
  void import("./ui/lobby")
    .then((m) => m.openLobby(overlay, { onStart: startOnline, onExit: showMenu, joinLink }))
    .catch((err) => {
      console.warn("Couldn't open the online lobby:", err);
      showMenu();
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

/**
 * An online game's screen, once its session has started (from the lobby, or the dev page below).
 * `net` was made when the game started, so moves made while the art loads are kept.
 */
function startOnline(session: PvpSession, setup: GameSetup, net: NetOpponent): void {
  overlay.classList.remove("show");
  overlay.innerHTML = "";
  controller?.destroy();
  renderer.reset();
  const leave = () => {
    if (location.hash.startsWith("#pvp-dev=")) history.replaceState(null, "", location.pathname + location.search);
    showMenu();
  };
  const start = () => (controller = Controller.online(renderer, els, leave, session, setup, net));
  if (miniStyle() === "classic") start();
  else {
    const mine = ++starting;
    const go = () => void (mine === starting && start());
    void loadArt(setup.factions.flatMap((f) => FACTIONS[f]?.profiles ?? [])).then(go, go);
  }
}

// Custom factions from the Faction Forge join the built-ins.
registerCustomFactions(listCustomFactions());

// The miniatures' art loads in chunks (ui/minis/registry.ts): fetch the registered factions' in the
// background, for the intros, lore and codex pictures (the battle loads its armies' itself).
void loadArt(Object.values(FACTIONS).flatMap((f) => f.profiles)).catch((e) => console.warn("Couldn't load miniature art:", e));

await renderer.init(els.stage);
if (import.meta.env.DEV && /^#pvp-dev=(host|guest)$/.test(location.hash)) {
  // Dev server only: an online game between two tabs of this browser (see ui/pvpDev.ts).
  const role = location.hash.endsWith("guest") ? "guest" : "host";
  void import("./ui/pvpDev")
    .then((m) => m.startPvpDev(role, { overlay, onStart: startOnline }))
    .catch((err) => {
      console.warn("Couldn't start the PvP dev game:", err);
      showMenu();
    });
} else if (import.meta.env.MODE !== "desktop" && /(?:^#|&)join=/.test(location.hash)) {
  // A join link from a friend: straight to the lobby's join screen. The code is read, then dropped
  // from the address bar (so a reload doesn't join again).
  const link = location.hash;
  history.replaceState(null, "", location.pathname + location.search);
  showLobby(link);
} else showMenu();
// The intros never play by themselves (the menu's Intro button and each lore page play them).
