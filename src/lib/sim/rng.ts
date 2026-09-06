/**
 * Deterministic integer PRNG (sfc32) seeded from a string.
 *
 * The simulation must produce byte-identical results in a phone WebView and in
 * a serverless Node function, so every operation here is exact 32-bit integer
 * arithmetic via Math.imul and the shift operators. No Math.random, no floats
 * in the state, and nothing whose precision the spec leaves to the engine.
 */
export class Rng {
  private a: number
  private b: number
  private c: number
  private d: number

  constructor(seed: string) {
    // FNV-1a over the seed, four times with different offset bases, so short
    // seeds still fill the whole state.
    const h = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0xdeadbeef]
    for (let i = 0; i < seed.length; i++) {
      const code = seed.charCodeAt(i)
      for (let k = 0; k < 4; k++) {
        h[k] ^= code + k
        h[k] = Math.imul(h[k], 0x01000193) >>> 0
      }
    }

    this.a = h[0] >>> 0
    this.b = h[1] >>> 0
    this.c = h[2] >>> 0
    this.d = h[3] >>> 0

    // Discard the first outputs so the seed's structure doesn't leak into them.
    for (let i = 0; i < 16; i++) this.nextUint32()
  }

  nextUint32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0
    this.d = (this.d + 1) >>> 0
    this.a = this.b ^ (this.b >>> 9)
    this.b = (this.c + (this.c << 3)) >>> 0
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0
    this.c = (this.c + t) >>> 0
    return t >>> 0
  }

  /** Float in [0, 1). Division by 2^32 is exact in IEEE 754. */
  nextFloat(): number {
    return this.nextUint32() / 4294967296
  }

  /** Integer in [min, max]. */
  nextInt(min: number, max: number): number {
    return min + (this.nextUint32() % (max - min + 1))
  }

  /** Float in [min, max). */
  nextRange(min: number, max: number): number {
    return min + this.nextFloat() * (max - min)
  }

  nextBool(): boolean {
    return (this.nextUint32() & 1) === 1
  }
}

/**
 * Rolling 32-bit state hash. The client reports its checksum alongside a run;
 * a mismatch against the server's replay means the two simulations diverged,
 * which is either a tampered client or a determinism bug worth knowing about.
 */
export function mixChecksum(checksum: number, value: number): number {
  let h = (checksum ^ (value | 0)) >>> 0
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}
