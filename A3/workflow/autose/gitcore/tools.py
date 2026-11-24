"""Tool runner (ADR-005): a small fixed tool set, path allow-lists, no shell tool.

Commands are fixed strings. Child processes get an environment with secrets
removed, because they execute model-written code (ADR-009).
"""
from __future__ import annotations

import fnmatch
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from .config import FORBIDDEN_PREFIXES, LIMITS, SECRET_ENV_PREFIXES, TESTS_DIR

BACKEND = "backend"


class ToolError(Exception):
    pass


def scrubbed_env() -> dict:
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith(SECRET_ENV_PREFIXES)}
    env["CI"] = "true"
    return env


def _npm() -> str:
    return shutil.which("npm") or shutil.which("npm.cmd") or "npm"


def run_cmd(args: list[str], cwd: Path, timeout: int | None = None) -> tuple[int, str]:
    try:
        p = subprocess.run(args, cwd=str(cwd), env=scrubbed_env(), capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=timeout or LIMITS.cmd_timeout_s)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, f"TIMEOUT after {timeout or LIMITS.cmd_timeout_s}s"


def npm_build(repo: Path) -> tuple[int, str]:
    return run_cmd([_npm(), "run", "build", "--silent"], repo / BACKEND)


def npm_test(repo: Path, files: list[str] | None = None) -> tuple[int, str, dict | None]:
    """Run vitest; returns (exit code, console tail, parsed JSON report or None)."""
    fd, report = tempfile.mkstemp(suffix=".json", prefix="vitest-")
    os.close(fd)
    args = [_npm(), "test", "--silent", "--", "--reporter=dot", "--reporter=json", f"--outputFile.json={report}"]
    if files:
        args += [f[len(BACKEND) + 1:] if f.startswith(BACKEND + "/") else f for f in files]
    code, out = run_cmd(args, repo / BACKEND)
    data = None
    try:
        with open(report, encoding="utf-8") as f:
            text = f.read()
        data = json.loads(text) if text.strip() else None
    except (OSError, json.JSONDecodeError):
        data = None
    finally:
        try:
            os.remove(report)
        except OSError:
            pass
    return code, out, data


def summarize_vitest(data: dict | None) -> str:
    if not data:
        return "(no JSON report)"
    lines = [f"tests: {data.get('numPassedTests', 0)} passed, {data.get('numFailedTests', 0)} failed, "
             f"{data.get('numPendingTests', 0)} skipped"]
    for tr in data.get("testResults", []):
        for a in tr.get("assertionResults", []):
            if a.get("status") == "failed":
                msg = " ".join(a.get("failureMessages", []))[:600]
                lines.append(f"FAIL {Path(tr.get('name', '')).name} > {a.get('fullName')}: {msg}")
        if tr.get("status") == "failed" and not tr.get("assertionResults"):
            lines.append(f"FAIL (file) {Path(tr.get('name', '')).name}: {tr.get('message', '')[:600]}")
    return "\n".join(lines)


def _eol_of(path: Path) -> str:
    with open(path, "rb") as f:
        head = f.read(65536)
    return "\r\n" if b"\r\n" in head else "\n"


