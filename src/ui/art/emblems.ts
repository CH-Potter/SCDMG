// Faction emblems, the game wordmark, and small figure tokens for DOM use, all drawn in code as SVG
// in the same inked cartoon style as the board. Nothing from user data is ever written into the SVG
// as text: custom factions only contribute a sanitised colour, a known `look`, and a hash of the name.

import { factionOf } from "../../engine/data/factions";
import type { Faction } from "../../engine/types";
import { figureDataUrl, type FigureSpec, type Look } from "./figures";
import { hash } from "./ink";
import { css, mix, safeColor, shade } from "./palette";

const INK = "#1c1512";
let uid = 0;

const LOOKS: Look[] = ["cap", "teeth", "crystal", "plain"];
const safeLook = (l: unknown): Look => (LOOKS.includes(l as Look) ? (l as Look) : "plain");

function svg(size: number, body: string, label: string, cls = "emblem"): string {
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${label}">${body}</svg>`;
}

/** Halftone pattern + light/shadow defs, unique per SVG instance. */
function defs(id: string, shadowColor: string): string {
  return `<defs><pattern id="ht${id}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="1" cy="1" r="0.9" fill="${shadowColor}"/></pattern></defs>`;
}

function cogPath(cx: number, cy: number, r0: number, r1: number, teeth: number): string {
  let d = "";
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 ? r0 : r1;
    const p = (a: number) => `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
    d += `${i ? "L" : "M"} ${p(a0 + 0.05)} L ${p(a1 - 0.05)} `;
  }
  return d + "Z";
}

function starPath(cx: number, cy: number, r0: number, r1: number, n: number, rot = -Math.PI / 2): string {
  let d = "";
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r0 : r1;
    d += `${i ? "L" : "M"} ${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)} `;
  }
  return d + "Z";
}

// The three built-in factions' emblems follow the Hard Ink direction of the miniatures: one bold
// silhouette each (a riveted plate, a carapace, a medallion), the faction's own palette (the
// miniatures' colourways), a heavy ink edge with a drop shadow, and two or three accents at most.

/** Dustline Militia: a riveted khaki work-suit plate, a rifle crossed with a wheat ear, and two orange rank chevrons. The frontier, drafted. */
function militia(color: number, id: string): string {
  const acc = css(color);
  const plate = "#a48d5e";
  const plateDk = "#6f5d3b";
  const plateLt = "#dccb9c";
  const shape = "M15 5 L49 5 L58 14 L58 38 C58 50 46 57 32 62 C18 57 6 50 6 38 L6 14 Z";
  const seam = "M16.5 10 L47.5 10 L53 15.5 L53 37.5 C53 47 43 52.5 32 56.5 C21 52.5 11 47 11 37.5 L11 15.5 Z";
  const grains = [0, 1, 2, 3]
    .map((i) => {
      const t = 3 + i * 3.4;
      const x = 20 + t * 0.707;
      const y = 18 + t * 0.707;
      return `<ellipse cx="${(x - 2.2).toFixed(2)}" cy="${(y + 1.1).toFixed(2)}" rx="2.6" ry="1.4" transform="rotate(-20 ${(x - 2.2).toFixed(2)} ${(y + 1.1).toFixed(2)})"/><ellipse cx="${(x + 1.1).toFixed(2)}" cy="${(y - 2.2).toFixed(2)}" rx="2.6" ry="1.4" transform="rotate(-70 ${(x + 1.1).toFixed(2)} ${(y - 2.2).toFixed(2)})"/>`;
    })
    .join("");
  const rivets = [
    [14.5, 12.5],
    [49.5, 12.5],
    [12.5, 33],
    [51.5, 33],
    [32, 59.2],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.9" fill="#ddd3ba" stroke="${INK}" stroke-width="1.1"/>`)
    .join("");
  const chevron = (y: number) =>
    `<path d="M21 ${y + 6} L32 ${y} L43 ${y + 6}" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><path d="M21 ${y + 6} L32 ${y} L43 ${y + 6}" fill="none" stroke="${acc}" stroke-width="3.8" stroke-linejoin="round" stroke-linecap="round"/>`;
  return `${defs(id, "rgba(28,21,18,0.4)")}
  <clipPath id="c${id}"><path d="${shape}"/></clipPath>
  <path d="${shape}" fill="${INK}" transform="translate(2 2)"/>
  <path d="${shape}" fill="${plate}"/>
  <g clip-path="url(#c${id})"><rect x="33" y="0" width="31" height="64" fill="${plateDk}" opacity="0.5"/><rect x="33" y="0" width="31" height="64" fill="url(#ht${id})"/></g>
  <path d="${seam}" fill="none" stroke="${plateDk}" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="${shape}" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M16 8.2 L47.5 8.2" stroke="${plateLt}" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M46 42 L20 16" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/>
  <path d="M46 42 L20 16" stroke="#e8c25a" stroke-width="2.2" stroke-linecap="round"/>
  <g fill="#e8c25a" stroke="${INK}" stroke-width="1">${grains}</g>
  <path d="M18.5 42.5 L45.5 15.5" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
  <path d="M18.5 42.5 L28 33" stroke="#7a4a2a" stroke-width="4.4" stroke-linecap="round"/>
  <path d="M28 33 L45.5 15.5" stroke="#4a5158" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M30.5 30.5 L35 26" stroke="#4a5158" stroke-width="4.6" stroke-linecap="butt"/>
  ${chevron(41)}${chevron(48)}
  ${rivets}`;
}

