import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_URL: z.url(),
  COOKIE_SECURE: z.stringbool().default(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  // Do not print the environment itself: it contains secrets.
  console.error(`Invalid configuration: ${details}`);
  process.exit(1);
}

export const config = {
  databaseUrl: parsed.data.DATABASE_URL,
  redisUrl: parsed.data.REDIS_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  port: parsed.data.PORT,
  // Strip a trailing slash so URL building never produces `//hook/...`.
  publicUrl: parsed.data.PUBLIC_URL.replace(/\/+$/, ''),
  cookieSecure: parsed.data.COOKIE_SECURE,
} as const;
