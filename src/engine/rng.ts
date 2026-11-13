// Seeded PRNG (mulberry32). The seed lives in GameState so games are replayable
// and the AI can reason about the engine without hidden randomness.

export function nextRandom(seed: number): [value: number, nextSeed: number] {
  const t = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

export function rollD6(state: { rng: number }): number {
  const [value, next] = nextRandom(state.rng);
  state.rng = next;
  return 1 + Math.floor(value * 6);
}
