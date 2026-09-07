import {
  COMBO_STEP,
  DESPAWN_Y,
  GRAZE_RADIUS,
  GRAZE_SCORE,
  INPUT_QUANTIZATION,
  INTEGRITY_BONUS,
  MAX_MULTIPLIER,
  MAX_THUMB_SPEED_PER_TICK,
  MOTE_RADIUS,
  MOTE_SCORE,
  ORB_RADIUS,
  ORB_Y,
  RUN_TICKS,
  SHARD_RADIUS,
  START_INTEGRITY,
  SURVIVAL_BONUS,
  TICK_SECONDS,
} from './constants'
import { ENTITY_MOTE, generateCourse, type CourseEntity } from './course'
import { mixChecksum } from './rng'

export const STATE_PENDING = 0
export const STATE_ALIVE = 1
export const STATE_DEAD = 2

export interface SimEntity extends CourseEntity {
  y: number
  state: typeof STATE_PENDING | typeof STATE_ALIVE | typeof STATE_DEAD
  /** Closest the orb has come, squared. Decides grazes at the orb line. */
  nearestSq: number
  scored: boolean
}

export interface SimState {
  seed: string
  tick: number
  score: number
  combo: number
  bestCombo: number
  integrity: number
  motes: number
  grazes: number
  thumbX: number
  entities: SimEntity[]
  cursor: number
  checksum: number
  ended: boolean
  survived: boolean
}

export type SimEventType = 'collect' | 'graze' | 'hit' | 'end'

export interface SimEvent {
  type: SimEventType
  lane: 0 | 1
  x: number
  /** Multiplier at the moment of a collect, for the floating score popup. */
  value: number
}

const HIT_RADIUS_SQ = (ORB_RADIUS + SHARD_RADIUS) ** 2
const COLLECT_RADIUS_SQ = (ORB_RADIUS + MOTE_RADIUS) ** 2
const GRAZE_RADIUS_SQ = GRAZE_RADIUS ** 2

export function createSimState(seed: string): SimState {
  const course = generateCourse(seed)

  return {
    seed,
    tick: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    integrity: START_INTEGRITY,
    motes: 0,
    grazes: 0,
    thumbX: 0.5,
    entities: course.map((entity) => ({
      ...entity,
      y: 0,
      state: STATE_PENDING,
      nearestSq: Number.POSITIVE_INFINITY,
      scored: false,
    })),
    cursor: 0,
    checksum: 0x811c9dc5,
    ended: false,
    survived: false,
  }
}

export function multiplierFor(combo: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_STEP))
}

/**
 * Smallest squared distance between the orb and the entity *during* the tick,
 * not merely at its end.
 *
 * The orb travels horizontally and the entity vertically, so across a single
 * tick they can cross without ever being close at a sampled instant. Sampling
 * would let a fast flick pass straight through a shard, which the player would
 * read as the game cheating. Solving the quadratic for the closest approach
 * costs a few multiplies and removes the whole class of bug.
 */
function sweptNearestSq(
  orbFrom: number,
  orbTo: number,
  entityX: number,
  entityFromY: number,
  entityToY: number,
): number {
  const a = orbFrom - entityX
  const b = ORB_Y - entityFromY
  const vx = orbTo - orbFrom
  const vy = entityToY - entityFromY

  const qa = vx * vx + vy * vy
  if (qa === 0) return a * a + b * b

  let t = -(a * vx - b * vy) / qa
  if (t < 0) t = 0
  else if (t > 1) t = 1

  const dx = a + vx * t
  const dy = b - vy * t
  return dx * dx + dy * dy
}

/**
 * Advances the simulation one fixed tick.
 *
 * This is the single source of truth for what a run scores. The client calls it
 * to draw frames; the server calls it over the recorded inputs to decide what
 * actually happened. Because it is the same function, a client cannot report a
 * score the rules do not produce.
 */
