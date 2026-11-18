import { describe, expect, it } from "vitest";
import { ABILITIES } from "../src/engine/data/abilities";
import { EFFECT_KINDS, listCostIn } from "../src/engine/data/factionValidation";
import { FACTIONS } from "../src/engine/data/factions";
import { supportSlots } from "../src/engine/data/unitClasses";
import { profileFor } from "../src/engine/profile";
import {
  ABILITY_PRICES,
  abilityValue,
  applyComputedCosts,
  EFFECT_PRICES,
  priceSupport,
  priceUnit,
  rawUnitValue,
  supportFizz,
  unpricedAbilities,
  unpricedEffects,
  upgradeCost,
  withUpgrade,
} from "../src/engine/pricing";
import type { SupportDef, UnitProfile, Weapon } from "../src/engine/types";

// Computed pricing (engine/pricing.ts) is calibrated against the built-in factions' hand-set costs,
// which are balance-tuned with AI-vs-AI sims. Run with PRICING_REPORT=1 to print the comparison.

const BUILT_INS = ["militia", "swarm", "concord"].map((id) => FACTIONS[id]!);
const buyable = BUILT_INS.flatMap((f) => f.profiles.filter((p) => !p.structure?.summonOnly));
const upgrades = buyable.flatMap((p) => p.upgrades.map((u) => ({ p, u })));
const supports = BUILT_INS.flatMap((f) =>
  f.supports.map((s) => ({ s, lookup: (id: string) => f.profiles.find((p) => p.id === id) })),
);
const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("calibration against the built-in factions", () => {
  const unitErr = buyable.map((p) => priceUnit(p).cost - p.cost);
  const supplyErr = buyable.map((p) => priceUnit(p).supply - p.supply);
  const upgradeErr = upgrades.map(({ p, u }) => upgradeCost(p, u) - u.cost);
  const fizzErr = supports.map(({ s, lookup }) => supportFizz(s, lookup) - s.fizz);

  if (env.PRICING_REPORT) {
    const rows = [
      ...buyable.map((p) => {
        const pr = priceUnit(p);
        return `${p.name.padEnd(34)} ⚙${p.cost} → ${pr.cost} (${pr.parts.total.toFixed(2)})  ◆${p.supply} → ${pr.supply}   ${pr.breakdown}`;
      }),
      ...upgrades.map(
        ({ p, u }) =>
          `  upgrade ${`${p.name}: ${u.name}`.padEnd(40)} ⚙${u.cost} → ${upgradeCost(p, u)}`,
      ),
      ...supports.map(
        ({ s, lookup }) =>
          `  support ${s.name.padEnd(28)} ✦${s.fizz} → ${priceSupport(s, lookup).breakdown}`,
      ),
      ...BUILT_INS.flatMap((f) => {
        const priced = applyComputedCosts(structuredClone(f));
        return [f.defaultList, [...f.defaultList, ...f.assaultExtras]].map(
          (list, i) =>
            `  starter ${f.name} ${i ? "Assault" : "Skirmish"}: ⚙${listCostIn(f, list)} → ${listCostIn(priced, list)}`,
        );
      }),
    ];
    const mae = (xs: number[]) => mean(xs.map(Math.abs)).toFixed(3);
    console.log(
      `${rows.join("\n")}\nMAE: units ${mae(unitErr)}, supply ${mae(supplyErr)}, upgrades ${mae(upgradeErr)}, supports ${mae(fizzErr)}`,
    );
  }

  // The weights were fitted at 0.28 (units) and 0.14 (supply), before the ability pass. The v0.11
  // balance pass took the computed Fizz for every card and the computed cost for upgrades no starter
  // list uses, but kept hand-set unit costs where the sims back them (see the comments in
  // data/factions.ts and docs/rules.md): MAE 0.38 units, 0.21 supply, 0.19 upgrades, 0 supports.
  it("lands unit costs close to the hand-set ones", () => {
    expect(mean(unitErr.map(Math.abs))).toBeLessThanOrEqual(0.4);
    expect(Math.max(...unitErr.map(Math.abs))).toBeLessThanOrEqual(1);
  });

  it("derives supply close to the hand-set one", () => {
    expect(mean(supplyErr.map(Math.abs))).toBeLessThanOrEqual(0.22);
    expect(Math.max(...supplyErr.map(Math.abs))).toBeLessThanOrEqual(1);
  });

  it("prices upgrades close to the hand-set costs", () => {
    expect(mean(upgradeErr.map(Math.abs))).toBeLessThanOrEqual(0.2);
    // None is off by more than 1. (Tunnel Claws, hand-priced at 4, was the one outlier; it left the
    // built-ins with the Munch, and the Munch template prices it like any other upgrade.)
    expect(upgradeErr.filter((e) => Math.abs(e) > 1)).toEqual([]);
  });

  it("prices support cards at the hand-set Fizz", () => {
    expect(mean(fizzErr.map(Math.abs))).toBeLessThanOrEqual(0.05);
    expect(Math.max(...fizzErr.map(Math.abs))).toBeLessThanOrEqual(1);
  });

  it("never changes the built-in factions", () => {
    const before = JSON.stringify(BUILT_INS);
    for (const p of buyable) priceUnit(p);
    for (const { p, u } of upgrades) upgradeCost(p, u);
    for (const { s, lookup } of supports) priceSupport(s, lookup);
    expect(JSON.stringify(BUILT_INS)).toBe(before);
  });
});

