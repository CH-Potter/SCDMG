// The procedural Western score: chord progressions, melodies and per-bar arrangements, all from a seed.
// Pure: no DOM, no Web Audio. Times are in beats (4 beats per bar), pitches are MIDI note numbers.
//
// Melodies are generated from scale and arpeggio rules (chord tones on strong beats, stepwise motion
// between, leap recovery, motif repetition, cadences), never copied from an existing tune.

import { Rng, mixSeed } from "./rng";

export type Inst =
  | "guitar" // Karplus–Strong twang
  | "piano" // honky-tonk (two detuned strings)
  | "harmonica" // reedy pulse with vibrato
  | "whistle" // sine with scoop and vibrato
  | "bass" // upright walk
  | "clip" // high woodblock (hoof)
  | "clop" // low woodblock (hoof)
  | "spoons"
  | "whip"
  | "ricochet"
  // Lumen Concord: crystal electronic
  | "bell" // FM glass bell
  | "cpluck" // short FM crystal pluck
  | "pad" // warm detuned saws
  | "arp" // resonant filtered synth sequence
  | "sub" // sine sub bass
  | "kick"
  | "clap"
  | "hat"
  | "riser" // filtered-noise sweep
  // The Skitterswarm: skittering hive groove
  | "rubber" // bouncy wah bass
  | "kalimba"
  | "hand" // hand drum (midi < 50 low, < 60 high, else slap)
  | "shaker"
  | "chitter" // a burst of bug clicks over the note's length
  | "gulp"; // slurpy pitch-bend accent

/** The three musical styles; custom factions map onto them by their token look. */
export type Style = "western" | "crystal" | "swarm";

export function styleForLook(look: string | undefined): Style {
  return look === "crystal" ? "crystal" : look === "teeth" ? "swarm" : "western";
}

export interface NoteEv {
  /** Start, in beats from the start of the bar (or phrase, before slicing). */
  t: number;
  /** Length in beats. */
  dur: number;
  midi: number;
  /** 0..1 */
  vel: number;
  inst: Inst;
  /** Filter cutoff in Hz for synth voices that have one (arp, pad, rubber bass). */
  cutoff?: number;
}

export interface Bar {
  notes: NoteEv[];
  bpm: number;
  /** Where the off-beat eighth lands inside the beat (0.5 straight, ~0.62 shuffle). */
  swing: number;
  beats: number;
}

export type LoopMood = "menu" | "battle";
export type StingerKind = "victory" | "defeat";

export const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;
export const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const;
export const LYDIAN = [0, 2, 4, 6, 7, 9, 11] as const;
export const MINOR_PENTATONIC = [0, 3, 5, 7, 10] as const;
export type Mode = readonly number[];
export const ROMAN = ["I", "ii", "iii", "IV", "V", "vi", "vii°"] as const;

export interface Chord {
  /** 0-based scale degree: 0 = I, 3 = IV, 4 = V... */
  degree: number;
  dom7?: boolean;
  /** Extensions for pads and funk: 7 adds the diatonic 7th, 9 adds the 7th and 9th. */
  ext?: 7 | 9;
}

/** Semitone offset of a scale index from the tonic (index may go past the octave or below 0). */
export function scaleStep(i: number, mode: Mode = MAJOR): number {
  const n = mode.length;
  const o = Math.floor(i / n);
  return mode[((i % n) + n) % n]! + 12 * o;
}

/** Chord tones as semitone offsets from the key: root, 3rd, 5th (plus 7th / 9th if asked). */
export function chordTones(c: Chord, mode: Mode = MAJOR): number[] {
  const st = (i: number) => scaleStep(i, mode);
  const out = [st(c.degree), st(c.degree + 2), st(c.degree + 4)];
  if (c.dom7 || c.ext) out.push(st(c.degree + 6));
  if (c.ext === 9) out.push(st(c.degree + 8));
  return out;
}

/** Pitch classes (0..11) of a chord in a key. */
export function chordPcs(key: number, c: Chord, mode: Mode = MAJOR): number[] {
  return chordTones(c, mode).map((x) => (((key + x) % 12) + 12) % 12);
}

export function inKey(key: number, midi: number, pool: Mode = MAJOR): boolean {
  return pool.includes((((midi - key) % 12) + 12) % 12);
}

