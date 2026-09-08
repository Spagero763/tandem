# Tandem

One thumb. Two orbs. Sixty seconds.

**Play it: https://tandem-six-snowy.vercel.app**

A daily arcade heat that runs inside Nimiq Pay. Everyone who plays on a given
day plays the exact same generated course, so the ladder is a comparison of
skill rather than of luck. Your score is not something your phone reports. It
is something the server works out for itself.

## The idea

You control two orbs with one thumb. They move together, mirrored around the
centre line, which means every gap you steer into for one is a gap you steer
the other one out of. Motes are picked up, shards are avoided, and passing
close to a shard without touching it builds a graze combo that is worth more
than playing safe.

A heat lasts sixty seconds and resets at midnight UTC.

## Scores are replayed, not reported

The usual way a web game gets its leaderboard cheated is that the client posts
a number and the server writes it down. Tandem does not accept numbers.

What the client sends is the **inputs**: one quantised thumb position per tick,
3600 of them for a full heat, encoded to about 9 KB. The server re-runs the
simulation from the day's seed against those inputs and writes down the score
*it* computed. The client also sends what it thought the score was, which is
used for exactly one thing: if the two disagree, the run is flagged and the
replayed score is the one that counts.

This works because the simulation is deterministic and lives in one module,
[`src/lib/sim/`](src/lib/sim/), imported by both the browser that renders a run
and the server that re-scores it. There is no second implementation to drift.

Three properties make it hold up, and each one is a test rather than a claim:

- **Determinism.** The same seed and inputs always produce the same score,
  checksum and tick count.
- **Fairness.** Every wave leaves at least one survivable thumb position, every
  mote is reachable without taking a hit, and no two waves ever occupy the orb
  line at once. A loss is always the player's.
- **Tamper evidence.** Editing a replay changes the score the server derives
  from it. Replaying against the wrong seed does not reproduce the score. A
  truncated replay cannot claim the survival bonus. Thumb speed is clamped per
  tick, so teleporting between gaps is not expressible as input.

Every run gets a public receipt at `/run/<id>` which re-scores it from its
stored inputs **on every request** and shows the stored and replayed numbers
side by side. Ladder rows link straight to it. If the two ever disagreed, the
page would say so.

## Nimiq Pay integration

| Feature | Provider | Method |
| --- | --- | --- |
| Sign in | Nimiq | `sign` |
| Back the pot | Nimiq | `sendBasicTransactionWithData` |
| Patron status | Nimiq | `sendNewStakerTransaction`, `sendStakeTransaction` |
| Founder pack | Ethereum | `eth_sendTransaction`, USDT on Polygon |
| Settling payouts | Nimiq | `sendBasicTransactionWithData` |
| Ladder identity | Nimiq | address derived from the signing key |
| Rate limiting | Nimiq Pay | `requestDeviceIdentifier` |
| Language | Nimiq Pay | `window.nimiqPay.language` |

**Sign-in is one dialog.** The server derives your address from the public key
that produced the signature, so there is no separate account-listing prompt
before it. A signature from a different key cannot claim your address.

**Sign-in happens after a run, not before one.** Nobody should have to approve
a wallet dialog to find out whether they like the game. Play first; if the
score is worth keeping, one signature keeps it.

## The pot

Playing is free and always will be.

Nobody pays to enter, paying nothing never costs you a place, and a
contribution buys no advantage of any kind: not a retry, not a head start, not
a multiplier. Backers fund a prize for the day's best players and cannot win
it. Patron and Founder are marks next to a name and nothing else.

That separation is deliberate. A paid advantage in a scored game makes every
score above yours ambiguous, which is the one thing a ladder cannot afford.

Contributions are recorded by transaction hash and tagged with the heat they
fund, so replaying the same hash can never inflate the pot and each day settles
a defined amount rather than a rolling total. The pot address links out to a
block explorer where it can be checked without trusting this server.

Settlement is done **from the pot wallet inside Nimiq Pay**, not by the server.
No private key for the pot exists in this codebase or on the host: when the pot
wallet signs in, the pot screen shows what yesterday owes and pays each place
through the same approval dialog any player sees. Each payout is then recorded
with its transaction hash and shown publicly, so the promise on the pot page is
checkable rather than taken on trust.

