// The base layer (from Option D): a flat footprint under every model that is true to the rules. Drop
// shadow, ground disc, team ring, a facing wedge, and the status read-outs: selection ring, wound
// pips, engaged / shaken / flying glyphs. Drawn as vectors in board inches, with line weights held
// in screen pixels (redrawn when the zoom moves a step), so it stays crisp at every zoom. Status
// never uses team colours, and every glyph differs by shape, not only by colour.

import { Container, Graphics } from "pixi.js";
import { hexToNum, lightOf, numToHex } from "./color";
import type { RigView, Status } from "./types";

const INK = 0x141414;
const CREAM = 0xf4eedc;
const SELECT = 0xfff1c4;
const SHIELD = 0x7fe7ff;
/** Drawn in hundredths of an inch (Pixi picks circle segment counts from the radius in local units). */
const S = 100;

export interface FootprintLook {
  /** Base radius (inches). */
  r: number;
  team: number;
  ground: string;
  view: RigView;
  /** Top view: the figure's drop shadow (inches, from the base centre). */
  shadow?: { x: number; y: number; r: number };
}

export class Footprint {
  readonly root = new Container();
  private inner = new Container();
  /** Drop shadow (moves for flyers). */
  private shadow = new Graphics();
  private base = new Graphics();
  /** Facing wedge and (top view) the lit front arc: rotated, not redrawn. */
  private wedge = new Graphics();
  private marks = new Graphics();
  private sig = "";
  private wedgeSig = "";

  constructor(private look: FootprintLook) {
    this.inner.scale.set(1 / S);
    this.inner.addChild(this.shadow, this.base, this.wedge, this.marks);
    this.root.addChild(this.inner);
  }

  /** Point the facing wedge (radians, board angle: 0 = +x, y down). */
  setFacing(rad: number): void {
    this.wedge.rotation = rad + Math.PI / 2;
  }

  /** Slide the figure's shadow (flyers): 0 = under it, 1 = fully off to the lower right. */
  setShadow(slide: number, lift: number): void {
    const k = slide * (0.4 + lift * 0.35);
    this.shadow.position.set(k * 0.6 * S, k * S);
    this.shadow.alpha = 1 - Math.min(0.45, slide * 0.35);
  }

