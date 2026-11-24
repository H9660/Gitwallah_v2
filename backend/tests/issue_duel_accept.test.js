import { describe, it, expect, vi } from 'vitest';
import DuelSession from '../DuelSession.js';
import factory from '../utilities/SandboxFactory.js';

const challenge = {
  id: 'chal-1',
  title: 'Test',
  difficulty: 'easy',
  instructions: 'Do x',
  startBranch: 'main',
  targetBranch: 'main',
  isAIGenerated: false,
  setupCommands: ['git init'],
  validationContext: 'secret criteria',
};

describe('DuelSession accept state guard (AC-1 & AC-2)', () => {
  it('AC-1: rejects accept when session is already in PLAYING state', async () => {
    const session = new DuelSession('test-room', challenge, 'user1');
    session.challengerJoin({}, 'user2');
    expect(session.state).toBe(DuelSession.STATES.READY);

    const res1 = await session.accept();
    expect(res1.ok).toBe(true);
    expect(session.state).toBe(DuelSession.STATES.PLAYING);

    // Try calling accept again when state is PLAYING
    const res2 = await session.accept();
    expect(res2.ok).toBe(false);
    expect(res2.error).toContain('playing');
    expect(session.state).toBe(DuelSession.STATES.PLAYING);
  });

  it('AC-2: does not create additional sandboxes or modify existing sandboxes when calling accept on PLAYING session', async () => {
    const spy = vi.spyOn(factory, 'createDuelSandbox');
    const session = new DuelSession('test-room-2', challenge, 'user1');
    session.challengerJoin({}, 'user2');
    await session.accept();

    const initialCalls = spy.mock.calls.length;
    const hostSandbox = session.host.sandbox;
    const challengerSandbox = session.challenger.sandbox;

    // Attempt second accept
    const res = await session.accept();
    expect(res.ok).toBe(false);
    expect(spy.mock.calls.length).toBe(initialCalls);
    expect(session.host.sandbox).toBe(hostSandbox);
    expect(session.challenger.sandbox).toBe(challengerSandbox);
    spy.mockRestore();
  });
});
