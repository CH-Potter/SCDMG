// A map keyed by a list of numbers, for the engine's memo caches. Building string keys out of
// coordinates (number-to-text conversion, then hashing long strings) cost as much as some of the
// work the caches save. Keys are compared exactly, number by number, so a hit is always the same
// input; numbers that are equal but differently signed (0 and -0) just miss.

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/** Hash of the first `n` numbers of `key` (FNV-1a over their bits). */
function hashNums(key: Float64Array, n: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < n; i++) {
    f64[0] = key[i]!;
    h = Math.imul(h ^ u32[0]!, 0x01000193);
    h = Math.imul(h ^ u32[1]!, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Build a key in `scratch` (`push` the numbers, then `get`/`set`), then look it up. Holds at most
 * `max` entries: when full it starts over (it's a cache, so forgetting is always safe).
 */
export class NumKeyMap<V> {
  private buckets = new Map<number, { k: Float64Array; v: V }[]>();
  private count = 0;
  private buf = new Float64Array(64);
  private n = 0;

  constructor(private readonly max: number) {}

  /** Start a new key. */
  reset(): this {
    this.n = 0;
    return this;
  }

  push(x: number): this {
    if (this.n === this.buf.length) {
      const bigger = new Float64Array(this.buf.length * 2);
      bigger.set(this.buf);
      this.buf = bigger;
    }
    this.buf[this.n++] = x;
    return this;
  }

  private find(list: { k: Float64Array; v: V }[] | undefined): { k: Float64Array; v: V } | undefined {
    if (!list) return undefined;
    const { buf, n } = this;
    outer: for (const e of list) {
      if (e.k.length !== n) continue;
      for (let i = 0; i < n; i++) if (e.k[i] !== buf[i]) continue outer;
      return e;
    }
    return undefined;
  }

  /** The value stored under the key built so far. */
  get(): V | undefined {
    return this.find(this.buckets.get(hashNums(this.buf, this.n)))?.v;
  }

  /** Store `v` under the key built so far. */
  set(v: V): void {
    const h = hashNums(this.buf, this.n);
    let list = this.buckets.get(h);
    const hit = this.find(list);
    if (hit) {
      hit.v = v;
      return;
    }
    if (this.count >= this.max) this.clear();
    list = this.buckets.get(h);
    if (!list) {
      list = [];
      this.buckets.set(h, list);
    }
    list.push({ k: this.buf.slice(0, this.n), v });
    this.count += 1;
  }

  clear(): void {
    this.buckets.clear();
    this.count = 0;
  }
}
