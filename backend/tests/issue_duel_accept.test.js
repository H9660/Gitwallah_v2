import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utilities/SandboxFactory.js', () => ({
  default: { createDuelSandbox: vi.fn(), destroySandbox: vi.fn() },
}));

const { default: factory } = await import('../utilities/SandboxFactory.js');
const { default: DuelSession } = await import('../DuelSession.js');

const challenge = { id: 'c', title: 't', difficulty: 'Beginner', description: 'd', hints: [] };

function playing() {
  const s = new DuelSession('H1', challenge, 'Alice');
  s.challengerJoin({}, 'Bob');
  expect(s.accept().ok).toBe(true);
  return s;
}

beforeEach(() => {
  vi.clearAllMocks();
  factory.createDuelSandbox.mockImplementation(() => ({ ptyProcess: { kill: vi.fn(), onData: vi.fn() }, challengeDir: '/tmp/h' }));
});

describe('issue: accept twice', () => {
  it('AC-1: a second accept while playing is refused and the state stays playing', () => {
    const s = playing();
    const r = s.accept();
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(s.state).toBe('playing');
  });

  it('AC-2: a second accept creates no sandboxes and keeps the running ones', () => {
    const s = playing();
    const host = s.host.sandbox;
    const ch = s.challenger.sandbox;
    s.accept();
    expect(factory.createDuelSandbox).toHaveBeenCalledTimes(2);
    expect(s.host.sandbox).toBe(host);
    expect(s.challenger.sandbox).toBe(ch);
  });

  it('AC-3: accept after the duel finished is refused', () => {
    const s = playing();
    s.submitJudgement('host', { passed: true, score: 90 });
    expect(s.accept().ok).toBe(false);
    expect(s.state).toBe('finished');
    expect(factory.createDuelSandbox).toHaveBeenCalledTimes(2);
  });

  it('keeps a failed judge attempt still keeps the duel playing', () => {
    const s = playing();
    expect(s.submitJudgement('host', { passed: false, score: 10 })).toEqual({ ok: true, won: false });
    expect(s.state).toBe('playing');
  });
});
