// Inked comic backdrops for the intros, drawn in code as SVG (viewBox 1600 × 900, the panel's 16:9).
// Thick warm-black outlines, flat cel colours and halftone shading, matching the board and emblems.
// All original: a frontier farming valley, the Skitterswarm's Brood Hollow, orbit, and a very smug lawn.

const INK = "#1c1512";
let uid = 0;

const svg = (body: string, defs = ""): string =>
  `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><defs>${defs}</defs>${body}</svg>`;

const halftone = (id: string, color = "rgba(28,21,18,0.22)", size = 12): string =>
  `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="${size / 4}" cy="${size / 4}" r="${size / 5}" fill="${color}"/></pattern>`;

const vgrad = (id: string, stops: [number, string][]): string =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`;

const rgrad = (id: string, stops: [number, string, number?][]): string =>
  `<radialGradient id="${id}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a ?? 1}"/>`).join("")}</radialGradient>`;

/** A tiny seeded RNG so backdrops are the same every time. */
function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const pts = (p: [number, number][]): string => p.map(([x, y]) => `${x},${y}`).join(" ");

// ---------------------------------------------------------------- valley

export type Sky = "dawn" | "day" | "dusk" | "night";

const SKIES: Record<Sky, { stops: [number, string][]; mesa: string; mesaDark: string; sun: string | null }> = {
  dawn: { stops: [[0, "#f39a57"], [0.45, "#ffcf86"], [1, "#fff1cc"]], mesa: "#c97c4f", mesaDark: "#9c5634", sun: "#fff3c0" },
  day: { stops: [[0, "#7ccbe6"], [0.6, "#bfe6ef"], [1, "#f1f6e6"]], mesa: "#cf9262", mesaDark: "#a46a40", sun: "#fff6cf" },
  dusk: { stops: [[0, "#3d2f6e"], [0.5, "#b8607a"], [1, "#f4a35c"]], mesa: "#7a4a62", mesaDark: "#523049", sun: "#ffd27a" },
  night: { stops: [[0, "#10153a"], [0.6, "#2c2a66"], [1, "#4e3d7a"]], mesa: "#3b3157", mesaDark: "#2a2242", sun: null },
};

export interface ValleyOpts {
  sky?: Sky;
  /** Horizon height (viewBox y). */
  horizon?: number;
  crops?: "wheat" | "corn" | "soil";
  road?: "dirt" | "ends" | null;
  hall?: boolean;
  barn?: boolean;
  silo?: boolean;
  pump?: boolean;
  fence?: boolean;
  clouds?: boolean;
  sun?: boolean;
}

/** Where the Grange Hall's radio mast tops out, in panel percent (for radio waves), for a given horizon. */
export const hallMast = (horizon = 560): { x: number; y: number } => ({ x: 985 / 16, y: (horizon + 44 - 304) / 9 });

function mesas(H: number, fill: string, dark: string): string {
  const far: [number, number][] = [
    [-20, H], [-20, H - 70], [90, H - 70], [130, H - 150], [330, H - 150], [370, H - 60], [520, H - 60], [560, H - 110], [700, H - 110],
    [735, H - 40], [930, H - 40], [980, H - 125], [1180, H - 125], [1220, H - 70], [1380, H - 70], [1420, H - 165], [1560, H - 165], [1620, H - 90], [1620, H],
  ];
  const shades = [
    [[330, H - 150], [370, H - 60], [330, H - 60]],
    [[700, H - 110], [735, H - 40], [700, H - 40]],
    [[1180, H - 125], [1220, H - 70], [1180, H - 70]],
    [[1560, H - 165], [1620, H - 90], [1620, H], [1560, H]],
  ] as [number, number][][];
  return `<polygon points="${pts(far)}" fill="${fill}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    ${shades.map((s) => `<polygon points="${pts(s)}" fill="${dark}"/>`).join("")}
    <path d="M140 ${H - 128} L320 ${H - 128} M990 ${H - 104} L1170 ${H - 104} M1430 ${H - 140} L1550 ${H - 140}" stroke="${dark}" stroke-width="6" stroke-linecap="round"/>`;
}

function fields(H: number, crops: "wheat" | "corn" | "soil", id: string): string {
  const [a, b, line] =
    crops === "corn" ? ["#86b24c", "#6f9c3e", "#4f7a2a"] : crops === "soil" ? ["#9a6a42", "#87593a", "#5e3c24"] : ["#e8c060", "#d6a84a", "#b0832e"];
  const vx = 800;
  const vy = H - 70;
  let s = "";
  for (let i = -14; i < 14; i++) {
    const x0 = vx + i * 220;
    const x1 = vx + (i + 1) * 220;
    // Extend each wedge from the vanishing point down past the bottom edge.
    const ext = (x: number) => vx + ((x - vx) * (980 - vy)) / (900 - vy);
    s += `<polygon points="${vx},${vy} ${ext(x0)},980 ${ext(x1)},980" fill="${i % 2 ? a : b}"/>`;
  }
  let rows = "";
  for (let i = -14; i <= 14; i++) {
    const x = vx + ((vx + i * 220 - vx) * (980 - vy)) / (900 - vy);
    rows += `M${vx} ${vy} L${x} 980 `;
  }
  return `<clipPath id="fc${id}"><rect x="0" y="${H}" width="1600" height="${900 - H}"/></clipPath>
    <g clip-path="url(#fc${id})">${s}<path d="${rows}" stroke="${line}" stroke-width="3" opacity="0.6"/>
    <rect x="0" y="${H}" width="1600" height="${900 - H}" fill="url(#ht${id})" opacity="0.5"/></g>
    <path d="M0 ${H} L1600 ${H}" stroke="${INK}" stroke-width="5"/>`;
}