// Mostly I, IV and V, with the occasional ii or vi. Weights favour the classic cowboy cadences.
const NEXT: Record<number, readonly (readonly [number, number])[]> = {
  0: [
    [3, 4],
    [4, 3.2],
    [5, 0.9],
    [1, 0.7],
  ],
  3: [
    [0, 3.5],
    [4, 3],
    [1, 0.8],
  ],
  4: [
    [0, 5],
    [5, 0.6],
    [3, 0.8],
  ],
  1: [
    [4, 5],
    [3, 1],
  ],
  5: [
    [1, 2],
    [3, 3],
    [4, 1],
  ],
};
export const ALLOWED_DEGREES = [0, 1, 3, 4, 5];

/** Chord-motion rules for a style. */
export interface ProgRules {
  /** Weighted next-chord table, by scale degree. */
  table: Record<number, readonly (readonly [number, number])[]>;
  /** Chords that may be held for a second bar, and how often. */
  linger: readonly number[];
  lingerP: number;
  /** Second-to-last chord of a "full" cadence (the last is always the tonic). */
  penult: readonly number[];
  /** Last chord of a "half" cadence. */
  half: readonly number[];
  /** Degree that may become a dominant 7th, or none. */
  dom7?: number;
  /** Extension applied to every chord (pads, funk). */
  ext?: 7 | 9;
}

export const WESTERN_RULES: ProgRules = { table: NEXT, linger: [0, 3], lingerP: 0.15, penult: [4], half: [4], dom7: 4 };

/**
 * One chord per bar. Starts on the tonic. "full" ends penult then tonic; "half" ends away from home
 * (so the next section resolves it). Western rules: I/IV/V with the odd ii or vi, ending V then I.
 */
export function generateProgression(rng: Rng, bars: number, cadence: "full" | "half", rules: ProgRules = WESTERN_RULES): Chord[] {
  const d: number[] = [0];
  for (let i = 1; i < bars; i++) {
    const prev = d[i - 1]!;
    if (cadence === "full" && i === bars - 1) d.push(0);
    else if (cadence === "full" && i === bars - 2) d.push(rng.pick(rules.penult));
    else if (cadence === "half" && i === bars - 1) d.push(rng.pick(rules.half));
    else if (rules.linger.includes(prev) && rng.chance(rules.lingerP) && d[i - 2] !== prev) d.push(prev);
    else d.push(rng.weighted(rules.table[prev] ?? rules.table[0]!));
  }
  return d.map((degree) => {
    const c: Chord = { degree };
    if (rules.dom7 !== undefined && degree === rules.dom7 && rng.chance(0.45)) c.dom7 = true;
    if (rules.ext) c.ext = rules.ext;
    return c;
  });
}

// Rhythm cells in eighth notes (8 per bar). Negative = rest.
const CELLS: number[][] = [
  [2, 2, 2, 2],
  [3, 1, 2, 2],
  [2, 1, 1, 2, 2],
  [1, 1, 2, 2, 2],
  [4, 2, 2],
  [2, 2, 1, 1, 2],
  [3, 1, 3, 1],
  [1, 1, 1, 1, 2, 2],
  [-2, 2, 2, 2],
  [2, 2, 2, -2],
  [3, 1, 2, 1, 1],
];
const PHRASE_END_CELLS: number[][] = [
  [2, 2, 4],
  [3, 1, 4],
  [2, 6],
  [4, 4],
  [1, 1, 2, 4],
];
const FINAL_CELLS: number[][] = [[2, 2, 4], [3, 1, 4], [2, 6], [8], [4, 4]];

export interface MelodyOpts {
  key: number; // tonic MIDI (any octave)
  lo: number;
  hi: number;
  /** End the passage on the tonic (true) or on a chord tone of the last chord. */
  endOnTonic: boolean;
  /** Scale the chords are built from (default major). */
  mode?: Mode;
  /** Pitch set the tune may use, as offsets from the tonic (default: the mode). */
  pool?: Mode;
  /** Offsets treated as passing tones only on longer weak notes (default: the major 4th and 7th). */
  avoid?: readonly number[];
}

