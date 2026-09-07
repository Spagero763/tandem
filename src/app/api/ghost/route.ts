import { and, asc, desc, eq, gt, ne } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { readSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { ladder, players, runs } from '@/lib/db/schema'
import { heatIdFor, isValidHeatId, seedFor } from '@/lib/heat'
import { autoplay } from '@/lib/sim/autoplay'
import { encodeInputs } from '@/lib/sim/codec'
import { simulate } from '@/lib/sim/simulate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Trainer ghosts.
 *
 * A ladder game is at its worst on the day it launches: nobody has played, so
 * there is nobody to race, so nobody comes back. These are bot runs over the
 * same course, at four honest difficulties, so a first-time player always has
 * someone alongside them. They are labelled as trainers everywhere they appear
 * and never enter the ladder — a padded leaderboard would be worth less than an
 * empty one.
 */
const TRAINER_TIERS = [
  { skill: 0.45, label: 'Trainer I' },
  { skill: 0.62, label: 'Trainer II' },
  { skill: 0.78, label: 'Trainer III' },
  { skill: 0.94, label: 'Trainer IV' },
] as const

interface Trainer {
  label: string
  score: number
  inputs: string
}

const trainerCache = new Map<string, Trainer>()

function trainerFor(seed: string, tier: number): Trainer {
  const key = `${seed}:${tier}`
  const cached = trainerCache.get(key)
  if (cached) return cached

  const { skill, label } = TRAINER_TIERS[tier]
  const inputs = autoplay(seed, skill)
  const result = simulate(seed, inputs)

  const trainer: Trainer = { label, score: result.score, inputs: encodeInputs(inputs) }
  trainerCache.set(key, trainer)
  return trainer
}

function pickTier(best: number | null): number {
  if (best === null) return 1
  if (best < 3000) return 0
  if (best < 6000) return 1
  if (best < 8500) return 2
  return 3
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('heat') ?? heatIdFor()
  const heatId = isValidHeatId(requested) ? requested : heatIdFor()
  const seed = seedFor(heatId)

  const db = await getDb()
  const session = await readSession()

  let best: number | null = null
  if (session) {
    const mine = await db
      .select({ score: ladder.score })
      .from(ladder)
      .where(and(eq(ladder.heatId, heatId), eq(ladder.address, session.address)))
      .limit(1)
    best = mine[0]?.score ?? null
  }

  /*
   * Pick the player just ahead of you rather than the leader. Racing someone
   * marginally better is the version of this that is worth repeating; racing
   * the top of the ladder on your first run is just a demonstration that you
   * are not the top of the ladder.
   */
  const rival =
    best === null
      ? []
      : await db
          .select({
            runId: ladder.runId,
            score: ladder.score,
            handle: players.handle,
            address: ladder.address,
            inputs: runs.inputs,
          })
          .from(ladder)
          .innerJoin(players, eq(players.address, ladder.address))
          .innerJoin(runs, eq(runs.id, ladder.runId))
          .where(
            and(
              eq(ladder.heatId, heatId),
              gt(ladder.score, best),
              session ? ne(ladder.address, session.address) : undefined,
            ),
          )
          .orderBy(asc(ladder.score))
          .limit(1)

  const leader =
    rival.length > 0
      ? rival
      : await db
          .select({
            runId: ladder.runId,
            score: ladder.score,
            handle: players.handle,
            address: ladder.address,
            inputs: runs.inputs,
          })
          .from(ladder)
          .innerJoin(players, eq(players.address, ladder.address))
          .innerJoin(runs, eq(runs.id, ladder.runId))
          .where(
            and(
              eq(ladder.heatId, heatId),
              session ? ne(ladder.address, session.address) : undefined,
            ),
          )
          .orderBy(desc(ladder.score))
          .limit(1)

  const chosen = leader[0]

  if (chosen) {
    return NextResponse.json({
      kind: 'player',
      heatId,
      label: chosen.handle,
      score: chosen.score,
      runId: chosen.runId,
      inputs: chosen.inputs,
    })
  }

  const trainer = trainerFor(seed, pickTier(best))
  return NextResponse.json({
    kind: 'trainer',
    heatId,
    label: trainer.label,
    score: trainer.score,
    runId: null,
    inputs: trainer.inputs,
  })
}
