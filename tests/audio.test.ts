import { describe, expect, it } from "vitest";
import {
  ALLOWED_DEGREES,
  arrangeBar,
  chordPcs,
  composeSong,
  composeStinger,
  formBars,
  generateMelody,
  generateProgression,
  inKey,
} from "../src/audio/composer";
import { attackSfx, battleIntensity, cuesForEvents, decayHeat, rollsIn, type UnitInfo } from "../src/audio/mapping";
import { Rng } from "../src/audio/rng";
import { Sequencer, swingBeat } from "../src/audio/sequencer";
import {
  AUDIO_SETTINGS_KEY,
  DEFAULT_AUDIO_SETTINGS,
  busGains,
  loadAudioSettings,
  normalizeSettings,
  saveAudioSettings,
} from "../src/audio/settings";
import type { AttackReport, GameEvent } from "../src/engine/types";

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 13);

describe("audio: progressions", () => {
  it("start on I, use only I/ii/IV/V/vi, and cadence correctly", () => {
    for (const seed of SEEDS) {
      const full = generateProgression(new Rng(seed), 8, "full");
      const half = generateProgression(new Rng(seed + 1), 8, "half");
      for (const p of [full, half]) {
        expect(p).toHaveLength(8);
        expect(p[0]!.degree).toBe(0);
        for (const c of p) expect(ALLOWED_DEGREES).toContain(c.degree);
        for (const c of p) if (c.dom7) expect(c.degree).toBe(4);
      }
      expect(full[6]!.degree).toBe(4);
      expect(full[7]!.degree).toBe(0);
      expect(half[7]!.degree).toBe(4);
    }
  });

  it("is mostly the three primary chords", () => {
    let primary = 0;
    let total = 0;
    for (const seed of SEEDS) {
      for (const c of generateProgression(new Rng(seed), 8, "full")) {
        total++;
        if ([0, 3, 4].includes(c.degree)) primary++;
      }
    }
    expect(primary / total).toBeGreaterThan(0.75);
  });

  it("is deterministic for a seed", () => {
    expect(generateProgression(new Rng(42), 8, "full")).toEqual(generateProgression(new Rng(42), 8, "full"));
    expect(composeSong("battle", 5)).toEqual(composeSong("battle", 5));
  });
});

describe("audio: melodies", () => {
  it("stay in key and range, land chord tones on the downbeat, move smoothly, and end on the tonic", () => {
    for (const seed of SEEDS) {
      const rng = new Rng(seed);
      const chords = generateProgression(rng, 8, "full");
      const key = 67; // G
      const mel = generateMelody(rng, chords, { key, lo: 62, hi: 81, endOnTonic: true });
      expect(mel.length).toBeGreaterThan(12);
      let prev: number | null = null;
      let tPrev = -1;
      for (const n of mel) {
        expect(inKey(key, n.midi)).toBe(true);
        expect(n.midi).toBeGreaterThanOrEqual(62);
        expect(n.midi).toBeLessThanOrEqual(81);
        expect(n.t).toBeGreaterThan(tPrev);
        tPrev = n.t;
        if (Number.isInteger(n.t) && n.t % 4 === 0) {
          const bar = n.t / 4;
          expect(chordPcs(key, chords[bar]!)).toContain(n.midi % 12);
        }
        if (prev !== null) expect(Math.abs(n.midi - prev)).toBeLessThanOrEqual(7);
        prev = n.midi;
      }
      expect(mel[mel.length - 1]!.midi % 12).toBe(key % 12);
      // Every note fits inside the 8 bars.
      for (const n of mel) expect(n.t + n.dur).toBeLessThanOrEqual(32);
    }
  });

  it("different seeds give different tunes", () => {
    const a = composeSong("menu", 1).sections.A.melody.map((n) => n.midi).join();
    const b = composeSong("menu", 2).sections.A.melody.map((n) => n.midi).join();
    expect(a).not.toBe(b);
  });
});

