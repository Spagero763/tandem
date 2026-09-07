'use client'

import { useCallback, useEffect, useState } from 'react'

import { formatNim, describeError, sendNim } from '@/lib/nimiq/client'
import { explorerTxUrl } from '@/lib/pot'

interface Due {
  address: string
  handle: string
  score: number
  rank: number
  luna: number
}

interface Settled {
  address: string
  rank: number
  luna: number
  txHash: string | null
  sentAt: string | null
}

interface PayoutData {
  heatId: string
  isOwner: boolean
  settled: Settled[]
  due: Due[]
  totalLuna: number
  closed: boolean
}

async function fetchPayouts(heatId: string): Promise<PayoutData | null> {
  try {
    const response = await fetch(`/api/payouts?heat=${heatId}`, { cache: 'no-store' })
    return response.ok ? ((await response.json()) as PayoutData) : null
  } catch {
    return null
  }
}

/**
 * The public payout record, plus settlement controls when the signed-in wallet
 * is the pot itself.
 *
 * Settlement sends from the operator's own wallet through the same approval
 * dialogs any player sees. There is no server-side key for the pot, which is
 * why this is a component rather than a cron job.
 */
export function Settlement({ yesterday }: { yesterday: string }) {
  const [data, setData] = useState<PayoutData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setData(await fetchPayouts(yesterday))
  }, [yesterday])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const found = await fetchPayouts(yesterday)
      if (!cancelled) setData(found)
    })()
    return () => {
      cancelled = true
    }
  }, [yesterday])

  const pay = useCallback(
    async (due: Due) => {
      setBusy(due.address)
      setError(null)

      try {
        const txHash = await sendNim(due.address, due.luna, `Tandem ${yesterday} #${due.rank}`)

        await fetch('/api/payouts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            heatId: yesterday,
            address: due.address,
            rank: due.rank,
            luna: due.luna,
            txHash,
          }),
        })

        await load()
      } catch (cause) {
        setError(describeError(cause))
      } finally {
        setBusy(null)
      }
    },
    [load, yesterday],
  )

  if (!data || (data.settled.length === 0 && !data.isOwner)) return null

  const paid = new Set(data.settled.map((row) => row.address))

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-chalk">Yesterday&rsquo;s payouts</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        {data.heatId}. Every payout below links to the transaction that made it.
      </p>

      {error ? (
        <p className="mt-4 rounded-xl bg-shard/10 px-4 py-3 text-sm text-shard">{error}</p>
      ) : null}

      <ol className="mt-4 space-y-1.5">
        {data.settled.map((row) => (
          <li
            key={row.address}
            className="flex items-center gap-3 rounded-2xl bg-ink-850/70 px-4 py-3"
          >
            <span className="tabular w-6 text-sm font-semibold text-warm">{row.rank}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-chalk">
              {row.address.slice(0, 8)}…{row.address.slice(-4)}
            </span>
            <span className="tabular text-sm font-semibold text-chalk">
              {formatNim(row.luna, 0)}
            </span>
            {row.txHash ? (
              <a
                href={explorerTxUrl(row.txHash)}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-cool underline underline-offset-2"
              >
                tx
              </a>
            ) : null}
          </li>
        ))}

        {data.isOwner
          ? data.due
              .filter((due) => !paid.has(due.address) && due.luna > 0)
              .map((due) => (
                <li
                  key={due.address}
                  className="flex items-center gap-3 rounded-2xl bg-ink-800 px-4 py-3"
                >
                  <span className="tabular w-6 text-sm font-semibold text-dim">{due.rank}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-chalk">{due.handle}</span>
                  <button
                    type="button"
                    onClick={() => pay(due)}
                    disabled={busy !== null}
                    className="min-h-11 rounded-full bg-chalk px-4 text-xs font-semibold text-ink-950 disabled:opacity-40"
                  >
                    {busy === due.address ? '…' : `Pay ${formatNim(due.luna, 0)} NIM`}
                  </button>
                </li>
              ))
          : null}
      </ol>

      {data.isOwner && data.due.length === 0 ? (
        <p className="mt-3 text-xs text-dim">Nobody played yesterday, so there is nothing to pay.</p>
      ) : null}
    </section>
  )
}
