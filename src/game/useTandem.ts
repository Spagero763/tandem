'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { quantizeInput } from '@/lib/sim/codec'
import { RUN_TICKS, TICK_HZ, TICK_SECONDS } from '@/lib/sim/constants'
import {
  createSimState,
  multiplierFor,
  step,
  type SimEvent,
  type SimState,
} from '@/lib/sim/simulate'

import { ArenaRenderer } from './renderer'

export type RunPhase = 'idle' | 'countdown' | 'running' | 'paused' | 'ended'

export interface Hud {
  score: number
  combo: number
  multiplier: number
  integrity: number
  secondsLeft: number
  ghostScore: number | null
  ghostAlive: boolean
}

export interface RunOutcome {
  score: number
  motes: number
  grazes: number
  bestCombo: number
  integrity: number
  ticks: number
  survived: boolean
  checksum: number
  inputs: number[]
  pauses: number
}

/** Backgrounding is allowed twice; a third time ends the run. */
const PAUSE_ALLOWANCE = 2

interface Options {
  seed: string
  /** A previous player's recorded inputs, replayed in lockstep beside you. */
  ghostInputs?: number[] | null
  onHud: (hud: Hud) => void
  onEnd: (outcome: RunOutcome) => void
}

export function useTandem({ seed, ghostInputs, onHud, onEnd }: Options) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<ArenaRenderer | null>(null)

  const [phase, setPhase] = useState<RunPhase>('idle')
  const [countdown, setCountdown] = useState(3)
  const [pauses, setPauses] = useState(0)

  const stateRef = useRef<SimState | null>(null)
  const ghostRef = useRef<SimState | null>(null)
  const inputsRef = useRef<number[]>([])
  const thumbRef = useRef(0.5)
  const prevThumbRef = useRef(0.5)
  const accumulatorRef = useRef(0)
  const lastTimeRef = useRef(0)
  const frameRef = useRef(0)
  const phaseRef = useRef<RunPhase>('idle')
  const pausesRef = useRef(0)

  // Callbacks are read through refs so the animation loop never has to be torn
  // down and rebuilt when a parent re-renders.
  const onHudRef = useRef(onHud)
  const onEndRef = useRef(onEnd)
  useEffect(() => {
    onHudRef.current = onHud
    onEndRef.current = onEnd
  }, [onHud, onEnd])

  const setPhaseBoth = useCallback((next: RunPhase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new ArenaRenderer(canvas)
    rendererRef.current = renderer

    const parent = canvas.parentElement
    if (!parent) return

    const applySize = () => {
      const rect = parent.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) renderer.resize(rect.width, rect.height)
    }

    applySize()
    const observer = new ResizeObserver(applySize)
    observer.observe(parent)

    return () => {
      observer.disconnect()
      rendererRef.current = null
    }
  }, [])

  const emitHud = useCallback(() => {
    const state = stateRef.current
    if (!state) return

    const ghost = ghostRef.current
    onHudRef.current({
      score: state.score,
      combo: state.combo,
      multiplier: multiplierFor(state.combo),
      integrity: state.integrity,
      secondsLeft: Math.max(0, (RUN_TICKS - state.tick) / TICK_HZ),
      ghostScore: ghost ? ghost.score : null,
      ghostAlive: ghost ? !ghost.ended : false,
    })
  }, [])

  const finish = useCallback(() => {
    const state = stateRef.current
    if (!state) return

    setPhaseBoth('ended')
    emitHud()

    onEndRef.current({
      score: state.score,
      motes: state.motes,
      grazes: state.grazes,
      bestCombo: state.bestCombo,
      integrity: state.integrity,
      ticks: state.tick,
      survived: state.survived,
      checksum: state.checksum,
      inputs: inputsRef.current,
      pauses: pausesRef.current,
    })
  }, [emitHud, setPhaseBoth])

  const loop = useCallback(
    (time: number) => {
      frameRef.current = requestAnimationFrame(loop)

      const renderer = rendererRef.current
      const state = stateRef.current
      if (!renderer || !state) return

      const last = lastTimeRef.current || time
      // Clamp the delta so a stall never fast-forwards the course past the
      // player. Recovering slowly is fair; skipping waves is not.
      const delta = Math.min(100, time - last)
      lastTimeRef.current = time

      if (phaseRef.current === 'running') {
        accumulatorRef.current += delta

        while (accumulatorRef.current >= TICK_SECONDS * 1000 && !state.ended) {
          accumulatorRef.current -= TICK_SECONDS * 1000

          prevThumbRef.current = state.thumbX

          // Quantize before stepping, so the value played is the value sent.
          const input = quantizeInput(thumbRef.current)
          inputsRef.current.push(input)

          const events: SimEvent[] = step(state, input)
          renderer.absorb(events, state)

          const ghost = ghostRef.current
          if (ghost && !ghost.ended) {
            const ghostInput = ghostInputs?.[ghost.tick]
            step(ghost, ghostInput ?? ghost.thumbX)
          }
        }

        emitHud()

        if (state.ended) {
          finish()
          accumulatorRef.current = 0
        }
      }

      const alpha = Math.min(1, accumulatorRef.current / (TICK_SECONDS * 1000))
      renderer.render(state, alpha, prevThumbRef.current, ghostRef.current, time)
    },
    [emitHud, finish, ghostInputs],
  )

  useEffect(() => {
    frameRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameRef.current)
  }, [loop])

  const beginCountdown = useCallback(() => {
    setPhaseBoth('countdown')
    setCountdown(3)

    let remaining = 3
    const timer = setInterval(() => {
      remaining -= 1
      setCountdown(remaining)
      if (remaining <= 0) {
        clearInterval(timer)
        lastTimeRef.current = 0
        accumulatorRef.current = 0
        setPhaseBoth('running')
      }
    }, 700)
  }, [setPhaseBoth])

  const start = useCallback(() => {
    const renderer = rendererRef.current
    renderer?.reset()

    stateRef.current = createSimState(seed)
    ghostRef.current = ghostInputs?.length ? createSimState(seed) : null
    inputsRef.current = []
    thumbRef.current = 0.5
    prevThumbRef.current = 0.5
    pausesRef.current = 0
    setPauses(0)

    emitHud()
    beginCountdown()
  }, [beginCountdown, emitHud, ghostInputs, seed])

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return
    beginCountdown()
  }, [beginCountdown])

  /**
   * A run that keeps ticking while the app is in the background would be
   * unwinnable; one that pauses freely could be used to stop time and study a
   * wave. Pausing is allowed twice, always costs a fresh countdown, and is
   * recorded on the run.
   */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return
      if (phaseRef.current !== 'running' && phaseRef.current !== 'countdown') return

      pausesRef.current += 1
      setPauses(pausesRef.current)

      if (pausesRef.current > PAUSE_ALLOWANCE) {
        const state = stateRef.current
        if (state && !state.ended) {
          state.ended = true
          state.survived = false
        }
        finish()
      } else {
        setPhaseBoth('paused')
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [finish, setPhaseBoth])

  const handlePointer = useCallback((clientX: number) => {
    const renderer = rendererRef.current
    if (!renderer) return
    thumbRef.current = renderer.pointerToThumb(clientX)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onPointerDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId)
      handlePointer(event.clientX)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (event.buttons === 0 && event.pointerType === 'mouse') return
      handlePointer(event.clientX)
    }

    // Passive listeners would let the WebView treat the drag as a scroll.
    canvas.addEventListener('pointerdown', onPointerDown, { passive: false })
    canvas.addEventListener('pointermove', onPointerMove, { passive: false })

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
    }
  }, [handlePointer])

  return {
    canvasRef,
    phase,
    countdown,
    pauses,
    pauseAllowance: PAUSE_ALLOWANCE,
    start,
    resume,
  }
}
