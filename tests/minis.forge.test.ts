// The Faction Forge on the miniature engine: the kit layer (any unit → rigs in both views), the
// per-template art hook (bound by template and unit key, surviving copies and edits), the part
// checker over every kit part, the team-tag size rule, per-part phases, and snapshots of the
// worked example (the Bulwark Brotherhood) and a generic kit unit.

import { beforeAll, describe, expect, it } from "vitest";
import { FACTIONS } from "../src/engine/data/factions";
import type { Faction, UnitProfile } from "../src/engine/types";
import { startFromTemplate, templateByKey, TEMPLATES } from "../src/forge/templates";
import { cleanFaction } from "../src/ui/customFactions";
import { planAtlas } from "../src/ui/minis/atlas";
import { planHash } from "../src/ui/minis/bake";
import { bindingOf } from "../src/ui/minis/binding";
import { addClip, channels, CLIP_IDS, clipsFor } from "../src/ui/minis/clips";
import { catalogue, cataloguedSources } from "../src/ui/minis/kits/catalogue";
import { kitSamples } from "../src/rigLabSamples";
import { kitSpec } from "../src/ui/minis/kits/spec";
import { lintPart, lintRig, lintTagArea, pathArea, TAG_AREA, tagShare } from "../src/ui/minis/lint";
import { poseRig, ZERO } from "../src/ui/minis/pose";
import { artFor, bindingFor, loadAllArt, riggedProfiles, rigsFor, TEMPLATE_ART_KEYS } from "../src/ui/minis/registry";
import { resolveSlots, SLOT_KEYS } from "../src/ui/minis/slots";
import type { Mat, RigDef } from "../src/ui/minis/types";

const TEAL = 0x2fb5c8;
const round = (m: Mat) => m.map((v) => Math.round(v * 100) / 100);
/** A tiny real PNG header as an image data URL (art validation checks the magic number only). */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

beforeAll(() => loadAllArt(), 60000);

const tplProfiles = (): UnitProfile[] => TEMPLATES.flatMap((t) => t.faction.profiles);
const looksOf = (p: UnitProfile, f?: { color: number; look: Faction["look"] }): RigDef[] => artFor(p, f)!.looks.flatMap((l) => [l.side, l.top]);

