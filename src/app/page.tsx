'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useState } from 'react'

import { Arena } from '@/components/Arena'
import type { RunOutcome } from '@/game/useTandem'
import { RUN_TICKS, TICK_HZ } from '@/lib/sim/constants'

function todaySeed(): string {
  return `heat-${new Date().toISOString().slice(0, 10)}`
}

export default function Page() {
  const [seed] = useState(todaySeed)
  const [outcome, setOutcome] = useState<RunOutcome | null>(null)
  const [runKey, setRunKey] = useState(0)

  const onEnd = useCallback((result: RunOutcome) => setOutcome(result), [])

  const again = useCallback(() => {
    setOutcome(null)
    setRunKey((key) => key + 1)
  }, [])

  return (
    <main className="fixed inset-0 flex flex-col">
      <Arena key={runKey} seed={seed} onEnd={onEnd} />

      <AnimatePresence>
        {outcome ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center bg-ink-950/88 p-6 backdrop-blur-md"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="panel w-full max-w-sm rounded-3xl p-7"
            >
              <p className="text-xs font-medium tracking-[0.18em] text-dim uppercase">
                {outcome.survived ? 'Heat complete' : 'Knocked out'}
              </p>
              <p className="tabular mt-2 text-6xl font-semibold text-chalk">
                {outcome.score.toLocaleString()}
              </p>

              <dl className="mt-7 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                <Stat label="Motes" value={outcome.motes.toLocaleString()} />
                <Stat label="Best combo" value={`×${outcome.bestCombo}`} />
                <Stat label="Grazes" value={outcome.grazes.toLocaleString()} />
                <Stat
                  label="Survived"
                  value={`${(outcome.ticks / TICK_HZ).toFixed(1)}s / ${RUN_TICKS / TICK_HZ}s`}
                />
              </dl>

              <button
                type="button"
                onClick={again}
                className="mt-8 w-full rounded-full bg-chalk py-3.5 text-sm font-semibold text-ink-950"
              >
                Run it again
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-dim uppercase">{label}</dt>
      <dd className="tabular mt-1 text-lg text-chalk">{value}</dd>
    </div>
  )
}
