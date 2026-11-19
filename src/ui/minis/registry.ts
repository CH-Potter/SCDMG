// Which art every unit is drawn with on the new engine, and loading it. Three sources (binding.ts):
//   base factions: rigs/<faction>/index.ts tables, by profile id;
//   Forge templates: rigs/forge/<key>/index.ts (found by folder name: no shared list to edit);
//   everything else: the generic kits (kits/), drawn from the unit's recipe or stats.
// All of it loads lazily, one chunk per base faction, per template and for the kits, so new art
// never grows the main chunk. Call `loadArt(profiles)` before showing units (the game does it when
// a battle starts); `rigsFor` is synchronous and returns null only while a unit's chunk is loading.

import { FACTIONS, PROFILES } from "../../engine/data/factions";
import type { Faction, UnitProfile } from "../../engine/types";
import { TEMPLATES } from "../../forge/templates";
import { bindingOf, setTemplateUnits, type ArtBinding } from "./binding";
import { kitSpec, specKey, type FactionLook } from "./kits/spec";
import type { ArtBuilder, ArtContext, TemplateArt, UnitArt, UnitRigs } from "./kits/types";
import type { Colourway } from "./slots";

export type { ArtBuilder, ArtContext, TemplateArt, UnitArt, UnitRigs } from "./kits/types";

interface KitModule {
  kitArt(ctx: ArtContext): UnitArt;
  kitColourway(f: FactionLook, spec: ArtContext["spec"]): Colourway;
}

/** Chunk loaders. Each resolves once; a failed load can be retried. */
const BASE: Record<string, () => Promise<Record<string, ArtBuilder>>> = {
  militia: () => import("./rigs/militia").then((m) => m.MILITIA_ART),
  swarm: () => import("./rigs/swarm").then((m) => m.SWARM_ART),
  concord: () => import("./rigs/concord").then((m) => m.CONCORD_ART),
};
const KIT = (): Promise<KitModule> => import("./kits");
/** Template art modules, by template key (the folder name). */
const TEMPLATE_FILES = import.meta.glob<{ default: TemplateArt }>("./rigs/forge/*/index.ts");
const TEMPLATE_LOADERS: Record<string, () => Promise<TemplateArt>> = Object.fromEntries(
  Object.entries(TEMPLATE_FILES).map(([path, load]) => [path.split("/").slice(-2)[0]!, () => load().then((m) => m.default)]),
);
/** Template keys that have their own art. */
export const TEMPLATE_ART_KEYS = Object.keys(TEMPLATE_LOADERS).sort();

const loaded = new Map<string, unknown>();
const loading = new Map<string, Promise<void>>();

function loadChunk(key: string): Promise<void> {
  if (loaded.has(key)) return Promise.resolve();
  let p = loading.get(key);
  if (!p) {
    const [kind, name] = key.split(":") as [string, string];
    const run: () => Promise<unknown> = kind === "base" ? BASE[name]! : kind === "tpl" ? TEMPLATE_LOADERS[name]! : KIT;
    p = run().then(
      (m) => {
        loaded.set(key, m);
        loading.delete(key);
      },
      (e) => {
        loading.delete(key);
        throw e;
      },
    );
    loading.set(key, p);
  }
  return p;
}

let templatesIndexed = false;
function indexTemplates(): void {
  if (templatesIndexed) return;
  templatesIndexed = true;
  setTemplateUnits(
    TEMPLATES.flatMap((t) => t.faction.profiles.map((p) => ({ template: t.key, unit: p.id.slice(p.id.indexOf(":") + 1), recipe: p.art?.kind === "parts" ? p.art.recipe : undefined }))),
  );
}

/** A unit's art binding (see binding.ts). */
export function bindingFor(p: UnitProfile): ArtBinding {
  indexTemplates();
  return bindingOf(p);
}

/** The chunks a unit's art needs. */
function chunksOf(b: ArtBinding): string[] {
  if (b.kind === "base") return BASE[b.faction] ? [`base:${b.faction}`] : ["kit"];
  if (b.kind === "template" && TEMPLATE_LOADERS[b.template]) return ["kit", `tpl:${b.template}`];
  return ["kit"];
}

const profileOf = (p: UnitProfile | string): UnitProfile | undefined => (typeof p === "string" ? PROFILES[p] : p);

/** A faction's colour and look: the registered faction's, or the template's for template previews. */
export function factionLookOf(p: UnitProfile): FactionLook {
  const f: Faction | undefined = FACTIONS[p.faction] ?? TEMPLATES.find((t) => t.faction.id === p.faction)?.faction;
  return { color: f?.color ?? 0x2fb5c8, look: f?.look ?? "plain" };
}

