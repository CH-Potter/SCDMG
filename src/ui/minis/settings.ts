// The "Miniatures" display setting: Ink Rig (the default; Option A, side-on rigs), Overhead (Option D,
// figures from straight above) or Classic (the original art, and the fallback for units without rigs). Kept in localStorage
// like the dice speed; storage may be blocked, so every access is guarded.

export type MiniStyle = "classic" | "ink" | "overhead";

export const MINI_STYLES: MiniStyle[] = ["classic", "ink", "overhead"];
export const MINI_STYLE_LABEL: Record<MiniStyle, string> = { classic: "Classic", ink: "Ink Rig", overhead: "Overhead" };

const KEY = "scdmg.miniStyle.v1";

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export function loadMiniStyle(storage: StorageLike | null = defaultStorage()): MiniStyle {
  try {
    const v = storage?.getItem(KEY);
    return v === "ink" || v === "overhead" || v === "classic" ? v : "ink";
  } catch {
    return "ink";
  }
}

export function saveMiniStyle(s: MiniStyle, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(KEY, s);
  } catch {
    // storage blocked: the setting just won't stick
  }
}

let current: MiniStyle | null = null;

/** The style in use this session (read once, then kept in memory). */
export function miniStyle(): MiniStyle {
  return (current ??= loadMiniStyle());
}

export function setMiniStyle(s: MiniStyle): void {
  current = s;
  saveMiniStyle(s);
}

export function nextMiniStyle(s: MiniStyle): MiniStyle {
  return MINI_STYLES[(MINI_STYLES.indexOf(s) + 1) % MINI_STYLES.length]!;
}
