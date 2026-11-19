// The Munch colourways. Each critter keeps its own coat (a fox is rust, a skunk is black) so the
// horde reads as farmland animals, not one dyed army; the coats lean a little toward the faction
// colour, and the faction colour itself is the mutagen: vials, goo, tanks and the glow. So a
// recoloured Munch faction recolours, and squad mates still look like what they are.
//
//   plate / plateShade   the coat (fur, hide, chitin) or, on burrows, the dirt
//   suit / suitShade     the dark markings: a badger's mask, a skunk's coat, socks, legs, holes
//   leather              mutagen: the vial's liquid, goo, tank fluid (the faction colour)
//   metal                the lab's steel: jaws, pistons, caps, mounts; chip its chrome highlight
//   glow                 the implant lens and the mutagen's light; glowWarm an amber lab lamp
//   paint / rivet        lab white: teeth, bone, white fur, the doctor's coat; and its shade
//                        (on the burrows rivet is the grass)

import { mixHex, numToHex } from "../../../color";
import type { Colourway } from "../../../slots";

/** Natural coats: [coat, dark markings]. */
export const COATS = {
  beetle: ["#6f4a2e", "#2c2420"],
  spider: ["#7d7064", "#342c28"],
  wasp: ["#d8983a", "#2a2420"],
  badger: ["#8f8c88", "#2c292c"],
  fox: ["#c2652e", "#3a2a22"],
  skunk: ["#3e3a44", "#1f1d24"],
  crow: ["#3a3848", "#20202a"],
  scorpion: ["#a86a3c", "#4a2e1e"],
  lab: ["#7c8a88", "#2e3434"],
  dirt: ["#80603e", "#24190f"],
} as const;

export type Coat = keyof typeof COATS;

const WHITE = "#ebe5d6";
const WHITE_SHADE = "#bcb39f";
const GRASS = "#7d8a3c";

export function munchColourway(primary: number, coat: Coat): Colourway {
  const goo = numToHex(primary);
  const [fur, dark] = COATS[coat];
  return {
    id: `munch-${coat}-${goo.slice(1)}`,
    name: "Dr. Graft's lab",
    plate: mixHex(fur, goo, 0.12),
    suit: mixHex(dark, goo, 0.06),
    leather: goo,
    metal: mixHex("#8d98a1", goo, 0.06),
    glow: mixHex(goo, "#efffd8", 0.55),
    fixed: { paint: WHITE, rivet: coat === "dirt" ? GRASS : WHITE_SHADE, chip: "#e4eaee", glowWarm: "#ffb84a" },
  };
}
