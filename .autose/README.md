# GitCore — agent code for `.github/workflows/autose.yml`

Turns a labelled issue into a tested PR plus an independent review. **It never merges.** Design and rationale: ADR-001…010 in the submission repository.

```
gitcore/
  cli.py         entry points, one per workflow job (gate, build, fix, release, review, post-review, finalize)
  graph.py       stages 1-4 as a LangGraph StateGraph; deterministic deciders choose the next node
  checks.py      the stage checks (spec testability, design names real files/functions, build, tests + AC coverage)
  agent_loop.py  JSON-action ReAct loop shared by all agents
  tools.py       read_file / list_dir / grep / write_file / replace_in_file / run_build / run_tests (allow-listed, no shell)
  brain.py       model adapter: BRAIN=llm (OpenRouter) | slm (Ollama) | fake (scripted); token + USD budget
  reviewer.py    stage 6 reviewer + code-enforced anti-rubber-stamp rules
  github.py      every GitHub write (used only by jobs that run no model)
  render.py      Markdown artifacts (spec.md, design.md, test_report.md, pr.md)
prompts/         guard.md (shared rules), spec.md (A1 skill, condensed), design.md, implement.md, test.md, review.md
tests/           harness tests (pytest); fixtures/ holds a scripted run for issue B1
```

## Configuration (repository settings)

| Kind | Name | Default |
|---|---|---|
| Secret | `OPENROUTER_API_KEY` | required (set a hard credit limit on the key) |
| Variable | `MODEL_BUILDER` | `google/gemini-2.5-flash` |
| Variable | `MODEL_REVIEWER` | `deepseek/deepseek-chat-v3.1` |
| Variable | `GITCORE_BRAIN` | `llm` (`slm` needs a reachable OpenAI-compatible server via `OLLAMA_BASE_URL`) |
| Variable | `GITCORE_MAX_USD` / `GITCORE_MAX_TOKENS` | `0.50` / `600000` per run |
| Variable | `GITCORE_VARIANT` | empty; `reviewer_sees_rationale` = experiment E1-A |

Also enable *Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"*, or `gh pr create` fails with `GITHUB_TOKEN`.

## Running locally without a model

```bash
pip install -r .autose/requirements.txt pytest
python -m pytest -q .autose/tests                       # harness unit tests

# scripted end-to-end run of stages 1-4 for issue B1 (Linux/macOS/WSL; needs node + backend deps)
cd backend && npm ci --ignore-scripts && cd ..
export BRAIN=fake GITCORE_FAKE_SCRIPT=.autose/tests/fixtures/fake_issue_b1.json PYTHONPATH=.autose PYTHONDONTWRITEBYTECODE=1
mkdir -p /tmp/gc && cp .autose/tests/fixtures/issue_b1.json /tmp/gc/issue.json
python -m gitcore build --repo . --out /tmp/gc --issue-file /tmp/gc/issue.json   # -> /tmp/gc/{spec,design,test_report}.md, diff.patch, state.json
git checkout -- backend && git clean -fd backend/tests                          # undo the scripted change
```
