// The attack declaration marker: before any attack's dice roll (yours or the AI's), the board shows
// who is attacking whom, with what. The attacker gets a solid ring in its side's colour, a bold arrow
// runs to the target (dashed for shots, solid for melee), and the target gets a yellow crosshair. A
// DOM label at the arrow's middle names the attack type and weapon. Shapes differ as well as colours,
// so it reads without colour vision.

import type { Graphics } from "pixi.js";
import { dist } from "../engine/geometry";
import { aliveModels } from "../engine/rules";
import { profileOf } from "../engine/profile";
import type { AttackReport, GameState, Unit, Vec } from "../engine/types";
import { ACCENT, dashCircle, INK, PLAYER_COLORS } from "./boardArt";

export type AttackKind = AttackReport["kind"] | "charge";

export interface MarkBase {
  pos: Vec;
  r: number;
}

/** What the renderer needs to draw one marker (board inches). */
export interface AttackMarkView {
  from: MarkBase[];
  to: MarkBase[];
  /** The attacker's side colour. */
  color: number;
  /** Melee and charges draw a solid arrow; shots a dashed one. */
  melee: boolean;
}

/** Icon and verb for each kind of attack. */
export function attackVerb(kind: AttackKind): { icon: string; verb: string } {
  switch (kind) {
    case "shoot":
      return { icon: "🎯", verb: "Shooting" };
    case "fight":
      return { icon: "⚔", verb: "Melee" };
    case "overwatch":
      return { icon: "👁", verb: "Overwatch" };
    case "impact":
      return { icon: "💥", verb: "Impact" };
    case "barrage":
      return { icon: "💣", verb: "Blast" };
    case "charge":
      return { icon: "💥", verb: "Charge" };
  }
}

export const isMeleeKind = (kind: AttackKind): boolean => kind === "fight" || kind === "impact" || kind === "charge";

/** The label text: "🎯 Shooting · Rivet Rifle". */
export function attackLabel(kind: AttackKind, weapon: string): string {
  const { icon, verb } = attackVerb(kind);
  return weapon && weapon !== verb ? `${icon} ${verb} · ${weapon}` : `${icon} ${verb}`;
}

export const centroid = (bs: MarkBase[]): Vec => ({
  x: bs.reduce((n, b) => n + b.pos.x, 0) / Math.max(1, bs.length),
  y: bs.reduce((n, b) => n + b.pos.y, 0) / Math.max(1, bs.length),
});

/**
 * The arrow from the attacker's centre to the target's, trimmed so it starts and ends just outside
 * the bases. Null if the two overlap (point-blank melee): then only the rings are drawn.
 */
export function arrowEnds(from: MarkBase[], to: MarkBase[]): { a: Vec; b: Vec } | null {
  if (!from.length || !to.length) return null;
  const c0 = centroid(from);
  const c1 = centroid(to);
  const L = dist(c0, c1);
  // Trim by the spread of each group, so the arrow runs between the squads.
  const r0 = Math.max(...from.map((b) => dist(b.pos, c0) + b.r)) * 0.6 + 0.2;
  const r1 = Math.max(...to.map((b) => dist(b.pos, c1) + b.r)) * 0.6 + 0.35;
  if (L <= r0 + r1 + 0.4) return null;
  const ux = (c1.x - c0.x) / L;
  const uy = (c1.y - c0.y) / L;
  return { a: { x: c0.x + ux * r0, y: c0.y + uy * r0 }, b: { x: c1.x - ux * r1, y: c1.y - uy * r1 } };
}

/** Bases of a unit as the board shows it now (or, if it isn't on the table yet, as it will be). */
export function basesOf(u: Unit | undefined): MarkBase[] {
  if (!u || !u.onBoard) return [];
  const r = profileOf(u).baseRadius;
  return aliveModels(u).map((m) => ({ pos: { ...m.pos }, r }));
}

/** A unit as the first of `states` that has it on the table with models alive shows it (else the last that has it at all). */
function pick(states: GameState[], uid: string): Unit | undefined {
  let any: Unit | undefined;
  for (const s of states) {
    const u = s.units.find((x) => x.uid === uid);
    if (!u) continue;
    if (u.onBoard && aliveModels(u).length) return u;
    any ??= u;
  }
  return any;
}

/** Whose attack it is (for the label's colour). */
export const markSide = (states: GameState[], uid: string): number | undefined => pick(states, uid)?.owner;

/**
 * Build a marker between two units. `states` are tried in order: normally the state on screen, then
 * the states before and after the action (so a unit that is just arriving, or was just wiped out,
 * still gets its ring).
 */
