// The intro player: a full-window layer with one comic panel, a caption box and a Skip button. Each
// scene is built fresh into the panel by its storyboard (see scripts.ts) with the `Kit` below, and
// animated with the Web Animations API. Anything skips (click, Esc, Space, Enter, the Skip button);
// the layer stops taking input the moment it starts closing. With prefers-reduced-motion the player
// shows the whole storyboard as still comic panels instead, to read at your own pace.

import "./intro.css";
import { audio } from "../../audio";
import type { SfxName } from "../../audio/mapping";
import { factionOf, PROFILES } from "../../engine/data/factions";
import { factionEmblemSvg } from "../art/emblems";
import { figureDataUrl, figureSpec, miniFraming } from "../art/figures";
import { esc } from "../describe";
import { markIntroSeen, type IntroId } from "./prefs";
import { IntroRunner, isSkipKey, sceneAt, sceneStarts, totalDuration, type EndReason } from "./runner";

export interface SceneDef {
  /** How long the scene runs (ms). */
  dur: number;
  caption: string;
  build(k: Kit): void;
}

export interface IntroDef {
  /** An intro id (remembered as seen once played), or "story" for a campaign story scene (never remembered). */
  id: IntroId | "story";
  /** For the layer's accessible name, e.g. "The Dustline" or "The Skitterswarm". */
  title: string;
  /** Unit profile ids the scenes use, painted before the intro starts. */
  cast: string[];
  scenes: SceneDef[];
}

export interface PlayOptions {
  /** Called once the layer is gone. */
  onClose?: (reason: EndReason) => void;
  /** Force the still storyboard (true) or the animation (false); default: follow prefers-reduced-motion. */
  reduced?: boolean;
  /** Dev review: freeze at this time (ms) instead of playing. */
  freezeAt?: number;
}

export interface IntroHandle {
  close(): void;
  done: Promise<EndReason>;
}

/** Feet position in % of the panel; sizes in cqh (percent of panel height). */
export interface MiniOpts {
  x: number;
  y: number;
  /** Panel-height percent per inch of miniature (default 16). */
  k?: number;
  flip?: boolean;
  /** Stand it on its base (ring in the faction colour). */
  base?: boolean;
  z?: number;
  /** Idle breathing. */
  bob?: boolean;
}

export interface AnimOpts {
  /** Start, ms after the scene starts. */
  at?: number;
  dur?: number;
  ease?: string;
  iterations?: number;
  direction?: PlaybackDirection;
  /** In the still storyboard, freeze at this fraction of the animation (default: its end). */
  hold?: number;
}

export interface Kit {
  /** The scene's root element (inside the panel; container queries resolve against the panel). */
  root: HTMLElement;
  /** True when building a still panel (reduced motion). */
  still: boolean;
  dur: number;
  /** Add an element. `style` is a CSS text string. */
  add(cls: string, html?: string, style?: string, parent?: HTMLElement): HTMLElement;
  /** A full-panel backdrop from an SVG string. */
  backdrop(svg: string, cls?: string): HTMLElement;
  /** A miniature, feet at (x%, y%). Returns the element to animate. */
  mini(unitId: string, o: MiniOpts): HTMLElement;
  /** A faction emblem centred at (x%, y%), `size` in cqh. */
  emblem(factionId: string, x: number, y: number, size: number): HTMLElement;
  /** A speech bubble; the tail points down-left from (x%, y%) unless `right`. */
  bubble(text: string, x: number, y: number, o?: { w?: number; right?: boolean; at?: number; shout?: boolean }): HTMLElement;
  /** A comic sound-effect starburst centred at (x%, y%). */
  burst(word: string, x: number, y: number, o?: { size?: number; at?: number; color?: string; rot?: number }): HTMLElement;
  anim(el: Element, frames: Keyframe[] | PropertyIndexedKeyframes, o?: AnimOpts): void;
  /** Pop in (scale up from nothing with a little overshoot). */
  pop(el: Element, at?: number, dur?: number): void;
  /** Fade in. */
  fadeIn(el: Element, at?: number, dur?: number): void;
  /** Shake the panel. */
  shake(at: number, strength?: number, dur?: number): void;
  /** A dust puff at (x%, y%). */
  dust(x: number, y: number, at: number, size?: number): void;
  sfx(name: SfxName, at: number, gain?: number): void;
}

