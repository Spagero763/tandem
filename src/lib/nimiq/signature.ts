import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'

import { publicKeyToUserFriendlyAddress } from './address'

/**
 * Nimiq prefixes signed messages so a signature harvested from a login can
 * never be replayed as a transaction proof.
 */
const MESSAGE_PREFIX = '\x16Nimiq Signed Message:\n'

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('invalid hex string')
  }

  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The exact bytes a Nimiq wallet signs for a plain-text message.
 *
 * The length is the JavaScript string length, matching the wallet, so keep
 * signed payloads ASCII-only: for non-ASCII text the character count and the
 * UTF-8 byte count diverge and the digests would not agree.
 */
export function messageDigest(message: string): Uint8Array {
  return sha256(new TextEncoder().encode(MESSAGE_PREFIX + message.length + message))
}

export interface SignedMessage {
  publicKey: string
  signature: string
}

/**
 * Verifies a wallet signature over `message` and returns the address that the
 * signing key belongs to.
 *
 * Deriving the address from the public key is the point: the client tells us
 * which address it claims, but only this derivation proves it.
 */
export function recoverSigner(message: string, signed: SignedMessage): string | null {
  let publicKey: Uint8Array
  let signature: Uint8Array

  try {
    publicKey = hexToBytes(signed.publicKey)
    signature = hexToBytes(signed.signature)
  } catch {
    return null
  }

  if (publicKey.length !== 32 || signature.length !== 64) return null

  try {
    if (!ed25519.verify(signature, messageDigest(message), publicKey)) return null
    return publicKeyToUserFriendlyAddress(publicKey)
  } catch {
    return null
  }
}

/**
 * Fails closed: a signature that verifies but derives a different address than
 * the one claimed is rejected.
 */
export function verifySignedBy(
  message: string,
  claimedAddress: string,
  signed: SignedMessage,
): boolean {
  const signer = recoverSigner(message, signed)
  if (!signer) return false
  return signer.replace(/\s/g, '') === claimedAddress.replace(/\s/g, '').toUpperCase()
}
