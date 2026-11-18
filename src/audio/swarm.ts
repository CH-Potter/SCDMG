// The Skitterswarm: a skittering hive groove from under the valley. A low sub drone under a pulsing,
// muted rubber bass, a dark kalimba hook in a Phrygian "in" scale (the flat second is the itch), busy
// clicking hand-drum and shaker sixteenths, and bursts of chitter. Harmony is a Phrygian vamp
// (i7, bII maj7, iv7 and the minor bvii7), so it never quite settles.
// Pure: no DOM, no Web Audio. Every riff and groove comes from rules plus the seed.

import {
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

/** Phrygian: minor with a flat second. */
export const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10] as const;
/** The hook's five notes: root, flat 2nd, 4th, 5th, flat 6th (every chord of the vamp has two or more). */
export const SWARM_POOL = [0, 1, 5, 7, 8] as const;

// Phrygian degrees: 0 i7, 1 bII maj7, 3 iv7, 6 bvii7.
export const SWARM_RULES: ProgRules = {
  table: {
    0: [
      [1, 4],
      [3, 2],
      [6, 1.5],
    ],
    1: [
      [0, 4],
      [3, 1],
    ],
    3: [
      [1, 2],
      [0, 2],
      [6, 1],
    ],
    6: [
      [0, 2],
      [1, 2],
    ],
  },
  linger: [0, 1],
  lingerP: 0.5,
  penult: [1, 6],
  half: [3, 6],
  ext: 7,
};
export const SWARM_DEGREES = [0, 1, 3, 6];
/** Bass riff intervals above the chord root: root, octave, 5th, flat 2nd and flat 7th. */
export const SWARM_RIFF_INTERVALS = [0, 1, 7, 10, 12];

export interface SwarmSection {
  chords: Chord[];
  melody: NoteEv[];
  lead: Inst;
  /** One-bar bass riff; midi holds the interval above the chord root. */
  riff: NoteEv[];
}

export interface SwarmSong {
  style: "swarm";
  mood: LoopMood;
  seed: number;
  key: number;
  mode: typeof PHRYGIAN;
  sections: { A: SwarmSection; B: SwarmSection };
  /** One-bar clicking groove: midi 45 low thump, 57 high tick, 64 slap. */
  groove: NoteEv[];
  form: ("A" | "B")[];
  bpm: number;
  swing: number;
}

const KEYS = [4, 9, 2, 11]; // E, A, D, B
const into = (pc: number, lo: number) => lo + ((((pc - lo) % 12) + 12) % 12);

const RIFF_WEIGHTS: readonly (readonly [number, number])[] = [
  [0, 5],
  [12, 2],
  [7, 1.5],
  [1, 1.5],
  [10, 1],
];

/**
 * A one-bar bass riff: a pulse of eighths (most on the root), a few dropped for breath, the odd flat
 * second or octave pop, and the last one leaning back down.
 */
export function generateRiff(rng: Rng): NoteEv[] {
  const out: NoteEv[] = [];
  for (let i = 0; i < 8; i++) {
    const t = i * 0.5;
    if (i > 0 && i < 7 && rng.chance(0.25)) continue;
    const iv = i === 0 ? 0 : i === 7 ? rng.pick([1, 10, 0]) : rng.weighted(RIFF_WEIGHTS);
    out.push({ t, dur: 0.35, midi: iv, vel: i === 0 ? 0.95 : i % 2 ? 0.6 : 0.75, inst: "rubber" as Inst });
  }
  return out;
}

/** A one-bar clicking groove: low thumps on 1 and the "and" of 1, slaps on 2 and 4, ticks on most sixteenths. */
export function generateGroove(rng: Rng): NoteEv[] {
  const g: NoteEv[] = [
    { t: 0, dur: 0.2, midi: 45, vel: 0.9, inst: "hand" },
    { t: 0.75, dur: 0.15, midi: 45, vel: 0.65, inst: "hand" },
    { t: 1, dur: 0.1, midi: 64, vel: 0.7, inst: "hand" },
    { t: 3, dur: 0.1, midi: 64, vel: 0.75, inst: "hand" },
  ];
  if (rng.chance(0.7)) g.push({ t: rng.pick([2.5, 2.75]), dur: 0.15, midi: 45, vel: 0.7, inst: "hand" });
  const ticks = [0.25, 0.5, 1.25, 1.5, 1.75, 2, 2.25, 3.25, 3.5, 3.75].filter(() => rng.chance(0.6));
  for (const t of ticks) g.push({ t, dur: 0.08, midi: 57, vel: 0.35 + rng.next() * 0.2, inst: "hand" });
  return g.sort((a, b) => a.t - b.t);
}

