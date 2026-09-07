
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * A player is a Nimiq address, proven by signature. There are no passwords and
 * no email: the wallet is the account.
 *
 * Addresses are stored in compact upper-case form (no spaces) so that lookups
 * never depend on how a caller happened to format them.
 */
export const players = pgTable('players', {
  address: text('address').primaryKey(),
  handle: text('handle').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),

  /** Set when the player has staked NIM through Tandem. Cosmetic status only. */
  patron: boolean('patron').notNull().default(false),
  patronSince: timestamp('patron_since', { withTimezone: true }),
  stakedLuna: integer('staked_luna').notNull().default(0),

  /** Set when the player has bought the cosmetic pack in USDT on Polygon. */
  founder: boolean('founder').notNull().default(false),
})

/**
 * Login challenges. One-time use with a short expiry, so a signature captured
 * from one login cannot be replayed into another.
 */
export const authNonces = pgTable(
  'auth_nonces',
  {
    nonce: text('nonce').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [index('auth_nonces_expires_idx').on(table.expiresAt)],
)

/**
 * A heat is one day's course. Everybody who plays a given heat plays the exact
 * same generated obstacles, which is what makes the ladder a comparison of
 * skill rather than of luck.
 */
export const heats = pgTable('heats', {
  /** ISO date, e.g. 2026-09-06. */
  id: text('id').primaryKey(),
  seed: text('seed').notNull(),
  rulesVersion: integer('rules_version').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
})

/**
 * Every submitted run, with the inputs that produced it.
 *
 * The score column is always the score the *server* computed by replaying
 * `inputs`; the client's claim is never written here. Keeping the inputs is
 * what makes the ladder auditable after the fact and what lets any run be
 * raced as a ghost.
 */
export const runs = pgTable(
  'runs',
  {
    id: text('id').primaryKey(),
    heatId: text('heat_id')
      .notNull()
      .references(() => heats.id),
    address: text('address')
      .notNull()
      .references(() => players.address),

    score: integer('score').notNull(),
    motes: integer('motes').notNull(),
    grazes: integer('grazes').notNull(),
    bestCombo: integer('best_combo').notNull(),
    integrity: smallint('integrity').notNull(),
    ticks: integer('ticks').notNull(),
    survived: boolean('survived').notNull(),

    /** Base64 uint16 thumb positions, one per tick. ~9KB for a full heat. */
    inputs: text('inputs').notNull(),
    /**
     * Unsigned 32-bit, so it needs bigint: a signed `integer` column overflows
     * on roughly half of all runs, at random.
     */
    checksum: bigint('checksum', { mode: 'number' }).notNull(),
    rulesVersion: integer('rules_version').notNull(),

    /** Set when the client's reported score disagreed with the replay. */
    mismatch: boolean('mismatch').notNull().default(false),
    pauses: smallint('pauses').notNull().default(0),

    /**
     * Motion statistics from the replay, as JSON. Replay scoring already makes
     * a fabricated *score* impossible; these describe how the run was played,
     * so that scripted-but-genuine input has something to be judged on. They
     * are recorded and shown, never used to auto-reject a run.
     */
    signals: text('signals'),

    /** Per-device handle from Nimiq Pay. Rate limiting only, never identity. */
    deviceHash: text('device_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('runs_heat_score_idx').on(table.heatId, table.score.desc()),
    index('runs_address_heat_idx').on(table.address, table.heatId),
    index('runs_created_idx').on(table.createdAt),
  ],
)

/**
 * The best run each player has recorded in each heat. Denormalised because the
 * ladder is the most-read surface in the product and a per-heat "max score per
 * player" scan gets expensive well before it gets interesting.
 */
export const ladder = pgTable(
  'ladder',
  {
    heatId: text('heat_id')
      .notNull()
      .references(() => heats.id),
    address: text('address')
      .notNull()
      .references(() => players.address),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id),
    score: integer('score').notNull(),
    attempts: integer('attempts').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.heatId, table.address] }),
    index('ladder_heat_score_idx').on(table.heatId, table.score.desc()),
  ],
)

/**
 * NIM sent to the pot address, as observed on chain.
 *
 * Keyed by transaction hash so that re-reading the same range of blocks can
 * never double-count a contribution.
 */
