/**
 * Serves the production bundle for testing on a real phone.
 *
 * The dev server is not usable from a device here: `next dev` ships several
 * megabytes of unminified JavaScript and an iOS WebView does not get through
 * it, which looks like a broken app rather than a slow one. This builds and
 * serves what will actually ship.
 *
 * It fills in the two things a production build refuses to invent, and only
 * for this local run: a session signing key, and explicit permission to use
 * the on-disk PGlite database. Neither is written to disk or committed.
 *
 * Run with: pnpm preview
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { networkInterfaces } from 'node:os'

const PORT = process.env.PORT ?? '3300'

function lanAddress(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address
    }
  }
  return null
}

const environment = {
  ...process.env,
  // A throwaway key: sessions from a preview run are meant to be disposable.
  SESSION_SECRET: process.env.SESSION_SECRET ?? randomBytes(48).toString('base64'),
  // Deliberate opt-in to the local database, which production otherwise refuses.
  PGLITE_DIR: process.env.PGLITE_DIR ?? '.pglite',
  // Lets a phone report script errors back into this terminal.
  NEXT_PUBLIC_DEVICE_REPORTER: process.env.NEXT_PUBLIC_DEVICE_REPORTER ?? '1',
}

const build = spawnSync('next', ['build'], { stdio: 'inherit', shell: true, env: environment })
if (build.status !== 0) process.exit(build.status ?? 1)

const address = lanAddress()
console.log('\n  Production build, served for device testing.')
if (address) console.log(`  On your phone, same Wi-Fi:  http://${address}:${PORT}`)
console.log('  Nimiq Pay > Mini Apps > Custom URL\n')

const server = spawnSync('next', ['start', '-H', '0.0.0.0', '-p', PORT], {
  stdio: 'inherit',
  shell: true,
  env: environment,
})

process.exit(server.status ?? 0)
