/**
 * The pot.
 *
 * Deliberate design constraint: playing is free and always will be. Nobody
 * pays to enter, paying nothing never costs you a place, and a contribution
 * buys no advantage of any kind: not a retry, not a head start, not a
 * multiplier. Backers fund a prize for the best players; they cannot win it.
 *
 * That separation is what keeps this a skill contest with a sponsored prize
 * rather than a wager, and it is why the course is identical for every player
 * and the outcome contains no chance element at all.
 */

/** Share of the pot paid to each of the top three finishers. */
export const PAYOUT_SPLIT = [0.6, 0.25, 0.15] as const

export function splitPot(totalLuna: number): number[] {
  const shares = PAYOUT_SPLIT.map((fraction) => Math.floor(totalLuna * fraction))

  // Give rounding dust to first place rather than leaving it stranded.
  const distributed = shares.reduce((sum, share) => sum + share, 0)
  shares[0] += totalLuna - distributed

  return shares
}

export function potAddress(): string | null {
  const address = process.env.NEXT_PUBLIC_POT_ADDRESS
  return address && address.length > 0 ? address : null
}

/** The memo attached to a contribution, so the pot is auditable on chain. */
export function contributionMemo(heatId: string): string {
  return `Tandem pot ${heatId}`
}

export function explorerAddressUrl(address: string): string {
  return `https://nimiq.watch/#${address.replace(/\s/g, '')}`
}

export function explorerTxUrl(hash: string): string {
  return `https://nimiq.watch/#${hash}`
}