export function composeSwarm(mood: LoopMood, seed: number): SwarmSong {
  const rng = new Rng(mixSeed(seed, mood === "menu" ? 63 : 64));
  const key = rng.pick(KEYS);
  const tonic = into(key, 57);
  const section = (r: Rng, cadence: "full" | "half"): SwarmSection => {
    const chords = generateProgression(r.fork(1), 8, cadence, SWARM_RULES);
    const melody = generateMelody(r.fork(2), chords, {
      key: tonic,
      lo: tonic,
      hi: tonic + 13,
      endOnTonic: cadence === "full",
      mode: PHRYGIAN,
      pool: SWARM_POOL,
    }).map((n) => ({ ...n, inst: "kalimba" as Inst }));
    return { chords, melody, lead: "kalimba", riff: generateRiff(r.fork(3)) };
  };
  const A = section(rng.fork(11), "full");
  const B = section(rng.fork(12), "half");
  B.chords[0] = { degree: 1, ext: 7 };
  return {
    style: "swarm",
    mood,
    seed,
    key,
    mode: PHRYGIAN,
    sections: { A, B },
    groove: generateGroove(rng.fork(13)),
    form: ["A", "A", "B", "A"],
    bpm: mood === "menu" ? 88 + rng.int(0, 6) : 104,
    swing: 0.52,
  };
}

export function arrangeSwarm(song: SwarmSong, bar: number, o: ArrangeOpts): Bar {
  const p = formPosition(song, bar);
  const rng = new Rng(mixSeed(song.seed, bar, 95));
  const I = Math.max(0, Math.min(1, o.intensity));
  const battle = song.mood === "battle";
  const key = song.key;
  const tones = chordTones(p.chord, song.mode);
  const notes: NoteEv[] = [];

  // --- sub drone: the chord root held under everything
  const root = into(key + tones[0]!, 33);
  notes.push({ t: 0, dur: 3.9, midi: root - 12 < 24 ? root : root - 12, vel: 0.55, inst: "sub" });

  // --- rubber bass: the section's pulse, muted, opening a little with the heat
  const open = battle ? 0.45 + 0.55 * I : 0.5;
  for (const n of p.section.riff) notes.push({ ...n, midi: root + n.midi, cutoff: (n.midi === 0 ? 900 : 650) * open });

  // --- kalimba: the hook on call bars, low two-note stabs on the off-beats otherwise
  const call = p.local % 2 === 0 || p.pass % 2 === 1;
  if (call) for (const n of p.section.melody) if (Math.floor(n.t / 4) === p.local) notes.push({ ...n, t: n.t - p.local * 4 });
  const third = into(key + tones[1]!, 55);
  const fifth = into(key + tones[2]!, 55);
  const comp = battle && I > 0.4 ? [0.75, 2.75] : [2.75];
  if (!call || battle) for (const t of comp) notes.push({ t, dur: 0.25, midi: third, vel: 0.38, inst: "kalimba" }, { t, dur: 0.25, midi: fifth, vel: 0.32, inst: "kalimba" });

  // --- clicks: the groove (just the thumps and slaps when it's calm in battle)
  for (const n of song.groove) {
    if (battle && I < 0.3 && n.midi === 57) continue;
    notes.push({ ...n, vel: n.vel * (battle ? 1 : 0.7) });
  }
  if (battle && I > 0.6) for (const t of [1.5, 3.5]) if (!song.groove.some((n) => n.t === t)) notes.push({ t, dur: 0.08, midi: 64, vel: 0.4, inst: "hand" });

  // --- shaker: legs on dry leaves
  const shake = battle ? (I > 0.6 ? 0.25 : I > 0.3 ? 0.5 : 0) : 0.5;
  if (shake) for (let t = 0; t < 4; t += shake) notes.push({ t, dur: 0.04, midi: 94, vel: t % 1 === 0.5 ? 0.42 : 0.26, inst: "shaker" });

  // --- flourishes: chitter bursts, more of them as it heats up, and an acid slurp to close a section
  if (o.flourishes) {
    if (battle ? rng.chance(0.4 + 0.5 * I) : rng.chance(0.4)) notes.push({ t: rng.pick([1.25, 2.25, 3.25]), dur: 0.35, midi: 0, vel: 0.5, inst: "chitter" });
    if (battle && I > 0.5 && rng.chance(0.5)) notes.push({ t: rng.pick([0.25, 2.75]), dur: 0.25, midi: 0, vel: 0.4, inst: "chitter" });
    if (p.sectionEnd && rng.chance(battle ? 0.3 + 0.3 * I : 0.25)) notes.push({ t: 3, dur: 0.5, midi: into(key + 1, 48), vel: 0.55, inst: "gulp" });
  }

  notes.sort((a, b) => a.t - b.t);
  return { notes, bpm: battle ? song.bpm + Math.round(20 * I) : song.bpm, swing: song.swing, beats: 4 };
}

