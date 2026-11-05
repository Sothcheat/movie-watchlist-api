import { dbEnvSchema } from '../config/env.schema.js';
import { buildDataSourceOptions } from './typeorm.options.js';

const URL =
  'postgresql://app:pw@ep-x-pooler.neon.tech/movies?sslmode=verify-full';
const base = {
  DB_USER: 'postgres',
  DB_PASSWORD: 'secret',
  DB_NAME: 'movie_watchlist',
};

describe('buildDataSourceOptions', () => {
  it('uses DATABASE_URL instead of the DB_* settings when it is set', () => {
    const options = buildDataSourceOptions(
      dbEnvSchema.parse({ ...base, DATABASE_URL: URL }),
    );

    expect(options).toMatchObject({ type: 'postgres', url: URL });
    expect(options).not.toHaveProperty('host');
  });

  it('takes an explicit URL, as the CLI does for the unpooled one', () => {
    const direct = URL.replace('-pooler', '');
    const options = buildDataSourceOptions(
      dbEnvSchema.parse({ ...base, DATABASE_URL: URL }),
      direct,
    );

    expect(options).toMatchObject({ url: direct });
  });

  it('uses the DB_* settings without a URL', () => {
    expect(buildDataSourceOptions(dbEnvSchema.parse(base))).toMatchObject({
      host: 'localhost',
      username: 'postgres',
      database: 'movie_watchlist',
    });
  });

  it('ignores the URL in tests and connects to DB_TEST_NAME', () => {
    const options = buildDataSourceOptions(
      dbEnvSchema.parse({ ...base, NODE_ENV: 'test', DATABASE_URL: URL }),
    );

    expect(options).not.toHaveProperty('url');
    expect(options).toMatchObject({ database: 'movie_watchlist_test' });
  });
});
