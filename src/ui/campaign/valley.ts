// The campaign map: an inked, hand-drawn sketch of the Dustline (creek, mesas, roads and tunnels)
// with every place pinned on it. Positions are percent of the map box; the drawing is a 1000 x 640
// SVG stretched to fit, so the pins (HTML buttons, for keyboard and screen readers) line up with it.

/** Shorter names for the map pins, where the full name is long. */
export const PIN_LABEL: Record<string, string> = {
  "velvet-comet": "Velvet Comet wreck",
  "prismwick-lawn": "Prismwick's Lawn",
};

/** Where each place sits on the map, in percent (x from the left, y from the top). */
export const PLACE_POS: Record<string, { x: number; y: number }> = {
  "star-lens": { x: 91, y: 10 },
  "rattlevane-junction": { x: 26, y: 14 },
  "grange-hall": { x: 43, y: 21 },
  "haybright-farm": { x: 60, y: 12 },
  "prismwick-lawn": { x: 77, y: 22 },
  "mesa-ridge": { x: 10, y: 31 },
  "dustbowl-crossing": { x: 33, y: 41 },
  "old-refinery": { x: 66, y: 39 },
  "long-ridge-highway": { x: 89, y: 44 },
  "fizzwater-ford": { x: 51, y: 55 },
  wellspring: { x: 51, y: 70 },
  "scrapyard-sprawl": { x: 17, y: 58 },
  gutterbend: { x: 76, y: 63 },
  "sett-lab": { x: 31, y: 76 },
  "grubstake-redoubt": { x: 9, y: 85 },
  "brinejaw-flats": { x: 52, y: 89 },
  "gemhaul-road": { x: 72, y: 83 },
  "velvet-comet": { x: 87, y: 79 },
};

const ROADS: [string, string][] = [
  ["grange-hall", "dustbowl-crossing"],
  ["grange-hall", "haybright-farm"],
  ["haybright-farm", "prismwick-lawn"],
  ["grange-hall", "rattlevane-junction"],
  ["rattlevane-junction", "mesa-ridge"],
  ["mesa-ridge", "dustbowl-crossing"],
  ["dustbowl-crossing", "fizzwater-ford"],
  ["dustbowl-crossing", "scrapyard-sprawl"],
  ["fizzwater-ford", "old-refinery"],
  ["old-refinery", "prismwick-lawn"],
  ["old-refinery", "long-ridge-highway"],
  ["long-ridge-highway", "gutterbend"],
  ["fizzwater-ford", "gutterbend"],
  ["fizzwater-ford", "brinejaw-flats"],
  ["brinejaw-flats", "gemhaul-road"],
  ["gemhaul-road", "velvet-comet"],
  ["gemhaul-road", "gutterbend"],
  ["scrapyard-sprawl", "grubstake-redoubt"],
];

/** The Munch's tunnels, from the Sett Lab. */
const TUNNELS: [string, string][] = [
  ["sett-lab", "dustbowl-crossing"],
  ["sett-lab", "scrapyard-sprawl"],
  ["sett-lab", "wellspring"],
  ["sett-lab", "grubstake-redoubt"],
];

const INK = "#1c1512";
const P = (id: string) => {
  const p = PLACE_POS[id]!;
  return { x: p.x * 10, y: p.y * 6.4 };
};

const line = ([a, b]: [string, string], extra: string) => {
  const p = P(a);
  const q = P(b);
  // a gentle curve, bent the same way for the same pair
  const mx = (p.x + q.x) / 2 + (q.y - p.y) * 0.12;
  const my = (p.y + q.y) / 2 - (q.x - p.x) * 0.06;
  return `<path d="M${p.x.toFixed(0)} ${p.y.toFixed(0)} Q${mx.toFixed(0)} ${my.toFixed(0)} ${q.x.toFixed(0)} ${q.y.toFixed(0)}" ${extra}/>`;
};

