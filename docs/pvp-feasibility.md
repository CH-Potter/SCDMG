# Online player-vs-player (PvP): feasibility and design

Status: research and design only. Nothing here is wired into the game. A throwaway transport spike
lives in `spikes/pvp/` (not imported by the game, not part of any build).

Written 2026-11-19 against v0.11.0 (`6e9eb51`). Web facts were checked on 2026-11-19; sources are
listed at the end.

## Summary and recommendation

**PvP is feasible, and the engine is well suited to it.** `applyCommand(state, cmd)` is a pure
reducer with the dice inside `GameState.rng`. Every command comes from `state.activePlayer`, and no
decision is ever asked of the non-active player. Reactions such as overwatch and lurk are automatic.
So two clients can play by exchanging only the game setup and then the commands
(**deterministic lockstep**), and catch drift with a state hash after every command.

Recommended design:

1. **Lockstep over an end-to-end encrypted channel.** Each client runs the engine. Only setup and
   commands cross the wire. A state hash after every command detects desyncs, and the host sends a
   snapshot to resync.
2. **Invite code = key.** The code is 16 Crockford base32 characters (80 random bits), shown as
   `XXXX-XXXX-XXXX-XXXX`. HKDF-SHA256 derives two things from it:
   - an opaque room id (the topic);
   - an AES-256-GCM key.

   The code never goes over the wire. Messages carry a session id and a sequence number inside the
   ciphertext, so forged, tampered, replayed and reflected messages are dropped. The spike
   demonstrates all of this.
3. **Fair dice by per-command commit-reveal.** Both players add randomness to every command, so
   neither can predict or steer the dice. Today, anyone holding the state can predict every future
   roll. The cost is one extra message per command, about 0.5 s on a public broker, which the dice
   animation hides.
4. **The transport is a small interface, so it can be swapped.**
   - **Build and play-test on a public MQTT-over-WSS broker** (EMQX). The spike shows this works
     from the GitHub Pages origin with no dependencies and no account.
   - **Don't ship a public release that depends on a public broker.** Their terms say "testing, no
     reliance", and HiveMQ explicitly forbids any production or dev use.
   - **For release, deploy a ~100-line Cloudflare Worker + Durable Object relay** on the owner's
     free Cloudflare account. It gives you terms you control, rooms capped at two sockets, buffered
     catch-up after a disconnect, and comfortable headroom inside the free plan.

The main alternatives, and why not:

- **WebRTC P2P.** It still needs a signalling channel, so it doesn't remove the relay. Roughly
  10–15 % of pairs need TURN, and TURN credentials need a backend anyway. It also exposes each
  player's IP address to the other, and it buys nothing at this traffic volume.
- **Deno Deploy.** It is being shut down (sunset April 2027).
- **HiveMQ Cloud Serverless free tier.** It is being retired on 2026-12-31.
- **Fly.io.** No free tier for new accounts.
- **Render free tier.** Spin-down with a cold start of about 1 minute.
- **Supabase or Firebase.** They work, but you get an account, a key in the client, and abuse
  controls to manage, for no gain over a Worker. Supabase also pauses free projects after a week of
  inactivity.
- **ntfy.sh.** All topics are public, and it is limited to 250 messages per visitor per day, which
  is too tight.

**Effort.** Roughly **15–20 developer-days** for an MVP:

- lockstep, crypto, MQTT transport and a lobby;
- seat-aware controller refactor;
- custom faction and map transfer;
- tests.

