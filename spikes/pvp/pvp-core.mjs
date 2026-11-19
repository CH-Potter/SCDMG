// PvP transport spike (throwaway, not imported by the game). See docs/pvp-feasibility.md.
//
// Three small pieces, no dependencies, running in a browser or in Node 22+ (global WebSocket and
// WebCrypto):
//   1. Invite codes: 16 Crockford base32 characters (80 random bits), shown as XXXX-XXXX-XXXX-XXXX.
//   2. Room crypto: HKDF-SHA256 from the code gives an opaque room id (the MQTT topic) and an
//      AES-256-GCM key. The code itself never goes over the wire. Every message carries the sender's
//      random session id and a counter inside the ciphertext, so tampered, replayed or reflected
//      messages are dropped.
//   3. A minimal MQTT 3.1.1 client over WebSocket (CONNECT, SUBSCRIBE, PUBLISH at QoS 0, PING),
//      enough for two clients to meet on a public broker.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U
const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------- 1. invite codes ----------

/** A fresh invite code: 80 random bits as 16 base32 characters in four groups. */
export function newInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = "";
  for (let i = 15; i >= 0; i--) out += ALPHABET[Number((bits >> BigInt(i * 5)) & 31n)];
  return out.match(/.{4}/g).join("-");
}

/** The code's 10 raw bytes, forgiving case, spaces, dashes and the look-alikes O/I/L. Null if malformed. */
export function codeBytes(code) {
  const s = code.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== 16) return null;
  let bits = 0n;
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    bits = (bits << 5n) | BigInt(v);
  }
  const out = new Uint8Array(10);
  for (let i = 9; i >= 0; i--) {
    out[i] = Number(bits & 255n);
    bits >>= 8n;
  }
  return out;
}

// ---------- 2. room crypto ----------

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Everything both players derive from the invite code: the topic (an HKDF output, so seeing it
 * tells nobody the code) and the AES-GCM key. 80 bits of code entropy is far beyond offline
 * guessing, so a plain HKDF is enough (no slow PBKDF2 needed).
 */
export async function deriveRoom(code, prefix = "scdmg-spike/v1") {
  const ikm = codeBytes(code);
  if (!ikm) throw new Error("Malformed invite code");
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits", "deriveKey"]);
  const salt = enc.encode("scdmg-pvp-v1");
  const roomBits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: enc.encode("room") }, base, 128);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: enc.encode("aes-gcm key") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { topic: `${prefix}/${hex(roomBits)}`, key };
}

/**
 * One side of an encrypted conversation in a room. `seal` and `open` work on bytes; the transport
 * just carries them. Wire format: [1-byte version][12-byte random IV][AES-GCM ciphertext + tag],
 * with the topic as additional authenticated data (a message can't be moved to another room).
 */
export class SecureChannel {
  constructor(room) {
    this.room = room;
    this.sid = hex(crypto.getRandomValues(new Uint8Array(8))); // this connection's random id
    this.seq = 0;
    this.lastSeen = new Map(); // sender sid -> highest seq accepted
    this.aad = enc.encode(room.topic);
  }

  async seal(body) {
    const plain = enc.encode(JSON.stringify({ sid: this.sid, seq: ++this.seq, t: Date.now(), body }));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: this.aad }, this.room.key, plain));
    const out = new Uint8Array(1 + 12 + ct.length);
    out[0] = 1;
    out.set(iv, 1);
    out.set(ct, 13);
    return out;
  }

  /** The message, or { drop: reason } for anything forged, tampered, replayed or our own echo. */
  async open(bytes) {
    if (bytes.length < 1 + 12 + 16 || bytes[0] !== 1) return { drop: "malformed" };
    let msg;
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(1, 13), additionalData: this.aad }, this.room.key, bytes.slice(13));
      msg = JSON.parse(dec.decode(plain));
    } catch {
      return { drop: "failed authentication (wrong key or tampered)" };
    }
    if (msg.sid === this.sid) return { drop: "own echo" };
    const last = this.lastSeen.get(msg.sid) ?? 0;
    if (!(msg.seq > last)) return { drop: `replay (seq ${msg.seq} <= ${last})` };
    this.lastSeen.set(msg.sid, msg.seq);
    return msg;
  }
}

