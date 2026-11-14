// Campaign story scenes: short comic-panel scenes built from the campaign's story panels and played by
// the intro player (src/ui/intro/stage.ts), so they look like the game intro: the real miniatures on
// inked backdrops, speech bubbles and captions. Skippable like the intros, and a still comic page
// with reduced motion.

import { characterById, placeById, type LoreFactionId } from "../../engine/data/lore";
import { PROFILES } from "../../engine/data/factions";
import { fillStory } from "../../engine/campaign";
import type { StoryPanel } from "../../engine/data/campaign";
import { esc } from "../describe";
import {
  barnFront,
  creekCutaway,
  hallMast,
  lab,
  lawn,
  orbit,
  rays,
  scoreCard,
  starLens,
  valley,
  type Sky,
  type ValleyOpts,
} from "../intro/backdrops";
import { playIntro, type IntroHandle, type Kit, type SceneDef } from "../intro/stage";

/** A panel ready to draw: the story panel plus how to stage it. */
export interface ScenePanel extends StoryPanel {
  sky?: Sky;
  /** Which side of the panel the speaker stands on (default: left for your side, right for theirs). */
  side?: "left" | "right";
  /** A comic starburst ("VICTORY!"). */
  burst?: { word: string; color?: string };
  /** Emblems facing off across the panel (a battle's title card). */
  versus?: [string, string];
  /** A small line under the title. */
  sub?: string;
}

const VALLEY: Record<string, ValleyOpts> = {
  "grange-hall": { hall: true, fence: true, pump: true },
  "dustbowl-crossing": { silo: true, fence: true, crops: "corn" },
  "mesa-ridge": { horizon: 740, clouds: true },
  "old-refinery": { pump: true, road: "dirt", crops: "soil" },
  "long-ridge-highway": { road: "ends", fence: true },
  "scrapyard-sprawl": { barn: true, crops: "soil", pump: true },
  "rattlevane-junction": { pump: true, fence: true, silo: true },
  "fizzwater-ford": { pump: true, barn: true, clouds: true },
  "brinejaw-flats": { crops: "soil", horizon: 620 },
  gutterbend: { crops: "soil", road: "dirt" },
  "grubstake-redoubt": { crops: "soil", fence: true },
  "gemhaul-road": { road: "dirt", horizon: 720 },
  "velvet-comet": { crops: "soil", clouds: true },
};

/** Where a speaker usually is (for panels that don't say). */
const homeOf = (who?: string): string | undefined =>
  who ? characterById(who)?.placeId : undefined;

/** The unit a speaker appears as on the table, if any. */
const unitOf = (who: string): string | undefined =>
  characterById(who)?.unitId ?? (PROFILES[who] ? who : undefined);

const factionOfSpeaker = (who: string): string | null | undefined =>
  characterById(who)?.faction ?? PROFILES[who]?.faction;

function backdrop(k: Kit, placeId: string | undefined, sky: Sky): void {
  switch (placeId) {
    case "prismwick-lawn":
      k.backdrop(lawn(sky === "dusk" || sky === "night" ? "dusk" : "day"));
      return;
    case "star-lens": {
      k.backdrop(orbit());
      const lens = k.add(
        "ix-abs",
        starLens(),
        "left:62%;top:6%;width:44cqh;height:44cqh;z-index:15",
      );
      k.anim(lens, [{ transform: "rotate(0deg)" }, { transform: "rotate(40deg)" }], {
        dur: k.dur,
        ease: "linear",
      });
      return;
    }
    case "sett-lab":
      k.backdrop(lab());
      return;
    case "haybright-farm":
      k.backdrop(barnFront());
      return;
    case "wellspring": {
      k.backdrop(creekCutaway());
      const g = k.add(
        "ix-glow ix-loop",
        "",
        "left:50%;top:86%;width:80cqh;height:80cqh;margin:-40cqh 0 0 -40cqh;background:radial-gradient(rgba(230,255,160,0.85), transparent 68%)",
      );
      k.anim(
        g,
        [
          { opacity: 0.55, transform: "scale(0.9)" },
          { opacity: 1, transform: "scale(1.08)" },
        ],
        { dur: 900, iterations: Infinity, direction: "alternate", ease: "ease-in-out", hold: 1 },
      );
      return;
    }
    default:
      k.backdrop(valley({ sky, ...(placeId ? VALLEY[placeId] : {}) }));
  }
}

