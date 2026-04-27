import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, extractSession } from '../middleware/auth';
import { ingestEvents } from '../services/analyticsService';

const eventSchema = z.object({
  ts:    z.number().int(),
  event: z.string().max(64),
  // params is an open object but we sanitise server-side
  params: z.record(z.unknown()).default({}),
});

const batchSchema = z.object({
  events: z.array(eventSchema).max(100),
});

export async function analyticsRoutes(app: FastifyInstance) {
  /** POST /api/v1/analytics/batch
   *  Accepts batched analytics events from the client.
   *  Events are pushed to Redis Stream for async DB persistence. */
  app.post(
    '/batch',
    { preHandler: [requireAuth, extractSession] },
    async (request, reply) => {
      const body = batchSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', details: body.error.format() });
      }

      const received = await ingestEvents(
        body.data.events.map(ev => ({
          sessionId: request.sessionId,
          eventTs:   ev.ts,
          event:     ev.event,
          params:    ev.params as Record<string, unknown>,
        }))
      );

      return reply.code(202).send({ received });
    }
  );
}
