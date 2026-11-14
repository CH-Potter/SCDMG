// The Munch: playful, hungry swamp bug-funk. A bouncy rubber bass with a filter "wah", kalimba hooks
// over minor-pentatonic grooves, hand drums, shakers, clicky chitter and the odd slurpy gulp.
// Harmony is a funky Dorian vamp (mostly i7 and IV7, with v7 and bVII turnarounds).
// Pure: no DOM, no Web Audio. Every riff and groove comes from rules plus the seed.

import {
  DORIAN,
  MINOR_PENTATONIC,
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
  type NoteEv,
  type ProgRules,
  type StingerKind,
} from "./composer";
import { Rng, mixSeed } from "./rng";

// Dorian degrees: 0 i7, 3 IV7, 4 v7, 6 bVII7.
export const MUNCH_RULES: ProgRules = {
  table: {
    0: [
      [3, 4],
      [6, 2],
      [4, 1.5],
    ],
    3: [
      [0, 4],
      [6, 1],
      [4, 1],
    ],
    4: [
      [0, 2],
      [3, 2],
      [6, 1],
    ],
    6: [
      [0, 2],
      [3, 2],
    ],
  },
  linger: [0, 3],
  lingerP: 0.45,
  penult: [4, 6],
  half: [3, 4],
  ext: 7,
};
export const MUNCH_DEGREES = [0, 3, 4, 6];

export interface MunchSection {
  chords: Chord[];
  melody: NoteEv[];
  lead: Inst;
  /** One-bar bass riff; midi holds the interval above the chord root. */
  riff: NoteEv[];
}

export interface MunchSong {
  style: "munch";
  mood: LoopMood;
  seed: number;
  key: number;
  mode: typeof DORIAN;
  sections: { A: MunchSection; B: MunchSection };
  /** One-bar hand-drum groove: midi 45 low, 57 high, 64 slap. */
  groove: NoteEv[];
  form: ("A" | "B")[];
  bpm: number;
  swing: number;
}

const KEYS = [9, 4, 2, 7]; // A, E, D, G (minor)
const into = (pc: number, lo: number) => lo + ((((pc - lo) % 12) + 12) % 12);

// Syncopated sixteenth slots a riff may hit (beat 1 is always taken).
const RIFF_SLOTS: readonly (readonly [number, number])[] = [
  [0.75, 3],
  [1, 1],
  [1.5, 2.5],
  [1.75, 2],
  [2.25, 2],
  [2.5, 2.5],
  [3, 1.5],
  [3.25, 2],
  [3.5, 2.5],
];
const RIFF_INTERVALS: readonly (readonly [number, number])[] = [
  [0, 4],
  [12, 2.5],
  [7, 2],
  [10, 2],
  [3, 1],
  [5, 1],
];

/** A one-bar bass riff from minor-pentatonic intervals on a syncopated grid. */
export function generateRiff(rng: Rng): NoteEv[] {
  const count = rng.int(3, 5);
  const slots = new Set<number>();
  while (slots.size < count) slots.add(rng.weighted(RIFF_SLOTS));
  const times = [0, ...[...slots].sort((a, b) => a - b)];
  return times.map((t, i) => {
    const next = times[i + 1] ?? 4;
    const lastOne = i === times.length - 1;
    // Beat 1 is the root; the last note leans back toward it (b7, octave or 5th).
    const iv = i === 0 ? 0 : lastOne ? rng.pick([10, 12, 7]) : rng.weighted(RIFF_INTERVALS);
    return { t, dur: Math.min(0.45, (next - t) * 0.8), midi: iv, vel: i === 0 ? 0.95 : 0.75, inst: "rubber" as Inst };
  });
}

/** A one-bar hand-drum groove: low on 1, slaps on 2 and 4, high taps on a few off-sixteenths. */
export function generateGroove(rng: Rng): NoteEv[] {
  const g: NoteEv[] = [
    { t: 0, dur: 0.2, midi: 45, vel: 0.9, inst: "hand" },
    { t: 1, dur: 0.1, midi: 64, vel: 0.7, inst: "hand" },
    { t: 3, dur: 0.1, midi: 64, vel: 0.75, inst: "hand" },
  ];
  if (rng.chance(0.6)) g.push({ t: rng.pick([2, 2.5]), dur: 0.2, midi: 45, vel: 0.75, inst: "hand" });
  const taps = [0.5, 0.75, 1.5, 1.75, 2.25, 2.75, 3.25, 3.5, 3.75].filter(() => rng.chance(0.45));
  for (const t of taps) g.push({ t, dur: 0.1, midi: 57, vel: 0.45 + rng.next() * 0.2, inst: "hand" });
  return g.sort((a, b) => a.t - b.t);
}