  draw(st: Status, ppi: number): void {
    // line weights are held in screen pixels; redraw only when the zoom moves ~12%
    const bucket = Math.round(Math.log(ppi) / Math.log(1.12));
    const sig = `${bucket}|${st.selected}|${st.hp}/${st.hpMax}|${st.shield}/${st.shieldMax}|${st.engaged}|${st.shaken}|${st.flying}|${st.spent}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const px = S / Math.pow(1.12, bucket);
    const { team, ground, view } = this.look;
    const r = this.look.r * S;

    const sh = this.shadow.clear();
    if (view === "top" && this.look.shadow) {
      const s = { x: this.look.shadow.x * S, y: this.look.shadow.y * S, r: this.look.shadow.r * S };
      sh.circle(r * 0.06, r * 0.1, r * 1.03).fill({ color: INK, alpha: 0.4 });
      sh.circle(s.x, s.y, s.r).fill({ color: INK, alpha: 0.3 });
    } else sh.ellipse(r * 0.08, r * 0.14, r * 1.04, r * 1.0).fill({ color: INK, alpha: 0.45 });

    const g = this.base.clear();
    const ring = Math.max(r * 0.18, 3 * px);
    if (st.selected) {
      g.circle(0, 0, r * 1.3).stroke({ width: 9 * px, color: SELECT, alpha: 0.25 });
    }
    g.circle(0, 0, r).fill(hexToNum(ground)).stroke({ width: 1.5 * px, color: INK });
    // contact shadow under the feet, inside the ground (side view: the figure stands here)
    if (view === "side") g.ellipse(r * 0.08, r * 0.05, r * 0.55, r * 0.3).fill({ color: INK, alpha: st.flying ? 0.2 : 0.35 });
    const rr = r - 0.75 * px - ring / 2;
    g.circle(0, 0, rr).stroke({ width: ring, color: st.spent ? mute(team) : team });
    // a thin light bevel on the ring's upper-left arc
    g.arc(0, 0, rr + ring * 0.18, Math.PI * 1.05, Math.PI * 1.62).stroke({ width: ring * 0.32, color: hexToNum(lightOf(numToHex(team), 0.2)), alpha: 0.85 });
    g.circle(0, 0, r - ring - 0.75 * px).stroke({ width: 1 * px, color: INK, alpha: 0.6 });
    if (st.selected) dashed(g, r * 1.3, 2.6 * px, SELECT, 16);

    // facing wedge on the rim (and the lit front arc when engaged, top view)
    const ws = `${bucket}|${st.engaged}`;
    if (ws !== this.wedgeSig) {
      this.wedgeSig = ws;
      const w = this.wedge.clear();
      if (st.engaged && view === "top") w.arc(0, 0, r + 1.5 * px, -Math.PI / 2 - 0.85, -Math.PI / 2 + 0.85).stroke({ width: 3 * px, color: SELECT, alpha: 0.95 });
      const tw = Math.max(r * 0.24, 4 * px);
      const th = Math.max(r * 0.3, 5 * px);
      w.poly([-tw, -r + 0.5 * px, 0, -r - th, tw, -r + 0.5 * px]).fill(CREAM).stroke({ width: 1 * px, color: INK, join: "round" });
    }

    // status marks: wound pips on the rim, glyph badges round it
    const m = this.marks.clear();
    const total = st.hpMax + st.shieldMax;
    if (total > 1) {
      const pr = Math.max(2.4 * px, r * 0.09);
      const step = (pr * 2.5) / r;
      const a0 = Math.PI / 2 + ((total - 1) * step) / 2;
      for (let i = 0; i < total; i++) {
        const a = a0 - i * step;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        const shield = i >= st.hpMax;
        const on = shield ? i - st.hpMax < st.shield : i < st.hp;
        if (on) m.circle(x, y, pr).fill(shield ? SHIELD : CREAM).stroke({ width: 1.2 * px, color: INK });
        else m.circle(x, y, pr).fill(INK).stroke({ width: 1.1 * px, color: CREAM });
      }
    }
    const badge = (deg: number, draw: (x: number, y: number, s: number) => void) => {
      const s = Math.max(6 * px, r * 0.2);
      const a = (deg * Math.PI) / 180;
      const x = Math.cos(a) * (r + s * 0.4);
      const y = Math.sin(a) * (r + s * 0.4);
      m.circle(x, y, s).fill(INK).stroke({ width: 1.3 * px, color: CREAM });
      draw(x, y, s);
    };
    const line = { width: 1.6 * px, color: CREAM, cap: "round" as const, join: "round" as const };
    if (st.engaged)
      badge(150, (x, y, s) => {
        const k = s * 0.5;
        m.moveTo(x - k, y - k).lineTo(x + k, y + k).moveTo(x + k, y - k).lineTo(x - k, y + k).stroke(line);
        m.moveTo(x - k * 1.2, y + k * 0.3).lineTo(x - k * 0.3, y + k * 1.2).moveTo(x + k * 1.2, y + k * 0.3).lineTo(x + k * 0.3, y + k * 1.2).stroke({ ...line, width: 1.2 * px });
      });
    if (st.shaken)
      badge(210, (x, y, s) => {
        const k = s * 0.6;
        m.moveTo(x - k * 0.1, y - k).lineTo(x - k * 0.5, y).lineTo(x + k * 0.3, y).lineTo(x - k * 0.15, y + k).stroke(line);
      });
    if (st.flying)
      badge(30, (x, y, s) => {
        const k = s * 0.5;
        m.moveTo(x - k, y + k * 0.1).lineTo(x, y - k * 0.8).lineTo(x + k, y + k * 0.1).stroke(line);
        m.moveTo(x - k, y + k * 0.9).lineTo(x, y).lineTo(x + k, y + k * 0.9).stroke(line);
      });
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

function dashed(g: Graphics, r: number, width: number, color: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.moveTo(Math.cos(a) * r, Math.sin(a) * r).arc(0, 0, r, a, a + (Math.PI * 2 * 0.6) / n);
  }
  g.stroke({ width, color, cap: "round" });
}

function mute(c: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const y = (r + g + b) / 3;
  const m = (v: number) => Math.round(v * 0.45 + y * 0.35);
  return (m(r) << 16) | (m(g) << 8) | m(b);
}
