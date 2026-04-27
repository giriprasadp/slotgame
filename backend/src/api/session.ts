import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createSession, getSession, restartSession } from '../services/sessionService';
import { requireAuth, extractSession } from '../middleware/auth';
import { BET_LEVELS, STARTING_BALANCE } from '../config/game';
import { readJwtKeys } from '../config/env';

const initSchema = z.object({
  platform:  z.string().max(64).optional(),
  screenRes: z.string().max(32).optional(),
});

export async function sessionRoutes(app: FastifyInstance) {
  /** POST /api/v1/session/init
   *  Creates a new demo session and returns a signed JWT. */
  app.post('/init', async (request, reply) => {
    const body = initSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', details: body.error.format() });
    }

    const sess = await createSession({
      platform:  body.data.platform,
      screenRes: body.data.screenRes,
    });

    const token = await reply.jwtSign(
      { sub: sess.id },
      { expiresIn: '4h' }
    );

    const balance = parseFloat(sess.balance as string);
    request.log.info({
      event:      'session_init',
      sessionId:  sess.id,
      balance,
      platform:   body.data.platform ?? null,
    }, 'currency:session_init');

    return reply.code(201).send({
      token,
      sessionId:   sess.id,
      balance,
      betLevelIdx: sess.betLevelIdx,
      gameConfig: {
        betLevels:       BET_LEVELS,
        startingBalance: STARTING_BALANCE,
      },
    });
  });

  /** GET /api/v1/session/restore
   *  Returns current session state — used for crash recovery on page reload. */
  app.get(
    '/restore',
    { preHandler: [requireAuth, extractSession] },
    async (request, reply) => {
      const sess = await getSession(request.sessionId);
      if (!sess) return reply.code(404).send({ error: 'SESSION_NOT_FOUND' });

      const { db, schema } = await import('../db');
      const { sql } = await import('drizzle-orm');

      // Check for active Free Spins session
      const fsRows = await db
        .select()
        .from(schema.freeSpinsSessions)
        .where(sql`session_id = ${sess.id} AND completed = false`)
        .limit(1);
      const fs = fsRows[0] ?? null;

      return {
        balance:     parseFloat(sess.balance as string),
        betLevelIdx: sess.betLevelIdx,
        quickSpin:   sess.quickSpin,
        totalSpins:  sess.totalSpins,
        freeSpinsState: fs ? {
          remaining:    fs.spinsRemaining,
          completed:    fs.spinsCompleted,
          runningTotal: parseFloat(fs.runningTotal as string),
          lockedBet:    parseFloat(fs.lockedBet as string),
        } : null,
      };
    }
  );

  /** POST /api/v1/session/restart
   *  Resets economy to 50,000 coins (Restart button). */
  app.post(
    '/restart',
    { preHandler: [requireAuth, extractSession] },
    async (request, reply) => {
      const sess = await restartSession(request.sessionId);
      const balance = parseFloat(sess.balance as string);
      request.log.info({
        event:        'economy_restart',
        sessionId:    request.sessionId,
        balanceAfter: balance,
        restartCount: sess.restartCount,
      }, 'currency:economy_restart');
      return {
        balance,
        betLevelIdx:  sess.betLevelIdx,
        restartCount: sess.restartCount,
      };
    }
  );
}
