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
