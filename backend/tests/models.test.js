import { describe, it, expect } from 'vitest';
import User from '../models/User.js';
import Contest from '../models/Contest.js';
import ChallengeResult from '../models/ChallengeResult.js';

const HOUR = 60 * 60 * 1000;

describe('User model', () => {
  it('hashes passwords and compares them', async () => {
    const hash = await User.hashPassword('s3cret!');
    expect(hash).not.toBe('s3cret!');
    const u = new User({ username: 'alice', email: 'a@x.io', passwordHash: hash });
    expect(await u.comparePassword('s3cret!')).toBe(true);
    expect(await u.comparePassword('wrong')).toBe(false);
  });

  it('lower-cases and trims emails and usernames', () => {
    const u = new User({ username: '  bob  ', email: '  Bob@Example.COM ', passwordHash: 'h' });
    expect(u.username).toBe('bob');
    expect(u.email).toBe('bob@example.com');
  });

  it('rejects usernames shorter than 2 or longer than 30 characters', () => {
    expect(new User({ username: 'a', email: 'a@x.io', passwordHash: 'h' }).validateSync().errors.username).toBeDefined();
    expect(new User({ username: 'x'.repeat(31), email: 'a@x.io', passwordHash: 'h' }).validateSync().errors.username).toBeDefined();
  });

  it('starts with zeroed stats', () => {
    const u = new User({ username: 'carol', email: 'c@x.io', passwordHash: 'h' });
    expect(u.stats.solved).toBe(0);
    expect(u.stats.avgScore).toBe(0);
    expect(u.stats.fastestSolveMs).toBe(Infinity);
    expect(u.validateSync()).toBeUndefined();
  });
});

describe('Contest model', () => {
  const base = { title: 'Weekly', problems: [{ title: 'P1', description: 'd' }] };

  it('is "upcoming" before startTime', () => {
    const c = new Contest({ ...base, startTime: new Date(Date.now() + HOUR), endTime: new Date(Date.now() + 2 * HOUR) });
    expect(c.status).toBe('upcoming');
  });

  it('is "live" between startTime and endTime', () => {
    const c = new Contest({ ...base, startTime: new Date(Date.now() - HOUR), endTime: new Date(Date.now() + HOUR) });
    expect(c.status).toBe('live');
  });

  it('is "ended" after endTime', () => {
    const c = new Contest({ ...base, startTime: new Date(Date.now() - 2 * HOUR), endTime: new Date(Date.now() - HOUR) });
    expect(c.status).toBe('ended');
  });

  it('includes status in JSON output', () => {
    const c = new Contest({ ...base, startTime: new Date(Date.now() - HOUR), endTime: new Date(Date.now() + HOUR) });
    expect(c.toJSON().status).toBe('live');
  });

  it('fills problem defaults', () => {
    const c = new Contest({ ...base, startTime: new Date(), endTime: new Date(Date.now() + HOUR) });
    const p = c.problems[0];
    expect(p.points).toBe(100);
    expect(p.difficulty).toBe('Beginner');
    expect(p.isStatic).toBe(false);
    expect(p.terminalConfig.files).toEqual([]);
  });

  it('rejects an unknown difficulty and requires times', () => {
    const err = new Contest({ title: 'x', difficulty: 'Expert' }).validateSync();
    expect(err.errors.difficulty).toBeDefined();
    expect(err.errors.startTime).toBeDefined();
    expect(err.errors.endTime).toBeDefined();
  });
});

describe('ChallengeResult model', () => {
  it('only allows solo or duel mode', () => {
    const r = new ChallengeResult({
      userId: '507f1f77bcf86cd799439011', challengeId: 'c', title: 't', difficulty: 'Beginner',
      score: 50, passed: false, timeMs: 1000, mode: 'contest',
    });
    expect(r.validateSync().errors.mode).toBeDefined();
  });

  it('defaults mode to solo', () => {
    const r = new ChallengeResult({
      userId: '507f1f77bcf86cd799439011', challengeId: 'c', title: 't', difficulty: 'Beginner',
      score: 50, passed: false, timeMs: 1000,
    });
    expect(r.mode).toBe('solo');
    expect(r.validateSync()).toBeUndefined();
  });
});
