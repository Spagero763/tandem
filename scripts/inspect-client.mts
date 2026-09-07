/**
 * Loads the app in a real browser engine and reports what the console says.
 *
 * The server log cannot see a client-side exception, and a mini app that
 * throws during hydration still returns HTTP 200 for every page. This drives
 * headless Chrome over the DevTools protocol, captures console output, uncaught
 * exceptions and failed requests, and saves a screenshot of each screen.
 *
 * Run with: pnpm tsx scripts/inspect-client.mts [url]
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = process.argv[2] ?? 'http://localhost:3200'
const OUT = 'screenshots'
const PORT = 9333

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
    '--user-data-dir=' + process.env.TEMP + '/tandem-inspect',
    // A phone-shaped viewport, since that is the only shape this ships in.
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
      const info = (await response.json()) as { webSocketDebuggerUrl: string }
      return info.webSocketDebuggerUrl
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
const events: { method: string; params: Record<string, unknown> }[] = []

socket.addEventListener('message', (message) => {
  const data = JSON.parse(String(message.data)) as {
    id?: number
    method?: string
    params?: Record<string, unknown>
    result?: Record<string, unknown>
  }
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)!(data.result ?? {})
    pending.delete(data.id)
  } else if (data.method) {
    events.push({ method: data.method, params: data.params ?? {} })
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
const { sessionId } = (await send('Target.attachToTarget', {
  targetId,
  flatten: true,
})) as { sessionId: string }

const call = (method: string, params: Record<string, unknown> = {}) =>
  send(method, params, sessionId)

await call('Page.enable')
await call('Runtime.enable')
await call('Log.enable')
await call('Network.enable')
await call('Emulation.setDeviceMetricsOverride', {
  width: 393,
  height: 852,
  deviceScaleFactor: 3,
  mobile: true,
})

const problems: string[] = []
const routes = ['/', '/ladder', '/pot']

for (const route of routes) {
  events.length = 0

  await call('Page.navigate', { url: `${BASE}${route}` })
  await sleep(3500)

  for (const event of events) {
    if (event.method === 'Runtime.exceptionThrown') {
      const details = event.params.exceptionDetails as {
        text?: string
        exception?: { description?: string }
      }
      problems.push(
        `${route}  UNCAUGHT  ${details.exception?.description ?? details.text ?? 'unknown'}`,
      )
    }

    if (event.method === 'Runtime.consoleAPICalled') {
      const { type, args } = event.params as {
        type: string
        args: { value?: unknown; description?: string }[]
      }
      if (type === 'error' || type === 'warning') {
        const text = args
          .map((arg) => String(arg.value ?? arg.description ?? ''))
          .join(' ')
          .slice(0, 300)
        if (text.trim()) problems.push(`${route}  ${type.toUpperCase()}  ${text}`)
      }
    }

    if (event.method === 'Network.loadingFailed') {
      const { errorText, type } = event.params as { errorText: string; type: string }
      if (type !== 'Image') problems.push(`${route}  REQUEST FAILED  ${type} ${errorText}`)
    }
  }

  const shot = (await call('Page.captureScreenshot', { format: 'png' })) as { data: string }
  const name = `${OUT}/${route === '/' ? 'arena' : route.slice(1)}.png`
  writeFileSync(name, Buffer.from(shot.data, 'base64'))
  console.log(`  saved ${name}`)
}

/*
 * The arena only paints once a run is under way, so drive it: tap Start, wait
 * past the countdown, drag across the screen, and capture mid-run.
 */
await call('Page.navigate', { url: BASE })
await sleep(3000)

const started = (await call('Runtime.evaluate', {
  expression: `(() => {
    const button = [...document.querySelectorAll('button')]
      .find((b) => b.textContent && /start/i.test(b.textContent))
    if (!button) return 'no start button found'
    button.click()
    return 'clicked'
  })()`,
  returnByValue: true,
})) as { result?: { value?: string } }

console.log(`  start button: ${started.result?.value ?? 'unknown'}`)

await sleep(3200)

for (let i = 0; i < 40; i++) {
  const x = 60 + Math.round(270 * (0.5 + 0.5 * Math.sin(i / 4)))
  await call('Input.dispatchMouseEvent', {
    type: i === 0 ? 'mousePressed' : 'mouseMoved',
    x,
    y: 640,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  })
  await sleep(45)
}

const midRun = (await call('Page.captureScreenshot', { format: 'png' })) as { data: string }
writeFileSync(`${OUT}/arena-running.png`, Buffer.from(midRun.data, 'base64'))
console.log(`  saved ${OUT}/arena-running.png`)

const hud = (await call('Runtime.evaluate', {
  expression: `(() => {
    const canvas = document.querySelector('canvas')
    const context = canvas && canvas.getContext('2d')
    let painted = 'no canvas'
    if (canvas && context) {
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      let lit = 0
      for (let i = 0; i < data.length; i += 4000) {
        if (data[i] > 12 || data[i + 1] > 12 || data[i + 2] > 20) lit++
      }
      painted = lit + ' of ' + Math.ceil(data.length / 4000) + ' sampled pixels above background'
    }
    const score = document.querySelector('span.tabular')
    return JSON.stringify({
      canvas: canvas ? canvas.width + 'x' + canvas.height : 'missing',
      painted,
      score: score ? score.textContent : 'no score element',
      overlay: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 120),
    })
  })()`,
  returnByValue: true,
})) as { result?: { value?: string } }

console.log(`\n  arena state: ${hud.result?.value ?? 'unknown'}`)

console.log('\nClient console')
if (problems.length === 0) {
  console.log('  clean: no errors, warnings, or failed requests\n')
} else {
  for (const problem of [...new Set(problems)]) console.log(`  ${problem}`)
  console.log('')
}

socket.close()
chrome.kill()
process.exit(0)
