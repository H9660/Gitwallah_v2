# Component view — GitCore

The editable diagram is in [`component_view.drawio`](component_view.drawio). It is adapted from the LangGraph orchestrator diagram of my earlier SpecBridge project. The Mermaid version below renders on GitHub.

```mermaid
flowchart LR
  subgraph GH["GitHub (fork H9660/Gitwallah_v2)"]
    ISSUE["Issue / comment<br/>label autose · /autose"]
    PR["Pull request<br/>(branch autose/issue-N)"]
    ART[("Workflow artifacts<br/>spec.md design.md diff.patch<br/>test_report.md pr.md review.md<br/>state.json run_record.json")]
  end

  subgraph WF["autose.yml (separate jobs = separate permission sets)"]
    direction TB
    GATE["gate job<br/>code only<br/><i>issues: write</i>"]
    subgraph BUILD["build job · contents: read · no GitHub token in agent env"]
      direction TB
      ORCH{{"Orchestrator<br/>LangGraph StateGraph<br/>deterministic routers + checks"}}
      SPEC["Spec agent<br/>(A1 skill prompt)"]
      DES["Design agent"]
      IMP["Implementer agent"]
      TST["Test agent"]
      ORCH --> SPEC & DES & IMP & TST
    end
    REL["release job<br/>code only: git push, gh pr create<br/><i>contents: write, pull-requests: write</i>"]
    CI["ci job<br/>reusable ci.yml<br/><i>contents: read</i>"]
    subgraph REVIEWJ["review job · contents: read"]
      REV["Reviewer agent<br/>other model, own prompt<br/>read + run, no write tools"]
      POST["post step (code)<br/>gh pr comment + label"]
    end
    FIX["fix job (round 1 only)<br/>= build job re-entered at Design or Implementation"]
  end

  subgraph TOOLS["Tool runner (Python, in-process; no shell tool)"]
    RO["read_file · list_dir · grep"]
    WR["write_file<br/>(allow-list = design files + backend/tests)"]
    RUN["run_build · run_tests<br/>(fixed commands, secrets removed from env, 300 s timeout)"]
  end

  BRAIN["Brain adapter (brain.py)<br/>BRAIN=gemini → Gemini API (default)<br/>BRAIN=llm → OpenRouter<br/>BRAIN=slm → Ollama<br/>BRAIN=fake → scripted (harness tests)<br/>token + cost budget"]
  KB["ARCHITECTURE.md<br/>(A2 doc for the fork)"]

  ISSUE --> GATE --> BUILD
  BUILD -- "diff.patch + state.json (artifact)" --> REL --> PR
  REL --> CI
  CI -- success --> REVIEWJ
  PR -. "issue + diff + repo at PR head only" .-> REV
  POST --> PR
  POST -- "request_changes & round < 2" --> FIX --> REL
  SPEC & DES & IMP & TST & REV --> BRAIN
  DES & IMP & TST & REV --> RO
  IMP & TST --> WR
  IMP & TST & REV --> RUN
  DES --> KB
  BUILD & REL & REVIEWJ --> ART
```

## Who calls what

| Component | Kind | Calls | Can write to repo? | Holds which secret? |
|---|---|---|---|---|
| gate | code | GitHub REST (via `gh`) to check sender permission, comment | no | `GITHUB_TOKEN` (issues: write) |
| Orchestrator (`graph.py`) | code (LangGraph) | stage nodes, `checks.py`, `state.py` | local checkout only | none |
| Spec agent | LLM | brain only (no tools: it must not read code, see A1 skill R7 "do not design") | no | none (key stays in the brain process) |
| Design agent | LLM | brain + read-only tools + ARCHITECTURE.md | no | none |
| Implementer agent | LLM | brain + read/write tools + run_build/run_tests | local checkout, allow-listed paths only | none |
| Test agent | LLM | brain + read tools + write (tests only) + run_tests | `backend/tests/**` only | none |
| release | code | `git push`, `gh pr create/edit` | yes (branch `autose/issue-N`, never `main`, never merge) | `GITHUB_TOKEN` (contents + PR write) |
| ci | reusable workflow | `npm ci && npm run build && npm test` | no | none |
| Reviewer agent | LLM (different model) | brain + read-only tools + run_tests | no | none |
| post step | code | `gh pr comment`, `gh pr edit --add-label` | no (PR comments only) | `GITHUB_TOKEN` (pull-requests: write) |

The OpenRouter key exists only inside the Python process that calls the brain. `run_build` and `run_tests` start child processes with an environment that has `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `GH_TOKEN` and `ACTIONS_*` removed, because those processes execute LLM-written code.