export const potContributions = pgTable(
  'pot_contributions',
  {
    txHash: text('tx_hash').primaryKey(),
    fromAddress: text('from_address').notNull(),
    luna: integer('luna').notNull(),
    message: text('message'),
    blockHeight: integer('block_height').notNull(),
    seenAt: timestamp('seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('pot_block_idx').on(table.blockHeight)],
)

/** Prizes paid out of the pot, each with its on-chain transaction. */
export const payouts = pgTable(
  'payouts',
  {
    id: text('id').primaryKey(),
    heatId: text('heat_id')
      .notNull()
      .references(() => heats.id),
    address: text('address').notNull(),
    rank: smallint('rank').notNull(),
    luna: integer('luna').notNull(),
    txHash: text('tx_hash'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('payouts_heat_address_idx').on(table.heatId, table.address)],
)

/**
 * Rate limiting, keyed by whatever identifier is appropriate for the route.
 * A single small table beats a second piece of infrastructure for this.
 */
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
})

export type Player = typeof players.$inferSelect
export type Run = typeof runs.$inferSelect
export type LadderRow = typeof ladder.$inferSelect
export type Heat = typeof heats.$inferSelect

/**
 * Schema bootstrap, one statement per entry.
 *
 * Kept as separate statements rather than a single script because Postgres
 * refuses multiple commands in one prepared statement, and both drivers here
 * prepare by default.
 */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS players (
    address text PRIMARY KEY,
    handle text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    patron boolean NOT NULL DEFAULT false,
    patron_since timestamptz,
    staked_luna integer NOT NULL DEFAULT 0,
    founder boolean NOT NULL DEFAULT false
  );

  CREATE TABLE IF NOT EXISTS auth_nonces (
    nonce text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz
  );
  CREATE INDEX IF NOT EXISTS auth_nonces_expires_idx ON auth_nonces (expires_at);

  CREATE TABLE IF NOT EXISTS heats (
    id text PRIMARY KEY,
    seed text NOT NULL,
    rules_version integer NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    id text PRIMARY KEY,
    heat_id text NOT NULL REFERENCES heats(id),
    address text NOT NULL REFERENCES players(address),
    score integer NOT NULL,
    motes integer NOT NULL,
    grazes integer NOT NULL,
    best_combo integer NOT NULL,
    integrity smallint NOT NULL,
    ticks integer NOT NULL,
    survived boolean NOT NULL,
    inputs text NOT NULL,
    checksum bigint NOT NULL,
    rules_version integer NOT NULL,
    mismatch boolean NOT NULL DEFAULT false,
    pauses smallint NOT NULL DEFAULT 0,
    signals text,
    device_hash text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS runs_heat_score_idx ON runs (heat_id, score DESC);
  CREATE INDEX IF NOT EXISTS runs_address_heat_idx ON runs (address, heat_id);
  CREATE INDEX IF NOT EXISTS runs_created_idx ON runs (created_at);

  CREATE TABLE IF NOT EXISTS ladder (
    heat_id text NOT NULL REFERENCES heats(id),
    address text NOT NULL REFERENCES players(address),
    run_id text NOT NULL REFERENCES runs(id),
    score integer NOT NULL,
    attempts integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (heat_id, address)
  );
  CREATE INDEX IF NOT EXISTS ladder_heat_score_idx ON ladder (heat_id, score DESC);

  CREATE TABLE IF NOT EXISTS pot_contributions (
    tx_hash text PRIMARY KEY,
    from_address text NOT NULL,
    luna integer NOT NULL,
    message text,
    block_height integer NOT NULL,
    seen_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS pot_block_idx ON pot_contributions (block_height);

  CREATE TABLE IF NOT EXISTS payouts (
    id text PRIMARY KEY,
    heat_id text NOT NULL REFERENCES heats(id),
    address text NOT NULL,
    rank smallint NOT NULL,
    luna integer NOT NULL,
    tx_hash text,
    sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS payouts_heat_address_idx ON payouts (heat_id, address);

  CREATE TABLE IF NOT EXISTS rate_limits (
    key text PRIMARY KEY,
    count integer NOT NULL DEFAULT 0,
    window_start timestamptz NOT NULL DEFAULT now()
  );
`

export const SCHEMA_STATEMENTS: string[] = SCHEMA_SQL.split(';')
  .map((statement) => statement.trim())
  .filter((statement) => statement.length > 0)
