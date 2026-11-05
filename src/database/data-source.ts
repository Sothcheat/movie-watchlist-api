import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { dbEnvSchema } from '../config/env.schema.js';
import { buildDataSourceOptions } from './typeorm.options.js';

// Used by the TypeORM CLI only; the Nest app uses DatabaseModule.
// TypeORM 1.x no longer loads .env itself; the file is optional (absent in Docker).
if (existsSync('.env')) {
  process.loadEnvFile();
}

// The CLI always runs the compiled output in dist/, so the globs match .js only
// (a *.ts glob would also pick up the generated .d.ts files).
const srcRoot = join(import.meta.dirname, '..');

const env = dbEnvSchema.parse(process.env);

export default new DataSource({
  // Migrations take Neon's direct host: PgBouncer in transaction mode can't hold their locks.
  ...buildDataSourceOptions(env, env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL),
  entities: [join(srcRoot, '**', '*.entity.js')],
  migrations: [join(import.meta.dirname, 'migrations', '*.js')],
});
