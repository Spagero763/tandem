import { INPUT_QUANTIZATION, MAX_THUMB_SPEED_PER_TICK } from './constants'

export interface MotionSignals {
  /** Fraction of ticks where the thumb did not move at all. */
  still: number
  /** Longest run of ticks holding one exact position. */
  longestHold: number
  /** Fraction of ticks travelling at or near the speed cap. */
  atMaxSpeed: number
  /** Distinct positions touched, over total ticks. */
  variety: number
  /** Mean absolute movement per tick, in lane units. */
  meanDelta: number
}

/**
 * Describes *how* a run was played.
 *
 * Replaying the inputs already makes a fabricated score impossible, so what is
 * left is input that was generated rather than performed. These statistics do
 * not prove that either way, and they are deliberately not used to reject a
 * run: a human on a still finger and a script can look alike for a while, and
 * throwing out a real player's best run is a worse failure than recording a
 * suspicious one. They are stored and shown so a result can be argued about
 * with evidence.
 */
export function motionSignals(inputs: Float64Array | number[]): MotionSignals {
  const ticks = inputs.length
  if (ticks < 2) {
    return { still: 1, longestHold: ticks, atMaxSpeed: 0, variety: 0, meanDelta: 0 }
  }

  const step = 1 / INPUT_QUANTIZATION
  const fastThreshold = MAX_THUMB_SPEED_PER_TICK * 0.95

  let still = 0
  let fast = 0
  let total = 0
  let hold = 1
  let longestHold = 1

  const seen = new Set<number>()
  seen.add(Math.round(inputs[0] * INPUT_QUANTIZATION))

  for (let i = 1; i < ticks; i++) {
    const delta = Math.abs(inputs[i] - inputs[i - 1])
    total += delta

    if (delta < step / 2) {
      still++
      hold++
      if (hold > longestHold) longestHold = hold
    } else {
      hold = 1
    }

    if (delta >= fastThreshold) fast++
    seen.add(Math.round(inputs[i] * INPUT_QUANTIZATION))
  }

  const span = ticks - 1
  return {
    still: still / span,
    longestHold,
    atMaxSpeed: fast / span,
    variety: seen.size / ticks,
    meanDelta: total / span,
  }
}
