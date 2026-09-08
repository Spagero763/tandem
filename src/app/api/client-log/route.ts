import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A place for a phone to report what went wrong.
 *
 * A mini app runs in a WebView with no reachable console, so a script error
 * there is invisible: the server sees a page load, then silence, and the
 * screen sits on whatever the server rendered. This prints what the device
 * caught into the dev server's own output.
 *
 * A debugging aid, not a telemetry endpoint. On in development, and in a
 * production build only when NEXT_PUBLIC_DEVICE_REPORTER is set.
 */
export async function POST(request: Request) {
  const enabled =
    process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEVICE_REPORTER === '1'
  if (!enabled) return new NextResponse(null, { status: 404 })

  const body = (await request.json().catch(() => null)) as {
    kind?: string
    message?: string
    source?: string
    line?: number
    stack?: string
    ua?: string
  } | null

  if (!body) return NextResponse.json({ ok: true })

  const agent = (body.ua ?? '').slice(0, 120)
  const where = body.source ? ` at ${body.source}:${body.line ?? 0}` : ''

  console.log(
    `\n  [device ${body.kind ?? 'log'}] ${String(body.message).slice(0, 400)}${where}` +
      (body.stack ? `\n    ${String(body.stack).slice(0, 600).replace(/\n/g, '\n    ')}` : '') +
      `\n    ua: ${agent}\n`,
  )

  return NextResponse.json({ ok: true })
}
