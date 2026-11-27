# Security policy

SCDMG is mostly an offline game, but the desktop build is an Electron app, the game loads user-made maps, factions and images, and the browser version can play a friend online, so security problems are possible.

## Online play

"Play a friend online" (browser version only; the desktop build stays offline) works like this:

- **What travels:** the game setup (mode, mission, battlefield, house rules, both armies, and the full data of any custom faction or map either player picks) and then each move. Nothing else: no accounts, emails or names.
- **Where it goes:** through two free public MQTT relay servers, `test.mosquitto.org` and `broker.emqx.io`, over secure WebSockets. They are run by third parties, not by this project.
- **Encryption:** every message is encrypted and authenticated (AES-GCM) with a key derived from the invite code, and the two players then agree a fresh session key (ECDH), so the relays and anyone else on them can't read or alter the game. Old messages can't be replayed into a new game.
- **The invite code is the secret.** Anyone who has it before your friend joins can take their place. Send it only to the person you want to play, and start a new game if it leaks. Once two players have paired, the room is locked to them.
- **What the relays can see:** connection details such as IP addresses, when you are online, message sizes, and an opaque room id. Not the contents.
- **Untrusted data:** everything the other player sends is checked like a file import (cleaned, validated, size-capped at 512 KB, shown escaped). Their custom faction is used for that game only and never saved over your own.
- **Fair dice:** both players contribute randomness to every roll (commit-reveal), and both games check each other after every move.

The design, including what is not protected against, is in [docs/pvp-feasibility.md](docs/pvp-feasibility.md) (sections 3, 4 and 6).

## Reporting a problem

Please don't open a public issue for a security problem. Report it privately through GitHub's [private vulnerability reporting](https://github.com/CH-Potter/SCDMG/security/advisories/new) instead, with steps to reproduce and the version or commit you tested.

You should get a reply within two weeks. Fixes go into the latest release only.
