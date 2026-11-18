// One entry point for every musical style: compose a loop, arrange a bar, write a stinger.
// Pure. Western lives in composer.ts, the Lumen Concord in crystal.ts, the Skitterswarm in swarm.ts.

import {
  MAJOR,
  arrangeBar,
  chordPcs,
  composeSong,
  composeStinger,
  formPosition,
  guitarVoicing,
  type ArrangeOpts,
  type Bar,
  type LoopMood,
  type NoteEv,
  type Song,
  type StingerKind,
  type Style,
} from "./composer";
import { arrangeCrystal, composeCrystal, crystalStinger, type CrystalSong } from "./crystal";
import { arrangeSwarm, composeSwarm, swarmStinger, type SwarmSong } from "./swarm";
import { Rng, mixSeed } from "./rng";

export type AnySong = Song | CrystalSong | SwarmSong;

export function composeStyleSong(style: Style, mood: LoopMood, seed: number): AnySong {
  return style === "crystal" ? composeCrystal(mood, seed) : style === "swarm" ? composeSwarm(mood, seed) : composeSong(mood, seed);
}

export function arrangeStyleBar(song: AnySong, bar: number, o: ArrangeOpts): Bar {
  const out = song.style === "crystal" ? arrangeCrystal(song, bar, o) : song.style === "swarm" ? arrangeSwarm(song, bar, o) : arrangeBar(song, bar, o);
  if (o.guest && o.guest !== song.style) {
    out.notes.push(...guestTexture(song, bar, o.guest, o.flourishes));
    out.notes.sort((a, b) => a.t - b.t);
  }
  return out;
}

export function composeStyleStinger(style: Style, kind: StingerKind, seed: number, flourishes = true): Bar[] {
  return style === "crystal" ? crystalStinger(kind, seed, flourishes) : style === "swarm" ? swarmStinger(kind, seed, flourishes) : composeStinger(kind, seed, flourishes);
}

/** Karplus–Strong pitches worth rendering ahead of time for a song. */
export function warmPitches(song: AnySong): number[] {
  if (song.style !== "western") return [];
  return [song.sections.A, song.sections.B].flatMap((s) => s.chords.flatMap((c) => guitarVoicing(song.key, c)));
}

const into = (pc: number, lo: number) => lo + ((((pc - lo) % 12) + 12) % 12);

/**
 * A light touch of another faction's sound (the AI's, on its turns): two or three soft notes from the
 * guest's signature instrument, always on tones of the current chord so it sits inside the harmony.
 */
export function guestTexture(song: AnySong, bar: number, guest: Style, flourishes: boolean): NoteEv[] {
  const p = formPosition<{ chords: Song["sections"]["A"]["chords"] }>(song, bar);
  const mode = song.style === "western" ? MAJOR : song.mode;
  const pcs = chordPcs(song.key, p.chord, mode);
  const rng = new Rng(mixSeed(song.seed, bar, 97));
  const pick = (lo: number) => into(rng.pick(pcs), lo);
  if (guest === "crystal")
    return [
      { t: 0.5, dur: 1.2, midi: pick(76), vel: 0.3, inst: "bell" },
      { t: 2.5, dur: 1, midi: pick(76), vel: 0.25, inst: "bell" },
    ];
  if (guest === "swarm") {
    const out: NoteEv[] = [
      { t: 1.75, dur: 0.3, midi: pick(72), vel: 0.35, inst: "kalimba" },
      { t: 3.25, dur: 0.3, midi: pick(72), vel: 0.3, inst: "kalimba" },
    ];
    if (flourishes && rng.chance(0.5)) out.push({ t: 2.75, dur: 0.25, midi: 0, vel: 0.3, inst: "chitter" });
    return out;
  }
  return [
    { t: 1, dur: 0.6, midi: pick(64), vel: 0.4, inst: "guitar" },
    { t: 3, dur: 0.6, midi: pick(64), vel: 0.35, inst: "guitar" },
  ];
}