function placeSign(k: Kit, placeId: string | undefined): void {
  const name = placeId ? placeById(placeId)?.name : undefined;
  if (!name || placeId === "wellspring") return;
  const s = k.add(
    "ix-plank cmp-sign",
    esc(name),
    "left:3%;top:5%;font-size:3.4cqh;transform:rotate(-3deg)",
  );
  k.anim(
    s,
    [
      { transform: "translateY(-30cqh) rotate(-3deg)" },
      { transform: "translateY(0) rotate(-3deg)" },
    ],
    { at: 80, dur: 380, ease: "cubic-bezier(.2,1.3,.4,1)" },
  );
}

/** Aunt Dot's radio set, for when she's broadcasting to somewhere other than the Grange Hall. */
const RADIO = `<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M78 40 L100 6" stroke="#1c1512" stroke-width="7" stroke-linecap="round"/><circle cx="100" cy="6" r="6" fill="#e2483d" stroke="#1c1512" stroke-width="3"/><rect x="10" y="40" width="100" height="70" rx="12" fill="#1c1512" transform="translate(5 5)"/><rect x="10" y="40" width="100" height="70" rx="12" fill="#c98a4b" stroke="#1c1512" stroke-width="5"/><circle cx="42" cy="76" r="20" fill="#3a2e26" stroke="#1c1512" stroke-width="4"/><g stroke="#8a7a66" stroke-width="3"><path d="M28 70 H56"/><path d="M28 78 H56"/><path d="M30 86 H54"/></g><rect x="70" y="56" width="30" height="14" rx="3" fill="#fff3c0" stroke="#1c1512" stroke-width="4"/><circle cx="78" cy="88" r="7" fill="#f6e3b6" stroke="#1c1512" stroke-width="4"/><circle cx="96" cy="88" r="7" fill="#f6e3b6" stroke="#1c1512" stroke-width="4"/></svg>`;

/** Radio waves spreading from a point. */
function waves(k: Kit, x: number, y: number): void {
  for (let i = 0; i < 3; i++) {
    const r = k.add(
      "ix-abs ix-loop",
      "",
      `left:${x}%;top:${y}%;width:26cqh;height:26cqh;margin:-13cqh 0 0 -13cqh;border-radius:50%;border:0.9cqh solid #fff3c0;z-index:40;box-shadow:0 0 0 0.4cqh rgba(28,21,18,0.6)`,
    );
    k.anim(
      r,
      [
        { transform: "scale(0.15)", opacity: 1 },
        { transform: "scale(1)", opacity: 0 },
      ],
      {
        at: 100 + i * 420,
        dur: 1260,
        iterations: Infinity,
        ease: "ease-out",
        hold: 0.25 + i * 0.25,
      },
    );
  }
}

