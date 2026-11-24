# Sequence view — one run, trigger to review

> **Status: design-time sequence.** After the first complete real run, replace the
> placeholders `<run-id>`, `<pr>` and the timings with the real values from that run
> (links go in `results/runs.md`). Do not keep invented numbers here.

Run shown: issue **#<n>** (bug B1 "duel accept twice"), one review round that requests changes, one fix, approval in round 2.

```mermaid
sequenceDiagram
  autonumber
  actor M as Maintainer
  participant GH as GitHub (issue / PR)
  participant G as gate job
  participant B as build job (Orchestrator)
  participant S as Spec agent
  participant D as Design agent
  participant I as Implementer
  participant T as Test agent
  participant R as release job
  participant C as ci job
  participant V as review job (Reviewer)
  participant F as fix job

  M->>GH: add label "autose" to issue #n
  GH->>G: issues.labeled event
  G->>GH: check sender permission (gh api .../collaborators/<user>/permission)
  G->>GH: comment "GitCore run <run-id> started" + label autose:running
  G->>B: needs: gate (issue number, title, body as untrusted data)
  B->>S: issue text inside <untrusted_issue> + ARCHITECTURE.md summary
  S-->>B: spec.json (ACs, questions, testable, safety_flag)
  B->>B: check_spec(): ACs testable? (code)
  B->>D: spec.json + ARCHITECTURE.md + read-only tools
  D-->>B: design.json (files, functions, AC→change map)
  B->>B: check_design(): files/functions exist? (code)
  loop attempt ≤ 3
    B->>I: spec ACs + design.json (+ last failure log)
    I->>I: read_file / write_file / run_build
    I-->>B: done
    B->>B: check_build(): npm run build == 0, diff ⊆ allowed paths
    B->>T: spec ACs + design.json + diff (not the implementer's chat)
    T->>T: write tests "AC-k: ...", run_tests
    T-->>B: done
    B->>B: check_tests(): npm test == 0, every AC covered, no test removed
  end
  B-->>R: artifact: diff.patch, state.json, spec/design/test_report
  R->>GH: git push autose/issue-n · gh pr create (pr.md body, "Closes #n" not used: human closes)
  R->>C: workflow_call ci.yml (ref = PR head)
  C-->>R: success
  R->>V: needs: ci (PR number, head sha)
  V->>GH: checkout PR head (read-only), fetch issue + diff
  V->>V: read_file / grep / run_tests (own tests allowed in temp dir)
  V-->>V: review.json {verdict: request_changes, category: code, findings[]}
  V->>GH: gh pr comment review.md · label autose:changes-requested · round 1
  V->>F: needs: review (verdict, category, findings)
  F->>B: re-enter graph at Implementation with findings (no reviewer chat)
  F-->>R: new diff.patch → push to same branch (PR updated)
  R->>C: CI again
  C-->>V: success
  V->>GH: review round 2: approve → label autose:approved, comment review.md
  GH-->>M: PR ready; maintainer decides merge/close
```

Timings to fill from the real run (Actions UI → job durations):

| Step | Job | Duration | Tokens | Cost |
|---|---|---|---|---|
| gate | gate | | – | – |
| spec + design + implement + test | build | | | |
| release + CI | release, ci | | – | – |
| review round 1 | review | | | |
| fix | fix | | | |
| review round 2 | review_2 | | | |