describe("kit layer: every Forge unit on the new engine", () => {
  it("draws every template unit in both views (nothing left to Classic)", () => {
    const missing = tplProfiles().filter((p) => {
      const r = rigsFor(p);
      return !r || r.side.view !== "side" || r.top.view !== "top";
    });
    expect(missing.map((p) => p.id)).toEqual([]);
  });

  it("passes the part checker for every template rig, including the team-tag size rule", () => {
    for (const p of tplProfiles()) for (const rig of looksOf(p)) expect(lintRig(rig), `${p.id} ${rig.id}`).toEqual([]);
  });

  it("draws every kit sample (every frame, recipes, stat-only units, a picture) and lints it", () => {
    const samples = kitSamples();
    expect(samples.length).toBeGreaterThan(18);
    for (const s of samples) for (const rig of looksOf(s.profile, s.faction)) expect(lintRig(rig), `${s.profile.name} ${rig.id}`).toEqual([]);
  });

  it("poses every template and sample rig through all six clips without NaNs", () => {
    const rigs = [...tplProfiles().flatMap((p) => looksOf(p)), ...kitSamples().flatMap((s) => looksOf(s.profile, s.faction))];
    for (const rig of rigs) {
      const clips = clipsFor(rig);
      for (const id of CLIP_IDS)
        for (let t = 0; t <= clips[id].dur; t += clips[id].dur / 4) {
          const c = channels();
          addClip(c, clips[id], t);
          if (id === "bob") c.lift = 100;
          for (const m of poseRig(rig, c).mats.values()) expect(m.every(Number.isFinite), `${rig.id} ${id}`).toBe(true);
        }
    }
  });

  it("gives different drawings different rig ids (baked pages never collide)", () => {
    const seen = new Map<string, string>();
    for (const p of [...tplProfiles(), ...kitSamples().map((s) => s.profile)])
      for (const rig of looksOf(p, kitSamples().find((s) => s.profile.id === p.id)?.faction)) {
        const key = JSON.stringify(rig.parts.map((x) => [x.id, x.src.length, x.place, x.bone])) + JSON.stringify(rig.limbs);
        const other = seen.get(rig.id);
        if (other) expect(other, rig.id).toBe(key);
        seen.set(rig.id, key);
      }
  });

  it("varies squads: a leader and two stances for four or more, two for a pair, one for a lone model", () => {
    const sq = kitSamples().find((s) => s.profile.models >= 4 && s.profile.art?.kind === "parts" && s.profile.art.recipe.body === "trooper")!;
    const a = artFor(sq.profile, sq.faction)!;
    expect(a.looks).toHaveLength(3);
    expect([0, 1, 2, 3, 4].map((i) => a.pick!(i))).toEqual([0, 1, 2, 1, 2]);
    const lone = kitSamples().find((s) => s.profile.models === 1 && !s.profile.structure)!;
    expect(artFor(lone.profile, lone.faction)!.looks).toHaveLength(1);
  });

  it("paints kit units in their faction's colour, the team colour only in the tag", () => {
    const s = kitSamples()[0]!;
    const a = artFor(s.profile, s.faction)!;
    expect(a.colourway.plate).toBe("#2f7fb8");
    const other = artFor(s.profile, { color: 0x8a3a3a, look: "plain" })!;
    expect(other.colourway.plate).not.toBe(a.colourway.plate);
    const svg = planAtlas(a.looks[0]!.side, "token", resolveSlots(a.colourway, TEAL)).svg;
    expect(svg).not.toContain(SLOT_KEYS.team);
    expect(svg).toContain("#2fb5c8");
  });

  it("classifies units without a recipe from their keywords and stats", () => {
    const f = { color: 0x336699, look: "plain" as const };
    const base = { ...FACTIONS.militia!.profiles[0]!, art: undefined };
    expect(kitSpec({ ...base, keywords: ["structure"], structure: { lifetime: "permanent" } }, f).body).toBe("structure");
    expect(kitSpec({ ...base, keywords: ["flying", "mech"] }, f).body).toBe("flyer");
    expect(kitSpec({ ...base, keywords: ["monster"] }, f).body).toBe("brute");
    expect(kitSpec({ ...base, keywords: ["monster", "mech"] }, f).body).toBe("walker");
    expect(kitSpec({ ...base, keywords: ["beast"], baseRadius: 0.5 }, f).body).toBe("critter");
    expect(kitSpec({ ...base, keywords: ["infantry", "jump"] }, f).back).toBe("jets");
  });

  it("draws an uploaded picture as a standee, the picture baked in by the baker (never as SVG)", () => {
    const p: UnitProfile = { ...FACTIONS.militia!.profiles[0]!, id: "custom-x:pic", faction: "custom-x", art: { kind: "image", dataUrl: PNG } };
    const r = rigsFor(p, 0, { color: 0x336699, look: "plain" })!;
    expect(r.side.fixed).toBe(true);
    const coin = r.side.parts.find((x) => x.image)!;
    expect(coin.image!.href).toBe(PNG);
    const plan = planAtlas(r.side, "token", resolveSlots(r.colourway, TEAL));
    expect(plan.images).toHaveLength(1);
    expect(plan.svg).not.toContain("base64");
    expect(lintRig(r.side)).toEqual([]);
  });
});

describe("template art: bound by template and unit key", () => {
  const bulwark = () => templateByKey("bulwark")!;

  it("finds template art by folder, with no shared list (the Bulwark Brotherhood is the worked example)", () => {
    expect(TEMPLATE_ART_KEYS).toContain("bulwark");
    for (const p of bulwark().faction.profiles) {
      const r = rigsFor(p)!;
      expect(r.side.id, p.id).toMatch(/^forge\.bulwark\./);
      expect(r.top.id, p.id).toMatch(/^forge\.bulwark\./);
    }
  });

  it("keeps a template's art when the faction is started, copied, saved and reloaded, or re-statted", () => {
    const started = startFromTemplate(bulwark(), "My Vault Monks");
    const brothers = started.profiles.find((p) => p.id.endsWith(":brothers"))!;
    expect(started.id).not.toContain("tpl");
    expect(bindingOf(brothers)).toEqual({ kind: "template", template: "bulwark", unit: "brothers" });
    const reloaded = cleanFaction(JSON.parse(JSON.stringify(started)));
    const again = reloaded.profiles.find((p) => p.id.endsWith(":brothers"))!;
    expect(bindingOf(again)).toEqual({ kind: "template", template: "bulwark", unit: "brothers" });
    const edited = { ...again, name: "Renamed", hp: 5, models: 6 };
    expect(rigsFor(edited, 0, { color: 0x993333, look: "plain" })!.side.id).toMatch(/^forge\.bulwark\.brothers/);
  });

  it("recognises factions started before the tag existed by unit key and recipe", () => {
    const started = startFromTemplate(bulwark());
    const p = { ...started.profiles.find((x) => x.id.endsWith(":marksman"))! } as UnitProfile & { rigTag?: string };
    delete p.rigTag;
    expect(bindingFor(p)).toEqual({ kind: "template", template: "bulwark", unit: "marksman" });
    // a rebuilt miniature (different recipe, no tag) falls to the generic kit
    const rebuilt = { ...p, art: { kind: "parts" as const, recipe: { ...(p.art as { recipe: object } & { kind: "parts" }).recipe, head: "beard" as const } } };
    expect(bindingFor(rebuilt as UnitProfile)).toEqual({ kind: "kit" });
  });

  it("paints the template's colourway from the faction colour", () => {
    const p = bulwark().faction.profiles[0]!;
    const blue = artFor(p)!;
    const red = artFor(p, { color: 0xa83a2f, look: "plain" })!;
    expect(blue.colourway.id).toMatch(/^bulwark-/);
    expect(red.colourway.plate).not.toBe(blue.colourway.plate);
    expect(red.colourway.leather).toBe(blue.colourway.leather);
  });

  it("leaves the base factions bound by profile id, unchanged", () => {
    expect(bindingFor(FACTIONS.militia!.profiles[0]!).kind).toBe("base");
    expect(riggedProfiles()).toContain("mil-grunts");
  });
});

