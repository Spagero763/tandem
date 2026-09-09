/**
 * Captures the arena mid-heat, with the run driven by the game's own bot.
 *
 * Scripted input dies in seconds, and a screenshot of a zero score is worse
 * than no screenshot. This computes the bot's line for today's course, maps
 * each thumb position back through the renderer's pointer geometry, and plays
 * it for real, sampling frames as it goes and keeping the best live one.
 *
 * Run with: pnpm capture:arena [url]
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

import { autoplay } from '../src/lib/sim/autoplay'
import { seedForHeat } from '../src/lib/sim/constants'
import { simulate } from '../src/lib/sim/simulate'

const BASE = process.argv[2] ?? 'https://tandem-six-snowy.vercel.app'
const OUT = 'submission'
const PORT = 9338
const TICK_MS = 1000 / 60

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((path) => existsSync(path))

if (!CHROME) {
  console.log('No Chrome or Edge found.')
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })

const heatId = new Date().toISOString().slice(0, 10)
const seed = seedForHeat(heatId)
const inputs = autoplay(seed, 0.95)
const expected = simulate(seed, inputs)
console.log(`  bot line for ${seed}: ${expected.score} over ${expected.ticks} ticks`)

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--disable-gpu',
    '--hide-scrollbars',
    `--user-data-dir=${process.env.TEMP}/tandem-arena`,
    '--window-size=393,852',
    'about:blank',
  ],
  { stdio: 'ignore' },
)
process.on('exit', () => chrome.kill())

async function endpoint(): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      return ((await response.json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl
    } catch {
      await sleep(250)
    }
  }
  throw new Error('Chrome did not expose a debugging port')
}

const socket = new WebSocket(await endpoint())
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))

let nextId = 1
const pending = new Map<number, (value: Record<string, unknown>) => void>()
socket.addEventListener('message', (message) => {
  const data = JSON.parse(String(message.data)) as { id?: number; result?: Record<string, unknown> }
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)!(data.result ?? {})
    pending.delete(data.id)
  }
})

function send(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
  const id = nextId++
  return new Promise<Record<string, unknown>>((resolve) => {
    pending.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params, sessionId }))
  })
}

const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })) as {
  targetId: string
}
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })) as {
  sessionId: string
}
const call = (m: string, p: Record<string, unknown> = {}) => send(m, p, sessionId)

async function evaluate<T>(expression: string): Promise<T> {
  const result = (await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })) as { result?: { value?: T } }
  return result.result?.value as T
}

await call('Page.enable')
await call('Runtime.enable')
await call('Emulation.setDeviceMetricsOverride', {
  width: 393,
  height: 852,
  deviceScaleFactor: 3,
  mobile: true,
})

await call('Page.navigate', { url: BASE })
await sleep(5000)

/*
 * The renderer maps a pointer to a thumb position with
 *   thumb = (x - canvasLeft - sidePadding) / (width - sidePadding * 2)
 * so this is that inverted. Reading the real canvas rect rather than assuming
 * one keeps the two in step if the layout ever changes.
 */
const rect = await evaluate<{ left: number; top: number; width: number; height: number } | null>(
  `(() => { const c = document.querySelector('canvas'); if (!c) return null;
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`,
)

if (!rect) {
  console.log('  no canvas found')
  process.exit(1)
}

const sidePadding = Math.max(12, rect.width * 0.045)
const usable = rect.width - sidePadding * 2
const pointerX = (thumb: number) => rect.left + sidePadding + thumb * usable
const pointerY = rect.top + rect.height * 0.72

await evaluate(
  `[...document.querySelectorAll('button')].find(b => /start/i.test(b.textContent||''))?.click()`,
)

/*
 * Wait for the countdown to clear before the first input.
 *
 * Getting this wrong is not a small error: the bot's line is a fixed sequence,
 * so starting three seconds early offsets every position for the rest of the
 * run and it dies in the first few waves. Matching the countdown element
 * itself is far steadier than scraping body text.
 */
const counting = () =>
  evaluate<boolean>(
    `[...document.querySelectorAll('span')].some(e => /^(3|2|1|GO|LOS|YA)$/.test((e.textContent||'').trim()))`,
  )

for (let attempt = 0; attempt < 60 && !(await counting()); attempt++) await sleep(50)
for (let attempt = 0; attempt < 140 && (await counting()); attempt++) await sleep(50)

await call('Input.dispatchMouseEvent', {
  type: 'mousePressed',
  x: pointerX(inputs[0] ?? 0.5),
  y: pointerY,
  button: 'left',
  buttons: 1,
  clickCount: 1,
})

const SAMPLE_AT = [9, 17, 26, 35, 45, 55]
let best: { seconds: number; score: number; data: string } | null = null
let sampleIndex = 0

const startedAt = Date.now()

while (sampleIndex < SAMPLE_AT.length) {
  const elapsed = (Date.now() - startedAt) / 1000

  // Index by wall clock so scheduling jitter self-corrects instead of drifting.
  const tick = Math.min(inputs.length - 1, Math.floor((elapsed * 1000) / TICK_MS))
  void call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: pointerX(inputs[tick]),
    y: pointerY,
    button: 'left',
    buttons: 1,
  })

  if (elapsed >= SAMPLE_AT[sampleIndex]) {
    sampleIndex++

    const state = await evaluate<{ dead: boolean; score: number }>(
      `(() => {
        const text = document.body.innerText;
        const dead = /Sign in to keep|Run it again|Heat complete|Out at/i.test(text);
        const score = Number((text.match(/^\\s*([0-9,]{1,9})\\s*$/m)||['','0'])[1].replace(/,/g,'')) || 0;
        return { dead, score };
      })()`,
    )

    if (state?.dead) {
      console.log(`  run ended before ${SAMPLE_AT[sampleIndex - 1]}s`)
      break
    }

    const { data } = (await call('Page.captureScreenshot', { format: 'png' })) as { data: string }
    best = { seconds: elapsed, score: state?.score ?? 0, data }
    console.log(`  ${elapsed.toFixed(0)}s alive, score ${state?.score ?? 0}`)
  }

  await sleep(8)
}

if (best) {
  writeFileSync(`${OUT}/screenshot-1-arena.png`, Buffer.from(best.data, 'base64'))
  console.log(`\n  ${OUT}/screenshot-1-arena.png at ${best.seconds.toFixed(0)}s, score ${best.score}`)
} else {
  console.log('\n  no live frame captured')
}

socket.close()
chrome.kill()
process.exit(best ? 0 : 1)
