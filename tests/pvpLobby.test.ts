// The online lobby's agreement (ui/lobbyData.ts): two real sessions over an in-memory broker settle
// on the same game from the host's offer and the guest's pick, custom factions travel safely, and
// whatever the other player sends is cleaned or refused.

import { afterEach, describe, expect, it } from "vitest";
import { FACTIONS, factionOf, PROFILES } from "../src/engine/data/factions";
import { syncHash } from "../src/engine/fingerprint";
import type { GameSetup } from "../src/engine/game";
import { STANDARD_RULES } from "../src/engine/houseRules";
import type { Faction } from "../src/engine/types";
import { PvpSession, type Role } from "../src/net/session";
import { memoryHub } from "../src/net/transport";
import { copyFaction, dropNetFactions } from "../src/ui/customFactions";
import { listsFor } from "../src/ui/lists";
import {
  agree,
  fitLobbyMessage,
  LOBBY_VERSION,
  matchesAgreement,
  MAX_LOBBY_BYTES,
  netFaction,
  readLobbyMessage,
  wire,
  wireFaction,
  wireList,
  type Agreement,
  type GuestPick,
  type HostOffer,
} from "../src/ui/lobbyData";

const CODE = "D9ZP-8KME-NPR7-6AGR";
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const open: PvpSession[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.close();
  dropNetFactions();
});

function session(hub: ReturnType<typeof memoryHub>, role: Role) {
  const s = new PvpSession({ transport: hub.transport(), code: CODE, role, build: "test", resendMs: 15, pingMs: 1000, pairTimeoutMs: 400 });
  open.push(s);
  return s;
}

async function until(cond: () => boolean, ms = 3000, what = "condition"): Promise<void> {
  for (let t = 0; !cond(); t += 2) {
    if (t > ms) throw new Error(`timed out waiting for ${what}`);
    await tick(2);
  }
}

/** A list game on Dustbowl with the host's army (starter list unless given). */
function offerFor(f: Faction, rules = { ...STANDARD_RULES, reroll: true }): HostOffer {
  const list = { entries: f.defaultList, supports: f.defaultSupports };
  return wire({
    v: LOBBY_VERSION,
    kind: "host",
    mode: "skirmish",
    missionId: "hold",
    map: { id: "dustbowl" },
    rules,
    army: "list",
    side: { faction: wireFaction(f), list: wireList(list.entries, list.supports) },
  });
}

function pickFor(f: Faction, ready = true): GuestPick {
  return wire({ v: LOBBY_VERSION, kind: "guest", ready, side: { faction: wireFaction(f), list: wireList(f.defaultList, f.defaultSupports) } });
}

/** A custom faction, as made in the faction forge (a copy of a built-in). */
const forged = (from = "swarm", name = "Test Bugs") => copyFaction(factionOf(from), name);

