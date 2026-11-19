// Headless check of the spike against real public brokers (Node 22+):
//   node spikes/pvp/node-test.mjs [emqx|mosquitto|hivemq|eclipse ...]
// For each broker: host and guest join a room from one invite code, play 20 ping/pong round trips,
// and an eavesdropper subscribed to the whole prefix with a wildcard tries forging, tampering,
// replaying and reflecting. Prints what each party saw and the round-trip times.

import { BROKERS, MiniMqtt, SecureChannel, deriveRoom, newInviteCode } from "./pvp-core.mjs";

const ROUNDS = 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function trial(name, url) {
  const code = newInviteCode();
  const room = await deriveRoom(code);
  const host = { mqtt: new MiniMqtt(url), ch: new SecureChannel(room), drops: [], got: [] };
  const guest = { mqtt: new MiniMqtt(url), ch: new SecureChannel(room), drops: [], got: [] };
  const spy = { mqtt: new MiniMqtt(url), seen: [] };
  const t0 = performance.now();
  await Promise.all([host.mqtt.connect(), guest.mqtt.connect(), spy.mqtt.connect()]);
  const connectMs = performance.now() - t0;
  await Promise.all([host.mqtt.subscribe(room.topic), guest.mqtt.subscribe(room.topic), spy.mqtt.subscribe("scdmg-spike/#")]);
  spy.mqtt.onMessage = (topic, bytes) => spy.seen.push({ topic, bytes });

  const pending = new Map();
  for (const side of [host, guest]) {
    side.mqtt.onMessage = async (topic, bytes) => {
      const m = await side.ch.open(bytes);
      if (m.drop) return side.drops.push(m.drop);
      side.got.push(m.body);
      if (side === guest && m.body.ping !== undefined) guest.mqtt.publish(room.topic, await guest.ch.seal({ pong: m.body.ping }));
      if (side === host && m.body.pong !== undefined) pending.get(m.body.pong)?.();
    };
  }

  const rtts = [];
  for (let i = 0; i < ROUNDS; i++) {
    const start = performance.now();
    const done = new Promise((resolve, reject) => {
      pending.set(i, resolve);
      setTimeout(() => reject(new Error(`round trip ${i} timed out`)), 8000);
    });
    host.mqtt.publish(room.topic, await host.ch.seal({ ping: i, cmd: { type: "shoot", uid: "p0-3", target: "p1-1", weapon: 0 } }));
    await done;
    rtts.push(performance.now() - start);
  }

  // The eavesdropper knows the topic (it saw it through the wildcard) but not the code.
  const captured = spy.seen.find((s) => s.topic === room.topic)?.bytes;
  const wrongRoom = await deriveRoom(newInviteCode());
  const forger = new SecureChannel({ ...wrongRoom, topic: room.topic });
  host.mqtt.publish(room.topic, await forger.seal({ cheat: "forged with the wrong key" }));
  const tampered = captured.slice();
  tampered[tampered.length - 5] ^= 1;
  guest.mqtt.publish(room.topic, tampered); // spy-style tamper of a host message
  guest.mqtt.publish(room.topic, captured); // replay of a host message
  await sleep(1500);

  for (const c of [host.mqtt, guest.mqtt, spy.mqtt]) c.close();
  rtts.sort((a, b) => a - b);
  const pct = (p) => rtts[Math.min(rtts.length - 1, Math.floor(p * rtts.length))].toFixed(0);
  return {
    broker: name,
    connectMs: connectMs.toFixed(0),
    rttMs: { min: rtts[0].toFixed(0), median: pct(0.5), p90: pct(0.9), max: rtts[rtts.length - 1].toFixed(0) },
    guestDrops: summarise(guest.drops),
    hostDrops: summarise(host.drops),
    spySaw: `${spy.seen.length} messages on ${new Set(spy.seen.map((s) => s.topic)).size} topic(s), e.g. topic ${spy.seen[0]?.topic} with ${spy.seen[0]?.bytes.length} opaque bytes`,
    plaintextVisibleToSpy: spy.seen.some((s) => new TextDecoder().decode(s.bytes).includes("shoot")),
  };
}

function summarise(drops) {
  const counts = {};
  for (const d of drops) {
    const k = d.replace(/\(seq.*\)/, "(seq)");
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BROKERS);
for (const name of names) {
  try {
    console.log(JSON.stringify(await trial(name, BROKERS[name]), null, 1));
  } catch (err) {
    console.log(JSON.stringify({ broker: name, error: String(err.message ?? err) }));
  }
}
process.exit(0);
