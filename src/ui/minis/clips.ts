// Clips are code, not drawings: keyframe lists over the rig's channels. One clip set drives every
// unit built on a frame type, so a Forge unit animates on day one; bespoke units can add their own.
// Timings follow the engine canvas (targets): idle 2.4 s, step 140 ms beats, recoil kick 70 ms and
// settle 220, flinch flash 60 and squash 160, death topple 400 then an ink fade, flyer bob 1.6 s.
// Every clip has overlap (the head lags the body), a hold, and follow-through (a small overshoot
// before settling), which is what keeps tweened parts from reading as a cheap puppet.

import { ZERO } from "./pose";
import type { Channel, Channels, Clip, ClipId, Ease, FrameType, Key, RigDef, RigView, Status } from "./types";

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

/** A clip's tracks as a list (made once per clip, so sampling allocates nothing). */
const trackCache = new WeakMap<Clip, [Channel, Key[]][]>();
const tracksOf = (clip: Clip): [Channel, Key[]][] => {
  let t = trackCache.get(clip);
  if (!t) trackCache.set(clip, (t = Object.entries(clip.tracks) as [Channel, Key[]][]));
  return t;
};

/** Add a clip's channels at time `t` into `out`, weighted by `w`. Loops wrap. */
export function addClip(out: Channels, clip: Clip, t: number, w = 1): void {
  const tt = clip.loop ? ((t % clip.dur) + clip.dur) % clip.dur : Math.min(t, clip.dur);
  const tracks = tracksOf(clip);
  for (let i = 0; i < tracks.length; i++) {
    const [ch, keys] = tracks[i]!;
    const v = sampleTrack(keys, tt);
    if (ch === "gait") out.gait = v;
    else out[ch] += v * w;
  }
}

/** One channel of a clip at time `t` (ms; loops wrap), or 0 if the clip doesn't drive it. */
export function sampleChannel(clip: Clip, ch: Channel, t: number): number {
  const keys = clip.tracks[ch];
  if (!keys) return 0;
  const tt = clip.loop ? ((t % clip.dur) + clip.dur) % clip.dur : Math.min(t, clip.dur);
  return sampleTrack(keys, tt);
}

const loopK = (period: number, pts: [number, number][], e: Ease = "inOut"): Key[] => pts.map(([t, v]) => [t * period, v, e]);
/** A smooth -1..1 breath over `period` ms (the `pulse` channel). */
const breath = (period: number, amp = 1): Key[] => loopK(period, [[0, 0], [0.25, amp], [0.5, 0], [0.75, -amp], [1, 0]]);
/** A steady turn: `turns` full revolutions over `period` ms (the `spin` channel). */
const turn = (period: number, turns: number): Key[] => [[0, 0], [period, 360 * turns, "linear"]];
/** A wing beat: 0..1 flicks, `n` beats over `period` ms (the `flap` channel). */
const beat = (period: number, n: number): Key[] => {
  const out: Key[] = [[0, 0]];
  for (let i = 0; i < n; i++) {
    out.push([((i + 0.5) / n) * period, 1, "linear"]);
    out.push([((i + 1) / n) * period, 0, "linear"]);
  }
  return out;
};

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

/** The lean (humanoid) clip set: the reference trooper's. */
export const CLIPS: Readonly<Record<RigView, Record<ClipId, Clip>>> = { side: SIDE, top: TOP };
export const CLIP_IDS: ClipId[] = ["idle", "step", "recoil", "flinch", "death", "bob"];

// ---------- the other frame types ----------
// Same six clips per frame type. A pulse breath runs in every idle (only parts with a PartAnim use
// it), and the step clip is sampled by distance walked, so its `dur` only matters when standing in.

const FLINCH_TOP = TOP.flinch;
const BOB_TOP: Clip = { ...TOP.bob, tracks: { ...TOP.bob.tracks, flap: beat(1600, 22), spin: turn(1600, 8) } };
const BOB_SIDE: Clip = { ...SIDE.bob, tracks: { ...SIDE.bob.tracks, flap: beat(1600, 22), spin: turn(1600, 8) } };