/** One melody over the given chords (one chord per bar). Note times are beats from the section start. */
export function generateMelody(rng: Rng, chords: Chord[], o: MelodyOpts): NoteEv[] {
  const scale: number[] = [];
  const mode = o.mode ?? MAJOR;
  const avoid = o.avoid ?? (o.mode ? [] : [5, 11]);
  for (let m = o.lo; m <= o.hi; m++) if (inKey(o.key, m, o.pool ?? mode)) scale.push(m);
  const tonicPc = ((o.key % 12) + 12) % 12;
  // Start near the middle of the range, on a tone of the first chord.
  let cur = scale[Math.floor(scale.length / 2)]!;
  let pendingDir = 0;
  let dir = rng.chance(0.5) ? 1 : -1;
  const motifA = rng.pick(CELLS);
  const motifB = rng.pick(CELLS);
  const out: NoteEv[] = [];

  const nearestIdx = (m: number) => {
    let best = 0;
    for (let i = 1; i < scale.length; i++) if (Math.abs(scale[i]! - m) < Math.abs(scale[best]! - m)) best = i;
    return best;
  };
  const chordToneNear = (pcs: number[], from: number, preferDir: number): number => {
    const cands = scale.filter((m) => pcs.includes(m % 12)).sort((a, b) => Math.abs(a - from) - Math.abs(b - from));
    if (!cands.length) return from;
    const near = cands.slice(0, 2);
    // Lean in the travel direction, but never jump far.
    const inDir = near.find((m) => Math.sign(m - from) === preferDir);
    return inDir !== undefined && Math.abs(inDir - from) <= 5 && rng.chance(0.6) ? inDir : near[0]!;
  };

  chords.forEach((chord, bar) => {
    const pcs = chordPcs(o.key, chord, mode);
    const last = bar === chords.length - 1;
    const phraseEnd = bar % 4 === 3;
    const cell = last
      ? rng.pick(FINAL_CELLS)
      : phraseEnd
        ? rng.pick(PHRASE_END_CELLS)
        : bar % 2 === 0
          ? bar % 4 === 2 && rng.chance(0.3)
            ? rng.pick(CELLS)
            : motifA
          : motifB;
    const arp = !last && rng.chance(0.22);
    const arpTones = arp ? scale.filter((m) => pcs.includes(m % 12)) : [];
    const notesIn = cell.filter((x) => x > 0).length;
    let k = 0;
    let t = 0;
    for (const len of cell) {
      if (len < 0) {
        t += -len;
        continue;
      }
      k++;
      const strong = t % 4 === 0;
      const lastNote = k === notesIn;
      let next: number;
      if (last && lastNote && o.endOnTonic) {
        const tonics = scale.filter((m) => m % 12 === tonicPc).sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur));
        next = tonics[0] ?? cur;
      } else if (arp && !strong && arpTones.length) {
        // Arpeggio: walk to the next chord tone in the travel direction.
        const stepTo = dir > 0 ? arpTones.find((m) => m > cur) : [...arpTones].reverse().find((m) => m < cur);
        if (stepTo === undefined || Math.abs(stepTo - cur) > 5) {
          dir = -dir;
          next = chordToneNear(pcs, cur, dir);
        } else next = stepTo;
      } else if (strong || len >= 4 || lastNote) {
        next = chordToneNear(pcs, cur, pendingDir || dir);
      } else {
        const d = pendingDir || (rng.chance(0.75) ? dir : -dir);
        const size = rng.chance(0.75) ? 1 : 2;
        let idx = nearestIdx(cur) + d * size;
        if (idx < 0 || idx >= scale.length) idx = nearestIdx(cur) - d * size;
        next = scale[Math.max(0, Math.min(scale.length - 1, idx))]!;
        // The 4th and 7th are passing tones only: nudge off them on longer weak notes.
        const deg = (((next - o.key) % 12) + 12) % 12;
        if (len >= 2 && avoid.includes(deg) && rng.chance(0.6)) next = scale[Math.max(0, Math.min(scale.length - 1, nearestIdx(next) + d))]!;
      }
      // Leap recovery: after a jump of more than a major 3rd, step back the other way.
      pendingDir = Math.abs(next - cur) > 4 ? -Math.sign(next - cur) : 0;
      if (next !== cur) dir = Math.sign(next - cur);
      // Bounce off the edges of the range.
      if (next >= o.hi - 1) dir = -1;
      if (next <= o.lo + 1) dir = 1;
      cur = next;
      out.push({ t: bar * 4 + t / 2, dur: (len / 2) * 0.92, midi: cur, vel: strong ? 0.9 : 0.72, inst: "harmonica" });
      t += len;
    }
  });
  return out;
}

// ---------------------------------------------------------------- songs

