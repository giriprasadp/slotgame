import type { FastifyInstance } from 'fastify';
import { requireAuth, extractSession } from '../middleware/auth';
import { getSession } from '../services/sessionService';

export async function walletRoutes(app: FastifyInstance) {
  /** GET /api/v1/wallet
   *  Returns current balance. Lightweight — no game state. */
  app.get(
    '/',
    { preHandler: [requireAuth, extractSession] },
    async (request, reply) => {
      const sess = await getSession(request.sessionId);
      if (!sess) return reply.code(404).send({ error: 'SESSION_NOT_FOUND' });

      return { balance: parseFloat(sess.balance as string) };
    }
  );
}