/** Load the art for these units (their base faction, template and kit chunks). */
export async function loadArt(units: Iterable<UnitProfile | string>): Promise<void> {
  const keys = new Set<string>();
  for (const u of units) {
    const p = profileOf(u);
    if (p) for (const k of chunksOf(bindingFor(p))) keys.add(k);
  }
  await Promise.all([...keys].map(loadChunk));
}

/** Load every faction's, template's and the kits' art (tests, the Rig Lab). */
export async function loadAllArt(): Promise<void> {
  await Promise.all([...Object.keys(BASE).map((f) => `base:${f}`), "kit", ...TEMPLATE_ART_KEYS.map((k) => `tpl:${k}`)].map(loadChunk));
}

/** Whether a unit's art is still to load (its chunk isn't in yet). */
export function artPending(u: UnitProfile | string): boolean {
  const p = profileOf(u);
  return !!p && chunksOf(bindingFor(p)).some((k) => !loaded.has(k));
}

/** Whether the generic kits (every custom unit's fallback) and every template's art are loaded. */
export const allArtLoaded = (): boolean => loaded.has("kit") && TEMPLATE_ART_KEYS.every((k) => loaded.has(`tpl:${k}`));

/** Base-faction profile ids with art (once their chunks are loaded). */
export function riggedProfiles(): string[] {
  return Object.keys(BASE).flatMap((f) => Object.keys((loaded.get(`base:${f}`) as Record<string, ArtBuilder> | undefined) ?? {}));
}

const cache = new Map<string, UnitArt>();

/**
 * A key for everything that shapes a unit's art (its binding, kit spec, faction colour and look):
 * two units with the same key look the same. For caches of pictures made from the art.
 */
export function artKey(u: UnitProfile | string, faction?: FactionLook): string {
  const p = profileOf(u);
  if (!p) return `none|${String(u)}`;
  const b = bindingFor(p);
  if (b.kind === "base" && BASE[b.faction]) return `base|${b.id}`;
  const f = faction ?? factionLookOf(p);
  const s = kitSpec(p, f);
  return `${b.kind === "template" ? `tpl:${b.template}/${b.unit}` : "kit"}|${specKey(s)}|${f.color}|${f.look}`;
}

/**
 * All of a unit's looks, or null while its art is loading (or for an unknown id). `faction`
 * overrides the colour and look (the Rig Lab's previews); by default they're the unit's faction's.
 */
export function artFor(u: UnitProfile | string, faction?: FactionLook): UnitArt | null {
  const p = profileOf(u);
  if (!p) return null;
  const b = bindingFor(p);
  if (b.kind === "base") {
    const table = loaded.get(`base:${b.faction}`) as Record<string, ArtBuilder> | undefined;
    const build = table?.[b.id];
    if (build) {
      let a = cache.get(`base|${b.id}`);
      if (!a) cache.set(`base|${b.id}`, (a = build()));
      return a;
    }
    if (BASE[b.faction] && !table) return null;
  }
  const kit = loaded.get("kit") as KitModule | undefined;
  if (!kit) return null;
  const tplArt = b.kind === "template" ? (loaded.get(`tpl:${b.template}`) as TemplateArt | undefined) : undefined;
  if (b.kind === "template" && TEMPLATE_LOADERS[b.template] && !tplArt) return null;
  const f = faction ?? factionLookOf(p);
  const spec = kitSpec(p, f);
  const unitKey = b.kind === "template" ? b.unit : "";
  const key = `${b.kind === "template" ? `tpl:${b.template}/${unitKey}` : "kit"}|${specKey(spec)}|${f.color}|${f.look}`;
  let a = cache.get(key);
  if (!a) {
    const colourway = tplArt?.colourway ? tplArt.colourway(f, spec) : kit.kitColourway(f, spec);
    const ctx: ArtContext = { profile: p, faction: f, spec, colourway };
    const own = tplArt?.units[unitKey];
    a = own ? own(ctx) : kit.kitArt(ctx);
    cache.set(key, a);
  }
  return a;
}

/** The rigs model `model` (its index in the unit) is drawn with, or null while its art loads. */
export function rigsFor(u: UnitProfile | string, model = 0, faction?: FactionLook): UnitRigs | null {
  const a = artFor(u, faction);
  if (!a) return null;
  const n = a.looks.length;
  const i = Math.max(0, Math.min(n - 1, a.pick ? a.pick(model) : model % n));
  const look = a.looks[i]!;
  return { side: look.side, top: look.top, colourway: a.colourway };
}