function road(H: number, kind: "dirt" | "ends"): string {
  const top = `${780},${H} ${820},${H}`;
  let s = `<polygon points="${top} 1180,900 420,900" fill="#d9b27c" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M800 ${H + 6} L800 900" stroke="#c49a62" stroke-width="10" stroke-dasharray="40 60" opacity="0.7"/>`;
  if (kind === "ends") {
    const y = 770;
    const xl = 800 - ((800 - 420) * (y - H)) / (900 - H);
    const xr = 1600 - xl;
    s += `<polygon points="${xl},${y} ${xl + 60},${y - 12} ${xl + 130},${y + 6} ${xl + 220},${y - 10} 800,${y + 4} ${xr - 200},${y - 8} ${xr - 110},${y + 8} ${xr - 40},${y - 6} ${xr},${y} 1180,900 420,900" fill="#6b6862" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M800 ${y + 20} L800 900" stroke="#ffc23a" stroke-width="12" stroke-dasharray="44 30"/>
      <path d="M560 840 l40 -14 l30 10 M1010 812 l30 14 l36 -6" stroke="${INK}" stroke-width="4" fill="none"/>`;
  }
  return s;
}

function fence(H: number, gapFrom = 760, gapTo = 840): string {
  const y = H + 34;
  let posts = "";
  for (let x = 20; x < 1600; x += 80) {
    if (x > gapFrom && x < gapTo) continue;
    posts += `<rect x="${x - 7}" y="${y - 40}" width="14" height="52" rx="2" fill="#8a5a32" stroke="${INK}" stroke-width="4"/>`;
  }
  const rail = (dy: number) =>
    `<path d="M0 ${y - dy} L${gapFrom} ${y - dy} M${gapTo} ${y - dy} L1600 ${y - dy}" stroke="${INK}" stroke-width="12"/><path d="M0 ${y - dy} L${gapFrom} ${y - dy} M${gapTo} ${y - dy} L1600 ${y - dy}" stroke="#a8743f" stroke-width="5"/>`;
  return rail(30) + rail(10) + posts;
}

function silo(x: number, base: number): string {
  return `<g><rect x="${x}" y="${base - 250}" width="120" height="250" fill="#b9b3a6" stroke="${INK}" stroke-width="5"/>
    <rect x="${x + 80}" y="${base - 250}" width="40" height="250" fill="#968f82"/>
    <path d="M${x} ${base - 250} Q${x + 60} ${base - 330} ${x + 120} ${base - 250} Z" fill="#c95b3a" stroke="${INK}" stroke-width="5"/>
    ${[60, 120, 180].map((d) => `<path d="M${x} ${base - d} L${x + 120} ${base - d}" stroke="${INK}" stroke-width="3"/>`).join("")}
    <rect x="${x}" y="${base - 250}" width="120" height="250" fill="none" stroke="${INK}" stroke-width="5"/></g>`;
}

function barnBuilding(x: number, base: number): string {
  const w = 230;
  return `<g><polygon points="${x},${base - 150} ${x + w / 2},${base - 230} ${x + w},${base - 150} ${x + w},${base} ${x},${base}" fill="#b8452e" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <polygon points="${x + w * 0.6},${base - 200} ${x + w},${base - 150} ${x + w},${base} ${x + w * 0.6},${base}" fill="#8f3322" opacity="0.6"/>
    <polygon points="${x - 14},${base - 146} ${x + w / 2},${base - 244} ${x + w + 14},${base - 146} ${x + w + 4},${base - 140} ${x + w / 2},${base - 228} ${x - 4},${base - 140}" fill="#5a4a3e" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <rect x="${x + 70}" y="${base - 110}" width="90" height="110" fill="#f1e4c6" stroke="${INK}" stroke-width="4"/>
    <path d="M${x + 70} ${base - 110} L${x + 160} ${base} M${x + 160} ${base - 110} L${x + 70} ${base}" stroke="${INK}" stroke-width="4"/>
    <rect x="${x + 98}" y="${base - 190}" width="34" height="34" fill="#2a1a12" stroke="${INK}" stroke-width="4"/></g>`;
}