export function composeMunch(mood: LoopMood, seed: number): MunchSong {
  const rng = new Rng(mixSeed(seed, mood === "menu" ? 61 : 62));
  const key = rng.pick(KEYS);
  const tonic = into(key, 60);
  const section = (r: Rng, cadence: "full" | "half"): MunchSection => {
    const chords = generateProgression(r.fork(1), 8, cadence, MUNCH_RULES);
    const melody = generateMelody(r.fork(2), chords, {
      key: tonic,
      lo: tonic,
      hi: tonic + 15,
      endOnTonic: cadence === "full",
      mode: DORIAN,
      pool: MINOR_PENTATONIC,
    }).map((n) => ({ ...n, inst: "kalimba" as Inst }));
    return { chords, melody, lead: "kalimba", riff: generateRiff(r.fork(3)) };
  };
  const A = section(rng.fork(11), "full");
  const B = section(rng.fork(12), "half");
  B.chords[0] = { degree: 3, ext: 7 };
  return {
    style: "munch",
    mood,
    seed,
    key,
    mode: DORIAN,
    sections: { A, B },
    groove: generateGroove(rng.fork(13)),
    form: ["A", "A", "B", "A"],
    bpm: mood === "menu" ? 92 + rng.int(0, 6) : 100,
    swing: 0.56,
  };
}

export function arrangeMunch(song: MunchSong, bar: number, o: ArrangeOpts): Bar {
  const p = formPosition(song, bar);
  const rng = new Rng(mixSeed(song.seed, bar, 93));
  const I = Math.max(0, Math.min(1, o.intensity));
  const battle = song.mood === "battle";
  const key = song.key;
  const tones = chordTones(p.chord, song.mode);
  const notes: NoteEv[] = [];

  // --- rubber bass: the section riff on the chord root, wah opening with the heat
  const root = into(key + tones[0]!, 33);
  const open = battle ? 0.7 + 0.9 * I : 0.8;
  for (const n of p.section.riff) notes.push({ ...n, midi: root + n.midi, cutoff: (n.midi === 0 ? 1300 : 750) * open });
  if (battle && I > 0.6) {
    // Octave pops on the ghost sixteenths.
    for (const t of [1.25, 3.75]) if (!p.section.riff.some((n) => Math.abs(n.t - t) < 0.2)) notes.push({ t, dur: 0.15, midi: root + 12, vel: 0.5, inst: "rubber", cutoff: 1600 });
  }

  // --- kalimba: the hook on call bars, double-stop comping on the off-beats
  const call = p.local % 2 === 0 || p.pass % 2 === 1;
  if (call) for (const n of p.section.melody) if (Math.floor(n.t / 4) === p.local) notes.push({ ...n, t: n.t - p.local * 4 });
  const third = into(key + tones[1]!, 64);
  const seventh = into(key + (tones[3] ?? tones[2]!), 64);
  const comp = battle && I > 0.4 ? [1.5, 3.5] : [3.5];
  if (!call || battle) for (const t of comp) notes.push({ t, dur: 0.3, midi: third, vel: 0.4, inst: "kalimba" }, { t, dur: 0.3, midi: seventh, vel: 0.35, inst: "kalimba" });

  // --- hand drums: the song's groove (only the backbone when it's calm in battle)
  for (const n of song.groove) {
    if (battle && I < 0.3 && n.midi === 57) continue;
    notes.push({ ...n, vel: n.vel * (battle ? 1 : 0.75) });
  }

  // --- shaker
  const shake = battle ? (I > 0.6 ? 0.25 : I > 0.3 ? 0.5 : 0) : 0.5;
  if (shake) for (let t = 0; t < 4; t += shake) notes.push({ t, dur: 0.05, midi: 90, vel: t % 1 === 0.5 ? 0.5 : 0.3, inst: "shaker" });

  // --- flourishes: chitter bursts and a slurpy gulp to close a section
  if (o.flourishes) {
    if (battle ? rng.chance(0.25 + 0.5 * I) : p.local % 2 === 1 && rng.chance(0.3))
      notes.push({ t: rng.pick([1.75, 2.75, 3.25]), dur: 0.3, midi: 0, vel: 0.5, inst: "chitter" });
    if (p.sectionEnd && rng.chance(battle ? 0.4 + 0.4 * I : 0.35)) notes.push({ t: 3, dur: 0.5, midi: into(key, 60), vel: 0.6, inst: "gulp" });
  }

  notes.sort((a, b) => a.t - b.t);
  return { notes, bpm: battle ? song.bpm + Math.round(22 * I) : song.bpm, swing: song.swing, beats: 4 };
}

