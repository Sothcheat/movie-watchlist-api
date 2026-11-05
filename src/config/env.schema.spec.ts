import { dbEnvSchema, envSchema } from './env.schema.js';

const valid = {
  DB_USER: 'postgres',
  DB_PASSWORD: 'secret',
  DB_NAME: 'movie_watchlist',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_SECRET: 'r'.repeat(32),
  JWT_REFRESH_TTL: '7d',
  TMDB_ACCESS_TOKEN: 'tmdb-token',
};

describe('envSchema', () => {
  it('applies defaults for optional variables', () => {
    const env = envSchema.parse(valid);

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      DB_TEST_NAME: 'movie_watchlist_test',
    });
  });

  it('coerces numeric strings, as process.env only holds strings', () => {
    const env = envSchema.parse({ ...valid, PORT: '4000', DB_PORT: '5433' });

    expect(env.PORT).toBe(4000);
    expect(env.DB_PORT).toBe(5433);
  });

  it.each(['DB_USER', 'DB_PASSWORD', 'DB_NAME'])(
    'rejects a missing %s',
    (key) => {
      const { [key]: _omitted, ...rest } = valid as Record<string, string>;

      expect(envSchema.safeParse(rest).success).toBe(false);
    },
  );

  it('rejects an empty password', () => {
    expect(envSchema.safeParse({ ...valid, DB_PASSWORD: '' }).success).toBe(
      false,
    );
  });

  it('rejects an unknown NODE_ENV and an out-of-range port', () => {
    expect(envSchema.safeParse({ ...valid, NODE_ENV: 'staging' }).success).toBe(
      false,
    );
    expect(envSchema.safeParse({ ...valid, PORT: '70000' }).success).toBe(
      false,
    );
  });
});

describe('DATABASE_URL', () => {
  const { DB_USER: _u, DB_PASSWORD: _p, DB_NAME: _n, ...withoutDb } = valid;
  const URL = 'postgresql://app:pw@db.example.com/movies?sslmode=verify-full';

  it('replaces DB_USER, DB_PASSWORD and DB_NAME', () => {
    expect(
      envSchema.safeParse({ ...withoutDb, DATABASE_URL: URL }).success,
    ).toBe(true);
    expect(
      dbEnvSchema.safeParse({ ...withoutDb, DATABASE_URL: URL }).success,
    ).toBe(true);
  });

  it('names each missing DB_* variable when there is no URL', () => {
    const result = envSchema.safeParse(withoutDb);

    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['DB_USER'],
      ['DB_PASSWORD'],
      ['DB_NAME'],
    ]);
  });

  it.each(['https://db.example.com/movies', 'not a url'])(
    'rejects %j',
    (value) => {
      expect(
        envSchema.safeParse({ ...valid, DATABASE_URL: value }).success,
      ).toBe(false);
    },
  );
});

describe('ORIGIN_SECRET', () => {
  it('is optional outside production', () => {
    expect(envSchema.parse(valid).ORIGIN_SECRET).toBeUndefined();
  });

  it('must be 32+ characters when set', () => {
    expect(
      envSchema.safeParse({ ...valid, ORIGIN_SECRET: 'o'.repeat(31) }).success,
    ).toBe(false);
    expect(
      envSchema.safeParse({ ...valid, ORIGIN_SECRET: 'o'.repeat(32) }).success,
    ).toBe(true);
  });
});

