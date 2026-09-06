import 'server-only'

import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'

const COOKIE = 'tandem_session'
const ISSUER = 'tandem'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

let cachedSecret: Uint8Array | null = null

function secret(): Uint8Array {
  if (cachedSecret) return cachedSecret

  const value = process.env.SESSION_SECRET

  if (!value || value.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      // Failing to boot is the correct behaviour: a predictable signing key
      // would let anyone mint a session for any address.
      throw new Error('SESSION_SECRET must be set to at least 32 characters in production')
    }
    cachedSecret = new TextEncoder().encode('tandem-development-secret-not-for-production-use')
    return cachedSecret
  }

  cachedSecret = new TextEncoder().encode(value)
  return cachedSecret
}

export interface Session {
  address: string
}

export async function createSession(address: string): Promise<void> {
  const token = await new SignJWT({ address })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret())

  const store = await cookies()
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function readSession(): Promise<Session | null> {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER })
    const address = payload.address
    return typeof address === 'string' && address.length === 36 ? { address } : null
  } catch {
    return null
  }
}

export async function clearSession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE)
}