/** Draw the speaker and return where their speech bubble goes. */
function speaker(
  k: Kit,
  who: string,
  side: "left" | "right",
  placeId: string | undefined,
): { x: number; y: number } {
  const left = side === "left";
  const unit = unitOf(who);
  if (unit) {
    const generic = !characterById(who);
    const x = left ? 24 : 76;
    if (generic) {
      // A few of the troopers, the one in front doing the talking.
      for (const [dx, dy, kk] of [
        [-11, -6, 11],
        [11, -5, 11],
      ] as const) {
        const m = k.mini(unit, {
          x: x + (left ? dx : -dx),
          y: 92 + dy,
          k: kk,
          flip: !left,
          bob: true,
          z: 30,
        });
        k.fadeIn(m, 120, 300);
      }
    }
    const m = k.mini(unit, { x, y: 96, k: generic ? 15 : 17, flip: !left, bob: true, z: 60 });
    k.anim(
      m,
      [{ transform: `translateX(${left ? -50 : 50}cqw)` }, { transform: "translateX(0)" }],
      { dur: 520, ease: "cubic-bezier(.2,.9,.3,1.08)" },
    );
    return { x: left ? 40 : 60, y: 46 };
  }
  if (who === "aunt-dot") {
    // On the radio: waves from the Grange Hall mast if we're there, otherwise from a radio set.
    if (placeId === "grange-hall") {
      const m = hallMast();
      waves(k, m.x, m.y);
      return { x: m.x + 2, y: m.y - 3 };
    }
    const x = left ? 20 : 80;
    const radio = k.add(
      "ix-abs",
      RADIO,
      `left:${x}%;top:78%;width:30cqh;height:30cqh;margin:-15cqh 0 0 -15cqh;z-index:60`,
    );
    k.pop(radio, 80, 360);
    waves(k, x + (left ? 6 : -6), 58);
    return { x: left ? 36 : 64, y: 46 };
  }
  if (who === "lady-prismwick") {
    // The Court of Disdain holds up its scores.
    ["2", "1", "3"].forEach((n, i) => {
      const card = k.add(
        "ix-abs",
        scoreCard(n),
        `left:${(left ? 8 : 64) + i * 10}%;top:62%;width:14cqh;height:20cqh;z-index:90`,
      );
      k.anim(
        card,
        [
          { transform: "translateY(60cqh)" },
          { transform: "translateY(-3cqh) rotate(-4deg)", offset: 0.7 },
          { transform: "translateY(0) rotate(2deg)" },
        ],
        { at: 200 + i * 160, dur: 420 },
      );
    });
    return { x: left ? 40 : 60, y: 52 };
  }
  // Anyone else without a miniature (Lucky Lew): their side's emblem.
  const f = characterById(who)?.faction ?? "militia";
  const em = k.emblem(f, left ? 20 : 80, 66, 30);
  em.style.zIndex = "60";
  k.pop(em, 100, 380);
  return { x: left ? 36 : 64, y: 46 };
}

function title(k: Kit, text: string, sub?: string): void {
  const t = k.add(
    "ix-title",
    esc(text),
    "left:50%;top:9%;font-size:10cqh;text-align:center;white-space:normal;width:92cqw",
  );
  k.anim(
    t,
    [
      { transform: "translateX(-50%) scale(2.4) rotate(-6deg)", opacity: 0 },
      { transform: "translateX(-50%) scale(0.95) rotate(-2deg)", opacity: 1, offset: 0.7 },
      { transform: "translateX(-50%) scale(1) rotate(-2deg)", opacity: 1 },
    ],
    {
      at: 150,
      dur: 420,
      ease: "ease-in",
    },
  );
  k.sfx("slam", 300, 0.7);
  if (sub) {
    const s = k.add(
      "ix-sub",
      esc(sub),
      "left:50%;top:33%;transform:translateX(-50%) rotate(-1deg)",
    );
    k.fadeIn(s, 620, 300);
  }
}

/** How long a panel stays up: long enough to read its caption and bubble. */
export function panelDuration(p: Pick<StoryPanel, "caption" | "text" | "title">): number {
  const chars = (p.text?.length ?? 0) + p.caption.length * 0.7 + (p.title?.length ?? 0) * 0.3;
  return Math.round(Math.min(8500, Math.max(3400, 1900 + chars * 42)));
}