describe("monotonicity: more of a good thing never makes a unit cheaper", () => {
  type Bump = [string, (p: UnitProfile) => void];
  const eachWeapon = (f: (w: Weapon) => void) => (p: UnitProfile) => p.weapons.forEach(f);
  const bumps: Bump[] = [
    ["hp", (p) => (p.hp += 1)],
    ["shield", (p) => (p.shield += 1)],
    ["models", (p) => (p.models += 1)],
    ["armour", (p) => (p.armor = Math.max(2, p.armor - 1))],
    ["nerve", (p) => (p.nerve = (p.nerve ?? 7) + 1)],
    ["move", (p) => (p.move += p.structure ? 0 : 2)],
    [
      "evade",
      (p) =>
        (p.evade = p.evade
          ? { ...p.evade, target: Math.max(2, p.evade.target - 1) }
          : { target: 6, against: ["ranged"] }),
    ],
    ["dice", eachWeapon((w) => (w.dice += 1))],
    ["hit", eachWeapon((w) => (w.hit = Math.max(2, w.hit - 1)))],
    ["damage", eachWeapon((w) => (w.damage += 1))],
    ["ap", eachWeapon((w) => (w.ap += 1))],
    ["range", eachWeapon((w) => (w.range += w.melee ? 0 : 6))],
    ["precision", eachWeapon((w) => (w.precision = (w.precision ?? 0) + 1))],
    ["tracking", eachWeapon((w) => (w.tracking = (w.tracking ?? 0) + 1))],
    ["targets all", eachWeapon((w) => (w.targets = "all"))],
    ["impact dice", (p) => p.impact && (p.impact.dice += 1)],
    ["fearless", (p) => !p.keywords.includes("fearless") && p.keywords.push("fearless")],
    ["flying", (p) => !p.structure && !p.keywords.includes("flying") && p.keywords.push("flying")],
    ["jump", (p) => !p.structure && !p.keywords.includes("jump") && p.keywords.push("jump")],
    ["an ability", (p) => !p.abilities.includes("overwatch") && p.abilities.push("overwatch")],
  ];
  for (const [what, bump] of bumps) {
    it(`more ${what}`, () => {
      for (const base of buyable) {
        const more = structuredClone(base);
        bump(more);
        expect(rawUnitValue(more).total, `${base.name}: more ${what}`).toBeGreaterThanOrEqual(
          rawUnitValue(base).total - 1e-9,
        );
        expect(priceUnit(more).cost, `${base.name}: more ${what}`).toBeGreaterThanOrEqual(
          priceUnit(base).cost,
        );
      }
    });
  }

  it("bigger squads cost more at every size, through the big-squad discount", () => {
    for (const base of buyable.filter((p) => p.models > 1)) {
      let last = -Infinity;
      for (let n = 1; n <= 20; n++) {
        const v = rawUnitValue({ ...base, models: n }).total;
        expect(v, `${base.name} × ${n}`).toBeGreaterThanOrEqual(last);
        last = v;
      }
    }
  });

  it("prices every ability at zero or more", () => {
    const p = buyable[0]!;
    const ctx = rawUnitValue(p).ctx;
    for (const id of Object.keys(ABILITIES))
      expect(abilityValue(id, ctx), id).toBeGreaterThanOrEqual(0);
  });
});

describe("upgrade pricing", () => {
  it("applies upgrades the same way the engine does", () => {
    for (const { p, u } of upgrades) {
      const engine = { ...profileFor(p.id, [u.id]), cost: p.cost };
      expect(withUpgrade(p, u), `${p.name}: ${u.name}`).toEqual(engine);
    }
  });

  it("charges at least 1 for anything that helps, and nothing for an upgrade that does nothing", () => {
    for (const { p, u } of upgrades)
      expect(upgradeCost(p, u), `${p.name}: ${u.name}`).toBeGreaterThanOrEqual(1);
    const p = buyable[0]!;
    expect(upgradeCost(p, { id: "nothing", name: "Nothing", cost: 9, text: "" })).toBe(0);
  });

  it("charges more for more models", () => {
    const grunts = FACTIONS.militia!.profiles.find((p) => p.id === "mil-grunts")!;
    const two = upgradeCost(grunts, { id: "a", name: "A", cost: 0, text: "", addModels: 2 });
    const six = upgradeCost(grunts, { id: "b", name: "B", cost: 0, text: "", addModels: 6 });
    expect(six).toBeGreaterThan(two);
  });
});