export function swarmStinger(kind: StingerKind, seed: number, flourishes = true): Bar[] {
  const rng = new Rng(mixSeed(seed, kind === "victory" ? 73 : 74));
  const key = rng.pick(KEYS);
  const tonic = into(key, 57);
  const hook = (d: number) => tonic + scaleStep(d, SWARM_POOL);
  const bass = into(key, 33);
  const bars: Bar[] = [];
  if (kind === "victory") {
    const bpm = 112;
    // Bar 1: the swarm boils up: a kalimba run up the hook scale over a pulsing bass and a tick roll.
    const start = rng.pick([0, -1, 1]);
    const b1: NoteEv[] = Array.from({ length: 7 }, (_, i) => ({ t: i * 0.5, dur: 0.35, midi: hook(start + i), vel: 0.75, inst: "kalimba" as Inst }));
    for (let i = 0; i < 8; i++) b1.push({ t: i * 0.5, dur: 0.3, midi: bass + (i % 4 === 3 ? 1 : 0), vel: 0.85, inst: "rubber", cutoff: 900 });
    b1.push({ t: 0, dur: 3.8, midi: bass - 12 < 24 ? bass : bass - 12, vel: 0.5, inst: "sub" });
    for (let i = 0; i < 12; i++) b1.push({ t: 1 + i * 0.25, dur: 0.08, midi: i % 4 === 0 ? 45 : 57, vel: 0.4 + i * 0.04, inst: "hand" });
    bars.push({ notes: b1, bpm, swing: 0.52, beats: 4 });
    // Bar 2: the flat-second chord, then the tonic chord held, with a last scuttle of chitter.
    const b2: NoteEv[] = [];
    chordTones({ degree: 1, ext: 7 }, PHRYGIAN).forEach((x) => b2.push({ t: 0, dur: 0.6, midi: into(key + x, 57), vel: 0.6, inst: "kalimba" }));
    chordTones({ degree: 0, ext: 7 }, PHRYGIAN).forEach((x) => b2.push({ t: 2, dur: 1.6, midi: into(key + x, 57), vel: 0.7, inst: "kalimba" }));
    b2.push({ t: 0, dur: 0.4, midi: bass + 1, vel: 0.9, inst: "rubber", cutoff: 1000 }, { t: 2, dur: 1.4, midi: bass, vel: 1, inst: "rubber", cutoff: 1200 });
    b2.push({ t: 2, dur: 1.9, midi: bass - 12 < 24 ? bass : bass - 12, vel: 0.6, inst: "sub" });
    b2.push({ t: 0, dur: 0.1, midi: 64, vel: 0.8, inst: "hand" }, { t: 2, dur: 0.2, midi: 45, vel: 0.9, inst: "hand" });
    for (let t = 0; t < 4; t += 0.25) b2.push({ t, dur: 0.04, midi: 94, vel: 0.3, inst: "shaker" });
    if (flourishes) b2.push({ t: 1.25, dur: 0.4, midi: 0, vel: 0.55, inst: "chitter" }, { t: 3.25, dur: 0.4, midi: 0, vel: 0.45, inst: "chitter" });
    bars.push({ notes: b2, bpm, swing: 0.52, beats: 4 });
  } else {
    const bpm = 68;
    // The hum dies down: the hook sinks a step at a time onto the flat second, the bass sags.
    const top = rng.pick([4, 3]);
    const b1: NoteEv[] = [top, top - 1, top - 2, top - 3].map((d, i) => ({ t: i, dur: 0.9, midi: hook(d), vel: 0.6 - i * 0.06, inst: "kalimba" as Inst }));
    [0, 2].forEach((t, i) => b1.push({ t, dur: 1.6, midi: bass - i, vel: 0.8, inst: "rubber", cutoff: 700 - i * 250 }));
    b1.push({ t: 0, dur: 3.8, midi: bass - 12 < 24 ? bass : bass - 12, vel: 0.5, inst: "sub" });
    b1.push({ t: 0, dur: 0.2, midi: 45, vel: 0.6, inst: "hand" }, { t: 2, dur: 0.2, midi: 45, vel: 0.45, inst: "hand" });
    bars.push({ notes: b1, bpm, swing: 0.5, beats: 4 });
    const b2: NoteEv[] = [{ t: 0, dur: 2.5, midi: tonic + 1, vel: 0.45, inst: "kalimba" }];
    b2.push({ t: 0, dur: 0.7, midi: bass + 1, vel: 0.7, inst: "rubber", cutoff: 450 }, { t: 1, dur: 2.5, midi: bass, vel: 0.8, inst: "rubber", cutoff: 280 });
    b2.push({ t: 2.2, dur: 0.8, midi: tonic - 12, vel: 0.55, inst: "gulp" });
    bars.push({ notes: b2, bpm, swing: 0.5, beats: 4 });
  }
  return bars;
}
