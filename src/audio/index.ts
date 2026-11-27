// The audio facade the rest of the game talks to. Everything is a safe no-op until the first user
// gesture creates the AudioContext (autoplay policy), and forever if Web Audio isn't available.
//
//   audio.init()                      once at startup: unlock-on-gesture, UI blips, settings
//   audio.setMood("menu" | "battle" | "victory" | "defeat" | "silent")
//   audio.setMenuFaction(factionId)   menu music in the style of the faction picked for "You"
//   audio.startBattle(state)          battle mood in the player's faction style, intensity follows the round
//   audio.onGameEvents(events, state) sound effects + music intensity for a batch of engine events
//   audio.takeOutcome()               a callback for the next dice roll: plays its hit/KO sounds on settle
//   audio.dice(count, quick)          the dice tray tumble
//   audio.ui("click" | "select" | "error" ...)
//   audio.mountButton(host)           the 🔊 button with its volume popover

import { factionOf } from "../engine/data/factions";
import { profileOf } from "../engine/profile";
import { unitById } from "../engine/rules";
import type { GameEvent, GameState } from "../engine/types";
import { styleForLook, type Style } from "./composer";
import { battleIntensity, cuesForEvents, decayHeat, rollsIn, type Cue, type SfxName, type UnitInfo } from "./mapping";
import { MusicPlayer, type Mood } from "./music";
import { busGains, loadAudioSettings, saveAudioSettings, type AudioSettings } from "./settings";

/** The menu music plays at this share of the music volume, so it sits quietly in the background. */
export const MENU_MUSIC_LEVEL = 0.5;
import { Sfx } from "./sfx";
import { Synth } from "./synth";
import { mountAudioButton } from "./ui";

export type { Mood } from "./music";
export type UiSound = "click" | "hover" | "select" | "error";

type Ctor = typeof AudioContext;

const reducedMotion = (): boolean => {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
};

const MAX_SFX_VOICES = 90;

class AudioEngine {
  settings: AudioSettings = loadAudioSettings();
  private ctx: AudioContext | null = null;
  private synth: Synth | null = null;
  private sfx: Sfx | null = null;
  private music: MusicPlayer | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private wantMood: Mood = "silent";
  private wantSeed: number | undefined;
  private menuStyle: Style = "western";
  private battleStyle: Style = "western";
  private aiStyle: Style = "western";
  private aiTurn = false;
  /** Hit/KO cues waiting for their dice roll to settle, one entry per roll, in order. */
  private outcomes: { cues: Cue[]; earliest: number }[] = [];
  private round = 1;
  private maxRounds = 5;
  private heat = 0;
  private heatAt = 0;
  private lastHover = 0;
  private inited = false;
  private failed = false;
  private listeners = new Set<() => void>();

