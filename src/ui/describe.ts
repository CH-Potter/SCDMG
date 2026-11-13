// Human-readable text for units, attacks and events.

import { FACTIONS, profileOf } from "../engine/data/factions";
import { attackDice, checkAttack, expectedDamage, saveTarget, targetInCover, unitById } from "../engine/rules";
import type { AbilityId, GameEvent, GameState, Unit, Weapon } from "../engine/types";

export const ABILITY_TEXT: Record<AbilityId, string> = {
  entrench: "Entrench: action, +1 to saves until this unit activates again.",
  medic: 'Medic: action, heal a friendly unit within 3" (or itself) for 1 HP.',
  regen: "Regen: heals 1 HP at round end if it took no damage this round.",
  swarm: 'Swarm: +1 melee die per other friendly unit within 3" of the target (max +2).',
  phase: "Phase: moves straight through terrain and units.",
};

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function weaponLine(w: Weapon): string {
  const reach = w.melee ? "Melee" : `${w.range}"`;
  const ap = w.ap ? `, AP${w.ap}` : "";
  return `${w.name}: ${reach}, ${w.dice} dice, hits ${w.hit}+, ${w.damage} dmg${ap}`;
}

export const unitName = (s: GameState, uid: string): string => {
  const u = unitById(s, uid);
  return u ? profileOf(u.profileId).name : "?";
};

export function attackPreview(s: GameState, a: Unit, t: Unit, w: Weapon): { ok: boolean; text: string } {
  const err = checkAttack(s, a, t, w);
  if (err) return { ok: false, text: `${w.name}: ${err}` };
  const dice = attackDice(s, a, t, w);
  const st = saveTarget(s, a, t, w);
  const cover = !w.melee && targetInCover(s, a, t);
  const exp = expectedDamage(s, a, t, w);
  const parts = [
    `${w.name}: ${dice} dice hitting on ${w.hit}+`,
    st === null ? "no save" : `they save on ${st}+${cover ? " (cover)" : ""}${t.dugIn ? " (dug in)" : ""}`,
    `≈${exp.toFixed(1)} damage`,
  ];
  return { ok: true, text: parts.join(" · ") };
}

const dice = (rolls: number[], need: number | null): string =>
  rolls.map((r) => (need !== null && r >= need ? `<b>${r}</b>` : `${r}`)).join(" ");

export function describeEvent(s: GameState, e: GameEvent): string | null {
  switch (e.type) {
    case "attacked": {
      const a = unitById(s, e.uid)!;
      const w = profileOf(a.profileId).weapons.find((x) => x.name === e.weapon)!;
      const save =
        e.hits === 0
          ? ""
          : e.saveTarget === null
            ? " No save!"
            : ` Saves on ${e.saveTarget}+${e.cover ? " (cover)" : ""}: [${dice(e.saveRolls, e.saveTarget)}].`;
      const result = e.killed ? ` <b>${esc(unitName(s, e.target))} is wiped out!</b>` : ` ${e.damage} damage.`;
      return `${esc(unitName(s, e.uid))} → ${esc(unitName(s, e.target))} with ${esc(e.weapon)}: [${dice(e.hitRolls, w.hit)}] = ${e.hits} hit${e.hits === 1 ? "" : "s"}.${save}${result}`;
    }
    case "entrenched":
      return `${esc(unitName(s, e.uid))} digs in.`;
    case "healed":
      return `${esc(unitName(s, e.uid))} patches up ${esc(unitName(s, e.target))} (+${e.amount} HP).`;
    case "roundEnded":
      return `<b>End of round ${e.round}.</b> Objectives scored: you +${e.scored[0]}, AI +${e.scored[1]}.`;
    case "gameOver":
      return `<b>Game over: ${e.winner === "draw" ? "a draw" : e.winner === 0 ? "you win" : "the AI wins"}.</b> ${e.reason}.`;
    default:
      return null;
  }
}

export function factionName(id: keyof typeof FACTIONS): string {
  return FACTIONS[id].name;
}
