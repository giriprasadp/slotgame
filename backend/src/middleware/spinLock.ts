import type { FastifyRequest, FastifyReply } from 'fastify';
import { acquireSpinLock } from '../cache/redis';
import { AppError } from './auth';

/** onRequest hook for spin endpoints — acquires Redis lock for the session.
 *  The lock is released in the route handler's finally block via releaseSpinLock(). */
export async function spinLockHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // sessionId is set by extractSession (runs before this)
  const acquired = await acquireSpinLock(request.sessionId);
  if (!acquired) {
    reply.code(409).send({
      error: 'SPIN_IN_PROGRESS',
      message: 'A spin is already in progress for this session',
    });
  }
}
