# Miniature art bible

All three built-in factions share one house style, so they look like pieces from the same game, while each faction's shape language, palette and materials make its identity obvious at a glance. Every faction art pass follows this page.

## The look

Polished top-down "colony sim" miniatures: the chunky, highly readable, flat-shaded style of games like RimWorld and Prison Architect, finished to a premium, stylish standard. Our characters, vehicles and props are original; take the readability and charm of that style, never their actual designs.

- **Camera:** an elevated three-quarter view, about 40° down, matching the board. Figures face right (the renderer mirrors them to face left). Show the top planes (helmet and head tops, shoulders, hulls, decks, crystal facets) catching the light, plus the front-facing side.
- **Proportions:** compact and chunky. Infantry heads are big (about a third of figure height), hands are simple mitten shapes, legs short. Monsters and vehicles are bold, simple masses.
- **Silhouette first:** every unit must be recognisable as a black silhouette at 24–40 px. One signature prop per unit (gun, tool, claw, crystal), exaggerated in size. Avoid thin spindly parts that vanish when small.
- **Shading:** flat cel shading. Base colour plus one shadow tone, with a narrow highlight on the top planes only. Light comes from the top left. No soft gradients, except glows (crystal, goo, muzzles, eyes) and gloss on metal, glass or crystal.
- **Lines:** the pipeline adds the heavy outer silhouette (`FIG_INK`), so never draw your own outer outline. Interior lines are thin (`t.line`, about 1.5 design units) and sparse: separate major masses, and skip fussy detail lines.
- **Detail budget:** a few big, clear shapes, then two or three small accents (rivets, patches, teeth, gems). If a detail can't be read at board size, drop it.
- **Colour:** each faction has a tight palette: two or three main colours, one signature accent (the faction colour, `s.color`), and neutrals. Mid-saturation for bodies, with saturation saved for the accent and glows. Avoid pure black; the ink colour is `0x1c1512`. Figures must stand out against the cyan (`0x2fb5c8`) and red (`0xf0565b`) team rings and on dirt, sand, grass and concrete ground.
- **Animation:** frame 0 is idle, frame 1 is the step, flap, pulse or recoil pose. Keep the change subtle and keep the feet at the origin. The renderer adds breathing and bobbing on top.
- **Bases:** the shared ring in the team colour stays. Each faction paints its own ground on top (`baseTop`), and it must be quiet enough not to compete with the figure.

## Scale (design units: centi-inches at the design's reference radius)

Keep relative sizes consistent across factions. Infantry on a 0.5–0.6" base stand about 130–150 units tall. Heavy infantry are a little taller and broader. Monsters and walkers on 1.3–1.4" bases reach about 190–260. Flyers sit higher, and the renderer lifts them and draws a ground shadow, so paint the flyer only. Structures are planted, squat and wide.

## Code contract (see `types.ts`)

- Your faction module exports a `FactionArt`. `units["<profile id>"]` gives each built-in unit its own painter, so different units of the same archetype (Grunts, Squinter, Grannies...) look different. `kinds` gives a fallback per archetype for custom units of your faction's look. `baseTop` paints the base ground.
- A painter draws at feet origin (0, 0), facing right, with y up negative, in design units, and returns the weapon tip or focal point.
- If your figure goes outside the shared archetype's bounds (figures.ts `DESIGN`), give it its own `design: { ref, b: [x0, y0, x1, y1], top }`. `ref` is the base radius the design is drawn for: the figure is scaled by `unit radius / ref`. The bounds must contain everything you paint, or it gets clipped.
- The painter receives a `FigureSpec`: `s.color` is the faction colour, and `s.ranged`, `s.melee`, `s.long`, `s.medic`, `s.caster`, `s.spitter`, `s.jump`, `s.armoured` and `s.heavy` describe the unit (useful for the `kinds` fallbacks).
- Use the shared toolkit: `toon.ts` (`mat`, `fill`, `flat`, `ink`, `ellipse`, `rrect`, `tube`, `glowAt`, `contact`, `teethRow`, `outlined`) and `palette.ts` (`mix`, `shade`, `rgba`, `luma`, `css`). Read figures.ts for examples of how the current painters use them. Don't edit shared files: if you need something shared changed, say so in your report.

## Reviewing your work

With the dev server running (`npm run dev`, port 5173):

- Open `http://localhost:5173/gallery.html?faction=<id>` in a browser, or screenshot it headlessly:
  `npx electron scripts/gallery-shot.cjs <id> <out.png> 1300 "ground=7a6a4e"`
  Then look at the PNG. Grounds: dirt `7a6a4e`, sand `b89a6a`, grass `5d7a45`, concrete `8a8a86`.
- Each row shows the unit large in both team colours, its idle and step frames, and a squad at roughly board scale. Judge the board-scale squad hardest: that's what players see.
