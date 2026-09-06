/**
 * End-to-end check against a running dev server.
 *
 * This is the test that backs the product's central claim: the ladder is scored
 * by the server replaying your inputs, so a client cannot report a score it did
 * not play. It signs in with a real Nimiq keypair, plays a real heat, and then
 * tries to lie about it in several different ways.
 *
 * Run with: pnpm dev  (in one terminal), then pnpm verify:api
 */
import * as Nimiq from '@nimiq/core'

import { autoplay } from './lib/autoplay.js'
import { encodeInputs } from '../src/lib/sim/codec'
import { simulate } from '../src/lib/sim/simulate'
import { bytesToHex, messageDigest } from '../src/lib/nimiq/signature'

const BASE = process.env.TANDEM_URL ?? 'http://localhost:3200'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  PASS  ${name}`)
  else {
    failures++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

let cookie = ''

async function call(path: string, body?: unknown, useCookie = true) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(useCookie && cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const setCookie = response.headers.get('set-cookie')
  if (useCookie && setCookie) cookie = setCookie.split(';')[0]

  const text = await response.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 200) }
  }

  return { status: response.status, json }
}

function todayHeat(): string {
  return new Date().toISOString().slice(0, 10)
}

console.log(`\nAgainst ${BASE}`)

const probe = await fetch(BASE).catch(() => null)
if (!probe) {
  console.log('\n  Dev server is not running. Start it with `pnpm dev` and retry.\n')
  process.exit(1)
}

console.log('\nSign-in')

const keyPair = Nimiq.KeyPair.generate()
const address = keyPair.publicKey.toAddress().toUserFriendlyAddress()
const compact = address.replace(/\s/g, '')

const challenge = await call('/api/auth/challenge')
check('challenge issues a nonce', challenge.status === 200 && typeof challenge.json.nonce === 'string')

const nonce = challenge.json.nonce as string
const message = challenge.json.message as string

function sign(text: string) {
  const signature = Nimiq.Signature.create(keyPair.privateKey, keyPair.publicKey, messageDigest(text))
  return {
    publicKey: bytesToHex(keyPair.publicKey.serialize()),
    signature: bytesToHex(signature.serialize()),
  }
}

const verified = await call('/api/auth/verify', { nonce, ...sign(message) })
check(
  'a valid signature signs the wallet in',
  verified.status === 200 && verified.json.address === compact,
  JSON.stringify(verified.json),
)
check('the session cookie is set', cookie.startsWith('tandem_session='))

const replayNonce = await call('/api/auth/verify', { nonce, ...sign(message) })
check('the same sign-in code cannot be used twice', replayNonce.status === 400)

// Someone else's key must not be able to claim this address.
const impostor = Nimiq.KeyPair.generate()
const secondChallenge = await call('/api/auth/challenge')
const secondNonce = secondChallenge.json.nonce as string
const secondMessage = secondChallenge.json.message as string
const impostorSignature = Nimiq.Signature.create(
  impostor.privateKey,
  impostor.publicKey,
  messageDigest(secondMessage),
)
const impostorLogin = await call('/api/auth/verify', {
  nonce: secondNonce,
  publicKey: bytesToHex(keyPair.publicKey.serialize()),
  signature: bytesToHex(impostorSignature.serialize()),
})
check('a signature from a different key is rejected', impostorLogin.status === 401)

console.log('\nHonest run')

const heatId = todayHeat()
const seed = `heat-${heatId}`
const inputs = autoplay(seed, 0.8)
const truth = simulate(seed, inputs)
const encoded = encodeInputs(inputs)

console.log(`  note  bot scored ${truth.score} over ${truth.ticks} ticks (${encoded.length} B)`)

const honest = await call('/api/run', {
  heatId,
  inputs: encoded,
  claimedScore: truth.score,
  claimedChecksum: truth.checksum,
  pauses: 0,
})

check(
  'an honest run is accepted at the score it played',
  honest.status === 200 && honest.json.score === truth.score && honest.json.mismatch === false,
  JSON.stringify(honest.json),
)
check('the run takes a place on the ladder', typeof honest.json.rank === 'number')

console.log('\nLying about the score')

const inflated = await call('/api/run', {
  heatId,
  inputs: encoded,
  claimedScore: truth.score + 500_000,
  claimedChecksum: truth.checksum,
  pauses: 0,
})

check(
  'an inflated score is overwritten by the replayed score',
  inflated.status === 200 && inflated.json.score === truth.score,
  `server returned ${String(inflated.json.score)}`,
)
check('the lie is recorded rather than silently dropped', inflated.json.mismatch === true)
check('the inflated claim does not become a personal best', inflated.json.personalBest === false)

console.log('\nTampering with the replay')

// Edit the inputs and claim the original score. The server should report what
// the *edited* inputs actually produce.
const edited = [...inputs]
const editAt = Math.floor(edited.length * 0.35)
for (let i = editAt; i < Math.min(editAt + 90, edited.length); i++) edited[i] = 0.5
const editedTruth = simulate(seed, edited)

const tampered = await call('/api/run', {
  heatId,
  inputs: encodeInputs(edited),
  claimedScore: truth.score,
  claimedChecksum: truth.checksum,
  pauses: 0,
})

check(
  'an edited replay scores what the edit actually produces',
  tampered.status === 200 && tampered.json.score === editedTruth.score,
  `server ${String(tampered.json.score)}, expected ${editedTruth.score}`,
)

console.log('\nRejected outright')

const empty = await call('/api/run', {
  heatId,
  inputs: '',
  claimedScore: 0,
  claimedChecksum: 0,
})
check('an empty replay is rejected', empty.status === 400)

const garbage = await call('/api/run', {
  heatId,
  inputs: 'not-valid-base64!!',
  claimedScore: 0,
  claimedChecksum: 0,
})
check('an unreadable replay is rejected', garbage.status === 400)

const padded = await call('/api/run', {
  heatId,
  inputs: encodeInputs([...inputs, ...new Array(200).fill(0.5)]),
  claimedScore: truth.score,
  claimedChecksum: truth.checksum,
})
check(
  'a replay padded past the end of the run is rejected',
  padded.status === 400,
  `status ${padded.status}`,
)

const oldHeat = await call('/api/run', {
  heatId: '2020-01-01',
  inputs: encoded,
  claimedScore: truth.score,
  claimedChecksum: truth.checksum,
})
check('a run for a closed heat is rejected', oldHeat.status === 409)

const savedCookie = cookie
cookie = ''
const anonymous = await call(
  '/api/run',
  { heatId, inputs: encoded, claimedScore: truth.score, claimedChecksum: truth.checksum },
  false,
)
check('an unauthenticated run is rejected', anonymous.status === 401)
cookie = savedCookie

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
