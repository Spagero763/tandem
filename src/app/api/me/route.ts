import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { clearSession, readSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { players } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await readSession()
  if (!session) return NextResponse.json({ player: null })

  const db = await getDb()
  const found = await db
    .select({
      address: players.address,
      handle: players.handle,
      patron: players.patron,
      stakedLuna: players.stakedLuna,
      founder: players.founder,
    })
    .from(players)
    .where(eq(players.address, session.address))
    .limit(1)

  // The session outlived the row it points at (a wiped database in
  // development). Treat it as signed out rather than half-signed-in.
  if (!found[0]) {
    await clearSession()
    return NextResponse.json({ player: null })
  }

  return NextResponse.json({ player: found[0] })
}

export async function DELETE() {
  await clearSession()
  return NextResponse.json({ ok: true })
}
