// Clips are code, not drawings: keyframe lists over the rig's channels. One clip set drives every
// unit built on a frame type, so a Forge unit animates on day one; bespoke units can add their own.
// Timings follow the engine canvas (targets): idle 2.4 s, step 140 ms beats, recoil kick 70 ms and
// settle 220, flinch flash 60 and squash 160, death topple 400 then an ink fade, flyer bob 1.6 s.
// Every clip has overlap (the head lags the body), a hold, and follow-through (a small overshoot
// before settling), which is what keeps tweened parts from reading as a cheap puppet.

import { ZERO } from "./pose";
import type { Channel, Channels, Clip, ClipId, Ease, Key, RigView, Status } from "./types";

const ease = (e: Ease | undefined, t: number): number => {
  switch (e) {
    case "in":
      return t * t * t;
    case "out":
      return 1 - (1 - t) ** 3;
    case "back": {
      const s = 1.7;
      const u = t - 1;
      return 1 + u * u * ((s + 1) * u + s);
    }
    case "linear":
      return t;
    default:
      return t * t * (3 - 2 * t);
  }
};

/** A track's value at time `t` (ms). */
export function sampleTrack(keys: Key[], t: number): number {
  if (!keys.length) return 0;
  if (t <= keys[0]![0]) return keys[0]![1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i]!;
    if (t <= t1) {
      const [t0, v0] = keys[i - 1]!;
      const k = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * ease(e, k);
    }
  }
  return keys[keys.length - 1]![1];
}

/** Add a clip's channels at time `t` into `out`, weighted by `w`. Loops wrap. */
export function addClip(out: Channels, clip: Clip, t: number, w = 1): void {
  const tt = clip.loop ? ((t % clip.dur) + clip.dur) % clip.dur : Math.min(t, clip.dur);
  for (const [ch, keys] of Object.entries(clip.tracks) as [Channel, Key[]][]) {
    const v = sampleTrack(keys, tt);
    if (ch === "gait") out.gait = v;
    else out[ch] += v * w;
  }
}

const loopK = (period: number, pts: [number, number][], e: Ease = "inOut"): Key[] => pts.map(([t, v]) => [t * period, v, e]);

// ---------- side view (Option A) ----------

const SIDE: Record<ClipId, Clip> = {
  idle: {
    id: "idle",
    dur: 2400,
    loop: true,
    tracks: {
      // breathe out by settling into the knees (the legs are near straight: rising would lift the feet)
      pelvisY: loopK(2400, [[0, 0], [0.5, 1.1], [1, 0]]),
      torsoRot: loopK(2400, [[0, 0], [0.5, -0.9], [1, 0]]),
      // overlap: the head follows the chest a beat later
      headRot: loopK(2400, [[0, 0.3], [0.18, 0.3], [0.68, -1.4], [1, 0.3]]),
      gunY: loopK(2400, [[0, 0], [0.55, -0.7], [1, 0]]),
    },
  },
  step: {
    id: "step",
    dur: 560,
    loop: true,
    tracks: {
      gait: [[0, 0], [560, 4, "linear"]],
      gaitW: [[0, 1], [560, 1]],
      // stride: body down 2; pass: body up 2 (140 ms beats)
      pelvisY: loopK(560, [[0, 2], [0.25, -2], [0.5, 2], [0.75, -2], [1, 2]]),
      torsoRot: loopK(560, [[0, -3.5], [0.25, -2], [0.5, -3.5], [0.75, -2], [1, -3.5]]),
      headRot: loopK(560, [[0, 1.2], [0.3, -0.8], [0.55, 1.2], [0.8, -0.8], [1, 1.2]]),
      gunY: loopK(560, [[0, 0.8], [0.3, -0.8], [0.55, 0.8], [0.8, -0.8], [1, 0.8]]),
    },
  },
  recoil: {
    id: "recoil",
    dur: 290,
    loop: false,
    tracks: {
      kick: [[0, 0], [70, 1, "out"], [200, -0.15, "inOut"], [290, 0, "inOut"]],
      torsoRot: [[0, 0], [70, 5, "out"], [120, 5], [220, -0.8, "inOut"], [290, 0, "inOut"]],
      headRot: [[0, 0], [110, 3.5, "out"], [290, 0, "inOut"]],
      pelvisX: [[0, 0], [70, 1.2, "out"], [290, 0, "inOut"]],
      muzzle: [[0, 1], [70, 1], [71, 0, "linear"]],
    },
  },
  flinch: {
    id: "flinch",
    dur: 220,
    loop: false,
    tracks: {
      flash: [[0, 1], [60, 0, "out"]],
      rootSX: [[0, 0], [60, 0.09, "out"], [160, -0.03, "inOut"], [220, 0, "inOut"]],
      rootSY: [[0, 0], [60, -0.1, "out"], [160, 0.03, "inOut"], [220, 0, "inOut"]],
      torsoRot: [[0, 0], [60, 6, "out"], [220, 0, "inOut"]],
      headRot: [[0, 0], [90, 5, "out"], [220, 0, "inOut"]],
    },
  },
  death: {
    id: "death",
    dur: 1000,
    loop: false,
    tracks: {
      // topple backwards (away from the facing), ease in; then the ink fades to the marker
      rootRot: [[0, 0], [60, -4, "out"], [400, 84, "in"]],
      rootX: [[0, 0], [60, -1, "out"], [400, 12, "in"]],
      rootY: [[0, 0], [400, 0], [460, -3, "out"], [540, 0, "in"]],
      torsoRot: [[0, 0], [400, 6, "in"], [520, 0, "inOut"]],
      flash: [[0, 0.7], [60, 0, "out"]],
      fade: [[0, 0], [400, 0], [1000, 1, "inOut"]],
    },
  },
  bob: {
    id: "bob",
    dur: 1600,
    loop: true,
    tracks: {
      rootY: loopK(1600, [[0, 0], [0.25, -6], [0.5, 0], [0.75, 6], [1, 0]]),
      torsoRot: loopK(1600, [[0, 0], [0.3, -1.5], [0.8, 1.5], [1, 0]]),
    },
  },
};

