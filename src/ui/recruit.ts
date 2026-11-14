// HUD pieces for open roster ("RTS") games: the recruit list in the army panel, the deploy menu's
// labels and a short role line per unit. The controller calls these through small hooks; in list
// games they fall back to the normal reserves wording. Engine side: src/engine/openRoster.ts.

import { fieldedCopies, rosterOrder } from "../engine/openRoster";
import { profileOf } from "../engine/profile";
import { canAffordDeploy, reserves } from "../engine/rules";
import type { GameState, PlayerId, Unit, UnitProfile } from "../engine/types";
import { esc } from "./describe";

/** The units a side can deploy from: its reserves, or in an open roster game every recruit in roster order. */
export function deployChoices(s: GameState, p: PlayerId): Unit[] {
  return s.openRoster ? rosterOrder(s, p) : reserves(s, p);
}

/** A short "what is it for" line: size and kind, how it fights, and anything notable. */
export function roleLine(p: UnitProfile): string {
  const kw = p.keywords;
  const kind = p.structure
    ? "structure"
    : kw.includes("flying")
      ? "flyer"
      : kw.includes("monster")
        ? "monster"
        : kw.includes("mech")
          ? "mech"
          : kw.includes("beast")
            ? "critters"
            : "infantry";
  const size = p.structure || p.models === 1 ? kind : `${p.models} × ${kind}`;
  const ranged = p.weapons.filter((w) => !w.melee);
  const melee = p.weapons.filter((w) => w.melee);
  const punch = (ws: typeof p.weapons) => Math.max(0, ...ws.map((w) => w.dice * w.damage));
  const parts = [size];
  if (!ranged.length) parts.push(melee.length ? "melee" : "support");
  else {
    parts.push(`shoots ${Math.max(...ranged.map((w) => w.range))}"`);
    if (melee.length && punch(melee) > punch(ranged)) parts.push("brawler");
    if (ranged.some((w) => w.targets === "air" || w.bonuses?.some((b) => b.vs === "flying"))) parts.push("anti-air");
    else if (ranged.every((w) => w.targets === "ground")) parts.push("can't shoot flyers");
  }
  if (p.structure?.fieldDeploy) parts.push("deploys near your units");
  return parts.join(" · ");
}

/**
 * The army panel's list: reserves, or the open roster with costs, role lines and copies fielded.
 * `whyNot` says why a unit can't be deployed right now (null if it can); by default, only cost and supply.
 */
export function reserveRowsHtml(
  s: GameState,
  p: PlayerId,
  whyNot: (u: Unit) => string | null = (u) => canAffordDeploy(s, u),
  placing: string | null = null,
): string {
  return deployChoices(s, p)
    .map((u) => {
      const prof = profileOf(u);
      const why = whyNot(u);
      const on = placing === u.uid;
      const ups = u.upgrades.length ? " · " + u.upgrades.map((id) => esc(prof.upgrades.find((x) => x.id === id)?.name ?? id)).join(", ") : "";
      const fielded = s.openRoster ? fieldedCopies(s, p, u.profileId) : 0;
      const extra = s.openRoster
        ? `${fielded ? ` · ${fielded} on the table` : ""}</small><small class="role">${esc(roleLine(prof))}`
        : "";
      const verb = s.openRoster ? "Recruit" : "Deploy";
      return `<div class="reserve ${on ? "on" : ""} ${why ? "cant" : ""}" title="${esc(prof.blurb)}">
          <span><b>${esc(prof.name)}</b> <small>⚙${prof.cost} · ◆${prof.supply}${ups}${extra}</small>${why ? `<small class="why">⛔ ${esc(why)}</small>` : ""}</span>
          <button class="mini" data-deploy="${u.uid}" ${why ? `disabled aria-disabled="true"` : ""} title="${esc(why ?? "Place it in your zone")}">${on ? "Placing…" : verb}</button>
        </div>`;
    })
    .join("");
}

/** Heading over the army panel's list. */
export const reservesHeading = (s: GameState): string => (s.openRoster ? "Open roster: recruit any unit" : "Reserves");

/** The AI's line in the army panel: how many it has in reserve, or that it's recruiting freely. */
export const aiReserveText = (s: GameState, p: PlayerId): string =>
  s.openRoster ? "open roster" : `${reserves(s, p).length} in reserve`;

/** Title of the deploy pop-up menu. */
export const deployMenuTitle = (s: GameState): string => (s.openRoster ? "Recruit here" : "Deploy here");

/** The small text on a deploy-menu button: cost and supply, plus the role line in open roster games. */
export function deployMenuDetail(s: GameState, u: Unit, why: string | null): string {
  const prof = profileOf(u);
  const base = `⚙${prof.cost} · ◆${prof.supply}${why ? ` · ⛔ ${why}` : ""}`;
  return s.openRoster ? `${base} · ${roleLine(prof)}` : base;
}
