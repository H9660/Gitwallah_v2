import { describe, it, expect } from 'vitest';
import DuelSession, { DUEL_ROOM_LIFETIME_MS } from '../DuelSession.js';

describe('issue_expiresAt tests', () => {
  it('AC-1: getInfo returns expiresAt calculated as createdAt + DUEL_ROOM_LIFETIME_MS in ISO format', () => {
    const mockChallenge = {
      id: 'test-challenge',
      title: 'Test Challenge',
      difficulty: 'easy',
      description: 'Desc',
      hints: [],
    };
    const session = new DuelSession('room123', mockChallenge, 'Alice');
    // Override createdAt to fixed time to test explicit AC-1 expectation
    session.createdAt = new Date('2026-11-20T10:00:00.000Z').getTime();
    const info = session.getInfo();

    expect(info.expiresAt).toBe('2026-11-20T10:30:00.000Z');
  });

  it('AC-2: DUEL_ROOM_LIFETIME_MS is exported as 30 minutes (1800000 ms)', () => {
    expect(DUEL_ROOM_LIFETIME_MS).toBe(30 * 60 * 1000);
    expect(DUEL_ROOM_LIFETIME_MS).toBe(1800000);
  });
});