## Running it

```bash
pnpm install
pnpm dev --host      # -H 0.0.0.0 -p 3200
```

With no `DATABASE_URL` set it runs on PGlite, real Postgres compiled to
WebAssembly, stored in `.pglite/`. A fresh clone needs no database setup. Set
`DATABASE_URL` to run against Postgres instead; the schema bootstraps itself
either way.

### Testing on a phone

Use the production bundle, not the dev server:

```bash
pnpm preview          # builds, then serves on 0.0.0.0:3300
```

Put the printed address (for example `http://192.168.1.42:3300`) into the
Custom URL field under Mini Apps, with the phone on the same Wi-Fi network.

The dev server is not usable from a phone here, and the way it fails is worth
knowing because it looks like a broken app rather than a slow one. `next dev`
ships roughly 4.9 MB of unminified JavaScript, including a devtools chunk
larger than the entire production build. An iOS WebView does not get through
it: every chunk returns 200, no error is thrown, and the page simply sits on
the server-rendered HTML forever. Skeletons never resolve, the canvas never
paints, and wallet features report themselves unavailable because that is the
server's default answer. The production bundle is around 770 KB and hydrates
in well under a second on the same device over the same network.

Long-press the settings button for ten seconds to reach the dev menu and
switch to testnet, where free NIM is available for testing payments and
staking.

If a device does misbehave, `NEXT_PUBLIC_DEVICE_REPORTER=1` turns on a
reporter that beacons script errors, failed resource loads, and hydration
timing from the phone into the server's own log. A WebView has no console you
can reach, so without it a device-side failure is invisible.

### Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Required in production; omit for local PGlite. |
| `SESSION_SECRET` | Signs session cookies. Required in production, at least 32 characters. |
| `NEXT_PUBLIC_POT_ADDRESS` | Nimiq address the pot is collected at. |
| `NEXT_PUBLIC_VALIDATOR_ADDRESS` | Validator that Patron staking delegates to. |
| `NEXT_PUBLIC_FOUNDER_ADDRESS` | Polygon address that receives the Founder payment. |

The three addresses each degrade to a disabled button with an explanation
rather than a crash when unset. The first two do not: a production build
refuses to start a session without a signing key, and refuses to fall back to
the on-disk database, because both would fail quietly and lose data rather
than loudly. Set `PGLITE_DIR` to use the local database against a production
build deliberately, which is what `pnpm preview` does.

Session cookies are marked `Secure` based on whether the *connection* is
HTTPS, read from `x-forwarded-proto`, rather than on whether this is a
production build. Keying it off the build breaks sign-in on every production
bundle served without TLS, which is exactly how a mini app is tested on a
phone: the wallet signs, the cookie is set, and every request after it is
anonymous again.

## Verifying it

```bash
pnpm verify        # crypto, simulation, renderer
pnpm verify:api    # end-to-end, needs a dev server running
pnpm inspect       # drives the real app in headless Chrome, saves screenshots
pnpm typecheck
pnpm lint
```

`pnpm inspect` loads every screen in a real browser engine at a phone-shaped
viewport, reports console errors, uncaught exceptions and failed requests, then
plays a heat and screenshots it. It exists because reading the code missed
several arena bugs that were obvious the moment anyone looked at a frame.

`pnpm verify` checks the Nimiq address derivation and signature verification
against `@nimiq/core` over 200 random keypairs, then proves the three
simulation properties above across six seeds.

`pnpm verify:api` signs in with a real Nimiq keypair, plays a heat, and then
tries to cheat: claiming an inflated score, submitting an edited replay,
padding a replay past the end of a run, submitting to a closed heat, reusing a
sign-in code, signing with somebody else's key, and posting anonymously.

## Layout

```
src/lib/sim/        the simulation, shared verbatim by client and server
src/lib/nimiq/      address derivation, signatures, wallet and EVM clients
src/game/           renderer and the frame loop
src/app/api/        auth, run submission, ladder, ghosts, pot, receipts
src/components/     screens
scripts/            the verification suites
```

## Licence

MIT. See [LICENSE](LICENSE).
