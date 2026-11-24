"""All GitHub writes. Only called from jobs that hold a token and run no model (ADR-005)."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


def gh(*args: str, input_text: str | None = None, check: bool = True) -> str:
    p = subprocess.run(["gh", *args], capture_output=True, text=True, encoding="utf-8", errors="replace", input=input_text)
    if check and p.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args[:3])} failed: {p.stderr.strip()[:500]}")
    return p.stdout


def git(repo: Path, *args: str, check: bool = True) -> str:
    p = subprocess.run(["git", *args], cwd=str(repo), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check and p.returncode != 0:
        raise RuntimeError(f"git {' '.join(args[:3])} failed: {p.stderr.strip()[:500]}")
    return p.stdout


def repo_slug() -> str:
    return os.environ["GITHUB_REPOSITORY"]


def run_url() -> str:
    s, r, i = os.environ.get("GITHUB_SERVER_URL", "https://github.com"), os.environ.get("GITHUB_REPOSITORY", ""), os.environ.get("GITHUB_RUN_ID", "")
    return f"{s}/{r}/actions/runs/{i}" if r and i else ""


def sender_permission(user: str) -> str:
    try:
        out = gh("api", f"repos/{repo_slug()}/collaborators/{user}/permission")
        return json.loads(out).get("permission", "none")
    except RuntimeError:
        return "none"


def ensure_labels() -> None:
    for name, color in (("autose", "5319e7"), ("autose:running", "fbca04"), ("autose:needs-info", "d93f0b"),
                        ("autose:approved", "0e8a16"), ("autose:changes-requested", "b60205"), ("autose:failed", "000000")):
        gh("label", "create", name, "--color", color, "--force", check=False)


def comment_issue(number: int | str, body_file: Path) -> None:
    gh("issue", "comment", str(number), "--repo", repo_slug(), "--body-file", str(body_file))


def comment_pr(number: int | str, body_file: Path) -> None:
    gh("pr", "comment", str(number), "--repo", repo_slug(), "--body-file", str(body_file))


def set_labels(kind: str, number: int | str, add: list[str] = (), remove: list[str] = ()) -> None:
    args = [kind, "edit", str(number), "--repo", repo_slug()]
    for a in add:
        args += ["--add-label", a]
    for r in remove:
        args += ["--remove-label", r]
    if add or remove:
        gh(*args, check=False)


def find_pr(branch: str) -> str | None:
    out = gh("pr", "list", "--repo", repo_slug(), "--head", branch, "--state", "open", "--json", "number", check=False)
    try:
        items = json.loads(out or "[]")
    except json.JSONDecodeError:
        return None
    return str(items[0]["number"]) if items else None
