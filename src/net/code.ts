// Invite codes for online play: 16 Crockford base32 characters (80 random bits), shown as
// XXXX-XXXX-XXXX-XXXX. Both players derive the room and its key from the code (net/crypto.ts), so
// the code itself never goes over the wire. 80 bits keeps the room ids, which anyone on a public
// broker can see, far beyond offline guessing. See docs/pvp-feasibility.md §3.1.

/** Crockford base32: digits and letters without I, L, O and U. */
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_BYTES = 10;
const CODE_CHARS = 16;

/** A fresh invite code from crypto randomness, in four dash-separated groups. */
export function newInviteCode(random: (n: number) => Uint8Array = randomBytes): string {
  return formatCode(random(CODE_BYTES));
}

/** The 10 raw bytes as a grouped code. */
export function formatCode(bytes: Uint8Array): string {
  if (bytes.length !== CODE_BYTES) throw new Error(`An invite code is ${CODE_BYTES} bytes`);
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = "";
  for (let i = CODE_CHARS - 1; i >= 0; i--) out += CODE_ALPHABET[Number((bits >> BigInt(i * 5)) & 31n)];
  return out.replace(/(.{4})(?=.)/g, "$1-");
}

/**
 * A typed or pasted code, tidied: upper case, spaces and dashes dropped, and the look-alikes O, I
 * and L read as 0 and 1. Null unless exactly 16 valid characters remain.
 */
export function normalizeCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (s.length !== CODE_CHARS) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

/** The code's 10 raw bytes, or null if it is malformed (forgiving as normalizeCode is). */
export function codeBytes(input: string): Uint8Array<ArrayBuffer> | null {
  const s = normalizeCode(input);
  if (!s) return null;
  let bits = 0n;
  for (const ch of s) bits = (bits << 5n) | BigInt(CODE_ALPHABET.indexOf(ch));
  const out = new Uint8Array(CODE_BYTES);
  for (let i = CODE_BYTES - 1; i >= 0; i--) {
    out[i] = Number(bits & 255n);
    bits >>= 8n;
  }
  return out;
}

/** The code in its display form (grouped), or null if it is malformed. */
export function prettyCode(input: string): string | null {
  const b = codeBytes(input);
  return b ? formatCode(b) : null;
}

/** A join link's code: `#join=XXXX-…` in a URL fragment (never sent to the server). */
export function codeFromHash(hash: string): string | null {
  const m = /(?:^#|&)join=([^&]+)/.exec(hash);
  return m?.[1] ? prettyCode(decodeURIComponent(m[1])) : null;
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}
