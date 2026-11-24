import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import challenges from '../challenges.js';
import { makeTempDir, rmDir } from './helpers.js';

// Some setup code shells out with POSIX syntax; run these on Linux/macOS (CI).
const isWindows = process.platform === 'win32' && !process.env.FORCE_POSIX_TESTS;
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

describe('static challenge catalogue', () => {
  it('has unique ids', () => {
    const ids = challenges.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every difficulty level', () => {
    for (const level of LEVELS) expect(challenges.some(c => c.difficulty === level)).toBe(true);
  });

  it.each(challenges.map(c => [c.id, c]))('%s has all fields the judge and UI need', (_id, c) => {
    expect(LEVELS).toContain(c.difficulty);
    expect(c.title).toBeTypeOf('string');
    expect(c.title.length).toBeGreaterThan(0);
    expect(c.description.length).toBeGreaterThan(10);
    expect(Array.isArray(c.hints)).toBe(true);
    expect(c.hints.length).toBeGreaterThan(0);
    expect(c.validationContext.length).toBeGreaterThan(10);
    expect(typeof c.setup).toBe('function');
  });
});

describe.skipIf(isWindows)('static challenge setup functions', () => {
  let dir;
  afterEach(() => rmDir(dir));

  it.each(challenges.map(c => [c.id, c]))('%s sets up without throwing', (_id, c) => {
    dir = makeTempDir();
    expect(() => c.setup(dir)).not.toThrow();
  });

  it('init-commit starts from an empty directory', () => {
    dir = makeTempDir();
    challenges.find(c => c.id === 'init-commit').setup(dir);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('branch-create starts from a repo with one commit', () => {
    dir = makeTempDir();
    challenges.find(c => c.id === 'branch-create').setup(dir);
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(true);
  });
});
