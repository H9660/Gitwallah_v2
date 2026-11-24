# Architecture decision records

Nygard format (Context, Decision, Consequences), as in A2. All ten decision areas are covered. If a run shows an ADR was wrong, the ADR stays, its status becomes *Superseded by ADR-0xx*, and a new ADR explains what was learned.

| ADR | Decision area | Option chosen | Main option rejected | Main reason | Status |
|---|---|---|---|---|---|
| [001](ADR-001.md) | D1 Splitting the work | 4 builder agents (spec, design, implement, test) + independent reviewer; gate/release/checks are code | One agent for everything | No self-grading; small contexts; least privilege per role | Accepted |
| [002](ADR-002.md) | D2 Control flow | LangGraph state machine with code-owned routing, inside jobs chained by `needs:` | LLM planner choosing the next stage | Bounded, reproducible loops; checks cannot be skipped | Accepted |
| [003](ADR-003.md) | D3 Hand-offs | Validated JSON/Markdown artifacts; minimum context per agent | Full transcripts passed on | Stops error propagation; makes checks and audits possible | Accepted |
| [004](ADR-004.md) | D4 State | `state.json` + per-job artifacts; branch/PR/labels across runs | Artifacts committed to the PR branch | Clean diff for reviewer and human; resumable re-runs | Accepted |
| [005](ADR-005.md) | D5 Tools | In-process allow-listed tools, no shell; `gh` only in model-free jobs | GitHub MCP server / bash tool for agents | A hijacked agent cannot push, merge or read secrets | Accepted |
| [006](ADR-006.md) | D6 Models | Cheap fast builder model; different-vendor reviewer; one brain adapter | One strong model everywhere | Cost per run; reviewer diversity; models swappable by variable | Superseded by 011 |
| [007](ADR-007.md) | D7 Checks | Deterministic code checks per stage; LLM judge only at review | LLM judge per stage / self-report | Reproducible pass/fail that the worker cannot argue with | Accepted |
| [008](ADR-008.md) | D8 Reviewer independence | Own job, other model, issue+diff+repo only, evidence-required approval | Same job/model with full artifacts | Judges the user's request, not the builder's story | Accepted (tested in E1) |
| [009](ADR-009.md) | D9 Safety and failures | Budgets at call/agent/run/job level; untrusted-text tags; no secrets where model code runs | Prompt guardrails only | Injection worst case is a bad diff, not a leaked key | Accepted |
| [010](ADR-010.md) | D10 Triggers | `autose` label or `/autose` from write-access users; queue per issue | Any commenter can trigger | Outsiders cannot spend the budget; one PR per issue | Accepted |
| [011](ADR-011.md) | D6 Models (revised) | Gemini API direct for all roles; reviewer on a different Gemini tier; other vendor optional per role | keep OpenRouter as the only provider | first real run failed on prepaid OpenRouter credits; one key, one bill | Accepted (draft, tested in E2) |
| [012](ADR-012.md) | D9 Safety and failures (revised) | A failed run opens a draft PR (partial code or empty commit) with spec, design and failure details; reviewer skipped | Stop comment only | Failed runs were opaque and unmeasurable (F2 design failures) | Accepted (draft) |