describe("part checker", () => {
  it("lints every catalogued kit part", () => {
    for (const { name, src } of cataloguedSources()) expect(lintPart(src, name), name).toEqual([]);
    const slots = new Set(catalogue().map((e) => e.slot));
    for (const s of ["torso", "head", "gear", "back", "weapon", "offhand"]) expect(slots.has(s as never), s).toBe(true);
  });

  it("measures path areas (shoelace through the command endpoints)", () => {
    expect(pathArea("M0,0 L10,0 L10,10 L0,10 Z")).toBeCloseTo(100, 6);
    expect(pathArea("M0,0 h10 v10 h-10 Z")).toBeCloseTo(100, 6);
    expect(pathArea("M0,0 L10,0 L10,10 Z M20,0 L30,0 L30,10 L20,10 Z")).toBeCloseTo(150, 6);
  });

  it("refuses a team tag too small to read or so big the figure is a team blob", () => {
    const rig = rigsFor(TEMPLATES[0]!.faction.profiles[0]!)!.side;
    const tagged = rig.parts.find((p) => p.src.includes('class="tag"'))!;
    const small = tagged.src.replace(/class="tag"/g, 'class="tag" transform="scale(0.1)"');
    // shrink the tag shapes by rewriting them into a tiny square
    const tiny = tagged.src.replace(/(<path class="tag" d=")[^"]*"/g, '$1M0,0 h3 v3 h-3 Z"');
    const bad = { ...rig, parts: rig.parts.map((p) => (p === tagged ? { ...p, src: tiny } : p)) };
    expect(lintTagArea(bad).map((i) => i.rule)).toContain("team");
    expect(small).toBeTruthy();
    const huge = tagged.src.replace(/(<path class="tag" d=")[^"]*"/, '$1M-200,-200 h400 v400 h-400 Z"');
    expect(lintTagArea({ ...rig, parts: rig.parts.map((p) => (p === tagged ? { ...p, src: huge } : p)) }).map((i) => i.msg).join()).toMatch(/too big/);
  });

  it("lists the base-faction figures that predate the tag rule (known gaps: their art is not changed here)", async () => {
    const base = ["militia", "swarm", "concord"].flatMap((f) => FACTIONS[f]!.profiles).flatMap((p) => artFor(p)!.looks.flatMap((l) => [l.side, l.top]));
    const short = [...new Set(base.filter((r) => lintTagArea(r).length).map((r) => r.id))].sort();
    expect(short.every((id) => id.startsWith("concord.") || id.startsWith("militia.") || id.startsWith("swarm."))).toBe(true);
    expect(short).toMatchSnapshot();
    expect(TAG_AREA.minU2).toBe(80);
    expect(tagShare(base[0]!)).toBeGreaterThan(0);
  });
});

describe("per-part phase offsets", () => {
  it("gives a phased part its own pulse, spin and flap; parts without a phase stay in step", () => {
    const p = TEMPLATES.find((t) => t.key === "bulwark")!.faction.profiles.find((x) => x.id.endsWith(":gunship"))!;
    const rig = rigsFor(p)!.side;
    const shifted = { pulse: -1, spin: 0, flap: 0 };
    const plain = poseRig(rig, { ...ZERO, pulse: 1 });
    const phased = poseRig(rig, { ...ZERO, pulse: 1 }, undefined, () => shifted);
    expect(round(phased.mats.get("bell-near")!)).not.toEqual(round(plain.mats.get("bell-near")!));
    expect(round(phased.mats.get("pod") ?? phased.mats.get(rig.parts[0]!.id)!)).toEqual(round(plain.mats.get("pod") ?? plain.mats.get(rig.parts[0]!.id)!));
  });
});

describe("grimdark templates: their own art for every unit", () => {
  const GRIMDARK_ART = ["regiment", "mob", "kin", "legion", "cult"];

  it("draws every unit of the five templates with the template's own art, in both views, summon-only ones too", () => {
    for (const key of GRIMDARK_ART) {
      expect(TEMPLATE_ART_KEYS, key).toContain(key);
      for (const p of templateByKey(key)!.faction.profiles)
        for (const l of artFor(p)!.looks) {
          expect(l.side.id, p.id).toMatch(new RegExp(`^forge\\.${key}\\.`));
          expect(l.top.id, p.id).toMatch(new RegExp(`^forge\\.${key}\\.`));
        }
    }
    expect(artFor(templateByKey("cult")!.faction.profiles.find((p) => p.id.endsWith(":rift"))!)!.looks[0]!.side.frame).toBe("structure");
  });

  it("varies the big squads and keeps three looks at most", () => {
    for (const key of GRIMDARK_ART)
      for (const p of templateByKey(key)!.faction.profiles) {
        const a = artFor(p)!;
        expect(a.looks.length, p.id).toBeLessThanOrEqual(3);
        if (p.models >= 4 && !p.structure) expect(a.looks.length, p.id).toBeGreaterThan(1);
      }
  });

  it("paints each template's colourway from the faction colour", () => {
    for (const key of GRIMDARK_ART) {
      const p = templateByKey(key)!.faction.profiles[0]!;
      const own = artFor(p)!;
      const other = artFor(p, { color: 0x3a5fa8, look: templateByKey(key)!.faction.look })!;
      expect(other.colourway.plate, key).not.toBe(own.colourway.plate);
    }
  });
});

describe("fantasy templates: their own art for every unit", () => {
  const FANTASY_ART = ["elves", "orcs", "undead", "dwarves", "knights", "druids"];

  it("draws every unit of the six templates with the template's own art, in both views, summon-only ones too", () => {
    for (const key of FANTASY_ART) {
      expect(TEMPLATE_ART_KEYS, key).toContain(key);
      for (const p of templateByKey(key)!.faction.profiles)
        for (const l of artFor(p)!.looks) {
          expect(l.side.id, p.id).toMatch(new RegExp(`^forge\\.${key}\\.`));
          expect(l.top.id, p.id).toMatch(new RegExp(`^forge\\.${key}\\.`));
        }
    }
    const roots = templateByKey("druids")!.faction.profiles.find((p) => p.id.endsWith(":roots"))!;
    expect(roots.structure?.summonOnly).toBe(true);
    expect(artFor(roots)!.looks[0]!.side.frame).toBe("structure");
  });

  it("varies the big squads and keeps three looks at most", () => {
    for (const key of FANTASY_ART)
      for (const p of templateByKey(key)!.faction.profiles) {
        const a = artFor(p)!;
        expect(a.looks.length, p.id).toBeLessThanOrEqual(3);
        if (p.models >= 4 && !p.structure) expect(a.looks.length, p.id).toBeGreaterThan(1);
      }
  });

  it("paints each template's colourway from the faction colour", () => {
    for (const key of FANTASY_ART) {
      const p = templateByKey(key)!.faction.profiles[0]!;
      const own = artFor(p)!;
      const other = artFor(p, { color: 0xa83a2f, look: templateByKey(key)!.faction.look })!;
      expect(other.colourway.plate, key).not.toBe(own.colourway.plate);
    }
  });
});

describe("the Munch: Dustline veterans with their own art for every unit", () => {
  const munch = () => templateByKey("munch")!;
  const unit = (u: string) => munch().faction.profiles.find((p) => p.id.endsWith(`:${u}`))!;

  it("draws all twelve units with the template's own art, in both views, summon-only burrows too", () => {
    expect(TEMPLATE_ART_KEYS).toContain("munch");
    expect(munch().faction.profiles).toHaveLength(12);
    for (const p of munch().faction.profiles)
      for (const l of artFor(p)!.looks) {
        expect(l.side.id, p.id).toMatch(/^forge\.munch\./);
        expect(l.top.id, p.id).toMatch(/^forge\.munch\./);
      }
    for (const u of ["hole", "pit"]) {
      expect(unit(u).structure?.summonOnly, u).toBe(true);
      expect(artFor(unit(u))!.looks[0]!.side.frame, u).toBe("structure");
    }
    expect(artFor(unit("buzz"))!.looks[0]!.side.frame).toBe("hover");
  });

  it("varies the squads and keeps three looks at most", () => {
    for (const p of munch().faction.profiles) {
      const a = artFor(p)!;
      expect(a.looks.length, p.id).toBeLessThanOrEqual(3);
      if (p.models >= 2 && !p.structure) expect(a.looks.length, p.id).toBeGreaterThan(1);
    }
  });

  it("keeps each critter's coat and paints the mutagen in the faction colour", () => {
    const fox = artFor(unit("hoppers"))!;
    const skunk = artFor(unit("lobber"))!;
    expect(fox.colourway.plate).not.toBe(skunk.colourway.plate);
    expect(fox.colourway.leather).toBe(skunk.colourway.leather);
    const purple = artFor(unit("hoppers"), { color: 0x8a3ac8, look: munch().faction.look })!;
    expect(purple.colourway.leather).not.toBe(fox.colourway.leather);
    expect(purple.colourway.plate).not.toBe(fox.colourway.plate);
  });
});

describe("snapshots: the worked example and a generic kit unit", () => {
  const cases: [string, () => { rig: RigDef; cw: ReturnType<typeof artFor> }][] = [
    ["bulwark brothers (side, sergeant)", () => ({ rig: artFor(templateByKey("bulwark")!.faction.profiles[0]!)!.looks[0]!.side, cw: artFor(templateByKey("bulwark")!.faction.profiles[0]!) })],
    ["bulwark ironsides (top)", () => {
      const p = templateByKey("bulwark")!.faction.profiles.find((x) => x.id.endsWith(":ironsides"))!;
      return { rig: artFor(p)!.looks[0]!.top, cw: artFor(p) };
    }],
    ["kit visored line (side)", () => {
      const s = kitSamples()[0]!;
      return { rig: artFor(s.profile, s.faction)!.looks[1]!.side, cw: artFor(s.profile, s.faction) };
    }],
    // the grimdark templates: a squad leader (side) and a big unit (top) each
    ...(
      [
        ["regiment", "troopers", "tank"],
        ["mob", "gang", "giant"],
        ["kin", "wardens", "colossus"],
        ["legion", "clankers", "crusher"],
        ["cult", "zealots", "idol"],
        // the fantasy templates, the same way
        ["elves", "archers", "spire"],
        ["orcs", "grunts", "troll"],
        ["undead", "bones", "colossus"],
        ["dwarves", "shieldbeards", "cannon"],
        ["knights", "menatarms", "knights"],
        ["druids", "wardens", "oakheart"],
        // the Munch: the beetle pack leader and Dr. Graft on Big Mama
        ["munch", "nibblers", "mama"],
      ] as const
    ).flatMap(([key, squad, big]): [string, () => { rig: RigDef; cw: ReturnType<typeof artFor> }][] => {
      const unit = (u: string) => templateByKey(key)!.faction.profiles.find((x) => x.id.endsWith(`:${u}`))!;
      return [
        [`${key} ${squad} (side, leader)`, () => ({ rig: artFor(unit(squad))!.looks[0]!.side, cw: artFor(unit(squad)) })],
        [`${key} ${big} (top)`, () => ({ rig: artFor(unit(big))!.looks[0]!.top, cw: artFor(unit(big)) })],
      ];
    }),
  ];
  for (const [name, get] of cases)
    it(name, () => {
      const { rig, cw } = get();
      const plan = planAtlas(rig, "token", resolveSlots(cw!.colourway, TEAL));
      const clips = clipsFor(rig);
      const at = (clip: (typeof CLIP_IDS)[number], t: number) => {
        const c = channels();
        addClip(c, clips[clip], t);
        return Object.fromEntries([...poseRig(rig, c).mats].map(([k, m]) => [k, round(m)]));
      };
      expect({ id: rig.id, frame: rig.frame, height: rig.height, plan: { w: plan.w, h: plan.h, entries: plan.entries.length, hash: planHash(plan) }, rest: at("idle", 0), step: at("step", clips.step.dur / 4) }).toMatchSnapshot();
    });
});
