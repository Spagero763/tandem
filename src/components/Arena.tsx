'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useRef } from 'react'

import { useCopy } from '@/components/CopyProvider'
import { useTandem, type Hud, type RunOutcome } from '@/game/useTandem'
import { START_INTEGRITY } from '@/lib/sim/constants'

interface Props {
  seed: string
  ghostInputs?: number[] | null
  ghostName?: string | null
  onEnd: (outcome: RunOutcome) => void
  autoStart?: boolean
}

export function Arena({ seed, ghostInputs, ghostName, onEnd }: Props) {
  const scoreRef = useRef<HTMLSpanElement | null>(null)
  const multiplierRef = useRef<HTMLSpanElement | null>(null)
  const timerRef = useRef<HTMLDivElement | null>(null)
  const ghostRef = useRef<HTMLSpanElement | null>(null)
  const pipsRef = useRef<HTMLDivElement | null>(null)

  /**
   * The HUD is written straight to the DOM rather than through React state.
   * These values change 60 times a second; routing them through a re-render
   * would cost more than the simulation and the renderer combined.
   */
  const onHud = useCallback((hud: Hud) => {
    if (scoreRef.current) scoreRef.current.textContent = hud.score.toLocaleString()
    if (multiplierRef.current) {
      multiplierRef.current.textContent = hud.multiplier > 1 ? `×${hud.multiplier}` : ''
    }
    if (timerRef.current) {
      timerRef.current.style.transform = `scaleX(${Math.max(0, hud.secondsLeft / 60)})`
    }
    if (ghostRef.current && hud.ghostScore !== null) {
      const delta = hud.score - hud.ghostScore
      ghostRef.current.textContent = `${delta >= 0 ? '+' : ''}${delta.toLocaleString()}`
      ghostRef.current.dataset.ahead = delta >= 0 ? 'true' : 'false'
    }
    if (pipsRef.current) {
      const pips = pipsRef.current.children
      for (let i = 0; i < pips.length; i++) {
        ;(pips[i] as HTMLElement).dataset.lit = i < hud.integrity ? 'true' : 'false'
      }
    }
  }, [])

  const t = useCopy()
  const { canvasRef, phase, countdown, pauses, pauseAllowance, start, resume } = useTandem({
    seed,
    ghostInputs,
    onHud,
    onEnd,
  })

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 block touch-none" />

      {/* HUD */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 px-5"
        style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}
      >
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
          <div
            ref={timerRef}
            className="h-full w-full origin-left rounded-full bg-linear-to-r from-warm to-cool"
            style={{ transform: 'scaleX(1)' }}
          />
        </div>

        <div className="mt-3 flex items-start justify-between">
          <div className="flex items-baseline gap-2">
            <span ref={scoreRef} className="tabular text-4xl font-semibold text-chalk">
              0
            </span>
            <span ref={multiplierRef} className="tabular text-lg font-semibold text-warm" />
          </div>

          <div className="flex flex-col items-end gap-2">
            <div ref={pipsRef} className="flex gap-1.5">
              {Array.from({ length: START_INTEGRITY }).map((_, index) => (
                <span
                  key={index}
                  data-lit="true"
                  className="size-2 rounded-full bg-shard transition-opacity data-[lit=false]:opacity-20"
                />
              ))}
            </div>

            {ghostInputs?.length ? (
              <div className="flex items-center gap-1.5 rounded-full bg-ghost/12 px-2.5 py-1">
                <span className="size-1.5 rounded-full bg-ghost" />
                <span className="text-[11px] font-medium text-ghost/90">
                  {ghostName ?? 'Ghost'}
                </span>
                <span
                  ref={ghostRef}
                  data-ahead="true"
                  className="tabular text-[11px] font-semibold data-[ahead=false]:text-shard data-[ahead=true]:text-cool"
                >
                  +0
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {phase === 'idle' ? (
          <motion.button
            key="idle"
            type="button"
            onClick={start}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-ink-950/70 backdrop-blur-sm"
          >
            <div className="max-w-[17rem] text-center">
              <p className="display text-2xl text-chalk">{t.arenaTitle}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {t.arenaBlurb}
              </p>
            </div>
            <span className="rounded-full bg-chalk px-8 py-3.5 text-sm font-semibold text-ink-950">
              {t.arenaStart}
            </span>
          </motion.button>
        ) : null}

        {phase === 'countdown' ? (
          <motion.div
            key={`count-${countdown}`}
            initial={{ opacity: 0, scale: 1.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span className="display text-8xl text-chalk/90">{countdown > 0 ? countdown : t.arenaGo}</span>
          </motion.div>
        ) : null}

        {phase === 'paused' ? (
          <motion.button
            key="paused"
            type="button"
            onClick={resume}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-ink-950/85 backdrop-blur-md"
          >
            <p className="display text-2xl text-chalk">{t.arenaPaused}</p>
            <p className="max-w-[16rem] text-center text-sm text-muted">
              {t.arenaPausesLeft(pauseAllowance - pauses, pauseAllowance)}
            </p>
            <span className="rounded-full bg-chalk px-8 py-3.5 text-sm font-semibold text-ink-950">
              {t.arenaResume}
            </span>
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
