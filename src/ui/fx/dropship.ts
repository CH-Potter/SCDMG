// Arrival visuals for support airdrops, in each faction's own style: the Militia's patched-up
// drop-ship swoops in from its own table edge and clatters off again; Munch critters burst up out of
// the dirt; the Concord step out of a ring of light. Also the no-go rings shown while aiming. Board
// units are inches; everything respects `reduced` (prefers-reduced-motion).

import { Container, Graphics } from "pixi.js";
import { abilityOf } from "../../engine/reactions";
import { profileOf } from "../../engine/profile";
import { aliveModels, HOME_EXCLUSION, onBoard } from "../../engine/rules";
import type { GameEvent, GameState, PlayerId, SupportEffect, Unit, Vec } from "../../engine/types";
import { dashCircle, INK, PLAYER_COLORS, shade } from "../boardArt";
import { easeInOut, easeOut } from "../fx";

export interface NoGoRing {
  center: Vec;
  radius: number;
}

/**
 * Where an airdrop can't land: a ring around each enemy unit (its models plus the minimum distance)
 * and around the enemy's home objective. One ring per unit keeps the overlay readable.
 */
export function airdropNoGo(s: GameState, player: PlayerId, e: Extract<SupportEffect, { kind: "airdrop" }>): NoGoRing[] {
  const rings: NoGoRing[] = [];
  for (const u of onBoard(s)) {
    if (u.owner === player) continue;
    const ms = aliveModels(u);
    if (!ms.length) continue;
    const c = { x: ms.reduce((n, m) => n + m.pos.x, 0) / ms.length, y: ms.reduce((n, m) => n + m.pos.y, 0) / ms.length };
    const spread = Math.max(...ms.map((m) => Math.hypot(m.pos.x - c.x, m.pos.y - c.y)));
    rings.push({ center: c, radius: spread + profileOf(u).baseRadius + e.minEnemyDistance });
  }
  for (const o of s.objectives) if (o.team !== null && o.team !== player) rings.push({ center: o.pos, radius: o.radius + HOME_EXCLUSION });
  return rings;
}

const NO_GO = 0xe0483a;

/** Draw the no-go rings into an overlay Graphics: a faint red wash with a dashed edge. */
export function drawNoGo(g: Graphics, rings: NoGoRing[]): void {
  for (const r of rings) g.circle(r.center.x, r.center.y, r.radius).fill({ color: NO_GO, alpha: 0.1 });
  for (const r of rings) dashCircle(g, r.center.x, r.center.y, r.radius, Math.max(16, Math.round(r.radius * 4)), 0.55);
  g.stroke({ width: 0.16, color: INK, alpha: 0.45 });
  for (const r of rings) dashCircle(g, r.center.x, r.center.y, r.radius, Math.max(16, Math.round(r.radius * 4)), 0.55);
  g.stroke({ width: 0.08, color: NO_GO, alpha: 0.95 });
}

interface Item {
  obj: Container;
  t: number;
  dur: number;
  step: (k: number) => void;
}

const clamp01 = (k: number): number => (k < 0 ? 0 : k > 1 ? 1 : k);

/** The drop-ship fly-in. Add `root` above the models and call `update` every frame. */
export class DropShipFx {
  readonly root = new Container();
  reduced = false;
  private items: Item[] = [];

  clear(): void {
    for (const it of this.items) it.obj.destroy({ children: true });
    this.items = [];
  }

  update(dt: number): void {
    if (!this.items.length) return;
    const keep: Item[] = [];
    const current = this.items;
    this.items = []; // effects started from inside a step land here
    for (const it of current) {
      it.t += dt;
      if (it.t < 0) {
        keep.push(it); // still waiting its turn
        continue;
      }
      it.obj.visible = true;
      const k = clamp01(it.t / it.dur);
      it.step(k);
      if (k >= 1) it.obj.destroy({ children: true });
      else keep.push(it);
    }
    this.items = [...keep, ...this.items];
  }

