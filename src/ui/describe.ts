// Human-readable text for units, weapons and events.

import { BLAST_SQUAD } from "../engine/constants";
import { ABILITIES } from "../engine/data/abilities";
import { profileOf } from "../engine/profile";
import { unitById } from "../engine/rules";
import type { AttackReport, EvadeCondition, GameEvent, GameState, Keyword, Phase, Unit, Weapon, UnitProfile, WeaponTrait } from "../engine/types";

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
  fearless: "Never takes nerve tests.",
  structure: "Can't move. Can't hold objectives. Permanent ones are bought in the list; temporary ones vanish at the end of the round.",
};

export const TRAIT_TEXT: Record<WeaponTrait, string> = {
  blast: `blast (+1 die/model vs ${BLAST_SQUAD}+ models)`,
  torrent: "torrent (auto-hits)",
  heavy: "heavy (hits worse after moving)",
  rending: "rending (6s get +1 AP)",
  pistol: "pistol (no evade at point-blank)",
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
  if (w.precision) parts.push(`precision ${w.precision}`);
  if (w.tracking) parts.push(`tracking ${w.tracking}`);
  for (const t of w.traits ?? []) parts.push(TRAIT_TEXT[t]);
  for (const b of w.bonuses ?? []) {
    const what = [b.dice && `+${b.dice} dice`, b.damage && `+${b.damage} dmg`, b.ap && `+${b.ap} AP`].filter(Boolean).join(", ");
    parts.push(`${what} vs ${b.vs}`);
  }
  return `${w.name}: ${parts.join(" · ")}`;
}

export const EVADE_TEXT: Record<EvadeCondition, string> = {
  pointBlank: "point-blank shots",
  ranged: "all shooting",
  melee: "melee",
  blast: "blasts",
};

/** "Evade" line for unit cards, or "" if the unit has none. */
export function evadeLine(p: UnitProfile): string {
  const e = p.evade;
  if (!e) return "";
  return `🌀 Evade ${e.target}+ vs ${e.against.map((c) => EVADE_TEXT[c]).join(", ")}`;
}

/** Hits after precision and evades, from an attack report. */
export function reportHits(r: AttackReport): { rolled: number; total: number; evaded: number } {
  const rolled = r.hitRolls.filter((x) => x >= r.hitOn).length;
  const withPrecision = rolled + (r.precisionMoved ?? 0);
  const evaded = r.evadeRolls && r.evadeOn !== undefined ? r.evadeRolls.filter((x) => x >= r.evadeOn!).length - (r.evadesCancelled ?? 0) : 0;
  return { rolled, total: withPrecision - evaded, evaded };
}

