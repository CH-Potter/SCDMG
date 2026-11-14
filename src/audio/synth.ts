// Web Audio instruments and building blocks. Everything is synthesized: Karplus–Strong guitar
// (rendered once per pitch into a cached buffer), detuned honky-tonk piano, reedy harmonica,
// whistle, upright bass, woodblock hooves, spoons, whip and ricochet.

import type { Inst } from "./composer";
import type { TimedNote } from "./sequencer";

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Per-instrument mix levels (before velocity). */
const LEVEL: Record<Inst, number> = {
  guitar: 0.32,
  piano: 0.16,
  harmonica: 0.16,
  whistle: 0.2,
  bass: 0.5,
  clip: 0.22,
  clop: 0.26,
  spoons: 0.14,
  whip: 0.4,
  ricochet: 0.12,
  bell: 0.16,
  cpluck: 0.14,
  pad: 0.05,
  arp: 0.09,
  sub: 0.34,
  kick: 0.6,
  clap: 0.32,
  hat: 0.12,
  riser: 0.12,
  rubber: 0.3,
  kalimba: 0.2,
  hand: 0.45,
  shaker: 0.1,
  chitter: 0.12,
  gulp: 0.22,
};

export class Synth {
  /** Sources currently playing or scheduled (diagnostics and voice cap). */
  active = 0;
  started = 0;
  readonly noise: AudioBuffer;
  private ks = new Map<number, { buf: AudioBuffer; base: number }>();
  private pianoWave: PeriodicWave;
  private harpWave: PeriodicWave;

