"""Deterministic stage checks (ADR-007). Each returns (ok, errors, details)."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

from .config import FORBIDDEN_PREFIXES, SOURCE_ROOT, TESTS_DIR
from .tools import npm_build, npm_test, summarize_vitest

# Ambiguity lexicon from the A1 requirements skill (step 3.1).
AMBIGUOUS = [
    "fast", "quick", "quickly", "instant", "instantly", "real-time", "easy", "simple", "user-friendly",
    "intuitive", "secure", "robust", "scalable", "flexible", "reliable", "efficient", "modern", "seamless",
    "best", "high-quality", "as needed", "when necessary", "appropriate", "appropriately", "etc", "and so on",
    "properly", "correctly", "gracefully", "reasonable", "better", "faster", "nice",
]
_AMBIG_RX = re.compile(r"\b(" + "|".join(re.escape(w) for w in AMBIGUOUS) + r")\b", re.I)
AC_ID_RX = re.compile(r"^AC-\d+$")


# ------------------------------------------------------------------ stage 1
def check_spec(spec: dict) -> tuple[bool, list[str]]:
    errs: list[str] = []
    if not isinstance(spec, dict):
        return False, ["spec is not a JSON object"]
    if spec.get("safety_flag"):
        errs.append(f"safety flag raised: {spec.get('safety_reason', 'no reason given')}")
    if not spec.get("testable", False):
        errs.append("spec says the issue is not testable as written")
    acs = spec.get("acceptance_criteria") or []
    if not acs:
        errs.append("no acceptance criteria")
    seen = set()
    for i, ac in enumerate(acs):
        aid = str(ac.get("id", ""))
        where = aid or f"AC #{i + 1}"
        if not AC_ID_RX.match(aid):
            errs.append(f"{where}: id must look like AC-1")
        if aid in seen:
            errs.append(f"{where}: duplicate id")
        seen.add(aid)
        for k in ("given", "when", "then", "expected", "verify_by"):
            if not str(ac.get(k, "")).strip():
                errs.append(f"{where}: missing '{k}'")
        text = f"{ac.get('then', '')} {ac.get('expected', '')}"
        if "PENDING" in text.upper():
            errs.append(f"{where}: still PENDING")
        bad = sorted({m.group(1).lower() for m in _AMBIG_RX.finditer(text)})
        if bad:
            errs.append(f"{where}: ambiguous words in then/expected: {', '.join(bad)} - state an exact value")
    return not errs, errs


def needs_clarification(spec: dict) -> bool:
    return bool(spec) and (not spec.get("testable", False) or bool(spec.get("safety_flag")))


# ------------------------------------------------------------------ stage 2
def check_design(design: dict, spec: dict, repo: Path) -> tuple[bool, list[str]]:
    errs: list[str] = []
    files = design.get("files") or []
    if not files:
        errs.append("design lists no files")
    file_paths = set()
    for f in files:
        p = str(f.get("path", "")).replace("\\", "/").lstrip("./")
        file_paths.add(p)
        if not p.startswith(SOURCE_ROOT):
            errs.append(f"{p}: outside {SOURCE_ROOT}")
            continue
        if any(p.startswith(x) for x in FORBIDDEN_PREFIXES):
            errs.append(f"{p}: forbidden path")
        exists = (repo / p).is_file()
        if f.get("new"):
            if exists:
                errs.append(f"{p}: marked new but already exists")
        elif not exists:
            errs.append(f"{p}: file does not exist (mark it new: true if it should be created)")
    for fn in design.get("functions") or []:
        p = str(fn.get("file", "")).replace("\\", "/").lstrip("./")
        name = str(fn.get("name", "")).strip()
        if not name:
            errs.append(f"function entry without name in {p}")
            continue
        if p not in file_paths:
            errs.append(f"function {name}: its file {p} is not in the file list")
        if fn.get("new"):
            continue
        fp = repo / p
        short = name.split(".")[-1]
        if not fp.is_file() or not re.search(r"\b" + re.escape(short) + r"\b", fp.read_text(encoding="utf-8", errors="ignore")):
            errs.append(f"function {name} not found in {p} (mark it new: true if it will be added)")
    if not (design.get("functions") or []):
        errs.append("design names no functions")
    ac_ids = {a.get("id") for a in spec.get("acceptance_criteria", [])}
    mapped = {}
    for m in design.get("ac_map") or []:
        mapped[m.get("ac")] = m
    for aid in sorted(ac_ids):
        m = mapped.get(aid)
        if not m:
            errs.append(f"{aid}: not mapped to any change")
            continue
        if not m.get("changes"):
            errs.append(f"{aid}: no code change listed")
        tf = str(m.get("test_file", "")).replace("\\", "/")
        if not tf.startswith(TESTS_DIR):
            errs.append(f"{aid}: test_file must be under {TESTS_DIR}")
    return not errs, errs


def design_write_allowlist(design: dict) -> set[str]:
    out = {str(f.get("path", "")).replace("\\", "/").lstrip("./") for f in design.get("files") or []}
    return {p for p in out if p.startswith(SOURCE_ROOT)}


# ------------------------------------------------------------------ git
def git(repo: Path, *args: str) -> str:
    p = subprocess.run(["git", *args], cwd=str(repo), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if p.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {p.stderr.strip()}")
    return p.stdout


def changed_paths(repo: Path) -> list[str]:
    out = git(repo, "status", "--porcelain", "--untracked-files=all")
    paths = []
    for line in out.splitlines():
        if not line.strip():
            continue
        p = line[3:].strip().strip('"')
        if " -> " in p:
            p = p.split(" -> ", 1)[1]
        paths.append(p.replace("\\", "/"))
    return sorted(set(paths))


def full_diff(repo: Path) -> str:
    """Diff of the working tree against HEAD, including new files (intent-to-add)."""
    untracked = git(repo, "ls-files", "--others", "--exclude-standard").split()
    if untracked:
        git(repo, "add", "--intent-to-add", "--", *untracked)
    return git(repo, "diff", "--binary", "HEAD")


# ------------------------------------------------------------------ stage 3
def check_build(repo: Path, allowed_files: set[str]) -> tuple[bool, list[str], dict]:
    errs: list[str] = []
    paths = changed_paths(repo)
    if not paths:
        errs.append("no code was changed")
    for p in paths:
        if not (p in allowed_files or p.startswith(TESTS_DIR)):
            errs.append(f"changed a file outside the design: {p}")
    code, out = npm_build(repo)
    if code != 0:
        errs.append(f"build failed (exit {code}):\n{out[-3000:]}")
    return not errs, errs, {"changed": paths, "build_exit": code}


# ------------------------------------------------------------------ stage 4
_TEST_CALL_RX = re.compile(r"\b(?:it|test)(?:\.each\s*\([^)]*\))?(?:\.skipIf\s*\([^)]*\))?\s*\(")
_SKIP_RX = re.compile(r"\b(?:it|test|describe)\.(?:skip|only|todo)\s*\(")


def test_inventory(repo: Path) -> dict:
    inv = {}
    for f in sorted((repo / TESTS_DIR).rglob("*.test.js")):
        text = f.read_text(encoding="utf-8", errors="ignore")
        inv[f.relative_to(repo).as_posix()] = {"tests": len(_TEST_CALL_RX.findall(text)), "skips": len(_SKIP_RX.findall(text))}
    return inv


def check_tests(repo: Path, spec: dict, baseline: dict) -> tuple[bool, list[str], dict]:
    errs: list[str] = []
    now = test_inventory(repo)
    for path, b in baseline.items():
        n = now.get(path)
        if n is None:
            errs.append(f"existing test file deleted: {path}")
            continue
        if n["tests"] < b["tests"]:
            errs.append(f"{path}: number of tests dropped from {b['tests']} to {n['tests']}")
        if n["skips"] > b["skips"]:
            errs.append(f"{path}: new .skip/.only/.todo added")
    for path, n in now.items():
        if path not in baseline and n["skips"]:
            errs.append(f"{path}: new test file uses .skip/.only/.todo")
    code, out, data = npm_test(repo)
    summary = summarize_vitest(data)
    if code != 0:
        errs.append(f"test suite failed (exit {code}):\n{summary}\n{out[-1500:] if not data else ''}")
    passed_names: list[str] = []
    failed_files: set[str] = set()
    if data:
        for tr in data.get("testResults", []):
            for a in tr.get("assertionResults", []):
                if a.get("status") == "passed":
                    passed_names.append(a.get("fullName") or a.get("title") or "")
                elif a.get("status") == "failed":
                    failed_files.add(Path(tr.get("name", "")).as_posix())
            if tr.get("status") == "failed":
                failed_files.add(Path(tr.get("name", "")).as_posix())
    coverage = {}
    for ac in spec.get("acceptance_criteria", []):
        aid = ac.get("id")
        rx = re.compile(r"\b" + re.escape(aid) + r"\b")
        hits = [n.strip() for n in passed_names if rx.search(n)]
        coverage[aid] = hits
        if not hits:
            errs.append(f"{aid}: no passing test with '{aid}' in its name")
    new_failed = [f for f in failed_files if not any(f.endswith(b) for b in baseline)]
    details = {
        "exit": code, "summary": summary, "coverage": coverage,
        "passed": (data or {}).get("numPassedTests"), "failed": (data or {}).get("numFailedTests"),
        "failure_in_new_tests_only": bool(failed_files) and len(new_failed) == len(failed_files),
        "inventory": now,
    }
    return not errs, errs, details
