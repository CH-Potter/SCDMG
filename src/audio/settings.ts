// Audio settings: master, music and SFX volume plus mute, kept in localStorage (try/catch: storage
// may be blocked). Pure apart from the storage you pass in.

export interface AudioSettings {
  master: number; // 0..1
  music: number;
  sfx: number;
  muted: boolean;
}

export const AUDIO_SETTINGS_KEY = "scdmg.audio.v1";
export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = { master: 0.8, music: 0.5, sfx: 0.8, muted: false };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const clamp01 = (x: unknown, fallback: number): number =>
  typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : fallback;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Fill gaps and clamp anything odd from storage. */
export function normalizeSettings(raw: unknown): AudioSettings {
  const d = DEFAULT_AUDIO_SETTINGS;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    master: clamp01(r.master, d.master),
    music: clamp01(r.music, d.music),
    sfx: clamp01(r.sfx, d.sfx),
    muted: typeof r.muted === "boolean" ? r.muted : d.muted,
  };
}

export function loadAudioSettings(storage: StorageLike | null = defaultStorage()): AudioSettings {
  try {
    const raw = storage?.getItem(AUDIO_SETTINGS_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(s: AudioSettings, storage: StorageLike | null = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(normalizeSettings(s)));
    return true;
  } catch {
    return false;
  }
}

/** Slider value (0..1) to gain: squared, so the low end of the slider is usable. */
export const sliderGain = (v: number): number => v * v;

/** Effective bus gains. */
export function busGains(s: AudioSettings): { master: number; music: number; sfx: number } {
  return { master: s.muted ? 0 : sliderGain(s.master), music: sliderGain(s.music), sfx: sliderGain(s.sfx) };
}
