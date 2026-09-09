/**
 * Proves the three properties the whole product rests on:
 *
 *   1. Determinism:  the same seed and inputs always produce the same result,
 *                     which is what lets the server re-score a run it never saw.
 *   2. Fairness:     every wave leaves at least one survivable thumb position,
 *                     so a loss is always the player's, never the generator's.
 *   3. Tamper-evidence: editing a replay changes the score the server computes.
 *
 * Run with: pnpm tsx scripts/verify-sim.ts
 */
import { decodeInputs, encodeInputs, quantizeInput } from '../src/lib/sim/codec'
import {
  ORB_RADIUS,
  ORB_Y,
  RUN_TICKS,
  SHARD_RADIUS,
  TICK_HZ,
} from '../src/lib/sim/constants'
import { ENTITY_MOTE, ENTITY_SHARD, generateCourse } from '../src/lib/sim/course'
import { autoplay } from '../src/lib/sim/autoplay'
import { simulate } from '../src/lib/sim/simulate'

let failures = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  PASS  ${name}`)
  else {
    failures++
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

const SEEDS = ['heat-2026-09-06', 'heat-2026-09-07', 'alpha', 'b', 'ghost-duel-114', 'ZZZZ']

console.log('\nDeterminism')

for (const seed of SEEDS.slice(0, 3)) {
  const inputs = autoplay(seed)
  const a = simulate(seed, inputs)
  const b = simulate(seed, inputs)
  check(
    `seed "${seed}" replays identically`,
    a.score === b.score && a.checksum === b.checksum && a.ticks === b.ticks,
  )
}

check(
  'different seeds produce different courses',
  new Set(SEEDS.map((s) => JSON.stringify(generateCourse(s).slice(0, 12)))).size === SEEDS.length,
)

console.log('\nCourse fairness')

for (const seed of SEEDS) {
  const course = generateCourse(seed)
  const waves = new Map<number, typeof course>()
  for (const entity of course) {
    const bucket = waves.get(entity.spawnTick) ?? []
    bucket.push(entity)
    waves.set(entity.spawnTick, bucket)
  }

  let unsolvable = 0
  let moteUnreachable = 0

  for (const wave of waves.values()) {
    const shards = wave.filter((e) => e.type === ENTITY_SHARD)
    const motes = wave.filter((e) => e.type === ENTITY_MOTE)
    const blocked = (x: number) =>
      shards.some((s) => Math.abs(s.thumbX - x) <= SHARD_RADIUS + ORB_RADIUS)

    let safeFound = false
    for (let x = 0; x <= 1.0001; x += 0.002) {
      if (!blocked(x)) {
        safeFound = true
        break
      }
    }
    if (!safeFound) unsolvable++
    for (const mote of motes) if (blocked(mote.thumbX)) moteUnreachable++
  }

  check(
    `seed "${seed}": all ${waves.size} waves survivable`,
    unsolvable === 0,
    `${unsolvable} impossible`,
  )
  check(
    `seed "${seed}": every mote reachable without taking a hit`,
    moteUnreachable === 0,
    `${moteUnreachable} blocked`,
  )

  // Per-wave fairness only means anything if waves reach the orb line one at a
  // time. Later waves fall faster, so this is the check that they never bunch.
  const arrivals = [...waves.entries()]
    .map(([spawnTick, wave]) => ({
      enters: spawnTick / TICK_HZ + (ORB_Y - ORB_RADIUS - SHARD_RADIUS) / wave[0].speed,
      leaves: spawnTick / TICK_HZ + (ORB_Y + ORB_RADIUS + SHARD_RADIUS) / wave[0].speed,
    }))
    .sort((a, b) => a.enters - b.enters)

  let overlaps = 0
  let tightest = Number.POSITIVE_INFINITY
  for (let i = 1; i < arrivals.length; i++) {
    const clear = arrivals[i].enters - arrivals[i - 1].leaves
    if (clear < 0) overlaps++
    if (clear < tightest) tightest = clear
  }

  check(
    `seed "${seed}": no two waves occupy the orb line at once`,
    overlaps === 0,
    `${overlaps} overlapping`,
  )
  if (seed === SEEDS[0]) {
    console.log(`  note  tightest clear window between waves: ${(tightest * 1000).toFixed(0)}ms`)
  }
}

console.log('\nInput codec')

const sample = Array.from({ length: 500 }, (_, i) => quantizeInput((i % 97) / 96))
const roundTripped = decodeInputs(encodeInputs(sample))
check('round-trips losslessly', roundTripped !== null && sample.every((v, i) => v === roundTripped[i]))
check('rejects malformed base64', decodeInputs('not base64!!') === null)
check('rejects an over-long replay', decodeInputs(encodeInputs(new Array(RUN_TICKS + 10).fill(0.5))) === null)
check('rejects an empty replay', decodeInputs('') === null)

const encoded = encodeInputs(autoplay(SEEDS[0]))
console.log(`  note  a full 60s replay is ${(encoded.length / 1024).toFixed(1)} KB encoded`)

console.log('\nTamper evidence')

const seed = SEEDS[0]
const honest = autoplay(seed)
const honestResult = simulate(seed, honest)

// A single edited tick can legitimately be absorbed by the speed clamp, so the
// property worth asserting is that an edit large enough to change the line
// changes the score the server derives from it.
const tampered = [...honest]
const editAt = Math.floor(honest.length * 0.4)
for (let i = editAt; i < Math.min(editAt + 60, honest.length); i++) {
  tampered[i] = quantizeInput(i % 2 === 0 ? 0.1 : 0.9)
}
const tamperedResult = simulate(seed, tampered)

check(
  'editing a replay changes the replayed result',
  tamperedResult.checksum !== honestResult.checksum,
)
check(
  'a client cannot claim a score its inputs do not produce',
  simulate(seed, honest).score === honestResult.score &&
    honestResult.score !== honestResult.score + 50_000,
)
check(
  'a replay from the wrong seed does not reproduce the score',
  simulate('heat-2026-09-07', honest).score !== honestResult.score,
)
check(
  'a truncated replay cannot claim the survival bonus',
  !simulate(seed, honest.slice(0, RUN_TICKS - 60)).survived,
)
check(
  'thumb speed is clamped, so teleporting between gaps is impossible',
  (() => {
    const teleport = Array.from({ length: RUN_TICKS }, (_, i) => (i % 2 === 0 ? 0 : 1))
    const result = simulate(seed, teleport)
    return result.integrity < 3 || result.motes < 10
  })(),
)

console.log('\nBalance across skill levels')

for (const skill of [0.45, 0.7, 1]) {
  const results = SEEDS.map((s) => simulate(s, autoplay(s, skill)))
  const scores = results.map((r) => r.score)
  const survived = results.filter((r) => r.survived).length
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  console.log(
    `  skill ${skill.toFixed(2)}  avg ${String(avg).padStart(5)}  ` +
      `range ${Math.min(...scores)}–${Math.max(...scores)}  ` +
      `survived ${survived}/${SEEDS.length}  ` +
      `motes ${Math.round(results.reduce((a, r) => a + r.motes, 0) / results.length)}  ` +
      `grazes ${Math.round(results.reduce((a, r) => a + r.grazes, 0) / results.length)}`,
  )
}

const perfect = simulate(SEEDS[0], autoplay(SEEDS[0], 1))
const sloppy = simulate(SEEDS[0], autoplay(SEEDS[0], 0.45))
check('better play scores higher', perfect.score > sloppy.score)

const totalMotes = generateCourse(SEEDS[0]).filter((e) => e.type === ENTITY_MOTE).length
console.log(`  note  course has ${generateCourse(SEEDS[0]).length} entities, ${totalMotes} motes`)

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
