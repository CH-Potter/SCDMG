// Small seeded RNG for the music generator (mulberry32). Pure: no DOM, no Web Audio.

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)]!;
  }
  /** Pick from [value, weight] pairs. */
  weighted<T>(xs: readonly (readonly [T, number])[]): T {
    const total = xs.reduce((s, x) => s + x[1], 0);
    let r = this.next() * total;
    for (const [v, w] of xs) {
      r -= w;
      if (r < 0) return v;
    }
    return xs[xs.length - 1]![0];
  }
  /** A child stream, so one part of the song doesn't shift another's randomness. */
  fork(salt: number): Rng {
    return new Rng((Math.imul(this.s ^ salt, 0x85ebca6b) + salt * 0x27d4eb2f) >>> 0);
  }
}

/** Hash a few numbers into a 32-bit seed. */
export function mixSeed(...xs: number[]): number {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h ^= Math.floor(x) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
}
