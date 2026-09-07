'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: 'Arena' },
  { href: '/ladder', label: 'Ladder' },
  { href: '/pot', label: 'Pot' },
] as const

export function Nav() {
  const pathname = usePathname()

  /*
   * Not on the arena. The thumb control lives along the bottom edge, so a bar
   * pinned there would sit directly under the one gesture the game is played
   * with. The arena carries its own links instead.
   */
  if (pathname === '/') return null

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4"
      style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.75rem)' }}
    >
      <div className="panel flex gap-1 rounded-full p-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-11 items-center rounded-full px-6 text-sm font-medium transition-colors ${
                active ? 'bg-chalk text-ink-950' : 'text-muted hover:text-chalk'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
