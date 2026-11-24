# A3 — GitCore: issue in, tested and reviewed pull request out

GitHub Actions workflow in which agents turn a GitHub issue into a tested pull request with an independent review. A person always makes the merge decision.

| | |
|---|---|
| **Fork** | https://github.com/H9660/Gitwallah_v2 (GitWallah: MERN app for practising Git) |
| **Pinned commit** | `<FILL: hash of the commit that adds the test suite, ARCHITECTURE.md and the workflow>` (upstream base: `fac26f583cb5a9d806ee4f84edae8f30bee7f5ac`) |
| **Test suite** | `backend/`: Vitest, 156 tests, about 5 s (`npm ci --ignore-scripts && npm test`) |
| **Workflow** | `.github/workflows/autose.yml` in the fork; copy in [`workflow/`](workflow/) |
| **Report** | [`report.pdf`](report.pdf) (source: [`report/report.md`](report/report.md)) |
| **Demo** | `<FILL: demo.mp4 or link>` |

## Models

| Role | Model (Gemini API model code) | Set by |
|---|---|---|
| Spec, Design, Implementer, Test agents | `<FILL: slug used>` (default `gemini-2.5-flash`) | repo variable `MODEL_BUILDER` |
| Reviewer | `<FILL: slug used>` (default `gemini-2.5-pro`; another vendor via `GITCORE_BRAIN_REVIEW=llm`, see ADR-011) | repo variable `MODEL_REVIEWER` |

Provider: Gemini API direct (ADR-011; the first run on OpenRouter stopped on prepaid credits). Hard spend limit (Google Cloud budget/quota): `<FILL: $>`. Prices used for the cost cap: `GITCORE_PRICE_IN`/`OUT` = `<FILL>`. Per-run caps: $0.50 / 600k tokens (`GITCORE_MAX_USD`, `GITCORE_MAX_TOKENS`). Total tokens used across all runs: `<FILL from results/runs.md>`.

## How to trigger

1. Open an issue in the fork.
2. A collaborator with write access adds the label **`autose`**, or comments **`/autose`**.
3. Follow the run: Actions → *GitCore (issue -> reviewed PR)*. Each job uploads its artifacts (`gitcore-build` has `spec.md`, `design.md`, `diff.patch`, `test_report.md`; `gitcore-release` has `pr.md`; `gitcore-review-1/2` have `review.md`). The issue gets a start comment and a final summary.
4. The PR (`autose/issue-<n>`) receives the reviewer's comment and the label `autose:approved` or `autose:changes-requested`. **A maintainer decides whether to merge.**

On an existing PR, `/autose review` runs one extra independent review. For experiments, use *Run workflow* with `issue_number` and `variant`.

## One-time setup of the fork

- Secret `GEMINI_API_KEY` (Settings → Secrets and variables → Actions). Set a budget alert or quota on the Google Cloud project first. (`OPENROUTER_API_KEY` is only needed if a role is switched to `llm`.)
- Variables `MODEL_BUILDER`, `MODEL_REVIEWER` (optional; defaults above).
- Settings → Actions → General → Workflow permissions: allow *GitHub Actions to create and approve pull requests* (needed for `gh pr create` with `GITHUB_TOKEN`).
- Branch protection on `main`: require a pull request (1 approval), require the `CI / backend` status check, block force pushes. Nobody, including the workflow, pushes to `main`.
- Labels are created by the workflow on first run.

## Repository layout

```
README.md                  this file
report.pdf                 report (max 8 pages + appendices); source in report/report.md
architecture/
  views/                   component_view.md (+ .drawio), sequence_view.md, stage_map.md
  decisions/               ADR-001 … ADR-010 + README.md (summary table)
workflow/                  copy of the fork's .github/ and .autose/ (agent code, prompts, harness tests)
experiment/
  issues/                  the 5 issue texts (B1, B2 bugs; F1, F2 features; V1 vague)
  hidden_tests/            2-4 hidden tests per issue + reference fixes (validity check)
  seeded_prs/              5 reviewer-check PRs: patches + labels.json
  variants.md              what experiments E1 (ADR-008) and E2 (ADR-006) change
results/
  results.csv              one row per real run
  runs.md                  links to every Actions run, PR and review
  local_verification.md    offline checks done before the first real run (no model calls)
docs/                      inputs: A1 skill, earlier SpecBridge diagram, my design notes, assignment text
```

## Use of AI assistance

Claude Code (Anthropic, Claude Opus) was used substantially to build this submission: the fork's Vitest suite and `ARCHITECTURE.md`, the GitCore agent code, the workflow files, the harness tests, the hidden tests and seeded PRs, and first drafts of the architecture views, ADRs and report. The design starts from my own earlier material in `docs/`: the SpecBridge LangGraph orchestrator diagram, my design notes (one worker for the repo, `state.json` for stage tracking, gh CLI + model SDK, LLM now and SLM via an env switch, reviewer without merge/delete rights, prompt-level guardrails), and my A1 requirements skill (condensed into the spec agent's prompt). I reviewed all generated code and documents. 
