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

/** The Munch: a chrome-jawed beetle wearing the overmind lens, on a hive-hex plate wired with glowing nodes. */
function munch(color: number, id: string): string {
  const glow = css(mix(color, 0xe8ff9a, 0.35));
  const ring = css(color);
  const hex = (r: number, cy = 33) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      return `${(32 + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
    }).join(" ");
  const nodes = Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    return [32 + Math.cos(a) * 22.5, 33 + Math.sin(a) * 22.5] as const;
  });
  // three stubby legs a side, mirrored
  const legs = "M25 33 L18 30 L16 26 M24 40 L16 41 L13 44 M25 47 L19 51 L18 55";
  const mirror = "M39 33 L46 30 L48 26 M40 40 L48 41 L51 44 M39 47 L45 51 L46 55";
  return `${defs(id, "rgba(28,21,18,0.4)")}
  <polygon points="${hex(28)}" fill="${INK}" transform="translate(2 2)"/>
  <polygon points="${hex(28)}" fill="#3b4148" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <polygon points="${hex(22.5)}" fill="none" stroke="${ring}" stroke-width="2"/>
  ${nodes.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${glow}" stroke="${INK}" stroke-width="0.9"/>`).join("")}
  <path d="M32 5 L56 19 L56 47 L32 61 Z" fill="url(#ht${id})" opacity="0.8"/>
  <path d="${legs} ${mirror}" stroke="${INK}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${legs} ${mirror}" stroke="#6b4a33" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <ellipse cx="32" cy="43" rx="10.5" ry="12.5" fill="#5a3a26" stroke="${INK}" stroke-width="2.4"/>
  <path d="M32 43 m-10.5 0 a10.5 12.5 0 0 0 10.5 12.5 L32 30.5 a10.5 12.5 0 0 0 -10.5 12.5" fill="#6e4830"/>
  <path d="M25 36 Q26 32 30 31" stroke="#a7774f" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M32 31 L32 55" stroke="${INK}" stroke-width="1.4"/>
  <ellipse cx="32" cy="29" rx="8.5" ry="5" fill="#4a3020" stroke="${INK}" stroke-width="2.2"/>
  <path d="M28.5 18 C24 15 23.5 10 27.5 8 C27.5 11 29 13.5 31.5 15.5 Z" fill="#c9d0d6" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M35.5 18 C40 15 40.5 10 36.5 8 C36.5 11 35 13.5 32.5 15.5 Z" fill="#c9d0d6" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="32" cy="21.5" r="6.5" fill="#aeb8c0" stroke="${INK}" stroke-width="2.2"/>
  <path d="M27.5 19.5 A5 5 0 0 1 31 16.2" stroke="#eef2f5" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <circle cx="32" cy="21.5" r="4.2" fill="${glow}" opacity="0.35"/>
  <circle cx="32" cy="21.5" r="2.6" fill="${glow}" stroke="${INK}" stroke-width="1.2"/>
  <circle cx="31.2" cy="20.7" r="0.8" fill="#ffffff"/>`;
}

/** Lumen Concord: a smug alien in a fishbowl helmet, gold collar and little crown, on a radiant medallion. */
function concord(color: number, id: string): string {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `M${(32 + Math.cos(a) * 18).toFixed(1)} ${(34 + Math.sin(a) * 18).toFixed(1)} L${(32 + Math.cos(a) * 25).toFixed(1)} ${(34 + Math.sin(a) * 25).toFixed(1)}`;
  }).join(" ");
  const skin = "#9fe3c4";
  const lid = "#74c4a2";
  return `${defs(id, "rgba(44,47,88,0.4)")}
  <circle cx="34" cy="36" r="26" fill="${INK}"/>
  <circle cx="32" cy="34" r="26" fill="#2c2f58" stroke="${INK}" stroke-width="3"/>
  <circle cx="32" cy="34" r="22.5" fill="none" stroke="#dcb55a" stroke-width="2.2"/>
  <path d="${rays}" stroke="${css(shade(color, 0.5))}" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>
  <circle cx="32" cy="33" r="15.5" fill="${css(mix(color, 0xffffff, 0.6))}" opacity="0.28"/>
  <path d="M23.5 34 C23.5 25 27 20.5 32 20.5 C37 20.5 40.5 25 40.5 34 C40.5 40 37 44 32 45 C27 44 23.5 40 23.5 34 Z" fill="${skin}" stroke="${INK}" stroke-width="2"/>
  <path d="M36 23 C38.5 25 39.5 29 39.3 33" stroke="${lid}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <ellipse cx="28" cy="34" rx="3.4" ry="2.5" fill="${INK}" transform="rotate(12 28 34)"/>
  <ellipse cx="36" cy="34" rx="3.4" ry="2.5" fill="${INK}" transform="rotate(-12 36 34)"/>
  <path d="M24.6 33.2 C25.5 31 30 31.2 31.4 33.6 Z M39.4 33.2 C38.5 31 34 31.2 32.6 33.6 Z" fill="${lid}" stroke="${INK}" stroke-width="1"/>
  <circle cx="29" cy="34.7" r="0.7" fill="#ffffff"/><circle cx="37" cy="34.7" r="0.7" fill="#ffffff"/>
  <path d="M29.5 40.3 Q32.5 41.6 35 39.4" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <circle cx="32" cy="33" r="15.5" fill="none" stroke="${INK}" stroke-width="2.4"/>
  <path d="M21 28 A12 12 0 0 1 28.5 19.4" stroke="#ffffff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.85"/>
  <circle cx="41.5" cy="25" r="1.2" fill="#ffffff" opacity="0.8"/>
  <path d="M19.5 45 C24 50 40 50 44.5 45 L44.5 49 C40 54.5 24 54.5 19.5 49 Z" fill="#dcb55a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="32" cy="50.6" r="1.8" fill="${css(shade(color, 0.3))}" stroke="${INK}" stroke-width="0.9"/>
  <path d="M25 13.5 L27.2 16.6 L29.6 11.4 L32 15.6 L34.4 11.4 L36.8 16.6 L39 13.5 L38 19 L26 19 Z" fill="#dcb55a" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
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
