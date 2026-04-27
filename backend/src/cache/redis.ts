import Redis from 'ioredis';
import { ENV } from '../config/env';

const redisOptions = {
  lazyConnect: true,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
};

export const redis = new Redis(ENV.REDIS_URL, redisOptions);

redis.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});

/** Dedicated connection for blocking commands (XREADGROUP BLOCK, etc.).
 *  Must be separate from the main `redis` client — a blocked connection
 *  cannot service any other commands until the block resolves. */
export const redisBlocking = new Redis(ENV.REDIS_URL, redisOptions);

redisBlocking.on('error', (err) => {
  console.error('[redis-blocking] connection error:', err.message);
});

/* ─── Spin lock ─────────────────────────────────────────────────────────── */
const LOCK_TTL_SECONDS = 30;

/** Returns true if lock was acquired, false if already locked. */
export async function acquireSpinLock(sessionId: string): Promise<boolean> {
  const key = `spin:${sessionId}:lock`;
  const result = await redis.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

export async function releaseSpinLock(sessionId: string): Promise<void> {
  await redis.del(`spin:${sessionId}:lock`);
}

/* ─── Session hot cache ─────────────────────────────────────────────────── */
const SESSION_CACHE_TTL = 3600; // 1 hour

export async function cacheSession(sessionId: string, data: Record<string, string>): Promise<void> {
  const key = `session:${sessionId}`;
  await redis.hset(key, data);
  await redis.expire(key, SESSION_CACHE_TTL);
}

export async function getCachedSession(sessionId: string): Promise<Record<string, string> | null> {
  const key = `session:${sessionId}`;
  const data = await redis.hgetall(key);
  return Object.keys(data).length > 0 ? data : null;
}

export async function invalidateSessionCache(sessionId: string): Promise<void> {
  await redis.del(`session:${sessionId}`);
}

/* ─── Analytics Redis Stream ────────────────────────────────────────────── */
export async function ensureAnalyticsStream(streamKey: string, groupName: string): Promise<void> {
  try {
    await redis.xgroup('CREATE', streamKey, groupName, '$', 'MKSTREAM');
  } catch (err: unknown) {
    // BUSYGROUP = group already exists — that's fine
    if (err instanceof Error && !err.message.includes('BUSYGROUP')) throw err;
  }
}

export interface AnalyticsMessage {
  sessionId: string;
  eventTs:   string;
  event:     string;
  params:    string; // JSON string
}

export async function pushAnalyticsEvent(
  streamKey: string,
  msg: AnalyticsMessage
): Promise<void> {
  await redis.xadd(
    streamKey, 'MAXLEN', '~', '50000', '*',
    'sessionId', msg.sessionId,
    'eventTs',   msg.eventTs,
    'event',     msg.event,
    'params',    msg.params
  );
}

export type StreamEntry = [string, string[]]; // [id, fields[]]

export async function readAnalyticsEvents(
  streamKey: string,
  groupName: string,
  consumerName: string,
  count: number
): Promise<StreamEntry[]> {
  const results = await redisBlocking.xreadgroup(
    'GROUP', groupName, consumerName,
    'COUNT', String(count),
    'BLOCK', '5000',
    'STREAMS', streamKey, '>'
  ) as [string, StreamEntry[]][] | null;

  if (!results || results.length === 0) return [];
  return results[0][1];
}

export async function ackAnalyticsEvents(
  streamKey: string,
  groupName: string,
  ids: string[]
): Promise<void> {
  if (ids.length > 0) {
    await redis.xack(streamKey, groupName, ...ids);
  }
}
