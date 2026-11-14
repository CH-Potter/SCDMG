// Lumen Concord miniatures. Owned by the Concord art pass: see STYLE.md for the house style.
// Smug alien invaders: domed mint heads in fishbowl helmets, sleek pearl and navy suits, saucers,
// ray guns with ring emitters, hex-cell shields and lavender energy glow, with a touch of gold.
// Each built-in unit has its own painter; the `kinds` fallbacks give custom "crystal" units the same look.

import { FACET_DESIGN, facet, SKIFF_DESIGN, skiff, SYLPH_DESIGN, sylph } from "./concord-big";
import { alloyTop } from "./concord-kit";
import { OBELISK_DESIGN, obelisk, PYLON_DESIGN, pylon, WARD_DESIGN, ward } from "./concord-structures";
import { DANCER_DESIGN, dancer, GUARD_DESIGN, guard, LANCER_DESIGN, lancer, nobleGunner, warden, WARDEN_DESIGN } from "./concord-troops";
import type { Design, FactionArt, Painter } from "./types";

/** Custom troopers pick the closest Concord specialist from their traits. */
const TROOPER_DESIGN: Design = { ref: 0.5, b: [-104, -178, 146, 14], top: 168 };
const anyTrooper: Painter = (t, s, f) => {
  if (s.caster) {
    // the Warden is drawn for a bigger reference base: shrink it to the trooper's
    const k = TROOPER_DESIGN.ref / WARDEN_DESIGN.ref;
    t.ctx.save();
    t.ctx.scale(k, k);
    const [x, y] = warden(t, s, f);
    t.ctx.restore();
    return [x * k, y * k];
  }
  if (s.long) return lancer(t, s, f);
  if (s.jump) return dancer(t, s, f);
  if (s.armoured || s.melee) return guard(t, s, f);
  return nobleGunner(t, s, f);
};

/** Custom structures with a long gun get the laser tower, the rest the shield generator. */
const anyPylon: Painter = (t, s, f) => (s.long ? obelisk(t, s, f) : pylon(t, s, f));
const PYLON_ANY: Design = { ref: 0.85, b: [-92, -238, 136, 26], top: 224 };

export const CONCORD_ART: FactionArt = {
  look: "crystal",
  units: {
    "con-guard": { paint: guard, design: GUARD_DESIGN },
    "con-lancer": { paint: lancer, design: LANCER_DESIGN },
    "con-skiff": { paint: skiff, design: SKIFF_DESIGN },
    "con-warden": { paint: warden, design: WARDEN_DESIGN },
    "con-pylon": { paint: pylon, design: PYLON_DESIGN },
    "con-ward": { paint: ward, design: WARD_DESIGN },
    "con-facet": { paint: facet, design: FACET_DESIGN },
    "con-dancers": { paint: dancer, design: DANCER_DESIGN },
    "con-sylph": { paint: sylph, design: SYLPH_DESIGN },
    "con-obelisk": { paint: obelisk, design: OBELISK_DESIGN },
  },
  kinds: {
    trooper: { paint: anyTrooper, design: TROOPER_DESIGN },
    skiff: { paint: skiff, design: SKIFF_DESIGN },
    pylon: { paint: anyPylon, design: PYLON_ANY },
    ward: { paint: ward, design: WARD_DESIGN },
    golem: { paint: facet, design: FACET_DESIGN },
    sylph: { paint: sylph, design: SYLPH_DESIGN },
  },
  baseTop: alloyTop,
};