export interface Section {
  chords: Chord[];
  melody: NoteEv[];
  lead: Inst;
}

export interface Song {
  style: "western";
  mood: LoopMood;
  seed: number;
  /** Tonic pitch class (0 = C). */
  key: number;
  sections: { A: Section; B: Section };
  form: ("A" | "B")[];
  bpm: number;
  swing: number;
}

const BARS = 8;
const KEYS = [7, 2, 9, 0, 4]; // G, D, A, C, E: guitar-friendly

export function composeSong(mood: LoopMood, seed: number): Song {
  const rng = new Rng(mixSeed(seed, mood === "menu" ? 1 : 2));
  const key = rng.pick(KEYS);
  const lead = (r: Rng): Inst => (r.chance(0.5) ? "harmonica" : "whistle");
  const leadA = lead(rng);
  const leadB: Inst = leadA === "harmonica" ? "whistle" : "harmonica";
  // Melody register: the octave above middle C-ish, rooted on the key.
  const tonic = 60 + key;
  const mel = (r: Rng, chords: Chord[], endOnTonic: boolean, inst: Inst) =>
    generateMelody(r, chords, { key: tonic, lo: tonic - 5, hi: tonic + 14, endOnTonic }).map((n) => ({ ...n, inst }));
  const aChords = generateProgression(rng.fork(11), BARS, "full");
  const bChords = generateProgression(rng.fork(12), BARS, "half");
  // B leans away from home: start it on IV or vi.
  bChords[0] = { degree: rng.chance(0.7) ? 3 : 5 };
  return {
    style: "western",
    mood,
    seed,
    key,
    sections: {
      A: { chords: aChords, melody: mel(rng.fork(21), aChords, true, leadA), lead: leadA },
      B: { chords: bChords, melody: mel(rng.fork(22), bChords, false, leadB), lead: leadB },
    },
    form: ["A", "A", "B", "A"],
    bpm: mood === "menu" ? 88 + rng.int(0, 8) : 106,
    swing: mood === "menu" ? 0.64 : 0.6,
  };
}

export const formBars = (song: { form: readonly unknown[] }) => song.form.length * BARS;

/** Anything with an A/B form of 8-bar sections. */
export interface FormSong<S extends { chords: Chord[] }> {
  form: ("A" | "B")[];
  sections: { A: S; B: S };
}

/** Where a running bar index falls in the song form. */
export function formPosition<S extends { chords: Chord[] }>(song: FormSong<S>, bar: number) {
  const total = formBars(song);
  const pos = ((bar % total) + total) % total;
  const name = song.form[Math.floor(pos / BARS)]!;
  const local = pos % BARS;
  const nextPos = (pos + 1) % total;
  const nextName = song.form[Math.floor(nextPos / BARS)]!;
  return {
    pass: Math.floor(bar / total),
    name,
    section: song.sections[name],
    local,
    chord: song.sections[name].chords[local]!,
    nextChord: song.sections[nextName].chords[nextPos % BARS]!,
    sectionEnd: local === BARS - 1,
    formEnd: pos === total - 1,
  };
}

export interface ArrangeOpts {
  /** 0..1: battle heat. More percussion, busier strum, faster tempo. */
  intensity: number;
  /** Another style to weave in lightly (the AI faction, on its turns). */
  guest?: Style;
  /** Whip cracks and ricochets. Off for reduced motion. */
  flourishes: boolean;
}

/** Open-ish guitar voicing: root in the low E–D# range, then 5th, octave, 10th, 12th. */
export function guitarVoicing(key: number, c: Chord): number[] {
  const tones = chordTones(c);
  const root = 40 + ((((key + tones[0]!) - 40) % 12) + 12) % 12; // 40..51
  const third = tones[1]! - tones[0]!;
  const fifth = tones[2]! - tones[0]!;
  const v = [root, root + fifth, root + 12, root + 12 + third, root + 12 + fifth];
  if (c.dom7 && tones[3] !== undefined) v[2] = root + (tones[3] - tones[0]!);
  return v.filter((m) => m <= 72);
}

/** Close piano voicing between about G3 and C5. */
export function pianoVoicing(key: number, c: Chord): number[] {
  return chordTones(c)
    .map((x) => {
      let m = 55 + ((((key + x) - 55) % 12) + 12) % 12;
      if (m > 70) m -= 12;
      return m;
    })
    .sort((a, b) => a - b);
}

