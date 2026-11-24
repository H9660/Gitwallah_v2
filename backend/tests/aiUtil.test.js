import { describe, it, expect } from 'vitest';
import { getPrompt, getAIClient } from '../utilities/aiUtil.js';

describe('aiUtil', () => {
  it('getPrompt embeds the difficulty and guide', () => {
    const p = getPrompt('Advanced', 'Use git bisect');
    expect(p).toContain('DIFFICULTY: Advanced');
    expect(p).toContain('GUIDE: Use git bisect');
    expect(p).toContain('"difficulty": "Advanced"');
  });

  it('getPrompt asks for every field the challenge parser requires', () => {
    const p = getPrompt('Beginner', 'g');
    for (const key of ['title', 'description', 'hints', 'setupCommands', 'validationContext']) {
      expect(p).toContain(`"${key}"`);
    }
  });

  it('getAIClient returns null when no OpenRouter key is configured', () => {
    expect(getAIClient()).toBeNull();
  });
});