export function markFor(states: GameState[], uid: string, target: string, kind: AttackKind, owner?: number): AttackMarkView | null {
  const a = uid ? pick(states, uid) : undefined;
  const t = pick(states, target);
  if (!t) return null;
  const from = basesOf(a);
  const to = basesOf(t);
  if (!to.length) return null;
  const side = (a?.owner ?? owner ?? (t.owner === 0 ? 1 : 0)) as 0 | 1;
  return { from, to, color: PLAYER_COLORS[side], melee: isMeleeKind(kind) };
}

/** Draw a marker into a Graphics layer above the models. */
export function drawAttackMark(g: Graphics, m: AttackMarkView): void {
  // Attacker: a thick solid ring in its side's colour, inked.
  for (const b of m.from) {
    const r = b.r + 0.32;
    g.ellipse(b.pos.x, b.pos.y, r, r * 0.92).stroke({ width: 0.3, color: INK, alpha: 0.85 });
    g.ellipse(b.pos.x, b.pos.y, r, r * 0.92).stroke({ width: 0.17, color: m.color });
  }
  // Target: a yellow crosshair on every model.
  for (const b of m.to) {
    const r = b.r + 0.36;
    g.ellipse(b.pos.x, b.pos.y, r, r * 0.92).stroke({ width: 0.3, color: INK, alpha: 0.85 });
    g.ellipse(b.pos.x, b.pos.y, r, r * 0.92).stroke({ width: 0.16, color: ACCENT });
    const t = 0.38;
    g.moveTo(b.pos.x - r - t, b.pos.y).lineTo(b.pos.x - r + t, b.pos.y);
    g.moveTo(b.pos.x + r - t, b.pos.y).lineTo(b.pos.x + r + t, b.pos.y);
    g.moveTo(b.pos.x, b.pos.y - r - t).lineTo(b.pos.x, b.pos.y - r + t);
    g.moveTo(b.pos.x, b.pos.y + r - t).lineTo(b.pos.x, b.pos.y + r + t);
    g.stroke({ width: 0.24, color: INK });
    g.moveTo(b.pos.x - r - t + 0.05, b.pos.y).lineTo(b.pos.x - r + t - 0.05, b.pos.y);
    g.moveTo(b.pos.x + r - t + 0.05, b.pos.y).lineTo(b.pos.x + r + t - 0.05, b.pos.y);
    g.moveTo(b.pos.x, b.pos.y - r - t + 0.05).lineTo(b.pos.x, b.pos.y - r + t - 0.05);
    g.moveTo(b.pos.x, b.pos.y + r - t + 0.05).lineTo(b.pos.x, b.pos.y + r + t - 0.05);
    g.stroke({ width: 0.11, color: ACCENT });
  }
  const ends = arrowEnds(m.from, m.to);
  if (!ends) return;
  const { a, b } = ends;
  const L = dist(a, b);
  const ux = (b.x - a.x) / L;
  const uy = (b.y - a.y) / L;
  const head = Math.min(1.1, L * 0.4);
  const base = { x: b.x - ux * head, y: b.y - uy * head };
  const w = head * 0.6;
  const tri = [b.x, b.y, base.x - uy * w, base.y + ux * w, base.x + uy * w, base.y - ux * w];
  const shaft = (width: number, color: number) => {
    if (m.melee) {
      g.moveTo(a.x, a.y).lineTo(base.x, base.y).stroke({ width, color, cap: "round" });
      return;
    }
    // Shots: a dashed shaft.
    const dash = 0.7;
    const gap = 0.35;
    const len = dist(a, base);
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(len, d + dash);
      g.moveTo(a.x + ux * d, a.y + uy * d).lineTo(a.x + ux * e, a.y + uy * e);
    }
    g.stroke({ width, color, cap: "round" });
  };
  shaft(0.46, INK);
  shaft(0.26, m.color);
  g.poly(tri).fill(m.color).stroke({ width: 0.12, color: INK });
}

/** A small hourglass over a unit exhausted from disengaging (sits out the assault phase). */
export function drawExhausted(g: Graphics, at: Vec, r: number): void {
  const x = at.x + r * 0.9;
  const y = at.y - r - 0.55;
  const s = 0.32;
  g.circle(x, y, s * 1.45).fill({ color: 0xfbf3e0 }).stroke({ width: 0.09, color: INK });
  g.poly([x - s * 0.7, y - s, x + s * 0.7, y - s, x, y, x + s * 0.7, y + s, x - s * 0.7, y + s, x, y]).fill(0xb98a4a).stroke({ width: 0.07, color: INK });
  dashCircle(g, at.x, at.y, r + 0.28, 10, 0.55, 0, (r + 0.28) * 0.92);
  g.stroke({ width: 0.09, color: 0xb98a4a, alpha: 0.95 });
}
