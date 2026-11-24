import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRes, chain } from './helpers.js';

vi.mock('../models/Contest.js', () => ({
  default: { find: vi.fn(), findById: vi.fn(), create: vi.fn(), findByIdAndDelete: vi.fn() },
}));
vi.mock('../models/User.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../utilities/SandboxFactory.js', () => ({
  default: { createSoloSandbox: vi.fn(), destroySandbox: vi.fn() },
}));
vi.mock('../utilities/gitUtils.js', () => ({ judgeRepo: vi.fn() }));

const { default: Contest } = await import('../models/Contest.js');
const { default: User } = await import('../models/User.js');
const { default: staticChallenges } = await import('../challenges.js');
const ctrl = await import('../controllers/contestController.js');

const HOUR = 60 * 60 * 1000;
const iso = (offset) => new Date(Date.now() + offset).toISOString();

function contestDoc(overrides = {}) {
  const doc = {
    _id: 'c1',
    title: 'Weekly',
    createdBy: { toString: () => 'creator' },
    startTime: new Date(Date.now() - HOUR),
    endTime: new Date(Date.now() + HOUR),
    problems: [],
    leaderboard: [],
    save: vi.fn().mockResolvedValue(undefined),
    toJSON() { return { title: this.title, startTime: this.startTime, endTime: this.endTime }; },
    ...overrides,
  };
  return doc;
}

beforeEach(() => {
  vi.clearAllMocks();
  Contest.create.mockImplementation(async (doc) => ({ ...doc, toJSON: () => doc }));
});

