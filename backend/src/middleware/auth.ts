import type { FastifyRequest, FastifyReply } from 'fastify';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

/** Attach to Fastify as onRequest hook after JWT verify. */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err) {
    const reason = (err instanceof Error) ? err.message : String(err);
    const authHeader = request.headers['authorization'];
    request.log.warn({
      event: 'auth_failed',
      reason,
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader ? authHeader.slice(0, 20) : null,
      url: request.url,
      method: request.method,
    }, `JWT verification failed: ${reason}`);
    reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Missing or invalid token' });
  }
}

/** Admin routes — verify X-Admin-Key header against env. */
export async function requireAdminKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { ENV } = await import('../config/env');
  const key = (request.headers['x-admin-key'] ?? '') as string;
  if (key !== ENV.ADMIN_API_KEY) {
    reply.code(403).send({ error: 'FORBIDDEN', message: 'Invalid admin key' });
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    sessionId: string;
  }
}

/** Extract sessionId from verified JWT payload — call after requireAuth. */
export async function extractSession(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const payload = request.user as { sub: string };
  request.sessionId = payload.sub;
}
