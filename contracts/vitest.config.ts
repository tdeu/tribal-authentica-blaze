import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: { globals: true, setupFiles: ['test/setup.ts'], include: ['test/**/*.test.ts'] },
});
