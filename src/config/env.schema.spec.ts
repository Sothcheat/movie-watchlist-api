import { dbEnvSchema, envSchema } from './env.schema.js';

const valid = {
  DB_USER: 'postgres',
  DB_PASSWORD: 'secret',
  DB_NAME: 'movie_watchlist',
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_SECRET: 'r'.repeat(32),
  JWT_REFRESH_TTL: '7d',
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

  it.each(['DB_USER', 'DB_PASSWORD', 'DB_NAME', 'CORS_ORIGINS'])(
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

describe('CORS_ORIGINS', () => {
  const parse = (CORS_ORIGINS: string) =>
    envSchema.safeParse({ ...valid, CORS_ORIGINS });

  it('splits a comma-separated list and trims whitespace', () => {
    const result = parse('http://localhost:3000, https://app.example.com ');

    expect(result.data?.CORS_ORIGINS).toEqual([
      'http://localhost:3000',
      'https://app.example.com',
    ]);
  });

  it.each([
    ['a wildcard', '*'],
    ['an empty value', ''],
    ['a trailing slash', 'https://app.example.com/'],
    ['a path', 'https://app.example.com/app'],
    ['a value that is not a URL', 'localhost:3000'],
  ])('rejects %s', (_label, value) => {
    expect(parse(value).success).toBe(false);
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

describe('dbEnvSchema', () => {
  it('does not require app-only variables such as PORT', () => {
    expect(dbEnvSchema.safeParse(valid).success).toBe(true);
  });
});
