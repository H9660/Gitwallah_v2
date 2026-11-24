# GitWallah — Architecture

GitWallah is a web app for practising Git. A player gets a Git challenge, solves it in a real terminal in the browser, and an LLM judges the resulting repository. There are three modes: **solo**, **duel** (two players race on the same challenge) and **contest** (timed problem sets with a leaderboard).

This file is for anyone (human or agent) about to change the code. It tells you where things live, which invariants must hold, and how to test a change.

## 1. Layout

```
backend/                     Node.js (ESM) + Express + ws + Mongoose
  server.js                  App bootstrap, solo/duel HTTP routes, WebSocket router, in-memory session maps
  DuelSession.js             Duel room state machine (State pattern)
  challenges.js              Static challenge catalogue (15 challenges, each with setup(dir))
  docker-helpers.js          Docker CLI wrappers: create/destroy container, exec, PTY inside container
  controllers/
    userController.js        register / login / me / profile
    challengeController.js   solo: generate challenge, judge solution, record ChallengeResult
    contestController.js     contest CRUD, join, per-user sandbox setup, judge, leaderboard, admin actions
  routes/                    Express routers: /api/auth, /api/challenge, /api/contests
  middleware/auth.js         JWT: generateToken, requireAuth, optionalAuth
  models/                    Mongoose: User, Contest (+ embedded problems/leaderboard), ChallengeResult
  utilities/
    SandboxFactory.js        Factory pattern: create/destroy sandboxes (temp dir + container + pty)
    challengeUtils.js        pickStaticChallenge, generateChallengeWithAI, getOrGenerateChallenge (AI -> static fallback)
    gitUtils.js              executeSetupCommands, getRepoState, parseGeminiJSON, judgeRepo (LLM judge)
    aiUtil.js                OpenRouter client (singleton), getPrompt, generateContent, local Ollama fallback
    roomUtils.js, wsUtils.js, dirUtils.js, dbUtil.js   small helpers
  tests/                     Vitest suite (see §6)
  scripts/check-syntax.mjs   "build": node --check on every source file
frontend/                    React + Vite SPA (pages/, components/, contexts/, api.js)
```

## 2. Main flows

**Solo.** `GET /api/challenge/generate` → `getOrGenerateChallenge(difficulty, model)` tries the LLM (`generateChallengeWithAI`) and falls back to a static challenge → `SandboxFactory.createSoloSandbox` → PTY output is streamed to all solo WebSocket clients. `POST /api/challenge/judge` (auth) → `judgeRepo(challenge, dir, history, model)` → saves a `ChallengeResult` and updates `user.stats` when the score is at least 70.

**Duel.** `POST /api/duel/create` creates a `DuelSession` (WAITING). The challenger joins over WS (`duel-join`) → READY. `POST /api/duel/:roomId/accept` → `session.accept()` creates one sandbox per player → PLAYING. `POST /api/duel/:roomId/judge` → `judgeRepo` → `session.submitJudgement(role, result)`. The first pass with score ≥ 70 wins → FINISHED. A disconnect awards the win to the opponent. Rooms expire after 30 min (sweep every 10 min in `server.js`).

**Contest.** `contestController`: `createContest` (from custom `problems` or legacy static `challengeIds`), `joinContest` (time window checked, hidden test cases stripped), `setupContestChallenge` (per user+problem sandbox, output only to that user), `judgeContestChallenge` (programmatic checks 40% + LLM 60%, pass ≥ 70, updates leaderboard, broadcasts), admin actions limited to the creator via `requireContestCreator`.

## 3. Invariants (do not break)

1. **Duel state machine.** Only `DuelSession` methods change `state`. Every transition is checked against `VALID_TRANSITIONS`, and illegal calls return `{ ok: false, error }` instead of throwing. FINISHED is terminal.
2. **Pass rule.** A solution passes only if `passed === true` **and** `score >= 70`. This applies in solo, duel and contest mode.
3. **No leaking answers.** Data sent to players (`getChallengeData`, `joinContest`) must not include `setupCommands`, `validationContext`, `terminalConfig` or hidden test cases.
4. **Sandbox lifecycle.** Everything created by `SandboxFactory` must be released with `destroySandbox` (kill the PTY, remove the container, delete the temp dir). Never spawn a PTY or container directly from a controller.
5. **Auth.** Mutating contest routes use `requireAuth`. Creator-only actions go through `requireContestCreator` (403 for anyone else). Responses never contain `passwordHash`.
6. **LLM output is untrusted.** Parse it with `parseGeminiJSON`, validate the required fields, and fall back (static challenge, or `{passed:false, score:0}` verdict) instead of crashing.

## 4. Extension points

- New challenge source: implement it in `challengeUtils.js` and keep the `{ challenge, source }` return shape.
- New sandbox kind: add a factory method in `SandboxFactory` that returns the standard sandbox shape `{ containerId, ptyProcess, challengeDir, terminalHistory }`.
- New contest validation: add it in the controller before `contest.save()` and return `400 { error }`.

## 5. Configuration

`.env` (never committed): `MONGO_URI`, `JWT_SECRET`, `OPENROUTER_API_KEY`, `PORT`. Docker is optional; without Docker the sandbox falls back to a local PTY (development only).

## 6. Testing

```
cd backend
npm ci --ignore-scripts      # node-pty is native; tests mock it
npm run build                # syntax check of every source file
npm test                     # vitest run, about 5 s, no Mongo/Docker/network needed
```

- Tests live in `backend/tests/*.test.js` (Vitest, ESM). Shared doubles are in `tests/helpers.js` (`mockRes`, `chain` for Mongoose queries, `fakePty`, temp dirs).
- Mock modules with `vi.mock('../path.js', factory)` **before** a dynamic `await import(...)` of the module under test (see `duelSession.test.js`, `contestController.test.js`).
- Controllers are tested by calling the handler with `{ params, body, query, userId, app: { locals } }` and `mockRes()`.
- Tests that shell out with POSIX syntax use `it.skipIf(isWindows)`.
- Name a test after the behaviour it checks. When a test covers an acceptance criterion from an issue, put the criterion id in the test name, for example `it('AC-2: rejects ...')`.