describe('production guards', () => {
  const NEON =
    'postgresql://app:pw@ep-x-pooler.neon.tech/movies?sslmode=verify-full';
  const NEON_DIRECT =
    'postgresql://app:pw@ep-x.neon.tech/movies?sslmode=verify-full';
  const production = {
    ...valid,
    NODE_ENV: 'production',
    DATABASE_URL: NEON,
    DATABASE_URL_UNPOOLED: NEON_DIRECT,
    ORIGIN_SECRET: 'o'.repeat(32),
  };
  const failedPaths = (env: Record<string, unknown>) =>
    envSchema.safeParse(env).error?.issues.map((issue) => issue.path);

  it('accepts a complete production config', () => {
    expect(envSchema.safeParse(production).success).toBe(true);
  });

  it('requires ORIGIN_SECRET', () => {
    const { ORIGIN_SECRET: _omitted, ...rest } = production;

    expect(failedPaths(rest)).toEqual([['ORIGIN_SECRET']]);
  });

  it('rejects a short ORIGIN_SECRET', () => {
    expect(failedPaths({ ...production, ORIGIN_SECRET: 'short' })).toEqual([
      ['ORIGIN_SECRET'],
    ]);
  });

  it.each(['DATABASE_URL', 'DATABASE_URL_UNPOOLED'] as const)(
    'requires %s',
    (key) => {
      const { [key]: _omitted, ...rest } = production;

      expect(failedPaths(rest)).toEqual([[key]]);
    },
  );

  it.each([
    ['sslmode=require', NEON.replace('verify-full', 'require')],
    ['no sslmode', NEON.replace('?sslmode=verify-full', '')],
  ])('rejects a DATABASE_URL with %s', (_label, url) => {
    expect(failedPaths({ ...production, DATABASE_URL: url })).toEqual([
      ['DATABASE_URL'],
    ]);
  });

  it('applies the URL rules to the CLI schema too', () => {
    const { DATABASE_URL_UNPOOLED: _omitted, ...rest } = production;

    expect(dbEnvSchema.safeParse(rest).success).toBe(false);
  });

  it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const)(
    'rejects the .env.example placeholder for %s',
    (key) => {
      const placeholder = `change-me-${key}`.padEnd(40, '-');

      expect(failedPaths({ ...production, [key]: placeholder })).toEqual([
        [key],
      ]);
    },
  );

  it('allows placeholder secrets outside production', () => {
    expect(
      envSchema.safeParse({
        ...valid,
        JWT_ACCESS_SECRET: 'change-me-to-a-random-string-of-32-plus-chars',
      }).success,
    ).toBe(true);
  });
});

describe('JWT settings', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['12h', 43200],
    ['7d', 604800],
  ])('parses the TTL %s to %i seconds', (ttl, seconds) => {
    expect(
      envSchema.parse({ ...valid, JWT_ACCESS_TTL: ttl }).JWT_ACCESS_TTL,
    ).toBe(seconds);
  });

  it.each(['15', '15 m', '1w', '-5m', '0m', ''])(
    'rejects the TTL %j',
    (ttl) => {
      expect(
        envSchema.safeParse({ ...valid, JWT_REFRESH_TTL: ttl }).success,
      ).toBe(false);
    },
  );

  it('rejects a secret shorter than 32 characters', () => {
    expect(
      envSchema.safeParse({ ...valid, JWT_ACCESS_SECRET: 'a'.repeat(31) })
        .success,
    ).toBe(false);
  });

  it('rejects the same secret for access and refresh tokens', () => {
    const result = envSchema.safeParse({
      ...valid,
      JWT_REFRESH_SECRET: valid.JWT_ACCESS_SECRET,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['JWT_REFRESH_SECRET']);
  });
});

describe('REFRESH_TOKEN_RETENTION', () => {
  it('defaults to 7 days when unset', () => {
    expect(envSchema.parse(valid).REFRESH_TOKEN_RETENTION).toBe(604800);
  });

  it('parses a custom value to seconds', () => {
    expect(
      envSchema.parse({ ...valid, REFRESH_TOKEN_RETENTION: '30d' })
        .REFRESH_TOKEN_RETENTION,
    ).toBe(2592000);
  });

  it.each(['7', '1w', '0d', ''])('rejects %j', (value) => {
    expect(
      envSchema.safeParse({ ...valid, REFRESH_TOKEN_RETENTION: value }).success,
    ).toBe(false);
  });
});

describe('TMDB settings', () => {
  it('requires an access token', () => {
    const { TMDB_ACCESS_TOKEN: _omitted, ...rest } = valid;

    expect(envSchema.safeParse(rest).success).toBe(false);
    expect(
      envSchema.safeParse({ ...valid, TMDB_ACCESS_TOKEN: '' }).success,
    ).toBe(false);
  });

  it('defaults the base URL to the v3 API', () => {
    expect(envSchema.parse(valid).TMDB_BASE_URL).toBe(
      'https://api.themoviedb.org/3',
    );
  });

  it('strips trailing slashes from the base URL', () => {
    expect(
      envSchema.parse({ ...valid, TMDB_BASE_URL: 'https://tmdb.test/3//' })
        .TMDB_BASE_URL,
    ).toBe('https://tmdb.test/3');
  });

  it('rejects a base URL that is not a URL', () => {
    expect(
      envSchema.safeParse({ ...valid, TMDB_BASE_URL: 'api.themoviedb.org' })
        .success,
    ).toBe(false);
  });
});

describe('dbEnvSchema', () => {
  it('does not require app-only variables such as PORT', () => {
    expect(dbEnvSchema.safeParse(valid).success).toBe(true);
  });
});
