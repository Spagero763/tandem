'use client'

/**
 * The backing beat: trap-shaped, synthesised, no samples.
 *
 * Scheduling is the whole problem here. `setTimeout` drifts by tens of
 * milliseconds, which a listener hears immediately as a beat that will not sit
 * still, so nothing is played on the timer. The timer only wakes up often
 * enough to queue the next slice of notes onto the audio clock, which is
 * sample accurate. The timer decides *what* to schedule; the audio clock
 * decides *when* it sounds.
 */

const BPM = 144
const STEPS_PER_BAR = 16
const SECONDS_PER_STEP = 60 / BPM / 4

/** How far ahead notes are queued, and how often we wake to queue them. */
const LOOKAHEAD_SECONDS = 0.18
const TICK_MS = 25

/** Steps within a bar. Sixteenths, so 0, 4, 8, 12 are the four beats. */
const KICK = new Set([0, 3, 6, 10, 11])
const SNARE = new Set([4, 12])
const OPEN_HAT = new Set([7, 14])

/** Two bars of root notes, natural minor, so it stays dark rather than jolly. */
const BASS_LINE = [
  [0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3, 3],
  [5, 5, 5, 5, 5, 5, 5, 5, 3, 3, 3, 3, 1, 1, 1, 1],
]

const MINOR = [0, 2, 3, 5, 7, 8, 10, 12]

/** D1, low enough to feel like an 808 rather than a bass guitar. */
function bassFrequency(degree: number): number {
  return 36.71 * Math.pow(2, MINOR[degree % MINOR.length] / 12)
}

export class BeatMachine {
  private context: AudioContext
  private out: GainNode
  private timer: number | null = null

  private nextNoteTime = 0
  private step = 0
  private bar = 0

  /**
   * Rises with the run. Controls hat density and how hard the 808 hits, so a
   * long clean streak sounds like one rather than merely scoring like one.
   */
  private intensity = 0

  constructor(context: AudioContext, destination: GainNode) {
    this.context = context

    this.out = context.createGain()
    this.out.gain.value = 0
    this.out.connect(destination)
  }

  get running(): boolean {
    return this.timer !== null
  }

  setIntensity(value: number): void {
    this.intensity = Math.max(0, Math.min(1, value))
  }

  start(): void {
    if (this.timer !== null) return

    this.step = 0
    this.bar = 0
    this.nextNoteTime = this.context.currentTime + 0.08

    // Fade in rather than punch in, so starting a heat does not thump.
    const now = this.context.currentTime
    this.out.gain.cancelScheduledValues(now)
    this.out.gain.setValueAtTime(0.0001, now)
    this.out.gain.exponentialRampToValueAtTime(0.5, now + 0.5)

    this.timer = window.setInterval(() => this.schedule(), TICK_MS)
  }

  stop(fade = 0.35): void {
    if (this.timer === null) return

    window.clearInterval(this.timer)
    this.timer = null

    const now = this.context.currentTime
    this.out.gain.cancelScheduledValues(now)
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), now)
    this.out.gain.exponentialRampToValueAtTime(0.0001, now + fade)
  }

  /** Queue every note that falls inside the lookahead window. */
  private schedule(): void {
    while (this.nextNoteTime < this.context.currentTime + LOOKAHEAD_SECONDS) {
      this.playStep(this.step, this.nextNoteTime)

      this.nextNoteTime += SECONDS_PER_STEP
      this.step += 1
      if (this.step >= STEPS_PER_BAR) {
        this.step = 0
        this.bar = (this.bar + 1) % BASS_LINE.length
      }
    }
  }

  private playStep(step: number, at: number): void {
    if (KICK.has(step)) this.kick(at)
    if (SNARE.has(step)) this.snare(at)

    // Hats carry the speed. Every sixteenth, with rolls appearing as the run
    // heats up, which is what makes it feel fast rather than merely quick.
    this.hat(at, OPEN_HAT.has(step) ? 0.09 : 0.055, OPEN_HAT.has(step) ? 0.055 : 0.02)

    const rolling = this.intensity > 0.35 && (step === 7 || step === 15)
    if (rolling) {
      const divisions = this.intensity > 0.7 ? 3 : 2
      for (let i = 1; i < divisions; i++) {
        this.hat(at + (SECONDS_PER_STEP * i) / divisions, 0.045, 0.018)
      }
    }

    // The 808 follows the kick so the low end stays one voice, not two
    // fighting each other for the same space.
    if (KICK.has(step)) {
      const degree = BASS_LINE[this.bar][step]
      this.eight0eight(at, bassFrequency(degree), 0.42 + this.intensity * 0.2)
    }
  }

  private kick(at: number): void {
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(160, at)
    oscillator.frequency.exponentialRampToValueAtTime(46, at + 0.09)

    envelope.gain.setValueAtTime(0.0001, at)
    envelope.gain.exponentialRampToValueAtTime(0.9, at + 0.004)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.22)

    oscillator.connect(envelope)
    envelope.connect(this.out)
    oscillator.start(at)
    oscillator.stop(at + 0.26)
  }

  private snare(at: number): void {
    const duration = 0.16
    const frames = Math.floor(this.context.sampleRate * duration)
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) {
      channel[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 1.6
    }

    const source = this.context.createBufferSource()
    source.buffer = buffer

    const filter = this.context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1900
    filter.Q.value = 0.8

    const envelope = this.context.createGain()
    envelope.gain.setValueAtTime(0.42, at)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration)

    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(this.out)
    source.start(at)

    // A little body under the noise, or it reads as a hiss instead of a hit.
    const body = this.context.createOscillator()
    const bodyEnvelope = this.context.createGain()
    body.type = 'triangle'
    body.frequency.setValueAtTime(210, at)
    bodyEnvelope.gain.setValueAtTime(0.22, at)
    bodyEnvelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.09)
    body.connect(bodyEnvelope)
    bodyEnvelope.connect(this.out)
    body.start(at)
    body.stop(at + 0.11)
  }

  private hat(at: number, gain: number, duration: number): void {
    const frames = Math.floor(this.context.sampleRate * duration)
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) {
      channel[i] = (Math.random() * 2 - 1) * (1 - i / frames)
    }

    const source = this.context.createBufferSource()
    source.buffer = buffer

    const filter = this.context.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 7800

    const envelope = this.context.createGain()
    envelope.gain.setValueAtTime(gain, at)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration)

    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(this.out)
    source.start(at)
  }

  private eight0eight(at: number, frequency: number, duration: number): void {
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()

    oscillator.type = 'sine'
    // The short upward pitch blip at the front is what reads as an 808
    // rather than a sine tone.
    oscillator.frequency.setValueAtTime(frequency * 1.5, at)
    oscillator.frequency.exponentialRampToValueAtTime(frequency, at + 0.05)

    envelope.gain.setValueAtTime(0.0001, at)
    envelope.gain.exponentialRampToValueAtTime(0.62, at + 0.012)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration)

    oscillator.connect(envelope)
    envelope.connect(this.out)
    oscillator.start(at)
    oscillator.stop(at + duration + 0.02)
  }

  dispose(): void {
    this.stop(0.05)
    this.out.disconnect()
  }
}
