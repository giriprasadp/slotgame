import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import * as fs from 'fs';
import { ENV, readJwtKeys } from './config/env';
import { sessionRoutes } from './api/session';
import { spinRoutes } from './api/spin';
import { walletRoutes } from './api/wallet';
import { betRoutes } from './api/bet';
import { analyticsRoutes } from './api/analytics';
import { adminRoutes } from './api/admin';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: ENV.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: ENV.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    trustProxy: true,
  });

  /* ─── Security plugins ──────────────────────────────────────────────── */
  await app.register(helmet, {
    contentSecurityPolicy: false, // API-only, no HTML
  });

  await app.register(cors, {
    origin: ENV.CORS_ORIGIN === '*'
      ? true
      : ENV.CORS_ORIGIN.split(',').map(s => s.trim()),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  });

  await app.register(rateLimit, {
    max:      ENV.RATE_LIMIT_MAX,
    timeWindow: ENV.RATE_LIMIT_WINDOW,
    keyGenerator: (req) => {
      // Rate limit by session token sub claim if present, else IP
      try {
        const auth = req.headers.authorization ?? '';
        const token = auth.replace(/^Bearer\s+/i, '');
        if (token) {
          const payload = JSON.parse(
            Buffer.from(token.split('.')[1], 'base64url').toString()
          );
          return payload.sub ?? req.ip;
        }
      } catch { /* fall through */ }
      return req.ip;
    },
    errorResponseBuilder: () => ({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests — please slow down',
    }),
  });

  /* ─── JWT (RS256) ─────────────────────────────────────────────────── */
  const { privateKey, publicKey } = readJwtKeys();
  await app.register(jwt, {
    secret: {
      private: privateKey,
      public:  publicKey,
    },
    sign: {
      algorithm: 'RS256',
      expiresIn: ENV.JWT_EXPIRY,
    },
    verify: {
      algorithms: ['RS256'],
    },
  });

  /* ─── Global error handler ────────────────────────────────────────── */
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    const code       = (error as { code?: string }).code ?? 'INTERNAL_ERROR';
    app.log.error(error);
    reply.code(statusCode).send({
      error:   code,
      message: ENV.NODE_ENV === 'production' && statusCode === 500
        ? 'Internal server error'
        : error.message,
    });
  });

  /* ─── Routes ──────────────────────────────────────────────────────── */
  const prefix = '/api/v1';

  await app.register(sessionRoutes,  { prefix: `${prefix}/session` });
  await app.register(spinRoutes,     { prefix: `${prefix}/spin` });
  await app.register(walletRoutes,   { prefix: `${prefix}/wallet` });
  await app.register(betRoutes,      { prefix: `${prefix}/bet` });
  await app.register(analyticsRoutes,{ prefix: `${prefix}/analytics` });
  await app.register(adminRoutes,    { prefix: `${prefix}/admin` });

  /* ─── Health check ────────────────────────────────────────────────── */
  app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

  return app;
}
