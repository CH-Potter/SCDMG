// The dice tray: tumbling 3D (CSS) dice for every roll, so the RNG feels like a real table.
// Rolls are queued and played in order; the AI waits for its dice to settle.
//
// Speeds:
//   throw - your own dice wait in the tray until you throw them (click Throw!, or Space/Enter);
//           the AI's dice roll by themselves. The result is already decided by the game's seeded
//           RNG; throwing is the ceremony, so Undo and replays stay honest.
//   full  - every roll tumbles automatically
//   quick - short tumbles
//   off   - no tray

import "./dice.css";

export type DiceSpeed = "throw" | "full" | "quick" | "off";

export interface DiceGroup {
  label: string;
  rolls: number[];
  /** Success threshold: one number for the group, one per die, or null for "just show it". */
  need?: number | (number | null)[] | null;
  /** Whose dice these are (seat colour): the local player's side (`handSide`) is thrown by hand in throw mode. */
  side: "p0" | "p1" | "neutral";
  /** Text shown after the dice settle (e.g. "3 hits"). */
  result?: string;
}

export interface DiceRoll {
  title: string;
  groups: DiceGroup[];
  /** A big line under the dice once everything settles (e.g. "You go first!"). */
  verdict?: string;
  /** Called once when the result is known: the dice have settled, or right away if no dice are shown. */
  onSettled?: () => void;
}

/** Run a roll's onSettled callback, once. */
const settled = (roll: DiceRoll): void => {
  const f = roll.onSettled;
  roll.onSettled = undefined;
  f?.();
};

const SPEED_KEY = "scdmg.diceSpeed.v1";
const MAX_SHOWN = 24;

// Face transforms: which rotation shows each value at the front.
const FACE_ROT: Record<number, string> = {
  1: "rotateX(0deg) rotateY(0deg)",
  2: "rotateY(-90deg)",
  3: "rotateX(-90deg)",
  4: "rotateX(90deg)",
  5: "rotateY(90deg)",
  6: "rotateY(180deg)",
};
// Where each face sits on the cube.
const FACE_POS: Record<number, string> = {
  1: "rotateY(0deg)",
  2: "rotateY(90deg)",
  3: "rotateX(90deg)",
  4: "rotateX(-90deg)",
  5: "rotateY(-90deg)",
  6: "rotateY(180deg)",
};
// Pip cells (1..9 in a 3×3 grid) for each value.
const PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