/** The Skitterswarm: a violet carapace with a bug's head front-on: slanted acid eyes, hooked ivory mandibles and a drip of acid. */
function swarm(color: number, id: string): string {
  const acid = css(color);
  const glow = css(mix(color, 0xf0ffb0, 0.4));
  const chitin = "#5e3478";
  const deep = "#2b1838";
  const ridge = "#7d4f9c";
  const ivory = "#d6cba8";
  const shape = "M32 3 C45 4 56 12 58 25 C60 39 50 53 32 62 C14 53 4 39 6 25 C8 12 19 4 32 3 Z";
  return `${defs(id, "rgba(20,10,28,0.5)")}
  <clipPath id="c${id}"><path d="${shape}"/></clipPath>
  <path d="${shape}" fill="${INK}" transform="translate(2 2)"/>
  <path d="${shape}" fill="${chitin}"/>
  <g clip-path="url(#c${id})"><rect x="32" y="0" width="32" height="64" fill="${deep}" opacity="0.45"/><rect x="32" y="0" width="32" height="64" fill="url(#ht${id})"/></g>
  <path d="M9 21 C21 15 43 15 55 21 M7 36 C21 30 43 30 57 36 M32 4 L32 15" stroke="${deep}" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M10 19.5 C21 14 31 13 31 13 M8 34.5 C18 29.5 28 28.6 31 28.6" stroke="${ridge}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="${shape}" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M15 11.5 C20 7.5 26 5.8 31 5.8" stroke="#a681c4" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M27 22 C23 15 18 11 12 9 M37 22 C41 15 46 11 52 9" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
  <path d="M27 22 C23 15 18 11 12 9 M37 22 C41 15 46 11 52 9" stroke="${acid}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <path d="M19 22 L45 22 L50.5 31 L43 41 L21 41 L13.5 31 Z" fill="#3a2150" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M21 24.6 L33 24" stroke="${ridge}" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M17.5 28.5 L28.8 31.6 L27.2 36 L19.8 33.6 Z" fill="${glow}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M46.5 28.5 L35.2 31.6 L36.8 36 L44.2 33.6 Z" fill="${glow}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="21.5" cy="30.4" r="0.9" fill="#ffffff"/><circle cx="42.5" cy="30.4" r="0.9" fill="#ffffff"/>
  <path d="M23.5 40 C17 43 15.5 50.5 21 55 C21.5 49.5 25 46.4 30.5 45.2 Z" fill="${ivory}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M40.5 40 C47 43 48.5 50.5 43 55 C42.5 49.5 39 46.4 33.5 45.2 Z" fill="${ivory}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M21.5 44.5 l2.2 1.2 M42.5 44.5 l-2.2 1.2" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>
  <path d="M32 45 C34.4 49.4 34.8 52 32 54 C29.2 52 29.6 49.4 32 45 Z" fill="${acid}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
  <circle cx="32" cy="57.6" r="1.4" fill="${acid}" stroke="${INK}" stroke-width="0.9"/>`;
}

