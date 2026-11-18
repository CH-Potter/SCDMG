// The house rules picked in the main menu, kept in this browser. Every battle uses them (the
// campaign's too), and list building checks unit class limits against them.

import { cleanRules, type HouseRules } from "../engine/houseRules";
import { loadJson, saveJson } from "./files";

const HOUSE_KEY = "scdmg.houseRules.v1";

export function loadHouseRules(): HouseRules {
  return cleanRules(loadJson<unknown>(HOUSE_KEY, {}));
}

export function saveHouseRules(r: HouseRules): void {
  saveJson(HOUSE_KEY, r);
}
