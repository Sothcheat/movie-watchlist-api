import { existsSync } from 'node:fs';

// .env supplies the database settings. loadEnvFile never overrides variables that are already
// set, so a CI job can provide DB_* directly and needs no .env file.
if (existsSync('.env')) {
  process.loadEnvFile();
}

// Fixed on purpose, whatever .env says: the tests never see real secrets or the real TMDB token.
Object.assign(process.env, {
  NODE_ENV: 'test', // makes the app use DB_TEST_NAME instead of DB_NAME
  JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789abcdef0123456789',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret-fedcba9876543210fedcba9876',
  JWT_REFRESH_TTL: '7d',
  CORS_ORIGINS: 'http://localhost:3000',
  TMDB_ACCESS_TOKEN: 'e2e-dummy-token',
  // A closed port: a TMDB call that isn't replaced by the fake fails fast and never leaves the machine.
  TMDB_BASE_URL: 'http://127.0.0.1:9/3',
});
