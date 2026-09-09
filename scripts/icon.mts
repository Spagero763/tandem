/**
 * Draws the app icon.
 *
 * The mark is the game: two orbs mirrored around a centre line, with the
 * trailing arcs that make a mirrored pair read as one gesture. Rendered
 * through the same headless browser used for screenshots so it matches the
 * arena's palette exactly rather than approximating it.
 *
 * Run with: pnpm icon
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const SIZE = 512
const OUT = 'submission'
const PORT = 9336

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((path) => existsSync(path))

if (!CHROME) {
  console.log('No Chrome or Edge found.')
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${SIZE}px;height:${SIZE}px;overflow:hidden}
  canvas{display:block}
</style></head><body><canvas id="c" width="${SIZE}" height="${SIZE}"></canvas>
<script>
const S = ${SIZE}
const ctx = document.getElementById('c').getContext('2d')

// The arena's own ink, so the icon and the game are visibly the same object.
const bg = ctx.createLinearGradient(0, 0, S, S)
bg.addColorStop(0, '#0b0e18')
bg.addColorStop(1, '#05060a')
ctx.fillStyle = bg
ctx.fillRect(0, 0, S, S)

const cx = S / 2
const orbY = S * 0.60
const spread = S * 0.185
const radius = S * 0.105

// The centre line the pair mirrors around.
ctx.strokeStyle = 'rgba(255,255,255,0.07)'
ctx.lineWidth = S * 0.006
ctx.setLineDash([S * 0.02, S * 0.028])
ctx.beginPath()
ctx.moveTo(cx, S * 0.14)
ctx.lineTo(cx, S * 0.88)
ctx.stroke()
ctx.setLineDash([])

function orb(x, y, color, dir) {
  // The trail: same gesture, opposite directions.
  for (let i = 12; i > 0; i--) {
    const t = i / 12
    const tx = x + dir * S * 0.085 * t
    const ty = y - S * 0.055 * t
    ctx.strokeStyle = color.replace('ALPHA', String(0.10 * (1 - t)))
    ctx.lineWidth = radius * 1.5 * (1 - t * 0.55)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.4)
  glow.addColorStop(0, color.replace('ALPHA', '0.55'))
  glow.addColorStop(1, color.replace('ALPHA', '0'))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, radius * 3.4, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = color.replace('ALPHA', '1')
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.arc(x - radius * 0.28, y - radius * 0.3, radius * 0.26, 0, Math.PI * 2)
  ctx.fill()
}

orb(cx - spread, orbY, 'rgba(120,190,255,ALPHA)', -1)
orb(cx + spread, orbY, 'rgba(255,176,102,ALPHA)', 1)

// A mote above, the thing both orbs are steering for.
ctx.fillStyle = 'rgba(126,231,196,0.95)'
ctx.beginPath()
ctx.arc(cx, S * 0.245, S * 0.038, 0, Math.PI * 2)
ctx.fill()
</script></body></html>`

const dataUrl = `data:text/html;base64,${Buffer.from(HTML).toString('base64')}`

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--disable-gpu',
    '--hide-scrollbars',
    `--user-data-dir=${process.env.TEMP}/tandem-icon`,
    `--window-size=${SIZE},${SIZE}`,
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
await call('Emulation.setDeviceMetricsOverride', {
  width: SIZE,
  height: SIZE,
  deviceScaleFactor: 1,
  mobile: false,
})
await call('Page.navigate', { url: dataUrl })
await sleep(1500)

const { data } = (await call('Page.captureScreenshot', { format: 'png' })) as { data: string }
writeFileSync(`${OUT}/icon.png`, Buffer.from(data, 'base64'))
console.log(`  ${OUT}/icon.png  (${SIZE}x${SIZE})`)

socket.close()
chrome.kill()
process.exit(0)