/** Lumen Concord: a pearl mask with smug, half-lidded crystal eyes under a gold fan crest, on a navy deco sunburst medallion. */
function concord(color: number, id: string): string {
  const glow = css(mix(color, 0xffffff, 0.45));
  const gold = "#d2b05a";
  const navy = "#232848";
  const pearl = "#eeeaf4";
  const pearlDk = "#b9b1cf";
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r1 = i % 2 ? 19 : 21.5;
    return `M${(32 + Math.cos(a) * 12).toFixed(1)} ${(35 + Math.sin(a) * 12).toFixed(1)} L${(32 + Math.cos(a) * r1).toFixed(1)} ${(35 + Math.sin(a) * r1).toFixed(1)}`;
  }).join(" ");
  const blades = [-2, -1, 0, 1, 2]
    .map((k) => {
      const a = ((-90 + k * 23) * Math.PI) / 180;
      const n = a + Math.PI / 2;
      const bx = 32 + Math.cos(a) * 4;
      const by = 23 + Math.sin(a) * 4;
      const tx = 32 + Math.cos(a) * (k === 0 ? 17 : 15);
      const ty = 23 + Math.sin(a) * (k === 0 ? 17 : 15);
      const p = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;
      return `M${p(bx + Math.cos(n) * 3.6, by + Math.sin(n) * 3.6)} L${p(tx, ty)} L${p(bx - Math.cos(n) * 3.6, by - Math.sin(n) * 3.6)} Z`;
    })
    .join(" ");
  const eye = (cx: number, dir: 1 | -1) => {
    const x0 = cx - 3.2 * dir;
    const x1 = cx + 3.2 * dir;
    return `<path d="M${x0} 34.2 C${cx - 1.6 * dir} 32.4 ${cx + 1.6 * dir} 32.2 ${x1} 33.6 C${cx + 1.4 * dir} 35.8 ${cx - 1.6 * dir} 36 ${x0} 34.2 Z" fill="${glow}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M${x0 - 0.4 * dir} 34 C${cx - 1.6 * dir} 32 ${cx + 1.6 * dir} 31.8 ${x1 + 0.4 * dir} 33.4 L${x1} 34.4 C${cx + 1.4 * dir} 33.5 ${cx - 1.6 * dir} 33.6 ${x0} 34.6 Z" fill="${navy}"/>`;
  };
  return `${defs(id, "rgba(16,18,44,0.45)")}
  <circle cx="34" cy="37" r="26" fill="${INK}"/>
  <circle cx="32" cy="35" r="26" fill="${navy}" stroke="${INK}" stroke-width="3"/>
  <path d="M32 9 A26 26 0 0 1 32 61 Z" fill="url(#ht${id})"/>
  <circle cx="32" cy="35" r="22.8" fill="none" stroke="${gold}" stroke-width="2"/>
  <path d="${rays}" stroke="${gold}" stroke-width="2" stroke-linecap="round"/>
  <circle cx="32" cy="35" r="11.5" fill="${css(mix(color, 0x232848, 0.55))}" opacity="0.9"/>
  <path d="${blades}" fill="${gold}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M32 21 C38.4 21 41.4 26.4 41.4 33 C41.4 41 37 47.4 32 50.6 C27 47.4 22.6 41 22.6 33 C22.6 26.4 25.6 21 32 21 Z" fill="${pearl}"/>
  <path d="M32 21 C38.4 21 41.4 26.4 41.4 33 C41.4 41 37 47.4 32 50.6 Z" fill="${pearlDk}" opacity="0.6"/>
  <path d="M32 21 C38.4 21 41.4 26.4 41.4 33 C41.4 41 37 47.4 32 50.6 C27 47.4 22.6 41 22.6 33 C22.6 26.4 25.6 21 32 21 Z" fill="none" stroke="${INK}" stroke-width="2.2"/>
  <path d="M25.4 26 C26.4 24 28 23 29.6 22.6" stroke="#ffffff" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  ${eye(27.6, 1)}${eye(36.4, -1)}
  <path d="M32 24.2 L34 27 L32 29.8 L30 27 Z" fill="${glow}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="M29.6 43.4 L34.4 43.4" stroke="${pearlDk}" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M21.5 49 C26 53.6 38 53.6 42.5 49 L42.5 52.6 C38 57.6 26 57.6 21.5 52.6 Z" fill="${gold}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cx="32" cy="54" r="1.7" fill="${glow}" stroke="${INK}" stroke-width="0.9"/>`;
}

