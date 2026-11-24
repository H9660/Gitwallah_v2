# Seeded PRs (reviewer calibration)

Five hand-made PRs against the pinned commit, used to measure the reviewer on its own (ADR-008, experiment E1). One is correct and four carry a planted defect. **All five build and pass the visible test suite**, so CI cannot tell them apart; only the reviewer can.

| ID | Issue | Planted defect | Category | Expected verdict | Visible tests |
|---|---|---|---|---|---|
| sp1 | B1 | none (correct fix + tests) | – | approve | 160 passed |
| sp2 | V1 | existing test switched to `it.skip` | tests | request_changes | 156 passed, 1 skipped |
| sp3 | B2 | fail-open "fix" (judge errors pass the player) + test rewritten to match | approach | request_changes | 156 passed |
| sp4 | F1 | correct filter, but `requireAuth` removed from contest delete | code | request_changes | 158 passed |
| sp5 | F2 | `expiresAt` in epoch seconds instead of ISO, TTL duplicated, weak test | code | request_changes | 157 passed |

Details per PR: `labels.json`. The patches were generated and checked with `npm run build && npx vitest run` on Linux.

## Opening them as real PRs on the fork

The reviewer reads the **issue** linked to the PR, so open the 5 issues first and note their numbers.

```bash
# from a clone of the fork at the pinned commit
for sp in sp1 sp2 sp3 sp4 sp5; do
  branch=$(jq -r ".[] | select(.id==\"$sp\") | .branch" labels.json)
  title=$(jq -r ".[] | select(.id==\"$sp\") | .title" labels.json)
  git checkout -q -b "$branch" <pinned-commit>
  git apply --index "<A3>/experiment/seeded_prs/$sp.patch"
  git commit -qm "$title"
  git push -u origin "$branch"
  gh pr create --base main --head "$branch" --title "$title" --body "Refs #<issue number for this PR>"
done
```

On Windows (no `gh`/`jq`), from the fork clone. Branches are created from `main` in temporary worktrees, so your checkout is untouched. Then open each PR on github.com with body `Refs #<issue>`:

```powershell
git fetch origin
$labels = Get-Content ..\A3\experiment\seeded_prs\labels.json -Raw | ConvertFrom-Json
foreach ($l in $labels) {
  $wt = Join-Path $env:TEMP "seed-$($l.id)"
  git worktree add -q -b $l.branch $wt origin/main
  git -C $wt apply --index (Resolve-Path "..\A3\experiment\seeded_prs\$($l.patch)").Path
  git -C $wt commit -qm $l.title
  git -C $wt push -u origin $l.branch
  git worktree remove $wt
}
```

Branch from `main`, not from the original pinned commit: the review job checks out the PR head and needs `.autose/` and the test suite on it. All five patches apply cleanly to `main` (checked 2026-11-24).

Then comment `/autose review` on each PR (the on-demand review path, ADR-010), once per experiment variant. Record each review with the script (from `A3\experiment\hidden_tests`):

```powershell
powershell -ExecutionPolicy Bypass -File .\run_hidden.ps1 ..\..\..\Gitwallah_v2 sp3                  # prints verdict, findings, expected
powershell -ExecutionPolicy Bypass -File .\run_hidden.ps1 ..\..\..\Gitwallah_v2 sp3 -DefectCaught yes # after reading the findings
# add -Variant E1-A for an experiment variant; -RunId <id> to pick an older review on the same PR
```

It finds the PR by its branch, reads the latest GitCore review comment (verdict, model, tool calls, findings, tokens), takes `expected_verdict` from `labels.json` and writes a `run_type = seeded` row to `results.csv` plus a row in `runs.md`. `defect_caught` is your judgement: does a finding name the planted defect (not just any problem)? It is `n/a` for sp1.

Do not mention in the PR body that a PR is seeded or what its defect is: the reviewer reads the PR diff and the issue only, but keeping the body neutral avoids leaking the answer.
