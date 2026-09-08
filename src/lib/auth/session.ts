import 'server-only'

import { jwtVerify, SignJWT } from 'jose'
import { cookies, headers } from 'next/headers'

const COOKIE = 'tandem_session'
const ISSUER = 'tandem'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/** Thrown when the deployment is missing configuration it cannot invent. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

let cachedSecret: Uint8Array | null = null

function secret(): Uint8Array {
  if (cachedSecret) return cachedSecret

  const value = process.env.SESSION_SECRET

  if (!value || value.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      // Failing to boot is the correct behaviour: a predictable signing key
      // would let anyone mint a session for any address.
      throw new ConfigError(
        'SESSION_SECRET is not set. Generate one with `openssl rand -base64 48` ' +
          'and set it in the deployment environment. Sessions cannot be signed without it.',
      )
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
    secure: await isSecureConnection(),
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

/**
 * Whether the *connection* is HTTPS, rather than whether this is a production
 * build.
 *
 * A Secure cookie is silently dropped by the browser over plain HTTP, so
 * keying this off the build breaks sign-in everywhere a production bundle is
 * served without TLS, which is exactly how a mini app is tested on a phone:
 * the wallet signs, the cookie is set, and every request after it is anonymous
 * again. Proxies that terminate TLS report the original scheme here.
 */
async function isSecureConnection(): Promise<boolean> {
  const store = await headers()
  const forwarded = store.get('x-forwarded-proto')
  if (forwarded) return forwarded.split(',')[0].trim() === 'https'
  return false
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
