// Which sound effects a batch of game events should make, and when. Pure: the caller supplies a
// resolver that describes units (faction look, keywords, weapons), so tests need no game state.

import type { AttackReport, GameEvent } from "../engine/types";

export type SfxName =
  | "rifle"
  | "pistol"
  | "burst"
  | "cannon"
  | "beam"
  | "goo"
  | "thwack"
  | "chomp"
  | "sting"
  | "ricochet"
  | "whoosh"
  | "slam"
  | "flinch"
  | "poof"
  | "shuffle"
  | "stomp"
  | "scurry"
  | "flutter"
  | "thunk"
  | "thunk-heavy"
  | "dig"
  | "summon"
  | "teleport"
  | "heal"
  | "fizzle"
  | "gulp"
  | "rally"
  | "twang"
  | "jingle"
  | "jingle-sour"
  | "sparkle"
  | "chime"
  | "click"
  | "hover"
  | "select"
  | "error";

export interface Cue {
  sfx: SfxName;
  /** Seconds after the batch arrives. */
  delay: number;
  /** Repeats (a burst of shots). */
  count?: number;
  /** Loudness scale, 1 = normal. */
  gain?: number;
  /**
   * Outcome cues (hit flinch, KO poof, whiff ricochet, Shaken gulp) wait for the dice: `group` is the
   * index of the dice roll they belong to (one roll per attack or morale event, in order).
   * `delay` is still the earliest they may play, relative to the batch.
   */
  group?: number;
}

/** How many dice rolls the dice tray shows for a batch: one per attack and per morale test. */
export const rollsIn = (events: readonly GameEvent[]): number => events.filter((e) => e.type === "attack" || e.type === "morale").length;

export interface UnitInfo {
  owner: 0 | 1;
  faction: string;
  look: string;
  keywords: readonly string[];
  weapons: readonly { name: string; melee: boolean; damage: number; dice: number; traits?: readonly string[] }[];
}

export type UnitResolver = (uid: string) => UnitInfo | undefined;

const has = (re: RegExp, s: string) => re.test(s.toLowerCase());

/** Pick the shot or swing sound for an attack from its kind, weapon name and the attacker. */
export function attackSfx(r: AttackReport, info?: UnitInfo): SfxName {
  if (r.kind === "impact") return "slam";
  if (r.kind === "barrage") return "cannon";
  const w = info?.weapons.find((x) => x.name === r.weapon);
  const name = r.weapon;
  const melee = r.kind === "fight" || (w?.melee ?? false);
  if (has(/goo|glob|spit|spore|slime|acid|ooze|puff|bile|larva|grub/, name)) return "goo";
  if (melee) {
    if (has(/sting/, name)) return "sting";
    if (has(/chomp|maw|bite|jaw|munch|nibbl|nip|gnaw|fang|teeth|mandible|pincer|snipper/, name)) return "chomp";
    if (info?.keywords.includes("beast") && !has(/claw|tail|stomp/, name)) return "chomp";
    return "thwack";
  }
  if (info?.look === "crystal" || has(/beam|lance|ray|laser|light|glow|flicker|prism|lumen|sun|orb|zap|plasma|shimmer/, name)) return "beam";
  if (has(/cannon|thumper|mortar|bomb|shell|launcher|bertha|howitzer|rocket/, name)) return "cannon";
  if (w && w.traits?.includes("blast") && w.damage >= 2) return "cannon";
  if (has(/pistol|derringer|revolver|six/, name) || w?.traits?.includes("pistol")) return "pistol";
  if (has(/repeater|chain|popper|gatling|burst|smg|machine/, name) || (w && w.dice >= 3)) return "burst";
  return "rifle";
}

function moveSfx(info?: UnitInfo): SfxName {
  const k = info?.keywords ?? [];
  if (k.includes("flying")) return "flutter";
  if (k.includes("heavy") || k.includes("mech") || k.includes("monster")) return "stomp";
  if (k.includes("beast")) return "scurry";
  return "shuffle";
}

const TELEPORT_ABILITIES = new Set(["blink", "recall", "tunnel", "phase-out"]);

export interface CueOpts {
  /** prefers-reduced-motion: one shot instead of a rattling burst, no ricochet flourishes. */
  reduced: boolean;
  /** Which player the listener is (for "good" or "sour" jingles). */
  me?: 0 | 1;
}

