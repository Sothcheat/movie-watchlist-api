import { dbEnvSchema, envSchema } from './env.schema.js';

const valid = {
  DB_USER: 'postgres',
  DB_PASSWORD: 'secret',
  DB_NAME: 'movie_watchlist',
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

describe('dbEnvSchema', () => {
  it('does not require app-only variables such as PORT', () => {
    expect(dbEnvSchema.safeParse(valid).success).toBe(true);
  });
});