export function step(state: SimState, rawThumbX: number): SimEvent[] {
  const events: SimEvent[] = []
  if (state.ended) return events

  // Clamp identically on both sides: the client records the raw input it fed
  // in, and the server applies the same limit when it replays.
  let target = rawThumbX
  if (!Number.isFinite(target)) target = state.thumbX
  if (target < 0) target = 0
  else if (target > 1) target = 1

  const delta = target - state.thumbX
  const thumbFrom = state.thumbX
  const thumbTo =
    delta > MAX_THUMB_SPEED_PER_TICK
      ? thumbFrom + MAX_THUMB_SPEED_PER_TICK
      : delta < -MAX_THUMB_SPEED_PER_TICK
        ? thumbFrom - MAX_THUMB_SPEED_PER_TICK
        : target

  state.thumbX = thumbTo

  while (
    state.cursor < state.entities.length &&
    state.entities[state.cursor].spawnTick <= state.tick
  ) {
    state.entities[state.cursor].state = STATE_ALIVE
    state.cursor++
  }

  const fall = TICK_SECONDS

  for (let i = 0; i < state.cursor; i++) {
    const entity = state.entities[i]
    if (entity.state !== STATE_ALIVE) continue

    const fromY = entity.y
    const toY = fromY + entity.speed * fall
    entity.y = toY

    // The left orb sits at the thumb position, the right orb mirrors it.
    const orbFrom = entity.lane === 0 ? thumbFrom : 1 - thumbFrom
    const orbTo = entity.lane === 0 ? thumbTo : 1 - thumbTo

    const nearestSq = sweptNearestSq(orbFrom, orbTo, entity.x, fromY, toY)
    if (nearestSq < entity.nearestSq) entity.nearestSq = nearestSq

    if (entity.type === ENTITY_MOTE) {
      if (nearestSq <= COLLECT_RADIUS_SQ) {
        entity.state = STATE_DEAD
        state.combo++
        if (state.combo > state.bestCombo) state.bestCombo = state.combo
        state.motes++
        const multiplier = multiplierFor(state.combo)
        state.score += MOTE_SCORE * multiplier
        events.push({ type: 'collect', lane: entity.lane, x: entity.x, value: multiplier })
        continue
      }
    } else if (nearestSq <= HIT_RADIUS_SQ) {
      entity.state = STATE_DEAD
      state.integrity--
      state.combo = 0
      events.push({ type: 'hit', lane: entity.lane, x: entity.x, value: state.integrity })
      if (state.integrity <= 0) {
        state.ended = true
        state.survived = false
        events.push({ type: 'end', lane: entity.lane, x: entity.x, value: 0 })
      }
      continue
    } else if (!entity.scored && fromY <= ORB_Y && toY > ORB_Y) {
      // Award the graze as the shard passes the orb line, so the feedback lands
      // at the moment the player feels the near miss.
      entity.scored = true
      if (entity.nearestSq <= GRAZE_RADIUS_SQ) {
        state.grazes++
        state.score += GRAZE_SCORE
        events.push({ type: 'graze', lane: entity.lane, x: entity.x, value: GRAZE_SCORE })
      }
    }

    if (entity.y > DESPAWN_Y) {
      entity.state = STATE_DEAD
      if (entity.type === ENTITY_MOTE) state.combo = 0
    }
  }

  state.tick++

  state.checksum = mixChecksum(state.checksum, state.tick)
  state.checksum = mixChecksum(state.checksum, Math.round(thumbTo * INPUT_QUANTIZATION))
  state.checksum = mixChecksum(state.checksum, state.score)
  state.checksum = mixChecksum(state.checksum, state.integrity * 97 + state.combo)

  if (!state.ended && state.tick >= RUN_TICKS) {
    state.ended = true
    state.survived = true
    state.score += SURVIVAL_BONUS + state.integrity * INTEGRITY_BONUS
    state.checksum = mixChecksum(state.checksum, state.score)
    events.push({ type: 'end', lane: 0, x: state.thumbX, value: state.score })
  }

  return events
}

export interface SimResult {
  score: number
  motes: number
  grazes: number
  bestCombo: number
  integrity: number
  ticks: number
  survived: boolean
  checksum: number
}

/** Replays a full recorded run. This is what the server trusts. */
export function simulate(seed: string, inputs: Float64Array | number[]): SimResult {
  const state = createSimState(seed)

  for (let i = 0; i < inputs.length && !state.ended; i++) {
    step(state, inputs[i])
  }

  return {
    score: state.score,
    motes: state.motes,
    grazes: state.grazes,
    bestCombo: state.bestCombo,
    integrity: state.integrity,
    ticks: state.tick,
    survived: state.survived,
    checksum: state.checksum,
  }
}