  private add(obj: Container, delay: number, dur: number, step: (k: number) => void): void {
    obj.visible = false;
    this.root.addChild(obj);
    this.items.push({ obj, t: -delay, dur, step });
  }

  /**
   * Fly a drop-ship in for every unit a support airdrop landed in `events`. Returns how long (ms)
   * until each of those units touches down, so the renderer can hold their arrival until then.
   */
  fromEvents(events: GameEvent[], units: Map<string, Unit>, board: { width: number; height: number }): Map<string, number> {
    const out = new Map<string, number>();
    const airdrop = events.some((e) => e.type === "support" && abilityOf(e.support, e.ability)?.effect.kind === "airdrop");
    if (!airdrop) return out;
    for (const e of events) {
      if (e.type !== "deployed") continue;
      const u = units.get(e.uid);
      const ms = u ? aliveModels(u) : [];
      if (!u || !ms.length) continue;
      const at = { x: ms.reduce((n, m) => n + m.pos.x, 0) / ms.length, y: ms.reduce((n, m) => n + m.pos.y, 0) / ms.length };
      const spread = Math.max(1, ...ms.map((m) => Math.hypot(m.pos.x - at.x, m.pos.y - at.y) + profileOf(u).baseRadius));
      // Each faction arrives its own way; custom factions borrow the drop-ship.
      const faction = profileOf(u).faction;
      const ms2 =
        faction === "munch" ? this.burst(at, spread) : faction === "concord" ? this.portal(at, spread, u.owner) : this.land(at, spread, u.owner, board);
      out.set(u.uid, ms2);
    }
    return out;
  }

  /** One drop-ship landing at `at`. Returns the touchdown time in ms. */
  land(at: Vec, spread: number, owner: PlayerId, board: { width: number; height: number }): number {
    const color = PLAYER_COLORS[owner] ?? 0xf28c28;
    if (this.reduced) {
      this.dust(at, spread, 0);
      return 0;
    }
    const dur = 1500;
    const touch = 0.55;
    // In from the owner's own table edge, out over the far side.
    const dir = owner === 0 ? 1 : -1;
    const from = { x: at.x - dir * 6, y: owner === 0 ? board.height + 8 : -8 };
    const to = { x: at.x + dir * 10, y: owner === 0 ? -10 : board.height + 10 };
    const ship = new Container();
    const shadow = new Graphics();
    const body = new Graphics();
    drawShip(body, color);
    ship.addChild(shadow, body);
    let dusted = false;
    this.add(ship, 0, dur, (k) => {
      let p: Vec;
      let alt: number;
      if (k < touch) {
        const q = easeOut(k / touch);
        p = { x: from.x + (at.x - from.x) * q, y: from.y + (at.y - from.y) * q };
        alt = 5 * (1 - q) + 1.2;
      } else if (k < touch + 0.12) {
        p = at;
        alt = 1.2 + Math.sin(((k - touch) / 0.12) * Math.PI) * 0.15;
      } else {
        const q = easeInOut((k - touch - 0.12) / (1 - touch - 0.12));
        p = { x: at.x + (to.x - at.x) * q, y: at.y + (to.y - at.y) * q };
        alt = 1.2 + q * 6;
      }
      if (!dusted && k >= touch) {
        dusted = true;
        this.dust(at, spread, 0);
      }
      const wobble = Math.sin(k * 40) * 0.05;
      body.position.set(p.x, p.y - alt);
      body.rotation = wobble + (k < touch ? -dir * 0.12 * (1 - k / touch) : k > touch + 0.12 ? dir * 0.18 : 0);
      body.scale.set(1 + alt * 0.05);
      shadow.clear();
      const sa = 0.35 * (1 - clamp01((alt - 1.2) / 6));
      shadow.ellipse(p.x, p.y, 1.8, 0.7).fill({ color: 0x000000, alpha: sa });
      // Engine wash: little puffs trailing behind.
      for (let i = 0; i < 3; i++) {
        const f = (k * 30 + i * 0.33) % 1;
        shadow.circle(p.x - dir * 0.6 * i, p.y - alt + 0.7 + f * 0.6, 0.18 + f * 0.25).fill({ color: 0xffc46b, alpha: 0.7 * (1 - f) });
      }
      ship.alpha = k > 0.9 ? 1 - (k - 0.9) / 0.1 : 1;
    });
    return dur * touch;
  }