describe("the online lobby", () => {
  it("agrees a game over the wire: the guest's chosen faction (custom) is played, and both start the same game", async () => {
    const hub = memoryHub({ loss: 0.2, random: (() => { let x = 3; return () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31); })() });
    const host = session(hub, "host");
    const guest = session(hub, "guest");
    const offer = offerFor(factionOf("militia"));
    const mine = forged();
    let hostGame: Agreement | null = null;
    let guestGame: Agreement | null = null;
    const problems: string[] = [];
    for (const s of [host, guest]) s.problem.add((p) => problems.push(p));

    // Host: offer on pairing; once the guest is ready, agree and propose.
    host.paired.add(() => void host.sendLobby(offer));
    host.lobby.add((d) => {
      const m = readLobbyMessage(d);
      if (m?.kind !== "guest" || !m.ready) return;
      const r = agree(offer, m);
      if (!r.ok) throw new Error(r.problems.join("; "));
      hostGame = r.game;
      void host.proposeSetup(r.game.setup);
    });
    // Guest: pick an army for the host's game, check the proposal matches, accept.
    guest.lobby.add((d) => {
      const m = readLobbyMessage(d);
      if (m?.kind !== "host") return;
      const pick = pickFor(mine);
      const r = agree(m, pick);
      if (!r.ok) throw new Error(r.problems.join("; "));
      guestGame = r.game;
      void guest.sendLobby(pick);
    });
    const offered: GameSetup[] = [];
    guest.setupOffered.add((setup) => {
      offered.push(setup);
      if (guestGame && matchesAgreement(setup, guestGame)) void guest.acceptSetup();
    });
    const started: GameSetup[] = [];
    for (const s of [host, guest]) s.started.add(({ setup }) => started.push(setup));

    await host.start();
    await guest.start();
    await until(() => started.length === 2, 5000, "both sides to start");

    expect(problems).toEqual([]);
    expect(offered.length).toBeGreaterThan(0);
    expect(hostGame!.setup).toEqual(guestGame!.setup);
    const [a, b] = started as [GameSetup, GameSetup];
    expect(a).toEqual(b);
    expect(a.factions).toEqual(["militia", "net-p1"]);
    expect(a.rules?.reroll).toBe(true);
    expect(a.missionId).toBe("hold");
    expect(a.lists![1]!.every((e) => e.profileId.startsWith("net-p1:"))).toBe(true);
    expect(syncHash(host.state!)).toBe(syncHash(guest.state!));
    // The guest's faction is in the game under its net- id, as the guest made it (costs and all).
    expect(FACTIONS["net-p1"]!.name).toBe("Test Bugs");
    expect(FACTIONS["net-p1"]!.profiles.map((p) => p.cost)).toEqual(mine.profiles.map((p) => p.cost));
    expect(guest.state!.units.some((u) => u.owner === 1 && u.profileId.startsWith("net-p1:"))).toBe(true);
  });

  it("plays built-in factions by id, and the open roster without lists", () => {
    const offer = wire({ ...offerFor(factionOf("concord")), army: "open" as const });
    delete offer.side.list;
    const pick: GuestPick = wire({ v: LOBBY_VERSION, kind: "guest", ready: true, side: { faction: { id: "swarm" } } });
    const r = agree(offer, pick);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.setup).toEqual({
      factions: ["concord", "swarm"],
      mapId: "dustbowl",
      missionId: "hold",
      orderChoice: true,
      armyRule: "open",
      rules: { ...STANDARD_RULES, reroll: true },
    });
    expect(r.game.netFactions).toEqual([]);
  });

  it("refuses a setup the guest didn't agree to", () => {
    const r = agree(offerFor(factionOf("militia")), pickFor(factionOf("swarm")));
    if (!r.ok) throw new Error(r.problems.join("; "));
    const game = r.game;
    expect(matchesAgreement({ ...game.setup, seed: 1234 }, game)).toBe(true);
    expect(matchesAgreement({ ...game.setup, startBonus: [{ resources: 5 }, undefined] }, game)).toBe(false);
    expect(matchesAgreement({ ...game.setup, mapId: "scrapyard" }, game)).toBe(false);
    expect(matchesAgreement({ ...game.setup, factions: ["militia", "militia"] }, game)).toBe(false);
  });

  it("refuses an army list that isn't the faction's, and says whose it is", () => {
    const pick = pickFor(factionOf("swarm"));
    pick.side.list!.entries = factionOf("militia").defaultList;
    const r = agree(offerFor(factionOf("militia")), pick);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.side).toBe(1);
    expect(r.problems[0]).toMatch(/Your opponent's army list/);
  });
});

