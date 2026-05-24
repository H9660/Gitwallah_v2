import Contest from '../models/Contest.js';
import User from '../models/User.js';
import staticChallenges from '../challenges.js';
import factory from '../utilities/SandboxFactory.js';
import { judgeRepo } from '../utilities/gitUtils.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// ══════════════════════════════════════════════════════════
// ── HELPERS ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

/**
 * Build setupCommands from a custom problem's terminalConfig.
 * Generates shell commands that:
 *   1. Create initial files
 *   2. Initialize git repo
 *   3. Create branches
 *   4. Run any custom setupCommands
 */
function buildSetupCommands(problem) {
    const tc = problem.terminalConfig || {};
    const commands = [];

    // Always initialize git
    commands.push('git init');
    commands.push('git config user.email "player@gitdojo.dev"');
    commands.push('git config user.name "Git Player"');

    // Create initial files
    if (tc.files && tc.files.length > 0) {
        for (const f of tc.files) {
            // Ensure parent directories exist
            const dir = f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : null;
            if (dir) commands.push(`mkdir -p ${dir}`);

            // Escape content for shell
            const escaped = (f.content || '').replace(/'/g, "'\\''");
            commands.push(`printf '%s' '${escaped}' > ${f.path}`);
        }

        // Initial commit with the files
        commands.push('git add -A');
        commands.push("git commit -m 'Initial setup'");
    }

    // Create additional branches
    if (tc.gitBranches && tc.gitBranches.length > 0) {
        for (const branch of tc.gitBranches) {
            if (branch && branch !== 'main' && branch !== 'master') {
                commands.push(`git branch ${branch}`);
            }
        }
    }

    // Run any extra custom setup commands from the creator
    if (tc.setupCommands && tc.setupCommands.length > 0) {
        commands.push(...tc.setupCommands);
    }

    return commands;
}

/**
 * Build a challenge object compatible with SandboxFactory from a custom problem.
 */
function problemToChallenge(problem) {
    if (problem.isStatic && problem.challengeId) {
        // For static challenges, find the original with setup() function
        const original = staticChallenges.find(c => c.id === problem.challengeId);
        if (original) return original;
    }

    // Custom problem: build setupCommands from terminalConfig
    const setupCommands = buildSetupCommands(problem);
    const validationContext = problem.successCriteria?.description
        || problem.validationContext
        || problem.description;

    return {
        id: problem.title.toLowerCase().replace(/\s+/g, '-'),
        title: problem.title,
        difficulty: problem.difficulty,
        description: problem.description,
        hints: problem.hints || [],
        setupCommands,
        validationContext,
    };
}

/**
 * Backward-compatible: convert static challenge IDs to problem objects.
 */
function staticChallengesToProblems(challengeIds) {
    return challengeIds
        .map(id => staticChallenges.find(c => c.id === id))
        .filter(Boolean)
        .map(c => ({
            title: c.title,
            description: c.description,
            difficulty: c.difficulty,
            hints: c.hints || [],
            points: c.difficulty === 'Advanced' ? 150 : c.difficulty === 'Intermediate' ? 100 : 75,
            challengeId: c.id,
            isStatic: true,
            validationContext: c.validationContext,
            terminalConfig: { files: [], setupCommands: [], gitBranches: [] },
            successCriteria: { description: c.validationContext, fileChecks: [], gitChecks: {} },
            testCases: [],
        }));
}

// ══════════════════════════════════════════════════════════
// ── LIST ALL CONTESTS ────────────────────────────────────
// ══════════════════════════════════════════════════════════
export const listContests = async (req, res) => {
    try {
        const contests = await Contest.find()
            .sort({ startTime: -1 })
            .select('-leaderboard.submissions')
            .lean({ virtuals: true });
        res.json({ contests });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ══════════════════════════════════════════════════════════
// ── GET SINGLE CONTEST ───────────────────────────────────
// ══════════════════════════════════════════════════════════
export const getContest = async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.id).lean({ virtuals: true });
        if (!contest) return res.status(404).json({ error: 'Contest not found' });
        res.json({ contest });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ══════════════════════════════════════════════════════════
// ── CREATE CONTEST ───────────────────────────────────────
// ══════════════════════════════════════════════════════════
export const createContest = async (req, res) => {
    try {
        const { title, description, difficulty, startTime, endTime, problems, challengeIds } = req.body;

        if (!title || !startTime || !endTime) {
            return res.status(400).json({ error: 'Title, startTime, and endTime are required' });
        }
        if (new Date(endTime) <= new Date(startTime)) {
            return res.status(400).json({ error: 'End time must be after start time' });
        }

        // Support both: custom problems array OR legacy challengeIds array
        let contestProblems = [];
        if (problems && problems.length > 0) {
            // Custom problems from the Problem Builder
            contestProblems = problems.map(p => ({
                title: p.title,
                description: p.description,
                difficulty: p.difficulty || 'Beginner',
                hints: p.hints || [],
                points: p.points || (p.difficulty === 'Advanced' ? 150 : p.difficulty === 'Intermediate' ? 100 : 75),
                challengeId: '',
                isStatic: false,
                terminalConfig: p.terminalConfig || { files: [], setupCommands: [], gitBranches: [] },
                successCriteria: p.successCriteria || { description: '', fileChecks: [], gitChecks: {} },
                testCases: p.testCases || [],
                validationContext: p.successCriteria?.description || p.description,
            }));
        } else if (challengeIds && challengeIds.length > 0) {
            // Legacy: pick from static challenges
            contestProblems = staticChallengesToProblems(challengeIds);
        }

        if (contestProblems.length === 0) {
            return res.status(400).json({ error: 'At least one problem is required' });
        }

        const contest = await Contest.create({
            title,
            description: description || '',
            difficulty: difficulty || 'Mixed',
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            problems: contestProblems,
            createdBy: req.userId || null,
        });

        console.log(`  🏆 Contest created: "${contest.title}" with ${contestProblems.length} problems`);
        res.json({ contest: contest.toJSON() });
    } catch (err) {
        console.error('Contest create error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ══════════════════════════════════════════════════════════
// ── JOIN CONTEST ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════
export const joinContest = async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.id);
        if (!contest) return res.status(404).json({ error: 'Contest not found' });

        const now = new Date();
        if (now < contest.startTime) {
            return res.status(400).json({ error: 'Contest has not started yet' });
        }
        if (now > contest.endTime) {
            return res.status(400).json({ error: 'Contest has ended' });
        }

        const user = await User.findById(req.userId);
        if (!user) return res.status(401).json({ error: 'User not found' });

        let entry = contest.leaderboard.find(e => e.userId.toString() === req.userId);
        if (!entry) {
            contest.leaderboard.push({
                userId: user._id,
                username: user.username,
                totalScore: 0, totalTime: 0, solvedCount: 0, submissions: [],
            });
            await contest.save();
        }

        // Return problem list (without answers/setupCommands for security)
        const problemList = contest.problems.map((p, i) => ({
            index: i,
            title: p.title,
            difficulty: p.difficulty,
            description: p.description,
            hints: p.hints,
            points: p.points,
            isStatic: p.isStatic,
            // Show visible test cases only
            testCases: (p.testCases || []).filter(tc => !tc.hidden).map(tc => ({
                input: tc.input,
                expectedOutput: tc.expectedOutput,
            })),
        }));

        res.json({
            contestId: contest._id,
            title: contest.title,
            endTime: contest.endTime,
            challenges: problemList,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ══════════════════════════════════════════════════════════
// ── SETUP CONTEST CHALLENGE SANDBOX ──────────────────────
// ══════════════════════════════════════════════════════════

const contestSandboxes = new Map();

function getSandboxKey(contestId, userId, challengeIndex) {
    return `${contestId}:${userId}:${challengeIndex}`;
}

export const setupContestChallenge = async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.id);
        if (!contest) return res.status(404).json({ error: 'Contest not found' });

        const now = new Date();
        if (now > contest.endTime) return res.status(400).json({ error: 'Contest has ended' });
        if (now < contest.startTime) return res.status(400).json({ error: 'Contest has not started' });

        const { challengeIndex } = req.body;
        if (challengeIndex == null || challengeIndex < 0 || challengeIndex >= contest.problems.length) {
            return res.status(400).json({ error: 'Invalid challenge index' });
        }

        const problem = contest.problems[challengeIndex];
        const key = getSandboxKey(contest._id, req.userId, challengeIndex);

        console.log(contestSandboxes)
        // Destroy old sandbox
        if (contestSandboxes.has(key)) {
            console.log(key + "is presetnt")
            factory.destroySandbox(contestSandboxes.get(key));
            contestSandboxes.delete(key);
        }

        // Build challenge object from problem (works for both static & custom)
        const challenge = problemToChallenge(problem);

        const sandbox = factory.createSoloSandbox(challenge);
        contestSandboxes.set(key, sandbox);
        console.log("After update sandbox map is ", contestSandboxes)

        // Wire pty → per-user broadcast (NOT global broadcastToSolo)
        if (sandbox && sandbox.ptyProcess) {
            const broadcastToContestUser = req.app.locals.broadcastToContestUser;
            const userId = req.userId;
            const contestId = contest._id.toString();
            sandbox.ptyProcess.onData((data) => {
                // console.log("Data from sandbox:", { userId, contestId, challengeIndex, data: data.slice(-100) }); // Log last 100 chars for brevity

                sandbox.terminalHistory += data;
                if (sandbox.terminalHistory.length > 50000) {
                    sandbox.terminalHistory = sandbox.terminalHistory.slice(-40000);
                }
                // Route output only to THIS user's WS connections in THIS contest
                broadcastToContestUser(userId, contestId, { type: 'output', data });

            });

        }

        // Register per-user contest sandbox (NOT global solo state)
        req.app.locals.setContestSandbox(req.userId, contest._id.toString(), sandbox, challenge);

        console.log(`  🏆 Contest sandbox: user=${req.userId} problem=${challengeIndex} "${problem.title}" [${problem.isStatic ? 'static' : 'custom'}]`);
        res.json({ ok: true, challengeIndex });
    } catch (err) {
        console.error('Contest setup error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ══════════════════════════════════════════════════════════
// ── JUDGE CONTEST CHALLENGE ──────────────────────────────
// ══════════════════════════════════════════════════════════
export const judgeContestChallenge = async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.id);
        if (!contest) return res.status(404).json({ error: 'Contest not found' });

        const now = new Date();
        if (now > contest.endTime) {
            return res.status(400).json({ error: 'Contest has ended — submissions locked' });
        }

        const { challengeIndex, model, timeMs } = req.body;
        if (challengeIndex == null || challengeIndex < 0 || challengeIndex >= contest.problems.length) {
            return res.status(400).json({ error: 'Invalid challenge index' });
        }

        const problem = contest.problems[challengeIndex];
        const key = getSandboxKey(contest._id, req.userId, challengeIndex);
        const sandbox = contestSandboxes.get(key);

        if (!sandbox || !sandbox.challengeDir) {
            return res.status(400).json({ error: 'No active sandbox. Set up the challenge first.' });
        }

        // Build challenge object for the judge
        const challenge = problemToChallenge(problem);

        // Run programmatic checks first (if any)
        let programmaticScore = null;
        const sc = problem.successCriteria;
        if (sc) {
            const checks = [];

            // File content checks
            if (sc.fileChecks && sc.fileChecks.length > 0) {
                for (const fc of sc.fileChecks) {
                    try {
                        const filePath = path.join(sandbox.challengeDir, fc.path);
                        const content = fs.readFileSync(filePath, 'utf-8');
                        checks.push({ type: 'file', path: fc.path, pass: content.includes(fc.contains) });
                    } catch {
                        checks.push({ type: 'file', path: fc.path, pass: false });
                    }
                }
            }

            // Git state checks
            if (sc.gitChecks) {
                if (sc.gitChecks.branchExists) {
                    try {
                        const branches = execSync('git branch --list', { cwd: sandbox.challengeDir, encoding: 'utf-8' });
                        checks.push({ type: 'branch', pass: branches.includes(sc.gitChecks.branchExists) });
                    } catch {
                        checks.push({ type: 'branch', pass: false });
                    }
                }
                if (sc.gitChecks.commitMessageContains) {
                    try {
                        const log = execSync('git log --oneline --all', { cwd: sandbox.challengeDir, encoding: 'utf-8' });
                        checks.push({ type: 'commit', pass: log.includes(sc.gitChecks.commitMessageContains) });
                    } catch {
                        checks.push({ type: 'commit', pass: false });
                    }
                }
            }

            if (checks.length > 0) {
                const passCount = checks.filter(c => c.pass).length;
                programmaticScore = Math.round((passCount / checks.length) * 100);
            }
        }

        // AI judge (always runs — combines with programmatic checks)
        const modelName = model || 'gemini-2.5-flash';
        const judgeResult = await judgeRepo(challenge, sandbox.challengeDir, sandbox.terminalHistory, modelName);

        // Combine programmatic + AI scores if both exist
        let finalScore = judgeResult.score;
        if (programmaticScore !== null) {
            finalScore = Math.round((judgeResult.score * 0.6) + (programmaticScore * 0.4));
        }
        const passed = judgeResult.passed && finalScore >= 70;

        // Update leaderboard
        let entry = contest.leaderboard.find(e => e.userId.toString() === req.userId);
        if (!entry) {
            const user = await User.findById(req.userId);
            entry = { userId: req.userId, username: user?.username || 'Unknown', totalScore: 0, totalTime: 0, solvedCount: 0, submissions: [] };
            contest.leaderboard.push(entry);
            entry = contest.leaderboard[contest.leaderboard.length - 1];
        }

        const submissionScore = passed ? Math.round((finalScore / 100) * problem.points) : 0;
        let sub = entry.submissions.find(s => s.challengeIndex === challengeIndex);

        if (!sub) {
            entry.submissions.push({ challengeIndex, score: submissionScore, passed, timeMs: timeMs || 0, judgedAt: new Date() });
        } else if (!sub.passed && passed) {
            sub.score = submissionScore; sub.passed = passed; sub.timeMs = timeMs || 0; sub.judgedAt = new Date();
        } else if (!sub.passed) {
            sub.score = Math.max(sub.score, submissionScore); sub.timeMs = timeMs || 0; sub.judgedAt = new Date();
        }

        entry.totalScore = entry.submissions.reduce((sum, s) => sum + s.score, 0);
        entry.solvedCount = entry.submissions.filter(s => s.passed).length;
        entry.totalTime = entry.submissions.reduce((sum, s) => sum + (s.timeMs || 0), 0);

        await contest.save();

        // Broadcast real-time leaderboard update to all contest participants
        const broadcastToContest = req.app.locals.broadcastToContest;
        if (broadcastToContest) {
            const sorted = [...contest.leaderboard.toObject()].sort((a, b) => {
                if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
                return a.totalTime - b.totalTime;
            });
            const ranked = sorted.map((e, i) => ({ rank: i + 1, ...e }));
            broadcastToContest(contest._id.toString(), {
                type: 'leaderboard-update',
                contestId: contest._id.toString(),
                leaderboard: ranked,
            });
        }

        res.json({
            ...judgeResult,
            score: finalScore,
            passed,
            programmaticScore,
            contestScore: submissionScore,
            totalScore: entry.totalScore,
            solvedCount: entry.solvedCount,
        });
    } catch (err) {
        console.error('Contest judge error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ══════════════════════════════════════════════════════════
// ── LEADERBOARD ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════
export const getLeaderboard = async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.id)
            .select('title leaderboard')
            .lean({ virtuals: true });
        if (!contest) return res.status(404).json({ error: 'Contest not found' });

        const sorted = [...contest.leaderboard].sort((a, b) => {
            if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
            return a.totalTime - b.totalTime;
        });

        const ranked = sorted.map((entry, i) => ({ rank: i + 1, ...entry }));
        res.json({ title: contest.title, leaderboard: ranked });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ══════════════════════════════════════════════════════════
// ── GET AVAILABLE STATIC CHALLENGES ──────────────────────
// ══════════════════════════════════════════════════════════
export const getAvailableChallenges = async (req, res) => {
    const available = staticChallenges.map(c => ({
        id: c.id,
        title: c.title,
        difficulty: c.difficulty,
        description: c.description.slice(0, 120) + (c.description.length > 120 ? '…' : ''),
    }));
    res.json({ challenges: available });
};

// ══════════════════════════════════════════════════════════
// ── ADMIN: CREATOR AUTHORIZATION HELPER ──────────────────
// ══════════════════════════════════════════════════════════
async function requireContestCreator(req, res) {
    const contest = await Contest.findById(req.params.id);
    if (!contest) { res.status(404).json({ error: 'Contest not found' }); return null; }
    if (!contest.createdBy || contest.createdBy.toString() !== req.userId) {
        res.status(403).json({ error: 'Only the contest creator can perform this action' });
        return null;
    }
    return contest;
}

// ══════════════════════════════════════════════════════════
// ── ADMIN: UPDATE CONTEST ────────────────────────────────
// ══════════════════════════════════════════════════════════
export const updateContest = async (req, res) => {
    try {
        const contest = await requireContestCreator(req, res);
        if (!contest) return;

        const { title, description, difficulty, startTime, endTime, problems } = req.body;
        if (title !== undefined) contest.title = title.trim();
        if (description !== undefined) contest.description = description.trim();
        if (difficulty !== undefined) contest.difficulty = difficulty;
        if (startTime !== undefined) contest.startTime = new Date(startTime);
        if (endTime !== undefined) contest.endTime = new Date(endTime);

        // Allow updating problems only if contest hasn't started
        if (problems !== undefined) {
            const now = new Date();
            if (now >= contest.startTime) {
                return res.status(400).json({ error: 'Cannot modify problems after contest has started' });
            }
            contest.problems = problems;
        }

        await contest.save();
        console.log(`  🏆 Contest updated: "${contest.title}"`);
        res.json({ contest: contest.toJSON() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ══════════════════════════════════════════════════════════
// ── ADMIN: DELETE CONTEST ────────────────────────────────
// ══════════════════════════════════════════════════════════
export const deleteContest = async (req, res) => {
    try {
        const contest = await requireContestCreator(req, res);
        if (!contest) return;

        // Cleanup any active sandboxes for this contest
        for (const [key, sandbox] of contestSandboxes) {
            if (key.startsWith(contest._id.toString() + ':')) {
                factory.destroySandbox(sandbox);
                contestSandboxes.delete(key);
            }
        }

        await Contest.findByIdAndDelete(contest._id);
        console.log(`  🏆 Contest deleted: "${contest.title}"`);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ══════════════════════════════════════════════════════════
// ── ADMIN: END CONTEST IMMEDIATELY ───────────────────────
// ══════════════════════════════════════════════════════════
export const endContest = async (req, res) => {
    try {
        const contest = await requireContestCreator(req, res);
        if (!contest) return;

        contest.endTime = new Date(); // End now
        await contest.save();

        // Broadcast contest-ended to all participants
        const broadcastToContest = req.app.locals.broadcastToContest;
        if (broadcastToContest) {
            broadcastToContest(contest._id.toString(), {
                type: 'contest-ended',
                contestId: contest._id.toString(),
            });
        }

        console.log(`  🏆 Contest ended manually: "${contest.title}"`);
        res.json({ contest: contest.toJSON() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ══════════════════════════════════════════════════════════
// ── ADMIN: RESET LEADERBOARD ─────────────────────────────
// ══════════════════════════════════════════════════════════
export const resetLeaderboard = async (req, res) => {
    try {
        const contest = await requireContestCreator(req, res);
        if (!contest) return;

        contest.leaderboard = [];
        await contest.save();

        // Broadcast reset to all participants
        const broadcastToContest = req.app.locals.broadcastToContest;
        if (broadcastToContest) {
            broadcastToContest(contest._id.toString(), {
                type: 'leaderboard-update',
                contestId: contest._id.toString(),
                leaderboard: [],
            });
        }

        console.log(`  🏆 Leaderboard reset: "${contest.title}"`);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ══════════════════════════════════════════════════════════
// ── ADMIN: REMOVE PARTICIPANT ────────────────────────────
// ══════════════════════════════════════════════════════════
export const removeParticipant = async (req, res) => {
    try {
        const contest = await requireContestCreator(req, res);
        if (!contest) return;

        const { userId } = req.params;
        const idx = contest.leaderboard.findIndex(e => e.userId.toString() === userId);
        if (idx === -1) return res.status(404).json({ error: 'Participant not found' });

        const removed = contest.leaderboard[idx];
        contest.leaderboard.splice(idx, 1);
        await contest.save();

        // Cleanup sandboxes for removed user
        for (const [key, sandbox] of contestSandboxes) {
            if (key.startsWith(`${contest._id}:${userId}:`)) {
                factory.destroySandbox(sandbox);
                contestSandboxes.delete(key);
            }
        }

        // Notify the removed user via WS
        const broadcastToContestUser = req.app.locals.broadcastToContestUser;
        if (broadcastToContestUser) {
            broadcastToContestUser(userId, contest._id.toString(), {
                type: 'removed-from-contest',
                contestId: contest._id.toString(),
            });
        }

        console.log(`  🏆 Removed ${removed.username} from "${contest.title}"`);
        res.json({ ok: true, removed: removed.username });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ══════════════════════════════════════════════════════════
// ── ADMIN: GET PARTICIPANTS ──────────────────────────────
// ══════════════════════════════════════════════════════════
export const getContestParticipants = async (req, res) => {
    try {
        const contest = await requireContestCreator(req, res);
        if (!contest) return;

        const participants = contest.leaderboard.map(e => ({
            userId: e.userId,
            username: e.username,
            totalScore: e.totalScore,
            solvedCount: e.solvedCount,
            totalTime: e.totalTime,
            submissionCount: e.submissions?.length || 0,
        }));

        res.json({ participants });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
