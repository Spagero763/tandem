import { blake2b } from '@noble/hashes/blake2.js'

/**
 * Nimiq's base32 alphabet. Standard RFC 4648 with I, O, W and Z removed so that
 * a hand-copied address can't be misread.
 */
const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY'

const ADDRESS_BYTES = 20

function toBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]

  return out
}

function fromBase32(input: string): Uint8Array {
  let bits = 0
  let value = 0
  const out: number[] = []

  for (const char of input) {
    const index = ALPHABET.indexOf(char)
    if (index < 0) throw new Error(`invalid base32 character: ${char}`)
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return Uint8Array.from(out)
}

/**
 * IBAN MOD-97-10, chunked so we never exceed Number.MAX_SAFE_INTEGER.
 */
function ibanCheck(input: string): number {
  const digits = input
    .split('')
    .map((char) => {
      const code = char.toUpperCase().charCodeAt(0)
      return code < 48 || code > 57 ? (code - 55).toString() : char
    })
    .join('')

  let remainder = ''
  for (let i = 0; i < Math.ceil(digits.length / 6); i++) {
    remainder = (Number.parseInt(remainder + digits.slice(i * 6, i * 6 + 6), 10) % 97).toString()
  }

  return Number.parseInt(remainder, 10)
}

/** Blake2b-256 of the public key, truncated to 20 bytes. */
export function addressFromPublicKey(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length !== 32) throw new Error('public key must be 32 bytes')
  return blake2b(publicKey, { dkLen: 32 }).subarray(0, ADDRESS_BYTES)
}

/** `NQ` + two check digits + 32 base32 characters, grouped in fours. */
export function toUserFriendlyAddress(address: Uint8Array, spaces = true): string {
  if (address.length !== ADDRESS_BYTES) throw new Error('address must be 20 bytes')

  const base32 = toBase32(address)
  const check = ('00' + (98 - ibanCheck(base32 + 'NQ00'))).slice(-2)
  const full = 'NQ' + check + base32

  return spaces ? (full.match(/.{4}/g) as string[]).join(' ') : full
}

/**
 * Parses a user-friendly address, verifying the checksum. Returns null rather
 * than throwing so callers can treat malformed input as ordinary bad input.
 */
export function parseUserFriendlyAddress(input: string): Uint8Array | null {
  const compact = input.replace(/[\s-]/g, '').toUpperCase()

  if (compact.length !== 36 || !compact.startsWith('NQ')) return null
  if (ibanCheck(compact.slice(4) + compact.slice(0, 4)) !== 1) return null

  try {
    const bytes = fromBase32(compact.slice(4))
    return bytes.length === ADDRESS_BYTES ? bytes : null
  } catch {
    return null
  }
}

/** True when `input` is a well-formed Nimiq address with a valid checksum. */
export function isValidAddress(input: string): boolean {
  return parseUserFriendlyAddress(input) !== null
}

/** Canonical spaced form, or null if the input isn't a valid address. */
export function normalizeAddress(input: string): string | null {
  const bytes = parseUserFriendlyAddress(input)
  return bytes ? toUserFriendlyAddress(bytes) : null
}

export function publicKeyToUserFriendlyAddress(publicKey: Uint8Array): string {
  return toUserFriendlyAddress(addressFromPublicKey(publicKey))
}

/**
 * Storage form: upper-case, no spaces. Addresses arrive formatted in several
 * ways, and a lookup must never depend on which one a caller happened to use.
 */
export function toCompactAddress(input: string): string | null {
  const bytes = parseUserFriendlyAddress(input)
  return bytes ? toUserFriendlyAddress(bytes, false) : null
}

/** A short, readable label for an address: NQ12 ABCD … WXYZ. */
export function shortenAddress(input: string): string {
  const compact = input.replace(/[\s-]/g, '').toUpperCase()
  if (compact.length !== 36) return input
  return `${compact.slice(0, 8)}…${compact.slice(-4)}`
}
