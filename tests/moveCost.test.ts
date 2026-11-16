import { describe, expect, it } from "vitest";
import { planUnitMove } from "../src/engine/formation";
import { createGame } from "../src/engine/game";
import { rect } from "../src/engine/geometry";
import { profileOf } from "../src/engine/profile";
import { CLASSIC_DUSTBOWL } from "./helpers/classicMap";

describe("moving out of area cover", () => {
  it('says when "Too far" is because cover costs double, not the straight distance', () => {
    const s = createGame({ map: CLASSIC_DUSTBOWL, factions: ["militia", "munch"], seed: 1, missionId: "brawl" });
    s.terrain = [{ id: "scrub", kind: "cover", level: 0, poly: rect(5, 5, 6, 6) }];
    const u = s.units.find((x) => x.owner === 0 && profileOf(x).models > 1)!;
    u.onBoard = true;
    u.models.forEach((m, i) => {
      m.pos = { x: 6 + (i % 3) * 1.1, y: 6 + Math.floor(i / 3) * 1.1 };
      m.elevation = 0;
    });
    const leader = u.models[0]!;
    // 5.5" in a straight line, almost all of it through the scrub: costs well over 6".
    const to = { x: leader.pos.x + 5.5, y: leader.pos.y };
    const plan = planUnitMove(s, u, leader.id, to, { allowance: 6 });
    expect(plan).toMatch(/Too far: .* of 6".*area cover costs double/);
    // Without the scrub the same move is fine.
    s.terrain = [];
    expect(typeof planUnitMove(s, u, leader.id, to, { allowance: 6 })).not.toBe("string");
  });
});
