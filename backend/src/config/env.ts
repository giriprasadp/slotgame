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
  // Key files (local dev): at least one of file-path or base64 must be supplied
  JWT_PRIVATE_KEY_PATH: z.string().optional(),
  JWT_PUBLIC_KEY_PATH:  z.string().optional(),
  // Base64-encoded PEM (Railway / PaaS — no filesystem mounts)
  JWT_PRIVATE_KEY_B64: z.string().optional(),
  JWT_PUBLIC_KEY_B64:  z.string().optional(),
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

/**
 * Read JWT RSA keys at startup.
 * Priority:
 *   1. JWT_PRIVATE_KEY_B64 / JWT_PUBLIC_KEY_B64  — base64-encoded PEM (Railway / PaaS)
 *   2. JWT_PRIVATE_KEY_PATH / JWT_PUBLIC_KEY_PATH — file paths (local dev / Docker volume)
 */
export function readJwtKeys() {
  // Option 1: base64 env vars (Railway — no filesystem mounts)
  if (ENV.JWT_PRIVATE_KEY_B64 && ENV.JWT_PUBLIC_KEY_B64) {
    const privateKey = Buffer.from(ENV.JWT_PRIVATE_KEY_B64, 'base64').toString('utf-8');
    const publicKey  = Buffer.from(ENV.JWT_PUBLIC_KEY_B64,  'base64').toString('utf-8');
    const privOk = privateKey.includes('PRIVATE KEY');
    const pubOk  = publicKey.includes('PUBLIC KEY');
    console.log(`[jwt-keys] source=b64 private_pem_valid=${privOk} public_pem_valid=${pubOk} private_len=${privateKey.length} public_len=${publicKey.length}`);
    if (!privOk || !pubOk) {
      throw new Error('JWT keys from B64 env vars do not appear to be valid PEM — check JWT_PRIVATE_KEY_B64 and JWT_PUBLIC_KEY_B64');
    }
    return { privateKey, publicKey };
  }

  // Option 2: file paths (local dev / Docker with volume mount)
  if (!ENV.JWT_PRIVATE_KEY_PATH || !ENV.JWT_PUBLIC_KEY_PATH) {
    throw new Error(
      'JWT keys not configured. Set JWT_PRIVATE_KEY_B64 + JWT_PUBLIC_KEY_B64 (base64 PEM) ' +
      'or JWT_PRIVATE_KEY_PATH + JWT_PUBLIC_KEY_PATH (file paths).'
    );
  }
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
