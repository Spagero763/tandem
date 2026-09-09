'use client'

import { motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'

import { useCopy } from '@/components/CopyProvider'
import { usePlayer } from '@/components/PlayerProvider'
import { Settlement } from '@/components/Settlement'
import { describeError, formatNim, nimToLuna, sendNim, stakeNim } from '@/lib/nimiq/client'
import { describeEvmError, sendUsdt } from '@/lib/nimiq/evm'
import { contributionMemo, explorerAddressUrl } from '@/lib/pot'

interface Standing {
  address: string
  handle: string
  score: number
  rank: number
  shareLuna: number
}

interface PotData {
  heatId: string
  address: string | null
  totalLuna: number
  backers: number
  standings: Standing[]
  recent: { txHash: string; fromAddress: string; luna: number }[]
}

const BACK_AMOUNTS = [50, 250, 1000]
const STAKE_AMOUNTS = [100, 500, 2500]

const VALIDATOR = process.env.NEXT_PUBLIC_VALIDATOR_ADDRESS ?? ''
const FOUNDER_ADDRESS = process.env.NEXT_PUBLIC_FOUNDER_ADDRESS ?? ''
const FOUNDER_PRICE = '2'

type Busy = null | 'back' | 'stake' | 'founder'

/** The heat before the given one, so settlement always targets a closed day. */
function previousHeat(heatId: string): string {
  const date = new Date(`${heatId}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

/** The pot is informational; a failure here must not blank the screen. */
async function fetchPot(): Promise<PotData | null> {
  try {
    const response = await fetch('/api/pot', { cache: 'no-store' })
    return response.ok ? ((await response.json()) as PotData) : null
  } catch {
    return null
  }
}

export function PotScreen() {
  const { player, insideNimiqPay, refresh } = usePlayer()
  const t = useCopy()

  const [data, setData] = useState<PotData | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const found = await fetchPot()
    if (found) setData(found)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const found = await fetchPot()
      if (!cancelled && found) setData(found)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const back = useCallback(
    async (nim: number) => {
      if (!data?.address) return
      setBusy('back')
      setError(null)
      setNote(null)

      try {
        const luna = nimToLuna(nim)
        const txHash = await sendNim(data.address, luna, contributionMemo(data.heatId))

        await fetch('/api/pot', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            heatId: data.heatId,
            txHash,
            luna,
            message: contributionMemo(data.heatId),
          }),
        })

        setNote(t.potThanks(nim.toLocaleString()))
        await load()
      } catch (cause) {
        setError(describeError(cause))
      } finally {
        setBusy(null)
      }
    },
    [data, load, t],
  )

  const stake = useCallback(
    async (nim: number) => {
      if (!VALIDATOR) {
        setError(t.errGeneric)
        return
      }

      setBusy('stake')
      setError(null)
      setNote(null)

      try {
        const luna = nimToLuna(nim)
        const txHash = await stakeNim(luna, VALIDATOR)

        await fetch('/api/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'patron', txHash, luna }),
        })

        setNote(t.potStaked(nim.toLocaleString()))
        await refresh()
      } catch (cause) {
        setError(describeError(cause))
      } finally {
        setBusy(null)
      }
    },
    [refresh, t],
  )

  const buyFounder = useCallback(async () => {
    if (!FOUNDER_ADDRESS) {
      setError(t.errGeneric)
      return
    }

    setBusy('founder')
    setError(null)
    setNote(null)

    try {
      const txHash = await sendUsdt(FOUNDER_ADDRESS, FOUNDER_PRICE)

      await fetch('/api/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'founder', txHash }),
      })

      setNote(t.potFounderDone)
      await refresh()
    } catch (cause) {
      setError(describeEvmError(cause))
    } finally {
      setBusy(null)
    }
  }, [refresh, t])

  return (
    <main
      className="mx-auto min-h-full w-full max-w-lg px-5 pb-28"
      style={{ paddingTop: 'calc(var(--safe-top) + 1.5rem)' }}
    >
      <header>
        <h1 className="display text-2xl text-chalk">{t.potTitle}</h1>
        <p className="mt-1 text-xs leading-relaxed text-dim">
          {t.potBlurb}
        </p>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ease: [0.16, 1, 0.3, 1] }}
        className="panel mt-5 rounded-3xl p-6 text-center"
      >
        <p className="tabular text-5xl leading-none font-semibold text-chalk">
          {data ? formatNim(data.totalLuna, 0) : '…'}
        </p>
        <p className="mt-2 text-xs tracking-[0.18em] text-dim uppercase">NIM</p>
        {data ? (
          <p className="mt-3 text-xs text-muted">
            {t.potBackers(data.backers)}
            {data.address ? (
              <>
                {' · '}
                <a
                  href={explorerAddressUrl(data.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-chalk"
                >
                  {t.potVerify}
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </motion.div>

      {data && data.standings.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-[11px] font-medium tracking-[0.18em] text-dim uppercase">
            {t.potPayingOut}
          </h2>
          <ol className="mt-3 space-y-1.5">
            {data.standings.map((row) => (
              <li
                key={row.address}
                className="flex items-center gap-3 rounded-2xl bg-ink-850/70 px-4 py-3"
              >
                <span className="tabular w-6 text-sm font-semibold text-warm">{row.rank}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-chalk">{row.handle}</span>
                <span className="tabular text-sm font-semibold text-chalk">
                  {formatNim(row.shareLuna, 0)} NIM
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {note ? (
        <p className="mt-6 rounded-xl bg-cool/10 px-4 py-3 text-sm text-cool">{note}</p>
      ) : null}
      {error ? (
        <p className="mt-6 rounded-xl bg-shard/10 px-4 py-3 text-sm text-shard">{error}</p>
      ) : null}

      {!insideNimiqPay ? (
        <p className="mt-6 rounded-xl bg-ink-800/70 px-4 py-3 text-xs leading-relaxed text-muted">
          {t.potOutsideApp}
        </p>
      ) : null}

      <Section
        title={t.potBackTitle}
        blurb={t.potBackBlurb}
      >
        <Amounts
          suffix="NIM"
          amounts={BACK_AMOUNTS}
          disabled={!player || !insideNimiqPay || busy !== null || !data?.address}
          busy={busy === 'back'}
          onPick={back}
        />
      </Section>

      <Section
        title={t.potPatronTitle}
        blurb={t.potPatronBlurb}
      >
        <Amounts
          suffix="NIM"
          amounts={STAKE_AMOUNTS}
          disabled={!player || !insideNimiqPay || busy !== null}
          busy={busy === 'stake'}
          onPick={stake}
        />
        {player?.patron ? (
          <p className="mt-3 text-xs text-cool">
            {t.potPatronActive(formatNim(player.stakedLuna, 0))}
          </p>
        ) : null}
      </Section>

      <Section
        title={t.potFounderTitle}
        blurb={t.potFounderBlurb(FOUNDER_PRICE)}
      >
        {player?.founder ? (
          <p className="text-sm text-cool">{t.potFounderOwned}</p>
        ) : (
          <button
            type="button"
            onClick={buyFounder}
            disabled={!player || !insideNimiqPay || busy !== null}
            className="min-h-11 w-full rounded-full bg-ghost/15 px-5 text-sm font-semibold text-ghost disabled:opacity-40"
          >
            {busy === 'founder' ? t.potWalletBusy : t.potFounderBuy(FOUNDER_PRICE)}
          </button>
        )}
      </Section>

      {data ? <Settlement yesterday={previousHeat(data.heatId)} /> : null}

      {!player ? (
        <p className="mt-6 text-center text-xs text-dim">{t.potSignInFirst}</p>
      ) : null}

    </main>
  )
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string
  blurb: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-chalk">{title}</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{blurb}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Amounts({
  amounts,
  suffix,
  disabled,
  busy,
  onPick,
}: {
  amounts: number[]
  suffix: string
  disabled: boolean
  busy: boolean
  onPick: (amount: number) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {amounts.map((amount) => (
        <button
          key={amount}
          type="button"
          onClick={() => onPick(amount)}
          disabled={disabled}
          className="min-h-11 rounded-2xl bg-ink-800 text-sm font-semibold text-chalk transition-colors hover:bg-ink-700 disabled:opacity-40"
        >
          {busy ? '…' : `${amount.toLocaleString()} ${suffix}`}
        </button>
      ))}
    </div>
  )
}
