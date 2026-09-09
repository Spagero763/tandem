/**
 * Checks that the pickup sounds and the backing track agree.
 *
 * These two are heard together constantly: a mote fires whenever the player
 * collects one, over whatever chord happens to be playing. If a pickup can
 * land a semitone from a chord tone, it reads as a mistake rather than a
 * reward, and it happens often enough that nobody would call it a bug, only
 * "the audio sounds cheap".
 *
 * Run with: pnpm verify:music
 */
import {
  BARS_IN_LOOP,
  BPM,
  PROGRESSION,
  SECONDS_PER_STEP,
  STEPS_PER_BAR,
} from '../src/game/beat'
import { RUN_TICKS, TICK_HZ } from '../src/lib/sim/constants'
import { SCALE } from '../src/game/audio'

const NAMES = ['D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'C', 'Db']
const name = (semitone: number) => NAMES[((semitone % 12) + 12) % 12]

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  PASS  ${label}`)
  else {
    failures++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\nHarmony')

const pickups = [...new Set(SCALE.map((s) => ((s % 12) + 12) % 12))].sort((a, b) => a - b)
console.log(`  note  pickups play ${pickups.map(name).join(' ')}`)

for (const chord of PROGRESSION) {
  const tones = [...new Set(chord.triad.map((i) => (((chord.root + i) % 12) + 12) % 12))]
  const label = `${name(chord.root)} (${tones.map(name).join(' ')})`

  const clashes = pickups.filter((pickup) =>
    tones.some((tone) => {
      const gap = Math.abs(((pickup - tone + 18) % 12) - 6)
      return gap === 1
    }),
  )

  check(
    `no pickup sits a semitone from ${label}`,
    clashes.length === 0,
    clashes.length ? `${clashes.map(name).join(', ')} clash` : '',
  )
}

console.log('\nProgression')
check('four bars, so the loop resolves back to the tonic', PROGRESSION.length === 4)
check('starts on the tonic', PROGRESSION[0].root % 12 === 0)
check(
  'every chord is a distinct root',
  new Set(PROGRESSION.map((c) => ((c.root % 12) + 12) % 12)).size === PROGRESSION.length,
)


console.log('\nTiming')

const loopSeconds = SECONDS_PER_STEP * STEPS_PER_BAR * BARS_IN_LOOP
const heatSeconds = RUN_TICKS / TICK_HZ
const loops = heatSeconds / loopSeconds

console.log(`  note  ${BPM} BPM, ${loopSeconds.toFixed(3)}s per loop, ${heatSeconds}s per heat`)

/*
 * The loop landing exactly on the end of the heat is worth protecting. Let the
 * tempo drift and the music stops mid phrase on every single run, which feels
 * wrong long before anyone works out why.
 */
check(
  `the loop divides the heat exactly (${loops.toFixed(3)} loops)`,
  Math.abs(loops - Math.round(loops)) < 1e-9,
  `${loops} is not a whole number`,
)
check(
  'the heat is a whole number of bars',
  Math.abs((heatSeconds / (SECONDS_PER_STEP * STEPS_PER_BAR)) % 1) < 1e-9,
)

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
