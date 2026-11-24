"""Entry points called by .github/workflows/autose.yml, one per job step.

  gate         decide whether to run (sender permission, trigger form); write issue.json
  build        stages 1-4 from the start                       (no GitHub token)
  fix          stages 2/3-4 again with reviewer findings      (no GitHub token)
  release      stage 5: push branch, open/update PR, or report why not (token, no model)
  review       stage 6: independent reviewer                    (no GitHub token)
  post-review  publish review.md on the PR, set labels          (token, no model)
  finalize     one summary comment on the issue                 (token, no model)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

from .state import RunStore

BOT_SUFFIX = "[bot]"
ALLOWED_PERMISSIONS = {"admin", "maintain", "write"}


def set_output(**kv) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    lines = [f"{k}={v}" for k, v in kv.items()]
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


# ------------------------------------------------------------------- gate
def cmd_gate(a) -> int:
    from . import github as gh
    store = RunStore(a.out)
    name = os.environ.get("GITHUB_EVENT_NAME", "")
    ev = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    sender = (ev.get("sender") or {}).get("login", "")
    issue = ev.get("issue") or {}
    mode, pr = "pipeline", ""
    decision = {"event": name, "sender": sender, "proceed": False, "reason": ""}

    if sender.endswith(BOT_SUFFIX):
        decision["reason"] = "event from a bot"
    elif name == "issues" and (ev.get("label") or {}).get("name") != "autose":
        decision["reason"] = "label is not 'autose'"
    elif name == "issue_comment" and not (ev.get("comment") or {}).get("body", "").strip().startswith("/autose"):
        decision["reason"] = "comment does not start with /autose"
    else:
        decision["proceed"] = True
    if name == "workflow_dispatch":
        num = (ev.get("inputs") or {}).get("issue_number")
        issue = json.loads(gh.gh("issue", "view", str(num), "--repo", gh.repo_slug(), "--json", "number,title,body,labels,state"))
    if decision["proceed"] and name == "issue_comment" and "pull_request" in issue:
        mode, pr = "review", str(issue.get("number"))
        # The reviewer must judge against the user's issue, not the PR's own description.
        m = re.search(r"\b(?:refs|closes|fixes|resolves)\s+#(\d+)", issue.get("body") or "", re.I)
        if m:
            linked = json.loads(gh.gh("issue", "view", m.group(1), "--repo", gh.repo_slug(), "--json", "number,title,body,labels,state"))
            linked["state"] = "open"   # the PR's state decides whether to run, not the issue's
            issue = linked
        decision["linked_issue"] = issue.get("number")
    if decision["proceed"] and issue.get("state", "open").lower() != "open":
        decision.update(proceed=False, reason="issue is closed")
    if decision["proceed"]:
        perm = gh.sender_permission(sender)
        decision["permission"] = perm
        if perm not in ALLOWED_PERMISSIONS:
            decision.update(proceed=False, reason=f"@{sender} has '{perm}' permission; GitCore runs only for collaborators with write access")
            body = store.write("gate_comment.md", f"GitCore did not start: {decision['reason']}.\n")
            gh.comment_issue(issue["number"], body)
    if decision["proceed"] and mode == "pipeline":
        gh.ensure_labels()
        gh.set_labels("issue", issue["number"], add=["autose:running"], remove=["autose:failed", "autose:needs-info"])
        body = store.write("gate_comment.md", f"GitCore run started: {gh.run_url()}\n\nStages: spec → design → implement → test → PR → independent review. "
                                              "Artifacts for every stage are attached to the run. A maintainer decides whether to merge.\n")
        gh.comment_issue(issue["number"], body)
    labels = [l.get("name") if isinstance(l, dict) else l for l in issue.get("labels", [])]
    store.write("issue.json", {"number": issue.get("number"), "title": issue.get("title", ""), "body": issue.get("body") or "", "labels": labels})
    store.write("gate.json", decision)
    set_output(proceed=str(decision["proceed"]).lower(), issue=issue.get("number", ""), mode=mode, pr=pr)
    return 0


# ------------------------------------------------------------------- build / fix
def _ctx(a):
    from .brain import Brain, Usage
    from .graph import Ctx
    store = RunStore(a.out)
    prev = store.load()
    brain = Brain(Usage.from_dict(prev.get("usage")))
    return Ctx(Path(a.repo).resolve(), store, brain), store, prev


def cmd_build(a) -> int:
    from .graph import run_graph
    ctx, store, prev = _ctx(a)
    issue = json.loads(Path(a.issue_file).read_text(encoding="utf-8"))
    state = prev if prev.get("issue", {}).get("number") == issue["number"] and prev.get("mode") == "initial" else {}
    state.update({"issue": issue, "mode": "initial", "entry": "spec", "round": 0})
    if state.get("status") not in ("ready",):
        state["status"] = "running"
    final = run_graph(ctx, state) if state["status"] == "running" else state
    set_output(status=final.get("status"))
    return 0


def cmd_fix(a) -> int:
    from .graph import run_graph
    ctx, store, prev = _ctx(a)
    review = json.loads(Path(a.review).read_text(encoding="utf-8"))
    state = dict(prev)
    state.update({"mode": "fix", "round": review.get("round", 1), "entry": review.get("route_to") or "implement",
                  "findings": review.get("findings", []), "status": "running", "attempts": 0, "test_fixes": 0,
                  "last_failure": "", "failure_sigs": [], "stuck": False, "next": "", "test_check": None, "build_check": None})
    if state["entry"] == "design":
        state["completed"] = [c for c in state.get("completed", []) if c == "spec"]
    final = run_graph(ctx, state)
    set_output(status=final.get("status"))
    return 0


# ------------------------------------------------------------------- release
def _draft_on_failure() -> bool:
    return os.environ.get("GITCORE_DRAFT_ON_FAILURE", "true").strip().lower() != "false"


def _stop_comment(state: dict, store: RunStore, draft_pr: str = "") -> str:
    status = state.get("status", "unknown")
    if draft_pr:
        lines = [f"GitCore stopped before finishing. **Status: `{status}`**", "",
                 f"The partial work is in draft PR #{draft_pr} for inspection (not for merge).", ""]
    else:
        lines = [f"GitCore stopped before opening a pull request. **Status: `{status}`**", ""]
    if status == "needs_clarification":
        spec = state.get("spec") or {}
        if spec.get("safety_flag"):
            lines.append(f"The request was flagged for human review: {spec.get('safety_reason', '')}")
        lines.append("I could not write testable acceptance criteria from this issue. Questions:")
        for q in spec.get("questions") or []:
            lines.append(f"- {q.get('question', q) if isinstance(q, dict) else q}")
        lines.append("\nAnswer in the issue and comment `/autose` to start again.")
    else:
        lines.append(f"Reason: {state.get('stop_reason', '')}")
    return "\n".join(lines) + "\n"


def cmd_release(a) -> int:
    from . import github as gh
    from . import render
    store = RunStore(a.out)
    state = store.load()
    issue = json.loads(Path(a.issue_file).read_text(encoding="utf-8")) if a.issue_file else state.get("issue", {})
    n = issue.get("number")
    repo = Path(a.repo).resolve()
    status = state.get("status")
    failed = status != "ready"
    branch = f"autose/issue-{n}"
    # A failed first run still opens a *draft* PR (partial code, or an empty commit if it stopped
    # before implementation) so the run has something to inspect. Not for: needs_clarification (the
    # questions belong on the issue), a failed fix round (the round-1 PR stays as it was), or when
    # GITCORE_DRAFT_ON_FAILURE=false.
    if failed and (status == "needs_clarification" or a.mode != "initial" or not _draft_on_failure()):
        body = store.write("stop_comment.md", _stop_comment(state, store))
        gh.comment_issue(n, body)
        if a.mode != "initial":
            existing = gh.find_pr(branch)
            if existing:
                gh.comment_pr(existing, body)
                gh.set_labels("pr", existing, add=["autose:failed"])
        label = "autose:needs-info" if status == "needs_clarification" else "autose:failed"
        gh.set_labels("issue", n, add=[label], remove=["autose:running"])
        store.write("pr.md", f"# pr.md\n\nNo pull request opened.\n\n{_stop_comment(state, store)}")
        set_output(released="false", pr="", sha="", draft="false")
        return 0

    patch = store.dir / "diff.patch"
    has_code = patch.is_file() and patch.stat().st_size > 0
    if not failed and not has_code:
        raise SystemExit("diff.patch is empty")
    gh.git(repo, "config", "user.name", "github-actions[bot]")
    gh.git(repo, "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com")
    if a.mode == "initial":
        gh.git(repo, "checkout", "-B", branch)
    else:
        gh.git(repo, "checkout", branch)
    if has_code:
        gh.git(repo, "apply", "--index", "--whitespace=nowarn", str(patch))
    title = f"GitCore: {issue.get('title', '')[:80]} (#{n})"
    if failed:
        title = f"[draft, stopped at {render.stopped_stage(state)}] {title}"
    msg = f"{title}\n\nRound {state.get('round', 0)}. Generated by GitCore; see the PR for artifacts.\n\nRefs #{n}"
    gh.git(repo, "commit", "-q", *(["--allow-empty"] if failed else []), "-m", msg)
    if a.mode == "initial":
        gh.git(repo, "push", "--force", "origin", f"HEAD:refs/heads/{branch}")
    else:
        gh.git(repo, "push", "origin", f"HEAD:refs/heads/{branch}")
    sha = gh.git(repo, "rev-parse", "HEAD").strip()
    pr_body = store.write("pr.md", render.pr_md(state, issue, gh.run_url(), stopped=failed, has_code=has_code))
    pr = gh.find_pr(branch)
    if pr:
        gh.gh("pr", "edit", pr, "--repo", gh.repo_slug(), "--title", title, "--body-file", str(pr_body))
        # a rerun can turn an earlier draft into a real PR, or the other way round
        gh.gh("pr", "ready", pr, "--repo", gh.repo_slug(), *(["--undo"] if failed else []), check=False)
    else:
        url = gh.gh("pr", "create", "--repo", gh.repo_slug(), "--base", a.base, "--head", branch,
                    "--title", title, "--body-file", str(pr_body), *(["--draft"] if failed else [])).strip()
        pr = url.rstrip("/").split("/")[-1]
    if failed:
        gh.set_labels("pr", pr, add=["autose:failed"])
        body = store.write("stop_comment.md", _stop_comment(state, store, draft_pr=pr))
        gh.comment_issue(n, body)
        gh.set_labels("issue", n, add=["autose:failed"], remove=["autose:running"])
    else:
        gh.gh("pr", "edit", pr, "--repo", gh.repo_slug(), "--remove-label", "autose:failed", check=False)
    store.write("pr.json", {"number": pr, "branch": branch, "sha": sha, "draft": failed,
                            "url": f"https://github.com/{gh.repo_slug()}/pull/{pr}"})
    with open(pr_body, "a", encoding="utf-8") as f:
        f.write(f"\n---\nPR: https://github.com/{gh.repo_slug()}/pull/{pr} (head {sha[:7]})\n")
    set_output(released="true", pr=pr, sha=sha, draft=str(failed).lower())
    return 0


# ------------------------------------------------------------------- review
def cmd_review(a) -> int:
    from .reviewer import run_review
    issue = json.loads(Path(a.issue_file).read_text(encoding="utf-8"))
    diff = Path(a.diff_file).read_text(encoding="utf-8")
    r = run_review(Path(a.repo).resolve(), Path(a.out), issue, diff, a.round, a.pr,
                   Path(a.rationale_dir) if a.rationale_dir else None)
    set_output(verdict=r["verdict"], route_to=r.get("route_to", ""))
    return 0


def cmd_post_review(a) -> int:
    from . import github as gh
    store = RunStore(a.out)
    r = store.read_json(f"review_{a.round}.json") or store.read_json("review.json")
    gh.comment_pr(a.pr, store.dir / f"review_{a.round}.md")
    if r["verdict"] == "approve":
        gh.set_labels("pr", a.pr, add=["autose:approved"], remove=["autose:changes-requested"])
    else:
        gh.set_labels("pr", a.pr, add=["autose:changes-requested"], remove=["autose:approved"])
    needs_fix = r["verdict"] == "request_changes" and int(a.round) < int(a.max_rounds)
    set_output(verdict=r["verdict"], route_to=r.get("route_to", ""), needs_fix=str(needs_fix).lower())
    return 0


# ------------------------------------------------------------------- finalize
def cmd_finalize(a) -> int:
    from . import github as gh
    store = RunStore(a.out)
    state = store.load()
    issue = state.get("issue") or {}
    n = a.issue or issue.get("number")
    reviews = [store.read_json(f"review_{k}.json") for k in (1, 2)]
    reviews = [r for r in reviews if r]
    pr_info = store.read_json("pr.json") or {}
    pr = pr_info.get("number", "")
    pr_cell = ("PR #" + str(pr) + (" (draft)" if pr_info.get("draft") else "")) if pr else "no PR"
    u = state.get("usage", {})
    rev_tokens = sum(r.get("usage", {}).get("total_tokens", 0) for r in reviews)
    rev_usd = sum(r.get("usage", {}).get("usd", 0) for r in reviews)
    lines = ["### GitCore run summary", "", "| Stage | Result |", "|---|---|",
             f"| 1 Requirements | {'pass' if (state.get('spec_check') or {}).get('ok') else 'fail / not reached'} |",
             f"| 2 Design | {'pass' if (state.get('design_check') or {}).get('ok') else 'fail / not reached'} |",
             f"| 3 Implementation | {'pass' if (state.get('build_check') or {}).get('ok') else 'fail / not reached'} (attempts {state.get('attempts', 0)}, redesigns {state.get('redesigns', 0)}) |",
             f"| 4 Testing | {'pass' if (state.get('test_check') or {}).get('ok') else 'fail / not reached'} |",
             f"| 5 Release | {pr_cell} · CI: {a.ci or 'n/a'} |"]
    for r in reviews:
        lines.append(f"| 6 Review round {r.get('round')} | {r.get('verdict')} ({len(r.get('findings', []))} findings) |")
    lines += ["", f"Builder tokens: {u.get('total_tokens', 0)} (${u.get('usd', 0):.4f}) · reviewer tokens: {rev_tokens} (${rev_usd:.4f})",
              f"Run: {gh.run_url()}", "", "**GitCore never merges. A maintainer decides.**"]
    body = store.write("summary.md", "\n".join(lines) + "\n")
    if n:
        gh.comment_issue(n, body)
        gh.set_labels("issue", n, remove=["autose:running"])
    run_record = {"issue": n, "status": state.get("status"), "stop_reason": state.get("stop_reason"), "pr": pr,
                  "draft": bool(pr_info.get("draft")), "ci": a.ci,
                  "attempts": state.get("attempts"), "redesigns": state.get("redesigns"), "builder_usage": u,
                  "reviews": [{k: r.get(k) for k in ("round", "verdict", "route_to", "model", "variant", "tool_calls")} | {"findings": len(r.get("findings", [])), "usage": r.get("usage")} for r in reviews],
                  "run_url": gh.run_url(), "variant": os.environ.get("GITCORE_VARIANT", "default")}
    store.write("run_record.json", run_record)
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="gitcore")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("gate"); s.add_argument("--out", required=True); s.set_defaults(fn=cmd_gate)
    s = sub.add_parser("build"); s.add_argument("--repo", default="."); s.add_argument("--out", required=True)
    s.add_argument("--issue-file", required=True); s.set_defaults(fn=cmd_build)
    s = sub.add_parser("fix"); s.add_argument("--repo", default="."); s.add_argument("--out", required=True)
    s.add_argument("--review", required=True); s.set_defaults(fn=cmd_fix)
    s = sub.add_parser("release"); s.add_argument("--repo", default="."); s.add_argument("--out", required=True)
    s.add_argument("--issue-file"); s.add_argument("--mode", choices=["initial", "fix"], default="initial")
    s.add_argument("--base", default="main"); s.set_defaults(fn=cmd_release)
    s = sub.add_parser("review"); s.add_argument("--repo", default="."); s.add_argument("--out", required=True)
    s.add_argument("--issue-file", required=True); s.add_argument("--diff-file", required=True)
    s.add_argument("--round", type=int, default=1); s.add_argument("--pr", required=True)
    s.add_argument("--rationale-dir"); s.set_defaults(fn=cmd_review)
    s = sub.add_parser("post-review"); s.add_argument("--out", required=True); s.add_argument("--pr", required=True)
    s.add_argument("--round", type=int, default=1); s.add_argument("--max-rounds", type=int, default=2); s.set_defaults(fn=cmd_post_review)
    s = sub.add_parser("finalize"); s.add_argument("--out", required=True); s.add_argument("--issue")
    s.add_argument("--ci", default=""); s.set_defaults(fn=cmd_finalize)

    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
