/**
 * Captures the screenshots and icon used to present the app.
 *
 * Shoots the live deployment at a phone-shaped viewport, because that is the
 * only shape it ships in, and plays a real heat so the arena frame shows the
 * game running rather than a menu.
 *
 * Run with: pnpm capture [url] [runId]
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = process.argv[2] ?? 'https://tandem-six-snowy.vercel.app'
const RUN_ID = process.argv[3] ?? ''
const OUT = 'submission'
const PORT = 9334

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((path) => existsSync(path))

if (!CHROME) {
  console.log('No Chrome or Edge found.')
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    `--user-data-dir=${process.env.TEMP}/tandem-capture`,
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

await call('Page.enable')
await call('Runtime.enable')
await call('Emulation.setDeviceMetricsOverride', {
  width: 393,
  height: 852,
  deviceScaleFactor: 3,
  mobile: true,
})

async function shot(name: string) {
  const { data } = (await call('Page.captureScreenshot', { format: 'png' })) as { data: string }
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'))
  console.log(`  ${OUT}/${name}.png`)
}

// 1. The arena, mid heat. Start, wait out the countdown, then steer.
await call('Page.navigate', { url: BASE })
await sleep(4000)
await call('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('button')].find(b => /start/i.test(b.textContent||''))?.click()`,
})
await sleep(3400)
for (let i = 0; i < 55; i++) {
  await call('Input.dispatchMouseEvent', {
    type: i === 0 ? 'mousePressed' : 'mouseMoved',
    x: 60 + Math.round(270 * (0.5 + 0.5 * Math.sin(i / 5))),
    y: 640,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  })
  await sleep(50)
}
await shot('screenshot-1-arena')

// 2. The ladder.
await call('Page.navigate', { url: `${BASE}/ladder` })
await sleep(3500)
await shot('screenshot-2-ladder')

// 3. The run receipt, which is the whole anti-cheat claim made checkable.
if (RUN_ID) {
  await call('Page.navigate', { url: `${BASE}/run/${RUN_ID}` })
  await sleep(3500)
  await shot('screenshot-3-receipt')
}

// 4. The pot.
await call('Page.navigate', { url: `${BASE}/pot` })
await sleep(3500)
await shot('screenshot-4-pot')

socket.close()
chrome.kill()
console.log('\ndone')
process.exit(0)
