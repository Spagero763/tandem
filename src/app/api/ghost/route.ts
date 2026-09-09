import { and, asc, eq, gt, lte, ne } from 'drizzle-orm'
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
 * and never enter the ladder: a padded leaderboard would be worth less than an
 * empty one.
 */
const TRAINER_TIERS = [
  { skill: 0.2, label: 'Trainer I' },
  { skill: 0.48, label: 'Trainer II' },
  { skill: 0.72, label: 'Trainer III' },
  { skill: 0.9, label: 'Trainer IV' },
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

/*
 * Tuned against what these actually score, not against what the skill number
 * looks like. A first run is worth a few hundred points, so a beginner meets a
 * ghost in that range: the tiers used to start at roughly 8000, which is not a
 * rival to chase but a demonstration that you are bad at the game.
 */
function pickTier(best: number | null): number {
  if (best === null || best < 500) return 0
  if (best < 1800) return 1
  if (best < 5000) return 2
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
   * Pick the player just ahead of you, and only if they are actually within
   * reach. Racing someone marginally better is the version of this worth
   * repeating; being handed the top of the ladder is a demonstration that you
   * are not the top of the ladder.
   *
   * The ceiling matters more than it looks. On a young ladder the only player
   * above a beginner is often many times better, and "nearest above me" would
   * hand them that run every time.
   */
  const ceiling = best === null ? 0 : best * 2 + 300

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
              lte(ladder.score, ceiling),
              session ? ne(ladder.address, session.address) : undefined,
            ),
          )
          .orderBy(asc(ladder.score))
          .limit(1)

  const chosen = rival[0]

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
