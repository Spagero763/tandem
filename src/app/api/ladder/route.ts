import { and, desc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { readSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { ladder, players, runs } from '@/lib/db/schema'
import { heatIdFor, isValidHeatId, msUntilNextHeat } from '@/lib/heat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE = 50

export async function GET(request: Request) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('heat') ?? heatIdFor()
  const heatId = isValidHeatId(requested) ? requested : heatIdFor()

  const db = await getDb()
  const session = await readSession()

  const top = await db
    .select({
      address: ladder.address,
      handle: players.handle,
      score: ladder.score,
      attempts: ladder.attempts,
      patron: players.patron,
      founder: players.founder,
      runId: ladder.runId,
      survived: runs.survived,
      bestCombo: runs.bestCombo,
      updatedAt: ladder.updatedAt,
    })
    .from(ladder)
    .innerJoin(players, eq(players.address, ladder.address))
    .innerJoin(runs, eq(runs.id, ladder.runId))
    .where(eq(ladder.heatId, heatId))
    .orderBy(desc(ladder.score), ladder.updatedAt)
    .limit(PAGE)

  let you: {
    rank: number
    score: number
    attempts: number
    runId: string
  } | null = null

  if (session) {
    const mine = await db
      .select({
        score: ladder.score,
        attempts: ladder.attempts,
        runId: ladder.runId,
      })
      .from(ladder)
      .where(and(eq(ladder.heatId, heatId), eq(ladder.address, session.address)))
      .limit(1)

    if (mine[0]) {
      const ahead = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(ladder)
        .where(and(eq(ladder.heatId, heatId), sql`${ladder.score} > ${mine[0].score}`))

      you = {
        rank: Number(ahead[0]?.count ?? 0) + 1,
        score: mine[0].score,
        attempts: mine[0].attempts,
        runId: mine[0].runId,
      }
    }
  }

  const totals = await db
    .select({
      players: sql<number>`count(*)::int`,
      best: sql<number>`coalesce(max(${ladder.score}), 0)::int`,
    })
    .from(ladder)
    .where(eq(ladder.heatId, heatId))

  return NextResponse.json({
    heatId,
    isCurrent: heatId === heatIdFor(),
    closesInMs: heatId === heatIdFor() ? msUntilNextHeat() : 0,
    players: Number(totals[0]?.players ?? 0),
    best: Number(totals[0]?.best ?? 0),
    you,
    top: top.map((row, index) => ({ ...row, rank: index + 1 })),
  })
}
