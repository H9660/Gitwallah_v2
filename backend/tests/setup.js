// Global test setup.
// - Fixes secrets/env so tests never depend on a developer's .env file.
// - Replaces node-pty (a native module) with a fake, so the suite runs without
//   a C++ toolchain, Docker, MongoDB, or network access.
import { vi } from 'vitest';

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.OPENROUTER_API_KEY = '';
process.env.GIT_AUTHOR_NAME = 'Test Bot';
process.env.GIT_AUTHOR_EMAIL = 'test@example.com';
process.env.GIT_COMMITTER_NAME = 'Test Bot';
process.env.GIT_COMMITTER_EMAIL = 'test@example.com';
// The app calls configureGit() at runtime, which sets init.defaultBranch=main
// globally; static challenges rely on it ("git checkout main"). Provide the
// same setting to child git processes without touching the user's config.
process.env.GIT_CONFIG_COUNT = '1';
process.env.GIT_CONFIG_KEY_0 = 'init.defaultBranch';
process.env.GIT_CONFIG_VALUE_0 = 'main';

vi.mock('node-pty', () => {
  const spawn = vi.fn(() => ({
    onData: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  }));
  return { default: { spawn }, spawn };
});
