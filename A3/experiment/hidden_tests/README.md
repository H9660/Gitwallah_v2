# Hidden acceptance tests

These tests stay **outside the fork**, so no agent (builder or reviewer) can see them. Each file belongs to one issue in `../issues/` and has 3–4 tests.

| File | Issue | Tests | On the pinned baseline | With reference fix |
|---|---|---|---|---|
| `hidden_b1_duel_accept.test.js` | B1 bug: duel accepted twice | 4 | 2 fail, 2 pass (H-B1-3 and the H-B1-4 regression guard already hold) | 4 pass |
| `hidden_b2_judge_fallback.test.js` | B2 bug: judge fallback crashes | 4 | 4 fail | 4 pass |
| `hidden_f1_filter_challenges.test.js` | F1 feature: difficulty filter | 5 (one `it.each` × 3) | 4 fail, 1 pass (no-filter case) | 5 pass |
| `hidden_f2_room_expiry.test.js` | F2 feature: `expiresAt` | 3 | 3 fail | 3 pass |
| `hidden_v1_contest_editing.test.js` | V1 vague: contest editing | 4 | 3 fail, 1 pass (regression guard) | 4 pass |

The baseline and reference-fix columns were measured on Linux (Node 22, Vitest 3.2.4) against the pinned commit. `reference_fixes/*.patch` are the minimal fixes used to show that each hidden test can pass, so the tests are fair. They are **not** given to the pipeline.

Note on F2: the reference fix makes one *visible* test fail (`duelSession.test.js › getInfo exposes only public room info` pins the room-info object with `toEqual`). A correct PR for F2 must update that expectation without weakening the rest of the test. This is deliberate. It checks whether the pipeline handles a legitimate change to an existing test, and whether the reviewer tells that apart from test tampering (seeded PR sp2/sp5).

## How to run against a GitCore PR

```bash
# from A3/experiment/hidden_tests (Git Bash on Windows works too)
bash run_hidden.sh <path-to-fork-clone> <b1|b2|f1|f2|v1> <PR number | branch>
bash run_hidden.sh ../../../Gitwallah_v2 b2 7              # PR #7
bash run_hidden.sh ../../../Gitwallah_v2 b2 autose/issue-2 # or the branch
```

On Windows, use `run_hidden.ps1`. It also **records the run** in `results/results.csv` and `results/runs.md`:

```powershell
powershell -ExecutionPolicy Bypass -File .\run_hidden.ps1 ..\..\..\Gitwallah_v2 b2 3                   # by PR
powershell -ExecutionPolicy Bypass -File .\run_hidden.ps1 ..\..\..\Gitwallah_v2 v1 -RunId <run id|url>  # run without a PR
# options: -BuilderModel <code>  -Variant E1-A  -Notes "..."  -NoRecord
```

Every value comes from a real source: the hidden-test run, the run-summary, stop and review comments the pipeline posts, and the Actions API. Nothing is typed in by hand except `-BuilderModel` and `-Variant`. Rows are keyed by `run_id`, so running it again replaces that run's row. Record failed runs as well (for example the 402 run), because they are real runs.

The script checks out the PR head in a temporary git worktree (your working copy is untouched), copies the hidden file in, and prints `hidden: passed/total` and the names of failing tests. It then runs the full suite on the PR head. The worktree is removed afterwards, and nothing is committed or pushed.

Record the result in `results/results.csv` (`hidden_passed`, `hidden_total`). For V1, a run that stops at *needs-clarification* (no PR) is recorded as `clarified` instead of a hidden-test score. Run it again after a review round-2 fix, because the PR head changes.
