// Properly random dice for live games. The engine stays deterministic (seeded, for tests, the
// simulator and replays); a live game gives the state a fresh seed from the browser's cryptographic
// random source after every action, so the next roll can't be known from anything that came before.
// Undo goes back to a state with the seed it already had, so undoing can't re-roll bad dice.

/** A fresh 32-bit seed from crypto.getRandomValues (Math.random only if crypto is missing). */
export function freshSeed(): number {
  try {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0]!;
  } catch {
    return Math.floor(Math.random() * 0x100000000) >>> 0;
  }
}

/** Give a state that just came out of the engine a fresh seed for its next rolls. Returns it. */
export function reseed<T extends { rng: number }>(s: T): T {
  s.rng = freshSeed();
  return s;
}
