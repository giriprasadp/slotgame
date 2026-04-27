import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, extractSession } from '../middleware/auth';
import { spinLockHook } from '../middleware/spinLock';
import { executeSpin, executeBuySpin } from '../services/spinService';
import { BET_LEVELS } from '../config/game';
import type { SpinType } from '../engine/types';

const spinSchema = z.object({
  betLevelIdx: z.number().int().min(0).max(8),
  spinType:    z.enum(['manual', 'autoplay', 'free_spin', 'buy_fs', 'buy_wheel']).default('manual'),
});

const buySchema = z.object({
  featureType: z.enum(['FS', 'WHEEL']),
  betLevelIdx: z.number().int().min(0).max(8),
});

export async function spinRoutes(app: FastifyInstance) {
  /** POST /api/v1/spin
   *  Core spin endpoint. Acquires spin lock, runs full server-side chain,
   *  credits winnings atomically, returns complete SpinResponse. */
  app.post(
    '/',
    { preHandler: [requireAuth, extractSession, spinLockHook] },
    async (request, reply) => {
      const body = spinSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', details: body.error.format() });
      }

      const { betLevelIdx, spinType } = body.data;

      try {
        const result = await executeSpin({
          sessionId:   request.sessionId,
          betLevelIdx,
          spinType:    spinType as SpinType,
        });

        request.log.info({
          event:        'spin',
          sessionId:    request.sessionId,
          spinId:       result.spinId,
          spinType,
          betLevelIdx,
          bet:          result.bet,
          totalWin:     result.totalWin,
          balanceBefore: result.balanceBefore,
          balanceAfter:  result.balanceAfter,
          net:           result.balanceAfter - result.balanceBefore,
          chainLength:  result.chainLength,
          maxMultiplier: result.maxMultiplier,
          features:     result.features.map(f => f.type),
          gameMode:     result.freeSpinsState ? 'FS' : 'BASE',
          fsRemaining:  result.freeSpinsState?.remaining ?? null,
        }, 'currency:spin');

        return result;
      } catch (err: unknown) {
        const e = err as { statusCode?: number; code?: string; message?: string };
        const code   = e.code ?? 'SPIN_ERROR';
        const status = e.statusCode ?? 500;
        request.log.warn({
          event:     'spin_error',
          sessionId: request.sessionId,
          spinType,
          betLevelIdx,
          errorCode: code,
          status,
          message:   e.message,
        }, 'currency:spin_error');
        return reply.code(status).send({ error: code, message: e.message });
      }
    }
  );

  /** POST /api/v1/spin/buy
   *  Purchase instant Free Spins or Wheel spin (Buy Feature — GDD §13). */
  app.post(
    '/buy',
    { preHandler: [requireAuth, extractSession, spinLockHook] },
    async (request, reply) => {
      const body = buySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', details: body.error.format() });
      }

      try {
        const result = await executeBuySpin({
          sessionId:   request.sessionId,
          featureType: body.data.featureType,
          betLevelIdx: body.data.betLevelIdx,
        });

        request.log.info({
          event:        'buy_spin',
          sessionId:    request.sessionId,
          spinId:       result.spinId,
          featureType:  body.data.featureType,
          betLevelIdx:  body.data.betLevelIdx,
          cost:         result.bet,
          totalWin:     result.totalWin,
          balanceBefore: result.balanceBefore,
          balanceAfter:  result.balanceAfter,
          net:           result.balanceAfter - result.balanceBefore,
          features:     result.features.map(f => f.type),
        }, 'currency:buy_spin');

        return result;
      } catch (err: unknown) {
        const e = err as { statusCode?: number; code?: string; message?: string };
        const code   = e.code ?? 'BUY_ERROR';
        const status = e.statusCode ?? 500;
        request.log.warn({
          event:       'buy_spin_error',
          sessionId:   request.sessionId,
          featureType: body.data.featureType,
          betLevelIdx: body.data.betLevelIdx,
          errorCode:   code,
          status,
          message:     e.message,
        }, 'currency:buy_spin_error');
        return reply.code(status).send({ error: code, message: e.message });
      }
    }
  );
}