export function munchStinger(kind: StingerKind, seed: number, flourishes = true): Bar[] {
  const rng = new Rng(mixSeed(seed, kind === "victory" ? 71 : 72));
  const key = rng.pick(KEYS);
  const tonic = into(key, 60);
  const pent = (d: number) => tonic + scaleStep(d, MINOR_PENTATONIC);
  const bass = into(key, 33);
  const bars: Bar[] = [];
  if (kind === "victory") {
    const bpm = 116;
    // Bar 1: a scampering kalimba run up the pentatonic, the bass bouncing, a hand-drum roll.
    const start = rng.pick([0, -2, 1]);
    const b1: NoteEv[] = Array.from({ length: 6 }, (_, i) => ({ t: i * 0.5, dur: 0.4, midi: pent(start + i), vel: 0.8, inst: "kalimba" as Inst }));
    [0, 0.75, 1.5, 2, 3].forEach((t, i) => b1.push({ t, dur: 0.3, midi: bass + (i % 2 ? 12 : 0), vel: 0.9, inst: "rubber", cutoff: 1400 }));
    for (let i = 0; i < 8; i++) b1.push({ t: 2 + i * 0.25, dur: 0.1, midi: i % 3 === 0 ? 45 : 57, vel: 0.5 + i * 0.05, inst: "hand" });
    bars.push({ notes: b1, bpm, swing: 0.56, beats: 4 });
    // Bar 2: a happy IV7 stab, then home with a big satisfied gulp.
    const b2: NoteEv[] = [];
    chordTones({ degree: 3, ext: 7 }, DORIAN).forEach((x) => b2.push({ t: 0, dur: 0.6, midi: into(key + x, 62), vel: 0.6, inst: "kalimba" }));
    chordTones({ degree: 0, ext: 7 }, DORIAN).forEach((x) => b2.push({ t: 2, dur: 1.6, midi: into(key + x, 62), vel: 0.7, inst: "kalimba" }));
    b2.push({ t: 2, dur: 1.2, midi: pent(5), vel: 0.85, inst: "kalimba" });
    b2.push({ t: 0, dur: 0.4, midi: into(key + 5, 33), vel: 0.9, inst: "rubber", cutoff: 1500 }, { t: 2, dur: 1.2, midi: bass, vel: 1, inst: "rubber", cutoff: 1800 });
    b2.push({ t: 0, dur: 0.1, midi: 64, vel: 0.8, inst: "hand" }, { t: 2, dur: 0.2, midi: 45, vel: 0.9, inst: "hand" });
    for (let t = 0; t < 4; t += 0.25) b2.push({ t, dur: 0.05, midi: 90, vel: 0.35, inst: "shaker" });
    if (flourishes) b2.push({ t: 1.4, dur: 0.3, midi: 0, vel: 0.5, inst: "chitter" });
    b2.push({ t: 3, dur: 0.6, midi: tonic, vel: 0.8, inst: "gulp" });
    bars.push({ notes: b2, bpm, swing: 0.56, beats: 4 });
  } else {
    const bpm = 70;
    // A sulky pentatonic droop, the wah closing, and a sad little gulp.
    const top = rng.pick([4, 3]);
    const b1: NoteEv[] = [top, top - 1, top - 2, top - 3].map((d, i) => ({ t: i, dur: 0.9, midi: pent(d), vel: 0.65 - i * 0.06, inst: "kalimba" as Inst }));
    [0, 2].forEach((t, i) => b1.push({ t, dur: 1.6, midi: bass - i * 2, vel: 0.8, inst: "rubber", cutoff: 900 - i * 300 }));
    b1.push({ t: 0, dur: 0.2, midi: 45, vel: 0.6, inst: "hand" }, { t: 2, dur: 0.2, midi: 45, vel: 0.5, inst: "hand" });
    bars.push({ notes: b1, bpm, swing: 0.5, beats: 4 });
    const b2: NoteEv[] = [{ t: 0, dur: 2.5, midi: pent(0), vel: 0.5, inst: "kalimba" }];
    b2.push({ t: 0, dur: 0.7, midi: bass - 3, vel: 0.75, inst: "rubber", cutoff: 500 }, { t: 1, dur: 2.5, midi: bass - 5, vel: 0.8, inst: "rubber", cutoff: 300 });
    b2.push({ t: 2.2, dur: 0.8, midi: tonic - 12, vel: 0.6, inst: "gulp" });
    bars.push({ notes: b2, bpm, swing: 0.5, beats: 4 });
  }
  return bars;
}
