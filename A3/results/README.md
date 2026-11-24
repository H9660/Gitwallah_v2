# results/

- `results.csv`: one row per GitHub Actions run. **Only real runs go here.** Every row needs `actions_run_url`.
- `runs.md`: links to every run, PR and review comment.
- `local_verification.md`: what was verified offline before the first real run (harness tests, scripted run, hidden-test and seeded-PR validation). This is not a substitute for real runs.

## Column guide for results.csv

| Column | Values |
|---|---|
| `run_type` | `issue` (one of the 5 issues) or `seeded` (one of the 5 seeded PRs, review only) |
| `item` | `B1 B2 F1 F2 V1` or `sp1`…`sp5` |
| `variant` | `default`, `E1-A`, `E2-B` (see `experiment/variants.md`) |
| `s1_spec` … `s5_release` | `pass` / `fail` / `clarify` (stage 1 only) / `budget` / `skip` (not reached); `s5_release` = `draft` when a failed run opened a draft PR with its partial work (not reviewed, never merge-ready) |
| `s6_review_r1`, `s6_review_r2` | `approve` / `request_changes` / `skip` / `error` (the review job failed before posting a verdict, e.g. `RESOURCE_EXHAUSTED`; the reason goes in `notes`) |
| `final_status` | the `status` from `state.json` (`ready`, `needs_clarification`, `failed`, `budget_hit`) + final verdict |
| `hidden_passed`, `hidden_total` | from running `experiment/hidden_tests` on the PR head (draft PRs included: shows how far a failed run got); empty if no PR |
| `expected_verdict`, `reviewer_correct`, `defect_caught` | seeded PRs: from `labels.json`; issue PRs: `expected_verdict` = approve if all hidden tests pass, else request_changes |
| `tokens_*`, `usd_total` | from `run_record.json` in the `gitcore-final` artifact |

The `MERGE_READINESS_CHECK` in the report is computed from this file. A PR is merge-ready when CI passed, the last review approved, and all hidden tests passed.
