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
  } catch {
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
