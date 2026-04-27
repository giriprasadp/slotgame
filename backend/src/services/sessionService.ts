import { db, schema } from '../db';
import { eq, sql } from 'drizzle-orm';
import { RNG } from '../engine/rng';
import { cacheSession, invalidateSessionCache } from '../cache/redis';
import { STARTING_BALANCE, DEFAULT_BET_LEVEL_IDX } from '../config/game';
import type { Session } from '../db/schema';

export interface SessionPayload {
  sessionId: string;
  balance:   number;
  betLevelIdx: number;
}

/** Create a new demo session. Seeds RNG from crypto.randomBytes. */
export async function createSession(opts: {
  platform?: string;
  screenRes?: string;
}): Promise<Session> {
  const rng = RNG.random();
  const { s0, s1 } = rng.getState();

  const [sess] = await db
    .insert(schema.sessions)
    .values({
      platform:   opts.platform,
      screenRes:  opts.screenRes,
      balance:    String(STARTING_BALANCE),
      betLevelIdx: DEFAULT_BET_LEVEL_IDX,
      rngS0:      s0,
      rngS1:      s1,
    })
    .returning();

  await touchSession(sess.id);
  return sess;
}

/** Fetch a session by ID. Returns null if not found. */
export async function getSession(sessionId: string): Promise<Session | null> {
  const rows = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

/** Update last_seen_at (lightweight heartbeat). */
export async function touchSession(sessionId: string): Promise<void> {
  await db
    .update(schema.sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.sessions.id, sessionId));
}

/** Update session settings (betLevelIdx, quickSpin) + write cache. */
export async function updateSessionSettings(
  sessionId: string,
  updates: Partial<Pick<Session, 'betLevelIdx' | 'quickSpin'>>
): Promise<void> {
  await db
    .update(schema.sessions)
    .set({ ...updates, lastSeenAt: new Date() })
    .where(eq(schema.sessions.id, sessionId));
  await invalidateSessionCache(sessionId);
}

/** Reset session economy to starting balance (Restart button — GDD §14.2). */
export async function restartSession(sessionId: string): Promise<Session> {
  const rng = RNG.random(); // fresh seed on restart
  const { s0, s1 } = rng.getState();

  const [sess] = await db
    .update(schema.sessions)
    .set({
      balance:      String(STARTING_BALANCE),
      betLevelIdx:  DEFAULT_BET_LEVEL_IDX,
      totalSpins:   0,
      totalWagered: '0',
      totalWon:     '0',
      biggestWin:   '0',
      restartCount: sql`${schema.sessions.restartCount} + 1`,
      rngS0: s0,
      rngS1: s1,
      lastSeenAt: new Date(),
    })
    .where(eq(schema.sessions.id, sessionId))
    .returning();

  await invalidateSessionCache(sessionId);
  return sess;
}
