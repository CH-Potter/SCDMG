# Miniatures: kits and Forge template art

How every unit, from the base factions to a player's custom squad, is drawn on the miniature engine
(`src/ui/minis/`), and how to give a Faction Forge template its own art. The engine itself (rigs,
clips, the baker) is described in the comments of `src/ui/minis/index.ts` and `types.ts`; this page
is the guide for art work.

All art is original. Genre tropes are fine (power-armoured soldiers, orcs, elves, undead, dwarves,
knights); copying any existing game's designs, names, insignia or silhouettes is not.

## How a unit gets its art

Every `UnitProfile` resolves to one of three sources (`src/ui/minis/binding.ts`):

| Binding | Which units | Where the art lives |
| --- | --- | --- |
| `base` | the built-in factions (militia, swarm, concord), by profile id | `rigs/<faction>/index.ts` |
| `template` | a Forge template's units, by **template key and unit key** | `rigs/forge/<templateKey>/index.ts` |
| `kit` | everything else: custom units, template units without bespoke art | `kits/` (the generic kits) |

A template unit is recognised, in order, by:

1. its profile id (`custom-tpl-<key>:<unit>`: template previews in the Forge and the Rig Lab);
2. its `rigTag` field, `"<key>/<unit>"`. The template builder (`forge/templates/kit.ts`) stamps it,
   `cleanFaction` keeps it, so a faction **started from a template, copied, saved, exported,
   reloaded, renamed or re-statted keeps its art**. Duplicating a unit copies the tag too. When the
   player rebuilds the unit's miniature in the Forge (picks parts, randomises, uploads a picture,
   removes it) the tag is dropped and the generic kit draws their choice instead;
3. factions started before the tag existed: the unit's local id and parts recipe match a template
   unit's exactly.

The unit key is the template's local unit id (`brothers` in `custom-tpl-bulwark:brothers`).

Nothing falls back to Classic: a unit with no bespoke art is drawn by the generic kit, in both views.

## Lazy loading and the size budget

Art is split into chunks: one per base faction, one for the kits, one per template (found with
`import.meta.glob`). The registry (`registry.ts`) loads them on demand:

```ts
loadArt(units: Iterable<UnitProfile | string>): Promise<void>   // the chunks these units need
loadAllArt(): Promise<void>                                     // everything (tests, Rig Lab, Forge)
artPending(unit): boolean                                       // its chunk isn't in yet
rigsFor(unit, model = 0, faction?: FactionLook): UnitRigs | null // sync; null only while loading
artFor(unit, faction?): UnitArt | null
```

The game loads both armies' art before a battle starts and before the Minis switch changes style,
the registered factions' art in the background at startup (intros, lore, codex), and the kits and
templates when the Forge opens. If a unit is drawn before its chunk lands, the renderer shows the
Classic figure for that moment and rebuilds the miniatures when it arrives.

Budgets:

- the main chunk stays under **800 kB** (it was 1018 kB with every faction's art in it; 503 kB now).
  Never import a template's or a faction's art statically from main-chunk code;
- one template's art chunk: aim for **under 120 kB** minified (the Bulwark's is 46 kB, the kits' 117 kB);
- each baked look is one more texture page per team colour and zoom tier, so **three looks per unit at most**.

## File layout for a template

```
src/ui/minis/rigs/forge/<key>/index.ts     the template's art module (default export), found by folder name
src/ui/minis/rigs/forge/<key>/*.ts         any helpers it wants (troops.ts, machines.ts...)
src/ui/minis/parts/forge/<key>/*.svg       side-view parts (Ink Rig)
src/ui/minis/parts/forge/<key>-top/*.svg   top-view parts (Overhead)
```

There is **no shared list to edit**: adding the folder registers the template. Three art agents
(grimdark, fantasy, Munch) can work in parallel; the only shared files they might touch are this
doc and the snapshot file `tests/__snapshots__/minis.forge.test.ts.snap` (regenerate it with
`npx vitest run tests/minis.forge.test.ts -u` after merging). If a kit builder needs a new option,
add it with a default that leaves every existing caller's output unchanged (the base-faction and
kit snapshots prove it).

The worked example is the Bulwark Brotherhood: `src/ui/minis/rigs/forge/bulwark/index.ts`.

## The template art API

Import everything from `src/ui/minis/kits` (the kits chunk). Key signatures:

