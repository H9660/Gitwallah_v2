"""Stages 1-4 as a LangGraph state machine (ADR-002).

Nodes do the work AND run the stage's deterministic check. Routers are pure
functions of the state: code, not an LLM, decides where to go next.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from . import checks, render
from .agent_loop import load_prompt, run_agent, single_shot, untrusted_issue as _untrusted_issue
from .brain import Brain, BudgetExceeded
from .config import LIMITS, TESTS_DIR
from .state import RunStore, event
from .tools import Toolbox


class GState(TypedDict, total=False):
    mode: str                 # initial | fix
    entry: str                # spec | design | implement
    round: int
    issue: dict
    spec: dict
    spec_check: dict
    design: dict
    design_check: dict
    build_check: dict
    test_check: dict
    attempts: int
    redesigns: int
    last_failure: str
    failure_sigs: list
    findings: list
    baseline: dict
    status: str               # running | ready | needs_clarification | failed | budget_hit
    stop_reason: str
    next: str                 # set by the deciding code at the end of each node
    stuck: bool
    test_fixes: int
    completed: list
    usage: dict
    events: list


class Ctx:
    def __init__(self, repo: Path, store: RunStore, brain: Brain):
        self.repo = repo
        self.store = store
        self.brain = brain


def _arch(repo: Path, full: bool) -> str:
    p = repo / "ARCHITECTURE.md"
    if not p.is_file():
        return "(no ARCHITECTURE.md)"
    text = p.read_text(encoding="utf-8")
    if not full:
        cut = text.find("## 4.")
        text = text[:cut] if cut > 0 else text
    return text


def _stop(state: dict, status: str, reason: str) -> dict:
    state["status"] = status
    state["stop_reason"] = reason
    event(state, "graph", "stop", status=status, msg=reason[:300])
    return state


def _sig(errors: list[str]) -> str:
    return " | ".join(e.splitlines()[0] for e in errors)[:400]


def _record_failure(state: dict, stage: str, errors: list[str]) -> bool:
    """Store the failure; return True if it is the same as the previous one (no progress)."""
    sig = _sig(errors)
    sigs = state.setdefault("failure_sigs", [])
    stuck = bool(sigs) and sigs[-1] == sig
    sigs.append(sig)
    state["last_failure"] = "\n".join(errors)[-LIMITS.failure_tail_chars:]
    event(state, stage, "check_failed", msg=sig)
    return stuck


def _reset_worktree(repo: Path) -> None:
    subprocess.run(["git", "reset", "--hard", "-q", "HEAD"], cwd=repo, check=False)
    subprocess.run(["git", "clean", "-fdq", "--", "backend"], cwd=repo, check=False)


def build_graph(ctx: Ctx):
    repo, store, brain = ctx.repo, ctx.store, ctx.brain

    def persist(state: dict) -> dict:
        state["usage"] = brain.usage.to_dict()
        store.save(state)
        return state

    def guarded(stage: str, fn):
        def node(state: GState) -> GState:
            state = dict(state)
            event(state, stage, "start")
            try:
                state = fn(state)
            except BudgetExceeded as e:
                state = _stop(state, "budget_hit", f"{stage}: {e}")
            except Exception as e:  # a crash is a failed stage, never a silent pass
                state = _stop(state, "failed", f"{stage} crashed: {type(e).__name__}: {e}")
            event(state, stage, "end", status=state.get("status"))
            return persist(state)
        return node

    # ---------------------------------------------------------------- 1
    def spec_node(state: dict) -> dict:
        issue = state["issue"]
        task = (f"{_untrusted_issue(issue)}\n\n## Project context (ARCHITECTURE.md excerpt)\n{_arch(repo, full=False)}\n\n"
                "Write the specification JSON now.")
        spec = single_shot(brain, "spec", load_prompt("spec.md"), task)
        ok, errs = checks.check_spec(spec)
        tries = 0
        while not ok and not checks.needs_clarification(spec) and tries < LIMITS.spec_retries:
            tries += 1
            _record_failure(state, "spec", errs)
            spec = single_shot(brain, "spec", load_prompt("spec.md"),
                               task + "\n\nYour previous JSON failed these checks; fix them:\n" + "\n".join(f"- {e}" for e in errs)
                               + f"\n\nPrevious JSON:\n{json.dumps(spec)[:6000]}")
            ok, errs = checks.check_spec(spec)
        state["spec"] = spec
        state["spec_check"] = {"ok": ok, "errors": errs}
        store.write("spec.json", spec)
        store.write("spec.md", render.spec_md(spec, issue, ok, errs))
        if ok:
            state["completed"] = sorted(set(state.get("completed", [])) | {"spec"})
            return state
        if checks.needs_clarification(spec):
            return _stop(state, "needs_clarification", "the issue is not testable as written or was flagged as unsafe")
        return _stop(state, "failed", "spec check failed: " + _sig(errs))

    # ---------------------------------------------------------------- 2
    def design_node(state: dict) -> dict:
        spec = state["spec"]
        extra = ""
        if state.get("last_failure") and state.get("redesigns"):
            extra += f"\n\n## The previous design failed during implementation/testing\n{state['last_failure']}"
        if state.get("findings") and state.get("entry") == "design":
            extra += "\n\n## Independent reviewer findings to address\n" + json.dumps(state["findings"], indent=2)
        base_task = (f"## Specification (spec.json)\n{json.dumps(spec, indent=2)}\n\n## ARCHITECTURE.md\n{_arch(repo, full=True)}"
                     f"{extra}\n\nInvestigate the code with the tools, then call finish with the design JSON.")
        tools = Toolbox(repo, "design")
        task = base_task
        for attempt in range(LIMITS.design_retries + 1):
            res = run_agent(brain, "design", load_prompt("design.md"), task, tools, LIMITS.tool_steps["design"])
            store.append_transcript("design", res.transcript)
            if res.status != "finished":
                return _stop(state, "budget_hit" if res.status == "budget_hit" else "failed", f"design agent: {res.error}")
            design = res.result.get("design", res.result)
            ok, errs = checks.check_design(design, spec, repo)
            if ok:
                break
            _record_failure(state, "design", errs)
            task = base_task + "\n\nYour previous design failed these checks; fix them:\n" + "\n".join(f"- {e}" for e in errs) \
                + f"\n\nPrevious design:\n{json.dumps(design)[:6000]}"
        state["design"] = design
        state["design_check"] = {"ok": ok, "errors": errs}
        store.write("design.json", design)
        store.write("design.md", render.design_md(design, ok, errs))
        if not ok:
            return _stop(state, "failed", "design check failed: " + _sig(errs))
        state["completed"] = sorted(set(state.get("completed", [])) | {"design"})
        return state

    # ---------------------------------------------------------------- 3
    def implement_node(state: dict) -> dict:
        state["attempts"] = state.get("attempts", 0) + 1
        design = state["design"]
        allow = checks.design_write_allowlist(design)
        tools = Toolbox(repo, "implement", write_files=allow, write_prefixes=(TESTS_DIR,), can_build=True, can_test=True)
        acs = state["spec"].get("acceptance_criteria", [])
        task = (f"## Acceptance criteria\n{json.dumps(acs, indent=2)}\n\n## Design (design.json)\n{json.dumps(design, indent=2)}\n\n"
                f"## Testing conventions\n{_arch(repo, True).split('## 6.')[-1][:3000]}")
        if state.get("last_failure"):
            task += f"\n\n## Last check failure (attempt {state['attempts'] - 1})\n{state['last_failure']}"
        if state.get("findings") and state.get("entry") in ("implement", "design"):
            task += "\n\n## Independent reviewer findings to address\n" + json.dumps(state["findings"], indent=2)
        task += f"\n\nThis is attempt {state['attempts']} of {LIMITS.impl_attempts}. Make the change, run_build, then finish."
        res = run_agent(brain, "implement", load_prompt("implement.md"), task, tools, LIMITS.tool_steps["implement"])
        store.append_transcript(f"implement_{state['attempts']}", res.transcript)
        if res.status == "error":
            errs = [f"implementer error: {res.error}"]
            ok, details = False, {}
        else:
            ok, errs, details = checks.check_build(repo, allow)
            if res.status == "budget_hit":
                errs = [f"implementer used its tool budget ({LIMITS.tool_steps['implement']} steps)"] + errs
                ok = ok and False
        state["build_check"] = {"ok": ok, "errors": errs, "details": details}
        try:
            store.write("diff.patch", checks.full_diff(repo))
        except RuntimeError:
            pass
        if not ok:
            state["stuck"] = _record_failure(state, "implement", errs)
        return state

    # ---------------------------------------------------------------- 4
    def test_node(state: dict) -> dict:
        acs = state["spec"].get("acceptance_criteria", [])
        tools = Toolbox(repo, "test", write_prefixes=(TESTS_DIR,), can_test=True)
        diff = checks.full_diff(repo)
        task = (f"## Acceptance criteria (write at least one test per AC; put the AC id in the test name)\n{json.dumps(acs, indent=2)}\n\n"
                f"## Design\n{json.dumps(state['design'], indent=2)}\n\n## Current diff\n```diff\n{diff[:12000]}\n```\n\n"
                f"## Testing conventions\n{_arch(repo, True).split('## 6.')[-1][:3000]}")
        if state.get("test_check") and not state["test_check"].get("ok"):
            task += f"\n\n## Previous test run failed\n{state.get('last_failure', '')}"
        res = run_agent(brain, "test", load_prompt("test.md"), task, tools, LIMITS.tool_steps["test"])
        store.append_transcript("test", res.transcript)
        ok, errs, details = checks.check_tests(repo, state["spec"], state.get("baseline", {}))
        if res.status == "error":
            errs = [f"test agent error: {res.error}"] + errs
            ok = False
        state["test_check"] = {"ok": ok, "errors": errs, "details": details}
        store.write("diff.patch", checks.full_diff(repo))
        store.write("test_report.md", render.test_report_md(state))
        if ok:
            state["completed"] = sorted(set(state.get("completed", [])) | {"implement", "test"})
            state["status"] = "ready"
            event(state, "test", "ready")
        else:
            state["stuck"] = _record_failure(state, "test", errs)
        return state

    # ------------------------------------------------- deciders (run inside nodes)
    # LangGraph routers receive a copy of the state, so every decision that
    # changes counters is made here, at the end of the node, and written to
    # state["next"]. The routers below only read that key.
    def _retry_or_redesign(state: dict, stage: str) -> str:
        if state.get("stuck"):
            _stop(state, "failed", f"{stage}: same failure twice in a row, no progress")
            return END
        if state.get("attempts", 0) < LIMITS.impl_attempts:
            event(state, stage, "route", to="implement")
            return "implement"
        if state.get("redesigns", 0) < LIMITS.redesigns:
            state["redesigns"] = state.get("redesigns", 0) + 1
            state["attempts"] = 0
            state["failure_sigs"] = []
            _reset_worktree(repo)
            event(state, stage, "route", to="design")
            return "design"
        _stop(state, "failed", f"{stage}: implementation attempts and redesigns used up")
        return END

    def decide_after_implement(state: dict) -> str:
        if state.get("status") != "running":
            return END
        if state.get("build_check", {}).get("ok"):
            return "test"
        return _retry_or_redesign(state, "implement")

    def decide_after_test(state: dict) -> str:
        if state.get("status") != "running":
            return END
        det = state.get("test_check", {}).get("details", {})
        if det.get("failure_in_new_tests_only") and state.get("test_fixes", 0) < 1:
            state["test_fixes"] = state.get("test_fixes", 0) + 1
            event(state, "test", "route", to="test")
            return "test"
        return _retry_or_redesign(state, "test")

    deciders = {
        "spec": lambda s: "design" if s.get("status") == "running" else END,
        "design": lambda s: "implement" if s.get("status") == "running" else END,
        "implement": decide_after_implement,
        "test": decide_after_test,
    }

    def with_decision(stage: str, fn):
        inner = guarded(stage, fn)

        def node(state: GState) -> GState:
            out = inner(state)
            out["next"] = deciders[stage](out) if out.get("status") == "running" else END
            return persist(out)
        return node

    def route_entry(state: dict) -> str:
        entry = state.get("entry", "spec")
        done = set(state.get("completed", []))
        if entry == "spec" and "spec" in done:
            entry = "design"
        if entry == "design" and "design" in done and state.get("mode") == "initial":
            entry = "implement"
        return entry

    def read_next(state: dict) -> str:
        return state.get("next") or END

    g = StateGraph(GState)
    for name, fn in (("spec", spec_node), ("design", design_node), ("implement", implement_node), ("test", test_node)):
        g.add_node(name, with_decision(name, fn))
    g.add_conditional_edges(START, route_entry, {"spec": "spec", "design": "design", "implement": "implement"})
    g.add_conditional_edges("spec", read_next, {"design": "design", END: END})
    g.add_conditional_edges("design", read_next, {"implement": "implement", END: END})
    g.add_conditional_edges("implement", read_next, {"test": "test", "implement": "implement", "design": "design", END: END})
    g.add_conditional_edges("test", read_next, {"test": "test", "implement": "implement", "design": "design", END: END})
    return g.compile()


def run_graph(ctx: Ctx, state: dict[str, Any]) -> dict:
    state.setdefault("status", "running")
    state.setdefault("attempts", 0)
    state.setdefault("redesigns", 0)
    state["baseline"] = checks.test_inventory(ctx.repo)
    graph = build_graph(ctx)
    final = graph.invoke(state, config={"recursion_limit": 40})
    final = dict(final)
    if final.get("status") == "running":
        final = _stop(final, "failed", "graph ended without reaching a final status")
    final["usage"] = ctx.brain.usage.to_dict()
    ctx.store.save(final)
    if final.get("test_check"):
        ctx.store.write("test_report.md", render.test_report_md(final))
    elif final.get("status") != "needs_clarification":
        ctx.store.write("test_report.md", f"# test_report.md\n\nTesting was not reached.\n\n**Stopped:** {final.get('status')} - {final.get('stop_reason', '')}\n")
    return final