/** The map drawing (no pins). */
export function valleyMapSvg(): string {
  const creek = "M505 0 C470 70 540 120 520 180 S470 280 512 352 S470 430 470 470 S500 520 482 548";
  const mesasL =
    "M0 0 L0 640 L40 640 C60 560 30 520 55 470 C80 420 40 380 62 330 C80 280 50 230 70 170 C85 120 55 60 80 0 Z";
  const mesasR =
    "M1000 0 L1000 640 L968 640 C945 590 975 540 950 500 C930 455 965 420 945 360 C930 310 960 260 940 200 C925 150 955 90 930 0 Z";
  const fields = [
    [300, 90, 90, 40],
    [350, 150, 70, 34],
    [560, 120, 80, 36],
    [610, 200, 70, 30],
    [240, 300, 80, 34],
    [600, 300, 80, 34],
    [380, 330, 60, 28],
  ]
    .map(
      ([x, y, w, h]) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#cfd98a" stroke="${INK}" stroke-width="3" transform="rotate(-8 ${x! + w! / 2} ${y! + h! / 2})"/><path d="M${x! + 6} ${y! + h! / 2} h${w! - 12}" stroke="#9aa95a" stroke-width="3" stroke-dasharray="8 6" transform="rotate(-8 ${x! + w! / 2} ${y! + h! / 2})"/>`,
    )
    .join("");
  const knob = P("sett-lab");
  const lens = P("star-lens");
  const well = P("wellspring");
  const flats = P("brinejaw-flats");
  return `<svg class="cmp-map-art" viewBox="0 0 1000 640" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <pattern id="cmpHatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0 V10" stroke="rgba(28,21,18,0.08)" stroke-width="3"/></pattern>
      <radialGradient id="cmpGlow"><stop offset="0" stop-color="#e9ff8a" stop-opacity="0.95"/><stop offset="1" stop-color="#e9ff8a" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1000" height="640" fill="#ead2a0"/>
    <rect width="1000" height="640" fill="url(#cmpHatch)"/>
    <ellipse cx="${flats.x}" cy="${flats.y - 6}" rx="150" ry="52" fill="#f4ecd8" stroke="${INK}" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>
    ${fields}
    <path d="${mesasL}" fill="#c27b4c" stroke="${INK}" stroke-width="4"/>
    <path d="${mesasR}" fill="#c27b4c" stroke="${INK}" stroke-width="4"/>
    <path d="M0 250 C40 240 30 300 60 290" stroke="#8d5233" stroke-width="5" fill="none"/>
    <path d="M1000 330 C960 320 975 380 945 372" stroke="#8d5233" stroke-width="5" fill="none"/>
    <ellipse cx="${knob.x}" cy="${knob.y + 6}" rx="70" ry="34" fill="#a7774a" stroke="${INK}" stroke-width="4"/>
    <g fill="none" stroke-linecap="round">
      <path d="${creek}" stroke="${INK}" stroke-width="22"/>
      <path d="${creek}" stroke="#5fc7b4" stroke-width="14"/>
      <path d="${creek}" stroke="#d8fff2" stroke-width="3" stroke-dasharray="3 16"/>
    </g>
    <circle cx="${well.x}" cy="${well.y}" r="58" fill="url(#cmpGlow)"/>
    <path d="M${P("fizzwater-ford").x} ${P("fizzwater-ford").y + 22} V${well.y - 22}" stroke="#7fd36a" stroke-width="4" stroke-dasharray="4 7"/>
    <g fill="none" stroke-linecap="round">
      ${ROADS.map((r) => line(r, `stroke="${INK}" stroke-width="9"`)).join("")}
      ${ROADS.map((r) => line(r, `stroke="#f6e3b6" stroke-width="4" stroke-dasharray="10 8"`)).join("")}
      ${TUNNELS.map((t) => line(t, `stroke="#5e8d3c" stroke-width="4" stroke-dasharray="2 9" opacity="0.85"`)).join("")}
    </g>
    <g transform="translate(${lens.x} ${lens.y})">
      <circle r="44" fill="none" stroke="${INK}" stroke-width="13"/>
      <circle r="44" fill="none" stroke="#d8ccff" stroke-width="7"/>
      <path d="M-20 -30 L28 22" stroke="#fffaf0" stroke-width="4" opacity="0.8"/>
    </g>
    <path d="M${lens.x - 30} ${lens.y + 34} L${P("prismwick-lawn").x + 10} ${P("prismwick-lawn").y - 20}" stroke="#d8ccff" stroke-width="3" stroke-dasharray="6 8"/>
    <g transform="translate(965 610)" opacity="0.7"><circle r="18" fill="#f4ecd8" stroke="${INK}" stroke-width="3"/><path d="M0 -14 L5 0 L0 14 L-5 0 Z" fill="${INK}"/><text y="-22" text-anchor="middle" font-size="14" font-weight="700" fill="${INK}">N</text></g>
  </svg>`;
}
