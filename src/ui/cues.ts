// The "can I do this?" visual language, shared by the board cursor, the hover tip and the HUD buttons.
//
//   ok    green, with a shape that says what a click does: a tick (move or go here), a crosshair
//         (attack this), a plus (place a unit here)
//   bad   red no-entry sign (a slashed circle), and the reason in the tip
//   info  the normal arrow or hand, with a plain tip
//
// Valid and invalid always differ in shape as well as colour (tick/crosshair/plus against a slashed
// circle, ✓ against ✕ in the tip), so they read without colour vision. Disabled buttons are hatched
// grey with a ⛔ line saying why. No DOM in here, so it's unit-tested (tests/cues.test.ts).

export type Tone = "ok" | "bad" | "info";

/** What the board cursor shows. */
export type CursorKind = "default" | "pointer" | "go" | "target" | "place" | "no";

/** A hover cue: the tip text, its tone, and optionally the cursor (otherwise derived from the tone). */
export interface Cue {
  text: string;
  tone: Tone;
  cursor?: CursorKind;
}

export const ok = (text: string, cursor: CursorKind = "go"): Cue => ({ text, tone: "ok", cursor });
export const bad = (text: string): Cue => ({ text, tone: "bad", cursor: "no" });
export const info = (text: string, cursor: CursorKind = "default"): Cue => ({ text, tone: "info", cursor });

/** The cursor a cue implies. */
export function cursorKindFor(cue: Cue | null): CursorKind {
  if (!cue) return "default";
  if (cue.cursor) return cue.cursor;
  return cue.tone === "ok" ? "go" : cue.tone === "bad" ? "no" : "default";
}

const INK = "#1c1512";
const GOOD = "#3f9a37";
const BAD = "#d23a2f";

const SHAPES: Record<Exclude<CursorKind, "default" | "pointer">, string> = {
  // a tick in a green disc
  go: `<circle cx="14" cy="14" r="10" fill="${GOOD}" stroke="${INK}" stroke-width="2.5"/><path d="M9 14.5l3.4 3.4L19.5 10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  // a crosshair: ring, four ticks, centre dot
  target: `<circle cx="14" cy="14" r="8.5" fill="none" stroke="${INK}" stroke-width="5"/><circle cx="14" cy="14" r="8.5" fill="none" stroke="${GOOD}" stroke-width="2.5"/><path d="M14 1v7M14 20v7M1 14h7M20 14h7" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><path d="M14 2v5.5M14 20.5v5.5M2 14h5.5M20.5 14h5.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="14" cy="14" r="2.2" fill="${GOOD}" stroke="${INK}" stroke-width="1.2"/>`,
  // a plus in a green disc: put something here
  place: `<circle cx="14" cy="14" r="10" fill="${GOOD}" stroke="${INK}" stroke-width="2.5"/><path d="M14 8.5v11M8.5 14h11" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>`,
  // no entry: a red ring with a slash
  no: `<circle cx="14" cy="14" r="10" fill="#fff" fill-opacity="0.85" stroke="${INK}" stroke-width="5"/><circle cx="14" cy="14" r="10" fill="none" stroke="${BAD}" stroke-width="3"/><path d="M7.2 20.8L20.8 7.2" stroke="${INK}" stroke-width="5.2" stroke-linecap="round"/><path d="M7.2 20.8L20.8 7.2" stroke="${BAD}" stroke-width="3" stroke-linecap="round"/>`,
};

const FALLBACK: Record<CursorKind, string> = {
  default: "default",
  pointer: "pointer",
  go: "pointer",
  target: "crosshair",
  place: "copy",
  no: "not-allowed",
};

const cache = new Map<CursorKind, string>();

/** The CSS `cursor` value for a kind: an inline SVG with its hotspot in the middle, plus a keyword fallback. */
export function cursorCss(kind: CursorKind): string {
  if (kind === "default" || kind === "pointer") return kind;
  const hit = cache.get(kind);
  if (hit) return hit;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">${SHAPES[kind]}</svg>`;
  const css = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 14 14, ${FALLBACK[kind]}`;
  cache.set(kind, css);
  return css;
}

/** The glyph in front of a tip: ✓ or ✕ (shape, not just colour). */
export const toneGlyph = (t: Tone): string => (t === "ok" ? "✓" : t === "bad" ? "✕" : "");

const escAttr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Attributes for an action button: `disabled` plus the reason as its tooltip when `why` is set,
 * otherwise the normal tooltip.
 */
export function buttonAttrs(why: string | null, title = ""): string {
  if (why) return `disabled aria-disabled="true" title="${escAttr(why)}"`;
  return title ? `title="${escAttr(title)}"` : "";
}

/** The visible "why not" line inside a disabled button (empty when it's enabled). */
export function whyLine(why: string | null): string {
  if (!why) return "";
  return `<small class="why">⛔ ${escAttr(why)}</small>`;
}
