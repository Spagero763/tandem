import {
  FALL_SPEED_END,
  FALL_SPEED_START,
  MAX_THUMB_SPEED_PER_TICK,
  ORB_RADIUS,
  ORB_Y,
  RUN_TICKS,
  SHARD_RADIUS,
  SPAWN_INTERVAL_END,
  SPAWN_INTERVAL_START,
  TICK_HZ,
} from './constants'
import { Rng } from './rng'

export const ENTITY_MOTE = 0
export const ENTITY_SHARD = 1

export interface CourseEntity {
  /** Tick at which this entity enters at the top of its lane. */
  spawnTick: number
  /** 0 = left lane, 1 = right lane. */
  lane: 0 | 1
  /** Position within its own lane, in [0,1]. */
  x: number
  /** Thumb position that intersects this entity. Left lane: x. Right lane: 1 - x. */
  thumbX: number
  type: typeof ENTITY_MOTE | typeof ENTITY_SHARD
  /** Lane units per second. */
  speed: number
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * The width of thumb positions a shard denies. Both the shard and the orb have
 * radius, so the orb's centre must clear the sum of the two.
 */
const BLOCK_RADIUS = SHARD_RADIUS + ORB_RADIUS

/**
 * Builds the full 60 seconds of a heat from its seed.
 *
 * The course is generated in *thumb space* rather than lane space, which is
 * what makes the game fair. One thumb drives both orbs, so an obstacle in the
 * left lane at x and one in the right lane at 1-x deny the same thumb
 * position. Generating the safe gap first and only then placing shards around
 * it guarantees every wave is survivable; the difficulty comes from reading
 * two lanes at once under time pressure, never from an impossible pattern.
 *
 * Given the same seed this returns the identical course on any engine, which
 * is what lets the server replay a run it never watched.
 */
export function generateCourse(seed: string): CourseEntity[] {
  const rng = new Rng(`course:${seed}`)
  const entities: CourseEntity[] = []

  const runSeconds = RUN_TICKS / TICK_HZ

  let gapCenter = 0.5

  // Waves are laid out by when they *arrive* at the orb line, not when they
  // spawn. Later waves fall faster, so spacing the spawns evenly would let a
  // fast wave catch a slow one and put two independently-fair waves on the line
  // at the same moment, a combination neither was checked against. Spacing
  // arrivals and solving backwards for the spawn removes that entirely.
  let arrival = 1.85

  while (true) {
    const progress = Math.min(1, arrival / runSeconds)
    const fallSpeed = lerp(FALL_SPEED_START, FALL_SPEED_END, progress)

    const spawnTick = Math.round((arrival - ORB_Y / fallSpeed) * TICK_HZ)
    if (arrival >= runSeconds) break

    // The safe corridor narrows as the heat goes on.
    const gapHalf = lerp(0.17, 0.088, progress)

    // Drift the corridor rather than teleporting it, so waves flow into each
    // other and the player can read the line ahead.
    const drift = rng.nextRange(-0.42, 0.42)
    gapCenter = Math.min(1 - gapHalf, Math.max(gapHalf, gapCenter + drift))

    const safeLow = gapCenter - gapHalf
    const safeHigh = gapCenter + gapHalf

    // Regions where a shard may sit without touching the corridor.
    const leftLimit = safeLow - BLOCK_RADIUS
    const rightStart = safeHigh + BLOCK_RADIUS

    const shardBudget = progress < 0.2 ? 1 : progress < 0.6 ? rng.nextInt(1, 2) : rng.nextInt(2, 3)
    const placed: number[] = []

    for (let i = 0; i < shardBudget; i++) {
      const canGoLeft = leftLimit > SHARD_RADIUS
      const canGoRight = rightStart < 1 - SHARD_RADIUS
      if (!canGoLeft && !canGoRight) break

      const goLeft = canGoLeft && (!canGoRight || rng.nextBool())
      const thumbX = goLeft
        ? rng.nextRange(SHARD_RADIUS, leftLimit)
        : rng.nextRange(rightStart, 1 - SHARD_RADIUS)

      // Keep shards from stacking on top of each other.
      if (placed.some((p) => Math.abs(p - thumbX) < BLOCK_RADIUS)) continue
      placed.push(thumbX)

      const lane: 0 | 1 = rng.nextBool() ? 1 : 0
      entities.push({
        spawnTick,
        lane,
        x: lane === 0 ? thumbX : 1 - thumbX,
        thumbX,
        type: ENTITY_SHARD,
        speed: fallSpeed,
      })
    }

    // Motes sit inside the corridor, so a clean line through a wave is also the
    // scoring line. Collecting is never at odds with surviving.
    const moteCount = rng.nextFloat() < 0.82 ? 1 : 0
    for (let i = 0; i < moteCount; i++) {
      const thumbX = rng.nextRange(safeLow + 0.02, safeHigh - 0.02)
      const lane: 0 | 1 = rng.nextBool() ? 1 : 0
      entities.push({
        spawnTick,
        lane,
        x: lane === 0 ? thumbX : 1 - thumbX,
        thumbX,
        type: ENTITY_MOTE,
        speed: fallSpeed,
      })
    }

    // A shard is dangerous for as long as it takes to cross the orb's own
    // height. The next wave may not arrive until that has cleared, plus enough
    // runway for the player to actually travel to the new gap.
    const dangerBand = (2 * BLOCK_RADIUS) / fallSpeed
    // Enough runway to cross the widest drift the generator can ask for, and no
    // more. This is the dial that decides how hard the late game gets.
    const travelRunway = 0.55 / (MAX_THUMB_SPEED_PER_TICK * TICK_HZ)
    arrival += Math.max(
      lerp(SPAWN_INTERVAL_START, SPAWN_INTERVAL_END, progress),
      dangerBand + travelRunway,
    )
  }

  // Stable order is part of determinism: the simulation walks this array by
  // index, so it must be sorted the same way everywhere.
  entities.sort((a, b) =>
    a.spawnTick !== b.spawnTick
      ? a.spawnTick - b.spawnTick
      : a.lane !== b.lane
        ? a.lane - b.lane
        : a.x - b.x,
  )

  return entities
}