/** "Impact on charge" line for unit cards, or "" if the unit has none. */
export function impactLine(p: UnitProfile): string {
  const i = p.impact;
  if (!i) return "";
  return `💥 Impact on charge: ${i.dice}d/model in contact, hits ${i.hit}+, ${i.damage} dmg${i.ap ? ` · AP${i.ap}` : ""}`;
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
      const { total: hits } = reportHits(r);
      const precise = r.precisionMoved ? ` +${r.precisionMoved} by precision.` : "";
      const evades =
        r.evadeRolls && r.evadeOn !== undefined
          ? ` Evade ${r.evadeOn}+: [${diceHtml(r.evadeRolls, r.evadeOn)}]${r.evadesCancelled ? `, ${r.evadesCancelled} tracked` : ""}.`
          : "";
      const saves = r.saveRolls.length ? ` Saves: [${diceHtml(r.saveRolls, r.saveOn)}].` : "";
      const result = r.unitDestroyed
        ? ` <b>${esc(unitName(s, r.target))} is wiped out!</b>`
        : ` ${r.damage} damage${r.modelsKilled ? `, ${r.modelsKilled} model${r.modelsKilled > 1 ? "s" : ""} down` : ""}.`;
      const verb = r.kind === "impact" ? "slams into" : r.kind === "fight" ? "fights" : r.kind === "overwatch" ? "overwatches" : r.kind === "barrage" ? "shells" : "shoots";
      return `${esc(unitName(s, r.uid))} ${verb} ${esc(unitName(s, r.target))} (${esc(r.weapon)}, ${r.attackers} model${r.attackers > 1 ? "s" : ""}): [${diceHtml(r.hitRolls, r.hitOn)}]${precise}${evades} = ${hits} hit${hits === 1 ? "" : "s"}.${saves}${result}`;
    }
    case "deployed": {
      // Open roster games: every arrival is a fresh recruit, paid for on the spot.
      const u = s.openRoster ? unitById(s, e.uid) : undefined;
      return u
        ? `🛠 ${u.owner === 0 ? "You recruit" : "The AI recruits"} ${esc(unitName(s, e.uid))} (⚙${profileOf(u).cost} · ◆${profileOf(u).supply}).`
        : `${esc(unitName(s, e.uid))} arrives.`;
    }
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
    case "support":
      return `✦ ${who(e.player)}: ${esc(e.text)}`;
    case "morale":
      return e.shaken
        ? `😱 ${esc(unitName(s, e.uid))} is <b>Shaken</b>! (rolled ${e.roll[0]}+${e.roll[1]} vs nerve ${e.nerve})`
        : `${esc(unitName(s, e.uid))} holds its nerve (${e.roll[0]}+${e.roll[1]} vs ${e.nerve}).`;
    case "rallied":
      return e.how === "cp" ? `📣 ${esc(unitName(s, e.uid))} is rallied.` : `${esc(unitName(s, e.uid))} pulls itself together.`;
    case "summoned":
      return `${esc(unitName(s, e.uid))} appears.`;
    case "expired":
      return `${esc(unitName(s, e.uid))} fades away.`;
    case "recharged":
      return `${who(e.player)}: shields recharge on ${e.models} model${e.models === 1 ? "" : "s"}.`;
    case "upkeep":
      return `${who(e.player)}: +${e.resources} ⚙${e.supply ? `, +${e.supply} ◆ supply cap` : ""}${e.cp ? `, +${e.cp} CP` : ""} for next round.`;
    case "gameOver":
      return `<b>Game over: ${e.winner === "draw" ? "a draw" : e.winner === 0 ? "you win" : "the AI wins"}.</b> ${esc(e.reason)}.`;
    default:
      return null;
  }
}

export const abilityName = (id: keyof typeof ABILITIES): string => ABILITIES[id].name;

/** Short tags for round-long ability effects on a unit (Rampage, Spotter, Sugar Rush, Provoke, overshields). */
export function abilityStatusTags(u: Unit): string[] {
  const st = u.status;
  const tags: string[] = [];
  if (st.reckless) tags.push("🔥 rampaging (+1 melee die, saves one worse)");
  if (st.spotted) tags.push("🎯 spotted (shots at it hit one better)");
  if (st.hasted) tags.push(`🍬 +${st.hasted}" move`);
  if (st.provoking) tags.push("📢 provoking (enemies near it must shoot it)");
  if (st.dugIn) tags.push(`🧱 dug in (+${st.dugIn} save against shooting)`);
  if (st.precisionBonus || st.trackingBonus)
    tags.push(`🔍 ${[st.precisionBonus ? `precision +${st.precisionBonus}` : "", st.trackingBonus ? `tracking +${st.trackingBonus}` : ""].filter(Boolean).join(", ")}`);
  const max = profileOf(u).shield;
  if (u.models.some((m) => m.alive && m.shield > max)) tags.push("🫧 bubble shield");
  return tags;
}

/**
 * A one-word verdict on an attack that did no harm, so a dodge or a save isn't called a miss:
 * "Missed!" (no dice hit), "Dodged!" (every hit evaded) or "No damage!" (hits landed but were saved
 * or soaked). Empty when the attack did damage.
 */
export function noHarmVerdict(r: AttackReport): string {
  if (r.damage > 0 || r.modelsKilled || r.unitDestroyed) return "";
  const h = reportHits(r);
  if (h.rolled + (r.precisionMoved ?? 0) === 0) return "Missed!";
  if (h.total <= 0) return "Dodged!";
  return "No damage!";
}
