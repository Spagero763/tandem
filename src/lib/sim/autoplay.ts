import { quantizeInput } from './codec'
import {
  MAX_THUMB_SPEED_PER_TICK,
  ORB_RADIUS,
  ORB_Y,
  RUN_TICKS,
  SHARD_RADIUS,
} from './constants'
import { ENTITY_MOTE, ENTITY_SHARD } from './course'
import { Rng } from './rng'
import { createSimState, STATE_ALIVE, step } from './simulate'

/**
 * A bot that plays through the real simulation rather than second-guessing it.
 *
 * The orb cannot pass through a shard, so the game is played in two beats: hold
 * the line while a wave crosses, then slide to the next gap in the clear window
 * between waves. `skill` models a human imperfectly, with a slower thumb, a delayed
 * commitment, and some aim jitter, because it stands in for a person both when
 * tuning difficulty and when generating practice ghosts.
 */
export function autoplay(seed: string, skill = 1): number[] {
  const state = createSimState(seed)
  const inputs: number[] = []

  const blockRadius = SHARD_RADIUS + ORB_RADIUS + 0.015
  const maxStep = MAX_THUMB_SPEED_PER_TICK * (0.35 + 0.65 * skill)
  const reactionTicks = Math.round((1 - skill) * 16)
  const band = ORB_RADIUS + SHARD_RADIUS

  /*
   * Weak play has to mean *failing*, not merely being slower.
   *
   * A bot that reads every wave and always steers to a safe gap does not get
   * hit, so trimming its thumb speed and adding jitter smaller than the safety
   * margin barely moves the score: half the skill range used to cost it 13%.
   * That made every practice tier the same ghost wearing a different label.
   *
   * These are the two ways a person actually loses. They miss a wave
   * arriving, and they chase a mote they should have let go.
   */
  const lapseChance = (1 - skill) ** 1.4 * 0.62
  const greedChance = (1 - skill) ** 1.2 * 0.5
  const jitter = (1 - skill) * 0.14

  let thumb = 0.5
  let target = 0.5
  let holdUntil = -1
  const noise = new Rng(`bot:${seed}:${skill}`)

  for (let tick = 0; tick < RUN_TICKS && !state.ended; tick++) {
    const crossing = state.entities.some(
      (entity) =>
        entity.state === STATE_ALIVE &&
        entity.type === ENTITY_SHARD &&
        Math.abs(entity.y - ORB_Y) < band + 0.02,
    )

    if (!crossing) {
      let soonest = Number.POSITIVE_INFINITY
      for (const entity of state.entities) {
        if (entity.state !== STATE_ALIVE || entity.y > ORB_Y - band) continue
        const ttl = (ORB_Y - entity.y) / entity.speed
        if (ttl < soonest) soonest = ttl
      }

      if (Number.isFinite(soonest) && tick > holdUntil) {
        const wave = state.entities.filter((entity) => {
          if (entity.state !== STATE_ALIVE || entity.y > ORB_Y - band) return false
          return (ORB_Y - entity.y) / entity.speed <= soonest + 0.1
        })

        const shards = wave.filter((e) => e.type === ENTITY_SHARD).map((e) => e.thumbX)
        const motes = wave.filter((e) => e.type === ENTITY_MOTE).map((e) => e.thumbX)
        const safe = (x: number) => shards.every((s) => Math.abs(s - x) > blockRadius)

        // Missed it. The thumb stays where it was and the wave arrives anyway.
        const lapsed = lapseChance > 0 && noise.nextFloat() < lapseChance

        // Went for the mote without checking what was next to it.
        const greedy = greedChance > 0 && noise.nextFloat() < greedChance

        const reachable = greedy ? motes : motes.filter(safe)
        const mote = reachable.sort((a, b) => Math.abs(a - thumb) - Math.abs(b - thumb))[0]

        if (lapsed) {
          target = thumb
        } else if (mote !== undefined) {
          target = mote
        } else {
          let best = thumb
          let bestDistance = Number.POSITIVE_INFINITY
          for (let candidate = 0; candidate <= 1.0001; candidate += 0.005) {
            if (!safe(candidate)) continue
            if (Math.abs(candidate - thumb) < bestDistance) {
              bestDistance = Math.abs(candidate - thumb)
              best = candidate
            }
          }
          target = best
        }

        if (jitter > 0) target += noise.nextRange(-jitter, jitter)
        target = target < 0 ? 0 : target > 1 ? 1 : target
        holdUntil = tick + reactionTicks
      }

      const delta = target - thumb
      thumb += delta > maxStep ? maxStep : delta < -maxStep ? -maxStep : delta
      thumb = thumb < 0 ? 0 : thumb > 1 ? 1 : thumb
    }

    const quantized = quantizeInput(thumb)
    inputs.push(quantized)
    step(state, quantized)
  }

  return inputs
}