describe("audio: arrangement", () => {
  it("bars are well-formed and stay inside the bar", () => {
    const song = composeSong("battle", 9);
    for (let i = 0; i < formBars(song) * 2; i++) {
      const bar = arrangeBar(song, i, { intensity: (i % 10) / 10, flourishes: true });
      expect(bar.beats).toBe(4);
      expect(bar.notes.length).toBeGreaterThan(5);
      for (const n of bar.notes) {
        expect(n.t).toBeGreaterThanOrEqual(0);
        expect(n.t).toBeLessThan(4);
        expect(n.vel).toBeGreaterThan(0);
        expect(n.vel).toBeLessThanOrEqual(1);
      }
    }
  });

  it("intensity adds percussion, busier strumming and tempo", () => {
    const song = composeSong("battle", 3);
    const count = (I: number, inst: string[]) => {
      let n = 0;
      for (let i = 0; i < 32; i++) n += arrangeBar(song, i, { intensity: I, flourishes: false }).notes.filter((x) => inst.includes(x.inst)).length;
      return n;
    };
    expect(count(0.9, ["clip", "clop", "spoons"])).toBeGreaterThan(count(0.1, ["clip", "clop", "spoons"]) * 2);
    expect(count(0.9, ["guitar"])).toBeGreaterThan(count(0.1, ["guitar"]));
    expect(arrangeBar(song, 0, { intensity: 1, flourishes: false }).bpm).toBeGreaterThan(arrangeBar(song, 0, { intensity: 0, flourishes: false }).bpm);
  });

  it("no whips or ricochets when flourishes are off (reduced motion)", () => {
    const song = composeSong("battle", 4);
    for (let i = 0; i < 64; i++) {
      const notes = arrangeBar(song, i, { intensity: 1, flourishes: false }).notes;
      expect(notes.some((n) => n.inst === "whip" || n.inst === "ricochet")).toBe(false);
    }
  });

  it("stingers are short and finite", () => {
    for (const kind of ["victory", "defeat"] as const) {
      const bars = composeStinger(kind, 77);
      expect(bars.length).toBeGreaterThanOrEqual(2);
      expect(bars.length).toBeLessThanOrEqual(4);
      expect(composeStinger(kind, 77, false).flatMap((b) => b.notes).some((n) => n.inst === "whip")).toBe(false);
    }
  });
});

describe("audio: sequencer", () => {
  const song = composeSong("menu", 11);
  const src = (i: number) => arrangeBar(song, i, { intensity: 0.5, flourishes: true });

  it("swing moves only the off-beat", () => {
    expect(swingBeat(0, 0.62)).toBe(0);
    expect(swingBeat(1, 0.62)).toBe(1);
    expect(swingBeat(1.5, 0.62)).toBeCloseTo(1.62);
    expect(swingBeat(2.5, 0.5)).toBeCloseTo(2.5);
  });

  it("emits each note once, in order, never far in the past, with a bounded queue", () => {
    const seq = new Sequencer(src, 0.1, { seed: 3 });
    let now = 0;
    let last = -Infinity;
    let total = 0;
    let maxPending = 0;
    // Irregular ticks, like a real timer.
    for (let i = 0; i < 2000; i++) {
      now += 0.03 + ((i * 37) % 11) / 1000;
      const out = seq.tick(now, 0.18);
      for (const n of out) {
        expect(n.time).toBeGreaterThanOrEqual(last - 0.03); // humanize jitter only
        expect(n.time).toBeLessThan(now + 0.18);
        expect(n.time).toBeGreaterThan(now - 0.06);
        last = Math.max(last, n.time);
      }
      total += out.length;
      maxPending = Math.max(maxPending, seq.pending);
    }
    expect(total).toBe(seq.emitted);
    expect(seq.dropped).toBe(0);
    expect(seq.resyncs).toBe(0);
    expect(maxPending).toBeLessThan(200);
    // Doesn't drift: the composed horizon tracks the clock within a bar.
    expect(seq.horizon - now).toBeLessThan(4 * (60 / song.bpm) + 0.2);
    expect(seq.horizon).toBeGreaterThan(now);
  });

  it("re-anchors after a clock jump instead of firing a pile of late notes", () => {
    const seq = new Sequencer(src, 0, { seed: 3 });
    seq.tick(0, 0.18);
    seq.tick(0.05, 0.18);
    const out = seq.tick(30, 0.18); // 30 s stall
    expect(out.length).toBeLessThan(30);
    for (const n of out) expect(n.time).toBeGreaterThanOrEqual(29.95);
    expect(seq.resyncs).toBe(1);
  });

  it("finishes a finite source", () => {
    const bars = composeStinger("victory", 1);
    const seq = new Sequencer((i) => bars[i] ?? null, 0);
    let n = 0;
    for (let t = 0; t < 20; t += 0.05) n += seq.tick(t, 0.18).length;
    expect(seq.done).toBe(true);
    expect(seq.pending).toBe(0);
    expect(n).toBe(bars.reduce((s, b) => s + b.notes.length, 0));
  });
});