// ---------- top view (Option D) ----------

const TOP: Record<ClipId, Clip> = {
  idle: {
    id: "idle",
    dur: 2400,
    loop: true,
    tracks: {
      rootSX: loopK(2400, [[0, 0], [0.5, 0.018], [1, 0]]),
      rootSY: loopK(2400, [[0, 0], [0.5, 0.012], [1, 0]]),
      headRot: loopK(2400, [[0, 0], [0.2, 0], [0.7, 6], [1, 0]]),
    },
  },
  step: {
    id: "step",
    dur: 560,
    loop: true,
    tracks: {
      torsoRot: loopK(560, [[0, -6], [0.5, 6], [1, -6]]),
      rootX: loopK(560, [[0, -1], [0.5, 1], [1, -1]]),
      headRot: loopK(560, [[0, 3], [0.55, -3], [1, 3]]),
    },
  },
  recoil: {
    id: "recoil",
    dur: 290,
    loop: false,
    tracks: {
      // a push back along the facing (+y is behind the figure)
      rootY: [[0, 0], [70, 4, "out"], [220, -0.5, "inOut"], [290, 0, "inOut"]],
      kick: [[0, 0], [70, 1, "out"], [290, 0, "inOut"]],
      muzzle: [[0, 1], [70, 1], [71, 0, "linear"]],
    },
  },
  flinch: {
    id: "flinch",
    dur: 180,
    loop: false,
    tracks: {
      flash: [[0, 1], [60, 0, "out"]],
      rootX: [[0, 0], [30, -3, "out"], [60, 3], [90, -2], [120, 0, "inOut"]],
      torsoRot: [[0, 0], [60, 8, "out"], [180, 0, "inOut"]],
    },
  },
  death: {
    id: "death",
    dur: 900,
    loop: false,
    tracks: {
      rootSY: [[0, 0], [300, -0.45, "in"]],
      rootSX: [[0, 0], [300, 0.12, "in"]],
      rootRot: [[0, 0], [300, 25, "in"]],
      rootY: [[0, 0], [300, 8, "in"]],
      flash: [[0, 0.7], [60, 0, "out"]],
      fade: [[0, 0], [300, 0], [900, 1, "inOut"]],
    },
  },
  bob: {
    id: "bob",
    dur: 1600,
    loop: true,
    tracks: {
      shadow: loopK(1600, [[0, 0.75], [0.5, 1], [1, 0.75]]),
      rootSX: loopK(1600, [[0, 0.07], [0.5, 0.1], [1, 0.07]]),
      rootSY: loopK(1600, [[0, 0.07], [0.5, 0.1], [1, 0.07]]),
    },
  },
};

export const CLIPS: Readonly<Record<RigView, Record<ClipId, Clip>>> = { side: SIDE, top: TOP };
export const CLIP_IDS: ClipId[] = ["idle", "step", "recoil", "flinch", "death", "bob"];

/** Held status poses (the rig changes pose, not just tint), blended in and out by the mini. */
export function statusPose(view: RigView, s: Pick<Status, "hp" | "hpMax" | "engaged" | "shaken">): Partial<Channels> {
  const out: Partial<Channels> = {};
  const add = (ch: Partial<Channels>) => {
    for (const [k, v] of Object.entries(ch) as [Channel, number][]) out[k] = (out[k] ?? 0) + v;
  };
  const hurt = s.hp < s.hpMax;
  if (view === "side") {
    if (hurt) add({ pelvisY: 3, torsoRot: -7, headRot: 4 });
    if (s.engaged) add({ torsoRot: -6, pelvisX: -2, pelvisY: 2, gaitW: 1 });
    if (s.shaken) add({ torsoRot: 8, pelvisX: 2, pelvisY: 3, headRot: -6, drain: 0.85 });
  } else {
    if (hurt) add({ torsoRot: 10, rootSX: -0.05 });
    if (s.engaged) add({ gunY: -3, torsoRot: -4 });
    // from above the pose language is rotation: a shaken model turns away
    if (s.shaken) add({ yaw: 150, drain: 0.85 });
  }
  return out;
}

/** A fresh channel set. */
export const channels = (): Channels => ({ ...ZERO });
