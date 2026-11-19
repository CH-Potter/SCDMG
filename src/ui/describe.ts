// Human-readable text for units, weapons and events.

import { BLAST_SQUAD, SHELL_BURST, SHELL_DRIFT } from "../engine/constants";
import { ABILITIES } from "../engine/data/abilities";
import { SUPPORTS } from "../engine/data/factions";
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
  indirect: `indirect (no sight needed; lands on target on its hit roll, else drifts up to ${SHELL_DRIFT}"; ${SHELL_BURST}" burst hits everyone under it)`,
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
      // A hit with no save (none possible, or breached) shows as a dash rather than a 0.
      if (n === null && typeof need !== "number") return "–";
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
      const rerolled = r.rerolledFrom?.length ? ` Re-rolled ${r.rerolledFrom.length} miss${r.rerolledFrom.length === 1 ? "" : "es"} [${r.rerolledFrom.join(" ")}].` : "";
      const breach = r.breach ? ` Breach d${r.breach.die} vs ${esc(r.breach.vs)}: ${r.breach.roll}, ${r.breach.skipped} skip the save.` : "";
      const saves = r.saveRolls.length ? ` Saves: [${diceHtml(r.saveRolls, r.saveOn)}].` : "";
      const result = r.unitDestroyed
        ? ` <b>${esc(unitName(s, r.target))} is wiped out!</b>`
        : ` ${r.damage} damage${r.modelsKilled ? `, ${r.modelsKilled} model${r.modelsKilled > 1 ? "s" : ""} down` : ""}.`;
      const verb = r.kind === "impact" ? "slams into" : r.kind === "fight" ? "fights" : r.kind === "overwatch" ? "overwatches" : r.kind === "barrage" ? "shells" : "shoots";
      return `${esc(unitName(s, r.uid))} ${verb} ${esc(unitName(s, r.target))} (${esc(r.weapon)}, ${r.attackers} model${r.attackers > 1 ? "s" : ""}): [${diceHtml(r.hitRolls, r.hitOn)}]${rerolled}${precise}${evades} = ${hits} hit${hits === 1 ? "" : "s"}.${breach}${saves}${result}`;
    }
    case "deployed": {
      // Open roster games: every arrival is a fresh recruit, paid for on the spot.
      const u = s.openRoster ? unitById(s, e.uid) : undefined;
      return u
        ? `🛠 ${u.owner === 0 ? "You recruit" : "The AI recruits"} ${esc(unitName(s, e.uid))} (⚙${profileOf(u).cost} · ◆${profileOf(u).supply}).`
        : `${esc(unitName(s, e.uid))} arrives.`;
    }
    case "moved":
      if (e.kind === "closeRanks") return `👣 ${esc(unitName(s, e.uid))} closes ranks.`;
      return e.kind === "charge" ? `${esc(unitName(s, e.uid))} charges!` : e.kind === "disengage" ? `${esc(unitName(s, e.uid))} disengages.` : null;
    case "chargeRoll":
      return e.made
        ? `🎲 ${esc(unitName(s, e.uid))} rolls ${e.roll[0]}+${e.roll[1]} for the charge: ${e.roll[0] + e.roll[1]}", enough (needed ${e.need}").`
        : `🎲 ${esc(unitName(s, e.uid))} rolls ${e.roll[0]}+${e.roll[1]} for the charge: ${e.roll[0] + e.roll[1]}", too short (needed ${e.need}"). It stays put.`;
    case "orderDraw":
      return `🎲 Order draw: ${e.player === 0 ? "you go" : "the AI goes"} next (${e.left[e.player]} of ${e.left[0] + e.left[1]} activations left).`;
    case "chargeFailed":
      return `${esc(unitName(s, e.uid))}'s charge at ${esc(unitName(s, e.target))} falls apart (${esc(e.reason)}).`;
    case "hunkered":
      return `${esc(unitName(s, e.uid))} hunkers down.`;
    case "burrowed":
      return e.under ? `🕳️ ${esc(unitName(s, e.uid))} burrows out of sight.` : `🕳️ ${esc(unitName(s, e.uid))} bursts back up out of the ground.`;
    case "barrageMarker":
      return e.landed ? `💥 The barrage comes down (${e.radius}" around the marker).` : `🎯 Barrage marker laid: ${esc(e.weapon)} shells it at the end of the assault phase (${e.radius}" around it).`;
    case "scatter":
      return e.drift === 0
        ? `💣 ${esc(unitName(s, e.uid))}'s ${esc(e.weapon)} lands right on target (rolled ${e.roll}, needed ${e.need}+).`
        : `💣 ${esc(unitName(s, e.uid))}'s ${esc(e.weapon)} drifts ${e.drift}" off target (rolled ${e.roll}, needed ${e.need}+${e.spotted ? "; spotted, so it drifts half as far" : ""}).`;
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
    case "cardBurned":
      return `🔥 ${who(e.player)}: ${esc(SUPPORTS[e.support]?.name ?? e.support)} is knocked out until the end of the round.`;
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
  if (st.blinded) tags.push("😵 blinded (its shooting hits one worse)");
  if (st.exposed) tags.push("🔦 in the spotlight (no cover, hunker or dig-in bonus)");
  if (st.smoked) tags.push(`🌫 hidden in dust (only shots from within ${st.smoked}")`);
  if (st.silenced) tags.push("🤐 silenced (no abilities or reactions)");
  if (st.overcharged) tags.push("⚡ overcharged (+1 damage on its shots)");
  if (st.overwatching) tags.push("👀 on overwatch (Top Cover)");
  if (st.standingTo) tags.push("🪖 standing to (shoots the first unit to charge it)");
  if (st.holding) tags.push("🚩 holding the line (can't move; double supply on objectives)");
  if (st.apBonus) tags.push(`🔩 steel-core rounds (+${st.apBonus} AP)`);
  if (st.scrambling) tags.push("🦗 mad scramble (charge: best 2 of 3 dice)");
  if (st.melting) tags.push("🫠 eaten through (saves two worse with the acid)");
  if (st.corroded && !st.melting) tags.push("🧪 corroded (saves one worse)");
  if (st.phased) tags.push("👻 phase-shifted (evades shots on 4+)");
  if (st.triangulated) tags.push("📐 triangulated (shots at it: precision +1, tracking +1)");
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
