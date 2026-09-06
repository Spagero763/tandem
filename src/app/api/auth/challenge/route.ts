import { NextResponse } from 'next/server'

import { issueNonce } from '@/lib/auth/nonce'
import { clientKey, rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const limit = await rateLimit(clientKey(request, 'challenge'), 20, 60)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  const { nonce, message } = await issueNonce()
  return NextResponse.json({ nonce, message })
}
