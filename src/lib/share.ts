/**
 * Nimiq Pay opens a mini app from a plain https link, which makes a shared
 * result a working front door rather than a screenshot: tapping it in a chat
 * drops the reader straight into the arena against that run's ghost.
 */
export function deeplinkFor(path = ''): string {
  if (typeof window === 'undefined') return ''
  const host = window.location.host
  const suffix = path ? `?${path}` : ''
  return `https://nimpay.app/miniapps/open/${host}${suffix}`
}

export function challengeLink(runId: string): string {
  return deeplinkFor(`g=${runId}`)
}

export interface ShareResult {
  method: 'shared' | 'copied' | 'unavailable'
}

export async function shareChallenge(text: string, url: string): Promise<ShareResult> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text, url })
      return { method: 'shared' }
    } catch {
      // The user dismissed the sheet, or the WebView refused. Fall through to
      // the clipboard so the action still does something.
    }
  }

  try {
    await navigator.clipboard.writeText(`${text} ${url}`)
    return { method: 'copied' }
  } catch {
    return { method: 'unavailable' }
  }
}
