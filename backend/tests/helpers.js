import fs from 'fs';
import os from 'os';
import path from 'path';
import { vi } from 'vitest';

/** Minimal Express-style response double that records status and JSON body. */
export function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status: vi.fn(function (code) { res.statusCode = code; return res; }),
    json: vi.fn(function (payload) { res.body = payload; return res; }),
  };
  return res;
}

/** Fake pty process with the methods the app calls. */
export function fakePty() {
  return { onData: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
}

/** Fresh temp dir under the OS temp folder; caller removes it. */
export function makeTempDir(prefix = 'gw-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function rmDir(dir) {
  if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

/** Mongoose-style chainable query that resolves to `value`. */
export function chain(value) {
  const q = {
    select: vi.fn(() => q),
    sort: vi.fn(() => q),
    limit: vi.fn(() => q),
    lean: vi.fn(() => Promise.resolve(value)),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return q;
}
