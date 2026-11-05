import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);

/** Comma-separated browser origins. Exact origins only: no wildcard, path or trailing slash. */
const corsOrigins = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(
        z.url().refine(
          // z.url() doesn't stop this check from running on a bad value, so guard the parse.
          (origin) => URL.canParse(origin) && new URL(origin).origin === origin,
          'must be an origin such as https://example.com',
        ),
      )
      .min(1),
  );

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

/**
 * Everything the app needs at startup. Validation failure stops the app from booting.
 * Later steps extend this as modules arrive (JWT, TMDB).
 */
export const envSchema = dbEnvSchema.extend({
  PORT: port.default(3000),
  CORS_ORIGINS: corsOrigins,
});

export type DbEnv = z.infer<typeof dbEnvSchema>;
export type Env = z.infer<typeof envSchema>;
