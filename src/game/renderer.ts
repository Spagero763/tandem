import {
  GRAZE_RADIUS,
  MOTE_RADIUS,
  ORB_RADIUS,
  ORB_Y,
  SHARD_RADIUS,
  TICK_SECONDS,
} from '@/lib/sim/constants'
import { ENTITY_MOTE } from '@/lib/sim/course'
import { STATE_ALIVE, type SimEvent, type SimState } from '@/lib/sim/simulate'

const COLOR = {
  left: '#ffb443',
  right: '#3fe0cf',
  shard: '#ff4d6d',
  ghost: '#a88bff',
  mote: '#fff4dd',
} as const

/** Entities start fading here so they leave the lane rather than blink out. */
const EXIT_FADE_FROM = 0.9

const TRAIL_LENGTH = 14

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

interface Shockwave {
  x: number
  y: number
  life: number
  color: string
}

/**
 * Pre-renders a radial glow to an offscreen canvas.
 *
 * Canvas `shadowBlur` is recomputed per draw and collapses frame rate on the
 * mid-range Android hardware this has to hold 60fps on. Blitting a sprite that
 * was rasterised once costs a single textured quad instead.
 */
function makeGlowSprite(color: string, size: number, intensity: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const diameter = Math.max(4, Math.ceil(size * 2))
  canvas.width = diameter
  canvas.height = diameter

  const context = canvas.getContext('2d')
  if (!context) return canvas

  const gradient = context.createRadialGradient(size, size, 0, size, size, size)
  gradient.addColorStop(0, withAlpha(color, intensity))
  gradient.addColorStop(0.35, withAlpha(color, intensity * 0.45))
  gradient.addColorStop(1, withAlpha(color, 0))

  context.fillStyle = gradient
  context.fillRect(0, 0, diameter, diameter)
  return canvas
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`
}

interface Layout {
  width: number
  height: number
  laneWidth: number
  laneHeight: number
  laneTop: number
  laneX: [number, number]
  unit: number
}

export class ArenaRenderer {
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private dpr = 1
  private layout: Layout | null = null

  private glow = new Map<string, HTMLCanvasElement>()

  private trails: [number, number][][] = [[], []]
  private ghostTrails: [number, number][][] = [[], []]

  private particles: Particle[] = []
  private shockwaves: Shockwave[] = []

  private shake = 0
  private flash = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('canvas 2d context unavailable')
    this.context = context
  }

  resize(cssWidth: number, cssHeight: number) {
    // Cap the pixel ratio: a 3x buffer on a large phone costs more fill rate
    // than the extra sharpness is worth, and dropped frames are felt.
    this.dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2.5)

    this.canvas.width = Math.round(cssWidth * this.dpr)
    this.canvas.height = Math.round(cssHeight * this.dpr)
    this.canvas.style.width = `${cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`

    const gutter = Math.max(10, cssWidth * 0.035)
    const sidePadding = Math.max(12, cssWidth * 0.045)
    const laneWidth = (cssWidth - sidePadding * 2 - gutter) / 2

    const laneTop = Math.max(8, cssHeight * 0.02)
    const laneHeight = cssHeight - laneTop * 2

    this.layout = {
      width: cssWidth,
      height: cssHeight,
      laneWidth,
      laneHeight,
      laneTop,
      laneX: [sidePadding, sidePadding + laneWidth + gutter],
      unit: laneWidth,
    }

    this.glow.clear()
  }

  private sprite(key: string, color: string, size: number, intensity: number): HTMLCanvasElement {
    const cacheKey = `${key}:${Math.round(size)}`
    let sprite = this.glow.get(cacheKey)
    if (!sprite) {
      sprite = makeGlowSprite(color, size, intensity)
      this.glow.set(cacheKey, sprite)
    }
    return sprite
  }

  /** Turns simulation events into things the player can feel. */
  absorb(events: SimEvent[], state: SimState) {
    const layout = this.layout
    if (!layout) return

    for (const event of events) {
      if (event.type === 'end') continue

      const x = this.laneToPixelX(event.lane, event.x)
      const y = layout.laneTop + ORB_Y * layout.laneHeight

      if (event.type === 'collect') {
        this.shockwaves.push({ x, y, life: 1, color: event.lane === 0 ? COLOR.left : COLOR.right })
        this.spawnBurst(x, y, COLOR.mote, 8, 1.6)
      } else if (event.type === 'hit') {
        this.shake = 1
        this.flash = 1
        this.shockwaves.push({ x, y, life: 1, color: COLOR.shard })
        this.spawnBurst(x, y, COLOR.shard, 22, 3.4)
      } else if (event.type === 'graze') {
        this.spawnBurst(x, y, COLOR.ghost, 5, 1.1)
      }
    }

    void state
  }

  private spawnBurst(x: number, y: number, color: string, count: number, speed: number) {
    // Presentation only: particles never feed back into the simulation, so the
    // renderer is free to be random where the game must not be.
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
      const velocity = speed * (0.5 + Math.random())
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 0.6,
        life: 1,
        maxLife: 1,
        color,
        size: 1.6 + Math.random() * 2.4,
      })
    }

    if (this.particles.length > 260) this.particles.splice(0, this.particles.length - 260)
  }

  private laneToPixelX(lane: 0 | 1, x: number): number {
    const layout = this.layout
    if (!layout) return 0
    return layout.laneX[lane] + x * layout.laneWidth
  }

  render(state: SimState, alpha: number, prevThumb: number, ghost: SimState | null, time: number) {
    const layout = this.layout
    if (!layout) return

    const context = this.context
    context.save()
    context.scale(this.dpr, this.dpr)

    context.fillStyle = '#05060a'
    context.fillRect(0, 0, layout.width, layout.height)

    if (this.shake > 0) {
      const magnitude = this.shake * 7
      context.translate(
        (Math.random() - 0.5) * magnitude,
        (Math.random() - 0.5) * magnitude,
      )
      this.shake = Math.max(0, this.shake - 0.06)
    }

    const thumb = prevThumb + (state.thumbX - prevThumb) * alpha

    this.drawLanes(layout, time)

    if (ghost) this.drawGhost(layout, ghost, alpha)

    this.drawEntities(layout, state, alpha, thumb, time)
    this.drawOrbs(layout, thumb, state)
    this.drawParticles(context)

    if (this.flash > 0) {
      context.fillStyle = withAlpha(COLOR.shard, this.flash * 0.16)
      context.fillRect(-20, -20, layout.width + 40, layout.height + 40)
      this.flash = Math.max(0, this.flash - 0.08)
    }

    context.restore()
  }

  private drawLanes(layout: Layout, time: number) {
    const context = this.context
    const radius = Math.min(22, layout.laneWidth * 0.12)

    for (let lane = 0; lane < 2; lane++) {
      const x = layout.laneX[lane]

      const gradient = context.createLinearGradient(0, layout.laneTop, 0, layout.laneTop + layout.laneHeight)
      gradient.addColorStop(0, 'rgba(255,255,255,0.045)')
      gradient.addColorStop(0.55, 'rgba(255,255,255,0.015)')
      gradient.addColorStop(1, 'rgba(255,255,255,0.05)')

      context.fillStyle = gradient
      this.roundRect(x, layout.laneTop, layout.laneWidth, layout.laneHeight, radius)
      context.fill()

      context.strokeStyle = 'rgba(255,255,255,0.07)'
      context.lineWidth = 1
      this.roundRect(x, layout.laneTop, layout.laneWidth, layout.laneHeight, radius)
      context.stroke()
    }

    // The orb line: the only horizontal in the composition, so it reads as the
    // moment everything resolves.
    const lineY = layout.laneTop + ORB_Y * layout.laneHeight
    const pulse = 0.06 + 0.03 * Math.sin(time * 0.0022)

    for (let lane = 0; lane < 2; lane++) {
      const x = layout.laneX[lane]
      const gradient = context.createLinearGradient(x, 0, x + layout.laneWidth, 0)
      const color = lane === 0 ? COLOR.left : COLOR.right
      gradient.addColorStop(0, withAlpha(color, 0))
      gradient.addColorStop(0.5, withAlpha(color, pulse + 0.16))
      gradient.addColorStop(1, withAlpha(color, 0))

      context.fillStyle = gradient
      context.fillRect(x, lineY - 0.75, layout.laneWidth, 1.5)
    }
  }

  private drawEntities(
    layout: Layout,
    state: SimState,
    alpha: number,
    thumb: number,
    time: number,
  ) {
    const context = this.context

    for (let i = 0; i < state.cursor; i++) {
      const entity = state.entities[i]
      if (entity.state !== STATE_ALIVE) continue

      // Entities fall at a constant rate, so the previous position is exact
      // rather than stored: interpolation costs nothing.
      const y = entity.y - entity.speed * TICK_SECONDS * (1 - alpha)

      /*
       * Stop at the foot of the lane rather than a fifth of a screen below it.
       * The lane is a rounded panel with the page behind it, so anything drawn
       * past y = 1 reads as an object that has escaped the board. The last
       * stretch fades so it leaves rather than blinks out.
       */
      if (y < -0.2 || y > 1) continue

      const px = this.laneToPixelX(entity.lane, entity.x)
      const py = layout.laneTop + y * layout.laneHeight

      const exiting = y > EXIT_FADE_FROM
      if (exiting) {
        context.globalAlpha = Math.max(0, (1 - y) / (1 - EXIT_FADE_FROM))
      }

      if (entity.type === ENTITY_MOTE) {
        const radius = MOTE_RADIUS * layout.unit
        const sprite = this.sprite('mote', COLOR.mote, radius * 3.4, 0.5)
        context.drawImage(sprite, px - sprite.width / 2, py - sprite.height / 2)

        context.fillStyle = COLOR.mote
        context.beginPath()
        context.arc(px, py, radius * 0.55, 0, Math.PI * 2)
        context.fill()
      } else {
        const radius = SHARD_RADIUS * layout.unit
        const orbX = entity.lane === 0 ? thumb : 1 - thumb
        const proximity = Math.abs(orbX - entity.x)

        // A shard the thumb is lined up with lights up, so the player reads the
        // threat before it arrives rather than after it lands.
        const danger = Math.max(0, 1 - proximity / GRAZE_RADIUS)
        const sprite = this.sprite('shard', COLOR.shard, radius * 3.2, 0.28 + danger * 0.4)
        context.drawImage(sprite, px - sprite.width / 2, py - sprite.height / 2)

        context.save()
        context.translate(px, py)
        context.rotate(time * 0.0009 + entity.x * 4)

        context.fillStyle = withAlpha(COLOR.shard, 0.22 + danger * 0.3)
        context.strokeStyle = withAlpha('#ffffff', 0.55 + danger * 0.45)
        context.lineWidth = 1.5

        const size = radius * 0.82
        context.beginPath()
        context.moveTo(0, -size)
        context.lineTo(size, 0)
        context.lineTo(0, size)
        context.lineTo(-size, 0)
        context.closePath()
        context.fill()
        context.stroke()
        context.restore()
      }

      if (exiting) context.globalAlpha = 1
    }
  }

  private drawGhost(layout: Layout, ghost: SimState, alpha: number) {
    if (ghost.ended) return
    const context = this.context
    const thumb = ghost.thumbX

    for (let lane = 0; lane < 2; lane++) {
      const x = lane === 0 ? thumb : 1 - thumb
      const px = this.laneToPixelX(lane as 0 | 1, x)
      const py = layout.laneTop + ORB_Y * layout.laneHeight

      const trail = this.ghostTrails[lane]
      trail.push([px, py])
      if (trail.length > TRAIL_LENGTH) trail.shift()

      context.strokeStyle = withAlpha(COLOR.ghost, 0.2)
      context.lineWidth = ORB_RADIUS * layout.unit * 0.7
      context.lineCap = 'round'
      context.beginPath()
      for (let i = 0; i < trail.length; i++) {
        if (i === 0) context.moveTo(trail[i][0], trail[i][1])
        else context.lineTo(trail[i][0], trail[i][1])
      }
      context.stroke()

      const radius = ORB_RADIUS * layout.unit
      const sprite = this.sprite('ghost', COLOR.ghost, radius * 2.6, 0.3)
      context.drawImage(sprite, px - sprite.width / 2, py - sprite.height / 2)

      context.strokeStyle = withAlpha(COLOR.ghost, 0.75)
      context.lineWidth = 1.5
      context.beginPath()
      context.arc(px, py, radius * 0.78, 0, Math.PI * 2)
      context.stroke()
    }

    void alpha
  }

  private drawOrbs(layout: Layout, thumb: number, state: SimState) {
    const context = this.context
    const radius = ORB_RADIUS * layout.unit
    const py = layout.laneTop + ORB_Y * layout.laneHeight

    for (let lane = 0; lane < 2; lane++) {
      const color = lane === 0 ? COLOR.left : COLOR.right
      const x = lane === 0 ? thumb : 1 - thumb
      const px = this.laneToPixelX(lane as 0 | 1, x)

      const trail = this.trails[lane]
      trail.push([px, py])
      if (trail.length > TRAIL_LENGTH) trail.shift()

      // The trail is what makes a mirrored pair read as one gesture.
      for (let i = 1; i < trail.length; i++) {
        const t = i / trail.length
        context.strokeStyle = withAlpha(color, t * 0.3)
        context.lineWidth = radius * 1.5 * t
        context.lineCap = 'round'
        context.beginPath()
        context.moveTo(trail[i - 1][0], trail[i - 1][1])
        context.lineTo(trail[i][0], trail[i][1])
        context.stroke()
      }

      const combo = Math.min(1, state.combo / 40)
      const sprite = this.sprite(`orb${lane}`, color, radius * 4, 0.4 + combo * 0.35)
      context.drawImage(sprite, px - sprite.width / 2, py - sprite.height / 2)

      context.fillStyle = color
      context.beginPath()
      context.arc(px, py, radius * 0.62, 0, Math.PI * 2)
      context.fill()

      context.fillStyle = 'rgba(255,255,255,0.9)'
      context.beginPath()
      context.arc(px, py, radius * 0.26, 0, Math.PI * 2)
      context.fill()
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const wave = this.shockwaves[i]
      wave.life -= 0.045
      if (wave.life <= 0) {
        this.shockwaves.splice(i, 1)
        continue
      }
      context.strokeStyle = withAlpha(wave.color, wave.life * 0.5)
      context.lineWidth = 2 * wave.life
      context.beginPath()
      context.arc(wave.x, wave.y, radius * (1 + (1 - wave.life) * 2.6), 0, Math.PI * 2)
      context.stroke()
    }
  }

  private drawParticles(context: CanvasRenderingContext2D) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i]
      particle.life -= 0.024
      if (particle.life <= 0) {
        this.particles.splice(i, 1)
        continue
      }

      particle.x += particle.vx
      particle.y += particle.vy
      particle.vy += 0.16
      particle.vx *= 0.98

      context.fillStyle = withAlpha(particle.color, particle.life * 0.85)
      context.beginPath()
      context.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2)
      context.fill()
    }
  }

  private roundRect(x: number, y: number, width: number, height: number, radius: number) {
    const context = this.context
    context.beginPath()
    context.moveTo(x + radius, y)
    context.arcTo(x + width, y, x + width, y + height, radius)
    context.arcTo(x + width, y + height, x, y + height, radius)
    context.arcTo(x, y + height, x, y, radius)
    context.arcTo(x, y, x + width, y, radius)
    context.closePath()
  }

  /** Maps a pointer position anywhere on screen to a thumb value in [0,1]. */
  pointerToThumb(clientX: number): number {
    const layout = this.layout
    if (!layout) return 0.5

    /*
     * clientX is viewport-relative but the layout is canvas-relative, so the
     * canvas offset has to come out first. They happen to be equal while the
     * arena is the full-bleed top-level view, which is exactly why getting
     * this wrong would survive until the first screen that isn't.
     */
    const canvasLeft = this.canvas.getBoundingClientRect?.().left ?? 0
    const x = clientX - canvasLeft

    // The whole width drives the thumb, not just the left lane. The player
    // should be able to hold the phone naturally and drag anywhere.
    const usable = layout.width - layout.laneX[0] * 2
    const value = (x - layout.laneX[0]) / usable
    return value < 0 ? 0 : value > 1 ? 1 : value
  }

  reset() {
    this.trails = [[], []]
    this.ghostTrails = [[], []]
    this.particles = []
    this.shockwaves = []
    this.shake = 0
    this.flash = 0
  }
}
