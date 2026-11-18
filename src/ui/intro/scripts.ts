// The storyboards: the game intro (about 19 s) and one intro per built-in faction (about 16 s each).
// Captions come from the canonical lore (src/engine/data/lore.ts); the pictures are the game's own
// miniatures, emblems and wordmark on inked backdrops. Positions are panel percent (x, y: a figure's
// feet), sizes are cqh (percent of panel height). Every scene's final frame is a good still, which is
// what the reduced-motion storyboard shows.

import { LORE_FACTIONS, WORLD, leaderOf, type LoreFactionId } from "../../engine/data/lore";
import { wordmarkSvg } from "../art/emblems";
import { esc } from "../describe";
import { barnDoor, barnFront, creekCutaway, hallMast, HOLLOW_EGGS, hole, hollow, lawn, lightGate, mound, orbit, pumpkin, rays, scoreCard, starLens, valley } from "./backdrops";
import type { IntroDef, Kit, SceneDef } from "./stage";

// ---------------------------------------------------------------- shared bits

/** Fizz bubbles rising in a loop between two heights. */
function fizz(k: Kit, x: number, spread: number, from: number, to: number, n: number, seed = 1): void {
  for (let i = 0; i < n; i++) {
    const r = ((i * 7919 + seed * 104729) % 1000) / 1000;
    const s = 1.2 + r * 2.2;
    const bx = x + (r - 0.5) * spread;
    const b = k.add("ix-fizz ix-loop", "", `left:${bx}%;top:${from}%;width:${s}cqh;height:${s}cqh`);
    k.anim(b, [{ transform: "translate(0,0)", opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: `translate(${(r - 0.5) * 3}cqh, ${-(from - to)}cqh)`, opacity: 0 }], {
      at: Math.round(r * 1400),
      dur: 1400 + r * 900,
      iterations: Infinity,
      ease: "ease-in",
      hold: 0.3 + r * 0.5,
    });
  }
}

/** A glow that pulses. */
function glow(k: Kit, x: number, y: number, size: number, color: string, at = 0): HTMLElement {
  const g = k.add("ix-glow ix-loop", "", `left:${x}%;top:${y}%;width:${size}cqh;height:${size}cqh;margin:${-size / 2}cqh 0 0 ${-size / 2}cqh;background:radial-gradient(${color}, transparent 68%)`);
  k.anim(g, [{ opacity: 0.55, transform: "scale(0.9)" }, { opacity: 1, transform: "scale(1.08)" }], { at, dur: 900, iterations: Infinity, direction: "alternate", ease: "ease-in-out", hold: 1 });
  return g;
}

/** Rings spreading out from a point (radio waves, a tremor, a targeting ping). */
function rings(k: Kit, x: number, y: number, size: number, color: string, n = 3, at = 0, arc = false): void {
  for (let i = 0; i < n; i++) {
    const r = k.add(
      "ix-abs ix-loop",
      "",
      `left:${x}%;top:${y}%;width:${size}cqh;height:${size}cqh;margin:${-size / 2}cqh 0 0 ${-size / 2}cqh;border-radius:50%;border:0.9cqh solid ${color};${arc ? "border-bottom-color:transparent;border-left-color:transparent;transform:rotate(-45deg);" : ""}z-index:40;box-shadow:0 0 0 0.4cqh rgba(28,21,18,0.6)`,
    );
    k.anim(r, [{ transform: `${arc ? "rotate(-45deg) " : ""}scale(0.15)`, opacity: 1 }, { transform: `${arc ? "rotate(-45deg) " : ""}scale(1)`, opacity: 0 }], {
      at: at + i * 420,
      dur: 1260,
      iterations: Infinity,
      ease: "ease-out",
      hold: 0.25 + i * 0.25,
    });
  }
}

/** Slide something in from off-panel to where it stands. */
function enter(k: Kit, el: Element, from: "left" | "right" | "top" | "bottom", at: number, dur = 600, dist = 70): void {
  const t = from === "left" ? `translateX(-${dist}cqw)` : from === "right" ? `translateX(${dist}cqw)` : from === "top" ? `translateY(-${dist}cqh)` : `translateY(${dist}cqh)`;
  k.anim(el, [{ transform: t }, { transform: "translate(0,0)" }], { at, dur, ease: "cubic-bezier(.2,.9,.3,1.08)" });
}

/** Fly across the whole panel (hold the middle of the pass for the still). */
function flyAcross(k: Kit, el: Element, rightToLeft: boolean, at: number, dur: number): void {
  const a = rightToLeft ? 80 : -80;
  k.anim(el, [{ transform: `translateX(${a}cqw)` }, { transform: `translateX(${-a}cqw)` }], { at, dur, ease: "linear", hold: 0.5 });
}

/** Big inked display text. */
function title(k: Kit, text: string, x: number, y: number, size: number, align: "left" | "center" = "center"): HTMLElement {
  return k.add("ix-title", esc(text).replace(/\n/g, "<br>"), `left:${x}%;top:${y}%;font-size:${size}cqh;${align === "center" ? "transform:translateX(-50%);text-align:center" : ""}`);
}

