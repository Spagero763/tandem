'use client'

/**
 * The backing track: drums, bass, chords and a lead, all synthesised.
 *
 * Scheduling is the whole problem here. `setTimeout` drifts by tens of
 * milliseconds, which a listener hears immediately as a beat that will not sit
 * still, so nothing is played on the timer. The timer only wakes up often
 * enough to queue the next slice of notes onto the audio clock, which is
 * sample accurate. The timer decides *what* to schedule; the audio clock
 * decides *when* it sounds.
 *
 * Everything is in D minor, including the pickup sounds in `audio.ts`. That
 * is not decoration: the two are heard at the same time, constantly, and a
 * pickup landing a semitone off the chord under it sounds like a mistake
 * rather than a reward.
 */

export const BPM = 144
export const BARS_IN_LOOP = 4
export const STEPS_PER_BAR = 16
export const SECONDS_PER_STEP = 60 / BPM / 4

/** How far ahead notes are queued, and how often we wake to queue them. */
const LOOKAHEAD_SECONDS = 0.18
const TICK_MS = 25

/** Steps within a bar. Sixteenths, so 0, 4, 8, 12 are the four beats. */
const KICK = new Set([0, 3, 6, 10, 11])
const SNARE = new Set([4, 12])
const OPEN_HAT = new Set([7, 14])

/** D1. Low enough to feel like an 808 rather than a bass guitar. */
const ROOT_HZ = 36.71

function hz(semitonesAboveRoot: number): number {
  return ROOT_HZ * Math.pow(2, semitonesAboveRoot / 12)
}

/**
 * Dm, F, Csus2, Gsus4. Four bars that lead back into themselves, so the loop
 * can run a whole heat without announcing where it restarts.
 *
 * The suspended voicings are not a stylistic flourish. D minor pentatonic
 * leaves out E and B flat, which are exactly the notes that build C and B flat
 * triads, so a pickup would sit a semitone from the chord under it every time
 * one of those came round. Dropping the third from the last two chords keeps
 * every note in the same five, and leaves the harmony open rather than plain.
 */
export const PROGRESSION = [
  { root: 0, triad: [0, 3, 7] }, // Dm    D F A
  { root: 3, triad: [0, 4, 7] }, // F     F A C
  { root: -2, triad: [0, 7, 14] }, // Csus2 C G D
  { root: 5, triad: [0, 5, 7] }, // Gsus4 G C D
]

/**
 * The lead, as indices into the bar's chord plus its octave, with -1 for a
 * rest. Sparse on purpose: the hats already carry the speed, so a busy lead
 * fights them instead of adding anything.
 */
const LEAD = [0, -1, 2, -1, 1, -1, 3, -1, 2, -1, 1, -1, 3, -1, 2, 1]

export class BeatMachine {
  private context: AudioContext
  private out: GainNode

  /**
   * Everything melodic runs through here, and the kick pulls it down on every
   * hit. This is the whole reason a trap mix sounds solid rather than busy:
   * the low end gets the beat to itself for a moment, then the chords swell
   * back into the gap. Without it the pad and the 808 fight for the same
   * space and the result is loud but mushy.
   */
  private duck: GainNode
  private timer: number | null = null

  private nextNoteTime = 0
  private step = 0
  private bar = 0

  /**
   * Rises with the run. Controls hat density, 808 weight and whether the lead
   * is playing at all, so a long clean streak sounds like one rather than
   * merely scoring like one.
   */
  private intensity = 0

  constructor(context: AudioContext, destination: GainNode) {
    this.context = context

    this.out = context.createGain()
    this.out.gain.value = 0
    this.out.connect(destination)

    this.duck = context.createGain()
    this.duck.gain.value = 1
    this.duck.connect(this.out)
  }

