import { eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { readSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { players } from '@/lib/db/schema'
import { clientKey, rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Cosmetic status: Patron (stakes NIM through Tandem) and Founder (bought the
 * one-off pack in USDT on Polygon).
 *
 * Neither affects the ladder, the course, or the pot in any way. They are
 * marks next to a name, and that is the whole of it — a paid advantage in a
 * scored game would make every score above yours ambiguous.
 */
const Claim = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('patron'),
    txHash: z.string().trim().min(4).max(128),
    luna: z.number().int().positive().max(100_000_000_000),
  }),
  z.object({
    kind: z.literal('founder'),
    txHash: z
      .string()
      .trim()
      .regex(/^0x[0-9a-fA-F]{64}$/, 'Not an Ethereum transaction hash'),
  }),
])

export async function POST(request: Request) {
  const session = await readSession()
  if (!session) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  }

  const limit = await rateLimit(clientKey(request, 'status'), 10, 60)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const parsed = Claim.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'That claim could not be read.' }, { status: 400 })
  }

  const db = await getDb()

  if (parsed.data.kind === 'patron') {
    // Stake is cumulative: a player who adds to their stake keeps the total,
    // rather than having it replaced by the most recent top-up.
    await db
      .update(players)
      .set({
        patron: true,
        patronSince: sql`coalesce(${players.patronSince}, now())`,
        stakedLuna: sql`${players.stakedLuna} + ${parsed.data.luna}`,
      })
      .where(eq(players.address, session.address))
  } else {
    await db
      .update(players)
      .set({ founder: true })
      .where(eq(players.address, session.address))
  }

  const updated = await db
    .select({
      patron: players.patron,
      stakedLuna: players.stakedLuna,
      founder: players.founder,
    })
    .from(players)
    .where(eq(players.address, session.address))
    .limit(1)

  return NextResponse.json({ ok: true, player: updated[0] ?? null })
}