```ts
export default defineTemplateArt({
  key: "bulwark",                                     // = the folder name = the template's key
  colourway?: (faction: FactionLook, spec: KitSpec) => Colourway,   // from the faction colour
  units: Record<string, (ctx: ArtContext) => UnitArt>,              // by unit key; others: the kit
});

interface ArtContext { profile: UnitProfile; faction: FactionLook; spec: KitSpec; colourway: Colourway }
interface UnitArt { colourway: Colourway; looks: { side: RigDef; top: RigDef }[]; pick?: (i: number) => number }
interface KitSpec { body; head; headgear; weapon; back; primary; secondary; scale; models; flying; temp; ranged; armoured; mech; beast; look; image? }

// the kit frames: build on them and swap in your own parts
humanoidSide(o: HumanoidOpts): RigDef        humanoidTop(o: HumanoidOpts): RigDef
beastSide(o: BeastOpts): RigDef              beastTop(o: BeastOpts): RigDef
walkerSide(o: MachineOpts): RigDef           walkerTop(o: MachineOpts): RigDef
flyerSide(o: MachineOpts): RigDef            flyerTop(o: MachineOpts): RigDef
structureSide(o: StructureKitOpts): RigDef   structureTop(o: StructureKitOpts): RigDef
riderSide(o: RiderOpts): RigDef              riderTop(o: RiderOpts): RigDef
kitArt(ctx: ArtContext): UnitArt             // the generic art for a unit, as the fallback draws it
squadLooks(models: number): { variants: LookVariant[]; pick: (i: number) => number }
colourwayOf(primary: number, secondary: number, look: Look): Colourway

// placement helpers (frame coords)
placeAt(src, anchor, at: Pt, rot = 0, scale = 1): Place   // put a part's anchor at a point
turnAbout(src, place, anchor, deg): Place                 // aim a weapon about its grip
leanAbout(p: Pt, deg): Place                              // an upper-body lean
scaleRig(rig, k): RigDef     fitHeight(rig): RigDef     mirrorPart(src): string
```

`HumanoidOpts` lets a template replace any slot: `parts: { torso, head, gear, back }` (side and top
sources, `null` for none), `weaponSide` / `weaponTop` (a part and where it sits; the hands go to its
`g1`/`g2` grips), `padsSide`, `legParts` (shins, knees, boots, leg width), `hand`, `extrasSide` /
`extrasTop`, plus `lean`, `aim` and `scale`. `MachineOpts` takes a `hull`, a `gun` (or `null`),
`extras` and `engines: false`; `StructureKitOpts` a `body` part. The humanoid frame is the Militia
trooper's (`rigs/militia/kit-troops.ts`, standing frame `STAND`: feet at y 170, hips at (60, 106),
neck at (59, 57), shoulders at (47, 70) and (75, 72)); side parts are drawn facing **left**, top parts
facing **up**.

Rig ids must be unique per drawing (they key the baked pages and the disk cache): use
`forge.<key>.<unit>.<look>` and let the builders add `.side` / `.top`.

### Steps for a template

1. Read `src/forge/templates/<group>.ts` for the template's units (keys, keywords, recipes, flavour).
2. Open the Rig Lab on it (below) to see what the generic kit draws today.
3. Draw the parts (both views), in `parts/forge/<key>/` and `parts/forge/<key>-top/`, following the
   part rules below. Start from a kit part of the same slot to get the frame coordinates right
   (`parts/kit/humanoid/`, `-top/`, `beast`, `machine`, `structure`).
4. Write `rigs/forge/<key>/index.ts`: a colourway, then one builder per unit, built on the kit frames.
   Give squads looks with `squadLooks` (a leader and two stances for four or more models).
