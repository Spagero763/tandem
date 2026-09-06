import 'server-only'

import { randomBytes } from 'node:crypto'

import { and, eq, isNull, lt } from 'drizzle-orm'

import { getDb } from '@/lib/db'
import { authNonces } from '@/lib/db/schema'

const TTL_MS = 5 * 60 * 1000

/**
 * The exact text the wallet shows the player and signs.
 *
 * Deliberately ASCII-only: Nimiq's signing scheme prefixes the message with its
 * JavaScript string length, so for any non-ASCII character the character count
 * and the UTF-8 byte count would disagree and the digests would not match.
 */
export function loginMessage(nonce: string): string {
  return `Tandem sign-in. This proves you own this address. Code: ${nonce}`
}

export async function issueNonce(): Promise<{ nonce: string; message: string }> {
  const db = await getDb()
  const nonce = randomBytes(16).toString('hex')

  await db.insert(authNonces).values({
    nonce,
    expiresAt: new Date(Date.now() + TTL_MS),
  })

  // Opportunistic cleanup; cheap, indexed, and saves a scheduled job.
  await db.delete(authNonces).where(lt(authNonces.expiresAt, new Date(Date.now() - TTL_MS)))

  return { nonce, message: loginMessage(nonce) }
}

/**
 * Marks a nonce used, returning false if it was already used, expired, or never
 * issued. The update is conditional so two racing requests cannot both win.
 */
export async function consumeNonce(nonce: string): Promise<boolean> {
  if (!/^[0-9a-f]{32}$/.test(nonce)) return false

  const db = await getDb()
  const updated = await db
    .update(authNonces)
    .set({ consumedAt: new Date() })
    .where(and(eq(authNonces.nonce, nonce), isNull(authNonces.consumedAt)))
    .returning({ nonce: authNonces.nonce, expiresAt: authNonces.expiresAt })

  const row = updated[0]
  if (!row) return false
  return row.expiresAt.getTime() >= Date.now()
}
