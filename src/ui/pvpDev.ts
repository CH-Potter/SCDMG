// Dev server only: an online game between two tabs or windows of one browser, to try PvP without a
// lobby or a broker. Open the dev server at `#pvp-dev=host` in one tab and `#pvp-dev=guest` in
// another (main.ts loads this file only for those, and only under `vite` dev). The two sessions
// pair over a BroadcastChannel with a fixed invite code, the host proposes DEV_SETUP, the guest
// accepts it, and both tabs start the game: the host plays seat 0 (cyan), the guest seat 1 (red).
// Reload both tabs to start again.

import type { GameSetup } from "../engine/game";
import type { PvpSession, Role } from "../net/session";
import { NetOpponent } from "./opponent";

/** A fixed, valid invite code: every dev tab in this browser meets in the same room. */
export const DEV_CODE = "D9ZP-8KME-NPR7-6AGR";

/** The game both tabs play: the command re-roll house rule is on (with banked CP), so its flow can be tried too. */
export const DEV_SETUP: GameSetup = {
  factions: ["militia", "swarm"],
  mapId: "dustbowl",
  orderChoice: true,
  rules: { reroll: true, cardCp: false },
};

export interface PvpDevUi {
  /** Where to say what's happening until the game starts. */
  overlay: HTMLElement;
  /** The game has started: show it. */
  onStart: (session: PvpSession, setup: GameSetup, net: NetOpponent) => void;
}

export async function startPvpDev(role: Role, ui: PvpDevUi): Promise<PvpSession> {
  const [{ PvpSession }, { BroadcastTransport }] = await Promise.all([import("../net/session"), import("../net/broadcast")]);
  const session = new PvpSession({ transport: new BroadcastTransport(), code: DEV_CODE, role, build: "dev" });
  const other = role === "host" ? "guest" : "host";
  const say = (text: string) => {
    ui.overlay.innerHTML = `<div class="modal" style="max-width:460px;text-align:center"><h1>PvP dev game</h1><p class="tagline"></p></div>`;
    ui.overlay.querySelector(".tagline")!.textContent = text;
    ui.overlay.classList.add("show");
  };
  say(`You are the ${role} (seat ${role === "host" ? "0, cyan" : "1, red"}). Waiting for the other tab: open this page with #pvp-dev=${other} in another tab or window.`);
  session.paired.add(() => {
    say(role === "host" ? "Paired. Starting the game…" : "Paired. Waiting for the host's game…");
    if (role === "host") void session.proposeSetup(DEV_SETUP);
  });
  session.setupOffered.add(() => void session.acceptSetup());
  session.problem.add((p) => {
    if (!session.state) say(p);
  });
  session.started.add(({ setup }) => ui.onStart(session, setup, new NetOpponent(session)));
  await session.start();
  return session;
}
