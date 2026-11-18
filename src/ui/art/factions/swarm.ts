// The Skitterswarm's miniatures, for now: built-miniature recipes (the forge's parts) for its bugs, and
// two small painters so its summons read at a glance (a clutch of glowing eggs, a fresh tunnel mouth).
// A new miniature engine is on the way, so this stays deliberately simple. Keyed by the local part of
// the profile id ("swarm-mother", or "custom-x:swarm-mother" in a forge copy), so copies keep the look.

import type { MiniatureRecipe } from "../../../engine/types";
import { mix, shade } from "../palette";
import { contact, ellipse, fill, flat, glowAt, ink, mat } from "../toon";
import { LINE, lumpy, M, part } from "./munch-kit";
import type { FigureArt, Painter } from "./types";

/** Chitin: a dark mauve-brown shell, with the faction's acid green (or a gold crown) as the trim. */
const CHITIN = 0x5e4352;
const DARK = 0x45303c;
const ACID = 0xd6f56a;

const r = (body: MiniatureRecipe["body"], head: MiniatureRecipe["head"], headgear: MiniatureRecipe["headgear"], weapon: MiniatureRecipe["weapon"], back: MiniatureRecipe["back"], scale: number, primary = CHITIN, secondary = ACID): MiniatureRecipe => ({
  body,
  head,
  headgear,
  weapon,
  back,
  secondary,
  scale,
  primary,
});

/** Built miniatures for the Skitterswarm's bugs, by local profile id. */
export const SWARM_RECIPES: Record<string, MiniatureRecipe> = {
  "swarm-skitterlings": r("critter", "bug", "antennae", "claws", "none", 0.9),
  "swarm-spitters": r("critter", "bug", "antennae", "none", "tank", 1),
  "swarm-shellbacks": r("brute", "bug", "horns", "claws", "pack", 1, DARK),
  "swarm-lurker": r("critter", "bug", "horns", "claws", "none", 1.3, DARK),
  // The centrepiece: the biggest bug on the table, crowned, with an egg sac on her back.
  "swarm-mother": r("brute", "bug", "crown", "claws", "tank", 1.5, 0x7a4a68, 0xffc23a),
  "swarm-borer": r("critter", "bug", "horns", "claws", "none", 1.45, DARK),
  "swarm-stingers": r("critter", "bug", "antennae", "claws", "wings", 0.8),
  "swarm-bombard": r("brute", "bug", "antennae", "cannon", "tank", 1.1),
  "swarm-tenders": r("critter", "bug", "antennae", "staff", "pack", 1),
  "swarm-spire": r("structure", "bug", "antennae", "none", "none", 1, DARK),
  "swarm-geyser": r("structure", "bug", "horns", "cannon", "tank", 0.9),
};

/** The local part of a profile id ("custom-x:swarm-mother" → "swarm-mother"). */
const localId = (id: string): string => (id.includes(":") ? id.slice(id.indexOf(":") + 1) : id);

/** The built miniature for a Skitterswarm unit (or a forge copy of one), if it has one. */
export const swarmRecipe = (profileId: string): MiniatureRecipe | undefined => SWARM_RECIPES[localId(profileId)];

// ---------- Egg Clutch: a nest of glowing eggs in a ring of dug-up dirt ----------