/** A procedural emblem for a custom faction: shape and pattern from its name hash, icon from its look. */
function custom(color: number, look: Look, seed: number, id: string): string {
  const c = css(color);
  const dk = css(shade(color, -0.4));
  const lt = css(shade(color, 0.45));
  const shapes = [
    "M10 14 L32 5 L54 14 L54 38 C54 50 44 57 32 60 C20 57 10 50 10 38 Z",
    "M32 4 C48 4 60 16 60 32 C60 48 48 60 32 60 C16 60 4 48 4 32 C4 16 16 4 32 4 Z",
    "M32 4 L56 18 L56 46 L32 60 L8 46 L8 18 Z",
    "M32 3 L60 32 L32 61 L4 32 Z",
  ];
  const shape = shapes[seed % shapes.length]!;
  const stripes = (seed >> 3) % 3;
  const band =
    stripes === 0
      ? `<path d="M4 40 L60 24 L60 32 L4 48 Z" fill="${dk}" opacity="0.6"/>`
      : stripes === 1
        ? `<path d="M22 0 L30 0 L30 64 L22 64 Z M34 0 L42 0 L42 64 L34 64 Z" fill="${dk}" opacity="0.45"/>`
        : `<circle cx="32" cy="32" r="16" fill="${dk}" opacity="0.4"/>`;
  const icon =
    look === "cap"
      ? `<path d="${cogPath(32, 32, 9, 12.5, 8)}" fill="#4c5158" stroke="${INK}" stroke-width="2.2"/><circle cx="32" cy="32" r="4.5" fill="${lt}" stroke="${INK}" stroke-width="1.8"/>`
      : look === "teeth"
        ? `<path d="M16 28 C18 22 46 22 48 28 C48 40 40 46 32 46 C24 46 16 40 16 28 Z" fill="#3a0a16" stroke="${INK}" stroke-width="2.2"/><path d="M18 28 l3 6 l3 -6 l3 6 l3 -6 l3 6 l3 -6 l3 6 l3 -6 l3 6 l2 -6" fill="#f2ead2" stroke="${INK}" stroke-width="1"/>`
        : look === "crystal"
          ? `<path d="M32 14 L42 30 L32 50 L22 30 Z" fill="${lt}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M32 14 L42 30 L32 50 Z" fill="${dk}" opacity="0.45"/><path d="M26 27 L30 19" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`
          : `<path d="${starPath(32, 32, 6, 14, 5)}" fill="${lt}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`;
  return `${defs(id, "rgba(28,21,18,0.35)")}
  <clipPath id="cl${id}"><path d="${shape}"/></clipPath>
  <path d="${shape}" fill="${INK}" transform="translate(2 2)"/>
  <path d="${shape}" fill="${c}"/>
  <g clip-path="url(#cl${id})">${band}<rect x="34" y="0" width="30" height="64" fill="url(#ht${id})"/></g>
  <path d="${shape}" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  ${icon}`;
}

/** An original emblem for a faction (built-in or custom), as an inline SVG string. */
export function factionEmblemSvg(factionId: string, size = 48): string {
  const id = `e${++uid}`;
  const n = Math.max(8, Math.min(512, Math.round(Number(size) || 48)));
  let f: Faction | null = null;
  try {
    f = factionOf(factionId);
  } catch {
    f = null;
  }
  const color = safeColor(f?.color);
  if (factionId === "militia") return svg(n, militia(color, id), "Dustline Militia emblem");
  if (factionId === "swarm") return svg(n, swarm(color, id), "The Skitterswarm emblem");
  if (factionId === "concord") return svg(n, concord(color, id), "Lumen Concord emblem");
  const seed = hash(String(f?.name ?? factionId));
  return svg(n, custom(color, safeLook(f?.look), seed, id), "Faction emblem");
}

/** An emblem for an arbitrary colour + look (e.g. while editing a faction in the forge). */
export function emblemFor(color: number, look: Look, name: string, size = 48): string {
  return svg(Math.max(8, Math.min(512, Math.round(size))), custom(safeColor(color), safeLook(look), hash(String(name)), `e${++uid}`), "Faction emblem");
}