describe("audio: settings", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it("round-trips through storage", () => {
    const st = mem();
    expect(loadAudioSettings(st)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(saveAudioSettings({ master: 0.3, music: 0, sfx: 1, muted: true }, st)).toBe(true);
    expect(loadAudioSettings(st)).toEqual({ master: 0.3, music: 0, sfx: 1, muted: true });
    expect(st.m.has(AUDIO_SETTINGS_KEY)).toBe(true);
  });

  it("survives corrupt data, blocked storage and silly values", () => {
    const st = mem();
    st.setItem(AUDIO_SETTINGS_KEY, "{nope");
    expect(loadAudioSettings(st)).toEqual(DEFAULT_AUDIO_SETTINGS);
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(loadAudioSettings(blocked)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(saveAudioSettings(DEFAULT_AUDIO_SETTINGS, blocked)).toBe(false);
    expect(loadAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(normalizeSettings({ master: 7, music: -1, sfx: "loud", muted: "yes" })).toEqual({ master: 1, music: 0, sfx: DEFAULT_AUDIO_SETTINGS.sfx, muted: false });
  });

  it("mute zeroes the master bus", () => {
    expect(busGains({ master: 1, music: 1, sfx: 1, muted: true }).master).toBe(0);
    expect(busGains({ master: 0.5, music: 1, sfx: 1, muted: false }).master).toBeCloseTo(0.25);
  });
});

describe("audio: event mapping", () => {
  const militia: UnitInfo = {
    owner: 0,
    faction: "militia",
    look: "cap",
    keywords: ["infantry", "light"],
    weapons: [
      { name: "Rivet Rifle", melee: false, damage: 1, dice: 1 },
      { name: "Shovel Swing", melee: true, damage: 1, dice: 1 },
      { name: "Thumper Cannon", melee: false, damage: 2, dice: 3, traits: ["blast", "heavy"] },
      { name: "Staple Pistol", melee: false, damage: 1, dice: 2, traits: ["pistol"] },
      { name: "Chain Popper", melee: false, damage: 1, dice: 3 },
    ],
  };
  const munch: UnitInfo = {
    owner: 1,
    faction: "munch",
    look: "teeth",
    keywords: ["infantry", "beast"],
    weapons: [
      { name: "Goo Glob", melee: false, damage: 1, dice: 1 },
      { name: "Chompers", melee: true, damage: 1, dice: 1 },
      { name: "Stinger", melee: true, damage: 1, dice: 2 },
    ],
  };
  const concord: UnitInfo = {
    owner: 1,
    faction: "concord",
    look: "crystal",
    keywords: ["flying", "mech"],
    weapons: [{ name: "Flicker Cannon", melee: false, damage: 1, dice: 3, traits: ["blast"] }],
  };
  const report = (o: Partial<AttackReport>): AttackReport => ({
    uid: "a",
    target: "b",
    weapon: "Rivet Rifle",
    kind: "shoot",
    attackers: 1,
    hitRolls: [5],
    hitOn: 4,
    saveRolls: [],
    saveOn: [],
    damage: 0,
    modelsKilled: 0,
    unitDestroyed: false,
    ...o,
  });

  it("picks the weapon sound from kind, weapon name and faction", () => {
    expect(attackSfx(report({}), militia)).toBe("rifle");
    expect(attackSfx(report({ weapon: "Thumper Cannon" }), militia)).toBe("cannon");
    expect(attackSfx(report({ weapon: "Staple Pistol" }), militia)).toBe("pistol");
    expect(attackSfx(report({ weapon: "Chain Popper" }), militia)).toBe("burst");
    expect(attackSfx(report({ weapon: "Shovel Swing", kind: "fight" }), militia)).toBe("thwack");
    expect(attackSfx(report({ weapon: "Goo Glob" }), munch)).toBe("goo");
    expect(attackSfx(report({ weapon: "Chompers", kind: "fight" }), munch)).toBe("chomp");
    expect(attackSfx(report({ weapon: "Stinger", kind: "fight" }), munch)).toBe("sting");
    expect(attackSfx(report({ weapon: "Flicker Cannon" }), concord)).toBe("beam");
    expect(attackSfx(report({ weapon: "Barrage", kind: "barrage" }), militia)).toBe("cannon");
    expect(attackSfx(report({ weapon: "Impact", kind: "impact" }), munch)).toBe("slam");
    // Unknown attacker: falls back on the weapon name.
    expect(attackSfx(report({ weapon: "Sunlance" }))).toBe("beam");
  });

  it("maps a batch of events to staggered cues", () => {
    const units: Record<string, UnitInfo> = { a: militia, b: munch, c: concord };
    const resolve = (uid: string) => units[uid];
    const events: GameEvent[] = [
      { type: "moved", uid: "a", kind: "move" },
      { type: "attack", report: report({ attackers: 3, damage: 2, modelsKilled: 1 }) },
      { type: "morale", uid: "b", roll: [5, 6], nerve: 7, shaken: true },
      { type: "phase", phase: "assault", round: 2 },
    ];
    const cues = cuesForEvents(events, resolve, { reduced: false });
    const names = cues.map((c) => c.sfx);
    expect([...names].sort()).toEqual(["flinch", "gulp", "poof", "rifle", "shuffle", "twang"]);
    // Shot, step and sting play now; the hit, KO and gulp wait for their dice roll (attack = roll 0, morale = roll 1).
    for (const c of cues) {
      if (c.sfx === "flinch" || c.sfx === "poof") expect(c.group).toBe(0);
      else if (c.sfx === "gulp") expect(c.group).toBe(1);
      else expect(c.group).toBeUndefined();
    }
    expect(rollsIn(events)).toBe(2);
    expect(cues.find((c) => c.sfx === "rifle")!.count).toBe(3);
    const rifle = cues.find((c) => c.sfx === "rifle")!.delay;
    expect(cues.find((c) => c.sfx === "flinch")!.delay).toBeGreaterThan(rifle);
    expect(cues.find((c) => c.sfx === "poof")!.delay).toBeGreaterThan(cues.find((c) => c.sfx === "flinch")!.delay);
    // Reduced motion: a single shot, no ricochet flourishes.
    const reduced = cuesForEvents([{ type: "attack", report: report({ attackers: 3, hitRolls: [1, 2] }) }], resolve, { reduced: true });
    expect(reduced.map((c) => c.sfx)).toEqual(["rifle"]);
    expect(reduced[0]!.count).toBeUndefined();
    const whiff = cuesForEvents([{ type: "attack", report: report({ hitRolls: [1, 2] }) }], resolve, { reduced: false });
    expect(whiff.map((c) => c.sfx)).toEqual(["rifle", "ricochet"]);
  });

  it("covers the other event types", () => {
    const resolve = (uid: string) => ({ a: militia, b: munch, s: { ...militia, keywords: ["structure"] } })[uid];
    const one = (e: GameEvent) => cuesForEvents([e], resolve, { reduced: false }).map((c) => c.sfx);
    expect(one({ type: "deployed", uid: "a" })).toEqual(["thunk"]);
    expect(one({ type: "deployed", uid: "s" })).toEqual(["thunk-heavy"]);
    expect(one({ type: "moved", uid: "a", kind: "charge" })).toEqual(["whoosh", "slam"]);
    expect(one({ type: "moved", uid: "b", kind: "advance" })).toEqual(["scurry"]);
    expect(one({ type: "moved", uid: "a", kind: "teleport" })).toEqual(["teleport"]);
    expect(one({ type: "summoned", uid: "s" })).toEqual(["summon"]);
    expect(one({ type: "expired", uid: "s" })).toEqual(["fizzle"]);
    expect(one({ type: "rallied", uid: "a", how: "cp" })).toEqual(["rally"]);
    expect(one({ type: "support", player: 0, support: "x", ability: "y", text: "" })).toEqual(["chime", "sparkle"]);
    expect(one({ type: "scored", player: 0, vp: 2, reason: "" })).toEqual(["jingle"]);
    expect(one({ type: "scored", player: 1, vp: 2, reason: "" })).toEqual(["jingle-sour"]);
    expect(one({ type: "ability", uid: "a", ability: "patch-up", text: "" })).toEqual(["heal"]);
    expect(one({ type: "morale", uid: "a", roll: [1, 1], nerve: 7, shaken: false })).toEqual([]);
    // A charge with an impact roll doesn't slam twice.
    const charge = cuesForEvents(
      [
        { type: "moved", uid: "b", kind: "charge" },
        { type: "attack", report: report({ uid: "b", kind: "impact", weapon: "Impact" }) },
      ],
      resolve,
      { reduced: false },
    ).map((c) => c.sfx);
    expect(charge.filter((s) => s === "slam")).toHaveLength(1);
  });

  it("battle intensity rises with the round and combat heat, and heat decays", () => {
    expect(battleIntensity(5, 5, 0)).toBeGreaterThan(battleIntensity(1, 5, 0));
    expect(battleIntensity(1, 5, 0.3)).toBeGreaterThan(battleIntensity(1, 5, 0));
    expect(battleIntensity(5, 5, 9)).toBeLessThanOrEqual(1);
    expect(decayHeat(0.4, 10)).toBeCloseTo(0.2);
  });
});
