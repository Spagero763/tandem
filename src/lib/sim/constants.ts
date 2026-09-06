/**
 * Every value the simulation depends on. Changing any of these changes the
 * outcome of a replay, so RULES_VERSION is stamped onto every stored run: a
 * run can only ever be re-verified against the rules it was played under.
 */
export const RULES_VERSION = 1

/** Fixed simulation rate. The client accumulates real time and steps at this rate. */
export const TICK_HZ = 60
export const TICK_SECONDS = 1 / TICK_HZ

/** A heat is exactly 60 seconds. */
export const RUN_TICKS = 60 * TICK_HZ

/**
 * Geometry lives in normalized units so the simulation is resolution
 * independent: a phone and the server agree without knowing pixel sizes.
 *
 * Each lane is 1 wide and 1 tall. The thumb position X in [0,1] drives both
 * orbs: the left orb sits at X, the right orb mirrors it at 1 - X.
 */
export const ORB_Y = 0.86
export const ORB_RADIUS = 0.045

export const MOTE_RADIUS = 0.038
export const SHARD_RADIUS = 0.05

/** Passing this close to a shard without touching it scores a graze. */
export const GRAZE_RADIUS = 0.115

/** Hits before the run ends. */
export const START_INTEGRITY = 3

/** Entities despawn once fully past the orb line. */
export const DESPAWN_Y = 1.15

export const FALL_SPEED_START = 0.55
export const FALL_SPEED_END = 1.72

export const SPAWN_INTERVAL_START = 0.62
export const SPAWN_INTERVAL_END = 0.18

export const MOTE_SCORE = 10
export const GRAZE_SCORE = 2
export const SURVIVAL_BONUS = 250
export const INTEGRITY_BONUS = 150

/** Combo steps the multiplier every N motes, up to MAX_MULTIPLIER. */
export const COMBO_STEP = 8
export const MAX_MULTIPLIER = 8

/**
 * Thumb travel is clamped per tick. A human dragging across a phone covers the
 * width in roughly 120ms; anything faster is a synthetic input, and clamping
 * rather than rejecting means a legitimate fast flick is never punished.
 */
export const MAX_THUMB_SPEED_PER_TICK = 0.14

/** Input is quantized to this many steps before transport. */
export const INPUT_QUANTIZATION = 4096
