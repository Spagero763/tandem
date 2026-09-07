'use client'

import { decodeFunctionResult, encodeFunctionData, erc20Abi, formatUnits, parseUnits } from 'viem'

/**
 * The EVM half of the wallet.
 *
 * Nimiq Pay injects a standard EIP-1193 provider, so this is ordinary Ethereum
 * work: switch chain, read a balance, send a transfer. The only Nimiq-specific
 * part is that the provider arrives on `window.ethereum` rather than from a
 * connector, and that every write is gated behind a native approval dialog.
 */

export const POLYGON = {
  chainId: '0x89',
  name: 'Polygon',
  nativeSymbol: 'POL',
} as const

/**
 * USDT on Polygon. A different chain means a different contract, so this is
 * deliberately paired with the chain id rather than kept as a loose constant.
 */
export const USDT_POLYGON = {
  address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  decimals: 6,
  symbol: 'USDT',
} as const

export type EvmFailure = 'unavailable' | 'rejected' | 'wrong-chain' | 'insufficient' | 'failed'

export class EvmError extends Error {
  readonly kind: EvmFailure

  constructor(kind: EvmFailure, message: string) {
    super(message)
    this.name = 'EvmError'
    this.kind = kind
  }
}

interface RpcError {
  code?: number
  message?: string
  data?: unknown
}

function asRpcError(value: unknown): RpcError {
  return typeof value === 'object' && value !== null ? (value as RpcError) : {}
}

/**
 * EIP-1193 defines 4001 for a user rejection and 4902 for an unconfigured
 * chain. Anything else is reported as-is rather than guessed at.
 */
function classify(cause: unknown): EvmError {
  const { code, message = '' } = asRpcError(cause)

  if (code === 4001) return new EvmError('rejected', 'You cancelled that in your wallet.')
  if (code === 4902) return new EvmError('wrong-chain', 'Polygon is not set up in this wallet yet.')
  if (/insufficient funds/i.test(message)) {
    return new EvmError(
      'insufficient',
      'Not enough POL to cover the network fee on Polygon.',
    )
  }
  if (/user (rejected|denied)/i.test(message)) {
    return new EvmError('rejected', 'You cancelled that in your wallet.')
  }

  return new EvmError('failed', message || 'The transaction could not be completed.')
}

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

function provider(): Eip1193Provider {
  const injected = (globalThis as { ethereum?: Eip1193Provider }).ethereum
  if (!injected) {
    throw new EvmError('unavailable', 'Open this in Nimiq Pay to pay with USDT.')
  }
  return injected
}

async function request<T>(method: string, params?: unknown[]): Promise<T> {
  try {
    return (await provider().request({ method, params })) as T
  } catch (cause) {
    if (cause instanceof EvmError) throw cause
    throw classify(cause)
  }
}

export function hasEvmProvider(): boolean {
  return typeof globalThis !== 'undefined' && 'ethereum' in globalThis
}

export async function connect(): Promise<string> {
  const accounts = await request<string[]>('eth_requestAccounts')
  if (!accounts?.length) throw new EvmError('failed', 'No Ethereum address is available.')
  return accounts[0]
}

/**
 * Switching is required before any token call: the same contract address on the
 * wrong chain is either a different token or nothing at all.
 */
export async function switchToPolygon(): Promise<void> {
  try {
    await request('wallet_switchEthereumChain', [{ chainId: POLYGON.chainId }])
  } catch (cause) {
    // 4902 means the wallet does not know the chain yet. Adding it is the
    // documented recovery, so try that once before giving up.
    if (cause instanceof EvmError && cause.kind === 'wrong-chain') {
      await request('wallet_addEthereumChain', [
        {
          chainId: POLYGON.chainId,
          chainName: POLYGON.name,
          nativeCurrency: { name: 'POL', symbol: POLYGON.nativeSymbol, decimals: 18 },
          rpcUrls: ['https://polygon-rpc.com'],
          blockExplorerUrls: ['https://polygonscan.com'],
        },
      ])
      return
    }
    throw cause
  }
}

export async function currentChainId(): Promise<string> {
  return request<string>('eth_chainId')
}

export async function usdtBalance(owner: string): Promise<bigint> {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner as `0x${string}`],
  })

  const raw = await request<`0x${string}`>('eth_call', [
    { to: USDT_POLYGON.address, data },
    'latest',
  ])

  return decodeFunctionResult({
    abi: erc20Abi,
    functionName: 'balanceOf',
    data: raw,
  })
}

export async function sendUsdt(to: string, amount: string): Promise<string> {
  const from = await connect()
  await switchToPolygon()

  const value = parseUnits(amount, USDT_POLYGON.decimals)

  const balance = await usdtBalance(from)
  if (balance < value) {
    throw new EvmError(
      'insufficient',
      `You have ${formatUsdt(balance)} USDT on Polygon, which is less than ${amount}.`,
    )
  }

  /*
   * The recipient and amount live in the encoded call data; `to` is the token
   * contract and `value` is zero. Getting this backwards sends native POL to a
   * contract instead of moving tokens.
   */
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to as `0x${string}`, value],
  })

  return request<string>('eth_sendTransaction', [
    { from, to: USDT_POLYGON.address, data, value: '0x0' },
  ])
}

export function formatUsdt(raw: bigint, maximumFractionDigits = 2): string {
  return Number(formatUnits(raw, USDT_POLYGON.decimals)).toLocaleString(undefined, {
    maximumFractionDigits,
  })
}

export function describeEvmError(error: unknown): string {
  if (error instanceof EvmError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong on Polygon. Try again.'
}