export function bassRoot(key: number, c: Chord): number {
  return 36 + ((((key + chordTones(c)[0]!) - 36) % 12) + 12) % 12; // C2..B2
}

/** Arrange one bar of the loop: melody slice plus bass, guitar, piano and percussion for the intensity. */
export function arrangeBar(song: Song, bar: number, o: ArrangeOpts): Bar {
  const p = formPosition(song, bar);
  const rng = new Rng(mixSeed(song.seed, bar, 77));
  const I = Math.max(0, Math.min(1, o.intensity));
  const key = song.key;
  const notes: NoteEv[] = [];
  const battle = song.mood === "battle";
  const bpm = battle ? song.bpm + Math.round(22 * I) : song.bpm;

  // --- lead melody (on the second pass of the form, the piano takes the A tune an octave up)
  const pianoLead = p.pass % 2 === 1 && p.name === "A";
  const dropLead = battle && I < 0.25 && p.pass % 3 === 2 && p.name === "A";
  if (!dropLead)
    for (const n of p.section.melody) {
      if (Math.floor(n.t / 4) !== p.local) continue;
      notes.push(
        pianoLead
          ? { ...n, t: n.t - p.local * 4, inst: "piano", midi: n.midi + 12, vel: n.vel * 0.8 }
          : { ...n, t: n.t - p.local * 4 },
      );
    }

  // --- upright bass: two-feel when calm, walking quarters when hot
  const root = bassRoot(key, p.chord);
  const tones = chordTones(p.chord).map((x) => x - chordTones(p.chord)[0]!);
  const nextRoot = bassRoot(key, p.nextChord);
  const fifth = root + tones[2]! > 50 ? root + tones[2]! - 12 : root + tones[2]!;
  const walk = battle ? I > 0.35 : I > 0.6;
  if (!walk) {
    notes.push({ t: 0, dur: 1.6, midi: root, vel: 0.9, inst: "bass" });
    notes.push({ t: 2, dur: 1.4, midi: fifth, vel: 0.8, inst: "bass" });
    if (rng.chance(0.4)) notes.push({ t: 3.5, dur: 0.4, midi: approach(rng, key, nextRoot), vel: 0.6, inst: "bass" });
  } else {
    const third = root + tones[1]!;
    const line = [root, rng.chance(0.5) ? third : fifth, rng.chance(0.5) ? fifth : root + 12, approach(rng, key, nextRoot)];
    line.forEach((m, i) => notes.push({ t: i, dur: 0.85, midi: m, vel: i === 0 ? 0.95 : 0.78, inst: "bass" }));
  }

  // --- twangy guitar strum
  const gv = guitarVoicing(key, p.chord);
  const strum = (t: number, down: boolean, vel: number, dur: number) => {
    const strings = down ? gv.slice(1) : gv.slice(-3).reverse();
    strings.forEach((m, i) => notes.push({ t: t + i * 0.035, dur, midi: m, vel: vel * (down ? 1 : 0.7), inst: "guitar" }));
  };
  const busy = battle ? I : I * 0.5;
  if (busy < 0.3) {
    strum(1, true, 0.7, 0.9);
    strum(3, true, 0.7, 0.9);
    if (rng.chance(0.3)) strum(3.5, false, 0.6, 0.4);
  } else if (busy < 0.7) {
    // D . D U . U D U
    strum(0, true, 0.75, 0.9);
    strum(1, true, 0.7, 0.45);
    strum(1.5, false, 0.6, 0.4);
    strum(2.5, false, 0.6, 0.4);
    strum(3, true, 0.72, 0.45);
    strum(3.5, false, 0.6, 0.4);
  } else {
    for (let i = 0; i < 8; i++) strum(i / 2, i % 2 === 0, i % 4 === 0 ? 0.85 : 0.65, 0.35);
  }

  // --- honky-tonk piano: off-beat stabs, the odd grace-note roll at phrase ends
  const pv = pianoVoicing(key, p.chord);
  const stab = (t: number, vel: number) => pv.forEach((m) => notes.push({ t, dur: 0.4, midi: m, vel, inst: "piano" }));
  if (!pianoLead) {
    if (battle && I > 0.55) [0.5, 1.5, 2.5, 3.5].forEach((t) => stab(t, 0.5));
    else {
      stab(1, 0.5);
      stab(3, 0.5);
    }
    if (p.local % 4 === 3 && rng.chance(0.6)) {
      const top = pv[pv.length - 1]! + 12;
      [top - 2, top - 1, top].forEach((m, i) => notes.push({ t: 3.25 + i * 0.12, dur: 0.3, midi: m, vel: 0.45, inst: "piano" }));
    }
  }

  // --- clip-clop hooves and spoons
  if (!battle) {
    // A lazy walking horse.
    notes.push({ t: 0, dur: 0.1, midi: 79, vel: 0.5, inst: "clip" }, { t: 1, dur: 0.1, midi: 72, vel: 0.45, inst: "clop" });
    notes.push({ t: 2, dur: 0.1, midi: 79, vel: 0.5, inst: "clip" }, { t: 3, dur: 0.1, midi: 72, vel: 0.45, inst: "clop" });
  } else if (I < 0.35) {
    for (let b = 0; b < 4; b++) notes.push({ t: b, dur: 0.1, midi: b % 2 ? 72 : 79, vel: 0.55, inst: b % 2 ? "clop" : "clip" });
  } else {
    // Gallop: da-da-DUM on every beat.
    for (let b = 0; b < 4; b++) {
      notes.push({ t: b, dur: 0.1, midi: 79, vel: 0.45, inst: "clip" });
      notes.push({ t: b + 0.25, dur: 0.1, midi: 76, vel: 0.4, inst: "clip" });
      notes.push({ t: b + 0.5, dur: 0.1, midi: 72, vel: 0.65, inst: "clop" });
    }
  }
  if (battle ? I > 0.3 : rng.chance(0.25)) for (let b = 0; b < 4; b++) notes.push({ t: b + 0.5, dur: 0.08, midi: 90, vel: 0.5, inst: "spoons" });
  if (battle && I > 0.65) [3.5, 3.667, 3.833].forEach((t) => notes.push({ t, dur: 0.06, midi: 90, vel: 0.4, inst: "spoons" }));

  // --- flourishes: a whip crack to close a section, a stray ricochet when it's hot
  if (o.flourishes) {
    if (p.sectionEnd && (battle ? rng.chance(0.25 + 0.45 * I) : p.formEnd && rng.chance(0.4)))
      notes.push({ t: 3.5, dur: 0.3, midi: 0, vel: 0.7, inst: "whip" });
    if (battle && !p.sectionEnd && rng.chance(0.1 * I)) notes.push({ t: rng.pick([1.5, 2.5]), dur: 0.6, midi: 0, vel: 0.35, inst: "ricochet" });
  }

  notes.sort((a, b) => a.t - b.t);
  return { notes, bpm, swing: song.swing, beats: 4 };
}

