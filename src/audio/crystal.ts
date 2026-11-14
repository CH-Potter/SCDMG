// Lumen Concord: elegant, slightly haughty sci-fi electronica. FM glass bells and crystal plucks over a
// warm detuned pad, a filtered arpeggio sequence, sub bass and crisp synthesized drums.
// Harmony is modal (Dorian in battle; Dorian or Lydian in the menu) with lush 7th chords.
// Pure: no DOM, no Web Audio. Everything comes from rules plus the seed.

import {
  DORIAN,
  LYDIAN,
  chordTones,
  formPosition,
  generateMelody,
  generateProgression,
  scaleStep,
  type ArrangeOpts,
  type Bar,
  type Chord,
  type Inst,
  type LoopMood,
  type Mode,
  type NoteEv,
  type ProgRules,
  type StingerKind,
} from "./composer";
import { Rng, mixSeed } from "./rng";

// Dorian degrees: 0 i, 2 bIII, 3 IV, 4 v, 6 bVII (the diminished vi is never used).
export const DORIAN_RULES: ProgRules = {
  table: {
    0: [
      [3, 3],
      [6, 3],
      [2, 1.5],
      [4, 1.2],
    ],
    2: [
      [3, 2],
      [6, 2],
      [0, 1],
    ],
    3: [
      [0, 2.5],
      [6, 2],
      [4, 1],
    ],
    4: [
      [0, 2],
      [3, 2],
      [6, 1],
    ],
    6: [
      [0, 3],
      [3, 1.5],
      [2, 1.5],
    ],
  },
  linger: [0, 3],
  lingerP: 0.25,
  penult: [6, 3],
  half: [4, 6],
  ext: 7,
};
// Lydian degrees: 0 I, 1 II (the bright Lydian major II), 4 V, 5 vi.
export const LYDIAN_RULES: ProgRules = {
  table: {
    0: [
      [1, 4],
      [5, 1.5],
      [4, 1.2],
    ],
    1: [
      [0, 4],
      [5, 1],
    ],
    4: [
      [0, 2],
      [1, 2],
    ],
    5: [
      [1, 2],
      [4, 2],
      [0, 1],
    ],
  },
  linger: [0, 1],
  lingerP: 0.3,
  penult: [1],
  half: [1, 5],
  ext: 7,
};
export const CRYSTAL_DEGREES: Record<"dorian" | "lydian", number[]> = { dorian: [0, 2, 3, 4, 6], lydian: [0, 1, 4, 5] };

export interface CrystalSection {
  chords: Chord[];
  melody: NoteEv[];
  lead: Inst;
  /** Arpeggio shape: 0 up, 1 up-down, 2 skip, 3 pedal. */
  shape: number;
}

export interface CrystalSong {
  style: "crystal";
  mood: LoopMood;
  seed: number;
  key: number;
  mode: Mode;
  modeName: "dorian" | "lydian";
  sections: { A: CrystalSection; B: CrystalSection };
  form: ("A" | "B")[];
  bpm: number;
  swing: number;
}

const KEYS = [2, 9, 4, 11, 6]; // D, A, E, B, F#

