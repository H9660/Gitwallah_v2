// Hidden acceptance tests for issue F2 (expiresAt in duel room info).
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../utilities/SandboxFactory.js', () => ({ default: { createDuelSandbox: vi.fn(), destroySandbox: vi.fn() } }));
const { default: DuelSession } = await import('../DuelSession.js');

const challenge = { id: 'c', title: 't', difficulty: 'Beginner', description: 'd', hints: [] };
afterEach(() => vi.useRealTimers());

describe('hidden F2', () => {
  it('H-F2-1: getInfo().expiresAt is creation time + 30 minutes as an ISO string', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T10:00:00.000Z'));
    const s = new DuelSession('F2', challenge, 'Alice');
    expect(s.getInfo().expiresAt).toBe('2026-11-20T10:30:00.000Z');
  });

  it('H-F2-2: expiresAt is derived from createdAt, not from the time of the request', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T10:00:00.000Z'));
    const s = new DuelSession('F2', challenge, 'Alice');
    vi.setSystemTime(new Date('2026-11-20T10:20:00.000Z'));
    expect(s.getInfo().expiresAt).toBe('2026-11-20T10:30:00.000Z');
  });

  it('H-F2-3 (regression): existing room info fields are unchanged', () => {
    const info = new DuelSession('F2', challenge, 'Alice').getInfo();
    expect(info).toMatchObject({ roomId: 'F2', state: 'waiting', difficulty: 'Beginner', hostName: 'Alice', challengerName: null });
    expect(Number.isNaN(Date.parse(info.expiresAt))).toBe(false);
  });
});
