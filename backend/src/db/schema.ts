import {
  pgTable, uuid, text, numeric, smallint, integer,
  boolean, timestamp, bigserial, jsonb, index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/* ─── sessions ─────────────────────────────────────────────────────────── */
export const sessions = pgTable('sessions', {
  id:            uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt:    timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  platform:      text('platform'),
  screenRes:     text('screen_res'),
  balance:       numeric('balance', { precision: 14, scale: 2 }).notNull().default('50000'),
  betLevelIdx:   smallint('bet_level_idx').notNull().default(3),
  quickSpin:     boolean('quick_spin').notNull().default(false),
  totalSpins:    integer('total_spins').notNull().default(0),
  totalWagered:  numeric('total_wagered', { precision: 14, scale: 2 }).notNull().default('0'),
  totalWon:      numeric('total_won', { precision: 14, scale: 2 }).notNull().default('0'),
  biggestWin:    numeric('biggest_win', { precision: 14, scale: 2 }).notNull().default('0'),
  restartCount:  smallint('restart_count').notNull().default(0),
  // Xorshift128+ state (unsigned 64-bit, stored as text to avoid overflow)
  rngS0:         text('rng_s0').notNull().default('0'),
  rngS1:         text('rng_s1').notNull().default('0'),
}, (t) => ({
  lastSeenIdx: index('sessions_last_seen_idx').on(t.lastSeenAt),
}));

/* ─── spin_log ──────────────────────────────────────────────────────────── */
export const spinLog = pgTable('spin_log', {
  id:            bigserial('id', { mode: 'number' }).primaryKey(),
  sessionId:     uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  spinNumber:    integer('spin_number').notNull(),
  gameMode:      text('game_mode').notNull(),       // BASE | FS
  betLevelIdx:   smallint('bet_level_idx').notNull(),
  totalBet:      numeric('total_bet', { precision: 10, scale: 2 }).notNull(),
  spinType:      text('spin_type').notNull(),        // manual | autoplay | free_spin | buy_fs | buy_wheel
  rngSeedState:  text('rng_seed_state').notNull(),   // "s0,s1" before spin — for replay
  stops:         jsonb('stops').notNull(),            // number[5]
  gridResult:    jsonb('grid_result').notNull(),      // Cell[3][5]
  chainSteps:    jsonb('chain_steps').notNull(),      // ChainStep[]
  chainLength:   smallint('chain_length').notNull(),
  maxMultiplier: smallint('max_multiplier').notNull(),
  totalWin:      numeric('total_win', { precision: 14, scale: 2 }).notNull(),
  scatterWin:    numeric('scatter_win', { precision: 14, scale: 2 }).notNull(),
  lineWin:       numeric('line_win', { precision: 14, scale: 2 }).notNull(),
  features:      jsonb('features').notNull(),         // Feature triggers + resolved bonuses
  balanceBefore: numeric('balance_before', { precision: 14, scale: 2 }).notNull(),
  balanceAfter:  numeric('balance_after', { precision: 14, scale: 2 }).notNull(),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionIdx:    index('spin_log_session_idx').on(t.sessionId),
  createdAtIdx:  index('spin_log_created_at_idx').on(t.createdAt),
}));

/* ─── free_spins_sessions ──────────────────────────────────────────────── */
export const freeSpinsSessions = pgTable('free_spins_sessions', {
  id:                  uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId:           uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }).unique(),
  triggeredAt:         timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
  triggerScatterCount: smallint('trigger_scatter_count').notNull(),
  lockedBet:           numeric('locked_bet', { precision: 10, scale: 2 }).notNull(),
  betLevelIdx:         smallint('bet_level_idx').notNull(),
  totalAwarded:        smallint('total_awarded').notNull().default(10),
  spinsRemaining:      smallint('spins_remaining').notNull(),
  spinsCompleted:      smallint('spins_completed').notNull().default(0),
  runningTotal:        numeric('running_total', { precision: 14, scale: 2 }).notNull().default('0'),
  retriggerCount:      smallint('retrigger_count').notNull().default(0),
  longestChain:        smallint('longest_chain').notNull().default(0),
  maxMultiplier:       smallint('max_multiplier').notNull().default(0),
  completed:           boolean('completed').notNull().default(false),
  completedAt:         timestamp('completed_at', { withTimezone: true }),
});

/* ─── analytics_events ─────────────────────────────────────────────────── */
export const analyticsEvents = pgTable('analytics_events', {
  id:         bigserial('id', { mode: 'number' }).primaryKey(),
  sessionId:  uuid('session_id'),
  eventTs:    timestamp('event_ts', { withTimezone: true }).notNull(),
  event:      text('event').notNull(),
  params:     jsonb('params').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  eventIdx:   index('analytics_events_event_idx').on(t.event),
  sessionIdx: index('analytics_events_session_idx').on(t.sessionId),
  tsIdx:      index('analytics_events_ts_idx').on(t.eventTs),
}));

/* ─── rtp_snapshots ────────────────────────────────────────────────────── */
export const rtpSnapshots = pgTable('rtp_snapshots', {
  id:           bigserial('id', { mode: 'number' }).primaryKey(),
  snapshotAt:   timestamp('snapshot_at', { withTimezone: true }).notNull().defaultNow(),
  windowHours:  integer('window_hours').notNull(),
  totalSpins:   integer('total_spins').notNull(),
  totalWagered: numeric('total_wagered', { precision: 16, scale: 2 }).notNull(),
  totalWon:     numeric('total_won', { precision: 16, scale: 2 }).notNull(),
  rtp:          numeric('rtp', { precision: 6, scale: 4 }).notNull(),
});

/* ─── Type exports ──────────────────────────────────────────────────────── */
export type Session              = typeof sessions.$inferSelect;
export type NewSession           = typeof sessions.$inferInsert;
export type SpinLog              = typeof spinLog.$inferSelect;
export type NewSpinLog           = typeof spinLog.$inferInsert;
export type FreeSpinsSession     = typeof freeSpinsSessions.$inferSelect;
export type NewFreeSpinsSession  = typeof freeSpinsSessions.$inferInsert;
export type AnalyticsEvent       = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent    = typeof analyticsEvents.$inferInsert;
export type RtpSnapshot          = typeof rtpSnapshots.$inferSelect;