// ---------- 3. minimal MQTT 3.1.1 over WebSocket ----------

function str(s) {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 255, ...b];
}

function packet(type, body) {
  const len = [];
  let n = body.length;
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 128;
    len.push(byte);
  } while (n > 0);
  const out = new Uint8Array(1 + len.length + body.length);
  out[0] = type;
  out.set(len, 1);
  out.set(body, 1 + len.length);
  return out;
}

/**
 * A bare-bones MQTT client: connect, subscribe to one topic, publish at QoS 0. `onMessage(topic, bytes)`.
 * Enough to measure whether public brokers carry the traffic; a real build would add reconnects.
 */
export class MiniMqtt {
  constructor(url, { clientId = `scdmg-${hex(crypto.getRandomValues(new Uint8Array(6)))}`, keepAlive = 30 } = {}) {
    this.url = url;
    this.clientId = clientId;
    this.keepAlive = keepAlive;
    this.buf = new Uint8Array(0);
    this.onMessage = () => {};
    this.onClose = () => {};
    this.pid = 1;
    this.waiting = new Map(); // packet type -> resolve
  }

  connect(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout connecting to ${this.url}`)), timeoutMs);
      const ws = new WebSocket(this.url, ["mqtt"]);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`WebSocket error on ${this.url}`));
      };
      ws.onclose = () => {
        clearInterval(this.pinger);
        this.onClose();
      };
      ws.onmessage = (e) => this.feed(new Uint8Array(e.data));
      ws.onopen = () => {
        const flags = 0x02; // clean session
        const body = [...str("MQTT"), 4, flags, this.keepAlive >> 8, this.keepAlive & 255, ...str(this.clientId)];
        this.waiting.set(2, (p) => {
          clearTimeout(timer);
          if (p[1] !== 0) return reject(new Error(`CONNACK refused, code ${p[1]}`));
          this.pinger = setInterval(() => this.ws.send(packet(0xc0, [])), (this.keepAlive * 1000) / 2);
          resolve();
        });
        ws.send(packet(0x10, body));
      };
    });
  }

  subscribe(topic) {
    return new Promise((resolve) => {
      const id = this.pid++;
      this.waiting.set(9, resolve);
      this.ws.send(packet(0x82, [id >> 8, id & 255, ...str(topic), 0]));
    });
  }

  publish(topic, bytes) {
    this.ws.send(packet(0x30, [...str(topic), ...bytes]));
  }

  close() {
    clearInterval(this.pinger);
    try {
      this.ws.send(packet(0xe0, []));
    } catch {}
    this.ws.close();
  }

  feed(chunk) {
    const b = new Uint8Array(this.buf.length + chunk.length);
    b.set(this.buf);
    b.set(chunk, this.buf.length);
    this.buf = b;
    for (;;) {
      let len = 0;
      let mul = 1;
      let i = 1;
      for (; i < this.buf.length && i <= 4; i++) {
        len += (this.buf[i] & 127) * mul;
        mul *= 128;
        if (!(this.buf[i] & 128)) break;
      }
      if (i >= this.buf.length) return; // header incomplete
      const start = i + 1;
      if (this.buf.length < start + len) return; // body incomplete
      const first = this.buf[0];
      const type = first >> 4;
      const body = this.buf.slice(start, start + len);
      this.buf = this.buf.slice(start + len);
      if (type === 3) {
        const tl = (body[0] << 8) | body[1];
        const topic = dec.decode(body.slice(2, 2 + tl));
        const qos = (first >> 1) & 3;
        this.onMessage(topic, body.slice(2 + tl + (qos ? 2 : 0)));
      } else {
        const w = this.waiting.get(type);
        if (w) {
          this.waiting.delete(type);
          w(body);
        }
      }
    }
  }
}

/** Public brokers tried by the spike (WebSocket Secure endpoints). */
export const BROKERS = {
  emqx: "wss://broker.emqx.io:8084/mqtt",
  mosquitto: "wss://test.mosquitto.org:8081/mqtt",
  hivemq: "wss://broker.hivemq.com:8884/mqtt",
  eclipse: "wss://mqtt.eclipseprojects.io:443/mqtt",
};
