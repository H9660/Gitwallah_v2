# Local verification before the first real run

Everything here ran locally (Windows 11, plus WSL Ubuntu 24.04 with Node 22.11 and Python 3.12). **No model was called.** The "fake" brain replays scripted agent replies. These checks show that the harness, the checks and the experiment material work. They are **not** results of the agentic workflow; those come only from real GitHub Actions runs (`runs.md`).

## 1. Fork test suite (baseline at the pinned commit)

- `backend/` had no tests before. Added: Vitest suite with 156 tests in 11 files (`backend/tests/`), plus `npm run build` (syntax check of every source file).
- Windows: 138 passed, 18 skipped (POSIX-only shell tests). WSL/Linux: 156 passed. Runtime about 4 s.
- Writing the suite found two real defects in GitWallah, which became issues for the experiment:
  - `DuelSession.accept()` can run again in PLAYING (the transition table allows PLAYING → PLAYING for failed judge attempts). It recreates both sandboxes and leaks containers → issue **B1**.
  - `gitUtils.judgeRepo` calls `generateChallengeWithLocalModel` without importing it, so the judge fallback always fails → issue **B2**.
- Also found, not used as an issue: `controllers/challengeController.js` imports `../utilities/redisUtils.js`, which does not exist. The server cannot start at this commit (`ERR_MODULE_NOT_FOUND`); the tests do not import that controller.

## 2. Harness unit tests (`.autose/tests`, pytest)

26 passed: path allow-lists and forbidden paths, secret scrubbing, every stage check, test-tampering detection, reviewer anti-rubber-stamp rules and routing, JSON extraction, budget stop, line-ending preservation, and the gate/release/post-review/finalize commands with `gh` stubbed.

Defects found by these tests and fixed before the first run:
- the gate treated `/autose review` on a PR as a new pipeline run (an empty `pull_request` object is falsy in Python);
- file edits converted CRLF files to LF, which would have produced whole-file diffs.

## 3. Scripted end-to-end run of stages 1–4 (issue B1, WSL)

`BRAIN=fake` with `.autose/tests/fixtures/fake_issue_b1.json`: spec → check → design (grep + read_file) → check → implement (replace_in_file + run_build) → build check → test agent writes `issue_b1.test.js` → full suite → `status: ready` after 1 attempt; 158 tests passed; AC-1 and AC-2 each covered by a passing test.

Defects found by this run and fixed:
1. Python wrote `__pycache__/*.pyc` into `.autose/` inside the checkout. The build check correctly failed the stage ("changed a file outside the design"), and the bytecode would have ended up in `diff.patch`. Fix: `.gitignore` + `PYTHONDONTWRITEBYTECODE=1`.
2. Three static-challenge tests failed on Linux: the challenges run `git checkout main` and rely on the app's runtime `git config --global init.defaultBranch main`. My Windows machine had that setting; a GitHub runner does not. Fix: the test setup passes `init.defaultBranch=main` through `GIT_CONFIG_*` env vars. This would otherwise have made CI fail on every PR.

## 4. Hidden tests are valid (fail before, pass after a reference fix)

| Issue | Baseline | With reference fix | Full suite with fix |
|---|---|---|---|
| B1 | 2 failed, 2 passed (4) | 4 passed | 160 passed |
| B2 | 4 failed (4) | 4 passed | 160 passed |
| F1 | 4 failed, 1 passed (5) | 5 passed | 161 passed |
| F2 | 3 failed (3) | 3 passed | 158 passed, 1 failed (expected: the visible `getInfo` test must be updated, see `experiment/hidden_tests/README.md`) |
| V1 | 3 failed, 1 passed (4) | 4 passed | 160 passed |

## 5. Seeded PRs apply, build and pass CI

| PR | Build | Visible tests | Size |
|---|---|---|---|
| sp1 | ok | 160 passed | 2 files, +58 −1 |
| sp2 | ok | 156 passed, 1 skipped | 3 files, +27 −1 |
| sp3 | ok | 156 passed | 2 files, +5 −5 |
| sp4 | ok | 158 passed | 3 files, +29 −2 |
| sp5 | ok | 157 passed | 3 files, +12 −1 |

All five are green in CI, so only the reviewer can separate the correct PR from the four defective ones.
