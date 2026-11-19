// A tiny SVG reader/writer for part files: enough XML for what the part template allows (elements,
// quoted attributes, comments), with no DOM, so the validator and the bake planner run in tests
// and workers too. Parts are re-serialised for baking with their slot colours swapped in and the
// layers a zoom tier drops (shade, detail) taken out.

import type { Pt, Tier } from "./types";

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

export interface ParsedSvg {
  root: XmlNode;
  comments: string[];
}

const ATTR = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;

export function parseSvg(src: string): ParsedSvg {
  const comments: string[] = [];
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) break;
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt);
      if (end < 0) throw new Error("unclosed comment");
      comments.push(src.slice(lt + 4, end).trim());
      i = end + 3;
      continue;
    }
    if (src.startsWith("<?", lt) || src.startsWith("<!", lt)) {
      i = src.indexOf(">", lt) + 1;
      continue;
    }
    const gt = src.indexOf(">", lt);
    if (gt < 0) throw new Error("unclosed tag");
    const body = src.slice(lt + 1, gt);
    i = gt + 1;
    if (body.startsWith("/")) {
      const tag = body.slice(1).trim();
      const open = stack.pop();
      if (!open || open.tag !== tag) throw new Error(`mismatched </${tag}>`);
      continue;
    }
    const self = body.endsWith("/");
    const inner = self ? body.slice(0, -1) : body;
    const m = /^([A-Za-z][-A-Za-z0-9_:]*)/.exec(inner);
    if (!m) throw new Error(`bad tag <${body}>`);
    const node: XmlNode = { tag: m[1]!, attrs: {}, children: [] };
    for (const a of inner.slice(m[1]!.length).matchAll(ATTR)) node.attrs[a[1]!] = a[3] ?? a[4] ?? "";
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else if (!root) root = node;
    else throw new Error("more than one root element");
    if (!self) stack.push(node);
  }
  if (stack.length) throw new Error(`unclosed <${stack[stack.length - 1]!.tag}>`);
  if (!root) throw new Error("no root element");
  return { root, comments };
}

export function walk(n: XmlNode, fn: (n: XmlNode, classes: Set<string>) => void, inherited = new Set<string>()): void {
  const own = (n.attrs.class ?? "").split(/\s+/).filter(Boolean);
  const classes = own.length ? new Set([...inherited, ...own]) : inherited;
  fn(n, classes);
  for (const c of n.children) walk(c, fn, classes);
}

const esc = (s: string) => s.replace(/&(?![a-z]+;|#\d+;)/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Serialise a node (and its children) back to SVG text. */
export function write(n: XmlNode): string {
  const attrs = Object.entries(n.attrs)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join("");
  if (!n.children.length) return `<${n.tag}${attrs}/>`;
  return `<${n.tag}${attrs}>${n.children.map(write).join("")}</${n.tag}>`;
}

export interface PartInfo {
  /** `data-part` on the root: the part's library name ("militia.trooper.helm"). */
  name: string;
  /** viewBox: the part's bounds in its own coordinates. */
  box: { x: number; y: number; w: number; h: number };
  /** Named anchors (`<g id="anchors">` children with an id): pivots, grips g1/g2, fx points. */
  anchors: Record<string, Pt>;
  /** Weapons: recoil length (u). */
  recoil: number;
  /** The drawing: the root's children minus the anchors layer. */
  body: XmlNode[];
  /** Whether any element carries the team tag. */
  tagged: boolean;
}

const partCache = new Map<string, PartInfo>();

export function readPart(src: string): PartInfo {
  const hit = partCache.get(src);
  if (hit) return hit;
  const { root } = parseSvg(src);
  const vb = (root.attrs.viewBox ?? "").trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v))) throw new Error("part needs a viewBox");
  const anchors: Record<string, Pt> = {};
  const body: XmlNode[] = [];
  for (const c of root.children) {
    if (c.tag === "g" && c.attrs.id === "anchors") {
      walk(c, (n) => {
        if (n === c || !n.attrs.id) return;
        const x = Number(n.attrs.cx ?? n.attrs.x);
        const y = Number(n.attrs.cy ?? n.attrs.y);
        if (Number.isFinite(x) && Number.isFinite(y)) anchors[n.attrs.id] = { x, y };
      });
    } else if (c.tag !== "title" && c.tag !== "desc") body.push(c);
  }
  let tagged = false;
  for (const b of body) walk(b, (_n, cls) => (tagged ||= cls.has("tag")));
  const info: PartInfo = {
    name: root.attrs["data-part"] ?? "",
    box: { x: vb[0]!, y: vb[1]!, w: vb[2]!, h: vb[3]! },
    anchors,
    recoil: Number(root.attrs["data-recoil"] ?? 0) || 0,
    body,
    tagged,
  };
  partCache.set(src, info);
  return info;
}

/** What each zoom tier keeps (the Hard Ink readability rules). */
export const TIER_LAYERS: Readonly<Record<Tier, { shade: boolean; detail: boolean; minInk: number }>> = {
  // Under ~40 px: silhouette, main masses, glows and the team tag only. Thin ink lines go.
  tiny: { shade: false, detail: false, minInk: 2 },
  // 40-100 px: keep the shadow tones, drop the detail layer (rivets, scratches, stencils).
  token: { shade: true, detail: false, minInk: 1.4 },
  // Close up: everything.
  sheet: { shade: true, detail: true, minInk: 0 },
};

const isInk = (v: string | undefined) => !!v && v.toLowerCase() === "#141414";

/** The part's drawing for one tier, with key colours replaced (lower-case hex → hex). */
export function renderBody(part: PartInfo, tier: Tier, colours: Map<string, string>): string {
  const rule = TIER_LAYERS[tier];
  const out: string[] = [];
  const keep = (n: XmlNode): XmlNode | null => {
    const cls = (n.attrs.class ?? "").split(/\s+/);
    if ((!rule.shade && cls.includes("shade")) || (!rule.detail && cls.includes("detail"))) return null;
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(n.attrs)) {
      if (k === "class" || k === "id" || k.startsWith("data-") || k.startsWith("inkscape:") || k.startsWith("sodipodi:")) continue;
      attrs[k] = (k === "fill" || k === "stroke") && colours.has(v.toLowerCase()) ? colours.get(v.toLowerCase())! : v;
    }
    if (isInk(n.attrs.stroke) && Number(n.attrs["stroke-width"] ?? 1) < rule.minInk) {
      delete attrs.stroke;
      delete attrs["stroke-width"];
      delete attrs["stroke-linejoin"];
      delete attrs["stroke-linecap"];
      if (!n.attrs.fill || n.attrs.fill === "none") return null;
    }
    const children = n.children.map(keep).filter((c): c is XmlNode => !!c);
    if (n.tag === "g" && !children.length) return null;
    return { tag: n.tag, attrs, children };
  };
  for (const b of part.body) {
    const k = keep(b);
    if (k) out.push(write(k));
  }
  return out.join("");
}

/** Round to 3 decimals for stable, short SVG output. */
export const r3 = (v: number): number => Math.round(v * 1000) / 1000;