describe('createContest', () => {
  it('requires title, startTime and endTime', async () => {
    const res = mockRes();
    await ctrl.createContest({ body: { title: 'x', startTime: iso(0) } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  it('rejects an end time that is not after the start time', async () => {
    const res = mockRes();
    const t = iso(HOUR);
    await ctrl.createContest({ body: { title: 'x', startTime: t, endTime: t, challengeIds: ['init-commit'] } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('End time must be after start time');
    expect(Contest.create).not.toHaveBeenCalled();
  });

  it('requires at least one problem', async () => {
    const res = mockRes();
    await ctrl.createContest({ body: { title: 'x', startTime: iso(0), endTime: iso(HOUR) } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('At least one problem is required');
  });

  it('ignores unknown static challenge ids', async () => {
    const res = mockRes();
    await ctrl.createContest({ body: { title: 'x', startTime: iso(0), endTime: iso(HOUR), challengeIds: ['nope'] } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('turns static challenge ids into problems with points by difficulty', async () => {
    const ids = ['init-commit', 'merge-conflict', 'bisect-bug'];
    const res = mockRes();
    await ctrl.createContest({ userId: 'u1', body: { title: ' Weekly ', startTime: iso(0), endTime: iso(HOUR), challengeIds: ids } }, res);
    expect(res.statusCode).toBe(200);
    const doc = Contest.create.mock.calls[0][0];
    expect(doc.createdBy).toBe('u1');
    expect(doc.difficulty).toBe('Mixed');
    expect(doc.problems.map(p => [p.challengeId, p.points, p.isStatic])).toEqual([
      ['init-commit', 75, true], ['merge-conflict', 100, true], ['bisect-bug', 150, true],
    ]);
  });

  it('accepts custom problems and fills defaults', async () => {
    const res = mockRes();
    await ctrl.createContest({ body: { title: 'x', startTime: iso(0), endTime: iso(HOUR), problems: [{ title: 'P', description: 'D' }] } }, res);
    const p = Contest.create.mock.calls[0][0].problems[0];
    expect(p).toMatchObject({ title: 'P', difficulty: 'Beginner', points: 75, isStatic: false, hints: [], testCases: [] });
    expect(Contest.create.mock.calls[0][0].createdBy).toBeNull();
  });
});

describe('getAvailableChallenges', () => {
  it('lists every static challenge with a short description', async () => {
    const res = mockRes();
    await ctrl.getAvailableChallenges({ query: {} }, res);
    expect(res.body.challenges).toHaveLength(staticChallenges.length);
    for (const c of res.body.challenges) {
      expect(Object.keys(c).sort()).toEqual(['description', 'difficulty', 'id', 'title']);
      expect(c.description.length).toBeLessThanOrEqual(121);
    }
  });
});

describe('getLeaderboard', () => {
  it('ranks by score (desc) then total time (asc)', async () => {
    Contest.findById.mockReturnValue(chain({
      title: 'Weekly',
      leaderboard: [
        { username: 'slow', totalScore: 100, totalTime: 900 },
        { username: 'low', totalScore: 50, totalTime: 10 },
        { username: 'fast', totalScore: 100, totalTime: 300 },
      ],
    }));
    const res = mockRes();
    await ctrl.getLeaderboard({ params: { id: 'c1' } }, res);
    expect(res.body.leaderboard.map(e => [e.rank, e.username])).toEqual([[1, 'fast'], [2, 'slow'], [3, 'low']]);
  });

  it('returns 404 for an unknown contest', async () => {
    Contest.findById.mockReturnValue(chain(null));
    const res = mockRes();
    await ctrl.getLeaderboard({ params: { id: 'x' } }, res);
    expect(res.statusCode).toBe(404);
  });
});

describe('joinContest', () => {
  it('refuses before the contest starts', async () => {
    Contest.findById.mockResolvedValue(contestDoc({ startTime: new Date(Date.now() + HOUR), endTime: new Date(Date.now() + 2 * HOUR) }));
    const res = mockRes();
    await ctrl.joinContest({ params: { id: 'c1' }, userId: 'u1' }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Contest has not started yet');
  });

  it('refuses after the contest ends', async () => {
    Contest.findById.mockResolvedValue(contestDoc({ startTime: new Date(Date.now() - 2 * HOUR), endTime: new Date(Date.now() - HOUR) }));
    const res = mockRes();
    await ctrl.joinContest({ params: { id: 'c1' }, userId: 'u1' }, res);
    expect(res.body.error).toBe('Contest has ended');
  });

  it('adds the user to the leaderboard once and hides hidden test cases and setup', async () => {
    const contest = contestDoc({
      problems: [{
        title: 'P', difficulty: 'Beginner', description: 'D', hints: [], points: 75, isStatic: false,
        terminalConfig: { setupCommands: ['secret'] },
        testCases: [{ input: 'a', expectedOutput: 'b', hidden: false }, { input: 'x', expectedOutput: 'y', hidden: true }],
      }],
    });
    Contest.findById.mockResolvedValue(contest);
    User.findById.mockResolvedValue({ _id: 'u1', username: 'alice' });
    const res = mockRes();
    await ctrl.joinContest({ params: { id: 'c1' }, userId: 'u1' }, res);
    expect(contest.leaderboard).toHaveLength(1);
    expect(contest.save).toHaveBeenCalledOnce();
    const p = res.body.challenges[0];
    expect(p.testCases).toEqual([{ input: 'a', expectedOutput: 'b' }]);
    expect(p).not.toHaveProperty('terminalConfig');
  });
});

describe('creator-only admin actions', () => {
  it('updateContest returns 403 for a non-creator', async () => {
    Contest.findById.mockResolvedValue(contestDoc());
    const res = mockRes();
    await ctrl.updateContest({ params: { id: 'c1' }, userId: 'intruder', body: { title: 'hacked' } }, res);
    expect(res.statusCode).toBe(403);
  });

  it('updateContest returns 404 for an unknown contest', async () => {
    Contest.findById.mockResolvedValue(null);
    const res = mockRes();
    await ctrl.updateContest({ params: { id: 'x' }, userId: 'creator', body: {} }, res);
    expect(res.statusCode).toBe(404);
  });

  it('updateContest refuses to change problems after the start', async () => {
    const contest = contestDoc();
    Contest.findById.mockResolvedValue(contest);
    const res = mockRes();
    await ctrl.updateContest({ params: { id: 'c1' }, userId: 'creator', body: { problems: [] } }, res);
    expect(res.statusCode).toBe(400);
    expect(contest.save).not.toHaveBeenCalled();
  });

  it('updateContest trims and saves the title for the creator', async () => {
    const contest = contestDoc();
    Contest.findById.mockResolvedValue(contest);
    const res = mockRes();
    await ctrl.updateContest({ params: { id: 'c1' }, userId: 'creator', body: { title: '  New name ' } }, res);
    expect(res.statusCode).toBe(200);
    expect(contest.title).toBe('New name');
    expect(contest.save).toHaveBeenCalledOnce();
  });

  it('AC-1: rejects updateContest with HTTP 400 when startTime >= endTime', async () => {
    const contest = contestDoc({
      startTime: new Date(Date.now() + HOUR),
      endTime: new Date(Date.now() + 2 * HOUR),
    });
    Contest.findById.mockResolvedValue(contest);
    const res = mockRes();
    await ctrl.updateContest({
      params: { id: 'c1' },
      userId: 'creator',
      body: { startTime: iso(2 * HOUR), endTime: iso(HOUR) }
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('startTime must be before endTime');
    expect(contest.save).not.toHaveBeenCalled();
  });

  it('AC-2: joinContest rejects with Contest has not started yet before startTime', async () => {
    Contest.findById.mockResolvedValue(contestDoc({ startTime: new Date(Date.now() + HOUR), endTime: new Date(Date.now() + 2 * HOUR) }));
    const res = mockRes();
    await ctrl.joinContest({ params: { id: 'c1' }, userId: 'u1' }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Contest has not started yet');
  });

  it('deleteContest deletes for the creator', async () => {
    Contest.findById.mockResolvedValue(contestDoc());
    const res = mockRes();
    await ctrl.deleteContest({ params: { id: 'c1' }, userId: 'creator' }, res);
    expect(Contest.findByIdAndDelete).toHaveBeenCalledWith('c1');
    expect(res.body).toEqual({ ok: true });
  });

  it('endContest sets endTime to now and notifies participants', async () => {
    const contest = contestDoc();
    Contest.findById.mockResolvedValue(contest);
    const broadcastToContest = vi.fn();
    const res = mockRes();
    await ctrl.endContest({ params: { id: 'c1' }, userId: 'creator', app: { locals: { broadcastToContest } } }, res);
    expect(contest.endTime.getTime()).toBeLessThanOrEqual(Date.now());
    expect(broadcastToContest).toHaveBeenCalledWith('c1', { type: 'contest-ended', contestId: 'c1' });
  });

  it('removeParticipant returns 404 when the user is not in the contest', async () => {
    Contest.findById.mockResolvedValue(contestDoc());
    const res = mockRes();
    await ctrl.removeParticipant({ params: { id: 'c1', userId: 'ghost' }, userId: 'creator', app: { locals: {} } }, res);
    expect(res.statusCode).toBe(404);
  });
});
