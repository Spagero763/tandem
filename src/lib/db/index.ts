import 'server-only'

import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'

import { sql } from 'drizzle-orm'

import { SCHEMA_STATEMENTS } from './schema'
import * as schema from './schema'

/**
 * One data layer, two drivers.
 *
 * Production runs on Neon. Local development runs on PGlite, which is real
 * Postgres compiled to WebAssembly rather than a mock — same SQL, same types,
 * same Drizzle dialect. That matters more than convenience: an in-memory stub
 * hides exactly the bugs (constraint violations, upsert races, ordering) that
 * only show up against a real database, and it hides them until deploy day.
 */
export type Db = ReturnType<typeof drizzleNeon<typeof schema>>

interface Cache {
  db?: Db
  ready?: Promise<Db>
}

const globalCache = globalThis as typeof globalThis & { __tandemDb?: Cache }
const cache: Cache = (globalCache.__tandemDb ??= {})

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL

  if (url) {
    const { Pool } = await import('@neondatabase/serverless')
    const pool = new Pool({ connectionString: url })
    const db = drizzleNeon(pool, { schema })
    await migrate(db as unknown as Db)
    return db as unknown as Db
  }

  // No DATABASE_URL: fall back to an on-disk PGlite instance so a fresh clone
  // runs with no setup at all.
  const { PGlite } = await import('@electric-sql/pglite')
  const client = new PGlite(process.env.PGLITE_DIR ?? '.pglite')
  const db = drizzlePglite(client, { schema })
  await migrate(db as unknown as Db)
  return db as unknown as Db
}

async function migrate(db: Db): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.execute(sql.raw(statement))
  }
}

export function getDb(): Promise<Db> {
  if (cache.db) return Promise.resolve(cache.db)

  cache.ready ??= connect().then(
    (db) => {
      cache.db = db
      return db
    },
    (error: unknown) => {
      // Don't cache a failed connection: a transient outage shouldn't take the
      // process down until it restarts.
      cache.ready = undefined
      throw error
    },
  )

  return cache.ready
}

export function isUsingRemoteDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

export { schema }