const MINI_PX = 240;

const reducedMotion = (): boolean => {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
};

/** Paint a unit's miniature (cached by figures.ts). */
function miniUrl(unitId: string, base: boolean): string | null {
  const p = PROFILES[unitId];
  if (!p) return null;
  try {
    const f = factionOf(p.faction);
    return figureDataUrl(figureSpec(p, f.look, f.color), base ? f.color : null, MINI_PX);
  } catch {
    return null;
  }
}

/** Paint the cast a few at a time so the page stays responsive. */
async function warmCast(cast: readonly string[], alive: () => boolean): Promise<void> {
  for (const id of cast) {
    if (!alive()) return;
    miniUrl(id, false);
    await new Promise((r) => setTimeout(r, 0));
  }
}

class SceneKit implements Kit {
  readonly anims: Animation[] = [];
  readonly timers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    readonly root: HTMLElement,
    readonly still: boolean,
    readonly dur: number,
    private readonly panel: HTMLElement,
  ) {}

  add(cls: string, html = "", style = "", parent: HTMLElement = this.root): HTMLElement {
    const el = document.createElement("div");
    el.className = cls;
    if (html) el.innerHTML = html;
    if (style) el.style.cssText = style;
    parent.appendChild(el);
    return el;
  }

  backdrop(svg: string, cls = ""): HTMLElement {
    return this.add(`ix-backdrop ${cls}`, svg);
  }

  mini(unitId: string, o: MiniOpts): HTMLElement {
    const p = PROFILES[unitId];
    const k = o.k ?? 16;
    let size = 2;
    let feet = 0.75;
    if (p) {
      try {
        const f = factionOf(p.faction);
        const fr = miniFraming(figureSpec(p, f.look, f.color));
        size = fr.size;
        feet = fr.feet;
      } catch {
        /* keep defaults */
      }
    }
    const S = size * k;
    const wrap = this.add(
      "ix-mini",
      "",
      `width:${S.toFixed(2)}cqh;height:${S.toFixed(2)}cqh;left:calc(${o.x}% - ${(S / 2).toFixed(2)}cqh);top:calc(${o.y}% - ${(S * feet).toFixed(2)}cqh);z-index:${o.z ?? Math.round(o.y)}`,
    );
    const mover = this.add("ix-mover", "", "", wrap);
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.decoding = "async";
    const url = miniUrl(unitId, !!o.base);
    if (url) img.src = url;
    if (o.flip) img.classList.add("ix-flip");
    if (o.bob) {
      img.classList.add("ix-bob");
      img.style.animationDelay = `${-((o.x * 37 + o.y * 13) % 1000)}ms`;
    }
    mover.appendChild(img);
    return mover;
  }

  emblem(factionId: string, x: number, y: number, size: number): HTMLElement {
    return this.add("ix-emblem", factionEmblemSvg(factionId, 128), `left:${x}%;top:${y}%;width:${size}cqh;height:${size}cqh;margin:${-size / 2}cqh 0 0 ${-size / 2}cqh`);
  }

  bubble(text: string, x: number, y: number, o: { w?: number; right?: boolean; at?: number; shout?: boolean } = {}): HTMLElement {
    const b = this.add(
      `ix-bubble ${o.right ? "ix-tail-right" : ""} ${o.shout ? "ix-shout" : ""}`,
      esc(text),
      `${o.right ? `right:${100 - x}%` : `left:${x}%`};bottom:${100 - y}%;max-width:${o.w ?? 40}cqw`,
    );
    this.pop(b, o.at ?? 300, 320);
    return b;
  }

  burst(word: string, x: number, y: number, o: { size?: number; at?: number; color?: string; rot?: number } = {}): HTMLElement {
    const s = o.size ?? 26;
    const pts: string[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = i % 2 ? 31 : 48 - ((i * 7) % 5) * 1.6;
      pts.push(`${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r * 0.78).toFixed(1)}`);
    }
    const el = this.add(
      "ix-burst",
      `<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="${pts.join(" ")}" transform="translate(2.5 2.5)" fill="#1c1512"/><polygon points="${pts.join(" ")}" fill="${o.color ?? "#ffc23a"}" stroke="#1c1512" stroke-width="2.6" stroke-linejoin="round"/></svg><span>${esc(word)}</span>`,
      `left:${x}%;top:${y}%;width:${s * 1.6}cqh;height:${s * 1.6}cqh;margin:${-s * 0.8}cqh 0 0 ${-s * 0.8}cqh;font-size:${s * 0.3}cqh`,
    );
    const rot = `rotate(${o.rot ?? -8}deg)`;
    this.anim(el, [{ transform: "scale(0) rotate(-30deg)", opacity: 0 }, { transform: `scale(1.15) ${rot}`, opacity: 1, offset: 0.6 }, { transform: `scale(1) ${rot}`, opacity: 1 }], {
      at: o.at ?? 0,
      dur: 360,
      ease: "cubic-bezier(.2,1.4,.4,1)",
    });
    return el;
  }

  anim(el: Element, frames: Keyframe[] | PropertyIndexedKeyframes, o: AnimOpts = {}): void {
    const at = o.at ?? 0;
    const dur = o.dur ?? 500;
    let a: Animation;
    try {
      a = el.animate(frames, { delay: at, duration: dur, easing: o.ease ?? "ease-out", fill: "both", iterations: o.iterations ?? 1, direction: o.direction ?? "normal" });
    } catch {
      return; // old engines: the element just stays as it is
    }
    this.anims.push(a);
    if (this.still) {
      a.pause();
      const iters = Number.isFinite(o.iterations ?? 1) ? (o.iterations ?? 1) : 1;
      const hold = o.hold ?? 1;
      a.currentTime = at + dur * Math.min(iters, 1) * hold - (hold >= 1 ? 0.01 : 0);
    }
  }

  pop(el: Element, at = 0, dur = 380): void {
    this.anim(el, [{ transform: "scale(0)", opacity: 0 }, { transform: "scale(1.12)", opacity: 1, offset: 0.65 }, { transform: "scale(1)", opacity: 1 }], { at, dur, ease: "ease-out" });
  }

  fadeIn(el: Element, at = 0, dur = 400): void {
    this.anim(el, [{ opacity: 0 }, { opacity: 1 }], { at, dur });
  }

  shake(at: number, strength = 1, dur = 420): void {
    if (this.still) return;
    const s = 0.9 * strength;
    this.anim(
      this.panel,
      [
        { transform: "translate(0,0)" },
        { transform: `translate(${-s}%, ${s * 0.6}%)` },
        { transform: `translate(${s}%, ${-s * 0.4}%)` },
        { transform: `translate(${-s * 0.6}%, ${-s * 0.5}%)` },
        { transform: `translate(${s * 0.4}%, ${s * 0.3}%)` },
        { transform: "translate(0,0)" },
      ],
      { at, dur, ease: "linear" },
    );
  }

  dust(x: number, y: number, at: number, size = 10): void {
    for (let i = 0; i < 5; i++) {
      const dx = (i - 2) * size * 0.45;
      const d = this.add("ix-dust", "", `left:${x}%;top:${y}%;width:${size * (0.7 + (i % 2) * 0.4)}cqh;height:${size * 0.6}cqh;margin-left:calc(${dx}cqh - ${size / 2}cqh);margin-top:${-size * 0.4}cqh`);
      this.anim(
        d,
        [
          { transform: "translate(0,0) scale(0.2)", opacity: 0.95 },
          { transform: `translate(${dx * 0.8}cqh, ${-size * (0.3 + (i % 3) * 0.2)}cqh) scale(1.3)`, opacity: 0 },
        ],
        { at: at + i * 30, dur: 700, ease: "ease-out", hold: 0.25 },
      );
    }
  }

  sfx(name: SfxName, at: number, gain = 1): void {
    if (this.still) return;
    this.timers.push(setTimeout(() => audio.play(name, undefined, gain), at));
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
    for (const a of this.anims) {
      try {
        a.cancel();
      } catch {
        /* already gone */
      }
    }
    this.anims.length = 0;
  }
}

