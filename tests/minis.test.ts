import { describe, expect, it } from "vitest";
import { planAtlas, tierFor, TIER_ORDER } from "../src/ui/minis/atlas";
import { addClip, CLIPS, CLIP_IDS, channels, sampleTrack, statusPose } from "../src/ui/minis/clips";
import { hexToOklch, parseHex, shadeOf } from "../src/ui/minis/color";
import { lintPart, lintRig } from "../src/ui/minis/lint";
import { apply, limbRest, poseRig, solveIk, ZERO } from "../src/ui/minis/pose";
import { rigsFor, RIGGED_PROFILES } from "../src/ui/minis/registry";
import { trooperSide, trooperTop } from "../src/ui/minis/rigs/militiaTrooper";
import { loadMiniStyle, saveMiniStyle } from "../src/ui/minis/settings";
import { COLOURWAYS, resolveSlots, SLOT_KEYS } from "../src/ui/minis/slots";
import { readPart } from "../src/ui/minis/svg";
import type { Channels, Mat, RigDef } from "../src/ui/minis/types";

const RIGS: RigDef[] = [trooperSide("rifle"), trooperSide("scatter"), trooperTop("rifle"), trooperTop("scatter")];
const TEAL = 0x2fb5c8;
const round = (m: Mat) => m.map((v) => Math.round(v * 100) / 100);

describe("rig-lint", () => {
  it("passes every part and rig of the reference unit", () => {
    for (const rig of RIGS) expect(lintRig(rig), rig.id).toEqual([]);
  });

  const ok = (body: string, extra = "") =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" data-part="test"${extra}><!-- SPDX-License-Identifier: GPL-3.0-or-later --><g id="anchors"><circle id="pivot" cx="10" cy="10" r="1"/></g>${body}</svg>`;

  it("accepts a clean part", () => {
    expect(lintPart(ok(`<path d="M0,0 L10,10" fill="${SLOT_KEYS.plate}" stroke="${SLOT_KEYS.ink}" stroke-width="2.4"/>`))).toEqual([]);
  });

  it("refuses colours outside the slot swatches", () => {
    const issues = lintPart(ok(`<rect width="4" height="4" fill="#123456"/>`));
    expect(issues.map((i) => i.rule)).toContain("colour");
    expect(lintPart(ok(`<rect width="4" height="4" style="fill:#9a8458"/>`)).map((i) => i.rule)).toContain("colour");
  });

  it("refuses ink weights the engine doesn't hold, and detail ink outside the detail layer", () => {
    expect(lintPart(ok(`<path d="M0,0 L9,9" stroke="${SLOT_KEYS.ink}" stroke-width="3"/>`)).map((i) => i.rule)).toEqual(["stroke"]);
    expect(lintPart(ok(`<path d="M0,0 L9,9" stroke="${SLOT_KEYS.ink}" stroke-width="1"/>`)).map((i) => i.rule)).toEqual(["stroke"]);
    expect(lintPart(ok(`<path class="detail" d="M0,0 L9,9" stroke="${SLOT_KEYS.ink}" stroke-width="1"/>`))).toEqual([]);
  });

  it("keeps team colour in the tag layer", () => {
    expect(lintPart(ok(`<rect width="4" height="4" fill="${SLOT_KEYS.team}"/>`)).map((i) => i.rule)).toEqual(["team"]);
    expect(lintPart(ok(`<rect class="tag" width="4" height="4" fill="${SLOT_KEYS.team}"/>`))).toEqual([]);
  });

  it("checks anchors, the licence, elements and the size budget", () => {
    expect(lintPart(ok(""), "p", { anchors: ["g1"] }).map((i) => i.msg)).toEqual([`missing anchor "g1"`]);
    expect(lintPart(ok("").replace(/<!--.*?-->/, "")).map((i) => i.rule)).toEqual(["licence"]);
    expect(lintPart(ok(`<image href="x.png"/>`)).map((i) => i.rule)).toContain("element");
    expect(lintPart(ok(`<text>D7</text>`)).map((i) => i.rule)).toContain("element");
    const big = Array.from({ length: 60 }, (_, i) => `<circle cx="${i % 20}" cy="5" r="1" fill="${SLOT_KEYS.rivet}"/>`).join("");
    expect(lintPart(ok(big)).map((i) => i.rule)).toContain("budget");
  });

  it("finds a second team tag on one figure", () => {
    const rig = trooperSide();
    const twoTags = { ...rig, parts: rig.parts.map((p) => (p.id === "pad-back" ? { ...p, src: p.src.replace('fill="#9a8458"', `class="tag" fill="${SLOT_KEYS.team}"`) } : p)) };
    expect(lintRig(twoTags).some((i) => i.rule === "team" && /2 parts/.test(i.msg))).toBe(true);
  });
});

