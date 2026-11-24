# Decision experiments: what each variant changes

Two ADRs are tested. Each variant is switched by a repository variable or the `variant` input of `workflow_dispatch`, so the workflow file is identical across variants and every run is linkable.

## E1 — ADR-008 (reviewer independence)

**Question:** does keeping the reviewer blind to the builders' reasoning, and on a different model, change what it catches?

| | Variant E1-A "informed, same model" | Variant E1-B "independent" (default, ADR-008) |
|---|---|---|
| Switch | `GITCORE_VARIANT=reviewer_sees_rationale` | `GITCORE_VARIANT` empty |
| Reviewer model | `MODEL_BUILDER` (same as implementer) | `MODEL_REVIEWER` (different vendor) |
| Reviewer context | issue + diff + repo **+ design.md + test_report.md** from the build | issue + diff + repo only |
| Everything else | same prompt, tools, budgets, anti-rubber-stamp rule | same |

**Run:** both variants on the same 5 seeded PRs (`/autose review`, or `workflow_dispatch`) and on the real PRs from the 5 issues. For seeded PRs the design rationale is the PR description (they have no build artifacts), so E1-A on seeded PRs mainly tests the **model** factor. On the real issue PRs it tests both factors together.

**Measures** (per variant): defects caught (planted defects flagged with a correct file/category, out of 4); false alarms on sp1 (out of 1); approval rate on real PRs vs hidden-test outcome (approvals of PRs that fail hidden tests = missed); review tokens and cost.

**Prediction written before running:** E1-B catches more planted defects (especially sp2 tampering and sp3 fail-open, where a reviewer that reads "tests pass" in the test report is likely to agree), at the cost of more false alarms.

### E1 follow-up: sp5, reviewer model strength

**What happened:** The default reviewer is `gemini-3.5-flash-lite`. On the five seeded PRs it gave the expected verdict on four:

| Seeded PR | Verdict | Expected | Matches label |
|---|---|---|---|
| sp1 (#10) | approve | approve | yes |
| sp2 (#9) | request_changes | request_changes | yes |
| sp3 (#8) | request_changes | request_changes | yes |
| sp4 (#11) | request_changes | request_changes | yes |
| sp5 (#12) | approve, 0 findings, 1 tool call ([run 45437381473](https://github.com/H9660/Gitwallah_v2/actions/runs/45437381473)) | request_changes | **no** |

sp5's planted defect is a spec mismatch rather than broken code. The issue asks for an ISO 8601 `expiresAt`, but the PR returns epoch seconds. It also duplicates the 30-minute TTL, and its tests are too weak to notice either problem (`toBeDefined`, `toEqual` loosened to `toMatchObject`). Catching it needs comparing the code against the wording of the issue. The diff alone is not enough. The reviewer made only one tool call, so it barely looked past the diff.

**Follow-up run:** `/autose review` on the same PR #12, with only `MODEL_REVIEWER` changed to a stronger model (and `GITCORE_PRICE_IN_REVIEW` / `GITCORE_PRICE_OUT_REVIEW` changed to match). Nothing changes except the model:
- the same diff (no pushes to the branch between the reviews);
- the same issue, prompt, tools and budgets;
- `GITCORE_VARIANT` empty, so the reviewer stays independent (ADR-008).

On-demand reviews start fresh. They do not see earlier review comments on the PR, so the second review is not primed by the first.

**Question:** with independence held fixed, does a stronger reviewer model catch a spec-level defect that the cheap one approved?

**Compare:** verdict, whether a finding names the ISO-vs-epoch mismatch or the weakened test (`defect_caught`), tool calls, review tokens and cost.

This follow-up review is recorded as variant **`E1-C`** ("independent, stronger reviewer model") in `results.csv` and `runs.md`, so it stays separate from the default flash-lite reviews.

**Result: the stronger model also approved.**

| | Review 1 | Review 2 |
|---|---|---|
| `MODEL_REVIEWER` | `gemini-3.5-flash-lite` | `gemini-3.8-flash` |
| Verdict | approve | **approve** |
| Findings | 0 | 0 |
| Tool calls | 1 | 6 |
| What it checked | read `DuelSession.js`, ran the tests | read `DuelSession.js` and `server.js`, read the test file, grepped the `getInfo` callers, ran the tests (157 passed) |
| Planted defect caught | no | no |

The stronger model looked much harder: six tool calls against one. It **saw every part of the defect and accepted each one as fine:**
- It states that `expiresAt` is "in Unix epoch seconds". Issue #7 asks for "an ISO 8601 string, e.g. `"2026-11-20T10:30:00.000Z"`". The reviewer did not compare the format with the issue.
- It found the `1800` constant and checked it against `server.js`'s `30 * 60 * 1000`. It called that "matching" and did not flag the duplication.
- It noticed that the existing test was relaxed from `toEqual` to `toMatchObject`, and accepted the PR's reason. It did not notice that the new test only checks `toBeDefined`.

Its restatement of the request ("Add an `expiresAt` field to duel room info returned by `DuelSession.getInfo()`") leaves out the format. So the requirement was lost when the reviewer summarised the issue, before any checking started.

**What this means for E1 and ADR-008:**
- On sp5, a stronger model added investigation but not judgement. Both models missed a defect that only shows up when the code is compared with the exact wording of the issue.
- The anti-rubber-stamp rule (list risks, show evidence) did not help. The reviewer listed the right risks and then marked them `ok` using evidence that confirmed the defect.
- Possible fix, not yet tested: make the reviewer restate each concrete requirement from the issue (formats, values, names) as a checklist and check each one against the diff, instead of a one-line summary.
- Score for the reviewer on the seeded PRs: **4/5 correct verdicts with either model**. sp5 is missed by both.

## E2 — ADR-006 (model choice for the builders)

**Question:** is a cheap fast builder model good enough, or does a stronger model pay for itself through fewer retries?

| | Variant E2-A "cheap builder" (default) | Variant E2-B "strong builder" |
|---|---|---|
| Switch | `MODEL_BUILDER` = default cheap model | `MODEL_BUILDER` = stronger model (set the repo variable, re-run) |
| Reviewer | unchanged (`MODEL_REVIEWER`) | unchanged |

**Run:** the same 5 issues with each variant (`workflow_dispatch` with the issue number; delete the `autose/issue-<n>` branch and close the PR between variants so each starts clean).

**Measures:** stage pass rate per stage; implementation attempts and redesigns; hidden tests passed; reviewer verdict; tokens, cost, wall time.

**Prediction:** E2-B needs fewer attempts on B2 and F2 (which need reading two files / updating an existing test), with similar results on B1 and F1. The question is whether the cost per successful issue is lower.

## Bookkeeping

- Every run goes into `results/results.csv` with `variant` set, and its links go into `results/runs.md`.
- Write down the model slugs actually used (OpenRouter slugs change) in the README.
- Negative results count as much as positive ones: if E1-B is no better, report it and say what that means for ADR-008 (and mark the ADR *Superseded* by a new one if the design changes).