/** Slam text (or anything) in from huge. */
function slam(k: Kit, el: HTMLElement, at: number, centered = false): void {
  const c = centered ? "translateX(-50%) " : "";
  k.anim(el, [{ transform: `${c}scale(2.6) rotate(-6deg)`, opacity: 0 }, { transform: `${c}scale(0.94) rotate(-2deg)`, opacity: 1, offset: 0.7 }, { transform: `${c}scale(1) rotate(-2deg)`, opacity: 1 }], {
    at,
    dur: 420,
    ease: "ease-in",
  });
}

/** A free-floating SVG or picture at (x%, y%) (centre), w × h in cqh. */
function art(k: Kit, html: string, x: number, y: number, w: number, h: number, z = 50, extra = ""): HTMLElement {
  return k.add("ix-abs", html, `left:${x}%;top:${y}%;width:${w}cqh;height:${h}cqh;margin:${-h / 2}cqh 0 0 ${-w / 2}cqh;z-index:${z};${extra}`);
}

/** A beam of light from (x%, top%) down to (x%, bottom%), `w` cqh wide at the bottom. */
function beam(k: Kit, x: number, top: number, bottom: number, w: number, at: number, color?: string): HTMLElement {
  const b = k.add("ix-beam", "", `left:${x}%;top:${top}%;height:${bottom - top}%;width:${w}cqh;margin-left:${-w / 2}cqh;${color ? `background:linear-gradient(${color}, transparent)` : ""}`);
  k.anim(b, [{ transform: "scaleY(0)", opacity: 0 }, { transform: "scaleY(1)", opacity: 0.95 }], { at, dur: 380 });
  return b;
}

/** The faction title card: sunburst, emblem, name, tagline, the leader's line, and a lineup of miniatures on the table. */
function titleCard(k: Kit, fid: LoreFactionId, o: { a: string; b: string; name: [string, string]; lineup: string[] }): void {
  const L = LORE_FACTIONS[fid];
  const leader = leaderOf(fid);
  const r = k.add("ix-rays", "", rays(o.a, o.b));
  k.anim(r, [{ transform: "rotate(0deg)" }, { transform: "rotate(22deg)" }], { dur: k.dur, ease: "linear" });
  k.add("ix-abs ix-table", "", "left:0;right:0;bottom:0;height:17%;z-index:5");
  const em = k.emblem(fid, 19, 38, 46);
  em.style.zIndex = "110";
  k.pop(em, 80, 420);
  const t = title(k, `${o.name[0]}\n${o.name[1]}`, 37, 8, 12.5, "left");
  slam(k, t, 260);
  const sub = k.add("ix-sub", esc(L.tagline), "left:37%;top:37%;transform:rotate(-1.5deg)");
  k.fadeIn(sub, 620, 300);
  const q = k.add("ix-quote", `“${esc(L.quote)}”<cite>${esc(leader.name)}</cite>`, "left:37%;top:48%;max-width:58cqw;transform:rotate(0.8deg)");
  k.pop(q, 900, 360);
  const n = o.lineup.length;
  o.lineup.forEach((id, i) => {
    const x = 9 + (i * 82) / Math.max(1, n - 1);
    const m = k.mini(id, { x, y: 95, k: 8.5, base: true, bob: true, z: 60 + i });
    enter(k, m, "bottom", 1300 + i * 120, 420, 40);
  });
  k.sfx("jingle", 260, 0.8);
  k.sfx("thunk", 1300, 0.6);
}

// ---------------------------------------------------------------- the game intro

