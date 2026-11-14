// The DOM-free core of the intro player: scene timing, which keys skip, and a runner that steps
// through the scenes on a timer and ends exactly once (when the last scene finishes, or on skip).

/** Keys that skip an intro (Space arrives as " "; "Spacebar" is the old name). */
const SKIP_KEYS: ReadonlySet<string> = new Set(["Escape", "Esc", " ", "Spacebar", "Enter"]);
export const isSkipKey = (key: string): boolean => SKIP_KEYS.has(key);

/** Total length of a run of scenes (ms). */
export const totalDuration = (durs: readonly number[]): number => durs.reduce((a, d) => a + Math.max(0, d), 0);

/** Start time of each scene (ms). */
export function sceneStarts(durs: readonly number[]): number[] {
  let t = 0;
  return durs.map((d) => {
    const s = t;
    t += Math.max(0, d);
    return s;
  });
}

/** Which scene is showing at time `t` (ms), and how far into it. Clamps to the first and last scene. */
export function sceneAt(durs: readonly number[], t: number): { index: number; local: number } {
  if (!durs.length) return { index: -1, local: 0 };
  const starts = sceneStarts(durs);
  let i = 0;
  while (i + 1 < durs.length && t >= starts[i + 1]!) i++;
  return { index: i, local: Math.max(0, Math.min(durs[i]!, t - starts[i]!)) };
}

export type EndReason = "ended" | "skipped";

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface RunnerHooks {
  onScene(index: number): void;
  onEnd(reason: EndReason): void;
}

/** Steps through scenes of the given durations. `onEnd` is called exactly once. */
export class IntroRunner {
  private i = -1;
  private handle: unknown = null;
  private ended = false;

  constructor(
    private readonly durs: readonly number[],
    private readonly hooks: RunnerHooks,
    private readonly timers: Timers = defaultTimers,
  ) {}

  get index(): number {
    return this.i;
  }
  get done(): boolean {
    return this.ended;
  }

  /** Show the first scene (or `from`) and run from there. */
  start(from = 0): void {
    if (this.ended || this.i >= 0) return;
    if (!this.durs.length) return this.finish("ended");
    this.go(Math.max(0, Math.min(this.durs.length - 1, from)));
  }

  /** Skip the rest. Safe to call any number of times. */
  skip(): void {
    this.finish("skipped");
  }

  /** Stop without calling `onEnd` (the player is being torn down some other way). */
  dispose(): void {
    this.ended = true;
    this.timers.clear(this.handle);
  }

  private go(i: number): void {
    if (this.ended) return;
    this.i = i;
    this.hooks.onScene(i);
    if (this.ended) return; // a scene hook may skip
    this.handle = this.timers.set(() => (i + 1 < this.durs.length ? this.go(i + 1) : this.finish("ended")), Math.max(0, this.durs[i]!));
  }

  private finish(reason: EndReason): void {
    if (this.ended) return;
    this.ended = true;
    this.timers.clear(this.handle);
    this.hooks.onEnd(reason);
  }
}
