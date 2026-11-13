// Human-readable text for units, weapons and events.

import { ABILITIES } from "../engine/data/abilities";
import { profileOf } from "../engine/profile";
import { unitById } from "../engine/rules";
import type { GameEvent, GameState, Keyword, Phase, Weapon } from "../engine/types";

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const KEYWORD_TEXT: Record<Keyword, string> = {
  infantry: "Can climb ladders. Benefits from cover.",
  light: "Can still shoot after disengaging.",
  armoured: "Shrugs off 1 AP unless the weapon is built to crack armour.",
  heavy: "Can't climb ladders. Never gets cover.",
  flying: "Ignores terrain. Can't hold objectives. Only anti-air weapons and other flyers can hit it.",
  jump: "Hops between levels without a ramp or ladder (costs 2\").",
  mech: "Machine.",
  beast: "Critter. Answers the Brood Call.",
  monster: "Very large critter.",
};

export const PHASE_NAMES: Record<Phase, string> = {
  movement: "Movement",
  assault: "Assault",
  combat: "Combat",
  scoring: "Scoring",
};

export function weaponLine(w: Weapon): string {
  const reach = w.melee ? "melee" : `${w.range}"`;
  const parts = [`${reach}, ${w.dice}d/model, hits ${w.hit}+, ${w.damage} dmg`];
  if (w.ap) parts.push(`AP${w.ap}`);
  if (w.targets === "all") parts.push(w.melee ? "reaches flyers" : "anti-air");
  if (w.targets === "ground" && !w.melee) parts.push("ground only");
  for (const b of w.bonuses ?? []) {
    const what = [b.dice && `+${b.dice} dice`, b.damage && `+${b.damage} dmg`, b.ap && `+${b.ap} AP`].filter(Boolean).join(", ");
    parts.push(`${what} vs ${b.vs}`);
  }
  return `${w.name}: ${parts.join(" · ")}`;
}

export const unitName = (s: GameState, uid: string): string => {
  const u = unitById(s, uid);
  return u ? profileOf(u).name : "?";
};

const diceHtml = (rolls: number[], need: (number | null)[] | number): string =>
  rolls
    .map((r, i) => {
      const n = typeof need === "number" ? need : need[i];
      return n !== null && n !== undefined && r >= n ? `<b>${r}</b>` : `${r}`;
    })
    .join(" ");

const who = (p: number) => (p === 0 ? "You" : "AI");

export function describeEvent(s: GameState, e: GameEvent): string | null {
  switch (e.type) {
    case "attack": {
      const r = e.report;
      const hits = r.hitRolls.filter((x) => x >= r.hitOn).length;
      const saves = r.saveRolls.length ? ` Saves: [${diceHtml(r.saveRolls, r.saveOn)}].` : "";
      const result = r.unitDestroyed
        ? ` <b>${esc(unitName(s, r.target))} is wiped out!</b>`
        : ` ${r.damage} damage${r.modelsKilled ? `, ${r.modelsKilled} model${r.modelsKilled > 1 ? "s" : ""} down` : ""}.`;
      const verb = r.kind === "fight" ? "fights" : r.kind === "overwatch" ? "overwatches" : r.kind === "barrage" ? "shells" : "shoots";
      return `${esc(unitName(s, r.uid))} ${verb} ${esc(unitName(s, r.target))} (${esc(r.weapon)}, ${r.attackers} model${r.attackers > 1 ? "s" : ""}): [${diceHtml(r.hitRolls, r.hitOn)}] = ${hits} hit${hits === 1 ? "" : "s"}.${saves}${result}`;
    }
    case "deployed":
      return `${esc(unitName(s, e.uid))} arrives.`;
    case "moved":
      return e.kind === "charge" ? `${esc(unitName(s, e.uid))} charges!` : e.kind === "disengage" ? `${esc(unitName(s, e.uid))} disengages.` : null;
    case "hunkered":
      return `${esc(unitName(s, e.uid))} hunkers down.`;
    case "ability":
      return `✨ ${esc(e.text)}`;
    case "passed":
      return `${who(e.player)} passed.`;
    case "phase":
      return `<b>Round ${e.round}: ${PHASE_NAMES[e.phase]} phase.</b>`;
    case "scored":
      return `<b>${who(e.player)} +${e.vp} VP</b> for ${esc(e.reason)}.`;
    case "flag":
      return `🍪 ${esc(e.text)}`;
    case "gameOver":
      return `<b>Game over: ${e.winner === "draw" ? "a draw" : e.winner === 0 ? "you win" : "the AI wins"}.</b> ${esc(e.reason)}.`;
    default:
      return null;
  }
}

export const abilityName = (id: keyof typeof ABILITIES): string => ABILITIES[id].name;