describe("colour slots", () => {
  it("derives shades in OKLCH close to the canvas's hand-picked ones", () => {
    const pairs: [string, string][] = [
      ["#9a8458", "#6c5a37"],
      ["#8d9296", "#5f6468"],
      ["#7f8a55", "#586138"],
      ["#5a6070", "#3b3f4d"],
      ["#5d5b45", "#44432f"],
      ["#6b5a43", "#4d3f2e"],
    ];
    for (const [base, want] of pairs) {
      const got = parseHex(shadeOf(base));
      const exp = parseHex(want);
      for (let i = 0; i < 3; i++) expect(Math.abs(got[i]! - exp[i]!), `${base} → ${shadeOf(base)} vs ${want}`).toBeLessThanOrEqual(10);
      expect(hexToOklch(shadeOf(base)).l).toBeLessThan(hexToOklch(base).l);
    }
  });

  it("keeps the team colour in its own slot, never in the faction's", () => {
    for (const cw of Object.values(COLOURWAYS)) {
      const s = resolveSlots(cw, TEAL);
      expect(s.team).toBe("#2fb5c8");
      expect(s.plate).toBe(cw.plate);
      expect(Object.entries(s).filter(([k, v]) => v === "#2fb5c8" && k !== "team")).toEqual([]);
    }
  });

  it("swaps every key colour out of the baked SVG", () => {
    const slots = resolveSlots(COLOURWAYS.ash!, 0xf0565b);
    const plan = planAtlas(trooperSide(), "sheet", slots);
    expect(plan.svg).not.toContain(SLOT_KEYS.team);
    expect(plan.svg).toContain("#f0565b");
    expect(plan.svg).toContain(COLOURWAYS.ash!.plate);
    expect(plan.svg).not.toContain(SLOT_KEYS.plate);
  });
});

describe("ink limbs and posing", () => {
  it("solves two-bone IK to the target and keeps bone lengths", () => {
    const ik = solveIk({ x: 0, y: 0 }, { x: 10, y: 5 }, 8, 7, 1);
    expect(Math.hypot(ik.joint.x, ik.joint.y)).toBeCloseTo(8, 6);
    expect(Math.hypot(ik.end.x - ik.joint.x, ik.end.y - ik.joint.y)).toBeCloseTo(7, 6);
    expect(ik.end.x).toBeCloseTo(10, 6);
    expect(ik.end.y).toBeCloseTo(5, 6);
    // out of reach: the limb straightens towards the target
    const far = solveIk({ x: 0, y: 0 }, { x: 100, y: 0 }, 8, 7, 1);
    expect(far.end.x).toBeCloseTo(15, 2);
  });

  it("reproduces the authored rest pose: elbows and knees where they were drawn", () => {
    // (the rest pose is drawn round the rifle; other weapons move the hands, so the arms re-solve)
    for (const rig of [trooperSide("rifle"), trooperTop("rifle")]) {
      const pose = poseRig(rig, ZERO);
      for (const l of rig.limbs) {
        const p = pose.limbs.get(l.id)!;
        expect(Math.hypot(p.joint.x - l.joint.x, p.joint.y - l.joint.y), `${rig.id} ${l.id}`).toBeLessThan(0.6);
      }
    }
  });

  it("puts the hands on the weapon's grips whatever the weapon (the arms re-solve)", () => {
    for (const rig of RIGS) {
      const wpn = rig.parts.find((p) => p.id === rig.weapon)!;
      const grips = readPart(wpn.src).anchors;
      const c: Channels = { ...ZERO, kick: 1, torsoRot: 5, gunY: 2 };
      const pose = poseRig(rig, c);
      for (const l of rig.limbs.filter((x) => x.grip)) {
        const hand = pose.limbs.get(l.id)!.end;
        const grip = apply(pose.mats.get(rig.weapon)!, grips[l.grip!]!);
        const rest = limbRest(l);
        // within reach the hand is exactly on the grip (pose.limbs is in frame coords, mats in rig space)
        const g = { x: grip.x + rig.origin.x, y: grip.y + rig.origin.y };
        if (Math.hypot(g.x - pose.limbs.get(l.id)!.root.x, g.y - pose.limbs.get(l.id)!.root.y) < rest.l1 + rest.l2 - 0.01)
          expect(Math.hypot(hand.x - g.x, hand.y - g.y), `${rig.id} ${l.id}`).toBeLessThan(0.01);
      }
    }
  });

  it("plays all six clips on both views without NaNs, and loops wrap", () => {
    for (const view of ["side", "top"] as const) {
      const rig = view === "side" ? trooperSide() : trooperTop();
      for (const id of CLIP_IDS) {
        const clip = CLIPS[view][id];
        for (let t = 0; t <= clip.dur; t += clip.dur / 7) {
          const c = channels();
          addClip(c, clip, t);
          for (const m of poseRig(rig, c).mats.values()) expect(m.every(Number.isFinite), `${view} ${id} ${t}`).toBe(true);
        }
        if (clip.loop) {
          const a = channels();
          const b = channels();
          addClip(a, clip, 100);
          addClip(b, clip, 100 + clip.dur * 3);
          expect(a).toEqual(b);
        }
      }
    }
    expect(sampleTrack([[0, 0], [100, 10, "linear"]], 50)).toBe(5);
  });

  it("changes pose, not just tint, for status", () => {
    expect(statusPose("side", { hp: 1, hpMax: 2, engaged: false, shaken: false }).torsoRot).toBeLessThan(0);
    expect(statusPose("side", { hp: 1, hpMax: 1, engaged: false, shaken: true }).drain).toBeGreaterThan(0);
    expect(statusPose("top", { hp: 1, hpMax: 1, engaged: false, shaken: true }).yaw).toBeGreaterThan(90);
    expect(statusPose("side", { hp: 1, hpMax: 1, engaged: true, shaken: false }).gaitW).toBe(1);
  });

  it("matches the snapshot of the reference trooper's key poses", () => {
    const side = trooperSide();
    const at = (id: (typeof CLIP_IDS)[number], t: number) => {
      const c = channels();
      addClip(c, CLIPS.side[id], t);
      const p = poseRig(side, c);
      return Object.fromEntries([...p.mats].map(([k, m]) => [k, round(m)]));
    };
    expect({ rest: at("idle", 0), stride: at("step", 0), pass: at("step", 140), kick: at("recoil", 70), topple: at("death", 400) }).toMatchSnapshot();
  });
});

