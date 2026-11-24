"""Stage 6: independent reviewer (ADR-008).

Sees only: the issue (untrusted), the PR diff, and the repository checked out at
the PR head. Tools: read-only + run_tests. Never sees spec/design/test report or
any builder conversation (unless the E1 "rationale" variant is switched on for
the decision experiment).
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from .agent_loop import load_prompt, run_agent, untrusted_issue as _untrusted_issue
from .brain import Brain, BudgetExceeded
from .config import LIMITS
from .state import RunStore
from .tools import Toolbox

VARIANT_SEES_RATIONALE = "reviewer_sees_rationale"


def enforce_review_rules(review: dict, tool_calls: int, diff_files: set[str]) -> dict:
    """Code-level anti-rubber-stamp rules. Returns a normalised review dict."""
    r = dict(review or {})
    verdict = str(r.get("verdict", "")).strip().lower().replace("-", "_").replace(" ", "_")
    notes = []
    if verdict not in ("approve", "request_changes"):
        notes.append(f"unparsable verdict '{r.get('verdict')}' counted as request_changes")
        verdict = "request_changes"
    findings = [f for f in (r.get("findings") or []) if isinstance(f, dict)]
    evidence = [e for e in (r.get("evidence") or []) if e]
    if verdict == "approve" and (tool_calls == 0 or not evidence):
        notes.append("unsupported approval (no tool calls or no evidence) downgraded to request_changes")
        verdict = "request_changes"
        if not findings:
            findings = [{"file": "-", "line": 0, "category": "tests",
                         "problem": "Reviewer approved without checking anything; review must be repeated with evidence."}]
    if verdict == "request_changes" and not findings:
        findings = [{"file": "-", "line": 0, "category": "code", "problem": r.get("summary") or "changes requested without specific findings"}]
    for f in findings:
        cat = str(f.get("category", "code")).lower()
        f["category"] = cat if cat in ("code", "tests", "approach") else "code"
        if diff_files and f.get("file") not in diff_files and f.get("file") not in ("-", None):
            f["note"] = "file not in diff"
    category = "approach" if any(f["category"] == "approach" for f in findings) else ("code" if findings else "")
    r.update({"verdict": verdict, "findings": findings, "evidence": evidence, "enforcement_notes": notes,
              "route_to": ("design" if category == "approach" else "implement") if verdict == "request_changes" else "",
              "tool_calls": tool_calls})
    return r


def diff_files_of(diff: str) -> set[str]:
    out = set()
    for line in diff.splitlines():
        if line.startswith("+++ b/"):
            out.add(line[6:].strip())
    return out


def review_md(r: dict, round_no: int, pr: str, model: str) -> str:
    head = "APPROVE" if r["verdict"] == "approve" else "REQUEST CHANGES"
    out = [f"## GitCore independent review, round {round_no}: **{head}**", "",
           f"PR #{pr} · reviewer model `{model}` · tool calls: {r.get('tool_calls', 0)}", "",
           f"**User's request, in the reviewer's words:** {r.get('restated_request', '')}", "",
           f"**Summary:** {r.get('summary', '')}", ""]
    if r.get("risks_checked"):
        out += ["### Ways this could be wrong, and what was checked", "", "| Risk | How checked | Result |", "|---|---|---|"]
        for k in r["risks_checked"]:
            if isinstance(k, dict):
                out.append(f"| {k.get('risk', '')} | {k.get('check', '')} | {k.get('result', '')} |")
        out.append("")
    if r.get("findings"):
        out += ["### Findings", "", "| File | Line | Category | Problem |", "|---|---|---|---|"]
        for f in r["findings"]:
            out.append(f"| `{f.get('file')}` | {f.get('line', '')} | {f.get('category')} | {str(f.get('problem', '')).replace('|', '/')} |")
        out.append("")
    if r.get("evidence"):
        out += ["### Evidence", ""] + [f"- {e}" for e in r["evidence"]] + [""]
    if r.get("enforcement_notes"):
        out += ["### Enforced by code", ""] + [f"- {n}" for n in r["enforcement_notes"]] + [""]
    u = r.get("usage") or {}
    run = os.environ.get("GITHUB_RUN_ID", "")
    run_link = f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{os.environ.get('GITHUB_REPOSITORY', '')}/actions/runs/{run}" if run else "local"
    # Machine-readable footer: results scripts read tokens, cost and the run from it.
    out.append(f"Reviewer tokens: {u.get('total_tokens', 0)} (${u.get('usd', 0):.4f}) · Run: {run_link}")
    out.append("")
    out.append("_The reviewer cannot push and never merges. A maintainer decides._")
    return "\n".join(out) + "\n"


def run_review(repo: Path, out_dir: Path, issue: dict, diff: str, round_no: int, pr: str,
               rationale_dir: Path | None = None) -> dict:
    store = RunStore(out_dir)
    brain = Brain()
    variant = os.environ.get("GITCORE_VARIANT", "")
    role = "review"
    if variant == VARIANT_SEES_RATIONALE:
        # E1 variant A: same model as the builders and sees their design rationale.
        os.environ["MODEL_REVIEW"] = os.environ.get("MODEL_BUILDER", "")
    else:
        os.environ.setdefault("MODEL_REVIEW", os.environ.get("MODEL_REVIEWER", ""))
    task = (f"{_untrusted_issue(issue)}\n\n## Pull request #{pr} diff\n```diff\n{diff[:20000]}\n```\n"
            f"{'(diff truncated)' if len(diff) > 20000 else ''}\n\nThe repository is checked out at the PR head. "
            "Review it now, following your procedure, then call finish with the review JSON.")
    if variant == VARIANT_SEES_RATIONALE and rationale_dir:
        for name in ("design.md", "test_report.md"):
            p = rationale_dir / name
            if p.is_file():
                task += f"\n\n## Implementer's {name}\n{p.read_text(encoding='utf-8')[:6000]}"
    tools = Toolbox(repo, "review", can_test=True)
    try:
        res = run_agent(brain, role, load_prompt("review.md"), task, tools, LIMITS.tool_steps["review"])
        store.append_transcript(f"review_{round_no}", res.transcript)
        raw = res.result if res.status == "finished" else {"verdict": "request_changes", "summary": f"reviewer did not finish: {res.error}"}
    except BudgetExceeded as e:
        raw = {"verdict": "request_changes", "summary": f"reviewer stopped: {e}"}
        tools.calls = tools.calls or []
    review = enforce_review_rules(raw.get("review", raw), len(tools.calls), diff_files_of(diff))
    review.update({"round": round_no, "pr": pr, "variant": variant or "default",
                   "model": os.environ.get("MODEL_REVIEW") or "(default)", "usage": brain.usage.to_dict()})
    store.write(f"review_{round_no}.json", review)
    store.write("review.json", review)
    md = review_md(review, round_no, pr, review["model"])
    store.write(f"review_{round_no}.md", md)
    store.write("review.md", md)
    return review
