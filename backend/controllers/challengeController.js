import User from "../models/User.js";
import ChallengeResult from "../models/ChallengeResult.js";
import factory from '../utilities/SandboxFactory.js';
import { judgeRepo, configureGit } from "../utilities/gitUtils.js";
import { getOrGenerateChallenge, cleanupSoloChallenge } from "../utilities/challengeUtils.js";


export const judgeSolution = async (req, res) => {
    // Access solo state from app.locals (set by server.js)
    const { currentChallenge, challengeDir, terminalHistory } = req.app.locals.getSoloState();

    if (!currentChallenge || !challengeDir) {
        return res.status(400).json({ error: 'No active challenge. Click Play first.' });
    }
    const modelName = req.body.model || 'gemini-2.5-flash';
    const timeMs = req.body.elapsed || 0;

    console.log("The time is ", timeMs)
    try {
        const json = await judgeRepo(currentChallenge, challengeDir, terminalHistory, modelName);

        console.log(req.userId)
        // Save score if logged in
        if (req.userId && json.passed !== undefined) {
            const user = await User.findById(req.userId);
            console.log(user)
            if (user) {
                const passed = json.passed && json.score >= 70;
                await ChallengeResult.create({
                    userId: user._id,
                    challengeId: currentChallenge.id || 'unknown',
                    title: currentChallenge.title || 'Unknown Challenge',
                    difficulty: currentChallenge.difficulty || 'Beginner',
                    score: json.score || 0,
                    passed,
                    timeMs,
                    mode: 'solo',
                    isAIGenerated: currentChallenge.isAIGenerated || false
                });

                if (passed) {
                    user.stats.solved += 1;
                    user.stats.lastSolvedDate = new Date();
                    const newAvg = ((user.stats.avgScore * (user.stats.contestsPlayed || 0)) + json.score) / ((user.stats.contestsPlayed || 0) + 1);
                    user.stats.avgScore = newAvg;
                    user.stats.contestsPlayed = (user.stats.contestsPlayed || 0) + 1;
                    user.stats.fastestSolveMs = Math.min(user.stats.fastestSolveMs, timeMs)
                    await user.save();
                }
            }
        }

        res.json(json);
    } catch (e) {
        console.error('LLM judge error:', e.message);
        res.status(500).json({ error: `LLM error: ${e.message}` });
    }
}

export const generateChallange = async (req, res) => {
    // Cleanup previous sandbox via app.locals state
    const { soloSandbox: prevSandbox } = req.app.locals.getSoloState();
    cleanupSoloChallenge(prevSandbox);

    const difficulty = req.query.difficulty || '';
    const modelName = req.query.model || 'gemini-2.0-flash';
    configureGit();

    const result = await getOrGenerateChallenge(difficulty, modelName);
    if (!result) return res.status(404).json({ error: 'No challenges available' });

    // ── Factory creates the sandbox ──
    let soloSandbox = null;
    try {
        soloSandbox = factory.createSoloSandbox(result.challenge);
    } catch (e) {
        console.error('Challenge setup failed:', e.message);
        return res.status(500).json({ error: 'Challenge setup failed' });
    }

    // Store solo state in app.locals (accessible by server.js and other controllers)
    req.app.locals.setSoloState(soloSandbox, result.challenge);

    // Wire pty output → all solo WS clients via app.locals broadcast helper
    const broadcastToSolo = req.app.locals.broadcastToSolo;
    if (soloSandbox && soloSandbox.ptyProcess) {
        // this is the output that the process will get when it runs, we save it to terminalHistory and also broadcast to any connected solo clients
        soloSandbox.ptyProcess.onData((data) => {
            soloSandbox.terminalHistory += data;
            if (soloSandbox.terminalHistory.length > 50000) {
                soloSandbox.terminalHistory = soloSandbox.terminalHistory.slice(-40000);
            }
            broadcastToSolo({ type: 'output', data });
        });
    }

    console.log(`  📝 Solo challenge (${result.source}): ${result.challenge.title} [${result.challenge.difficulty}]`);
    res.json({
        id: result.challenge.id,
        title: result.challenge.title,
        difficulty: result.challenge.difficulty,
        description: result.challenge.description,
        hints: result.challenge.hints,
        isAIGenerated: result.challenge.isAIGenerated,
    });

}