/** Bugs: a jittery scuttle, a lunge (scythes and jaws ride the gun bone), and a curl-up death. */
const INSECT: Record<RigView, Record<ClipId, Clip>> = {
  side: {
    idle: {
      id: "idle",
      dur: 1800,
      loop: true,
      tracks: {
        pelvisY: loopK(1800, [[0, 0], [0.5, 0.8], [1, 0]]),
        // the head twitches: hold, snap, hold
        headRot: [[0, 0], [540, 0], [600, -5, "out"], [900, -5], [960, 3, "out"], [1440, 3], [1500, 0, "out"], [1800, 0]],
        gunY: loopK(1800, [[0, 0], [0.45, -1.6], [1, 0]]),
        gunRot: loopK(1800, [[0, 0], [0.5, -2], [1, 0]]),
        pulse: breath(1800),
      },
    },
    step: {
      id: "step",
      dur: 420,
      loop: true,
      tracks: {
        gait: [[0, 0], [420, 4, "linear"]],
        gaitW: [[0, 1], [420, 1]],
        pelvisY: loopK(420, [[0, -1], [0.25, 0.6], [0.5, -1], [0.75, 0.6], [1, -1]]),
        torsoRot: loopK(420, [[0, -1], [0.5, 1], [1, -1]]),
        headRot: loopK(420, [[0, 1.5], [0.5, -1.5], [1, 1.5]]),
        gunY: loopK(420, [[0, 1], [0.5, -1], [1, 1]]),
      },
    },
    recoil: {
      id: "recoil",
      dur: 360,
      loop: false,
      tracks: {
        // the strike: rear back a beat, then lunge forward and down, hold, recover
        gunX: [[0, 0], [60, 3, "out"], [130, -12, "out"], [220, -12], [360, 0, "inOut"]],
        gunY: [[0, 0], [60, -4, "out"], [130, 7, "out"], [220, 7], [360, 0, "inOut"]],
        gunRot: [[0, 0], [60, 6, "out"], [130, -10, "out"], [360, 0, "inOut"]],
        pelvisX: [[0, 0], [130, -4, "out"], [360, 0, "inOut"]],
        torsoRot: [[0, 0], [60, 3, "out"], [130, -5, "out"], [360, 0, "inOut"]],
        kick: [[0, 0], [130, 1, "out"], [300, 0, "inOut"]],
        muzzle: [[0, 0], [129, 0], [130, 1, "linear"], [200, 1], [201, 0, "linear"]],
      },
    },
    flinch: {
      id: "flinch",
      dur: 220,
      loop: false,
      tracks: {
        flash: [[0, 1], [60, 0, "out"]],
        rootSX: [[0, 0], [60, 0.08, "out"], [160, -0.03, "inOut"], [220, 0, "inOut"]],
        rootSY: [[0, 0], [60, -0.12, "out"], [160, 0.03, "inOut"], [220, 0, "inOut"]],
        pelvisX: [[0, 0], [60, 3, "out"], [220, 0, "inOut"]],
        headRot: [[0, 0], [70, 8, "out"], [220, 0, "inOut"]],
      },
    },
    death: {
      id: "death",
      dur: 1000,
      loop: false,
      tracks: {
        // the body drops between its legs, the legs splay, it rolls a little; then the ink fades
        pelvisY: [[0, 0], [60, -3, "out"], [380, 10, "in"], [440, 8, "out"]],
        rootRot: [[0, 0], [380, -10, "in"]],
        headRot: [[0, 0], [380, 14, "in"]],
        gunY: [[0, 0], [380, 10, "in"]],
        rootSY: [[0, 0], [380, -0.18, "in"]],
        flash: [[0, 0.7], [60, 0, "out"]],
        fade: [[0, 0], [400, 0], [1000, 1, "inOut"]],
      },
    },
    bob: { ...BOB_SIDE, tracks: { ...BOB_SIDE.tracks, rootY: loopK(1600, [[0, 0], [0.25, -5], [0.5, 0], [0.75, 5], [1, 0]]) } },
  },
  top: {
    idle: {
      id: "idle",
      dur: 1800,
      loop: true,
      tracks: {
        rootSX: loopK(1800, [[0, 0], [0.5, 0.015], [1, 0]]),
        headRot: [[0, 0], [540, 0], [600, -7, "out"], [900, -7], [960, 5, "out"], [1440, 5], [1500, 0, "out"], [1800, 0]],
        gunY: loopK(1800, [[0, 0], [0.45, 1.5], [1, 0]]),
        pulse: breath(1800),
      },
    },
    step: {
      id: "step",
      dur: 420,
      loop: true,
      tracks: {
        gait: [[0, 0], [420, 4, "linear"]],
        gaitW: [[0, 1], [420, 1]],
        torsoRot: loopK(420, [[0, -3], [0.5, 3], [1, -3]]),
        headRot: loopK(420, [[0, 3], [0.5, -3], [1, 3]]),
        rootX: loopK(420, [[0, -0.6], [0.5, 0.6], [1, -0.6]]),
      },
    },
    recoil: {
      id: "recoil",
      dur: 360,
      loop: false,
      tracks: {
        rootY: [[0, 0], [60, 2, "out"], [130, -6, "out"], [220, -6], [360, 0, "inOut"]],
        gunY: [[0, 0], [60, 3, "out"], [130, -9, "out"], [220, -9], [360, 0, "inOut"]],
        kick: [[0, 0], [130, 1, "out"], [300, 0, "inOut"]],
        muzzle: [[0, 0], [129, 0], [130, 1, "linear"], [200, 1], [201, 0, "linear"]],
      },
    },
    flinch: FLINCH_TOP,
    death: {
      id: "death",
      dur: 900,
      loop: false,
      tracks: {
        rootSX: [[0, 0], [300, -0.3, "in"]],
        rootSY: [[0, 0], [300, -0.3, "in"]],
        rootRot: [[0, 0], [300, 40, "in"]],
        flash: [[0, 0.7], [60, 0, "out"]],
        fade: [[0, 0], [300, 0], [900, 1, "inOut"]],
      },
    },
    bob: BOB_TOP,
  },
};

