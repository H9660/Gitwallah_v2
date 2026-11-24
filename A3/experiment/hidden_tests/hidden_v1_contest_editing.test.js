// Hidden acceptance tests for issue V1 (vague: "contest editing is buggy").
// They encode the reasonable reading: updateContest must reject times that
// createContest would reject. A run that stops at needs-clarification is also
// an acceptable outcome for the vague issue (scored separately in results.csv).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRes } from './helpers.js';

vi.mock('../models/Contest.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../models/User.js', () => ({ default: {} }));
vi.mock('../utilities/SandboxFactory.js', () => ({ default: { destroySandbox: vi.fn() } }));
vi.mock('../utilities/gitUtils.js', () => ({ judgeRepo: vi.fn() }));

const { default: Contest } = await import('../models/Contest.js');
const { updateContest } = await import('../controllers/contestController.js');

const HOUR = 3600 * 1000;
let contest;
beforeEach(() => {
  vi.clearAllMocks();
  contest = {
    _id: 'c1', title: 'T', createdBy: { toString: () => 'creator' },
    startTime: new Date(Date.now() + HOUR), endTime: new Date(Date.now() + 2 * HOUR),
    problems: [], leaderboard: [], save: vi.fn().mockResolvedValue(undefined),
    toJSON() { return { title: this.title }; },
  };
  Contest.findById.mockResolvedValue(contest);
});

const put = async (body) => {
  const res = mockRes();
  await updateContest({ params: { id: 'c1' }, userId: 'creator', body }, res);
  return res;
};

describe('hidden V1', () => {
  it('H-V1-1: endTime before startTime is rejected with 400 and nothing is saved', async () => {
    const res = await put({ startTime: new Date(Date.now() + 3 * HOUR).toISOString(), endTime: new Date(Date.now() + HOUR).toISOString() });
    expect(res.statusCode).toBe(400);
    expect(contest.save).not.toHaveBeenCalled();
  });

  it('H-V1-2: changing only endTime to before the existing startTime is rejected', async () => {
    const res = await put({ endTime: new Date(Date.now() + 0.5 * HOUR).toISOString() });
    expect(res.statusCode).toBe(400);
    expect(contest.save).not.toHaveBeenCalled();
  });

  it('H-V1-3: an unparsable date is rejected', async () => {
    const res = await put({ startTime: 'not-a-date' });
    expect(res.statusCode).toBe(400);
    expect(contest.save).not.toHaveBeenCalled();
  });

  it('H-V1-4 (regression): a valid time change is saved', async () => {
    const end = new Date(Date.now() + 5 * HOUR);
    const res = await put({ endTime: end.toISOString() });
    expect(res.statusCode).toBe(200);
    expect(contest.save).toHaveBeenCalledOnce();
    expect(contest.endTime.getTime()).toBe(end.getTime());
  });
});