const gameScenes = (): SceneDef[] => {
  const c = WORLD.intro;
  return [
    {
      dur: 3400,
      caption: c[0]!,
      build: (k) => {
        const bd = k.backdrop(valley({ sky: "dawn", road: "ends", silo: true, barn: true, pump: true, fence: true }));
        k.anim(bd, [{ transform: "scale(1.14) translateY(3%)" }, { transform: "scale(1)" }], { dur: 3400, ease: "cubic-bezier(.2,.6,.3,1)" });
        const p1 = k.add("ix-plank", "PAVED ROAD ENDS", "left:6%;top:70%;transform:rotate(-5deg)");
        const p2 = k.add("ix-plank", "THE DUSTLINE ➜", "left:66%;top:74%;transform:rotate(4deg);background-color:#d49a5c");
        k.anim(p1, [{ transform: "translateY(60cqh) rotate(-5deg)" }, { transform: "translateY(0) rotate(-5deg)" }], { at: 300, dur: 450, ease: "cubic-bezier(.2,1.3,.4,1)" });
        k.anim(p2, [{ transform: "translateY(60cqh) rotate(4deg)" }, { transform: "translateY(0) rotate(4deg)" }], { at: 650, dur: 450, ease: "cubic-bezier(.2,1.3,.4,1)" });
        const t = title(k, "THE DUSTLINE", 50, 9, 15);
        slam(k, t, 1300, true);
        const s = k.add("ix-sub", "A farming valley · Population: stubborn", "left:50%;top:31%;transform:translateX(-50%) rotate(-1deg)");
        k.fadeIn(s, 1900, 400);
        k.sfx("whoosh", 300, 0.7);
        k.sfx("slam", 1450, 0.8);
      },
    },
    {
      dur: 3200,
      caption: c[1]!,
      build: (k) => {
        k.backdrop(creekCutaway());
        fizz(k, 50, 90, 47, 28, 16, 2);
        fizz(k, 50, 6, 84, 52, 8, 5);
        glow(k, 50, 88, 80, "rgba(230,255,160,0.85)");
        const pk = [
          [16, 38, 20, 300],
          [31, 39, 12, 520],
          [60, 37, 26, 740],
        ] as const;
        for (const [x, y, s, at] of pk) {
          const p = art(k, pumpkin(), x, y - s * 0.3, s, s * 0.9, 60);
          k.anim(p, [{ transform: "scale(0.2)", transformOrigin: "50% 100%" }, { transform: "scale(1.15)", offset: 0.7 }, { transform: "scale(1)" }], { at, dur: 600, ease: "ease-out" });
        }
        k.burst("FIZZ!", 86, 20, { size: 18, at: 1500, color: "#bdf5d6", rot: 8 });
        k.sfx("sparkle", 400);
        k.sfx("fizzle", 1500, 0.7);
      },
    },
    {
      dur: 3000,
      caption: c[2]!,
      build: (k) => {
        k.backdrop(valley({ sky: "dusk", crops: "corn", horizon: 470, sun: true }));
        const holes = [
          [20, 80, 500],
          [80, 77, 700],
          [33, 94, 900],
        ] as const;
        for (const [x, y, at] of holes) {
          const h = art(k, hole(), x, y, 20, 8, 30);
          k.pop(h, at - 200, 250);
          const b = k.mini("swarm-skitterlings", { x, y: y - 1, k: 13, z: 31, flip: x > 50 });
          k.anim(b, [{ transform: "translateY(30%) scale(0.2)", opacity: 0 }, { transform: "translateY(-35%) scale(1.05)", opacity: 1, offset: 0.55 }, { transform: "translateY(0) scale(1)", opacity: 1 }], { at, dur: 520 });
          k.dust(x, y, at, 8);
        }
        const borer = k.mini("swarm-borer", { x: 55, y: 89, k: 15, z: 60 });
        k.anim(borer, [{ transform: "translateY(70%)" }, { transform: "translateY(-6%)", offset: 0.75 }, { transform: "translateY(0)" }], { at: 1250, dur: 700, ease: "ease-out" });
        art(k, mound(), 55, 94, 62, 16, 70);
        k.dust(55, 88, 1300, 14);
        k.shake(300, 0.7);
        k.shake(1300, 1.3, 520);
        k.burst("KRA-KOOM!", 22, 30, { size: 22, at: 1350, color: "#d6f56a", rot: -10 });
        k.sfx("dig", 450);
        k.sfx("chomp", 800, 0.7);
        k.sfx("slam", 1300);
      },
    },
    {
      dur: 3000,
      caption: c[3]!,
      build: (k) => {
        k.backdrop(valley({ sky: "night", horizon: 650, silo: true, barn: true, pump: true, sun: false }));
        const lens = art(k, starLens(), 84, 17, 26, 26, 15);
        k.anim(lens, [{ transform: "rotate(0deg)", opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: "rotate(90deg)", opacity: 1 }], { dur: 3000, ease: "linear" });
        const ships = [
          [28, 44, 12, 0],
          [64, 30, 10, 300],
        ] as const;
        ships.forEach(([x, y, s, at], i) => {
          const m = k.mini("con-skiff", { x, y, k: s, z: 45 + i });
          k.anim(m, [{ transform: "translateY(-80cqh)" }, { transform: "translateY(2cqh)", offset: 0.85 }, { transform: "translateY(0)" }], { at, dur: 1100, ease: "ease-out" });
          beam(k, x, y - 1, i ? 88 : 92, 26, 1250 + i * 150);
        });
        const lancer = k.mini("con-lancer", { x: 28, y: 92, k: 13, z: 80 });
        k.anim(lancer, [{ filter: "brightness(5)", opacity: 0, transform: "scaleY(1.6)" }, { filter: "brightness(1)", opacity: 1, transform: "scaleY(1)" }], { at: 1650, dur: 450 });
        const dancer = k.mini("con-dancers", { x: 64, y: 88, k: 13, z: 79, flip: true });
        k.anim(dancer, [{ filter: "brightness(5)", opacity: 0, transform: "scaleY(1.6)" }, { filter: "brightness(1)", opacity: 1, transform: "scaleY(1)" }], { at: 1900, dur: 450 });
        k.sfx("whoosh", 200, 0.6);
        k.sfx("teleport", 1300);
        k.sfx("beam", 1700, 0.6);
      },
    },
    {
      dur: 3000,
      caption: c[4]!,
      build: (k) => {
        k.backdrop(valley({ sky: "day", fence: true, pump: true, silo: true, clouds: true }));
        const bertha = k.mini("mil-bertha", { x: 52, y: 76, k: 13, z: 40 });
        k.anim(bertha, [{ transform: "translateY(-90cqh)" }, { transform: "translateY(0)", offset: 0.8 }, { transform: "translateY(-2%)", offset: 0.9 }, { transform: "translateY(0)" }], { at: 150, dur: 650, ease: "ease-in" });
        k.shake(680, 1.2);
        k.dust(52, 76, 680, 12);
        k.burst("THUMP!", 80, 22, { size: 18, at: 700, rot: 10 });
        [10, 22, 34].forEach((x, i) => {
          const g = k.mini("mil-grunts", { x, y: i % 2 ? 88 : 94, k: 13, bob: true });
          enter(k, g, "left", 900 + i * 140, 500);
        });
        const medic = k.mini("mil-medic", { x: 44, y: 91, k: 13, bob: true });
        enter(k, medic, "left", 1350, 500);
        [70, 82, 93].forEach((x, i) => {
          const g = k.mini("mil-grannies", { x, y: i % 2 ? 90 : 95, k: 13, flip: true, bob: true });
          enter(k, g, "right", 1000 + i * 150, 500);
        });
        k.bubble("Not one inch.", 95, 70, { right: true, at: 1900, w: 30 });
        k.sfx("stomp", 680);
        k.sfx("shuffle", 950, 0.7);
        k.sfx("rally", 1900, 0.7);
      },
    },
    {
      dur: 3800,
      caption: c[5]!,
      build: (k) => {
        const r = k.add("ix-rays", "", rays("#2a1f19", "#3c2c22"));
        k.anim(r, [{ transform: "rotate(0deg)" }, { transform: "rotate(30deg)" }], { dur: 3800, ease: "linear" });
        k.add("ix-abs ix-table", "", "left:0;right:0;bottom:0;height:20%;z-index:5");
        const em = [
          ["militia", 15, 74, "left", 150],
          ["swarm", 50, 79, "bottom", 400],
          ["concord", 85, 74, "right", 650],
        ] as const;
        for (const [fid, x, y, from, at] of em) {
          const e = k.emblem(fid, x, y, 30);
          e.style.zIndex = "60";
          enter(k, e, from, at, 340, 60);
          k.shake(at + 300, 0.6, 260);
          k.sfx("slam", at + 280, 0.7);
        }
        for (const [x, y, at] of [
          [32, 78, 900],
          [68, 78, 1000],
        ] as const) {
          const vs = title(k, "VS", x, y - 7, 8);
          k.pop(vs, at, 280);
        }
        const wm = art(k, wordmarkSvg(), 50, 33, 150, 39, 120);
        k.anim(wm, [{ transform: "scale(2.4) rotate(-8deg)", opacity: 0 }, { transform: "scale(0.95) rotate(-1.5deg)", opacity: 1, offset: 0.7 }, { transform: "scale(1) rotate(-1.5deg)", opacity: 1 }], { at: 1400, dur: 460, ease: "ease-in" });
        k.shake(1780, 1);
        k.sfx("jingle", 1750);
      },
    },
  ];
};