function windpump(x: number, base: number): string {
  const top = base - 290;
  const r = 78;
  let blades = "";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const a2 = a + 0.2;
    blades += `<polygon points="${x},${top} ${x + Math.cos(a) * r},${top + Math.sin(a) * r} ${x + Math.cos(a2) * r},${top + Math.sin(a2) * r}" fill="${i % 2 ? "#d8d2c4" : "#bfb7a6"}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
  }
  return `<g><path d="M${x - 50} ${base} L${x - 8} ${top + 20} M${x + 50} ${base} L${x + 8} ${top + 20} M${x - 40} ${base - 70} L${x + 40} ${base - 70} M${x - 28} ${base - 160} L${x + 28} ${base - 160} M${x - 44} ${base} L${x + 30} ${base - 160} M${x + 44} ${base} L${x - 30} ${base - 160}" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>
    <path d="M${x - 50} ${base} L${x - 8} ${top + 20} M${x + 50} ${base} L${x + 8} ${top + 20} M${x - 40} ${base - 70} L${x + 40} ${base - 70} M${x - 28} ${base - 160} L${x + 28} ${base - 160} M${x - 44} ${base} L${x + 30} ${base - 160} M${x + 44} ${base} L${x - 30} ${base - 160}" stroke="#7d8790" stroke-width="5" stroke-linecap="round"/>
    <polygon points="${x + 10},${top - 6} ${x + 130},${top - 30} ${x + 130},${top + 26} ${x + 10},${top + 6}" fill="#f28c28" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    ${blades}<circle cx="${x}" cy="${top}" r="14" fill="#4c5158" stroke="${INK}" stroke-width="4"/></g>`;
}

function grangeHall(base: number): string {
  const x = 640;
  return `<g>
    <rect x="${x}" y="${base - 120}" width="380" height="120" fill="#e9dcc0" stroke="${INK}" stroke-width="5"/>
    <rect x="${x + 260}" y="${base - 120}" width="120" height="120" fill="#cdbd9c"/>
    <polygon points="${x - 16},${base - 116} ${x + 190},${base - 196} ${x + 396},${base - 116}" fill="#6b4a3a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <rect x="${x + 110}" y="${base - 178}" width="160" height="40" rx="4" fill="#c08a52" stroke="${INK}" stroke-width="4"/>
    <text x="${x + 190}" y="${base - 149}" text-anchor="middle" font-family="'Bowlby One','Arial Black',Impact,sans-serif" font-size="25" fill="#fff3d6" stroke="${INK}" stroke-width="5" paint-order="stroke">GRANGE HALL</text>
    ${[30, 110, 250, 320].map((dx) => `<rect x="${x + dx}" y="${base - 90}" width="44" height="44" fill="#ffd96a" stroke="${INK}" stroke-width="4"/><path d="M${x + dx + 22} ${base - 90} L${x + dx + 22} ${base - 46} M${x + dx} ${base - 68} L${x + dx + 44} ${base - 68}" stroke="${INK}" stroke-width="3"/>`).join("")}
    <rect x="${x + 170}" y="${base - 80}" width="44" height="80" fill="#7a4f2e" stroke="${INK}" stroke-width="4"/>
    <path d="M${x + 345} ${base - 120} L${x + 345} ${base - 300 + 0}" stroke="${INK}" stroke-width="14"/>
    <path d="M${x + 345} ${base - 120} L${x + 345} ${base - 300}" stroke="#9aa3a8" stroke-width="6"/>
    <path d="M${x + 320} ${base - 270} L${x + 370} ${base - 270} M${x + 328} ${base - 230} L${x + 362} ${base - 230}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="${x + 345}" cy="${base - 304}" r="12" fill="#e0443a" stroke="${INK}" stroke-width="4"/>
  </g>`;
}

function clouds(seed: number, count: number, top: number, color = "#fffaf0"): string {
  const r = rng(seed);
  let s = "";
  for (let i = 0; i < count; i++) {
    const x = 100 + r() * 1400;
    const y = top + r() * 140;
    const w = 90 + r() * 90;
    const puff = (dx: number, dy: number, rr: number) => `<circle cx="${x + dx}" cy="${y + dy}" r="${rr}"/>`;
    const shape = puff(0, 0, w * 0.42) + puff(w * 0.45, 8, w * 0.32) + puff(-w * 0.45, 10, w * 0.3) + `<rect x="${x - w * 0.75}" y="${y}" width="${w * 1.5}" height="${w * 0.32}" rx="${w * 0.16}"/>`;
    s += `<g fill="${INK}" transform="translate(5 5)">${shape}</g><g fill="${INK}" stroke="${INK}" stroke-width="10">${shape}</g><g fill="${color}">${shape}</g>`;
  }
  return s;
}

/** The Dustline valley: sky, mesas, fields, and whatever farm buildings the scene wants. */
export function valley(o: ValleyOpts = {}): string {
  const id = `v${++uid}`;
  const sky = SKIES[o.sky ?? "day"];
  const H = o.horizon ?? 560;
  const defs = vgrad(`sk${id}`, sky.stops) + halftone(`ht${id}`) + rgrad(`sg${id}`, [[0, "#fff8d8", 0.9], [1, "#fff8d8", 0]]);
  let b = `<rect width="1600" height="900" fill="url(#sk${id})"/>`;
  if (o.sky === "night" || o.sky === "dusk") {
    const r = rng(7);
    for (let i = 0; i < 70; i++) b += `<circle cx="${r() * 1600}" cy="${r() * (H - 160)}" r="${1.5 + r() * 2.5}" fill="#fff8e6" opacity="${0.4 + r() * 0.6}"/>`;
  }
  if ((o.sun ?? true) && sky.sun) {
    const sy = o.sky === "dawn" ? H - 150 : o.sky === "dusk" ? H - 120 : 170;
    b += `<circle cx="1180" cy="${sy}" r="190" fill="url(#sg${id})"/><circle cx="1180" cy="${sy}" r="92" fill="${sky.sun}" stroke="${INK}" stroke-width="5"/>`;
  }
  if (o.clouds) b += clouds(11, 4, 70, o.sky === "dusk" ? "#f6c7b4" : "#fffaf0");
  b += mesas(H, sky.mesa, sky.mesaDark);
  b += fields(H, o.crops ?? "wheat", id);
  if (o.road) b += road(H, o.road);
  if (o.silo) b += silo(150, H + 24);
  if (o.barn) b += barnBuilding(300, H + 30);
  if (o.hall) b += grangeHall(H + 44);
  if (o.pump) b += windpump(1360, H + 30);
  if (o.fence) b += fence(H, o.road ? 700 : 2000, o.road ? 900 : 2000);
  if (o.sky === "night" || o.sky === "dusk") b += `<rect width="1600" height="900" fill="#2a1d4a" opacity="${o.sky === "night" ? 0.35 : 0.12}"/>`;
  return svg(b, defs);
}

// ---------------------------------------------------------------- barn front

/** The front of the Haybright barn, close up, with an empty doorway (doors are separate elements) and a sign over it. */
export function barnFront(sign = "HAYBRIGHT FARM"): string {
  const id = `b${++uid}`;
  const defs = halftone(`ht${id}`) + vgrad(`sk${id}`, SKIES.day.stops) + rgrad(`dk${id}`, [[0, "#3a2614"], [1, "#120b07"]]);
  let planks = "";
  for (let x = 0; x < 1600; x += 64) planks += `<path d="M${x} 120 L${x} 800" stroke="#8f3322" stroke-width="5"/>`;
  const hay = rng(5);
  let straw = "";
  for (let i = 0; i < 40; i++) {
    const x = 470 + hay() * 660;
    const y = 780 + hay() * 110;
    straw += `<path d="M${x} ${y} l${(hay() - 0.5) * 40} ${-6 - hay() * 10}" stroke="#e8c060" stroke-width="5" stroke-linecap="round"/>`;
  }
  return svg(
    `<rect width="1600" height="900" fill="url(#sk${id})"/>
    <polygon points="-40,260 800,-60 1640,260 1640,820 -40,820" fill="#b8452e" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
    ${planks}
    <polygon points="1100,120 1640,260 1640,820 1100,820" fill="#8f3322" opacity="0.45"/>
    <rect x="0" y="120" width="1600" height="700" fill="url(#ht${id})" opacity="0.35"/>
    <polygon points="-60,250 800,-80 1660,250 1660,282 800,-44 -60,282" fill="#f1e4c6" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
    <rect x="690" y="70" width="220" height="120" fill="#2a1a12" stroke="${INK}" stroke-width="7"/>
    <rect x="590" y="200" width="420" height="58" rx="6" fill="#c08a52" stroke="${INK}" stroke-width="6"/>
    <text x="800" y="242" text-anchor="middle" font-family="'Bowlby One','Arial Black',Impact,sans-serif" font-size="${sign.length > 15 ? 32 : 38}" fill="#fff3d6" stroke="${INK}" stroke-width="8" paint-order="stroke">${sign.replace(/[<>&"]/g, "")}</text>
    <rect x="440" y="290" width="720" height="560" fill="url(#dk${id})" stroke="${INK}" stroke-width="10"/>
    <path d="M440 290 L1160 290" stroke="#f1e4c6" stroke-width="14"/>
    <rect x="0" y="800" width="1600" height="100" fill="#b88a58" stroke="${INK}" stroke-width="6"/>
    <rect x="0" y="806" width="1600" height="94" fill="url(#ht${id})" opacity="0.5"/>
    ${straw}`,
    defs,
  );
}

/** One barn door leaf (for the scene to swing open). */
export function barnDoor(): string {
  return `<svg viewBox="0 0 360 560" preserveAspectRatio="none" aria-hidden="true"><rect x="4" y="4" width="352" height="552" fill="#f1e4c6" stroke="${INK}" stroke-width="8"/>
    <rect x="34" y="34" width="292" height="492" fill="#b8452e" stroke="${INK}" stroke-width="6"/>
    <path d="M34 34 L326 526 M326 34 L34 526" stroke="#f1e4c6" stroke-width="26"/><path d="M34 34 L326 526 M326 34 L34 526" stroke="${INK}" stroke-width="4" opacity="0.5"/></svg>`;
}

// ---------------------------------------------------------------- the Brood Hollow

/** Where the egg clusters glow, in panel percent (for pulsing glows and rising spores). */
export const HOLLOW_EGGS = [
  { x: 230 / 16, y: 640 / 9 },
  { x: 1370 / 16, y: 640 / 9 },
  { x: 560 / 16, y: 770 / 9 },
  { x: 1040 / 16, y: 770 / 9 },
];

/**
 * The Brood Hollow, the Skitterswarm's cavern deep under the valley: dirt walls hung with roots, a
 * great tunnel mouth in the back wall, pale silk strands, and clutches of glowing eggs on the floor.
 */
export function hollow(dim = false): string {
  const id = `h${++uid}`;
  const defs =
    vgrad(`bg${id}`, [[0, "#1a1014"], [0.55, "#33222a"], [1, "#24171c"]]) +
    halftone(`ht${id}`, "rgba(0,0,0,0.35)") +
    rgrad(`gl${id}`, [[0, "#d8ff7a", 0.5], [1, "#d8ff7a", 0]]) +
    rgrad(`egg${id}`, [[0, "#fbffd8"], [0.55, "#d6f56a"], [1, "#8fb02c"]]) +
    rgrad(`tn${id}`, [[0, "#000000"], [0.7, "#0c0709"], [1, "#2a1a20"]]);
  const r = rng(9);
  let rocks = "";
  for (let i = 0; i < 30; i++) {
    const x = r() * 1600;
    const y = r() * 720;
    if (x > 460 && x < 1140 && y > 140 && y < 700) continue;
    const w = 18 + r() * 42;
    rocks += `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${w * 0.6}" fill="#4a3038" stroke="${INK}" stroke-width="4"/>`;
  }
  let roots = "";
  for (let i = 0; i < 8; i++) {
    const x = 40 + i * 210 + r() * 60;
    const d = `M${x} -10 C${x + 30} 70 ${x - 40} 120 ${x + 10} ${180 + r() * 90}`;
    roots += `<path d="${d}" stroke="${INK}" stroke-width="18" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#7a5030" stroke-width="9" fill="none" stroke-linecap="round"/>`;
  }
  let silk = "";
  for (const [x1, y1, x2, y2] of [[0, 260, 520, 330], [1600, 240, 1080, 320], [0, 520, 470, 470], [1600, 540, 1130, 480], [300, 0, 560, 300], [1300, 0, 1050, 290]] as const)
    silk += `<path d="M${x1} ${y1} Q${(x1 + x2) / 2} ${Math.max(y1, y2) + 60} ${x2} ${y2}" stroke="#efe6d6" stroke-width="4" fill="none" opacity="0.55"/>`;
  const clutch = (cx: number, cy: number, n: number, seed: number) => {
    const q = rng(seed);
    let out = `<ellipse cx="${cx}" cy="${cy + 36}" rx="${n * 34}" ry="34" fill="#3a2418" stroke="${INK}" stroke-width="6"/>`;
    const eggs: [number, number, number][] = [];
    for (let i = 0; i < n; i++) eggs.push([cx + (i - (n - 1) / 2) * 52 + (q() - 0.5) * 16, cy + (i % 2 ? 10 : -6), 30 + q() * 12]);
    eggs.sort((e1, e2) => e1[1] - e2[1]);
    for (const [x, y, s] of eggs)
      out += `<ellipse cx="${x}" cy="${y}" rx="${s * 0.78}" ry="${s}" fill="url(#egg${id})" stroke="${INK}" stroke-width="5"/><ellipse cx="${x - s * 0.25}" cy="${y - s * 0.4}" rx="${s * 0.18}" ry="${s * 0.28}" fill="#ffffff" opacity="0.7"/><path d="M${x - s * 0.5} ${y + s * 0.3} Q${x} ${y + s * 0.55} ${x + s * 0.5} ${y + s * 0.3}" stroke="#7d9a2a" stroke-width="3" fill="none" opacity="0.6"/>`;
    return out;
  };
  return svg(
    `<rect width="1600" height="900" fill="url(#bg${id})"/>
    ${rocks}${roots}
    <rect width="1600" height="900" fill="url(#ht${id})" opacity="0.45"/>
    <path d="M440 770 C440 420 560 170 800 170 C1040 170 1160 420 1160 770 Z" fill="#4a3038" stroke="${INK}" stroke-width="10"/>
    <path d="M500 770 C500 450 600 240 800 240 C1000 240 1100 450 1100 770 Z" fill="url(#tn${id})" stroke="${INK}" stroke-width="7"/>
    ${[[560, 330], [1040, 330], [610, 250], [990, 250], [800, 205]].map(([x, y]) => `<path d="M${x! - 26} ${y} L${x} ${y! + 46} L${x! + 26} ${y}" fill="#5c3c46" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`).join("")}
    ${silk}
    <rect x="0" y="760" width="1600" height="140" fill="#2a1a1e" stroke="${INK}" stroke-width="6"/>
    <path d="M0 800 L1600 800 M0 850 L1600 850" stroke="#3d2830" stroke-width="5"/>
    ${clutch(230, 610, 4, 3)}${clutch(1370, 610, 4, 4)}${clutch(560, 740, 3, 5)}${clutch(1040, 740, 3, 6)}
    <ellipse cx="800" cy="560" rx="780" ry="430" fill="url(#gl${id})"/>
    ${dim ? `<rect width="1600" height="900" fill="#07040a" opacity="0.74"/>` : ""}`,
    defs,
  );
}

// ---------------------------------------------------------------- orbit

/** Space over the valley: stars, and the curve of the planet with the Dustline glowing on it. */
export function orbit(): string {
  const id = `o${++uid}`;
  const defs =
    vgrad(`bg${id}`, [[0, "#090b26"], [0.7, "#251b4e"], [1, "#3a2a66"]]) +
    rgrad(`gl${id}`, [[0, "#e9ff8a", 1], [0.35, "#9af0c0", 0.7], [1, "#9af0c0", 0]]) +
    rgrad(`at${id}`, [[0.9, "#8fd8ff", 0], [0.97, "#8fd8ff", 0.55], [1, "#8fd8ff", 0]]) +
    halftone(`ht${id}`, "rgba(0,0,0,0.25)");
  const r = rng(19);
  let stars = "";
  for (let i = 0; i < 140; i++) stars += `<circle cx="${r() * 1600}" cy="${r() * 700}" r="${1 + r() * 2.8}" fill="${r() > 0.8 ? "#d8c8ff" : "#fff8e6"}" opacity="${0.4 + r() * 0.6}"/>`;
  for (let i = 0; i < 6; i++) {
    const x = r() * 1600;
    const y = r() * 500;
    stars += `<path d="M${x - 14} ${y} L${x + 14} ${y} M${x} ${y - 14} L${x} ${y + 14}" stroke="#fff8e6" stroke-width="3" stroke-linecap="round"/>`;
  }
  return svg(
    `<rect width="1600" height="900" fill="url(#bg${id})"/>${stars}
    <circle cx="800" cy="2050" r="1420" fill="url(#at${id})"/>
    <clipPath id="pc${id}"><circle cx="800" cy="2050" r="1340"/></clipPath>
    <circle cx="800" cy="2050" r="1340" fill="#4f7fb0"/>
    <g clip-path="url(#pc${id})" stroke="${INK}" stroke-width="5" stroke-linejoin="round">
      <path d="M380 900 Q420 780 560 750 Q700 724 820 728 Q960 732 1060 770 Q1180 820 1210 900 Z" fill="#9aa04e"/>
      <path d="M560 800 Q660 760 780 762 Q880 764 940 800 Q860 830 760 826 Q640 830 560 800 Z" fill="#c9a060"/>
      <path d="M-40 900 Q80 830 230 840 Q300 870 280 900 Z" fill="#b07a48"/>
      <path d="M1320 900 Q1380 840 1520 850 Q1640 870 1660 900 Z" fill="#9aa04e"/>
    </g>
    <circle cx="800" cy="2050" r="1340" fill="url(#ht${id})" opacity="0.5"/>
    <circle cx="800" cy="2050" r="1340" fill="none" stroke="${INK}" stroke-width="8"/>
    <ellipse cx="800" cy="770" rx="150" ry="60" fill="url(#gl${id})"/>
    <path d="M740 790 Q790 770 860 784" stroke="#4cc2c9" stroke-width="7" fill="none" stroke-linecap="round"/>`,
    defs,
  );
}

/** The Star Lens: a crystal ring in a gold mount (square SVG, for the scene to place and spin). */
export function starLens(): string {
  const id = `s${++uid}`;
  let facets = "";
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2;
    const a1 = ((i + 1) / 12) * Math.PI * 2;
    const p = (a: number, rr: number) => `${(120 + Math.cos(a) * rr).toFixed(1)},${(120 + Math.sin(a) * rr).toFixed(1)}`;
    facets += `<polygon points="${p(a0, 70)} ${p(a1, 70)} ${p((a0 + a1) / 2, 40)}" fill="${i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? "#e3d6ff" : "#c4adf7"}" stroke="#45307a" stroke-width="2" opacity="0.92"/>`;
  }
  let spikes = "";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = 120 + Math.cos(a) * 104;
    const y = 120 + Math.sin(a) * 104;
    spikes += `<polygon points="${120 + Math.cos(a - 0.08) * 92},${120 + Math.sin(a - 0.08) * 92} ${x + Math.cos(a) * 14},${y + Math.sin(a) * 14} ${120 + Math.cos(a + 0.08) * 92},${120 + Math.sin(a + 0.08) * 92}" fill="#dcb55a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
  }
  return `<svg viewBox="0 0 240 240" aria-hidden="true"><defs>${rgrad(`lg${id}`, [[0, "#ffffff", 1], [0.5, "#d8c8ff", 0.6], [1, "#b48cf2", 0]])}</defs>
    <circle cx="120" cy="120" r="118" fill="url(#lg${id})"/>
    ${spikes}
    <circle cx="120" cy="120" r="92" fill="none" stroke="${INK}" stroke-width="26"/>
    <circle cx="120" cy="120" r="92" fill="none" stroke="#dcb55a" stroke-width="16"/>
    <circle cx="120" cy="120" r="92" fill="none" stroke="#fff3c0" stroke-width="4" stroke-dasharray="20 30"/>
    <circle cx="120" cy="120" r="74" fill="#ebe5f2" stroke="${INK}" stroke-width="5"/>
    ${facets}
    <circle cx="120" cy="120" r="74" fill="none" stroke="${INK}" stroke-width="5"/>
    <path d="M86 96 L104 80" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/></svg>`;
}

// ---------------------------------------------------------------- the lawn

/** Lady Prismwick's Lawn: pale lavender sky, hedges, topiary, glass gazebos and a striped lawn. */
export function lawn(sky: "day" | "dusk" = "day"): string {
  const id = `w${++uid}`;
  const H = 600;
  const defs =
    vgrad(`sk${id}`, sky === "dusk" ? [[0, "#2c2a66"], [0.6, "#7b5fae"], [1, "#e6a7c9"]] : [[0, "#bfb3ee"], [0.6, "#e3dcfa"], [1, "#f6f1ff"]]) +
    halftone(`ht${id}`, "rgba(28,21,18,0.2)");
  let stripes = "";
  const vx = 800;
  const vy = H - 90;
  for (let i = -12; i < 12; i++) {
    const ext = (x: number) => vx + ((x - vx) * (980 - vy)) / (900 - vy);
    stripes += `<polygon points="${vx},${vy} ${ext(vx + i * 200)},980 ${ext(vx + (i + 1) * 200)},980" fill="${i % 2 ? "#86c45e" : "#72b24e"}"/>`;
  }
  let scallops = "";
  for (let x = -20; x < 1640; x += 56) scallops += `<circle cx="${x}" cy="${H - 210}" r="34"/>`;
  const gazebo = (x: number) => `<g>
      <path d="M${x - 110} ${H + 20} L${x - 110} ${H - 140} Q${x} ${H - 290} ${x + 110} ${H - 140} L${x + 110} ${H + 20} Z" fill="#eef0ff" fill-opacity="0.7" stroke="${INK}" stroke-width="6"/>
      <path d="M${x - 55} ${H + 20} L${x - 55} ${H - 175} M${x} ${H + 20} L${x} ${H - 200} M${x + 55} ${H + 20} L${x + 55} ${H - 175} M${x - 110} ${H - 60} L${x + 110} ${H - 60}" stroke="#dcb55a" stroke-width="6"/>
      <path d="M${x - 110} ${H - 140} Q${x} ${H - 290} ${x + 110} ${H - 140}" stroke="#dcb55a" stroke-width="10" fill="none"/>
      <path d="M${x - 70} ${H - 110} L${x - 30} ${H - 170}" stroke="#ffffff" stroke-width="10" stroke-linecap="round"/>
      <polygon points="${x},${H - 240} ${x + 14},${H - 212} ${x},${H - 196} ${x - 14},${H - 212}" fill="#d8c8ff" stroke="${INK}" stroke-width="4"/></g>`;
  const hoops = [[560, 700], [1040, 700], [800, 640], [700, 800], [930, 790]]
    .map(([x, y]) => `<path d="M${x! - 18} ${y} L${x! - 18} ${y! - 30} Q${x} ${y! - 46} ${x! + 18} ${y! - 30} L${x! + 18} ${y}" stroke="${INK}" stroke-width="9" fill="none"/><path d="M${x! - 18} ${y} L${x! - 18} ${y! - 30} Q${x} ${y! - 46} ${x! + 18} ${y! - 30} L${x! + 18} ${y}" stroke="#ffffff" stroke-width="4" fill="none"/>`)
    .join("");
  return svg(
    `<rect width="1600" height="900" fill="url(#sk${id})"/>
    ${sky === "day" ? clouds(23, 3, 60, "#ffffff") : ""}
    <g fill="${INK}" stroke="${INK}" stroke-width="12">${scallops}<rect x="-20" y="${H - 214}" width="1640" height="230"/></g>
    <g fill="#3f7a3a">${scallops}<rect x="-20" y="${H - 214}" width="1640" height="230"/></g>
    <rect x="-20" y="${H - 240}" width="1640" height="260" fill="url(#ht${id})" opacity="0.5"/>
    <g transform="translate(800 ${H - 20})">
      <path d="M-40 0 L-30 -110 M40 0 L30 -110 M0 0 L0 -100" stroke="${INK}" stroke-width="30" stroke-linecap="round"/>
      <path d="M-40 0 L-30 -110 M40 0 L30 -110 M0 0 L0 -100" stroke="#4f8f44" stroke-width="20" stroke-linecap="round"/>
      <ellipse cx="0" cy="-140" rx="90" ry="44" fill="#4f8f44" stroke="${INK}" stroke-width="7"/>
      <circle cx="0" cy="-200" r="54" fill="#4f8f44" stroke="${INK}" stroke-width="7"/>
      <path d="M-30 -258 L-20 -236 L-6 -264 L6 -236 L20 -264 L30 -236 L40 -258 L36 -232 L-36 -232 Z" fill="#dcb55a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/></g>
    ${gazebo(190)}${gazebo(1410)}
    <g>${stripes}</g>
    <path d="M0 ${H} L1600 ${H}" stroke="${INK}" stroke-width="6"/>
    ${hoops}
    ${sky === "dusk" ? `<rect width="1600" height="900" fill="#2a1d4a" opacity="0.18"/>` : ""}`,
    defs,
  );
}