export const DICE_SPEED_LABEL: Record<DiceSpeed, string> = { throw: "Throw", full: "Auto", quick: "Quick", off: "Off" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadSpeed(): DiceSpeed {
  try {
    const v = localStorage.getItem(SPEED_KEY);
    return v === "throw" || v === "quick" || v === "off" || v === "full" ? v : "throw";
  } catch {
    return "throw";
  }
}

const reducedMotion = (): boolean => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

interface DieView {
  el: HTMLDivElement;
  value: number;
  ok: boolean | null;
}

export class DiceTray {
  private el: HTMLDivElement;
  private queue: Promise<void> = Promise.resolve();
  private hideTimer: number | undefined;
  private cancelWait: (() => void) | null = null;
  speed: DiceSpeed = loadSpeed();
  /** Whose dice are thrown by hand in throw mode: the local player's seat ("p1" for an online guest). */
  handSide: "p0" | "p1" = "p0";
  /** Called when a group of dice starts tumbling (for sound effects). */
  onTumble?: (count: number, quick: boolean) => void;

  constructor(host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "dice-tray";
    this.el.setAttribute("aria-live", "polite");
    host.appendChild(this.el);
  }

  destroy(): void {
    this.cancelWait?.();
    this.el.remove();
  }

  setSpeed(speed: DiceSpeed): void {
    this.speed = speed;
    try {
      localStorage.setItem(SPEED_KEY, speed);
    } catch {
      // storage blocked: the setting just won't stick
    }
    if (speed === "off") this.el.classList.remove("show");
    // Switching away from throw mode releases any dice waiting to be thrown.
    if (speed !== "throw") this.cancelWait?.();
  }

  /** Resolves once everything queued so far has been shown. */
  idle(): Promise<void> {
    return this.queue;
  }

  /** Queue a roll; resolves once it has been shown (immediately if dice are off). */
  show(roll: DiceRoll): Promise<void> {
    if (this.speed === "off" || !roll.groups.some((g) => g.rolls.length)) {
      settled(roll);
      return Promise.resolve();
    }
    this.queue = this.queue.then(() => this.play(roll)).finally(() => settled(roll));
    return this.queue;
  }

  private async play(roll: DiceRoll): Promise<void> {
    if (this.speed === "off") return;
    const quick = this.speed === "quick" || reducedMotion();
    const tumble = quick ? 260 : 750;
    const hold = quick ? 350 : 900;
    window.clearTimeout(this.hideTimer);
    this.el.replaceChildren();
    const title = document.createElement("div");
    title.className = "dice-title";
    title.textContent = roll.title;
    this.el.appendChild(title);

    const rows: { group: DiceGroup; row: HTMLDivElement; dice: DieView[]; result: HTMLSpanElement }[] = [];
    for (const g of roll.groups) {
      if (!g.rolls.length) continue;
      const row = document.createElement("div");
      row.className = `dice-row ${g.side}`;
      const label = document.createElement("span");
      label.className = "dice-label";
      label.textContent = g.label;
      row.appendChild(label);
      const cup = document.createElement("div");
      cup.className = "dice-cup";
      const dice: DieView[] = [];
      g.rolls.slice(0, MAX_SHOWN).forEach((value, i) => {
        const need = Array.isArray(g.need) ? g.need[i] : g.need;
        const ok = need === null || need === undefined ? null : value >= need;
        const die = makeDie(value);
        cup.appendChild(die);
        dice.push({ el: die, value, ok });
        scramble(die);
      });
      if (g.rolls.length > MAX_SHOWN) {
        const more = document.createElement("span");
        more.className = "dice-more";
        more.textContent = `+${g.rolls.length - MAX_SHOWN}`;
        cup.appendChild(more);
      }
      row.appendChild(cup);
      const res = document.createElement("span");
      res.className = "dice-result";
      res.textContent = g.result ?? "";
      row.appendChild(res);
      rows.push({ group: g, row, dice, result: res });
      this.el.appendChild(row);
    }
    const verdict = document.createElement("div");
    verdict.className = "dice-verdict";
    verdict.textContent = roll.verdict ?? "";
    this.el.appendChild(verdict);
    this.el.classList.add("show");

    // Hits first, then saves: each group is thrown (by you) or rolled (by the AI) in turn.
    for (const r of rows) {
      if (this.speed === "throw" && r.group.side === this.handSide) await this.waitForThrow(r.row);
      // The speed can be switched to "off" while we wait for a throw.
      if ((this.speed as DiceSpeed) === "off") return;
      this.onTumble?.(r.dice.length, quick);
      settle(r.dice, tumble);
      await sleep(tumble);
      for (const d of r.dice) {
        d.el.classList.remove("rolling");
        if (d.ok !== null) d.el.classList.add(d.ok ? "ok" : "fail");
      }
      r.result.classList.add("show");
    }
    verdict.classList.add("show");
    settled(roll);
    await sleep(hold);
    this.hideTimer = window.setTimeout(() => this.el.classList.remove("show"), 4500);
  }

  /** Show a Throw! button on the row and wait for a click, Space or Enter. */
  private waitForThrow(row: HTMLDivElement): Promise<void> {
    return new Promise((resolve) => {
      const btn = document.createElement("button");
      btn.className = "dice-throw";
      btn.type = "button";
      btn.textContent = "🎲 Throw!";
      btn.title = "Throw your dice (Space)";
      row.classList.add("waiting");
      row.appendChild(btn);
      this.el.classList.add("interactive");
      const done = () => {
        window.removeEventListener("keydown", onKey, true);
        btn.remove();
        row.classList.remove("waiting");
        this.el.classList.remove("interactive");
        this.cancelWait = null;
        resolve();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          done();
        }
      };
      btn.addEventListener("click", done);
      window.addEventListener("keydown", onKey, true);
      this.cancelWait = done;
      btn.focus({ preventScroll: true });
    });
  }
}

/** Put a die mid-tumble (random spin, no transition yet). */
function scramble(die: HTMLDivElement): void {
  const cube = die.firstElementChild as HTMLElement;
  const spin = () => 360 * (2 + Math.floor(Math.random() * 3)) * (Math.random() < 0.5 ? -1 : 1);
  cube.style.transition = "none";
  cube.style.transform = `rotateX(${spin()}deg) rotateY(${spin()}deg) rotateZ(${Math.round(Math.random() * 360)}deg)`;
  die.style.setProperty("--hop", `${4 + Math.random() * 10}px`);
}

/** Let dice tumble down onto their faces. */
function settle(dice: DieView[], ms: number): void {
  if (!dice.length) return;
  void dice[0]!.el.offsetWidth; // apply the scrambled start before transitioning
  for (const d of dice) {
    const cube = d.el.firstElementChild as HTMLElement;
    cube.style.transition = `transform ${ms}ms cubic-bezier(.2,.8,.3,1.1)`;
    cube.style.transform = FACE_ROT[d.value]!;
    d.el.classList.add("rolling");
  }
}

function makeDie(value: number): HTMLDivElement {
  const die = document.createElement("div");
  die.className = "die";
  die.setAttribute("aria-label", `rolled ${value}`);
  const cube = document.createElement("div");
  cube.className = "cube";
  for (let f = 1; f <= 6; f++) {
    const face = document.createElement("div");
    face.className = "face";
    face.style.transform = `${FACE_POS[f]} translateZ(var(--half))`;
    for (let c = 1; c <= 9; c++) {
      const cell = document.createElement("span");
      if (PIPS[f]!.includes(c)) cell.className = "pip";
      face.appendChild(cell);
    }
    cube.appendChild(face);
  }
  die.appendChild(cube);
  return die;
}
