import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from './schema';
import { ENV } from '../config/env';
import * as path from 'path';

const queryClient = postgres(ENV.DATABASE_URL, {
  max: 20,          // connection pool size
  idle_timeout: 30,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });

export async function runMigrations() {
  const migrationClient = postgres(ENV.DATABASE_URL, { max: 1 });
  const migDb = drizzle(migrationClient);
  await migrate(migDb, {
    migrationsFolder: path.join(__dirname, 'migrations'),
  });
  await migrationClient.end();
}

export { schema };
