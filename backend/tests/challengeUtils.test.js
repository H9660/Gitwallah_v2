import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utilities/aiUtil.js', () => ({
  getAIClient: vi.fn(),
  getPrompt: vi.fn(() => 'PROMPT'),
  generateContent: vi.fn(),
  generateChallengeWithLocalModel: vi.fn(),
}));
vi.mock('../utilities/SandboxFactory.js', () => ({ default: { destroySandbox: vi.fn() } }));

const ai = await import('../utilities/aiUtil.js');
const { default: staticChallenges } = await import('../challenges.js');

// challengeUtils keeps module-level state (recently used ids), so each test
// loads a fresh copy.
async function loadUtils() {
  vi.resetModules();
  return import('../utilities/challengeUtils.js');
}

const validAI = {
  title: 'Stash Hero',
  difficulty: 'Intermediate',
  description: 'Stash your work',
  hints: ['git stash'],
  setupCommands: ['git init'],
  validationContext: 'stash list has one entry',
};

beforeEach(() => vi.clearAllMocks());

describe('pickStaticChallenge', () => {
  it('returns a challenge of the requested difficulty', async () => {
    const { pickStaticChallenge } = await loadUtils();
    for (const level of ['Beginner', 'Intermediate', 'Advanced']) {
      expect(pickStaticChallenge(level).difficulty).toBe(level);
    }
  });

  it('does not repeat a challenge until all of that difficulty have been used', async () => {
    const { pickStaticChallenge } = await loadUtils();
    const count = staticChallenges.filter(c => c.difficulty === 'Beginner').length;
    const ids = Array.from({ length: count }, () => pickStaticChallenge('Beginner').id);
    expect(new Set(ids).size).toBe(count);
  });

  it('starts over once every challenge of that difficulty has been used', async () => {
    const { pickStaticChallenge } = await loadUtils();
    const count = staticChallenges.filter(c => c.difficulty === 'Advanced').length;
    for (let i = 0; i < count; i++) pickStaticChallenge('Advanced');
    expect(pickStaticChallenge('Advanced')).toMatchObject({ difficulty: 'Advanced' });
  });

  it('picks from all difficulties when none is given', async () => {
    const { pickStaticChallenge } = await loadUtils();
    expect(staticChallenges.map(c => c.id)).toContain(pickStaticChallenge().id);
  });

  it('returns null for an unknown difficulty', async () => {
    const { pickStaticChallenge } = await loadUtils();
    expect(pickStaticChallenge('Impossible')).toBeNull();
  });
});

describe('generateChallengeWithAI', () => {
  it('normalises a valid model reply into a challenge', async () => {
    ai.generateContent.mockResolvedValue(JSON.stringify(validAI));
    const { generateChallengeWithAI } = await loadUtils();
    const c = await generateChallengeWithAI('Intermediate', 'model-x');
    expect(c).toMatchObject({
      title: 'Stash Hero', difficulty: 'Intermediate', setupCommands: ['git init'], isAIGenerated: true,
    });
    expect(c.id).toMatch(/^ai-\d+$/);
  });

  it('accepts a reply wrapped in markdown fences', async () => {
    ai.generateContent.mockResolvedValue('```json\n' + JSON.stringify(validAI) + '\n```');
    const { generateChallengeWithAI } = await loadUtils();
    expect((await generateChallengeWithAI('Beginner', 'm')).title).toBe('Stash Hero');
  });

  it('defaults missing hints to an empty list', async () => {
    const { hints, ...noHints } = validAI;
    ai.generateContent.mockResolvedValue(JSON.stringify(noHints));
    const { generateChallengeWithAI } = await loadUtils();
    expect((await generateChallengeWithAI('Beginner', 'm')).hints).toEqual([]);
  });

  it('returns null when a required field is missing', async () => {
    const { setupCommands, ...broken } = validAI;
    ai.generateContent.mockResolvedValue(JSON.stringify(broken));
    const { generateChallengeWithAI } = await loadUtils();
    expect(await generateChallengeWithAI('Beginner', 'm')).toBeNull();
  });

  it('falls back to the local model when the hosted model fails', async () => {
    ai.generateContent.mockRejectedValue(new Error('429'));
    ai.generateChallengeWithLocalModel.mockResolvedValue(JSON.stringify(validAI));
    const { generateChallengeWithAI } = await loadUtils();
    expect((await generateChallengeWithAI('Beginner', 'm')).title).toBe('Stash Hero');
    expect(ai.generateChallengeWithLocalModel).toHaveBeenCalledWith('PROMPT');
  });

  it('skips the hosted model when no model name is given', async () => {
    ai.generateChallengeWithLocalModel.mockResolvedValue(JSON.stringify(validAI));
    const { generateChallengeWithAI } = await loadUtils();
    await generateChallengeWithAI('Beginner', '');
    expect(ai.generateContent).not.toHaveBeenCalled();
    expect(ai.generateChallengeWithLocalModel).toHaveBeenCalled();
  });

  it('returns null when both models fail', async () => {
    ai.generateContent.mockRejectedValue(new Error('down'));
    ai.generateChallengeWithLocalModel.mockRejectedValue(new Error('down too'));
    const { generateChallengeWithAI } = await loadUtils();
    expect(await generateChallengeWithAI('Beginner', 'm')).toBeNull();
  });
});

describe('getOrGenerateChallenge', () => {
  it('uses the AI challenge when generation succeeds', async () => {
    ai.generateContent.mockResolvedValue(JSON.stringify(validAI));
    const { getOrGenerateChallenge } = await loadUtils();
    const r = await getOrGenerateChallenge('Intermediate', 'm');
    expect(r.source).toBe('ai');
    expect(r.challenge.title).toBe('Stash Hero');
  });

  it('falls back to a static challenge of the same difficulty when AI fails', async () => {
    ai.generateContent.mockResolvedValue('garbage');
    const { getOrGenerateChallenge } = await loadUtils();
    const r = await getOrGenerateChallenge('Advanced', 'm');
    expect(r.source).toBe('static');
    expect(r.challenge.difficulty).toBe('Advanced');
    expect(r.challenge.isAIGenerated).toBe(false);
    expect(r.challenge.setupCommands).toBeNull();
    expect(typeof r.challenge.setup).toBe('function');
    expect(r.challenge.validationContext).toBeTruthy();
  });
});
