import { describe, it, expect, vi } from 'vitest';
import { mockRes } from './helpers.js';
vi.mock('../models/Contest.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../models/User.js', () => ({ default: {} }));
vi.mock('../utilities/SandboxFactory.js', () => ({ default: {} }));
vi.mock('../utilities/gitUtils.js', () => ({ judgeRepo: vi.fn() }));
const { default: Contest } = await import('../models/Contest.js');
const { updateContest } = await import('../controllers/contestController.js');

describe('contest times', () => {
  it('AC-1: rejects end before start', async () => {
    const save = vi.fn();
    Contest.findById.mockResolvedValue({ createdBy: { toString: () => 'u' }, startTime: new Date(), endTime: new Date(), save });
    const res = mockRes();
    await updateContest({ params: { id: 'c' }, userId: 'u', body: { startTime: '2030-01-02', endTime: '2030-01-01' } }, res);
    expect(res.statusCode).toBe(400);
  });
});
