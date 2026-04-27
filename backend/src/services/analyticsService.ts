import { pushAnalyticsEvent } from '../cache/redis';
import { ENV } from '../config/env';

export interface AnalyticsEventPayload {
  sessionId: string;
  eventTs:   number;          // Unix ms
  event:     string;
  params:    Record<string, unknown>;
}

/** Push a batch of analytics events to the Redis Stream.
 *  The worker consumer drains the stream and writes to analytics_events table.
 *  Non-blocking — errors are caught and logged, not propagated. */
export async function ingestEvents(events: AnalyticsEventPayload[]): Promise<number> {
  let pushed = 0;
  for (const ev of events) {
    try {
      // Sanitise: cap event name + params size, strip PII
      const safeEvent = ev.event.slice(0, 64);
      const safeParams = sanitiseParams(ev.params);

      await pushAnalyticsEvent(ENV.ANALYTICS_STREAM_KEY, {
        sessionId: ev.sessionId,
        eventTs:   String(ev.eventTs),
        event:     safeEvent,
        params:    JSON.stringify(safeParams),
      });
      pushed++;
    } catch (err) {
      console.error('[analytics] failed to push event:', (err as Error).message);
    }
  }
  return pushed;
}

function sanitiseParams(params: Record<string, unknown>): Record<string, unknown> {
  // Remove any keys that look like PII
  const piiKeys = /email|name|ip|address|phone|user_id/i;
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (piiKeys.test(k)) continue;
    // Cap string values
    safe[k] = typeof v === 'string' ? v.slice(0, 256) : v;
  }
  return safe;
}
