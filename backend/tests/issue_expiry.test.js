import { describe, it, expect, vi } from 'vitest';
vi.mock('../utilities/SandboxFactory.js', () => ({ default: {} }));
const { default: DuelSession } = await import('../DuelSession.js');

describe('room expiry', () => {
  it('AC-1: room info has expiresAt', () => {
    const info = new DuelSession('R', { difficulty: 'Beginner' }, 'A').getInfo();
    expect(info.expiresAt).toBeDefined();
  });
});
