import 'server-only'

import { getDb } from '@/lib/db'
import { heats } from '@/lib/db/schema'
import { RULES_VERSION } from '@/lib/sim/constants'

/**
 * A heat is one UTC day. Everyone who plays it plays the identical course, so
 * the ladder compares skill rather than luck, and anyone can regenerate the
 * course from its public seed to check a result themselves.
 */
export function heatIdFor(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export function seedFor(heatId: string): string {
  return `heat-${heatId}`
}

export function heatWindow(heatId: string): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(`${heatId}T00:00:00.000Z`)
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000)
  return { startsAt, endsAt }
}

export function isValidHeatId(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

export async function ensureHeat(heatId: string) {
  const db = await getDb()
  const { startsAt, endsAt } = heatWindow(heatId)

  await db
    .insert(heats)
    .values({ id: heatId, seed: seedFor(heatId), rulesVersion: RULES_VERSION, startsAt, endsAt })
    .onConflictDoNothing()

  return { id: heatId, seed: seedFor(heatId), startsAt, endsAt }
}

/** Milliseconds until the current heat rolls over. Drives the countdown. */
export function msUntilNextHeat(now = new Date()): number {
  const next = new Date(now)
  next.setUTCHours(24, 0, 0, 0)
  return next.getTime() - now.getTime()
}
