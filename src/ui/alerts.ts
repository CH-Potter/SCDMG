// Comic-strip call-outs: short, punchy alert panels that narrate the battle on top of the board.
// They show one at a time, in order, each long enough to read, so a busy moment reads like a strip
// of panels rather than a pile-up. `idle()` lets the game wait for the story to catch up.

import "./hud.css";

export type AlertTone = "you" | "ai" | "neutral" | "good" | "bad";

export interface AlertOpts {
  tone?: AlertTone;
  sub?: string;
  /** A headline panel (turn changes, game over). */
  big?: boolean;
  /** How long it stays up (ms). */
  ms?: number;
}

/** Normal and headline display times (ms), before any catch-up speed-up. */
const SHOW_MS = 1300;
const BIG_MS = 1800;
/** With this many panels waiting, the queue speeds up so the story never lags far behind play. */
const BACKLOG = 3;

export class ComicAlerts {
  private el: HTMLDivElement;
  private chain: Promise<void> = Promise.resolve();
  private waiting = 0;
  private dead = false;

  constructor(host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "comic-alerts";
    this.el.setAttribute("aria-live", "polite");
    host.appendChild(this.el);
  }

  destroy(): void {
    this.dead = true;
    this.el.remove();
  }

  /** Resolves once every queued panel has been shown. */
  idle(): Promise<void> {
    return this.chain;
  }

  /** Queue a call-out. Resolves once it has been shown and is on its way out. */
  push(text: string, opts: AlertOpts = {}): Promise<void> {
    this.waiting++;
    this.chain = this.chain.then(() => this.show(text, opts)).finally(() => this.waiting--);
    return this.chain;
  }

  private show(text: string, opts: AlertOpts): Promise<void> {
    if (this.dead) return Promise.resolve();
    const panel = document.createElement("div");
    panel.className = `comic-alert tone-${opts.tone ?? "neutral"}${opts.big ? " big" : ""}`;
    panel.style.setProperty("--tilt", `${(Math.random() * 4 - 2).toFixed(1)}deg`);
    const head = document.createElement("div");
    head.className = "comic-alert-head";
    head.textContent = text;
    panel.appendChild(head);
    if (opts.sub) {
      const sub = document.createElement("div");
      sub.className = "comic-alert-sub";
      sub.textContent = opts.sub;
      panel.appendChild(sub);
    }
    this.el.replaceChildren(panel);
    requestAnimationFrame(() => panel.classList.add("in"));
    let ms = opts.ms ?? (opts.big ? BIG_MS : SHOW_MS);
    // Catch up when a lot is queued (but never below a readable minimum).
    if (this.waiting > BACKLOG && !opts.big) ms = Math.max(700, ms * 0.6);
    return new Promise((resolve) => {
      window.setTimeout(() => {
        panel.classList.remove("in");
        panel.classList.add("out");
        window.setTimeout(() => panel.remove(), 300);
        resolve();
      }, ms);
    });
  }
}
