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
  /**
   * A faction can repaint the fixed slots too (studs, stencil paint, chips, the warm glow): the
   * Swarm's "rivets" are egg nubs and its glow is acid, the Concord's studs are gold. Never `team`.
   */
  fixed?: Partial<Record<"rivet" | "paint" | "chip" | "glowWarm", string>>;
}

/**
 * Colourways. The slot NAMES are the Militia's (plate, suit, leather, metal), but each faction reads
 * them its own way, so one part grammar serves every army (and the Forge's kits later):
 *   Militia: plate = armour plate, suit = work-suit, leather, metal = gunmetal, glow = lamp.
 *   Swarm:   plate = chitin, suit = soft body and joints, leather = ivory underplate,
 *            metal = wet sheen, glow = acid; paint = the one hard specular, rivet = egg nub.
 *   Concord: plate = pearl armour, suit = deep navy, leather = deco gold, metal = navy steel,
 *            glow = crystal light; rivet = gold studs, paint = white enamel, glowWarm = lavender.
 */
export const COLOURWAYS: Readonly<Record<string, Colourway>> = {
  // Militia: the canvas's four colourways (plate, suit) with shared leather, metal and lamp glow
  dust: { id: "dust", name: "Dust", plate: "#9a8458", suit: "#5d5b45", leather: "#6e4528", metal: "#4a5158", glow: "#fff2c0" },
  ash: { id: "ash", name: "Ash", plate: "#8d9296", suit: "#4b4a48", leather: "#6e4528", metal: "#4a5158", glow: "#fff2c0" },
  prairie: { id: "prairie", name: "Prairie", plate: "#7f8a55", suit: "#6b5a43", leather: "#6e4528", metal: "#4a5158", glow: "#fff2c0" },
  night: { id: "night", name: "Night shift", plate: "#5a6070", suit: "#3a3c42", leather: "#5a3a24", metal: "#454b52", glow: "#d8f4ff" },
  // Swarm: wet violet chitin, ivory underplate, acid lime (the Hard Ink sheet's palette)
  brood: {
    id: "brood",
    name: "Brood violet",
    plate: "#5e3478",
    suit: "#2b1838",
    leather: "#d6cba8",
    metal: "#a07ac8",
    glow: "#c8ef5a",
    fixed: { rivet: "#e6e3c4", paint: "#f4eefc", chip: "#8a6aa8", glowWarm: "#8fbf2a" },
  },
  deepnest: {
    id: "deepnest",
    name: "Deep nest",
    plate: "#3f4f63",
    suit: "#1d2430",
    leather: "#c9c2a0",
    metal: "#7d93ad",
    glow: "#ffb54a",
    fixed: { rivet: "#e6e3c4", paint: "#eef4fc", chip: "#5f7690", glowWarm: "#d07a22" },
  },
  // Concord: pearl armour, deep navy, deco gold, lavender crystal light
  pearl: {
    id: "pearl",
    name: "Pearl court",
    plate: "#e6e1ec",
    suit: "#232848",
    leather: "#d2b05a",
    metal: "#3a4170",
    glow: "#d9ccff",
    fixed: { rivet: "#f2d98a", paint: "#ffffff", chip: "#c4bcd8", glowWarm: "#b48cf2" },
  },
  rosegold: {
    id: "rosegold",
    name: "Rose court",
    plate: "#efe0dc",
    suit: "#3a2340",
    leather: "#d79a6e",
    metal: "#5a3a5e",
    glow: "#ffd6e8",
    fixed: { rivet: "#f6c9a0", paint: "#ffffff", chip: "#d8bcc0", glowWarm: "#e88ab8" },
  },
};

/** Which colourways belong to which faction (the Rig Lab offers these). */
export const FACTION_COLOURWAYS: Readonly<Record<string, string[]>> = {
  militia: ["dust", "ash", "prairie", "night"],
  swarm: ["brood", "deepnest"],
  concord: ["pearl", "rosegold"],
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
    ...cw.fixed,
  };
}

/** Key colour → real colour, for the baker's search and replace. */
export function keyMap(slots: Record<SlotName, string>): Map<string, string> {
  return new Map(SLOT_NAMES.map((s) => [SLOT_KEYS[s].toLowerCase(), slots[s].toLowerCase()]));
}
