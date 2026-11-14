// Canvas 2D drawing of a map for the map builder. The board and terrain come from the same painter
// as the game board (`ui/art/terrain`), so what you build is what you play on.
// Everything is drawn in board inches; `View` maps inches to canvas pixels.

import type { MapDef } from "../engine/data/maps";
import { polygonCentroid } from "../engine/geometry";
import type { AccessPoint, PlayerId, Terrain, Vec } from "../engine/types";
import { paintAccess, paintGround, paintTerrain, terrainSwatch } from "../ui/art/terrain";
import { ACCESS_HALF_WIDTH, type ItemRef, polyOf } from "./model";

export const INK = "#1c1512";
export const PLAYER = ["#2fb5c8", "#f0565b"] as const;
const ACCENT = "#ffc23a";
const FRAME = 1; // inches of wooden frame around the board

export interface View {
  /** Canvas pixels per inch (CSS pixels). */
  scale: number;
  /** CSS-pixel position of the board's top-left corner. */
  ox: number;
  oy: number;
  /** Device pixel ratio of the canvas backing store. */
  dpr: number;
}

export interface Overlay {
  sel?: ItemRef | null;
  /** Items to outline as "no mirrored partner". */
  unmatched?: ItemRef[];
  labels?: boolean;
  grid?: number | null;
  /** In-progress polygon or rectangle. */
  ghost?: { poly: Vec[]; closed: boolean; color: string } | null;
  /** In-progress ramp or ladder. */
  ghostAccess?: { kind: AccessPoint["kind"]; low: Vec; high: Vec; ok: boolean } | null;
  cursor?: Vec | null;
}

/** Fit a board (plus frame) into a canvas of `w`×`h` CSS pixels. */
export function fitView(map: MapDef, w: number, h: number, dpr: number, pad = 12): View {
  const scale = Math.max(1, Math.min((w - pad * 2) / (map.width + FRAME * 2), (h - pad * 2) / (map.height + FRAME * 2)));
  return { scale, ox: (w - map.width * scale) / 2, oy: (h - map.height * scale) / 2, dpr };
}

const path = (ctx: CanvasRenderingContext2D, poly: Vec[], dx = 0, dy = 0): void => {
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(p.x + dx, p.y + dy) : ctx.moveTo(p.x + dx, p.y + dy)));
  ctx.closePath();
};

