'use client'

import type { SimEvent, SimState } from '@/lib/sim/simulate'

/**
 * The arena's sound, synthesised rather than sampled.
 *
 * Every voice here is an oscillator and an envelope, so the whole soundtrack
 * costs nothing to download. That is not only tidiness: this app has already
 * been beaten once by its own weight over wifi, and audio files are the
 * easiest way to undo that.
 *
 * Sound is presentation only. It reads the same events the renderer draws
 * from, never the simulation, so a muted run and a loud one score identically.
 */

const STORAGE_KEY = 'tandem:muted'

/** Pentatonic, so a fast combo run stays consonant however it lands. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]

function noteFrequency(step: number): number {
  const semitone = SCALE[Math.min(step, SCALE.length - 1)]
  return 293.66 * Math.pow(2, semitone / 12)
}

export class ArenaAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private muted = false

  /** Collected motes since the last miss, for the rising combo line. */
  private step = 0

  constructor() {
    if (typeof window === 'undefined') return
    try {
      this.muted = window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      // Private mode, or storage disabled. Default to audible.
    }
  }

  get isMuted(): boolean {
    return this.muted
  }

  /**
   * Must be called from inside a real user gesture.
   *
   * Mobile browsers create an AudioContext already suspended and refuse to
   * resume it outside a tap, so this hangs off the start button rather than
   * anything on mount.
   */
  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume()
      return
    }

    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return

      this.context = new Ctor()
      this.master = this.context.createGain()
      this.master.gain.value = this.muted ? 0 : 0.34
      this.master.connect(this.context.destination)

      if (this.context.state === 'suspended') void this.context.resume()
    } catch {
      // No audio available. Everything below becomes a no-op.
      this.context = null
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted

    if (this.master && this.context) {
      // Ramp rather than jump, so muting mid-run does not click.
      const now = this.context.currentTime
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.34, now, 0.02)
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0')
    } catch {
      // Not worth failing a mute over.
    }

    return this.muted
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    glideTo?: number,
  ): void {
    const context = this.context
    const master = this.master
    if (!context || !master || this.muted) return

    const now = context.currentTime
    const oscillator = context.createOscillator()
    const envelope = context.createGain()

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, now)
    if (glideTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), now + duration)
    }

    // A short attack and an exponential tail: percussive without clicking.
    envelope.gain.setValueAtTime(0.0001, now)
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.008)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    oscillator.connect(envelope)
    envelope.connect(master)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.02)
  }

  private noise(duration: number, gain: number, highpass: number): void {
    const context = this.context
    const master = this.master
    if (!context || !master || this.muted) return

    const now = context.currentTime
    const frames = Math.floor(context.sampleRate * duration)
    const buffer = context.createBuffer(1, frames, context.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) {
      channel[i] = (Math.random() * 2 - 1) * (1 - i / frames)
    }

    const source = context.createBufferSource()
    source.buffer = buffer

    const filter = context.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = highpass

    const envelope = context.createGain()
    envelope.gain.setValueAtTime(gain, now)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(master)
    source.start(now)
  }

  /** Reads the tick's events. Same input the renderer gets. */
  absorb(events: SimEvent[], state: SimState): void {
    if (!this.context || this.muted) return

    for (const event of events) {
      switch (event.type) {
        case 'collect':
          // Walk up the scale as the combo builds, so a clean streak is
          // audible before the player has time to read the counter.
          this.tone(noteFrequency(this.step), 0.13, 'triangle', 0.22)
          this.step = Math.min(this.step + 1, SCALE.length - 1)
          break

        case 'graze':
          this.noise(0.11, 0.05, 2600)
          break

        case 'hit':
          this.step = 0
          this.tone(150, 0.3, 'sawtooth', 0.3, 48)
          this.noise(0.18, 0.11, 320)
          break

        case 'end':
          this.step = 0
          if (state.survived) {
            // A small rising figure, played once, for finishing the heat.
            this.tone(392, 0.16, 'triangle', 0.24)
            window.setTimeout(() => this.tone(523.25, 0.16, 'triangle', 0.24), 120)
            window.setTimeout(() => this.tone(659.25, 0.42, 'triangle', 0.26), 240)
          } else {
            this.tone(220, 0.55, 'sine', 0.26, 70)
          }
          break
      }
    }
  }

  countdown(remaining: number): void {
    if (!this.context || this.muted) return
    if (remaining > 0) this.tone(440, 0.09, 'square', 0.12)
    else this.tone(660, 0.22, 'square', 0.18)
  }

  reset(): void {
    this.step = 0
  }

  close(): void {
    this.context?.close().catch(() => {})
    this.context = null
    this.master = null
  }
}
