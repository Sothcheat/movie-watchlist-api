import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);

const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/** A duration such as `15m` or `7d`, parsed to seconds. */
const duration = z
  .string()
  .regex(/^\d+[smhd]$/, 'must look like 30s, 15m, 12h or 7d')
  .transform((value) => {
    const unit = value.slice(-1) as keyof typeof UNIT_SECONDS;
    return Number(value.slice(0, -1)) * UNIT_SECONDS[unit];
  })
  .pipe(z.number().int().positive());

/** HS256 signing secret. The app enforces 32+ characters; generate 32 random bytes (see .env.example). */
const jwtSecret = z.string().min(32);

/** Variables the TypeORM CLI needs. Kept separate so migrations don't require app-only secrets. */
export const dbEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: port.default(5432),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  DB_TEST_NAME: z.string().min(1).default('movie_watchlist_test'),
});

export const envSchema = dbEnvSchema
  .extend({
    PORT: port.default(3000),
    JWT_ACCESS_SECRET: jwtSecret,
    JWT_ACCESS_TTL: duration,
    JWT_REFRESH_SECRET: jwtSecret,
    JWT_REFRESH_TTL: duration,
    /** How long an expired refresh-token row is kept before the nightly purge deletes it. */
    REFRESH_TOKEN_RETENTION: z.string().default('7d').pipe(duration),
    /** TMDB "API Read Access Token", sent as a Bearer token. */
    TMDB_ACCESS_TOKEN: z.string().min(1),
    TMDB_BASE_URL: z
      .url()
      .default('https://api.themoviedb.org/3')
      .transform((url) => url.replace(/\/+$/, '')),
  })
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    message: 'must differ from JWT_ACCESS_SECRET',
    path: ['JWT_REFRESH_SECRET'],
  });

export type DbEnv = z.infer<typeof dbEnvSchema>;
export type Env = z.infer<typeof envSchema>;