function fillStroke(ctx: CanvasRenderingContext2D, fill: string | null, stroke: string | null, width = 0.1, alpha = 1): void {
  ctx.globalAlpha = alpha;
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

/** Draw text centred on a board point, in screen space so it stays crisp. */
function label(ctx: CanvasRenderingContext2D, v: View, text: string, p: Vec, px: number, fill = "#ffffff", stroke: string | null = INK): void {
  ctx.save();
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  ctx.font = `${px}px "Bowlby One", "Arial Black", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const x = v.ox + p.x * v.scale;
  const y = v.oy + p.y * v.scale;
  if (stroke) {
    ctx.lineWidth = Math.max(2, px / 5);
    ctx.strokeStyle = stroke;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Draw the whole board and map. Clears the canvas first. */
export function drawMap(ctx: CanvasRenderingContext2D, map: MapDef, v: View, o: Overlay = {}): void {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, v.dpr * v.ox, v.dpr * v.oy);
  const { width: W, height: H } = map;

  // Table frame, ground and spawn zones (the game's own painter)
  paintGround(ctx, map, { frame: FRAME, grid: false });

  // Grid: fine snap grid, then the game's 6" lines
  if (o.grid && o.grid * v.scale >= 6) {
    ctx.beginPath();
    const step = o.grid < 1 && v.scale < 30 ? 1 : o.grid;
    for (let x = step; x < W; x += step) (ctx.moveTo(x, 0), ctx.lineTo(x, H));
    for (let y = step; y < H; y += step) (ctx.moveTo(0, y), ctx.lineTo(W, y));
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#d9b77e";
    ctx.lineWidth = 0.03;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  for (let x = 6; x < W; x += 6) (ctx.moveTo(x, 0), ctx.lineTo(x, H));
  for (let y = 6; y < H; y += 6) (ctx.moveTo(0, y), ctx.lineTo(W, y));
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = "#c9a46a";
  ctx.lineWidth = 0.04;
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Centre lines (the mirror point)
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.setLineDash([0.4, 0.4]);
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.05;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 0.3, 0, Math.PI * 2);
  fillStroke(ctx, null, INK, 0.06, 1);

  // Terrain, in the game's draw order
  paintTerrain(ctx, map);
  const t = map.terrain;

  // Objectives
  for (const ob of map.objectives) {
    const color = ob.team === null ? "#ffffff" : PLAYER[ob.team];
    ctx.beginPath();
    ctx.arc(ob.pos.x, ob.pos.y, ob.radius, 0, Math.PI * 2);
    fillStroke(ctx, color, null, 0, 0.18);
    fillStroke(ctx, null, ob.team === null ? "#fffaf0" : color, 0.12);
    if (ob.team !== null) {
      ctx.beginPath();
      ctx.arc(ob.pos.x, ob.pos.y, ob.radius + 0.3, 0, Math.PI * 2);
      fillStroke(ctx, null, color, 0.12);
    }
    ctx.beginPath();
    ctx.arc(ob.pos.x, ob.pos.y, ob.radius, 0, Math.PI * 2);
    fillStroke(ctx, null, INK, 0.05, 1);
    ctx.beginPath();
    ctx.arc(ob.pos.x, ob.pos.y, 0.75, 0, Math.PI * 2);
    fillStroke(ctx, ob.team === null ? "#5a4636" : color, INK, 0.12);
    if (v.scale >= 6) label(ctx, v, String(ob.number), { x: ob.pos.x, y: ob.pos.y + 0.04 }, Math.max(10, v.scale * 0.95), "#fff3d6", INK);
  }

  if (o.labels) {
    const px = Math.max(10, Math.min(14, v.scale * 0.55));
    for (const x of t) label(ctx, v, x.id, polygonCentroid(x.poly), px, "#ffffff", INK);
    for (const a of map.access) label(ctx, v, a.id, { x: (a.low.x + a.high.x) / 2, y: (a.low.y + a.high.y) / 2 }, px, "#ffe9b0", INK);
  }

  drawOverlay(ctx, map, v, o);
}

function outlineRef(ctx: CanvasRenderingContext2D, map: MapDef, ref: ItemRef, color: string, width: number, dash: number[]): void {
  ctx.setLineDash(dash);
  const poly = polyOf(map, ref);
  if (poly) {
    path(ctx, poly);
    fillStroke(ctx, null, color, width);
  } else if (ref.type === "access") {
    const a = map.access.find((x) => x.id === ref.id);
    if (a) {
      ctx.beginPath();
      ctx.moveTo(a.low.x, a.low.y);
      ctx.lineTo(a.high.x, a.high.y);
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = ACCESS_HALF_WIDTH[a.kind] * 2 + 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineCap = "butt";
    }
  } else if (ref.type === "objective") {
    const ob = map.objectives.find((x) => x.id === ref.id);
    if (ob) {
      ctx.beginPath();
      ctx.arc(ob.pos.x, ob.pos.y, ob.radius + 0.6, 0, Math.PI * 2);
      fillStroke(ctx, null, color, width);
    }
  }
  ctx.setLineDash([]);
}

function handle(ctx: CanvasRenderingContext2D, v: View, p: Vec, kind: "corner" | "mid" | "end", fill = "#ffffff"): void {
  const r = (kind === "mid" ? 4 : 6) / v.scale;
  ctx.beginPath();
  if (kind === "corner") ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
  else ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  fillStroke(ctx, fill, INK, 2 / v.scale, kind === "mid" ? 0.8 : 1);
}

function drawOverlay(ctx: CanvasRenderingContext2D, map: MapDef, v: View, o: Overlay): void {
  for (const ref of o.unmatched ?? []) outlineRef(ctx, map, ref, "#d63fd6", 3 / v.scale, [6 / v.scale, 4 / v.scale]);

  if (o.sel) {
    outlineRef(ctx, map, o.sel, ACCENT, 4 / v.scale, []);
    outlineRef(ctx, map, o.sel, INK, 1.5 / v.scale, [5 / v.scale, 4 / v.scale]);
    const poly = polyOf(map, o.sel);
    if (poly) {
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length]!;
        handle(ctx, v, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, "mid", ACCENT);
      });
      for (const p of poly) handle(ctx, v, p, "corner");
    } else if (o.sel.type === "access") {
      const id = o.sel.id;
      const a = map.access.find((x) => x.id === id);
      if (a) {
        handle(ctx, v, a.low, "end", "#9be08f");
        handle(ctx, v, a.high, "end", ACCENT);
      }
    }
  }

  if (o.ghostAccess) {
    paintAccess(ctx, o.ghostAccess, 0.75);
    ctx.beginPath();
    ctx.moveTo(o.ghostAccess.low.x, o.ghostAccess.low.y);
    ctx.lineTo(o.ghostAccess.high.x, o.ghostAccess.high.y);
    ctx.setLineDash([4 / v.scale, 3 / v.scale]);
    fillStroke(ctx, null, o.ghostAccess.ok ? "#3fa34d" : "#d9443f", 2.5 / v.scale);
    ctx.setLineDash([]);
    handle(ctx, v, o.ghostAccess.low, "end", "#9be08f");
    handle(ctx, v, o.ghostAccess.high, "end", o.ghostAccess.ok ? ACCENT : "#d9443f");
  }

  if (o.ghost && o.ghost.poly.length) {
    const g = o.ghost;
    ctx.beginPath();
    g.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (g.closed) ctx.closePath();
    else if (o.cursor) ctx.lineTo(o.cursor.x, o.cursor.y);
    if (g.closed || g.poly.length > 1) fillStroke(ctx, g.color, null, 0, 0.35);
    ctx.setLineDash([5 / v.scale, 3 / v.scale]);
    fillStroke(ctx, null, INK, 2 / v.scale);
    ctx.setLineDash([]);
    if (!g.closed) g.poly.forEach((p, i) => handle(ctx, v, p, "corner", i === 0 ? ACCENT : "#ffffff"));
  }

  if (o.cursor) {
    const c = o.cursor;
    const r = 5 / v.scale;
    ctx.beginPath();
    ctx.moveTo(c.x - r, c.y);
    ctx.lineTo(c.x + r, c.y);
    ctx.moveTo(c.x, c.y - r);
    ctx.lineTo(c.x, c.y + r);
    fillStroke(ctx, null, INK, 1.5 / v.scale);
  }
}

/** A colour that stands for a terrain kind or spawn player (for ghosts and UI swatches). */
export function swatch(kind: Terrain["kind"] | "spawn0" | "spawn1" | "objective" | "ramp" | "ladder"): string {
  switch (kind) {
    case "spawn0":
      return PLAYER[0];
    case "spawn1":
      return PLAYER[1];
    case "ramp":
      return "#9a8466";
    case "ladder":
      return "#d9b23a";
    case "objective":
      return "#fff3d6";
    default:
      return terrainSwatch(kind);
  }
}

export const playerName = (p: PlayerId): string => `Player ${p + 1}`;