/** Turn a batch of events into timed cues. Simultaneous events are staggered so they don't smear. */
export function cuesForEvents(events: readonly GameEvent[], resolve: UnitResolver, o: CueOpts): Cue[] {
  const me = o.me ?? 0;
  const out: Cue[] = [];
  let t = 0;
  let roll = -1;
  const add = (sfx: SfxName, delay = 0, extra: Partial<Cue> = {}) => out.push({ sfx, delay: t + delay, ...extra });
  const chargeInBatch = events.some((e) => e.type === "moved" && e.kind === "charge");
  const impactInBatch = events.some((e) => e.type === "attack" && e.report.kind === "impact");

  for (const e of events) {
    switch (e.type) {
      case "deployed": {
        const info = resolve(e.uid);
        add(info?.keywords.includes("structure") || info?.keywords.includes("heavy") ? "thunk-heavy" : "thunk");
        t += 0.1;
        break;
      }
      case "moved": {
        const info = resolve(e.uid);
        if (e.kind === "charge") {
          add("whoosh");
          if (!impactInBatch) add("slam", 0.38);
          t += 0.4;
        } else if (e.kind === "teleport") {
          add("teleport");
          t += 0.15;
        } else {
          add(moveSfx(info), 0, e.kind === "advance" ? { count: 2 } : {});
          t += 0.1;
        }
        break;
      }
      case "attack": {
        const r = e.report;
        roll++;
        const info = resolve(r.uid);
        const sfx = attackSfx(r, info);
        const shots = sfx === "rifle" || sfx === "pistol" || sfx === "burst";
        const count = shots && !o.reduced ? Math.max(1, Math.min(3, r.attackers)) : 1;
        // A charge's impact lands on the whoosh's slam slot.
        if (!(r.kind === "impact" && chargeInBatch)) add(sfx, 0, count > 1 ? { count } : {});
        else add("slam", 0);
        const melee = sfx === "thwack" || sfx === "chomp" || sfx === "sting" || sfx === "slam";
        const land = melee ? 0.14 : sfx === "cannon" ? 0.45 : 0.3;
        const hits = r.hitRolls.filter((x) => x >= r.hitOn).length;
        if (r.damage > 0) add("flinch", land, { gain: Math.min(1.3, 0.8 + r.damage * 0.1), group: roll });
        else if (hits === 0 && shots && !o.reduced) add("ricochet", land, { group: roll });
        if (r.modelsKilled > 0 || r.unitDestroyed) add("poof", land + 0.14, { gain: r.unitDestroyed ? 1.2 : 1, group: roll });
        t += 0.32;
        break;
      }
      case "hunkered":
        add("dig");
        t += 0.1;
        break;
      case "ability":
        if (TELEPORT_ABILITIES.has(e.ability)) add("teleport");
        else if (e.ability === "patch-up" || e.ability === "hatch") add("heal");
        else if (e.ability !== "barrage") add("sparkle");
        t += 0.12;
        break;
      case "phase":
        add("twang");
        t += 0.2;
        break;
      case "scored":
        add(e.player === me ? "jingle" : "jingle-sour");
        t += 0.3;
        break;
      case "flag":
        add(/grab|deliver/i.test(e.text) ? (e.team === me ? "jingle-sour" : "jingle") : "chime");
        t += 0.2;
        break;
      case "support":
        add("chime");
        add("sparkle", 0.08);
        t += 0.2;
        break;
      case "summoned":
        add("summon");
        t += 0.2;
        break;
      case "morale":
        roll++;
        if (e.shaken) add("gulp", 0.25, { group: roll });
        break;
      case "rallied":
        add("rally");
        t += 0.3;
        break;
      case "expired":
        add("fizzle");
        t += 0.1;
        break;
      default:
        break;
    }
  }
  // Cap the batch, but never drop outcome cues (they're what the dice are building up to).
  const immediate = out.filter((c) => c.group === undefined).slice(0, 12);
  return [...immediate, ...out.filter((c) => c.group !== undefined)].sort((a, b) => a.delay - b.delay);
}

/** How heated the battle score should be: rises with the round, plus a decaying combat bump. */
export function battleIntensity(round: number, maxRounds: number, heat: number): number {
  const base = 0.12 + 0.55 * (maxRounds > 1 ? Math.max(0, Math.min(1, (round - 1) / (maxRounds - 1))) : 0);
  return Math.max(0, Math.min(1, base + Math.min(0.45, heat)));
}

/** Combat heat decays with a ~10 s half-life. */
export const decayHeat = (heat: number, dtSec: number): number => heat * Math.pow(0.5, Math.max(0, dtSec) / 10);
