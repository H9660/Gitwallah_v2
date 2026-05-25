import { getAIClient,getPrompt, generateContent, generateChallengeWithLocalModel } from "./aiUtil.js";
import { parseGeminiJSON } from './gitUtils.js';
import factory from "./SandboxFactory.js";
import staticChallenges from '../challenges.js'
// ── Module-level state ──────────────────────────────────
let usedStaticIds = [];
let previousTopics = [];

/**
 * Pick a random static challenge, avoiding recently used ones.
 */

export function cleanupSoloChallenge(soloSandbox) {
  factory.destroySandbox(soloSandbox);
  soloSandbox = null;
}

export function pickStaticChallenge(difficulty) {
  console.log("here");
  let available = staticChallenges.filter(c => !usedStaticIds.includes(c.id));
  if (difficulty) available = available.filter(c => c.difficulty === difficulty);
  if (available.length === 0) {
    usedStaticIds = [];
    available = difficulty ? staticChallenges.filter(c => c.difficulty === difficulty) : staticChallenges;
  }
  if (available.length === 0) return null;
  const challenge = available[Math.floor(Math.random() * available.length)];
  usedStaticIds.push(challenge.id);
  return challenge;
}

/**
 * Try AI generation first, fall back to static challenge.
 */
// here we are using the strategy patterns
export const getOrGenerateChallenge = async (difficulty, modelName) => {
  let challenge = await generateChallengeWithAI(difficulty || undefined, modelName);
  if (challenge) return { challenge, source: 'ai' };
  console.warn("AI is not working so we are using static challenges");
  const staticChallenge = pickStaticChallenge(difficulty || undefined);
  if (!staticChallenge) return null;
  return {
    challenge: {
      id: staticChallenge.id,
      title: staticChallenge.title,
      difficulty: staticChallenge.difficulty,
      description: staticChallenge.description,
      hints: staticChallenge.hints,
      setupCommands: null,
      setup: staticChallenge.setup,
      validationContext: staticChallenge.validationContext,
      isAIGenerated: false,
    },
    source: 'static',
  };
}

/**
 * Run setup commands or setup function in a challenge directory.
 */

// lazy init here and also reusing the object

export const generateChallengeWithAI = async (difficulty, modelName) => {
  const difficultyGuide = {
    Beginner: 'Simple tasks: git init, add, commit, branch, checkout, status, diff, log. Single-step or two-step operations.',
    Intermediate: 'Multi-step tasks: merge conflicts, cherry-pick, rebase, stash, amend, reset, tag, remote operations. Requires combining 2-4 commands.',
    Advanced: 'Complex scenarios: interactive rebase, bisect, reflog recovery, subtree merge, filter-branch, worktrees, complex conflict resolution, patch creation. Requires deep Git knowledge.',
  };

  const level = difficulty || ['Beginner', 'Intermediate', 'Advanced'][Math.floor(Math.random() * 3)];

  const prompt = getPrompt(difficulty, difficultyGuide[difficulty], modelName);

  try {
    let text;
    try {
      if (!modelName) throw new Error('API_KEY for openrouter is not set for fallback.');

      text = await generateContent(modelName, prompt)
    } catch (err) {
      console.log(err)
      console.warn(`Gemini failed (${err.message}). Falling back to local models...`);
      text = await generateChallengeWithLocalModel(prompt);
    }

    const challenge = parseGeminiJSON(text);

    if (!challenge.title || !challenge.description || !challenge.setupCommands || !challenge.validationContext) {
      console.error('AI challenge missing required fields');
      return null;
    }

    previousTopics.push(challenge.title);
    if (previousTopics.length > 15) previousTopics.shift();

    return {
      id: `ai-${Date.now()}`,
      title: challenge.title,
      difficulty: challenge.difficulty || level,
      description: challenge.description,
      hints: challenge.hints || [],
      setupCommands: challenge.setupCommands,
      validationContext: challenge.validationContext,
      isAIGenerated: true,
    };
  } catch (e) {
    console.error('AI challenge generation failed:', e.message);
    return null;
  }
}