export const GAME_INTRO = (): IntroDef => ({
  id: "game",
  title: WORLD.name,
  cast: ["swarm-skitterlings", "swarm-borer", "con-skiff", "con-lancer", "con-dancers", "mil-bertha", "mil-grunts", "mil-medic", "mil-grannies"],
  scenes: gameScenes(),
});

// ---------------------------------------------------------------- Dustline Militia

/** A painted unit marking on a plank, e.g. "3RD HAYBRIGHT SECTION". */
function marking(k: Kit, text: string, x: number, y: number, rot: number, at: number): HTMLElement {
  const m = k.add("ix-plank", esc(text), `left:${x}%;top:${y}%;transform:rotate(${rot}deg)`);
  k.anim(m, [{ transform: `translateY(-50cqh) rotate(${rot}deg)` }, { transform: `translateY(0) rotate(${rot}deg)` }], { at, dur: 420, ease: "cubic-bezier(.2,1.3,.4,1)" });
  return m;
}

const militiaScenes = (): SceneDef[] => {
  const c = LORE_FACTIONS.militia.intro;
  return [
    {
      dur: 3000,
      caption: c[0] ?? "When trouble comes up the valley, the Marshal calls the Muster roll.",
      build: (k) => {
        k.backdrop(valley({ sky: "dawn", hall: true, fence: true, pump: true }));
        const m = hallMast();
        rings(k, m.x, m.y, 26, "#fff3c0", 3, 100);
        marking(k, "DUSTLINE MUSTER · HQ", 40, 74, -3, 150);
        k.bubble("Muster roll! First Section!", m.x + 1.5, m.y - 4, { at: 450, w: 34 });
        k.bubble("All sections, fall in at the Crossing!", m.x + 3, m.y + 22, { at: 1500, w: 30, shout: true });
        // A dispatch rider is already on the way with the orders.
        const rider = k.mini("mil-riders", { x: 26, y: 93, k: 14, z: 80 });
        k.anim(rider, [{ transform: "translateX(-60cqw)" }, { transform: "translateX(0)" }], { at: 1700, dur: 700, ease: "cubic-bezier(.3,.8,.4,1)" });
        k.dust(20, 92, 2300, 9);
        k.sfx("rally", 450, 0.7);
        k.sfx("whoosh", 1700, 0.6);
      },
    },
    {
      dur: 3000,
      caption: c[1] ?? "Every family sends its hands: squads fall in, riveted into their armour.",
      build: (k) => {
        k.backdrop(valley({ sky: "day", fence: true, road: "dirt", clouds: true, silo: true }));
        marking(k, "3RD HAYBRIGHT SECTION", 6, 56, -2, 0);
        marking(k, "OLD GUARD", 62, 50, 3, 700);
        // The squad falls in: one step at a time, in a line, no bobbing about.
        [8, 19, 30, 41].forEach((x, i) => {
          const g = k.mini("mil-grunts", { x, y: 91, k: 14 });
          k.anim(g, [{ transform: "translateX(-70cqw)" }, { transform: "translateX(0)", offset: 0.85 }, { transform: "translateY(-1.5cqh)", offset: 0.92 }, { transform: "translate(0,0)" }], {
            at: i * 160,
            dur: 900,
            ease: "steps(6, end)",
          });
        });
        const medic = k.mini("mil-medic", { x: 52, y: 93, k: 13 });
        enter(k, medic, "left", 750, 650);
        [62, 73, 84].forEach((x, i) => {
          const g = k.mini("mil-grannies", { x, y: 78, k: 11 });
          k.pop(g, 900 + i * 150, 360);
        });
        k.burst("HUP!", 86, 26, { size: 18, at: 1700, rot: 8 });
        k.sfx("shuffle", 50, 0.8);
        k.sfx("thunk", 900, 0.5);
        k.sfx("stomp", 1700, 0.6);
      },
    },
    {
      dur: 3200,
      caption: c[2] ?? "Big Bertha strides out of the motor pool.",
      build: (k) => {
        k.backdrop(barnFront("MUSTER MOTOR POOL"));
        const bertha = k.mini("mil-bertha", { x: 50, y: 95, k: 19, z: 40 });
        k.anim(
          bertha,
          [
            { transform: "scale(0.62) translateY(-6%)", filter: "brightness(0.15)" },
            { transform: "scale(0.62) translateY(-6%)", filter: "brightness(0.15)", offset: 0.35 },
            { transform: "scale(0.9) translateY(-3%)", filter: "brightness(0.8)", offset: 0.7 },
            { transform: "scale(1) translateY(0)", filter: "brightness(1)" },
          ],
          { dur: 1650, ease: "ease-in" },
        );
        for (const [left, origin, dir] of [
          [27.5, "0% 50%", -1],
          [50, "100% 50%", 1],
        ] as const) {
          const d = k.add("ix-abs", barnDoor(), `left:${left}%;top:32.2%;width:22.5%;height:62.2%;z-index:50;transform-origin:${origin}`);
          k.anim(d, [{ transform: "perspective(60cqw) rotateY(0deg)" }, { transform: `perspective(60cqw) rotateY(${dir * 78}deg)` }], { at: 500, dur: 380, ease: "cubic-bezier(.3,1.4,.5,1)" });
        }
        k.shake(1650, 1.4);
        k.dust(36, 94, 1650, 12);
        k.dust(64, 94, 1700, 12);
        k.burst("KA-THUMP!", 78, 24, { size: 22, at: 1650, rot: 8 });
        k.sfx("thunk-heavy", 500, 0.8);
        k.sfx("stomp", 1650);
        k.sfx("cannon", 2400, 0.7);
      },
    },
    {
      dur: 3000,
      caption: c[3] ?? "The crop dusters fly over in formation.",
      build: (k) => {
        k.backdrop(valley({ sky: "day", horizon: 770, clouds: true, pump: true, barn: true, silo: true }));
        // A V of three, the leader out front, then the bomber the other way.
        for (const [x, y, s, at] of [
          [58, 46, 15, 0],
          [44, 34, 12, 120],
          [44, 60, 12, 120],
        ] as const) {
          const r = k.mini("mil-rustler", { x, y, k: s, z: 60 });
          flyAcross(k, r, false, at, 2700);
        }
        const bomber = k.mini("mil-bomber", { x: 52, y: 28, k: 12, z: 50, flip: true });
        flyAcross(k, bomber, true, 300, 2900);
        const mortar = k.mini("mil-mortar", { x: 13, y: 97, k: 12, z: 80 });
        k.pop(mortar, 0, 300);
        k.burst("PTOOMF!", 22, 70, { size: 14, at: 1300, rot: -6 });
        k.burst("BRRRAP!", 80, 72, { size: 16, at: 1000, rot: 6, color: "#ffd06a" });
        k.sfx("whoosh", 100, 0.7);
        k.sfx("burst", 1000, 0.6);
        k.sfx("cannon", 1300, 0.5);
      },
    },
    {
      dur: 3700,
      caption: c[4] ?? "Dustline Militia: rivets, rifles and a very long memory.",
      build: (k) => titleCard(k, "militia", { a: "#f28c28", b: "#f6a548", name: ["DUSTLINE", "MILITIA"], lineup: ["mil-grunts", "mil-squinter", "mil-bertha", "mil-grannies", "mil-medic", "mil-riders"] }),
    },
  ];
};