/** Big legged machines and monsters: a slow, heavy stomp and a big recoil. */
const WALKER: Record<RigView, Record<ClipId, Clip>> = {
  side: {
    idle: {
      id: "idle",
      dur: 3000,
      loop: true,
      tracks: {
        pelvisY: loopK(3000, [[0, 0], [0.5, 1.4], [1, 0]]),
        torsoRot: loopK(3000, [[0, 0], [0.5, -0.6], [1, 0]]),
        headRot: loopK(3000, [[0, 0], [0.2, 0], [0.7, -2], [1, 0]]),
        gunRot: loopK(3000, [[0, 0], [0.55, -1.2], [1, 0]]),
        pulse: breath(3000),
      },
    },
    step: {
      id: "step",
      dur: 1000,
      loop: true,
      tracks: {
        gait: [[0, 0], [1000, 4, "linear"]],
        gaitW: [[0, 1], [1000, 1]],
        // the weight drops onto each planted foot, then heaves up as the other swings through
        pelvisY: loopK(1000, [[0, 4], [0.12, 5], [0.25, -2], [0.5, 4], [0.62, 5], [0.75, -2], [1, 4]]),
        torsoRot: loopK(1000, [[0, -1.2], [0.5, 1.2], [1, -1.2]]),
        headRot: loopK(1000, [[0, 1.5], [0.3, -1], [0.55, 1.5], [0.8, -1], [1, 1.5]]),
        gunY: loopK(1000, [[0, 1.5], [0.3, -1], [0.55, 1.5], [0.8, -1], [1, 1.5]]),
        spin: turn(1000, 1),
      },
    },
    recoil: {
      id: "recoil",
      dur: 420,
      loop: false,
      tracks: {
        kick: [[0, 0], [70, 1, "out"], [260, -0.1, "inOut"], [420, 0, "inOut"]],
        pelvisX: [[0, 0], [80, 4, "out"], [420, 0, "inOut"]],
        pelvisY: [[0, 0], [80, 2, "out"], [420, 0, "inOut"]],
        torsoRot: [[0, 0], [80, 3, "out"], [160, 3], [420, 0, "inOut"]],
        headRot: [[0, 0], [130, 2.5, "out"], [420, 0, "inOut"]],
        muzzle: [[0, 1], [80, 1], [81, 0, "linear"]],
      },
    },
    flinch: {
      id: "flinch",
      dur: 260,
      loop: false,
      tracks: {
        flash: [[0, 1], [60, 0, "out"]],
        rootSX: [[0, 0], [60, 0.04, "out"], [180, -0.015, "inOut"], [260, 0, "inOut"]],
        rootSY: [[0, 0], [60, -0.05, "out"], [180, 0.015, "inOut"], [260, 0, "inOut"]],
        torsoRot: [[0, 0], [70, 3.5, "out"], [260, 0, "inOut"]],
      },
    },
    death: {
      id: "death",
      dur: 1300,
      loop: false,
      tracks: {
        // the knees go, it slumps forward onto its face, a bounce, then the ink fades
        pelvisY: [[0, 0], [80, -2, "out"], [600, 26, "in"], [680, 22, "out"], [760, 26, "in"]],
        torsoRot: [[0, 0], [600, -14, "in"]],
        rootRot: [[0, 0], [600, -8, "in"]],
        flash: [[0, 0.7], [60, 0, "out"]],
        fade: [[0, 0], [700, 0], [1300, 1, "inOut"]],
      },
    },
    bob: SIDE.bob,
  },
  top: {
    idle: { ...TOP.idle, tracks: { ...TOP.idle.tracks, pulse: breath(2400) } },
    step: {
      id: "step",
      dur: 1000,
      loop: true,
      tracks: {
        gait: [[0, 0], [1000, 4, "linear"]],
        gaitW: [[0, 1], [1000, 1]],
        torsoRot: loopK(1000, [[0, -3], [0.5, 3], [1, -3]]),
        rootX: loopK(1000, [[0, -1.5], [0.5, 1.5], [1, -1.5]]),
        headRot: loopK(1000, [[0, 2], [0.55, -2], [1, 2]]),
      },
    },
    recoil: { ...TOP.recoil, tracks: { ...TOP.recoil.tracks, rootY: [[0, 0], [80, 6, "out"], [260, -0.6, "inOut"], [420, 0, "inOut"]] }, dur: 420 },
    flinch: FLINCH_TOP,
    death: {
      id: "death",
      dur: 1100,
      loop: false,
      tracks: {
        rootSX: [[0, 0], [500, 0.1, "in"]],
        rootSY: [[0, 0], [500, -0.2, "in"]],
        rootY: [[0, 0], [500, -8, "in"]],
        flash: [[0, 0.7], [60, 0, "out"]],
        fade: [[0, 0], [500, 0], [1100, 1, "inOut"]],
      },
    },
    bob: TOP.bob,
  },
};

