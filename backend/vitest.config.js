import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    // The app logs heavily (emoji banners, debug prints). Keep test output readable.
    onConsoleLog: () => false,
    testTimeout: 20000,
    hookTimeout: 20000,
    // Several modules keep module-level state (used challenge ids, singletons).
    // Isolate each test file in its own module graph.
    isolate: true,
  },
});
