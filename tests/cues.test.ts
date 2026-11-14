// Pure pieces of the UI's visual language: cursors, tip tones, disabled-button markup and the
// attack declaration marker's geometry and wording.

import { describe, expect, it } from "vitest";
import { arrowEnds, attackLabel, isMeleeKind, markFor } from "../src/ui/attackMark";
import { bad, buttonAttrs, cursorCss, cursorKindFor, info, ok, toneGlyph, whyLine } from "../src/ui/cues";
import { createGame } from "../src/engine/game";
import { profileOf } from "../src/engine/profile";
import { PLAYER_COLORS } from "../src/ui/art/palette";

describe("cursor and tip cues", () => {
  it("maps tones to cursors, valid and invalid with different shapes", () => {
    expect(cursorKindFor(null)).toBe("default");
    expect(cursorKindFor(ok("Move here"))).toBe("go");
    expect(cursorKindFor(ok("Shoot", "target"))).toBe("target");
    expect(cursorKindFor(bad("Out of range"))).toBe("no");
    expect(cursorKindFor(info("Leader", "pointer"))).toBe("pointer");
    expect(cursorKindFor({ text: "x", tone: "bad" })).toBe("no");
    expect(toneGlyph("ok")).toBe("✓");
    expect(toneGlyph("bad")).toBe("✕");
    expect(toneGlyph("info")).toBe("");
  });

  it("builds SVG cursors with a centred hotspot and a keyword fallback", () => {
    for (const k of ["go", "target", "place", "no"] as const) {
      const css = cursorCss(k);
      expect(css).toMatch(/^url\("data:image\/svg\+xml,/);
      expect(css).toMatch(/\) 14 14, [a-z-]+$/);
      expect(cursorCss(k)).toBe(css); // cached
    }
    expect(cursorCss("no")).toMatch(/not-allowed$/);
    expect(cursorCss("default")).toBe("default");
    expect(cursorCss("pointer")).toBe("pointer");
  });

  it("disables buttons with the reason as tooltip and a visible line", () => {
    expect(buttonAttrs(null)).toBe("");
    expect(buttonAttrs(null, "Does a thing")).toBe('title="Does a thing"');
    const a = buttonAttrs('Needs 2 CP "now"');
    expect(a).toContain("disabled");
    expect(a).toContain('aria-disabled="true"');
    expect(a).toContain("Needs 2 CP &quot;now&quot;");
    expect(whyLine(null)).toBe("");
    expect(whyLine("Engaged <units>")).toBe('<small class="why">⛔ Engaged &lt;units&gt;</small>');
  });
});

describe("attack marker", () => {
  it("labels each kind of attack", () => {
    expect(attackLabel("shoot", "Rivet Rifle")).toBe("🎯 Shooting · Rivet Rifle");
    expect(attackLabel("fight", "Chompers")).toBe("⚔ Melee · Chompers");
    expect(attackLabel("charge", "")).toBe("💥 Charge");
    expect(attackLabel("overwatch", "Rifle")).toBe("👁 Overwatch · Rifle");
    expect(isMeleeKind("fight")).toBe(true);
    expect(isMeleeKind("impact")).toBe(true);
    expect(isMeleeKind("shoot")).toBe(false);
  });

  it("trims the arrow to run between the units, and drops it when they touch", () => {
    const from = [{ pos: { x: 0, y: 0 }, r: 0.5 }];
    const to = [{ pos: { x: 10, y: 0 }, r: 0.5 }];
    const e = arrowEnds(from, to)!;
    expect(e.a.x).toBeGreaterThan(0.4);
    expect(e.b.x).toBeLessThan(9.6);
    expect(e.a.y).toBeCloseTo(0);
    expect(arrowEnds(from, [{ pos: { x: 1.2, y: 0 }, r: 0.5 }])).toBeNull();
    expect(arrowEnds([], to)).toBeNull();
  });

  it("builds a marker from the state on screen, falling back to the next state for arriving units", () => {
    const s = createGame({ factions: ["militia", "munch"], mapId: "dustbowl", seed: 1, orderChoice: false });
    const a = s.units.find((u) => u.owner === 0)!;
    const t = s.units.find((u) => u.owner === 1)!;
    // Neither is on the table in `s`: no marker.
    expect(markFor([s], a.uid, t.uid, "shoot")).toBeNull();
    const next = structuredClone(s);
    for (const u of next.units) {
      if (u.uid !== a.uid && u.uid !== t.uid) continue;
      u.onBoard = true;
      u.models.forEach((m, i) => (m.pos = { x: (u.owner ? 25 : 5) + i, y: 10 }));
    }
    const m = markFor([s, next], a.uid, t.uid, "shoot")!;
    expect(m.from).toHaveLength(a.models.length);
    expect(m.to).toHaveLength(t.models.length);
    expect(m.from[0]!.r).toBe(profileOf(a).baseRadius);
    expect(m.color).toBe(PLAYER_COLORS[0]);
    expect(m.melee).toBe(false);
    // A support blast has no attacker on the table: only the target, in the player's colour.
    const blast = markFor([next], "", t.uid, "barrage", 0)!;
    expect(blast.from).toHaveLength(0);
    expect(blast.color).toBe(PLAYER_COLORS[0]);
  });
});
