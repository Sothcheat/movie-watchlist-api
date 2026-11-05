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

const databaseUrl = z.url({ protocol: /^postgres(ql)?$/ });

/** Secrets in .env.example start with this, so a copied example is caught in production. */
const PLACEHOLDER_PREFIX = 'change-me';

/** pg-connection-string treats `require` as `verify-full` with a warning, so production says it outright. */
function hasVerifyFullSsl(url: string): boolean {
  return new URL(url).searchParams.get('sslmode') === 'verify-full';
}

const dbEnvShape = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  /** Pooled connection string (Neon's -pooler host), used by the app. Replaces the DB_* settings. */
  DATABASE_URL: databaseUrl.optional(),
  /** Direct connection string for migrations, which must not go through PgBouncer. */
  DATABASE_URL_UNPOOLED: databaseUrl.optional(),
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: port.default(5432),
  DB_USER: z.string().min(1).optional(),
  DB_PASSWORD: z.string().min(1).optional(),
  DB_NAME: z.string().min(1).optional(),
  DB_TEST_NAME: z.string().min(1).default('movie_watchlist_test'),
});

type DbEnvShape = z.output<typeof dbEnvShape>;

/** Rules shared by the app and the TypeORM CLI. */
function checkDbEnv(env: DbEnvShape, ctx: z.RefinementCtx<DbEnvShape>) {
  if (!env.DATABASE_URL) {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          message: 'required when DATABASE_URL is not set',
          path: [key],
        });
      }
    }
  }

  if (env.NODE_ENV !== 'production') {
    return;
  }
  for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED'] as const) {
    const url = env[key];
    if (!url || !hasVerifyFullSsl(url)) {
      ctx.addIssue({
        code: 'custom',
        message: 'required in production, with sslmode=verify-full',
        path: [key],
      });
    }
  }
}

/** Variables the TypeORM CLI needs. Kept separate so migrations don't require app-only secrets. */
export const dbEnvSchema = dbEnvShape.superRefine(checkDbEnv);

export const envSchema = dbEnvShape
  .extend({
    PORT: port.default(3000),
    /**
     * Shared with the Vercel proxy, which adds it to every request as x-origin-secret.
     * When set, requests without it are refused. Leave unset in development.
     */
    ORIGIN_SECRET: z.string().min(32).optional(),
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
  .superRefine(checkDbEnv)
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    message: 'must differ from JWT_ACCESS_SECRET',
    path: ['JWT_REFRESH_SECRET'],
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }
    if (!env.ORIGIN_SECRET) {
      ctx.addIssue({
        code: 'custom',
        message: 'required in production',
        path: ['ORIGIN_SECRET'],
      });
    }
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (env[key].startsWith(PLACEHOLDER_PREFIX)) {
        ctx.addIssue({
          code: 'custom',
          message: 'is still the .env.example placeholder',
          path: [key],
        });
      }
    }
  });

export type DbEnv = z.infer<typeof dbEnvSchema>;
export type Env = z.infer<typeof envSchema>;
