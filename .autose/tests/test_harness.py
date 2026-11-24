"""Unit tests for the harness itself (no model, no network)."""
import json
import os
import subprocess
from pathlib import Path

import pytest

from gitcore import checks
from gitcore.agent_loop import extract_json, run_agent
from gitcore.brain import Brain, BudgetExceeded, Usage
from gitcore.reviewer import enforce_review_rules, diff_files_of
from gitcore.tools import Toolbox, ToolError, scrubbed_env


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "backend" / "tests").mkdir(parents=True)
    (tmp_path / "backend" / "a.js").write_text("export function accept() {}\n")
    (tmp_path / "backend" / "tests" / "a.test.js").write_text("it('x', () => {})\nit('y', () => {})\n")
    (tmp_path / ".github").mkdir()
    (tmp_path / ".github" / "w.yml").write_text("on: push")
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    return tmp_path


GOOD_AC = {"id": "AC-1", "given": "a duel in PLAYING", "when": "accept() is called", "then": "it returns ok false",
           "expected": "{ ok: false }", "verify_by": "DuelSession.accept"}


# ------------------------------------------------------------------ tools
def test_tools_block_paths_outside_repo_and_forbidden_dirs(repo):
    t = Toolbox(repo, "design")
    with pytest.raises(ToolError):
        t.read_file("../secret.txt")
    with pytest.raises(ToolError):
        t.read_file(".github/w.yml")
    with pytest.raises(ToolError):
        t.read_file(".git/config")
    assert "accept" in t.read_file("backend/a.js")


def test_write_allow_list_is_enforced(repo):
    t = Toolbox(repo, "implement", write_files={"backend/a.js"}, write_prefixes=("backend/tests/",))
    t.write_file("backend/a.js", "x")
    t.write_file("backend/tests/new.test.js", "y")
    with pytest.raises(ToolError):
        t.write_file("backend/other.js", "z")
    with pytest.raises(ToolError):
        t.write_file(".github/w.yml", "pwned")
    ro = Toolbox(repo, "review", can_test=True)
    with pytest.raises(ToolError):
        ro.write_file("backend/a.js", "x")