// ---------------------------------------------------------------- the creek and the Wellspring

/** A cutaway: the fizzing creek and giant pumpkins up top, the glowing Wellspring deep below. */
export function creekCutaway(): string {
  const id = `c${++uid}`;
  const defs =
    vgrad(`sk${id}`, SKIES.day.stops) +
    vgrad(`ea${id}`, [[0, "#6a4428"], [1, "#2a1a10"]]) +
    rgrad(`ws${id}`, [[0, "#f6ffb0", 1], [0.4, "#9af0c0", 0.85], [1, "#4cc2c9", 0]]) +
    halftone(`ht${id}`, "rgba(0,0,0,0.3)");
  let strata = "";
  for (let i = 0; i < 5; i++) strata += `<path d="M0 ${500 + i * 80} Q400 ${480 + i * 80 + (i % 2) * 30} 800 ${500 + i * 80} T1600 ${495 + i * 80}" stroke="#4a2e1a" stroke-width="6" fill="none"/>`;
  return svg(
    `<rect width="1600" height="900" fill="url(#sk${id})"/>
    ${clouds(31, 3, 40)}
    ${mesas(300, SKIES.day.mesa, SKIES.day.mesaDark)}
    <rect x="0" y="300" width="1600" height="160" fill="#86b24c" stroke="${INK}" stroke-width="5"/>
    <path d="M0 330 Q400 316 800 336 T1600 326" stroke="#6f9c3e" stroke-width="6" fill="none"/>
    <path d="M0 380 Q500 350 820 382 T1600 372 L1600 440 Q1200 420 820 446 T0 432 Z" fill="#4cc2c9" stroke="${INK}" stroke-width="6"/>
    <path d="M60 404 Q300 392 520 404 M900 410 Q1100 400 1300 410" stroke="#d8fbff" stroke-width="6" fill="none" stroke-linecap="round"/>
    <g><rect x="1330" y="200" width="170" height="150" fill="#c08a52" stroke="${INK}" stroke-width="6"/>
      <polygon points="1312,206 1415,140 1518,206" fill="#6b4a3a" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      <circle cx="1310" cy="320" r="70" fill="none" stroke="${INK}" stroke-width="16"/><circle cx="1310" cy="320" r="70" fill="none" stroke="#9a6236" stroke-width="8"/>
      <path d="M1240 320 L1380 320 M1310 250 L1310 390 M1260 270 L1360 370 M1360 270 L1260 370" stroke="#7a4f2e" stroke-width="8"/></g>
    <rect x="0" y="460" width="1600" height="440" fill="url(#ea${id})" stroke="${INK}" stroke-width="6"/>
    ${strata}
    <rect x="0" y="460" width="1600" height="440" fill="url(#ht${id})" opacity="0.4"/>
    <path d="M760 446 L740 560 L790 640 L760 720 M840 446 L870 540 L830 630 L860 720" stroke="#9af0c0" stroke-width="10" fill="none" stroke-linejoin="round" opacity="0.8"/>
    <ellipse cx="800" cy="790" rx="330" ry="120" fill="#1a0f08" stroke="${INK}" stroke-width="8"/>
    <ellipse cx="800" cy="790" rx="420" ry="190" fill="url(#ws${id})"/>
    <ellipse cx="800" cy="800" rx="230" ry="62" fill="#c6ffd8" stroke="${INK}" stroke-width="6"/>
    <ellipse cx="800" cy="796" rx="170" ry="40" fill="#f6ffd0"/>`,
    defs,
  );
}