export function composeCrystal(mood: LoopMood, seed: number): CrystalSong {
  const rng = new Rng(mixSeed(seed, mood === "menu" ? 41 : 42));
  const key = rng.pick(KEYS);
  const lydian = mood === "menu" && rng.chance(0.5);
  const mode = lydian ? LYDIAN : DORIAN;
  const rules = lydian ? LYDIAN_RULES : DORIAN_RULES;
  const tonic = 60 + key > 66 ? 48 + key : 60 + key;
  const section = (r: Rng, cadence: "full" | "half", lead: Inst): CrystalSection => {
    const chords = generateProgression(r.fork(1), 8, cadence, rules);
    // Bells sing higher and a touch sparser: drop some weak passing notes, let the rest ring.
    const melody = generateMelody(r.fork(2), chords, { key: tonic, lo: tonic + 5, hi: tonic + 22, endOnTonic: cadence === "full", mode })
      .filter((n, i) => i === 0 || n.t % 1 === 0 || r.chance(0.65))
      .map((n) => ({ ...n, inst: lead, dur: n.dur * 1.4 }));
    return { chords, melody, lead, shape: r.int(0, 3) };
  };
  const A = section(rng.fork(11), "full", "bell");
  const B = section(rng.fork(12), "half", "cpluck");
  B.chords[0] = { degree: lydian ? 1 : rng.pick([3, 2]), ext: 7 };
  return {
    style: "crystal",
    mood,
    seed,
    key,
    mode,
    modeName: lydian ? "lydian" : "dorian",
    sections: { A, B },
    form: ["A", "A", "B", "A"],
    bpm: mood === "menu" ? 90 + rng.int(0, 6) : 108,
    swing: 0.5,
  };
}

/** Wrap a pitch class (offset from C) into [lo, lo + 12). */
const into = (pc: number, lo: number) => lo + ((((pc - lo) % 12) + 12) % 12);

/** The arpeggio's step order for a shape, over n chord tones. */
export function arpIndex(shape: number, i: number, n: number): number {
  switch (shape) {
    case 1: {
      const period = Math.max(1, 2 * n - 2);
      const k = i % period;
      return k < n ? k : period - k;
    }
    case 2:
      return (Math.floor(i / 2) + (i % 2) * 2) % n;
    case 3:
      return i % 2 === 0 ? 0 : 1 + (Math.floor(i / 2) % (n - 1));
    default:
      return i % n;
  }
}

