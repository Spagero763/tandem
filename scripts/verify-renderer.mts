/**
 * Drives the arena renderer against a stubbed 2D context.
 *
 * This cannot tell us whether the arena looks good — only a phone can do that.
 * What it does catch, without a browser, is the whole class of failure that
 * would waste a device test: a typo in a canvas call, a null dereference on a
 * layout that hasn't been measured yet, or an exception thrown midway through a
 * frame. It plays a full 60-second heat and renders every tick.
 *
 * Run with: pnpm tsx scripts/verify-renderer.ts
 */
import { quantizeInput } from '../src/lib/sim/codec'
import { RUN_TICKS } from '../src/lib/sim/constants'
import { createSimState, step } from '../src/lib/sim/simulate'

const calls = new Map<string, number>()

function record(name: string) {
  calls.set(name, (calls.get(name) ?? 0) + 1)
}

function makeContext(): CanvasRenderingContext2D {
  const gradient = {
    addColorStop(offset: number, color: string) {
      record('addColorStop')
      if (!Number.isFinite(offset)) throw new Error(`gradient stop offset is ${offset}`)
      if (typeof color !== 'string' || color.includes('NaN')) {
        throw new Error(`gradient stop colour is "${color}"`)
      }
    },
  }

  const guard = (name: string) =>
    function (...args: unknown[]) {
      record(name)
      for (const arg of args) {
        if (typeof arg === 'number' && !Number.isFinite(arg)) {
          throw new Error(`${name} received a non-finite argument: ${String(arg)}`)
        }
      }
      return undefined
    }

  const context = {
    canvas: null as unknown,
    save: guard('save'),
    restore: guard('restore'),
    scale: guard('scale'),
    translate: guard('translate'),
    rotate: guard('rotate'),
    fillRect: guard('fillRect'),
    beginPath: guard('beginPath'),
    closePath: guard('closePath'),
    moveTo: guard('moveTo'),
    lineTo: guard('lineTo'),
    arc: guard('arc'),
    arcTo: guard('arcTo'),
    fill: guard('fill'),
    stroke: guard('stroke'),
    drawImage: guard('drawImage'),
    createLinearGradient: (...args: number[]) => {
      guard('createLinearGradient')(...args)
      return gradient
    },
    createRadialGradient: (...args: number[]) => {
      guard('createRadialGradient')(...args)
      return gradient
    },
  }

  // Style setters are validated too: a malformed colour string silently paints
  // nothing in a real browser, which is exactly the kind of bug that survives
  // to a device.
  for (const property of ['fillStyle', 'strokeStyle'] as const) {
    let value: unknown = '#000'
    Object.defineProperty(context, property, {
      get: () => value,
      set(next: unknown) {
        // A gradient object is a legitimate fill; a malformed colour string is
        // not, and in a real browser it paints nothing instead of throwing.
        const isGradient = typeof next === 'object' && next !== null && 'addColorStop' in next
        if (!isGradient) {
          if (typeof next !== 'string' || next.includes('NaN') || /,\s*\)/.test(next)) {
            throw new Error(`${property} set to "${String(next)}"`)
          }
        }
        value = next
      },
    })
  }
  for (const property of ['lineWidth'] as const) {
    let value = 1
    Object.defineProperty(context, property, {
      get: () => value,
      set(next: number) {
        if (!Number.isFinite(next)) throw new Error(`${property} set to ${String(next)}`)
        value = next
      },
    })
  }
  ;(context as Record<string, unknown>).lineCap = 'round'

  return context as unknown as CanvasRenderingContext2D
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = {
    width: 0,
    height: 0,
    style: {} as CSSStyleDeclaration,
    getContext: () => makeContext(),
  }
  return canvas as unknown as HTMLCanvasElement
}

// Minimal DOM surface the renderer touches.
const globalScope = globalThis as Record<string, unknown>
globalScope.devicePixelRatio = 3
globalScope.document = {
  createElement: (tag: string) => {
    if (tag !== 'canvas') throw new Error(`unexpected createElement("${tag}")`)
    return makeCanvas()
  },
}

const { ArenaRenderer } = await import('../src/game/renderer')

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  PASS  ${name}`)
  else {
    failures++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\nRenderer smoke test')

const viewports: [string, number, number][] = [
  ['iPhone SE', 375, 667],
  ['iPhone 15', 393, 852],
  ['Pixel 8', 412, 915],
  ['narrow', 320, 560],
  ['tall tablet', 600, 1024],
]

for (const [name, width, height] of viewports) {
  try {
    const renderer = new ArenaRenderer(makeCanvas())
    renderer.resize(width, height)

    const state = createSimState('heat-2026-09-06')
    const ghost = createSimState('heat-2026-09-06')

    let thumb = 0.5
    for (let tick = 0; tick < RUN_TICKS && !state.ended; tick++) {
      // Sweep the full width so every branch (near miss, collect, hit) is hit.
      thumb = 0.5 + 0.5 * Math.sin(tick / 23)
      const events = step(state, quantizeInput(thumb))
      renderer.absorb(events, state)
      if (!ghost.ended) step(ghost, quantizeInput(0.5 + 0.4 * Math.sin(tick / 17)))
      renderer.render(state, tick / RUN_TICKS, thumb, ghost, tick * 16.7)
    }

    check(`${name} (${width}×${height}) renders a full heat`, true)
  } catch (error) {
    check(`${name} (${width}×${height}) renders a full heat`, false, String(error))
  }
}

// Rendering before the first measurement must be a no-op, not a crash: the
// animation loop starts before ResizeObserver has reported a size.
try {
  const renderer = new ArenaRenderer(makeCanvas())
  const state = createSimState('unmeasured')
  renderer.render(state, 0, 0.5, null, 0)
  renderer.absorb([{ type: 'hit', lane: 0, x: 0.5, value: 2 }], state)
  check('renders safely before the first resize', true)
} catch (error) {
  check('renders safely before the first resize', false, String(error))
}

try {
  const renderer = new ArenaRenderer(makeCanvas())
  renderer.resize(390, 844)
  const state = createSimState('pointer')
  const values = [-200, 0, 195, 390, 900].map((x) => renderer.pointerToThumb(x))
  check(
    'pointer input is clamped to [0,1] and increases across the screen',
    values.every((v) => v >= 0 && v <= 1) &&
      values[0] === 0 &&
      values[4] === 1 &&
      values[2] > values[1],
    JSON.stringify(values),
  )
  renderer.reset()
  renderer.render(state, 0, 0.5, null, 0)
  check('reset leaves the renderer usable', true)
} catch (error) {
  check('pointer mapping and reset', false, String(error))
}

const top = [...calls.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
console.log(`\n  note  busiest canvas calls: ${top.map(([k, v]) => `${k}×${v}`).join('  ')}`)

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
