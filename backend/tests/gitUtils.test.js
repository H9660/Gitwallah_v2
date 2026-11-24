import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { makeTempDir, rmDir } from './helpers.js';

vi.mock('../utilities/aiUtil.js', () => ({
  getAIClient: vi.fn(),
  generateContent: vi.fn(),
  generateChallengeWithLocalModel: vi.fn(),
  getPrompt: vi.fn(),
}));

const ai = await import('../utilities/aiUtil.js');
const { parseGeminiJSON, getRepoState, judgeRepo, executeSetupCommands } = await import('../utilities/gitUtils.js');

// Some setup code shells out with POSIX syntax; run these on Linux/macOS (CI).
const isWindows = process.platform === 'win32' && !process.env.FORCE_POSIX_TESTS;

describe('parseGeminiJSON', () => {
  it('parses plain JSON', () => {
    expect(parseGeminiJSON('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips ```json fences', () => {
    expect(parseGeminiJSON('```json\n{"passed":true,"score":90}\n```')).toEqual({ passed: true, score: 90 });
  });

  it('strips bare ``` fences and surrounding whitespace', () => {
    expect(parseGeminiJSON('  ```\n{"x":"y"}\n```  ')).toEqual({ x: 'y' });
  });

  it('throws on non-JSON text', () => {
    expect(() => parseGeminiJSON('not json')).toThrow();
  });
});

describe('getRepoState', () => {
  let dir;
  afterEach(() => rmDir(dir));

  it('reports a missing directory', () => {
    expect(getRepoState(null)).toBe('Directory does not exist');
    expect(getRepoState(path.join(makeTempDir(), 'nope'))).toBe('Directory does not exist');
  });

  it.skipIf(isWindows)('summarises log, branches, tags and file contents of a repo', () => {
    dir = makeTempDir();
    execSync('git init -q -b main && echo "Hello, Git!" > hello.txt && git add . && git commit -q -m "Initial commit" && git branch feature && git tag v1.0', { cwd: dir });
    const state = getRepoState(dir);
    expect(state).toContain('GIT LOG:');
    expect(state).toContain('Initial commit');
    expect(state).toContain('feature');
    expect(state).toContain('v1.0');
    expect(state).toContain('--- ./hello.txt ---');
    expect(state).toContain('Hello, Git!');
  });
});

describe('executeSetupCommands', () => {
  let dir;
  afterEach(() => rmDir(dir));

  it('runs commands in order inside the directory and keeps going after a failure', () => {
    dir = makeTempDir();
    executeSetupCommands(dir, ['git init -q', 'definitely-not-a-real-command-xyz', 'git checkout -q -b feature']);
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(true);
    const head = fs.readFileSync(path.join(dir, '.git', 'HEAD'), 'utf-8');
    expect(head).toContain('refs/heads/feature');
  });
});

describe('judgeRepo', () => {
  let dir;
  const challenge = { title: 'Your First Commit', description: 'Make a commit', validationContext: 'one commit named Initial commit' };

  beforeEach(() => { vi.clearAllMocks(); dir = makeTempDir(); });
  afterEach(() => rmDir(dir));

  it('returns the parsed verdict from the model', async () => {
    ai.generateContent.mockResolvedValue('{"passed":true,"score":92,"feedback":"nice","details":"ok"}');
    const r = await judgeRepo(challenge, dir, 'git commit', 'some/model');
    expect(r).toEqual({ passed: true, score: 92, feedback: 'nice', details: 'ok' });
    expect(ai.generateContent).toHaveBeenCalledWith('some/model', expect.any(String));
  });

  it('builds the prompt from the challenge and the end of the terminal history', async () => {
    ai.generateContent.mockResolvedValue('{"passed":false,"score":10,"feedback":"","details":""}');
    const history = 'A'.repeat(20000) + 'LAST_COMMANDS';
    await judgeRepo(challenge, dir, history, 'm');
    const prompt = ai.generateContent.mock.calls[0][1];
    expect(prompt).toContain('CHALLENGE: Your First Commit');
    expect(prompt).toContain('VALIDATION CRITERIA: one commit named Initial commit');
    expect(prompt).toContain('LAST_COMMANDS');
    expect(prompt).not.toContain('A'.repeat(10001));
  });

  it('returns a failing verdict when the model reply is not JSON', async () => {
    ai.generateContent.mockResolvedValue('I think they passed!');
    const r = await judgeRepo(challenge, dir, '', 'm');
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.details).toBe('Could not parse structured response');
  });
});
