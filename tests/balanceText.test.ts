// Balance numbers live in data; the player-facing text repeats some of them. These checks keep the
// built-in support and ability text in step with the numbers when they are tuned.

import { describe, expect, it } from "vitest";
import { ABILITIES } from "../src/engine/data/abilities";
import { BUILT_IN_FACTION_IDS, factionOf } from "../src/engine/data/factions";

const usesWord = (n: number) => (n === 1 ? "once per game" : n === 2 ? "twice per game" : `${n} times per game`);

describe("built-in text matches the numbers", () => {
  for (const fid of BUILT_IN_FACTION_IDS) {
    for (const sp of factionOf(fid).supports) {
      for (const a of sp.abilities) {
        it(`${sp.name}: ${a.name}`, () => {
          const t = a.text;
          const e = a.effect;
          switch (e.kind) {
            case "resources":
              expect(t).toContain(`${e.amount} resources`);
              break;
            case "heal":
              expect(t).toContain(`${e.amount} HP`);
              break;
            case "blast":
              expect(t).toContain(`${e.radius}"`);
              expect(t).toContain(`${e.range}"`);
              expect(t).toContain(`${e.hit}+`);
              expect(t).toContain(`${e.damage} damage`);
              if (e.ap) expect(t).toContain(`AP${e.ap}`);
              break;
            case "summon":
              expect(t).toContain(`${e.range}"`);
              break;
            case "meleeBuff":
            case "rangedBuff":
              expect(t).toContain(`+${e.dice}`);
              break;
            case "slow":
              expect(t).toContain(`${e.range}"`);
              break;
            case "retaliate":
              expect(t).toContain(`${e.hit}+`);
              expect(t).toContain(`${e.damage} damage`);
              break;
            default:
              break;
          }
        });
      }
    }
  }

  for (const def of Object.values(ABILITIES)) {
    if (def.kind !== "active") continue;
    it(`ability ${def.name}`, () => {
      if (def.range !== undefined) expect(def.text).toContain(`${def.range}"`);
      if (def.usesPerGame !== undefined) expect(def.text.toLowerCase()).toContain(usesWord(def.usesPerGame));
    });
  }
});
