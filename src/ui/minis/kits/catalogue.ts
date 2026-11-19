// The kits' part catalogues: every generic part, slot-tagged by its file name prefix, in both views.
// Files live in parts/kit/<kit>/ (side) and parts/kit/<kit>-top/ (top); a part is found by name, so
// adding one is dropping a file in (and, for a new choice, naming it in the kit's table).
//   torso*, head-<MiniHead>, gear-<MiniHeadgear>, back-<MiniBack>, weapon-<kit weapon>, shield, ...
// Whether a part carries the team tag is read from the part itself (readPart(src).tagged).

import { readPart } from "../svg";
import type { RigView } from "../types";

export type KitSlot = "torso" | "head" | "gear" | "back" | "weapon" | "offhand" | "body" | "limb" | "mount";

const byName = (g: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(g).map(([p, s]) => [p.slice(p.lastIndexOf("/") + 1).replace(/\.svg$/, ""), s]));

const FILES = {
  humanoid: {
    side: byName(import.meta.glob<string>("../parts/kit/humanoid/*.svg", { query: "?raw", import: "default", eager: true })),
    top: byName(import.meta.glob<string>("../parts/kit/humanoid-top/*.svg", { query: "?raw", import: "default", eager: true })),
  },
  beast: {
    side: byName(import.meta.glob<string>("../parts/kit/beast/*.svg", { query: "?raw", import: "default", eager: true })),
    top: byName(import.meta.glob<string>("../parts/kit/beast-top/*.svg", { query: "?raw", import: "default", eager: true })),
  },
  machine: {
    side: byName(import.meta.glob<string>("../parts/kit/machine/*.svg", { query: "?raw", import: "default", eager: true })),
    top: byName(import.meta.glob<string>("../parts/kit/machine-top/*.svg", { query: "?raw", import: "default", eager: true })),
  },
  structure: {
    side: byName(import.meta.glob<string>("../parts/kit/structure/*.svg", { query: "?raw", import: "default", eager: true })),
    top: byName(import.meta.glob<string>("../parts/kit/structure-top/*.svg", { query: "?raw", import: "default", eager: true })),
  },
};

export type KitName = keyof typeof FILES;

/** A kit part's SVG source by name ("head-visor"), or throws: a missing part is a bug, not a fallback. */
export function kitPart(kit: KitName, view: RigView, name: string): string {
  const src = FILES[kit][view][name];
  if (!src) throw new Error(`no kit part ${kit}/${view}/${name}`);
  return src;
}

/** A kit part if it exists. */
export const maybeKitPart = (kit: KitName, view: RigView, name: string): string | undefined => FILES[kit][view][name];

export interface CatalogueEntry {
  kit: KitName;
  name: string;
  slot: KitSlot;
  views: RigView[];
  /** Views in which the part carries the team tag. */
  tagged: RigView[];
}

const SLOT_OF: [RegExp, KitSlot][] = [
  [/^torso/, "torso"],
  [/^head-/, "head"],
  [/^gear-/, "gear"],
  [/^back-/, "back"],
  [/^weapon-/, "weapon"],
  [/^(shield|offhand)/, "offhand"],
  [/^(leg|knee|foot|paw|hip)/, "limb"],
  [/^(steed|saddle|mount)/, "mount"],
];

/** Every catalogued part with its slot and views (the Rig Lab and docs list it; tests lint it). */
export function catalogue(): CatalogueEntry[] {
  const out: CatalogueEntry[] = [];
  for (const kit of Object.keys(FILES) as KitName[]) {
    const names = new Set([...Object.keys(FILES[kit].side), ...Object.keys(FILES[kit].top)]);
    for (const name of [...names].sort()) {
      const views = (["side", "top"] as RigView[]).filter((v) => FILES[kit][v][name]);
      out.push({
        kit,
        name,
        slot: SLOT_OF.find(([re]) => re.test(name))?.[1] ?? "body",
        views,
        tagged: views.filter((v) => readPart(FILES[kit][v][name]!).tagged),
      });
    }
  }
  return out;
}

/** Every part source in the catalogue (for lint). */
export function cataloguedSources(): { name: string; src: string }[] {
  return (Object.keys(FILES) as KitName[]).flatMap((kit) => (["side", "top"] as RigView[]).flatMap((v) => Object.entries(FILES[kit][v]).map(([n, src]) => ({ name: `${kit}/${v}/${n}`, src }))));
}
