import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, codeBytes, codeFromHash, formatCode, newInviteCode, normalizeCode, prettyCode } from "../src/net/code";
import { MAX_WIRE_BYTES, SecureChannel, deriveRoom } from "../src/net/crypto";

const FIXED = "D9ZP-8KME-NPR7-6AGR";

describe("invite codes", () => {
  it("are 16 base32 characters in four groups", () => {
    for (let i = 0; i < 50; i++) {
      const c = newInviteCode();
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
      expect(prettyCode(c)).toBe(c);
    }
  });

  it("round-trip through their bytes", () => {
    const bytes = Uint8Array.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    const c = formatCode(bytes);
    expect(codeBytes(c)).toEqual(bytes);
    expect(formatCode(new Uint8Array(10))).toBe("0000-0000-0000-0000");
    expect(formatCode(new Uint8Array(10).fill(255))).toBe("ZZZZ-ZZZZ-ZZZZ-ZZZZ");
  });

  it("forgive case, spaces, dashes and look-alike letters", () => {
    expect(prettyCode("d9zp 8kme npr7 6agr")).toBe(FIXED);
    expect(prettyCode("D9ZP8KMENPR76AGR")).toBe(FIXED);
    expect(normalizeCode("oooo-iiii-llll-0000")).toBe("0000111111110000");
  });

  it("refuse anything malformed", () => {
    expect(codeBytes("")).toBeNull();
    expect(codeBytes("D9ZP-8KME-NPR7")).toBeNull(); // too short
    expect(codeBytes("D9ZP-8KME-NPR7-6AGRX")).toBeNull(); // too long
    expect(codeBytes("D9ZP-8KME-NPR7-6AGU")).toBeNull(); // U isn't in the alphabet
    expect(codeBytes("D9ZP-8KME-NPR7-6AG!")).toBeNull();
    expect(CODE_ALPHABET).toHaveLength(32);
  });

  it("come out of a join link's fragment", () => {
    expect(codeFromHash(`#join=${FIXED}`)).toBe(FIXED);
    expect(codeFromHash("#join=d9zp8kmenpr76agr")).toBe(FIXED);
    expect(codeFromHash("#x=1&join=D9ZP-8KME-NPR7-6AGR")).toBe(FIXED);
    expect(codeFromHash("#join=nope")).toBeNull();
    expect(codeFromHash("#lore")).toBeNull();
  });
});

describe("rooms", () => {
  it("are the same for the same code, however it is typed, and differ between codes", async () => {
    const a = await deriveRoom(FIXED);
    const b = await deriveRoom("d9zp 8kme npr7 6agr");
    const c = await deriveRoom("D9ZP-8KME-NPR7-6AGS");
    expect(a.id).toMatch(/^[0-9a-f]{32}$/);
    expect(b.id).toBe(a.id);
    expect(c.id).not.toBe(a.id);
    expect(a.id).not.toContain("d9zp");
  });

  it("refuse a malformed code", async () => {
    await expect(deriveRoom("not a code")).rejects.toThrow(/isn't valid/);
  });
});

describe("sealed channel", () => {
  async function pair(code = FIXED) {
    const host = new SecureChannel(await deriveRoom(code));
    const guest = new SecureChannel(await deriveRoom(code));
    return { host, guest };
  }

  it("carries messages both ways, hiding the content", async () => {
    const { host, guest } = await pair();
    const wire = await host.seal({ kind: "hello", name: "secret plan" });
    expect(new TextDecoder().decode(wire)).not.toContain("secret plan");
    const got = await guest.open<{ kind: string; name: string }>(wire);
    expect(got.ok && got.msg.body).toEqual({ kind: "hello", name: "secret plan" });
    expect(got.ok && got.msg.sid).toBe(host.sid);
    const back = await guest.seal({ kind: "ack" });
    const got2 = await host.open(back);
    expect(got2.ok && got2.msg.seq).toBe(1);
  });

  it("drops its own echo", async () => {
    const { host } = await pair();
    expect(await host.open(await host.seal("x"))).toEqual({ ok: false, drop: "own echo" });
  });

  it("drops replays and out-of-order repeats", async () => {
    const { host, guest } = await pair();
    const m1 = await host.seal(1);
    const m2 = await host.seal(2);
    expect((await guest.open(m2)).ok).toBe(true);
    expect(await guest.open(m2)).toEqual({ ok: false, drop: "replay" });
    expect(await guest.open(m1)).toEqual({ ok: false, drop: "replay" }); // older than one already seen
  });

  it("drops anything tampered with, sealed with another code or moved to another room", async () => {
    const { host, guest } = await pair();
    const wire = await host.seal({ move: "here" });
    for (const i of [0, 1, 13, wire.length - 1]) {
      const bad = wire.slice();
      bad[i] = bad[i]! ^ 1;
      const r = await guest.open(bad);
      expect(r.ok).toBe(false);
    }
    const stranger = new SecureChannel(await deriveRoom("0000-0000-0000-0001"));
    expect(await guest.open(await stranger.seal("hi"))).toEqual({ ok: false, drop: "failed authentication" });
    // The same key in another room (another AAD) doesn't authenticate either.
    const room = await deriveRoom(FIXED);
    const elsewhere = new SecureChannel({ id: "f".repeat(32), key: room.key });
    expect(await guest.open(await elsewhere.seal("hi"))).toEqual({ ok: false, drop: "failed authentication" });
    expect((await guest.open(wire)).ok).toBe(true); // the untouched original still opens
  });

  it("drops malformed and oversized wires without throwing", async () => {
    const { guest } = await pair();
    expect(await guest.open(new Uint8Array(0))).toEqual({ ok: false, drop: "malformed" });
    expect(await guest.open(new Uint8Array(40))).toEqual({ ok: false, drop: "malformed" }); // version 0
    const big = new Uint8Array(MAX_WIRE_BYTES + 1);
    big[0] = 1;
    expect(await guest.open(big)).toEqual({ ok: false, drop: "too big" });
  });

  it("gives every message a fresh IV, so identical bodies never repeat on the wire", async () => {
    const { host } = await pair();
    const a = await host.seal("same");
    const b = await host.seal("same");
    expect(a.slice(1, 13)).not.toEqual(b.slice(1, 13));
  });
});
