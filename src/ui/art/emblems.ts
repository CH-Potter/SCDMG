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

/** Dustline Militia: a riveted sheet-metal plate with a tractor cog and a wheat sheaf. */
function militia(color: number, id: string): string {
  const c = css(color);
  const dk = css(shade(color, -0.35));
  return `${defs(id, "rgba(28,21,18,0.35)")}
  <path d="M10 14 L32 5 L54 14 L54 38 C54 50 44 57 32 60 C20 57 10 50 10 38 Z" fill="${INK}" transform="translate(2 2)"/>
  <path d="M10 14 L32 5 L54 14 L54 38 C54 50 44 57 32 60 C20 57 10 50 10 38 Z" fill="${c}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M32 60 C44 57 54 50 54 38 L54 14 L48 12 L48 38 C48 48 40 53 32 56 Z" fill="${dk}"/>
  <path d="M32 60 C44 57 54 50 54 38 L54 14 L48 12 L48 38 C48 48 40 53 32 56 Z" fill="url(#ht${id})"/>
  <path d="M14 16 L32 9" stroke="#fff3d6" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
  <rect x="15" y="44" width="9" height="8" rx="1" fill="#5c7389" stroke="${INK}" stroke-width="1.4" transform="rotate(-8 19 48)"/>
  <rect x="16.5" y="45.5" width="6" height="5" rx="0.5" fill="none" stroke="#fff3d6" stroke-width="0.8" stroke-dasharray="1.2 1" transform="rotate(-8 19 48)"/>
  <path d="${cogPath(32, 31, 10, 13.5, 9)}" fill="#4c5158" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <circle cx="32" cy="31" r="5" fill="${c}" stroke="${INK}" stroke-width="2"/>
  <path d="M27 26 A 7 7 0 0 1 35 24" stroke="#c9ced2" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M32 50 L32 20 M32 24 l-4 -4 M32 24 l4 -4 M32 30 l-4 -4 M32 30 l4 -4 M32 36 l-4 -4 M32 36 l4 -4" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
  <path d="M32 50 L32 20 M32 24 l-4 -4 M32 24 l4 -4 M32 30 l-4 -4 M32 30 l4 -4 M32 36 l-4 -4 M32 36 l4 -4" stroke="#e8c25a" stroke-width="2" stroke-linecap="round"/>
  ${[[14, 17], [50, 17], [14, 37], [50, 37], [32, 55]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#c9c2b4" stroke="${INK}" stroke-width="1"/>`).join("")}`;
}

/** The Munch: a hungry round maw full of teeth, two mean eyes, a drip of drool. */
function munch(color: number, id: string): string {
  const c = css(mix(shade(color, -0.1), 0x4d5a62, 0.25));
  const stripe = css(color);
  const teethTop = Array.from({ length: 7 }, (_, i) => {
    const x = 15 + i * 5;
    return `M${x} 36 L${x + 2.5} ${43 + (i % 2) * 2} L${x + 5} 36`;
  }).join(" ");
  const teethBot = Array.from({ length: 6 }, (_, i) => {
    const x = 17.5 + i * 5;
    return `M${x} 51 L${x + 2.5} ${45 - (i % 2) * 2} L${x + 5} 51`;
  }).join(" ");
  return `${defs(id, "rgba(28,21,18,0.35)")}
  <path d="M8 34 C8 16 20 6 32 6 C46 6 57 17 56 33 C55 50 45 59 32 59 C18 59 8 50 8 34 Z" fill="${INK}" transform="translate(2 2)"/>
  ${([[14, 12, -0.5], [24, 6, -0.15], [36, 6, 0.15], [47, 11, 0.5]] as [number, number, number][]).map(([x, y, r]) => `<path d="M${x - 4} ${y + 6} L${x} ${y - 6} L${x + 4} ${y + 6} Z" fill="#f2ead2" stroke="${INK}" stroke-width="2" stroke-linejoin="round" transform="rotate(${(r as number) * 40} ${x} ${y})"/>`).join("")}
  <path d="M8 34 C8 16 20 6 32 6 C46 6 57 17 56 33 C55 50 45 59 32 59 C18 59 8 50 8 34 Z" fill="${c}" stroke="${INK}" stroke-width="3"/>
  <path d="M56 33 C55 50 45 59 32 59 C40 54 48 46 50 32 C51 24 49 16 45 11 C52 16 56 24 56 33 Z" fill="url(#ht${id})"/>
  <path d="M14 22 Q18 26 16 31 M20 15 Q25 20 23 26" stroke="${stripe}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M12 38 C14 32 50 32 52 38 C52 50 44 55 32 55 C20 55 12 50 12 38 Z" fill="#c2475e" stroke="${INK}" stroke-width="2.4"/>
  <path d="M15 39 C17 35 47 35 49 39 C49 48 42 52 32 52 C22 52 15 48 15 39 Z" fill="#3a0a16"/>
  <ellipse cx="32" cy="47" rx="8" ry="3" fill="#e46a82"/>
  <path d="${teethTop}" fill="#f2ead2" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="${teethBot}" fill="#f2ead2" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
  <ellipse cx="23" cy="25" rx="5" ry="4.2" fill="#ffd23a" stroke="${INK}" stroke-width="1.8"/><ellipse cx="24" cy="25" rx="1.2" ry="3.2" fill="${INK}"/>
  <ellipse cx="41" cy="24" rx="5.4" ry="4.6" fill="#ffd23a" stroke="${INK}" stroke-width="1.8"/><ellipse cx="42" cy="24" rx="1.3" ry="3.4" fill="${INK}"/>
  <path d="M17 18 L28 22 M47 17 L36 21" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  <path d="M38 52 Q39 57 38 60" stroke="#c6ea52" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="38" cy="60.5" r="1.8" fill="#c6ea52" stroke="${INK}" stroke-width="0.8"/>`;
}

/** Lumen Concord: a radiant faceted crystal under a little crown, on a gold-rimmed medallion. */
function concord(color: number, id: string): string {
  const g = css(mix(shade(color, 0.45), 0xf4f0ff, 0.25));
  const gd = css(shade(color, -0.1));
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `M${(32 + Math.cos(a) * 18).toFixed(1)} ${(34 + Math.sin(a) * 18).toFixed(1)} L${(32 + Math.cos(a) * 25).toFixed(1)} ${(34 + Math.sin(a) * 25).toFixed(1)}`;
  }).join(" ");
  return `${defs(id, "rgba(44,47,88,0.4)")}
  <circle cx="34" cy="36" r="26" fill="${INK}"/>
  <circle cx="32" cy="34" r="26" fill="#2c2f58" stroke="${INK}" stroke-width="3"/>
  <circle cx="32" cy="34" r="22.5" fill="none" stroke="#dcb55a" stroke-width="2.2"/>
  <path d="${rays}" stroke="${css(shade(color, 0.5))}" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>
  <path d="M32 12 L44 30 L32 56 L20 30 Z" fill="${g}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M32 12 L44 30 L32 56 Z" fill="${gd}" opacity="0.55"/>
  <path d="M32 12 L44 30 L32 56 Z" fill="url(#ht${id})"/>
  <path d="M20 30 L44 30 M32 12 L28 30 L32 56" stroke="${INK}" stroke-width="1" opacity="0.5" fill="none"/>
  <path d="M25 27 L30 17" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M23 9 L26 13 L29 7 L32 12 L35 7 L38 13 L41 9 L40 15 L24 15 Z" fill="#dcb55a" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
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
  if (factionId === "munch") return svg(n, munch(color, id), "The Munch emblem");
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
