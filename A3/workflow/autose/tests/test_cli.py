"""Offline tests for the token-holding commands, with the gh CLI stubbed."""
import json

import pytest

from Gitwallah_v2.A3.workflow.autose.gitcore import cli
from Gitwallah_v2.A3.workflow.autose.gitcore import github as ghmod


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


def _git_repo(tmp):
    """A clone with one commit and a bare 'origin', so release can really commit and push."""
    import subprocess
    run = lambda *a, cwd: subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True, text=True)
    origin, work = tmp / "origin.git", tmp / "work"
    run("init", "-q", "--bare", str(origin), cwd=tmp)
    run("init", "-q", "-b", "main", str(work), cwd=tmp)
    (work / "backend").mkdir()
    (work / "backend" / "a.js").write_text("export const a = 1;\n")
    run("-c", "user.name=t", "-c", "user.email=t@t", "add", ".", cwd=work)
    run("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init", cwd=work)
    run("remote", "add", "origin", str(origin), cwd=work)
    run("push", "-q", "origin", "main", cwd=work)
    return work, origin, run


def _release(env, monkeypatch, state, patch_text=""):
    fake = FakeGH()
    monkeypatch.setattr(ghmod, "gh", fake)
    work, origin, run = _git_repo(env)
    outd = env / "out"
    outd.mkdir()
    (outd / "state.json").write_text(json.dumps({"issue": ISSUE, **state}))
    (outd / "issue.json").write_text(json.dumps(ISSUE))
    if patch_text:
        (outd / "diff.patch").write_text(patch_text)
    cli.main(["release", "--repo", str(work), "--out", str(outd), "--issue-file", str(outd / "issue.json"), "--mode", "initial"])
    outputs = dict(l.split("=", 1) for l in (env / "gh_output").read_text().splitlines())
    return fake, outd, outputs, origin, run


def test_failed_before_code_opens_a_draft_pr_with_an_empty_commit(env, monkeypatch):
    state = {"status": "failed", "stop_reason": "design agent: unparsable replies",
             "spec": {"intent": "show expiry", "acceptance_criteria": [{"id": "AC-1", "given": "g", "when": "w", "then": "t"}]},
             "spec_check": {"ok": True}}
    fake, outd, out, origin, run = _release(env, monkeypatch, state)
    assert out["released"] == "true" and out["draft"] == "true" and out["pr"] == "7"
    create = fake.did("pr", "create")[0]
    assert "--draft" in create and "[draft, stopped at design]" in create[create.index("--title") + 1]
    body = (outd / "pr.md").read_text()
    assert "did not finish" in body and "No code was written" in body and "AC-1" in body
    files = run("show", "--name-only", "--format=", "autose/issue-3", cwd=origin).stdout.strip()
    assert files == ""                                               # empty commit: nothing changed
    assert "draft PR #7" in (outd / "stop_comment.md").read_text()
    assert any("autose:failed" in c for c in fake.did("pr", "edit"))


def test_failed_during_tests_puts_the_partial_code_in_the_draft(env, monkeypatch):
    patch = ("diff --git a/backend/a.js b/backend/a.js\n--- a/backend/a.js\n+++ b/backend/a.js\n"
             "@@ -1 +1 @@\n-export const a = 1;\n+export const a = 2;\n")
    state = {"status": "failed", "stop_reason": "test: attempts used up", "last_failure": "AC-1 not covered",
             "spec_check": {"ok": True}, "design_check": {"ok": True}, "build_check": {"ok": True},
             "design": {"files": [{"path": "backend/a.js", "why": "bump"}]}}
    fake, outd, out, origin, run = _release(env, monkeypatch, state, patch)
    assert out["draft"] == "true"
    assert run("show", "--name-only", "--format=", "autose/issue-3", cwd=origin).stdout.strip() == "backend/a.js"
    body = (outd / "pr.md").read_text()
    assert "stopped at stage **test**" in body and "AC-1 not covered" in body and "No code was written" not in body


def test_draft_on_failure_can_be_switched_off(env, monkeypatch):
    monkeypatch.setenv("GITCORE_DRAFT_ON_FAILURE", "false")
    fake, outd, out, origin, run = _release(env, monkeypatch, {"status": "failed", "stop_reason": "x"})
    assert out["released"] == "false" and not fake.did("pr", "create")


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