5. Check it in the Rig Lab: lineup, three zooms, 32 px silhouettes, both views, all clips.
6. Run `npx vitest run tests/minis.forge.test.ts` (every template unit must draw, lint and pose;
   update the snapshots only for your own template's changes) and `npm run build` (chunk sizes).

## Colour slots

Parts use only the slot swatches (`slots.ts`); the baker swaps them for the colourway. The kits read
the slots this way (`kits/colourway.ts`):

| Slot | Kit meaning |
| --- | --- |
| plate / plateShade | the main colour: armour, hide, hull (the faction colour, or the recipe's main colour) |
| suit / suitShade | a dark cloth from the main colour: undersuit, hair, membranes |
| leather / leatherShade / leatherDeep | the **trim** colour: tabards, bands, flags, crowns, stocks |
| metal / metalShade / metalDeep | gunmetal, tinted a touch toward the main colour |
| glow / glowWarm | lights and eyes, by the faction look (lamp, acid, lavender, cyan) |
| paint / rivet | skin and bone, and their shade |
| chip | steel highlights and studs (detail layer) |
| team / teamShade | the team tag only |

A template's colourway may read them its own way (the Bulwark: paint is cream robes, leather is the
Brotherhood's gold), but it must come from the faction colour so a recoloured faction recolours.

## Part rules (rig-lint, `src/ui/minis/lint.ts`)

Every part and rig must pass `lintPart` / `lintRig`; the tests run them on every template rig.

- SVG with `xmlns`, a `viewBox`, `data-part="forge.<key>.<view>.<name>"` and the GPL-3.0-or-later SPDX
  licence comment; paths and basic shapes only, no `style` attributes, no images or text.
- Fill and stroke colours are slot swatches only. Layer classes: `shade` (dropped under 40 px),
  `detail` (dropped under 100 px), `glow`, `tag`.
- Ink (`#141414`) strokes are 2.4 (outer edge), 2 (interior), 1.4 (minor) or 1 (detail layer only);
  coloured lines up to 6.
- Anchors in `<g id="anchors">`: a `pivot` always; weapons `g1` (and `g2` if both hands hold it),
  `muzzle`, and `data-recoil`; optional `exhaust1..n` for puffs, `mount` on structure bodies.
- Budget: 6000 bytes, 48 elements, 140 u viewBox; `data-budget="large"` for hulls, abdomens and
  towers (9000 bytes, 72 elements, 260 u).
- **Exactly one team tag per figure** (per rig: side and top separately), and **of a readable size**:
  at least 80 u² of filled tag area and 0.2% of the rest figure's bounding box, at most 12% of it
  (`TAG_AREA`). Put it where the view shows it: a shield or a stole in front, not behind a pack.
  Some base-faction figures predate this rule (the Concord's small brooches); they are listed as
  known gaps in the tests and are not changed here.

Scale: 105 design units per inch (`UPI`); a trooper stands about 160 u. Squads stay under 1.8",
monsters above 1.7"; structures no taller than 1.4 times their base width.

## Motion

Frame types pick the clips: `lean` (humanoids), `insect` (many legs, bites), `walker`, `vehicle`,
`hover`, `structure`. Parts can move without bones (`PartAnim`): `pulse`, `float`, `spin`, `flap`,
and **`phase`** (0..1 of the loop) so repeated parts (two wings, a row of bells, a pair of rotors)
don't beat in lockstep. Each model also gets its own phase from its index in the squad
(`modelPhase`), so squad mates neither breathe nor step together.

## Uploaded pictures

A custom unit with an uploaded picture is drawn as a coin standee (`kits/standee.ts`): the picture
is drawn into the baked page by the baker (`PartUse.image`), never parsed as SVG, so it stays the
validated PNG/JPEG/WebP of `engine/data/unitArt.ts`. The standee never mirrors.

## Why there is no JSON rig manifest

Custom unit art is a **parts recipe** (a handful of catalogue choices, validated and stored with the
faction) or an uploaded picture. The recipe already is the manifest the Forge stores: the kits turn it
into rigs, and the slot-tagged part catalogue (`kits/catalogue.ts`: parts named by slot, `head-*`,
`gear-*`, `back-*`, `weapon-*`...) is the data layer behind it. Storing full rigs with inline SVG in a
saved faction would blow the browser storage budget (factions share about 900 kB), put
player-supplied SVG into the baker, and duplicate what the TypeScript builders already do
deterministically. Template art is code in the repo, written and reviewed like the base factions'.
If players ever get a rig editor, a manifest of catalogue references (no inline SVG) is the shape to
add.

## The Rig Lab

`npm run dev`, then `http://localhost:5173/rig-lab.html`. Pick a base faction, **Generic kit
samples** (custom-style units covering every frame, recipe choices, stat-only units and a picture)
or a **Forge template** (★ marks templates with their own art). URL: `?faction=tpl:bulwark&unit=
custom-tpl-bulwark:brothers&view=top&scene=lineup&ppi=72`. Scenes: one model, squad, three zooms,
faction lineup, 32 px silhouettes, perf (100/200/400 models, prints fps and the per-frame rig update
to the console). Toggles: bones and grips, silhouette test, part visibility, statuses, clips.

## Tests

- `tests/minis.forge.test.ts`: every template unit and kit sample draws in both views, lints (tag
  size included) and poses through all clips; ids are unique per drawing; template art survives
  start, copy, reload and edits; snapshots of the Bulwark and a generic kit unit (bake plan and key
  poses); the base-faction tag gaps.
- `tests/minis.factions.test.ts`, `tests/minis.test.ts`: the base factions and the engine (their
  snapshots must not change with kit or template work).
- `npm run sim:golden` must stay 51/51 identical: art never touches `src/engine/`.