function sceneFor(p: ScenePanel, faction: LoreFactionId, rival: LoreFactionId | null): SceneDef {
  const placeId = p.placeId ?? homeOf(p.who);
  const text = p.text ? fillStory(p.text, rival) : undefined;
  const caption = fillStory(p.caption, rival);
  return {
    dur: panelDuration({ ...p, caption, text }),
    caption,
    build: (k) => {
      backdrop(k, placeId, p.sky ?? "day");
      if (p.versus) {
        const r = k.add(
          "ix-rays",
          "",
          `${rays("rgba(42,31,25,0.55)", "rgba(60,44,34,0.35)")};opacity:0.6`,
        );
        k.anim(r, [{ transform: "rotate(0deg)" }, { transform: "rotate(18deg)" }], {
          dur: k.dur,
          ease: "linear",
        });
        p.versus.forEach((f, i) => {
          const e = k.emblem(f, i ? 77 : 23, 68, 34);
          e.style.zIndex = "70";
          k.anim(
            e,
            [{ transform: `translateX(${i ? 60 : -60}cqw)` }, { transform: "translateX(0)" }],
            { at: 200 + i * 220, dur: 380, ease: "cubic-bezier(.2,.9,.3,1.08)" },
          );
          k.sfx("thunk", 450 + i * 220, 0.6);
        });
        const vs = k.add(
          "ix-title",
          "VS",
          "left:50%;top:58%;font-size:12cqh;transform:translateX(-50%)",
        );
        k.pop(vs, 800, 300);
      } else placeSign(k, placeId);
      if (p.title) title(k, p.title, p.sub);
      const side = p.side ?? (p.who && factionOfSpeaker(p.who) !== faction ? "right" : "left");
      // The starburst goes on the other side from the speech bubble.
      if (p.burst)
        k.burst(p.burst.word, side === "left" ? 86 : 16, side === "left" ? 20 : 30, {
          size: 18,
          at: 250,
          color: p.burst.color,
          rot: side === "left" ? 8 : -8,
        });
      if (p.who && text) {
        const at = speaker(k, p.who, side, placeId);
        k.bubble(text, at.x, at.y, {
          right: side === "right",
          at: p.title ? 900 : 450,
          w: 40,
          shout: text.endsWith("!") && text.length < 40,
        });
      }
    },
  };
}

/** The miniatures a set of panels shows, painted before the scene starts. */
function castOf(panels: ScenePanel[]): string[] {
  const out = new Set<string>();
  for (const p of panels) {
    const u = p.who ? unitOf(p.who) : undefined;
    if (u) out.add(u);
  }
  return [...out];
}

/** Who's talking, for the caption of a speaker's panel. */
function attribution(who: string): string {
  const c = characterById(who);
  if (c) return `${c.name}: ${c.title.charAt(0).toLowerCase()}${c.title.slice(1)}.`;
  return PROFILES[who] ? `${PROFILES[who]!.name}.` : "";
}

/**
 * A panel with both a title card and a speaker becomes two: the title card (with the caption), then
 * the speaker (captioned with who they are), so the title and the speech bubble never collide.
 */
export function splitPanels(panels: ScenePanel[]): ScenePanel[] {
  return panels.flatMap((p) =>
    p.title && p.who && p.text
      ? [
          { ...p, who: undefined, text: undefined },
          {
            ...p,
            title: undefined,
            sub: undefined,
            versus: undefined,
            burst: undefined,
            caption: attribution(p.who) || p.caption,
          },
        ]
      : [p],
  );
}

/** Play a story scene. Resolves when it closes (played out or skipped). */
export function playStory(
  titleText: string,
  story: ScenePanel[],
  faction: LoreFactionId,
  rival: LoreFactionId | null,
  reduced?: boolean,
): Promise<void> {
  const panels = splitPanels(story);
  if (!panels.length) return Promise.resolve();
  let handle: IntroHandle;
  try {
    handle = playIntro(
      {
        id: "story",
        title: titleText,
        cast: castOf(panels),
        scenes: panels.map((p) => sceneFor(p, faction, rival)),
      },
      reduced === undefined ? {} : { reduced },
    );
  } catch (err) {
    console.warn("Couldn't play the story scene:", err);
    return Promise.resolve();
  }
  return handle.done.then(() => undefined);
}
