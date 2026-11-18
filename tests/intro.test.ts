// The intro player's DOM-free parts: the "seen intro" preference, scene timing and skipping.

import { describe, expect, it, vi } from "vitest";
import { INTRO_SEEN_KEY, hasSeenIntro, loadSeen, markIntroSeen, shouldAutoPlay } from "../src/ui/intro/prefs";
import { IntroRunner, isSkipKey, sceneAt, sceneStarts, totalDuration, type Timers } from "../src/ui/intro/runner";

function memoryStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  };
}

const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("intro: seen preference", () => {
  it("remembers each intro separately", () => {
    const s = memoryStorage();
    expect(hasSeenIntro("game", s)).toBe(false);
    expect(shouldAutoPlay("game", s)).toBe(true);
    expect(markIntroSeen("game", s)).toBe(true);
    expect(hasSeenIntro("game", s)).toBe(true);
    expect(shouldAutoPlay("game", s)).toBe(false);
    expect(hasSeenIntro("swarm", s)).toBe(false);
    markIntroSeen("swarm", s);
    markIntroSeen("swarm", s);
    expect(JSON.parse(s.data.get(INTRO_SEEN_KEY)!)).toEqual(["game", "swarm"]);
  });

  it("treats junk in storage as nothing seen", () => {
    expect(loadSeen(memoryStorage({ [INTRO_SEEN_KEY]: "{not json" })).size).toBe(0);
    expect(loadSeen(memoryStorage({ [INTRO_SEEN_KEY]: '{"game":true}' })).size).toBe(0);
    expect([...loadSeen(memoryStorage({ [INTRO_SEEN_KEY]: '["game", 3, null]' }))]).toEqual(["game"]);
  });

  it("never throws when storage is blocked, and never autoplays when it can't remember", () => {
    expect(hasSeenIntro("game", throwing)).toBe(false);
    expect(markIntroSeen("game", throwing)).toBe(false);
    expect(shouldAutoPlay("game", throwing)).toBe(false);
    expect(shouldAutoPlay("game", null)).toBe(false);
    expect(markIntroSeen("game", null)).toBe(false);
    // Readable but not writable storage would replay the intro on every launch.
    const readOnly = { getItem: () => null, setItem: throwing.setItem };
    expect(shouldAutoPlay("game", readOnly)).toBe(false);
  });
});

describe("intro: timing", () => {
  it("adds up scenes and finds the scene at a time", () => {
    const d = [1000, 2000, 500];
    expect(totalDuration(d)).toBe(3500);
    expect(sceneStarts(d)).toEqual([0, 1000, 3000]);
    expect(sceneAt(d, 0)).toEqual({ index: 0, local: 0 });
    expect(sceneAt(d, 999)).toEqual({ index: 0, local: 999 });
    expect(sceneAt(d, 1000)).toEqual({ index: 1, local: 0 });
    expect(sceneAt(d, 3200)).toEqual({ index: 2, local: 200 });
    expect(sceneAt(d, 99999)).toEqual({ index: 2, local: 500 });
    expect(sceneAt(d, -5)).toEqual({ index: 0, local: 0 });
    expect(sceneAt([], 10).index).toBe(-1);
  });

  it("skips on Esc, Space and Enter only", () => {
    for (const k of ["Escape", " ", "Enter", "Spacebar", "Esc"]) expect(isSkipKey(k)).toBe(true);
    for (const k of ["Tab", "a", "ArrowRight", "Shift"]) expect(isSkipKey(k)).toBe(false);
  });
});

describe("intro: runner", () => {
  const fakeTimers = (): Timers & { flush(ms: number): void; now: number } => {
    let now = 0;
    let seq = 0;
    const q = new Map<number, { at: number; fn: () => void }>();
    return {
      get now() {
        return now;
      },
      set: (fn, ms) => {
        q.set(++seq, { at: now + ms, fn });
        return seq;
      },
      clear: (h) => void q.delete(h as number),
      flush(ms) {
        const end = now + ms;
        for (;;) {
          const next = [...q.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
          if (!next) break;
          q.delete(next[0]);
          now = next[1].at;
          next[1].fn();
        }
        now = end;
      },
    };
  };

  it("plays every scene in order, then ends once", () => {
    const t = fakeTimers();
    const scenes: number[] = [];
    const onEnd = vi.fn();
    const r = new IntroRunner([1000, 2000, 500], { onScene: (i) => scenes.push(i), onEnd }, t);
    r.start();
    expect(scenes).toEqual([0]);
    t.flush(999);
    expect(scenes).toEqual([0]);
    t.flush(1);
    expect(scenes).toEqual([0, 1]);
    t.flush(2500);
    expect(scenes).toEqual([0, 1, 2]);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith("ended");
    expect(r.done).toBe(true);
    r.skip();
    t.flush(5000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("skipping ends at once, exactly once, and stops the timer", () => {
    const t = fakeTimers();
    const scenes: number[] = [];
    const onEnd = vi.fn();
    const r = new IntroRunner([1000, 1000], { onScene: (i) => scenes.push(i), onEnd }, t);
    r.start();
    t.flush(400);
    r.skip();
    r.skip();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith("skipped");
    t.flush(5000);
    expect(scenes).toEqual([0]);
  });

  it("can be skipped from inside a scene, and disposed without ending", () => {
    const t = fakeTimers();
    const onEnd = vi.fn();
    let r: IntroRunner;
    r = new IntroRunner([1000, 1000], { onScene: () => r.skip(), onEnd }, t);
    r.start();
    expect(onEnd).toHaveBeenCalledWith("skipped");
    const onEnd2 = vi.fn();
    const r2 = new IntroRunner([1000], { onScene: () => {}, onEnd: onEnd2 }, t);
    r2.start();
    r2.dispose();
    t.flush(5000);
    expect(onEnd2).not.toHaveBeenCalled();
  });

  it("an empty intro ends straight away", () => {
    const onEnd = vi.fn();
    new IntroRunner([], { onScene: () => {}, onEnd }, fakeTimers()).start();
    expect(onEnd).toHaveBeenCalledWith("ended");
  });
});