describe("support pricing", () => {
  const card = (patch: Partial<SupportDef> = {}): SupportDef => ({
    id: "custom-x:card",
    name: "Card",
    faction: "custom-x",
    fizz: 0,
    cp: 1,
    blurb: "",
    abilities: [
      {
        id: "a",
        name: "A",
        text: "",
        cp: 2,
        exhaust: true,
        timing: "any",
        effect: { kind: "rangedBuff", dice: 1 },
      },
    ],
    slots: { support: 1 },
    ...patch,
  });

  it("prices a card higher for more CP per round, cheaper abilities, stronger effects and more slots", () => {
    const base = priceSupport(card());
    const raw = (s: SupportDef) => priceSupport(s).raw;
    expect(raw(card({ cp: 2 }))).toBeGreaterThan(raw(card()));
    expect(
      priceSupport(card({ abilities: [{ ...card().abilities[0]!, cp: 1 }] })).abilities[0],
    ).toBeGreaterThan(base.abilities[0]!);
    expect(
      priceSupport(
        card({ abilities: [{ ...card().abilities[0]!, effect: { kind: "rangedBuff", dice: 3 } }] }),
      ).abilities[0],
    ).toBeGreaterThan(base.abilities[0]!);
    expect(raw(card({ slots: { support: 1, base: 1 } }))).toBeGreaterThan(raw(card()));
    expect(raw(card({ slots: {} }))).toBeLessThan(raw(card()));
  });

  it("uses the built-in slot tables for built-in cards", () => {
    for (const { s } of supports)
      expect(Object.values(supportSlots(s)).reduce((a, b) => a + (b ?? 0), 0)).toBe(1);
  });

  it("prices a summon from the structure it makes", () => {
    const f = FACTIONS.swarm!;
    const tunnels = f.supports.find((s) => s.id === "swarm-chamber")!;
    const lookup = (id: string) => f.profiles.find((p) => p.id === id);
    const tougher = (id: string) => {
      const p = lookup(id);
      return p ? { ...p, hp: p.hp + 10 } : undefined;
    };
    expect(priceSupport(tunnels, tougher).abilities[0]).toBeGreaterThan(
      priceSupport(tunnels, lookup).abilities[0]!,
    );
  });
});

describe("abilities and support effects without an explicit price", () => {
  // New AbilityIds and effect kinds fall back to DEFAULT_ABILITY_PRICE / DEFAULT_EFFECT_PRICE. This test
  // passes either way but warns with the list, so whoever adds one can give it a price in engine/pricing.ts.
  it("lists them (warning only)", () => {
    const abilities = unpricedAbilities(Object.keys(ABILITIES));
    const effects = unpricedEffects(EFFECT_KINDS);
    if (abilities.length || effects.length)
      console.warn(
        `Pricing fallbacks in use. Add these to ABILITY_PRICES / EFFECT_PRICES in src/engine/pricing.ts:\n  abilities: ${abilities.join(", ") || "none"}\n  effects: ${effects.join(", ") || "none"}`,
      );
    expect(Object.keys(ABILITY_PRICES).every((id) => id in ABILITIES)).toBe(true);
    expect(
      Object.keys(EFFECT_PRICES).every((k) => (EFFECT_KINDS as readonly string[]).includes(k)),
    ).toBe(true);
  });

  it("prices unknown abilities and effects with a sensible default", () => {
    const p = structuredClone(buyable[0]!);
    const before = rawUnitValue(p).total;
    (p.abilities as string[]).push("brand-new-ability");
    expect(rawUnitValue(p).total).toBeGreaterThan(before);
    const s: SupportDef = {
      id: "x",
      name: "X",
      faction: "x",
      fizz: 0,
      cp: 1,
      blurb: "",
      abilities: [
        {
          id: "a",
          name: "A",
          text: "",
          cp: 1,
          exhaust: true,
          timing: "any",
          effect: { kind: "brand-new-effect" } as never,
        },
      ],
    };
    expect(supportFizz(s)).toBeGreaterThanOrEqual(1);
  });
});

describe("applyComputedCosts", () => {
  it("overwrites typed-in costs with computed ones", () => {
    const f = structuredClone(FACTIONS.concord!);
    for (const p of f.profiles) {
      p.cost = 0;
      p.supply = 0;
      for (const u of p.upgrades) u.cost = 0;
    }
    for (const s of f.supports) s.fizz = 0;
    applyComputedCosts(f);
    for (const p of f.profiles) {
      expect(p.cost).toBe(priceUnit(p).cost);
      expect(p.supply).toBe(priceUnit(p).supply);
      for (const u of p.upgrades) expect(u.cost).toBeGreaterThanOrEqual(1);
      if (!p.structure?.summonOnly) expect(p.cost).toBeGreaterThan(0);
    }
    for (const s of f.supports) expect(s.fizz).toBeGreaterThan(0);
  });
});