/** Wheeled machines: an engine shudder, a bouncing ride with the wheels turning, a tip-over death. */
const VEHICLE: Record<RigView, Record<ClipId, Clip>> = {
  side: {
    idle: {
      id: "idle",
      dur: 480,
      loop: true,
      tracks: {
        pelvisY: loopK(480, [[0, 0], [0.25, 0.7], [0.5, 0], [0.75, 0.5], [1, 0]]),
        headRot: loopK(2400, [[0, 0], [0.5, -0.4], [1, 0]]),
        pulse: breath(2400),
      },
    },
    step: {
      id: "step",
      dur: 600,
      loop: true,
      tracks: {
        spin: turn(600, 1),
        pelvisY: loopK(600, [[0, 0], [0.3, -2], [0.55, 0.8], [1, 0]]),
        rootRot: loopK(600, [[0, -1.5], [0.5, -0.5], [1, -1.5]]),
        torsoRot: loopK(600, [[0, -2], [0.5, -3], [1, -2]]),
        headRot: loopK(600, [[0, 1], [0.5, -1], [1, 1]]),
      },
    },
    recoil: SIDE.recoil,
    flinch: SIDE.flinch,
    death: {
      id: "death",
      dur: 1100,
      loop: false,
      tracks: {
        rootRot: [[0, 0], [80, -4, "out"], [480, 70, "in"]],
        rootX: [[0, 0], [480, 18, "in"]],
        rootY: [[0, 0], [480, 0], [540, -4, "out"], [620, 0, "in"]],
        flash: [[0, 0.7], [60, 0, "out"]],
        fade: [[0, 0], [500, 0], [1100, 1, "inOut"]],
      },
    },
    bob: SIDE.bob,
  },
  top: {
    idle: {
      id: "idle",
      dur: 480,
      loop: true,
      tracks: { rootX: loopK(480, [[0, 0], [0.25, 0.35], [0.75, -0.35], [1, 0]]), pulse: breath(2400) },
    },
    step: {
      id: "step",
      dur: 600,
      loop: true,
      tracks: { spin: turn(600, 1), rootX: loopK(600, [[0, -0.6], [0.5, 0.6], [1, -0.6]]), torsoRot: loopK(600, [[0, -2], [0.5, 2], [1, -2]]) },
    },
    recoil: TOP.recoil,
    flinch: FLINCH_TOP,
    death: {
      id: "death",
      dur: 900,
      loop: false,
      tracks: {
        rootRot: [[0, 0], [400, 70, "in"]],
        rootSX: [[0, 0], [400, -0.25, "in"]],
        flash: [[0, 0.7], [60, 0, "out"]],
        fade: [[0, 0], [400, 0], [900, 1, "inOut"]],
      },
    },
    bob: TOP.bob,
  },
};

