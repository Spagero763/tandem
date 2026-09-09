/**
 * Cross-checks our hand-rolled Nimiq address derivation and message-signature
 * verification against @nimiq/core, the canonical implementation.
 *
 * Run with: pnpm tsx scripts/verify-nimiq-crypto.ts
 */
import * as Nimiq from '@nimiq/core'

import { normalizeAddress, publicKeyToUserFriendlyAddress } from '../src/lib/nimiq/address'
import { bytesToHex, messageDigest, recoverSigner, verifySignedBy } from '../src/lib/nimiq/signature'

const MSG_PREFIX = '\x16Nimiq Signed Message:\n'

let failures = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

const ROUNDS = 200

console.log(`\nAddress derivation vs @nimiq/core (${ROUNDS} random keypairs)`)

let addressMismatches = 0
const samples: { publicKey: string; address: string }[] = []

for (let i = 0; i < ROUNDS; i++) {
  const keyPair = Nimiq.KeyPair.generate()
  const publicKey = keyPair.publicKey
  const expected = publicKey.toAddress().toUserFriendlyAddress()
  const actual = publicKeyToUserFriendlyAddress(publicKey.serialize())

  if (expected !== actual) {
    addressMismatches++
    if (addressMismatches <= 3) {
      console.log(`        pk=${bytesToHex(publicKey.serialize())}`)
      console.log(`        expected ${expected}`)
      console.log(`        actual   ${actual}`)
    }
  }
  if (i < 3) samples.push({ publicKey: bytesToHex(publicKey.serialize()), address: expected })
}

check(`${ROUNDS} derivations match`, addressMismatches === 0, `${addressMismatches} mismatched`)

console.log('\nChecksum parsing round-trip')

let parseFailures = 0
for (let i = 0; i < ROUNDS; i++) {
  const address = Nimiq.KeyPair.generate().publicKey.toAddress().toUserFriendlyAddress()
  if (normalizeAddress(address) !== address) parseFailures++
}
check(`${ROUNDS} addresses parse and re-encode`, parseFailures === 0, `${parseFailures} failed`)

check(
  'rejects a tampered checksum',
  (() => {
    const address = Nimiq.KeyPair.generate().publicKey.toAddress().toUserFriendlyAddress()
    const digit = address[2] === '0' ? '1' : '0'
    return normalizeAddress(address.slice(0, 2) + digit + address.slice(3)) === null
  })(),
)

check('rejects a tampered body', (() => {
  const address = Nimiq.KeyPair.generate().publicKey.toAddress().toUserFriendlyAddress()
  const swapped = address.slice(0, 10) + (address[10] === 'A' ? 'B' : 'A') + address.slice(11)
  return normalizeAddress(swapped) === null
})())

check('rejects junk input', normalizeAddress('not-an-address') === null)

console.log('\nMessage digest vs @nimiq/core')

const messages = ['tandem', 'a', '0123456789', 'nonce:9f3c2a1b-run-2026', '~!@#$%^&*()_+']
let digestMismatches = 0

for (const message of messages) {
  const expected = Nimiq.Hash.computeSha256(
    new TextEncoder().encode(MSG_PREFIX + message.length + message),
  )
  if (bytesToHex(expected) !== bytesToHex(messageDigest(message))) digestMismatches++
}
check(`${messages.length} digests match`, digestMismatches === 0, `${digestMismatches} mismatched`)

console.log('\nSignature verification')

const keyPair = Nimiq.KeyPair.generate()
const address = keyPair.publicKey.toAddress().toUserFriendlyAddress()
const message = 'tandem-login-9f3c2a1b'
const signature = Nimiq.Signature.create(
  keyPair.privateKey,
  keyPair.publicKey,
  messageDigest(message),
)

const signed = {
  publicKey: bytesToHex(keyPair.publicKey.serialize()),
  signature: bytesToHex(signature.serialize()),
}

check('recovers the correct signer', recoverSigner(message, signed) === address)
check('accepts the matching address', verifySignedBy(message, address, signed))
check('accepts a compact-form address', verifySignedBy(message, address.replace(/\s/g, ''), signed))

check('rejects a different message', recoverSigner(message + 'x', signed) !== address)

check(
  'rejects a substituted address',
  !verifySignedBy(message, Nimiq.KeyPair.generate().publicKey.toAddress().toUserFriendlyAddress(), signed),
)

check(
  'rejects a foreign public key',
  !verifySignedBy(message, address, {
    publicKey: bytesToHex(Nimiq.KeyPair.generate().publicKey.serialize()),
    signature: signed.signature,
  }),
)

check(
  'rejects a flipped signature bit',
  (() => {
    const bytes = signature.serialize()
    bytes[10] ^= 1
    return !verifySignedBy(message, address, { ...signed, signature: bytesToHex(bytes) })
  })(),
)

check('rejects malformed hex', recoverSigner(message, { ...signed, signature: 'zz' }) === null)
check(
  'rejects a wrong-length key',
  recoverSigner(message, { ...signed, publicKey: signed.publicKey.slice(0, 60) }) === null,
)

console.log('\nSample vectors')
for (const sample of samples) {
  console.log(`  ${sample.publicKey}\n    -> ${sample.address}`)
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
