import { randomUUID } from 'node:crypto'

import { and, eq, gt, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { readSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { ladder, players, runs } from '@/lib/db/schema'
import { ensureHeat, heatIdFor, isValidHeatId, seedFor } from '@/lib/heat'
import { rateLimit } from '@/lib/rate-limit'
import { decodeInputs } from '@/lib/sim/codec'
import { RULES_VERSION, RUN_TICKS } from '@/lib/sim/constants'
import { motionSignals } from '@/lib/sim/signals'
import { simulate } from '@/lib/sim/simulate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  heatId: z.string().max(10),
  /** Base64 uint16 thumb positions, one per tick. */
  inputs: z.string().max(64_000),
  /** What the client believes it scored. Recorded for comparison, never trusted. */
  claimedScore: z.number().int().min(0).max(10_000_000),
  claimedChecksum: z.number().int(),
  pauses: z.number().int().min(0).max(8).default(0),
  deviceHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullish(),
})

export async function POST(request: Request) {
  const session = await readSession()
  if (!session) {
    return NextResponse.json({ error: 'Sign in with your wallet first.' }, { status: 401 })
  }

  const limit = await rateLimit(`run:${session.address}`, 40, 600)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'You are submitting runs very quickly. Take a breath.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Malformed run.' }, { status: 400 })
  }

  const { heatId, inputs: encoded, claimedScore, claimedChecksum, pauses, deviceHash } = parsed.data

  if (!isValidHeatId(heatId)) {
    return NextResponse.json({ error: 'Unknown heat.' }, { status: 400 })
  }

  // A run only counts for the heat it was actually played in. Without this, a
  // course could be studied offline and submitted whenever it suited.
  if (heatId !== heatIdFor()) {
    return NextResponse.json({ error: 'That heat has closed.' }, { status: 409 })
  }

  const decoded = decodeInputs(encoded)
  if (!decoded) {
    return NextResponse.json({ error: 'That replay could not be read.' }, { status: 400 })
  }

  /*
   * The authoritative result. The server replays the submitted inputs through
   * the same simulation the client rendered, so the score below is the score
   * those inputs actually produce. Nothing the client claimed is used for it.
   */
  const result = simulate(seedFor(heatId), decoded)

  // The replay must consume exactly the inputs sent. Trailing inputs mean the
  // run ended before the recording did, which a genuine client never produces.
  if (result.ticks !== decoded.length) {
    return NextResponse.json({ error: 'That replay is inconsistent.' }, { status: 400 })
  }

  if (result.ticks > RUN_TICKS) {
    return NextResponse.json({ error: 'That replay is too long.' }, { status: 400 })
  }

  const mismatch = result.score !== claimedScore || result.checksum !== claimedChecksum
  const signals = motionSignals(decoded)

  await ensureHeat(heatId)

  const db = await getDb()
  const runId = randomUUID()

  await db.insert(runs).values({
    id: runId,
    heatId,
    address: session.address,
    score: result.score,
    motes: result.motes,
    grazes: result.grazes,
    bestCombo: result.bestCombo,
    integrity: result.integrity,
    ticks: result.ticks,
    survived: result.survived,
    inputs: encoded,
    checksum: result.checksum,
    rulesVersion: RULES_VERSION,
    mismatch,
    pauses,
    signals: JSON.stringify(signals),
    deviceHash: deviceHash ?? null,
  })

  await db
    .update(players)
    .set({ lastSeenAt: new Date() })
    .where(eq(players.address, session.address))

  /*
   * Promote to the ladder only when this run beats the player's own best.
   * The conditional update means two runs finishing at once cannot race each
   * other into a lower score winning.
   */
  const inserted = await db
    .insert(ladder)
    .values({
      heatId,
      address: session.address,
      runId,
      score: result.score,
      attempts: 1,
    })
    .onConflictDoNothing()
    .returning({ address: ladder.address })

  let personalBest = inserted.length > 0

  if (!personalBest) {
    const promoted = await db
      .update(ladder)
      .set({
        runId,
        score: result.score,
        attempts: sql`${ladder.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ladder.heatId, heatId),
          eq(ladder.address, session.address),
          gt(sql`${result.score}`, ladder.score),
        ),
      )
      .returning({ address: ladder.address })

    personalBest = promoted.length > 0

    if (!personalBest) {
      await db
        .update(ladder)
        .set({ attempts: sql`${ladder.attempts} + 1`, updatedAt: new Date() })
        .where(and(eq(ladder.heatId, heatId), eq(ladder.address, session.address)))
    }
  }

  const rankRow = await db.execute<{ rank: number; total: number }>(sql`
    SELECT
      (SELECT count(*) + 1 FROM ladder WHERE heat_id = ${heatId} AND score > l.score)::int AS rank,
      (SELECT count(*) FROM ladder WHERE heat_id = ${heatId})::int AS total
    FROM ladder l
    WHERE l.heat_id = ${heatId} AND l.address = ${session.address}
  `)

  const rankData = Array.isArray(rankRow) ? rankRow[0] : rankRow.rows?.[0]

  return NextResponse.json({
    runId,
    score: result.score,
    motes: result.motes,
    grazes: result.grazes,
    bestCombo: result.bestCombo,
    survived: result.survived,
    personalBest,
    rank: rankData ? Number(rankData.rank) : null,
    total: rankData ? Number(rankData.total) : null,
    // Told plainly rather than hidden: the score shown is the replayed one.
    mismatch,
  })
}