describe("custom factions from the other player", () => {
  it("are cleaned, re-priced and registered under a net- id, never touching your own", () => {
    const own = forged("militia", "Mine");
    const raw = wire(wireFaction(own)) as { custom: Record<string, unknown> };
    const nf = netFaction(raw.custom, 1);
    expect(nf.problems).toEqual([]);
    expect(nf.faction!.id).toBe("net-p1");
    expect(nf.faction!.custom).toBe(true);
    expect(nf.faction!.profiles.every((p) => p.id.startsWith("net-p1:") && p.faction === "net-p1")).toBe(true);
    expect(nf.ids.get(own.profiles[0]!.id)).toBe(nf.faction!.profiles[0]!.id);
    // Same input, same faction: both players build identical copies.
    expect(netFaction(wire(raw.custom), 1).faction).toEqual(nf.faction);
  });

  it("drop unknown fields, escape nothing into ids, and recompute hand-set costs (even claiming a built-in id)", () => {
    const f = forged("swarm", "Sneaky");
    const raw = JSON.parse(JSON.stringify(wireFaction(f))).custom;
    raw.id = "militia";
    raw.name = `<img src=x onerror="alert(1)">`;
    raw.evil = "<script>alert(1)</script>";
    raw.profiles[0].cost = 1;
    raw.profiles[0].sneaky = true;
    // A unit id with markup in it (and the starter lists pointing at it).
    const oldId = raw.profiles[0].id;
    raw.profiles[0].id = `"><script>x`;
    for (const e of [...raw.defaultList, ...raw.assaultExtras]) if (e.profileId === oldId) e.profileId = `"><script>x`;
    for (const s of raw.supports) for (const a of s.abilities) if (a.effect.profileId === oldId) a.effect.profileId = `"><script>x`;
    const nf = netFaction(raw, 0);
    expect(nf.problems).toEqual([]);
    const out = nf.faction!;
    expect(out.id).toBe("net-p0");
    expect(out).not.toHaveProperty("evil");
    expect(out.profiles[0]).not.toHaveProperty("sneaky");
    expect(out.profiles.every((p) => /^net-p0:[a-z0-9_-]+$/i.test(p.id))).toBe(true);
    expect(out.profiles[0]!.cost).toBe(f.profiles[0]!.cost); // the stats' price, not the claimed 1
    // The name is kept as text (the UI escapes it); it never reaches an id or the built-ins.
    expect(out.name).toBe(`<img src=x onerror="alert(1)">`.slice(0, 40));
    expect(FACTIONS.militia!.name).not.toBe(out.name);
  });

  it("refuse broken and oversized factions", () => {
    expect(netFaction("nope", 1).faction).toBeNull();
    expect(netFaction({ name: "No units" }, 1).faction).toBeNull();
    const broken = JSON.parse(JSON.stringify(wireFaction(forged()))).custom;
    broken.profiles[0].hp = "lots";
    broken.profiles[0].models = -4;
    const bad = netFaction(broken, 1);
    expect(bad.faction).toBeNull();
    expect(bad.problems.length).toBeGreaterThan(0);
    const huge = JSON.parse(JSON.stringify(wireFaction(forged()))).custom;
    huge.blurb = "x".repeat(MAX_LOBBY_BYTES + 10);
    const big = netFaction(huge, 1);
    expect(big.faction).toBeNull();
    expect(big.problems[0]).toMatch(/too big/);
    // A pick carrying one is refused (the guest's side), and nothing is registered for it.
    const r = agree(offerFor(factionOf("militia")), { v: LOBBY_VERSION, kind: "guest", ready: true, side: { faction: { custom: broken } } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.side).toBe(1);
    expect(FACTIONS["net-p1"]).toBeUndefined();
  });

  it("leave their pictures behind when the lobby message would be too big, and say so", () => {
    const f = forged();
    // A small PNG-looking picture (about 57 KB) on every unit: together, well over the limit.
    for (const p of f.profiles) p.art = { kind: "image", dataUrl: `data:image/png;base64,iVBORw0KGgo${"A".repeat(76000)}` };
    expect(f.profiles.length * 76000).toBeGreaterThan(MAX_LOBBY_BYTES);
    const full = pickFor(f);
    expect(JSON.stringify(full).length).toBeGreaterThan(MAX_LOBBY_BYTES);
    const notes: string[] = [];
    const fitted = fitLobbyMessage(full, notes);
    expect(fitted).not.toBeNull();
    expect(JSON.stringify(fitted).length).toBeLessThan(MAX_LOBBY_BYTES);
    expect(notes[0]).toMatch(/pictures were left out/);
    // Without the pictures it still plays.
    const r = agree(offerFor(factionOf("militia")), wire(fitted!));
    expect(r.ok).toBe(true);
    // A faction too big even without pictures can't be sent at all.
    const giant = forged();
    giant.blurb = "x".repeat(MAX_LOBBY_BYTES);
    expect(fitLobbyMessage(pickFor(giant))).toBeNull();
  });

  it("are forgotten when the game is over", () => {
    const r = agree(offerFor(forged("militia", "Host Mob")), pickFor(forged()));
    expect(r.ok).toBe(true);
    expect(FACTIONS["net-p0"]).toBeDefined();
    expect(Object.keys(PROFILES).some((id) => id.startsWith("net-p0:"))).toBe(true);
    dropNetFactions();
    expect(Object.keys(FACTIONS).some((id) => id.startsWith("net-"))).toBe(false);
    expect(Object.keys(PROFILES).some((id) => id.startsWith("net-"))).toBe(false);
  });

  it("use the guest's own saved list ids, mapped to the game's", () => {
    const f = forged();
    const r = agree(offerFor(factionOf("militia")), pickFor(f));
    if (!r.ok) throw new Error(r.problems.join("; "));
    expect(r.game.sides[1].entries.map((e) => e.profileId)).toEqual(f.defaultList.map((e) => e.profileId.replace(f.id, "net-p1")));
    expect(listsFor("net-p1", "skirmish")[0]!.entries.length).toBeGreaterThan(0);
  });
});

describe("lobby messages", () => {
  it("only well-formed ones are read", () => {
    expect(readLobbyMessage(null)).toBeNull();
    expect(readLobbyMessage({ v: 99, kind: "bye" })).toBeNull();
    expect(readLobbyMessage({ v: LOBBY_VERSION, kind: "bye" })).toEqual({ v: LOBBY_VERSION, kind: "bye" });
    expect(readLobbyMessage({ ...offerFor(factionOf("militia")), mode: "chaos" })).toBeNull();
    expect(readLobbyMessage({ ...offerFor(factionOf("militia")), missionId: "__proto__" })).toBeNull();
    expect(readLobbyMessage({ v: LOBBY_VERSION, kind: "guest", side: { faction: { id: "swarm", custom: {} } } })).toBeNull();
    const host = readLobbyMessage({ ...offerFor(factionOf("militia")), rules: { reroll: "yes", evil: true } });
    expect(host?.kind).toBe("host");
    if (host?.kind === "host") expect(host.rules).toEqual(STANDARD_RULES); // unknown or odd rule values fall back
    const refused = readLobbyMessage({ v: LOBBY_VERSION, kind: "refused", reasons: ["a", 5, "b".repeat(1000)] });
    expect(refused).toEqual({ v: LOBBY_VERSION, kind: "refused", reasons: ["a", "b".repeat(300)] });
  });
});
