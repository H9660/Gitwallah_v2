"""Offline tests for the token-holding commands, with the gh CLI stubbed."""
import json

import pytest

from gitcore import cli
from gitcore import github as ghmod


class FakeGH:
    def __init__(self, permission="write", issues=None):
        self.calls = []
        self.permission = permission
        self.issues = issues or {}

    def __call__(self, *args, input_text=None, check=True):
        self.calls.append(args)
        if args[:1] == ("api",) and "permission" in args[1]:
            return json.dumps({"permission": self.permission})
        if args[:2] == ("issue", "view"):
            return json.dumps(self.issues[args[2]])
        if args[:2] == ("pr", "list"):
            return "[]"
        if args[:2] == ("pr", "create"):
            return "https://github.com/o/r/pull/7\n"
        return ""

    def did(self, *prefix):
        return [c for c in self.calls if c[:len(prefix)] == prefix]


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("GITHUB_REPOSITORY", "o/r")
    monkeypatch.setenv("GITHUB_RUN_ID", "42")
    out = tmp_path / "gh_output"
    monkeypatch.setenv("GITHUB_OUTPUT", str(out))
    return tmp_path


def run_gate(env, monkeypatch, event_name, event, fake):
    p = env / "event.json"
    p.write_text(json.dumps(event))
    monkeypatch.setenv("GITHUB_EVENT_NAME", event_name)
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(p))
    monkeypatch.setattr(ghmod, "gh", fake)
    cli.main(["gate", "--out", str(env / "out")])
    outputs = dict(line.split("=", 1) for line in (env / "gh_output").read_text().splitlines())
    return outputs, json.loads((env / "out" / "issue.json").read_text())


ISSUE = {"number": 3, "title": "Bug", "body": "it breaks", "labels": [{"name": "autose"}], "state": "open"}


def test_gate_starts_for_collaborator_label(env, monkeypatch):
    fake = FakeGH("write")
    out, issue = run_gate(env, monkeypatch, "issues", {"sender": {"login": "maint"}, "label": {"name": "autose"}, "issue": ISSUE}, fake)
    assert out["proceed"] == "true" and out["mode"] == "pipeline" and out["issue"] == "3"
    assert issue["body"] == "it breaks"
    assert fake.did("issue", "comment")


def test_gate_refuses_outsider_and_says_why(env, monkeypatch):
    fake = FakeGH("read")
    out, _ = run_gate(env, monkeypatch, "issue_comment",
                      {"sender": {"login": "stranger"}, "comment": {"body": "/autose"}, "issue": ISSUE}, fake)
    assert out["proceed"] == "false"
    assert fake.did("issue", "comment")


def test_gate_ignores_other_labels_and_bots(env, monkeypatch):
    out, _ = run_gate(env, monkeypatch, "issues", {"sender": {"login": "m"}, "label": {"name": "bug"}, "issue": ISSUE}, FakeGH())
    assert out["proceed"] == "false"
    out, _ = run_gate(env, monkeypatch, "issue_comment",
                      {"sender": {"login": "github-actions[bot]"}, "comment": {"body": "/autose"}, "issue": ISSUE}, FakeGH())
    assert out["proceed"] == "false"


def test_gate_review_mode_uses_the_linked_issue(env, monkeypatch):
    pr = {"number": 9, "title": "PR title", "body": "Refs #3", "pull_request": {}, "state": "open", "labels": []}
    fake = FakeGH("admin", issues={"3": {**ISSUE, "state": "OPEN", "labels": []}})
    out, issue = run_gate(env, monkeypatch, "issue_comment",
                          {"sender": {"login": "m"}, "comment": {"body": "/autose review"}, "issue": pr}, fake)
    assert out["mode"] == "review" and out["pr"] == "9"
    assert issue["number"] == 3 and issue["body"] == "it breaks"


def test_release_reports_instead_of_pushing_when_not_ready(env, monkeypatch):
    fake = FakeGH()
    monkeypatch.setattr(ghmod, "gh", fake)
    outd = env / "out"
    outd.mkdir()
    (outd / "state.json").write_text(json.dumps({"status": "needs_clarification", "issue": ISSUE,
                                                 "spec": {"questions": [{"question": "Which page?"}]}}))
    (outd / "issue.json").write_text(json.dumps(ISSUE))
    cli.main(["release", "--repo", str(env), "--out", str(outd), "--issue-file", str(outd / "issue.json")])
    assert "Which page?" in (outd / "stop_comment.md").read_text()
    assert fake.did("issue", "comment") and not fake.did("pr", "create")
    assert "released=false" in (env / "gh_output").read_text()


def test_post_review_sets_needs_fix_only_before_last_round(env, monkeypatch):
    monkeypatch.setattr(ghmod, "gh", FakeGH())
    outd = env / "out"
    outd.mkdir()
    for rnd in (1, 2):
        (outd / f"review_{rnd}.json").write_text(json.dumps({"verdict": "request_changes", "route_to": "implement"}))
        (outd / f"review_{rnd}.md").write_text("r")
    cli.main(["post-review", "--out", str(outd), "--pr", "7", "--round", "1", "--max-rounds", "2"])
    cli.main(["post-review", "--out", str(outd), "--pr", "7", "--round", "2", "--max-rounds", "2"])
    lines = (env / "gh_output").read_text().splitlines()
    assert [l for l in lines if l.startswith("needs_fix")] == ["needs_fix=true", "needs_fix=false"]


def test_finalize_writes_summary_and_run_record(env, monkeypatch):
    fake = FakeGH()
    monkeypatch.setattr(ghmod, "gh", fake)
    outd = env / "out"
    outd.mkdir()
    (outd / "state.json").write_text(json.dumps({"status": "ready", "issue": ISSUE, "spec_check": {"ok": True},
                                                 "usage": {"total_tokens": 1234, "usd": 0.01}}))
    (outd / "review_1.json").write_text(json.dumps({"round": 1, "verdict": "approve", "findings": [], "usage": {"total_tokens": 99}}))
    cli.main(["finalize", "--out", str(outd), "--issue", "3", "--ci", "success"])
    rec = json.loads((outd / "run_record.json").read_text())
    assert rec["status"] == "ready" and rec["reviews"][0]["verdict"] == "approve"
    assert "1234" in (outd / "summary.md").read_text()
