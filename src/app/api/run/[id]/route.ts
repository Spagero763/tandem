import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getDb } from '@/lib/db'
import { players, runs } from '@/lib/db/schema'
import { seedFor } from '@/lib/heat'
import { decodeInputs } from '@/lib/sim/codec'
import { simulate } from '@/lib/sim/simulate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Re-scores a stored run on every request rather than serving the number that
 * was written when it was submitted.
 *
 * That is the point of the page this feeds: anyone can watch the server derive
 * the score from the recorded inputs, and compare it against what is on the
 * ladder. If the two ever disagreed, this endpoint would say so.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  const db = await getDb()
  const found = await db
    .select({
      id: runs.id,
      heatId: runs.heatId,
      address: runs.address,
      handle: players.handle,
      storedScore: runs.score,
      motes: runs.motes,
      grazes: runs.grazes,
      bestCombo: runs.bestCombo,
      integrity: runs.integrity,
      ticks: runs.ticks,
      survived: runs.survived,
      inputs: runs.inputs,
      checksum: runs.checksum,
      rulesVersion: runs.rulesVersion,
      mismatch: runs.mismatch,
      signals: runs.signals,
      createdAt: runs.createdAt,
    })
    .from(runs)
    .innerJoin(players, eq(players.address, runs.address))
    .where(eq(runs.id, id))
    .limit(1)

  const run = found[0]
  if (!run) {
    return NextResponse.json({ error: 'No such run.' }, { status: 404 })
  }

  const decoded = decodeInputs(run.inputs)
  if (!decoded) {
    return NextResponse.json({ error: 'This run cannot be read.' }, { status: 422 })
  }

  const seed = seedFor(run.heatId)
  const replay = simulate(seed, Array.from(decoded))

  return NextResponse.json({
    run: {
      id: run.id,
      heatId: run.heatId,
      handle: run.handle,
      address: run.address,
      createdAt: run.createdAt,
      rulesVersion: run.rulesVersion,
      mismatch: run.mismatch,
      signals: run.signals ? (JSON.parse(run.signals) as unknown) : null,
    },
    stored: {
      score: run.storedScore,
      motes: run.motes,
      grazes: run.grazes,
      bestCombo: run.bestCombo,
      integrity: run.integrity,
      ticks: run.ticks,
      survived: run.survived,
      checksum: run.checksum,
    },
    replayed: {
      score: replay.score,
      motes: replay.motes,
      grazes: replay.grazes,
      bestCombo: replay.bestCombo,
      integrity: replay.integrity,
      ticks: replay.ticks,
      survived: replay.survived,
      checksum: replay.checksum,
    },
    agrees: replay.score === run.storedScore && replay.checksum === Number(run.checksum),
    seed,
    inputs: run.inputs,
  })
}
