// The Munch miniatures. Owned by the Munch art pass: see STYLE.md for the house style.
// An army of grafted farmland critters (beetles, spiders, wasps, scorpions, foxes, a skunk, a crow)
// led by an evil bioengineer riding his war-badger. Natural animal coats, plus clean lab grafts:
// chrome plates held on with surgical staples, glass vials of glowing mutagen, bolted-on weapons.
// Every critter wears the signal implant, a chrome skull cap with a glowing faction-green lens:
// that and the green glow are the faction's shared thread. Painters live in munch-critters.ts,
// munch-beasts.ts and munch-structures.ts; the shared kit in munch-kit.ts.

import { BADGER, BUZZ, FLAPJAW, LOBBER, MAMA } from "./munch-beasts";
import { BIPED, HOPPER, NANNY, NIBBLER, SPITTER } from "./munch-critters";
import { BURROW, munchBaseTop, PIT, POD, WARREN } from "./munch-structures";
import type { FactionArt, FigureArt } from "./types";

type Spec = Parameters<FigureArt["paint"]>[1];

/**
 * An archetype fallback for custom units with the "teeth" look: the first design whose test passes
 * (the last is the default), each rescaled from its own reference radius to `ref`, with bounds
 * that hold every option.
 */
function byRole(ref: number, options: [(s: Spec) => boolean, FigureArt][]): FigureArt {
  const ks = options.map(([, a]) => ref / a.design!.ref);
  const ds = options.map(([, a]) => a.design!);
  const lo = (i: number) => Math.min(...ds.map((d, j) => d.b[i]! * ks[j]!));
  const hi = (i: number) => Math.max(...ds.map((d, j) => d.b[i]! * ks[j]!));
  return {
    design: { ref, b: [lo(0), lo(1), hi(2), hi(3)], top: Math.max(...ds.map((d, j) => d.top * ks[j]!)) },
    paint: (t, s, f) => {
      const i = Math.max(0, options.findIndex(([test]) => test(s)));
      const k = ks[i]!;
      t.ctx.save();
      t.ctx.scale(k, k);
      const [x, y] = options[i]![1].paint(t, s, f);
      t.ctx.restore();
      return [x * k, y * k];
    },
  };
}

const always = () => true;

export const MUNCH_ART: FactionArt = {
  look: "teeth",
  units: {
    "munch-nibblers": NIBBLER,
    "munch-spitter": SPITTER,
    "munch-buzz": BUZZ,
    "munch-mama": MAMA,
    "munch-pod": POD,
    "munch-hole": BURROW,
    "munch-pit": PIT,
    "munch-hoppers": HOPPER,
    "munch-lobber": LOBBER,
    "munch-flapjaw": FLAPJAW,
    "munch-nanny": NANNY,
    "munch-warren": WARREN,
  },
  kinds: {
    critter: byRole(0.45, [[(s) => s.spitter, SPITTER], [(s) => s.jump, HOPPER], [(s) => s.medic, NANNY], [always, NIBBLER]]),
    bug: byRole(0.5, [[(s) => s.r >= 0.8, FLAPJAW], [always, BUZZ]]),
    brute: byRole(1.35, [[(s) => s.ranged, LOBBER], [always, BADGER]]),
    pod: POD,
    // Holes can't tell a trap from a tunnel by their spec, so only an obvious name gets the mouth.
    hole: byRole(1, [[(s) => /pit|gobble|maw|trap|mouth/i.test(s.unit ?? ""), PIT], [always, BURROW]]),
    mound: WARREN,
    trooper: BIPED,
  },
  baseTop: munchBaseTop,
};
