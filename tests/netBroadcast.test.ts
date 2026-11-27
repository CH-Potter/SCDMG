// The BroadcastChannel transport (net/broadcast.ts, for the dev server's two-tab PvP game) and the
// battle screen's online opponent (ui/opponent.ts), which turns the session's events into moves to
// show. Node has BroadcastChannel too, and delivers between channels of the same name in one process.

import { afterEach, describe, expect, it } from "vitest";
import { aiCommand } from "../src/engine/ai";
import { syncHash } from "../src/engine/fingerprint";
import type { GameSetup } from "../src/engine/game";
import type { Command } from "../src/engine/types";
import { BroadcastTransport } from "../src/net/broadcast";
import { PvpSession, type Role } from "../src/net/session";
import { memoryHub, type Transport } from "../src/net/transport";
import { NetOpponent, type RemoteMove } from "../src/ui/opponent";
import { DEV_CODE, DEV_SETUP } from "../src/ui/pvpDev";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 3000, what = "condition"): Promise<void> {
  for (let t = 0; !cond(); t += 2) {
    if (t > ms) throw new Error(`timed out waiting for ${what}`);
    await tick(2);
  }
}

const closers: { close(): void }[] = [];
afterEach(() => {
  for (const c of closers.splice(0)) c.close();
});

function session(transport: Transport, role: Role) {
  const s = new PvpSession({ transport, code: DEV_CODE, role, build: "test", resendMs: 15, pingMs: 1000, pairTimeoutMs: 400 });
  closers.push(s);
  return s;
}

async function startPair(make: () => Transport, setup: GameSetup) {
  const host = session(make(), "host");
  const guest = session(make(), "guest");
  guest.setupOffered.add(() => void guest.acceptSetup());
  // The guest's screen listens from the moment the game starts (as main.ts does).
  let net: NetOpponent | null = null;
  guest.started.add(() => (net = new NetOpponent(guest)));
  await host.start();
  await guest.start();
  await until(() => host.isPaired && guest.isPaired, 3000, "pairing");
  await host.proposeSetup(setup);
  await until(() => !!host.state && !!guest.state && !!net, 3000, "the game to start");
  return { host, guest, net: net! };
}

describe("BroadcastTransport", () => {
  it("carries bytes between channels of the same room, not back to the sender, and stops when closed", async () => {
    const a = new BroadcastTransport("scdmg-test/");
    const b = new BroadcastTransport("scdmg-test/");
    const c = new BroadcastTransport("scdmg-test/");
    closers.push(a, b, c);
    const got: Record<string, number[][]> = { a: [], b: [], c: [] };
    a.onMessage((m) => got.a!.push([...m]));
    b.onMessage((m) => got.b!.push([...m]));
    c.onMessage((m) => got.c!.push([...m]));
    const statuses: string[] = [];
    a.onStatus((s) => statuses.push(s));
    await a.join("room-1");
    await b.join("room-1");
    await c.join("room-2");
    a.send(new Uint8Array([1, 2, 3]));
    await until(() => got.b!.length === 1, 1000, "delivery");
    await tick(20);
    expect(got.b).toEqual([[1, 2, 3]]);
    expect(got.a).toEqual([]);
    expect(got.c).toEqual([]);
    b.close();
    a.send(new Uint8Array([4]));
    await tick(20);
    expect(got.b).toHaveLength(1);
    a.close();
    expect(statuses).toEqual(["open", "closed"]);
    a.send(new Uint8Array([5])); // ignored once closed
  });

  it("lets two sessions pair and play in lockstep, as the two dev tabs do", async () => {
    const { host, guest } = await startPair(() => new BroadcastTransport("scdmg-test/"), DEV_SETUP);
    expect(syncHash(host.state!)).toBe(syncHash(guest.state!));
    for (let i = 0; i < 6; i++) {
      await until(() => host.myMove || guest.myMove, 3000, "someone's move");
      const mover = host.myMove ? host : guest;
      const settle = [host, guest].find((s) => s.canSettle);
      if (settle) await settle.finalize();
      else await mover.submit(aiCommand(mover.state!)!);
      await until(() => host.turn === guest.turn && !host.openCommand === !guest.openCommand, 3000, "both to apply it");
    }
    expect(syncHash(host.state!)).toBe(syncHash(guest.state!));
  }, 20000);
});

describe("NetOpponent", () => {
  it("queues only the opponent's moves, in order, and marks kept and re-rolled attacks", async () => {
    const hub = memoryHub();
    const { host, guest, net } = await startPair(() => hub.transport(), { ...DEV_SETUP, rules: { reroll: true, cardCp: false } });
    expect(net.startState).toBe(guest.state);
    let woken = 0;
    const changes: number[] = [];
    net.listen({ moves: () => woken++, changed: () => changes.push(1), peer: () => {}, desync: () => {}, problem: () => {}, ended: () => {} });
    const seen: RemoteMove[] = [];
    let rerolled = 0;
    let kept = 0;
    // Play until the host has re-rolled one attack and kept another (or a fair number of moves).
    for (let i = 0; i < 400 && !(rerolled && kept); i++) {
      await until(() => host.myMove || guest.myMove || host.canSettle || guest.canSettle, 3000, "a move");
      const settler = [host, guest].find((s) => s.canSettle);
      if (settler) {
        const e = settler.openCommand!;
        if (settler === host && !rerolled) {
          rerolled++;
          await settler.finalize({ ...(e.cmd as Extract<Command, { type: "shoot" }>), reroll: true });
        } else {
          if (settler === host) kept++;
          await settler.finalize();
        }
      } else {
        const mover = host.myMove ? host : guest;
        await mover.submit(aiCommand(mover.state!)!);
      }
      await until(() => host.turn === guest.turn && !host.openCommand === !guest.openCommand, 3000, "both to apply it");
      for (let m = net.take(); m; m = net.take()) seen.push(m);
    }
    expect(woken).toBeGreaterThan(0);
    expect(changes.length).toBeGreaterThan(0); // the guest's own moves were acknowledged
    // Only the host's moves (seat 0), never the guest's own.
    expect(seen.every((m) => m.applied.seat === 0)).toBe(true);
    const commands = seen.filter((m) => m.kind === "command").map((m) => m.applied.n);
    expect(commands).toEqual([...commands].sort((a, b) => a - b));
    expect(new Set(commands).size).toBe(commands.length);
    if (rerolled) {
      const r = seen.find((m) => m.kind === "rerolled")!;
      expect(r.applied.revised).toBe(true);
      expect(commands).toContain(r.applied.n); // the attack itself came first
    }
    if (kept) {
      const k = seen.find((m) => m.kind === "kept")!;
      expect(k.applied.events).toEqual([]);
      expect(commands).toContain(k.applied.n);
    }
    expect(rerolled + kept).toBeGreaterThan(0);
    net.dispose();
  }, 60000);
});