const eggClutch: Painter = (t, s, f) => {
  const A = s.color;
  const D = mat(M.dirt);
  const pulse = f === 1;
  contact(t, 0, -4, 100, 22, 0.45);
  fill(t, lumpy(0, -20, 92, 32, 14, 0.15, 7), D, { s: 10 });
  fill(t, ellipse(0, -24, 66, 20), mat(shade(M.dirt, -0.5)), { s: 0 });
  const shell = mat(mix(A, 0xf8ffd8, 0.6), 0.55, 0.22);
  const eggs: [number, number, number][] = [
    [-36, -34, 17],
    [0, -40, 19],
    [36, -34, 17],
    [-18, -20, 18],
    [20, -20, 18],
  ];
  for (const [x, y, rr] of eggs) {
    glowAt(t, x, y - rr * 0.9, rr * 2.2, A, pulse ? 0.6 : 0.4);
    part(t, ellipse(x, y - rr * 0.95, rr * 0.8, rr * 1.05), shell, { s: rr * 0.3, spec: [x - rr * 0.3, y - rr * 1.45, rr * 0.22, rr * 0.12, -0.3] }, () => {
      flat(t, ellipse(x + rr * 0.15, y - rr * 0.5, rr * 0.35, rr * 0.5), mix(A, 0x6a8a1a, 0.4), 0.35);
    });
  }
  // a crack in the front egg, and a little leg poking out of it
  ink(t, "M 12 -40 L 18 -34 L 14 -28 L 22 -22", LINE * 0.9);
  ink(t, pulse ? "M 18 -30 L 30 -38 L 34 -32" : "M 18 -30 L 28 -34 L 32 -28", 2.4, "#3a2a33");
  return [0, -64];
};

// ---------- Tunnel Mouth: a fresh hole, crumbling at the rim, feelers in the dark ----------

const tunnelMouth: Painter = (t, s, f) => {
  const A = s.color;
  const D = mat(M.dirt);
  const alt = f === 1;
  contact(t, 0, -4, 108, 22, 0.45);
  fill(t, lumpy(0, -26, 96, 36, 16, 0.14, 5), D, { s: 12, spec: [-50, -54, 14, 3, -0.1] });
  for (const [x, y, rr] of [[-80, -38, 11], [-52, -56, 12], [-18, -64, 10], [18, -66, 11], [52, -58, 12], [80, -42, 10]] as const)
    fill(t, lumpy(x, y, rr, rr * 0.75, 7, 0.2, x + 300), D, { s: rr * 0.5, line: LINE * 0.8 });
  part(t, ellipse(0, -24, 62, 26), mat(M.hole), { s: 0 }, () => {
    fill(t, ellipse(0, -46, 68, 18), mat(shade(M.dirt, -0.45)), { s: 0, line: 0 });
    glowAt(t, -14, -18, 16, A, 0.5);
    glowAt(t, 14, -18, 16, A, 0.5);
    flat(t, ellipse(-14, -18, 5, 3.6), mix(A, 0xffffff, 0.3));
    flat(t, ellipse(14, -18, 5, 3.6), mix(A, 0xffffff, 0.3));
  });
  // feelers
  const tip = alt ? 6 : 0;
  ink(t, `M -8 -26 C -14 -50 -30 -60 ${-40 - tip} -70`, 5, "#1c1512");
  ink(t, `M -8 -26 C -14 -50 -30 -60 ${-40 - tip} -70`, 2.4, "#6a4a5a");
  ink(t, `M 8 -26 C 14 -50 30 -60 ${40 + tip} -${70 - tip}`, 5, "#1c1512");
  ink(t, `M 8 -26 C 14 -50 30 -60 ${40 + tip} -${70 - tip}`, 2.4, "#6a4a5a");
  for (const [x, y, rr] of [[-86, -14, 6], [84, -8, 5.5]] as const) fill(t, ellipse(x, y, rr, rr * 0.7), mat(M.stone), { s: rr * 0.4, line: LINE * 0.7 });
  return [0, -40];
};

/** Painters for the Skitterswarm's summons, by local profile id. */
export const SWARM_UNITS: Record<string, FigureArt> = {
  "swarm-eggs": { paint: eggClutch, design: { ref: 0.8, b: [-104, -100, 104, 26], top: 70 } },
  "swarm-mouth": { paint: tunnelMouth, design: { ref: 1, b: [-116, -120, 116, 30], top: 80 } },
};

/** The summon painter for a Skitterswarm unit (or a forge copy of one), if it has one. */
export const swarmPainter = (profileId: string | undefined): FigureArt | undefined => (profileId ? SWARM_UNITS[localId(profileId)] : undefined);
