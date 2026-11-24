// Hidden acceptance tests for issue F1 (difficulty filter on GET /api/contests/challenges).
import { describe, it, expect, vi } from 'vitest';
import { mockRes } from './helpers.js';

vi.mock('../models/Contest.js', () => ({ default: {} }));
vi.mock('../models/User.js', () => ({ default: {} }));
vi.mock('../utilities/SandboxFactory.js', () => ({ default: {} }));
vi.mock('../utilities/gitUtils.js', () => ({ judgeRepo: vi.fn() }));

const { default: staticChallenges } = await import('../challenges.js');
const { getAvailableChallenges } = await import('../controllers/contestController.js');

async function call(query) {
  const res = mockRes();
  await getAvailableChallenges({ query, params: {}, body: {} }, res);
  return res;
}

describe('hidden F1', () => {
  it.each(['Beginner', 'Intermediate', 'Advanced'])('H-F1-1: ?difficulty=%s returns only that difficulty', async (level) => {
    const res = await call({ difficulty: level });
    expect(res.statusCode).toBe(200);
    const expected = staticChallenges.filter(c => c.difficulty === level).map(c => c.id).sort();
    expect(res.body.challenges.map(c => c.id).sort()).toEqual(expected);
  });

  it('H-F1-2: without the parameter every challenge is returned', async () => {
    const res = await call({});
    expect(res.statusCode).toBe(200);
    expect(res.body.challenges).toHaveLength(staticChallenges.length);
  });

  it('H-F1-3: an unknown difficulty gives 400 with an error message', async () => {
    const res = await call({ difficulty: 'Expert' });
    expect(res.statusCode).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error.length).toBeGreaterThan(0);
  });
});
