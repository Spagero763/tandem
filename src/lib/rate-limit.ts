import 'server-only'

import { sql } from 'drizzle-orm'

import { getDb } from '@/lib/db'

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSeconds: number
}

/**
 * Fixed-window rate limit held in Postgres.
 *
 * A dedicated store would be a second piece of infrastructure to keep alive for
 * twelve months, and this is a single indexed upsert. The whole decision is one
 * statement so two concurrent requests cannot both read a stale count.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const db = await getDb()

  const result = await db.execute<{ count: number; window_start: Date }>(sql`
    INSERT INTO rate_limits (key, count, window_start)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < now() - (${windowSeconds} * interval '1 second')
        THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < now() - (${windowSeconds} * interval '1 second')
        THEN now()
        ELSE rate_limits.window_start
      END
    RETURNING count, window_start
  `)

  const row = Array.isArray(result) ? result[0] : result.rows?.[0]
  if (!row) return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 }

  const count = Number(row.count)
  const windowStart = new Date(row.window_start).getTime()
  const elapsed = (Date.now() - windowStart) / 1000

  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil(windowSeconds - elapsed)),
  }
}

/**
 * A coarse client identifier for unauthenticated routes. It is not a security
 * boundary — proxies share addresses and addresses can be rotated — only a way
 * to make casual flooding cost something.
 */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  return `${scope}:${ip}`
}