/** Flyers and floating hulls: always a slight sway, rotors and propellers turning, a dive when shot down. */
const HOVER: Record<RigView, Record<ClipId, Clip>> = {
  side: {
    idle: {
      id: "idle",
      dur: 2400,
      loop: true,
      tracks: {
        rootY: loopK(2400, [[0, 0], [0.5, -2.5], [1, 0]]),
        rootRot: loopK(2400, [[0, 0], [0.3, -1.5], [0.8, 1.5], [1, 0]]),
        spin: turn(2400, 14),
        flap: beat(2400, 30),
        pulse: breath(2400),
      },
    },
    step: {
      id: "step",
      dur: 800,
      loop: true,
      tracks: {
        // nose down into the travel
        rootRot: loopK(800, [[0, -4], [0.5, -5], [1, -4]]),
        rootY: loopK(800, [[0, 0], [0.5, -1.5], [1, 0]]),
        spin: turn(800, 6),
        flap: beat(800, 12),
      },
    },
    recoil: {
      id: "recoil",
      dur: 300,
      loop: false,
      tracks: {
        kick: [[0, 0], [70, 1, "out"], [300, 0, "inOut"]],
        rootX: [[0, 0], [70, 3, "out"], [300, 0, "inOut"]],
        rootRot: [[0, 0], [70, 2, "out"], [300, 0, "inOut"]],
        muzzle: [[0, 1], [70, 1], [71, 0, "linear"]],
      },
    },
    flinch: {
      id: "flinch",
      dur: 260,
      loop: false,
      tracks: {
        flash: [[0, 1], [60, 0, "out"]],
        rootRot: [[0, 0], [60, 6, "out"], [160, -2, "inOut"], [260, 0, "inOut"]],
        rootY: [[0, 0], [60, 3, "out"], [260, 0, "inOut"]],
      },
    },
    death: {
      id: "death",
      dur: 1100,
      loop: false,
      tracks: {
        // a nose-down spiral to the ground
        rootRot: [[0, 0], [80, 6, "out"], [600, -40, "in"]],
        rootY: [[0, 0], [600, 30, "in"]],
        rootX: [[0, 0], [600, -14, "in"]],
        flash: [[0, 0.7], [60, 0, "out"]],
        fade: [[0, 0], [550, 0], [1100, 1, "inOut"]],
      },
    },
    bob: BOB_SIDE,
  },
  top: {
    idle: {
      id: "idle",
      dur: 2400,
      loop: true,
      tracks: {
        rootSX: loopK(2400, [[0, 0], [0.5, 0.015], [1, 0]]),
        rootSY: loopK(2400, [[0, 0], [0.5, 0.015], [1, 0]]),
        torsoRot: loopK(2400, [[0, 0], [0.3, -2], [0.8, 2], [1, 0]]),
        spin: turn(2400, 14),
        flap: beat(2400, 30),
        pulse: breath(2400),
      },
    },
    step: {
      id: "step",
      dur: 800,
      loop: true,
      tracks: { torsoRot: loopK(800, [[0, -3], [0.5, 3], [1, -3]]), spin: turn(800, 6), flap: beat(800, 12) },
    },
    recoil: TOP.recoil,
    flinch: FLINCH_TOP,
    death: {
      id: "death",
      dur: 1000,
      loop: false,
      tracks: {
        rootRot: [[0, 0], [600, 160, "in"]],
        rootSX: [[0, 0], [600, -0.35, "in"]],
        rootSY: [[0, 0], [600, -0.35, "in"]],
        flash: [[0, 0.7], [60, 0, "out"]],
        fade: [[0, 0], [500, 0], [1000, 1, "inOut"]],
      },
    },
    bob: BOB_TOP,
  },
};

