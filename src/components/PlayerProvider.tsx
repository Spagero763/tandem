'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import { describeError, isInsideNimiqPay, signMessage } from '@/lib/nimiq/client'

export interface Player {
  address: string
  handle: string
  patron: boolean
  stakedLuna: number
  founder: boolean
}

interface PlayerContextValue {
  player: Player | null
  loading: boolean
  signingIn: boolean
  error: string | null
  insideNimiqPay: boolean
  signIn: () => Promise<boolean>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

/** The host bridge never appears or disappears mid-session, so nothing to watch. */
function subscribeToHost(): () => void {
  return () => {}
}

async function fetchPlayer(): Promise<Player | null> {
  try {
    const response = await fetch('/api/me', { cache: 'no-store' })
    const data = (await response.json()) as { player: Player | null }
    return data.player
  } catch {
    return null
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /*
   * Nimiq Pay injects its bridge before page scripts run and never removes it,
   * so this is a static read of an external system rather than state. The
   * server has no bridge, hence the separate server snapshot.
   */
  const insideNimiqPay = useSyncExternalStore(
    subscribeToHost,
    isInsideNimiqPay,
    () => false,
  )

  const refresh = useCallback(async () => {
    setPlayer(await fetchPlayer())
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const found = await fetchPlayer()
      if (cancelled) return
      setPlayer(found)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * One wallet dialog, not two.
   *
   * The address is derived server-side from the public key that signed, so
   * there is no need to ask for accounts first. Every extra native prompt is
   * one more chance for someone to back out of signing in.
   */
  const signIn = useCallback(async () => {
    setSigningIn(true)
    setError(null)

    try {
      const challenge = await fetch('/api/auth/challenge', { method: 'POST' })
      if (!challenge.ok) throw new Error('Could not start sign-in. Try again.')
      const { nonce, message } = (await challenge.json()) as { nonce: string; message: string }

      const signed = await signMessage(message)

      const verified = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nonce,
          publicKey: signed.publicKey,
          signature: signed.signature,
        }),
      })

      if (!verified.ok) {
        const body = (await verified.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Sign-in failed.')
      }

      await refresh()
      return true
    } catch (cause) {
      setError(describeError(cause))
      return false
    } finally {
      setSigningIn(false)
    }
  }, [refresh])

  const signOut = useCallback(async () => {
    await fetch('/api/me', { method: 'DELETE' })
    setPlayer(null)
  }, [])

  const value = useMemo(
    () => ({ player, loading, signingIn, error, insideNimiqPay, signIn, signOut, refresh }),
    [player, loading, signingIn, error, insideNimiqPay, signIn, signOut, refresh],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext)
  if (!context) throw new Error('usePlayer must be used inside PlayerProvider')
  return context
}
