// The base factions on the miniature engine: every unit has art in both views, every part and rig
// passes rig-lint, every frame type's clips pose cleanly, walking feet stay planted, and a few
// representative units (one per frame type) are snapshot-tested: bake plans and key poses.

import { beforeAll, describe, expect, it } from "vitest";
import { FACTIONS } from "../src/engine/data/factions";
import { planAtlas } from "../src/ui/minis/atlas";
import { planHash } from "../src/ui/minis/bake";
import { addClip, channels, CLIP_IDS, clipsFor, FRAME_CLIPS } from "../src/ui/minis/clips";
import { lintPart, lintRig } from "../src/ui/minis/lint";
import { poseRig, strideOf, ZERO } from "../src/ui/minis/pose";
import { artFor, loadArt, riggedProfiles, rigsFor } from "../src/ui/minis/registry";
import { trooperSide } from "../src/ui/minis/rigs/militiaTrooper";
import { COLOURWAYS, FACTION_COLOURWAYS, resolveSlots, SLOT_KEYS } from "../src/ui/minis/slots";
import type { Mat, RigDef } from "../src/ui/minis/types";

const BASE = ["militia", "swarm", "concord"] as const;
beforeAll(() => loadArt(BASE.flatMap((f) => FACTIONS[f]!.profiles)));
const TEAL = 0x2fb5c8;
const round = (m: Mat) => m.map((v) => Math.round(v * 100) / 100);

/** Every rig of every look of every converted unit. */
function allRigs(): { unit: string; rig: RigDef }[] {
  const out: { unit: string; rig: RigDef }[] = [];
  for (const id of riggedProfiles()) for (const l of artFor(id)!.looks) out.push({ unit: id, rig: l.side }, { unit: id, rig: l.top });
  return out;
}

describe("base factions on the miniature engine", () => {
  it("has art in both views for every buyable and summon-only unit of the three base factions", () => {
    const missing: string[] = [];
    for (const f of BASE)
      for (const p of FACTIONS[f]!.profiles) {
        const r = rigsFor(p.id);
        if (!r || r.side.view !== "side" || r.top.view !== "top") missing.push(p.id);
      }
    expect(missing).toEqual([]);
  });

  it("passes rig-lint for every part and rig (one team tag per figure)", () => {
    for (const { unit, rig } of allRigs()) expect(lintRig(rig, { tagArea: false }), `${unit} ${rig.id}`).toEqual([]);
  });

  it("paints each faction in its own colourway, with the team colour only in the tag", () => {
    for (const f of BASE)
      for (const p of FACTIONS[f]!.profiles) {
        const a = artFor(p.id);
        if (!a) continue;
        expect(FACTION_COLOURWAYS[f], p.id).toContain(a.colourway.id);
        const slots = resolveSlots(a.colourway, TEAL);
        const svg = planAtlas(a.looks[0]!.side, "token", slots).svg;
        expect(svg, p.id).not.toContain(SLOT_KEYS.team);
        expect(svg, p.id).toContain("#2fb5c8");
      }
  });

  it("gives every rig a unique id, so baked pages never collide", () => {
    const seen = new Map<string, string>();
    for (const { unit, rig } of allRigs()) {
      const other = seen.get(rig.id);
      // a look shared between units (same rig object) is fine; two different rigs with one id are not
      if (other && other !== unit) expect(artFor(other)!.looks.some((l) => l.side === rig || l.top === rig), `${rig.id} in ${unit} and ${other}`).toBe(true);
      seen.set(rig.id, unit);
    }
  });

  it("poses every rig through all six clips of its frame type without NaNs", () => {
    for (const { unit, rig } of allRigs()) {
      const clips = clipsFor(rig);
      for (const id of CLIP_IDS) {
        const clip = clips[id];
        for (let t = 0; t <= clip.dur; t += clip.dur / 5) {
          const c = channels();
          addClip(c, clip, t);
          if (id === "bob") c.lift = 120;
          for (const m of poseRig(rig, c).mats.values()) expect(m.every(Number.isFinite), `${unit} ${rig.id} ${id} ${t}`).toBe(true);
        }
      }
    }
  });

  it("keeps the figures at table scale: squads near the trooper, big units bigger, structures squat", () => {
    for (const f of BASE)
      for (const p of FACTIONS[f]!.profiles) {
        const r = rigsFor(p.id);
        if (!r) continue;
        const tall = r.side.height / r.side.unitsPerInch;
        if (p.structure) {
          // Hard Ink: structures no taller than 1.4 times their base width
          expect(tall, `${p.id} ${tall.toFixed(2)}"`).toBeLessThanOrEqual(p.baseRadius * 2 * 1.4 + 0.01);
          expect(r.side.frame, p.id).toBe("structure");
        } else if (p.models > 2) expect(tall, `${p.id} ${tall.toFixed(2)}"`).toBeLessThanOrEqual(1.8);
        if (p.keywords.includes("monster") || p.id === "mil-bertha") expect(tall, `${p.id} ${tall.toFixed(2)}"`).toBeGreaterThan(1.7);
      }
  });
});

