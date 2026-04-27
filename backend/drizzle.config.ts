import type { Config } from 'drizzle-kit';
import * as fs from 'fs';

// Load DATABASE_URL from .env manually (drizzle-kit runs before app)
const envFile = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf-8') : '';
const dbUrl = envFile
  .split('\n')
  .find(l => l.startsWith('DATABASE_URL='))
  ?.slice('DATABASE_URL='.length)
  .trim() ?? process.env.DATABASE_URL ?? 'postgres://myuser:pass123@localhost:5432/huffpuff';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl,
  },
  verbose: true,
  strict: true,
} satisfies Config;