/** Structures: no limbs and no walking. A breath for glows and sacs, a kick when they fire, a sink when destroyed. */
const STILL: Clip = { id: "step", dur: 1000, loop: true, tracks: {} };
const STRUCTURE: Record<RigView, Record<ClipId, Clip>> = {
  side: {
    idle: {
      id: "idle",
      dur: 2400,
      loop: true,
      tracks: { pulse: breath(2400), spin: turn(2400, 1), gunRot: loopK(4800, [[0, 0], [0.5, -2.5], [1, 0]]) },
    },
    step: STILL,
    recoil: {
      id: "recoil",
      dur: 300,
      loop: false,
      tracks: {
        kick: [[0, 0], [70, 1, "out"], [300, 0, "inOut"]],
        rootSY: [[0, 0], [70, -0.03, "out"], [300, 0, "inOut"]],
        rootSX: [[0, 0], [70, 0.02, "out"], [300, 0, "inOut"]],
        muzzle: [[0, 1], [70, 1], [71, 0, "linear"]],
      },
    },
    flinch: {
      id: "flinch",
      dur: 200,
      loop: false,
      tracks: {
        flash: [[0, 1], [60, 0, "out"]],
        rootSX: [[0, 0], [60, 0.04, "out"], [200, 0, "inOut"]],
        rootSY: [[0, 0], [60, -0.04, "out"], [200, 0, "inOut"]],
      },
    },
    death: {
      id: "death",
      dur: 1100,
      loop: false,
      tracks: {
        rootSY: [[0, 0], [60, 0.05, "out"], [450, -0.55, "in"]],
        rootSX: [[0, 0], [450, 0.12, "in"]],
        rootRot: [[0, 0], [450, 4, "in"]],
        flash: [[0, 0.8], [80, 0, "out"]],
        fade: [[0, 0], [450, 0], [1100, 1, "inOut"]],
      },
    },
    bob: SIDE.bob,
  },
  top: {
    idle: { id: "idle", dur: 2400, loop: true, tracks: { pulse: breath(2400), spin: turn(2400, 1), gunRot: loopK(4800, [[0, 0], [0.5, -4], [1, 0]]) } },
    step: STILL,
    recoil: { id: "recoil", dur: 300, loop: false, tracks: { kick: [[0, 0], [70, 1, "out"], [300, 0, "inOut"]], muzzle: [[0, 1], [70, 1], [71, 0, "linear"]] } },
    flinch: { id: "flinch", dur: 200, loop: false, tracks: { flash: [[0, 1], [60, 0, "out"]], rootSX: [[0, 0], [60, 0.05, "out"], [200, 0, "inOut"]], rootSY: [[0, 0], [60, 0.05, "out"], [200, 0, "inOut"]] } },
    death: {
      id: "death",
      dur: 1000,
      loop: false,
      tracks: {
        rootSX: [[0, 0], [400, -0.35, "in"]],
        rootSY: [[0, 0], [400, -0.35, "in"]],
        flash: [[0, 0.8], [80, 0, "out"]],
        fade: [[0, 0], [400, 0], [1000, 1, "inOut"]],
      },
    },
    bob: TOP.bob,
  },
};

/** Humanoids also breathe (pulse) and beat wings when flying: the trooper's own clips are untouched. */
const LEAN: Record<RigView, Record<ClipId, Clip>> = {
  side: { ...SIDE, idle: { ...SIDE.idle, tracks: { ...SIDE.idle.tracks, pulse: breath(2400) } }, bob: BOB_SIDE },
  top: { ...TOP, idle: { ...TOP.idle, tracks: { ...TOP.idle.tracks, pulse: breath(2400) } }, bob: BOB_TOP },
};

