import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // No e2e specs yet; remove this when the first one lands (Step 8).
    passWithNoTests: true,
  },
});
