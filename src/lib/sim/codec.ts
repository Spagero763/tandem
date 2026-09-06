import { INPUT_QUANTIZATION, RUN_TICKS } from './constants'

/**
 * Transport format for a recorded run.
 *
 * The contract that makes replays exact: the client quantizes each input
 * *before* feeding it to the simulation, so the number it played with is the
 * number it transmits. Quantizing on the way out instead would let the client
 * and the server step the simulation with slightly different values, and a
 * near-miss would resolve differently on each side.
 */
export function quantizeInput(x: number): number {
  if (!Number.isFinite(x)) return 0.5
  const clamped = x < 0 ? 0 : x > 1 ? 1 : x
  return Math.round(clamped * INPUT_QUANTIZATION) / INPUT_QUANTIZATION
}

export function encodeInputs(inputs: number[] | Float64Array): string {
  const buffer = new Uint16Array(inputs.length)
  for (let i = 0; i < inputs.length; i++) {
    const value = inputs[i]
    const clamped = !Number.isFinite(value) ? 0.5 : value < 0 ? 0 : value > 1 ? 1 : value
    buffer[i] = Math.round(clamped * INPUT_QUANTIZATION)
  }

  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  return bytesToBase64(bytes)
}

export function decodeInputs(encoded: string): Float64Array | null {
  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(encoded)
  } catch {
    return null
  }

  if (bytes.length % 2 !== 0) return null

  const count = bytes.length / 2
  // A run can never be longer than the heat itself. Rejecting here keeps a
  // malicious payload from making the server replay an unbounded input.
  if (count === 0 || count > RUN_TICKS) return null

  const out = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    const raw = bytes[i * 2] | (bytes[i * 2 + 1] << 8)
    if (raw > INPUT_QUANTIZATION) return null
    out[i] = raw / INPUT_QUANTIZATION
  }

  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')

  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function base64ToBytes(encoded: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('invalid base64')

  if (typeof Buffer !== 'undefined') {
    const buffer = Buffer.from(encoded, 'base64')
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  }

  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
