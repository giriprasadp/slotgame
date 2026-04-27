import type { FastifyInstance } from 'fastify';
import { requireAdminKey } from '../middleware/auth';
import { computeRtp, getLatestSnapshot } from '../services/rtpService';
import { db, schema } from '../db';
import { sql, desc } from 'drizzle-orm';

export async function adminRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/rtp?window=24
   *  Returns live-computed RTP for the specified hour window. */
  app.get(
    '/rtp',
    { preHandler: [requireAdminKey] },
    async (request, reply) => {
      const query = (request.query as Record<string, string>);
      const windowHours = Math.max(1, Math.min(720, parseInt(query.window ?? '24', 10) || 24));
      const data = await computeRtp(windowHours);
      const snapshot = await getLatestSnapshot(windowHours);
      return { live: data, latestSnapshot: snapshot };
    }
  );

  /** GET /api/v1/admin/sessions?limit=50
   *  Returns recent session summaries. */
  app.get(
    '/sessions',
    { preHandler: [requireAdminKey] },
    async (request, reply) => {
      const query = (request.query as Record<string, string>);
      const limit = Math.max(1, Math.min(200, parseInt(query.limit ?? '50', 10) || 50));

      const rows = await db
        .select({
          id:           schema.sessions.id,
          createdAt:    schema.sessions.createdAt,
          lastSeenAt:   schema.sessions.lastSeenAt,
          platform:     schema.sessions.platform,
          balance:      schema.sessions.balance,
          totalSpins:   schema.sessions.totalSpins,
          totalWagered: schema.sessions.totalWagered,
          totalWon:     schema.sessions.totalWon,
          biggestWin:   schema.sessions.biggestWin,
          restartCount: schema.sessions.restartCount,
        })
        .from(schema.sessions)
        .orderBy(desc(schema.sessions.lastSeenAt))
        .limit(limit);

      return { sessions: rows };
    }
  );

  /** GET /api/v1/admin/spin/:id — fetch a spin log entry for support/debug */
  app.get(
    '/spin/:id',
    { preHandler: [requireAdminKey] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const numId = parseInt(id, 10);
      if (isNaN(numId)) return reply.code(400).send({ error: 'INVALID_ID' });

      const [spin] = await db
        .select()
        .from(schema.spinLog)
        .where(sql`${schema.spinLog.id} = ${numId}`)
        .limit(1);

      if (!spin) return reply.code(404).send({ error: 'SPIN_NOT_FOUND' });
      return spin;
    }
  );
}
