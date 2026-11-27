import { describe, expect, it } from "vitest";
import { aiCommand } from "../src/engine/ai";
import { canonicalJson, sameSetup, setupFingerprint, stateFingerprint, syncHash, withSalt } from "../src/engine/fingerprint";
import { applyCommand, createGame, type GameSetup } from "../src/engine/game";

const SETUP: GameSetup = { factions: ["militia", "swarm"], seed: 1234, mapId: "dustbowl", orderChoice: true };

/** Two copies of the same game, played forward by the AI on one copy and replayed on the other. */
function lockstep(setup: GameSetup, steps: number) {
  let a = createGame(setup);
  let b = createGame(structuredClone(setup));
  const hashes: [string, string][] = [[syncHash(a), syncHash(b)]];
  for (let i = 0; i < steps && !a.over; i++) {
    const cmd = aiCommand(a);
    if (!cmd) break;
    const ra = applyCommand(a, cmd);
    const rb = applyCommand(b, structuredClone(cmd));
    if (!ra.ok || !rb.ok) throw new Error("illegal command in lockstep test");
    a = ra.state;
    b = rb.state;
    hashes.push([syncHash(a), syncHash(b)]);
  }
  return { a, b, hashes };
}

describe("syncHash", () => {
  it("agrees between two copies of a game played in lockstep", () => {
    const { hashes } = lockstep(SETUP, 60);
    expect(hashes.length).toBeGreaterThan(20);
    for (const [x, y] of hashes) expect(x).toBe(y);
    expect(new Set(hashes.map(([x]) => x)).size).toBeGreaterThan(10); // and moves as the game does
  }, 30000);

  it("notices any drift, even one the simulator's fingerprint ignores", () => {
    const s = createGame(SETUP);
    const t = structuredClone(s);
    expect(syncHash(t)).toBe(syncHash(s));
    t.activePlayer = s.activePlayer === 0 ? 1 : 0; // not in stateFingerprint's field list
    expect(stateFingerprint(t)).toBe(stateFingerprint(s));
    expect(syncHash(t)).not.toBe(syncHash(s));
    const u = structuredClone(s);
    u.units[0]!.models[0]!.pos.x += 1e-9;
    expect(syncHash(u)).not.toBe(syncHash(s));
    expect(syncHash(s)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("setups", () => {
  it("compare equal whatever order their keys were written in", () => {
    const reordered: GameSetup = { orderChoice: true, mapId: "dustbowl", seed: 1234, factions: ["militia", "swarm"] };
    expect(sameSetup(SETUP, reordered)).toBe(true);
    expect(setupFingerprint(SETUP)).toBe(setupFingerprint(reordered));
    expect(canonicalJson({ b: { y: 1, x: [2, { d: 1, c: 0 }] }, a: 0 })).toBe('{"a":0,"b":{"x":[2,{"c":0,"d":1}],"y":1}}');
  });

  it("differ on anything that changes the game", () => {
    expect(sameSetup(SETUP, { ...SETUP, seed: 1235 })).toBe(false);
    expect(sameSetup(SETUP, { ...SETUP, factions: ["swarm", "militia"] })).toBe(false);
    expect(sameSetup(SETUP, { ...SETUP, mapId: "scrapyard" })).toBe(false);
    expect(setupFingerprint(SETUP)).not.toBe(setupFingerprint({ ...SETUP, orderChoice: false }));
  });
});

describe("withSalt", () => {
  it("changes the dice the same way on both sides, and differently for each salt", () => {
    const a = createGame(SETUP);
    const b = createGame(SETUP);
    withSalt(a, 0xdeadbeef);
    withSalt(b, 0xdeadbeef);
    expect(a.rng).toBe(b.rng);
    const c = withSalt(createGame(SETUP), 0xdeadbef0);
    expect(c.rng).not.toBe(a.rng);
    expect(a.rng).not.toBe(createGame(SETUP).rng);
    expect(Number.isInteger(a.rng) && a.rng >= 0 && a.rng < 2 ** 32).toBe(true);
  });
});