  /** Munch arrival: the ground bulges, cracks open and flings dirt clods out. Returns the pop-out time in ms. */
  burst(at: Vec, spread: number): number {
    if (this.reduced) {
      this.dust(at, spread, 0);
      return 0;
    }
    const dur = 900;
    const pop = 0.45;
    const g = new Graphics();
    g.position.set(at.x, at.y);
    const cracks = 7;
    const clods = 9;
    this.add(g, 0, dur, (k) => {
      g.clear();
      if (k < pop) {
        // The bulge: a mound swelling with a ring of cracks.
        const q = easeOut(k / pop);
        const r = spread * (0.4 + 0.5 * q);
        g.ellipse(0, 0, r, r * 0.6).fill({ color: 0x8a6438, alpha: 0.9 }).stroke({ width: 0.08, color: INK });
        g.ellipse(0, -0.08 * q, r * 0.55, r * 0.33).fill({ color: 0xa97c48, alpha: 0.9 });
        for (let i = 0; i < cracks; i++) {
          const a = (i / cracks) * Math.PI * 2 + 0.2;
          const l = r * (0.6 + 0.5 * q);
          g.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.18).lineTo(Math.cos(a) * l, Math.sin(a) * l * 0.6);
        }
        g.stroke({ width: 0.07, color: INK, alpha: 0.85 });
      } else {
        // Burst: clods fly outwards and fall, the hole fades.
        const q = (k - pop) / (1 - pop);
        const a = 1 - clamp01((q - 0.4) / 0.6);
        g.ellipse(0, 0, spread * 0.8, spread * 0.48).fill({ color: 0x3a2a1a, alpha: 0.75 * a }).stroke({ width: 0.08, color: INK, alpha: a });
        for (let i = 0; i < clods; i++) {
          const ang = (i / clods) * Math.PI * 2 + 0.5;
          const d = spread * (0.6 + 1.1 * easeOut(q)) * (i % 2 ? 0.8 : 1);
          const hop = Math.sin(q * Math.PI) * (0.9 + (i % 3) * 0.3);
          g.circle(Math.cos(ang) * d, Math.sin(ang) * d * 0.6 - hop, 0.2 * (i % 3 ? 1 : 1.4)).fill({ color: 0x7a5530, alpha: a }).stroke({ width: 0.05, color: INK, alpha: a });
        }
      }
    });
    return dur * pop;
  }

  /** Concord arrival: a ring of light opens, flares and closes behind the newcomers. Returns the step-out time in ms. */
  portal(at: Vec, spread: number, owner: PlayerId): number {
    const glow = 0xf4e9ff;
    const tint = shade(PLAYER_COLORS[owner] ?? 0xb48cf2, 0.25);
    const g = new Graphics();
    g.position.set(at.x, at.y);
    const dur = this.reduced ? 400 : 1100;
    const open = 0.4;
    const sparks = this.reduced ? 0 : 12;
    this.add(g, 0, dur, (k) => {
      g.clear();
      const size = k < open ? easeOut(k / open) : k > 0.75 ? 1 - easeInOut((k - 0.75) / 0.25) : 1;
      const r = spread * 1.15 * size;
      if (r <= 0.01) return;
      g.ellipse(0, 0, r, r * 0.55).fill({ color: tint, alpha: 0.28 }).stroke({ width: 0.16, color: INK, alpha: 0.7 });
      g.ellipse(0, 0, r, r * 0.55).stroke({ width: 0.1, color: glow, alpha: 0.95 });
      g.ellipse(0, 0, r * 0.7, r * 0.38).stroke({ width: 0.06, color: tint, alpha: 0.9 });
      // A flash as they step through.
      if (k > open - 0.05 && k < open + 0.2) {
        const f = 1 - Math.abs(k - (open + 0.07)) / 0.13;
        g.ellipse(0, 0, r * 0.9, r * 0.5).fill({ color: glow, alpha: 0.6 * clamp01(f) });
      }
      for (let i = 0; i < sparks; i++) {
        const a = (i / sparks) * Math.PI * 2 + k * 3;
        const rise = ((k * 2 + i * 0.37) % 1) * 1.6;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r * 0.55 - rise;
        g.star(x, y, 4, 0.14 * size, 0.05 * size).fill({ color: glow, alpha: 0.9 * (1 - rise / 1.6) });
      }
    });
    return dur * open;
  }

  /** Dust kicked up on landing: inked puffs that roll outwards and fade. */
  private dust(at: Vec, r: number, delay: number): void {
    const g = new Graphics();
    g.position.set(at.x, at.y);
    const dur = this.reduced ? 350 : 800;
    const puffs = this.reduced ? 4 : 10;
    this.add(g, delay, dur, (k) => {
      g.clear();
      const a = 1 - clamp01((k - 0.3) / 0.7);
      const spread = this.reduced ? r : r * (0.5 + easeOut(k) * 0.9);
      for (let i = 0; i < puffs; i++) {
        const ang = (i / puffs) * Math.PI * 2 + 0.3;
        const pr = 0.45 * (1 - k * 0.4) * (i % 2 ? 0.75 : 1);
        const x = Math.cos(ang) * spread;
        const y = Math.sin(ang) * spread * 0.6;
        g.circle(x, y, pr).fill({ color: 0xcdb48c, alpha: a * 0.85 }).stroke({ width: 0.05, color: INK, alpha: a * 0.6 });
      }
    });
  }
}

