'use client'

import { motion } from 'motion/react'
import { useState } from 'react'

import type { RunOutcome } from '@/game/useTandem'
import { RUN_TICKS, TICK_HZ } from '@/lib/sim/constants'
import { challengeLink, shareChallenge } from '@/lib/share'

export interface Submission {
  runId: string
  score: number
  rank: number | null
  total: number | null
  personalBest: boolean
  mismatch: boolean
}

interface Props {
  outcome: RunOutcome
  submission: Submission | null
  submitting: boolean
  submitError: string | null
  ghostLabel: string | null
  ghostScore: number | null
  signedIn: boolean
  signingIn: boolean
  onSignIn: () => void
  onAgain: () => void
}

export function ResultSheet({
  outcome,
  submission,
  submitting,
  submitError,
  ghostLabel,
  ghostScore,
  signedIn,
  signingIn,
  onSignIn,
  onAgain,
}: Props) {
  const [shareLabel, setShareLabel] = useState('Challenge a friend')

  const beatGhost = ghostScore !== null && outcome.score > ghostScore
  const seconds = outcome.ticks / TICK_HZ

  async function onShare() {
    if (!submission) return
    const result = await shareChallenge(
      `I scored ${outcome.score.toLocaleString()} on today's Tandem heat. Beat my ghost.`,
      challengeLink(submission.runId),
    )
    setShareLabel(
      result.method === 'copied'
        ? 'Link copied'
        : result.method === 'shared'
          ? 'Shared'
          : 'Could not share',
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-20 flex items-end justify-center bg-ink-950/85 p-4 backdrop-blur-md sm:items-center"
      style={{ paddingBottom: 'calc(var(--safe-bottom) + 1rem)' }}
    >
      <motion.div
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="panel w-full max-w-sm rounded-3xl p-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium tracking-[0.18em] text-dim uppercase">
              {outcome.survived ? 'Heat complete' : `Out at ${seconds.toFixed(1)}s`}
            </p>
            <p className="tabular mt-1.5 text-5xl leading-none font-semibold text-chalk">
              {outcome.score.toLocaleString()}
            </p>
          </div>

          {submission?.rank ? (
            <div className="text-right">
              <p className="text-[11px] font-medium tracking-[0.18em] text-dim uppercase">Rank</p>
              <p className="tabular mt-1.5 text-3xl leading-none font-semibold text-warm">
                {submission.rank}
                <span className="text-base text-dim">/{submission.total}</span>
              </p>
            </div>
          ) : null}
        </div>

        {submission?.personalBest ? (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-warm/12 px-3 py-1.5 text-xs font-medium text-warm"
          >
            New personal best for this heat
          </motion.p>
        ) : null}

        {ghostLabel && ghostScore !== null ? (
          <div className="mt-5 flex items-center justify-between rounded-2xl bg-ink-800/70 px-4 py-3">
            <span className="text-sm text-muted">
              vs <span className="text-chalk">{ghostLabel}</span>
            </span>
            <span className={`tabular text-sm font-semibold ${beatGhost ? 'text-cool' : 'text-shard'}`}>
              {beatGhost ? '+' : ''}
              {(outcome.score - ghostScore).toLocaleString()}
            </span>
          </div>
        ) : null}

        <dl className="mt-6 grid grid-cols-4 gap-3">
          <Stat label="Motes" value={outcome.motes.toLocaleString()} />
          <Stat label="Combo" value={`×${outcome.bestCombo}`} />
          <Stat label="Grazes" value={outcome.grazes.toLocaleString()} />
          <Stat label="Left" value={`${outcome.integrity}/3`} />
        </dl>

        {submission?.mismatch ? (
          <p className="mt-5 rounded-xl bg-shard/10 px-3 py-2.5 text-xs leading-relaxed text-shard">
            The server replayed this run and got a different score than your device reported. The
            replayed score is the one that counts.
          </p>
        ) : null}

        {submitError ? (
          <p className="mt-5 rounded-xl bg-shard/10 px-3 py-2.5 text-xs text-shard">{submitError}</p>
        ) : null}

        <div className="mt-6 space-y-2.5">
          {!signedIn ? (
            <>
              <button
                type="button"
                onClick={onSignIn}
                disabled={signingIn}
                className="w-full rounded-full bg-chalk py-3.5 text-sm font-semibold text-ink-950 disabled:opacity-60"
              >
                {signingIn ? 'Check your wallet…' : 'Sign in to keep this score'}
              </button>
              <p className="px-2 text-center text-[11px] leading-relaxed text-dim">
                One signature. No account, no email, nothing to remember.
              </p>
            </>
          ) : submission ? (
            <button
              type="button"
              onClick={onShare}
              className="w-full rounded-full bg-ghost/15 py-3.5 text-sm font-semibold text-ghost"
            >
              {shareLabel}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onAgain}
            disabled={submitting}
            className={`w-full rounded-full py-3.5 text-sm font-semibold disabled:opacity-60 ${
              signedIn && submission
                ? 'bg-chalk text-ink-950'
                : 'bg-ink-700 text-chalk hover:bg-ink-600'
            }`}
          >
            {submitting ? 'Saving…' : 'Run it again'}
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-dim">
          {RUN_TICKS / TICK_HZ}s heat · everyone plays the same course today
        </p>
      </motion.div>
    </motion.div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] tracking-wide text-dim uppercase">{label}</dt>
      <dd className="tabular mt-1 text-base text-chalk">{value}</dd>
    </div>
  )
}
