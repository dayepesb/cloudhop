import { defineConfig } from 'vitest/config';

// End-to-end tests run the built bundle (`pnpm build` first), so they live apart from unit tests.
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.test.ts'],
    testTimeout: 30_000,
  },
});
