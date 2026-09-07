'use client'

import { motion } from 'motion/react'

import { use, useEffect, useState } from 'react'

import { TICK_HZ } from '@/lib/sim/constants'

interface Scored {
  score: number
  motes: number
  grazes: number
  bestCombo: number
  integrity: number
  ticks: number
  survived: boolean
  checksum: number
}

interface Verification {
  run: {
    id: string
    heatId: string
    handle: string
    createdAt: string
    rulesVersion: number
    mismatch: boolean
    signals: Record<string, number> | null
  }
  stored: Scored
  replayed: Scored
  agrees: boolean
  seed: string
  inputs: string
}

const ROWS: { key: keyof Scored; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'motes', label: 'Motes' },
  { key: 'bestCombo', label: 'Best combo' },
  { key: 'grazes', label: 'Grazes' },
  { key: 'integrity', label: 'Integrity left' },
  { key: 'ticks', label: 'Ticks' },
  { key: 'checksum', label: 'Checksum' },
]

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [data, setData] = useState<Verification | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const response = await fetch(`/api/run/${id}`, { cache: 'no-store' })
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? 'This run could not be loaded.')
        }
        if (!cancelled) setData((await response.json()) as Verification)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Something went wrong.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <main
      className="mx-auto min-h-full w-full max-w-lg px-5 pb-28"
      style={{ paddingTop: 'calc(var(--safe-top) + 1.5rem)' }}
    >
      <header>
        <h1 className="display text-2xl text-chalk">Run receipt</h1>
        <p className="mt-1 text-xs leading-relaxed text-dim">
          Every number below was recomputed just now by replaying this run&rsquo;s recorded
          inputs.
        </p>
      </header>

      {error ? (
        <p className="mt-8 rounded-xl bg-shard/10 px-4 py-3 text-sm text-shard">{error}</p>
      ) : null}

      {!data && !error ? (
        <div className="mt-8 space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton h-12 rounded-2xl" />
          ))}
        </div>
      ) : null}

      {data ? (
        <>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ease: [0.16, 1, 0.3, 1] }}
            className={`mt-6 rounded-2xl px-5 py-4 ${
              data.agrees ? 'bg-cool/10 ring-1 ring-cool/25' : 'bg-shard/10 ring-1 ring-shard/25'
            }`}
          >
            <p className={`text-sm font-semibold ${data.agrees ? 'text-cool' : 'text-shard'}`}>
              {data.agrees ? 'Replay matches the ladder' : 'Replay disagrees with the ladder'}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {data.agrees
                ? 'The stored score is exactly what these inputs produce on this course.'
                : 'This run is flagged. The replayed score is the one that counts.'}
            </p>
          </motion.div>

          <dl className="mt-6 space-y-2">
            <div className="flex items-baseline justify-between px-1 pb-1">
              <dt className="text-[10px] tracking-[0.18em] text-dim uppercase">Field</dt>
              <dd className="flex gap-6 text-[10px] tracking-[0.18em] text-dim uppercase">
                <span className="w-20 text-right">Stored</span>
                <span className="w-20 text-right">Replayed</span>
              </dd>
            </div>

            {ROWS.map(({ key, label }) => {
              const stored = data.stored[key]
              const replayed = data.replayed[key]
              const same = stored === replayed
              return (
                <div
                  key={key}
                  className="flex items-baseline justify-between rounded-xl bg-ink-850/70 px-4 py-2.5"
                >
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="flex gap-6">
                    <span className="tabular w-20 text-right text-sm text-dim">
                      {String(stored)}
                    </span>
                    <span
                      className={`tabular w-20 text-right text-sm ${
                        same ? 'text-chalk' : 'text-shard'
                      }`}
                    >
                      {String(replayed)}
                    </span>
                  </dd>
                </div>
              )
            })}
          </dl>

          <section className="mt-8 space-y-2 text-xs text-muted">
            <Line label="Player" value={data.run.handle} />
            <Line label="Heat" value={data.run.heatId} />
            <Line label="Course seed" value={data.seed} mono />
            <Line label="Rules version" value={`v${data.run.rulesVersion}`} />
            <Line
              label="Run length"
              value={`${(data.replayed.ticks / TICK_HZ).toFixed(1)}s of ${data.replayed.survived ? 'a finished heat' : 'an ended run'}`}
            />
            <Line label="Replay size" value={`${(data.inputs.length / 1024).toFixed(1)} KB`} />
          </section>

          <p className="mt-8 rounded-xl bg-ink-800/70 px-4 py-3 text-[11px] leading-relaxed text-dim">
            The course is generated from the seed above, so it is identical for everyone who
            played this heat. The replay is the exact sequence of thumb positions, one per tick.
            Together they determine the score completely, which is why the device that played the
            run never gets to report it.
          </p>
        </>
      ) : null}

    </main>
  )
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-dim">{label}</span>
      <span className={`min-w-0 truncate text-right text-chalk ${mono ? 'tabular' : ''}`}>
        {value}
      </span>
    </div>
  )
}
