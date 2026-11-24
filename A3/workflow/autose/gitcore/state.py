"""Run state (ADR-004): one JSON file + one Markdown/JSON artifact per stage."""
from __future__ import annotations

import json
import os
import time
from pathlib import Path


class RunStore:
    def __init__(self, out_dir: str | Path):
        self.dir = Path(out_dir)
        self.dir.mkdir(parents=True, exist_ok=True)

    @property
    def state_path(self) -> Path:
        return self.dir / "state.json"

    def load(self) -> dict:
        if self.state_path.is_file():
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        return {}

    def save(self, state: dict) -> None:
        tmp = self.state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=2, default=str), encoding="utf-8")
        os.replace(tmp, self.state_path)

    def write(self, name: str, content: str | dict | list) -> Path:
        p = self.dir / name
        if isinstance(content, (dict, list)):
            content = json.dumps(content, indent=2, default=str)
        p.write_text(content, encoding="utf-8")
        return p

    def read(self, name: str) -> str | None:
        p = self.dir / name
        return p.read_text(encoding="utf-8") if p.is_file() else None

    def read_json(self, name: str):
        t = self.read(name)
        return json.loads(t) if t else None

    def append_transcript(self, stage: str, transcript: list) -> None:
        # Private memory of an agent. Kept in the run record for auditing, but never
        # handed to another agent (ADR-003).
        with open(self.dir / f"transcript_{stage}.jsonl", "a", encoding="utf-8") as f:
            for t in transcript:
                f.write(json.dumps(t, default=str) + "\n")


def event(state: dict, stage: str, kind: str, **data) -> None:
    state.setdefault("events", []).append({"t": round(time.time(), 1), "stage": stage, "kind": kind, **data})
