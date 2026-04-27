import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Resolve .env from the backend root — works regardless of cwd
const ENV_PATH = path.resolve(__dirname, '..', '..', '.env');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_PRIVATE_KEY_PATH: z.string().min(1),
  JWT_PUBLIC_KEY_PATH: z.string().min(1),
  JWT_EXPIRY: z.string().default('4h'),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  RATE_LIMIT_WINDOW: z.coerce.number().int().min(100).default(10000),
  ANALYTICS_STREAM_KEY: z.string().default('stream:analytics'),
  ANALYTICS_CONSUMER_GROUP: z.string().default('analytics-workers'),
  ADMIN_API_KEY: z.string().min(8).default('changeme_admin_key_here'),
});

function loadEnv() {
  // Load .env from backend root — works regardless of terminal cwd
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌  Invalid environment variables:\n', parsed.error.format());
    process.exit(1);
  }
  return parsed.data;
}

export const ENV = loadEnv();

// Read JWT key files once at startup — resolve relative paths from backend root
export function readJwtKeys() {
  const root = path.resolve(__dirname, '..', '..');
  const privatePath = path.isAbsolute(ENV.JWT_PRIVATE_KEY_PATH)
    ? ENV.JWT_PRIVATE_KEY_PATH
    : path.resolve(root, ENV.JWT_PRIVATE_KEY_PATH);
  const publicPath = path.isAbsolute(ENV.JWT_PUBLIC_KEY_PATH)
    ? ENV.JWT_PUBLIC_KEY_PATH
    : path.resolve(root, ENV.JWT_PUBLIC_KEY_PATH);
  const privateKey = fs.readFileSync(privatePath, 'utf-8');
  const publicKey  = fs.readFileSync(publicPath,  'utf-8');
  return { privateKey, publicKey };
}