  get available(): boolean {
    return !this.failed && typeof window !== "undefined" && !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext);
  }
  get running(): boolean {
    return this.ctx?.state === "running";
  }

  /** Install the gesture unlock and the global button blips. Safe to call more than once. */
  init(): void {
    if (this.inited || typeof window === "undefined") return;
    this.inited = true;
    const unlock = () => {
      this.unlock();
      if (this.ctx) {
        window.removeEventListener("pointerdown", unlock, true);
        window.removeEventListener("keydown", unlock, true);
      }
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    // Blips for every enabled button, without touching each screen's code.
    document.addEventListener("click", (e) => {
      const b = (e.target as Element | null)?.closest?.("button");
      if (b && !(b as HTMLButtonElement).disabled && !b.closest(".audio-pop")) this.ui("click");
    });
    document.addEventListener("pointerover", (e) => {
      const b = (e.target as Element | null)?.closest?.("button");
      const from = (e.relatedTarget as Element | null)?.closest?.("button");
      if (b && b !== from && !(b as HTMLButtonElement).disabled) this.ui("hover");
    });
    document.addEventListener("visibilitychange", () => this.applyRunState());
  }

  private unlock(): void {
    if (this.ctx || this.failed) return void this.ctx?.resume().catch(() => {});
    try {
      const C: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
      if (!C) {
        this.failed = true;
        return;
      }
      const ctx = new C({ latencyHint: "interactive" });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.connect(comp);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.ctx = ctx;
      this.synth = new Synth(ctx);
      this.sfx = new Sfx(this.synth, this.sfxBus);
      this.music = new MusicPlayer(
        this.synth,
        this.musicBus,
        { intensity: () => this.intensity(), flourishes: () => !reducedMotion(), guest: () => (this.aiTurn ? this.aiStyle : undefined) },
        Math.floor(Math.random() * 2 ** 31),
      );
      this.applyGains();
      ctx.onstatechange = () => this.emit();
      this.applyRunState();
      this.music.setMood(this.wantMood, this.styleFor(this.wantMood), this.wantSeed);
      this.emit();
    } catch (err) {
      console.warn("Audio unavailable:", err);
      this.failed = true;
      this.ctx = null;
    }
  }

  /** Suspend the context while muted or hidden (saves CPU), resume otherwise. */
  private applyRunState(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const want = !this.settings.muted && document.visibilityState !== "hidden";
    if (want && ctx.state !== "running") ctx.resume().catch(() => {});
    else if (!want && ctx.state === "running") ctx.suspend().catch(() => {});
  }

  private applyGains(glide = 0.03): void {
    if (!this.ctx || !this.master || !this.musicBus || !this.sfxBus) return;
    const g = busGains(this.settings);
    const now = this.ctx.currentTime;
    const moodLevel = this.wantMood === "menu" ? MENU_MUSIC_LEVEL : 1;
    this.master.gain.setTargetAtTime(g.master, now, 0.03);
    this.musicBus.gain.setTargetAtTime(g.music * 0.9 * moodLevel, now, glide);
    this.sfxBus.gain.setTargetAtTime(g.sfx, now, 0.03);
  }

  // ---------------------------------------------------------------- settings

  update(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch };
    saveAudioSettings(this.settings);
    this.applyGains();
    this.applyRunState();
    this.emit();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  // ---------------------------------------------------------------- music

  setMood(mood: Mood, seed?: number): void {
    const levelChanged = (this.wantMood === "menu") !== (mood === "menu");
    this.wantMood = mood;
    this.wantSeed = seed;
    this.music?.setMood(mood, this.styleFor(mood), seed);
    if (levelChanged) this.applyGains(0.6); // ease between the quieter menu level and the battle level
  }

  private styleFor(mood: Mood): Style {
    return mood === "menu" ? this.menuStyle : this.battleStyle;
  }

  /** The musical style for a faction (custom factions go by their token look). */
  styleOf(factionId: string): Style {
    try {
      return styleForLook(factionOf(factionId).look);
    } catch {
      return "western";
    }
  }

  /** The menu plays the style of the faction picked for "You"; changing it crossfades. */
  setMenuFaction(factionId: string): void {
    const style = this.styleOf(factionId);
    if (style === this.menuStyle) return;
    this.menuStyle = style;
    if (this.wantMood === "menu") this.setMood("menu");
  }

  /** The local player's seat (1 for an online guest): their faction sets the style, their win the victory mood. */
  private me: 0 | 1 = 0;

  /** Switch to the battle loop for a fresh game, in the player's faction style. */
  startBattle(state: GameState, seed?: number, me: 0 | 1 = 0): void {
    this.me = me;
    this.round = state.round;
    this.maxRounds = state.maxRounds;
    this.heat = 0;
    this.battleStyle = this.styleOf(state.factions[me]);
    this.aiStyle = this.styleOf(state.factions[me === 0 ? 1 : 0]);
    this.aiTurn = state.activePlayer !== me;
    this.outcomes = [];
    this.setMood("battle", seed);
  }

  private intensity(): number {
    const now = performance.now() / 1000;
    this.heat = decayHeat(this.heat, now - this.heatAt);
    this.heatAt = now;
    return battleIntensity(this.round, this.maxRounds, this.heat);
  }

  // ---------------------------------------------------------------- effects

  onGameEvents(events: readonly GameEvent[], state: GameState): void {
    this.round = state.round;
    this.maxRounds = state.maxRounds;
    this.aiTurn = !state.over && state.activePlayer !== this.me;
    // Outcomes nobody claimed with takeOutcome() (no dice shown): play them now rather than lose them.
    for (const o of this.outcomes.splice(0)) this.release(o);
    let combat = 0;
    for (const e of events) {
      if (e.type === "attack") combat++;
      if (e.type === "gameOver") this.setMood(e.winner !== "draw" && e.winner !== this.me ? "defeat" : "victory");
    }
    if (combat) {
      this.intensity();
      this.heat = Math.min(0.6, this.heat + 0.12 * combat);
    }
    if (!this.sfx || !this.ctx || !this.running) return;
    const resolve = (uid: string): UnitInfo | undefined => {
      const u = unitById(state, uid);
      if (!u) return undefined;
      try {
        const p = profileOf(u);
        return { owner: u.owner, faction: p.faction, look: factionOf(p.faction).look, keywords: p.keywords, weapons: p.weapons };
      } catch {
        return undefined;
      }
    };
    const t0 = this.ctx.currentTime + 0.02;
    const cues = cuesForEvents(events, resolve, { reduced: reducedMotion(), me: this.me });
    for (const c of cues) if (c.group === undefined) this.play(c.sfx, t0 + c.delay, c.gain, c.count);
    // Hits, KOs and gulps wait for their dice to settle (they may need throwing first).
    for (let g = 0; g < rollsIn(events); g++) {
      const mine = cues.filter((c) => c.group === g);
      this.outcomes.push({ cues: mine, earliest: t0 + Math.min(Infinity, ...mine.map((c) => c.delay)) });
    }
  }

  /**
   * Claim the outcome sounds for the next dice roll of the latest batch. Call once per roll, in order,
   * and run the returned callback when that roll's dice have settled.
   */
  takeOutcome(): () => void {
    const o = this.outcomes.shift();
    return o ? () => this.release(o) : () => {};
  }

  private release(o: { cues: Cue[]; earliest: number }): void {
    if (!o.cues.length || !this.ctx || !this.running) return;
    const first = Math.min(...o.cues.map((c) => c.delay));
    const at = Math.max(this.ctx.currentTime + 0.02, o.earliest);
    for (const c of o.cues) this.play(c.sfx, at + (c.delay - first), c.gain, c.count);
  }

  /** Dice tumble: rattle and clatter for `count` dice; `quick` matches the tray's short tumble. */
  dice(count: number, quick: boolean): void {
    if (!this.sfx || !this.ctx || !this.running || !count) return;
    this.sfx.dice(this.ctx.currentTime + 0.01, count, quick ? 0.26 : 0.75);
  }

  ui(kind: UiSound): void {
    if (!this.sfx || !this.ctx || !this.running) return;
    const now = performance.now();
    if (kind === "hover") {
      if (now - this.lastHover < 60) return;
      this.lastHover = now;
    }
    this.play(kind, this.ctx.currentTime + 0.005);
  }

  /** Play any effect by name (e.g. a preview from the settings popover). */
  play(name: SfxName, at?: number, gain = 1, count = 1): void {
    if (!this.sfx || !this.ctx || !this.running || !this.synth) return;
    if (this.synth.active > MAX_SFX_VOICES && name !== "poof") return; // don't pile up
    this.sfx.play(name, at ?? this.ctx.currentTime + 0.005, gain, count);
  }

  /** The 🔊 button and popover. */
  mountButton(host: Element | null): void {
    if (host) mountAudioButton(host, this);
  }

  /** Diagnostics for tests and the console. */
  stats() {
    return {
      state: this.ctx?.state ?? (this.failed ? "unavailable" : "locked"),
      mood: this.music?.mood ?? this.wantMood,
      style: this.music?.style ?? this.styleFor(this.wantMood),
      guest: this.aiTurn ? this.aiStyle : null,
      outcomesWaiting: this.outcomes.length,
      voices: this.synth?.active ?? 0,
      started: this.synth?.started ?? 0,
      intensity: this.intensity(),
      ...(this.music?.stats() ?? {}),
    };
  }
}

export type { AudioEngine };
export const audio = new AudioEngine();

if (import.meta.env?.DEV && typeof window !== "undefined") (window as unknown as { __scdmgAudio: AudioEngine }).__scdmgAudio = audio;