// ---------------------------------------------------------------- The Skitterswarm

/** Cracks spreading across the ground (an SVG overlay over the whole panel). */
function cracks(k: Kit, at: number): void {
  const paths = [
    "M800 900 L780 820 L820 760 L760 690 L800 640",
    "M780 820 L640 800 L560 840 L430 820",
    "M820 760 L960 740 L1050 780 L1190 760",
    "M760 690 L650 670 L600 700",
    "M300 900 L330 830 L280 780",
    "M1300 900 L1270 840 L1330 790",
  ];
  const d = paths.map((p) => `<path d="${p}"/>`).join("");
  const el = k.add(
    "ix-abs",
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="none" style="width:100%;height:100%"><g fill="none" stroke="#1c1512" stroke-width="16" stroke-linejoin="round" stroke-linecap="round">${d}</g><g fill="none" stroke="#d6f56a" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" opacity="0.8">${d}</g></svg>`,
    "inset:0;z-index:20",
  );
  k.anim(el, [{ clipPath: "circle(0% at 50% 100%)" }, { clipPath: "circle(80% at 50% 100%)" }], { at, dur: 1300, ease: "ease-out" });
}

const swarmScenes = (): SceneDef[] => {
  const c = LORE_FACTIONS.swarm.intro;
  return [
    {
      dur: 3000,
      caption: c[0] ?? "Under Badger Knob, the ground trembles.",
      build: (k) => {
        k.backdrop(valley({ sky: "dusk", crops: "corn", horizon: 470, barn: true }));
        k.shake(200, 0.5, 600);
        k.shake(1100, 0.9, 700);
        k.shake(2000, 1.3, 600);
        cracks(k, 900);
        // Feelers poke up out of the cracks, and duck back down.
        for (const [x, y, at] of [
          [48, 74, 1400],
          [70, 86, 1700],
        ] as const) {
          const h = art(k, hole(), x, y, 14, 5.5, 30);
          k.pop(h, at - 150, 200);
          const b = k.mini("swarm-skitterlings", { x, y: y - 0.5, k: 11, z: 31, flip: x > 50 });
          k.anim(b, [{ transform: "translateY(40%) scale(0.3)", opacity: 0 }, { transform: "translateY(-10%) scale(0.9)", opacity: 1, offset: 0.4 }, { transform: "translateY(0) scale(0.9)", opacity: 1 }], { at, dur: 600 });
        }
        k.burst("RRRMBLE...", 22, 30, { size: 17, at: 1100, color: "#d6f56a", rot: -6 });
        k.sfx("dig", 200, 0.6);
        k.sfx("thunk-heavy", 1100, 0.7);
        k.sfx("scurry", 1500, 0.6);
      },
    },
    {
      dur: 3200,
      caption: c[1] ?? "In the Brood Hollow, a thousand eggs glow in the warm dark.",
      build: (k) => {
        k.backdrop(hollow());
        for (const [i, e] of HOLLOW_EGGS.entries()) {
          glow(k, e.x, e.y, 30, "rgba(214,245,106,0.6)", i * 220);
          fizz(k, e.x, 8, e.y - 4, e.y - 30, 4, i + 3);
        }
        const tenders = k.mini("swarm-tenders", { x: 30, y: 93, k: 12, z: 70 });
        k.anim(tenders, [{ transform: "translateX(-40cqw)" }, { transform: "translateX(0)" }], { at: 200, dur: 1300, ease: "ease-out" });
        // An egg cracks, and something small and furious climbs out.
        const hatch = k.mini("swarm-skitterlings", { x: 64, y: 90, k: 12, z: 72, flip: true });
        k.anim(hatch, [{ transform: "translateY(30%) scale(0.2)", opacity: 0 }, { transform: "translateY(-30%) scale(1.1)", opacity: 1, offset: 0.6 }, { transform: "translateY(0) scale(1)", opacity: 1 }], { at: 1600, dur: 520 });
        k.burst("CRACK!", 74, 58, { size: 15, at: 1600, color: "#d6f56a", rot: 10 });
        k.sfx("fizzle", 200, 0.6);
        k.sfx("scurry", 400, 0.6);
        k.sfx("thunk", 1600, 0.6);
      },
    },
    {
      dur: 3200,
      caption: c[2] ?? "Mother Mandible is awake. Every one of them is hers.",
      build: (k) => {
        k.backdrop(hollow(true));
        const eyes = k.add("ix-abs", `<span></span><span></span>`, "left:45%;top:50%;width:12cqh;height:3.5cqh;z-index:80;display:flex;justify-content:space-between");
        eyes.querySelectorAll("span").forEach((sp) => ((sp as HTMLElement).style.cssText = "width:4cqh;height:3cqh;border-radius:50%;background:#d6f56a;box-shadow:0 0 2.4cqh #d6f56a,0 0 0 0.35cqh #1c1512"));
        k.anim(eyes, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, transform: "scaleY(1)", offset: 0.5 }, { opacity: 1, transform: "scaleY(0.1)", offset: 0.55 }, { opacity: 1, transform: "scaleY(1)", offset: 0.6 }, { opacity: 0 }], {
          at: 100,
          dur: 1200,
          hold: 0,
        });
        beam(k, 50, 0, 96, 72, 1150, "rgba(214,245,106,0.6)");
        rings(k, 50, 70, 70, "#d6f56a", 3, 1300);
        const mother = k.mini("swarm-mother", { x: 50, y: 94, k: 15, z: 60 });
        k.anim(mother, [{ filter: "brightness(0.04)" }, { filter: "brightness(0.04)", offset: 0.6 }, { filter: "brightness(1.25)", offset: 0.8 }, { filter: "brightness(1)" }], { dur: 1700 });
        k.bubble("*click-click* The ground is warm.", 52, 20, { at: 1900, w: 34 });
        k.sfx("thunk", 1150, 0.8);
        k.sfx("summon", 1300, 0.6);
        k.sfx("scurry", 2000, 0.7);
      },
    },
    {
      dur: 3000,
      caption: c[3] ?? "And every one of them is coming up.",
      build: (k) => {
        k.backdrop(valley({ sky: "dusk", crops: "corn", horizon: 470 }));
        // Tunnel mouths open across the field and the swarm pours out of them, running for the farms.
        const holes = [
          [16, 82, 0],
          [44, 92, 180],
          [30, 72, 360],
        ] as const;
        for (const [x, y, at] of holes) {
          const h = art(k, hole(), x, y, 18, 7, 30);
          k.pop(h, at, 220);
          k.dust(x, y, at + 100, 6);
        }
        const runners = [
          [40, 80, 0],
          [58, 92, 1],
          [72, 82, 2],
          [86, 94, 0],
          [62, 74, 2],
          [80, 72, 1],
        ] as const;
        runners.forEach(([x, y, from], i) => {
          const h = holes[from]!;
          const b = k.mini("swarm-skitterlings", { x, y, k: 11, bob: true });
          k.anim(b, [{ transform: `translate(${h[0] - x}cqw, ${(h[1] - y) * 0.9}cqh) scale(0.3)`, opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: "translate(0,0) scale(1)", opacity: 1 }], {
            at: 300 + i * 130,
            dur: 900,
            ease: "cubic-bezier(.2,.8,.3,1)",
          });
        });
        const spitters = k.mini("swarm-spitters", { x: 24, y: 95, k: 12 });
        k.pop(spitters, 1100, 340);
        const stingers = k.mini("swarm-stingers", { x: 62, y: 38, k: 13, bob: true });
        enter(k, stingers, "left", 200, 1100, 90);
        k.burst("SKITTER-SKITTER!", 74, 22, { size: 17, at: 1500, color: "#d6f56a", rot: 8 });
        k.shake(1500, 0.8);
        k.sfx("dig", 0, 0.6);
        k.sfx("scurry", 300);
        k.sfx("flutter", 400, 0.5);
        k.sfx("chomp", 1500, 0.8);
      },
    },
    {
      dur: 3700,
      caption: c[4] ?? "The Skitterswarm: the ground is hungry.",
      build: (k) => titleCard(k, "swarm", { a: "#2a1c24", b: "#3d2a36", name: ["SKITTER", "SWARM"], lineup: ["swarm-skitterlings", "swarm-spitters", "swarm-shellbacks", "swarm-mother", "swarm-lurker", "swarm-tenders"] }),
    },
  ];
};