/** A giant pumpkin (square SVG). */
export function pumpkin(): string {
  return `<svg viewBox="0 0 200 180" aria-hidden="true">
    <path d="M100 40 Q96 20 108 6" stroke="${INK}" stroke-width="16" fill="none" stroke-linecap="round"/><path d="M100 40 Q96 20 108 6" stroke="#6a8a3a" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M108 18 Q140 0 160 22 Q130 34 108 18 Z" fill="#86b24c" stroke="${INK}" stroke-width="5"/>
    <ellipse cx="100" cy="110" rx="94" ry="66" fill="#f08a2a" stroke="${INK}" stroke-width="7"/>
    <ellipse cx="100" cy="110" rx="58" ry="64" fill="none" stroke="${INK}" stroke-width="5"/>
    <ellipse cx="100" cy="110" rx="22" ry="62" fill="none" stroke="${INK}" stroke-width="5"/>
    <path d="M150 70 Q186 100 160 160" stroke="#c4621c" stroke-width="16" fill="none" opacity="0.6"/>
    <path d="M40 80 Q30 100 36 120" stroke="#ffd08a" stroke-width="10" fill="none" stroke-linecap="round"/></svg>`;
}

// ---------------------------------------------------------------- title-card rays

/** Background rays for a title card, as a CSS background (conic sunburst in two colours). */
export const rays = (a: string, b: string): string => `background: repeating-conic-gradient(from 0deg at 50% 50%, ${a} 0deg 9deg, ${b} 9deg 18deg)`;