describe("engine extensions", () => {
  it("has the six clips for every frame type, in both views", () => {
    for (const [frame, set] of Object.entries(FRAME_CLIPS))
      for (const view of ["side", "top"] as const)
        for (const id of CLIP_IDS) {
          const clip = set[view][id];
          expect(clip, `${frame} ${view} ${id}`).toBeDefined();
          if (clip.loop && clip.dur > 0) {
            const a = channels();
            const b = channels();
            addClip(a, clip, 50);
            addClip(b, clip, 50 + clip.dur * 2);
            for (const k of Object.keys(a) as (keyof typeof a)[]) expect(a[k], `${frame} ${view} ${id} ${k}`).toBeCloseTo(b[k], 6);
          }
        }
  });

  it("plants the feet: over a stance the foot moves back as fast as the body walks forward", () => {
    // the trooper's front foot is planted from gait key 0 to key 2; the body covers half a stride
    const rig = trooperSide();
    const stride = strideOf(rig);
    expect(stride).toBeCloseTo(68, 6);
    let drift = 0;
    for (let g = 0; g <= 2; g += 0.125) {
      const foot = poseRig(rig, { ...ZERO, gait: g, gaitW: 1 }).limbs.get("legF")!.end;
      // the figure faces left (-x) and walks g/4 of a stride: where the foot is on the ground
      const ground = foot.x - (g / 4) * stride;
      if (g === 0) drift = ground;
      // (the trooper's keys step 16 then 18 u, and the full stride is just past the leg's reach,
      // so a give of up to 2 u, about 2% of its height, is in the drawing itself)
      expect(Math.abs(ground - drift), `g ${g}`).toBeLessThan(2);
    }
  });

  it("drives part motion from the pulse, spin and flap channels, about the part's pivot", () => {
    const rig = trooperSide();
    const helm = rig.parts.find((p) => p.id === "helm")!;
    const spun: RigDef = { ...rig, id: "test.spin", parts: rig.parts.map((p) => (p === helm ? { ...p, anim: { spin: 1, pulse: 0.5 } } : p)) };
    const rest = poseRig(spun, ZERO).mats.get("helm")!;
    const turned = poseRig(spun, { ...ZERO, spin: 90 }).mats.get("helm")!;
    const grown = poseRig(spun, { ...ZERO, pulse: 1 }).mats.get("helm")!;
    expect(round(turned)).not.toEqual(round(rest));
    expect(Math.hypot(grown[0], grown[1])).toBeCloseTo(1.5 * Math.hypot(rest[0], rest[1]), 6);
  });

  it("lets limbs follow the gun bone (a bug's scythes strike with the weapon channels)", () => {
    const rig = trooperSide();
    const armF = rig.limbs.find((l) => l.id === "armF")!;
    const free: RigDef = { ...rig, id: "test.to", limbs: rig.limbs.map((l) => (l === armF ? { ...l, grip: undefined, to: "gun" as const } : l)) };
    const a = poseRig(free, ZERO).limbs.get("armF")!.end;
    const b = poseRig(free, { ...ZERO, gunX: -6 }).limbs.get("armF")!.end;
    expect(b.x).toBeLessThan(a.x - 3);
  });

  it("allows big parts a larger budget only when they say so", () => {
    const wide = (extra: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" data-part="test"${extra}><!-- SPDX-License-Identifier: GPL-3.0-or-later --><g id="anchors"><circle id="pivot" cx="10" cy="10" r="1"/></g><rect width="4" height="4" fill="${SLOT_KEYS.plate}"/></svg>`;
    expect(lintPart(wide("")).map((i) => i.rule)).toContain("budget");
    expect(lintPart(wide(` data-budget="large"`))).toEqual([]);
  });

  it("lets a faction colourway repaint the fixed slots, but never the team slot", () => {
    const s = resolveSlots(COLOURWAYS.brood!, TEAL);
    expect(s.rivet).toBe(COLOURWAYS.brood!.fixed!.rivet);
    expect(s.team).toBe("#2fb5c8");
    expect(resolveSlots(COLOURWAYS.dust!, TEAL).rivet).toBe(SLOT_KEYS.rivet);
  });

  it("hashes bake plans for the disk cache: same plan same hash, any change a new one", () => {
    const slots = resolveSlots(COLOURWAYS.dust!, TEAL);
    const a = planAtlas(trooperSide(), "token", slots);
    expect(planHash(a)).toBe(planHash(planAtlas(trooperSide(), "token", slots)));
    expect(planHash(a)).not.toBe(planHash(planAtlas(trooperSide(), "token", resolveSlots(COLOURWAYS.ash!, TEAL))));
    expect(planHash(a)).not.toBe(planHash(planAtlas(trooperSide("scatter"), "token", slots)));
  });
});

/** Representative units, one per frame type: bake plan (token tier) and key poses. */
const REPRESENTATIVE: [string, "side" | "top"][] = [
  ["swarm-mother", "side"],
  ["swarm-skitterlings", "top"],
  ["mil-bertha", "side"],
  ["mil-riders", "side"],
  ["con-skiff", "top"],
  ["con-guard", "side"],
  ["swarm-spire", "side"],
];

describe("representative units (snapshots)", () => {
  for (const [id, view] of REPRESENTATIVE)
    it(`${id} (${view}): bake plan and key poses`, () => {
      const a = artFor(id);
      expect(a, id).not.toBeNull();
      const rig = view === "side" ? a!.looks[0]!.side : a!.looks[0]!.top;
      const plan = planAtlas(rig, "token", resolveSlots(a!.colourway, TEAL));
      const clips = clipsFor(rig);
      const at = (clip: (typeof CLIP_IDS)[number], t: number) => {
        const c = channels();
        addClip(c, clips[clip], t);
        return Object.fromEntries([...poseRig(rig, c).mats].map(([k, m]) => [k, round(m)]));
      };
      expect({
        frame: rig.frame,
        plan: { w: plan.w, h: plan.h, k: plan.k, entries: plan.entries.map((e) => `${e.id} ${e.x},${e.y} ${e.w}x${e.h}`), hash: planHash(plan) },
        rest: at("idle", 0),
        step: at("step", clips.step.dur / 4),
        recoil: at("recoil", 90),
        death: at("death", clips.death.dur * 0.45),
      }).toMatchSnapshot();
    });
});
