import {
  redisBlocking,
  ackAnalyticsEvents,
  ensureAnalyticsStream,
} from '../cache/redis';
import { db, schema } from '../db';
import { ENV } from '../config/env';

const CONSUMER_NAME = `worker-${process.pid}`;
const BATCH_SIZE    = 100;

/** Drain the analytics Redis Stream and bulk-insert to analytics_events table.
 *  Called on a tight loop — blocks on XREADGROUP with BLOCK 0 (waits for events). */
export async function startAnalyticsWorker(): Promise<void> {
  await ensureAnalyticsStream(ENV.ANALYTICS_STREAM_KEY, ENV.ANALYTICS_CONSUMER_GROUP);
  console.log('[analytics-worker] started, consumer:', CONSUMER_NAME);

  // Process any pending (unacked) messages from a crashed consumer first
  await processPending();

  // Main consume loop
  while (true) {
    try {
      await consumeBatch();
    } catch (err) {
      console.error('[analytics-worker] error:', (err as Error).message);
      await sleep(2000);
    }
  }
}

async function processPending(): Promise<void> {
  // Read PEL (messages delivered but not ACKed by any consumer)
  const results = await redisBlocking.xreadgroup(
    'GROUP', ENV.ANALYTICS_CONSUMER_GROUP, CONSUMER_NAME,
    'COUNT', String(BATCH_SIZE),
    'STREAMS', ENV.ANALYTICS_STREAM_KEY, '0'  // '0' = read pending
  ) as [string, [string, string[]][]][] | null;

  if (!results || results.length === 0) return;
  const entries = results[0][1];
  if (entries.length > 0) {
    console.log(`[analytics-worker] reprocessing ${entries.length} pending messages`);
    await flushEntries(entries);
  }
}

async function consumeBatch(): Promise<void> {
  const results = await redisBlocking.xreadgroup(
    'GROUP', ENV.ANALYTICS_CONSUMER_GROUP, CONSUMER_NAME,
    'COUNT', String(BATCH_SIZE),
    'BLOCK', '5000',
    'STREAMS', ENV.ANALYTICS_STREAM_KEY, '>'
  ) as [string, [string, string[]][]][] | null;

  if (!results || results.length === 0) return;
  const entries = results[0][1];
  await flushEntries(entries);
}

async function flushEntries(entries: [string, string[]][]): Promise<void> {
  if (entries.length === 0) return;

  const rows: (typeof schema.analyticsEvents.$inferInsert)[] = [];
  const ids: string[] = [];

  for (const [id, fields] of entries) {
    ids.push(id);
    const map: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      map[fields[i]] = fields[i + 1];
    }

    rows.push({
      sessionId: map.sessionId || undefined,
      eventTs:   new Date(parseInt(map.eventTs ?? '0', 10)),
      event:     (map.event ?? 'unknown').slice(0, 64),
      params:    safeParseJson(map.params),
    });
  }

  try {
    await db.insert(schema.analyticsEvents).values(rows);
    await ackAnalyticsEvents(ENV.ANALYTICS_STREAM_KEY, ENV.ANALYTICS_CONSUMER_GROUP, ids);
  } catch (err) {
    console.error('[analytics-worker] db insert failed:', (err as Error).message);
    // Do NOT ack — messages will be retried on next pending pass
  }
}

function safeParseJson(raw: string | undefined): Record<string, unknown> {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
