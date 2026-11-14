import { describe, expect, it } from "vitest";
import { DORIAN, MINOR_PENTATONIC, chordPcs, chordTones, formBars, inKey, styleForLook, type Inst, type Style } from "../src/audio/composer";
import { CRYSTAL_DEGREES, arpIndex, composeCrystal } from "../src/audio/crystal";
import { MUNCH_DEGREES, composeMunch, generateGroove, generateRiff } from "../src/audio/munch";
import { Rng } from "../src/audio/rng";
import { arrangeStyleBar, composeStyleSong, composeStyleStinger, guestTexture } from "../src/audio/score";
import { Sequencer } from "../src/audio/sequencer";

const SEEDS = Array.from({ length: 30 }, (_, i) => i * 104729 + 7);
const STYLES: Style[] = ["western", "crystal", "munch"];

describe("audio styles: faction mapping", () => {
  it("maps token looks to styles (custom factions included)", () => {
    expect(styleForLook("cap")).toBe("western");
    expect(styleForLook("plain")).toBe("western");
    expect(styleForLook("crystal")).toBe("crystal");
    expect(styleForLook("teeth")).toBe("munch");
    expect(styleForLook(undefined)).toBe("western");
  });
});

describe("audio styles: crystal (Lumen Concord)", () => {
  it("uses modal chords with 7ths, a Dorian or Lydian mode, and resolves home", () => {
    for (const seed of SEEDS) {
      for (const mood of ["menu", "battle"] as const) {
        const song = composeCrystal(mood, seed);
        const allowed = CRYSTAL_DEGREES[song.modeName];
        if (mood === "battle") expect(song.modeName).toBe("dorian");
        for (const sec of [song.sections.A, song.sections.B]) {
          expect(sec.chords).toHaveLength(8);
          for (const c of sec.chords) {
            expect(allowed).toContain(c.degree);
            expect(chordTones(c, song.mode)).toHaveLength(4);
          }
        }
        expect(song.sections.A.chords[0]!.degree).toBe(0);
        expect(song.sections.A.chords[7]!.degree).toBe(0);
        // Melody stays in the mode and lands on chord tones on downbeats.
        for (const n of song.sections.A.melody) {
          expect(inKey(song.key, n.midi, song.mode)).toBe(true);
          if (n.t % 4 === 0) expect(chordPcs(song.key, song.sections.A.chords[n.t / 4]!, song.mode)).toContain(n.midi % 12);
        }
      }
    }
  });

  it("battle intensity opens the filter, doubles the arpeggio rate and adds the hats", () => {
    const song = composeCrystal("battle", 5);
    const at = (I: number) => {
      const bars = Array.from({ length: 8 }, (_, i) => arrangeStyleBar(song, i, { intensity: I, flourishes: false }));
      const arps = bars.flatMap((b) => b.notes.filter((n) => n.inst === "arp"));
      const pads = bars.flatMap((b) => b.notes.filter((n) => n.inst === "pad"));
      return {
        arps: arps.length,
        hats: bars.flatMap((b) => b.notes.filter((n) => n.inst === "hat")).length,
        cut: pads.reduce((s, n) => s + (n.cutoff ?? 0), 0) / pads.length,
        arpCut: arps.reduce((s, n) => s + (n.cutoff ?? 0), 0) / arps.length,
        bpm: bars[0]!.bpm,
      };
    };
    const calm = at(0.1);
    const hot = at(0.9);
    expect(hot.arps).toBe(calm.arps * 2);
    expect(calm.hats).toBe(0);
    expect(hot.hats).toBeGreaterThan(0);
    expect(hot.cut).toBeGreaterThan(calm.cut * 2);
    expect(hot.arpCut).toBeGreaterThan(calm.arpCut);
    expect(hot.bpm).toBeGreaterThan(calm.bpm);
  });

  it("arpeggio shapes always index inside the chord", () => {
    for (let shape = 0; shape < 4; shape++) for (let i = 0; i < 64; i++) {
      const k = arpIndex(shape, i, 8);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(8);
    }
  });
});

describe("audio styles: munch (The Munch)", () => {
  it("vamps on Dorian 7th chords with a minor-pentatonic kalimba hook", () => {
    for (const seed of SEEDS) {
      const song = composeMunch("battle", seed);
      for (const sec of [song.sections.A, song.sections.B]) {
        for (const c of sec.chords) expect(MUNCH_DEGREES).toContain(c.degree);
        for (const n of sec.melody) expect(inKey(song.key, n.midi, MINOR_PENTATONIC)).toBe(true);
      }
      expect(song.mode).toBe(DORIAN);
    }
  });

  it("riffs start on the root, stay inside the bar and grooves keep their backbone", () => {
    for (const seed of SEEDS) {
      const riff = generateRiff(new Rng(seed));
      expect(riff[0]).toMatchObject({ t: 0, midi: 0 });
      for (const n of riff) {
        expect(n.t + n.dur).toBeLessThanOrEqual(4);
        expect([0, 3, 5, 7, 10, 12]).toContain(n.midi);
      }
      const g = generateGroove(new Rng(seed));
      expect(g.some((n) => n.t === 0 && n.midi === 45)).toBe(true);
      expect(g.filter((n) => n.midi === 64).map((n) => n.t)).toEqual([1, 3]);
    }
  });

  it("heats up with more shaker and percussion", () => {
    const song = composeMunch("battle", 8);
    const perc = (I: number) => {
      let n = 0;
      for (let i = 0; i < 16; i++) n += arrangeStyleBar(song, i, { intensity: I, flourishes: false }).notes.filter((x) => x.inst === "shaker" || x.inst === "hand").length;
      return n;
    };
    expect(perc(0.9)).toBeGreaterThan(perc(0.1) * 1.5);
  });
});