/** A small figure-on-base image for DOM use (data URL), in the board's art style. */
export function tokenDataUrl(color: number, look: Look, px: number): string {
  const l = safeLook(look);
  const spec: FigureSpec = {
    kind: l === "teeth" ? "critter" : "trooper",
    look: l,
    color: safeColor(color),
    r: l === "teeth" ? 0.42 : 0.5,
    ranged: l !== "teeth",
    melee: l === "teeth" || l === "crystal",
    long: false,
    medic: false,
    caster: false,
    spitter: false,
    jump: false,
    armoured: l === "plain",
    heavy: false,
  };
  return figureDataUrl(spec, 0x9a8f80, px);
}

/** The game wordmark. `compact` gives the short SCDMG badge for the top bar. */
export function wordmarkSvg(compact = false): string {
  const id = `w${++uid}`;
  const die = (x: number, y: number, s: number) =>
    `<g transform="translate(${x} ${y}) rotate(-12)"><rect x="${-s / 2 + 1.5}" y="${-s / 2 + 1.5}" width="${s}" height="${s}" rx="${s * 0.2}" fill="${INK}"/><rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${s * 0.2}" fill="#fff3d6" stroke="${INK}" stroke-width="2.4"/>${[[-0.25, -0.25], [0.25, 0.25], [0, 0], [0.25, -0.25], [-0.25, 0.25]].map(([a, b]) => `<circle cx="${a! * s}" cy="${b! * s}" r="${s * 0.08}" fill="#e0443a"/>`).join("")}</g>`;
  const font = `font-family="'Bowlby One','Arial Black',Impact,sans-serif"`;
  if (compact) {
    return `<svg class="wordmark compact" viewBox="0 0 150 44" width="150" height="44" role="img" aria-label="SCDMG">
      <defs><pattern id="ht${id}" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="rgba(28,21,18,0.3)"/></pattern></defs>
      <path d="M10 6 L144 4 L138 40 L4 40 Z" fill="${INK}" transform="translate(2.5 2.5)"/>
      <path d="M10 6 L144 4 L138 40 L4 40 Z" fill="#ffc23a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M10 6 L144 4 L138 40 L4 40 Z" fill="url(#ht${id})"/>
      <text x="74" y="33" text-anchor="middle" ${font} font-size="27" fill="#fff3d6" stroke="${INK}" stroke-width="6" stroke-linejoin="round" paint-order="stroke" letter-spacing="1">SCDMG</text>
      ${die(140, 10, 15)}
    </svg>`;
  }
  return `<svg class="wordmark" viewBox="0 0 460 120" width="460" height="120" role="img" aria-label="Super Cool Desktop Miniatures Game">
    <defs><pattern id="ht${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(20)"><circle cx="1.2" cy="1.2" r="1" fill="rgba(28,21,18,0.28)"/></pattern></defs>
    <path d="M14 34 L452 26 L444 104 L6 108 Z" fill="${INK}" transform="translate(4 4)"/>
    <path d="M14 34 L452 26 L444 104 L6 108 Z" fill="#ffc23a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M14 34 L452 26 L444 104 L6 108 Z" fill="url(#ht${id})"/>
    <path d="M24 6 L330 3 L326 32 L20 34 Z" fill="${INK}" transform="translate(3 3)"/>
    <path d="M24 6 L330 3 L326 32 L20 34 Z" fill="#fff3d6" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <text x="175" y="26" text-anchor="middle" ${font} font-size="17" fill="${INK}" letter-spacing="1.5" textLength="280" lengthAdjust="spacingAndGlyphs">SUPER COOL DESKTOP</text>
    <text x="222" y="80" text-anchor="middle" ${font} font-size="46" fill="#fff3d6" stroke="${INK}" stroke-width="9" stroke-linejoin="round" paint-order="stroke" letter-spacing="1" textLength="370" lengthAdjust="spacingAndGlyphs">MINIATURES</text>
    <text x="222" y="101" text-anchor="middle" ${font} font-size="20" fill="${INK}" letter-spacing="8">GAME</text>
    ${die(420, 30, 30)}
  </svg>`;
}