/** A mound of dirt (wide SVG) to hide things rising out of the ground. */
export function mound(color = "#8a5a36"): string {
  return `<svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 120 Q30 40 90 50 Q120 10 170 30 Q210 0 250 30 Q300 10 320 50 Q380 40 400 120 Z" fill="${color}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
    <circle cx="120" cy="70" r="12" fill="#5e3c24" stroke="${INK}" stroke-width="4"/><circle cx="270" cy="62" r="9" fill="#5e3c24" stroke="${INK}" stroke-width="4"/><circle cx="200" cy="90" r="14" fill="#a8744a" stroke="${INK}" stroke-width="4"/></svg>`;
}

/** A dark hole in the ground (wide SVG). */
export function hole(): string {
  return `<svg viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden="true"><ellipse cx="100" cy="44" rx="96" ry="32" fill="#8a5a36" stroke="${INK}" stroke-width="7"/><ellipse cx="100" cy="46" rx="74" ry="22" fill="#1a0f08"/></svg>`;
}

/** A Concord Light Gate: an upright oval of light in a gold frame (SVG, 2:3). */
export function lightGate(): string {
  const id = `g${++uid}`;
  return `<svg viewBox="0 0 200 300" aria-hidden="true"><defs>${rgrad(`lg${id}`, [[0, "#ffffff", 1], [0.55, "#e6dcff", 0.95], [1, "#b48cf2", 0.85]])}</defs>
    <ellipse cx="100" cy="150" rx="86" ry="136" fill="url(#lg${id})" stroke="${INK}" stroke-width="22"/>
    <ellipse cx="100" cy="150" rx="86" ry="136" fill="none" stroke="#dcb55a" stroke-width="12"/>
    <ellipse cx="100" cy="150" rx="70" ry="118" fill="none" stroke="#ffffff" stroke-width="4" stroke-dasharray="14 18"/>
    <polygon points="100,2 112,22 100,34 88,22" fill="#d8c8ff" stroke="${INK}" stroke-width="5"/></svg>`;
}

/** A Court of Disdain score card (SVG). */
export function scoreCard(score: string): string {
  return `<svg viewBox="0 0 120 170" aria-hidden="true"><rect x="52" y="90" width="16" height="80" fill="#dcb55a" stroke="${INK}" stroke-width="5"/>
    <rect x="6" y="6" width="108" height="100" rx="10" fill="#fffaf0" stroke="${INK}" stroke-width="7"/>
    <text x="60" y="80" text-anchor="middle" font-family="'Bowlby One','Arial Black',Impact,sans-serif" font-size="58" fill="#45307a">${score.replace(/[^0-9.½/]/g, "")}</text></svg>`;
}
