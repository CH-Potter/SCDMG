// Small canvas thumbnails of maps and missions for the menu (plain 2D canvas, no Pixi).

import type { MapDef } from "../engine/data/maps";
import type { MissionDef } from "../engine/data/missions";
import type { Vec } from "../engine/types";
import { paintBoard } from "./art/terrain";

const INK = "#1c1512";
const P0 = "#2fb5c8";
const P1 = "#f0565b";

/** Size a canvas for crisp drawing at its CSS size and return a context scaled to board inches. */
function prepare(canvas: HTMLCanvasElement, map: MapDef): CanvasRenderingContext2D | null {
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = Math.round((cssW * map.height) / map.width);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const k = canvas.width / map.width;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  return ctx;
}

/** The map in the board's own art style (same painter as the game board), plus objective markers. */
export function drawMapPreview(canvas: HTMLCanvasElement, map: MapDef, dim = false): CanvasRenderingContext2D | null {
  const ctx = prepare(canvas, map);
  if (!ctx) return null;
  paintBoard(ctx, map, { grid: false, low: true });
  for (const o of map.objectives) {
    ctx.beginPath();
    ctx.arc(o.pos.x, o.pos.y, o.radius, 0, Math.PI * 2);
    ctx.fillStyle = o.team === null ? "rgba(255,243,214,0.3)" : o.team === 0 ? "rgba(47,181,200,0.35)" : "rgba(240,86,91,0.35)";
    ctx.fill();
    ctx.lineWidth = 0.45;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 0.25;
    ctx.strokeStyle = o.team === null ? "#fff3d6" : o.team === 0 ? P0 : P1;
    ctx.stroke();
    ctx.font = `2.6px 'Bowlby One', 'Arial Black', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 0.6;
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.strokeText(String(o.number), o.pos.x, o.pos.y + 0.15);
    ctx.fillStyle = "#fff3d6";
    ctx.fillText(String(o.number), o.pos.x, o.pos.y + 0.15);
  }
  if (dim) {
    ctx.fillStyle = "rgba(28,21,18,0.35)";
    ctx.fillRect(0, 0, map.width, map.height);
  }
  return ctx;
}

function star(ctx: CanvasRenderingContext2D, c: Vec, r: number, fill: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const p = { x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr };
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 0.3;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function cookie(ctx: CanvasRenderingContext2D, c: Vec, r: number, ring: string): void {
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#d99a4e";
  ctx.fill();
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.fillStyle = "#5a3418";
  for (const [dx, dy] of [
    [-0.35, -0.3],
    [0.3, 0.15],
    [-0.1, 0.45],
  ]) {
    ctx.beginPath();
    ctx.arc(c.x + dx! * r, c.y + dy! * r, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
}

function swords(ctx: CanvasRenderingContext2D, c: Vec, r: number): void {
  ctx.lineCap = "round";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(c.x - r * s, c.y - r);
    ctx.lineTo(c.x + r * s, c.y + r);
    ctx.lineWidth = r * 0.45;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = r * 0.25;
    ctx.strokeStyle = "#f4f1ea";
    ctx.stroke();
  }
}

/** The map, dimmed, with markers showing what the mission scores. */
export function drawMissionPreview(canvas: HTMLCanvasElement, mission: MissionDef, map: MapDef): void {
  const ctx = drawMapPreview(canvas, map, true);
  if (!ctx) return;
  const s = Math.min(map.width, map.height) / 35;
  for (const rule of mission.scoring) {
    if (rule.kind === "hold" || rule.kind === "sticky") {
      for (const o of map.objectives) if (o.team === null) star(ctx, { x: o.pos.x, y: o.pos.y - 3 * s }, 2.2 * s, "#ffc23a");
    }
    if (rule.kind === "raidHome" || rule.kind === "sticky") {
      for (const o of map.objectives) if (o.team !== null) star(ctx, { x: o.pos.x, y: o.pos.y - 3 * s }, 2.6 * s, o.team === 0 ? P1 : P0);
    }
    if (rule.kind === "flag") {
      for (const o of map.objectives) if (o.team !== null) cookie(ctx, { x: o.pos.x + 2.5 * s, y: o.pos.y - 2.5 * s }, 2 * s, o.team === 0 ? P0 : P1);
    }
    if (rule.kind === "eliminate") swords(ctx, { x: map.width / 2, y: map.height / 2 }, 4 * s);
  }
}
