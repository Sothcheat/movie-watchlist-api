import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource, type MigrationInterface } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { dbEnvSchema } from '../../src/config/env.schema.js';
import { buildDataSourceOptions } from '../../src/database/typeorm.options.js';
import { TmdbService } from '../../src/tmdb/tmdb.service.js';
import { FakeTmdbService } from './fake-tmdb.js';

const MIGRATIONS_DIR = join(
  import.meta.dirname,
  '..',
  '..',
  'src',
  'database',
  'migrations',
);

/** Rate limiting off: lets a suite log in more than 5 times a minute. */
const unlimitedStorage = {
  increment: () =>
    Promise.resolve({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    }),
};

type MigrationClass = new () => MigrationInterface;

/** Every migration class in src/database/migrations, so new migrations are picked up automatically. */
async function loadMigrations(): Promise<MigrationClass[]> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.ts'))
    .sort();
  const modules = await Promise.all(
    files.map(
      (file) =>
        import(/* @vite-ignore */ join(MIGRATIONS_DIR, file)) as Promise<
          Record<string, unknown>
        >,
    ),
  );
  return modules
    .flatMap((mod) => Object.values(mod))
    .filter((value): value is MigrationClass => typeof value === 'function');
}

/**
 * Refuses to go on unless the connection is the dedicated test database. Every destructive
 * helper calls this first, so a wrong .env can never wipe development data.
 */
export async function assertTestDatabase(db: DataSource): Promise<void> {
  const env = dbEnvSchema.parse(process.env);
  const [{ name }] = (await db.query('SELECT current_database() AS name')) as {
    name: string;
  }[];
  if (name !== env.DB_TEST_NAME || name === env.DB_NAME) {
    throw new Error(
      `Refusing to run e2e tests against "${name}" (expected the test database "${env.DB_TEST_NAME}")`,
    );
  }
}

/** Applies any pending migrations to the test database. A no-op when it is up to date. */
export async function migrateTestDatabase(): Promise<void> {
  const db = new DataSource({
    ...buildDataSourceOptions(dbEnvSchema.parse(process.env)),
    migrations: await loadMigrations(),
  });
  await db.initialize();
  try {
    await assertTestDatabase(db);
    await db.runMigrations();
  } finally {
    await db.destroy();
  }
}

/** Empties every table (the migrations table is untouched) so each test starts clean. */
export async function resetDatabase(db: DataSource): Promise<void> {
  await assertTestDatabase(db);
  await db.query(
    'TRUNCATE TABLE "watchlist_items", "refresh_tokens", "users" CASCADE',
  );
}

export interface TestApp {
  app: INestApplication;
  db: DataSource;
}

/**
 * The real AppModule (real guards, pipes, filters, database) with two replacements:
 * TMDB is an in-memory fake, and rate limiting is off unless `realThrottling` is set.
 */
export async function createTestApp(
  options: { realThrottling?: boolean } = {},
): Promise<TestApp> {
  await migrateTestDatabase();

  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TmdbService)
    .useValue(new FakeTmdbService());
  if (!options.realThrottling) {
    builder.overrideProvider(ThrottlerStorage).useValue(unlimitedStorage);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();

  const db = app.get(DataSource);
  await resetDatabase(db);
  return { app, db };
}
