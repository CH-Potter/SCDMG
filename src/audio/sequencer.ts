// Look-ahead sequencer: turns bars (in beats) into absolutely timed notes, a little at a time.
// Pure: it only does arithmetic on the clock you give it, so tests can drive it with a fake clock.
//
// Each tick asks for the notes due before `now + ahead`. Bars are composed just in time (so
// intensity changes land on the next bar), and if the clock jumps forward (tab suspended, a long
// frame) the sequencer drops stale notes and re-anchors instead of firing a pile of late notes.

import type { Bar, NoteEv } from "./composer";
import { Rng } from "./rng";

export interface TimedNote extends NoteEv {
  /** Absolute start time in seconds (AudioContext clock). */
  time: number;
  durSec: number;
}

/** Supplies bar `i`, or null when a finite cue (a stinger) is over. */
export type BarSource = (index: number) => Bar | null;

/** Map a position inside a beat onto a swung grid: the off-beat eighth moves to `swing`. */
export function swingBeat(t: number, swing: number): number {
  const beat = Math.floor(t + 1e-9);
  const f = t - beat;
  const s = Math.max(0.5, Math.min(0.75, swing));
  const g = f < 0.5 ? f * (s / 0.5) : s + (f - 0.5) * ((1 - s) / 0.5);
  return beat + g;
}

export interface SequencerOpts {
  /** Random timing spread in seconds (each note gets ±this). */
  humanize?: number;
  seed?: number;
  /** If the clock has overtaken the schedule by more than this, re-anchor (seconds). */
  maxLate?: number;
}

export class Sequencer {
  private queue: TimedNote[] = [];
  private barIndex = 0;
  private nextBarTime: number;
  private rng: Rng;
  private humanize: number;
  private maxLate: number;
  done = false;
  /** Diagnostics. */
  dropped = 0;
  resyncs = 0;
  emitted = 0;

  constructor(
    private source: BarSource,
    startTime: number,
    o: SequencerOpts = {},
  ) {
    this.nextBarTime = startTime;
    this.rng = new Rng(o.seed ?? 1);
    this.humanize = o.humanize ?? 0.008;
    this.maxLate = o.maxLate ?? 0.2;
  }

  get pending(): number {
    return this.queue.length;
  }
  get bar(): number {
    return this.barIndex;
  }
  /** When the next not-yet-composed bar starts. */
  get horizon(): number {
    return this.nextBarTime;
  }

  /** Notes to schedule now: everything starting before `now + ahead`, each returned exactly once. */
  tick(now: number, ahead: number): TimedNote[] {
    if (this.done && !this.queue.length) return [];
    // Fell behind (suspended tab, long stall): drop what's stale and pick up from now.
    if (this.nextBarTime < now - this.maxLate) {
      const before = this.queue.length;
      this.queue = this.queue.filter((n) => n.time >= now - 0.02);
      this.dropped += before - this.queue.length;
      this.nextBarTime = now + 0.05;
      this.resyncs++;
    }
    while (!this.done && this.nextBarTime < now + ahead) this.compose();
    const out: TimedNote[] = [];
    while (this.queue.length && this.queue[0]!.time < now + ahead) {
      const n = this.queue.shift()!;
      if (n.time < now - 0.05) {
        this.dropped++;
        continue;
      }
      out.push(n);
    }
    this.emitted += out.length;
    return out;
  }

  /** Forget everything not yet handed out. */
  clear(): void {
    this.queue = [];
    this.done = true;
  }

  private compose(): void {
    const bar = this.source(this.barIndex);
    if (!bar) {
      this.done = true;
      return;
    }
    const spb = 60 / bar.bpm;
    const start = this.nextBarTime;
    for (const n of bar.notes) {
      const jitter = this.humanize ? (this.rng.next() * 2 - 1) * this.humanize : 0;
      const time = Math.max(start, start + swingBeat(n.t, bar.swing) * spb + jitter);
      this.queue.push({ ...n, time, durSec: n.dur * spb });
    }
    this.queue.sort((a, b) => a.time - b.time);
    this.nextBarTime = start + bar.beats * spb;
    this.barIndex++;
  }
}
