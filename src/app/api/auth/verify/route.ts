import { NextResponse } from 'next/server'
import { z } from 'zod'

import { consumeNonce, loginMessage } from '@/lib/auth/nonce'
import { createSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { players } from '@/lib/db/schema'
import { shortenAddress, toCompactAddress } from '@/lib/nimiq/address'
import { recoverSigner } from '@/lib/nimiq/signature'
import { clientKey, rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  nonce: z.string().regex(/^[0-9a-f]{32}$/),
  publicKey: z.string().regex(/^[0-9a-fA-F]{64}$/),
  signature: z.string().regex(/^[0-9a-fA-F]{128}$/),
})

export async function POST(request: Request) {
  const limit = await rateLimit(clientKey(request, 'verify'), 20, 60)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Malformed sign-in request.' }, { status: 400 })
  }

  const { nonce, publicKey, signature } = parsed.data

  // Consume first. A nonce is spent by the attempt, not by the success, so a
  // captured signature cannot be replayed by retrying against the same code.
  if (!(await consumeNonce(nonce))) {
    return NextResponse.json({ error: 'That sign-in code has expired. Try again.' }, { status: 400 })
  }

  /*
   * The address is derived from the public key that produced the signature —
   * never taken from the request. A client can claim any address it likes; only
   * this derivation decides which one it actually gets.
   */
  const signer = recoverSigner(loginMessage(nonce), { publicKey, signature })
  if (!signer) {
    return NextResponse.json({ error: 'That signature did not check out.' }, { status: 401 })
  }

  const address = toCompactAddress(signer)
  if (!address) {
    return NextResponse.json({ error: 'That signature did not check out.' }, { status: 401 })
  }

  const db = await getDb()
  await db
    .insert(players)
    .values({ address, handle: shortenAddress(address) })
    .onConflictDoUpdate({
      target: players.address,
      set: { lastSeenAt: new Date() },
    })

  await createSession(address)

  return NextResponse.json({ address })
}