let active: IntroHandle | null = null;

/** A selector that finds the same control again after a re-render (by id or its first data attribute). */
function focusKey(el: Element | null): string | null {
  if (!el || el === document.body) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const d = [...el.attributes].find((a) => a.name.startsWith("data-") && a.value);
  return d ? `${el.tagName.toLowerCase()}[${d.name}="${CSS.escape(d.value)}"]` : null;
}

/** Play an intro. Only one plays at a time: starting another closes the first. */
export function playIntro(def: IntroDef, opts: PlayOptions = {}): IntroHandle {
  active?.close();
  if (def.id !== "story") markIntroSeen(def.id);
  const still = opts.reduced ?? reducedMotion();
  const prevFocus = document.activeElement as HTMLElement | null;
  const prevKey = focusKey(prevFocus);

  const layer = document.createElement("div");
  layer.className = `intro-layer ${still ? "is-still" : "is-loading"}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", `${def.id === "story" ? "Story" : "Intro"}: ${def.title}`);
  layer.dataset.intro = def.id;
  layer.innerHTML = `
    <div class="intro-top">
      <span class="intro-title">${esc(def.title)}</span>
      <span class="intro-sound intro-keep"></span>
      <button type="button" class="intro-skip">${still ? "Continue ▸" : "Skip ▸▸"}</button>
    </div>
    <div class="intro-body"></div>
    <p class="intro-hint">${still ? "Esc, Space or click to continue" : "Click, Esc or Space to skip"}</p>`;
  document.body.appendChild(layer);
  audio.mountButton(layer.querySelector(".intro-sound"));
  const body = layer.querySelector<HTMLElement>(".intro-body")!;
  const skipBtn = layer.querySelector<HTMLButtonElement>(".intro-skip")!;

  let resolveDone!: (r: EndReason) => void;
  const done = new Promise<EndReason>((r) => (resolveDone = r));
  let closed = false;
  let kit: SceneKit | null = null;
  const stillKits: SceneKit[] = [];
  let runner: IntroRunner | null = null;

  const onKey = (e: KeyboardEvent) => {
    if ((e.target as Element | null)?.closest?.(".audio-pop")) return;
    if (isSkipKey(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      // Space/Enter on the sound button opens its popover rather than skipping.
      if ((e.key === " " || e.key === "Enter") && (e.target as Element | null)?.closest?.(".intro-keep")) {
        (e.target as HTMLElement).click();
        return;
      }
      finish("skipped");
      return;
    }
    if (e.key === "Tab") {
      // Keep focus inside the layer.
      const items = [...layer.querySelectorAll<HTMLElement>("button")];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length]!.focus();
      e.stopPropagation();
      return;
    }
    // The layer is modal: keys don't reach the page underneath.
    e.stopPropagation();
  };
  const onClick = (e: MouseEvent) => {
    if ((e.target as Element | null)?.closest?.(".intro-keep")) return;
    finish("skipped");
  };

  function finish(reason: EndReason): void {
    if (closed) return;
    closed = true;
    runner?.dispose();
    document.removeEventListener("keydown", onKey, true);
    layer.removeEventListener("click", onClick);
    // Stop taking input straight away; fade out, then remove.
    layer.classList.add("is-closing");
    layer.style.pointerEvents = "none";
    const remove = () => {
      kit?.dispose();
      for (const k of stillKits) k.dispose();
      layer.remove();
    };
    try {
      const a = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: still ? 120 : 260, easing: "ease-in" });
      a.onfinish = remove;
      setTimeout(remove, 600); // in case animations are throttled (hidden tab)
    } catch {
      remove();
    }
    if (active === handle) active = null;
    // Give focus back, even if the page re-rendered the button that opened the intro meanwhile.
    const back = prevFocus?.isConnected ? prevFocus : prevKey ? document.querySelector<HTMLElement>(prevKey) : null;
    back?.focus({ preventScroll: true });
    resolveDone(reason);
    opts.onClose?.(reason);
  }

  const handle: IntroHandle = { close: () => finish("skipped"), done };
  active = handle;
  document.addEventListener("keydown", onKey, true);
  layer.addEventListener("click", onClick);
  skipBtn.focus({ preventScroll: true });

  if (still) {
    // The whole storyboard as a comic page.
    body.innerHTML = `<div class="intro-page"></div>`;
    const page = body.querySelector<HTMLElement>(".intro-page")!;
    def.scenes.forEach((sc, i) => {
      const cell = document.createElement("figure");
      cell.className = "intro-cell";
      cell.innerHTML = `<div class="intro-panel"><div class="intro-scene"></div></div><figcaption class="intro-caption">${esc(sc.caption)}</figcaption>`;
      page.appendChild(cell);
      const panel = cell.querySelector<HTMLElement>(".intro-panel")!;
      const k = new SceneKit(cell.querySelector<HTMLElement>(".intro-scene")!, true, sc.dur, panel);
      stillKits.push(k);
      try {
        sc.build(k);
      } catch (err) {
        console.warn(`Intro scene ${i + 1} failed:`, err);
      }
    });
    return handle;
  }

  body.innerHTML = `
    <div class="intro-frame">
      <div class="intro-panel"></div>
      <p class="intro-caption" aria-live="polite"></p>
      <div class="intro-dots" aria-hidden="true">${def.scenes.map(() => `<span></span>`).join("")}</div>
    </div>`;
  const panel = body.querySelector<HTMLElement>(".intro-panel")!;
  const caption = body.querySelector<HTMLElement>(".intro-caption")!;
  const dots = [...body.querySelectorAll<HTMLElement>(".intro-dots span")];
  const durs = def.scenes.map((s) => s.dur);

  const show = (i: number, local = 0, freeze = false) => {
    const sc = def.scenes[i]!;
    const old = panel.querySelector<HTMLElement>(".intro-scene:not(.is-leaving)");
    const prevKit = kit;
    const root = document.createElement("div");
    root.className = "intro-scene";
    panel.appendChild(root);
    kit = new SceneKit(root, false, sc.dur, panel);
    try {
      sc.build(kit);
    } catch (err) {
      console.warn(`Intro scene ${i + 1} failed:`, err);
    }
    if (old && !freeze) {
      old.classList.add("is-leaving");
      const out = old.animate([{ transform: "none", opacity: 1 }, { transform: "translateX(-7%) rotate(-1.5deg)", opacity: 0 }], { duration: 260, easing: "ease-in", fill: "forwards" });
      out.onfinish = () => {
        prevKit?.dispose();
        old.remove();
      };
      root.animate([{ transform: "translateX(8%) rotate(1.5deg) scale(0.97)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 320, easing: "cubic-bezier(.2,1.2,.4,1)" });
    } else if (old) {
      prevKit?.dispose();
      old.remove();
    }
    caption.textContent = sc.caption;
    if (!freeze) caption.animate([{ transform: "translateY(30%) rotate(-1deg)", opacity: 0 }, { transform: "rotate(-1deg)", opacity: 1 }], { duration: 280, easing: "ease-out", fill: "both" });
    dots.forEach((d, j) => d.classList.toggle("on", j <= i));
    if (freeze) {
      for (const a of kit.anims) {
        a.pause();
        a.currentTime = local;
      }
      for (const a of root.getAnimations({ subtree: true })) a.pause();
    }
  };

  const alive = () => !closed;
  void warmCast(def.cast, alive).then(() => {
    if (closed) return;
    layer.classList.remove("is-loading");
    if (opts.freezeAt !== undefined) {
      const { index, local } = sceneAt(durs, opts.freezeAt);
      show(index, local, true);
      return;
    }
    runner = new IntroRunner(durs, { onScene: (i) => show(i), onEnd: (r) => finish(r) });
    runner.start();
  });
  return handle;
}

/** Total running time of an intro (ms). */
export const introLength = (def: IntroDef): number => totalDuration(def.scenes.map((s) => s.dur));
export { sceneStarts };
