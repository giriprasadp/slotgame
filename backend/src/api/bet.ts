import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, extractSession } from '../middleware/auth';
import { updateSessionSettings } from '../services/sessionService';
import { BET_LEVELS } from '../config/game';

const betSchema = z.object({
  betLevelIdx: z.number().int().min(0).max(8),
});

export async function betRoutes(app: FastifyInstance) {
  /** POST /api/v1/bet
   *  Update the bet level for the session. Returns new bet details. */
  app.post(
    '/',
    { preHandler: [requireAuth, extractSession] },
    async (request, reply) => {
      const body = betSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', details: body.error.format() });
      }

      const { betLevelIdx } = body.data;
      await updateSessionSettings(request.sessionId, { betLevelIdx });

      const level = BET_LEVELS[betLevelIdx];
      return {
        betLevelIdx,
        baseBet:  level.base,
        totalBet: level.total,
      };
    }
  );
}
