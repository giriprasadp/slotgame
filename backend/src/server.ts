import { buildApp } from './app';
import { ENV } from './config/env';
import { runMigrations } from './db';
import { redis } from './cache/redis';
import { startAnalyticsWorker } from './workers/analyticsWorker';
import { startRtpSnapshotWorker } from './workers/rtpSnapshotWorker';

async function main() {
  /* 1. Run DB migrations */
  console.log('Running database migrations...');
  await runMigrations();
  console.log('Migrations complete.');

  /* 2. Connect to Redis */
  await redis.connect();
  console.log('Redis connected.');

  /* 3. Build and start Fastify */
  const app = await buildApp();
  await app.listen({ port: ENV.PORT, host: '0.0.0.0' });
  console.log(`Server listening on port ${ENV.PORT} [${ENV.NODE_ENV}]`);

  /* 4. Start background workers */
  startRtpSnapshotWorker();

  // Analytics worker runs its own blocking loop in-process.
  // In production, split this into a separate worker process/container.
  startAnalyticsWorker().catch(err => {
    console.error('[analytics-worker] fatal:', err);
  });

  /* 5. Graceful shutdown */
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully`);
    try {
      await app.close();
      await redis.quit();
      console.log('Shutdown complete.');
    } catch (err) {
      console.error('Error during shutdown:', err);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