// ---------------------------------------------------------------- Lumen Concord

const concordScenes = (): SceneDef[] => {
  const c = LORE_FACTIONS.concord.intro;
  return [
    {
      dur: 3000,
      caption: c[0]!,
      build: (k) => {
        k.backdrop(orbit());
        glow(k, 50, 86, 40, "rgba(233,255,138,0.9)");
        const lens = art(k, starLens(), 72, 30, 44, 44, 40);
        k.anim(lens, [{ transform: "translate(40cqw, -40cqh) scale(0.4) rotate(-120deg)" }, { transform: "translate(0,0) scale(1) rotate(0deg)" }], { at: 100, dur: 1400, ease: "cubic-bezier(.2,.8,.3,1)" });
        const line = k.add(
          "ix-abs",
          `<svg viewBox="0 0 1600 900" preserveAspectRatio="none" style="width:100%;height:100%"><path d="M1130 300 L800 772" stroke="#1c1512" stroke-width="12"/><path d="M1130 300 L800 772" stroke="#fff3c0" stroke-width="5" stroke-dasharray="20 14"/></svg>`,
          "inset:0;z-index:30",
        );
        k.fadeIn(line, 1500, 300);
        rings(k, 50, 86, 30, "#fff3c0", 3, 1700);
        k.burst("PING!", 30, 62, { size: 14, at: 1750, color: "#e3d6ff", rot: -6 });
        k.sfx("whoosh", 150, 0.6);
        k.sfx("chime", 1700, 0.8);
      },
    },
    {
      dur: 3000,
      caption: c[1]!,
      build: (k) => {
        k.backdrop(valley({ sky: "dusk", horizon: 640, barn: true, silo: true, pump: true }));
        const ships = [
          [22, 42, 11, 0, 88],
          [52, 26, 14, 250, 92],
          [80, 46, 11, 500, 90],
        ] as const;
        ships.forEach(([x, y, s, at, ground], i) => {
          const m = k.mini("con-skiff", { x, y, k: s, z: 50 + i });
          k.anim(m, [{ transform: "translateY(-80cqh)" }, { transform: "translateY(1.5cqh)", offset: 0.85 }, { transform: "translateY(0)" }], { at, dur: 1150, ease: "ease-out" });
          beam(k, x, y - 1, ground, s * 2, 1350 + i * 120);
        });
        const scouts = k.mini("con-sylph", { x: 66, y: 66, k: 12, z: 70 });
        k.anim(scouts, [{ transform: "translate(-90cqw, 20cqh)" }, { transform: "translate(0,0)" }], { at: 1700, dur: 700, ease: "cubic-bezier(.2,.8,.3,1)" });
        k.sfx("whoosh", 100, 0.6);
        k.sfx("teleport", 1350);
        k.sfx("whoosh", 1700, 0.5);
      },
    },
    {
      dur: 3300,
      caption: c[2]!,
      build: (k) => {
        k.backdrop(lawn("day"));
        glow(k, 48, 64, 78, "rgba(236,226,255,0.95)", 200);
        const gate = art(k, lightGate(), 48, 62, 38, 57, 30);
        k.anim(gate, [{ transform: "scaleY(0)", opacity: 0 }, { transform: "scaleY(1.06)", opacity: 1, offset: 0.7 }, { transform: "scaleY(1)", opacity: 1 }], { at: 150, dur: 520 });
        const sr = k.mini("con-facet", { x: 50, y: 95, k: 16, z: 60 });
        k.anim(sr, [{ transform: "translateY(-14%) scale(0.5)", filter: "brightness(6)", opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: "translateY(0) scale(1)", filter: "brightness(1)", opacity: 1 }], { at: 750, dur: 750, ease: "ease-out" });
        k.burst("FWAAAH!", 18, 26, { size: 18, at: 900, color: "#e3d6ff", rot: -8 });
        k.bubble("Do not be alarmed. You are merely being improved.", 66, 34, { at: 1700, w: 32 });
        k.sfx("teleport", 200);
        k.sfx("chime", 900);
      },
    },
    {
      dur: 3000,
      caption: c[3]!,
      build: (k) => {
        k.backdrop(lawn("day"));
        const snobs = [
          ["con-lancer", 14, 92],
          ["con-guard", 32, 88],
          ["con-dancers", 50, 93],
        ] as const;
        snobs.forEach(([id, x, y], i) => {
          const m = k.mini(id, { x, y, k: 14, bob: true });
          k.pop(m, i * 160, 360);
        });
        k.bubble("Oh no. Is that... corn?", 29, 46, { at: 700, w: 30 });
        const scores = [
          ["2", 68, 900],
          ["1", 80, 1080],
          ["3", 92, 1260],
        ] as const;
        for (const [s, x, at] of scores) {
          const card = art(k, scoreCard(s), x, 76, 15, 21, 90);
          k.anim(card, [{ transform: "translateY(60cqh)" }, { transform: "translateY(-3cqh) rotate(-4deg)", offset: 0.7 }, { transform: "translateY(0) rotate(2deg)" }], { at, dur: 420, ease: "ease-out" });
        }
        k.sfx("jingle-sour", 1300, 0.8);
      },
    },
    {
      dur: 3700,
      caption: c[4]!,
      build: (k) => titleCard(k, "concord", { a: "#2c2f58", b: "#3e3a7a", name: ["LUMEN", "CONCORD"], lineup: ["con-guard", "con-lancer", "con-facet", "con-dancers", "con-warden", "con-sylph"] }),
    },
  ];
};

const FACTION_INTROS: Record<LoreFactionId, () => IntroDef> = {
  militia: () => ({
    id: "militia",
    title: LORE_FACTIONS.militia.name,
    cast: ["mil-grunts", "mil-medic", "mil-grannies", "mil-riders", "mil-bertha", "mil-rustler", "mil-bomber", "mil-mortar", "mil-squinter"],
    scenes: militiaScenes(),
  }),
  swarm: () => ({
    id: "swarm",
    title: LORE_FACTIONS.swarm.name,
    cast: ["swarm-skitterlings", "swarm-tenders", "swarm-mother", "swarm-spitters", "swarm-stingers", "swarm-shellbacks", "swarm-borer"],
    scenes: swarmScenes(),
  }),
  concord: () => ({
    id: "concord",
    title: LORE_FACTIONS.concord.name,
    cast: ["con-skiff", "con-sylph", "con-facet", "con-lancer", "con-guard", "con-dancers", "con-warden"],
    scenes: concordScenes(),
  }),
};

export const factionIntro = (id: LoreFactionId): IntroDef => FACTION_INTROS[id]();