/** A note leading into the next root: a chromatic step from below or a scale step from above. */
function approach(rng: Rng, key: number, nextRoot: number): number {
  if (rng.chance(0.5)) return nextRoot - 1;
  for (const d of [2, 1]) if (inKey(key, nextRoot + d)) return nextRoot + d;
  return nextRoot + 2;
}

// ---------------------------------------------------------------- stingers

/** A short one-shot cue (2–3 bars). Generated from the same rules, varied by the seed. */
export function composeStinger(kind: StingerKind, seed: number, flourishes = true): Bar[] {
  const rng = new Rng(mixSeed(seed, kind === "victory" ? 31 : 32));
  const key = rng.pick(KEYS);
  const tonic = 60 + key;
  const deg = (i: number) => tonic + scaleStep(i);
  const bars: Bar[] = [];
  const strum = (notes: NoteEv[], t: number, c: Chord, vel: number, dur: number) =>
    guitarVoicing(key, c).forEach((m, i) => notes.push({ t: t + i * 0.04, dur, midi: m, vel, inst: "guitar" }));

  if (kind === "victory") {
    const bpm = 132;
    // Bar 1: an arpeggio up the tonic chord, landing on IV.
    const up = rng.pick([
      [0, 2, 4, 7],
      [-3, 0, 2, 4],
      [4, 7, 9, 7],
    ]);
    const b1: NoteEv[] = up.map((d, i) => ({ t: i * 0.5, dur: 0.45, midi: deg(d), vel: 0.85, inst: "harmonica" as Inst }));
    b1.push({ t: 2, dur: 1.8, midi: deg(rng.pick([5, 7])), vel: 0.9, inst: "harmonica" });
    strum(b1, 0, { degree: 0 }, 0.8, 1.6);
    strum(b1, 2, { degree: 3 }, 0.8, 1.6);
    b1.push({ t: 0, dur: 1.5, midi: bassRoot(key, { degree: 0 }), vel: 0.9, inst: "bass" });
    b1.push({ t: 2, dur: 1.5, midi: bassRoot(key, { degree: 3 }), vel: 0.9, inst: "bass" });
    bars.push({ notes: b1, bpm, swing: 0.58, beats: 4 });
    // Bar 2: V with a stepwise run home.
    const run = rng.pick([
      [4, 5, 6],
      [8, 7, 6],
      [4, 6, 8],
    ]);
    const b2: NoteEv[] = run.map((d, i) => ({ t: i * 0.67, dur: 0.6, midi: deg(d), vel: 0.85, inst: "harmonica" as Inst }));
    strum(b2, 0, { degree: 4, dom7: true }, 0.85, 1.8);
    b2.push({ t: 0, dur: 1.8, midi: bassRoot(key, { degree: 4 }), vel: 0.9, inst: "bass" });
    pianoVoicing(key, { degree: 4, dom7: true }).forEach((m) => b2.push({ t: 2, dur: 0.6, midi: m, vel: 0.6, inst: "piano" }));
    for (let i = 0; i < 4; i++) b2.push({ t: 2 + i * 0.5, dur: 0.1, midi: i % 2 ? 72 : 79, vel: 0.6, inst: i % 2 ? "clop" : "clip" });
    bars.push({ notes: b2, bpm, swing: 0.58, beats: 4 });
    // Bar 3: big tonic.
    const b3: NoteEv[] = [{ t: 0, dur: 3.6, midi: deg(7), vel: 1, inst: "harmonica" }];
    strum(b3, 0, { degree: 0 }, 1, 3.5);
    b3.push({ t: 0, dur: 3, midi: bassRoot(key, { degree: 0 }), vel: 1, inst: "bass" });
    pianoVoicing(key, { degree: 0 }).forEach((m) => b3.push({ t: 0, dur: 2, midi: m + 12, vel: 0.6, inst: "piano" }));
    if (flourishes) b3.push({ t: 0.6, dur: 0.3, midi: 0, vel: 0.8, inst: "whip" });
    bars.push({ notes: b3, bpm, swing: 0.58, beats: 4 });
  } else {
    const bpm = 72;
    // A droopy descent over I → minor iv → I, the lead sagging on the way down.
    const top = rng.pick([4, 2]);
    const b1: NoteEv[] = [top, top - 1, top - 2].map((d, i) => ({ t: i * 1.2, dur: 1.1, midi: deg(d), vel: 0.8 - i * 0.08, inst: "whistle" as Inst }));
    strum(b1, 0, { degree: 0 }, 0.6, 2);
    b1.push({ t: 0, dur: 1.8, midi: bassRoot(key, { degree: 0 }), vel: 0.8, inst: "bass" });
    // Borrowed minor iv: root, flat 3rd (= flat 6 of the key), 5th.
    const ivMinor = [5, 8, 12].map((x) => 55 + ((((key + x) - 55) % 12) + 12) % 12).sort((a, b) => a - b);
    ivMinor.forEach((m) => b1.push({ t: 2, dur: 1.8, midi: m, vel: 0.5, inst: "piano" }));
    b1.push({ t: 2, dur: 1.8, midi: bassRoot(key, { degree: 3 }), vel: 0.75, inst: "bass" });
    bars.push({ notes: b1, bpm, swing: 0.5, beats: 4 });
    const b2: NoteEv[] = [{ t: 0, dur: 1, midi: deg(rng.pick([1, -1])), vel: 0.6, inst: "whistle" }, { t: 1.2, dur: 2.6, midi: deg(0), vel: 0.55, inst: "whistle" }];
    pianoVoicing(key, { degree: 0 }).forEach((m) => b2.push({ t: 1.2, dur: 2.4, midi: m, vel: 0.45, inst: "piano" }));
    const low = bassRoot(key, { degree: 0 });
    b2.push({ t: 1.2, dur: 2.5, midi: low >= 40 ? low - 12 : low, vel: 0.8, inst: "bass" });
    b2.push({ t: 1.2, dur: 0.1, midi: 72, vel: 0.4, inst: "clop" });
    bars.push({ notes: b2, bpm, swing: 0.5, beats: 4 });
  }
  return bars;
}
