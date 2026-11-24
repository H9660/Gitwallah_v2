import { describe, it, expect, vi } from 'vitest';
import { mockRes } from './helpers.js';
vi.mock('../models/Contest.js', () => ({ default: {} }));
vi.mock('../models/User.js', () => ({ default: {} }));
vi.mock('../utilities/SandboxFactory.js', () => ({ default: {} }));
vi.mock('../utilities/gitUtils.js', () => ({ judgeRepo: vi.fn() }));
const { getAvailableChallenges } = await import('../controllers/contestController.js');

describe('difficulty filter', () => {
  it('AC-1: filters by difficulty', async () => {
    const res = mockRes();
    await getAvailableChallenges({ query: { difficulty: 'Beginner' } }, res);
    expect(res.body.challenges.every(c => c.difficulty === 'Beginner')).toBe(true);
  });
  it('AC-2: rejects unknown difficulty', async () => {
    const res = mockRes();
    await getAvailableChallenges({ query: { difficulty: 'Expert' } }, res);
    expect(res.statusCode).toBe(400);
  });
});