describe("audio styles: all styles", () => {
  const RAPID: Inst[] = ["whip", "ricochet", "riser", "chitter", "gulp"];

  it("bars are well-formed in every style and mood; flourishes respect reduced motion", () => {
    for (const style of STYLES)
      for (const mood of ["menu", "battle"] as const) {
        const song = composeStyleSong(style, mood, 99);
        expect(song.style).toBe(style);
        for (let i = 0; i < formBars(song) * 2; i++) {
          const bar = arrangeStyleBar(song, i, { intensity: (i % 11) / 10, flourishes: false });
          expect(bar.beats).toBe(4);
          expect(bar.bpm).toBeGreaterThan(60);
          expect(bar.bpm).toBeLessThan(160);
          expect(bar.notes.length).toBeGreaterThan(4);
          for (const n of bar.notes) {
            expect(n.t).toBeGreaterThanOrEqual(0);
            expect(n.t).toBeLessThan(4);
            expect(n.vel).toBeGreaterThan(0);
            expect(n.vel).toBeLessThanOrEqual(1);
            expect(Number.isFinite(n.midi)).toBe(true);
            expect(RAPID).not.toContain(n.inst);
          }
        }
      }
  });

  it("each style sounds like itself: signature instruments only", () => {
    const sig: Record<Style, Inst[]> = { western: ["guitar", "harmonica", "clip"], crystal: ["bell", "pad", "arp", "kick"], munch: ["rubber", "kalimba", "hand"] };
    const foreign: Record<Style, Inst[]> = { western: ["pad", "rubber", "bell"], crystal: ["guitar", "rubber", "kalimba"], munch: ["guitar", "pad", "bell"] };
    for (const style of STYLES) {
      const song = composeStyleSong(style, "battle", 3);
      const insts = new Set(Array.from({ length: 32 }, (_, i) => arrangeStyleBar(song, i, { intensity: 0.7, flourishes: true }).notes.map((n) => n.inst)).flat());
      for (const i of sig[style]) expect(insts.has(i)).toBe(true);
      for (const i of foreign[style]) expect(insts.has(i)).toBe(false);
    }
  });

  it("the AI's style is woven in lightly, inside the current chord", () => {
    const song = composeStyleSong("western", "battle", 4);
    const plain = arrangeStyleBar(song, 3, { intensity: 0.5, flourishes: false });
    const guest = arrangeStyleBar(song, 3, { intensity: 0.5, flourishes: false, guest: "crystal" });
    const extra = guest.notes.filter((n) => n.inst === "bell");
    expect(extra.length).toBeGreaterThan(0);
    expect(extra.length).toBeLessThanOrEqual(3);
    expect(guest.notes.length - plain.notes.length).toBe(extra.length);
    const chord = song.sections[song.form[0]!].chords[3]!;
    for (const n of extra) expect(chordPcs(song.key, chord).includes(n.midi % 12)).toBe(true);
    // Same style as the song: no guest.
    expect(guestTexture(song, 3, "munch", true).length).toBeGreaterThan(0);
    expect(arrangeStyleBar(song, 3, { intensity: 0.5, flourishes: false, guest: "western" }).notes.length).toBe(plain.notes.length);
  });

  it("stingers exist for every style, are short and sequence to completion", () => {
    for (const style of STYLES)
      for (const kind of ["victory", "defeat"] as const) {
        const bars = composeStyleStinger(style, kind, 12);
        expect(bars.length).toBeGreaterThanOrEqual(2);
        expect(bars.length).toBeLessThanOrEqual(4);
        expect(composeStyleStinger(style, kind, 12, false).flatMap((b) => b.notes).some((n) => n.inst === "whip" || n.inst === "riser" || n.inst === "chitter")).toBe(false);
        const seq = new Sequencer((i) => bars[i] ?? null, 0);
        let n = 0;
        for (let t = 0; t < 20; t += 0.05) n += seq.tick(t, 0.4).length;
        expect(seq.done).toBe(true);
        expect(n).toBe(bars.reduce((s, b) => s + b.notes.length, 0));
      }
  });

  it("every style schedules ~20 s without drift, drops or pile-up", () => {
    for (const style of STYLES) {
      const song = composeStyleSong(style, "battle", 21);
      const seq = new Sequencer((i) => arrangeStyleBar(song, i, { intensity: 0.8, flourishes: true }), 0.1, { seed: 2 });
      let now = 0;
      let maxPending = 0;
      for (let i = 0; i < 400; i++) {
        now += 0.05;
        for (const n of seq.tick(now, 0.4)) expect(n.time).toBeGreaterThan(now - 0.06);
        maxPending = Math.max(maxPending, seq.pending);
      }
      expect(seq.dropped).toBe(0);
      expect(seq.resyncs).toBe(0);
      expect(maxPending).toBeLessThan(150);
      expect(seq.horizon - now).toBeLessThan(4 * (60 / 100) + 0.5);
    }
  });
});
