import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { dbEnvSchema } from '../config/env.schema.js';
import { buildDataSourceOptions } from './typeorm.options.js';

// Entry point for the TypeORM CLI only (the Nest app uses DatabaseModule).
// TypeORM 1.x no longer loads .env itself; skip the file when it's absent (e.g. in Docker).
if (existsSync('.env')) {
  process.loadEnvFile();
}

// The CLI always runs the compiled output in dist/, so the globs match .js only
// (a *.ts glob would also pick up the generated .d.ts files).
const srcRoot = join(import.meta.dirname, '..');

export default new DataSource({
  ...buildDataSourceOptions(dbEnvSchema.parse(process.env)),
  entities: [join(srcRoot, '**', '*.entity.js')],
  migrations: [join(import.meta.dirname, 'migrations', '*.js')],
});