Then **8–12 days** of polish: the Cloudflare relay, reconnect and resume, takebacks, board flip,
fresh-entropy re-rolls, AI takeover on abandon, and Electron opt-in. See [Effort and phased plan](#7-effort-and-phased-plan).

---

## 1. The engine's fit for lockstep play

### 1.1 What makes it work

- **Pure reducer.** `src/engine/types.ts` states the contract: "no DOM, no Pixi, no Math.random —
  only GameState in, GameState out". `applyCommand` (`src/engine/game.ts:239`) clones the state and
  returns `{ ok, state, events }`. Events (dice reports and so on) are derived from the command, so
  they don't need to be sent.
- **Seeded dice in the state.** `rng.ts` is mulberry32 with its 32-bit state in `GameState.rng`.
  `rollD6` and `nextRandom` are the only sources of randomness:
  - `combat.ts:658` (scatter);
  - `game.ts:1370` (random activation order);
  - `scoring.ts:86`.
- **One random input at setup.** `createGame` falls back to `Date.now()` only when `setup.seed` is
  missing (`game.ts:187`). `main.ts:84` passes `seed: Date.now()`. For PvP the seed comes from the
  lobby (see §4).
- **A single writer at a time.** Every command is validated against `s.activePlayer`:
  - `pass`, `rally` (`game.ts:278`) and `support` (`supports.ts:90`) check it directly;
  - `chooseOrder` is issued by `orderChoice.player`, and the engine makes that the active player
    whenever an order choice is pending (`game.ts:1416`).

  So the rule "only the client whose seat is `state.activePlayer` may send the next command" covers
  everything. The receiver checks it, then validates with `commandProblem` (`legality.ts:44`) and
  `applyCommand` as usual.
- **Small commands.** A sealed `shoot` command was 162 bytes on the wire in the spike.
- **No hidden information.** "Hidden" units (`types.ts:81`) are a targeting rule: they can't be shot
  from more than 6". Their positions are on the table. So both clients holding the full state leaks
  nothing.

### 1.2 Setup to agree before the first command

`GameSetup` (`game.ts:68`) is the whole input to `createGame`. Both clients must build it identically:

| Field | PvP source |
| --- | --- |
| `factions`, `lists`, `supports` | Each player sends their own. The host merges them into seat order (host = seat 0). |
| `map` / `mapId` | Host picks. A custom map (`MapDef`) is sent in full and validated by the guest (`customMaps.ts`). |
| `missionId`, `armyRule`, `openCap` | Host picks; guest sees them in the lobby and accepts. |
| `rules` (house rules) | Host proposes (from `loadHouseRules()`); guest must accept the exact set. Sent explicitly, never read from each side's own storage. |
| `orderChoice` | Always `true` (as in `main.ts`). |
| `seed` | Joint commit-reveal in the lobby (§4.2). |
| `startBonus` | Not used (campaign only). PvP is never a campaign battle. |
| Custom Forge factions | The full faction JSON is sent and re-validated with `cleanFaction`/`factionProblems`. It is registered for this game only, under a namespaced id so it can't clash with the receiver's own factions (`FACTIONS` is a global registry, `factions.ts:1426`). |
| Build version | Must match exactly (§5.5). |

The guest then runs `createGame(setup)` and both clients compare a hash of the initial state before
play starts.

### 1.3 Desync detection

The sim already fingerprints state. `sim/play.ts:91` `stateFingerprint` is FNV-1a over
`JSON.stringify({ units, players, objectives, flags, missionState, rng, round, phase, over, winner })`.
`sim/compare.mjs` compares these fingerprints between runs. `tableKey` (`game.ts:598`) is a narrower
key over on-table model positions, used for charge memoisation, and isn't the right tool here.

Plan:

- Move `stateFingerprint` into the engine, for example as `src/engine/fingerprint.ts`. The sim
  imports it from there.
- After applying command *n*, each client sends `ACK { n, hash }`. A mismatch stops play and triggers
  a resync (§5.2). A 32-bit FNV is fine for catching accidental drift. It's not meant to resist an
  attacker, and a modified client can lie about its hash anyway (§4.4).
- `JSON.stringify` key order is stable when both sides run the same code, which the version check
  enforces.

### 1.4 Determinism risks (real, but contained)

1. **Transcendental maths in reducer paths.** `Math.sin/cos/atan2/acos/hypot/pow` are used in:
   - charge contact placement (`game.ts:653–663`);
   - shell scatter (`combat.ts:662`);
   - formations (`formation.ts:119, 443`);
   - route nodes (`terrain.ts:477–506`);
   - spawn layouts (`scoring.ts:184–204`).

   ECMAScript leaves these "implementation-approximated", so engines may differ in the last bit:
   - V8 (Chrome, Edge, Electron) and SpiderMonkey (Firefox) both use fdlibm-derived code, so they
     are very likely to agree.
   - JavaScriptCore (Safari) may not.

   A one-ulp difference in a model's position can change a later range check. Mitigations:
   - the hash catches it, and the host snapshot resyncs;
   - longer term, round positions written by the reducer to a fixed grid (for example 1e-6"),
     which makes ulp noise vanish.

   Measure before deciding: run the same command log in Chrome, Firefox and Safari and compare the
   hashes. The sim's golden files are a ready harness for this.
2. **Global registries.** `FACTIONS` (custom factions) and house-rule defaults must be identical on
   both sides. Sending the data and checking the version handles this. `chargeMemo` (`game.ts:614`)
   is a pure cache and is safe.
3. **JSON safety for snapshots.** State is plain data. One `Infinity` exists in `supports.ts:128`, but
   it is a local, not state. Still, add a test that `JSON.parse(JSON.stringify(s))` round-trips to the
   same fingerprint after a full sim game.

### 1.5 What in the controller assumes "the other side is the AI"

`src/ui/controller.ts` (2,490 lines) is built around `const HUMAN = 0; const AI = 1;` (lines 77–78),
with 90 `HUMAN` and 51 `AI` references. Seat 0 is also "you" (cyan) in `renderer.ts`, `dice.ts`,
`describe.ts`, `attackMark.ts` and `fx/dropship.ts`.

| Place | Assumption | PvP change |
| --- | --- | --- |
| `HUMAN`/`AI` constants, `humanTurn()` (417) | The local player is seat 0 and the opponent is the AI | `localSeat` and `opponentSeat` fields. `humanTurn()` becomes "it's my seat's turn and no opponent action is in flight". |
| `runAi()` (1146) | Loops `aiCommand(state)` while the active player is seat 1, with pacing sleeps | Becomes `runOpponent()` over an `OpponentDriver` interface. `AiOpponent` wraps `aiCommand`. `NetOpponent` awaits the next verified remote command. The present/pacing loop stays the same. |
| `issue()` (831) | Applies the command locally at once | In PvP: validate locally, then hand to the session. The session runs the dice exchange (§4.2) and calls back with the salted state. Touch double-tap confirm is unchanged. |
| `offerReroll()` (884) / `askReroll()` | Re-applies `{...cmd, reroll: true}` to `before` after the human sees the dice | Must become a protocol step. See the race below and the leak in §4.3. |
| `undo()` (954) | Pops `history`, even after dice were seen ("Dice are seeded, so redoing it rolls the same") | Disabled in PvP for the MVP. Later: a "takeback" request the opponent must accept, only for commands that rolled no dice. |
| `start()` (271) | Roll-off labels "You" / "AI" | Seat-aware labels, using the opponent's display name. |
| `renderOrderChoice()` (2203) | `orderChoice.player === HUMAN` | `=== localSeat`. The other client shows "Opponent is choosing…". |
| `renderSupports()` (~1465), log lines, `describe.ts` `who()` | "AI: ✦ CP", "the AI won…" | Seat-aware wording. |
| `main.ts` `startGame()` | Builds the setup from the local menu, `Date.now()` seed and local house rules | PvP gets its setup from the lobby agreement. |
| `hooks.campaign` | Campaign battles | Never in PvP. |
| `window.__scdmg` (dev only) | Console handle | Harmless (dev server only), but note that it is an easy cheat surface. |

**The re-roll race.**

1. A `shoot` that ends the activation can hand the turn to the opponent (`activePlayer` flips inside
   `applyCommand`).
2. Then the re-roll prompt appears for the shooter.
3. Without a rule, the opponent could act before the shooter's re-roll decision arrives.

The protocol must therefore treat a re-rollable attack as **open** until a `FINAL { n, reroll }`
message arrives. The opponent's input stays locked until then. Both sides then deterministically
replace command *n* with its re-roll variant, as `offerReroll` already does locally.

---

## 2. Hosting and transport options

The game is a static site on GitHub Pages plus an Electron build, so it can't host a server.
Anything that relays messages must live elsewhere. The page only needs an outgoing WSS connection.

### 2.1 Comparison

| Option | Works from GitHub Pages | Account / cost | Terms for this use | Reliability | Notes |
| --- | --- | --- | --- | --- | --- |
| **EMQX public broker** `wss://broker.emqx.io:8084/mqtt` | Yes, tested | None | "Prototype, learn, and test MQTT". No SLA. "All messages are visible to other users". | Worked in spike: connect 1.1 s, RTT ~354 ms | Best public option. |
| **HiveMQ public broker** `wss://broker.hivemq.com:8884/mqtt` | Yes, tested | None | **"Must not be used in Production, Dev, Staging or UAT environments"**. The AUP limits free services to evaluation and personal use. | Worked: connect ~4 s, RTT ~344 ms | Not allowed for a released feature. |
| **test.mosquitto.org** `wss://test.mosquitto.org:8081/mqtt` | Yes, re-tested 2026-11-27 (it refused WebSocket handshakes on the first test day) | None | "Free to use it for any application, but please do not abuse or rely upon it". Runs experimental code. | Worked on re-test: connect 0.8 s, RTT ~337 ms, Let's Encrypt certificate | **The MVP's primary broker**, with EMQX alongside (`src/net/mqtt.ts`). |
| **mqtt.eclipseprojects.io** `wss://…:443/mqtt` | **Failed today** (timeout) | None | Evaluation sandbox; data public | Down or moved | Not usable. |
| EMQX Serverless (free tier) | Yes | Signup. 1M session-minutes, 1 GB/month. Spend limit 0 stays free. | Fine | Managed | Credentials would sit in public JS; anyone could use up the quota. |
| HiveMQ Cloud Serverless (free) | — | — | **Retiring 2026-12-31**; no new clusters | — | Ruled out. |
| **Cloudflare Worker + Durable Object relay** | Yes | Owner's free Cloudflare account. 100k requests/day. SQLite-backed DOs on Free. WebSocket messages billed 20:1, outgoing free. Hibernation avoids idle charges. | Your own service | Global edge; DO placed near first user | **Recommended for release.** About 1,200 messages per game ≈ 60 billed requests, so >1,000 games/day free. |
| Deno Deploy | Yes | Free tier | **Shutting down (sunset April 2027)** | — | Ruled out. |
| Fly.io | Yes | **No free tier for new orgs** ($1 trial credit) | — | — | Ruled out. |
| Render free web service | Yes | Free | — | **Spins down after 15 min; ~1 min cold start** | Poor fit for "join now". |
| PartyKit | Yes | Now runs on your own Cloudflare account (`partyserver` on DOs) | — | — | Same as the Cloudflare option with more layers. |
| Supabase Realtime (free) | Yes | Signup. 200 connections, 2M messages/month | Anon key public by design; needs channel policies | **Free projects pause after 1 week idle** | Works, but heavier than needed. |
| Firebase RTDB (Spark) | Yes | Signup. 100 simultaneous connections | Fine | Managed | Works. 100-connection cap = 50 games at once. |
| ntfy.sh | Yes | None | "All topics on ntfy.sh are public" | 250 messages/day per visitor | Too tight. |
| Nostr relays (ephemeral kinds 20000–29999) | Yes | None | Relay-specific; no standard rate limits | Varies per relay | Interesting fallback (Trystero's default), unpredictable. |
| **WebRTC data channel** (signalling via any of the above) | Yes | STUN free (Google, Cloudflare). TURN: Cloudflare 1,000 GB/month free, or Metered 20 GB/month. Both need a key, so a backend mints short-lived credentials. | — | ~85–90 % connect directly; 10–15 % need TURN | See 2.3. |

### 2.2 Why MQTT for the MVP, and a Cloudflare relay for release

- **MQTT** needs nothing: no account, no deployment, no dependency. The spike's MQTT 3.1.1 client is
  about 120 lines. That makes it ideal for building the protocol and play-testing with friends.
- **But a public release shouldn't rest on a broker whose operator says "don't rely on it":**
  - two of the four public brokers were unusable on the day of testing;
  - HiveMQ's terms forbid this use outright;
  - QoS 0 on a clean session means no buffering while a player is offline, so catch-up is the
    client's job.
- **The Cloudflare relay** is a very small program (sketch in 2.4). Because the crypto is end to
  end, the relay only ever sees opaque bytes, exactly like the broker. Moving from MQTT to the relay
  touches the transport file only.
- **Keep MQTT as a fallback transport**, selectable in settings, so the game still works if the
  relay's daily quota runs out. Note that the transport must be fixed per game, so both players use
  the same one. The lobby message can name it.

### 2.3 Why not WebRTC

- It still needs signalling (MQTT, a Worker or Nostr), so it doesn't remove the third party. It
  only moves game traffic off it.
- 10–15 % of pairs need TURN. Free TURN still needs an API key, and the docs (Trystero, Cloudflare)
  say not to put long-lived TURN credentials in frontend code. So a backend is needed anyway, and
  that backend could simply have been the relay.
- **Privacy:** ICE candidates reveal each player's public (and sometimes local) IP address to the
  other player. A relay shows IPs only to the relay operator.
- The benefit, lower latency and no relay bandwidth, doesn't matter for a few hundred small
  messages per game.
- A library such as Trystero (MQTT/Nostr/torrent signalling, AES-GCM with a PBKDF2 room password)
  would make it quick to try. Still not worth the extra failure modes for a turn-based game.

### 2.4 Relay sketch (Cloudflare Worker + Durable Object)

- `GET wss://<relay>/v1/room/<roomId>` is upgraded to a WebSocket and routed to the Durable Object
  named `roomId`. The roomId is the HKDF output, hex.
- Uses the WebSocket Hibernation API (`ctx.acceptWebSocket`), so an idle game costs no duration.
- **Two seats at most.** Each socket presents a random `seatToken` that the client chooses and sends
  as its first frame, in the clear. The relay can't read sealed messages, and the token is random,
  so it reveals nothing. A third socket is refused. A reconnect with the same token replaces the old
  socket.
- Forwards binary frames up to 64 KB to the other socket. Rate limit of about 20 frames/s per socket.
- Keeps the last ~200 frames per room in DO storage so a reconnecting client can catch up. Deletes
  everything 24 h after the last activity, using a DO alarm.
- No logging of payloads or IPs in the Worker code. Cloudflare's own platform logs are outside the
  developer's control; see §6.
- `Origin` allowlist (the GitHub Pages origin and the Electron app scheme). This is a weak filter,
  not security; the security is the end-to-end crypto.

---

## 3. Security design

### 3.1 Invite code

- **Format:** 16 characters of Crockford base32 (`0-9 A-Z` without `I L O U`), grouped
  `XXXX-XXXX-XXXX-XXXX`. That is 80 random bits from `crypto.getRandomValues`.
- **Forgiving input:** case-insensitive, spaces and dashes ignored, `O`→`0`, `I`/`L`→`1`. The spike
  does this. The browser test joined with `d9zp 8kme npr7 6agr` typed in lowercase.
- **Why 80 bits:** anyone can subscribe to `scdmg/#` on a public broker and see every room id. Room
  ids are HKDF outputs of the code, so an observer could try to brute-force codes offline from them.
  - At 80 bits that is out of reach, so a fast HKDF is fine.
  - A shorter, friendlier code (say 8 characters, 40 bits) would be breakable in hours, even with
    PBKDF2.
  - So keep at least about 60 bits. 80 is recommended.
- **Typo check (optional):** add a Crockford check character so a mistyped code says "that code
  isn't valid" instead of waiting in an empty room.
- **Join link:** the code can also go in a link, `https://ch-potter.github.io/SCDMG/#join=XXXX-…`.
  The URL fragment is never sent to GitHub's servers. It does end up in browser history and chat
  previews, which is acceptable for a game invite.

### 3.2 Key and room derivation (WebCrypto)

```
ikm   = the code's 10 raw bytes
salt  = "scdmg-pvp-v1"
room  = HKDF-SHA256(ikm, salt, info="room", 128 bits)          -> hex, the topic / relay room id
key   = HKDF-SHA256(ikm, salt, info="aes-gcm key") as AES-256-GCM key (non-extractable)
```

The code itself never leaves the device. PBKDF2 isn't needed at 80 bits of entropy. If a shorter
code is ever chosen, switch to PBKDF2 with 600k iterations and accept that it only slows an
attacker down.

### 3.3 Message format and protections

```
wire      = [version:1][iv:12 random][AES-GCM ciphertext + 16-byte tag]
AAD       = the room topic (a message can't be replayed into another room)
plaintext = JSON { sid, seq, t, body }
```

- **Confidentiality and integrity:** AES-GCM. Anything without the key fails authentication and is
  dropped.
- **Nonces:** a random 96-bit IV per message. That is safe far beyond a game's volume: the usual
  limit is around 2^32 messages per key. Random IVs also avoid the classic bug of a counter that
  restarts after a reconnect and reuses nonces.
- **Replay:** each connection has a random `sid` and a strictly increasing `seq`. The receiver keeps
  the highest `seq` per `sid` and drops anything not above it.
- **Reflection:** a message whose `sid` is our own is dropped, so the broker's echo or an attacker
  bouncing our messages back does nothing.
- **Game-level ordering:** game messages also carry the command index *n*, so a gap is noticed and
  triggers catch-up.

**Spike evidence.** An eavesdropper subscribed to the wildcard on EMQX and HiveMQ:

- saw only the topic hash and opaque 162-byte blobs;
- its forged message (wrong key) was dropped as "failed authentication" by both peers;
- a one-bit tamper of a captured message was dropped the same way;
- a replay of a captured message was dropped as "replay" by the guest and as "own echo" by its
  original sender.

### 3.4 Locking the room to two players (phase 2)

Anyone who has the code can join. A code pasted in a group chat could let a third person in, or let
them impersonate a player. Fix this with an **ephemeral ECDH handshake**, P-256 or X25519 via
WebCrypto:

1. Each side puts a fresh public key in its first `HELLO`, sealed with the code key.
2. Both derive `sessionKey = HKDF(ECDH secret, salt = code key material, info = "session")` and
   switch to it.

This gives forward secrecy: leaking the code after the handshake reveals nothing. Once the host has
paired with one guest, it ignores further `HELLO`s. With a relay, the two-socket cap enforces the
same thing.

### 3.5 What the broker or relay operator can and can't see

| Can see | Can't do |
| --- | --- |
| Both players' IP addresses and connection times | Read commands, lists, names or chat |
| The room id (a hash; it reveals nothing about the code) | Forge or alter messages undetected |
| Message sizes and timing (who is active, roughly when turns happen) | Replay messages into the game |
| Random MQTT client ids | Learn the invite code |
| On a public broker: **anyone** subscribing to the prefix sees all of the above, not just the operator | |

They can drop, delay or flood messages: a denial of service. The client discards junk cheaply, since
GCM fails fast. Play stalls and the timeout rules in §5.3 apply. For a hobby game that's acceptable.

---

## 4. Fairness

### 4.1 The problem

`GameState.rng` is a 32-bit mulberry32 state that sits in plain view in the game state. Today anyone
holding the state can simulate any candidate command and see its dice in advance. The AI's
look-ahead deliberately scrambles the RNG to avoid exactly this (`ai.ts:574`). Undo also relies on
"redoing it rolls the same".

In PvP, a lightly modified client, or the devtools console, could try every target and weapon and
pick the one whose dice succeed. Options:

| Scheme | Who can predict dice | Cost |
| --- | --- | --- |
| Host picks the seed | Host, always | None |
| Joint seed at setup only | **Both players, all game** (simulation) | One exchange |
| Fresh joint salt per turn | The active player, within the turn | One exchange per turn |
| **Commit-reveal salt per command** | **Nobody before the command is fixed** | ~1.5 round trips per command |

### 4.2 Recommended: commit-reveal per command

**Setup seed.** The host sends `commit = SHA-256(a₀)`. The guest replies with a random `b₀`. The
host reveals `a₀`. The seed is `SHA-256(a₀ ‖ b₀)` truncated to 32 bits. That seed feeds the
initiative roll-off in `createGame`.

**Each command *n*** (A = the active seat, B = the other):

1. **A → B:** `CMD { n, cmd, c = SHA-256(aₙ) }`. A fixes the command and a secret together, before
   knowing B's randomness.
2. **B → A:** `SALT { n, bₙ }`. B checks the command is legal first. B can't steer the outcome
   because it doesn't know `aₙ`.
3. **A → B:** `REVEAL { n, aₙ }`. B checks it against `c`.
4. **Both apply** `applyCommand({ ...s, rng: mix(s.rng, SHA-256(aₙ ‖ bₙ ‖ n)) }, cmd)`, then
   exchange `ACK { n, hash }`.

**No engine change is needed.** The salt is mixed into `rng` on a shallow copy before the reducer
runs. The sim, golden files and the AI game are untouched.

**Latency.** A sees its result after one round trip, about 350 ms on EMQX. B sees it after 1.5 round
trips. The AI is already paced with 620 ms of sleeps per command.

**The remaining lever.** After step 2, A knows the outcome before revealing and could refuse to
reveal. That shows up as a stall and falls under the disconnect rules: a forfeit after the timeout.

### 4.3 Command re-roll leak

`offerReroll` replays the same command from `before` with `reroll: true`. The first dice match
because the same RNG stream is used, and the misses are drawn from further along the stream. So once
A knows `aₙ` and `bₙ`, A can simulate the re-roll and know whether it will help before paying 1 CP.
Only a modified client can exploit this.

The fix is a small engine change for phase 2. Add an optional `rerollSalt` to the `shoot`/`fight`
command. Mix it into `s.rng` right before the misses are re-rolled (`combat.ts:448`). Get it with the
same commit-reveal exchange as the `FINAL` step. Sim runs pass no salt, so the golden files are
unaffected.

### 4.4 What a modified client could still do (and whether that's acceptable)

| Cheat | Prevented? |
| --- | --- |
| Send an illegal command | Yes: the receiver validates with `commandProblem` and `applyCommand` and refuses it. |
| Choose or predict dice | Yes, with §4.2. The re-roll leak remains until §4.3. |
| Edit its own state (extra CP, healed models) | Yes: the opponent never uses the cheater's state. The next hash mismatches, and the cheater's commands are judged against the honest state. |
| Lie about its hash or force a snapshot | Partly. The **host** sends resync snapshots, so a cheating host could try to push a doctored state. The guest must not accept a snapshot silently. Show "your games differ: accept the host's state or end the game", and only replace state after both clients' own logs failed to agree. Replaying the shared command log is a better resync than a snapshot (§5.2). |
| Stall instead of revealing bad dice | Detected as a stall; timeout and forfeit rules apply. |
| Get move suggestions from the built-in AI (`aiCommand`) | No, and it can't be prevented. Fine for a friendly game. |
| See "hidden" units' positions | Nothing to gain: positions are already public. |

**Verdict:** with per-command commit-reveal, the dice are fair even against a modified client. The
only remaining cheats are rage-quitting and AI assistance, which every online board game shares. For
a friendly hobby game that's more than enough. There are no ranked play, accounts or leaderboards to
protect.

---

## 5. Game flow

### 5.1 Lobby and invite UX

1. **Main menu → "Play a friend online".** A one-time notice explains what is sent and who can see
   what (§6).
2. **Host:**
   - picks mode, map, mission, house rules, their faction and list;
   - presses **Create game**;
   - sees the code in large type, with **Copy code** and **Copy link** buttons and the text "Send
     this to your opponent (WhatsApp, Discord…)";
   - the screen then shows "Waiting for opponent…" with a heartbeat indicator.
3. **Guest:**
   - presses **Join**, pastes the code (or opens the `#join=` link);
   - sees the host's map, mission and house rules;
   - picks a faction and list (custom factions allowed);
   - presses **Ready**.
4. **Both** see the full match summary, with both factions and lists and every house rule spelled
   out, and press **Start**. Either side can back out.
5. **Version handshake** first. `HELLO` carries `{ protocol: 1, build: "0.11.0+6e9eb51", transport }`.
   A mismatch shows "Your opponent is on a different version (x). Both of you need the same release
   to play." No play is attempted across versions, because balance numbers and pricing change
   between them.

**Who hosts.** The creator is the host and takes seat 0. That makes the host the authority for the
setup, but not for the dice. Both clients validate every command.

**Seat 1's view.** For the MVP the guest simply plays "red" from the far side. Phase 2 adds a
board-flip option so each player sees their own army at the bottom and in their own colour.

### 5.2 Reconnect and resume

- **Command log.** Each client keeps the full log in memory and in `localStorage`, keyed by room:
  - the setup;
  - each command *n* with its `aₙ`, `bₙ`;
  - the hash after each command.

  It is tiny: a few hundred entries. Setup plus log replays the whole game deterministically, so a
  reload or a crash can resume.
- **On reconnect**, send `RESUME { lastN, hash }`. The peer resends missing entries from its log.
  Public MQTT doesn't buffer for offline QoS 0 clients; the relay's frame ring covers short gaps.
- **On a hash mismatch:**
  1. compare logs (cheap);
  2. if the logs agree but the states don't, it's an engine determinism bug, see §1.4. The host
     sends a gzip-compressed (`CompressionStream`) snapshot of `GameState`, probably tens of KB, to
     be measured. The guest is asked to accept it.
  3. log the mismatch with both hashes so it can be reported as a bug.
- **Re-roll and other open commands** are re-sent too, so a disconnect mid-`FINAL` resumes cleanly.

### 5.3 Disconnects and timeouts

- **Heartbeat.** An encrypted `PING` every 10 s.
- **After 30 s of silence:** "Opponent disconnected — waiting…".
- **After 3 minutes** (configurable), the waiting player can choose:
  - keep waiting;
  - **let the AI take over** their opponent's side: `aiCommand` already exists, and the game becomes
    a normal local game;
  - end the game and claim the win.
- A stalled `REVEAL` or `FINAL` counts as silence.
- **Optional turn timer** as a house rule.
- **Leaving.** "Resign" sends `RESIGN`. Closing the tab doesn't: that is an ordinary disconnect.

### 5.4 Order choice, re-roll prompt and other in-turn decisions

- **Order choice:** a normal `chooseOrder` command from the choosing seat. The other client shows
  "Opponent is choosing who goes first…".
- **Re-roll prompt:** only on the attacker's client. The opponent sees "Opponent is deciding on a
  re-roll…" until `FINAL` (§1.5).
- **CP payments** (rally, supports, barrage markers) are just commands. There is no prompt to the
  other side.

### 5.5 Version and content checks

- **Build version:** expose `package.json` `version` and the short git sha through Vite `define`
  (for example `__APP_VERSION__`, `__APP_COMMIT__`) and require an exact match. This is simpler and
  safer than trying to hash the rules data.
- **Custom factions:**
  - the full JSON, including circle-cropped art data URLs, is sent once in the lobby;
  - it is treated as untrusted input: run it through the same `cleanFaction` and validation as a
    file import, and HTML-escape everything, as the UI already does with `esc()`;
  - register it under a `net-` id for this game only, and offer "Save this faction" afterwards;
  - cap the lobby payload at, say, 512 KB. Chunk it, or drop the art, if a broker's packet limit
    bites (mosquitto's config shows 1 MB; EMQX not verified).
- **Custom maps:** the same, through the `customMaps.ts` validation.

---

## 6. Privacy and compliance

**No personal data is needed.**

- No accounts, emails or names.
- A display name is optional, typed by the player, and sent only inside the encrypted channel.
- Invite codes are random and not linked to anyone.

**What third parties see.** The broker or relay operator (and, on a public broker, anyone watching
the prefix) sees **IP addresses**, connection times, message sizes and the opaque room id.

- EMQX's privacy policy covers its websites and doesn't mention the broker.
- HiveMQ publishes nothing on broker logging.
- test.mosquitto.org's config shows `log_dest none`.
- Cloudflare logs requests under its own policy. The Worker should add no logging of its own.

**POPIA (South Africa).** Hedged; not legal advice.

- **Does it apply?** It applies where the responsible party is domiciled in South Africa (s3(1)(b)).
  Section 1 defines personal information to include an "online identifier". An IP address that can
  be linked to a person most plausibly falls under that. I found no Information Regulator ruling
  that confirms this.
- **Who is the responsible party?** It is whoever decides the purpose and means of processing. If
  the game sends traffic to a broker or relay the developer chose, the developer arguably makes that
  decision. With a self-hosted relay, the developer is also responsible for anything it logs.
  - Personal play between friends may fall under the "purely personal or household activity"
    exclusion (s6(1)(a)).
  - A publicly released feature, used by strangers, probably doesn't.
- **Cheap mitigations:**
  - a short in-game notice before first use, naming the broker or relay and saying it can see IP
    addresses and nothing else;
  - no logging in the relay;
  - a line in the README and `SECURITY.md`. `SECURITY.md` currently describes the game as "offline,
    single-player", and the Electron build is "fully offline" by design.
- **Cross-border transfers.** Most of these services are outside South Africa. That touches s72
  (cross-border transfers) if POPIA applies.
- **If the game is ever published under or associated with PAS**, get a professional opinion. It
  would also bring in ISO 27001 supplier and data-transfer controls.

**Electron.** The desktop build deliberately blocks all network access:

- the CSP has `connect-src 'self' data: blob:` (`electron/main.cjs:41`);
- `webRequest.onBeforeRequest` cancels every http(s) and ws(s) request (`main.cjs:138`).

PvP on desktop therefore needs both relaxed for exactly one host (the relay, or the chosen broker),
ideally only after the player opts in. That is a deliberate security-posture change. Review it like
one, and add an `electron/navigation.test.cjs` case for it.

---

## 7. Effort and phased plan

Estimates are developer-days for someone who knows the codebase, including tests.

### Phase 0: spike (done)

`spikes/pvp/`: invite code, HKDF, AES-GCM channel, minimal MQTT client, Node test and two-tab
browser page. Results are in §8.

### Phase 1: MVP, public MQTT, browser only (≈ 15–20 days)

| Work | Files | Days |
| --- | --- | --- |
| Invite codes, key derivation, sealed channel (promote the spike to TS, add unit tests incl. tamper/replay) | `src/net/code.ts`, `src/net/crypto.ts`, `tests/netCrypto.test.ts` | 1–1.5 |
| `Transport` interface + MQTT-over-WSS client with reconnect, broker list | `src/net/transport.ts`, `src/net/mqtt.ts` | 1.5–2 |
| Session protocol state machine: HELLO/version, lobby setup exchange, joint seed, CMD/SALT/REVEAL/ACK, FINAL for re-rolls, PING, RESIGN, RESUME from log | `src/net/session.ts`, `src/net/protocol.ts` | 3–4 |
| Engine helpers: `fingerprint.ts` (moved from `sim/play.ts`), `withSalt(state, salt)`, `sameSetup` checks | `src/engine/fingerprint.ts`, `sim/play.ts` | 0.5 |
| Controller made seat-aware: `localSeat`, `OpponentDriver` (`AiOpponent`, `NetOpponent`), PvP path in `issue`, re-roll lock, undo off, labels | `src/ui/controller.ts`, `src/ui/describe.ts`, `src/ui/dice.ts`, `src/ui/renderer.ts`, `src/ui/attackMark.ts` | 3–4 |
| Lobby UI: create/join, code display/copy, `#join=` link, match summary, ready/start, waiting/disconnect banners | `src/ui/lobby.ts` (new), `src/ui/menu.ts`, `src/ui/menu.css`, `src/main.ts` | 2–3 |
| Custom faction/map transfer with validation and per-game registration | `src/ui/customFactions.ts`, `src/engine/data/factions.ts`, `src/ui/customMaps.ts` | 1–2 |
| Build version constant | `vite.config.ts`, `src/vite-env.d.ts` | 0.25 |
| Two-client loopback tests: two sessions over an in-memory transport play AI-vs-AI games to the end and hash-match every step; illegal command and wrong-turn refusal; desync detection | `tests/pvp.loopback.test.ts`, `tests/helpers/` | 2 |
| Cross-browser determinism check (Chrome/Firefox/Safari replay of sim logs) | `sim/` script | 0.5–1 |

### Phase 2: polish and release (≈ 8–12 days)

| Work | Files | Days |
| --- | --- | --- |
| Cloudflare Worker + Durable Object relay (two-seat rooms, hibernation, frame ring, 24 h expiry), its transport, deploy notes | `relay/` (new; `wrangler.toml`, `src/index.ts`), `src/net/relay.ts`, `docs/packaging.md` | 2–3 |
| ECDH room lock and forward secrecy | `src/net/crypto.ts`, `src/net/session.ts` | 1 |
| Reconnect/resume across reloads from the stored log; snapshot resync with consent | `src/net/session.ts`, `src/ui/lobby.ts` | 1.5–2 |
| Fresh-entropy re-rolls (`rerollSalt`) | `src/engine/types.ts`, `src/engine/game.ts`, `src/engine/combat.ts`, tests | 0.5–1 |
| Takeback requests (dice-free commands only); AI takeover on abandon; optional turn timer | `src/ui/controller.ts`, `src/engine/houseRules.ts` | 1.5–2 |
| Board flip for seat 1 | `src/ui/renderer.ts`, `src/ui/controller.ts` | 1–1.5 |
| Electron opt-in: CSP and request filter allow one host after consent; test | `electron/main.cjs`, `electron/navigation.test.cjs` | 0.5–1 |
| Privacy notice, README/SECURITY.md updates | `README.md`, `SECURITY.md`, `src/ui/lobby.ts` | 0.5 |

### Phase 3 (optional, later)

Rematch with swapped seats, spectators (read-only third seat), saved match replays from the command
log, position quantisation if cross-browser hashes ever disagree.

### Risks

1. **Cross-engine floating-point drift** (§1.4): mainly Safari. Detected by hashes, and fixable by
   quantising positions. Not yet measured.
2. **Public broker availability and terms.** Two of four failed on test day, and HiveMQ forbids this
   use. Mitigated by the relay for release.
3. **Controller refactor size.** 140+ seat assumptions in a 2,490-line file, plus UI files. This is
   the largest and most regression-prone piece. The loopback tests and the existing UI tests are the
   safety net.
4. **Protocol races.** Re-roll `FINAL`, reconnect mid-exchange, and both players acting during a
   turn handover. Covered by the single-writer rule and explicit open/closed command states, but
   they need careful tests.
5. **Free-tier and vendor churn.** The research found a retirement (HiveMQ Serverless) and a
   shutdown (Deno Deploy) within weeks of each other. Keep the transport swappable and the relay
   tiny.
6. **Electron posture change.** The desktop build goes from "no network ever" to "one host after
   opt-in".
7. **Custom content as untrusted input from another person.** The import validation already exists.
   Reuse it rather than writing a second path.

---

## 8. Spike results (`spikes/pvp/`)

- **Files:**
  - `pvp-core.mjs`: invite code, HKDF room and key derivation, `SecureChannel` (seal and open, with
    replay and reflection checks), and `MiniMqtt`, a dependency-free MQTT 3.1.1 client over
    WebSocket at QoS 0;
  - `node-test.mjs`: a headless trial per broker;
  - `index.html`: a two-tab page.
- **Not part of the game.** None of these are imported by the game, and none are in `tsconfig`
  `include` or the Vite build inputs.
- **Running it:**
  - headless: `node spikes/pvp/node-test.mjs` (Node 22+);
  - in the browser: serve the repo (`npx vite`) and open `/spikes/pvp/` in two tabs.

Run 2026-11-19 from the test machine:

| Broker | Result | Connect | Round trip (20 pings: min / median / p90 / max) |
| --- | --- | --- | --- |
| EMQX `broker.emqx.io:8084/mqtt` | OK | 1.1 s | 352 / 354 / 364 / 365 ms |
| HiveMQ `broker.hivemq.com:8884/mqtt` | OK | 4.0 s | 343 / 344 / 347 / 365 ms |
| test.mosquitto.org `:8081` | WebSocket handshake refused (8081 and 8091 too) | — | — |
| test.mosquitto.org `:8081` (re-test, 2026-11-27) | OK | 0.8 s | 336 / 337 / 339 / 344 ms |
| mqtt.eclipseprojects.io `:443/mqtt` | Connect timeout | — | — |

What the spike showed:

- **Eavesdropper.** On both working brokers, a third client subscribed to `scdmg-spike/#` saw every
  message: 43 messages on one topic, each 162 opaque bytes. No plaintext was visible.
- **Attacks.** Its forged message, a one-bit tamper and a replay were all rejected:
  - "failed authentication" for the forgery and the tamper;
  - "replay" for the replay at the guest, and "own echo" at its original sender.
- **Real browser, two tabs on EMQX.** The host created code `D9ZP-8KME-NPR7-6AGR`, and the guest
  typed `d9zp 8kme npr7 6agr`. Both derived the same room. Ten encrypted pings came back in
  351–354 ms, from a plain `http://127.0.0.1` page with no dependencies.
- **Latency.** About 350 ms per round trip puts the commit-reveal exchange at roughly 0.35 s for the
  active player and about 0.5 s for the other. That is comfortably inside the existing AI pacing.
- **Not tested:**
  - the Cloudflare relay (it would need an account, which this pass deliberately avoided);
  - WebRTC;
  - Safari and Firefox;
  - the Electron build.

---

## Sources

All accessed 2026-11-19. Page dates are given where the page shows one.

**MQTT brokers**

- HiveMQ public broker terms and ports: https://www.mqtt-dashboard.com/ and https://www.mqtt-dashboard.com/llms-full.txt
- HiveMQ Acceptable Use Policy (updated 2026-09-09): https://www.hivemq.com/legal/acceptable-use-policy/
- HiveMQ Cloud Serverless retirement (2026-12-31): https://docs.hivemq.com/hivemq-cloud/introduction.html
- HiveMQ pricing: https://www.hivemq.com/pricing/fully-managed/
- EMQX public broker: https://www.emqx.com/en/mqtt/public-mqtt5-broker
- EMQX privacy policy (2022-06-20): https://www.emqx.com/en/policy/privacy-policy
- EMQX Serverless pricing: https://docs.emqx.com/en/cloud/latest/price/pricing.html
- test.mosquitto.org: https://test.mosquitto.org/ and its config, https://test.mosquitto.org/config
- Eclipse sandboxes: https://iot.eclipse.org/projects/sandboxes/
- MQTT public broker list (wiki, 2025-04-16): https://github.com/mqtt/mqtt.org/wiki/public_brokers

**Cloudflare**

- Workers limits (2026-11-18): https://developers.cloudflare.com/workers/platform/limits/
- Durable Objects pricing (2026-11-13): https://developers.cloudflare.com/durable-objects/platform/pricing/
- Durable Objects limits (2026-11-13): https://developers.cloudflare.com/durable-objects/platform/limits/
- Realtime TURN pricing (2026-09-22): https://developers.cloudflare.com/realtime/pricing/ and https://developers.cloudflare.com/realtime/turn/
- PartyKit acquisition: https://blog.cloudflare.com/cloudflare-acquires-partykit

**Other relay hosts**

- Deno Deploy shutdown (2026-10-09): https://deno.com/blog/cloudflare and https://deno.com/deploy/pricing
- Fly.io pricing: https://docs.fly.io/about/pricing
- Render free tier: https://render.com/docs/free

**WebRTC**

- Trystero (v0.27.0) and its troubleshooting doc on TURN rates: https://github.com/dmotz/trystero and https://raw.githubusercontent.com/dmotz/trystero/main/docs/troubleshooting.md
- Relay usage statistics (2016): https://webrtchacks.com/usage-stats/
- Metered Open Relay: https://www.metered.ca/tools/openrelay/
- PeerJS: https://peerjs.com/

**Other message buses**

- ntfy.sh: https://docs.ntfy.sh/publish/ and https://docs.ntfy.sh/privacy/
- Nostr NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
- Supabase: https://supabase.com/pricing and https://supabase.com/docs/guides/realtime/limits
- Firebase pricing: https://firebase.google.com/pricing

**POPIA**

- s1: https://popia.co.za/section-1-definitions/
- s3: https://popia.co.za/section-3-application-and-interpretation-of-act/
- s6: https://popia.co.za/section-6-exclusions/

**Not verified:**

- the HiveMQ broker's WSS path (`/mqtt` worked in the spike);
- broker IP logging at HiveMQ and EMQX;
- EMQX Serverless connection caps;
- PeerJS cloud and Google STUN terms;
- current PartyKit hosted-platform status;
- a recent primary dataset on how often TURN is needed.