describe("baker plan and zoom tiers", () => {
  it("picks tiers by on-screen size, with hysteresis", () => {
    expect(tierFor(0.1)).toBe("tiny");
    expect(tierFor(0.4)).toBe("token");
    expect(tierFor(1.2)).toBe("sheet");
    expect(tierFor(0.64, "token")).toBe("token");
    expect(tierFor(0.7, "token")).toBe("sheet");
    expect(tierFor(0.6, "sheet")).toBe("sheet");
    expect(tierFor(0.5, "sheet")).toBe("token");
  });

  it("drops shade and detail layers as the tiers shrink", () => {
    const slots = resolveSlots(COLOURWAYS.dust!, TEAL);
    const sizes = TIER_ORDER.map((t) => planAtlas(trooperSide(), t, slots).svg.length);
    expect(sizes[0]!).toBeLessThan(sizes[1]!);
    expect(sizes[1]!).toBeLessThan(sizes[2]!);
    const tiny = planAtlas(trooperSide(), "tiny", slots).svg;
    expect(tiny).not.toContain(SLOT_KEYS.rivet); // rivets are detail
    expect(tiny).toContain("#2fb5c8"); // the team tag survives every tier
  });

  it("packs every drawable without overlaps", () => {
    const slots = resolveSlots(COLOURWAYS.dust!, TEAL);
    for (const rig of RIGS)
      for (const t of TIER_ORDER) {
        const plan = planAtlas(rig, t, slots, 2);
        expect(plan.entries.length).toBe(rig.parts.length + rig.limbs.length * 2);
        for (const a of plan.entries) {
          expect(a.x + a.w).toBeLessThanOrEqual(plan.w);
          expect(a.y + a.h).toBeLessThanOrEqual(plan.h);
          for (const b of plan.entries) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
        }
        expect(plan.w * 2 * plan.h).toBeLessThan(2048 * 2048);
      }
  });

  it("bakes the reference unit deterministically at three zooms (snapshot)", () => {
    const slots = resolveSlots(COLOURWAYS.dust!, TEAL);
    for (const rig of [trooperSide(), trooperTop()])
      for (const t of TIER_ORDER) {
        const plan = planAtlas(rig, t, slots);
        expect({ w: plan.w, h: plan.h, k: plan.k, sil: plan.sil, entries: plan.entries, svg: plan.svg }).toMatchSnapshot(`${rig.id} ${t}`);
      }
  });
});

describe("registry and the Miniatures setting", () => {
  it("binds the Militia line squad by profile id, in both views", () => {
    expect(RIGGED_PROFILES).toContain("mil-grunts");
    expect(rigsFor("mil-grunts")?.side.view).toBe("side");
    expect(rigsFor("mil-grunts")?.top.view).toBe("top");
    expect(rigsFor("mil-bertha")).toBeNull();
  });

  it("defaults to Classic and persists the choice", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(loadMiniStyle(store)).toBe("classic");
    saveMiniStyle("overhead", store);
    expect(loadMiniStyle(store)).toBe("overhead");
    mem.set([...mem.keys()][0]!, "nonsense");
    expect(loadMiniStyle(store)).toBe("classic");
    expect(loadMiniStyle(null)).toBe("classic");
  });
});