class Toolbox:
    """Tools for one agent role. `write_files` / `write_prefixes` define the write allow-list."""

    def __init__(self, repo: Path, role: str, write_files: set[str] | None = None,
                 write_prefixes: tuple[str, ...] = (), can_build: bool = False, can_test: bool = False):
        self.repo = repo.resolve()
        self.role = role
        self.write_files = {self._norm(p) for p in (write_files or set())}
        self.write_prefixes = write_prefixes
        self.can_build = can_build
        self.can_test = can_test
        self.calls: list[dict] = []

    # ------------------------------------------------------------ paths
    def _norm(self, path: str) -> str:
        p = str(path).replace("\\", "/").strip()
        while p.startswith("./"):
            p = p[2:]
        return p.lstrip("/")

    def _resolve(self, path: str) -> tuple[str, Path]:
        rel = self._norm(path)
        if not rel:
            rel = "."
        full = (self.repo / rel).resolve()
        if full != self.repo and self.repo not in full.parents:
            raise ToolError(f"path outside repository: {path}")
        rel_posix = full.relative_to(self.repo).as_posix() if full != self.repo else "."
        probe = rel_posix + ("/" if full.is_dir() else "")
        if any(probe.startswith(f) or ("/" + f) in ("/" + probe) for f in FORBIDDEN_PREFIXES):
            raise ToolError(f"path not allowed: {rel_posix}")
        return rel_posix, full

    def can_write(self, rel: str) -> bool:
        return rel in self.write_files or any(rel.startswith(p) for p in self.write_prefixes)

    # ------------------------------------------------------------ tools
    def describe(self) -> str:
        lines = [
            '- list_dir {"path": "backend"}: list a directory',
            '- read_file {"path": "...", "start": 1, "end": 200}: read lines (1-based, inclusive)',
            '- grep {"pattern": "regex", "path": "backend", "glob": "*.js"}: search file contents',
        ]
        if self.write_files or self.write_prefixes:
            allowed = sorted(self.write_files) + [p + "**" for p in self.write_prefixes]
            lines.append('- write_file {"path": "...", "content": "..."}: create or overwrite a file. '
                         f"Allowed paths: {', '.join(allowed)}")
            lines.append('- replace_in_file {"path": "...", "old": "exact text", "new": "replacement"}: '
                         "replace one exact occurrence")
        if self.can_build:
            lines.append("- run_build {}: syntax-check the backend (npm run build)")
        if self.can_test:
            lines.append('- run_tests {"files": ["backend/tests/x.test.js"]}: run vitest (all tests if files omitted)')
        lines.append('- finish {...}: end your work; arguments as described in your task')
        return "\n".join(lines)

    def call(self, name: str, args: dict) -> str:
        args = args or {}
        self.calls.append({"tool": name, "args": {k: (v if k != "content" else f"<{len(str(v))} chars>") for k, v in args.items()}})
        fn = {
            "list_dir": self.list_dir, "read_file": self.read_file, "grep": self.grep,
            "write_file": self.write_file, "replace_in_file": self.replace_in_file,
            "run_build": self.run_build, "run_tests": self.run_tests,
        }.get(name)
        if fn is None:
            raise ToolError(f"unknown tool: {name}")
        out = fn(**args)
        if len(out) > LIMITS.observation_chars:
            out = out[:LIMITS.observation_chars] + f"\n... [truncated, {len(out)} chars total]"
        return out

    def list_dir(self, path: str = ".") -> str:
        rel, full = self._resolve(path)
        if not full.is_dir():
            raise ToolError(f"not a directory: {rel}")
        items = []
        for c in sorted(full.iterdir()):
            crel = c.relative_to(self.repo).as_posix() + ("/" if c.is_dir() else "")
            if any(crel.startswith(f) for f in FORBIDDEN_PREFIXES) or c.name == "node_modules":
                continue
            items.append(crel)
        return "\n".join(items) or "(empty)"

    def read_file(self, path: str, start: int = 1, end: int | None = None) -> str:
        rel, full = self._resolve(path)
        if not full.is_file():
            raise ToolError(f"no such file: {rel}")
        lines = full.read_text(encoding="utf-8", errors="replace").splitlines()
        start = max(1, int(start or 1))
        end = min(len(lines), int(end) if end else start + 299)
        body = "\n".join(f"{i:4d}| {lines[i - 1]}" for i in range(start, end + 1))
        return f"{rel} (lines {start}-{end} of {len(lines)})\n{body}"

    def grep(self, pattern: str, path: str = ".", glob: str = "*") -> str:
        rel, full = self._resolve(path)
        try:
            rx = re.compile(pattern)
        except re.error as e:
            raise ToolError(f"bad regex: {e}")
        files = [full] if full.is_file() else [p for p in full.rglob("*") if p.is_file()]
        hits = []
        for f in files:
            frel = f.relative_to(self.repo).as_posix()
            if any(frel.startswith(x) or ("/" + x) in ("/" + frel) for x in FORBIDDEN_PREFIXES):
                continue
            if not fnmatch.fnmatch(f.name, glob):
                continue
            try:
                for i, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                    if rx.search(line):
                        hits.append(f"{frel}:{i}: {line.strip()[:200]}")
                        if len(hits) >= 80:
                            return "\n".join(hits) + "\n... [more matches omitted]"
            except OSError:
                continue
        return "\n".join(hits) or "(no matches)"

    def write_file(self, path: str, content: str) -> str:
        rel, full = self._resolve(path)
        if not self.can_write(rel):
            raise ToolError(f"write not allowed for {rel}. Allowed: {sorted(self.write_files)} + {list(self.write_prefixes)}")
        full.parent.mkdir(parents=True, exist_ok=True)
        # Keep the file's own line endings so the diff shows only real changes.
        eol = _eol_of(full) if full.is_file() else "\n"
        content = content.replace("\r\n", "\n")
        with open(full, "w", encoding="utf-8", newline=eol) as f:
            f.write(content)
        return f"wrote {rel} ({len(content.splitlines())} lines)"

    def replace_in_file(self, path: str, old: str, new: str) -> str:
        rel, full = self._resolve(path)
        if not self.can_write(rel):
            raise ToolError(f"write not allowed for {rel}")
        if not full.is_file():
            raise ToolError(f"no such file: {rel}")
        eol = _eol_of(full)
        with open(full, encoding="utf-8", newline="") as f:
            text = f.read().replace("\r\n", "\n")
        old, new = old.replace("\r\n", "\n"), new.replace("\r\n", "\n")
        n = text.count(old)
        if n != 1:
            raise ToolError(f"'old' must occur exactly once in {rel}, found {n} times")
        with open(full, "w", encoding="utf-8", newline=eol) as f:
            f.write(text.replace(old, new, 1))
        return f"replaced 1 occurrence in {rel}"

    def run_build(self) -> str:
        if not self.can_build:
            raise ToolError("run_build not available for this role")
        code, out = npm_build(self.repo)
        return f"exit code {code}\n{out[-LIMITS.failure_tail_chars:]}"

    def run_tests(self, files: list[str] | None = None) -> str:
        if not self.can_test:
            raise ToolError("run_tests not available for this role")
        if files:
            for f in files:
                rel, _ = self._resolve(f)
                if not rel.startswith(TESTS_DIR):
                    raise ToolError(f"test files must be under {TESTS_DIR}: {rel}")
        code, out, data = npm_test(self.repo, files)
        return f"exit code {code}\n{summarize_vitest(data)}\n--- console tail ---\n{out[-1500:]}"
