// The music player: one look-ahead timer feeds every live track; moods crossfade by fading track gains.

import type { LoopMood, StingerKind, Style } from "./composer";
import { mixSeed } from "./rng";
import { arrangeStyleBar, composeStyleSong, composeStyleStinger, warmPitches } from "./score";
import { Sequencer, type BarSource } from "./sequencer";
import type { Synth } from "./synth";

export type Mood = LoopMood | StingerKind | "silent";

const TICK_MS = 50;
const AHEAD = 0.4; // seconds scheduled ahead of the clock (rides out a busy AI turn on the main thread)
const FADE = 1.6;

interface Track {
  mood: Mood;
  style: Style;
  seq: Sequencer;
  gain: GainNode;
  stopping: boolean;
}

export interface MusicEnv {
  intensity: () => number;
  flourishes: () => boolean;
  /** The AI faction's style while it's the AI's turn (woven in lightly), else undefined. */
  guest: () => Style | undefined;
}

export class MusicPlayer {
  private tracks: Track[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private n = 0;
  mood: Mood = "silent";
  style: Style = "western";

  constructor(
    private synth: Synth,
    private out: AudioNode,
    private env: MusicEnv,
    private seed: number,
  ) {}

  /** Switch mood and/or style; loops crossfade, stingers cut in. Same mood and style is a no-op. */
  setMood(mood: Mood, style: Style = this.style, seed?: number): void {
    if (mood === this.mood && style === this.style && mood !== "victory" && mood !== "defeat") return;
    if (mood === "silent" && this.mood === "silent") return;
    this.mood = mood;
    this.style = style;
    const ctx = this.synth.ctx;
    const now = ctx.currentTime;
    const stinger = mood === "victory" || mood === "defeat";
    for (const t of this.tracks) this.fadeOut(t, stinger ? 0.35 : FADE);
    if (mood === "silent") return;
    const s = mixSeed(seed ?? this.seed, ++this.n);
    let source: BarSource;
    if (stinger) {
      const bars = composeStyleStinger(style, mood, s, this.env.flourishes());
      source = (i) => bars[i] ?? null;
    } else {
      const song = composeStyleSong(style, mood, s);
      this.synth.warm(warmPitches(song));
      source = (i) =>
        arrangeStyleBar(song, i, {
          intensity: mood === "menu" ? 0.2 : this.env.intensity(),
          flourishes: this.env.flourishes(),
          guest: mood === "battle" ? this.env.guest() : undefined,
        });
    }
    const gain = ctx.createGain();
    gain.connect(this.out);
    const start = now + (stinger ? 0.3 : 0.1);
    if (stinger) gain.gain.value = 1;
    else {
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(1, now + FADE);
    }
    const track: Track = { mood, style, seq: new Sequencer(source, start, { seed: s }), gain, stopping: false };
    this.tracks.push(track);
    this.ensureTimer();
    this.tick();
  }

  private fadeOut(t: Track, secs: number): void {
    if (t.stopping) return;
    t.stopping = true;
    const now = this.synth.ctx.currentTime;
    const g = t.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.exponentialRampToValueAtTime(0.0001, now + secs);
    // Stop feeding it once it's inaudible; disconnect after the last scheduled tails ring out.
    setTimeout(() => {
      t.seq.clear();
      setTimeout(() => t.gain.disconnect(), 3000);
      this.tracks = this.tracks.filter((x) => x !== t);
    }, secs * 1000 + 50);
  }

  private ensureTimer(): void {
    if (this.timer === undefined) this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const ctx = this.synth.ctx;
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;
    for (const t of this.tracks) {
      for (const n of t.seq.tick(now, AHEAD)) this.synth.note(n, t.gain);
      if (t.seq.done && !t.seq.pending && !t.stopping) {
        // A finished stinger: let it ring, then drop it.
        t.stopping = true;
        setTimeout(() => {
          t.gain.disconnect();
          this.tracks = this.tracks.filter((x) => x !== t);
        }, 4000);
        if (this.mood === t.mood) this.mood = "silent";
      }
    }
    if (!this.tracks.length && this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  stats(): { tracks: number; pending: number; bar: number; dropped: number; resyncs: number } {
    const live = this.tracks.filter((t) => !t.stopping);
    return {
      tracks: this.tracks.length,
      pending: this.tracks.reduce((s, t) => s + t.seq.pending, 0),
      bar: live[0]?.seq.bar ?? -1,
      dropped: this.tracks.reduce((s, t) => s + t.seq.dropped, 0),
      resyncs: this.tracks.reduce((s, t) => s + t.seq.resyncs, 0),
    };
  }
}
