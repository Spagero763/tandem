'use client'

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'

import { copyFor, type Copy } from '@/lib/i18n'
import { hostLanguage } from '@/lib/nimiq/client'

const CopyContext = createContext<Copy | null>(null)

/**
 * Nimiq Pay sets the language before page scripts run and it does not change
 * for the life of the session, so this is a static external read rather than
 * state. The server has no host, so it renders English and hydrates into
 * whatever the user actually chose.
 */
function subscribe(): () => void {
  return () => {}
}

function snapshot(): string {
  return hostLanguage() ?? 'en'
}

export function CopyProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(subscribe, snapshot, () => 'en')

  return <CopyContext.Provider value={copyFor(language)}>{children}</CopyContext.Provider>
}

export function useCopy(): Copy {
  const copy = useContext(CopyContext)
  if (!copy) throw new Error('useCopy must be used inside CopyProvider')
  return copy
}
