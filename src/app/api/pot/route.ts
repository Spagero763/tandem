import { desc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { readSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { ladder, players, potContributions } from '@/lib/db/schema'
import { heatIdFor, isValidHeatId } from '@/lib/heat'
import { potAddress, splitPot } from '@/lib/pot'
import { clientKey, rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('heat') ?? heatIdFor()
  const heatId = isValidHeatId(requested) ? requested : heatIdFor()

  const db = await getDb()

  const totals = await db
    .select({
      luna: sql<number>`coalesce(sum(${potContributions.luna}), 0)::bigint`,
      backers: sql<number>`count(distinct ${potContributions.fromAddress})::int`,
    })
    .from(potContributions)

  const totalLuna = Number(totals[0]?.luna ?? 0)

  const leaders = await db
    .select({
      address: ladder.address,
      handle: players.handle,
      score: ladder.score,
    })
    .from(ladder)
    .innerJoin(players, eq(players.address, ladder.address))
    .where(eq(ladder.heatId, heatId))
    .orderBy(desc(ladder.score), ladder.updatedAt)
    .limit(3)

  const shares = splitPot(totalLuna)

  const recent = await db
    .select({
      txHash: potContributions.txHash,
      fromAddress: potContributions.fromAddress,
      luna: potContributions.luna,
      seenAt: potContributions.seenAt,
    })
    .from(potContributions)
    .orderBy(desc(potContributions.seenAt))
    .limit(8)

  return NextResponse.json({
    heatId,
    address: potAddress(),
    totalLuna,
    backers: Number(totals[0]?.backers ?? 0),
    standings: leaders.map((row, index) => ({
      ...row,
      rank: index + 1,
      shareLuna: shares[index] ?? 0,
    })),
    recent,
  })
}

const Contribution = z.object({
  txHash: z.string().trim().min(4).max(128),
  luna: z.number().int().positive().max(100_000_000_000),
  message: z.string().max(120).optional(),
})

/**
 * Records a contribution the wallet has already broadcast.
 *
 * The transaction hash is what makes this checkable: it is the primary key, so
 * replaying the same hash can never inflate the pot, and every row links to a
 * block explorer where the amount can be confirmed independently of anything
 * this server says.
 */
export async function POST(request: Request) {
  const session = await readSession()
  if (!session) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  }

  const limit = await rateLimit(clientKey(request, 'pot'), 20, 60)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const parsed = Contribution.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'That contribution could not be read.' }, { status: 400 })
  }

  const db = await getDb()

  await db
    .insert(potContributions)
    .values({
      txHash: parsed.data.txHash,
      fromAddress: session.address,
      luna: parsed.data.luna,
      message: parsed.data.message ?? null,
      blockHeight: 0,
    })
    .onConflictDoNothing()

  const totals = await db
    .select({ luna: sql<number>`coalesce(sum(${potContributions.luna}), 0)::bigint` })
    .from(potContributions)

  return NextResponse.json({ ok: true, totalLuna: Number(totals[0]?.luna ?? 0) })
}