export const FRAME_CLIPS: Readonly<Record<FrameType, Record<RigView, Record<ClipId, Clip>>>> = {
  lean: LEAN,
  insect: INSECT,
  walker: WALKER,
  vehicle: VEHICLE,
  hover: HOVER,
  structure: STRUCTURE,
};

const rigClipCache = new WeakMap<RigDef, Record<ClipId, Clip>>();
/** The clips that drive a rig: its frame type's, with the rig's own overrides on top. */
export function clipsFor(rig: RigDef): Record<ClipId, Clip> {
  let c = rigClipCache.get(rig);
  if (!c) rigClipCache.set(rig, (c = { ...(FRAME_CLIPS[rig.frame] ?? LEAN)[rig.view], ...rig.clips }));
  return c;
}

/** Held status poses (the rig changes pose, not just tint), blended in and out by the mini. */
export function statusPose(view: RigView, s: Pick<Status, "hp" | "hpMax" | "engaged" | "shaken">, frame: FrameType = "lean"): Partial<Channels> {
  const out: Partial<Channels> = {};
  const add = (ch: Partial<Channels>) => {
    for (const [k, v] of Object.entries(ch) as [Channel, number][]) out[k] = (out[k] ?? 0) + v;
  };
  const hurt = s.hp < s.hpMax;
  if (frame === "structure") {
    // a structure can't flinch away: it lists when damaged and drains when shaken
    if (hurt) add(view === "side" ? { rootRot: 2.5 } : { rootSX: -0.04 });
    if (s.shaken) add({ drain: 0.85 });
    return out;
  }
  if (view === "side") {
    if (frame === "insect") {
      if (hurt) add({ pelvisY: 3, headRot: 5, gunY: 3 });
      if (s.engaged) add({ gunX: -3, gunY: -3, gunRot: -6, pelvisX: -2 });
      if (s.shaken) add({ pelvisX: 4, pelvisY: 2, headRot: 8, gunY: 4, drain: 0.85 });
    } else if (frame === "hover" || frame === "vehicle") {
      if (hurt) add({ rootRot: 4 });
      if (s.engaged) add({ rootRot: -2 });
      if (s.shaken) add({ rootRot: 5, drain: 0.85 });
    } else if (frame === "walker") {
      if (hurt) add({ pelvisY: 4, torsoRot: 3, headRot: 3 });
      if (s.engaged) add({ torsoRot: -3, pelvisY: 2, gaitW: 1 });
      if (s.shaken) add({ torsoRot: 4, pelvisX: 3, drain: 0.85 });
    } else {
      if (hurt) add({ pelvisY: 3, torsoRot: -7, headRot: 4 });
      if (s.engaged) add({ torsoRot: -6, pelvisX: -2, pelvisY: 2, gaitW: 1 });
      if (s.shaken) add({ torsoRot: 8, pelvisX: 2, pelvisY: 3, headRot: -6, drain: 0.85 });
    }
  } else {
    if (hurt) add({ torsoRot: 10, rootSX: -0.05 });
    if (s.engaged) add({ gunY: -3, torsoRot: -4 });
    // from above the pose language is rotation: a shaken model turns away
    if (s.shaken) add({ yaw: 150, drain: 0.85 });
  }
  return out;
}

/** Hunkered down (taking cover): crouch from the side, shrink from above. Structures stay put. */
export function hunkerPose(view: RigView, frame: FrameType = "lean"): Partial<Channels> {
  if (frame === "structure" || frame === "hover") return {};
  if (view === "top") return { rootSX: -0.06, rootSY: -0.06 };
  if (frame === "insect") return { pelvisY: 5, headRot: 4 };
  if (frame === "walker") return { pelvisY: 6, torsoRot: 2 };
  if (frame === "vehicle") return { pelvisY: 2 };
  return { pelvisY: 7, torsoRot: -4, headRot: 3 };
}

/** A fresh channel set. */
export const channels = (): Channels => ({ ...ZERO });
/** Back to rest, in place (the mini reuses one channel set per frame). */
export const resetChannels = (c: Channels): Channels => Object.assign(c, ZERO);