def test_scrubbed_env_removes_secrets(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-secret")
    monkeypatch.setenv("GITHUB_TOKEN", "ghs")
    monkeypatch.setenv("GH_TOKEN", "ghs")
    env = scrubbed_env()
    assert "OPENROUTER_API_KEY" not in env and "GITHUB_TOKEN" not in env and "GH_TOKEN" not in env


# ------------------------------------------------------------------ checks
def test_check_spec_accepts_precise_acs():
    ok, errs = checks.check_spec({"testable": True, "acceptance_criteria": [GOOD_AC]})
    assert ok, errs


@pytest.mark.parametrize("patch,needle", [
    ({"expected": ""}, "missing 'expected'"),
    ({"then": "it responds quickly"}, "ambiguous"),
    ({"id": "1"}, "AC-1"),
    ({"then": "PENDING Q-01"}, "PENDING"),
])
def test_check_spec_rejects_vague_or_incomplete_acs(patch, needle):
    ok, errs = checks.check_spec({"testable": True, "acceptance_criteria": [{**GOOD_AC, **patch}]})
    assert not ok and any(needle in e for e in errs)


def test_check_spec_routes_untestable_or_unsafe_to_clarification():
    assert checks.needs_clarification({"testable": False, "acceptance_criteria": []})
    assert checks.needs_clarification({"testable": True, "safety_flag": True})


def test_check_design_verifies_files_functions_and_ac_map(repo):
    spec = {"acceptance_criteria": [GOOD_AC]}
    good = {"files": [{"path": "backend/a.js"}, {"path": "backend/tests/i1.test.js", "new": True}],
            "functions": [{"name": "accept", "file": "backend/a.js"}],
            "ac_map": [{"ac": "AC-1", "changes": ["accept"], "test_file": "backend/tests/i1.test.js"}]}
    assert checks.check_design(good, spec, repo) == (True, [])
    bad = {"files": [{"path": "backend/missing.js"}], "functions": [{"name": "nope", "file": "backend/missing.js"}], "ac_map": []}
    ok, errs = checks.check_design(bad, spec, repo)
    assert not ok
    assert any("does not exist" in e for e in errs)
    assert any("AC-1" in e for e in errs)


def test_test_inventory_detects_removed_and_skipped_tests(repo):
    before = checks.test_inventory(repo)
    assert before["backend/tests/a.test.js"] == {"tests": 2, "skips": 0}
    (repo / "backend/tests/a.test.js").write_text("it.skip('x', () => {})\n")
    after = checks.test_inventory(repo)
    assert after["backend/tests/a.test.js"]["skips"] == 1


# ------------------------------------------------------------------ reviewer rules
def test_unsupported_approval_is_downgraded():
    r = enforce_review_rules({"verdict": "approve", "evidence": []}, tool_calls=0, diff_files=set())
    assert r["verdict"] == "request_changes"
    assert r["enforcement_notes"]


def test_supported_approval_stands():
    r = enforce_review_rules({"verdict": "approve", "evidence": ["run_tests: 160 passed"]}, tool_calls=3, diff_files=set())
    assert r["verdict"] == "approve" and r["route_to"] == ""


def test_findings_route_by_category():
    r = enforce_review_rules({"verdict": "request_changes", "findings": [{"file": "backend/a.js", "line": 1, "category": "approach", "problem": "p"}]}, 2, {"backend/a.js"})
    assert r["route_to"] == "design"
    r = enforce_review_rules({"verdict": "request_changes", "findings": [{"file": "backend/a.js", "line": 1, "category": "tests", "problem": "p"}]}, 2, {"backend/a.js"})
    assert r["route_to"] == "implement"
    r = enforce_review_rules({"verdict": "LGTM!!"}, 2, set())
    assert r["verdict"] == "request_changes"


def test_diff_files_of():
    assert diff_files_of("+++ b/backend/a.js\n+++ b/backend/tests/t.test.js\n") == {"backend/a.js", "backend/tests/t.test.js"}


# ------------------------------------------------------------------ agent loop / brain
def test_extract_json_tolerates_fences_and_prose():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Sure! Here it is: {"action": "finish", "args": {"x": "}"}} done') == {"action": "finish", "args": {"x": "}"}}


def test_agent_loop_with_fake_brain(repo, tmp_path, monkeypatch):
    script = tmp_path / "script.json"
    script.write_text(json.dumps({"design": [
        {"action": "grep", "args": {"pattern": "accept", "path": "backend"}},
        "not json at all",
        {"action": "finish", "args": {"ok": True}},
    ]}))
    monkeypatch.setenv("BRAIN", "fake")
    monkeypatch.setenv("GITCORE_FAKE_SCRIPT", str(script))
    res = run_agent(Brain(), "design", "sys", "task", Toolbox(repo, "design"), max_steps=5)
    assert res.status == "finished" and res.result == {"ok": True}
    assert any("backend/a.js:1" in t["content"] for t in res.transcript if t["role"] == "tool")


def test_budget_is_enforced(monkeypatch):
    monkeypatch.setenv("BRAIN", "fake")
    u = Usage()
    u.add("x", 10_000_000, 0, 0.0)
    with pytest.raises(BudgetExceeded):
        Brain(u).chat("spec", [])


def test_edits_keep_the_files_line_endings(repo):
    p = repo / "backend" / "crlf.js"
    p.write_bytes(b"line1\r\nline2\r\n")
    t = Toolbox(repo, "implement", write_files={"backend/crlf.js"})
    t.replace_in_file("backend/crlf.js", "line2", "LINE2")
    assert p.read_bytes() == b"line1\r\nLINE2\r\n"
    t.write_file("backend/crlf.js", "a\nb\n")
    assert p.read_bytes() == b"a\r\nb\r\n"


def test_agents_cannot_read_run_output_dir(repo):
    (repo / "gitcore-out").mkdir()
    (repo / "gitcore-out" / "transcript_implement_1.jsonl").write_text("{}")
    with pytest.raises(ToolError):
        Toolbox(repo, "review").read_file("gitcore-out/transcript_implement_1.jsonl")
    assert "gitcore-out" not in Toolbox(repo, "review").list_dir(".")


def test_provider_per_role_and_cost_from_configured_prices(monkeypatch):
    from gitcore.brain import kind_for
    from gitcore.config import LIMITS
    monkeypatch.setattr(LIMITS, "max_run_usd", 100.0)
    monkeypatch.setattr(LIMITS, "max_run_tokens", 10_000_000)
    monkeypatch.setenv("BRAIN", "gemini")
    monkeypatch.setenv("BRAIN_REVIEW", "llm")
    assert kind_for("implement") == "gemini" and kind_for("review") == "llm"
    monkeypatch.setenv("GITCORE_PRICE_IN", "1.5")
    monkeypatch.setenv("GITCORE_PRICE_OUT", "9")
    monkeypatch.setenv("GITCORE_PRICE_IN_REVIEW", "3")

    class U:  # Gemini-style usage: thinking tokens only visible in total_tokens
        prompt_tokens, completion_tokens, total_tokens, model_extra = 1_000_000, 100_000, 1_200_000, {}

    class R:
        usage = U()

    b = Brain()
    b._record("implement", R())
    assert b.usage.completion_tokens == 200_000              # 100k visible + 100k thinking
    assert round(b.usage.usd, 4) == round(1.5 + 0.2 * 9, 4)   # 3.30
    b._record("review", R())
    assert round(b.usage.by_role["review"]["usd"], 4) == round(3 + 0.2 * 9, 4)


def test_non_retryable_http_errors_fail_fast(monkeypatch):
    calls = []

    class E(Exception):
        status_code = 402

    class C:
        class chat:
            class completions:
                @staticmethod
                def create(**kw):
                    calls.append(kw)
                    raise E("out of credits")

    monkeypatch.setenv("BRAIN", "gemini")
    b = Brain()
    b._clients["gemini"] = C()
    with pytest.raises(RuntimeError, match="not retried"):
        b.chat("spec", [{"role": "user", "content": "x"}])
    assert len(calls) == 1
    assert calls[0]["reasoning_effort"] == "low"


def _fake_client(replies, calls):
    """OpenAI-style client returning (content, finish_reason) pairs in order."""
    from types import SimpleNamespace as NS

    class C:
        class chat:
            class completions:
                @staticmethod
                def create(**kw):
                    calls.append(kw)
                    content, finish = replies.pop(0)
                    return NS(choices=[NS(message=NS(content=content), finish_reason=finish)],
                              usage=NS(prompt_tokens=10, completion_tokens=5, total_tokens=15, model_extra={}))
    return C()


def test_cut_off_reply_is_reasked_with_a_bigger_limit(monkeypatch):
    from gitcore.config import LIMITS
    monkeypatch.setattr(LIMITS, "max_output_tokens", 8192)
    monkeypatch.setattr(LIMITS, "max_output_tokens_cap", 16384)
    monkeypatch.setenv("BRAIN", "gemini")
    calls = []
    b = Brain()
    # empty + length (thinking used the whole limit), then a real answer
    b._clients["gemini"] = _fake_client([(None, "length"), ('{"action": "finish", "args": {}}', "stop")], calls)
    assert b.chat("design", [{"role": "user", "content": "x"}]) == '{"action": "finish", "args": {}}'
    assert [c["max_tokens"] for c in calls] == [8192, 16384]
    assert b.last_reply["finish_reason"] == "stop" and b.usage.calls == 2   # both calls are billed


def test_native_function_call_attempt_is_reasked_as_json_text(monkeypatch):
    from gitcore.brain import NATIVE_CALL_NOTE
    monkeypatch.setenv("BRAIN", "gemini")
    calls = []
    b = Brain()
    bad = (None, "function_call_filter: MALFORMED_FUNCTION_CALL")
    b._clients["gemini"] = _fake_client([bad, ('{"action": "finish", "args": {}}', "stop")], calls)
    msgs = [{"role": "user", "content": "x"}]
    assert b.chat("design", msgs) == '{"action": "finish", "args": {}}'
    assert len(calls) == 2
    assert calls[1]["messages"][-1]["content"] == NATIVE_CALL_NOTE   # the retry says why
    assert msgs == [{"role": "user", "content": "x"}]                # caller's list untouched


def test_persistent_native_call_attempts_are_reported(monkeypatch):
    from gitcore.agent_loop import run_agent
    monkeypatch.setenv("BRAIN", "gemini")
    calls = []
    b = Brain()
    b._clients["gemini"] = _fake_client([(None, "function_call_filter: MALFORMED_FUNCTION_CALL")] * 9, calls)
    res = run_agent(b, "design", "sys", "task", None, 5)
    assert res.status == "error" and "native function calls" in res.error
    assert "NOT native function calls" in calls[0]["messages"][0]["content"]   # system prompt says so up front
    assert len(calls) == 9                                                     # 3 replies x (1 + 2 re-asks)


def test_cut_off_at_the_cap_reports_the_real_reason(monkeypatch):
    from gitcore.agent_loop import run_agent
    from gitcore.config import LIMITS
    monkeypatch.setattr(LIMITS, "max_output_tokens", 8192)
    monkeypatch.setattr(LIMITS, "max_output_tokens_cap", 8192)       # no room to grow
    monkeypatch.setenv("BRAIN", "gemini")
    calls = []
    b = Brain()
    b._clients["gemini"] = _fake_client([("", "length")] * 3, calls)
    res = run_agent(b, "design", "sys", "task", None, 5)
    assert res.status == "error"
    assert "cut off at the output limit" in res.error and "max_tokens=8192" in res.error
    assert res.transcript[0]["finish_reason"] == "length"
    assert "cut off" in res.transcript[1]["content"]                     # the model is told why
