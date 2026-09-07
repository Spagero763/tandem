import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { readSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { ladder, payouts, players, potContributions } from '@/lib/db/schema'
import { heatIdFor, isValidHeatId } from '@/lib/heat'
import { toCompactAddress } from '@/lib/nimiq/address'
import { potAddress, splitPot } from '@/lib/pot'
import { clientKey, rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Settlement is done from the pot wallet inside Nimiq Pay, not by this server.
 *
 * That is the whole design: no private key for the pot exists anywhere in this
 * codebase or on the host. The operator signs three ordinary transfers in the
 * same approval dialogs every other player sees, and this route only records
 * the resulting hashes so the payout becomes a public, checkable row.
 */
function isPotOwner(address: string | undefined): boolean {
  const pot = potAddress()
  if (!pot || !address) return false

  const a = toCompactAddress(pot)
  const b = toCompactAddress(address)
  return a !== null && b !== null && a === b
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('heat') ?? heatIdFor()
  const heatId = isValidHeatId(requested) ? requested : heatIdFor()

  const db = await getDb()
  const session = await readSession()

  const settled = await db
    .select({
      address: payouts.address,
      rank: payouts.rank,
      luna: payouts.luna,
      txHash: payouts.txHash,
      sentAt: payouts.sentAt,
    })
    .from(payouts)
    .where(eq(payouts.heatId, heatId))
    .orderBy(asc(payouts.rank))

  const totals = await db
    .select({ luna: sql<number>`coalesce(sum(${potContributions.luna}), 0)::bigint` })
    .from(potContributions)
    .where(eq(potContributions.heatId, heatId))

  const totalLuna = Number(totals[0]?.luna ?? 0)
  const shares = splitPot(totalLuna)

  const winners = await db
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

  return NextResponse.json({
    heatId,
    isOwner: isPotOwner(session?.address),
    settled,
    /** What settlement *would* pay, so the operator confirms before signing. */
    due: winners.map((winner, index) => ({
      ...winner,
      rank: index + 1,
      luna: shares[index] ?? 0,
    })),
    totalLuna,
    closed: heatId !== heatIdFor(),
  })
}

const Settlement = z.object({
  heatId: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  address: z.string().trim().min(36).max(44),
  rank: z.number().int().min(1).max(3),
  luna: z.number().int().positive().max(100_000_000_000),
  txHash: z.string().trim().min(4).max(128),
})

export async function POST(request: Request) {
  const session = await readSession()
  if (!isPotOwner(session?.address)) {
    return NextResponse.json({ error: 'Not the pot wallet.' }, { status: 403 })
  }

  const limit = await rateLimit(clientKey(request, 'payout'), 30, 60)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const parsed = Settlement.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'That payout could not be read.' }, { status: 400 })
  }

  const address = toCompactAddress(parsed.data.address)
  if (!address) {
    return NextResponse.json({ error: 'Invalid recipient.' }, { status: 400 })
  }

  const db = await getDb()

  // Unique on (heat, address), so re-recording a payout cannot double-count it.
  await db
    .insert(payouts)
    .values({
      id: crypto.randomUUID(),
      heatId: parsed.data.heatId,
      address,
      rank: parsed.data.rank,
      luna: parsed.data.luna,
      txHash: parsed.data.txHash,
      sentAt: new Date(),
    })
    .onConflictDoNothing()

  const recorded = await db
    .select({ rank: payouts.rank, txHash: payouts.txHash })
    .from(payouts)
    .where(and(eq(payouts.heatId, parsed.data.heatId), eq(payouts.address, address)))
    .limit(1)

  return NextResponse.json({ ok: true, payout: recorded[0] ?? null })
}
