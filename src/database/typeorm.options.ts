import type { DataSourceOptions } from 'typeorm';
import type { DbEnv } from '../config/env.schema.js';

/** Connection settings shared by the Nest app and the TypeORM CLI data source. */
export function buildDataSourceOptions(env: DbEnv): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    // Tests get their own database so they can never touch dev data.
    database: env.NODE_ENV === 'test' ? env.DB_TEST_NAME : env.DB_NAME,
    // Schema changes only ever go through generated migrations.
    synchronize: false,
  };
}
