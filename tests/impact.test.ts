import { describe, expect, it } from "vitest";
import { applyCommand, createGame } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { unitById } from "../src/engine/rules";
import type { GameEvent, GameState, Unit, Vec } from "../src/engine/types";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

function place(s: GameState, uid: string, at: Vec): Unit {
  const u = unitById(s, uid)!;
  const r = profileOf(u).baseRadius;
  u.onBoard = true;
  u.models.forEach((m, i) => {
    m.pos = { x: at.x + (i % 3) * (2 * r + 0.1), y: at.y + Math.floor(i / 3) * (2 * r + 0.1) };
    m.elevation = 0;
  });
  return u;
}

const uidOf = (s: GameState, owner: 0 | 1, profileId: string): string =>
  s.units.find((u) => u.owner === owner && u.profileId === profileId)!.uid;

function chargeEvents(attacker: string, attackerFaction: "munch" | "militia" | "concord"): GameEvent[] {
  const s = createGame({ map: CLASSIC_DUSTBOWL, factions: [attackerFaction, "militia"], seed: 21 });
  const a = place(s, uidOf(s, 0, attacker), { x: 10, y: 22 });
  const t = place(s, uidOf(s, 1, "mil-grunts"), { x: 10, y: 27 });
  s.phase = "assault";
  s.activePlayer = 0;
  const r = applyCommand(s, { type: "charge", uid: a.uid, target: t.uid });
  if (!r.ok) throw new Error(r.error);
  return r.events;
}

describe("impact on charge", () => {
  it("Big Mama Chomp slams into the target as the charge lands", () => {
    const events = chargeEvents("munch-mama", "munch");
    const impact = events.find((e) => e.type === "attack" && e.report.kind === "impact");
    expect(impact).toBeDefined();
    if (impact?.type !== "attack") return;
    expect(impact.report.attackers).toBe(1);
    expect(impact.report.hitRolls).toHaveLength(2);
    expect(impact.report.hitOn).toBe(4);
  });

  it("units without impact just charge", () => {
    const events = chargeEvents("con-guard", "concord");
    expect(events.some((e) => e.type === "attack" && e.report.kind === "impact")).toBe(false);
    expect(events.some((e) => e.type === "moved" && e.kind === "charge")).toBe(true);
  });
});
