"""Render JSON hand-offs as readable Markdown artifacts."""
from __future__ import annotations


def _check_block(ok: bool | None, errors: list[str]) -> str:
    if ok is None:
        return ""
    if ok:
        return "\n## Check\n\n**PASSED**\n"
    return "\n## Check\n\n**FAILED**\n\n" + "\n".join(f"- {e}" for e in errors) + "\n"


def spec_md(spec: dict, issue: dict, ok: bool | None = None, errors: list[str] | None = None) -> str:
    out = [f"# spec.md - issue #{issue.get('number')}: {issue.get('title', '')}", ""]
    out.append(f"**Intent:** {spec.get('intent', '')}")
    out.append(f"**Type:** {spec.get('type', '')} | **Testable:** {spec.get('testable')} | **Safety flag:** {spec.get('safety_flag', False)}")
    if spec.get("source_quotes"):
        out += ["", "## Source statements (verbatim from the issue)", ""]
        out += [f"- S{i + 1}: \"{q}\"" for i, q in enumerate(spec["source_quotes"])]
    out += ["", "## Requirements", "", "| ID | Statement | Prov | Basis |", "|---|---|---|---|"]
    for r in spec.get("requirements", []):
        out.append(f"| {r.get('id')} | {r.get('statement')} | {r.get('prov')} | {r.get('basis')} |")
    out += ["", "## Acceptance criteria", "", "| AC | Given | When | Then | Expected | Verify by |", "|---|---|---|---|---|---|"]
    for a in spec.get("acceptance_criteria", []):
        out.append(f"| {a.get('id')} | {a.get('given')} | {a.get('when')} | {a.get('then')} | {a.get('expected')} | `{a.get('verify_by')}` |")
    if spec.get("assumptions"):
        out += ["", "## Assumptions (proposed defaults, not confirmed)", ""]
        out += [f"- {a.get('id', '')}: {a.get('text', a)}" if isinstance(a, dict) else f"- {a}" for a in spec["assumptions"]]
    if spec.get("questions"):
        out += ["", "## Open questions", ""]
        out += [f"- {q.get('id', '')}: {q.get('question', q)} (blocks {q.get('blocks', '-')})" if isinstance(q, dict) else f"- {q}" for q in spec["questions"]]
    if spec.get("out_of_scope"):
        out += ["", "## Out of scope", ""] + [f"- {x}" for x in spec["out_of_scope"]]
    if spec.get("safety_flag"):
        out += ["", f"## Safety\n\n{spec.get('safety_reason', '')}"]
    out.append(_check_block(ok, errors or []))
    return "\n".join(out) + "\n"


def design_md(design: dict, ok: bool | None = None, errors: list[str] | None = None) -> str:
    out = ["# design.md", "", f"**Approach:** {design.get('approach', '')}", "", "## Files", "",
           "| File | New? | Why |", "|---|---|---|"]
    for f in design.get("files", []):
        out.append(f"| `{f.get('path')}` | {'yes' if f.get('new') else 'no'} | {f.get('why', '')} |")
    out += ["", "## Functions", "", "| Function | File | New? | Change |", "|---|---|---|---|"]
    for f in design.get("functions", []):
        out.append(f"| `{f.get('name')}` | `{f.get('file')}` | {'yes' if f.get('new') else 'no'} | {f.get('change', '')} |")
    out += ["", "## Acceptance criteria -> change -> test", "", "| AC | Changes | Test file |", "|---|---|---|"]
    for m in design.get("ac_map", []):
        out.append(f"| {m.get('ac')} | {'; '.join(m.get('changes', []))} | `{m.get('test_file', '')}` |")
    if design.get("risks"):
        out += ["", "## Risks / invariants touched", ""] + [f"- {r}" for r in design["risks"]]
    out.append(_check_block(ok, errors or []))
    return "\n".join(out) + "\n"


def test_report_md(state: dict) -> str:
    t = state.get("test_check") or {}
    det = t.get("details", {})
    out = ["# test_report.md", "", f"**Result:** {'PASSED' if t.get('ok') else 'FAILED'}",
           f"**Implementation attempts:** {state.get('attempts', 0)} | **Redesigns:** {state.get('redesigns', 0)}", "",
           "## Suite", "", "```", det.get("summary", "(not run)"), "```", "",
           "## Acceptance criteria coverage", "", "| AC | Passing tests |", "|---|---|"]
    for aid, hits in (det.get("coverage") or {}).items():
        out.append(f"| {aid} | {'<br>'.join(hits) if hits else '**none**'} |")
    if not t.get("ok"):
        out += ["", "## Check errors", ""] + [f"- {e.splitlines()[0]}" for e in t.get("errors", [])]
    hist = [e for e in state.get("events", []) if e.get("kind") in ("check_failed", "route")]
    if hist:
        out += ["", "## History", ""] + [f"- [{e['stage']}] {e['kind']}: {e.get('msg', e.get('to', ''))}" for e in hist]
    return "\n".join(out) + "\n"


def stopped_stage(state: dict) -> str:
    """The first stage whose check did not pass (for a run that did not reach 'ready')."""
    for stage, key in (("spec", "spec_check"), ("design", "design_check"), ("implement", "build_check"), ("test", "test_check")):
        if not (state.get(key) or {}).get("ok"):
            return stage
    return "release"


def pr_md(state: dict, issue: dict, run_url: str = "", stopped: bool = False, has_code: bool = True) -> str:
    spec = state.get("spec", {})
    design = state.get("design", {})
    tc = (state.get("test_check") or {}).get("details", {})
    out = []
    if stopped:
        out += [f"> **Draft: GitCore did not finish.** It stopped at stage **{stopped_stage(state)}** "
                f"(status `{state.get('status')}`): {state.get('stop_reason', '')}",
                "> This PR shows the partial work for inspection. It did not pass GitCore's checks, was not reviewed, "
                "and is not proposed for merge.", ""]
        if not has_code:
            out += ["**No code was written:** the run stopped before implementation. The spec and design below are what it produced.", ""]
        if design.get("files"):
            out += ["### Planned changes (design)", ""]
            out += [f"- `{f.get('path')}`{' (new)' if f.get('new') else ''}: {f.get('why', '')}" for f in design["files"]]
            out.append("")
        if state.get("last_failure"):
            out += ["### Last check failure", "", "```", str(state["last_failure"])[-1500:], "```", ""]
    out += [f"Automated change for #{issue.get('number')} by GitCore. **A human decides whether to merge.**", "",
           f"**Intent (from spec):** {spec.get('intent', '')}", "", f"**Approach (from design):** {design.get('approach', '')}", "",
           "### Acceptance criteria", ""]
    for a in spec.get("acceptance_criteria", []):
        hits = (tc.get("coverage") or {}).get(a.get("id"), [])
        out.append(f"- [{'x' if hits else ' '}] **{a.get('id')}**: Given {a.get('given')}, when {a.get('when')}, then {a.get('then')}")
    out += ["", f"### Tests\n\n```\n{tc.get('summary', '')}\n```", "",
            f"Attempts: {state.get('attempts', 0)}, redesigns: {state.get('redesigns', 0)}, "
            f"tokens: {state.get('usage', {}).get('total_tokens', 0)}, cost: ${state.get('usage', {}).get('usd', 0):.4f}"]
    if run_url:
        out.append(f"\nArtifacts (spec.md, design.md, diff.patch, test_report.md): {run_url}")
    out.append(f"\nRefs #{issue.get('number')}")
    return "\n".join(out) + "\n"
