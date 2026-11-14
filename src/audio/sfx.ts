// Sound effect recipes: short, punchy, a little cartoonish. All synthesized on the spot.

import type { SfxName } from "./mapping";
import { mtof, type Synth } from "./synth";

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Sfx {
  private debris: AudioBuffer | null = null;

  constructor(
    private s: Synth,
    private out: AudioNode,
  ) {}

  /** Play a named effect at `t` (AudioContext time). */
  play(name: SfxName, t: number, gain = 1, count = 1): void {
    const s = this.s;
    const o = this.out;
    const v = gain;
    switch (name) {
      case "rifle":
      case "pistol":
      case "burst": {
        const gap = name === "burst" ? 0.075 : name === "pistol" ? 0.16 : 0.2;
        const n = name === "burst" ? Math.max(3, count + 1) : count;
        for (let i = 0; i < n; i++) this.shot(t + i * gap + rnd(0, 0.02), v * (i ? 0.8 : 1), name === "pistol" ? 1.35 : name === "burst" ? 1.15 : 1);
        break;
      }
      case "cannon": {
        s.tone(o, t, { f0: 140, f1: 34, sweep: 0.45, dur: 0.6, peak: 0.7 * v, attack: 0.003 });
        s.noiseBurst(o, t, { dur: 0.7, peak: 0.45 * v, type: "lowpass", f0: 1400, f1: 120, q: 0.8 });
        s.noiseBurst(o, t + 0.005, { dur: 0.06, peak: 0.5 * v, type: "highpass", f0: 1800 });
        s.buffer(o, t + 0.12, this.debrisBuffer(), 0.45 * v, rnd(0.85, 1.15));
        break;
      }
      case "beam": {
        // Crystal "pew-zhoom": a bright sweep with a glassy shimmer on top.
        s.tone(o, t, { type: "sawtooth", f0: 520, f1: 1500, sweep: 0.08, dur: 0.32, peak: 0.22 * v, attack: 0.002 });
        s.tone(o, t + 0.07, { type: "square", f0: 1500, f1: 300, sweep: 0.3, dur: 0.3, peak: 0.13 * v });
        for (const f of [2637, 3136, 3951]) s.tone(o, t + rnd(0, 0.03), { f0: f, f1: f * 1.01, dur: 0.45, peak: 0.1 * v });
        s.noiseBurst(o, t, { dur: 0.25, peak: 0.2 * v, type: "bandpass", f0: 6000, f1: 2500, q: 4 });
        break;
      }
      case "goo": {
        // "Splorch": a wet low sweep and some bubbles.
        s.noiseBurst(o, t, { dur: 0.28, peak: 0.55 * v, type: "lowpass", f0: 1600, f1: 180, q: 5 });
        s.tone(o, t, { f0: 320, f1: 70, dur: 0.22, peak: 0.45 * v });
        for (let i = 0; i < 3; i++) {
          const f = rnd(380, 720);
          s.tone(o, t + 0.12 + i * rnd(0.05, 0.08), { f0: f, f1: f * 1.8, dur: 0.05, peak: 0.12 * v });
        }
        break;
      }
      case "thwack":
        s.noiseBurst(o, t, { dur: 0.06, peak: 0.7 * v, type: "bandpass", f0: 1300, q: 1.5 });
        s.tone(o, t, { f0: 170, f1: 65, dur: 0.14, peak: 0.7 * v });
        s.tone(o, t + 0.01, { type: "triangle", f0: 700, f1: 330, dur: 0.09, peak: 0.18 * v });
        break;
      case "chomp":
        for (let i = 0; i < 2; i++) {
          const tt = t + i * 0.13;
          s.tone(o, tt, { type: "square", f0: 260, f1: 90, dur: 0.05, peak: 0.25 * v, attack: 0.001 });
          s.noiseBurst(o, tt + 0.01, { dur: 0.09, peak: 0.55 * v, type: "lowpass", f0: 2200, f1: 500, q: 2 });
        }
        break;
      case "sting":
        s.tone(o, t, { type: "sawtooth", f0: 190, f1: 230, dur: 0.18, peak: 0.12 * v, attack: 0.01 });
        s.tone(o, t + 0.17, { type: "triangle", f0: 1800, f1: 900, dur: 0.05, peak: 0.3 * v });
        break;
      case "ricochet":
        s.ricochet(o, t, 0.16 * v);
        break;
      case "whoosh":
        s.noiseBurst(o, t, { dur: 0.42, peak: 0.45 * v, type: "bandpass", f0: 300, f1: 2600, q: 1.4, attack: 0.25 });
        break;
      case "slam":
        s.tone(o, t, { f0: 120, f1: 40, dur: 0.35, peak: 0.7 * v, attack: 0.002 });
        s.noiseBurst(o, t, { dur: 0.25, peak: 0.45 * v, type: "lowpass", f0: 2500, f1: 300 });
        s.tone(o, t + 0.005, { type: "square", f0: 900, f1: 600, dur: 0.05, peak: 0.12 * v });
        break;
      case "flinch":
        s.tone(o, t, { type: "triangle", f0: 1500, dur: 0.02, peak: 0.25 * v, attack: 0.001 });
        s.tone(o, t + 0.02, { type: "triangle", f0: 950, f1: 480, dur: 0.09, peak: 0.22 * v });
        break;
      case "poof":
        s.noiseBurst(o, t, { dur: 0.32, peak: 0.55 * v, type: "lowpass", f0: 3500, f1: 250, q: 1, attack: 0.02 });
        s.tone(o, t + 0.03, { f0: 900, f1: 180, dur: 0.38, peak: 0.22 * v });
        s.tone(o, t + 0.28, { f0: 1760, dur: 0.25, peak: 0.07 * v });
        break;
      case "shuffle":
        for (let i = 0; i < 2 + count; i++) s.noiseBurst(o, t + i * rnd(0.11, 0.14), { dur: 0.05, peak: rnd(0.4, 0.6) * v, type: "lowpass", f0: rnd(700, 1100), q: 0.8 });
        break;
      case "stomp":
        for (let i = 0; i < 1 + count; i++) {
          const tt = t + i * 0.24;
          s.tone(o, tt, { f0: 95, f1: 45, dur: 0.18, peak: 0.6 * v });
          s.tone(o, tt + 0.01, { type: "square", f0: 1300, f1: 1250, dur: 0.06, peak: 0.05 * v });
        }
        break;
      case "scurry":
        for (let i = 0; i < 5 + count * 2; i++) s.noiseBurst(o, t + i * rnd(0.04, 0.06), { dur: 0.025, peak: rnd(0.3, 0.5) * v, type: "bandpass", f0: rnd(1800, 2600), q: 3 });
        break;
      case "flutter":
        s.noiseBurst(o, t, { dur: 0.45, peak: 0.6 * v, type: "bandpass", f0: 500, f1: 1400, q: 2, attack: 0.15 });
        s.tone(o, t, { type: "sawtooth", f0: 70, f1: 90, dur: 0.4, peak: 0.1 * v, attack: 0.1 });
        break;
      case "thunk":
        s.tone(o, t, { f0: 150, f1: 55, dur: 0.22, peak: 0.6 * v });
        s.noiseBurst(o, t, { dur: 0.08, peak: 0.25 * v, type: "lowpass", f0: 1200 });
        break;
      case "thunk-heavy":
        s.tone(o, t, { f0: 110, f1: 38, dur: 0.4, peak: 0.85 * v });
        s.noiseBurst(o, t, { dur: 0.15, peak: 0.4 * v, type: "lowpass", f0: 900 });
        s.tone(o, t + 0.02, { type: "square", f0: 620, f1: 600, dur: 0.18, peak: 0.06 * v });
        s.tone(o, t + 0.02, { type: "square", f0: 931, f1: 900, dur: 0.14, peak: 0.04 * v });
        break;
      case "dig":
        for (let i = 0; i < 2; i++) s.noiseBurst(o, t + i * 0.15, { dur: 0.1, peak: 0.5 * v, type: "lowpass", f0: 1500, f1: 400, q: 1 });
        break;
      case "summon":
        this.bells(t, [0, 4, 7, 12, 16], 0.07, 0.16 * v, 76);
        s.noiseBurst(o, t, { dur: 0.6, peak: 0.08 * v, type: "highpass", f0: 5000, attack: 0.2 });
        break;
      case "teleport":
        s.tone(o, t, { f0: 300, f1: 2200, sweep: 0.16, dur: 0.18, peak: 0.16 * v });
        this.bells(t + 0.12, [12, 19, 24], 0.05, 0.1 * v, 72);
        break;
      case "heal":
        this.bells(t, [0, 4, 7, 11], 0.08, 0.13 * v, 79);
        break;
      case "fizzle":
        s.noiseBurst(o, t, { dur: 0.5, peak: 0.18 * v, type: "highpass", f0: 3000, f1: 1200, q: 1 });
        s.tone(o, t, { type: "triangle", f0: 1100, f1: 260, dur: 0.5, peak: 0.12 * v });
        break;
      case "gulp":
        // A nervous swallow: blip up, glug down.
        s.tone(o, t, { type: "triangle", f0: 260, f1: 520, sweep: 0.06, dur: 0.07, peak: 0.3 * v });
        s.tone(o, t + 0.08, { type: "triangle", f0: 420, f1: 150, dur: 0.14, peak: 0.35 * v });
        break;
      case "rally":
        this.horn(t, v);
        break;
      case "twang":
        // A bent low string, then a plucked fifth.
        s.pluck(o, t, 45, 0.55 * v, 0.6, -1.5);
        s.pluck(o, t + 0.12, 52, 0.4 * v, 0.5);
        s.pluck(o, t + 0.12, 57, 0.3 * v, 0.5);
        break;
      case "jingle":
        [72, 76, 79, 84].forEach((m, i) => s.pluck(o, t + i * 0.09, m, 0.4 * v, 0.4));
        this.bells(t + 0.3, [12], 0, 0.1 * v, 84);
        break;
      case "jingle-sour":
        [67, 66, 62].forEach((m, i) => s.pluck(o, t + i * 0.12, m, 0.3 * v, 0.4));
        break;
      case "sparkle":
        for (let i = 0; i < 6; i++) s.tone(o, t + i * rnd(0.03, 0.05), { f0: rnd(2400, 4800), dur: 0.18, peak: 0.08 * v, attack: 0.002 });
        break;
      case "chime":
        s.tone(o, t, { f0: mtof(88), dur: 1.1, peak: 0.12 * v, attack: 0.002 });
        s.tone(o, t + 0.07, { f0: mtof(95), dur: 1.2, peak: 0.09 * v, attack: 0.002 });
        break;
      case "click":
        s.tone(o, t, { type: "triangle", f0: 1800, f1: 1200, dur: 0.03, peak: 0.14 * v, attack: 0.001 });
        break;
      case "hover":
        s.tone(o, t, { f0: 1300, dur: 0.025, peak: 0.035 * v, attack: 0.002 });
        break;
      case "select":
        s.tone(o, t, { type: "triangle", f0: 880, dur: 0.05, peak: 0.13 * v });
        s.tone(o, t + 0.05, { type: "triangle", f0: 1320, dur: 0.07, peak: 0.12 * v });
        break;
      case "error":
        s.tone(o, t, { type: "square", f0: 220, f1: 180, dur: 0.12, peak: 0.1 * v });
        s.tone(o, t + 0.11, { type: "square", f0: 180, f1: 150, dur: 0.15, peak: 0.07 * v });
        break;
    }
  }

  /** Dice rattle in the cup and clatter onto the tray, timed to the tumble animation. */
  dice(t: number, count: number, tumbleSec: number): void {
    const n = Math.max(1, Math.min(10, count));
    const len = tumbleSec + 0.25;
    const buf = this.s.render(len, (d, sr) => {
      const click = (at: number, amp: number, freq: number, ms: number) => {
        const start = Math.floor(at * sr);
        const L = Math.floor((ms / 1000) * sr);
        const w = (2 * Math.PI * freq) / sr;
        for (let i = 0; i < L && start + i < d.length; i++) {
          const e = Math.exp(-i / (L / 5));
          d[start + i]! += amp * e * (0.6 * Math.sin(w * i) + 0.4 * (Math.random() * 2 - 1));
        }
      };
      // Rattle: dense at first, thinning as the dice slow.
      const rattles = 6 + n * 3;
      for (let k = 0; k < rattles; k++) {
        const x = Math.pow(Math.random(), 1.6) * tumbleSec * 0.85;
        click(x, rnd(0.15, 0.35), rnd(2200, 4200), rnd(6, 14));
      }
      // Landing: one or two woody knocks per die near the end.
      for (let k = 0; k < n; k++) {
        const x = tumbleSec * rnd(0.72, 1.0);
        click(x, rnd(0.4, 0.6), rnd(1100, 1700), rnd(18, 30));
        if (Math.random() < 0.5) click(x + rnd(0.03, 0.07), rnd(0.15, 0.25), rnd(1300, 1900), 14);
      }
    });
    this.s.buffer(this.out, t, buf, 0.55);
  }

  // ---------------------------------------------------------------- helpers

  private shot(t: number, v: number, pitch: number): void {
    const s = this.s;
    const o = this.out;
    s.noiseBurst(o, t, { dur: 0.09 / pitch, peak: 0.75 * v, type: "lowpass", f0: 7000 * pitch, f1: 900, q: 0.7, attack: 0.0008 });
    s.tone(o, t, { f0: 210 * pitch, f1: 60, dur: 0.1, peak: 0.55 * v, attack: 0.001 });
    // A dusty canyon tail.
    s.noiseBurst(o, t + 0.03, { dur: 0.35, peak: 0.1 * v, type: "bandpass", f0: 800 * pitch, f1: 400, q: 1.2, attack: 0.02 });
  }

  private bells(t: number, semis: number[], gap: number, v: number, root: number): void {
    semis.forEach((x, i) => {
      const f = mtof(root + x);
      this.s.tone(this.out, t + i * gap, { f0: f, dur: 0.6, peak: v, attack: 0.002 });
      this.s.tone(this.out, t + i * gap, { f0: f * 2.76, dur: 0.25, peak: v * 0.25, attack: 0.002 });
    });
  }

  /** A short bugle-ish rally call: fifth up to the octave, brassy filter opening. */
  private horn(t: number, v: number): void {
    const ctx = this.s.ctx;
    const notes: [number, number, number][] = [
      [67, 0, 0.14],
      [72, 0.16, 0.14],
      [76, 0.32, 0.12],
      [79, 0.46, 0.5],
    ];
    for (const [m, dt, dur] of notes) {
      const tt = t + dt;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = mtof(m);
      const g = this.s.gain(0, this.out);
      const f = this.s.filter("lowpass", 500, 2, g);
      f.frequency.setValueAtTime(500, tt);
      f.frequency.exponentialRampToValueAtTime(2800, tt + 0.05);
      f.frequency.exponentialRampToValueAtTime(1400, tt + dur);
      osc.connect(f);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.13 * v, tt + 0.03);
      g.gain.setValueAtTime(0.11 * v, tt + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + dur + 0.08);
      this.s.run(osc, tt, tt + dur + 0.1, f, g);
    }
  }

  private debrisBuffer(): AudioBuffer {
    if (this.debris) return this.debris;
    this.debris = this.s.render(1.0, (d, sr) => {
      for (let k = 0; k < 40; k++) {
        const at = Math.floor(Math.pow(Math.random(), 1.4) * 0.9 * sr);
        const L = Math.floor(rnd(0.004, 0.02) * sr);
        const amp = rnd(0.1, 0.5) * (1 - at / d.length);
        let lp = 0;
        for (let i = 0; i < L && at + i < d.length; i++) {
          lp += 0.35 * (Math.random() * 2 - 1 - lp);
          d[at + i]! += amp * lp * Math.exp(-i / (L / 4));
        }
      }
    });
    return this.debris;
  }
}
