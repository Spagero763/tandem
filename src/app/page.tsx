'use client'

import { AnimatePresence } from 'motion/react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Arena } from '@/components/Arena'
import { useCopy } from '@/components/CopyProvider'
import { usePlayer } from '@/components/PlayerProvider'
import { ResultSheet, type Submission } from '@/components/ResultSheet'
import type { RunOutcome } from '@/game/useTandem'
import { getDeviceIdentifier } from '@/lib/nimiq/client'
import { decodeInputs, encodeInputs } from '@/lib/sim/codec'

interface Ghost {
  kind: 'player' | 'trainer'
  label: string
  score: number
  runId: string | null
  inputs: number[]
}

function todayHeat(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Racing a ghost is a bonus, not a requirement, so every failure here resolves
 * to null and the player still gets a heat.
 */
async function fetchGhost(heatId: string): Promise<Ghost | null> {
  try {
    const response = await fetch(`/api/ghost?heat=${heatId}`, { cache: 'no-store' })
    if (!response.ok) return null
    const data = (await response.json()) as Omit<Ghost, 'inputs'> & { inputs: string }
    const inputs = decodeInputs(data.inputs)
    return inputs ? { ...data, inputs: Array.from(inputs) } : null
  } catch {
    return null
  }
}

export default function Page() {
  const { player, signIn, signingIn, insideNimiqPay } = usePlayer()
  const t = useCopy()

  const [heatId] = useState(todayHeat)
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const [outcome, setOutcome] = useState<RunOutcome | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [runKey, setRunKey] = useState(0)

  const deviceHashRef = useRef<string | null>(null)

  const loadGhost = useCallback(async () => {
    const found = await fetchGhost(heatId)
    if (found) setGhost(found)
  }, [heatId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const found = await fetchGhost(heatId)
      if (!cancelled && found) setGhost(found)
    })()
    return () => {
      cancelled = true
    }
  }, [heatId])

  const submit = useCallback(
    async (result: RunOutcome) => {
      setSubmitting(true)
      setSubmitError(null)

      try {
        const response = await fetch('/api/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            heatId,
            inputs: encodeInputs(result.inputs),
            claimedScore: result.score,
            claimedChecksum: result.checksum,
            pauses: result.pauses,
            deviceHash: deviceHashRef.current,
          }),
        })

        const data = (await response.json().catch(() => ({}))) as Submission & { error?: string }

        if (!response.ok) {
          setSubmitError(data.error ?? t.errGeneric)
          return
        }

        setSubmission(data)
      } catch {
        setSubmitError(t.errGeneric)
      } finally {
        setSubmitting(false)
      }
    },
    [heatId, t],
  )

  const onEnd = useCallback(
    (result: RunOutcome) => {
      setOutcome(result)
      if (player) void submit(result)
    },
    [player, submit],
  )

  /**
   * Signing in after a run, rather than before one, is the point: nobody should
   * have to approve a wallet dialog to find out whether they like the game. If
   * they sign in from the result sheet, the run they just played is submitted.
   */
  const onSignIn = useCallback(async () => {
    const ok = await signIn()
    if (!ok) return

    deviceHashRef.current ??= await getDeviceIdentifier(
      'Rank your runs and keep the ladder free of duplicate entries',
    )

    if (outcome) await submit(outcome)
  }, [outcome, signIn, submit])

  const again = useCallback(() => {
    setOutcome(null)
    setSubmission(null)
    setSubmitError(null)
    setRunKey((key) => key + 1)
    void loadGhost()
  }, [loadGhost])

  return (
    <main className="fixed inset-0 flex flex-col">
      <Arena
        key={runKey}
        seed={`heat-${heatId}`}
        ghostInputs={ghost?.inputs ?? null}
        ghostName={ghost?.label ?? null}
        onEnd={onEnd}
      />

      <div
        className="absolute right-4 z-10 flex gap-2"
        style={{ bottom: 'calc(var(--safe-bottom) + 1rem)' }}
      >
        <Link
          href="/ladder"
          className="flex min-h-11 items-center rounded-full bg-ink-800/80 px-4 text-xs font-medium text-muted backdrop-blur"
        >
          {t.arenaLadder}
        </Link>
        <Link
          href="/pot"
          className="flex min-h-11 items-center rounded-full bg-ink-800/80 px-4 text-xs font-medium text-muted backdrop-blur"
        >
          {t.arenaPot}
        </Link>
      </div>

      <AnimatePresence>
        {outcome ? (
          <ResultSheet
            outcome={outcome}
            submission={submission}
            submitting={submitting}
            submitError={submitError}
            ghostLabel={ghost?.label ?? null}
            ghostScore={ghost?.score ?? null}
            signedIn={Boolean(player)}
            signingIn={signingIn}
            insideNimiqPay={insideNimiqPay}
            onSignIn={onSignIn}
            onAgain={again}
          />
        ) : null}
      </AnimatePresence>
    </main>
  )
}