/** A stubby, rivet-patched cargo hauler with a stuck-open ramp. Drawn around (0, 0), about 3.6" long. */
function drawShip(g: Graphics, color: number): void {
  const hull = shade(color, -0.1);
  const dark = shade(color, -0.45);
  // engine pods
  g.roundRect(-1.9, -0.25, 0.7, 0.9, 0.25).fill(dark).stroke({ width: 0.08, color: INK });
  g.roundRect(1.2, -0.25, 0.7, 0.9, 0.25).fill(dark).stroke({ width: 0.08, color: INK });
  // hull
  g.ellipse(0, 0, 1.5, 0.75).fill(hull).stroke({ width: 0.1, color: INK });
  // rust patches and rivets
  g.roundRect(-0.9, -0.15, 0.55, 0.4, 0.08).fill(0x9a5a2c).stroke({ width: 0.05, color: INK });
  g.roundRect(0.4, 0.1, 0.45, 0.32, 0.06).fill(0x7d8a8f).stroke({ width: 0.05, color: INK });
  for (const [x, y] of [[-0.85, -0.1], [-0.4, -0.1], [-0.85, 0.2], [-0.4, 0.2], [0.45, 0.15], [0.8, 0.15]] as const) g.circle(x, y, 0.04).fill(INK);
  // cockpit
  g.ellipse(0.2, -0.4, 0.5, 0.28).fill(0xbfe8ff).stroke({ width: 0.07, color: INK });
  g.ellipse(0.05, -0.47, 0.16, 0.08).fill({ color: 0xffffff, alpha: 0.9 });
  // lantern "landing light"
  g.moveTo(-0.2, 0.7).lineTo(-0.2, 0.95).stroke({ width: 0.05, color: INK });
  g.circle(-0.2, 1.02, 0.1).fill(0xffd34d).stroke({ width: 0.04, color: INK });
}
