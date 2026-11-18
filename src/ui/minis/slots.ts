// Colour slots. Parts are authored in SVG using a fixed set of KEY colours (the swatches of the part
// template); every key names a slot. At bake time each key is replaced by the slot's real colour,
// worked out from a colourway (the few base colours a player picks) and the team colour. Shades are
// derived in OKLCH, so contrast and light direction stay right whatever the player picks.
//
// The key colours are the Dust colourway of the engine canvas, so a part file opens in Inkscape (or
// any SVG viewer) looking like a finished Dust miniature. The team key is a loud magenta that no real
// paint uses, so a missing team swap is obvious.

import { lightOf, numToHex, shadeOf } from "./color";

export type SlotName =
  | "plate"
  | "plateShade"
  | "suit"
  | "suitShade"
  | "leather"
  | "leatherShade"
  | "leatherDeep"
  | "metal"
  | "metalShade"
  | "metalDeep"
  | "chip"
  | "rivet"
  | "paint"
  | "glow"
  | "glowWarm"
  | "ink"
  | "team"
  | "teamShade";

/** Authoring swatches: the only colours a part file may use. */
export const SLOT_KEYS: Readonly<Record<SlotName, string>> = {
  plate: "#9a8458",
  plateShade: "#6c5a37",
  suit: "#5d5b45",
  suitShade: "#44432f",
  leather: "#6e4528",
  leatherShade: "#4a2e19",
  leatherDeep: "#2b2019",
  metal: "#4a5158",
  metalShade: "#353b41",
  metalDeep: "#25282c",
  chip: "#b9bfc4",
  rivet: "#c8bd98",
  paint: "#e3d8b6",
  glow: "#fff2c0",
  glowWarm: "#f2b84b",
  ink: "#141414",
  team: "#ff00ff",
  teamShade: "#b000b0",
};

export const SLOT_NAMES = Object.keys(SLOT_KEYS) as SlotName[];

const KEY_TO_SLOT = new Map<string, SlotName>(SLOT_NAMES.map((s) => [SLOT_KEYS[s].toLowerCase(), s]));

/** The slot a key colour stands for, or null if the colour isn't a slot swatch. */
export const slotOfKey = (hex: string): SlotName | null => KEY_TO_SLOT.get(hex.toLowerCase()) ?? null;

/** The base colours a player picks. Everything else is derived or fixed. */
export interface Colourway {
  id: string;
  name: string;
  plate: string;
  suit: string;
  leather: string;
  metal: string;
  glow: string;
}

/** The canvas's four Militia colourways (plate, suit) with shared leather, metal and lamp glow. */
export const COLOURWAYS: Readonly<Record<string, Colourway>> = {
  dust: { id: "dust", name: "Dust", plate: "#9a8458", suit: "#5d5b45", leather: "#6e4528", metal: "#4a5158", glow: "#fff2c0" },
  ash: { id: "ash", name: "Ash", plate: "#8d9296", suit: "#4b4a48", leather: "#6e4528", metal: "#4a5158", glow: "#fff2c0" },
  prairie: { id: "prairie", name: "Prairie", plate: "#7f8a55", suit: "#6b5a43", leather: "#6e4528", metal: "#4a5158", glow: "#fff2c0" },
  night: { id: "night", name: "Night shift", plate: "#5a6070", suit: "#3a3c42", leather: "#5a3a24", metal: "#454b52", glow: "#d8f4ff" },
};

/** Paint that never changes with the colourway: ink, rivets, stencil paint and bare-metal chips. */
const FIXED: Pick<Record<SlotName, string>, "ink" | "rivet" | "paint" | "chip"> = {
  ink: SLOT_KEYS.ink,
  rivet: SLOT_KEYS.rivet,
  paint: SLOT_KEYS.paint,
  chip: SLOT_KEYS.chip,
};

/** Every slot's real colour for a colourway and team colour (0xRRGGBB). */
export function resolveSlots(cw: Colourway, team: number): Record<SlotName, string> {
  const t = numToHex(team);
  return {
    plate: cw.plate,
    plateShade: shadeOf(cw.plate),
    suit: cw.suit,
    suitShade: shadeOf(cw.suit),
    leather: cw.leather,
    leatherShade: shadeOf(cw.leather),
    leatherDeep: shadeOf(cw.leather, 2),
    metal: cw.metal,
    metalShade: shadeOf(cw.metal),
    metalDeep: shadeOf(cw.metal, 2),
    glow: cw.glow,
    glowWarm: cw.glow === SLOT_KEYS.glow ? SLOT_KEYS.glowWarm : lightOf(cw.glow, -0.12),
    team: t,
    teamShade: shadeOf(t),
    ...FIXED,
  };
}

/** Key colour → real colour, for the baker's search and replace. */
export function keyMap(slots: Record<SlotName, string>): Map<string, string> {
  return new Map(SLOT_NAMES.map((s) => [SLOT_KEYS[s].toLowerCase(), slots[s].toLowerCase()]));
}