  /** Pull the melodic bus down, then let it breathe back in. */
  private pump(at: number): void {
    const gain = this.duck.gain
    gain.cancelScheduledValues(at)
    gain.setValueAtTime(0.32, at)
    gain.linearRampToValueAtTime(1, at + 0.19)
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
        this.bar = (this.bar + 1) % PROGRESSION.length
      }
    }
  }

  private playStep(step: number, at: number): void {
    const chord = PROGRESSION[this.bar]

    if (KICK.has(step)) {
      this.kick(at)
      this.pump(at)
    }
    if (SNARE.has(step)) this.snare(at)

    // Hats carry the speed. Rolls appear as the run heats up, which is what
    // makes it feel fast rather than merely quick.
    const onBeat = step % 4 === 0
    this.hat(
      at,
      OPEN_HAT.has(step) ? 0.09 : onBeat ? 0.07 : 0.042,
      OPEN_HAT.has(step) ? 0.055 : 0.02,
    )

    if (this.intensity > 0.35 && (step === 7 || step === 15)) {
      const divisions = this.intensity > 0.7 ? 3 : 2
      for (let i = 1; i < divisions; i++) {
        this.hat(at + (SECONDS_PER_STEP * i) / divisions, 0.045, 0.018)
      }
    }

    // The chord arrives once, on the downbeat, and holds under everything.
    if (step === 0) {
      this.pad(at, chord.triad.map((interval) => hz(chord.root + interval + 24)))
    }

    // The 808 follows the kick so the low end stays one voice rather than two
    // fighting for the same space.
    if (KICK.has(step)) {
      this.eight0eight(at, hz(chord.root), 0.42 + this.intensity * 0.2)
    }

    /*
     * The lead only shows up once there is a run worth scoring it. Coming in
     * on the bar rather than the instant the combo crosses keeps it musical
     * instead of making it stutter in and out mid phrase.
     */
    if (this.intensity > 0.22) {
      const degree = LEAD[step]
      if (degree >= 0) {
        const interval = degree < 3 ? chord.triad[degree] : 12
        this.pluck(at, hz(chord.root + interval + 36), 0.075 + this.intensity * 0.05)
      }
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
    const source = this.context.createBufferSource()
    source.buffer = this.noiseBuffer(duration, 1.6)

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
    const source = this.context.createBufferSource()
    source.buffer = this.noiseBuffer(duration, 1)

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
    // The short upward pitch blip at the front is what reads as an 808 rather
    // than a sine tone.
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

  /** The held chord. Slow attack so it sits behind the drums, never on them. */
  private pad(at: number, frequencies: number[]): void {
    const duration = SECONDS_PER_STEP * STEPS_PER_BAR

    const filter = this.context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1400

    const envelope = this.context.createGain()
    envelope.gain.setValueAtTime(0.0001, at)
    envelope.gain.exponentialRampToValueAtTime(0.075, at + 0.12)
    envelope.gain.setValueAtTime(0.075, at + duration * 0.6)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration)

    filter.connect(envelope)
    envelope.connect(this.duck)

    for (const frequency of frequencies) {
      const oscillator = this.context.createOscillator()
      oscillator.type = 'sawtooth'
      oscillator.frequency.setValueAtTime(frequency, at)

      // A couple of cents apart per voice, so the chord has width instead of
      // sounding like one oscillator playing three notes.
      oscillator.detune.setValueAtTime((Math.random() - 0.5) * 14, at)

      oscillator.connect(filter)
      oscillator.start(at)
      oscillator.stop(at + duration + 0.05)
    }
  }

  /** The lead. Short and bell-like, so it cuts without needing to be loud. */
  private pluck(at: number, frequency: number, gain: number): void {
    const duration = 0.28

    const oscillator = this.context.createOscillator()
    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(frequency, at)

    const filter = this.context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(4200, at)
    filter.frequency.exponentialRampToValueAtTime(900, at + duration)

    const envelope = this.context.createGain()
    envelope.gain.setValueAtTime(0.0001, at)
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.006)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration)

    oscillator.connect(filter)
    filter.connect(envelope)
    envelope.connect(this.duck)
    oscillator.start(at)
    oscillator.stop(at + duration + 0.02)
  }

  private noiseBuffer(duration: number, curve: number): AudioBuffer {
    const frames = Math.floor(this.context.sampleRate * duration)
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) {
      channel[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** curve
    }
    return buffer
  }

  dispose(): void {
    this.stop(0.05)
    this.out.disconnect()
  }
}
