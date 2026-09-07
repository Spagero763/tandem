import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google'

import { PlayerProvider } from '@/components/PlayerProvider'

import './globals.css'

const sans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })
const display = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Tandem',
  description: 'One thumb. Two orbs. Sixty seconds.',
  applicationName: 'Tandem',
}

export const viewport: Viewport = {
  themeColor: '#05060a',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // The arena is a fixed-size playfield driven by a dragging thumb. Letting the
  // WebView zoom or resize under that gesture would move the goalposts mid-run.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable} h-full`}>
      <body className="min-h-full antialiased">
        <PlayerProvider>{children}</PlayerProvider>
      </body>
    </html>
  )
}
