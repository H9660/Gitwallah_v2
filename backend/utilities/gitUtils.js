import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getGeminiModel, generateChallengeWithLocalModel } from './aiUtil.js';

const isWindows = os.platform() === 'win32';
const NULL_DEVICE = isWindows ? 'nul' : '/dev/null';

/**
 * Configure global git settings for the player.
 */
export function configureGit() {
  try {
    execSync(`git config --global user.email "player@gitchallenge.dev" 2>${NULL_DEVICE}`, { encoding: 'utf-8' });
    execSync(`git config --global user.name "Git Player" 2>${NULL_DEVICE}`, { encoding: 'utf-8' });
    execSync(`git config --global init.defaultBranch main 2>${NULL_DEVICE}`, { encoding: 'utf-8' });
  } catch (e) {
    console.error("Failed to configure Git:", e.message);
  }
}

/**
 * Execute shell setup commands in a directory with git env vars.
 */
export function executeSetupCommands(dir, commands) {
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Git Player',
    GIT_AUTHOR_EMAIL: 'player@gitchallenge.dev',
    GIT_COMMITTER_NAME: 'Git Player',
    GIT_COMMITTER_EMAIL: 'player@gitchallenge.dev',
  };

  for (let cmd of commands) {
    try {
      if (isWindows) {
        cmd = cmd.replace(/'([^']*)'/g, '"$1"');
      }
      execSync(cmd, {
        cwd: dir,
        encoding: 'utf-8',
        timeout: 10000,
        env: gitEnv,
      });
    } catch (e) {
      console.error(`Setup command failed: "${cmd}" → ${e.message}`);
    }
  }
}

/**
 * Read the full state of a git repo for judging.
 */
export function getRepoState(dir) {
  if (!dir || !fs.existsSync(dir)) return 'Directory does not exist';
  try {
    const log = execSync('git log --oneline --all --graph 2>&1 || echo "No git repo"', { cwd: dir, encoding: 'utf-8', timeout: 5000 });
    const status = execSync('git status 2>&1 || echo "Not a git repo"', { cwd: dir, encoding: 'utf-8', timeout: 5000 });
    const branches = execSync('git branch -a 2>&1 || echo "No branches"', { cwd: dir, encoding: 'utf-8', timeout: 5000 });
    const tags = execSync('git tag -l 2>&1 || echo ""', { cwd: dir, encoding: 'utf-8', timeout: 5000 });
    const stash = execSync('git stash list 2>&1 || echo ""', { cwd: dir, encoding: 'utf-8', timeout: 5000 });
    const files = execSync('find . -not -path "./.git/*" -not -path "./.git" -type f 2>&1 | head -50', { cwd: dir, encoding: 'utf-8', timeout: 5000 });
    let fileContents = '';
    const fList = files.trim().split('\n').filter(Boolean);
    for (const f of fList.slice(0, 20)) {
      try {
        const content = fs.readFileSync(path.join(dir, f), 'utf-8');
        fileContents += `\n--- ${f} ---\n${content}`;
      } catch (_) { }
    }
    return `GIT LOG:\n${log}\n\nGIT STATUS:\n${status}\n\nBRANCHES:\n${branches}\n\nTAGS:\n${tags}\n\nSTASH:\n${stash}\n\nFILES:\n${files}\n\nFILE CONTENTS:${fileContents}`;
  } catch (e) {
    return `Error reading repo state: ${e.message}`;
  }
}

/**
 * Parse JSON from Gemini response (strips markdown code fences).
 */
export function parseGeminiJSON(text) {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * AI-judge a repo against a challenge using Gemini.
 */
export async function judgeRepo(challenge, dir, history, modelName) {
  const repoState = getRepoState(dir);
  const prompt = `You are a Git challenge judge. Evaluate whether the user successfully completed the challenge.

  CHALLENGE: ${challenge.title}
  DESCRIPTION: ${challenge.description}
  VALIDATION CRITERIA: ${challenge.validationContext}

  CURRENT REPOSITORY STATE:
  ${repoState}

  TERMINAL HISTORY (user's commands):
  ${(history || '').slice(-10000)}

  Based on the validation criteria, evaluate:
  1. Did the user complete the challenge correctly?
  2. Score from 0-100
  3. Brief feedback (what they did well, what could improve)

  Respond in this EXACT JSON format (no markdown, no code blocks):
  {
  "passed": true/false,
  "score": <0-100>,
  "feedback": "<one paragraph of feedback>",
  "details": "<specific details about what was checked>"
  }`;

  try {
    let text;
    try {
      const model = getGeminiModel(modelName);
      if (!model) throw new Error('GEMINI_API_KEY not set for fallback.');
      const result = await model.generateContent(prompt);
      text = result.response.text().trim();
    } catch (err) {
      console.warn(`Gemini API is not working. (${err.message}). Falling back to local model...`);
      text = await generateChallengeWithLocalModel(prompt);
    }

    return parseGeminiJSON(text);
  } catch (e) {
    return { passed: false, score: 0, feedback: e.message || 'Error parsing', details: 'Could not parse structured response' };
  }
}