export function arrangeCrystal(song: CrystalSong, bar: number, o: ArrangeOpts): Bar {
  const p = formPosition(song, bar);
  const rng = new Rng(mixSeed(song.seed, bar, 91));
  const I = Math.max(0, Math.min(1, o.intensity));
  const battle = song.mood === "battle";
  const key = song.key;
  const tones = chordTones(p.chord, song.mode);
  const notes: NoteEv[] = [];

  // --- warm pad: the whole chord, filter opening with intensity
  const padCut = battle ? 650 + 2600 * I : 900;
  const pad = tones.map((x) => into(key + x, 52)).sort((a, b) => a - b);
  pad.forEach((m) => notes.push({ t: 0, dur: 4.05, midi: m, vel: 0.5, inst: "pad", cutoff: padCut }));

  // --- sub bass
  const root = into(key + tones[0]!, 33);
  if (!battle || I < 0.45) {
    notes.push({ t: 0, dur: 2.3, midi: root, vel: 0.85, inst: "sub" });
    notes.push({ t: 2.5, dur: 1.3, midi: rng.chance(0.3) ? root + 12 : root, vel: 0.7, inst: "sub" });
  } else {
    [0, 0.75, 1.5, 2, 2.75, 3.5].forEach((t, i) => notes.push({ t, dur: 0.45, midi: i === 4 ? root + 12 : root, vel: i % 2 ? 0.65 : 0.9, inst: "sub" }));
  }

  // --- arpeggio: 8ths, doubling to 16ths when the battle heats up; the filter sweeps over 4 bars
  const rate = battle && I > 0.55 ? 0.25 : 0.5;
  const arpTones = tones.map((x) => into(key + x, 57)).sort((a, b) => a - b);
  const pool = [...arpTones, ...arpTones.map((m) => m + 12)];
  const base = battle ? 500 + 2200 * I : 600;
  const depth = battle ? 1500 + 2500 * I : 900;
  for (let i = 0; i < 4 / rate; i++) {
    const t = i * rate;
    const phase = ((p.local % 4) * 4 + t) / 16;
    const cutoff = base + depth * 0.5 * (1 - Math.cos(2 * Math.PI * phase));
    notes.push({ t, dur: rate * 0.8, midi: pool[arpIndex(p.section.shape, i, pool.length)]!, vel: (t % 1 === 0 ? 0.7 : 0.5) * (battle ? 1 : 0.7), inst: "arp", cutoff });
  }

  // --- lead: bells (A) or crystal plucks (B), with a haughty echo of the bar's last note
  const mel = p.section.melody.filter((n) => Math.floor(n.t / 4) === p.local).map((n) => ({ ...n, t: n.t - p.local * 4 }));
  const octave = p.pass % 2 === 1 && p.name === "A" ? 12 : 0;
  for (const n of mel) notes.push({ ...n, midi: n.midi + octave });
  const last = mel[mel.length - 1];
  if (last && last.t + 0.75 < 4) notes.push({ t: last.t + 0.75, dur: 0.4, midi: last.midi + 12, vel: last.vel * 0.35, inst: "cpluck" });

  // --- drums
  if (!battle) {
    notes.push({ t: 0, dur: 0.3, midi: 36, vel: 0.5, inst: "kick" });
    if (p.local % 2 === 1) notes.push({ t: 2.5, dur: 0.3, midi: 36, vel: 0.3, inst: "kick" });
  } else {
    notes.push({ t: 0, dur: 0.3, midi: 36, vel: 0.9, inst: "kick" }, { t: 2, dur: 0.3, midi: 36, vel: 0.8, inst: "kick" });
    if (I > 0.5) notes.push({ t: rng.pick([2.75, 1.75]), dur: 0.3, midi: 36, vel: 0.6, inst: "kick" });
    if (I > 0.2) notes.push({ t: 1, dur: 0.2, midi: 60, vel: 0.7, inst: "clap" }, { t: 3, dur: 0.2, midi: 60, vel: 0.7, inst: "clap" });
    if (I > 0.4) {
      const step = I > 0.7 ? 0.25 : 0.5;
      for (let t = step === 0.25 ? 0 : 0.5; t < 4; t += step === 0.25 ? 0.25 : 1)
        notes.push({ t, dur: 0.05, midi: 80, vel: t % 1 === 0.5 ? 0.6 : 0.35, inst: "hat" });
    }
  }

  // --- flourish: a filtered-noise riser into the next section
  if (o.flourishes && p.sectionEnd && (battle ? rng.chance(0.3 + 0.4 * I) : p.formEnd && rng.chance(0.5)))
    notes.push({ t: 0, dur: 4, midi: 0, vel: 0.5, inst: "riser" });

  notes.sort((a, b) => a.t - b.t);
  return { notes, bpm: battle ? song.bpm + Math.round(16 * I) : song.bpm, swing: song.swing, beats: 4 };
}

