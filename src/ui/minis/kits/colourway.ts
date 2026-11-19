// The kits' colourway, made from a faction's colours. The kits read the slots their own way:
//   plate = the main colour (armour, hide, hull)   suit = a dark cloth from it (undersuit, hair, membranes)
//   leather = the trim colour (tabards, bands, flags, crowns, stocks)   metal = gunmetal, a touch of the main hue
//   glow = lights and eyes (by the faction look)   paint = skin and bone   rivet = their shade   chip = steel
// Shades are derived in OKLCH like every colourway, so any pick keeps its contrast.

import { hexToOklch, lightOf, mixHex, numToHex, oklchToHex } from "../color";
import type { Colourway } from "../slots";
import type { FactionLook, KitSpec, Look } from "./spec";

const GLOW: Record<Look, string> = { cap: "#fff2c0", teeth: "#c8ef5a", crystal: "#d9ccff", plain: "#bdf4ff" };
const SKIN = "#e8c7a0";
const SKIN_SHADE = "#c39a76";
const STEEL = "#c9d0d6";

/** A colour that still shades: very dark picks are lifted, very light ones dimmed a touch. */
function usable(hex: string): string {
  const o = hexToOklch(hex);
  if (o.l < 0.32) return oklchToHex({ ...o, l: 0.32 + (o.l - 0.32) * 0.3 });
  if (o.l > 0.93) return oklchToHex({ ...o, l: 0.93 });
  return hex;
}

/** The kits' colourway for a main and a trim colour and a faction look. */
export function colourwayOf(primary: number, secondary: number, look: Look): Colourway {
  const plate = usable(numToHex(primary));
  const p = hexToOklch(plate);
  const suit = oklchToHex({ l: Math.max(0.24, Math.min(0.4, p.l * 0.55)), c: Math.min(0.05, p.c * 0.4), h: p.h });
  const trim = usable(numToHex(secondary));
  const metal = mixHex("#4a5158", plate, 0.12);
  return {
    id: `kit-${numToHex(primary).slice(1)}-${numToHex(secondary).slice(1)}-${look}`,
    name: "Faction colours",
    plate,
    suit,
    leather: trim,
    metal,
    glow: GLOW[look] ?? GLOW.plain,
    fixed: { paint: SKIN, rivet: SKIN_SHADE, chip: STEEL, glowWarm: lightOf(GLOW[look] ?? GLOW.plain, -0.16) },
  };
}

/** The colourway a kit unit is painted in: its recipe's colours (or the faction's) and the faction look. */
export function kitColourway(f: FactionLook, spec: KitSpec): Colourway {
  return colourwayOf(spec.primary, spec.secondary, f.look);
}
