// Hidden acceptance tests for issue B2 (judge fallback to the local model).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('../utilities/aiUtil.js', () => ({
  getAIClient: vi.fn(),
  getPrompt: vi.fn(),
  generateContent: vi.fn(),
  generateChallengeWithLocalModel: vi.fn(),
}));

const ai = await import('../utilities/aiUtil.js');
const { judgeRepo } = await import('../utilities/gitUtils.js');

const challenge = { title: 'Hidden Fallback Challenge', description: 'd', validationContext: 'v' };
let dir;

beforeEach(() => { vi.clearAllMocks(); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb2-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('hidden B2', () => {
  it('H-B2-1: uses the local model verdict when the hosted model fails', async () => {
    ai.generateContent.mockRejectedValue(new Error('429 Too Many Requests'));
    ai.generateChallengeWithLocalModel.mockResolvedValue('{"passed":true,"score":88,"feedback":"local ok","details":"d"}');
    const r = await judgeRepo(challenge, dir, 'git commit', 'some/model');
    expect(r).toEqual({ passed: true, score: 88, feedback: 'local ok', details: 'd' });
  });

  it('H-B2-2: sends the same judging prompt to the local model', async () => {
    ai.generateContent.mockRejectedValue(new Error('down'));
    ai.generateChallengeWithLocalModel.mockResolvedValue('{"passed":false,"score":40,"feedback":"","details":""}');
    await judgeRepo(challenge, dir, '', 'some/model');
    expect(ai.generateChallengeWithLocalModel).toHaveBeenCalledTimes(1);
    expect(ai.generateChallengeWithLocalModel.mock.calls[0][0]).toContain('Hidden Fallback Challenge');
  });

  it('H-B2-3: falls back when no model name is given', async () => {
    ai.generateChallengeWithLocalModel.mockResolvedValue('{"passed":true,"score":75,"feedback":"","details":""}');
    const r = await judgeRepo(challenge, dir, '', undefined);
    expect(ai.generateContent).not.toHaveBeenCalled();
    expect(r.score).toBe(75);
  });

  it('H-B2-4: when both models fail the verdict is a safe fail', async () => {
    ai.generateContent.mockRejectedValue(new Error('down'));
    ai.generateChallengeWithLocalModel.mockRejectedValue(new Error('ollama down'));
    const r = await judgeRepo(challenge, dir, '', 'm');
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(String(r.feedback)).not.toMatch(/is not defined/);
  });
});
