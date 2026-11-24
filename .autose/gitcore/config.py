"""Central configuration. Every limit lives here so it can be reported (ADR-009)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

# Paths an agent may never read or write (ADR-005).
FORBIDDEN_PREFIXES = (".git/", "gitcore-out/", ".github/", ".autose/", "node_modules/", "backend/node_modules/", "frontend/node_modules/")
# Code the agents are allowed to change at all.
SOURCE_ROOT = "backend/"
TESTS_DIR = "backend/tests/"

# Environment variables removed before running model-written code (ADR-009).
SECRET_ENV_PREFIXES = ("OPENROUTER", "GITHUB_TOKEN", "GH_TOKEN", "ACTIONS_", "OPENAI", "ANTHROPIC", "GEMINI")


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass
class Limits:
    max_run_tokens: int = field(default_factory=lambda: _int("GITCORE_MAX_TOKENS", 600_000))
    max_run_usd: float = field(default_factory=lambda: _float("GITCORE_MAX_USD", 0.30))
    # Per call. Gemini counts hidden thinking tokens against this, so 4096 was too tight:
    # a design retry came back empty three times (finish_reason=length, no text).
    max_output_tokens: int = field(default_factory=lambda: _int("GITCORE_MAX_OUTPUT_TOKENS", 8192))
    # A reply cut off at the limit is re-asked once per doubling, up to this cap.
    max_output_tokens_cap: int = field(default_factory=lambda: _int("GITCORE_MAX_OUTPUT_TOKENS_CAP", 16384))
    llm_timeout_s: int = field(default_factory=lambda: _int("GITCORE_LLM_TIMEOUT", 120))
    tool_steps: dict = field(default_factory=lambda: {
        "spec": 0, "design": 15, "implement": 25, "test": 20, "review": 20,
    })
    impl_attempts: int = 3
    redesigns: int = 1
    spec_retries: int = 1
    design_retries: int = 1
    review_rounds: int = 2
    cmd_timeout_s: int = field(default_factory=lambda: _int("GITCORE_CMD_TIMEOUT", 300))
    observation_chars: int = 6000
    failure_tail_chars: int = 4000


LIMITS = Limits()
