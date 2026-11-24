# Runs

Every GitCore run, its PR and its review comments. Fork: https://github.com/H9660/Gitwallah_v2 (keep it public until grades are released).

## Issues in the fork

| ID | Kind | GitHub issue |
|---|---|---|
| B1 | bug | [#1](https://github.com/H9660/Gitwallah_v2/issues/1) |
| B2 | bug | [#2](https://github.com/H9660/Gitwallah_v2/issues/2) |
| F1 | feature | [#5](https://github.com/H9660/Gitwallah_v2/issues/5) |
| F2 | feature | [#7](https://github.com/H9660/Gitwallah_v2/issues/7) |
| V1 | vague | [#13](https://github.com/H9660/Gitwallah_v2/issues/13) |

## Pipeline runs (one row per Actions run)

| Date | Item | Variant | Actions run | PR | Review round 1 | Review round 2 | Final |
|---|---|---|---|---|---|---|---|
| 2026-11-24 | B2 | default | [45353186969](https://github.com/H9660/Gitwallah_v2/actions/runs/45353186969) | [#3](https://github.com/H9660/Gitwallah_v2/pull/3) | approve | skip | ready/approve |
| 2026-11-24 | B1 | default | [45383631388](https://github.com/H9660/Gitwallah_v2/actions/runs/45383631388) | [#4](https://github.com/H9660/Gitwallah_v2/pull/4) | approve | skip | ready/approve |
| 2026-11-24 | F2 | default | [45448309228](https://github.com/H9660/Gitwallah_v2/actions/runs/45448309228) | [#15](https://github.com/H9660/Gitwallah_v2/pull/15) | error (RESOURCE_EXHAUSTED) | skip | ready/no review |
| 2026-11-24 | F1 | default | [45385698233](https://github.com/H9660/Gitwallah_v2/actions/runs/45385698233) | [#6](https://github.com/H9660/Gitwallah_v2/pull/6) | approve | skip | ready/approve |
| 2026-11-24 | V1 | default | [45402624706](https://github.com/H9660/Gitwallah_v2/actions/runs/45402624706) | [#14](https://github.com/H9660/Gitwallah_v2/pull/14) | approve | skip | ready/approve |

## Seeded PR reviews

| Seeded PR | Variant | PR link | Actions run (`/autose review`) | Review comment | Verdict | Expected |
|---|---|---|---|---|---|---|
| sp1 | default | [#10](https://github.com/H9660/Gitwallah_v2/pull/10) | [45437137212](https://github.com/H9660/Gitwallah_v2/actions/runs/45437137212) | [comment](https://github.com/H9660/Gitwallah_v2/pull/10#issuecomment-7137685095) | approve | approve |
| sp2 | default | [#9](https://github.com/H9660/Gitwallah_v2/pull/9) | [45436745191](https://github.com/H9660/Gitwallah_v2/actions/runs/45436745191) | [comment](https://github.com/H9660/Gitwallah_v2/pull/9#issuecomment-7137635185) | request_changes | request_changes |
| sp3 | default | [#8](https://github.com/H9660/Gitwallah_v2/pull/8) | [45404598065](https://github.com/H9660/Gitwallah_v2/actions/runs/45404598065) | [comment](https://github.com/H9660/Gitwallah_v2/pull/8#issuecomment-7133011974) | request_changes | request_changes |
| sp4 | default | [#11](https://github.com/H9660/Gitwallah_v2/pull/11) | [45405465965](https://github.com/H9660/Gitwallah_v2/actions/runs/45405465965) | [comment](https://github.com/H9660/Gitwallah_v2/pull/11#issuecomment-7133128828) | request_changes | request_changes |
| sp5 | E1-C | [#12](https://github.com/H9660/Gitwallah_v2/pull/12) | [45441807124](https://github.com/H9660/Gitwallah_v2/actions/runs/45441807124) | [comment](https://github.com/H9660/Gitwallah_v2/pull/12#issuecomment-7138318712) | approve | request_changes |

**Note on V1 (issue #13, PR #14):** GitCore did not ask for clarification on the vague issue. It read the issue as specific enough and built a fix, and the reviewer approved it with 0 findings. On the PR, the hidden tests pass **3/4**: `H-V1-3: an unparsable date is rejected` fails. So the approval was wrong (`expected_verdict = request_changes`, `reviewer_correct = false`). This is the only issue PR so far whose approval the hidden tests contradict.

Seeded PR numbers on the fork: sp1 = #10, sp2 = #9, sp3 = #8, sp4 = #11, sp5 = #12.

**Note on sp5 (PR #12):** the first `/autose review` ([run 45437381473](https://github.com/H9660/Gitwallah_v2/actions/runs/45437381473)), with `MODEL_REVIEWER = gemini-3.5-flash-lite`, **approved** the PR with 0 findings and 1 tool call. `labels.json` expects `request_changes`. The planted defect is that `expiresAt` is a number of epoch seconds instead of an ISO 8601 string, the 30-minute TTL is duplicated, and the tests are weakened to `toBeDefined` / `toMatchObject`. The reviewer missed all of it (`reviewer_correct = false`, `defect_caught = no`). The same PR is being reviewed again with a stronger `MODEL_REVIEWER`, with nothing pushed to the branch in between, so both reviews see the same diff. The second review gets its own row above.

**sp5 second review (`MODEL_REVIEWER = gemini-3.8-flash`):** also **approved** PR #12, with 0 findings and 6 tool calls. Its evidence says that `expiresAt` is "in Unix epoch seconds" and that the existing test was relaxed to `toMatchObject`. It saw both problems and accepted them, and its restatement of the issue left out the ISO 8601 requirement. Result: `reviewer_correct = false`, `defect_caught = no`. Both review comments are on [PR #12](https://github.com/H9660/Gitwallah_v2/pull/12). The comparison is written up under E1 in [`experiment/variants.md`](../experiment/variants.md#e1-follow-up-sp5-reviewer-model-strength).

## Total model usage

Summed from `results.csv` (builder + reviewer tokens). Last updated 2026-11-24.

| Variant | Runs | Tokens | USD |
|---|---|---|---|
| default, issue pipeline runs (B1, B2, F1, F2, V1) | 5 | 770,611 (builder 739,636 + reviewer 30,975) | 1.3391 |
| default, seeded reviews (sp1–sp4, `gemini-3.5-flash-lite`) | 4 | not recorded | not recorded |
| E1-C, seeded review (sp5, `gemini-3.8-flash`) | 1 | not recorded | not recorded |
| **Total** | **10** | **770,611 + seeded reviews** | **1.3391 + seeded reviews** |

Per issue run:

| Item | Tokens | USD | Hidden tests |
|---|---|---|---|
| B1 | 129,655 | 0.2344 | 4/4 |
| B2 | 152,152 | 0.2613 | 4/4 |
| F1 | 132,783 | 0.2368 | 5/5 |
| F2 | 198,366 | 0.3261 | 3/3 |
| V1 | 157,655 | 0.2805 | 3/4 |

Average across the five issue runs: about 154k tokens and $0.27. F2 has builder tokens only, because its review job failed with `RESOURCE_EXHAUSTED` (Gemini quota) before it posted a verdict. Tokens the reviewer may have used before the failure are not counted.

Not yet included:
- **Seeded reviews:** the review comments on the seeded PRs have no `Reviewer tokens: … ($…)` footer, so the script could not read their usage. The numbers are in `review_3.json` → `usage` inside each run's `gitcore-review-on-demand` artifact.
- **sp5 first review:** run 45437381473 (`gemini-3.5-flash-lite`) is not in `results.csv` yet.
- **Failed and draft runs:** the earlier failed F2 runs (45386362524, 45387518256 and one more) and the earlier B2 runs 45350486421 and 45352772584 are not recorded yet. They used tokens too, so the total is a lower bound until they are added.
