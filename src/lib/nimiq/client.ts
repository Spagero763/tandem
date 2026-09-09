'use client'

import {
  getHostLanguage,
  init,
  requestDeviceIdentifier,
  type NimiqProvider,
  type SignatureResult,
} from '@nimiq/mini-app-sdk'

/**
 * The provider resolves wallet failures as *return values* rather than
 * rejections, so every call site would have to remember to narrow the result.
 * Forgetting once means a cancelled payment reads as a successful one. This
 * module makes the whole surface throw, and throw something classified.
 */
export type NimiqFailure = 'unavailable' | 'rejected' | 'timeout' | 'failed'

export class NimiqError extends Error {
  readonly kind: NimiqFailure

  constructor(kind: NimiqFailure, message: string) {
    super(message)
    this.name = 'NimiqError'
    this.kind = kind
  }
}

interface ErrorShape {
  error: { type: string; message: string }
}

function isErrorResponse(value: unknown): value is ErrorShape {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ErrorShape).error === 'object'
  )
}

const REJECTION_HINTS = ['denied', 'reject', 'cancel', 'abort', 'permission']

function classify(type: string, message: string): NimiqFailure {
  const haystack = `${type} ${message}`.toLowerCase()
  if (REJECTION_HINTS.some((hint) => haystack.includes(hint))) return 'rejected'
  return 'failed'
}

function unwrap<T>(result: T | ErrorShape): T {
  if (isErrorResponse(result)) {
    const { type, message } = result.error
    throw new NimiqError(classify(type, message), message || 'The wallet could not complete that.')
  }
  return result
}

/** True once we know the page is not running inside Nimiq Pay. */
export function isInsideNimiqPay(): boolean {
  return typeof window !== 'undefined' && window.nimiqPay !== undefined
}

let providerPromise: Promise<NimiqProvider> | null = null

/**
 * Resolves the injected provider, memoized so that several components mounting
 * at once share a single handshake rather than racing.
 */
export function getProvider(timeout = 8000): Promise<NimiqProvider> {
  if (typeof window === 'undefined') {
    return Promise.reject(new NimiqError('unavailable', 'The wallet is only available in the app.'))
  }

  if (!providerPromise) {
    providerPromise = init({ timeout }).catch((cause: unknown) => {
      // Let a later attempt retry instead of caching the failure forever.
      providerPromise = null
      throw new NimiqError(
        'unavailable',
        cause instanceof Error && /timeout/i.test(cause.message)
          ? 'Nimiq Pay did not respond.'
          : 'Open this in Nimiq Pay to connect your wallet.',
      )
    })
  }

  return providerPromise
}

export async function listAccounts(): Promise<string[]> {
  const provider = await getProvider()
  const accounts = unwrap(await provider.listAccounts())
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new NimiqError('failed', 'No Nimiq address is available in this wallet.')
  }
  return accounts
}

export async function signMessage(message: string): Promise<SignatureResult> {
  const provider = await getProvider()
  return unwrap(await provider.sign(message))
}

export async function getBlockNumber(): Promise<number> {
  const provider = await getProvider()
  return provider.getBlockNumber()
}

export async function isConsensusEstablished(): Promise<boolean> {
  const provider = await getProvider()
  return provider.isConsensusEstablished()
}

/** 1 NIM = 100,000 Luna. Values crossing the provider are always Luna. */
export const LUNA_PER_NIM = 100_000

export function nimToLuna(nim: number): number {
  return Math.round(nim * LUNA_PER_NIM)
}

export function lunaToNim(luna: number): number {
  return luna / LUNA_PER_NIM
}

export function formatNim(luna: number, maximumFractionDigits = 2): string {
  return lunaToNim(luna).toLocaleString(undefined, { maximumFractionDigits })
}

export async function sendNim(recipient: string, luna: number, message?: string): Promise<string> {
  const provider = await getProvider()

  const result = message
    ? await provider.sendBasicTransactionWithData({ recipient, value: luna, data: message })
    : await provider.sendBasicTransaction({ recipient, value: luna })

  return unwrap(result)
}

export async function stakeNim(luna: number, validator: string): Promise<string> {
  const provider = await getProvider()
  return unwrap(await provider.sendNewStakerTransaction({ delegation: validator, value: luna }))
}

export async function addStake(luna: number): Promise<string> {
  const provider = await getProvider()
  return unwrap(await provider.sendStakeTransaction({ value: luna }))
}

/**
 * The device identifier is per-device, never per-user, so it is used only for
 * rate limiting and save slots, never as an identity. Identity comes from a
 * signature over an address.
 */
export async function getDeviceIdentifier(reason: string): Promise<string | null> {
  try {
    return await requestDeviceIdentifier({ reason })
  } catch {
    return null
  }
}

export function hostLanguage(): string | undefined {
  try {
    return getHostLanguage()
  } catch {
    return undefined
  }
}

/** A message safe to put in front of a player, for any failure kind. */
export function describeError(error: unknown): string {
  if (error instanceof NimiqError) {
    switch (error.kind) {
      case 'rejected':
        return 'You cancelled that in your wallet.'
      case 'unavailable':
        return error.message
      case 'timeout':
        return 'Nimiq Pay took too long to respond. Try again.'
      default:
        return error.message
    }
  }
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong. Try again.'
}