  constructor(readonly ctx: BaseAudioContext) {
    const sr = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, Math.floor(sr * 2), sr);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Piano: strong fundamental, quickly thinning harmonics.
    const pr = new Float32Array([0, 1, 0.55, 0.32, 0.22, 0.12, 0.08, 0.05, 0.03]);
    this.pianoWave = ctx.createPeriodicWave(pr, new Float32Array(pr.length));
    // Harmonica: a reedy, slightly hollow pulse (odd-heavy, some evens).
    const hr = new Float32Array(16);
    for (let k = 1; k < 16; k++) hr[k] = (k % 2 ? 1 : 0.45) / Math.pow(k, 0.9);
    this.harpWave = ctx.createPeriodicWave(hr, new Float32Array(hr.length));
  }

  // ---------------------------------------------------------------- bookkeeping

  /** Start a source at `t`, stop it at `end`, and clean up its node graph when it ends. */
  run(src: AudioScheduledSourceNode, t: number, end: number, ...chain: AudioNode[]): void {
    this.active++;
    this.started++;
    src.onended = () => {
      this.active--;
      src.disconnect();
      for (const n of chain) n.disconnect();
    };
    src.start(Math.max(this.ctx.currentTime, t));
    src.stop(Math.max(this.ctx.currentTime, t) + Math.max(0.01, end - t));
  }

  gain(v: number, dest: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(dest);
    return g;
  }

  /** Percussive envelope: quick attack to `peak`, exponential fall to silence over `decay`. */
  env(g: GainNode, t: number, peak: number, attack: number, decay: number): number {
    const p = g.gain;
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    p.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return t + attack + decay;
  }

  filter(type: BiquadFilterType, freq: number, q: number, dest: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  }

  // ---------------------------------------------------------------- primitives for SFX

  /** A tone with a pitch sweep. */
  tone(
    dest: AudioNode,
    t: number,
    o: { type?: OscillatorType; f0: number; f1?: number; dur: number; peak: number; attack?: number; sweep?: number; wave?: "piano" | "harp" },
  ): void {
    const osc = this.ctx.createOscillator();
    if (o.wave) osc.setPeriodicWave(o.wave === "piano" ? this.pianoWave : this.harpWave);
    else osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + (o.sweep ?? o.dur));
    const g = this.gain(0, dest);
    osc.connect(g);
    const end = this.env(g, t, o.peak, o.attack ?? 0.004, o.dur);
    this.run(osc, t, end + 0.02, g);
  }

  /** Filtered noise with an optional filter sweep. */
  noiseBurst(
    dest: AudioNode,
    t: number,
    o: { dur: number; peak: number; type?: BiquadFilterType; f0: number; f1?: number; q?: number; attack?: number; rate?: number },
  ): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = o.rate ?? 1;
    const g = this.gain(0, dest);
    const f = this.filter(o.type ?? "bandpass", o.f0, o.q ?? 1, g);
    if (o.f1 !== undefined) {
      f.frequency.setValueAtTime(o.f0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    }
    src.connect(f);
    const end = this.env(g, t, o.peak, o.attack ?? 0.002, o.dur);
    const offset = Math.random() * (this.noise.duration - o.dur - 0.1);
    this.active++;
    this.started++;
    src.onended = () => {
      this.active--;
      src.disconnect();
      f.disconnect();
      g.disconnect();
    };
    const at = Math.max(this.ctx.currentTime, t);
    src.start(at, Math.max(0, offset));
    src.stop(at + (end - t) + 0.02);
  }

  /** Play a rendered buffer. */
  buffer(dest: AudioNode, t: number, buf: AudioBuffer, gain: number, rate = 1): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.gain(gain, dest);
    src.connect(g);
    this.run(src, t, t + buf.duration / rate + 0.02, g);
  }

  /** Render a mono buffer with a sample function (for crackly textures: dice, debris). */
  render(seconds: number, fill: (data: Float32Array, sr: number) => void): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.max(1, Math.floor(sr * seconds)), sr);
    fill(buf.getChannelData(0), sr);
    return buf;
  }

  // ---------------------------------------------------------------- Karplus–Strong

  /** A plucked-string buffer for a MIDI pitch, rendered once and cached. */
  private ksFor(midi: number): { buf: AudioBuffer; base: number } {
    const key = Math.round(midi);
    const hit = this.ks.get(key);
    if (hit) return hit;
    const sr = this.ctx.sampleRate;
    const f = mtof(key);
    // The two-point average adds half a sample of delay: the loop's pitch is sr / (N + 0.5).
    const N = Math.max(2, Math.round(sr / f - 0.5));
    const len = Math.floor(sr * (key < 52 ? 1.8 : 1.3));
    const buf = this.ctx.createBuffer(1, len, sr);
    const y = buf.getChannelData(0);
    // Excitation: a noise burst softened by a one-pole lowpass, plus a pick-position comb for twang.
    let lp = 0;
    for (let i = 0; i < N; i++) {
      lp += 0.55 * (Math.random() * 2 - 1 - lp);
      y[i] = lp;
    }
    const pick = Math.max(1, Math.floor(N * 0.18));
    for (let i = N - 1; i >= pick; i--) y[i] = y[i]! - 0.6 * y[i - pick]!;
    const decay = Math.pow(0.001, 1 / (sr * (key < 52 ? 2.4 : 1.6))) ; // per-sample loss on top of the filter
    for (let i = N; i < len; i++) y[i] = decay * 0.5 * (y[i - N]! + y[i - N - 1 < 0 ? 0 : i - N - 1]!);
    // Normalize and fade the tail to avoid a click.
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(y[i]!));
    const fade = Math.floor(sr * 0.05);
    for (let i = 0; i < len; i++) {
      y[i] = (y[i]! / (peak || 1)) * (i > len - fade ? (len - i) / fade : 1);
    }
    const out = { buf, base: f / (sr / (N + 0.5)) };
    this.ks.set(key, out);
    return out;
  }

  /** Render Karplus–Strong buffers ahead of time, one pitch per idle slice, so the first bars don't hitch. */
  warm(midis: Iterable<number>): void {
    const todo = [...new Set([...midis].map((m) => Math.round(m)))].filter((m) => !this.ks.has(m));
    const idle: (cb: () => void) => void =
      typeof requestIdleCallback === "function" ? (cb) => void requestIdleCallback(cb, { timeout: 500 }) : (cb) => void setTimeout(cb, 16);
    const step = () => {
      const m = todo.shift();
      if (m === undefined) return;
      this.ksFor(m);
      idle(step);
    };
    idle(step);
  }

  /** A guitar pluck. `bend` starts the pitch that many semitones off and slides home ("twang"). */
  pluck(dest: AudioNode, t: number, midi: number, vel: number, dur: number, bend = 0): void {
    const { buf, base } = this.ksFor(midi);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const rate = base * Math.pow(2, (midi - Math.round(midi)) / 12) * (1 + (Math.random() - 0.5) * 0.002);
    if (bend) {
      src.playbackRate.setValueAtTime(rate * Math.pow(2, bend / 12), t);
      src.playbackRate.exponentialRampToValueAtTime(rate, t + 0.12);
    } else src.playbackRate.value = rate;
    const g = this.gain(0, dest);
    g.gain.setValueAtTime(vel, t);
    const end = t + Math.min(buf.duration / rate, Math.max(0.15, dur + 0.35));
    g.gain.setValueAtTime(vel, end - 0.08);
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(g);
    this.run(src, t, end + 0.01, g);
  }

  // ---------------------------------------------------------------- music instruments

  note(n: TimedNote, dest: AudioNode): void {
    const t = n.time;
    const v = n.vel * LEVEL[n.inst];
    switch (n.inst) {
      case "guitar":
        this.pluck(dest, t, n.midi, v, n.durSec);
        break;
      case "piano":
        this.piano(dest, t, n.midi, v, n.durSec);
        break;
      case "harmonica":
        this.lead(dest, t, n.midi, v, n.durSec, false);
        break;
      case "whistle":
        this.lead(dest, t, n.midi, v, n.durSec, true);
        break;
      case "bass":
        this.bass(dest, t, n.midi, v, n.durSec);
        break;
      case "clip":
      case "clop":
        this.block(dest, t, n.inst === "clip" ? 1250 : 820, v);
        break;
      case "spoons":
        this.noiseBurst(dest, t, { dur: 0.035, peak: v, type: "highpass", f0: 3800, q: 0.7 });
        this.noiseBurst(dest, t + 0.018, { dur: 0.03, peak: v * 0.7, type: "bandpass", f0: 5200, q: 2 });
        break;
      case "whip":
        this.whip(dest, t, v);
        break;
      case "ricochet":
        this.ricochet(dest, t, v);
        break;
      case "bell":
        this.fm(dest, t, mtof(n.midi), v, Math.min(2.4, n.durSec + 1.2), 3.5, 2.2);
        break;
      case "cpluck":
        this.fm(dest, t, mtof(n.midi), v, 0.45, 5.04, 1.4);
        break;
      case "pad":
        this.pad(dest, t, mtof(n.midi), v, n.durSec, n.cutoff ?? 1200);
        break;
      case "arp":
        this.arp(dest, t, mtof(n.midi), v, n.durSec, n.cutoff ?? 1500);
        break;
      case "sub":
        this.sub(dest, t, mtof(n.midi), v, n.durSec);
        break;
      case "kick":
        this.tone(dest, t, { f0: 165, f1: 42, sweep: 0.12, dur: 0.32, peak: v, attack: 0.001 });
        this.tone(dest, t, { type: "square", f0: 1400, f1: 600, dur: 0.012, peak: v * 0.12, attack: 0.0005 });
        break;
      case "clap":
        for (let i = 0; i < 3; i++) this.noiseBurst(dest, t + i * 0.011, { dur: 0.012, peak: v, type: "bandpass", f0: 1150, q: 1.6, attack: 0.0008 });
        this.noiseBurst(dest, t + 0.033, { dur: 0.16, peak: v * 0.7, type: "bandpass", f0: 1250, q: 1.2, attack: 0.001 });
        break;
      case "hat":
        this.noiseBurst(dest, t, { dur: n.durSec > 0.15 ? 0.14 : 0.035, peak: v, type: "highpass", f0: 7500, q: 0.8, attack: 0.0008 });
        break;
      case "riser":
        this.noiseBurst(dest, t, { dur: n.durSec, peak: v, type: "bandpass", f0: 300, f1: 6000, q: 2.5, attack: n.durSec * 0.85 });
        break;
      case "rubber":
        this.rubber(dest, t, mtof(n.midi), v, n.durSec, n.cutoff ?? 900);
        break;
      case "kalimba":
        this.kalimba(dest, t, mtof(n.midi), v, n.durSec);
        break;
      case "hand":
        if (n.midi < 50) {
          this.tone(dest, t, { f0: 130, f1: 82, sweep: 0.08, dur: 0.24, peak: v, attack: 0.002 });
          this.noiseBurst(dest, t, { dur: 0.04, peak: v * 0.3, type: "lowpass", f0: 500 });
        } else if (n.midi < 60) {
          this.tone(dest, t, { f0: 260, f1: 200, sweep: 0.05, dur: 0.13, peak: v * 0.7, attack: 0.001 });
        } else {
          this.noiseBurst(dest, t, { dur: 0.06, peak: v * 0.8, type: "bandpass", f0: 2100, q: 1.1, attack: 0.0008 });
          this.tone(dest, t, { f0: 360, f1: 260, sweep: 0.03, dur: 0.07, peak: v * 0.5, attack: 0.001 });
        }
        break;
      case "shaker":
        this.noiseBurst(dest, t, { dur: 0.05, peak: v, type: "bandpass", f0: 6500, q: 1.5, attack: 0.012 });
        break;
      case "chitter": {
        const k = 4 + Math.floor(n.durSec * 14);
        for (let i = 0; i < k; i++)
          this.tone(dest, t + (i / k) * n.durSec + Math.random() * 0.01, { type: "triangle", f0: 2500 + Math.random() * 1800, dur: 0.012, peak: v * (0.6 + Math.random() * 0.4), attack: 0.0008 });
        break;
      }
      case "gulp":
        this.gulp(dest, t, mtof(n.midi), v, n.durSec);
        break;
    }
  }

  /** FM bell / crystal pluck: a sine carrier with a decaying sine modulator. */
  fm(dest: AudioNode, t: number, f: number, v: number, decay: number, ratio: number, index: number): void {
    const car = this.ctx.createOscillator();
    car.frequency.value = f;
    const mod = this.ctx.createOscillator();
    mod.frequency.value = f * ratio;
    const mg = this.ctx.createGain();
    mg.gain.setValueAtTime(f * index, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(0.01, f * index * 0.04), t + decay * 0.6);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = this.gain(0, dest);
    car.connect(g);
    const end = this.env(g, t, v, 0.003, decay);
    this.run(car, t, end + 0.02, g);
    this.run(mod, t, end + 0.02, mg);
  }

  /** Warm pad: two detuned saws through a lowpass, slow in and out. */
  pad(dest: AudioNode, t: number, f: number, v: number, dur: number, cutoff: number): void {
    const g = this.gain(0, dest);
    const lp = this.filter("lowpass", cutoff, 0.8, g);
    const a = this.ctx.createOscillator();
    const b = this.ctx.createOscillator();
    a.type = b.type = "sawtooth";
    a.frequency.value = b.frequency.value = f;
    a.detune.value = -12;
    b.detune.value = 12;
    a.connect(lp);
    b.connect(lp);
    const end = t + Math.max(0.5, dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(0.35, dur / 2));
    g.gain.setValueAtTime(v, end - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.5);
    this.run(a, t, end + 0.55, lp, g);
    this.run(b, t, end + 0.55);
  }

  /** Arpeggio step: a resonant filtered saw with a quick filter envelope. */
  arp(dest: AudioNode, t: number, f: number, v: number, dur: number, cutoff: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    const g = this.gain(0, dest);
    const lp = this.filter("lowpass", cutoff, 6, g);
    lp.frequency.setValueAtTime(Math.min(12000, cutoff * 1.8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(150, cutoff * 0.5), t + 0.12);
    osc.connect(lp);
    const end = this.env(g, t, v, 0.003, Math.max(0.06, dur) + 0.06);
    this.run(osc, t, end + 0.02, lp, g);
  }

  /** Sub bass: a clean sine. */
  sub(dest: AudioNode, t: number, f: number, v: number, dur: number): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = f;
    const g = this.gain(0, dest);
    osc.connect(g);
    const end = t + Math.max(0.1, dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.setValueAtTime(v * 0.8, end - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.06);
    this.run(osc, t, end + 0.08, g);
  }

  /** Rubbery funk bass: a square that boings down into pitch, through a resonant wah. */
  rubber(dest: AudioNode, t: number, f: number, v: number, dur: number, cutoff: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(f * 1.12, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    const body = this.ctx.createOscillator();
    body.frequency.value = f;
    const g = this.gain(0, dest);
    const lp = this.filter("lowpass", cutoff, 9, g);
    lp.frequency.setValueAtTime(Math.min(8000, cutoff * 1.8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(160, cutoff * 0.35), t + 0.18);
    osc.connect(lp);
    const bg = this.gain(0.9, g);
    body.connect(bg);
    const end = t + Math.max(0.08, dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.004);
    g.gain.setValueAtTime(v * 0.7, Math.max(t + 0.005, end - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
    this.run(osc, t, end + 0.07, lp, g);
    this.run(body, t, end + 0.07, bg);
  }

  /** Kalimba tine: a sine with a quick inharmonic overtone and a tiny click. */
  kalimba(dest: AudioNode, t: number, f: number, v: number, dur: number): void {
    this.tone(dest, t, { f0: f, dur: Math.min(1.4, dur + 0.5), peak: v, attack: 0.002 });
    this.tone(dest, t, { f0: f * 5.4, dur: 0.08, peak: v * 0.35, attack: 0.001 });
  }

  /** A slurpy gulp: the pitch dips, swoops up and falls away, with a wet little slurp. */
  gulp(dest: AudioNode, t: number, f: number, v: number, dur: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    const d = Math.max(0.25, dur);
    osc.frequency.setValueAtTime(f * 0.6, t);
    osc.frequency.exponentialRampToValueAtTime(f * 1.6, t + d * 0.35);
    osc.frequency.exponentialRampToValueAtTime(f * 0.45, t + d);
    const g = this.gain(0, dest);
    osc.connect(g);
    const end = this.env(g, t, v, 0.02, d);
    this.run(osc, t, end + 0.02, g);
    this.noiseBurst(dest, t + d * 0.3, { dur: 0.12, peak: v * 0.35, type: "lowpass", f0: 900, f1: 300, q: 4 });
  }

  /** Honky-tonk: two strings a few cents apart, so the beating gives the saloon wobble. */
  piano(dest: AudioNode, t: number, midi: number, v: number, dur: number): void {
    const f = mtof(midi);
    const g = this.gain(0, dest);
    const ring = Math.min(2.2, Math.max(0.35, dur + 0.25) * (midi < 60 ? 1.4 : 1));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(v * 0.35, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
    const a = this.ctx.createOscillator();
    const b = this.ctx.createOscillator();
    a.setPeriodicWave(this.pianoWave);
    b.setPeriodicWave(this.pianoWave);
    a.frequency.value = f;
    b.frequency.value = f;
    a.detune.value = -9;
    b.detune.value = 11;
    a.connect(g);
    b.connect(g);
    this.run(a, t, t + ring + 0.02, g);
    this.run(b, t, t + ring + 0.02);
  }

  /** Harmonica (reedy, filtered) or whistle (pure, with a scoop up into the note). */
  lead(dest: AudioNode, t: number, midi: number, v: number, dur: number, whistle: boolean): void {
    const f = mtof(whistle ? midi + 12 : midi);
    const osc = this.ctx.createOscillator();
    if (whistle) osc.type = "sine";
    else osc.setPeriodicWave(this.harpWave);
    osc.frequency.value = f;
    if (whistle) {
      osc.detune.setValueAtTime(-60, t);
      osc.detune.linearRampToValueAtTime(0, t + 0.06);
    }
    // Vibrato that blooms on longer notes.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = whistle ? 6 : 5.2;
    const depth = this.ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(dur > 0.5 ? (whistle ? 22 : 16) : 5, t + Math.min(0.35, dur));
    lfo.connect(depth);
    depth.connect(osc.detune);
    const g = this.gain(0, dest);
    let into: AudioNode = g;
    let bp: BiquadFilterNode | null = null;
    if (!whistle) {
      bp = this.filter("lowpass", 2400, 0.9, g);
      into = bp;
    }
    osc.connect(into);
    const atk = whistle ? 0.03 : 0.045;
    const end = t + Math.max(0.1, dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + atk);
    g.gain.setValueAtTime(v * 0.85, Math.max(t + atk, end - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.08);
    this.run(osc, t, end + 0.1, g, ...(bp ? [bp] : []));
    this.run(lfo, t, end + 0.1, depth);
  }

  /** Upright bass: a round triangle with a plucky filter. */
  bass(dest: AudioNode, t: number, midi: number, v: number, dur: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = mtof(midi);
    const g = this.gain(0, dest);
    const lp = this.filter("lowpass", 900, 1.5, g);
    lp.frequency.setValueAtTime(1100, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + 0.25);
    osc.connect(lp);
    const end = t + Math.max(0.2, dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(v * 0.45, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.1);
    this.run(osc, t, end + 0.12, lp, g);
  }

  /** Woodblock hoof: a short knock with a pitch drop. */
  block(dest: AudioNode, t: number, f: number, v: number): void {
    this.tone(dest, t, { type: "triangle", f0: f * 1.5, f1: f, sweep: 0.012, dur: 0.06, peak: v, attack: 0.001 });
  }

  whip(dest: AudioNode, t: number, v: number): void {
    // Swish, then crack.
    this.noiseBurst(dest, t, { dur: 0.12, peak: v * 0.35, type: "bandpass", f0: 700, f1: 5000, q: 1.2, attack: 0.08 });
    this.noiseBurst(dest, t + 0.13, { dur: 0.05, peak: v * 1.4, type: "highpass", f0: 2500, q: 0.7, attack: 0.0008 });
    this.tone(dest, t + 0.13, { type: "square", f0: 2200, f1: 900, dur: 0.03, peak: v * 0.2, attack: 0.0005 });
  }

  /** The cartoon "pyeeow". */
  ricochet(dest: AudioNode, t: number, v: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    const f0 = 2600 + Math.random() * 900;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.38, t + 0.42);
    const wob = this.ctx.createOscillator();
    wob.frequency.value = 22;
    const wg = this.ctx.createGain();
    wg.gain.value = 40;
    wob.connect(wg);
    wg.connect(osc.detune);
    const g = this.gain(0, dest);
    osc.connect(g);
    const end = this.env(g, t, v, 0.006, 0.45);
    this.run(osc, t, end + 0.02, g);
    this.run(wob, t, end + 0.02, wg);
  }
}