export function crystalStinger(kind: StingerKind, seed: number, flourishes = true): Bar[] {
  const rng = new Rng(mixSeed(seed, kind === "victory" ? 51 : 52));
  const key = rng.pick(KEYS);
  const tonic = 72 + key > 78 ? 60 + key : 72 + key;
  const bars: Bar[] = [];
  const padChord = (notes: NoteEv[], mode: Mode, c: Chord, t: number, dur: number, cutoff: number) =>
    chordTones(c, mode).forEach((x) => notes.push({ t, dur, midi: into(key + x, 52), vel: 0.55, inst: "pad", cutoff }));
  if (kind === "victory") {
    const bpm = 118;
    const deg = (d: number) => tonic + scaleStep(d, LYDIAN);
    // Bar 1: a rising Lydian bell arpeggio, sparkling on the raised 4th.
    const run = rng.pick([
      [0, 2, 4, 6, 7],
      [-3, 0, 2, 3, 4],
      [2, 3, 4, 6, 7],
    ]);
    const b1: NoteEv[] = run.map((d, i) => ({ t: i * 0.5, dur: 1.2, midi: deg(d), vel: 0.8, inst: "bell" as Inst }));
    padChord(b1, LYDIAN, { degree: 0, ext: 7 }, 0, 4, 1800);
    b1.push({ t: 0, dur: 3.5, midi: into(key, 33), vel: 0.9, inst: "sub" }, { t: 0, dur: 0.3, midi: 36, vel: 0.9, inst: "kick" }, { t: 2, dur: 0.2, midi: 60, vel: 0.7, inst: "clap" });
    bars.push({ notes: b1, bpm, swing: 0.5, beats: 4 });
    // Bar 2: the bright major II, sixteenth hats and a riser.
    const b2: NoteEv[] = [5, 4, 6].map((d, i) => ({ t: i * 1.2, dur: 1, midi: deg(d), vel: 0.75, inst: "bell" as Inst }));
    padChord(b2, LYDIAN, { degree: 1, ext: 7 }, 0, 4, 2400);
    b2.push({ t: 0, dur: 3.5, midi: into(key + 2, 33), vel: 0.85, inst: "sub" });
    for (let t = 0; t < 4; t += 0.25) b2.push({ t, dur: 0.05, midi: 80, vel: t % 1 === 0.5 ? 0.55 : 0.3, inst: "hat" });
    if (flourishes) b2.push({ t: 0, dur: 4, midi: 0, vel: 0.5, inst: "riser" });
    bars.push({ notes: b2, bpm, swing: 0.5, beats: 4 });
    // Bar 3: home, a big maj9 and a high bell, with a little crystal sparkle.
    const b3: NoteEv[] = [{ t: 0, dur: 3.5, midi: deg(7), vel: 0.9, inst: "bell" }];
    padChord(b3, LYDIAN, { degree: 0, ext: 9 }, 0, 4, 3000);
    b3.push({ t: 0, dur: 3.5, midi: into(key, 33), vel: 1, inst: "sub" }, { t: 0, dur: 0.3, midi: 36, vel: 1, inst: "kick" });
    [9, 11, 14].forEach((d, i) => b3.push({ t: 0.5 + i * 0.25, dur: 0.4, midi: deg(d), vel: 0.4, inst: "cpluck" }));
    bars.push({ notes: b3, bpm, swing: 0.5, beats: 4 });
  } else {
    const bpm = 78;
    const deg = (d: number) => tonic + scaleStep(d, DORIAN);
    // A cool, disappointed descent; the pad's filter closes like a sigh.
    const top = rng.pick([4, 2]);
    const b1: NoteEv[] = [top, top - 1, top - 2].map((d, i) => ({ t: i * 1.25, dur: 1.4, midi: deg(d), vel: 0.7 - i * 0.08, inst: "bell" as Inst }));
    padChord(b1, DORIAN, { degree: 0, ext: 7 }, 0, 4, 1400);
    b1.push({ t: 0, dur: 3.5, midi: into(key, 33), vel: 0.8, inst: "sub" }, { t: 0, dur: 0.3, midi: 36, vel: 0.6, inst: "kick" });
    bars.push({ notes: b1, bpm, swing: 0.5, beats: 4 });
    const b2: NoteEv[] = [{ t: 0, dur: 3, midi: deg(rng.pick([0, -2])), vel: 0.55, inst: "bell" }];
    // Borrowed minor iv, filter shut down.
    [5, 8, 12].forEach((x) => b2.push({ t: 0, dur: 4, midi: into(key + x, 52), vel: 0.5, inst: "pad", cutoff: 450 }));
    b2.push({ t: 0, dur: 3.5, midi: into(key + 5, 33) - 12 < 24 ? into(key + 5, 33) : into(key + 5, 33) - 12, vel: 0.8, inst: "sub" });
    // A power-down arpeggio: falling chord tones with the filter closing.
    const fall = [12, 10, 7, 3, 0, -2, -5, -9].map((x) => tonic - 12 + x);
    fall.forEach((m, i) => b2.push({ t: 1.5 + i * 0.25, dur: 0.2, midi: m, vel: 0.45, inst: "arp", cutoff: 2400 - i * 260 }));
    bars.push({ notes: b2, bpm, swing: 0.5, beats: 4 });
  }
  return bars;
}
