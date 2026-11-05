import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // All files share one test database, so they must not run at the same time.
    fileParallelism: false,
    // argon2 hashing, migrations and app start-up are slower than a unit test.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
