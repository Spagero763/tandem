'use client'

import { motion } from 'motion/react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { usePlayer } from '@/components/PlayerProvider'

interface Row {
  rank: number
  address: string
  handle: string
  score: number
  attempts: number
  patron: boolean
  founder: boolean
  runId: string
  survived: boolean
  bestCombo: number
}

interface LadderData {
  heatId: string
  isCurrent: boolean
  closesInMs: number
  players: number
  best: number
  you: { rank: number; score: number; attempts: number; runId: string } | null
  top: Row[]
}

function countdown(ms: number): string {
  if (ms <= 0) return 'closed'
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

export default function LadderPage() {
  const { player } = usePlayer()
  const [data, setData] = useState<LadderData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(0)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/ladder', { cache: 'no-store' })
      if (!response.ok) throw new Error()
      const body = (await response.json()) as LadderData
      setData(body)
      setRemaining(body.closesInMs)
    } catch {
      setError('Could not load the ladder.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!data?.isCurrent) return
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 60_000)), 60_000)
    return () => clearInterval(timer)
  }, [data?.isCurrent])

  return (
    <main
      className="mx-auto min-h-full w-full max-w-lg px-5 pb-28"
      style={{ paddingTop: 'calc(var(--safe-top) + 1.5rem)' }}
    >
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="display text-2xl text-chalk">Today&rsquo;s heat</h1>
          <p className="mt-1 text-xs text-dim">
            {data ? `${data.heatId} · closes in ${countdown(remaining)}` : 'Loading…'}
          </p>
        </div>
        {data ? (
          <div className="text-right">
            <p className="tabular text-lg font-semibold text-chalk">{data.players}</p>
            <p className="text-[10px] tracking-wide text-dim uppercase">
              {data.players === 1 ? 'player' : 'players'}
            </p>
          </div>
        ) : null}
      </header>

      {error ? (
        <p className="mt-8 rounded-xl bg-shard/10 px-4 py-3 text-sm text-shard">{error}</p>
      ) : null}

      {!data && !error ? (
        <div className="mt-8 space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skeleton h-14 rounded-2xl" />
          ))}
        </div>
      ) : null}

      {data && data.top.length === 0 ? (
        <div className="panel mt-8 rounded-2xl p-6 text-center">
          <p className="text-sm text-chalk">Nobody has posted a score yet today.</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            The course resets every day at midnight UTC. Be the first name on it.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-full bg-chalk px-6 py-2.5 text-sm font-semibold text-ink-950"
          >
            Play the heat
          </Link>
        </div>
      ) : null}

      {data && data.top.length > 0 ? (
        <ol className="mt-6 space-y-1.5">
          {data.top.map((row, index) => {
            const isYou = player?.address === row.address
            return (
              <motion.li
                key={row.address}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.025, 0.4), ease: [0.16, 1, 0.3, 1] }}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
                  isYou ? 'bg-warm/12 ring-1 ring-warm/25' : 'bg-ink-850/70'
                }`}
              >
                <span
                  className={`tabular w-7 text-sm font-semibold ${
                    row.rank <= 3 ? 'text-warm' : 'text-dim'
                  }`}
                >
                  {row.rank}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-chalk">
                    {row.handle}
                    {isYou ? <span className="ml-1.5 text-xs text-warm">you</span> : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-dim">
                    ×{row.bestCombo} combo · {row.attempts}{' '}
                    {row.attempts === 1 ? 'run' : 'runs'}
                    {row.survived ? ' · finished' : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {row.patron ? (
                    <span
                      title="Stakes NIM through Tandem"
                      className="rounded-full bg-nimiq/15 px-2 py-0.5 text-[10px] font-medium text-nimiq"
                    >
                      Patron
                    </span>
                  ) : null}
                  <span className="tabular text-sm font-semibold text-chalk">
                    {row.score.toLocaleString()}
                  </span>
                </div>
              </motion.li>
            )
          })}
        </ol>
      ) : null}

      {data?.you && data.you.rank > data.top.length ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-warm/12 px-4 py-3 ring-1 ring-warm/25">
          <span className="tabular w-7 text-sm font-semibold text-warm">{data.you.rank}</span>
          <p className="flex-1 text-sm text-chalk">You</p>
          <span className="tabular text-sm font-semibold text-chalk">
            {data.you.score.toLocaleString()}
          </span>
        </div>
      ) : null}

      <p className="mt-8 px-2 text-center text-[11px] leading-relaxed text-dim">
        Every score here was recomputed by the server from the run&rsquo;s recorded inputs. A
        device cannot report a score it did not play.
      </p>

      <Link
        href="/"
        className="fixed left-1/2 z-10 -translate-x-1/2 rounded-full bg-chalk px-8 py-3.5 text-sm font-semibold text-ink-950 shadow-lg"
        style={{ bottom: 'calc(var(--safe-bottom) + 1.25rem)' }}
      >
        Play the heat
      </Link>
    </main>
  )
}
